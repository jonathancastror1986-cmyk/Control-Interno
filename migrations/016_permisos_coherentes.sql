-- ============================================================
-- Migración 016: que la base y la interfaz razonen lo mismo
-- ============================================================
-- El problema: la 013 escribió las políticas de RLS mirando la columna
-- vieja "perfiles.rol" (un solo rol), pero la 013 también creó
-- "perfil_roles" (varios roles por usuario) y es la que lee la
-- aplicación para decidir qué menús y botones mostrar.
--
-- Como son dos fuentes de verdad, pueden discrepar:
--   · la pantalla habilita "Aprobar" y la base rechaza el UPDATE, o
--   · la base lo permitiría pero la pantalla esconde el botón.
-- Con una solicitud de cambio sin aparecer en la cola de RRHH, esto es
-- justo lo que se produjo.
--
-- Aquí las dos quedan en la misma fuente: todas las políticas pasan a
-- usar funciones security definer que leen perfil_roles.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 015 -> 016.
-- ============================================================

-- ------------------------------------------------------------
-- 0) LAS FUNCIONES QUE USA EL RESTO DE ESTA MIGRACIÓN
-- ------------------------------------------------------------
-- Se crean (o reemplazan) aquí para que la 016 no dependa de que la 014
-- se haya aplicado: si falta alguna, el CREATE POLICY falla con
-- "function es_usuario_activo() does not exist" y no queda claro por qué.
--
-- Por qué security definer: una política que consulta "perfiles" desde
-- otra política de "perfiles" hace recursión infinita. Como TODAS las
-- políticas del proyecto necesitan preguntar si el usuario está activo,
-- la pregunta se hace desde una función que se ejecuta con los
-- privilegios del dueño (que sí ignora RLS) y así no se dispara a sí misma.
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

-- "¿tiene este permiso?". Así la base decide lo mismo que la pantalla
-- "Permisos por rol": si a alguien le marcas un permiso, la interfaz se
-- lo habilita y la base lo acepta (y no al revés).
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

-- Si la 013 no está aplicada, el paso 1 falla con "relation perfil_roles
-- does not exist". Ejecuta antes 013_roles_permisos.sql.

-- ------------------------------------------------------------
-- 1) SINCRONIZAR LAS DOS COLUMNAS DE ROL
-- ------------------------------------------------------------
-- El rol de la columna vieja "perfiles.rol" se agrega a "perfil_roles"
-- si es que no estaba. Es aditivo: no se quita nada, solo se completa.
--
-- Hace falta porque el alta automática de la 014 (handle_new_user) les
-- puso "oficina" a todos los usuarios nuevos en perfil_roles. Si a
-- alguien después se le cambió el rol editando solo "perfiles.rol" (por
-- SQL, o desde el panel de Supabase), quedó con permisos que la app no
-- le muestra: el síntoma es exactamente "envié la solicitud y no aparece
-- en la cola de RRHH".
--
-- La app escribe siempre las dos columnas juntas, así que para lo que se
-- hace desde la interfaz esto no cambia nada: solo repara lo que quedó a
-- medias.
insert into perfil_roles (user_id, rol)
select p.id, p.rol
  from perfiles p
 join roles_sistema r on r.rol = p.rol
 where p.rol is not null
on conflict (user_id, rol) do nothing;

-- A partir de acá la columna "perfiles.rol" queda solo como respaldo: la
-- aplicación y las políticas la usan únicamente a través de perfil_roles.

-- ------------------------------------------------------------
-- 2) LAS POLÍTICAS PASAN A LEER perfil_roles
-- ------------------------------------------------------------
-- Se vuelven a crear todas sobre las funciones del paso 0, que por
-- dentro leen perfil_roles desde un security definer.

drop policy if exists "perfil roles read" on perfil_roles;
create policy "perfil roles read" on perfil_roles for select
  using (public.es_usuario_activo());

drop policy if exists "perfil roles write" on perfil_roles;
create policy "perfil roles write" on perfil_roles for all
  using      (public.es_admin())
  with check (public.es_admin());

drop policy if exists "roles permisos read" on roles_permisos;
create policy "roles permisos read" on roles_permisos for select
  using (public.es_usuario_activo());

drop policy if exists "roles permisos write" on roles_permisos;
create policy "roles permisos write" on roles_permisos for all
  using      (public.es_admin())
  with check (public.es_admin());

-- Solicitudes de cambio: ahora la base exige exactamente los mismos
-- permisos que la pantalla usa para mostrar los botones.
drop policy if exists "solicitudes read" on solicitudes_cambio_asistencia;
create policy "solicitudes read" on solicitudes_cambio_asistencia for select
  using (public.es_usuario_activo());

drop policy if exists "solicitudes insert" on solicitudes_cambio_asistencia;
create policy "solicitudes insert" on solicitudes_cambio_asistencia for insert
  with check (public.es_usuario_activo());

drop policy if exists "solicitudes update" on solicitudes_cambio_asistencia;
create policy "solicitudes update" on solicitudes_cambio_asistencia for update
  using      (public.es_admin() or public.tiene_permiso('tarja.aprobar_cambio'))
  with check (public.es_admin() or public.tiene_permiso('tarja.aprobar_cambio'));

-- ------------------------------------------------------------
-- 4) EL ALTA DE USUARIOS YA NO REGALA PERMISOS
-- ------------------------------------------------------------
-- Este trigger es el de la 014 con un cambio importante. Antes dejaba
-- "oficina" en perfil_roles a todo usuario nuevo, y "oficina" tiene
-- "tarja.editar": un supervisor invitado a la app terminaba con los dos
-- roles, heredaba el de editar, y desde la tarja de su equipo el cambio
-- de estado se le aplicaba solo en vez de quedar pendiente de RRHH.
--
-- Ahora el usuario nuevo nace SIN roles y con activo = false. La app
-- muestra un aviso en rojo pidiéndole a un administrador que se los
-- asigne en Soporte -> Usuarios, que es donde corresponde decidir.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.perfiles (id, nombre, rol, activo)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'oficina', false)
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 5) COMPROBACIÓN DE SALUD
-- ------------------------------------------------------------
-- La app la llama al entrar para avisar, en pantalla, si algo quedó
-- desalineado. Así el problema se ve en vez de aparecer como una cola
-- vacía sin explicación.
create or replace function public.diagnostico_permisos(uid uuid default auth.uid())
returns table (
  usuario_activo boolean,
  es_admin boolean,
  roles text,
  puede_solicitar boolean,
  puede_aprobar boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.es_usuario_activo(uid),
    public.es_admin(uid),
    coalesce((select string_agg(pr.rol, ', ' order by pr.rol)
                from public.perfil_roles pr where pr.user_id = uid), '(sin roles)'),
    public.tiene_permiso('tarja.solicitar_cambio', uid),
    public.tiene_permiso('tarja.aprobar_cambio', uid)
$$;
