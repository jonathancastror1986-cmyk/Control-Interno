-- Diagnóstico de la 098 (firma manual de permiso_horario). Solo lectura.

-- 1) Columnas nuevas (deben salir 7)
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'permiso_horario'
   and column_name in ('firma_estado','folio','respaldo_path','respaldo_sha256',
                       'respaldo_subido_por','respaldo_subido_nombre','respaldo_subido_at');

-- 2) Checks (deben salir 3)
select conname from pg_constraint
 where conrelid = 'public.permiso_horario'::regclass
   and conname in ('permiso_horario_firma_estado_check','permiso_horario_sha256_check','permiso_horario_firmada_con_respaldo');

-- 3) Triggers (deben salir 2)
select tgname from pg_trigger
 where tgrelid = 'public.permiso_horario'::regclass
   and tgname in ('guardia_permiso_firma','guardia_permiso_firma_ins');

-- 4) Funciones y si anon puede ejecutarlas (anon_ejecuta debe ser false)
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_ejecuta
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('alcance_permiso_horario','registrar_permiso_manual','subir_respaldo_permiso');

-- 5) RLS del historial (debe salir true)
select relrowsecurity from pg_class where oid = 'public.respaldos_permiso_historial'::regclass;

-- 6) Permisos por estado de firma
select firma_estado, estado, count(*) from public.permiso_horario group by 1, 2 order by 1, 2;
