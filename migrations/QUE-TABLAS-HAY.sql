-- QUÉ TABLAS HAY DE VERDAD
--
-- Una sola consulta. El editor solo muestra el último resultado, así que todo
-- tiene que caber en un panel.
--
-- "perfiles_existe" debería dar true. Si da false, la tabla de usuarios no está
-- y eso rompe el sistema de permisos entero, no solo la 046.
--
-- "tablas_de_usuario" dice cómo se llama realmente, si es que existe con otro
-- nombre. Y "cuantas_tablas" da la cantidad: si son pocas, faltan migraciones
-- de una vez y conviene saber cuáles antes de seguir.
select
  (select count(*)::int from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE')      as cuantas_tablas,
  (select count(*) > 0 from information_schema.tables
     where table_schema = 'public' and table_name = 'perfiles')        as perfiles_existe,
  (select coalesce(string_agg(table_name, ', '), 'ninguna')
     from information_schema.tables
     where table_schema = 'public'
       and (table_name like '%perfil%' or table_name like '%profile%'
            or table_name like '%usuario%' or table_name like '%rol%')) as tablas_de_usuario,
  (select coalesce(string_agg(proname, ', '), 'ninguna')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and proname in ('es_usuario_activo', 'es_admin', 'tiene_permiso'))  as funciones_de_permiso;
