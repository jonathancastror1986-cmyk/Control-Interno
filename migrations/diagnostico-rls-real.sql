-- ===================================================================
-- TODAS LAS TABLAS, Y SI EL RLS ESTÁ PRENDIDO EN CADA UNA
-- ===================================================================
--
-- Corré esto ENTERO y mirá el panel de resultados.
--
-- ---------------------------------------------------------------------
-- POR QUÉ HAY QUE MIRAR EL RLS Y NO SÓLO LAS POLÍTICAS
-- ---------------------------------------------------------------------
--
-- "diagnostico-trabajadores.sql" muestra cómo están escritas las políticas. Y con eso -- con ver
-- las políticas -- no se ve el caso más común de todos, que es el más grave:
--
--     la tabla NO tiene RLS prendido.
--
-- Con el RLS apagado, PostgreSQL no consulta ninguna política. Da igual que las dos políticas de
-- "trabajadores" estén escritas con un EXISTS que compare la empresa: si el RLS está apagado, ese
-- EXISTS no llega a ejecutarse nunca, y se ven todas las filas.
--
-- Y el síntoma es idéntico al de una tabla sin políticas. En los dos casos: se ve todo. La
-- diferencia entre "no hay políticas" y "no hay RLS" cambia la corrección entera -- una es borrar
-- una política, la otra es un "alter table" -- y el listado de políticas no las distingue.
--
-- Por eso esta consulta trae "relrowsecurity", que es el dato que faltaba.
--
-- ---------------------------------------------------------------------
-- Y LAS TRES PREGUNTAS, UNA POR COLUMNA
-- ---------------------------------------------------------------------
--
--   rls             ¿Está el RLS prendido? Si no, se ven todas las filas, sin importar qué diga
--                   ninguna política.
--   anon_lee        ¿Tiene el rol "anon" permiso de SELECT? Sin permiso no ve nada, y una tabla
--                   cerrada se ve idéntica a una vacía. Por eso va como columna y no se deduce:
--                   "cerrada" y "sin filas" no son lo mismo.
--   politicas       Cuántas hay, y cuáles. Para que el veredicto se pueda leer sin otra consulta.
--
-- ---------------------------------------------------------------------
-- Y LO QUE ESPERAMOS DE LAS 117 FILAS DE "asistencia"
-- ---------------------------------------------------------------------
--
-- "marcajes" y "tarjetas" dan cero, y las dos son tablas de la misma familia. "asistencia" da 117.
-- Las tres se cerraron juntas por la misma migración, o no se cerraron juntas y sólo dos quedaron
-- bien. Esta consulta dice cuál de las dos es.
--
-- ---------------------------------------------------------------------
-- Y LO DE "trabajadores", QUE BAJÓ DE 47 A 1
-- ---------------------------------------------------------------------
--
-- La 073 quitó "acceso_total_trabajadores", que tenía "usando (true)", y el efecto se vio: de 47
-- a 1. Pero una fila sigue saliendo, y con dos políticas acotadas por empresa y el RLS prendido, una
-- fila con la llave anónima no debería existir.
--
-- O sea que falta una fila de esta lista: hay una tercera política en "trabajadores" que no aparece
-- en el listado de la consulta anterior. Esta trae TODAS las políticas de todas las tablas, así que
-- si existe, sale.

-- Y LA COLUMNA "sin_empresa", Y POR QUÉ NO ES LO QUE PARECE
--
-- Cuenta las políticas cuyo TEXTO no dice "empresa_id". Y eso incluye a todas las que delegan en
-- una función, como "epp entregas por empresa", que llama a "puede_ver_entrega" y no menciona la
-- empresa por nombre. O sea que la columna marca como sospechosa justamente a las que funcionan.
--
-- La versión anterior de este archivo la tomaba como veredicto: "*** REVISAR: hay N politica(s) sin
-- empresa ***". Con "epp_entregas", "marcajes" y "tarjetas" — las tres dan CERO filas con la llave
-- anónima — la columna ponía "REVISAR" en las tres. Una columna así no es inútil: enseña a
-- desconfiar de lo que está bien, que es peor que no dar ningún dato.
--
-- Así que acá la columna se llama por lo que hace, y NO decide nada. Para saber si una tabla está
-- abierta hay que preguntar a la base con el rol "anon", que es lo que hace
-- "diagnostico-llave-anonima.sql". Esta consulta cuenta textos; esa cuenta filas. Y no son lo
-- mismo: la misma tabla puede estar escrita de diez formas y abrir lo mismo.
--
-- Y "rls apagado" sí es concluyente por sí solo, porque con el RLS apagado no se consulta ninguna
-- política. Eso queda como veredicto aparte y es el único de esta consulta que no necesita la otra.

-- ---------------------------------------------------------------------
-- Y LO QUE ESTA CONSULTA YA NO AFIRMA
-- ---------------------------------------------------------------------
--
-- "rls apagado" sí es concluyente por sí solo, porque con el RLS apagado no se consulta ninguna
-- política. Eso queda como veredicto.
--
-- "tiene políticas sin empresa" NO lo es, y esta consulta ya no lo afirma. Contar textos no es
-- contar filas: una política puede estar escrita de diez formas y abrir lo mismo, y una puede estar
-- escrita de una sola forma y no abrir nada. La cuenta de filas la hace
-- "diagnostico-llave-anonima.sql", con el rol "anon", que es el que decide.

select c.relname                                                     as tabla,
       c.relrowsecurity                                              as rls,
       case when not c.relrowsecurity
            then '*** RLS APAGADO: se ven TODAS las filas ***'
            else 'prendido' end                                      as estado_rls,
       has_table_privilege('anon', c.oid, 'select')                 as anon_lee,
       coalesce(p.cuantas, 0)                                        as politicas,
       coalesce(p.nombres, '(ninguna)')                              as cuales,
       coalesce(p.sin_texto, 0)                                      as sin_texto_empresa,
       case
         when not c.relrowsecurity and has_table_privilege('anon', c.oid, 'select')
              then '*** ABIERTA: sin RLS y anon puede leer ***'
         when not c.relrowsecurity
              then 'rls apagado, pero anon no tiene permiso'
         else 'no concluyente: hay que contar filas como anon'
       end                                                          as veredicto
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join lateral (
         select count(*)::int                   as cuantas,
                string_agg(x.policyname, ' | ') as nombres,
                count(*) filter (where coalesce(x.qual, 'x') !~* 'empresa_id')::int as sin_texto
           from pg_policies x
          where x.schemaname = n.nspname
            and x.tablename  = c.relname
       ) p on true
 where n.nspname = 'public'
   and c.relkind in ('r', 'p')
 order by
   -- Y LO PEOR PRIMERO, QUE ES PARA LO QUE SE ABRE ESTA CONSULTA
   (not c.relrowsecurity) desc,
   has_table_privilege('anon', c.oid, 'select') desc,
   c.relname;