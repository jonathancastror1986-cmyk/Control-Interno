-- ===================================================================
-- comprobar-086-permisos-horarios.sql
-- ===================================================================
-- QUÉ COMPRUEBA Y POR QUÉ NO ES UN "SELECT 1"
-- ===================================================================
--
-- Porque la pregunta que importa no es "¿existe la tabla?", que ya sabemos que
-- existe, sino "¿puede el Javascript talking con ella?".
--
-- Y eso son tres cosas separadas, que pueden fallar por separado y dar el mismo
-- symptom en pantalla:
--
--   1. que la tabla exista con todas sus columnas
--   2. que las dos funciones existan y se puedan llamar
--   3. que el RLS deje pasar a este usuario
--
-- Y el síntoma de las tres es el mismo: la pestaña de permisos no muestra nada.
-- Por eso la comprobación tiene que distinguir, y no devolver un "ok" genérico.
--
-- ---------------------------------------------------------------------
-- CÓMO SE USA
-- ---------------------------------------------------------------------
--
--   1. Pegá esto entero en el SQL Editor de Supabase y corrélo.
--   2. Copiá TODOS los resultados y mandámelos, en orden.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ SON "SELECT" SUELTOS Y NO UN "DO" CON MANEJADOR DE ERROR
-- ---------------------------------------------------------------------
--
-- Porque la primera versión de este archivo metía las llamadas dentro de un
-- "do $$ ... $$" con un "exception when others" que volvía a levantar el error. Y
-- se probó: en el editor SQL de Supabase, un error en el medio del script corta
-- TODO lo que sigue. Un solo paso malo te deja sin ver los otros cuatro, y con
-- un "ok" parcial que no sirve para nada.
--
-- Con un "select" por paso, cada uno es un resultado aparte: el que falla marca
-- rojo y los demás se muestran igual. Se pierde eltry de "un error corta el
-- script", que es exactamente lo que había que evitar.
--
-- Y el manejo del error ahora es al revés: la consulta que falla HABLA, y su
-- mensaje es la respuesta. Las funciones de la 086 escriben sus errores en
-- castellano a propósito, porque un "violates check constraint" no le dice a
-- nadie qué hacer.

-- ---------------------------------------------------------------------
-- 1. LA TABLA Y SUS COLUMNAS
-- ---------------------------------------------------------------------
--
-- Las quince, con las que la pantalla los necesita. Si falta una, este conteo
-- lo dice y el paso 2 dice cuál.
select
  'columnas' as que,
  count(*)   as cuantas,
  case when count(*) = 15 then 'todo en orden'
       else 'faltan columnas' end as veredicto
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'permiso_horario';

-- Y QUÉ COLUMNAS FALTAN, CON SU NOMBRE, PORQUE "faltan columnas" NO ALUNZA
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'permiso_horario'
order by ordinal_position;

-- ---------------------------------------------------------------------
-- 2. LAS DOS FUNCIONES
-- ---------------------------------------------------------------------
--
-- Que existan no es lo mismo que que se puedan llamar. Una función puede estar
-- creada y seguir dando permission denied al invocarla, y eso lo decide el
-- "grant", que es una cosa aparte de la creación. Por eso más abajo hay un
-- intento de llamada de verdad, y este paso solo mira que estén las dos.
select
  'funciones' as que,
  count(*)    as cuantas,
  case when count(*) = 2 then 'todo en orden'
       else 'no hay permisos' end as veredicto
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('pedir_permiso_horario','resolver_permiso_horario');

-- ---------------------------------------------------------------------
-- 3. LOS PERMISOS QUE TIENE ESTE USUARIO
-- ---------------------------------------------------------------------
--
-- Esto se ve desde la sesión del usuario que va a usar la aplicación, que no es
-- el mismo rol que el del editor SQL. Si acá salen todos en false pero en la
-- aplicación funcionan, el problema no es la base: es que el usuario que estás
-- probando no tiene el permiso.
--
-- Y "tarja.marcaje" es el de PEDIR, y "tarja.aprobar_cambio" el de RESOLVER. Son
-- distintos a propósito: con el mismo, un supervisor podría aprobarse a sí mismo
-- el permiso que acaba de pedir, y el circuito de "alguien lo revisa" no revisaría
-- nada.
select
  'permisos' as que,
  public.es_usuario_activo()             as activo,
  public.es_admin()                       as admin,
  public.tiene_permiso('tarja.marcaje')        as puede_pedir,
  public.tiene_permiso('tarja.aprobar_cambio') as puede_resolver;

-- ---------------------------------------------------------------------
-- 4. QUE HAYA AL MENOS UN TRABAJADOR
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ ESTE PASO ESTÁ, Y POR QUÉ LA PRIMERA VERSIÓN DEL ARCHIVO NO LO TENÍA
--
-- Porque "code" tiene clave foránea a "trabajadores(code)". Y la primera versión
-- usaba un código inventado, '__COMPROBACION__', que por supuesto no existe en
-- ninguna ficha. El paso de pedir el permiso fallaba con una violación de clave
-- foránea, en una base que estaba perfectamente bien.
--
-- Una comprobación que falla cuando todo está bien teaches a ignorar los
-- errores de la comprobación, y ese es el peor daño que puede hacer.
--
-- Así que el código sale de acá, de una ficha real.
select
  'trabajadores' as que,
  count(*)       as cuantos,
  (select code from public.trabajadores order by code limit 1) as uno_para_probar
from public.trabajadores;

-- ---------------------------------------------------------------------
-- 5. PEDIR UN PERMISO DE VERDAD
-- ---------------------------------------------------------------------
--
-- Con una fecha vieja y un motivo que dice que es una prueba. Esto ESCRIBE una
-- fila. Si este paso no da error, la pantalla puede pedir permisos y no hay nada
-- más que comprobar del lado de la base.
--
-- Y el "code" sale de un trabajador real, y no se escribe en el texto: así el
-- mismo archivo sirve aunque las fichas tengan otros códigos.
--
-- Y QUE SE USE EL MOTIVO PARA MARCAR LA FILA, Y NO EL CÓDIGO
--
-- Porque el motivo es el único campo que es de esta comprobación y no del
-- negocio. Con una marca en el "code" habría que inventar un código que no
-- existe; con una marca en el motivo, el paso 6 la encuentra y el borrado del
-- final la borra, y ninguna de las dos depende de conocer las fichas.
select
  'pedir' as que,
  public.pedir_permiso_horario(
    p_code        := (select code from public.trabajadores order by code limit 1),
    p_fecha       := date '2000-01-01',
    p_hora_inicio := time '11:00',
    p_hora_fin    := time '14:00',
    p_motivo      := 'COMPROBACION automatica 086: se puede borrar sin problema'
  ) as id;

-- ---------------------------------------------------------------------
-- 6. RESOLVERLO, PARA PROBAR LA SEGUNDA FUNCIÓN
-- ---------------------------------------------------------------------
--
-- Con p_acepta en false, que la deja en 'anulado'. Y 'anulado' es el único estado
-- del que no queda prohibición para volver a pedir el mismo horario, así que la
-- fila no bloquea nada.
--
-- Y POR QUÉ BUSCA EL ID CON UN "SELECT" Y NO CON UNA VARIABLE
--
-- Porque no hay variables entre consultas. Y da lo mismo: los "select" de un
-- script se ejecutan en orden, así que la fila que acaba de insertar el paso 5 ya
-- existe cuando corre este. Y la función devuelve "void", así que el resultado
-- es una fila, y lo que interesa es que no haya dado error.
select
  'resolver' as que,
  public.resolver_permiso_horario(
    p_id         := (select id from public.permiso_horario
                     where motivo like 'COMPROBACION automatica 086%'
                     order by id desc limit 1),
    p_acepta     := false,
    p_comentario := 'Comprobacion 086: se anula, no es un permiso real'
  ) as hecho;

-- ---------------------------------------------------------------------
-- 7. LO QUE DEJÓ LA COMPROBACIÓN, QUE HAY QUE LIMPIAR
-- ---------------------------------------------------------------------
--
-- Tiene que salir exactamente una fila, con estado 'anulado'.
--
-- Y si este paso sale vacío, ES UNA RESPUESTA: quiere decir que el paso 5 no llegó
-- a insertar, y hay que mirar el error que dio ese paso, no este.
select
  id, code, fecha, hora_inicio, hora_fin, estado, comentario
from public.permiso_horario
where motivo like 'COMPROBACION automatica 086%'
order by id desc;

-- Y PARA LIMPIARLA, DESPUÉS DE HABER VISTO EL RESULTADO DEL PASO 7
--
-- Borra las filas de comprobación. Es un "delete" y por eso está aparte y
-- comentado, para que nadie lo corra sin querer junto con las consultas de
-- arriba. Son de este archivo y de ningún negocio.
--
--   delete from public.permiso_horario
--    where motivo like 'COMPROBACION automatica 086%';

-- Y PARA VOLVER ATRÁS DEL TODO
--
--   drop table if exists public.permiso_horario cascade;
