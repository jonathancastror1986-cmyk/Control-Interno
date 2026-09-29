
-- ===================================================================
-- 051: GRUPOS Y CARGOS (2026-09-29)
-- ===================================================================
--
-- EL CAMBIO
-- --------
-- Hoy la lista de oficios es una sola, plana, sin jerarquía:
--
--     gasfitería · soldadura · albañil · ventas · contabilidad
--
-- Y eso no sirve, porque esos cinco nombres no son del mismo tipo. Los
-- primeros son oficios de obra y los últimos son áreas de oficina, y
-- mezclados en un mismo desplegable el que elige tiene que saber que
-- "ventas" no es un oficio. Peor: la lista crece y cada vez que aparece un
-- nombre nuevo hay que decidir en qué lado va.
--
-- Ahora hay dos niveles, y el segundo se elige según el primero:
--
--     OBRA     -> maestro · jorna · ayudante
--     OFICINA  -> ventas · contabilidad · gastos generales
--     BODEGA   -> ...
--
-- -------------------------------------------------------------------
-- UN SOLO CATÁLOGO DE CARGOS, NO DOS
-- -----------------------------------
-- "Cargo" y "oficio" son la misma cosa: la gasfitería es el cargo, y el
-- maestro es el cargo. Lo que cambia es de dónde viene, y por eso se le
-- pone un grupo arriba.
--
-- Podría haberse creado una tabla nueva "cargos" y dejar "especialidades"
-- como estaba. Eso habría sido un error: dos catálogos del mismo hecho, y
-- la primera vez que alguien escribiera "ventas" en uno y "Ventas" en el
-- otro, el sistema tendría dos ventas con dos kits distintos. Un solo
-- catálogo: el que ya existe, epp_especialidades, con una columna de grupo.
--
-- -------------------------------------------------------------------
-- LA NIDIFICACIÓN
-- ---------------
-- El grupo NO se guarda en el trabajador. Se guarda el cargo, y el grupo
-- se deduce de él. Guardar los dos sería guardar el mismo dato dos veces,
-- y la primera vez que se cambiaran uno sin el otro, el trabajador
-- quedaría en un grupo con un cargo que no es de ese grupo.
--
-- El detalle del grupo se calcula al mostrar. Un solo lugar donde se puede
-- equivocar, en vez de dos.
--
-- -------------------------------------------------------------------
-- DÓNDE SE USA EL GRUPO
-- ----------------------
-- En todos lados donde antes se preguntaba el oficio:
--
--   - el ingreso del trabajador, con dos desplegables anidados
--   - las charlas del kit: una charla puede ser del grupo OBRA (le toca a
--     todos los de obra, sean maestro o ayudante) o del cargo MAESTRO
--     (solo a los maestros)
--   - los documentos de ingreso, igual que las charlas
--   - el administrador de kits
--
-- Para las charlas y los documentos son DOS columnas y no una, porque son
-- dos preguntas distintas y las dos pueden no_apply... y no pueden ser
-- ciertas a la vez. El CHECK lo prohibe, para que nadie pueda dejar un
-- papel en blanco por haber llenado las dos.
-- ===================================================================

-- -------------------------------------------------------------------
-- 1) LOS GRUPOS
-- -------------------------------------------------------------------
create table if not exists epp_grupos (
  clave         text primary key,
  nombre        text not null,
  descripcion   text,
  orden         integer not null default 100,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists epp_grupos_orden on epp_grupos (orden, nombre) where activo;

alter table epp_grupos enable row level security;

-- -------------------------------------------------------------------
-- 2) EL GRUPO DEL CARGO
-- -------------------------------------------------------------------
-- on delete set null y no cascade: si se da de baja un grupo, los cargos
-- quedan sin grupo en vez de desaparecer. Un cargo sin grupo es un dato
-- incompleto que se ve; un cargo borrado es un trabajador sin oficio.
alter table epp_especialidades
  add column if not exists grupo text references epp_grupos(clave) on delete set null;

insert into epp_grupos (clave, nombre, descripcion, orden) values
  ('general',   'General',    'Los que no son de un grupo definido', 10),
  ('obra',      'Obra',       'Construcción en terreno: maestro, jorna, ayudante', 20),
  ('oficina',   'Oficina',    'Ventas, contabilidad, gastos generales', 30),
  ('bodega',    'Bodega',     'Bodega y logística', 40),
  ('servicios', 'Servicios',  'Mantención y servicios generales', 50)
on conflict (clave) do nothing;

-- Los cargos que ya existían, al grupo "general". La columna es nueva: no
-- hay dato que perder, y dejarlos sin grupo los haría desaparecer del
-- desplegable anidado, que es justo donde se los busca.
update epp_especialidades set grupo = 'general' where grupo is null;

create index if not exists epp_especialidades_grupo
  on epp_especialidades (grupo, nombre) where activa;

-- -------------------------------------------------------------------
-- 3) EL CARGO DEL KIT
-- -------------------------------------------------------------------
-- Un kit pertenece a un cargo por su especialidad_id, que ya es un cargo.
-- Entonces, ¿para qué otra columna?
--
-- Para el caso en que un kit sirve a varios cargos. El casco con barbiquejo
-- le sirve al maestro y a la jorna por igual, y duplicar el kit dos veces
-- significa duplicar la lista de elementos y que un cambio de talla se
-- tenga que hacer en los dos.
--
-- La regla es una sola y se lee en todas partes:
--
--     cargo del kit = coalesce(epp_kits.cargo, epp_especialidades.clave)
--
-- Con NULL, el kit sigue el cargo de su especialidad, que es el
-- comportamiento de siempre. No es un dato que haya que rellenar: es el
-- valor por omisión, y por eso se lee con coalesce y no en un trigger.
alter table epp_kits
  add column if not exists cargo text references epp_especialidades(clave) on delete set null;

create index if not exists epp_kits_por_cargo on epp_kits (cargo, especialidad_id, nombre);

-- -------------------------------------------------------------------
-- 4) LAS CHARLAS: A UN GRUPO O A UN CARGO
-- -------------------------------------------------------------------
-- Hasta ahora la plantilla decía "esta charla es para el oficio X" y con
-- NULL decía "es para todos". No había forma de decir "es para todos los de
-- obra".
--
-- Son dos columnas y un CHECK: las dos pueden quedar en NULL (para todos),
-- pero no las dos puestas, porque "esta charla es del grupo obra Y del cargo
-- maestro" no significa nada.
alter table public.plantillas_contratacion
  add column if not exists grupo_clave text references epp_grupos(clave) on delete set null;

alter table public.plantillas_contratacion
  drop constraint if exists plantillas_una_destinataria;
alter table public.plantillas_contratacion
  add constraint plantillas_una_destinataria
  check (num_nonnulls(grupo_clave, especialidad_clave) <= 1);

create index if not exists plantillas_por_grupo
  on public.plantillas_contratacion (grupo_clave, tipo, vigente, orden)
  where grupo_clave is not null;

-- -------------------------------------------------------------------
-- 5) LOS DOCUMENTOS DE INGRESO: LO MISMO
-- -------------------------------------------------------------------
-- documentos_catalogo es el catálogo del 049, el del contrato, la
-- declaración de salud, la inducción. Misma pregunta, misma respuesta.
alter table documentos_catalogo
  add column if not exists grupo_clave text references epp_grupos(clave) on delete set null;

alter table documentos_catalogo
  add column if not exists cargo_clave text references epp_especialidades(clave) on delete set null;

alter table documentos_catalogo
  drop constraint if exists documentos_una_destinataria;
alter table documentos_catalogo
  add constraint documentos_una_destinataria
  check (num_nonnulls(grupo_clave, cargo_clave) <= 1);

-- -------------------------------------------------------------------
-- PERMISOS
-- -------------------------------------------------------------------
insert into permisos (clave, descripcion, categoria, orden) values
  ('grupos.ver',        'Ver los grupos y los cargos de cada uno',  'contratacion', 150),
  ('grupos.gestionar',  'Crear grupos y mover cargos entre ellos',    'contratacion', 151),
  ('kits.cargo',        'Asignar y cambiar el cargo de los kits',     'epp',          152),
  ('kits.importar',     'Importar kits con sus elementos',            'epp',          153)
on conflict (clave) do nothing;

-- -------------------------------------------------------------------
-- LAS FUNCIONES DE PERMISO, SELF-CONTAINED
-- -------------------------------------------------------------------
-- Se repiten en cada migración para que se pueda aplicar sola, sin
-- depender de que la anterior esté.
-- -------------------------------------------------------------------
create or replace function public.es_usuario_activo(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from perfiles p where p.id = uid and p.activo)
$$;

create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfil_roles r where r.user_id = uid and r.rol = 'admin'
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
      from perfil_roles pr
      join roles_permisos rp on rp.rol = pr.rol
     where pr.user_id = uid and rp.permiso = clave
  )
$$;

-- ===================================================================
-- LAS PUERTAS
-- ===================================================================

-- -------------------------------------------------------------------
-- LOS DOS DESPLEGABLES, EN UNA SOLA LLAMADA
-- -------------------------------------------------------------------
-- Es lo que la pantalla necesita para los dos niveles anidados, y evita
-- dos viajes: primero la lista de grupos, y después, al elegir uno, la de
-- sus cargos.
--
-- El grupo "general" trae lo que no tiene grupo, que de otro modo no
-- aparecería en ningún desplegable y quedaría fuera de la pantalla sin que
-- nadie lo note.
create or replace function public.jerarquia_cargos(
  p_empresa_id integer default null,
  p_solo_activos boolean default true
)
returns table (
  grupo_clave   text,
  grupo_nombre  text,
  grupo_orden   integer,
  cargo_clave   text,
  cargo_nombre  text,
  cargo_orden   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select g.clave,
         g.nombre,
         g.orden,
         e.clave,
         e.nombre,
         100
    from epp_grupos g
    join epp_especialidades e
      on e.grupo = g.clave
   where g.activo
     and (e.activa or not coalesce(p_solo_activos, true))
     -- Si la empresa ya tiene lista propia (050), se respeta; si no, la
     -- maestra entera, para que una empresa nueva sirva desde el primer día.
     and (p_empresa_id is null
          or not exists (select 1 from empresa_especialidades ee where ee.empresa_id = p_empresa_id)
          or exists (select 1 from empresa_especialidades ee
                      where ee.empresa_id = p_empresa_id
                        and ee.especialidad_id = e.id
                        and ee.activa))
   order by g.orden, g.nombre, e.nombre
$$;

-- -------------------------------------------------------------------
-- UN SOLO NIVEL: LOS CARGOS DE UN GRUPO
-- -------------------------------------------------------------------
-- El segundo desplegable, cuando ya está elegido el primero. Va aparte
-- porque es lo que se pide al cambiar el grupo, y en una lista de 300
-- cargos cargarla entera cada vez que se cambia de grupo sería lento.
create or replace function public.cargos_por_grupo(
  p_grupo        text,
  p_empresa_id   integer default null,
  p_solo_activos boolean default true
)
returns table (
  clave  text,
  nombre text,
  orden  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select e.clave, e.nombre, 100
    from epp_especialidades e
   where e.grupo = p_grupo
     and (e.activa or not coalesce(p_solo_activos, true))
     and (p_empresa_id is null
          or not exists (select 1 from empresa_especialidades ee where ee.empresa_id = p_empresa_id)
          or exists (select 1 from empresa_especialidades ee
                      where ee.empresa_id = p_empresa_id
                        and ee.especialidad_id = e.id
                        and ee.activa))
   order by e.nombre
$$;

-- -------------------------------------------------------------------
-- EL GRUPO DE UN CARGO
-- -------------------------------------------------------------------
-- Para pintar "Obra › Maestro" en la ficha del trabajador sin volver a
-- pedir la jerarquía entera.
create or replace function public.grupo_de_cargo(p_cargo_clave text)
returns table (
  grupo_clave  text,
  grupo_nombre text
)
language sql
stable
security definer
set search_path = public
as $$
  select g.clave, g.nombre
    from epp_especialidades e
    join epp_grupos g on g.clave = e.grupo
   where e.clave = p_cargo_clave
$$;

-- -------------------------------------------------------------------
-- KITS POR CARGO
-- -------------------------------------------------------------------
-- El agrupamiento que se pidió, con la regla coalesce escrita una sola
-- vez. n_kits va en la misma fila a propósito: el filtro "Maestro (0)"
-- tiene que ser distinguible de un cargo que no existe.
create or replace function public.kits_por_cargo(
  p_grupo      text default null,
  p_cargo      text default null,
  p_especialidad_id uuid default null
)
returns table (
  cargo_clave   text,
  cargo_nombre  text,
  grupo_clave   text,
  grupo_nombre  text,
  kit_id        uuid,
  kit_nombre    text,
  n_elementos   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(k.cargo, e.clave) as cargo_clave,
         ec.nombre                    as cargo_nombre,
         ec.grupo                     as grupo_clave,
         g.nombre                     as grupo_nombre,
         k.id,
         k.nombre,
         (select count(*)::integer from epp_kit_items i where i.kit_id = k.id) as n_elementos
    from epp_kits k
    join epp_especialidades e  on e.id = k.especialidad_id
    join epp_especialidades ec on ec.clave = coalesce(k.cargo, e.clave)
    left join epp_grupos g     on g.clave = ec.grupo
   where k.activo
     and (p_cargo is null or coalesce(k.cargo, e.clave) = p_cargo)
     and (p_grupo is null or ec.grupo = p_grupo)
     and (p_especialidad_id is null or k.especialidad_id = p_especialidad_id)
   order by g.orden nulls last, ec.nombre, k.nombre
$$;

-- -------------------------------------------------------------------
-- CREAR O MOVER GRUPOS Y CARGOS
-- -------------------------------------------------------------------
-- Mover un cargo de grupo NO cambia la clave del cargo, y por eso no se
-- rompe nada de lo que ya está guardado: los trabajadores, los kits y las
-- charlas siguen apuntando a la misma clave.
create or replace function public.gestionar_grupo(
  p_clave  text default null,
  p_nombre text default null,
  p_orden  integer default null,
  p_activo boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text;
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('grupos.gestionar'))) then
    raise exception 'No tienes permiso para gestionar los grupos'
      using errcode = '42501';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El grupo necesita un nombre' using errcode = '22023';
  end if;

  if p_clave is null or btrim(p_clave) = '' then
    -- El orden importa: primero minúsculas, después sin tildes, después
    -- lo que no sea letra o número. Al revés, la mayúscula inicial no está
    -- todavía en [a-z0-9] y se vuelve guion: "Obra" daría "-bra".
    v_clave := btrim(regexp_replace(
      translate(lower(btrim(p_nombre)), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn'),
      '[^a-z0-9]+', '-', 'g'), '-');
  else
    v_clave := btrim(lower(btrim(p_clave)), '-');
  end if;

  if v_clave = '' then
    raise exception 'Ese nombre no deja ninguna clave utilizable' using errcode = '22023';
  end if;

  insert into epp_grupos (clave, nombre, orden, activo)
  values (v_clave, btrim(p_nombre), coalesce(p_orden, 100), coalesce(p_activo, true))
  on conflict (clave) do update
    set nombre = excluded.nombre,
        orden  = excluded.orden,
        activo = excluded.activo;

  return v_clave;
end;
$$;

-- -------------------------------------------------------------------
-- MOVER UN CARGO DE GRUPO
-- -------------------------------------------------------------------
create or replace function public.mover_cargo_de_grupo(p_cargo_clave text, p_grupo_clave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('grupos.gestionar'))) then
    raise exception 'No tienes permiso para mover los cargos de grupo'
      using errcode = '42501';
  end if;

  if p_grupo_clave is not null
     and not exists (select 1 from epp_grupos where clave = p_grupo_clave) then
    raise exception 'Ese grupo no existe' using errcode = '22023';
  end if;

  update epp_especialidades set grupo = p_grupo_clave where clave = p_cargo_clave;
  if not found then
    raise exception 'Ese cargo no existe' using errcode = '22023';
  end if;
end;
$$;

-- -------------------------------------------------------------------
-- ASIGNAR EL CARGO DE UN KIT
-- -------------------------------------------------------------------
create or replace function public.asignar_cargo_kit(p_kit_id uuid, p_cargo_clave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('kits.cargo'))) then
    raise exception 'No tienes permiso para cambiar el cargo de los kits'
      using errcode = '42501';
  end if;

  if p_cargo_clave is not null
     and not exists (select 1 from epp_especialidades where clave = p_cargo_clave) then
    raise exception 'Ese cargo no existe' using errcode = '22023';
  end if;

  update epp_kits set cargo = p_cargo_clave where id = p_kit_id;
  if not found then
    raise exception 'Ese kit no existe' using errcode = '22023';
  end if;
end;
$$;

-- -------------------------------------------------------------------
-- LEER LAS CHARLAS Y DOCUMENTOS DESTINADOS A UNO
-- -------------------------------------------------------------------
-- Por grupo, por cargo, o a todos. Es la misma pregunta en tres
--aplazamientos, y la respuesta siempre trae las tres cosas juntas: si
-- pidiera solo los títulos, el formulario tendría que pedir el grupo por
-- un lado y los cargos por otro y cruzarlos en el navegador.
create or replace function public.destinatarios_de_grupo(p_grupo text)
returns table (
  destino      text,
  clave        text,
  nombre       text,
  n_papeles    integer
)
language sql
stable
security definer
set search_path = public
as $$
  select 'grupo', g.clave, g.nombre,
         (select count(*)::integer from plantillas_contratacion p
           where p.vigente and p.grupo_clave = g.clave)
    from epp_grupos g
   where g.activo and g.clave = p_grupo
$$;

-- -------------------------------------------------------------------
-- A QUIÉN LE TOCA CADA PAPEL, AHORA CON EL GRUPO
-- -------------------------------------------------------------------
-- Es la 032 con una condición más. Antes:
--     (p.especialidad_clave is null or p.especialidad_clave = t.especialidad_clave)
-- Ahora, además del cargo, el grupo del cargo de la persona.
--
-- POR QUÉ ESTA DEBAJO HAY UN DROP Y NO UN "OR REPLACE"
-- -----------------------------------------------------
-- "create or replace" puede cambiar el cuerpo de una función pero NO lo que
-- devuelve. Agregar una columna al resultado es cambiar lo que devuelve, y
-- Postgres lo rechaza con "cannot change return type of existing function".
--
-- Por eso se tira la vieja y se crea la nueva. No queda nada sin puerta en
-- medio porque las dos van en la misma migración: si una falla, no se aplica
-- ninguna.
drop function if exists public.kit_de_un_trabajador(text);

create or replace function public.kit_de_un_trabajador(p_code text)
returns table (
  plantilla_id uuid,
  plantilla_code text,
  plantilla_nombre text,
  tipo text,
  especialidad_clave text,
  grupo_clave text,
  version int,
  orden int,
  firmas text,
  estado text,
  entrega_id uuid,
  firmado_trabajador_at timestamptz,
  firmado_supervisor_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.code, p.nombre, p.tipo, p.especialidad_clave, p.grupo_clave,
    p.version, p.orden,
    coalesce(p.firmas, 'trabajador'),
    coalesce(e.estado, ''),
    e.id,
    e.firmado_trabajador_at,
    e.firmado_supervisor_at
  from plantillas_contratacion p
  left join entregas_contratacion e
    on e.plantilla_id = p.id
   and e.trabajador_code = p_code
   and e.estado <> 'anulada'
  join trabajadores t on t.code = p_code
  left join epp_especialidades ec on ec.clave = t.especialidad_clave
  where p.vigente
    and (
      -- para todos
      (p.grupo_clave is null and p.especialidad_clave is null)
      -- la charla es de su cargo
      or p.especialidad_clave = t.especialidad_clave
      -- la charla es del grupo de su cargo
      or p.grupo_clave = ec.grupo
    )
  order by p.orden, p.nombre
$$;

-- -------------------------------------------------------------------
-- DIAGNÓSTICO
-- -------------------------------------------------------------------
create or replace function public.diagnostico_grupos()
returns table (
  existe_grupos     boolean,
  rls_grupos        boolean,
  col_grupo_en_cargo boolean,
  col_cargo_en_kit  boolean,
  col_grupo_en_charla boolean,
  col_grupo_en_documento boolean,
  cargos            integer,
  cargos_sin_grupo  integer,
  grupos            integer,
  plantillas_por_grupo integer,
  documentos_por_grupo integer
)
language sql
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='epp_grupos'),
    coalesce((select relrowsecurity from pg_class
               where oid = 'public.epp_grupos'::regclass), false),
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='epp_especialidades'
               and column_name='grupo'),
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='epp_kits'
               and column_name='cargo'),
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='plantillas_contratacion'
               and column_name='grupo_clave'),
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='documentos_catalogo'
               and column_name='grupo_clave'),
    (select count(*)::integer from epp_especialidades),
    (select count(*)::integer from epp_especialidades where grupo is null),
    (select count(*)::integer from epp_grupos),
    (select count(*)::integer from plantillas_contratacion where grupo_clave is not null),
    (select count(*)::integer from documentos_catalogo where grupo_clave is not null)
$$;

grant execute on function public.jerarquia_cargos(integer,boolean) to authenticated;
grant execute on function public.cargos_por_grupo(text,integer,boolean) to authenticated;
grant execute on function public.grupo_de_cargo(text) to authenticated;
grant execute on function public.kits_por_cargo(text,text,uuid) to authenticated;
grant execute on function public.gestionar_grupo(text,text,integer,boolean) to authenticated;
grant execute on function public.mover_cargo_de_grupo(text,text) to authenticated;
grant execute on function public.asignar_cargo_kit(uuid,text) to authenticated;
grant execute on function public.destinatarios_de_grupo(text) to authenticated;
grant execute on function public.kit_de_un_trabajador(text) to authenticated;
grant execute on function public.diagnostico_grupos() to authenticated;
