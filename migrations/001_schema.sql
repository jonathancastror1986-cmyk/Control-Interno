-- ============================================================
-- Migración 001: esquema inicial de Control de Asistencia y Portería
-- Ejecutar en el SQL editor de Supabase (o vía supabase CLI: supabase db push)
-- ============================================================

-- 1) ROLES DE APLICACIÓN (no confundir con roles de Postgres)
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('admin','oficina','porteria','bodega','prevencion','rrhh')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) EMPRESA (nombre y logo para la tarjeta)
create table empresa (
  id int primary key default 1,
  nombre text,
  logo_url text,
  constraint solo_una_fila check (id = 1)
);

-- 3) TRABAJADORES
create table trabajadores (
  code text primary key,
  name text not null,
  cargo text,
  phone text,
  is_supervisor boolean not null default false,
  supervisor_code text references trabajadores(code),
  foto_casual_url text,
  foto_seguridad_url text,
  emerg_nombre text,
  emerg_telefono text,
  emerg_relacion text,
  salud_notas text,
  medicamentos text,
  precauciones text,
  alerta_social boolean not null default false,
  alerta_social_nota text,
  alerta_prevencion boolean not null default false,
  alerta_prevencion_nota text,
  status text not null default 'activo' check (status in ('activo','desvinculado')),
  fecha_desvinculacion date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) ASISTENCIA (una fila por trabajador/día)
create table asistencia (
  id uuid primary key default gen_random_uuid(),
  code text not null references trabajadores(code) on delete cascade,
  fecha date not null,
  estado text not null check (estado in ('X','F','P','L','A','PP','V')),
  -- X=Presente F=Falla P=Permiso L=Licencia A=Accidente Mutual PP=Permiso Pagado V=Vacaciones
  hora_llegada time,
  nota text,
  origen text default 'manual' check (origen in ('manual','importado','justificacion')),
  created_at timestamptz not null default now(),
  unique(code, fecha)
);

-- 5) FERIADOS Y DÍAS LABORABLES (override manual sobre el calendario base)
create table feriados_adicionales (
  fecha date primary key,
  descripcion text
);
create table dia_overrides (
  fecha date primary key,
  tipo text not null check (tipo in ('lab','fer'))
);

-- 6) EPP / MATERIALES
create table epp_entregas (
  id uuid primary key default gen_random_uuid(),
  code text not null references trabajadores(code) on delete cascade,
  fecha date not null,
  detalle text not null,
  pdf_url text,
  registrado_por uuid references perfiles(id),
  created_at timestamptz not null default now()
);

-- 7) HERRAMIENTAS
create table herramientas_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio numeric(12,0) not null
);
create table herramientas_asignaciones (
  id uuid primary key default gen_random_uuid(),
  code text not null references trabajadores(code) on delete cascade,
  herramienta_id uuid not null references herramientas_catalogo(id),
  precio numeric(12,0) not null,
  fecha date not null,
  devuelta boolean not null default false,
  fecha_devolucion date,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table trabajadores enable row level security;
alter table asistencia enable row level security;
alter table epp_entregas enable row level security;
alter table herramientas_catalogo enable row level security;
alter table herramientas_asignaciones enable row level security;
alter table feriados_adicionales enable row level security;
alter table dia_overrides enable row level security;
alter table perfiles enable row level security;
alter table empresa enable row level security;

create policy "usuarios activos leen trabajadores" on trabajadores for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
create policy "usuarios activos escriben trabajadores" on trabajadores for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

create policy "asistencia rw" on asistencia for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
create policy "epp rw" on epp_entregas for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
create policy "herramientas rw" on herramientas_catalogo for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
create policy "asignaciones rw" on herramientas_asignaciones for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
create policy "feriados rw" on feriados_adicionales for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
create policy "overrides rw" on dia_overrides for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
create policy "empresa rw" on empresa for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
create policy "perfiles self read" on perfiles for select
  using (auth.uid() = id or exists (select 1 from perfiles p where p.id = auth.uid() and p.rol='admin'));

-- ============================================================
-- LOGIN SOLO POR INVITACIÓN (sin autorregistro)
-- ============================================================
-- 1. Authentication > Providers > Email > desactivar "Allow new users to sign up".
-- 2. Crear usuarios solo desde el dashboard ("Invite user") o:
--    supabase.auth.admin.inviteUserByEmail('correo@empresa.cl')
-- 3. Tras aceptar la invitación, crear su fila en "perfiles" con su rol.
-- 4. El frontend (pages/login.html) solo tiene formulario de inicio de sesión,
--    nunca uno de registro.
