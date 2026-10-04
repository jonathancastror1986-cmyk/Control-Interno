-- ===================================================================
-- ¿QUÉ VE CADA USUARIO REALMENTE?
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTA CONSULTA
-- ---------------------------------------------------------------------
--
-- La 072 cerró las seis tablas de la cadena de datos de personas. Queda la última pieza, y es
-- distinta: el ALCANCE DE LOS ROLES.
--
-- Medido en las migraciones:
--
--     es_admin(uid) = exists (select 1 from perfil_roles r
--                            where r.user_id = uid and r.rol = 'admin')
--
-- y "roles_sistema" es (rol, nombre, descripcion, orden): NO lleva empresa. Y "perfil_roles" es
-- (user_id, rol): tampoco.
--
-- O sea que los ROLES SON GLOBALES. "admin" es admin en todas las empresas, no en una.
--
-- Y "perfil_empresas" —que SÍ lleva empresa— es la que dice qué empresas ve cada usuario. Pero:
--
--     puede_ver_trabajador(code, uid) = es_admin(uid) or existe(el trabajador es de una
--                                                     empresa de perfil_empresas del usuario)
--
-- La salida del administrador está PRIMERO. O sea que para un admin, "perfil_empresas" no se
-- consulta: da igual lo que tenga ahí.
--
-- ---------------------------------------------------------------------
-- POR QUÉ NO HAY MIGRACIÓN
-- ---------------------------------------------------------------------
--
-- Porque esto no es un defecto de código: es una DECISIÓN, y la decisión puede ser correcta.
--
-- Si hay un solo administrador —el dueño del servicio— y todos los demás usuarios son de las
-- empresas clientes, que es lo que se ve en la pantalla ("todas las empresas (47)"), entonces
-- "admin ve todas" es lo correcto y no hay nada que cambiar.
--
-- Si en algún momento se le da "admin" a un administrador de una empresa cliente, ese usuario ve
-- los trabajadores de TODAS las empresas, sin que nadie lo haya pedido.
--
-- Eso no lo arregla una migración written con ): hay que decidir primero si "admin" es de la
-- casa o de la empresa.
--
-- ---------------------------------------------------------------------
-- LO QUE ESTA CONSULTA MUESTRA
-- ---------------------------------------------------------------------
--
-- La respuesta a tres preguntas:
--
--   ¿CUÁNTOS admins hay?
--   ¿ve cada uno todas las empresas, o solo las que tiene en "perfil_empresas"?
--   ¿hay usuarios sin ninguna empresa asignada? Esos no ven nada, ni de su propia empresa.
--
-- ---------------------------------------------------------------------
-- Y SI DESPUÉS QUISIERA ACOTAR EL ADMIN A SU EMPRESA
-- ---------------------------------------------------------------------
--
-- Serían DOS cambios, y no uno:
--
--   UNO: una columna "empresa_id" en "perfil_roles", o una tabla "admin_empresas". Porque el rol
--   solo no alcanza para decir de qué empresa es.
--
--   DOS: cambiar "puede_ver_trabajador" para que la rama de admin pregunte por esa columna.
--   Y cambiar "tiene_permiso" y "es_usuario_activo" si también llevan alcance.
--
-- El problema de "tiene_permiso" es que los permisos son lo que hace aparecer los botones, y un
-- permiso con alcance se tiene que resolver en el servidor, no en el navegador. Ver [rls-01].

-- ===================================================================
-- 1) LOS ROLES QUE EXISTEN
-- ===================================================================

select rol, nombre,
       (select count(*) from perfil_roles pr where pr.rol = roles_sistema.rol) as usuarios_con_este_rol
  from roles_sistema
 order by orden, rol;

-- ===================================================================
-- 2) CADA USUARIO, CON SUS ROLES Y CON SUS EMPRESAS
-- ===================================================================

-- Y NO SE TRAE EL CORREO, Y POR QUÉ
--
-- El correo de un usuario NO está en "perfiles". Está en "auth.users", que es de Supabase y a la
-- que "perfiles" apunta con "id". Y desde el editor SQL no se lee "auth.users" sin ser el dueño
-- del proyecto.
--
-- Y la primera versión de esta consulta pedía "p.correo", que no existe. Las columnas de
-- "perfiles" son: id, nombre, rol, activo, telefono, perfil_completo, created_at,
-- clave_entregada_at, clave_cambiada_at.
--
-- Y eso no es un detalle de escritura: el editor SQL ejecuta todo como una transacción, así que
-- un "column does not exist" al FINAL del guion revierte TODO y no muestra ni la primera fila. Es
-- decir que la consulta que malinterpreta un nombre de columna no devuelve un error parcial: no
-- devuelve nada. Y uno cree que la base no tiene usuarios.
--
-- "nombre" alcanza para identificar a una persona. Si hace falta el correo, se ve en la pantalla
-- de usuarios de la aplicación.
--
-- Y "perfiles.rol" sigue existiendo como columna, al lado de "perfil_roles". Es de la versión
-- anterior a los roles múltiples. El código usa "perfil_roles"; esta consulta también. La
-- columna vieja no se usa para decidir nada y por eso no aparece en el veredicto.
with totales as (select count(*)::int as n from empresa)
select p.id,
       p.nombre,
       coalesce(p.telefono, '(sin teléfono)')      as telefono,
       coalesce(string_agg(distinct pr.rol, ', '), '(sin rol)') as roles,
       (select count(*) from perfil_empresas pe where pe.user_id = p.id) as empresas_asignadas,
       totales.n                                    as empresas_totales,
       case
         when (select count(*) from perfil_empresas pe where pe.user_id = p.id) = 0
           then '*** SIN EMPRESAS: no ve nada, ni de su propia ***'
         when (select count(*) from perfil_empresas pe where pe.user_id = p.id) = totales.n
           then 've todas'
         else 've ' || (select count(*) from perfil_empresas pe where pe.user_id = p.id)
              || ' de ' || totales.n
       end as alcance_por_perfil_empresas
  from perfiles p
  cross join totales
  left join perfil_roles pr on pr.user_id = p.id
 where p.activo
 group by p.id, p.nombre, p.telefono, totales.n
 order by (select count(*) from perfil_roles x where x.user_id = p.id and x.rol = 'admin') desc,
          p.nombre;

-- ===================================================================
-- 3) EL VEREDICTO, QUE ES LA RESPUESTA A LA PREGUNTA
-- ===================================================================

select case
  when (select count(*) from perfil_roles where rol = 'admin') = 0
    then 'No hay ningún admin. O no se inicializó la base, o ya se quitaron los admins.'
  when (select count(*) from perfil_roles where rol = 'admin') = 1
    then 'Hay UN admin. Entonces "admin ve todas" no es un problema: es el dueño del servicio. '
         || 'Dejarlo así, y dejarlo ESCRITO, porque el día que se le dé admin a un segundo '
         || 'usuario hay que decidir si ese también ve todas.'
  when (select count(*) from perfil_roles where rol = 'admin') > 1
    then '*** HAY VARIOS ADMINS. Cada uno ve TODAS las empresas, sin importar su "perfil_empresas". ***'
         || ' Si alguno de esos es de una empresa cliente y no del servicio, está viendo los '
         || 'trabajadores de todos los clientes. Hay que decidir el alcance del admin.'
  else '*** IMPOSIBLE ***'
end as veredicto_del_alcance;

-- Y el detalle de los admins, uno por uno, que es lo que hay que mirar para decidir.

select p.id, p.nombre, coalesce(p.telefono, '(sin teléfono)') as telefono,
       (select count(*) from perfil_empresas pe where pe.user_id = p.id) as empresas_asignadas,
       (select count(*) from empresa) as empresas_totales,
       case
         when (select count(*) from perfil_empresas pe where pe.user_id = p.id) = 0
           then 've TODAS igual, porque es admin'
         else 've ' || (select count(*) from perfil_empresas pe where pe.user_id = p.id)
              || ' por perfil_empresas, pero ve TODAS igual, porque es admin'
       end as lo_que_ve_de_verdad
  from perfiles p
 where p.activo
   and exists (select 1 from perfil_roles pr where pr.user_id = p.id and pr.rol = 'admin')
 order by p.nombre;

-- ===================================================================
-- LO QUE HAY QUE HACER CON CADA RESPUESTA
-- ===================================================================
--
-- "No hay ningún admin": hay algo mal en los datos. Con las funciones como están,
-- "es_usuario_activo" da true para un usuario activo con cualquier rol, así que un usuario
-- "oficina" puede entrar, pero no ve ninguna empresa.
--
-- "Hay un admin": no hay que cambiar nada. Lo que hay que hacer es DEJARLO ESCRITO, que es lo que
-- hace esta sección. Y la regla que conviene poner en la documentación de a bordo: "admin es de
-- la casa, no de una empresa".
--
-- "Hay varios admins": hay que decidir cuál de las dos cosas se quiere, y eso es una pregunta de
-- negocio, no de código. La respuesta cambia lo que hay que escribir.
--
-- Y cualquiera de las dos respuestas tiene una consecuencia que conviene mirar: si "admin" es de
-- la casa, entonces un administrador de una empresa cliente NO debe tener ese rol. Para eso están
-- los roles "oficina", "portería" y "bodega", que dan lo mismo sin ver las otras empresas.