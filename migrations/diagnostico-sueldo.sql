-- ===================================================================
-- DIAGNÓSTICO DEL SUELDO BASE (solo lee, no cambia nada)
-- ===================================================================
--
-- CUÁNDO CORRERLO
-- ---------------
--
-- Después de aplicar la 069, y antes de tocar nada de la pantalla. Es una sola consulta que
-- devuelve UN veredicto en una fila, más el detalle de qué falta si falta algo.
--
-- ---------------------------------------------------------------------
-- POR QUÉ UN VEREDICTO Y NO UNA LISTA
-- ---------------------------------------------------------------------
--
-- Porque la pregunta que importa no es "qué hay" sino "está todo". Y una tabla de ocho filas
-- hace que el que la mira tenga que compararla con la lista de lo que debería haber, que es
-- trabajo de quien lee.
--
-- Lo que tiene que salir: "LISTO".
--

select case
  when (select count(*) from information_schema.columns
         where table_schema='public' and table_name='trabajadores'
           and column_name='sueldo_base') = 0
    then 'FALTA LA COLUMNA. La 069 no está aplicada, o falló antes de crearla.'
  when not exists (select 1 from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='puede_ver_trabajador')
    then 'FALTA puede_ver_trabajador(). La 067 tiene que estar aplicada ANTES que la 069.'
  when (select count(*) from permisos where clave like 'rem.%') < 3
    then 'FALTAN PERMISOS. Hay ' || (select count(*) from permisos where clave like 'rem.%')
         || ' de 3. Revisar la sección 2 de la 069.'
  when (select count(*) from roles_permisos
         where rol='rrhh' and permiso in ('rem.ver','rem.editar')) <> 2
    then 'RRHH NO TIENE LOS DOS PERMISOS. Revisar la sección 3 de la 069.'
  when (select count(*) from roles_permisos
         where rol='supervisores' and permiso='rem.ver') <> 1
    then 'SUPERVISORES NO TIENE rem.ver.'
  when (select count(*) from roles_permisos
         where rol='tecnica' and permiso='rem.ver') <> 1
    then 'TECNICA NO TIENE rem.ver.'
  when not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name='sueldo_base_historial')
    then 'FALTA EL HISTORIAL. La sección 4 de la 069 no llegó a correr.'
  when (select count(*) from pg_policies
         where schemaname='public' and tablename='sueldo_base_historial') < 2
    then 'EL HISTORIAL NO TIENE SUS DOS POLÍTICAS. Sin la de "insert" no se registra quién cambió qué.'
  else 'LISTO. La 069 está completa.'
end as veredicto;


-- ===================================================================
-- 2) EL DETALLE, PARA CUANDO EL VEREDICTO NO ES "LISTO"
-- ===================================================================
--
-- Y esto se lee aunque el veredicto sea "LISTO", porque muestra el reparto y hay que
-- confirmarlo con los propios ojos: un permiso que se le dio al rol equivocado no se nota en
-- ningún lado, hasta que alguien lo ve.

select '1. la columna' as que,
       case when (select count(*) from information_schema.columns
                  where table_schema='public' and table_name='trabajadores'
                    and column_name='sueldo_base')=1
            then 'sí: numeric, acepta null' else 'NO ESTÁ' end as estado
union all
select '2. el control del número',
       case when exists (select 1 from pg_constraint
                          where conrelid='public.trabajadores'::regclass
                            and conname='trabajadores_sueldo_base_no_negativo')
            then 'sí: un negativo se rechaza' else '*** NO ESTÁ: un negativo se guarda ***' end
union all
select '3. los tres permisos',
       (select count(*) from permisos where clave like 'rem.%')::text || ' de 3'
union all
select '4. el reparto',
       (select string_agg(rol || ':' || permiso, '  ' order by rol, permiso)
          from roles_permisos where permiso like 'rem.%')
union all
select '5. el historial',
       case when exists (select 1 from information_schema.tables
                          where table_schema='public' and table_name='sueldo_base_historial')
            then 'sí' else 'NO ESTÁ' end
union all
select '6. las políticas del historial',
       (select count(*)::text from pg_policies
         where schemaname='public' and tablename='sueldo_base_historial')
union all
select '7. cuántos sueldos hay cargados',
       (select count(*)::text from trabajadores where sueldo_base is not null)
       || ' (con esto se prueba si la columna se está usando)' ;


-- ===================================================================
-- 3) LA PRUEBA QUE DE VERDAD IMPORTA
-- ===================================================================
--
-- Y esta NO es una consulta: es una prueba con la sesión de un usuario de cada rol, en la
-- consola del navegador. Porque lo que se necesita comprobar no es que la columna exista, sino
-- que el sueldo NO se vea para quien no tiene permiso.
--
-- La prueba, para un usuario que tiene "rem.ver" —jefatura, técnica—:
--
--     // 1. el listado normal: el sueldo NO tiene que aparecer
--     await supabaseClient.from('trabajadores').select('code,name').limit(5)
--
--     // 2. la consulta con la columna explícita: acá SÍ tiene que salir
--     await supabaseClient.from('trabajadores').select('code,sueldo_base').limit(5)
--
-- La diferencia entre las dos es el resultado. En la primera no tiene que haber un
-- "sueldo_base"; en la segunda tiene que haber números.
--
-- Y para un usuario SIN "rem.ver" —portería, bodega— la segunda tiene que venir vacía, no con
-- los números. Y si viene con números, el permiso no está acotando nada y eso hay que
-- arreglarlo antes de que se use.
--
-- ---------------------------------------------------------------------
-- Y LO QUE NO SE PUEDE PROBAR TODAVÍA
-- ---------------------------------------------------------------------
--
-- Que la escritura quede en la tabla del historial. Eso necesita que alguien cambie un
-- sueldo de verdad, y para eso hay que hacerlo a mano con la sesión de RRHH. Ver [rem-01].
