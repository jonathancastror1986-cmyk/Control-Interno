-- ============================================================
-- Migración 013: roles múltiples, permisos por vista y solicitudes
--                de cambio de estado en la asistencia
-- ============================================================
-- Antes cada usuario tenía UN rol (perfiles.rol) y no había control
-- de qué podía ver ni hacer: quien entraba veía todos los menús y
-- podía cambiar cualquier estado de la tarja.
--
-- Ahora:
--   · un usuario puede tener VARIOS roles
--   · cada rol tiene un conjunto de permisos editables (ver tarja,
--     modificar tarja, entregar EPP, gestionar usuarios…)
--   · los supervisores y técnica no cambian la tarja directamente:
--     SISENTAN un cambio (F -> P) y RRHH lo aprueba o rechaza
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 012 -> 013.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ROLES DEL SISTEMA
-- ------------------------------------------------------------
create table if not exists roles_sistema (
  rol text primary key,
  nombre text not null,
  descripcion text,
  orden int not null default 0
);
insert into roles_sistema (rol, nombre, descripcion, orden) values
  ('admin',        'Administración',  'Acceso total al sistema', 1),
  ('rrhh',         'RRHH',            'Recursos humanos: edita la tarja y aprueba solicitudes', 2),
  ('oficina',      'Oficina',         'Ingresos,/licenses y remuneraciones', 3),
  ('porteria',     'Portería',        'Control de acceso y consulta de trabajadores', 4),
  ('supervisores', 'Supervisores',    'Equipos, tarja de su gente y solicitudes de cambio', 5),
  ('tecnica',      'Técnica',         'Soporte técnico en terreno: ve la tarja y solicita cambios', 6),
  ('bodega',       'Bodega',          'EPP, kits, herramientas y etiquetas QR', 7),
  ('prevencion',   'Prevención',      'Alertas e indicaciones de prevención', 8)
on conflict (rol) do nothing;

-- ------------------------------------------------------------
-- 2) VARIOS ROLES POR USUARIO
-- ------------------------------------------------------------
create table if not exists perfil_roles (
  user_id uuid not null references perfiles(id) on delete cascade,
  rol text not null references roles_sistema(rol) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, rol)
);
-- el rol único que ya tenía cada usuario pasa a la tabla nueva
insert into perfil_roles (user_id, rol)
select p.id, p.rol
  from perfiles p
  join roles_sistema r on r.rol = p.rol
 where p.rol is not null
on conflict (user_id, rol) do nothing;

-- ------------------------------------------------------------
-- 3) CATÁLOGO DE PERMISOS
-- ------------------------------------------------------------
-- clave "area.accion": 'tarja.ver' = ver, 'tarja.editar' = modificar.
create table if not exists permisos (
  clave text primary key,
  descripcion text not null,
  categoria text not null,
  orden int not null default 0
);

insert into permisos (clave, descripcion, categoria, orden) values
  -- asistencia
  ('tarja.ver',              'Ver la tarja mensual',                    'asistencia', 1),
  ('tarja.editar',           'Modificar estados de la tarja',            'asistencia', 2),
  ('tarja.marcaje',          'Registrar marcaje manual',                 'asistencia', 3),
  ('tarja.justificar',       'Justificar inasistencias, permisos y licencias', 'asistencia', 4),
  ('tarja.excel',            'Cargar asistencia desde Excel',            'asistencia', 5),
  ('tarja.exportar',         'Exportar remuneraciones',                  'asistencia', 6),
  ('tarja.solicitar_cambio', 'Solicitar cambios de estado (queda pendiente de RRHH)', 'asistencia', 7),
  ('tarja.aprobar_cambio',   'Aprobar o rechazar solicitudes de cambio', 'asistencia', 8),
  -- portería / trabajadores
  ('porteria.ver',           'Consultar fichas en portería',              'general', 9),
  ('trabajadores.ver',       'Ver el listado de trabajadores',           'general', 10),
  ('trabajadores.editar',    'Crear y editar trabajadores',              'general', 11),
  ('trabajadores.tarjeta',   'Emitir e imprimir tarjetas',               'general', 12),
  -- bodega
  ('bodega.epp.entregar',     'Registrar entregas de EPP',                'bodega', 13),
  ('bodega.epp.historial',   'Ver el historial de EPP',                  'bodega', 14),
  ('bodega.epp.catalogo',    'Administrar el catálogo de EPP',            'bodega', 15),
  ('bodega.kits',            'Crear y asignar kits por especialidad',    'bodega', 16),
  ('bodega.herramientas',    'Catálogo y asignación de herramientas',    'bodega', 17),
  ('bodega.qr',              'Emitir e imprimir etiquetas QR',           'bodega', 18),
  -- social y prevención
  ('social.ver',             'Alertas e indicaciones de asistente social', 'social', 19),
  ('prevencion.ver',         'Alertas e indicaciones de prevención',      'prevencion', 20),
  ('prevencion.subcontrato', 'Ingresar trabajadores de subcontrato',     'prevencion', 21),
  -- sistema
  ('sistema.usuarios',       'Gestionar usuarios y sus roles',           'sistema', 22),
  ('sistema.permisos',       'Configurar los permisos de cada rol',      'sistema', 23),
  ('sistema.empresa',        'Editar los datos de la empresa',           'sistema', 24)
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- 4) PERMISOS POR ROL (valores iniciales, editables en pantalla)
-- ------------------------------------------------------------
create table if not exists roles_permisos (
  rol text not null references roles_sistema(rol) on delete cascade,
  permiso text not null references permisos(clave) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rol, permiso)
);

-- admin ve y puede hacer todo
insert into roles_permisos (rol, permiso)
select 'admin', clave from permisos
on conflict do nothing;

-- RRHH: edita la tarja, justifica y aprueba solicitudes
insert into roles_permisos (rol, permiso) values
  ('rrhh','tarja.ver'),('rrhh','tarja.editar'),('rrhh','tarja.marcaje'),
  ('rrhh','tarja.justificar'),('rrhh','tarja.excel'),('rrhh','tarja.exportar'),
  ('rrhh','tarja.aprobar_cambio'),('rrhh','tarja.solicitar_cambio'),
  ('rrhh','porteria.ver'),('rrhh','trabajadores.ver'),('rrhh','trabajadores.editar'),
  ('rrhh','trabajadores.tarjeta'),('rrhh','social.ver'),('rrhh','prevencion.ver')
on conflict do nothing;

-- Oficina: ingresos y/licenses
insert into roles_permisos (rol, permiso) values
  ('oficina','tarja.ver'),('oficina','tarja.editar'),('oficina','tarja.justificar'),
  ('oficina','tarja.excel'),('oficina','tarja.exportar'),
  ('oficina','porteria.ver'),('oficina','trabajadores.ver'),
  ('oficina','trabajadores.editar'),('oficina','trabajadores.tarjeta'),
  ('oficina','social.ver'),('oficina','prevencion.ver')
on conflict do nothing;

-- Portería: consultar fichas y ver la tarja
insert into roles_permisos (rol, permiso) values
  ('porteria','tarja.ver'),('porteria','porteria.ver'),('porteria','trabajadores.ver')
on conflict do nothing;

-- Supervisores: ven la tarja, gestionan su gente y SOLICITAN cambios
insert into roles_permisos (rol, permiso) values
  ('supervisores','tarja.ver'),('supervisores','tarja.solicitar_cambio'),
  ('supervisores','tarja.marcaje'),
  ('supervisores','porteria.ver'),('supervisores','trabajadores.ver'),
  ('supervisores','trabajadores.editar'),('supervisores','trabajadores.tarjeta'),
  ('supervisores','social.ver'),('supervisores','prevencion.ver')
on conflict do nothing;

-- Técnica: ve la tarja y solicita cambios (no edita)
insert into roles_permisos (rol, permiso) values
  ('tecnica','tarja.ver'),('tecnica','tarja.solicitar_cambio'),
  ('tecnica','porteria.ver'),('tecnica','trabajadores.ver'),
  ('tecnica','trabajadores.tarjeta'),('tecnica','prevencion.ver')
on conflict do nothing;

-- Bodega
insert into roles_permisos (rol, permiso) values
  ('bodega','tarja.ver'),
  ('bodega','bodega.epp.entregar'),('bodega','bodega.epp.historial'),
  ('bodega','bodega.epp.catalogo'),('bodega','bodega.kits'),
  ('bodega','bodega.herramientas'),('bodega','bodega.qr'),
  ('bodega','trabajadores.ver'),('bodega','porteria.ver')
on conflict do nothing;

-- Prevención
insert into roles_permisos (rol, permiso) values
  ('prevencion','tarja.ver'),('prevencion','prevencion.ver'),
  ('prevencion','prevencion.subcontrato'),
  ('prevencion','porteria.ver'),('prevencion','trabajadores.ver')
on conflict do nothing;

-- ------------------------------------------------------------
-- 5) SOLICITUDES DE CAMBIO DE ESTADO
-- ------------------------------------------------------------
-- Un supervisor o técnico pide "cambiar F por P"; RRHH aprueba.
-- Solo al aprobar se modifica la asistencia, y queda registro de
-- quién pidió, quién resolvió y qué estados había antes y después.
create table if not exists solicitudes_cambio_asistencia (
  id uuid primary key default gen_random_uuid(),
  code text not null references trabajadores(code) on delete cascade,
  fecha date not null,
  estado_actual text,                  -- estado que tenía al solicitar
  estado_solicitado text not null check (estado_solicitado in ('X','F','P','L','A','PP','V','LL')),
  motivo text not null,
  nota text,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  solicitado_por uuid references perfiles(id) on delete set null,
  solicitado_por_nombre text,
  solicitado_por_rol text,
  resuelto_por uuid references perfiles(id) on delete set null,
  resuelto_por_nombre text,
  comentario_resolucion text,
  resuelto_at timestamptz,
  aplicado boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists solicitudes_cambio_estado_idx on solicitudes_cambio_asistencia(estado);
create index if not exists solicitudes_cambio_fecha_idx on solicitudes_cambio_asistencia(fecha desc);

-- ------------------------------------------------------------
-- 6) ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table roles_sistema enable row level security;
alter table perfil_roles enable row level security;
alter table permisos enable row level security;
alter table roles_permisos enable row level security;
alter table solicitudes_cambio_asistencia enable row level security;

-- ------------------------------------------------------------
-- 6) POLÍTICAS
-- ------------------------------------------------------------
-- Catálogos (roles y permisos): los lee cualquier usuario activo.
drop policy if exists "roles sistema read" on roles_sistema;
create policy "roles sistema read" on roles_sistema for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "permisos read" on permisos;
create policy "permisos read" on permisos for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

-- perfil_roles: todos leen, solo quien administra usuarios escribe.
-- Se controla con perfiles.rol (admin) para no meter perfil_roles
-- dentro de su propia política, que sería recursivo.
drop policy if exists "perfil roles read" on perfil_roles;
create policy "perfil roles read" on perfil_roles for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "perfil roles write" on perfil_roles;
create policy "perfil roles write" on perfil_roles for all
  using      (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.rol = 'admin'))
  with check (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.rol = 'admin'));

-- roles_permisos: idem, solo admin lo configura.
drop policy if exists "roles permisos read" on roles_permisos;
create policy "roles permisos read" on roles_permisos for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "roles permisos write" on roles_permisos;
create policy "roles permisos write" on roles_permisos for all
  using      (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.rol = 'admin'))
  with check (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.rol = 'admin'));

-- Solicitudes de cambio:
--   · cualquier usuario activo puede CREAR una (el permiso fino
--     'tarja.solicitar_cambio' se valida en la interfaz)
--   · solo admin o rrhh resuelven (aprobar/rechazar)
drop policy if exists "solicitudes read" on solicitudes_cambio_asistencia;
create policy "solicitudes read" on solicitudes_cambio_asistencia for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "solicitudes insert" on solicitudes_cambio_asistencia;
create policy "solicitudes insert" on solicitudes_cambio_asistencia for insert
  with check (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "solicitudes update" on solicitudes_cambio_asistencia;
create policy "solicitudes update" on solicitudes_cambio_asistencia for update
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.rol in ('admin','rrhh')))
  with check (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo and p.rol in ('admin','rrhh')));
