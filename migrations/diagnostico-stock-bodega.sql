-- Diagnóstico de la 100 (solo lectura).

-- 1) Una bodega por defecto por empresa.
select e.id as empresa_id, count(b.id) as bodegas, count(*) filter (where b.es_defecto) as por_defecto
from public.empresa e left join public.bodegas b on b.empresa_id = e.id
group by e.id order by e.id;

-- 2) Permisos nuevos y roles que los llevan.
select p.clave, array_agg(rp.rol order by rp.rol) as roles
from public.permisos p left join public.roles_permisos rp on rp.permiso = p.clave
where p.clave like 'bodega.stock.%' group by p.clave order by p.clave;

-- 3) Triggers (libro inmutable y descuento al entregar).
select tgrelid::regclass as tabla, tgname from pg_trigger
where tgrelid in ('public.stock_movimientos'::regclass, 'public.epp_entrega_items'::regclass)
  and not tgisinternal order by 1, 2;

-- 4) RLS activo.
select relname, relrowsecurity from pg_class
where relname in ('bodegas','stock_minimos','stock_movimientos');

-- 5) Funciones: no deben tener EXECUTE para public ni anon.
select proname, proacl from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('registrar_ingreso_stock','cargar_stock_inicial','_stock_aplicar',
                  'stock_descontar_por_entrega','puede_ver_bodega');

-- 6) Saldos (desde el libro) y saldos negativos (deben ser 0 filas).
select * from public.stock_saldos order by bodega_id, epp_codigo, talla limit 50;
select * from public.stock_saldos where saldo < 0;

-- 7) Bodegas que ya descuentan stock.
select id, empresa_id, nombre, descuenta_stock from public.bodegas order by empresa_id;
