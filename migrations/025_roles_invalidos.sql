-- ============================================================
-- Migración 025: el catálogo de roles no puede quedar desalineado
-- ============================================================
-- EL SÍNTOMA
--
-- Al cambiar un rol en Administración → Usuarios:
--
--   ERROR: 23514: new row for relation "perfiles" violates check
--   constraint "perfiles_rol_check"
--   DETAIL: Failing row contains (..., supervisor, t, ...)
--
-- El detalle dice "supervisor". Ese rol NO existe: el correcto es
-- "supervisores", con la ese al final.
--
-- POR QUÉ PASA
--
-- Hay dos listas de roles que deberían ser la misma y no lo son:
--
--   · "roles_sistema"  → el catálogo. La pantalla de usuarios dibuja
--                         una casilla por cada fila que haya ahí. Es lo
--                         que la persona ve.
--   · el check de "perfiles" → los ocho valores que Postgres acepta.
--                         Es lo que la base exige.
--
-- Con una fila "supervisor" en el catálogo, la casilla aparece y se puede
-- marcar. Al guardar, el check la rechaza. Lo peor es que no hay forma de
-- saber de dónde salió: la pantalla se veía bien, y el error aparecía
-- recién al apretar Guardar, con un texto que no nombra la casilla.
--
-- DÓNDE SE CREÓ
--
-- Ninguna migración crea un rol "supervisor". Tiene que haber entrado a
-- mano, o desde una versión más antigua de la app que tenía otra lista.
-- La diferencia con el rol bueno es de una sola letra, que es exactamente
-- como se cuela un valor mal escrito.
--
-- LO QUE HACE ESTA MIGRACIÓN
--
--  1. Arregla las filas YA GUARDADAS primero, antes de tocar el
--     catálogo. Al revés, se perderían los permisos de esa persona.
--  2. Saca del catálogo los roles que el check no acepta.
--  3. Asegura que existan los ocho válidos.
--  4. Deja un diagnóstico que dice si el catálogo y el check coinciden.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 024 -> 025.
-- ============================================================

-- ------------------------------------------------------------
-- 1) LOS ROLES VÁLIDOS, en un solo lugar
-- ------------------------------------------------------------
-- Se declara una tabla de valores válidos y se usa en todos lados, para
-- que el catálogo, el diagnóstico y la app no puedan discrepar entre sí.
-- ---------------------------------------------------------------------
-- LAS DOS LISTAS, Y POR QUÉ SON DOS
-- ---------------------------------------------------------------------
-- "roles_validos_array()" es la lista canónica, y es la que va en el
-- check de la tabla.
--
-- El check NO puede llevar una subconsulta: Postgres responde
-- "cannot use subquery in check constraint". Por eso esta función es un
-- SELECT de un literal, sin FROM ni nada que lea tablas. Se verificó.
--
-- "roles_validos()" lleva además el nombre, la descripción y el orden, y
-- esa información no cabe en un check. Se usa para el catálogo.
--
-- Quedan dos listas escritas a mano, que es lo que había que evitar. Se
-- controla con el diagnóstico del final, que avisa si se desincronizan.
create or replace function public.roles_validos_array()
returns text[]
language sql
immutable
as $$
  select array['admin','rrhh','oficina','porteria','supervisores','tecnica','bodega','prevencion']
$$;

create or replace function public.roles_validos()
returns table (rol text, nombre text, descripcion text, orden int)
language sql
stable
as $$
  select * from (values
    ('admin',        'Administración',  'Acceso total al sistema', 1),
    ('rrhh',         'RRHH',            'Recursos humanos: edita la tarja y aprueba solicitudes', 2),
    ('oficina',      'Oficina',         'Ingresos, licencias y remuneraciones', 3),
    ('porteria',     'Portería',        'Control de acceso y consulta de trabajadores', 4),
    ('supervisores', 'Supervisores',    'Equipos, tarja de su gente y solicitudes de cambio', 5),
    ('tecnica',      'Técnica',         'Soporte técnico en terreno: ve la tarja y solicita cambios', 6),
    ('bodega',       'Bodega',          'EPP, kits, herramientas y etiquetas QR', 7),
    ('prevencion',   'Prevención',      'Alertas e indicaciones de prevención', 8)
  ) as t(rol, nombre, descripcion, orden)
$$;

-- El corrector más cercano: "supervisor" → "supervisores". Se usa para
-- no tirar abajo los permisos de alguien por una letra.
create or replace function public.corregir_rol(rol text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(btrim(coalesce(rol, '')));
  v_bueno text;
begin
  -- Si ya es válido, se queda.
  if exists (select 1 from public.roles_validos() where roles_validos.rol = v) then
    return v;
  end if;

  -- Buscar el válido más parecido: mismo prefijo o el que empieza con lo
  -- mismo. "supervisor" y "supervisores" comparten prefijo.
  select rv.rol into v_bueno
    from public.roles_validos() rv
   where v like rv.rol || '%' or rv.rol like v || '%'
   order by length(rv.rol)
   limit 1;
  if v_bueno is not null then return v_bueno; end if;

  -- Sin parecido: un rol desconocido no se puede convertir en algo que
  -- tenga permisos distintos. Se deja "oficina", que es el rol más
  -- acotado: el menor daño si alguien quedó con algo que no debía.
  return 'oficina';
end $$;

-- ------------------------------------------------------------
-- 2) ARREGLAR LO YA GUARDADO, antes de tocar el catálogo
-- ------------------------------------------------------------
-- El orden importa. Si primero se borra el rol inválido del catálogo y
-- después se intenta arreglar "perfiles", ya no hay a qué apuntar y la
-- persona se queda sin rol.
update public.perfiles
   set rol = public.corregir_rol(rol)
 where rol not in (select unnest(public.roles_validos_array()));

update public.perfil_roles
   set rol = public.corregir_rol(rol)
 where rol not in (select unnest(public.roles_validos_array()))
   and not exists (      -- si ya tiene el rol corregido, no duplicar
     select 1 from public.perfil_roles r2
      where r2.user_id = public.perfil_roles.user_id
        and r2.rol = public.corregir_rol(public.perfil_roles.rol)
   );

-- Lo que quedó duplicado tras la corrección, se quita.
delete from public.perfil_roles a
 using public.perfil_roles b
 where a.user_id = b.user_id
   and a.rol = b.rol
   and a.ctid > b.ctid;

-- ------------------------------------------------------------
-- 3) EL CATÁLOGO, coherente con el check
-- ------------------------------------------------------------
-- Los roles inválidos salen del catálogo. También sus permisos, que ya
-- no significan nada: si alguien los vuelve a marcar, la casilla ni
-- siquiera existe.
delete from public.roles_permisos
 where rol not in (select unnest(public.roles_validos_array()));

delete from public.roles_sistema
 where rol not in (select unnest(public.roles_validos_array()));

-- Y se asegura que existan los ocho, con su nombre y su orden. Si falta
-- alguno, es que alguien lo borró: la app lo dibujaría como si no
-- existiera el permiso.
insert into public.roles_sistema (rol, nombre, descripcion, orden)
select rv.rol, rv.nombre, rv.descripcion, rv.orden
  from public.roles_validos() rv
on conflict (rol) do update
   set nombre      = excluded.nombre,
       descripcion = excluded.descripcion,
       orden       = excluded.orden;

-- ------------------------------------------------------------
-- 4) EL CHECK, ARMADO CON LA LISTA CANÓNICA
-- ------------------------------------------------------------
-- Se repone DESPUÉS de arreglar los datos, y ese orden no es caprichoso:
-- Postgres no valida un check si alguna fila existente ya lo incumple, y
-- responde "check constraint ... is violated by some row". Con los datos
-- sucios, esta sentencia sola aborta la migración.
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles
  add constraint perfiles_rol_check
  check (rol = any(public.roles_validos_array()));

-- ------------------------------------------------------------
-- 5) COMPROBACIÓN DE SALUD
-- ------------------------------------------------------------
-- Dice si el catálogo y el check dicen lo mismo. Es la pregunta que
-- responde "por qué la casilla aparece y el guardado falla".
create or replace function public.diagnostico_roles()
returns table (
  catalogo_ok boolean,
  filas_invalidas integer,
  roles_faltantes text,
  listas_sincronizadas boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.roles_sistema s
       where s.rol not in (select unnest(public.roles_validos_array()))
    ),
    (select count(*)::int from public.perfiles p
      where p.rol not in (select unnest(public.roles_validos_array()))),
    coalesce((
      select string_agg(rv.rol, ', ')
        from public.roles_validos() rv
       where not exists (select 1 from public.roles_sistema s where s.rol = rv.rol)
    ), ''),
    -- Que la lista del check y la del catálogo digan lo mismo. Son dos
    -- textos escritos a mano porque el check no admite subconsultas, así
    -- que esto es lo que avisa si alguien agrega un rol a una y se
    -- olvida de la otra.
    (select array_agg(rv.rol order by rv.rol) from public.roles_validos() rv)
      = (select array_agg(x order by x) from unnest(public.roles_validos_array()) x)
$$;

-- Para que la app pueda preguntar sin tener la lista escrita a mano.
create or replace function public.roles_aceptados()
returns text[]
language sql
stable
as $$ select public.roles_validos_array() $$;
