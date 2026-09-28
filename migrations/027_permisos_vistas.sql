-- ============================================================
-- Migración 027: permisos que faltaban, y que se puedan ver
-- ============================================================
-- EL PROBLEMA QUE VINO
--
-- Un supervisor no veía "Asistencia diaria". La vista existe, el botón
-- existe en el menú, y el rol `supervisores` tiene `tarja.marcaje` desde
-- la migración 013. Así que la fila se perdió en algún momento: alguien
-- desmarcó la casilla en Soporte → Permisos por rol, o una migración
-- reescribió la tabla.
--
-- LO PEOR NO ES QUE FALTARA EL PERMISO
--
-- Es que la app lo escondía. `ocultarSubNavSinPermiso()` ponía
-- display:none y no decía nada. Para quien lo buscaba, la conclusión
-- razonable era "esta aplicación no tiene esa sección", que es
-- justamente la conclusión equivocada y la más difícil de corregir:
-- nadie va a pedir que le habiliten algo que ni sabe que existe.
--
-- POR QUÉ ESTA MIGRACIÓN
--
-- Repone la asignación de la 013 para los roles que laTenían, y ADEMÁS
-- deja una función que dice, para cada vista de la aplicación, qué rol
-- mínimo debería poder verla y si hoy alguien puede. Con esa función el
-- diagnóstico se puede pedir en cualquier momento, sin tener que
-- acordarse de esta migración.
--
-- Es re-ejecutable: no duplica filas (on conflict do nothing) y no saca
-- permisos que alguien haya agregado a propósito.
-- ============================================================

-- ------------------------------------------------------------
-- 1) REPONER LA ASIGNACIÓN DE LA 013
-- ------------------------------------------------------------
-- Solo los roles y permisos que la 013 definía. Si más adelante se
-- agrega un permiso a un rol desde la pantalla, esta migración no lo
-- borra: no toca nada para borrar, solo agrega lo que falta.
insert into roles_permisos (rol, permiso) values
  -- RRHH
  ('rrhh','tarja.ver'),('rrhh','tarja.editar'),('rrhh','tarja.marcaje'),
  ('rrhh','tarja.justificar'),('rrhh','tarja.excel'),('rrhh','tarja.exportar'),
  ('rrhh','tarja.aprobar_cambio'),('rrhh','tarja.solicitar_cambio'),
  ('rrhh','porteria.ver'),('rrhh','trabajadores.ver'),('rrhh','trabajadores.editar'),
  ('rrhh','trabajadores.tarjeta'),('rrhh','social.ver'),('rrhh','prevencion.ver'),
  -- Oficina
  ('oficina','tarja.ver'),('oficina','tarja.editar'),('oficina','tarja.justificar'),
  ('oficina','tarja.excel'),('oficina','tarja.exportar'),
  ('oficina','porteria.ver'),('oficina','trabajadores.ver'),
  ('oficina','trabajadores.editar'),('oficina','trabajadores.tarjeta'),
  ('oficina','social.ver'),('oficina','prevencion.ver'),
  -- Portería
  ('porteria','tarja.ver'),('porteria','porteria.ver'),('porteria','trabajadores.ver'),
  -- Supervisores
  ('supervisores','tarja.ver'),('supervisores','tarja.solicitar_cambio'),
  ('supervisores','tarja.marcaje'),
  ('supervisores','porteria.ver'),('supervisores','trabajadores.ver'),
  ('supervisores','trabajadores.editar'),('supervisores','trabajadores.tarjeta'),
  ('supervisores','social.ver'),('supervisores','prevencion.ver')
on conflict do nothing;

-- ------------------------------------------------------------
-- 2) DIAGNÓSTICO: QUIÉN PUEDE VER QUÉ
-- ------------------------------------------------------------
-- Para cada permiso del catálogo, qué roles lo tienen hoy.
--
-- Antes esta función llevaba su propia lista de "rol que debería" escrita
-- a mano, y ahí metí un rol "asistente_social" que no existe: la 013 define
-- ocho roles y ese no está entre ellos. El diagnóstico "(falta en
-- asistente_social)" era inventado por mí, y eso es peor que no tener
-- diagnóstico: hace pasar un error inventado por uno real.
--
-- Por eso ahora no hay lista escrita: se lee de las tablas. Si mañana se
-- agrega un rol o un permiso, el diagnóstico lo ve solo.
--
-- Se devuelven dos cosas:
--   solo_admin  = ningún rol, salvo Administración, tiene el permiso. Esa
--                 vista existe pero es inalcanzable para el resto.
--   roles        = qué roles lo tienen, para verlo de una.
create or replace function public.diagnostico_vistas_por_rol()
returns table (
  permiso text,
  descripcion text,
  roles text,
  solo_admin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.clave,
    p.descripcion,
    coalesce(
      (select string_agg(rp.rol, ', ' order by rp.rol)
         from public.roles_permisos rp
        where rp.permiso = p.clave and rp.rol <> 'admin'),
      '(ningún rol)'
    ),
    not exists (
      select 1 from public.roles_permisos rp
       where rp.permiso = p.clave and rp.rol <> 'admin'
    )
  from public.permisos p
  order by p.categoria, p.orden, p.clave
$$;

comment on function public.diagnostico_vistas_por_rol() is
  'Permisos del catálogo, qué roles los tienen, y cuáles solo tiene Administración (solo_admin=true). Un permiso con solo_admin=true es una vista que nadie más puede abrir.';

-- ------------------------------------------------------------
-- 3) SALIDA DIRECTA
-- ------------------------------------------------------------
-- Para pegarla en el SQL Editor y leerla de una, sin recordar el nombre
-- de la función ni sus columnas.
select
  d.permiso,
  d.descripcion,
  d.roles,
  case when d.solo_admin then 'SOLO ADMIN: nadie más lo puede abrir' else '' end as aviso
from public.diagnostico_vistas_por_rol() d
order by d.solo_admin desc, d.permiso;
