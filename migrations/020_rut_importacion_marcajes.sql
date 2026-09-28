-- ============================================================
-- Migración 020: RUT del trabajador + reporte de marcajes
-- ============================================================
-- Para importar los marcajes que manda el reloj de la obra hay que
-- saber a qué trabajador pertenece cada fila. El reporte viene con
-- "Rut" y "Colaborador", pero la app solo guardaba el código interno.
--
-- Con el nombre basta casi siempre, pero no siempre: dos personas
-- pueden llamarse igual, y un nombre se puede tipear distinto en cada
-- reporte. El RUT no cambia nunca, así que es el dato con el que hay
-- que comparar. Se agrega a "trabajadores" y se rellena a mano una
-- vez; después todas las importaciones quedan exactas.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 019 -> 020.
-- ============================================================

-- ------------------------------------------------------------
-- 1) RUT EN EL TRABAJADOR
-- ------------------------------------------------------------
alter table trabajadores add column if not exists rut text;

-- El RUT identifica a una persona, no a un puesto: no puede repetirse.
-- Se usa un índice único parcial para no chocar con las filas que
-- todavía no lo tienen informado.
create unique index if not exists trabajadores_rut_unico
  on trabajadores (rut)
  where rut is not null and btrim(rut) <> '';

-- Búsqueda por RUT y por nombre, que es como se empareja el Excel.
create index if not exists trabajadores_rut_idx on trabajadores (rut);
create index if not exists trabajadores_name_idx on trabajadores (lower(name));

-- ------------------------------------------------------------
-- 2) EL REPORTE DEL RELOJ, GUARDADO TAL COMO LLEGÓ
-- ------------------------------------------------------------
-- Guardar el archivo original sirve para dos cosas: poder mostrar de
-- dónde salió cada marcaje cuando alguien cuestiona una hora, y
-- volver a procesar el reporte si el formato cambia.
create table if not exists marcajes_importaciones (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text,
  total_filas int not null default 0,
  guardadas int not null default 0,
  actualizadas int not null default 0,
  sin_coincidencia int not null default 0,
  descartadas int not null default 0,
  sin_fecha_o_hora int not null default 0,
  observaciones text,
  importado_por uuid references perfiles(id) on delete set null,
  importado_por_nombre text,
  detalle jsonb,          -- una entrada por fila que no se pudo usar
  created_at timestamptz not null default now()
);
create index if not exists marcajes_importaciones_fecha_idx
  on marcajes_importaciones (created_at desc);

-- ------------------------------------------------------------
-- 3) NOTA EN EL MARCAJE: DE QUÉ REPORTE SALIÓ
-- ------------------------------------------------------------
-- "nota" ya existe, pero se usaba para texto libre. Se le antepone
-- "Excel <archivo>" al importar, para que se sepa de dónde salió
-- la hora sin agregar otra columna.
--
-- "origen = 'excel'" ya está permitido en el check de la 017; esta
-- migración solo se asegura, por si alguien corrió la 017 de otra
-- versión.
--
-- VA EN UN DO PORQUE "marcajes" ES DE LA 017. Con un "alter table"
-- normal, aplicar la 020 en una base donde la 017 no se ha corrido
-- reventaba con:
--
--   ERROR: 42P01: relation "marcajes" does not exist
--
-- y como el error aparece al final del archivo, el usuario veía que la
-- 020 estaba mala, cuando lo que faltaba era la 017. Peor: si la
-- plataforma corta la ejecución en el primer error, la 020 se quedaba
-- a medias y el RUT tampoco quedaba.
--
-- Acá no se corta nada. Si la 017 falta, se dice con un NOTICE —que el
-- SQL Editor muestra en la esquina inferior— y el resto de la 020 se
-- aplica igual: el RUT y la tabla de importaciones son independientes de
-- los marcajes.
do $$
begin
  if to_regclass('public.marcajes') is null then
    raise notice 'ATENCION: falta la migracion 017_marcajes_diarios.sql (la tabla "marcajes" no existe). La 020 se aplico igual, pero sin los marcajes no va a funcionar la asistencia diaria. Ejecuta la 017 y despues vuelve a correr esta.';
  else
    alter table marcajes drop constraint if exists marcajes_origen_check;
    alter table marcajes
      add constraint marcajes_origen_check
      check (origen in ('qr','manual','excel','porteria','app','reloj'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 4) ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Es autocontenida: se vuelven a crear las funciones que usa, como
-- hizo la 016, para que la 020 no dependa de que esa esté aplicada.
-- Por qué security definer: una política que consulta "perfiles"
-- desde otra política de "perfiles" se llama a sí misma y Postgres la
-- corta con "infinite recursion detected in policy".
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

alter table marcajes_importaciones enable row level security;

drop policy if exists "marcajes importaciones read" on marcajes_importaciones;
create policy "marcajes importaciones read" on marcajes_importaciones for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

-- Importar marcajes es una tarea de.tarja.excel, igual que cargar la
-- asistencia. Se pregunta por el permiso del rol con la misma
-- función security definer de la 016, para que la pantalla y la base
-- no discrepen (es el mismo problema que se corrigió en esa 016).
drop policy if exists "marcajes importaciones write" on marcajes_importaciones;
create policy "marcajes importaciones write" on marcajes_importaciones for insert
  with check (public.tiene_permiso('tarja.excel') or public.es_admin());

-- Si la 016 no está aplicada, esta política falla al crearse con
-- "function tiene_permiso(...) does not exist". Se avisa abajo.

-- ------------------------------------------------------------
-- 5) COMPROBACIÓN DE SALUD
-- ------------------------------------------------------------
-- Si la 020 no está aplicada, la app lo dice con este mensaje en vez
-- de fallar en silencio con "column shopper.rut does not exist".
--
-- "origen_ok" pregunta por la RESTRICCIÓN, no por la tabla. Esa es la
-- parte que puede quedar vieja sin que nada avise: si se aplicó la 020
-- sin que la 017 estuviera, el bloque de arriba se saltó y la
-- restricción quedó como la dejó la 017, que no acepta 'reloj' (el
-- origen que usa el importador).
--
-- Con la tabla presente, todas las tablas existen y el botón de
-- revisión diría "la base está al día". La importación de marcajes
-- fallaría recién en el INSERT, con un error de check constraint que no
-- señala la causa. Por eso se pregunta por la restricción.
create or replace function public.diagnostico_importacion_marcajes()
returns table (
  tabla_ok boolean,
  rut_ok boolean,
  politicas_ok boolean,
  marcajes_ok boolean,
  origen_ok boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'marcajes_importaciones'),
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'trabajadores' and column_name = 'rut'),
    exists (select 1 from pg_policies
             where tablename = 'marcajes_importaciones' and policyname = 'marcajes importaciones write'),
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'marcajes'),
    exists (
      select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace ns on ns.oid = t.relnamespace
       where ns.nspname = 'public'
         and t.relname = 'marcajes'
         and c.conname = 'marcajes_origen_check'
         and pg_get_constraintdef(c.oid) like '%reloj%'
    )
$$;
