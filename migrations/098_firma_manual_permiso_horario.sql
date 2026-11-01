-- 098: firma manual (en papel) para permiso_horario.
-- El administrativo de obra imprime el permiso, el trabajador firma en papel,
-- se sube el PDF o la foto y solo entonces se puede autorizar.
-- No edita la 086 ni la 090. resolver_permiso_horario no se toca: la regla vive en un trigger.
-- Un permiso que nadie imprimió queda en 'sin_firma' y se autoriza como hasta ahora.
-- Archivo: bucket privado epp-respaldos, ruta <code>/permiso-<id>/respaldo_<sha16>.<ext>.
-- Idempotente. Rollback al final, comentado.

create sequence if not exists folio_permiso_seq;

alter table public.permiso_horario
  add column if not exists firma_estado text not null default 'sin_firma',
  add column if not exists folio bigint,
  add column if not exists respaldo_path text,
  add column if not exists respaldo_sha256 text,
  add column if not exists respaldo_subido_por uuid references public.perfiles(id) on delete set null,
  add column if not exists respaldo_subido_nombre text,
  add column if not exists respaldo_subido_at timestamptz;

alter table public.permiso_horario drop constraint if exists permiso_horario_firma_estado_check;
alter table public.permiso_horario add constraint permiso_horario_firma_estado_check
  check (firma_estado in ('sin_firma','pendiente_papel','firmada_papel'));
alter table public.permiso_horario drop constraint if exists permiso_horario_sha256_check;
alter table public.permiso_horario add constraint permiso_horario_sha256_check
  check (respaldo_sha256 is null or respaldo_sha256 ~ '^[0-9a-f]{64}$');
alter table public.permiso_horario drop constraint if exists permiso_horario_firmada_con_respaldo;
alter table public.permiso_horario add constraint permiso_horario_firmada_con_respaldo
  check (firma_estado <> 'firmada_papel' or (respaldo_path is not null and respaldo_sha256 is not null));

create unique index if not exists permiso_horario_folio_uq
  on public.permiso_horario (folio) where folio is not null;
create index if not exists permiso_horario_pend_papel
  on public.permiso_horario (fecha) where firma_estado = 'pendiente_papel';

-- Historial de respaldos reemplazados: solo se inserta desde la función.
create table if not exists public.respaldos_permiso_historial (
  id uuid primary key default gen_random_uuid(),
  permiso_id integer not null,
  respaldo_path text not null,
  respaldo_sha256 text not null,
  subido_por uuid,
  subido_at timestamptz,
  reemplazado_por uuid,
  reemplazado_por_nombre text,
  reemplazado_at timestamptz not null default now(),
  motivo text not null check (length(btrim(motivo)) >= 5)
);
alter table public.respaldos_permiso_historial enable row level security;
drop policy if exists "respaldos permiso lee" on public.respaldos_permiso_historial;
create policy "respaldos permiso lee" on public.respaldos_permiso_historial for select
  using ((public.es_admin() or public.tiene_permiso('permisos_horario.aprobar') or public.tiene_permiso('permisos_horario.visar'))
         and exists (select 1 from public.permiso_horario ph where ph.id = respaldos_permiso_historial.permiso_id));
revoke insert, update, delete on public.respaldos_permiso_historial from authenticated, anon;

-- La regla de negocio, en la base.
create or replace function public.guardia_permiso_firma() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.estado = 'confirmado' and old.estado is distinct from 'confirmado'
     and new.firma_estado = 'pendiente_papel' then
    raise exception 'No se puede autorizar: falta subir el respaldo firmado (permiso con folio %).', new.folio
      using errcode = '22023';
  end if;
  if current_setting('app.firma_manual_ok', true) is distinct from '1' then
    if (new.firma_estado, new.folio, new.respaldo_path, new.respaldo_sha256, new.respaldo_subido_por, new.respaldo_subido_at)
       is distinct from
       (old.firma_estado, old.folio, old.respaldo_path, old.respaldo_sha256, old.respaldo_subido_por, old.respaldo_subido_at) then
      raise exception 'La firma manual solo se modifica con registrar_permiso_manual o subir_respaldo_permiso.'
        using errcode = '42501';
    end if;
  end if;
  if old.firma_estado = 'firmada_papel'
     and (new.code, new.fecha, new.hora_inicio, new.hora_fin, new.motivo)
         is distinct from (old.code, old.fecha, old.hora_inicio, old.hora_fin, old.motivo) then
    raise exception 'El permiso ya tiene respaldo firmado: no se pueden cambiar el trabajador, la fecha, las horas ni el motivo.'
      using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists guardia_permiso_firma on public.permiso_horario;
create trigger guardia_permiso_firma before update on public.permiso_horario
  for each row execute function public.guardia_permiso_firma();

-- Un insert directo tampoco puede nacer con firma manual (la tabla no tiene política de escritura,
-- pero la guardia queda por si alguien la agrega).
create or replace function public.guardia_permiso_firma_ins() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('app.firma_manual_ok', true) is distinct from '1' then
    new.firma_estado := 'sin_firma';
    new.folio := null;
    new.respaldo_path := null;
    new.respaldo_sha256 := null;
    new.respaldo_subido_por := null;
    new.respaldo_subido_nombre := null;
    new.respaldo_subido_at := null;
  end if;
  return new;
end $$;

drop trigger if exists guardia_permiso_firma_ins on public.permiso_horario;
create trigger guardia_permiso_firma_ins before insert on public.permiso_horario
  for each row execute function public.guardia_permiso_firma_ins();

-- Alcance: misma regla que la 090 (centro de costo; sin centro, la empresa).
create or replace function public.alcance_permiso_horario(p_id integer) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from public.permiso_horario ph
      join public.trabajadores t on t.code = ph.code
     where ph.id = p_id
       and ((t.centro_costo_id is null and exists (select 1 from public.perfil_empresas pe where pe.user_id = auth.uid() and pe.empresa_id = t.empresa_id))
         or (t.centro_costo_id is not null and exists (select 1 from public.perfil_centros_costo pcc where pcc.user_id = auth.uid() and pcc.centro_costo_id = t.centro_costo_id))));
$$;

-- RPC 1: imprime para firma en papel (asigna folio).
create or replace function public.registrar_permiso_manual(p_id integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_folio bigint; v_estado text; v_firma text; v_filas int;
begin
  if not (public.es_admin() or public.tiene_permiso('permisos_horario.pedir') or public.tiene_permiso('permisos_horario.aprobar')) then
    raise exception 'No tienes permiso para preparar permisos horarios.' using errcode = '42501';
  end if;
  select estado, firma_estado into v_estado, v_firma from public.permiso_horario where id = p_id;
  if not found then
    raise exception 'Ese permiso no existe' using errcode = '22023';
  end if;
  if not public.alcance_permiso_horario(p_id) then
    raise exception 'Ese permiso es de un trabajador que no te corresponde.' using errcode = '42501';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Ese permiso ya fue resuelto: su estado ahora es "%"', v_estado using errcode = '22023';
  end if;
  if v_firma = 'firmada_papel' then
    raise exception 'Ese permiso ya tiene respaldo firmado.' using errcode = '22023';
  end if;
  perform set_config('app.firma_manual_ok', '1', true);
  update public.permiso_horario
     set firma_estado = 'pendiente_papel', folio = coalesce(folio, nextval('folio_permiso_seq'))
   where id = p_id and estado = 'pendiente' and firma_estado in ('sin_firma','pendiente_papel')
   returning folio into v_folio;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No se pudo marcar el permiso; alguien lo cambió mientras tanto.' using errcode = '22023';
  end if;
  return v_folio;
end $$;

-- RPC 2: sube el respaldo; si ya había uno, exige motivo y archiva el anterior.
create or replace function public.subir_respaldo_permiso(p_id integer, p_path text, p_sha256 text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text; v_estado text; v_firma text; v_old_path text; v_old_sha text;
        v_old_por uuid; v_old_at timestamptz; v_filas int; v_prefijo text;
begin
  if not (public.es_admin() or public.tiene_permiso('permisos_horario.aprobar')) then
    raise exception 'No tienes permiso para subir el respaldo de un permiso horario.' using errcode = '42501';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Huella SHA-256 inválida.' using errcode = '22023';
  end if;
  select code, estado, firma_estado, respaldo_path, respaldo_sha256, respaldo_subido_por, respaldo_subido_at
    into v_code, v_estado, v_firma, v_old_path, v_old_sha, v_old_por, v_old_at
    from public.permiso_horario where id = p_id;
  if not found then
    raise exception 'Ese permiso no existe' using errcode = '22023';
  end if;
  if not public.alcance_permiso_horario(p_id) then
    raise exception 'Ese permiso es de un trabajador que no te corresponde.' using errcode = '42501';
  end if;
  if v_estado = 'anulado' then
    raise exception 'Ese permiso está anulado.' using errcode = '22023';
  end if;
  if v_firma not in ('pendiente_papel','firmada_papel') then
    raise exception 'El permiso no está en firma manual. Primero hay que imprimirlo.' using errcode = '22023';
  end if;
  v_prefijo := v_code || '/permiso-' || p_id::text || '/';
  if p_path is null or left(p_path, length(v_prefijo)) <> v_prefijo or p_path like '%..%' then
    raise exception 'La ruta del respaldo no corresponde a este permiso.' using errcode = '22023';
  end if;
  perform set_config('app.firma_manual_ok', '1', true);
  if v_old_path is not null then
    if p_motivo is null or length(btrim(p_motivo)) < 5 then
      raise exception 'Ya hay un respaldo subido. Para reemplazarlo hay que indicar el motivo (mínimo 5 letras).' using errcode = '22023';
    end if;
    insert into public.respaldos_permiso_historial
      (permiso_id, respaldo_path, respaldo_sha256, subido_por, subido_at, reemplazado_por, reemplazado_por_nombre, motivo)
    values (p_id, v_old_path, v_old_sha, v_old_por, v_old_at, auth.uid(),
            (select nombre from public.perfiles where id = auth.uid()), btrim(p_motivo));
  end if;
  update public.permiso_horario
     set respaldo_path = p_path, respaldo_sha256 = p_sha256, respaldo_subido_por = auth.uid(),
         respaldo_subido_nombre = (select nombre from public.perfiles where id = auth.uid()),
         respaldo_subido_at = now(), firma_estado = 'firmada_papel'
   where id = p_id;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No se pudo guardar el respaldo.' using errcode = '22023';
  end if;
end $$;

revoke all on function public.alcance_permiso_horario(integer) from public, anon;
revoke all on function public.registrar_permiso_manual(integer) from public, anon;
revoke all on function public.subir_respaldo_permiso(integer, text, text, text) from public, anon;
grant execute on function public.alcance_permiso_horario(integer) to authenticated;
grant execute on function public.registrar_permiso_manual(integer) to authenticated;
grant execute on function public.subir_respaldo_permiso(integer, text, text, text) to authenticated;

-- La comprobación (solo lectura) está en diagnostico-firma-permiso-horario.sql.

-- ROLLBACK (comentado):
-- drop function if exists public.subir_respaldo_permiso(integer, text, text, text);
-- drop function if exists public.registrar_permiso_manual(integer);
-- drop function if exists public.alcance_permiso_horario(integer);
-- drop trigger if exists guardia_permiso_firma_ins on public.permiso_horario;
-- drop function if exists public.guardia_permiso_firma_ins();
-- drop trigger if exists guardia_permiso_firma on public.permiso_horario;
-- drop function if exists public.guardia_permiso_firma();
-- drop table if exists public.respaldos_permiso_historial;
-- alter table public.permiso_horario drop column if exists firma_estado, drop column if exists folio,
--   drop column if exists respaldo_path, drop column if exists respaldo_sha256,
--   drop column if exists respaldo_subido_por, drop column if exists respaldo_subido_nombre,
--   drop column if exists respaldo_subido_at;
-- drop sequence if exists folio_permiso_seq;
