-- ===================================================================
-- 048: QUIÉN PUEDE PEDIR Y QUIÉN PUEDE RESOLVER (2026-09-29)
-- ===================================================================
--
-- LA 046 Y LA 047 DECLARABAN LOS PERMISOS, NO LOS ASIGNAN
-- ------------------------------------------------------
-- Eso fue a propósito: decidir que prevención puede registrar amonestaciones
-- es una decisión de la empresa, y si se asigna desde el código, se toma sola.
--
-- Esta migración la toma. Es el lugar donde queda escrita, a la vista, y no
-- repartida entre permisos que alguien marcó a mano y un archivo que nadie
-- recuerda.
--
-- -------------------------------------------------------------------
-- EL ERROR DE LA PRIMERA VERSIÓN, Y POR QUÉ PASÓ
-- -----------------------------------------------
-- La primera versión hacía esto:
--
--     from roles_sistema r
--     cross join (values ('ingresos.pedir', r.rol in ('supervisores',...)))
--                as v(permiso, aplica)
--
-- Y PostgreSQL la rechazó con "invalid reference to FROM-clause entry for
-- table r", con una pista: "marca esta subconsulta con LATERAL".
--
-- Tiene sentido: una lista VALUES dentro de un FROM no puede mirar a las otras
-- tablas de ese mismo FROM. No es un detalle de sintaxis, es que la lista se
-- evalúa antes. La pista que da PostgreSQL es LATERAL, y LATERAL sería
--。, pero no es la forma más simple ni la más legible.
--
-- La versión buena, y la que va aquí, es la lista explícita de thirteen
-- asignaciones. Se lee de un vistazo qué permiso tiene qué rol, que es
-- justamente lo que hay que poder revisar en seis meses. Y con el "where
-- exists" no se le concede nada a un rol que no exista.
-- ===================================================================

-- -------------------------------------------------------------------
-- LAS ASIGNACIONES
-- -------------------------------------------------------------------
-- Los criterios, que no son caprichos:
--
--   ingresos.pedir            el supervisor escribe con el RUT delante, y
--                             técnica también. RRHH por si lo necesita.
--                             NO lo lleva prevención: no es un tema suyo.
--
--   ingresos.aprobar          SOLO RRHH. Ahí se asigna el código del
--                             trabajador, que es la llave de todo lo demás:
--                             tarjetas, asistencia, EPP, herramientas. Que lo
--                             apruebe más de un rol es repartir esa llave.
--
--   amonestaciones.registrar  técnica, prevención y RRHH, como lo pidió la
--                             empresa.
--
--   amonestaciones.archivar   los mismos tres. El permiso va aparte del de
--                             registrar, porque archivar es lo que desmarca la
--                             casilla: puede archivar quien no debería poder
--                             registrar.
--
--   amonestaciones.ver        los tres más supervisores. El supervisor LEE el
--                             historial para conocer a su gente, pero no
--                             escribe. Si el supervisor pudiera marcar, el
--                             registro dejaría de servir para nada.
--
-- admin NO aparece: las funciones lo aceptan con es_admin(), y su casilla ya
-- está siempre marcada. Ponerlo acá sería una fila que dice lo mismo que
-- todas.
insert into roles_permisos (rol, permiso)
select v.rol, v.permiso
  from (values
    ('supervisores',  'ingresos.pedir'),
    ('tecnica',       'ingresos.pedir'),
    ('rrhh',          'ingresos.pedir'),

    ('rrhh',          'ingresos.aprobar'),

    ('tecnica',       'amonestaciones.registrar'),
    ('prevencion',    'amonestaciones.registrar'),
    ('rrhh',          'amonestaciones.registrar'),

    ('tecnica',       'amonestaciones.archivar'),
    ('prevencion',    'amonestaciones.archivar'),
    ('rrhh',          'amonestaciones.archivar'),

    ('tecnica',       'amonestaciones.ver'),
    ('prevencion',    'amonestaciones.ver'),
    ('rrhh',          'amonestaciones.ver'),
    ('supervisores',  'amonestaciones.ver')
  ) as v(rol, permiso)
 where exists (select 1 from roles_sistema r where r.rol = v.rol)
on conflict (rol, permiso) do nothing;

-- -------------------------------------------------------------------
-- DIAGNÓSTICO
-- -------------------------------------------------------------------
-- Dice qué se concedió y qué falta, para los roles que la 048 toca. Si
-- mañana se agrega un permiso, esta lista se ve desactualizada a la vista en
-- vez de fallar en silencio.
--
-- También es un solo SELECT sin bloques ni manejadores de excepción, porque
-- el editor de SQL parte las sentencias y un bloque con muchos punto y coma se
-- corta a la mitad.
create or replace function public.diagnostico_permisos_ingresos_amonestaciones()
returns table (
  rol       text,
  permiso   text,
  asignado  boolean
)
language sql
security definer
set search_path = public
as $$
  with esperados (rol, permiso) as (
    values
      ('supervisores',  'ingresos.pedir'),
      ('tecnica',       'ingresos.pedir'),
      ('rrhh',          'ingresos.pedir'),
      ('rrhh',          'ingresos.aprobar'),
      ('tecnica',       'amonestaciones.registrar'),
      ('prevencion',    'amonestaciones.registrar'),
      ('rrhh',          'amonestaciones.registrar'),
      ('tecnica',       'amonestaciones.archivar'),
      ('prevencion',    'amonestaciones.archivar'),
      ('rrhh',          'amonestaciones.archivar'),
      ('tecnica',       'amonestaciones.ver'),
      ('prevencion',    'amonestaciones.ver'),
      ('rrhh',          'amonestaciones.ver'),
      ('supervisores',  'amonestaciones.ver')
  )
  select e.rol, e.permiso,
         (rp.rol is not null) as asignado
    from esperados e
    left join roles_permisos rp
           on rp.rol = e.rol and rp.permiso = e.permiso
   order by e.permiso, e.rol
$$;

grant execute on function public.diagnostico_permisos_ingresos_amonestaciones() to authenticated;
