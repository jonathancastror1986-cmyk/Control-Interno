
-- ¿FUNCIONA EL SISTEMA DE PERMISOS?
--
-- Es la llamada REAL a es_usuario_activo(), no una que devuelva un texto fijo.
--
-- Va la última a propósito, porque el editor de SQL solo muestra el último
-- resultado. Si esta falla, el error que sale ES la respuesta, y es más claro
-- que cualquier texto que yo pudiera poner acá.
--
-- Cómo se lee:
--
--   sale false  -> la función corrió y respondió que no hay usuario. Normal en
--                  el editor de SQL, donde no hay sesión. El sistema de
--                  permisos está de pie.
--   sale true   -> también de pie, y además hay sesión.
--   sale error  -> dice que no existe la relación "perfiles". Entonces
--                  es_usuario_activo() falla, y con ella TODAS las migraciones
--                  que la usan: la 016, la 019, la 020, la 021, la 023, la 024
--                  y la 046. Eso no es un detalle de la 046: es el sistema de
--                  permisos entero.
--
select
  (select count(*)::int from roles_sistema)               as roles_en_catalogo,
  (select count(*)::int from roles_permisos)              as asignaciones,
  (select count(*)::int from permisos)                    as permisos,
  (select count(*)::int
     from roles_sistema r
     join roles_permisos rp on rp.rol = r.rol
    where rp.permiso like 'ingresos.%' or rp.permiso like 'amonestaciones.%')
                                                          as permisos_nuevos,
  to_regclass('public.perfiles')::text                    as perfiles;

-- Y ahora la llamada de verdad. Si esta fila no aparece, el error de arriba es
-- la respuesta.
select public.es_usuario_activo() as el_sistema_de_permisos_esta_de_pie;
