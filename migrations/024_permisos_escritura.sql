-- ============================================================
-- Migración 024: poder guardar los roles de un usuario
-- ============================================================
-- EL SÍNTOMA
--
-- Al activar un usuario o cambiarle los permisos en Administración →
-- Usuarios, sale:
--
--   No se pudieron guardar los roles: new row violates row-level
--   security policy for table "perfil_roles"
--
-- La pantalla se ve, se entra, y al guardar rebota. Con más descuido,
-- los roles del usuario quedan borrados: ver el apartado de abajo.
--
-- LA CAUSA
--
-- Hay dos criterios distintos en la base para "¿esta persona es
-- administradora?":
--
--   · la tabla "perfil_roles"   → quién tiene el rol 'admin'
--   · la columna "perfiles.rol" → UN solo texto
--
-- Las migraciones los dejaron inconsistentes:
--
--   · 013 creó "perfil_roles" y dejó su política mirando la columna
--     vieja. Con varios roles marcados, la columna y la tabla dicen
--     cosas distintas.
--   · 014 arregló la política de "perfiles" para usar es_admin().
--   · 016 arregló la de "perfil_roles"... SI SE APLICA.
--
-- Si la 016 está, el criterio ya es correcto y esta migración no hace
-- falta. Si NO está —y es lo habitual, porque salta de la 015 a la 017
-- sin mirarla—, "perfil_roles" sigue con el criterio viejo y bloquea.
--
-- Por qué da justo con varios roles: la app guarda en "perfiles.rol" el
-- PRIMER rol de la lista, para no romper el código viejo que lo lee. Con
-- esto marcado:
--
--   [x] Supervisores   [ ] Administración
--
-- la persona administra de verdad (la tabla tiene el admin y la app le
-- muestra todo el menú), pero la columna quedó en 'supervisores' y la
-- política cree que no. De ahí que entre a la pantalla y rebote al
-- guardar.
--
-- QUÉ HACE ESTA MIGRACIÓN
--
--  1. Las políticas de "perfil_roles" y "roles_permisos" quedan con el
--     criterio correcto, sin depender de si la 016 se aplicó.
--  2. Se separan lectura de escritura, que antes iban juntas en un
--     "for all".
--  3. "perfiles.rol" queda sincronizada sola, para que ninguna parte
--     antigua vuelva a contradecir a la tabla.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 023 -> 024.
-- Si no aplicaste la 016, esto la deja haciendo lo suyo.
-- ============================================================

-- ------------------------------------------------------------
-- 1) FUNCIONES (self-contained, como hicieron la 020, la 021 y la 023)
-- ------------------------------------------------------------
-- Por qué security definer: una política que consulta "perfil_roles"
-- desde la política de "perfil_roles" se llama a sí misma y Postgres la
-- corta con "infinite recursion detected in policy". Con security definer
-- la función corre como su dueño, que sí ignora RLS.
create or replace function public.es_usuario_activo(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles p where p.id = uid and p.activo)
$$;

create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfil_roles r
     where r.user_id = uid and r.rol = 'admin'
  )
$$;

create or replace function public.tiene_permiso(clave text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.perfil_roles pr
      join public.roles_permisos rp on rp.rol = pr.rol
     where pr.user_id = uid
       and rp.permiso = clave
  )
$$;

-- ------------------------------------------------------------
-- 2) perfil_roles
-- ------------------------------------------------------------
drop policy if exists "perfil roles read" on perfil_roles;
create policy "perfil roles read" on perfil_roles for select
  using (public.es_usuario_activo());

drop policy if exists "perfil roles write" on perfil_roles;
create policy "perfil roles write" on perfil_roles for insert
  with check (public.es_usuario_activo() and public.es_admin());

drop policy if exists "perfil roles update" on perfil_roles;
create policy "perfil roles update" on perfil_roles for update
  using (public.es_usuario_activo() and public.es_admin())
  with check (public.es_usuario_activo() and public.es_admin());

drop policy if exists "perfil roles delete" on perfil_roles;
create policy "perfil roles delete" on perfil_roles for delete
  using (public.es_usuario_activo() and public.es_admin());

-- ------------------------------------------------------------
-- 3) roles_permisos: la misma causa, la misma pantalla
-- ------------------------------------------------------------
drop policy if exists "roles permisos read" on roles_permisos;
create policy "roles permisos read" on roles_permisos for select
  using (public.es_usuario_activo());

drop policy if exists "roles permisos write" on roles_permisos;
create policy "roles permisos write" on roles_permisos for all
  using      (public.es_usuario_activo() and public.es_admin())
  with check (public.es_usuario_activo() and public.es_admin());

-- ------------------------------------------------------------
-- 4) LA COLUMLA VIEJA, EN ORDEN
-- ------------------------------------------------------------
-- "perfiles.rol" ya no es la fuente de la verdad, pero la leen partes
-- antiguas. Se deja con el rol de más alcance, que es "admin" cuando lo
-- tiene. Sin esto el síntoma reaparece en cuanto alguien tenga dos roles.
--
-- Se limita a las personas que tienen alguna fila en perfil_roles: las
-- que no, se dejan como están, porque no hay con qué decidir.
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

-- ------------------------------------------------------------
-- 5) COMPROBACIÓN DE SALUD
-- ------------------------------------------------------------
-- Mira el TEXTO de la política, no solo que exista. Si alguien vuelve a
-- aplicar la 013 después de esta, la política regresa al criterio viejo
-- y esto lo avisa en vez de dejarlo para que alguien lo descubra
-- guardando usuarios.
create or replace function public.diagnostico_permisos_escritura()
returns table (
  perfil_roles_ok boolean,
  roles_permisos_ok boolean,
  perfiles_rol_sincronizado boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    -- OJO: se mira "with_check" además de "qual". En una política que es
    -- solo INSERT no hay USING, y la condición vive en with_check: si se
    -- mirara solo "qual", saldría vacía y el diagnóstico daría false
    -- aunque la política esté bien.
    exists (
      select 1 from pg_policies
       where tablename = 'perfil_roles'
         and policyname = 'perfil roles write'
         and (qual like '%es_admin%' or with_check like '%es_admin%')
    ),
    exists (
      select 1 from pg_policies
       where tablename = 'roles_permisos'
         and policyname = 'roles permisos write'
         and (qual like '%es_admin%' or with_check like '%es_admin%')
    ),
    -- Nadie con el rol admin debería tener la columna vieja en otra cosa.
    not exists (
      select 1
        from public.perfiles p
       where exists (select 1 from public.perfil_roles r
                      where r.user_id = p.id and r.rol = 'admin')
         and p.rol is distinct from 'admin'
    )
$$;
