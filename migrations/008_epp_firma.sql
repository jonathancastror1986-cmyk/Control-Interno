-- ============================================================
-- Migración 008: Entrega de EPP con catálogo, detalle por ítem y firma
-- ============================================================
-- La entrega de EPP pasa de un campo de texto libre a un formulario con:
--   · catálogo de EPP precargado (epp_catalogo) con código de elemento
--   · una fila por ítem entregado (epp_entrega_items): detalle, talla, cantidad
--     (así una entrega puede ser "casco talla M + guantes talla L x2")
--   · firma del trabajador en un canvas, con la ubicación geográfica (GPS)
--     del dispositivo al momento de firmar, y el respaldo en PDF
--
-- Las firmas y los PDF viven en el bucket privado "epp-respaldos";
-- en la tabla solo se guarda la ruta del objeto.
-- ============================================================

-- ------------------------------------------------------------
-- 1) CATÁLOGO DE EPP (elementos que se pueden entregar)
-- ------------------------------------------------------------
create table if not exists epp_catalogo (
  codigo text primary key,               -- CASCO-001, LENT-001, ...
  nombre text not null,
  detalle text,                          -- descripción / especificación
  requiere_talla boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tallas habituales para calzado, ropa y guantes
insert into epp_catalogo (codigo, nombre, detalle, requiere_talla) values
  ('CASCO-001', 'Casco de seguridad', 'Casco con barbiquejo y arnés de 4 puntos', false),
  ('CASCO-002', 'Casco con luces', 'Casco de seguridad con linterna frontal', false),
  ('LENT-001', 'Lentes de seguridad', 'Lentes claros antiventaje', false),
  ('LENT-002', 'Lentes de seguridad dark', 'Lentes oscuros para trabajo en exterior', false),
  ('GAFAS-001', 'Gafas de seguridad', 'Gafas con montura y lentes claros', true),
  ('GAFAS-002', 'Gafas de seguridad regulables', 'Gafas de seguridad con patillas regulables', false),
  ('GUAN-001', 'Guantes de cuero', 'Guantes de cuero de cowhide', true),
  ('GUAN-002', 'Guantes de nitrilo', 'Guantes de nitrilo desechables', false),
  ('GUAN-003', 'Guantes anticorte', 'Guantes anticorte nivel 5', true),
  ('ZAPA-001', 'Zapatos de seguridad', 'Zapato de seguridad con puntera de acero', true),
  ('ZAPA-002', 'Botas de jebe', 'Botas de jebe con puntera de acero', true),
  ('CHAL-001', 'Chaleco reflectante', 'Chaleco de alta visibilidad con bandas reflectantes', true),
  ('CHAL-002', 'Chaleco de señalización', 'Chaleco tipo Constructor (clase 2)', true),
  ('ARNES-001', 'Arnés de seguridad', 'Arnés de cuerpo completo para trabajo en altura', true),
  ('MASC-001', 'Mascarilla', 'Mascarilla de protección respiratoria', false),
  ('PROT-001', 'Protector auditivo', 'Protector auditivo tipo orejeras', false),
  ('FALD-001', 'Faldón de protección', 'Faldón para trabajo en altura', true),
  ('CINT-001', 'Cinturón de seguridad', 'Cinturón de seguridad con línea de vida', true),
  ('ROPA-001', 'Traje impermeable', 'Traje impermeable para condiciones de lluvia', true),
  ('CUBO-001', 'Cubo con tapa', 'Cubo para acarre de material', false)
on conflict (codigo) do nothing;

-- ------------------------------------------------------------
-- 2) ÍTEMS POR ENTREGA (detalle, talla y cantidad de cada elemento)
-- ------------------------------------------------------------
create table if not exists epp_entrega_items (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references epp_entregas(id) on delete cascade,
  epp_codigo text references epp_catalogo(codigo) on delete set null,
  nombre text not null,                  -- copia del nombre al momento de entregar
  detalle text,
  talla text,
  cantidad int not null default 1 check (cantidad > 0),
  created_at timestamptz not null default now()
);
create index if not exists epp_entrega_items_entrega_idx on epp_entrega_items(entrega_id);

-- ------------------------------------------------------------
-- 3) columns de firma y geolocalización sobre epp_entregas
-- ------------------------------------------------------------
alter table epp_entregas add column if not exists firma_url text;          -- ruta en el bucket
alter table epp_entregas add column if not exists firma_at timestamptz;     -- momento de la firma
alter table epp_entregas add column if not exists firma_lat double precision;
alter table epp_entregas add column if not exists firma_lng double precision;
alter table epp_entregas add column if not exists firma_precision_m double precision;
alter table epp_entregas add column if not exists firma_metodo text check (firma_metodo in ('canvas'));
alter table epp_entregas add column if not exists observacion text;

-- "detalle" pasa a ser un resumen generado a partir de los ítems, para
-- poder seguir buscando en la lista sin recorrer epp_entrega_items.
create index if not exists epp_entregas_code_fecha_idx on epp_entregas(code, fecha desc);

-- ------------------------------------------------------------
-- 4) HERRAMIENTAS: los datos ya existían en el esquema pero sin
--    copia del nombre/precio, así el historial depended del catálogo.
-- ------------------------------------------------------------
alter table herramientas_asignaciones add column if not exists herramienta_nombre text;
alter table herramientas_asignaciones add column if not exists fecha_devolucion date;
alter table herramientas_catalogo add column if not exists activo boolean not null default true;
create index if not exists herramientas_asignaciones_code_idx on herramientas_asignaciones(code);

-- ------------------------------------------------------------
-- 5) BUCKET PRIVADO para firmas y respaldos PDF
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('epp-respaldos', 'epp-respaldos', false)
on conflict (id) do nothing;

drop policy if exists "epp respaldos rw" on storage.objects;
create policy "epp respaldos rw" on storage.objects for all
  using (bucket_id = 'epp-respaldos' and exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

-- ------------------------------------------------------------
-- 6) ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table epp_catalogo enable row level security;
alter table epp_entrega_items enable row level security;

drop policy if exists "epp catalogo rw" on epp_catalogo;
create policy "epp catalogo rw" on epp_catalogo for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "epp items rw" on epp_entrega_items;
create policy "epp items rw" on epp_entrega_items for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
