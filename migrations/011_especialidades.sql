-- ============================================================
-- Migración 011: especialidades y kits de EPP iniciales
-- ============================================================
-- Una "especialidad" es el oficio del trabajador (Albañil, Soldador,
-- Pintor…). Cada especialidad tiene un kit: la lista de EPP que se le
-- entrega completa cuando se contrata a alguien de ese oficio.
--
-- Antes el oficio vivía solo como texto dentro de epp_kits_cargo, lo
-- que impedía crear una especialidad sin elementos, guardarle una
-- descripción o desactivarla. Ahora la especialidad es una entidad.
--
-- ES RE-EJECUTABLE. Orden: 001 -> 008 -> 009 -> 010 -> 011.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ESPECIALIDADES
-- ------------------------------------------------------------
-- clave: sin tildes y en minúsculas, es la que se compara con el
--        cargo del trabajador ("Albañil" -> "albanil").
-- nombre: como se muestra en pantalla.
create table if not exists epp_especialidades (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  descripcion text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- Las 10 especialidades que ya/usaba la migración 009
insert into epp_especialidades (clave, nombre, descripcion) values
  ('albanil',                'Albañil',                'Trabajo de muros, cielos y hormigón'),
  ('carpintero',             'Carpintero',             'Fabricación e instalación de marcos y muebles'),
  ('pintor',                 'Pintor',                 'Preparación de superficie y aplicación de pinturas'),
  ('soldador',               'Soldador',               'Soldadura y corte con oxígeno'),
  ('maestro de obra',        'Maestro de obra',        'Coordinación y control de la obra'),
  ('electricista',           'Electricista',           'Instalaciones eléctricas y tableros'),
  ('operador de maquinaria', 'Operador de maquinaria', 'Retroexcavadora, niveladora, cargador y maquinaria pesada'),
  ('topografo',              'Topógrafo',              'Levantamiento de terreno y replanteo'),
  ('trabajo en altura',      'Trabajo en altura',      'Andamios, coveros y trabajos sobre altura'),
  ('almacenista',            'Almacenista',            'Bodega, despacho y control de materiales')
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- 2) LIGAR LOS KITS EXISTENTES A SU ESPECIALIDAD
-- ------------------------------------------------------------
alter table epp_kits_cargo add column if not exists especialidad_id uuid references epp_especialidades(id) on delete cascade;

-- normaliza los cargos que estaban con tilde para que casen con la clave
update epp_kits_cargo set cargo = 'albanil' where cargo = 'albañil';
update epp_kits_cargo set cargo = 'topografo' where cargo = 'topógrafo';

update epp_kits_cargo k
   set especialidad_id = e.id
  from epp_especialidades e
 where k.especialidad_id is null
   and k.cargo = e.clave;

-- cualquier kit huérfano (cargo sin especialidad) queda sin asignar
create index if not exists epp_kits_cargo_esp_idx on epp_kits_cargo(especialidad_id);

-- ------------------------------------------------------------
-- 3) TALLAS SUGERIDAS POR KIT
-- ------------------------------------------------------------
-- Para que al entregar el kit inicial venga con una talla propuesta
-- (por ejemplo "zapato 42" o "chaleco L") que el bodeguero ajusta.
alter table epp_kits_cargo add column if not exists talla_sugerida text;

update epp_kits_cargo k
   set talla_sugerida = 'Única'
 where k.talla_sugerida is null
   and exists (select 1 from epp_catalogo c where c.codigo = k.epp_codigo and c.tipo_talla = 'general');

-- ------------------------------------------------------------
-- 4) ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table epp_especialidades enable row level security;

drop policy if exists "epp especialidades rw" on epp_especialidades;
create policy "epp especialidades rw" on epp_especialidades for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
