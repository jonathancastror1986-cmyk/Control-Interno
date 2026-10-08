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
--   1. Pegá esto en el SQL Editor de Supabase y corrélo.
--   2. Copiá el resultado y mandámelo.
--
-- Y QUÉ SIGNIFICA CADA RESULTADO
--
--   "todo en orden"      la pantalla se puede hacer, y tiene que mostrar la lista
--                        vacía con un mensaje. UNA TABLA VACÍA NO ES UN ERROR:
--                        es lo que se ve el primer día.
--
--   "faltan columnas"    la migración 086 está a medias. No la vuelvas a correr
--                        entera: avisame y vemos qué parte quedó.
--
--   "no hay permisos"     las funciones no llegaron, o el usuario no tiene
--                        permiso para pedirlos. Con el "detail" se sabe cuál.
--
-- Y POR QUÉ EL CONTEO DE FILAS VA EN UNA CONSULTA SEPARADA
--
-- Porque "cuántos permisos hay" y "la tabla existe" no pueden contestarse con la
-- misma consulta: si el SELECT de columnas falla, no te dice cuántos hay, y si
-- el conteo viene en cero no te dice si es porque está vacía o porque no existe.
-- Separadas, cada una contesta lo suyo.

-- ---------------------------------------------------------------------
-- 1. LA TABLA Y SUS COLUMNAS
-- ---------------------------------------------------------------------
--
-- Las quince, con las que la pantalla los necesita. Si falta una, la consulta
-- devuelve la que sí está y se ve enseguida cuál falta.
select
  'columnas'      as que,
  count(*)        as cuantas,
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
-- creada y seguir dando permission denied en tiempo de ejecución, y eso lo
-- decide el "grant", que es una cosa aparte de la creación.
--
-- Por eso después hay un intento de llamada de verdad.
select
  'funciones'     as que,
  count(*)        as cuantas,
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
  public.es_usuario_activo()  as activo,
  public.es_admin()            as admin,
  public.tiene_permiso('tarja.marcaje')          as puede_pedir,
  public.tiene_permiso('tarja.aprobar_cambio')   as puede_resolver;

-- ---------------------------------------------------------------------
-- 4. LA LLAMADA DE VERDAD, QUE ES LA ÚNICA QUE SÍ PRUEBA
-- ---------------------------------------------------------------------
--
-- Con una fecha vieja y un motivo que dice que es una prueba. Esto ESCRIBE una
-- fila, y por eso va al final y termina respaldando.
--
-- Si esto no da error, la pantalla puede pedir permisos y no hay nada más que
-- comprobar del lado de la base. Si da error, el "detail" trae el motivo en
-- castellano, porque las funciones lo escriben así a propósito: un
-- "violates check constraint" no le dice a nadie qué hacer.
--
-- Y NO ES "SELECT": es un "do", porque una función que inserta no se puede usar
-- en un SELECT.
do $$
declare
  v_id uuid;
begin
  v_id := public.pedir_permiso_horario(
    p_code        := '__COMPROBACION__',
    p_fecha       := date '2000-01-01',
    p_hora_inicio := time '11:00',
    p_hora_fin    := time '14:00',
    p_motivo      := 'Fila de comprobacion: se puede borrar sin problema'
  );

  raise notice 'OK: se pidio el permiso y devolvio el id %', v_id;

  -- Y AHORA SE RESUELVE, PARA PROBAR LA SEGUNDA FUNCIÓN
  --
  -- Con p_acepta en false, que la deja en 'anulado', y 'anulado' es el único
  -- estado del que no queda prohibition para volver a pedir el mismo horario.
  public.resolver_permiso_horario(v_id, false, 'Comprobacion: se anula');
  raise notice 'OK: se resolvio el permiso';

exception
  when others then
    raise exception 'FALLO: % (codigo %)', sqlerrm, sqlstate;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. LO QUE DEJÓ LA COMPROBACIÓN, QUE HAY QUE LIMPIAR
-- ---------------------------------------------------------------------
--
-- Se listan las filas que creó el paso 4. Tiene que salir exactamente una, con
-- estado 'anulado'.
--
-- Y si el paso 4 falló antes de insertar, esto sale vacío: eso también es una
-- respuesta, y quiere decir que el problema está arriba y no acá.
select
  id, code, fecha, hora_inicio, hora_fin, motivo, estado, comentario
from public.permiso_horario
where code = '__COMPROBACION__'
order by id desc;

-- Y PARA LIMPIARLA, DESPUÉS DE VER EL RESULTADO DEL PASO 5
--
-- Borra las filas de comprobación. Es un "delete" y por eso está aparte, para
-- que nadie lo corra sin querer junto con las consultas de arriba.
--
--   delete from public.permiso_horario where code = '__COMPROBACION__';
