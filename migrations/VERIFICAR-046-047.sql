-- ===================================================================
-- VER SI LA 046 Y LA 047 QUEDARON BIEN, SIN EJECUTAR NADA
-- ===================================================================
--
-- Por qué una consulta y no la de invocar las funciones:
--
-- Pega esto entero, desde la primera línea hasta la última, y dale Run.
--
-- -------------------------------------------------------------------
-- POR QUÉ UNA CONSULTA DE CATÁLOGO Y NO UNA QUE INVOQUE LAS FUNCIONES
-- -------------------------------------------------------------------
-- El editor de SQL de Supabase parte las sentencias, y un bloque de código con
-- manejadores de excepción adentro tiene muchos punto y coma: es justo lo que
-- se corta a la mitad. La consulta anterior no corrió porque el editor empezó
-- a mitad de un comentario de este archivo.
--
-- Esta no tiene bloques, ni manejadores, ni nada que se pueda cortar. Son
-- consultas de lectura sobre el catálogo, y el catálogo no falla. Si esto sale,
-- las dos migraciones quedaron aplicadas.
--
-- -------------------------------------------------------------------
-- LO QUE MUESTRA, Y POR QUÉ CADA COSA
-- ------------------------------------
-- "prosrc" es el texto EXACTO de la función tal como quedó en tu base. Con eso
-- se comparan las funciones una por una, sin tener que adivinar.
--
-- La parte importante es la última: si el cuerpo de una función dice
-- "public.profiles" y el archivo del proyecto dice "profiles", esa es la
-- diferencia que se venía buscando.
-- ===================================================================

-- 1) Las tablas, los índices y el RLS
select
  t.tabla,
  c.relrowsecurity                             as rls_encendido,
  (select count(*)::int from pg_policies p
     where p.schemaname = 'public' and p.tablename = t.tabla) as politicas
from (values ('ingresos_pendientes'), ('trabajador_amonestaciones'),
             ('config_limite_amonestacion')) as t(tabla)
left join pg_class c on c.relname = t.tabla
left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order by 1;

-- 2) Los índices que creamos
select tablename, indexname
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('ingresos_pendientes', 'trabajador_amonestaciones',
                     'config_limite_amonestacion')
 order by 1, 2;

-- 3) Los permisos nuevos
select clave, categoria, orden
  from permisos
 where clave like 'ingresos.%' or clave like 'amonestaciones.%'
 order by orden;

-- 4) LAS FUNCIONES: si existen, con qué firma, y QUÉ DICE SU CUERPO
select
  n.nspname || '.' || p.proname                        as funcion,
  pg_get_function_identity_arguments(p.oid)            as argumentos,
  p.prosrc                                              as cuerpo
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'pedir_ingreso', 'aprobar_ingreso_pendiente', 'rechazar_ingreso_pendiente',
     'corregir_ingreso_pendiente', 'ver_ingresos_pendientes',
     'diagnostico_ingresos_pendientes',
     'registrar_amonestacion', 'archivar_amonestacion', 'ver_amonestaciones',
     'limite_amonestacion', 'diagnostico_amonestaciones')
 order by 1;

-- 5) LA COLUMNA QUE SE ESTABA BUSCANDO
-- -------------------------------------------------------------------
-- Esta es la que decide si el error "relation profiles does not exist" era
-- mío o de PGlite. Cuenta cuántas veces aparece cada forma dentro del cuerpo
-- de las funciones:
--
--   perfiles_sin_prefijo = 0  -> las funciones usan "profiles", y con el
--                                  search_path en public deberían encontrarlo
--   perfiles_con_prefijo  > 0  -> quedó "public.profiles", que en un
--                                  "set search_path = public" también funciona,
--                                  pero conviene verlo
--
-- Y "tabla_perfiles_existe" dice si la tabla está de verdad, que es la mitad
-- del misterio: el error decía que no existía.
select
  (select count(*) from public.profiles) > 0              as tabla_profiles_existe,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc ~ '[^.a-z_]perfiles')  as perfiles_sin_prefijo,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc ~ 'public\.perfiles')   as perfiles_con_prefijo,
  (select string_agg(n.nspname || '.' || p.proname, ', ')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~ 'perfiles')            as donde_se_usan;
