-- ============================================================
-- EL ROL "supervisor" NO EXISTE
-- ============================================================
-- Error al cambiar un rol en Administración → Usuarios:
--
--   ERROR: 23514: new row for relation "perfiles" violates check
--   constraint "perfiles_rol_check"
--
-- QUÉ ESTÁ PASANDO
--
-- La tabla "roles_sistema" es el catálogo de roles, y la pantalla de
-- usuarios dibuja una casilla por cada fila que haya ahí. Si hay una fila
-- con el rol "supervisor" (en singular), la casilla aparece y se puede
-- marcar. Pero el "check" de Postgres sobre "perfiles.rol" solo acepta:
--
--   admin, oficina, porteria, bodega, prevencion, rrhh, supervisores, tecnica
--
-- "supervisor" no está en esa lista, así que al guardar, Postgres lo
-- rechaza. La casilla se ve bien y el error sale al apretar Guardar, que es
-- la peor parte: no hay forma de saber de dónde salió ese rol.
--
-- La diferencia entre "supervisor" y "supervisores" es una sola letra, y
-- por eso es fácil que se haya creado sin querer (una migración vieja, una
-- carga manual, un nombre mal tipeado al crear el rol).
--
-- CÓMO USARLO
--
--   Paso 1: diagnóstico. Solo lee. Copia el resultado.
--   Paso 2: reparación. Arregla lo que encontró.
--
-- Es re-ejecutable y no borra datos válidos.
-- ============================================================


-- --------------------------------------------------------------------
-- PASO 1 · DIAGNÓSTICO (solo lee)
-- --------------------------------------------------------------------
-- Copia esto y mira lo que sale.

-- 1) ¿Hay roles en el catálogo que la base no acepta?
select rol,
       nombre,
       'NO VÁLIDO'                                             as estado,
       'perfiles.rol lo rechaza al guardar'                    as por_que
  from roles_sistema
 where rol not in ('admin','oficina','porteria','bodega','prevencion',
                   'rrhh','supervisores','tecnica')
 order by rol;

-- 2) ¿Hay alguna fila ya guardada con ese rol inválido?
select 'perfiles.rol'                                           as donde,
       rol, count(*)                                            as cuantos,
       string_agg(coalesce(nombre, id::text), ', ')             as quienes
  from perfiles
 where rol not in ('admin','oficina','porteria','bodega','prevencion',
                   'rrhh','supervisores','tecnica')
 group by rol
union all
select 'perfil_roles.rol', r.rol, count(*),
       string_agg(coalesce(p.nombre, r.user_id::text), ', ')
  from perfil_roles r
  left join perfiles p on p.id = r.user_id
 where r.rol not in ('admin','oficina','porteria','bodega','prevencion',
                     'rrhh','supervisores','tecnica')
 group by r.rol;

-- 3) ¿Y el catálogo completo, para ver cómo quedó?
select rol, nombre, orden
  from roles_sistema
 order by orden, rol;


-- --------------------------------------------------------------------
-- PASO 2 · REPARACIÓN
-- --------------------------------------------------------------------
-- Pega y ejecuta desde acá hasta el final.

-- 2.1) FIRST: arreglar las filas ya guardadas, ANTES de borrar el rol del
--       catálogo. Al revés, se perderían los permisos de esa persona.
--
-- "supervisor" y "supervisores" son el mismo rol con una letra de
-- diferencia, así que se mapea al válido más cercano antes de nada.
update public.perfiles
   set rol = case when rol = 'supervisor'  then 'supervisores'
                  when rol = 'supervises'  then 'supervisores'
                  when rol = 'super'       then 'supervisores'
                  when rol = 'rrhh_admin'  then 'admin'
                  else 'oficina' end
 where rol not in ('admin','oficina','porteria','bodega','prevencion',
                   'rrhh','supervisores','tecnica');

update public.perfil_roles
   set rol = case when rol = 'supervisor' then 'supervisores'
                  else 'tecnica' end
 where rol not in ('admin','oficina','porteria','bodega','prevencion',
                   'rrhh','supervisores','tecnica');

-- 2.2) Ahora sí, sacar del catálogo los roles que la base no acepta.
--
-- Se borran también sus permisos y sus asignaciones, que ya no significan
-- nada. Los roles válidos no se tocan.
delete from roles_permisos
 where rol not in ('admin','oficina','porteria','bodega','prevencion',
                   'rrhh','supervisores','tecnica');

delete from roles_sistema
 where rol not in ('admin','oficina','porteria','bodega','prevencion',
                   'rrhh','supervisores','tecnica');

-- 2.3) Asegurar que el catálogo tenga los ocho roles válidos. Por si
--       alguno faltaba, que es lo que pasa si alguien los borró a mano.
insert into roles_sistema (rol, nombre, descripcion, orden) values
  ('admin',        'Administración',  'Acceso total al sistema', 1),
  ('rrhh',         'RRHH',            'Recursos humanos: edita la tarja y aprueba solicitudes', 2),
  ('oficina',      'Oficina',         'Ingresos, licencias y remuneraciones', 3),
  ('porteria',     'Portería',        'Control de acceso y consulta de trabajadores', 4),
  ('supervisores', 'Supervisores',    'Equipos, tarja de su gente y solicitudes de cambio', 5),
  ('tecnica',      'Técnica',         'Soporte técnico en terreno: ve la tarja y solicita cambios', 6),
  ('bodega',       'Bodega',          'EPP, kits, herramientas y etiquetas QR', 7),
  ('prevencion',   'Prevención',      'Alertas e indicaciones de prevención', 8)
on conflict (rol) do nothing;


-- --------------------------------------------------------------------
-- PASO 3 · COMPROBAR
-- --------------------------------------------------------------------
-- Las dos primeras consultas tienen que salir vacías.

select rol, nombre, estado, por_que
  from (select rol, nombre, 'NO VÁLIDO' as estado,
               'perfiles.rol lo rechaza al guardar' as por_que
          from roles_sistema
         where rol not in ('admin','oficina','porteria','bodega','prevencion',
                           'rrhh','supervisores','tecnica')) x;

select rol, nombre
  from perfiles
 where rol not in ('admin','oficina','porteria','bodega','prevencion',
                   'rrhh','supervisores','tecnica');

-- Y el catálogo, que tiene que tener los ocho:
select rol, nombre from roles_sistema order by orden, rol;


-- --------------------------------------------------------------------
-- PASO 4 · EN LA APP
-- --------------------------------------------------------------------
-- Recarga con Ctrl+F5. La lista de casillas se vuelve a dibujar desde el
-- catálogo, y el rol que sobraba ya no aparece.
--
-- Si después de esto sigue saliendo el error, mira la pestaña Network en
-- las herramientas del navegador, abrí la petición que falla y leé el
-- campo "rol" del cuerpo. Con eso se sabe qué valor está llegando.
