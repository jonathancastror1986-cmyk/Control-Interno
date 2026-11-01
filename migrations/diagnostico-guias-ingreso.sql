-- diagnostico: guías de ingreso y ajustes (102). SOLO LECTURA.
select to_regclass('public.guias_ingreso') as guias, to_regclass('public.guia_lineas') as lineas;

-- Deben salir los 4 permisos
select clave from public.permisos
 where clave in ('bodega.guias.ver','bodega.guias.registrar','bodega.guias.anular','bodega.stock.ajustar');

-- prosecdef = true y proconfig con search_path en las 3 funciones y las 2 de archivo
select proname, prosecdef, proconfig from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('registrar_guia','anular_guia','ajustar_stock','puede_ver_archivo_guia','puede_subir_archivo_guia');

-- anon_ejecuta debe ser false en todas
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_ejecuta
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('registrar_guia','anular_guia','ajustar_stock');

-- 4 triggers de inmutabilidad
select tgname from pg_trigger
 where tgrelid in ('public.guias_ingreso'::regclass, 'public.guia_lineas'::regclass) and not tgisinternal;

-- El bucket existe y es privado (public = false)
select id, public from storage.buckets where id = 'guias-ingreso';

-- Guías vigentes cuyo ingreso no cuadra con el libro (debe salir vacío)
select g.id, g.numero, l.epp_codigo, l.cantidad,
       coalesce((select sum(m.cantidad) from public.stock_movimientos m
                  where m.referencia_tipo = 'guia_ingreso' and m.referencia_id = g.id::text
                    and m.epp_codigo = l.epp_codigo and m.talla_norm = coalesce(l.talla, '')), 0) as en_libro
  from public.guias_ingreso g
  join public.guia_lineas l on l.guia_id = g.id
 where g.estado = 'registrada'
   and l.cantidad <> coalesce((select sum(m.cantidad) from public.stock_movimientos m
                  where m.referencia_tipo = 'guia_ingreso' and m.referencia_id = g.id::text
                    and m.epp_codigo = l.epp_codigo and m.talla_norm = coalesce(l.talla, '')), 0);
