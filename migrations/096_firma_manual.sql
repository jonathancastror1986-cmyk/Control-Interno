-- 096: firma manual (en papel) para entregas de EPP, kits y herramientas.
-- No edita migraciones anteriores. Rollback al final, comentado.

-- 1) Método de firma 'manual' (el check de la 008 era solo 'canvas')
alter table public.epp_entregas drop constraint if exists epp_entregas_firma_metodo_check;
alter table public.epp_entregas add constraint epp_entregas_firma_metodo_check
  check (firma_metodo in ('canvas','manual'));

-- 2) Folio visible, compartido por las dos tablas
create sequence if not exists folio_entrega_seq;

-- 3) Columnas en epp_entregas (cubre EPP y kits)
alter table public.epp_entregas
  add column if not exists folio bigint,
  add column if not exists firma_estado text not null default 'sin_firma',
  add column if not exists respaldo_path text,
  add column if not exists respaldo_sha256 text,
  add column if not exists respaldo_subido_por uuid references public.perfiles(id) on delete set null,
  add column if not exists respaldo_subido_at timestamptz;
alter table public.epp_entregas drop constraint if exists epp_entregas_firma_estado_check;
alter table public.epp_entregas add constraint epp_entregas_firma_estado_check
  check (firma_estado in ('sin_firma','firmada','pendiente_papel','firmada_papel'));
alter table public.epp_entregas drop constraint if exists epp_entregas_respaldo_sha256_check;
alter table public.epp_entregas add constraint epp_entregas_respaldo_sha256_check
  check (respaldo_sha256 is null or respaldo_sha256 ~ '^[0-9a-f]{64}$');
update public.epp_entregas set firma_estado = 'firmada' where firma_metodo = 'canvas' and firma_estado = 'sin_firma';
create unique index if not exists epp_entregas_folio_uq on public.epp_entregas(folio) where folio is not null;
create index if not exists epp_entregas_pend_papel_idx on public.epp_entregas(fecha desc) where firma_estado = 'pendiente_papel';

-- 4) Lo mismo en herramientas_asignaciones
alter table public.herramientas_asignaciones
  add column if not exists folio bigint,
  add column if not exists firma_metodo text,
  add column if not exists firma_estado text not null default 'sin_firma',
  add column if not exists respaldo_path text,
  add column if not exists respaldo_sha256 text,
  add column if not exists respaldo_subido_por uuid references public.perfiles(id) on delete set null,
  add column if not exists respaldo_subido_at timestamptz;
alter table public.herramientas_asignaciones drop constraint if exists herr_asig_firma_metodo_check;
alter table public.herramientas_asignaciones add constraint herr_asig_firma_metodo_check
  check (firma_metodo is null or firma_metodo = 'manual');
alter table public.herramientas_asignaciones drop constraint if exists herr_asig_firma_estado_check;
alter table public.herramientas_asignaciones add constraint herr_asig_firma_estado_check
  check (firma_estado in ('sin_firma','pendiente_papel','firmada_papel'));
alter table public.herramientas_asignaciones drop constraint if exists herr_asig_respaldo_sha256_check;
alter table public.herramientas_asignaciones add constraint herr_asig_respaldo_sha256_check
  check (respaldo_sha256 is null or respaldo_sha256 ~ '^[0-9a-f]{64}$');
create unique index if not exists herr_asig_folio_uq on public.herramientas_asignaciones(folio) where folio is not null;

-- 5) Historial de respaldos reemplazados (solo se inserta; nadie lo edita ni borra)
create table if not exists public.respaldos_firma_historial (
  id uuid primary key default gen_random_uuid(),
  tabla text not null check (tabla in ('epp_entregas','herramientas_asignaciones')),
  registro_id uuid not null,
  respaldo_path text not null,
  respaldo_sha256 text not null,
  subido_por uuid,
  subido_at timestamptz,
  reemplazado_por uuid,
  reemplazado_at timestamptz not null default now(),
  motivo text not null check (length(btrim(motivo)) >= 5)
);
alter table public.respaldos_firma_historial enable row level security;
drop policy if exists "respaldos historial lee" on public.respaldos_firma_historial;
create policy "respaldos historial lee" on public.respaldos_firma_historial for select
  using (public.es_admin() or public.tiene_permiso('bodega.epp.historial'));
revoke insert, update, delete on public.respaldos_firma_historial from authenticated, anon;

-- 6) Guardia: los campos de firma manual solo cambian desde las RPC de abajo
create or replace function public.guardia_firma_manual() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('app.firma_manual_ok', true) is distinct from '1' then
    if (new.firma_estado, new.respaldo_path, new.respaldo_sha256, new.respaldo_subido_por, new.respaldo_subido_at, new.folio)
       is distinct from
       (old.firma_estado, old.respaldo_path, old.respaldo_sha256, old.respaldo_subido_por, old.respaldo_subido_at, old.folio) then
      raise exception 'La firma manual solo se modifica con registrar_entrega_manual / subir_respaldo_firma.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guardia_firma_manual_epp on public.epp_entregas;
create trigger guardia_firma_manual_epp before update on public.epp_entregas
  for each row execute function public.guardia_firma_manual();
drop trigger if exists guardia_firma_manual_herr on public.herramientas_asignaciones;
create trigger guardia_firma_manual_herr before update on public.herramientas_asignaciones
  for each row execute function public.guardia_firma_manual();

-- 7) RPC 1: marca la entrega como pendiente de firma en papel y le da folio
-- (corre con los permisos de quien llama, así que el RLS por empresa sigue aplicando)
create or replace function public.registrar_entrega_manual(p_tabla text, p_id uuid)
returns bigint language plpgsql set search_path = public as $$
declare v_folio bigint; v_code text; v_filas int;
begin
  if p_tabla = 'epp_entregas' then
    select code into v_code from epp_entregas where id = p_id;
  elsif p_tabla = 'herramientas_asignaciones' then
    select code into v_code from herramientas_asignaciones where id = p_id;
  else raise exception 'Tabla no válida: %', p_tabla; end if;
  if v_code is null then raise exception 'Entrega no encontrada o sin acceso.'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.epp.entregar')
          or public.tiene_permiso('bodega.kits') or public.tiene_permiso('bodega.herramientas')) then
    raise exception 'Sin permiso para registrar entregas.';
  end if;
  perform set_config('app.firma_manual_ok','1',true);
  v_folio := nextval('folio_entrega_seq');
  if p_tabla = 'epp_entregas' then
    update epp_entregas set folio = coalesce(folio, v_folio), firma_metodo = 'manual', firma_estado = 'pendiente_papel'
     where id = p_id and firma_estado in ('sin_firma','pendiente_papel') returning folio into v_folio;
  else
    update herramientas_asignaciones set folio = coalesce(folio, v_folio), firma_metodo = 'manual', firma_estado = 'pendiente_papel'
     where id = p_id and firma_estado in ('sin_firma','pendiente_papel') returning folio into v_folio;
  end if;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'La entrega ya tiene firma; no se puede pasar a firma manual.'; end if;
  return v_folio;
end $$;

-- 8) RPC 2: guarda el respaldo firmado; si ya había uno, exige motivo y archiva el anterior
create or replace function public.subir_respaldo_firma(p_tabla text, p_id uuid, p_path text, p_sha256 text, p_motivo text default null)
returns void language plpgsql set search_path = public as $$
declare v_old_path text; v_old_sha text; v_old_por uuid; v_old_at timestamptz; v_estado text;
begin
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Huella SHA-256 inválida.'; end if;
  if p_tabla = 'epp_entregas' then
    select firma_estado, respaldo_path, respaldo_sha256, respaldo_subido_por, respaldo_subido_at
      into v_estado, v_old_path, v_old_sha, v_old_por, v_old_at from epp_entregas where id = p_id;
  elsif p_tabla = 'herramientas_asignaciones' then
    select firma_estado, respaldo_path, respaldo_sha256, respaldo_subido_por, respaldo_subido_at
      into v_estado, v_old_path, v_old_sha, v_old_por, v_old_at from herramientas_asignaciones where id = p_id;
  else raise exception 'Tabla no válida: %', p_tabla; end if;
  if v_estado is null then raise exception 'Entrega no encontrada o sin acceso.'; end if;
  if v_estado not in ('pendiente_papel','firmada_papel') then
    raise exception 'La entrega no está en firma manual.'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.epp.entregar')
          or public.tiene_permiso('bodega.kits') or public.tiene_permiso('bodega.herramientas')) then
    raise exception 'Sin permiso.'; end if;
  perform set_config('app.firma_manual_ok','1',true);
  if v_old_path is not null then
    if p_motivo is null or length(btrim(p_motivo)) < 5 then
      raise exception 'Ya hay un respaldo subido. Para reemplazarlo hay que indicar el motivo (mínimo 5 letras).'; end if;
    insert into respaldos_firma_historial (tabla, registro_id, respaldo_path, respaldo_sha256, subido_por, subido_at, reemplazado_por, motivo)
    values (p_tabla, p_id, v_old_path, v_old_sha, v_old_por, v_old_at, auth.uid(), p_motivo);
  end if;
  if p_tabla = 'epp_entregas' then
    update epp_entregas set respaldo_path = p_path, respaldo_sha256 = p_sha256,
      respaldo_subido_por = auth.uid(), respaldo_subido_at = now(), firma_estado = 'firmada_papel' where id = p_id;
  else
    update herramientas_asignaciones set respaldo_path = p_path, respaldo_sha256 = p_sha256,
      respaldo_subido_por = auth.uid(), respaldo_subido_at = now(), firma_estado = 'firmada_papel' where id = p_id;
  end if;
end $$;

grant execute on function public.registrar_entrega_manual(text, uuid) to authenticated;
grant execute on function public.subir_respaldo_firma(text, uuid, text, text, text) to authenticated;

-- La comprobación (solo lectura) está en diagnostico-firma-manual.sql.

-- ROLLBACK (comentado):
-- drop function if exists public.subir_respaldo_firma(text, uuid, text, text, text);
-- drop function if exists public.registrar_entrega_manual(text, uuid);
-- drop trigger if exists guardia_firma_manual_epp on public.epp_entregas;
-- drop trigger if exists guardia_firma_manual_herr on public.herramientas_asignaciones;
-- drop function if exists public.guardia_firma_manual();
-- drop table if exists public.respaldos_firma_historial;
-- alter table public.herramientas_asignaciones drop column if exists folio, drop column if exists firma_metodo,
--   drop column if exists firma_estado, drop column if exists respaldo_path, drop column if exists respaldo_sha256,
--   drop column if exists respaldo_subido_por, drop column if exists respaldo_subido_at;
-- update public.epp_entregas set firma_metodo = null where firma_metodo = 'manual';
-- alter table public.epp_entregas drop column if exists folio, drop column if exists firma_estado,
--   drop column if exists respaldo_path, drop column if exists respaldo_sha256,
--   drop column if exists respaldo_subido_por, drop column if exists respaldo_subido_at;
-- alter table public.epp_entregas drop constraint if exists epp_entregas_firma_metodo_check;
-- alter table public.epp_entregas add constraint epp_entregas_firma_metodo_check check (firma_metodo in ('canvas'));
-- drop sequence if exists folio_entrega_seq;
