-- ============================================================
-- Migración 002: gestión de usuarios (perfiles) desde la app
-- ============================================================

-- Reemplaza la política de solo-lectura por lectura/escritura para
-- cualquier usuario ya activo (mismo criterio que el resto de tablas),
-- así un admin puede ver y editar el rol/estado de todos los usuarios
-- desde la sección "Usuarios" de la app.
drop policy if exists "perfiles self read" on perfiles;
drop policy if exists "perfiles rw" on perfiles;
create policy "perfiles rw" on perfiles for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

-- Alta automática: cuando invitas a alguien desde Authentication > Users
-- (o cuando esa persona acepta la invitación), se crea sola su fila en
-- "perfiles" con rol "oficina" e inactivo, para que un admin la revise,
-- le asigne el rol correcto y la active desde la app.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.perfiles (id, nombre, rol, activo)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'oficina', false)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- IMPORTANTE — activar tu propio usuario administrador
-- ============================================================
-- 1. Invítate a ti mismo desde Authentication > Users > Invite user.
-- 2. Acepta la invitación (revisa tu correo) y define tu contraseña.
-- 3. Copia tu UUID desde Authentication > Users (columna "UID").
-- 4. Ejecuta en el SQL Editor, reemplazando el UUID:
--
--    update perfiles set rol = 'admin', activo = true
--    where id = 'PEGA-AQUI-TU-UUID';
--
-- Desde ahí ya puedes entrar a la app y gestionar al resto de usuarios
-- desde Administración → Usuarios, sin volver a tocar el SQL Editor.
