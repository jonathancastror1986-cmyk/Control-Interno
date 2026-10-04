-- ===================================================================
-- LAS POLÍTICAS DE "trabajadores", UNA POR RENGLÓN
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- POR QUÉ UNA CONSULTA Y NO UNA CORRECCIÓN
-- ---------------------------------------------------------------------
--
-- Porque la tabla que está abierta es la más difícil de cerrar del proyecto, y cerrarla a ciegas
-- rompe la aplicación entera.
--
-- "trabajadores" es la tabla ancla: de ella cuelgan todas las demás. Y la 067 NO la acotó —
-- definió la función en ese archivo y la aplicó a "asistencia", "marcajes" y "tarjetas"—, y el
-- motivo probablemente fue justo este: si se acota mal, nadie ve nada y no se puede trabajar.
--
-- Con lo que se sabe del diagnóstico de la cadena:
--
--   · tiene TRES políticas, y ninguna llama a "puede_ver_trabajador"
--   · el RLS está prendido
--   · desde el navegador, con la llave anónima, se leen las 47 filas de los 47 trabajadores
--
-- Esa última cosa es la que no encaja con las otras tablas, que con la llave anónima dan cero.
-- O sea que alguna de las tres no pregunta por "auth.uid()". Eso hay que verlo, no suponerlo.
--
-- ---------------------------------------------------------------------
-- POR QUÉ EL VEREDICTO ESTÁ EN CADA RENGLÓN Y NO ARRIBA
-- ---------------------------------------------------------------------
--
-- Porque el editor muestra un panel por sentencia, y solo queda abierto el último. Con una fila por
-- política, el panel único muestra las tres Y el veredicto de cada una. Con un resumen arriba y un
-- detalle abajo, el resumen es lo único que se ve y el detalle hay quearlo a buscar.
--
-- Lo que hay que mirar es la columna "lectura": qué puede LEER cada sesión con esa política.

select p.tablename  as tabla,
       p.policyname as politica,
       p.cmd        as para,
       coalesce(p.qual, '(SIN CONDICION)')   as leyendo_si,
       coalesce(p.with_check, '(SIN CHECK)') as escribiendo_si,
       case
         when p.qual like '%puede_ver_trabajador%' then 'acotada por empresa'
         when p.qual is null                        then '*** SIN CONDICION: deja pasar todo ***'
         when p.qual ~* 'auth\.uid|perfiles|perfil_roles'
                                                    then 'pregunta quien es, pero NO que empresa'
         else '*** OTRA COSA: mirarla a ojo ***'
       end as lectura,
       case
         when p.qual like '%puede_ver_trabajador%' and p.with_check is not null then 'LISTO'
         when p.qual like '%puede_ver_trabajador%' then '*** SIN with check ***'
         else '*** ABIERTA ***'
       end as veredicto
  from pg_policies p
 where p.schemaname = 'public'
   and p.tablename in ('trabajadores', 'epp_entregas')
 order by p.tablename, p.cmd, p.policyname;
