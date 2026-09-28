-- ============================================================
-- Migración 021: altas y verificaciones de cuenta sin correo
-- ============================================================
-- El problema que viene resuelto:
--
-- Crear cuentas mandando un correo por persona se topa con el límite del
-- proveedor de correo de Supabase. El plan gratuito permite unos pocos
-- por hora; el siguiente responde "email rate limit exceeded" y la
-- cuenta queda creada pero SIN verificar, con lo cual esa persona no
-- puede iniciar sesión ("Email not confirmed"). Para una obra con
-- treinta personas eso no es un detalle, es un bloqueo.
--
-- Esta migración no arregla el envío (eso no está en la base: lo
-- arregla la Edge Function "verificar-cuenta"). Lo que guarda es la
-- PRUEBA: quién verificó qué cuenta, cuándo y con qué resultado. Sin
-- eso, "dar de alta a alguien" sería un acto invisible: nadie podría
-- después responder por qué una cuenta quedó activa sin que nadie la
-- comprobara, y en un sistema donde la asistencia es el dato que se
-- discute, eso no puede quedar en el aire.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 020 -> 021.
-- ============================================================

-- ------------------------------------------------------------
-- 1) QUÉ SE HIZO CON CADA CUENTA
-- ------------------------------------------------------------
-- "accion" dice qué se hizo, no solo que se hizo algo:
--   verificada     → la cuenta existía y se marcó el correo como
--                    confirmado, para que pueda entrar sin correo
--   creada         → no existía; se creó ya verificada, con clave
--                    provisional, sin mandar ningún correo
--   clave_reiniciada → se le puso una clave nueva a una cuenta que
--                    existía (la persona no tiene el correo o no
--                    recuerda su clave)
--
-- "resultado" es 'ok' o el texto del error. Se guardan también los
-- fallidos: si un día no se puede dar de alta a alguien, tiene que
-- quedar escrito por qué.
create table if not exists cuentas_altas (
  id uuid primary key default gen_random_uuid(),
  correo text not null,
  user_id uuid references perfiles(id) on delete set null,
  accion text not null check (accion in ('verificada','creada','clave_reiniciada')),
  resultado text not null default 'ok',
  detalle text,
  hecho_por uuid references perfiles(id) on delete set null,
  hecho_por_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists cuentas_altas_correo_idx
  on cuentas_altas (correo);
create index if not exists cuentas_altas_fecha_idx
  on cuentas_altas (created_at desc);

-- ------------------------------------------------------------
-- 2) ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Es autocontenida: se vuelven a crear las funciones que usa, como
-- hicieron la 016 y la 020, para que la 021 no dependa de que esas
-- estén aplicadas.
-- Por qué security definer: una política que consulta "perfiles" desde
-- otra política de "perfiles" se llama a sí misma y Postgres la corta
-- con "infinite recursion detected in policy".
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

alter table cuentas_altas enable row level security;

-- Ver el historial de altas lo puede cualquiera con la sesión activa:
-- sirve para que RRHH responda "¿quién dio de alta a esta persona?".
drop policy if exists "cuentas altas read" on cuentas_altas;
create policy "cuentas altas read" on cuentas_altas for select
  using (public.es_usuario_activo());

-- Registrar un alta requiere el mismo permiso que invitar usuarios, que
-- es el que ya controla la pantalla. La Edge Function escribe con la
-- service_role y no pasa por acá, pero la política queda para que un
-- alta hecha por otra vía tampoco quede libre.
drop policy if exists "cuentas altas write" on cuentas_altas;
create policy "cuentas altas write" on cuentas_altas for insert
  with check (public.tiene_permiso('sistema.usuarios') or public.es_admin());

-- Ni borrar ni modificar: el historial es un registro de lo que pasó, no
-- un borrador. Si algo quedó mal, se escribe otro renglón.
drop policy if exists "cuentas altas update" on cuentas_altas;
create policy "cuentas altas update" on cuentas_altas for update
  using (false);

drop policy if exists "cuentas altas delete" on cuentas_altas;
create policy "cuentas altas delete" on cuentas_altas for delete
  using (false);

-- ------------------------------------------------------------
-- 3) COMPROBACIÓN DE SALUD
-- ------------------------------------------------------------
-- Si la 021 no está aplicada, la app lo dice con este mensaje en vez de
-- fallar en silencio con "relation cuentas_altas does not exist".
create or replace function public.diagnostico_altas_cuentas()
returns table (
  tabla_ok boolean,
  columna_accion_ok boolean,
  politicas_ok boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'cuentas_altas'),
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'cuentas_altas'
               and column_name = 'accion'),
    exists (select 1 from pg_policies
             where tablename = 'cuentas_altas' and policyname = 'cuentas altas write')
$$;
