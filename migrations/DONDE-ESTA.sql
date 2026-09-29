-- POR QUÉ UNA CONSULTA VE LA TABLA Y LA OTRA NO
--
-- Esto se ve en un editor de SQL de Supabase cuando el proyecto tiene más de
-- una base, o cuando la sesión quedó pegada a una base y las migraciones se
-- aplicaron en otra. Un editor pegado a la base equivocada falla en silencio:
-- las consultas al catálogo responden igual, y solo rompen las que leen tablas
-- de verdad. Por eso una consulta dice que la tabla existe y la otra, al
-- leerla, no la encuentra.
--
-- to_regclass es la prueba: devuelve el nombre de la relación si existe, y NULL
-- si no, SIN dar error. Con "select ... from public.profiles" el error rompe
-- la consulta entera y no sabemos nada más.
select
  current_database()                                        as base_actual,
  current_user                                              as usuario_actual,
  current_schema()                                          as esquema_actual,
  (select string_agg(current_setting('search_path'), ', ')) as search_path,
  to_regclass('public.profiles')                            as perfiles_via_regclass,
  to_regclass('public.config_limite_amonestacion')          as config_limite_via_regclass,
  to_regclass('public.ingresos_pendientes')                as ingresos_via_regclass,
  to_regclass('public.trabajadores')                       as trabajadores_via_regclass,
  (select count(*)::int from pg_database
     where datallowconn and not datistemplate)             as cuantas_bases;
