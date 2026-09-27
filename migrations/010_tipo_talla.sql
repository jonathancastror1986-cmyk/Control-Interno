-- ============================================================
-- Migración 010: tipo de talla por elemento + calzado chileno
-- ============================================================
-- Cada elemento del catálogo declara QUÉ escala de talla usa, para
-- que al entregar solo se ofrezcan las tallas que corresponden:
--   · ZAPA-001 Zapatos de seguridad  -> calzado chileno 35 a 45
--   · GEO-0B-XL Geólogo XL Obra     -> ropa S, M, L, XL, XXL
--   · CASCO-001 Casco de seguridad   -> no usa talla
--
-- Corrige además la 009, que dejó el calzado de 3 a 15 (sistema
-- americano) en vez del chileno que se usa en Chile (35 a 45).
--
-- ES RE-EJECUTABLE. Orden: 001 -> 008 -> 009 -> 010.
-- ============================================================

-- ------------------------------------------------------------
-- 1) TIPO DE TALLA POR ELEMENTO DEL CATÁLOGO
-- ------------------------------------------------------------
alter table epp_catalogo add column if not exists tipo_talla text;

-- DROP CONSTRAINT no existe como sentencia suelta: va dentro de ALTER TABLE.
alter table epp_catalogo
  drop constraint if exists epp_catalogo_tipo_talla_check;

alter table epp_catalogo
  add constraint epp_catalogo_tipo_talla_check
  check (tipo_talla is null or tipo_talla in ('calzado','ropa','general'));

-- Calzado: botas y zapatos de seguridad
update epp_catalogo set tipo_talla = 'calzado' where codigo in ('ZAPA-001','ZAPA-002');

-- Ropa y vestimenta de la obra
update epp_catalogo set tipo_talla = 'ropa' where codigo in (
  'GAFAS-001','GUAN-001','GUAN-003','CHAL-001','CHAL-002','ARNES-001',
  'FALD-001','CINT-001','ROPA-001'
);

-- Prendas de protección sin talla, pero con medida única
update epp_catalogo set tipo_talla = 'general' where codigo in (
  'LENT-001','LENT-002','GAFAS-002','GUAN-002','MASC-001','PROT-001','CUBO-001'
);

-- Cualquier elemento que ya usa talla y quedó sin clasificar
update epp_catalogo set tipo_talla = 'ropa'
 where tipo_talla is null and (requiere_talla or coalesce(codigo,'') like 'GEO%');

create index if not exists epp_catalogo_tipo_talla_idx on epp_catalogo(tipo_talla);

-- ------------------------------------------------------------
-- 2) TALLAS: calzado chileno 35 a 45 con medias tallas
-- ------------------------------------------------------------
-- Las filas de calzado se rehacen: la 009 dejó 3 a 15.
-- Nada referencia epp_tallas por llave foránea (epp_entrega_items.talla
-- es texto libre), así que se pueden borrar sin riesgo.
delete from epp_tallas where tipo = 'calzado';

insert into epp_tallas (talla, tipo, orden) values
  ('35',   'calzado',  1), ('35,5', 'calzado',  2), ('36',   'calzado',  3),
  ('36,5', 'calzado',  4), ('37',   'calzado',  5), ('37,5', 'calzado',  6),
  ('38',   'calzado',  7), ('38,5', 'calzado',  8), ('39',   'calzado',  9),
  ('39,5', 'calzado', 10), ('40',   'calzado', 11), ('40,5', 'calzado', 12),
  ('41',   'calzado', 13), ('41,5', 'calzado', 14), ('42',   'calzado', 15),
  ('42,5', 'calzado', 16), ('43',   'calzado', 17), ('43,5', 'calzado', 18),
  ('44',   'calzado', 19), ('44,5', 'calzado', 20), ('45',   'calzado', 21)
on conflict (talla) do update set tipo = excluded.tipo, orden = excluded.orden;

-- Ropa: XS a XXXL, Única y sin talla
delete from epp_tallas where tipo in ('ropa','general');

insert into epp_tallas (talla, tipo, orden) values
  ('XS',    'ropa', 1), ('S',   'ropa', 2), ('M',     'ropa', 3),
  ('L',     'ropa', 4), ('XL',  'ropa', 5), ('XXL',   'ropa', 6),
  ('XXXL',  'ropa', 7),
  ('Única', 'general', 1), ('—', 'general', 2)
on conflict (talla) do update set tipo = excluded.tipo, orden = excluded.orden;

-- ------------------------------------------------------------
-- 3) KITS POR CARGO: el catálogo ya trae tipo_talla, nada que hacer.
--    (el formulario lee epp_catalogo.tipo_talla al armar la fila)
-- ------------------------------------------------------------
