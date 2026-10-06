-- ===================================================================
-- POR QUÉ NO SE GUARDA LA HUELLA
-- ===================================================================
--
-- El navegador dijo: "no se pudo saber la empresa: la huella no se guardó".
--
-- Eso es el aviso que puse yo, y sale cuando el trabajador NO tiene
-- "empresa_id", o cuando la empresa elegida en el filtro está vacía.
--
-- Corre esto en el SQL Editor de Supabase. Son tres consultas, y cada una
-- dice qué falta.

-- 1) ¿LA COLUMNA EXISTE?
select case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='trabajadores'
           and column_name='empresa_id')
       then 'ok, la columna existe'
       else '*** NO EXISTE la columna empresa_id en trabajadores'
       end as "1_columna";

-- 2) ¿LOS TRABAJADORES LA TIENEN LLENA?
--
-- Esta es la que importa. Si la columna existe pero está vacía, el navegador
-- no tiene de dónde sacar la empresa y no guarda la huella.
select count(*)                                            as "total_trabajadores",
       count(empresa_id)                                   as "con_empresa_id",
       count(*) filter (where empresa_id is null)          as "SIN_empresa_id",
       case when count(empresa_id) = 0
            then '*** NINGUNO tiene empresa_id: hay que llenarla'
            else 'ok, ' || count(empresa_id) || ' de ' || count(*) || ' la tienen'
       end                                                 as "2_estado"
from public.trabajadores;

-- 3) LOS QUE NO LA TIENEN
--
-- Para ver quiénes son, y no un número suelto. La lista va acá, y no en un
-- archivo aparte, porque el panel corre todo junto.
--
-- Si salen muchos, es que la carga inicial no los asignó. Cada uno pertenece a
-- una empresa: por eso la columna existe.
select code, name, empresa_id
from public.trabajadores
where empresa_id is null
order by code
limit 30;

-- ===================================================================
-- QUÉ HACER CON CADA RESULTADO
-- ===================================================================
--
-- "1_columna" dice NO EXISTE
--   La tabla trabajadores no tiene empresa_id. Se agrega con un "alter table",
--   y después hay que llenarla.
--
-- "2_estado" dice NINGUNO tiene empresa_id
--   La columna existe pero está vacía. Es el caso más probable, porque la
--   asignación de empresa se hizo antes de que la columna existiera.
--
-- "3" muestra los trabajadores sin empresa
--   Son los que hay que asignar. Con el desplegable de empresa de la ficha se
--   hace de a uno, o con una migración si son muchos.
--
-- ---------------------------------------------------------------------
-- POR QUÉ IMPORTA QUE LA HUELLA SE GUARDE
-- ---------------------------------------------------------------------
--
-- Sin huella, el papel firmado no tiene prueba de que no se cambió. Se puede
-- volver a editar el texto y queda igual, sin que nada lo indique.
--
-- La firma sí se guarda igual: esa va por otra tabla y no depende de esto. Lo
-- que falta es la prueba de integridad, no el documento.