-- Diagnóstico de la 101 (solo lectura). Cada fila debe tener ok = true.
select 'tablas' as chequeo, count(*) = 5 as ok
  from information_schema.tables
 where table_schema = 'public' and table_name in
   ('pedido_folios','pedidos_materiales','pedido_lineas','pedido_historial','pedido_recepciones')
union all
select 'columna objetivo', count(*) = 1
  from information_schema.columns
 where table_schema = 'public' and table_name = 'stock_minimos' and column_name = 'objetivo'
union all
select 'funciones', count(*) = 5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in
   ('sugerir_pedido','crear_pedido','enviar_pedido','anular_pedido','recibir_pedido')
union all
select 'anon sin execute', not coalesce(bool_or(has_function_privilege('anon', p.oid, 'execute')), false)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in
   ('sugerir_pedido','crear_pedido','enviar_pedido','anular_pedido','recibir_pedido')
union all
select 'permisos', count(*) = 4 from public.permisos where clave like 'bodega.pedidos.%'
union all
select 'rls activa', count(*) = 5
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relrowsecurity and c.relname in
   ('pedido_folios','pedidos_materiales','pedido_lineas','pedido_historial','pedido_recepciones');
