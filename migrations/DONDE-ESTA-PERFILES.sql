-- DÓNDE ESTÁ REALMENTE "perfiles", Y SI EL SISTEMA DE PERMISOS FUNCIONA
--
-- Ya sabemos que "to_regclass('public.profiles')" da null, y que al mismo
-- tiempo information_schema dice que hay una relación con ese nombre en el
-- esquema public. Las dos cosas no pueden ser verdad a la vez, y por eso hace
-- falta el tipo exacto y el esquema real.
--
-- Y la segunda parte es la urgente. es_usuario_activo() lee public.profiles.
-- Si la tabla no está, esa función falla, y con ella TODO el sistema de
-- permisos: no solo la 046.
--
-- "prueba_lectura" es lo que decide si el sistema de permisos está de pie:
--   "ok"  -> es_usuario_activo() corrió, y el sistema de permisos funciona
--   texto -> el error exacto que devuelve
--
select
  c.relname                                  as nombre,
  n.nspname                                  as esquema_real,
  case c.relkind
    when 'r' then 'tabla'
    when 'v' then 'vista'
    when 'm' then 'vista materializada'
    when 'f' then 'tabla externa'
    when 'p' then 'tabla particionada'
    else c.relkind::text
  end                                        as tipo,
  pg_get_userbyid(c.relowner)                as duena,
  (select string_agg(quote_ident(n2.nspname), ', ')
     from pg_class c2 join pg_namespace n2 on n2.oid = c2.relnamespace
    where c2.relname = 'perfiles')           as todos_los_esquemas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relname in ('perfiles', 'perfil_roles', 'roles_permisos', 'roles_sistema')
 order by c.relname, n.nspname;
