-- ===================================================================
-- diagnostico-091-verificacion.sql
-- ===================================================================
-- COMPROBAR QUE LA 091 DEJÓ LA BASE COMO TENÍA QUE QUEDAR
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- SOLO LECTURA
-- ---------------------------------------------------------------------
--
-- Todo lo de acá son consultas. No escribe nada, se puede correr las veces que
-- haga falta y no deja rastro.
--
-- ---------------------------------------------------------------------
-- QUÉ TIENE QUE SALIR
-- ---------------------------------------------------------------------
--
--   sin_empresa = 0
--   sin_centro  = 2   (los de la "Empresa de Prueba", que quedan sin centro a
--                      propósito)
--   total       = 47
--
-- Y si `sin_empresa` no es 0, la 091 se detuvo antes de terminar: la migración
-- tiene una comprobación que aborta si queda alguien sin empresa cuyo código no
-- está en la lista del 2 al 44 sin el 21. Acá se ve quiénes son.
--
-- ---------------------------------------------------------------------
-- CÓMO CORRERLO
-- ---------------------------------------------------------------------
--
-- En el panel de SQL de Supabase, en un solo bloque. Cada consulta sale en la
-- grilla de abajo, en orden.

-- ---------------------------------------------------------------------
-- 1) EL RESUMEN
-- ---------------------------------------------------------------------
select count(*) filter (where empresa_id is null)      as sin_empresa,
       count(*) filter (where centro_costo_id is null) as sin_centro,
       count(*)                                       as total
  from public.trabajadores;

-- ---------------------------------------------------------------------
-- 2) EL CENTRO POR DEFECTO, Y QUE SE HAYA CREADO UNA SOLA VEZ
-- ---------------------------------------------------------------------
-- Y POR QUÉ UNA SOLA
--
-- Porque la 091 tiene un "if not exists", así que correrla dos veces no crea
-- dos centros. Si acá salen dos con el mismo código, la migración se corrió con
-- una versión anterior a esa comprobación.
select c.id, c.code, c.nombre, c.activo, e.nombre as empresa,
       count(t.code) as trabajadores_en_el
  from public.centros_costo c
  join public.empresa e on e.id = c.empresa_id
  left join public.trabajadores t on t.centro_costo_id = c.id
 group by c.id, c.code, c.nombre, c.activo, e.nombre
 order by e.nombre, c.code;

-- ---------------------------------------------------------------------
-- 3) QUIÉN QUEDÓ SIN EMPRESA
-- ---------------------------------------------------------------------
-- Tiene que salir vacío. Si sale algo, son los códigos que no estaban en la
-- lista del 2 al 44 sin el 21, y la migración no se aplicó entera.
select code, name, empresa_id, centro_costo_id
  from public.trabajadores
 where empresa_id is null
 order by code;

-- ---------------------------------------------------------------------
-- 4) QUIÉN QUEDÓ SIN CENTRO, Y POR QUÉ
-- ---------------------------------------------------------------------
-- Lo esperado son los de la "Empresa de Prueba": la 091 a propósito no les pone
-- centro, porque no son de la principal y su empresa se respeta.
--
-- Y si alguno está en la "Empresa principal" sin centro, ahí sí hay un problema:
-- la migración debía habérselo puesto.
select t.code, t.name, e.nombre as empresa, t.centro_costo_id
  from public.trabajadores t
  left join public.empresa e on e.id = t.empresa_id
 where t.centro_costo_id is null
 order by e.nombre nulls last, t.code;

-- ---------------------------------------------------------------------
-- 5) EL DETALLE COMPLETO, PARA REVISAR CON NOMBRES
-- ---------------------------------------------------------------------
select t.code,
       t.name,
       e.nombre  as empresa,
       c.nombre  as centro_de_costo
  from public.trabajadores t
  left join public.empresa e on e.id = t.empresa_id
  left join public.centros_costo c on c.id = t.centro_costo_id
 order by t.code;

-- ---------------------------------------------------------------------
-- 6) QUE LOS 2 DE PRUEBA SIGUAN INTACTOS
-- ---------------------------------------------------------------------
-- Porque la instrucción era no tocar los que ya tenían empresa. Si acá aparece
-- algún trabajador de "Empresa de Prueba" con empresa distinta, esta migración no
-- es la que lo cambió: hay que buscar cuándo se lo cambiaron.
select t.code, t.name, e.nombre as empresa, t.centro_costo_id
  from public.trabajadores t
  join public.empresa e on e.id = t.empresa_id
 where e.nombre <> 'Empresa principal'
 order by t.code;

-- ---------------------------------------------------------------------
-- 7) QUE NADIE RECIBIÓ ALCANCE DE APROBACIÓN SIN QUE SE PIDIERA
-- ---------------------------------------------------------------------
-- Porque la 091 NO inserta acá, y tiene que seguir así: el alcance lo decide una
-- persona. Esta consulta es para verlo, no para cambiarlo.
--
-- Lo esperado: solo los administradores y los aprobadores, y solo sobre el
-- centro por defecto. Si hay un rol más, alguien lo cargó a mano.
select p.rol,
       p.nombre,
       c.nombre as centro,
       e.nombre as empresa
  from public.perfil_centros_costo pcc
  join public.perfiles p on p.id = pcc.user_id
  join public.centros_costo c on c.id = pcc.centro_costo_id
  join public.empresa e on e.id = c.empresa_id
 where p.activo
 order by p.rol, p.nombre;

-- ---------------------------------------------------------------------
-- 8) LO QUE FALTA POR ASIGNAR, PARA LO QUE VAYA DESPUÉS
-- ---------------------------------------------------------------------
-- Los 42 que se les puso empresa, más los que ya la tenían, ahora ven sus
-- trabajadores por empresa. El alcance por centro de costo todavía no se cargó,
-- y hasta que se cargue, quien no tenga fila acá no puede pedir ni aprobar
-- permisos con hora para este centro.
select pr.rol,
       count(distinct pcc.user_id) as usuarios_con_alcance_en_este_centro
  from public.perfil_roles pr
  left join public.perfil_centros_costo pcc
    on pcc.user_id = pr.user_id
   and pcc.centro_costo_id = (select id from public.centros_costo where code = 'PRINCIPAL')
 where pr.rol in ('admin', 'aprobador', 'solicitante', 'supervisores', 'rrhh')
 group by pr.rol
 order by pr.rol;