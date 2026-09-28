-- ============================================================
-- Migración 023: bitácora de acceso y avisos de ingreso
-- ============================================================
-- Son dos cosas distintas que se piden juntas, y por eso van en la misma
-- migración:
--
--  1) BITÁCORA DE ENTRADA Y SALADA AL SISTEMA
--
--     La asistencia dice si el TRABAJADOR entró a la obra. Esto es otra
--     cosa: quién abrió la aplicación, cuándo y cuánto tiempo estuvo.
--     Se mezcla con la asistencia y después nadie sabe si "09:12" fue
--     que fichó o que el supervisor abrió el sistema a mirar.
--
--  2) AVISO DE INGRESO QUE HAY QUE CONFIRMAR
--
--     Cuando un supervisor marca a un trabajador que no había fichado,
--     hay que dejar constancia de que alguien lo autorizó. Un simple
--     "quedó como X" en la planilla no dice quién lo decidió. Y la
--     indicación tiene que CONFIRMARSE: no basta con escribirla, alguien
--     tiene que dejar constancia de que la vio. Por eso el aviso tiene estado y
--     no es un registro más de la planilla.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 022 -> 023.
-- ============================================================

-- ------------------------------------------------------------
-- 1) BITÁCORA DE ACCESO
-- ------------------------------------------------------------
-- "evento" distingue tres cosas que antes se mezclaban:
--   entrada     → alguien abrió sesión
--   salida      → alguien la cerró con "Cerrar sesión"
--   cierre      → se cortó sola (pestaña cerrada, red caída). Se sabe
--                 comparando el inicio con el siguiente acceso de esa
--                 misma persona: si el hueco es enorme, la sesión
--                 anterior se terminó sola.
--
-- "sesion_id" agrupa todos los registros de una misma sesión. Sin eso no
-- se puede saber cuándo terminó una sesión que se cerró sola, porque el
-- navegador no avisa en ese caso.
--
-- NO se guarda la IP a propósito: el navegador no la puede leer, y meterla
-- obligaría a pasar por una Edge Function. La dirección IP es un dato
-- personal más, y guardar el mínimo que sirve para el propósito es lo
-- correcto. Si más adelante hace falta, se agrega junto con la función
-- que la puede leer.
create table if not exists accesos_sistema (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references perfiles(id) on delete set null,
  correo text,
  nombre text,
  evento text not null check (evento in ('entrada','salida','cierre')),
  sesion_id uuid not null,
  duracion_segundos int,          -- cuánto duró, en las salidas
  dispositivo text,               -- navegador y sistema, del user-agent
  created_at timestamptz not null default now()
);
create index if not exists accesos_user_fecha on accesos_sistema(user_id, created_at desc);
create index if not exists accesos_sesion on accesos_sistema(sesion_id);
create index if not exists accesos_fecha on accesos_sistema(created_at desc);

-- ------------------------------------------------------------
-- 2) AVISO DE INGRESO, CON CONFIRMACIÓN
-- ------------------------------------------------------------
-- El recorrido, que es lo que define el diseño:
--
--   1. Un supervisor marca a un trabajador que no había fichado, y deja
--      escrita la indicación. Queda estado = 'enviado'.
--   2. Administración (o RRHH) lo VE en una bandeja, y confirma que lo
--      tomó. Queda estado = 'confirmado', con quién y cuándo.
--   3. El supervisor ve que fue confirmado.
--
-- Por qué el paso 2 no es opcional: si no, "lo confirmó" y "nadie lo leyó"
-- son la misma cosa, y un aviso sin confirmar es un aviso que se perdió.
-- Es la diferencia entre un registro y una bandeja de trabajo.
--
-- 'origen_registro' dice de dónde salió la marcación que el supervisor
-- hizo: normalmente la hora del reloj. Se guarda para que la conciliación
-- (marcajes contra asistencia) pueda mostrar el caso real y no solo el
-- "quedó presente".
create table if not exists avisos_ingreso (
  id uuid primary key default gen_random_uuid(),
  code text not null references trabajadores(code) on delete cascade,
  fecha date not null,
  -- Qué le pasó: entró tarde, no fichó ninguna de las dos, etc.
  tipo text not null default 'no_marco' check (tipo in ('no_marco','entrada_tarde','salida_temprana','otra')),
  -- Lo que escribió el supervisor. Va junto con la marcación que hizo, no
  -- en un campo aparte del parte: la indicación y el hecho van juntos.
  indicacion text not null,
  -- La hora que el reloj registró, si la había. Se copia acá para que el
  -- aviso se entienda solo, sin tener que ir a buscarla.
  hora_reloj time,
  origen_registro text,
  -- Quién hizo la marcación y lo avisó.
  enviado_por uuid references perfiles(id) on delete set null,
  enviado_por_nombre text,
  -- El estado del circuito. 'rechazado' existe porque a veces la marcación
  -- no correspondía y hay que poder dizer que no.
  estado text not null default 'enviado'
    check (estado in ('enviado','confirmado','rechazado')),
  confirmado_por uuid references perfiles(id) on delete set null,
  confirmado_por_nombre text,
  confirmado_at timestamptz,
  comentario text,                 -- lo que respondió quien confirmó
  created_at timestamptz not null default now()
);
create index if not exists avisos_ingreso_fecha on avisos_ingreso(fecha desc);
create index if not exists avisos_ingreso_pendientes on avisos_ingreso(estado) where estado = 'enviado';
create index if not exists avisos_ingreso_code on avisos_ingreso(code, fecha);

-- Un aviso por trabajador y día. Sin esto, si el supervisor reintenta se
-- acumulan duplicados del mismo hecho y la bandeja se llena de ruido.
create unique index if not exists avisos_ingreso_unico_dia
  on avisos_ingreso (code, fecha, tipo);

-- ------------------------------------------------------------
-- 3) ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Autocontenida: se vuelven a crear las funciones que usa, como hicieron
-- la 016, la 020 y la 021, para que la 023 no dependa de que esas estén.
-- Por qué security definer: una política que consulta "perfiles" desde
-- otra política de "perfiles" se llama a sí misma y Postgres la corta con
-- "infinite recursion detected in policy".
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

alter table accesos_sistema enable row level security;
alter table avisos_ingreso enable row level security;

-- --- BITÁCORA ---
-- Cada quien escribe su propia entrada y su propia salida, y no las de
-- otros. Con la misma función de la 019 para el perfil: así nadie se
-- mete registros ajenos desde el navegador.
--
-- Leerla sí es para cualquiera con la sesión activa, y acotado a la
-- propia empresa en el frontend. Es un registro de uso del sistema, no
-- un dato de negocio, y tiene que poder revisarlo un supervisor.
drop policy if exists "accesos own write" on accesos_sistema;
create policy "accesos own write" on accesos_sistema for insert
  with check (public.es_usuario_activo() and user_id = auth.uid());

drop policy if exists "accesos read" on accesos_sistema;
create policy "accesos read" on accesos_sistema for select
  using (public.es_usuario_activo());

-- La bitácora no se edita ni se borra. Un registro de "quién estuvo en
-- el sistema" que se puede reescribir no sirve para nada.
drop policy if exists "accesos no update" on accesos_sistema;
create policy "accesos no update" on accesos_sistema for update using (false);

drop policy if exists "accesos no delete" on accesos_sistema;
create policy "accesos no delete" on accesos_sistema for delete using (false);

-- --- AVISOS DE INGRESO ---
-- Escribir un aviso es una tarea de la asistencia diaria, así que se pide
-- el mismo permiso que marcar: el rol, no una lista aparte.
drop policy if exists "avisos ingreso write" on avisos_ingreso;
create policy "avisos ingreso write" on avisos_ingreso for insert
  with check (public.tiene_permiso('tarja.marcaje') or public.es_admin());

-- Confirmar es lo contrario: es una tarea de RRHH / administración. Por
-- eso NO usa "tarja.marcaje" — un supervisor que marca no puede confirmar
-- su propio aviso, porque eso sería dar por buena su propia indicación.
drop policy if exists "avisos ingreso confirmar" on avisos_ingreso;
create policy "avisos ingreso confirmar" on avisos_ingreso for update
  using (public.tiene_permiso('tarja.aprobar_cambio') or public.es_admin())
  with check (public.tiene_permiso('tarja.aprobar_cambio') or public.es_admin());

drop policy if exists "avisos ingreso read" on avisos_ingreso;
create policy "avisos ingreso read" on avisos_ingreso for select
  using (public.es_usuario_activo());

-- ------------------------------------------------------------
-- 4) COMPROBACIÓN DE SALUD
-- ------------------------------------------------------------
-- Para que la app diga el nombre del archivo en vez de fallar con
-- "relation accesos_sistema does not exist".
create or replace function public.diagnostico_registro_y_avisos()
returns table (
  accesos_ok boolean,
  avisos_ok boolean,
  politicas_ok boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'accesos_sistema'),
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'avisos_ingreso'),
    exists (select 1 from pg_policies
             where tablename = 'avisos_ingreso' and policyname = 'avisos ingreso confirmar')
$$;
