-- ============================================================
-- Migración 012: varios kits por especialidad y entrega
--                parcial por ítem
-- ============================================================
-- Antes (011) cada especialidad tenía UN kit fijo. Ahora puede tener
-- varios, por ejemplo "Pintor A" (básico) y "Pintor B" (completo).
--
-- Además, cuando alguien ingresa se le ASIGNA un kit: queda una lista
-- de control con un estado por elemento (pendiente / entregado) para
-- poder entregar de a uno, de varios o de todos, en varias visitas.
--
-- ES RE-EJECUTABLE. Orden: 001 -> 008 -> 009 -> 010 -> 011 -> 012.
-- ============================================================

-- ------------------------------------------------------------
-- 1) KITS: varios por especialidad
-- ------------------------------------------------------------
create table if not exists epp_kits (
  id uuid primary key default gen_random_uuid(),
  especialidad_id uuid not null references epp_especialidades(id) on delete cascade,
  nombre text not null,              -- "Pintor A", "Pintor B"
  descripcion text,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists epp_kits_esp_idx on epp_kits(especialidad_id);
create unique index if not exists epp_kits_esp_nombre_idx
  on epp_kits(especialidad_id, lower(nombre));

create table if not exists epp_kit_items (
  kit_id uuid not null references epp_kits(id) on delete cascade,
  epp_codigo text not null references epp_catalogo(codigo) on delete cascade,
  cantidad int not null default 1 check (cantidad > 0),
  talla_sugerida text,
  orden int not null default 0,
  primary key (kit_id, epp_codigo)
);

-- ------------------------------------------------------------
-- 2) TRASLADAR LOS KITS PLANOS DE LA 009/011
--    (cargo + epp_codigo) -> un "Kit estándar" por especialidad
-- ------------------------------------------------------------
insert into epp_kits (especialidad_id, nombre, descripcion, orden)
select e.id, 'Kit estándar', 'Kit inicial por defecto', 0
  from epp_especialidades e
 where exists (select 1 from epp_kits_cargo k where k.cargo = e.clave)
   and not exists (
     select 1 from epp_kits k2
      where k2.especialidad_id = e.id and lower(k2.nombre) = 'kit estándar'
   );

insert into epp_kit_items (kit_id, epp_codigo, cantidad, talla_sugerida, orden)
select k.id, c.epp_codigo, c.cantidad, c.talla_sugerida, c.orden
  from epp_kits_cargo c
  join epp_especialidades e on e.clave = c.cargo
  join epp_kits k on k.especialidad_id = e.id and lower(k.nombre) = 'kit estándar'
on conflict (kit_id, epp_codigo) do nothing;

-- epp_kits_cargo queda como respaldo histórico; la app ya no lo usa.

-- ------------------------------------------------------------
-- 3) ASIGNACIÓN DE KIT A TRABAJADOR (control de entregas)
-- ------------------------------------------------------------
-- Se crea al ingresar alguien. Cada elemento queda "pendiente" y se
-- va marcando "entregado" a medida que se entregan (uno, varios o
-- todos, en distintas visitas).
create table if not exists epp_kit_asignaciones (
  id uuid primary key default gen_random_uuid(),
  code text not null references trabajadores(code) on delete cascade,
  especialidad_id uuid references epp_especialidades(id) on delete set null,
  kit_id uuid references epp_kits(id) on delete set null,
  especialidad_nombre text,          -- copia por si después cambian el kit
  kit_nombre text,
  fecha date not null default current_date,
  completado boolean not null default false,
  completado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists epp_kit_asignaciones_code_idx on epp_kit_asignaciones(code);
create index if not exists epp_kit_asignaciones_abiertas_idx
  on epp_kit_asignaciones(completado) where completado = false;

create table if not exists epp_kit_asignacion_items (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references epp_kit_asignaciones(id) on delete cascade,
  epp_codigo text references epp_catalogo(codigo) on delete set null,
  nombre text not null,              -- copia del nombre al asignar
  detalle text,
  talla text,
  cantidad int not null default 1 check (cantidad > 0),
  tipo_talla text,                   -- escala para el selector de talla
  estado text not null default 'pendiente' check (estado in ('pendiente','entregado')),
  entrega_id uuid references epp_entregas(id) on delete set null,
  entregado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists epp_kit_asignacion_items_idx
  on epp_kit_asignacion_items(asignacion_id);
create unique index if not exists epp_kit_asignacion_items_pendiente_idx
  on epp_kit_asignacion_items(asignacion_id, coalesce(epp_codigo, nombre))
  where estado = 'pendiente';

-- ------------------------------------------------------------
-- 4) ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table epp_kits enable row level security;
alter table epp_kit_items enable row level security;
alter table epp_kit_asignaciones enable row level security;
alter table epp_kit_asignacion_items enable row level security;

drop policy if exists "epp kits rw" on epp_kits;
create policy "epp kits rw" on epp_kits for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "epp kit items rw" on epp_kit_items;
create policy "epp kit items rw" on epp_kit_items for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "epp kit asignaciones rw" on epp_kit_asignaciones;
create policy "epp kit asignaciones rw" on epp_kit_asignaciones for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "epp kit asignacion items rw" on epp_kit_asignacion_items;
create policy "epp kit asignacion items rw" on epp_kit_asignacion_items for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
