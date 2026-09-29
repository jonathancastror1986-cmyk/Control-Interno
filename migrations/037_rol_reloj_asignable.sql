-- ===================================================================
-- 037 - EL ROL "RELOJ" SE PUEDE ASIGNAR
-- ===================================================================
--
-- Qué pasa
-- --------
-- La migración 033 creó el rol "reloj" en el catálogo de roles
-- (roles_sistema) y le dio su permiso, pero NO lo agregó a
-- roles_validos_array().
--
-- Y el check de la columna perfiles.rol sale justamente de esa función:
--
--   alter table perfiles
--     add constraint perfiles_rol_check
--     check (rol = any(public.roles_validos_array()));
--
-- O sea que el catálogo decía "reloj existe" y la columna decía "reloj no
-- existe". La pantalla de Administracion → Usuarios escribe el rol en
-- perfiles.rol —no en perfil_roles—, así que asignarle el rol Reloj a
-- alguien fallaba con:
--
--   ERROR: 23514: new row for relation "perfiles" violates check
--   constraint "perfiles_rol_check"
--
-- Sin más explicación que un número.
--
--
-- POR QUÉ ESTO BLOQUEA EL KIOSCO
-- -------------------------------
-- El reloj es un aparato que marca y nada más. Para que ese aparato
-- entre al sistema se necesita una cuenta con el rol "reloj": sin ella no
-- hay forma de tener un usuario que solo pueda marcar y no vea fichas,
-- planillas ni reportes.
--
-- Es la "cuenta para reloj" que se pidió. Y no se podía crear: el rol
-- estaba en el catálogo pero no se podía asignar a nadie. Un rol que no
-- se puede asignar no existe.
--
--
-- POR QUÉ NO SE TOCA EL CHECK
-- ---------------------------
-- El check está bien hecho: sale de la función, que es la lista canónica.
-- El que estaba mal era el catálogo de la función, que se quedó corto.
-- Por eso el arreglo es agregar el rol ahí, y no cambiar el check: si se
-- reescribiera el check con los valores a mano, se volvería a desalinear
-- con el catálogo en la próxima migración que agregue un rol. Ya pasó una
-- vez, y por eso la 025 lo dejó así a propósito.

-- ------------------------------------------------------------------
-- EL ARREGLO
-- ------------------------------------------------------------------
-- Se reescribe la función con el rol de más. Es idempotente: se puede
-- aplicar dos veces sin romper nada.

create or replace function public.roles_validos_array()
returns text[]
language sql
immutable
as $$
  select array['admin','rrhh','oficina','porteria','supervisores','tecnica','bodega','prevencion','reloj'];
$$;

comment on function public.roles_validos_array() is
  'La lista canónica de roles. Es la que usa el check de perfiles.rol, y por eso agregar un rol acá es lo único que hay que hacer para que se pueda asignar. Un rol que está en roles_sistema pero no en esta lista NO se puede asignar a nadie: es lo que pasó con "reloj".';

-- ------------------------------------------------------------------
-- QUE EL ROL EXISTA TAMBIÉN EN EL CATÁLOGO
-- ------------------------------------------------------------------
-- La 033 lo insertó, pero se pone por si acaso: aplicar la 037 sin la 033
-- no debe dejar el rol en la lista de válidos sin estar en el catálogo.
insert into public.roles_sistema (rol, nombre, descripcion, orden)
values ('reloj', 'Reloj', 'Solo marca. No ve fichas, ni planillas, ni reportes', 9)
on conflict (rol) do nothing;

-- ------------------------------------------------------------------
-- EL DIAGNÓSTICO
-- ------------------------------------------------------------------
-- Que la lista canónica y el catálogo digan lo mismo. Es la comprobación
-- que faltaba: la 025 dejó una para el caso inverso, pero el caso que
-- importa es este — un rol en el catálogo que la columna no acepta.

create or replace function public.diagnostico_roles_reloj()
returns table (
  problema text,
  detalle  text
)
language sql
stable
as $$
  select 'reloj_no_aceptado_por_el_check'::text,
         'El rol reloj está en roles_sistema pero no en roles_validos_array(), '
         || 'así que no se puede asignar a nadie. Aplica la migración 037.'
  where exists (select 1 from public.roles_sistema where rol = 'reloj')
    and not ('reloj' = any(public.roles_validos_array()))
  union all
  select 'reloj_falta_en_el_catalogo'::text,
         'El rol reloj está en roles_validos_array() pero no en roles_sistema. '
         || 'Se puede asignar pero no tiene nombre ni permisos.'
  where not exists (select 1 from public.roles_sistema where rol = 'reloj')
    and 'reloj' = any(public.roles_validos_array())
  union all
  select 'ok'::text, 'El rol reloj está en el catálogo y se puede asignar.'
  where exists (select 1 from public.roles_sistema where rol = 'reloj')
    and 'reloj' = any(public.roles_validos_array());
$$;

-- ------------------------------------------------------------------
-- LO QUE ESTABA EN PIE ANTES
-- ------------------------------------------------------------------
-- Para volver atrás:
--
--   create or replace function public.roles_validos_array()
--     returns text[] language sql immutable as $$
--     select array['admin','rrhh','oficina','porteria','supervisores',
--                  'tecnica','bodega','prevencion'];
--     $$;
--
-- Y el rol Reloj vuelve a no poder asignarse.
