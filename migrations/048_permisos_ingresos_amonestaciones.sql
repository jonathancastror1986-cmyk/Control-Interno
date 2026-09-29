-- ===================================================================
-- 048: QUIÉN PUEDE PEDIR Y QUIÉN PUEDE RESOLVER (2026-09-29)
-- ===================================================================
--
-- LA 046 Y LA 047 DECLARAN LOS PERMISOS, NO LOS ASIGNAN
-- ------------------------------------------------------
-- Eso fue a propósito: decidir que prevención puede registrar amonestaciones
-- es una decisión de la empresa, y si se asigna desde el código, se toma sola.
--
-- Esta migración la toma. Es el lugar donde queda escrita, a la vista, y no
-- repartida entre permisos que alguien marcó a mano y un archivo que nadie
-- recuerda.
--
-- -------------------------------------------------------------------
-- LOS PERMISOS, Y QUIÉN LOS RECIBE
-- -------------------------------------------------------------------
--   ingresos.pedir          el supervisor escribe con el RUT delante, y
--                           técnica también. RRHH por si lo necesita.
--                           NO lo lleva prevención: no es un tema suyo.
--
--   ingresos.aprobar        solo RRHH. Es la parte donde se asigna el código
--                           del trabajador, que es la llave de todo lo demás
--                           (tarjetas, asistencia, EPP, herramientas). Que lo
--                           apruebe más de un rol es repartir esa llave.
--
--   amonestaciones.registrar  técnica, prevención y RRHH. Así lo pidió la
--                           empresa.
--
--   amonestaciones.archivar   los mismos tres. Archivar es lo que desmarca la
--                           casilla, así que el permiso va aparte: puede
--                           archivar quien no debería poder registrar.
--
--   amonestaciones.ver       los tres más supervisores. El supervisor LEE el
--                           historial para conocer a su gente, pero no
--                           escribe: si el supervisor pudiera marcar, el
--                           registro dejaría de servir para nada.
--
-- -------------------------------------------------------------------
-- LOS ROLES SE TOMAN DE LA TABLA, NO DE UNA LISTA ESCRITA
-- ------------------------------------------------------
-- El "insert ... select" desde roles_sistema con una lista de roles FILTRADA
-- hace que, si un rol no existe, no se conceda nada a un rol inventado en vez
-- de dar error. Es la diferencia entre "este rol no existe todavía" y "le di
-- amonestaciones a un rol fantasma".
--
-- Y la migración es de las pocas que se pueden correr dos veces sin romper
-- nada: todo lleva "on conflict do nothing".
--
-- -------------------------------------------------------------------
-- LO QUE NO SE TOCA
-- -----------------
-- admin no se agrega. Las funciones lo aceptan con es_admin(), y en el
-- catálogo de permisos la casilla de admin ya está siempre marcada. Meterlo
-- acá sería una fila más que dice lo mismo que todas.
-- ===================================================================

insert into roles_permisos (rol, permiso)
select r.rol, v.permiso
  from roles_sistema r
 cross join (values
    -- el ingreso lo pide quien está en terreno
    ('ingresos.pedir',             r.rol in ('supervisores','tecnica','rrhh')),
    -- y lo resuelve solo RRHH
    ('ingresos.aprobar',           r.rol = 'rrhh'),
    -- las amonestaciones
    ('amonestaciones.registrar',   r.rol in ('tecnica','prevencion','rrhh')),
    ('amonestaciones.archivar',    r.rol in ('tecnica','prevencion','rrhh')),
    ('amonestaciones.ver',         r.rol in ('tecnica','prevencion','rrhh','supervisores'))
  ) as v(permiso, aplica)
 where v.aplica
on conflict (rol, permiso) do nothing;

-- -------------------------------------------------------------------
-- DIAGNÓSTICO
-- -------------------------------------------------------------------
-- Dice qué se concedió y qué falta. Se lee después de correr la migración, y
-- también dentro de un mes, cuando alguien pregunte por qué una casilla no
-- aparece.
--
-- La lista de permisos esperados está en el propio diagnóstico, y no en el
-- código de la aplicación: si mañana se agrega un permiso, esta lista se ve
-- desactualizada en vez de fallar en silencio.
create or replace function public.diagnostico_permisos_ingresos_amonestaciones()
returns table (
  rol text,
  permiso text,
  asignado boolean
)
language sql
security definer
set search_path = public
as $$
  with esperados(clave) as (
    values ('ingresos.pedir'), ('ingresos.aprobar'),
           ('amonestaciones.ver'), ('amonestaciones.registrar'),
           ('amonestaciones.archivar')
  ),
  concedidos as (
    select r.rol, e.clave
      from esperados e
      join roles_sistema r on true
      join roles_permisos rp on rp.rol = r.rol and rp.permiso = e.clave
  )
  select r.rol, e.clave, (c.rol is not null) as asignado
    from esperados e
    cross join roles_sistema r
    left join concedidos c on c.rol = r.rol and c.clave = e.clave
   order by e.clave, r.rol
   -- Solo los roles que la 048 toca: los demás no tienen nada que ver con
   -- estos permisos y ensucian la salida
   where r.rol in ('supervisores','tecnica','rrhh','prevencion','porteria','oficina','bodega')
$$;

grant execute on function public.diagnostico_permisos_ingresos_amonestaciones() to authenticated;
