-- ===================================================================
-- EL VEREDICTO DE LA CADENA — UNA CONSULTA, AL FINAL
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- POR QUÉ EL VEREDICTO VA AL FINAL Y NO AL PRINCIPIO
-- ---------------------------------------------------------------------
--
-- Porque el editor SQL de Supabase muestra SOLO el resultado de la ÚLTIMA sentencia. Un
-- diagnóstico con el veredicto primero no tiene veredicto: tiene un dato, y el que lo corre se va
-- creyendo que el archivo noBescontestó lo que preguntaba.
--
-- Ya pasó con este mismo archivo, y con el de "epp_entregas". Ver [orden-07].
--
-- Ahora: los datos primero, y al final, en UNA sola sentencia, la respuesta.
--
-- ---------------------------------------------------------------------
-- LAS SIETE TABLAS DE LA CADENA DE DATOS DE PERSONAS
-- ---------------------------------------------------------------------
--
-- De abajo hacia arriba en el orden de la cadena, porque así se lee: primero a quién se le
-- entregó, después qué, después qué herramienta tiene, y en el medio los estados de cada día.
--
-- Lo que mira cada una:
--
--   SIN POLÍTICAS   con el RLS prendido y sin políticas, no la lee nadie. Ni un administrador.
--                   No da error: la pantalla sale vacía para todos y el resto funciona.
--
--   ABIERTA         la política dice "exists (select 1 from perfiles p where p.id = auth.uid()
--                   and p.activo)". No menciona ninguna empresa: la cumple cualquier usuario
--                   activo, de cualquier empresa.
--
--   LISTO           llama a "puede_ver_trabajador" o a "puede_ver_entrega", y trae "with check".

-- ===================================================================
-- 1) LAS POLÍTICAS, PARA TENERLAS A LA VISTA
-- ===================================================================

select tablename,
       policyname,
       cmd,
       coalesce(qual, '(sin condición)')      as usando,
       coalesce(with_check, '(sin condición)') as al_escribir
  from pg_policies
 where schemaname = 'public'
   and tablename in ('herramientas_asignaciones', 'epp_entrega_items', 'epp_entregas',
                     'asistencia', 'marcajes', 'tarjetas', 'trabajadores')
 order by tablename, policyname;

-- Y el RLS de las siete.

select relname as tabla,
       relrowsecurity as rls_prendido,
       relforcerowsecurity as rls_forzado
  from pg_class
 where relname in ('herramientas_asignaciones', 'epp_entrega_items', 'epp_entregas',
                   'asistencia', 'marcajes', 'tarjetas', 'trabajadores')
 order by relname;

-- Y las dos funciones, probadas con usuario nulo: tienen que dar FALSO, no error.
--
-- Porque si dan error, la política que las usa va a fallar en tiempo de consulta, que es cuando
-- alguien la está usando. Y con "auth.uid()" nulo, la llave anónima devuelve cero filas tanto si la
-- política está como si no: la prueba anónima no dice nada sobre esto.

select 'puede_ver_trabajador' as funcion,
       coalesce((select public.puede_ver_trabajador('cualquier', null))::text, '(null)') as con_usuario_nulo
union all
select 'puede_ver_entrega', coalesce((select public.puede_ver_entrega(null, null))::text, '(null)');

-- ===================================================================
-- 2) EL VEREDICTO — LA ÚLTIMA SENTENCIA
-- ===================================================================
--
-- Y sale EN VERTICAL, con una fila por tabla, para que se lea sin desplazar.
--
-- Y tiene una fila de arriba que resume: cuántas tablas quedan por arreglar. Porque un veredicto
-- de siete filas hay que contarlo a ojo, y contar a ojo es donde se pierde uno.

with v as (
  select t.tabla,
         (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = t.tabla) as cuantas,
         (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = t.tabla
             and (p.qual like '%puede_ver_trabajador%'
                  or p.qual like '%puede_ver_entrega%')) as acotadas,
         (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = t.tabla
             and p.with_check is null) as sin_check,
         (select relrowsecurity from pg_class c where c.relname = t.tabla) as rls
    from (values ('trabajadores'), ('asistencia'), ('marcajes'), ('tarjetas'),
                 ('herramientas_asignaciones'), ('epp_entregas'), ('epp_entrega_items')) as t(tabla)
)
select (select count(*) from v where rls is true and acotadas > 0) as tablas_listas,
       (select count(*) from v where rls is not true or acotadas = 0) as tablas_por_arreglar,
       case
         when (select count(*) from v where rls is not true or acotadas = 0) = 0
           then 'LISTO. Las siete tablas de la cadena están acotadas por empresa.'
         when (select count(*) from v where rls is not true) > 0
              and (select count(*) from v where rls is true and cuantas = 0) > 0
           then '*** HAY TABLAS SIN POLÍTICAS: no las lee nadie, ni un administrador. ***'
           when (select count(*) from v where rls is true and acotadas = 0) > 0
           then '*** HAY TABLAS ABIERTAS A CUALQUIER USUARIO ACTIVO. ***'
         else '*** MIXTO: hay tablas listas y tablas por arreglar. Ver el detalle de abajo. ***'
       end as el_resumen,
       tabla,
       coalesce(cuantas::text, '-') as politicas,
       case
         when rls is not true then '*** SIN RLS ***'
         when cuantas = 0      then '*** SIN POLÍTICAS: nadie la lee ***'
         when acotadas = 0     then '*** ABIERTA A CUALQUIER USUARIO ACTIVO ***'
         when sin_check > 0    then '*** SIN "with check" ***'
         else 'LISTO'
       end as veredicto
  from v
 order by (select 1 from v x where x.tabla = v.tabla and x.acotadas = 0) desc, tabla;