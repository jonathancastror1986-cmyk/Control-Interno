-- ===================================================================
-- REMUNERACIONES: QUE PASO, Y COMO SE COMPRUEBA
-- ===================================================================
--
-- ESTO NO ES UNA MIGRACION. ESTA SEPARADO A PROPOSITO.
--
-- El panel de Supabase corre todo lo que se pega en una sola transaccion. Si la migracion
-- termina con un "select" y ese select falla, se revierte TODO, incluidas las funciones que
-- se habian creado mas arriba.
--
-- Asi se perdio la 078: el "select" fallo con 42703 porque decia "nombre" en vez de "name", y
-- las dos "create or replace function" desaparecieron con el.
--
-- Por eso: primero la migracion, y en otra pestana esto.
--


-- ===================================================================
-- 4) QUE PASO, EN UN PANEL
-- ===================================================================

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'remuneraciones'
 order by ordinal_position;

-- -- Y LAS POLITICAS, QUE SON LAS QUE DICEN SI ESTO ESTA AISLADO O NO
select policyname, cmd, qual is not null as tiene_using, with_check is not null as tiene_check
  from pg_policies
 where schemaname = 'public' and tablename = 'remuneraciones'
 order by policyname;
