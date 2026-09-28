-- ============================================================
-- DESBLOQUEO: no se pueden activar usuarios ni guardar roles
-- ============================================================
-- Si al activar un usuario sale:
--
--   No se pudieron guardar los roles: new row violates row-level
--   security policy for table "perfil_roles"
--
-- Pega y ejecuta TODO este archivo, de arriba abajo. Cada paso dice qué
-- está mirando y, si hace falta, se corrige solo. Es re-ejecutable.
--
-- ====================================================================
-- LA EXPLICACIÓN
-- ====================================================================
--
-- Hay DOS criterios distintos en la base para "¿esta persona es
-- administradora?":
--
--   1. La tabla "perfil_roles"  → quién tiene el rol 'admin'.
--   2. La columna "perfiles.rol" → un solo texto.
--
-- Las migraciones fueron dejándolas distintas sin querer:
--
--   · La 013 creó "perfil_roles" y dejó su política mirando la COLUMNA
--     vieja. Con varios roles marcados, esa columna dice una cosa y la
--     tabla dice otra.
--   · La 014 arregló la política de "perfiles" para usar es_admin().
--   · La 016 arregló la de "perfil_roles" también a es_admin().
--
-- Si la 016 no está aplicada, "perfil_roles" sigue mirando la columna.
-- Y como esa columna tiene UN solo valor (la app guarda el primer rol de
-- la lista), con esto:
--
--   [x] Supervisores   [ ] Administración
--
-- la persona SÍ administra —la tabla tiene el admin y la app le muestra
-- todo el menú— pero la columna quedó en 'supervisores', y la base cree
-- que no. Por eso se ve la pantalla, se entra, y al guardar rebota.
--
-- ====================================================================


-- --------------------------------------------------------------------
-- PASO 1 · DIAGNÓSTICO (solo lee)
-- --------------------------------------------------------------------
-- Dice si falta la 016, y qué roles tiene tu cuenta.

-- ¿La política de perfil_roles usa el criterio viejo o el nuevo?
select
  policyname,
  qual                                                          as condicion,
  case when qual like '%es_admin%' then 'correcta (es_admin)'
       when qual like '%perfiles%' then 'VIEJA (mira perfiles.rol)'
       else 'revisar' end                                        as estado
  from pg_policies
 where tablename = 'perfil_roles'
 order by policyname;

-- ¿Quién eres tú y qué tienes?
select
  u.email,
  p.rol                                                         as columna_vieja,
  p.activo,
  coalesce((select string_agg(r.rol, ', ' order by r.rol)
              from perfil_roles r where r.user_id = p.id), '(ninguno)') as tabla_de_roles,
  (select count(*) from roles_permisos rp
     join perfil_roles r2 on r2.rol = rp.rol
    where r2.user_id = p.id)                                    as permisos_totales
  from perfiles p
  left join auth.users u on u.id = p.id
 order by p.nombre;


-- --------------------------------------------------------------------
-- PASO 2 · EL ARREGLO DE VERDAD
-- --------------------------------------------------------------------
-- Pega y ejecuta desde acá hasta el final. Son pasos idempotentes: se
-- pueden correr las veces que haga falta.

-- 2.1) Las funciones de permiso, que leen la tabla de roles y no la
--      columna vieja. Se recrean acá para no depender del orden.
create or replace function public.es_usuario_activo(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.perfiles p where p.id = uid and p.activo) $$;

create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.perfil_roles r where r.user_id = uid and r.rol = 'admin') $$;

create or replace function public.tiene_permiso(clave text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
         select 1 from public.perfil_roles pr
           join public.roles_permisos rp on rp.rol = pr.rol
          where pr.user_id = uid and rp.permiso = clave) $$;

-- 2.2) Las políticas, con el criterio correcto. Esto es lo que
--      desbloquea el guardado.
drop policy if exists "perfil roles read" on perfil_roles;
create policy "perfil roles read" on perfil_roles for select
  using (public.es_usuario_activo());

drop policy if exists "perfil roles write" on perfil_roles;
create policy "perfil roles write" on perfil_roles for insert
  with check (public.es_usuario_activo() and public.es_admin());

drop policy if exists "perfil roles delete" on perfil_roles;
create policy "perfil roles delete" on perfil_roles for delete
  using (public.es_usuario_activo() and public.es_admin());

drop policy if exists "perfil roles update" on perfil_roles;
create policy "perfil roles update" on perfil_roles for update
  using (public.es_usuario_activo() and public.es_admin())
  with check (public.es_usuario_activo() and public.es_admin());

-- 2.3) Lo mismo en "roles_permisos", que es la pantalla de permisos por
--      rol: fallaba por la misma causa.
drop policy if exists "roles permisos read" on roles_permisos;
create policy "roles permisos read" on roles_permisos for select
  using (public.es_usuario_activo());

drop policy if exists "roles permisos write" on roles_permisos;
create policy "roles permisos write" on roles_permisos for all
  using      (public.es_usuario_activo() and public.es_admin())
  with check (public.es_usuario_activo() and public.es_admin());

-- 2.4) La columna vieja, dejada coherente. No es la fuente de la verdad,
--      pero partes antiguas la leen. Se pone 'admin' cuando la persona lo
--      tiene entre sus roles, que es el rol de más alcance: es lo que un
--      lector de la columna vieja espera encontrar.
update public.perfiles p
   set rol = coalesce(
     (select 'admin' from public.perfil_roles r
       where r.user_id = p.id and r.rol = 'admin' limit 1),
     (select r.rol from public.perfil_roles r
       join public.roles_sistema rs on rs.rol = r.rol
      where r.user_id = p.id order by rs.orden nulls last, r.rol limit 1),
     p.rol
   )
 where exists (select 1 from public.perfil_roles r where r.user_id = p.id);


-- --------------------------------------------------------------------
-- PASO 3 · COMPROBAR
-- --------------------------------------------------------------------
-- Ahora todas las políticas de perfil_roles deben decir "correcta".

select
  policyname,
  case when qual like '%es_admin%' then 'correcta' else 'revisar' end as estado
  from pg_policies
 where tablename = 'perfil_roles'
 order by policyname;

select nombre, rol, activo
  from perfiles
 where rol = 'admin';


-- --------------------------------------------------------------------
-- PASO 4 · SI AUN ASÍ NO DEJA GUARDAR
-- --------------------------------------------------------------------
-- Entonces el problema es otro: tu cuenta no tiene el rol admin en la
-- tabla de roles, aunque la pantalla te la muestre. Para dárselo:

--   insert into perfil_roles (user_id, rol)
--   select p.id, 'admin' from perfiles p
--    where lower(coalesce((select email from auth.users u where u.id = p.id), p.nombre, ''))
--          like '%jonathan%'
--   on conflict (user_id, rol) do nothing;
--
--   update perfiles set rol = 'admin', activo = true
--    where id = (select p.id from perfiles p
--                 join auth.users u on u.id = p.id
--                where lower(coalesce(u.email, '')) like '%jonathan%' limit 1);
--
-- Con eso tu cuenta administra de verdad, y con eso la app te deja
-- activar usuarios y cambiar permisos.
