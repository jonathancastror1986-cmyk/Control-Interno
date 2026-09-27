-- ============================================================
-- Migración 009: QR por unidad de herramienta, códigos de
-- herramienta, entrega inicial por cargo y tallas chilenas
-- ============================================================
-- Sigue el mismo patrón que la migración 007 (tarjetas): cada
-- unidad física lleva un QR con un id propio, para poder saber
-- QUIÉN la tiene, y anularla si se pierde o se devuelve.
--
-- ES RE-EJECUTABLE: todo lleva "if not exists" / "on conflict" /
-- "drop policy if exists", así que si una corrida anterior falló a
-- medias puedes volver a correr este archivo completo sin romper nada.
-- Correr en este orden: 001 -> 008 -> 009.
-- ============================================================

-- ------------------------------------------------------------
-- 1) HERRAMIENTAS: código por tipo de herramienta
-- ------------------------------------------------------------
alter table herramientas_catalogo add column if not exists codigo text;

-- Código para las herramientas que ya existen en la tabla.
-- row_number() es una función de ventana y Postgres no la acepta
-- dentro del SET de un UPDATE (error 42P20): hay que calcularla
-- primero en un CTE y después unir.
with numerados as (
  select id,
         'HER-' || lpad((row_number() over (order by nombre))::text, 3, '0') as codigo_nuevo
    from herramientas_catalogo
   where codigo is null or codigo = ''
)
update herramientas_catalogo h
   set codigo = n.codigo_nuevo
  from numerados n
 where h.id = n.id;

create unique index if not exists herramientas_catalogo_codigo_idx
  on herramientas_catalogo(codigo) where codigo is not null;

-- ------------------------------------------------------------
-- 2) QR POR UNIDAD FÍSICA (herramientas y materiales)
-- ------------------------------------------------------------
-- Una fila por unidad, NO por tipo: tres taladros iguales son tres
-- filas con tres QR distintos. Así se puede escanear la herramienta
-- en obra y ver quién la tiene, y anular la etiqueta si se pierde.
--
-- herramienta_id: solo en herramientas (varias unidades pueden
--   apuntar al mismo tipo del catálogo).
-- epp_codigo: solo en materiales/EPP del catálogo.
create table if not exists inventario_qr (
  id text primary key,               -- valor codificado en el QR de la etiqueta
  tipo text not null check (tipo in ('herramienta','epp')),
  herramienta_id uuid references herramientas_catalogo(id) on delete cascade,
  epp_codigo text references epp_catalogo(codigo) on delete set null,
  nombre text not null,              -- copia del nombre al emitir la etiqueta
  precio numeric(12,0),              -- valor de reposición (herramientas)
  estado text not null default 'activa' check (estado in ('activa','anulada')),
  motivo_anulacion text,
  created_at timestamptz not null default now(),
  -- exactamente un destino según el tipo
  constraint inventario_qr_destino check (
    (tipo = 'herramienta' and herramienta_id is not null and epp_codigo is null) or
    (tipo = 'epp'         and herramienta_id is null     and epp_codigo is not null)
  )
);
-- Varias unidades del MISMO tipo pueden estar activas a la vez
-- (tres taladros iguales = tres etiquetas activas). Por eso acá va un
-- índice normal, no único: lo que hace única a la unidad es su id.
-- El índice único anterior impedía emitir la segunda unidad del tipo.
drop index if exists inventario_qr_herramienta_activa_idx;
create index if not exists inventario_qr_herramienta_estado_idx
  on inventario_qr(herramienta_id, estado);
create index if not exists inventario_qr_tipo_estado_idx on inventario_qr(tipo, estado);

-- ------------------------------------------------------------
-- 3) ASIGNACIONES: Which unidad se asignó (su QR) y el código
-- ------------------------------------------------------------
alter table herramientas_asignaciones add column if not exists inventario_qr_id text references inventario_qr(id) on delete set null;
alter table herramientas_asignaciones add column if not exists herramienta_codigo text;  -- copia del código

create index if not exists herramientas_asignaciones_qr_idx on herramientas_asignaciones(inventario_qr_id);

-- ------------------------------------------------------------
-- 4) ENTREGA INICIAL POR CARGO
-- ------------------------------------------------------------
-- es_entrega_inicial: en la ingreso a la obra el trabajador recibe
-- el kit completo de su oficio. Las entregas siguientes son
-- recambios (cambio de talla, desgaste, pérdida).
-- cargo: copia del cargo del trabajador al momento de la entrega,
-- para que el historial no cambie si después lo actualizan.
alter table epp_entregas add column if not exists es_entrega_inicial boolean not null default false;
alter table epp_entregas add column if not exists cargo text;

-- Qué EPP lleva cada oficio, para sugerir el kit completo
create table if not exists epp_kits_cargo (
  cargo text not null,               -- se compara sin tildes y en minúsculas
  epp_codigo text not null references epp_catalogo(codigo) on delete cascade,
  cantidad int not null default 1 check (cantidad > 0),
  orden int not null default 0,
  primary key (cargo, epp_codigo)
);
create index if not exists epp_kits_cargo_idx on epp_kits_cargo(cargo);

insert into epp_kits_cargo (cargo, epp_codigo, cantidad, orden) values
  ('albañil',     'CASCO-001', 1, 1),
  ('albañil',     'GAFAS-001', 1, 2),
  ('albañil',     'GUAN-001', 1, 3),
  ('albañil',     'ZAPA-001', 1, 4),
  ('albañil',     'CHAL-001', 1, 5),
  ('carpintero',  'CASCO-001', 1, 1),
  ('carpintero',  'GAFAS-001', 1, 2),
  ('carpintero',  'GUAN-001', 1, 3),
  ('carpintero',  'ZAPA-001', 1, 4),
  ('carpintero',  'PROT-001', 1, 5),
  ('pintor',      'CASCO-001', 1, 1),
  ('pintor',      'GAFAS-001', 1, 2),
  ('pintor',      'GUAN-002', 1, 3),
  ('pintor',      'ZAPA-001', 1, 4),
  ('pintor',      'ROPA-001', 1, 5),
  ('pintor',      'MASC-001', 1, 6),
  ('soldador',    'CASCO-001', 1, 1),
  ('soldador',    'LENT-001', 1, 2),
  ('soldador',    'GUAN-003', 1, 3),
  ('soldador',    'ZAPA-002', 1, 4),
  ('soldador',    'CHAL-002', 1, 5),
  ('maestro de obra', 'CASCO-001', 1, 1),
  ('maestro de obra', 'GAFAS-001', 1, 2),
  ('maestro de obra', 'GUAN-001', 1, 3),
  ('maestro de obra', 'ZAPA-001', 1, 4),
  ('maestro de obra', 'CHAL-001', 1, 5),
  ('electricista', 'CASCO-001', 1, 1),
  ('electricista', 'LENT-001', 1, 2),
  ('electricista', 'GUAN-001', 1, 3),
  ('electricista', 'ZAPA-002', 1, 4),
  ('electricista', 'PROT-001', 1, 5),
  ('operador de maquinaria', 'CASCO-002', 1, 1),
  ('operador de maquinaria', 'GAFAS-001', 1, 2),
  ('operador de maquinaria', 'PROT-001', 1, 3),
  ('operador de maquinaria', 'ZAPA-001', 1, 4),
  ('operador de maquinaria', 'CHAL-001', 1, 5),
  ('topografo',   'CASCO-001', 1, 1),
  ('topografo',   'GAFAS-001', 1, 2),
  ('topografo',   'GUAN-002', 1, 3),
  ('topografo',   'ZAPA-001', 1, 4),
  ('topografo',   'ROPA-001', 1, 5),
  ('trabajo en altura', 'CASCO-001', 1, 1),
  ('trabajo en altura', 'ARNES-001', 1, 2),
  ('trabajo en altura', 'CINT-001', 1, 3),
  ('trabajo en altura', 'FALD-001', 1, 4),
  ('trabajo en altura', 'GUAN-001', 1, 5),
  ('trabajo en altura', 'ZAPA-001', 1, 6),
  ('almacenista', 'CASCO-001', 1, 1),
  ('almacenista', 'GAFAS-001', 1, 2),
  ('almacenista', 'GUAN-001', 1, 3),
  ('almacenista', 'ZAPA-001', 1, 4),
  ('almacenista', 'CUBO-001', 1, 5)
on conflict (cargo, epp_codigo) do nothing;

-- ------------------------------------------------------------
-- 5) TALLAS: chilenas para calzado, más ropa y general
-- ------------------------------------------------------------
create table if not exists epp_tallas (
  talla text primary key,
  tipo text not null check (tipo in ('calzado','ropa','general')),
  orden int not null default 0
);

insert into epp_tallas (talla, tipo, orden) values
  ('3',    'calzado', 1),  ('3,5',  'calzado', 2),  ('4',    'calzado', 3),
  ('4,5',  'calzado', 4),  ('5',    'calzado', 5),  ('5,5',  'calzado', 6),
  ('6',    'calzado', 7),  ('6,5',  'calzado', 8),  ('7',    'calzado', 9),
  ('7,5',  'calzado', 10), ('8',    'calzado', 11), ('8,5',  'calzado', 12),
  ('9',    'calzado', 13), ('9,5',  'calzado', 14), ('10',   'calzado', 15),
  ('10,5', 'calzado', 16), ('11',   'calzado', 17), ('11,5', 'calzado', 18),
  ('12',   'calzado', 19), ('12,5', 'calzado', 20), ('13',   'calzado', 21),
  ('13,5', 'calzado', 22), ('14',   'calzado', 23), ('14,5', 'calzado', 24),
  ('15',   'calzado', 25),
  ('XS',   'ropa', 1),    ('S',    'ropa', 2),    ('M',    'ropa', 3),
  ('L',    'ropa', 4),    ('XL',   'ropa', 5),    ('XXL',  'ropa', 6),
  ('XXXL', 'ropa', 7),
  ('Única','general', 1), ('—',    'general', 2)
on conflict (talla) do nothing;

-- ------------------------------------------------------------
-- 6) ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table inventario_qr enable row level security;
alter table epp_kits_cargo enable row level security;
alter table epp_tallas enable row level security;

drop policy if exists "inventario qr rw" on inventario_qr;
create policy "inventario qr rw" on inventario_qr for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "epp kits rw" on epp_kits_cargo;
create policy "epp kits rw" on epp_kits_cargo for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

drop policy if exists "epp tallas rw" on epp_tallas;
create policy "epp tallas rw" on epp_tallas for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
