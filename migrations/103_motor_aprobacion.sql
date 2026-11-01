-- 103: motor de aprobación configurable. Idempotente. No edita migraciones anteriores.
-- Requiere 013, 014, 030, 086 y 090. No toca permiso_horario: la conexión es una migración posterior.

-- 1) CATÁLOGO DE TIPOS ---------------------------------------------------------
create table if not exists public.tipos_aprobables (
  codigo text primary key,
  nombre text not null,
  modulo text not null,
  activo boolean not null default true
);
insert into public.tipos_aprobables (codigo, nombre, modulo) values
  ('permiso_hora','Permiso por hora','asistencia'),
  ('permiso_dia','Permiso por día','asistencia'),
  ('entrega_epp','Entrega de EPP','bodega'),
  ('entrega_kit','Entrega de kit','bodega'),
  ('herramientas','Préstamo de herramientas','bodega'),
  ('pedido_materiales','Pedido de materiales','bodega'),
  ('ajuste_stock','Ajuste de stock','bodega'),
  ('solicitud_contrato','Solicitud de contrato','contratos')
on conflict (codigo) do nothing;

-- 2) CONFIGURACIÓN POR EMPRESA -------------------------------------------------
create table if not exists public.empresa_flujos (
  id uuid primary key default gen_random_uuid(),
  empresa_id int not null references public.empresa(id) on delete cascade,
  tipo text not null references public.tipos_aprobables(codigo),
  requiere_aprobacion boolean not null default false,
  momento text not null default 'antes' check (momento in ('antes','despues')),
  creado_en timestamptz not null default now(),
  constraint empresa_flujos_unico unique (empresa_id, tipo)
);
create table if not exists public.empresa_flujo_pasos (
  id uuid primary key default gen_random_uuid(),
  flujo_id uuid not null references public.empresa_flujos(id) on delete cascade,
  orden int not null check (orden > 0),
  nombre text not null check (nullif(btrim(nombre),'') is not null),
  regla text not null default 'cualquiera' check (regla in ('cualquiera','todos')),
  roles text[] not null default '{}',
  usuarios uuid[] not null default '{}',
  restringir_centro boolean not null default true,   -- la empresa del documento SIEMPRE se restringe
  constraint pasos_orden_unico unique (flujo_id, orden),
  constraint pasos_con_aprobadores check (cardinality(roles) + cardinality(usuarios) > 0),
  -- 'todos' solo tiene sentido con usuarios nombrados: se completa cuando firman todos ellos
  constraint pasos_todos_solo_usuarios check (regla = 'cualquiera' or (cardinality(usuarios) > 0 and cardinality(roles) = 0))
);

-- 3) DOCUMENTOS EN TRÁMITE Y DECISIONES ----------------------------------------
create table if not exists public.aprobaciones_documento (
  id uuid primary key default gen_random_uuid(),
  tipo text not null references public.tipos_aprobables(codigo),
  documento_id text not null,                       -- text: unos documentos usan id entero y otros uuid
  empresa_id int not null references public.empresa(id),
  centro_costo_id int references public.centros_costo(id),
  momento text not null check (momento in ('antes','despues')),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','anulado')),
  pasos jsonb not null,                             -- copia congelada de los pasos al crearse
  paso_actual int,
  solicitante uuid references public.perfiles(id) on delete set null,
  solicitante_nombre text,
  devuelto_a uuid,                                  -- en un rechazo, el solicitante
  motivo_cierre text,
  origen text not null default 'motor' check (origen in ('motor','migrado')),
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz,
  constraint aprob_cierre_con_motivo check (estado not in ('rechazado','anulado') or nullif(btrim(motivo_cierre),'') is not null)
);
-- un documento no tiene dos trámites vivos; uno rechazado o anulado sí puede reiniciarse
create unique index if not exists aprob_unica_viva
  on public.aprobaciones_documento (tipo, documento_id) where estado in ('pendiente','aprobado');
create index if not exists aprob_pendientes_idx on public.aprobaciones_documento (empresa_id, estado);

create table if not exists public.aprobaciones_decisiones (
  id uuid primary key default gen_random_uuid(),
  aprobacion_id uuid not null references public.aprobaciones_documento(id),
  paso int not null,
  decidido_por uuid not null,
  decidido_por_nombre text,
  decidido_en timestamptz not null default now(),   -- hora del servidor
  decision text not null check (decision in ('aprobado','rechazado')),
  nota text,
  codigo_verificacion text not null,
  constraint decision_rechazo_con_nota check (decision = 'aprobado' or length(btrim(coalesce(nota,''))) >= 5),
  constraint decision_una_por_persona unique (aprobacion_id, paso, decidido_por)   -- no se decide dos veces
);

-- 4) INMUTABILIDAD -------------------------------------------------------------
create or replace function public._aprob_inmutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Las decisiones y los trámites de aprobación no se editan ni se borran' using errcode = '42501';
end $$;

create or replace function public._aprob_solo_avanzar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'pendiente'
     and (to_jsonb(new) - 'estado' - 'paso_actual' - 'devuelto_a' - 'motivo_cierre' - 'cerrado_en')
       = (to_jsonb(old) - 'estado' - 'paso_actual' - 'devuelto_a' - 'motivo_cierre' - 'cerrado_en') then
    return new;
  end if;
  raise exception 'Un trámite de aprobación solo avanza mientras está pendiente; no se edita ni se borra' using errcode = '42501';
end $$;

drop trigger if exists aprob_decisiones_no_editar on public.aprobaciones_decisiones;
create trigger aprob_decisiones_no_editar before update or delete on public.aprobaciones_decisiones
  for each row execute function public._aprob_inmutable();
drop trigger if exists aprob_decisiones_no_truncar on public.aprobaciones_decisiones;
create trigger aprob_decisiones_no_truncar before truncate on public.aprobaciones_decisiones
  for each statement execute function public._aprob_inmutable();
drop trigger if exists aprob_doc_solo_avanzar on public.aprobaciones_documento;
create trigger aprob_doc_solo_avanzar before update or delete on public.aprobaciones_documento
  for each row execute function public._aprob_solo_avanzar();
drop trigger if exists aprob_doc_no_truncar on public.aprobaciones_documento;
create trigger aprob_doc_no_truncar before truncate on public.aprobaciones_documento
  for each statement execute function public._aprob_inmutable();

-- 5) PERMISOS (clave de texto, como 013, 088, 090 y 102) ----------------------
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('aprobaciones.configurar','Configurar flujos y aprobadores por empresa','aprobaciones', 50),
  ('aprobaciones.historial', 'Ver el historial de aprobaciones y sus decisiones','aprobaciones', 51)
on conflict (clave) do nothing;
insert into public.roles_permisos (rol, permiso)
select r.rol, r.permiso from (values
  ('admin','aprobaciones.configurar'), ('admin','aprobaciones.historial'),
  ('rrhh','aprobaciones.historial'), ('aprobador','aprobaciones.historial')
) as r(rol, permiso)
join public.permisos p on p.clave = r.permiso
on conflict do nothing;
-- Decidir un paso NO es un permiso global: lo da figurar como aprobador del paso y estar dentro del alcance.

-- 6) RLS POR EMPRESA (patrón 014/067) ------------------------------------------
create or replace function public._aprob_ve_empresa(p_empresa int, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin(uid) or exists (
    select 1 from public.perfil_empresas pe where pe.user_id = uid and pe.empresa_id = p_empresa);
$$;

alter table public.tipos_aprobables enable row level security;
alter table public.empresa_flujos enable row level security;
alter table public.empresa_flujo_pasos enable row level security;
alter table public.aprobaciones_documento enable row level security;
alter table public.aprobaciones_decisiones enable row level security;

drop policy if exists "tipos aprobables leer" on public.tipos_aprobables;
create policy "tipos aprobables leer" on public.tipos_aprobables for select
  using (auth.uid() is not null);

drop policy if exists "flujos leer" on public.empresa_flujos;
create policy "flujos leer" on public.empresa_flujos for select
  using (public._aprob_ve_empresa(empresa_id)
         and (public.es_admin() or public.tiene_permiso('aprobaciones.configurar') or public.tiene_permiso('aprobaciones.historial')));
drop policy if exists "flujos escribir" on public.empresa_flujos;
create policy "flujos escribir" on public.empresa_flujos for all
  using (public._aprob_ve_empresa(empresa_id) and (public.es_admin() or public.tiene_permiso('aprobaciones.configurar')))
  with check (public._aprob_ve_empresa(empresa_id) and (public.es_admin() or public.tiene_permiso('aprobaciones.configurar')));

drop policy if exists "pasos leer" on public.empresa_flujo_pasos;
create policy "pasos leer" on public.empresa_flujo_pasos for select
  using (exists (select 1 from public.empresa_flujos f where f.id = flujo_id and public._aprob_ve_empresa(f.empresa_id))
         and (public.es_admin() or public.tiene_permiso('aprobaciones.configurar') or public.tiene_permiso('aprobaciones.historial')));
drop policy if exists "pasos escribir" on public.empresa_flujo_pasos;
create policy "pasos escribir" on public.empresa_flujo_pasos for all
  using (exists (select 1 from public.empresa_flujos f where f.id = flujo_id and public._aprob_ve_empresa(f.empresa_id))
         and (public.es_admin() or public.tiene_permiso('aprobaciones.configurar')))
  with check (exists (select 1 from public.empresa_flujos f where f.id = flujo_id and public._aprob_ve_empresa(f.empresa_id))
         and (public.es_admin() or public.tiene_permiso('aprobaciones.configurar')));

drop policy if exists "aprobaciones leer" on public.aprobaciones_documento;
create policy "aprobaciones leer" on public.aprobaciones_documento for select
  using (solicitante = auth.uid()
         or (public._aprob_ve_empresa(empresa_id) and (public.es_admin() or public.tiene_permiso('aprobaciones.historial'))));
drop policy if exists "decisiones leer" on public.aprobaciones_decisiones;
create policy "decisiones leer" on public.aprobaciones_decisiones for select
  using (exists (select 1 from public.aprobaciones_documento a where a.id = aprobacion_id
                 and (a.solicitante = auth.uid()
                      or (public._aprob_ve_empresa(a.empresa_id) and (public.es_admin() or public.tiene_permiso('aprobaciones.historial'))))));

revoke all on public.tipos_aprobables, public.empresa_flujos, public.empresa_flujo_pasos,
  public.aprobaciones_documento, public.aprobaciones_decisiones from anon;
-- trámites y decisiones: solo escriben las funciones
revoke insert, update, delete, truncate on public.aprobaciones_documento, public.aprobaciones_decisiones from authenticated;
revoke insert, update, delete, truncate on public.tipos_aprobables from authenticated;

-- 7) FUNCIONES INTERNAS --------------------------------------------------------
-- Empresa, centro y solicitante del documento. Cada tipo se conecta aquí, uno por uno.
create or replace function public._aprob_resolver_doc(p_tipo text, p_doc text,
  out o_empresa int, out o_centro int, out o_solicitante uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_tipo = 'permiso_hora' then
    if p_doc !~ '^[0-9]+$' then raise exception 'Documento inválido para permiso_hora: %', p_doc using errcode = '22023'; end if;
    select t.empresa_id, t.centro_costo_id, ph.pedido_por into o_empresa, o_centro, o_solicitante
      from public.permiso_horario ph join public.trabajadores t on t.code = ph.code
     where ph.id = p_doc::int and ph.estado = 'pendiente';
    if not found then raise exception 'El permiso % no existe o ya no está pendiente', p_doc using errcode = '22023'; end if;
  else
    raise exception 'El tipo "%" todavía no está conectado al motor de aprobación', p_tipo using errcode = '0A000';
  end if;
end $$;

-- ¿Puede este usuario decidir el paso actual? (aprobador del paso + alcance + no lo propio + no repetido)
create or replace function public._aprob_puede_decidir(p_aprob uuid, p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare a public.aprobaciones_documento; v_paso jsonb; v_rol text;
begin
  select * into a from public.aprobaciones_documento where id = p_aprob;
  if not found or a.estado <> 'pendiente' or a.solicitante = p_uid then return false; end if;
  select rol into v_rol from public.perfiles where id = p_uid and activo;
  if not found then return false; end if;
  select e.value into v_paso from jsonb_array_elements(a.pasos) as e(value) where (e.value->>'orden')::int = a.paso_actual;
  if v_paso is null then return false; end if;
  if not (public.es_admin(p_uid)
          or p_uid::text in (select jsonb_array_elements_text(v_paso->'usuarios'))
          or v_rol in (select jsonb_array_elements_text(v_paso->'roles'))) then return false; end if;
  if exists (select 1 from public.aprobaciones_decisiones d
              where d.aprobacion_id = p_aprob and d.paso = a.paso_actual and d.decidido_por = p_uid) then return false; end if;
  if not public.es_admin(p_uid) then
    if not exists (select 1 from public.perfil_empresas pe where pe.user_id = p_uid and pe.empresa_id = a.empresa_id) then return false; end if;
    if coalesce((v_paso->>'restringir_centro')::boolean, true) and a.centro_costo_id is not null
       and not exists (select 1 from public.perfil_centros_costo pcc where pcc.user_id = p_uid and pcc.centro_costo_id = a.centro_costo_id) then
      return false;
    end if;
  end if;
  return true;
end $$;

-- 8) FUNCIONES PÚBLICAS --------------------------------------------------------
create or replace function public.iniciar_aprobacion(p_tipo text, p_documento text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_emp int; v_centro int; v_sol uuid; v_flujo public.empresa_flujos;
  v_pasos jsonb; v_id uuid; v_nombre text;
begin
  if v_uid is null or not exists (select 1 from public.perfiles where id = v_uid and activo) then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tipos_aprobables where codigo = p_tipo and activo) then
    raise exception 'Tipo de aprobación desconocido o inactivo: %', p_tipo using errcode = '22023';
  end if;
  select r.o_empresa, r.o_centro, r.o_solicitante into v_emp, v_centro, v_sol
    from public._aprob_resolver_doc(p_tipo, p_documento) r;
  if not public._aprob_ve_empresa(v_emp, v_uid) then
    raise exception 'El documento es de una empresa que no te corresponde' using errcode = '42501';
  end if;
  if not public.es_admin(v_uid) then
    if v_sol is distinct from v_uid then
      raise exception 'Solo quien creó el documento puede iniciar su aprobación' using errcode = '42501';
    end if;
    if v_centro is not null and not exists (select 1 from public.perfil_centros_costo where user_id = v_uid and centro_costo_id = v_centro) then
      raise exception 'El documento es de un centro de costo que no te corresponde' using errcode = '42501';
    end if;
  end if;

  select * into v_flujo from public.empresa_flujos where empresa_id = v_emp and tipo = p_tipo;
  if not found or not v_flujo.requiere_aprobacion then
    return jsonb_build_object('estado','sin_aprobacion_requerida');
  end if;

  select jsonb_agg(jsonb_build_object('orden',orden,'nombre',nombre,'regla',regla,'roles',to_jsonb(roles),
                                      'usuarios',to_jsonb(usuarios),'restringir_centro',restringir_centro) order by orden)
    into v_pasos from public.empresa_flujo_pasos where flujo_id = v_flujo.id;
  if v_pasos is null then
    raise exception 'El flujo de % de esta empresa exige aprobación pero no tiene pasos: pide a un administrador que lo configure', p_tipo using errcode = '22023';
  end if;

  select nombre into v_nombre from public.perfiles where id = v_uid;
  insert into public.aprobaciones_documento (tipo, documento_id, empresa_id, centro_costo_id, momento, pasos, paso_actual, solicitante, solicitante_nombre)
  values (p_tipo, p_documento, v_emp, v_centro, v_flujo.momento, v_pasos, (v_pasos->0->>'orden')::int, v_sol, v_nombre)
  on conflict do nothing returning id into v_id;
  if v_id is null then   -- ya había un trámite vivo: devolverlo (idempotente)
    select id into v_id from public.aprobaciones_documento where tipo = p_tipo and documento_id = p_documento and estado in ('pendiente','aprobado');
    return jsonb_build_object('estado','ya_iniciada','aprobacion_id',v_id);
  end if;
  return jsonb_build_object('estado','pendiente','aprobacion_id',v_id);
end $$;

create or replace function public.decidir_paso(p_aprobacion uuid, p_paso int, p_decision text, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); a public.aprobaciones_documento; v_paso jsonb; v_nota text := nullif(btrim(coalesce(p_nota,'')),'');
  v_nombre text; v_cod text; v_ahora timestamptz := clock_timestamp(); v_sig int; v_firmaron int; v_estado text;
begin
  if v_uid is null or not exists (select 1 from public.perfiles where id = v_uid and activo) then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;
  if p_decision not in ('aprobado','rechazado') then
    raise exception 'La decisión debe ser "aprobado" o "rechazado"' using errcode = '22023';
  end if;
  if p_decision = 'rechazado' and length(coalesce(v_nota,'')) < 5 then
    raise exception 'Un rechazo exige una nota de al menos 5 caracteres: es lo que verá quien lo pidió' using errcode = '22023';
  end if;

  select * into a from public.aprobaciones_documento where id = p_aprobacion for update;   -- serializa decisiones simultáneas
  if not found then raise exception 'Esa aprobación no existe' using errcode = '22023'; end if;
  if a.estado <> 'pendiente' then
    raise exception 'Ese trámite ya está "%" y no admite más decisiones', a.estado using errcode = '22023';
  end if;
  if p_paso is distinct from a.paso_actual then
    raise exception 'No se puede saltar un paso: el paso vigente es el %', a.paso_actual using errcode = '22023';
  end if;
  if a.solicitante = v_uid then
    raise exception 'No puedes decidir un trámite que pediste tú mismo' using errcode = '42501';
  end if;
  if exists (select 1 from public.aprobaciones_decisiones where aprobacion_id = a.id and paso = p_paso and decidido_por = v_uid) then
    raise exception 'Ya decidiste este paso' using errcode = '22023';
  end if;
  if not public._aprob_puede_decidir(a.id, v_uid) then
    raise exception 'No eres aprobador de este paso o el documento está fuera de tu empresa o centro de costo' using errcode = '42501';
  end if;

  select e.value into v_paso from jsonb_array_elements(a.pasos) as e(value) where (e.value->>'orden')::int = p_paso;
  select nombre into v_nombre from public.perfiles where id = v_uid;
  v_cod := upper(substr(encode(sha256(convert_to(a.id::text||'|'||p_paso||'|'||v_uid::text||'|'||p_decision||'|'||v_ahora::text||'|'||coalesce(v_nota,''),'UTF8')),'hex'),1,10));

  begin
    insert into public.aprobaciones_decisiones (aprobacion_id, paso, decidido_por, decidido_por_nombre, decidido_en, decision, nota, codigo_verificacion)
    values (a.id, p_paso, v_uid, v_nombre, v_ahora, p_decision, v_nota, v_cod);
  exception when unique_violation then
    raise exception 'Ya decidiste este paso' using errcode = '22023';
  end;

  v_estado := 'pendiente';
  if p_decision = 'rechazado' then
    update public.aprobaciones_documento set estado = 'rechazado', cerrado_en = v_ahora, motivo_cierre = v_nota, devuelto_a = a.solicitante where id = a.id;
    v_estado := 'rechazado';
  else
    if v_paso->>'regla' = 'todos' then
      select count(distinct d.decidido_por) into v_firmaron from public.aprobaciones_decisiones d
       where d.aprobacion_id = a.id and d.paso = p_paso and d.decision = 'aprobado'
         and d.decidido_por::text in (select jsonb_array_elements_text(v_paso->'usuarios'));
    end if;
    if v_paso->>'regla' = 'cualquiera' or v_firmaron >= jsonb_array_length(v_paso->'usuarios') then
      select min((e.value->>'orden')::int) into v_sig from jsonb_array_elements(a.pasos) as e(value) where (e.value->>'orden')::int > p_paso;
      if v_sig is null then
        update public.aprobaciones_documento set estado = 'aprobado', paso_actual = null, cerrado_en = v_ahora where id = a.id;
        v_estado := 'aprobado';
      else
        update public.aprobaciones_documento set paso_actual = v_sig where id = a.id;
      end if;
    end if;
  end if;
  return jsonb_build_object('estado', v_estado, 'codigo_verificacion', v_cod);
end $$;

create or replace function public.anular_aprobacion(p_aprobacion uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); a public.aprobaciones_documento;
begin
  if v_uid is null or not exists (select 1 from public.perfiles where id = v_uid and activo) then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo,''))) < 5 then raise exception 'Escribe el motivo de la anulación' using errcode = '22023'; end if;
  select * into a from public.aprobaciones_documento where id = p_aprobacion for update;
  if not found then raise exception 'Esa aprobación no existe' using errcode = '22023'; end if;
  if a.solicitante is distinct from v_uid and not public.es_admin(v_uid) then
    raise exception 'Solo quien lo pidió o un administrador puede anular el trámite' using errcode = '42501';
  end if;
  if a.estado <> 'pendiente' then raise exception 'Ese trámite ya está "%"', a.estado using errcode = '22023'; end if;
  update public.aprobaciones_documento set estado = 'anulado', paso_actual = null, cerrado_en = clock_timestamp(), motivo_cierre = btrim(p_motivo) where id = a.id;
end $$;

create or replace function public.pendientes_para_mi()
returns table (aprobacion_id uuid, tipo text, documento_id text, empresa_id int, centro_costo_id int,
               paso int, paso_nombre text, solicitante_nombre text, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado' using errcode = '42501'; end if;
  return query
    select a.id, a.tipo, a.documento_id, a.empresa_id, a.centro_costo_id, a.paso_actual,
           (select e.value->>'nombre' from jsonb_array_elements(a.pasos) as e(value) where (e.value->>'orden')::int = a.paso_actual),
           a.solicitante_nombre, a.creado_en
      from public.aprobaciones_documento a
     where a.estado = 'pendiente' and public._aprob_puede_decidir(a.id, auth.uid())
     order by a.creado_en;
end $$;

-- 9) EJECUCIÓN: fuera anon y public; solo authenticated las públicas ------------
revoke all on function public._aprob_inmutable() from public, anon, authenticated;
revoke all on function public._aprob_solo_avanzar() from public, anon, authenticated;
revoke all on function public._aprob_ve_empresa(int,uuid) from public, anon;
revoke all on function public._aprob_resolver_doc(text,text) from public, anon, authenticated;
revoke all on function public._aprob_puede_decidir(uuid,uuid) from public, anon, authenticated;
revoke all on function public.iniciar_aprobacion(text,text) from public, anon;
revoke all on function public.decidir_paso(uuid,int,text,text) from public, anon;
revoke all on function public.anular_aprobacion(uuid,text) from public, anon;
revoke all on function public.pendientes_para_mi() from public, anon;
grant execute on function public._aprob_ve_empresa(int,uuid) to authenticated;
grant execute on function public.iniciar_aprobacion(text,text) to authenticated;
grant execute on function public.decidir_paso(uuid,int,text,text) to authenticated;
grant execute on function public.anular_aprobacion(uuid,text) to authenticated;
grant execute on function public.pendientes_para_mi() to authenticated;

-- ROLLBACK: ver migrations/diagnostico-motor-aprobacion.sql (las decisiones no se borran: hay que desactivar los triggers antes).
