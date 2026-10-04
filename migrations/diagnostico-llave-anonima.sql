-- ===================================================================
-- LO QUE VE LA LLAVE ANÓNIMA, QUE ES LA PREGUNTA QUE DECIDE
-- ===================================================================
--
-- Corré esto ENTERO y mirá el panel de resultados.
--
-- Ojo: este archivo deja la sesión del editor con el rol "anon". Cuando termines, corré
-- "reset role;" en el mismo editor, o recargá la página, y seguís comopostgres.
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTA PRUEBA Y NO EL DIAGNÓSTICO DE POLÍTICAS
-- ---------------------------------------------------------------------
--
-- Porque "diagnostico-trabajadores.sql" muestra CÓMO ESTÁ ESCRITA cada política, y eso no prueba
-- que la base la haga cumplir. Hay tres formas de tener la política escrita bien y que aun así no
-- se cumpla, y ninguna se ve en un listado de políticas:
--
--   · falta el "alter table ... enable row level security" en esa tabla
--   · la política existe pero en otro esquema, y la tabla se busca en "public"
--   · el rol que consulta tiene "bypassrls", y se saltea todas
--
-- Esta prueba no sufre de ninguna de las tres: pregunta a la base, con el rol que usa la llave
-- anónima del navegador, y cuenta lo que sale.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ "set role anon" Y NO "set local"
-- ---------------------------------------------------------------------
--
-- Porque "set local" se deshace al terminar la transacción, y el editor de Supabase envuelve cada
-- corrida en su propia transacción: el "set local" se perdería antes del "select" y la prueba
-- saldría dando lo que ve "postgres", que ve todo. Saldría "LISTO" sin haber probado nada.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ EL "select" ESTÁ AL FINAL Y NO AL PRINCIPIO
-- ---------------------------------------------------------------------
--
-- Porque el editor muestra un panel por sentencia y sólo queda abierto el último. Con el "set"
-- primero y el "select" último, el panel que queda es el que tiene la respuesta.
--
-- ---------------------------------------------------------------------
-- Y LO QUE ESPERAMOS, Y LO QUE SIGNIFICA CADA COSA
-- ---------------------------------------------------------------------
--
-- Todo en cero        Las políticas funcionan. La llave anónima no llega a nada.
-- "trabajadores" 47   Sigue abierta: alguna política pasa sin preguntar por la empresa.
--
-- El 47 es el número que había antes de la 073, así que si vuelve a salir ése, la 073 no cortó lo
-- que decía cortar.

set role anon;

select 'trabajadores'   as tabla, count(*) as filas, 'era 47 antes de la 073' as referencia
union all select 'epp_entregas',  count(*), 'deberia dar 0'  from public.epp_entregas
union all select 'asistencia',   count(*), 'deberia dar 0'  from public.asistencia
union all select 'marcajes',     count(*), 'deberia dar 0'  from public.marcajes
union all select 'tarjetas',     count(*), 'deberia dar 0'  from public.tarjetas
 order by tabla;