-- UNA sola consulta: por qué "relation profiles does not exist"
--
-- Va en un solo SELECT a propósito. El editor de SQL muestra el ÚLTIMO
-- resultado, así que con cinco consultas solo se ve una. Y la que importa es
-- esta.
--
-- Cada columna contesta una pregunta distinta:
--
--   perfiles_existe          la tabla está o no
--   funciones_046            cuántas de las seis están creadas
--   funciones_047            ídem para las de amonestaciones
--   cuerpos_046              cuántas de esas seis nombran "profiles"
--   con_prefijo              cuántas lo nombran "public.profiles"
--   sin_prefijo              cuántas lo nombran solo "profiles"
--   donde                    en qué funciones sale la palabra
--
-- Lo normal sería: perfiles_existe en true, funciones_046 en 6, y sin_prefijo
-- en 0 (porque la 046 nombra la tabla sin el "public.").
--
-- Si donde sale VACÍO, la palabra "profiles" no está en ninguna de esas
-- funciones, y el error venía de otro lado: habría que mirar la 046 completa
-- en tu base.
select
  (select count(*) > 0 from public.profiles)                                    as perfiles_existe,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'pedir_ingreso','aprobar_ingreso_pendiente','rechazar_ingreso_pendiente',
       'corregir_ingreso_pendiente','ver_ingresos_pendientes',
       'diagnostico_ingresos_pendientes'))                                      as funciones_046,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'registrar_amonestacion','archivar_amonestacion','ver_amonestaciones',
       'limite_amonestacion','diagnostico_amonestaciones'))                     as funciones_047,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc ~ 'perfiles')                       as cuerpos_046,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc ~ 'public\.perfiles')              as con_prefijo,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc ~ '[^.a-z_]perfiles')              as sin_prefijo,
  (select coalesce(string_agg(p.proname, ', '), 'ninguna')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~ 'perfiles')                       as donde;
