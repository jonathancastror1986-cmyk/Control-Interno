-- ============================================================
-- Migración 019: invitaciones desde la app y perfiles de trabajadores
-- ============================================================
-- El problema que resuelve:
--
-- Hoy para dar de alta a alguien hay que ir al panel de Supabase
-- (Authentication > Users > Invite user). Ese envío produce un enlace
-- que vuelve a la "Site URL" configurada en Supabase, que suele ser
-- localhost, así que el enlace le llega a la persona apuntando a una
-- dirección que no existe: "ERR_CONNECTION_REFUSED". Peor todavía, la
-- persona invitada no tiene forma de completar sus datos: hay que
-- adivinar su nombre y buscarlo a mano en Soporte -> Usuarios para
-- poder asignarle un rol.
--
-- La solución NO es guardar la service_role en el navegador (eso le
-- daría control total de la base a cualquiera que abra la app). Se
-- hace al revés:
--
--   1. Un administrador crea la INVITACIÓN desde la app: correo, rol
--      o roles, empresa y, si corresponde, la ficha del trabajador.
--      Queda en la tabla "invitaciones", en estado pendiente.
--   2. Se le comparte a la persona el enlace a pages/registro.html.
--   3. Ahí ella se registra con su correo y su contraseña. Eso usa
--      auth.signUp, que sí funciona con la anon key.
--   4. El trigger handle_new_user la reconoce por el correo, le crea
--      el perfil con los roles, la empresa y la ficha que le asignó el
--      administrador, y marca la invitación como aceptada.
--   5. La app la manda a completar sus datos de perfil.
--
-- En otras palabras: el alta y los permisos se deciden DENTRO de la
-- app, y la persona solo elige su contraseña.
--
-- Además, "perfiles.trabajador_code" hasta ahora solo ofrecía fichas
-- de supervisores, porque el único uso que tenía era acotar la vista
-- de supervisores. Se amplía a cualquier trabajador: un maestro, un
-- bodeguero o alguien de planta puede tener su propia cuenta, y desde
-- ahí ver su asistencia y su ficha.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 018 -> 019.
-- ============================================================

-- ------------------------------------------------------------
-- 0) FUNCIONES AUXILIARES (self-contained: no dependen de la 014)
-- ------------------------------------------------------------
-- Por qué security definer: una política que consulta "perfiles" desde
-- otra política de "perfiles" se llama a sí misma y Postgres la corta
-- con "infinite recursion detected in policy". Como casi todas las
-- políticas del proyecto necesitan preguntar si el usuario está
-- activo, la pregunta se hace desde una función que corre con los
-- privilegios del dueño (que sí ignora RLS).
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

-- El correo del que está conectado, para poder reconocer la
-- invitación sin abrirle la tabla a todo el mundo.
create or replace function public.mi_correo()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt()->>'email',''))
$$;

-- ------------------------------------------------------------
-- 1) INVITACIONES
-- ------------------------------------------------------------
-- Una fila por persona invitada. Es el "pendiente" del alta: guarda
-- qué roles y a qué empresa se le van a dar al registrarse, para que
-- el alta sea automática y no haya que hacerlo a mano después.
create table if not exists invitaciones (
  id uuid primary key default gen_random_uuid(),
  correo text not null,
  nombre text,                             -- nombre que verá al entrar
  roles text[] not null default '{}',      -- roles que se le asignarán
  empresa_id int references empresa(id) on delete set null,
  trabajador_code text references trabajadores(code) on delete set null,
  notas text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aceptada','cancelada')),
  creado_por uuid references perfiles(id) on delete set null,
  creado_por_nombre text,
  user_id uuid references perfiles(id) on delete set null,  -- se llena al aceptar
  expira_at timestamptz,
  aceptada_at timestamptz,
  created_at timestamptz not null default now()
);

-- Se busca siempre por correo en minúsculas: escribir "Jonathan@" o
-- "jhonathan@" tiene que encontrar la misma invitación.
create index if not exists invitaciones_correo_idx on invitaciones (lower(correo));
create index if not exists invitaciones_estado_idx on invitaciones (estado, created_at desc);
-- Un correo no puede tener dos invitaciones pendientes: si se pierde
-- el enlace, se genera otra en vez de acumular invitaciones.
create unique index if not exists invitaciones_correo_unico
  on invitaciones (lower(correo))
  where estado = 'pendiente';

-- ------------------------------------------------------------
-- 2) DATOS DE PERFIL
-- ------------------------------------------------------------
-- "perfil_completo" sirve para distinguir a quien ya tiene sus datos
-- cargados de quien todavía tiene que llenarlos. No se usa para
-- autorizar nada: los permisos son los roles, y siempre los decide un
-- administrador. Es solo para saber a quién mandar a la pantalla de
-- "completa tus datos".
--
-- Nace en false, y los usuarios que YA están usando el sistema se
-- marcan true: si no, todos tendrían que volver a llenar su perfil.
alter table perfiles add column if not exists telefono text;
alter table perfiles add column if not exists perfil_completo boolean not null default false;

update perfiles set perfil_completo = true where perfil_completo = false;

-- ------------------------------------------------------------
-- 3) EL ALTA AUTOMÁTICA BUSCA LA INVITACIÓN
-- ------------------------------------------------------------
-- Reemplaza el trigger de la 016. Ahora, en vez de nace inactivo y
-- sin roles siempre, primero mira si hay una invitación pendiente para
-- ese correo: si la hay, aplica lo que el administrador decidió.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_inv public.invitaciones%rowtype;
  v_rol text;
begin
  select * into v_inv
    from public.invitaciones i
   where lower(i.correo) = lower(coalesce(new.email, ''))
     and i.estado = 'pendiente'
     and (i.expira_at is null or i.expira_at > now())
   order by i.created_at desc
   limit 1;

  if found then
    -- El rol principal para la columna vieja "perfiles.rol". Se
    -- descartan los roles que no existan en el catálogo, para que una
    -- invitación con un rol mal escrito no tumbe el alta.
    select min(r) into v_rol
      from unnest(v_inv.roles) r
     where r is not null and btrim(r) <> ''
       and exists (select 1 from public.roles_sistema rs where rs.rol = r);
    if v_rol is null then v_rol := 'oficina'; end if;

    insert into public.perfiles (id, nombre, rol, activo, trabajador_code, perfil_completo)
    values (new.id,
            coalesce(nullif(btrim(v_inv.nombre), ''), new.email),
            v_rol,
            true,
            v_inv.trabajador_code,
            false)
    on conflict (id) do nothing;

    insert into public.perfil_roles (user_id, rol)
    select new.id, r
      from unnest(v_inv.roles) r
     where r is not null and btrim(r) <> ''
       and exists (select 1 from public.roles_sistema rs where rs.rol = r)
    on conflict (user_id, rol) do nothing;

    if v_inv.empresa_id is not null then
      insert into public.perfil_empresas (user_id, empresa_id)
      values (new.id, v_inv.empresa_id)
      on conflict (user_id, empresa_id) do nothing;
    end if;

    update public.invitaciones
       set estado = 'aceptada',
           user_id = new.id,
           aceptada_at = now()
     where id = v_inv.id;
  else
    -- Sin invitación: nace inactivo y sin roles, como antes. No se le
    -- regala ningún permiso a quien se registre por su cuenta.
    insert into public.perfiles (id, nombre, rol, activo, perfil_completo)
    values (new.id,
            coalesce(new.raw_user_meta_data->>'full_name', new.email),
            'oficina',
            false,
            false)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 4) LA PERSONA COMPLETA SUS DATOS
-- ------------------------------------------------------------
-- Es una función y no una política "cada quien edita su perfil" a
-- propósito: con esa política, cualquier usuario podría hacer
--   update perfiles set rol = 'admin', activo = true where id = <el suyo>
-- y ascender solo. Esta función solo puede tocar el nombre, el
-- teléfono y la marca de "completo"; los roles quedan fuera de
-- alcance para siempre.
create or replace function public.completar_mi_perfil(nuevo_nombre text, nuevo_telefono text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
  v_actual text;
begin
  if v_id is null then
    raise exception 'No hay sesión activa.';
  end if;

  select nombre into v_actual from public.perfiles where id = v_id;
  if v_actual is null then
    raise exception 'Tu perfil todavía no existe. Recarga la página e inténtalo de nuevo.';
  end if;

  update public.perfiles
     set nombre = coalesce(nullif(btrim(nuevo_nombre), ''), nombre),
         telefono = coalesce(nullif(btrim(nuevo_telefono), ''), telefono),
         perfil_completo = true
   where id = v_id;

  -- El teléfono también se anota en la ficha del trabajador, para que
  -- no quede en dos lugares distintos. Solo si la ficha existe: un
  -- usuario de oficina no tiene por qué tener ficha.
  update public.trabajadores t
     set phone = coalesce(nullif(btrim(nuevo_telefono), ''), t.phone)
   where t.code = (select trabajador_code from public.perfiles where id = v_id)
     and t.code is not null;

  return 'ok';
end;
$$;

-- La invitación pendiente del correo conectado, para que la pantalla
-- de registro pueda avisar "tienes una invitación" antes de pedir la
-- contraseña. Solo devuelve lo necesario: nada de roles ni de notas.
create or replace function public.mi_invitacion_pendiente()
returns table (nombre text, expira_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.nombre, i.expira_at
    from public.invitaciones i
   where lower(i.correo) = public.mi_correo()
     and i.estado = 'pendiente'
     and (i.expira_at is null or i.expira_at > now())
   order by i.created_at desc
   limit 1
$$;

-- ------------------------------------------------------------
-- 5) ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table invitaciones enable row level security;

-- Solo un administrador gestiona invitaciones.
drop policy if exists "invitaciones admin" on invitaciones;
create policy "invitaciones admin" on invitaciones for all
  using      (public.es_admin())
  with check (public.es_admin());

-- La persona invitada puede ver la SUYA, para saber que tiene una
-- invitación pendiente. Solo la suya: por el correo, no por el id.
drop policy if exists "invitaciones propias" on invitaciones;
create policy "invitaciones propias" on invitaciones for select
  using (lower(correo) = public.mi_correo() and estado = 'pendiente');

-- ------------------------------------------------------------
-- 6) COMPROBACIÓN DE SALUD
-- ------------------------------------------------------------
-- Si la 019 no está aplicada, la app lo dice con este mensaje en vez
-- de fallar en silencio con "relation invitaciones does not exist".
create or replace function public.diagnostico_invitaciones()
returns table (
  tabla_ok boolean,
  Trigger_ok boolean,
  pendientes int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'invitaciones'),
    exists (select 1 from pg_trigger
             where tgname = 'on_auth_user_created' and not tgisinternal),
    (select count(*) from public.invitaciones where estado = 'pendiente')
$$;
