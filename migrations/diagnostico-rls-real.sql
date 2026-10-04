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
-- Las tres were_closed juntas por la misma migración, o no se cerraron juntas y sólo dos quedaron
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

select c.relname                                                     as tabla,
       c.relrowsecurity                                              as rls,
       case when not c.relrowsecurity
            then '*** RLS APAGADO: se ven TODAS las filas ***'
            else 'prendido' end                                      as estado_rls,
       has_table_privilege('anon', c.oid, 'select')                 as anon_lee,
       coalesce(p.cuantas, 0)                                        as politicas,
       coalesce(p.nombres, '(ninguna)')                              as cuales,
       coalesce(p.sin_empresa, 0)                                   as politicas_sin_empresa,
       case
         when not c.relrowsecurity and has_table_privilege('anon', c.oid, 'select')
              then '*** ABIERTA: sin RLS y anon puede leer ***'
         when not c.relrowsecurity
              then 'rls apagado, pero anon no tiene permiso'
         when coalesce(p.sin_empresa, 0) > 0
              then '*** REVISAR: hay ' || p.sin_empresa || ' politica(s) sin empresa ***'
         when coalesce(p.cuantas, 0) = 0 and has_table_privilege('anon', c.oid, 'select')
              then 'cerrada: rls prendido y sin politicas'
         when coalesce(p.cuantas, 0) = 0
              then 'cerrada: rls prendido y sin politicas, y anon no lee'
         else 'con politicas, todas con empresa: mirarlas a ojo'
       end                                                          as veredicto
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join lateral (
         select count(*)::int                as cuantas,
                string_agg(x.policyname, ' | ') as nombres,
                count(*) filter (where coalesce(x.qual, 'x') !~* 'empresa_id')::int as sin_empresa
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
   coalesce(p.sin_empresa, 0) desc,
   c.relname;