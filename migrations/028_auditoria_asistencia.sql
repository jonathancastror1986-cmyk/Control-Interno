-- ============================================================
-- Migración 028: bitácora de auditoría de la asistencia
-- ============================================================
-- POR QUÉ
--
-- La tarja es el registro legal de asistencia. Hoy un administrador puede
-- cambiar una celda y no queda rastro de quién lo hizo ni por qué. Si hay
-- una fiscalización, o un trabajador alega que nunca faltó, no hay forma de
-- probarlo ni de probar lo contrario: el registro se puede cambiar sin dejar
-- rastro, y eso lo vuelve inservible como evidencia.
--
-- LA REGLA
--
-- Toda inserción, cambio o borrado sobre `asistencia` deja una traza con
-- QUIÉN, QUÉ, CÓMO ESTABA ANTES y POR QUÉ. Y el motivo es obligatorio.
--
-- POR QUÉ UN DISPARADOR Y NO UN LLAMADO DESDE LA APP
--
-- Porque un disparador no se puede olvidar. Si mañana alguien agrega una
-- pantalla nueva que escribe en la tabla, queda cubierta sola. Si el
-- motivo lo pidiera la app, bastaría con un camino que no lo pida para
-- tener un cambio sin rastro. Acá el motivo lo exige la BASE: si falta,
-- la escritura se rechaza.
--
-- LA ÚNICA EXCEPCIÓN, Y POR QUÉ
--
-- La carga del Excel del reloj (`origen = 'importado'`). Meter esas filas
-- en la bitácora produciría cientos de miles de trazas que taparían las
-- correcciones hechas a mano, que son las que importan. El reloj es una
-- fuente externa, no una decisión de una persona.
--
-- INALTERABILIDAD
--
-- No hay políticas de UPDATE ni de DELETE sobre la tabla de auditoría: no
-- se puede modificar ni borrar una traza, ni siquiera siendo admin. Esa es
-- la garantía de que sirve como evidencia. Para más adelante se puede
-- agregar el respaldo periódico (WORM) que exige la DT; la base ya no
-- permite que alguien la altere desde la aplicación.
-- ============================================================

-- ------------------------------------------------------------
-- 1) TABLA DE AUDITORÍA
-- ------------------------------------------------------------
create table if not exists asistencia_auditoria (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  fecha date not null,
  -- qué se hizo sobre el registro
  accion text not null check (accion in ('inserta','actualiza','borra')),
  -- estado anterior y nuevo. En un borrda, "anterior" es el que había.
  estado_anterior text,
  estado_nuevo text,
  hora_llegada_anterior text,
  hora_llegada_nuevo text,
  origen_anterior text,
  origen_nuevo text,
  -- POR QUÉ. Es lo primero que se revisa en una auditoría, así que no
  -- puede ir vacío ni ser espacios.
  motivo text not null check (length(btrim(motivo)) >= 5),
  -- quién lo hizo
  usuario_id uuid,
  usuario_nombre text,
  usuario_rol text,
  -- desde qué sesión, para separar correcciones separadas de la misma persona
  sesion_id text,
  created_at timestamptz not null default now()
);

-- La consulta que se hace siempre: "qué le hicieron a este trabajador en
-- este día".
create index if not exists asistencia_auditoria_code_fecha_idx
  on public.asistencia_auditoria(code, fecha desc);
create index if not exists asistencia_auditoria_created_idx
  on public.asistencia_auditoria(created_at desc);

comment on table public.asistencia_auditoria is
  'Bitácora de cambios manuales a la asistencia. Inalterable: no hay políticas de UPDATE ni DELETE. El motivo es obligatorio.';

-- ------------------------------------------------------------
-- 2) EL PERMISO DE LEERLA
-- ------------------------------------------------------------
-- La política de abajo podría usar "tarja.ver", que es lo mismo que puede
-- ver el mes entero. Leer la bitácora es otra cosa: muestra quién cambió
-- qué, y en un proyecto donde hay varios administradores eso es
-- información sensible aunque one's de RRHH. Va con permiso propio para
-- poder dárselo a quien corresponde sin abrir la tarja.
-- El permiso tiene que existir en el catálogo primero: roles_permisos tiene
-- llave foránea contra permisos, y saltarse eso da un error de integridad
-- que no dice qué falta.
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('asistencia.auditar', 'Ver la bitácora de cambios de la asistencia', 'asistencia', 90)
on conflict (clave) do update set descripcion = excluded.descripcion;

insert into public.roles_permisos (rol, permiso) values
  ('admin', 'asistencia.auditar'),
  ('rrhh',  'asistencia.auditar')
on conflict do nothing;

comment on column public.asistencia_auditoria.motivo is
  'Por que se hizo el cambio. Obligatorio, minimo 5 caracteres. Es lo primero que se revisa.';

-- ------------------------------------------------------------
-- 3) RLS: SE LEE, NO SE ESCRIBE DESDE LA APP
-- ------------------------------------------------------------
alter table public.asistencia_auditoria enable row level security;

drop policy if exists "auditoria solo lectura" on public.asistencia_auditoria;
-- La escritura la hace el disparador, que corre como security definer, así
-- que no necesita ninguna política de INSERT. Ausente a propósito.
create policy "auditoria solo lectura" on public.asistencia_auditoria for select
  using (public.tiene_permiso('asistencia.auditar'));

-- Inalterabilidad: no hay política de UPDATE ni de DELETE, y además se
-- revocan los privilegios directamente a los roles que usa la aplicación.
--
-- NO se revoca a service_role, a propósito. En Supabase ese rol salta la
-- RLS, así que revoke no le impediría escribir: daría una sensación de
-- protección que no es real. La garantía de verdad son las políticas
-- ausentes para `authenticated`, que es el rol con el que habla el
-- navegador.
revoke update, delete on public.asistencia_auditoria from authenticated, anon;
-- Tampoco se puede insertar una traza a mano: si se pudiera, cualquiera
-- podría plantar una traza falsa que pareciera la primera de todas. La única
-- que escribe es el disparador.
revoke insert on public.asistencia_auditoria from authenticated, anon;

-- ------------------------------------------------------------
-- 3) EL MOTIVO, Y DE DÓNDE LO SACA EL DISPARADOR
-- ------------------------------------------------------------
-- El disparador no puede inventar el motivo, y la app no lo manda en el
-- INSERT. Se pasa por una variable de sesión de la petición, que se fija
-- con set_config dentro de la misma transacción que hace el cambio.
--
-- Es la forma de atar el motivo al cambio: si alguien escribe directo en
-- la tabla sin pasar por la función, no hay motivo en la sesión, el
-- disparador lo detecta y RECHAZA la escritura.
create or replace function public.motivo_de_cambio()
returns text
language plpgsql
stable
as $$
declare
  v text;
begin
  v := current_setting('app.motivo_cambio', true);
  if v is null then return null; end if;
  v := btrim(v);
  if length(v) < 5 then return null; end if;
  return v;
end $$;

-- ------------------------------------------------------------
-- 4) EL DISPARADOR
-- ------------------------------------------------------------
create or replace function public.auditar_asistencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := public.motivo_de_cambio();
  v_accion text;
  v_exige_motivo boolean := true;
  v_code text;
  v_fecha date;
  v_estado_ant text;
  v_estado_nue text;
  v_hora_ant text;
  v_hora_nue text;
  v_origen_ant text;
  v_origen_nue text;
  v_uid uuid := auth.uid();
  v_nombre text;
  v_rol text;
begin
  if TG_OP = 'INSERT' then
    v_accion := 'inserta';
    v_code := NEW.code;
    v_fecha := NEW.fecha;
    v_estado_nue := NEW.estado;
    v_hora_nue  := case when NEW.hora_llegada is null then null else NEW.hora_llegada::text end;
    v_origen_nue := NEW.origen;
    -- La carga del reloj no es una decisión de una persona: se acepta sin
    -- motivo para no llenar la bitácora de cientos de miles de filas que
    -- taparían las correcciones. Cualquier otro INSERT sí lo exige.
    --
    -- OJO: la decisión va en una variable y la comprobación va UNA sola vez,
    -- al final. Si la excepción se ponía acá y además había una
    -- comprobación general más abajo, esa segunda tapaba a la primera y
    -- el Excel igual era rechazado: la regla parecía estar y no estaba.
    v_exige_motivo := (NEW.origen is distinct from 'importado');
  elsif TG_OP = 'UPDATE' then
    v_accion := 'actualiza';
    v_code := NEW.code;
    v_fecha := NEW.fecha;
    v_estado_ant := OLD.estado;
    v_estado_nue := NEW.estado;
    v_hora_ant  := case when OLD.hora_llegada is null then null else OLD.hora_llegada::text end;
    v_hora_nue  := case when NEW.hora_llegada is null then null else NEW.hora_llegada::text end;
    v_origen_ant := OLD.origen;
    v_origen_nue := NEW.origen;
  else
    v_accion := 'borra';
    v_code := OLD.code;
    v_fecha := OLD.fecha;
    v_estado_ant := OLD.estado;
    v_hora_ant  := case when OLD.hora_llegada is null then null else OLD.hora_llegada::text end;
    v_origen_ant := OLD.origen;
  end if;

  if v_exige_motivo and v_motivo is null then
    if v_accion = 'inserta' then
      raise exception 'Falta el motivo del cambio. Toda alta manual de asistencia se registra y necesita un motivo de al menos 5 caracteres. Se hace con registrar_asistencia(..., motivo).'
        using errcode = 'check_violation';
    else
      raise exception 'Falta el motivo del cambio. Sin motivo no se puede modificar ni borrar un registro de asistencia.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Si acá no se exige motivo, es la carga del reloj, y no se deja traza.
  --
  -- Returning temprano, y no escribir una fila con motivo nulo: la columna
  -- es NOT NULL, asi que sin este return la carga del Excel reventaba con
  -- un error de integridad en vez de pasar. Y una traza con motivo vacío
  -- tampoco serviría: en una auditoría una fila sin motivo es ruido que
  -- obliga a revisar todas las demás para descubrir cuál es real.
  if not v_exige_motivo then
    return coalesce(NEW, OLD);
  end if;

  select nombre into v_nombre from public.perfiles where id = v_uid;
  select string_agg(rol, ', ' order by rol) into v_rol
    from public.perfil_roles where user_id = v_uid;

  insert into public.asistencia_auditoria (
    code, fecha, accion,
    estado_anterior, estado_nuevo,
    hora_llegada_anterior, hora_llegada_nuevo,
    origen_anterior, origen_nuevo,
    motivo, usuario_id, usuario_nombre, usuario_rol, sesion_id
  ) values (
    v_code, v_fecha, v_accion,
    v_estado_ant, v_estado_nue,
    v_hora_ant, v_hora_nue,
    v_origen_ant, v_origen_nue,
    v_motivo, v_uid, v_nombre, v_rol,
    current_setting('app.sesion_id', true)
  );
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_auditar_asistencia on public.asistencia;
create trigger trg_auditar_asistencia
  after insert or update or delete on public.asistencia
  for each row execute function public.auditar_asistencia();

-- Lo que cambia el reloj o la conciliación van por una vía marcada, para no
-- que cada uno tenga que inventar un motivo. Aun así quedan trazados, con
-- el motivo que corresponde, que es justo lo que se quiere ver después.
create or replace function public.marcar_motivo_automatico(p_motivo text)
returns void
language sql
security definer
set search_path = public
as $$
  select set_config('app.motivo_cambio', p_motivo, true);
$$;

-- ------------------------------------------------------------
-- 5) LAS FUNCIONES QUE USA LA APP
-- ------------------------------------------------------------
-- Van por RPC porque set_config(..., true) es local a la transacción: si la
-- app hiciera el set_config por un lado y el upsert por otro, el motivo se
-- pierde entre ambos. Todas en una: motivo y escritura, o nada.
--
-- La app llama a estas, no a .from('asistencia').upsert(), para los cambios
-- manuales.

-- Alta o cambio de un registro de asistencia.
create or replace function public.registrar_asistencia(
  p_code text,
  p_fecha date,
  p_estado text,
  p_hora_llegada text default null,
  p_nota text default null,
  p_origen text default 'manual',
  p_motivo text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo,''));
begin
  if length(v_motivo) < 5 then
    raise exception 'Escribe el motivo del cambio (al menos 5 caracteres). Queda registrado en la bitacora de auditoria.'
      using errcode = 'check_violation';
  end if;
  perform set_config('app.motivo_cambio', v_motivo, true);

  if p_estado is null or p_estado = '' or p_estado = '__auto__' then
    delete from public.asistencia where code = p_code and fecha = p_fecha;
  else
    insert into public.asistencia (code, fecha, estado, hora_llegada, nota, origen)
    values (p_code, p_fecha, p_estado, nullif(p_hora_llegada,'')::time, p_nota, p_origen)
    on conflict (code, fecha) do update
      set estado = excluded.estado,
          hora_llegada = excluded.hora_llegada,
          nota = excluded.nota,
          origen = excluded.origen;
  end if;
  return true;
end $$;

-- Quitar una marca (volverla a "auto").
create or replace function public.borrar_asistencia(
  p_code text,
  p_fecha date,
  p_motivo text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.registrar_asistencia(p_code, p_fecha, null, null, null, 'manual', p_motivo);
  return true;
end $$;

-- ------------------------------------------------------------
-- 6) DIAGNÓSTICO
-- ------------------------------------------------------------
create or replace function public.diagnostico_auditoria()
returns table (
  existe_bitacora boolean,
  disparador_puesto boolean,
  motivo_obligatorio boolean,
  inalterable boolean,
  filas bigint,
  ultima_traza text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='asistencia_auditoria'),
    exists (select 1 from pg_trigger where tgname='trg_auditar_asistencia' and not tgisinternal),
    exists (select 1 from pg_constraint
             where conname='asistencia_auditoria_motivo_check'),
    -- Inalterable = no existe ninguna política de UPDATE ni de DELETE.
    not exists (
      select 1 from pg_policies
       where schemaname='public' and tablename='asistencia_auditoria'
         and cmd in ('UPDATE','DELETE','ALL')
    ),
    (select count(*) from public.asistencia_auditoria),
    (select to_char(max(created_at), 'YYYY-MM-DD HH24:MI') from public.asistencia_auditoria)
$$;

comment on function public.diagnostico_auditoria() is
  'Estado de la bitacora de auditoria: existe, el disparador esta puesto, el motivo es obligatorio, no se puede alterar, y cuantas trazas hay.';

-- Para leerla de una, sin acordarse del nombre de la función.
select * from public.diagnostico_auditoria();
