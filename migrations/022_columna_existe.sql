-- ============================================================
-- Migración 022: preguntar a la base si una columna existe
-- ============================================================
-- El error que aparecía al importar el archivo de trabajadores:
--
--   Could not find the 'rut' column of 'trabajadores' in the schema
--   cache
--
-- Dice qué falta, pero NO por qué, y hay dos causas con arreglos que
-- no tienen nada que ver entre sí:
--
--   1. La migración no está aplicada. La columna no existe.
--      → hay que ejecutar un archivo .sql
--
--   2. La migración SÍ está aplicada, pero PostgREST tiene el esquema
--      viejo en memoria. La columna existe; lo que no la ve es la API.
--      → hay que correr NOTIFY pgrst, 'reload schema';
--
-- Es la diferencia entre "no lo hice" y "lo hice y no se enteró", y el
-- usuario no tiene forma de distinguirlas desde el error. Peor: la 2 es
-- lo que pasa siempre después de aplicar una migración, así que el
-- mensaje que más se ve es el que menos ayuda.
--
-- Lo peligroso del caso 2 es que se corrige "a lo loco": si el mensaje
-- dice "falta la migración", la reacción es volver a ejecutarla, que no
-- arregla nada porque ya estaba, y queda la duda de si la migración
-- sirve o está mala. Por eso hay que poder preguntar.
--
-- POR QUÉ ES UNA FUNCIÓN Y NO UNA CONSULTA DIRECTA
--
-- La pregunta tiene que llegar a information_schema, que es la base
-- real. Un select a "trabajadores" Passa por PostgREST, que es
-- justamente quien tiene la caché vieja: volvería a decir que no
-- existe, y no se avanzaría nada. Por eso va como RPC: la ejecuta
-- Postgres, no la caché.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 021 -> 022.
-- ============================================================

create or replace function public.columna_existe(tabla text, columna text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = tabla
       and column_name  = columna
  )
$$;

-- Que cualquiera con sesión pueda preguntar. Solo lee el catálogo: no
-- devuelve datos de la tabla, solo si una columna está. Y es
-- information_schema, que además solo muestra lo que el usuario puede
-- ver, así que no sirve para espiar el esquema de otro.
grant execute on function public.columna_existe(text, text) to authenticated, anon;

-- ------------------------------------------------------------
-- COMPROBACIÓN DE SALUD
-- ------------------------------------------------------------
-- Para que la app pueda decir "la función no existe" en vez de fallar
-- con un error de rpc.
create or replace function public.diagnostico_columna_existe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Se llama a sí misma: si la función existiera y estuviera rota, esto
  -- daría false en vez de reventar el diagnóstico.
  select public.columna_existe('trabajadores', 'rut') is not null
$$;
