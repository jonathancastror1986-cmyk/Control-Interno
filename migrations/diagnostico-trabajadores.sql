-- ===================================================================
-- LAS POLÍTICAS DE "trabajadores" Y "epp_entregas", UNA POR RENGLÓN
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTE DIAGNÓSTICO DABA UNA ALARMA FALSA
-- ---------------------------------------------------------------------
--
-- El anterior decidía con un solo nombre de función:
--
--     when p.qual like '%puede_ver_trabajador%' then 'acotada por empresa'
--     ...
--     else '*** ABIERTA ***'
--
-- O sea que lo único que contaba como acotado era una política que LLAMARA a esa función. Y las
-- dos políticas de "trabajadores" no la llaman: traen el alcance escrito ahí mismo, con un EXISTS:
--
--     es_admin() OR EXISTS (SELECT 1 FROM perfil_empresas pe
--                            WHERE pe.user_id = auth.uid()
--                              AND pe.empresa_id = trabajadores.empresa_id)
--
-- Que es acotado por empresa, y de la manera más directa que hay: comparando la empresa de la fila
-- contra la empresa del usuario. Pero como no aparece el nombre de la función, caían en el "else"
-- y salían marcadas como ABIERTAS.
--
-- Dos veredictos de "*** ABIERTA ***" sobre dos políticas que sí están acotadas. El diagnóstico
-- mentía, y el dangerously lo peor de un diagnóstico: no dice "no sé", dice "mal", con la misma
-- seguridad.
--
-- ---------------------------------------------------------------------
-- EL ERROR DE FONDO, Y POR QUÉ ESTE TEXTO LO DICE AL PRINCIPIO
-- ---------------------------------------------------------------------
--
-- Un diagnóstico que reconoce una forma y trata todo lo demás como "abierto" no puede
-- distinguir tres cosas que son muy distintas:
--
--     1. la política no tiene condición        --> ABIERTA, de verdad
--     2. la política tiene una condición        --> hay que mirarla a ojo
--     3. la política tiene una condición que    --> ACOTADA
--        yo no conozco
--
-- La versión anterior Renunciaba a la 3 y mandaba la 2 a la 1. Cualquier política escrita con una
-- forma nueva daba una alarma, y la reacción correcta -- que es ir a mirarla -- se convierte en
-- "arreglar algo que no está roto".
--
-- Por eso aquí la forma desconocida tiene su propia respuesta, y dice "no reconocí", no "abierta".
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ EL CRITERIO ES ESTRUCTURAL, Y NO POR NOMBRES
-- ---------------------------------------------------------------------
--
-- "Acotada por empresa" significa una sola cosa, y se puede preguntar sin saber nombres de
-- funciones: que la condición mire la EMPRESA de la fila y la EMPRESA a la que pertenece el
-- usuario. En la práctica eso es un "empresa_id" comparado contra una membresía.
--
-- Y se aceptan las dos formas que hay en el proyecto -- la que llama a la función y la que trae el
-- EXISTS escrito -- porque las dos son correctas y no hay razón para preferir una. Un criterio
-- que solo acepta una de las dos no está midiendo la seguridad: está midiendo si el archivo se
-- escribió como yo lo escribí.
--
-- ---------------------------------------------------------------------
-- Y LA RAMA DE "es_admin()" VA EN SU PROPIA COLUMNA
-- ---------------------------------------------------------------------
--
-- "es_admin()" no tiene empresa adentro: mira "perfil_roles", que es global. Así que
-- "es_admin() OR EXISTS(...)" deja pasar TODAS las empresas a un admin. Eso no es un defecto de
-- esta política: es una decisión, y las dos columnas la muestran separadas para que se vea de
-- qué se está hablando.
--
-- ---------------------------------------------------------------------
-- TODO EN UNA SOLA SENTENCIA, CON EL VEREDICTO EN CADA RENGLÓN
-- ---------------------------------------------------------------------
--
-- El editor de Supabase muestra un panel por sentencia y sólo queda abierto el último. Por eso
-- esto es un SELECT, no un SELECT seguido de un resumen.

select p.tablename                                                          as tabla,
       p.policyname                                                         as politica,
       p.cmd                                                                as para,
       coalesce(p.qual, '(SIN CONDICION)')                                  as leyendo_si,
       coalesce(p.with_check,
                case when p.cmd = 'SELECT' then '(no aplica en SELECT)'
                     else '(SIN CHECK)' end)                                 as escribiendo_si,

       -- Y QUÉ EMPRESA PUEDE VER CADA SESIÓN
       case
         when p.qual is null
              then '*** ABIERTA: sin condicion, pasa todo ***'
         when p.qual ~* 'empresa_id'
              and (p.qual ~* 'perfil_empresas'
                or p.qual ~* 'puede_ver_trabajador'
                or p.qual ~* 'empresa_actual')
              then 'acotada por empresa'
         when p.qual ~* 'auth\.uid|perfil_roles|perfiles'
              then 'pregunta quien es, pero NO que empresa'
         else '*** tiene condicion, y NO la reconozco: mirarla a ojo ***'
       end                                                                 as lectura,

       -- Y SI LA ESCRITURA ESTA ACOTADA IGUAL QUE LA LECTURA
       --
       -- Y por que "SELECT" no tiene veredicto propio: una politica FOR SELECT no lleva
       -- "with check", y no es un olvido. PostgreSQL no lo pide porque no hay nada que
       -- comprobar: no se esta insertando nada. Pedirlo ahi produce un "*** SIN CHECK ***" en una
       -- politica que esta perfecta, que es el mismo defecto que ya se corrigio dos veces.
       case
         when p.cmd = 'SELECT'                        then 'no aplica: SELECT no lleva check'
         when p.with_check is null                    then '*** SIN CHECK ***'
         when p.with_check ~* 'empresa_id'
              and (p.with_check ~* 'perfil_empresas'
                or p.with_check ~* 'puede_ver_trabajador'
                or p.with_check ~* 'empresa_actual')  then 'acotada por empresa'
         else '*** tiene check, y NO lo reconozco ***'
       end                                                                 as escritura,

       -- Y LA RAMA DEL ADMIN, QUE NO MIRA EMPRESA
       case
         when p.qual ~* 'es_admin'      then 'admin: ve TODAS las empresas (decision, no defecto)'
         when p.with_check ~* 'es_admin' then 'admin: escribe en TODAS (decision, no defecto)'
         else 'no hay rama de admin'
       end                                                                 as admin,

       -- Y EL VEREDICTO, AL FINAL DE CADA RENGLÓN
       case
         when p.qual is null                                   then '*** ABIERTA ***'
         when p.cmd <> 'SELECT' and p.with_check is null       then '*** SIN CHECK ***'
         when p.qual ~* 'empresa_id'
              and (p.qual ~* 'perfil_empresas'
                or p.qual ~* 'puede_ver_trabajador'
                or p.qual ~* 'empresa_actual')
              and (p.cmd = 'SELECT' or p.with_check ~* 'empresa_id')
                                                            then 'LISTO'
         else '*** SIN VEREDICTO: hay que mirarla a ojo ***'
       end                                                                 as veredicto
  from pg_policies p
 where p.schemaname = 'public'
   and p.tablename in ('trabajadores', 'epp_entregas')
 order by p.tablename, p.cmd, p.policyname;

-- ===================================================================
-- Y LO QUE ESTE DIAGNÓSTICO NO PUEDE PROBAR
-- ===================================================================
--
-- Muestra cómo está escrita cada política. No comprueba que la base la haga cumplir.
--
-- La diferencia importa: una política puede estar escrita perfecto y no estar aplicada -- si falta
-- un "alter table ... enable row level security", si la política es de otro esquema, o si el rol
-- que consulta tiene "bypassrls". Todo eso se ve bien en este listado y aun así deja pasar todo.
--
-- Por eso la prueba que decide es "diagnostico-llave-anonima.sql", que consulta como el rol
-- "anon": el mismo que usa la llave anónima del navegador.