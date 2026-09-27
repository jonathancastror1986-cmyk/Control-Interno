-- ============================================================
-- Migración 014: multi-empresa
-- ============================================================
-- Antes "empresa" era una tabla de UNA sola fila (check id = 1) y su
-- nombre/logo salían en todas las tarjetas. Ahora hay varias empresas,
-- cada trabajador pertenece a una, y cada usuario del sistema solo ve
-- los trabajadores de las empresas a las que tiene acceso.
--
-- No se agrega empresa_id a asistencia, tarjetas, EPP ni herramientas:
-- todo eso cuelga de trabajadores (por code), así que basta con filtrar
-- la lista de trabajadores para que el resto quede acotado.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 013 -> 014.
-- ============================================================

-- ------------------------------------------------------------
-- 1) EMPRESA: datos relevantes y varias filas
-- ------------------------------------------------------------
alter table empresa drop constraint if exists solo_una_fila;

alter table empresa add column if not exists rut text;            -- 12.345.678-9
alter table empresa add column if not exists giro text;           -- a qué se dedica
alter table empresa add column if not exists direccion text;
alter table empresa add column if not exists telefono text;
alter table empresa add column if not exists email text;
alter table empresa add column if not exists sitio_web text;
alter table empresa add column if not exists activa boolean not null default true;
alter table empresa add column if not exists created_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 2) LA EMPRESA PRINCIPAL
-- ------------------------------------------------------------
-- La tabla estaba VACÍA: los datos de la empresa se guardaban en el
-- navegador (localStorage), nunca en Supabase. Sin esta fila el paso 4
-- fallaría con "Key (empresa_id)=(1) is not present in table empresa",
-- y además las tarjetas quedarían sin nombre de empresa.
insert into empresa (id, nombre)
select coalesce((select max(id)+1 from empresa),1), 'Empresa principal'
where not exists (select 1 from empresa);

-- el id pasa a ser automático (antes era "default 1" fijo)
create sequence if not exists empresa_id_seq;
alter table empresa alter column id set default nextval('empresa_id_seq');
select setval('empresa_id_seq',greatest(coalesce((select max(id) from empresa),0),1),true);

-- ------------------------------------------------------------
-- 3) TRABAJADOR PERTENECE A UNA EMPRESA
-- ------------------------------------------------------------
alter table trabajadores add column if not exists empresa_id int references empresa(id) on delete set null;
create index if not exists trabajadores_empresa_idx on trabajadores(empresa_id);

-- Los trabajadores que ya existían quedan en la PRIMERA empresa real de
-- la tabla, no en un id fijo: así funciona aunque el id 1 no exista.
update trabajadores t
   set empresa_id = e.id
  from (select min(id) as id from empresa) e
 where t.empresa_id is null
   and e.id is not null;

-- ------------------------------------------------------------
-- 4) A QUÉ EMPRESAS ACCEDE CADA USUARIO DEL SISTEMA
-- ------------------------------------------------------------
create table if not exists perfil_empresas (
  user_id uuid not null references perfiles(id) on delete cascade,
  empresa_id int not null references empresa(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, empresa_id)
);

-- Mientras no se marquen nada, todos los usuarios activos ven la empresa
-- principal. Si no, nadie vería sus propios trabajadores tras aplicar
-- esto por primera vez. Se quita desde Soporte -> Empresas.
-- Solo entra quien AÚN no tiene ninguna empresa asignada: al re-ejecutar
-- la migración no debe devolverle acceso a alguien que RRHH ya cambió.
insert into perfil_empresas (user_id, empresa_id)
select p.id, (select min(id) from empresa)
  from perfiles p
 where p.activo
   and exists (select 1 from empresa)
   and not exists (select 1 from perfil_empresas pe where pe.user_id = p.id)
on conflict (user_id, empresa_id) do nothing;

-- ------------------------------------------------------------
-- 5) ROLES CON ACCESO AMPLIO
-- ------------------------------------------------------------
-- estos roles ven todas las empresas sin necesidad de asignárselas
-- una por una (la interfaz lo controla con el permiso "sistema.empresas")
insert into permisos (clave, descripcion, categoria, orden) values
  ('sistema.empresas', 'Ver todas las empresas y sus trabajadores', 'sistema', 25)
on conflict (clave) do nothing;

insert into roles_permisos (rol, permiso)
values ('admin','sistema.empresas')
on conflict do nothing;

-- ------------------------------------------------------------
-- 6) ARREGLO DE RECURSIÓN EN LAS POLÍTICAS
-- ------------------------------------------------------------
-- Todas las políticas del proyecto usan "exists (select 1 from perfiles p
-- where p.id = auth.uid() and p.activo)". Eso está bien mientras la
-- política sea de OTRA tabla, pero la 002 dejó esta:
--
--   create policy "perfiles rw" on perfiles for all
--     using (exists (select 1 from perfiles p where p.id = auth.uid() ...));
--
-- o sea, una política de "perfiles" que consulta "perfiles". Postgres no
-- puede evaluar eso y responde "infinite recursion detected in policy for
-- relation perfiles". Como TODAS las demás políticas consultan perfiles,
-- el error se repite en cada tabla.
--
-- La solución estándar es una función security definer: se ejecuta con los
-- privilegios del dueño (que sí ignora RLS), así que puede leer "perfiles"
-- sin dispararse a sí misma.
create or replace function public.es_usuario_activo(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles p where p.id = uid and p.activo)
$$;

-- lo mismo para "¿es administrador?", que varias políticas necesitan
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

-- Y para "¿tiene este permiso?". Así la base de datos decide lo mismo que
-- la pantalla "Permisos por rol": si a alguien le marcas sistema.empresa,
-- la interfaz se lo habilita y la base lo acepta (y no al revés).
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

-- La política de perfiles se rehace con la función, y además queda
-- restringida: cada quien ve su fila y solo un administrador ve todas.
-- Antes "cualquier usuario activo" podía editar el rol de cualquiera.
drop policy if exists "perfiles rw" on perfiles;
drop policy if exists "perfiles self read" on perfiles;
drop policy if exists "perfiles read" on perfiles;
drop policy if exists "perfiles write" on perfiles;
create policy "perfiles read" on perfiles for select
  using (id = auth.uid() or public.es_admin());
create policy "perfiles write" on perfiles for all
  using      (public.es_admin())
  with check (public.es_admin());

-- ------------------------------------------------------------
-- 7) ALTA DE USUARIOS: rol en la tabla nueva y empresa por defecto
-- ------------------------------------------------------------
-- El trigger que dejó la 002 solo inserta en "perfiles" (que tiene una
-- sola columna "rol"). Con la 013 en medio, un usuario invitado después
-- quedaba sin fila en "perfil_roles", y por lo tanto sin permisos: se ve
-- el sistema entero pero sin poder hacer nada. Se rehace el trigger para
-- que además deje el rol anotado ahí.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.perfiles (id, nombre, rol, activo)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'oficina', false)
  on conflict (id) do nothing;

  insert into public.perfil_roles (user_id, rol)
  values (new.id, 'oficina')
  on conflict (user_id, rol) do nothing;

  -- y que entre a la empresa principal, para que vea su propia gente
  -- desde el primer momento (si no, vería el sistema vacío)
  insert into public.perfil_empresas (user_id, empresa_id)
  values (new.id, (select min(id) from public.empresa))
  on conflict (user_id, empresa_id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Los usuarios que ya existían y todavía no tuvieran fila en perfil_roles
-- (por ejemplo los creados entre la 013 y esta migración).
insert into perfil_roles (user_id, rol)
select p.id, p.rol
  from perfiles p
  join roles_sistema r on r.rol = p.rol
 where p.rol is not null
   and not exists (select 1 from perfil_roles pr where pr.user_id = p.id)
on conflict (user_id, rol) do nothing;

-- ------------------------------------------------------------
-- 8) ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table empresa enable row level security;
alter table perfil_empresas enable row level security;

-- IMPORTANTE: en Postgres las políticas permisivas se combinan con OR.
-- La 001 dejó "empresa rw" (cualquier usuario activo, para todo), y si
-- se deja puesta, cualquier usuario sigue viendo TODAS las empresas.
drop policy if exists "empresa rw" on empresa;

-- Los usuarios activos ven las empresas que tienen asignadas; quien
-- tenga el rol admin las ve todas. El frontend además filtra por
-- empresa, esto es la red de seguridad.
drop policy if exists "empresa read" on empresa;
create policy "empresa read" on empresa for select
  using (
    public.es_admin()
    or exists (
      select 1 from perfil_empresas pe
       where pe.user_id = auth.uid() and pe.empresa_id = empresa.id
    )
  );

-- Con el permiso "sistema.empresa" se pueden editar los datos, pero
-- SOLO de las empresas propias: sin este filtro, quien lo tuviera
-- renombraría empresas de otras. Crear empresas nuevas es cosa de
-- administración, así que el permiso no alcanza para insertar.
drop policy if exists "empresa write" on empresa;
create policy "empresa write" on empresa for all
  using (
    public.es_admin()
    or (
      public.tiene_permiso('sistema.empresa')
      and exists (
        select 1 from perfil_empresas pe
         where pe.user_id = auth.uid() and pe.empresa_id = empresa.id
      )
    )
  )
  with check (
    public.es_admin()
    or (
      public.tiene_permiso('sistema.empresa')
      and exists (
        select 1 from perfil_empresas pe
         where pe.user_id = auth.uid() and pe.empresa_id = empresa.id
      )
    )
  );

drop policy if exists "perfil empresas read" on perfil_empresas;
create policy "perfil empresas read" on perfil_empresas for select
  using (public.es_admin() or user_id = auth.uid());

drop policy if exists "perfil empresas write" on perfil_empresas;
create policy "perfil empresas write" on perfil_empresas for all
  using      (public.es_admin() or public.tiene_permiso('sistema.usuarios'))
  with check (public.es_admin() or public.tiene_permiso('sistema.usuarios'));

-- ------------------------------------------------------------
-- 8) Los trabajadores solo se ven (y se editan) si su empresa está permitida
-- ------------------------------------------------------------
-- La 001 dejó dos políticas, una de lectura y otra de escritura, ambas
-- para cualquier usuario activo. Hay que quitar las DOS: con las
-- políticas permisivas combinándose con OR, quedarse con una sola
-- dejaría la puerta abierta por el otro lado.
-- Se caen por los dos nombres (el viejo de la 001 y el de una versión
-- anterior de esta migración) para que se pueda re-ejecutar.
drop policy if exists "usuarios activos leen trabajadores" on trabajadores;
drop policy if exists "usuarios activos escriben trabajadores" on trabajadores;
drop policy if exists "trabajadores por empresa read" on trabajadores;
drop policy if exists "trabajadores por empresa write" on trabajadores;

create policy "trabajadores por empresa read" on trabajadores for select
  using (
    public.es_admin()
    or exists (
      select 1 from perfil_empresas pe
       where pe.user_id = auth.uid() and pe.empresa_id = trabajadores.empresa_id
    )
  );

-- Para escribir se usa la misma regla: se toca lo de las empresas propias.
-- Un trabajador sin empresa (empresa_id null) solo lo manejaría admin.
create policy "trabajadores por empresa write" on trabajadores for all
  using (
    public.es_admin()
    or exists (
      select 1 from perfil_empresas pe
       where pe.user_id = auth.uid() and pe.empresa_id = trabajadores.empresa_id
    )
  )
  with check (
    public.es_admin()
    or exists (
      select 1 from perfil_empresas pe
       where pe.user_id = auth.uid() and pe.empresa_id = trabajadores.empresa_id
    )
  );
