-- Diagnóstico de la 103 (motor de aprobación). Solo lectura.
select (select count(*) from tipos_aprobables) as tipos,                                   -- 8
       (select count(*) from permisos where clave in ('aprobaciones.configurar','aprobaciones.historial')) as permisos,  -- 2
       (select count(*) from pg_trigger where tgname like 'aprob_%') as triggers,          -- 4
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('iniciar_aprobacion','decidir_paso','anular_aprobacion','pendientes_para_mi')
           and has_function_privilege('anon', p.oid, 'execute')) as ejecutables_por_anon;  -- 0

-- ROLLBACK (solo si aún no hay trámites; copiar y ejecutar a mano):
--   drop function if exists public.pendientes_para_mi();
--   drop function if exists public.anular_aprobacion(uuid,text);
--   drop function if exists public.decidir_paso(uuid,int,text,text);
--   drop function if exists public.iniciar_aprobacion(text,text);
--   drop function if exists public._aprob_puede_decidir(uuid,uuid);
--   drop function if exists public._aprob_resolver_doc(text,text);
--   drop table if exists public.aprobaciones_decisiones, public.aprobaciones_documento, public.empresa_flujo_pasos, public.empresa_flujos, public.tipos_aprobables cascade;
--   drop function if exists public._aprob_ve_empresa(int,uuid);
--   drop function if exists public._aprob_solo_avanzar();
--   drop function if exists public._aprob_inmutable();
--   delete from public.roles_permisos where permiso in ('aprobaciones.configurar','aprobaciones.historial');
--   delete from public.permisos where clave in ('aprobaciones.configurar','aprobaciones.historial');
