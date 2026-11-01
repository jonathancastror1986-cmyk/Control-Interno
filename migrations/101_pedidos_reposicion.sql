-- 101: pedidos de reposición de materiales (apoyado en 100_stock_bodega).
-- Idempotente. No edita migraciones anteriores. Requiere la 100 aplicada.
-- Pendiente = cantidad pedida y no recibida de pedidos en borrador, enviado o recibido_parcial.

-- 1) OBJETIVO EN MÍNIMOS ----------------------------------------------
alter table public.stock_minimos add column if not exists objetivo int;
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'stock_minimos_objetivo_ck'
                   and conrelid = 'public.stock_minimos'::regclass) then
    alter table public.stock_minimos
      add constraint stock_minimos_objetivo_ck check (objetivo is null or objetivo >= minimo);
  end if;
end $$;
-- objetivo null = "sin definir": sugerir_pedido usa el mínimo como objetivo.

-- 2) TABLAS -------------------------------------------------------------
create unique index if not exists bodegas_id_empresa_uk on public.bodegas (id, empresa_id);

create table if not exists public.pedido_folios (
  empresa_id int primary key references public.empresa(id) on delete cascade,
  ultimo int not null default 0
);

create table if not exists public.pedidos_materiales (
  id uuid primary key default gen_random_uuid(),
  empresa_id int not null references public.empresa(id),
  bodega_id uuid not null,
  folio int not null,
  estado text not null default 'borrador'
    check (estado in ('borrador','enviado','recibido_parcial','recibido','anulado')),
  proveedor text,
  notas text,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  enviado_por uuid,
  enviado_en timestamptz,
  anulado_por uuid,
  anulado_en timestamptz,
  motivo_anulacion text,
  constraint pedidos_bodega_empresa_fk foreign key (bodega_id, empresa_id)
    references public.bodegas (id, empresa_id),
  constraint pedidos_folio_uk unique (empresa_id, folio)
);

create table if not exists public.pedido_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_materiales(id),
  epp_codigo text not null references public.epp_catalogo(codigo),
  talla text,
  talla_norm text generated always as (coalesce(talla, '')) stored,
  cantidad_pedida int not null check (cantidad_pedida > 0),
  cantidad_recibida int not null default 0 check (cantidad_recibida >= 0),
  costo_estimado numeric(14,2) check (costo_estimado is null or costo_estimado >= 0)
);
create unique index if not exists pedido_lineas_clave
  on public.pedido_lineas (pedido_id, epp_codigo, talla_norm);

-- Historial y recepciones: solo se agregan, no se editan ni se borran.
create table if not exists public.pedido_historial (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos_materiales(id),
  estado_anterior text,
  estado_nuevo text not null,
  detalle text,
  usuario_id uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists pedido_historial_pedido_idx on public.pedido_historial (pedido_id);

create table if not exists public.pedido_recepciones (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos_materiales(id),
  linea_id uuid not null references public.pedido_lineas(id),
  guia text not null check (nullif(btrim(guia), '') is not null),
  guia_norm text generated always as (lower(btrim(guia))) stored,
  cantidad int not null check (cantidad > 0),
  justificacion text,
  usuario_id uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
-- Misma guía + misma línea = misma recepción (idempotencia).
create unique index if not exists pedido_recepciones_unica
  on public.pedido_recepciones (linea_id, guia_norm);
-- Segunda barrera en el libro de stock.
create unique index if not exists stock_mov_pedido_unico
  on public.stock_movimientos (referencia_tipo, referencia_id, epp_codigo, talla_norm)
  where referencia_tipo = 'pedido_recepcion';

create or replace function public.pedidos_libro_inmutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Este registro no se edita ni se borra' using errcode = '42501';
end $$;
drop trigger if exists pedido_historial_no_editar on public.pedido_historial;
create trigger pedido_historial_no_editar before update or delete on public.pedido_historial
  for each row execute function public.pedidos_libro_inmutable();
drop trigger if exists pedido_historial_no_truncar on public.pedido_historial;
create trigger pedido_historial_no_truncar before truncate on public.pedido_historial
  for each statement execute function public.pedidos_libro_inmutable();
drop trigger if exists pedido_recep_no_editar on public.pedido_recepciones;
create trigger pedido_recep_no_editar before update or delete on public.pedido_recepciones
  for each row execute function public.pedidos_libro_inmutable();
drop trigger if exists pedido_recep_no_truncar on public.pedido_recepciones;
create trigger pedido_recep_no_truncar before truncate on public.pedido_recepciones
  for each statement execute function public.pedidos_libro_inmutable();

-- 3) PERMISOS (clave de texto, como 013 y 100) ---------------------------
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('bodega.pedidos.ver',    'Ver pedidos de reposición y sugerencias', 'bodega', 23),
  ('bodega.pedidos.crear',  'Crear y enviar pedidos de reposición',    'bodega', 24),
  ('bodega.pedidos.recibir','Recibir mercadería de un pedido',         'bodega', 25),
  ('bodega.pedidos.anular', 'Anular pedidos de reposición',            'bodega', 26)
on conflict (clave) do nothing;
insert into public.roles_permisos (rol, permiso)
select r.rol, r.permiso from (values
  ('bodega','bodega.pedidos.ver'), ('bodega','bodega.pedidos.crear'),
  ('bodega','bodega.pedidos.recibir'),
  ('admin','bodega.pedidos.ver'), ('admin','bodega.pedidos.crear'),
  ('admin','bodega.pedidos.recibir'), ('admin','bodega.pedidos.anular')
) as r(rol, permiso)
join public.permisos p on p.clave = r.permiso
on conflict do nothing;

-- 4) RLS POR EMPRESA (misma base que 100) --------------------------------
alter table public.pedido_folios enable row level security;
alter table public.pedidos_materiales enable row level security;
alter table public.pedido_lineas enable row level security;
alter table public.pedido_historial enable row level security;
alter table public.pedido_recepciones enable row level security;

drop policy if exists "pedidos leer" on public.pedidos_materiales;
create policy "pedidos leer" on public.pedidos_materiales for select
  using (public.puede_ver_bodega(bodega_id) and (public.es_admin() or public.tiene_permiso('bodega.pedidos.ver')));
drop policy if exists "pedido_lineas leer" on public.pedido_lineas;
create policy "pedido_lineas leer" on public.pedido_lineas for select
  using (exists (select 1 from public.pedidos_materiales p
                 where p.id = pedido_id and public.puede_ver_bodega(p.bodega_id))
         and (public.es_admin() or public.tiene_permiso('bodega.pedidos.ver')));
drop policy if exists "pedido_historial leer" on public.pedido_historial;
create policy "pedido_historial leer" on public.pedido_historial for select
  using (exists (select 1 from public.pedidos_materiales p
                 where p.id = pedido_id and public.puede_ver_bodega(p.bodega_id))
         and (public.es_admin() or public.tiene_permiso('bodega.pedidos.ver')));
drop policy if exists "pedido_recepciones leer" on public.pedido_recepciones;
create policy "pedido_recepciones leer" on public.pedido_recepciones for select
  using (exists (select 1 from public.pedidos_materiales p
                 where p.id = pedido_id and public.puede_ver_bodega(p.bodega_id))
         and (public.es_admin() or public.tiene_permiso('bodega.pedidos.ver')));
-- Sin política de escritura: solo escriben las funciones. pedido_folios no se lee desde el navegador.
revoke all on public.pedido_folios, public.pedidos_materiales, public.pedido_lineas,
  public.pedido_historial, public.pedido_recepciones from anon;
revoke insert, update, delete, truncate on public.pedido_folios, public.pedidos_materiales,
  public.pedido_lineas, public.pedido_historial, public.pedido_recepciones from authenticated;
revoke select on public.pedido_folios from authenticated;

-- 5) AUXILIARES INTERNOS ------------------------------------------------
create or replace function public._pedido_historial(p_pedido uuid, p_ant text, p_nuevo text, p_detalle text)
returns void language sql security definer set search_path = public as $$
  insert into public.pedido_historial (pedido_id, estado_anterior, estado_nuevo, detalle, usuario_id)
  values (p_pedido, p_ant, p_nuevo, p_detalle, auth.uid());
$$;

create or replace function public._pedido_siguiente_folio(p_empresa int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into public.pedido_folios as f (empresa_id, ultimo) values (p_empresa, 1)
  on conflict (empresa_id) do update set ultimo = f.ultimo + 1
  returning f.ultimo into v;
  return v;
end $$;

-- 6) SUGERENCIA (solo lectura) ---------------------------------------------
-- sugerida = objetivo - saldo - pendiente, sin negativos. Solo filas con saldo <= mínimo y sugerida > 0.
create or replace function public.sugerir_pedido(p_bodega uuid)
returns table (epp_codigo text, talla text, saldo int, minimo int, objetivo int,
               pendiente int, sugerida int, costo_estimado numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.pedidos.ver')) then
    raise exception 'No tienes permiso para ver pedidos' using errcode = '42501'; end if;
  if not public.puede_ver_bodega(p_bodega) then
    raise exception 'Esa bodega no es de tu empresa' using errcode = '42501'; end if;
  return query
  select m.epp_codigo, m.talla,
         coalesce(s.saldo, 0)::int,
         m.minimo,
         coalesce(m.objetivo, m.minimo),
         coalesce(pd.pend, 0)::int,
         greatest(coalesce(m.objetivo, m.minimo) - coalesce(s.saldo, 0) - coalesce(pd.pend, 0), 0)::int,
         (select mv.costo_unitario from public.stock_movimientos mv
           where mv.bodega_id = p_bodega and mv.epp_codigo = m.epp_codigo
             and mv.talla_norm = coalesce(m.talla, '') and mv.tipo = 'ingreso'
             and mv.costo_unitario is not null
           order by mv.id desc limit 1)
  from public.stock_minimos m
  left join (select mv.epp_codigo, mv.talla_norm, sum(mv.cantidad) as saldo
               from public.stock_movimientos mv where mv.bodega_id = p_bodega
              group by mv.epp_codigo, mv.talla_norm) s
         on s.epp_codigo = m.epp_codigo and s.talla_norm = coalesce(m.talla, '')
  left join (select l.epp_codigo, l.talla_norm, sum(greatest(l.cantidad_pedida - l.cantidad_recibida, 0)) as pend
               from public.pedido_lineas l
               join public.pedidos_materiales pm on pm.id = l.pedido_id
              where pm.bodega_id = p_bodega and pm.estado in ('borrador','enviado','recibido_parcial')
              group by l.epp_codigo, l.talla_norm) pd
         on pd.epp_codigo = m.epp_codigo and pd.talla_norm = coalesce(m.talla, '')
  where m.bodega_id = p_bodega
    and coalesce(s.saldo, 0) <= m.minimo
    and coalesce(m.objetivo, m.minimo) - coalesce(s.saldo, 0) - coalesce(pd.pend, 0) > 0
  order by m.epp_codigo, m.talla;
end $$;

-- 7) CREAR / ENVIAR / ANULAR -------------------------------------------------
-- p_lineas null = desde la sugerencia. Manual: [{"epp_codigo":"CASCO","talla":null,"cantidad":10,"costo_estimado":1500}]
create or replace function public.crear_pedido(
  p_bodega uuid, p_proveedor text default null, p_notas text default null, p_lineas jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp int; v_activa boolean; v_id uuid; v_folio int; r record; v_req boolean;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.pedidos.crear')) then
    raise exception 'No tienes permiso para crear pedidos' using errcode = '42501'; end if;
  if not public.puede_ver_bodega(p_bodega) then
    raise exception 'Esa bodega no es de tu empresa' using errcode = '42501'; end if;
  select empresa_id, activa into v_emp, v_activa from public.bodegas where id = p_bodega;
  if v_emp is null or not v_activa then
    raise exception 'La bodega no existe o está inactiva' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pedido|' || p_bodega::text, 0));

  if p_lineas is not null then
    if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
      raise exception 'p_lineas debe ser una lista con al menos una línea' using errcode = '22023'; end if;
    for r in select x.epp_codigo, nullif(btrim(x.talla), '') as talla, x.cantidad
               from jsonb_to_recordset(p_lineas) as x(epp_codigo text, talla text, cantidad int, costo_estimado numeric) loop
      if r.cantidad is null or r.cantidad <= 0 then
        raise exception 'Cantidad inválida para %', r.epp_codigo using errcode = '22023'; end if;
      select requiere_talla into v_req from public.epp_catalogo where codigo = r.epp_codigo;
      if not found then raise exception 'El código EPP % no existe', r.epp_codigo using errcode = '23503'; end if;
      if v_req and r.talla is null then
        raise exception 'El código % requiere talla', r.epp_codigo using errcode = '22023'; end if;
    end loop;
  elsif not exists (select 1 from public.sugerir_pedido(p_bodega)) then
    raise exception 'No hay artículos bajo el mínimo que necesiten reposición' using errcode = '22023';
  end if;

  v_folio := public._pedido_siguiente_folio(v_emp);
  insert into public.pedidos_materiales (empresa_id, bodega_id, folio, proveedor, notas)
  values (v_emp, p_bodega, v_folio, nullif(btrim(p_proveedor), ''), nullif(btrim(p_notas), ''))
  returning id into v_id;

  if p_lineas is null then
    insert into public.pedido_lineas (pedido_id, epp_codigo, talla, cantidad_pedida, costo_estimado)
    select v_id, s.epp_codigo, s.talla, s.sugerida, s.costo_estimado from public.sugerir_pedido(p_bodega) s;
  else
    insert into public.pedido_lineas (pedido_id, epp_codigo, talla, cantidad_pedida, costo_estimado)
    select v_id, x.epp_codigo, nullif(btrim(x.talla), ''), sum(x.cantidad), max(x.costo_estimado)
      from jsonb_to_recordset(p_lineas) as x(epp_codigo text, talla text, cantidad int, costo_estimado numeric)
     group by x.epp_codigo, nullif(btrim(x.talla), '');
  end if;
  perform public._pedido_historial(v_id, null, 'borrador',
    case when p_lineas is null then 'Creado desde la sugerencia' else 'Creado manualmente' end);
  return v_id;
end $$;

create or replace function public.enviar_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.pedidos.crear')) then
    raise exception 'No tienes permiso para enviar pedidos' using errcode = '42501'; end if;
  select * into p from public.pedidos_materiales where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe' using errcode = '23503'; end if;
  if not public.puede_ver_bodega(p.bodega_id) then
    raise exception 'Ese pedido no es de tu empresa' using errcode = '42501'; end if;
  if p.estado <> 'borrador' then
    raise exception 'Solo un pedido en borrador se puede enviar (estado actual: %)', p.estado using errcode = '22023'; end if;
  if not exists (select 1 from public.pedido_lineas where pedido_id = p_pedido) then
    raise exception 'El pedido no tiene líneas' using errcode = '22023'; end if;
  update public.pedidos_materiales
     set estado = 'enviado', enviado_por = auth.uid(), enviado_en = now() where id = p_pedido;
  perform public._pedido_historial(p_pedido, 'borrador', 'enviado', null);
end $$;

create or replace function public.anular_pedido(p_pedido uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.pedidos.anular')) then
    raise exception 'No tienes permiso para anular pedidos' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indica el motivo de la anulación' using errcode = '22023'; end if;
  select * into p from public.pedidos_materiales where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe' using errcode = '23503'; end if;
  if not public.puede_ver_bodega(p.bodega_id) then
    raise exception 'Ese pedido no es de tu empresa' using errcode = '42501'; end if;
  if p.estado not in ('borrador','enviado') then
    raise exception 'No se puede anular un pedido en estado % (si ya recibió mercadería, corrige con un ajuste de stock)', p.estado
      using errcode = '22023'; end if;
  if exists (select 1 from public.pedido_recepciones where pedido_id = p_pedido) then
    raise exception 'El pedido ya tiene recepciones: no se puede anular' using errcode = '22023'; end if;
  update public.pedidos_materiales
     set estado = 'anulado', anulado_por = auth.uid(), anulado_en = now(), motivo_anulacion = btrim(p_motivo)
   where id = p_pedido;
  perform public._pedido_historial(p_pedido, p.estado, 'anulado', btrim(p_motivo));
end $$;

-- 8) RECIBIR (atómica e idempotente) -------------------------------------------
-- p_lineas: [{"linea_id":"<uuid>","cantidad":5,"justificacion":null}, ...]
-- Repetir la misma guía para la misma línea se omite (no duplica). Devuelve {"aplicadas":n,"repetidas":n,"estado":"..."}.
create or replace function public.recibir_pedido(p_pedido uuid, p_lineas jsonb, p_guia text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p record; x record; l record; v_guia text; v_apl int := 0; v_rep int := 0; v_estado text;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.pedidos.recibir')) then
    raise exception 'No tienes permiso para recibir pedidos' using errcode = '42501'; end if;
  v_guia := lower(btrim(p_guia));
  if nullif(v_guia, '') is null then
    raise exception 'Indica el N° de guía' using errcode = '22023'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'p_lineas debe ser una lista con al menos una línea' using errcode = '22023'; end if;
  select * into p from public.pedidos_materiales where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe' using errcode = '23503'; end if;
  if not public.puede_ver_bodega(p.bodega_id) then
    raise exception 'Ese pedido no es de tu empresa' using errcode = '42501'; end if;
  if p.estado not in ('enviado','recibido_parcial') then
    raise exception 'Solo se recibe un pedido enviado o parcial (estado actual: %)', p.estado using errcode = '22023'; end if;
  if (select count(distinct y.linea_id) from jsonb_to_recordset(p_lineas) as y(linea_id uuid)) <> jsonb_array_length(p_lineas) then
    raise exception 'Hay líneas repetidas en la recepción' using errcode = '22023'; end if;

  for x in select y.linea_id, y.cantidad, nullif(btrim(y.justificacion), '') as justificacion
             from jsonb_to_recordset(p_lineas) as y(linea_id uuid, cantidad int, justificacion text) loop
    select * into l from public.pedido_lineas where id = x.linea_id and pedido_id = p_pedido for update;
    if not found then
      raise exception 'La línea % no pertenece a este pedido', x.linea_id using errcode = '23503'; end if;
    if x.cantidad is null or x.cantidad <= 0 then
      raise exception 'Cantidad inválida para % talla %', l.epp_codigo, coalesce(l.talla, '(sin talla)') using errcode = '22023'; end if;
    if exists (select 1 from public.pedido_recepciones r where r.linea_id = l.id and r.guia_norm = v_guia) then
      v_rep := v_rep + 1;
      continue;
    end if;
    if l.cantidad_recibida + x.cantidad > l.cantidad_pedida and x.justificacion is null then
      raise exception 'Se pidieron % de % talla % y ya hay % recibidas: recibir % más exige una justificación',
        l.cantidad_pedida, l.epp_codigo, coalesce(l.talla, '(sin talla)'), l.cantidad_recibida, x.cantidad
        using errcode = '22023'; end if;
    insert into public.pedido_recepciones (pedido_id, linea_id, guia, cantidad, justificacion)
    values (p_pedido, l.id, btrim(p_guia), x.cantidad, x.justificacion);
    perform public._stock_aplicar(p.bodega_id, 'ingreso', l.epp_codigo, l.talla, x.cantidad,
        'pedido_recepcion', p_pedido::text || '|' || v_guia, null,
        'Pedido folio ' || p.folio || ', guía ' || btrim(p_guia) || coalesce(' — ' || x.justificacion, ''),
        p.proveedor, l.costo_estimado, auth.uid());
    update public.pedido_lineas set cantidad_recibida = cantidad_recibida + x.cantidad where id = l.id;
    v_apl := v_apl + 1;
  end loop;

  v_estado := p.estado;
  if v_apl > 0 then
    v_estado := case when exists (select 1 from public.pedido_lineas
                                   where pedido_id = p_pedido and cantidad_recibida < cantidad_pedida)
                     then 'recibido_parcial' else 'recibido' end;
    update public.pedidos_materiales set estado = v_estado where id = p_pedido;
    perform public._pedido_historial(p_pedido, p.estado, v_estado,
      'Guía ' || btrim(p_guia) || ': ' || v_apl || ' línea(s) recibida(s)');
  end if;
  return jsonb_build_object('aplicadas', v_apl, 'repetidas', v_rep, 'estado', v_estado);
end $$;

-- 9) EXECUTE: fuera anon y public; internas cerradas ----------------------------
revoke all on function public._pedido_historial(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public._pedido_siguiente_folio(int) from public, anon, authenticated;
revoke all on function public.sugerir_pedido(uuid) from public, anon;
revoke all on function public.crear_pedido(uuid,text,text,jsonb) from public, anon;
revoke all on function public.enviar_pedido(uuid) from public, anon;
revoke all on function public.anular_pedido(uuid,text) from public, anon;
revoke all on function public.recibir_pedido(uuid,jsonb,text) from public, anon;
grant execute on function public.sugerir_pedido(uuid) to authenticated;
grant execute on function public.crear_pedido(uuid,text,text,jsonb) to authenticated;
grant execute on function public.enviar_pedido(uuid) to authenticated;
grant execute on function public.anular_pedido(uuid,text) to authenticated;
grant execute on function public.recibir_pedido(uuid,jsonb,text) to authenticated;

-- COMPROBACIÓN (solo lectura): ver diagnostico-pedidos-reposicion.sql

-- ROLLBACK (comentado; borra pedidos e historial: respáldalos antes)
-- drop function if exists public.recibir_pedido(uuid,jsonb,text);
-- drop function if exists public.anular_pedido(uuid,text);
-- drop function if exists public.enviar_pedido(uuid);
-- drop function if exists public.crear_pedido(uuid,text,text,jsonb);
-- drop function if exists public.sugerir_pedido(uuid);
-- drop function if exists public._pedido_siguiente_folio(int);
-- drop function if exists public._pedido_historial(uuid,text,text,text);
-- drop index if exists public.stock_mov_pedido_unico;
-- drop table if exists public.pedido_recepciones, public.pedido_historial,
--   public.pedido_lineas, public.pedidos_materiales, public.pedido_folios;
-- drop function if exists public.pedidos_libro_inmutable();
-- drop index if exists public.bodegas_id_empresa_uk;
-- alter table public.stock_minimos drop constraint if exists stock_minimos_objetivo_ck;
-- alter table public.stock_minimos drop column if exists objetivo;
-- delete from public.roles_permisos where permiso like 'bodega.pedidos.%';
-- delete from public.permisos where clave like 'bodega.pedidos.%';
