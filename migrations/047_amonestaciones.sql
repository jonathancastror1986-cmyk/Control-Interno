-- ===================================================================
-- 047: CARTAS DE AMONESTACIÓN DEL TRABAJADOR (2026-09-29)
-- ===================================================================
--
-- LA CASILLA, Y POR QUÉ NO ES UNA CASILLA GUARDADA
-- -------------------------------------------------
-- La casilla que se ve en la ficha dice "este Annotated tiene amonestaciones".
-- Si esa respuesta fuera una columna de la ficha, sería una verdad guardada que
-- nadie puede revisar ni deshacer: no guardaría la fecha, ni el motivo, ni si
-- fue un error. Y seguiría marcada para siempre, también después de que la
-- persona se vaya, que es justo cuando el dato se vuelve decisivo y ya nadie
-- puede aclararlo.
--
-- Así que la casilla NO se guarda: se CALCULA. La tabla de abajo guarda los
-- amonestados reales, con su fecha, su motivo, quién lo registró y si sigue
-- activo. La casilla se dibuja a partir de esa tabla, y por lo tanto se
-- desmarca SOLA cuando el amonestado se archiva, sin que nadie tenga que
-- acordarse de ir a la ficha.
--
-- Esa es la diferencia entre un historial y una marca. Un historial se puede
-- leer, corregir y cerrar; una marca solo se puede obedecer.
--
-- -------------------------------------------------------------------
-- EL LÍMITE ES CONFIGURABLE, POR EMPRESA
-- -------------------------------------
-- "Más de 5" es el valor con el que arranca, no el valor fijo. Cada empresa
-- tiene el suyo en config_limite_amonestacion, porque el criterio de contratación
-- lo fija cada empleador y no es el mismo en todas.
--
-- Y la regla se devuelve JUNTO con el conteo, no aparte. Si la casilla dijera
-- "2 de 5" it'd ser un dato; si dijera solo "2", habría que ir a buscar el
-- límite a otro lado, y con el tiempo alguien lo cambia sin avisar y la lectura
-- queda vieja.
--
-- -------------------------------------------------------------------
-- QUIÉN ESCRIBE
-- -------------
-- La migración deja los permisos declarados, pero NO los asigna a ningún rol.
-- Eso es a propósito: decidir que prevención puede marcar amonestaciones es
-- una decisión de la empresa, y hacerlo desde el código la tomaría sola.
-- Se asignan desde Soporte → Permisos, como cualquier otro permiso.
--
-- -------------------------------------------------------------------
-- RLS ENCENDIDO, SIN POLÍTICAS
-- ----------------------------
-- Igual que la 040, la 041, la 043, la 044 y la 046. La puerta son las
-- funciones de abajo, y cada una comprueba su permiso adentro.
-- ===================================================================

create table if not exists trabajador_amonestaciones (
  id              uuid primary key default gen_random_uuid(),
  code            text not null references trabajadores(code) on delete cascade,

  fecha           date not null default current_date,
  motivo          text not null,

  -- activo = cuenta para la casilla. Archivado = queda en el historial y deja
  -- de contar. Nunca se borra: se archiva con su motivo, y eso también se
  -- guarda.
  estado          text not null default 'activo'
                    check (estado in ('activo','archivado')),
  motivo_archivo  text,
  archivado_por   uuid,
  archivado_por_nombre text,
  archivado_at    timestamptz,

  registrado_por  uuid,
  registrado_por_nombre text,
  created_at      timestamptz not null default now()
);

-- La consulta que se hace siempre: los activos de un trabajador, y el
-- histórico de uno en particular.
create index if not exists amonestaciones_por_trabajador
  on trabajador_amonestaciones (code, estado, fecha desc);

-- Para la pregunta "quiénes tienen amonestaciones activas" en toda la empresa,
-- que es la que se va a hacer al revisar contrataciones.
create index if not exists amonestaciones_activas
  on trabajador_amonestaciones (code)
  where estado = 'activo';

alter table trabajador_amonestaciones enable row level security;

-- -------------------------------------------------------------------
-- EL LÍMITE, POR EMPRESA
-- -------------------------------------------------------------------
-- Una fila por empresa. Si no hay fila, el valor por omisión es 5, que es el
-- con el que arranca. Así una empresa nueva no tiene que configurar nada para
-- que la casilla funcione.
create table if not exists config_limite_amonestacion (
  empresa_id      integer primary key references empresa(id) on delete cascade,
  maximo_activas  integer not null default 5,
  nota            text,
  actualizado_por uuid,
  actualizado_at  timestamptz not null default now()
);

alter table config_limite_amonestacion enable row level security;

-- -------------------------------------------------------------------
-- PERMISOS
-- -------------------------------------------------------------------
-- Tres, y no uno. Registrar y archivar son cosas distintas, y quien puede
-- archivar (desmarcar la casilla) debería poder hacerlo aunque no registre.
insert into permisos (clave, descripcion, categoria, orden) values
  ('amonestaciones.ver', 'Ver las cartas de amonestación de un trabajador', 'amonestaciones', 110),
  ('amonestaciones.registrar', 'Registrar una carta de amonestación', 'amonestaciones', 111),
  ('amonestaciones.archivar', 'Archivar una carta de amonestación con su motivo', 'amonestaciones', 112)
on conflict (clave) do nothing;

-- -------------------------------------------------------------------
-- LAS FUNCIONES DE PERMISO, SELF-CONTAINED
-- -------------------------------------------------------------------
-- El patrón del proyecto: cada migración las repite para poder aplicarse sola.
create or replace function public.es_usuario_activo(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles p where p.id = uid and p.activo)
$$;

create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfil_roles r
     where r.user_id = uid and r.rol = 'admin'
  )
$$;

create or replace function public.tiene_permiso(clave text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.perfil_roles pr
      join public.roles_permisos rp on rp.rol = pr.rol
     where pr.user_id = uid
       and rp.permiso = clave
  )
$$;

-- ===================================================================
-- LAS PUERTAS
-- ===================================================================

-- -------------------------------------------------------------------
-- EL LÍMITE DE UNA EMPRESA
-- -------------------------------------------------------------------
-- Si no hay fila configurada, 5. Se devuelve en la misma llamada que el
-- conteo, para que la lectura "2 de 5" no dependa de dos lugares.
create or replace function public.limite_amonestacion(p_empresa_id integer default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.maximo_activas
       from public.config_limite_amonestacion c
      where c.empresa_id = p_empresa_id),
    5
  )
$$;

-- -------------------------------------------------------------------
-- REGISTRAR UNA AMONESTACIÓN
-- -------------------------------------------------------------------
-- El motivo es obligatorio y de un mínimo de caracteres. Una carta de
-- amonestación sin motivo no sirve para nada: ni para el historial, ni para
-- que la persona se entienda, ni para que más tarde alguien pueda revisarla.
create or replace function public.registrar_amonestacion(
  p_codigo text,
  p_motivo text,
  p_fecha  date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_motivo text;
  v_trabajador text;
begin
  if not (es_usuario_activo() or es_admin() or tiene_permiso('amonestaciones.registrar')) then
    raise exception 'No tienes permiso para registrar amonestaciones'
      using errcode = '42501';
  end if;

  v_trabajador := btrim(coalesce(p_codigo, ''));
  if v_trabajador = '' then
    raise exception 'Falta el código del trabajador' using errcode = '22023';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 10 then
    raise exception 'Escribe el motivo con más detalle: mínimo 10 caracteres. Una amonestación sin motivo no sirve para nada.'
      using errcode = '22023';
  end if;

  -- La ficha tiene que existir. Con una clave mal escrita, la amonestación
  -- quedaba colgada de un código que no está en la lista y nadie la iba a ver.
  if not exists (select 1 from trabajadores t
                  where t.code = v_trabajador and t.status = 'activo') then
    raise exception 'Ese código no está en la lista de trabajadores activos'
      using errcode = '22023';
  end if;

  insert into trabajador_amonestaciones (
    code, fecha, motivo, registrado_por, registrado_por_nombre
  )
  values (
    v_trabajador,
    coalesce(p_fecha, current_date),
    v_motivo,
    auth.uid(),
    (select nombre from perfiles where id = auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -------------------------------------------------------------------
-- ARCHIVAR
-- -------------------------------------------------------------------
-- Archivar es lo que desmarca la casilla. Por eso pide motivo: sin motivo, un
-- archivo es indistinguible de un borrado, y alguien puede "limpiar" el
-- historial de un trabajador sin dejar rastro.
create or replace function public.archivar_amonestacion(
  p_amonestacion_id uuid,
  p_motivo          text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_motivo text;
begin
  if not (es_usuario_activo() or es_admin() or tiene_permiso('amonestaciones.archivar')) then
    raise exception 'No tienes permiso para archivar amonestaciones'
      using errcode = '42501';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if v_motivo = '' then
    raise exception 'Escribe el motivo del archivo. Sin motivo, archivar es lo mismo que borrar.'
      using errcode = '22023';
  end if;

  update trabajador_amonestaciones
     set estado = 'archivado',
         motivo_archivo = v_motivo,
         archivado_por = auth.uid(),
         archivado_por_nombre = (select nombre from perfiles where id = auth.uid()),
         archivado_at = now()
   where id = p_amonestacion_id
  returning estado into v_estado;

  if v_estado is null then
    raise exception 'Esa amonestación no existe' using errcode = 'P0002';
  end if;
  if v_estado <> 'archivado' then
    raise exception 'Esa amonestación ya estaba archivada' using errcode = '22023';
  end if;
end;
$$;

-- -------------------------------------------------------------------
-- LEER: EL HISTORIAL Y EL CONTEO EN LA MISMA LLAMADA
-- -------------------------------------------------------------------
-- Devuelve una fila por amonestación, y en cada una cuántas hay activas y cuál
-- es el límite de la empresa. Así la casilla se dibuja sin que la aplicación
-- tenga que contar nada, y sin que el conteo y el límite puedan quedar viejos
-- por separado.
create or replace function public.ver_amonestaciones(p_codigo text)
returns table (
  id             uuid,
  code           text,
  fecha          date,
  motivo         text,
  estado         text,
  motivo_archivo text,
  registrado_por_nombre text,
  registrado_at  timestamptz,
  archivado_por_nombre text,
  archivado_at   timestamptz,
  activas        integer,
  ultima_activa  date,
  limite         integer,
  excede         boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with emp as (
    select t.empresa_id
      from trabajadores t
     where t.code = p_codigo
  ),
  lim as (
    select public.limite_amonestacion((select empresa_id from emp)) as n
  ),
  tot as (
    select count(*) filter (where a.estado = 'activo')::integer as n,
           max(a.fecha) filter (where a.estado = 'activo')   as ultima
      from trabajador_amonestaciones a
     where a.code = p_codigo
  )
  select a.id, a.code, a.fecha, a.motivo, a.estado, a.motivo_archivo,
         a.registrado_por_nombre, a.created_at,
         a.archivado_por_nombre, a.archivado_at,
         tot.n, tot.ultima, lim.n, (tot.n > lim.n)
    from trabajador_amonestaciones a
    cross join tot
    cross join lim
   where a.code = p_codigo
   order by (a.estado = 'activo') desc, a.fecha desc, a.created_at desc
$$;

-- -------------------------------------------------------------------
-- DIAGNÓSTICO
-- -------------------------------------------------------------------
create or replace function public.diagnostico_amonestaciones()
returns table (
  existe_tabla boolean,
  rls_encendido boolean,
  permiso_registrar boolean,
  permiso_archivar boolean,
  empresas_con_limite integer
)
language sql
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='trabajador_amonestaciones'),
    coalesce((select relrowsecurity from pg_class
               where oid = 'public.trabajador_amonestaciones'::regclass), false),
    exists (select 1 from public.permisos where clave = 'amonestaciones.registrar'),
    exists (select 1 from public.permisos where clave = 'amonestaciones.archivar'),
    (select count(*)::integer from public.config_limite_amonestacion)
$$;

grant execute on function public.registrar_amonestacion(text,text,date) to authenticated;
grant execute on function public.archivar_amonestacion(uuid,text) to authenticated;
grant execute on function public.ver_amonestaciones(text) to authenticated;
grant execute on function public.limite_amonestacion(integer) to authenticated;
grant execute on function public.diagnostico_amonestaciones() to authenticated;
