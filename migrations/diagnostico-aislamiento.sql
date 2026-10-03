-- ===================================================================
-- DIAGNÓSTICO DEL AISLAMIENTO POR EMPRESA (solo lee, no cambia nada)
-- ===================================================================
--
-- CUÁNDO CORRERLO
-- ---------------
--
-- Después de correr la 067 en el editor SQL, y antes de hacer el paso manual de la 068.
--
-- Y la razón por la que existe: la 067 vieja falló DOS veces en la misma línea —la del bucket— y
-- las dos veces quedaronFunctions sin crear. Eso solo pasa si el editor ejecutó el archivo
-- entero como UNA transacción y la revirtió. O sea que ahora puede no haber NADA aplicado, y
-- "no puedo aplicarlo" y "lo dejé a medias" son dos estados distintos que hay que poder
-- distinguir.
--
-- ---------------------------------------------------------------------
-- LA PRIMERA CONSULTA: EL ESTADO EN SEIS NÚMEROS
-- ---------------------------------------------------------------------
--
-- Seis "sí" o "no" en una sola pantalla. Todos los ceros de la columna "existe" son lo bueno,
-- menos en la fila del bucket, que está al revés y por eso dice distinto.

select '1. función puede_ver_trabajador' as que,
       case when count(*) > 0 then 'SÍ existe' else 'no existe' end as estado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'puede_ver_trabajador'
union all
select '2. función puede_ver_archivo',
       case when count(*) > 0 then 'SÍ existe' else 'no existe' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'puede_ver_archivo'
union all
select '3. asistencia: política NUEVA por empresa',
       case when count(*) > 0 then 'SÍ está' else 'no está' end
  from pg_policies where schemaname = 'public' and tablename = 'asistencia'
   and policyname = 'asistencia por empresa'
union all
select '4. asistencia: política VIEJA "cualquier usuario activo"',
       case when count(*) > 0 then '*** SÍ SIGUE, es un agujero ***' else 'no está: bien' end
  from pg_policies where schemaname = 'public' and tablename = 'asistencia'
   and policyname = 'asistencia rw'
union all
select '5. marcajes: política VIEJA',
       case when count(*) > 0 then '*** SÍ SIGUE, es un agujero ***' else 'no está: bien' end
  from pg_policies where schemaname = 'public' and tablename = 'marcajes'
   and policyname = 'marcajes rw'
union all
select '6. tarjetas: política VIEJA',
       case when count(*) > 0 then '*** SÍ SIGUE, es un agujero ***' else 'no está: bien' end
  from pg_policies where schemaname = 'public' and tablename = 'tarjetas'
   and policyname = 'tarjetas rw';

-- ---------------------------------------------------------------------
-- CÓMO SE LEE
-- ---------------------------------------------------------------------
--
-- Filas 1, 2 y 3 en "no": la 067 NO ESTÁ APLICADA. Es el estado que se espera después de los
-- dos fallos, y es limpio: no hay nada a medias. Corré la 067 nueva y volvé a pasar esto.
--
-- Fila 3 en "SÍ" y filas 4, 5 y 6 en "no está": la 067 ESTÁ APLICADA Y CORRECTA. Pasá al
-- paso manual del bucket, que es la 068.
--
-- Cualquier fila 4, 5 o 6 en "SÍ SIGUE": hay una tabla sin filtrar por empresa. Con la llave
-- anónima cualquiera la lee entera. Ver [rls-01].
--
-- ---------------------------------------------------------------------
-- Y SI LA 067 DIERA ERROR EN UNA LÍNEA QUE NO ES LA DEL BUCKET
-- ---------------------------------------------------------------------
--
-- La 067 nueva no toca "storage.objects" en absoluto, así que no debería dar ningún error.
-- Si da uno, el mensaje SÍ dice cuál es la línea y por qué, y no hay que adivinar: se copia
-- entero. Ver [sql-01] y [sql-02].


-- ===================================================================
-- 2) LAS POLÍTICAS DEL BUCKET, UNA POR UNA
-- ===================================================================
--
-- Y esta es la que decide si el paso del panel está hecho o no. Correla DESPUÉS de la 068.
--
-- Lo que tiene que aparecer: una sola política sobre "epp-respaldos", que hable de
-- "puede_ver_archivo". Y la vieja, "epp respaldos rw", tiene que NO estar.
--
-- Y por qué importa que sea una sola: las políticas permisivas se unen con "o". Si están las
-- dos, la vieja gana y el bucket sigue abierto. Ver [rls-04].

select policyname,
       cmd,
       roles::text,
       coalesce(qual, '(sin condición)')        as usando,
       coalesce(with_check, '(sin condición)')   as al_escribir
  from pg_policies
 where schemaname = 'storage'
   and tablename = 'objects'
   and qual like '%epp-respaldos%'
 order by policyname;

-- Y el total, que es el número que hay que mirar primero:
select count(*) as politicas_sobre_el_bucket
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects';

-- ---------------------------------------------------------------------
-- LAS QUE SUPABASE CREA POR SU CUENTA
-- ---------------------------------------------------------------------
--
-- Y si salen más de las que esperabas, mirá si son de ésas. Filtran por los buckets con
-- "public = true", y "epp-respaldos" es privado, así que NO alcanzan. Pero eso hay que VERLO
-- en la consulta de arriba, y no suponerlo.
--
-- Si querés la lista entera, sin filtro:

-- select policyname, cmd, coalesce(qual, '(sin condición)') as usando
--   from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--  order by policyname;
