-- ===================================================================
-- CADA POLÍTICA, A QUÉ ROL SE APLICA Y SI ES PERMISIVA
-- ===================================================================
--
-- Corré esto ENTERO y mirá el panel de resultados.
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTE DIAGNÓSTICO, Y NO EL ANTERIOR
-- ---------------------------------------------------------------------
--
-- El anterior mostraba, por tabla, cuántas políticas hay y cuáles. Eso alcanzaba para encontrar
-- "acceso_total_asistencia", que se ve por el nombre. Y no alcanza para dos cosas:
--
--   · a qué ROL se aplica cada política. "ALL" incluye "anon". Si una dice "anon", la escribe
--     alguien a mano para la llave anónima, y hay que ver cuál es.
--   · si es PERMISIVA. Con varias políticas, PostgreScript las junta con OR entre las permisivas.
--     Una sola política permisiva con "usando (true)" alcanza para que se vea todo, por muy acotada
--     que esté la otra que está al lado.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ LA COLUMNA "sin empresa" DEL DIAGNÓSTICO ANTERIOR NO SERVÍA
-- ---------------------------------------------------------------------
--
-- Contaba como "sin empresa" toda política cuyo texto no dice literalmente "empresa_id". Y una
-- política que delega en una función —"puede_ver_entrega(...)"— no lo dice. Entonces marcaba como
-- sospechosa a "epp entregas por empresa", que es la que Acaba de dar CERO filas con la llave
-- anónima, y a "marcajes por empresa" y "tarjetas por empresa", que también.
--
-- O sea que la columna señalaba como Ride lo que funcionaba. Y una columna así no es inútil: es
-- actively contraproducente, porque enseña a desconfiar de lo que está bien. Por eso esta trae el
-- texto entero y que lo mire quien lo lee.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ SEPARO LAS QUE DICEN "true"
-- ---------------------------------------------------------------------
--
-- Porque son las que deshacen todo lo demás. Con varias políticas permisivas se suman con OR, así
-- que una sola que pase sin preguntar deja pasar la fila entera. Y no tiene que ser un descuido
-- con forma de "true": una queamps "es_admin()" sin acotar por empresa hace lo mismo.

select tablename                                        as tabla,
       policyname                                       as politica,
       roles::text                                      as para_los_roles,
       cmd                                               as para_operacion,
       permissive                                       as permisiva,
       coalesce('usando (' || qual || ')', 'usando (true): PASA TODO')
                                                         as condicion_de_lectura,
       coalesce('check (' || with_check || ')', 'sin check')
                                                         as condicion_de_escritura,
       case
         when qual is null                              then '*** PASA TODO ***'
         when qual ~* 'empresa_id'                      then 'dice empresa_id'
         when qual ~* 'auth\.uid|perfil_roles|perfiles'
                                                       then 'pregunta quien es'
         else 'delega en una funcion: mirarla a ojo'
       end                                              as como_filtra,
       case
         when roles = '{public}'                        then '*** SOLO public: anon queda afuera ***'
         when qual is null                              then '*** ABIERTA ***'
         else 'ok, con su condicion'
       end                                              as veredicto
  from pg_policies
 where schemaname = 'public'
 order by (qual is null) desc,
          (roles = '{public}') desc,
          tablename,
          cmd,
          policyname;