-- Diagnóstico de SOLO LECTURA: comprueba que la migración 096 quedó aplicada.
-- Cada fila debe decir 'ok'.
select 'check firma_metodo acepta manual' as prueba,
       case when exists (select 1 from pg_constraint where conname = 'epp_entregas_firma_metodo_check'
                          and pg_get_constraintdef(oid) like '%manual%') then 'ok' else 'FALTA' end as resultado
union all
select 'columnas respaldo en ' || t,
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = t
                     and column_name in ('folio','firma_estado','respaldo_path','respaldo_sha256','respaldo_subido_por','respaldo_subido_at')) = 6
            then 'ok' else 'FALTA' end
from unnest(array['epp_entregas','herramientas_asignaciones']) t
union all
select 'funcion ' || f, case when exists (select 1 from pg_proc where proname = f) then 'ok' else 'FALTA' end
from unnest(array['registrar_entrega_manual','subir_respaldo_firma','guardia_firma_manual']) f
union all
select 'rls historial', case when (select relrowsecurity from pg_class where oid = 'public.respaldos_firma_historial'::regclass) then 'ok' else 'FALTA' end;
