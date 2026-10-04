-- ===================================================================
-- EL VEREDICTO DE "epp_entregas" — UNA CONSULTA, DE PRIMEERO A ÚLTIMO
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTE ARCHIVO ESTÁ ORDENADO AL REVÉS
-- ---------------------------------------------------------------------
--
-- La versión anterior empezaba por el veredicto y terminaba con el detalle. Y el editor SQL de
-- Supabase muestra SOLO el resultado de la ÚLTIMA sentencia. O sea que el veredicto —que es lo
-- único que servía— no se veía nunca, y lo que aparecía era la tabla de "¿el RLS está prendido?",
-- que es un dato pero no es la respuesta.
--
-- Y eso es lo peor que puede hacer una herramienta de diagnóstico: parecer queQV funciona, y que
-- lo que muestra no conteste lo que uno fue a preguntar. Un guardián que no avisa del defecto que
-- vigila, y encima ocupa el lugar del que sí avisa. Ver [orden-07].
--
-- Ahora el archivo va de menor a mayor: primero los datos, y AL FINAL, y en una sola sentencia, el
-- veredicto. Lo que se ve en pantalla es la respuesta.
--
-- ---------------------------------------------------------------------
-- CÓMO SE USA
-- ---------------------------------------------------------------------
--
-- Correr TODO el archivo, y mirar el ÚLTIMO panel de resultados. Ese es el veredicto.

-- ===================================================================
-- 1) EL RLS, Y LAS POLÍTICAS, PARA TENERLOS A LA VISTA
-- ===================================================================

select relname as tabla,
       relrowsecurity as rls_prendido,
       relforcerowsecurity as rls_forzado
  from pg_class
 where relname = 'epp_entregas';

select policyname,
       cmd,
       coalesce(qual, '(sin condición)')      as usando,
       coalesce(with_check, '(sin condición)') as al_escribir
  from pg_policies
 where schemaname = 'public' and tablename = 'epp_entregas'
 order by policyname;

-- ===================================================================
-- 2) EL VEREDICTO — LA ÚLTIMA SENTENCIA, LA QUE SE LEE
-- ===================================================================
--
-- Y es una sola sentencia, para que quepa en un panel y se lea sin desplazar.
--
-- Los cuatro estados posibles, y el que importa es el último:
--
--   SIN POLÍTICAS   el RLS está prendido y no hay ninguna: NO LA LEE NADIE. Ni un
--                   administrador. No da error, no da excepción: la pantalla de EPP se ve vacía
--                   para todos y el resto de la aplicación funciona. Es lo que dejó la segunda
--                   corrida de la 071, porque el "drop" de la política vieja corrió antes de que
--                   el "create" fallara.
--
--   LISTO           está la de la 071 y no está la vieja.
--
--   MÁS DE UNA      las dos están. Y las políticas se suman con "or", o sea que la vieja sigue
--                   abriendo lo que la nueva cierra. Hay que borrar la vieja a mano.
--
--   OTRA            hay una sola, pero no es la de la 071: la 071 se corrió a medias.

select case
  when (select relrowsecurity from pg_class where relname = 'epp_entregas') is not true
    then '*** EL RLS NO ESTÁ PRENDIDO: la política no sirve de nada. ***'
       || ' Hay que correr: alter table public.epp_entregas enable row level security;'

  when (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'epp_entregas') = 0
    then '*** SIN POLÍTICAS: la tabla NO LA LEE NADIE, ni un administrador. ***'
       || ' Hay que correr la 071 de nuevo. Ya es re-ejecutable.'

  when (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'epp_entregas'
           and policyname = 'epp entregas por empresa') = 0
    then '*** HAY UNA PERO NO ES LA DE LA 071. La 071 se corrió a medias. ***'
       || ' Mirar el panel de arriba, ver cuál es, y borrarla a mano.'

  when (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'epp_entregas'
           and policyname = 'epp entregas rw') = 1
    then '*** ESTÁN LAS DOS: la vieja sigue puesta y las dos se suman con "o". ***'
       || ' Hay que correr: drop policy if exists "epp entregas rw" on public.epp_entregas;'

  else 'LISTO. La política correcta está puesta y la vieja ya no está.'
       || ' Lo que sigue es solo para confirmarlo a ojo.'
end as veredicto;