-- 097: correcciones a la firma manual (096), tras la revisión de reglas de negocio.
-- No edita la 096. Todo es idempotente. Rollback al final, comentado.
--  a) el reemplazo de un respaldo fallaba: el historial no dejaba insertar a quien llama
--  b) una entrega firmada con canvas podía pasar a "pendiente en papel"
--  c) un insert directo podía nacer como "firmada en papel" sin respaldo
--  d) la ruta del respaldo no se validaba contra el trabajador de la entrega
--  e) el permiso de la base ahora depende de la tabla, y el historial se filtra por empresa

-- 1) Las firmadas con canvas que quedaron en 'sin_firma' pasan a 'firmada'
update public.epp_entregas set firma_estado = 'firmada'
 where firma_estado = 'sin_firma' and (firma_url is not null or firma_metodo = 'canvas');

-- 2) Insert: el estado de firma lo decide la base, nunca el cliente
create or replace function public.guardia_firma_manual_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.folio := null;
  new.respaldo_path := null;
  new.respaldo_sha256 := null;
  new.respaldo_subido_por := null;
  new.respaldo_subido_at := null;
  if tg_table_name = 'epp_entregas' and new.firma_metodo = 'canvas' then
    new.firma_estado := 'firmada';
  else
    new.firma_estado := 'sin_firma';
    new.firma_metodo := null;
  end if;
  return new;
end $$;
drop trigger if exists guardia_firma_manual_ins_epp on public.epp_entregas;
create trigger guardia_firma_manual_ins_epp before insert on public.epp_entregas
  for each row execute function public.guardia_firma_manual_insert();
drop trigger if exists guardia_firma_manual_ins_herr on public.herramientas_asignaciones;
create trigger guardia_firma_manual_ins_herr before insert on public.herramientas_asignaciones
  for each row execute function public.guardia_firma_manual_insert();

-- 3) Update: la guardia también protege firma_metodo
create or replace function public.guardia_firma_manual() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('app.firma_manual_ok', true) is distinct from '1' then
    if (new.firma_estado, new.firma_metodo, new.respaldo_path, new.respaldo_sha256, new.respaldo_subido_por, new.respaldo_subido_at, new.folio)
       is distinct from
       (old.firma_estado, old.firma_metodo, old.respaldo_path, old.respaldo_sha256, old.respaldo_subido_por, old.respaldo_subido_at, old.folio) then
      raise exception 'La firma manual solo se modifica con registrar_entrega_manual / subir_respaldo_firma.';
    end if;
  end if;
  return new;
end $$;

-- 4) Historial: insert permitido solo si archiva el respaldo vigente de una entrega que el usuario ve
grant insert on public.respaldos_firma_historial to authenticated;
drop policy if exists "respaldos historial inserta" on public.respaldos_firma_historial;
create policy "respaldos historial inserta" on public.respaldos_firma_historial for insert
  with check (
    reemplazado_por = auth.uid()
    and (
      (tabla = 'epp_entregas' and exists (select 1 from public.epp_entregas e
         where e.id = respaldos_firma_historial.registro_id
           and e.respaldo_path = respaldos_firma_historial.respaldo_path
           and e.respaldo_sha256 = respaldos_firma_historial.respaldo_sha256))
      or
      (tabla = 'herramientas_asignaciones' and exists (select 1 from public.herramientas_asignaciones h
         where h.id = respaldos_firma_historial.registro_id
           and h.respaldo_path = respaldos_firma_historial.respaldo_path
           and h.respaldo_sha256 = respaldos_firma_historial.respaldo_sha256))
    )
  );
-- Lectura: además del permiso, solo lo de las entregas que la empresa del usuario ve
drop policy if exists "respaldos historial lee" on public.respaldos_firma_historial;
create policy "respaldos historial lee" on public.respaldos_firma_historial for select
  using (
    (public.es_admin() or public.tiene_permiso('bodega.epp.historial'))
    and (
      (tabla = 'epp_entregas' and exists (select 1 from public.epp_entregas e where e.id = respaldos_firma_historial.registro_id))
      or
      (tabla = 'herramientas_asignaciones' and exists (select 1 from public.herramientas_asignaciones h where h.id = respaldos_firma_historial.registro_id))
    )
  );
revoke update, delete on public.respaldos_firma_historial from authenticated, anon;

-- 5) Permiso según la tabla
create or replace function public.puede_firma_manual(p_tabla text) returns boolean
language sql stable set search_path = public as $$
  select public.es_admin()
      or case when p_tabla = 'herramientas_asignaciones'
              then public.tiene_permiso('bodega.herramientas')
              else public.tiene_permiso('bodega.epp.entregar') or public.tiene_permiso('bodega.kits') end;
$$;

-- 6) RPC 1: ahora rechaza las entregas que ya tienen firma electrónica
create or replace function public.registrar_entrega_manual(p_tabla text, p_id uuid)
returns bigint language plpgsql set search_path = public as $$
declare v_folio bigint; v_code text; v_filas int;
begin
  if p_tabla not in ('epp_entregas','herramientas_asignaciones') then
    raise exception 'Tabla no válida: %', p_tabla; end if;
  if not public.puede_firma_manual(p_tabla) then
    raise exception 'Sin permiso para registrar entregas.'; end if;
  if p_tabla = 'epp_entregas' then
    select code into v_code from epp_entregas where id = p_id;
  else
    select code into v_code from herramientas_asignaciones where id = p_id;
  end if;
  if v_code is null then raise exception 'Entrega no encontrada o sin acceso.'; end if;
  perform set_config('app.firma_manual_ok','1',true);
  v_folio := nextval('folio_entrega_seq');
  if p_tabla = 'epp_entregas' then
    update epp_entregas set folio = coalesce(folio, v_folio), firma_metodo = 'manual', firma_estado = 'pendiente_papel'
     where id = p_id and firma_estado in ('sin_firma','pendiente_papel')
       and firma_url is null and coalesce(firma_metodo,'manual') = 'manual'
     returning folio into v_folio;
  else
    update herramientas_asignaciones set folio = coalesce(folio, v_folio), firma_metodo = 'manual', firma_estado = 'pendiente_papel'
     where id = p_id and firma_estado in ('sin_firma','pendiente_papel')
     returning folio into v_folio;
  end if;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'La entrega ya tiene firma; no se puede pasar a firma manual.'; end if;
  return v_folio;
end $$;

-- 7) RPC 2: valida ruta y permiso, comprueba que el update afectó una fila
create or replace function public.subir_respaldo_firma(p_tabla text, p_id uuid, p_path text, p_sha256 text, p_motivo text default null)
returns void language plpgsql set search_path = public as $$
declare v_code text; v_old_path text; v_old_sha text; v_old_por uuid; v_old_at timestamptz; v_estado text; v_filas int;
begin
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Huella SHA-256 inválida.'; end if;
  if p_tabla not in ('epp_entregas','herramientas_asignaciones') then
    raise exception 'Tabla no válida: %', p_tabla; end if;
  if not public.puede_firma_manual(p_tabla) then raise exception 'Sin permiso.'; end if;
  if p_tabla = 'epp_entregas' then
    select code, firma_estado, respaldo_path, respaldo_sha256, respaldo_subido_por, respaldo_subido_at
      into v_code, v_estado, v_old_path, v_old_sha, v_old_por, v_old_at from epp_entregas where id = p_id;
  else
    select code, firma_estado, respaldo_path, respaldo_sha256, respaldo_subido_por, respaldo_subido_at
      into v_code, v_estado, v_old_path, v_old_sha, v_old_por, v_old_at from herramientas_asignaciones where id = p_id;
  end if;
  if v_estado is null then raise exception 'Entrega no encontrada o sin acceso.'; end if;
  if v_estado not in ('pendiente_papel','firmada_papel') then
    raise exception 'La entrega no está en firma manual.'; end if;
  if p_path is null or left(p_path, length(v_code) + 1) <> v_code || '/' or p_path like '%..%' then
    raise exception 'La ruta del respaldo no corresponde al trabajador de la entrega.'; end if;
  if p_tabla = 'herramientas_asignaciones' and p_path not like v_code || '/herr-' || p_id::text || '/%' then
    raise exception 'La ruta del respaldo no corresponde a esta entrega.'; end if;
  if p_tabla = 'epp_entregas' and p_path not like v_code || '/' || p_id::text || '/%' then
    raise exception 'La ruta del respaldo no corresponde a esta entrega.'; end if;
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
  get diagnostics v_filas = row_count;
  if v_filas = 0 then raise exception 'No se pudo guardar el respaldo: la entrega no es modificable con tu acceso.'; end if;
end $$;

grant execute on function public.puede_firma_manual(text) to authenticated;
grant execute on function public.registrar_entrega_manual(text, uuid) to authenticated;
grant execute on function public.subir_respaldo_firma(text, uuid, text, text, text) to authenticated;

-- La comprobación (solo lectura) está en diagnostico-firma-manual.sql.

-- ROLLBACK (comentado): devuelve las funciones de la 096 volviendo a ejecutar su bloque 6, 7 y 8
-- y restaura el historial sin insert.
-- drop trigger if exists guardia_firma_manual_ins_epp on public.epp_entregas;
-- drop trigger if exists guardia_firma_manual_ins_herr on public.herramientas_asignaciones;
-- drop function if exists public.guardia_firma_manual_insert();
-- drop policy if exists "respaldos historial inserta" on public.respaldos_firma_historial;
-- revoke insert on public.respaldos_firma_historial from authenticated;
-- drop function if exists public.puede_firma_manual(text);
