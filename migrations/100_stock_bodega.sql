-- 100: stock de bodega (libro inmutable, saldos, descuento al entregar).
-- Idempotente. No edita migraciones anteriores.
-- Descuento: trigger AFTER INSERT solo sobre epp_entrega_items (cubre la entrega directa y la de kit).
-- No se pone trigger en epp_kit_asignacion_items: descontaría dos veces la misma entrega.
-- Cada bodega parte con descuenta_stock = false; se activa después de la carga inicial.

-- 1) BODEGAS Y MÍNIMOS ------------------------------------------------
create table if not exists public.bodegas (
  id uuid primary key default gen_random_uuid(),
  empresa_id int not null references public.empresa(id) on delete cascade,
  nombre text not null,
  es_defecto boolean not null default false,
  activa boolean not null default true,
  descuenta_stock boolean not null default false,
  creado_en timestamptz not null default now()
);
create unique index if not exists bodegas_una_defecto_por_empresa
  on public.bodegas (empresa_id) where es_defecto;

insert into public.bodegas (empresa_id, nombre, es_defecto)
select e.id, 'Bodega principal', true from public.empresa e
where not exists (select 1 from public.bodegas b where b.empresa_id = e.id and b.es_defecto)
on conflict do nothing;

create or replace function public.bodega_por_defecto_nueva_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.bodegas b where b.empresa_id = new.id and b.es_defecto) then
    insert into public.bodegas (empresa_id, nombre, es_defecto) values (new.id, 'Bodega principal', true);
  end if;
  return new;
end $$;
drop trigger if exists empresa_crea_bodega on public.empresa;
create trigger empresa_crea_bodega after insert on public.empresa
  for each row execute function public.bodega_por_defecto_nueva_empresa();

create table if not exists public.stock_minimos (
  id uuid primary key default gen_random_uuid(),
  bodega_id uuid not null references public.bodegas(id) on delete cascade,
  epp_codigo text not null references public.epp_catalogo(codigo) on delete cascade,
  talla text,
  minimo int not null check (minimo >= 0),
  critico int not null check (critico >= 0),
  check (critico <= minimo)
);
create unique index if not exists stock_minimos_clave
  on public.stock_minimos (bodega_id, epp_codigo, coalesce(talla, ''));

-- 2) LIBRO DE MOVIMIENTOS (solo se agrega) ---------------------------
create table if not exists public.stock_movimientos (
  id bigint generated always as identity primary key,
  bodega_id uuid not null references public.bodegas(id),
  tipo text not null check (tipo in
    ('ingreso','salida_entrega','devolucion','ajuste_inventario','merma','traslado')),
  epp_codigo text not null references public.epp_catalogo(codigo),
  talla text,
  talla_norm text generated always as (coalesce(talla, '')) stored,
  cantidad int not null check (cantidad <> 0),
  creado_en timestamptz not null default now(),
  usuario_id uuid default auth.uid(),
  referencia_tipo text,
  referencia_id text,
  entrega_id uuid,
  motivo text,
  proveedor text,
  costo_unitario numeric(14,2) check (costo_unitario is null or costo_unitario >= 0),
  constraint stock_signo_por_tipo check (
       (tipo in ('ingreso','devolucion') and cantidad > 0)
    or (tipo in ('salida_entrega','merma') and cantidad < 0)
    or tipo in ('ajuste_inventario','traslado')),
  constraint stock_motivo_requerido check (
    tipo not in ('ajuste_inventario','merma','traslado') or nullif(btrim(motivo), '') is not null)
);
create unique index if not exists stock_mov_referencia_unica
  on public.stock_movimientos (referencia_tipo, referencia_id, epp_codigo, talla_norm)
  where referencia_tipo in ('entrega_item','carga_inicial');
create index if not exists stock_mov_saldo_idx
  on public.stock_movimientos (bodega_id, epp_codigo, talla_norm);

create or replace function public.stock_movimientos_inmutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'El libro de stock no se edita ni se borra: registra un movimiento de corrección'
    using errcode = '42501';
end $$;
drop trigger if exists stock_mov_no_editar on public.stock_movimientos;
create trigger stock_mov_no_editar before update or delete on public.stock_movimientos
  for each row execute function public.stock_movimientos_inmutable();
drop trigger if exists stock_mov_no_truncar on public.stock_movimientos;
create trigger stock_mov_no_truncar before truncate on public.stock_movimientos
  for each statement execute function public.stock_movimientos_inmutable();

create or replace view public.stock_saldos with (security_invoker = true) as
select bodega_id, epp_codigo, talla_norm as talla, sum(cantidad)::int as saldo
from public.stock_movimientos
group by bodega_id, epp_codigo, talla_norm;

-- 3) PERMISOS (clave de texto, como 013 y 090) ------------------------
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('bodega.stock.ver',      'Ver stock, movimientos y mínimos',    'bodega', 19),
  ('bodega.stock.ingresar', 'Registrar ingresos de stock',         'bodega', 20),
  ('bodega.stock.cargar',   'Carga inicial masiva de stock',       'bodega', 21),
  ('bodega.stock.minimos',  'Definir mínimos y críticos de stock', 'bodega', 22)
on conflict (clave) do nothing;
insert into public.roles_permisos (rol, permiso)
select r.rol, r.permiso from (values
  ('bodega','bodega.stock.ver'), ('bodega','bodega.stock.ingresar'),
  ('bodega','bodega.stock.minimos'),
  ('admin','bodega.stock.ver'), ('admin','bodega.stock.ingresar'),
  ('admin','bodega.stock.cargar'), ('admin','bodega.stock.minimos')
) as r(rol, permiso)
join public.permisos p on p.clave = r.permiso
on conflict do nothing;

-- 4) RLS POR EMPRESA (patrón 014/067) ---------------------------------
alter table public.bodegas enable row level security;
alter table public.stock_minimos enable row level security;
alter table public.stock_movimientos enable row level security;

create or replace function public.puede_ver_bodega(p_bodega uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin(uid) or exists (
    select 1 from public.bodegas b
    join public.perfil_empresas pe on pe.empresa_id = b.empresa_id
    where b.id = p_bodega and pe.user_id = uid);
$$;

drop policy if exists "bodegas leer" on public.bodegas;
create policy "bodegas leer" on public.bodegas for select
  using (public.puede_ver_bodega(id) and (public.es_admin() or public.tiene_permiso('bodega.stock.ver')));
drop policy if exists "stock_minimos leer" on public.stock_minimos;
create policy "stock_minimos leer" on public.stock_minimos for select
  using (public.puede_ver_bodega(bodega_id) and (public.es_admin() or public.tiene_permiso('bodega.stock.ver')));
drop policy if exists "stock_minimos escribir" on public.stock_minimos;
create policy "stock_minimos escribir" on public.stock_minimos for all
  using (public.puede_ver_bodega(bodega_id) and (public.es_admin() or public.tiene_permiso('bodega.stock.minimos')))
  with check (public.puede_ver_bodega(bodega_id) and (public.es_admin() or public.tiene_permiso('bodega.stock.minimos')));
drop policy if exists "stock_mov leer" on public.stock_movimientos;
create policy "stock_mov leer" on public.stock_movimientos for select
  using (public.puede_ver_bodega(bodega_id) and (public.es_admin() or public.tiene_permiso('bodega.stock.ver')));
-- bodegas y stock_movimientos: sin política de escritura; solo escriben las funciones.
revoke insert, update, delete, truncate on public.stock_movimientos from authenticated, anon;
revoke insert, update, delete, truncate on public.bodegas from authenticated, anon;
revoke all on public.stock_saldos from anon;

-- 5) NÚCLEO: aplicar un movimiento con bloqueo y sin saldo negativo ----
create or replace function public._stock_aplicar(
  p_bodega uuid, p_tipo text, p_codigo text, p_talla text, p_cantidad int,
  p_ref_tipo text, p_ref_id text, p_entrega uuid, p_motivo text,
  p_proveedor text, p_costo numeric, p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_saldo int;
begin
  -- Bloqueo por (bodega, código, talla): serializa entregas concurrentes.
  perform pg_advisory_xact_lock(hashtextextended(p_bodega::text || '|' || p_codigo || '|' || coalesce(p_talla, ''), 0));
  if p_cantidad < 0 then
    select coalesce(sum(cantidad), 0) into v_saldo from public.stock_movimientos
     where bodega_id = p_bodega and epp_codigo = p_codigo and talla_norm = coalesce(p_talla, '');
    if v_saldo + p_cantidad < 0 then
      raise exception 'Stock insuficiente de % talla %: hay %, se piden %',
        p_codigo, coalesce(p_talla, '(sin talla)'), v_saldo, -p_cantidad using errcode = '23514';
    end if;
  end if;
  insert into public.stock_movimientos (bodega_id, tipo, epp_codigo, talla, cantidad,
      usuario_id, referencia_tipo, referencia_id, entrega_id, motivo, proveedor, costo_unitario)
  values (p_bodega, p_tipo, p_codigo, p_talla, p_cantidad,
      p_usuario, p_ref_tipo, p_ref_id, p_entrega, p_motivo, p_proveedor, p_costo);
end $$;
revoke all on function public._stock_aplicar(uuid,text,text,text,int,text,text,uuid,text,text,numeric,uuid) from public, anon, authenticated;

-- 6) DESCUENTO AL ENTREGAR (trigger solo sobre epp_entrega_items) -------
create or replace function public.stock_descontar_por_entrega()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_bodega uuid; v_desc boolean; v_code text;
begin
  if new.epp_codigo is null then return new; end if;
  select e.code into v_code from public.epp_entregas e where e.id = new.entrega_id;
  if v_code is null then
    raise exception 'La entrega % no existe', new.entrega_id using errcode = '23503';
  end if;
  select b.id, b.descuenta_stock into v_bodega, v_desc
    from public.trabajadores t
    join public.bodegas b on b.empresa_id = t.empresa_id and b.es_defecto and b.activa
   where t.code = v_code;
  if v_bodega is null or not v_desc then return new; end if;
  perform public._stock_aplicar(v_bodega, 'salida_entrega', new.epp_codigo, new.talla,
      -new.cantidad, 'entrega_item', new.id::text, new.entrega_id,
      'Entrega de EPP', null, null, auth.uid());
  return new;
end $$;
revoke all on function public.stock_descontar_por_entrega() from public, anon, authenticated;
drop trigger if exists epp_entrega_items_descuenta_stock on public.epp_entrega_items;
create trigger epp_entrega_items_descuenta_stock after insert on public.epp_entrega_items
  for each row execute function public.stock_descontar_por_entrega();

-- 7) INGRESO Y CARGA INICIAL -------------------------------------------
create or replace function public.registrar_ingreso_stock(
  p_bodega uuid, p_epp_codigo text, p_talla text, p_cantidad int,
  p_referencia text, p_proveedor text default null, p_costo_unitario numeric default null,
  p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_req boolean;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.stock.ingresar')) then
    raise exception 'No tienes permiso para ingresar stock' using errcode = '42501'; end if;
  if not public.puede_ver_bodega(p_bodega) then
    raise exception 'Esa bodega no es de tu empresa' using errcode = '42501'; end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que 0' using errcode = '22023'; end if;
  select requiere_talla into v_req from public.epp_catalogo where codigo = p_epp_codigo;
  if not found then raise exception 'El código EPP % no existe en el catálogo', p_epp_codigo using errcode = '23503'; end if;
  if v_req and nullif(btrim(p_talla), '') is null then
    raise exception 'El código % requiere talla', p_epp_codigo using errcode = '22023'; end if;
  perform public._stock_aplicar(p_bodega, 'ingreso', p_epp_codigo, nullif(btrim(p_talla), ''), p_cantidad,
      'guia', nullif(btrim(p_referencia), ''), null, p_motivo, p_proveedor, p_costo_unitario, auth.uid());
end $$;

-- p_filas: [{"epp_codigo":"CASCO","talla":null,"cantidad":10,"costo_unitario":1500}, ...]
-- Todo o nada. Repetir la misma p_referencia falla (no duplica la carga).
create or replace function public.cargar_stock_inicial(
  p_bodega uuid, p_referencia text, p_filas jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare f jsonb; v_n int := 0; v_req boolean; v_cod text; v_talla text; v_cant int;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.stock.cargar')) then
    raise exception 'No tienes permiso para la carga inicial de stock' using errcode = '42501'; end if;
  if not public.puede_ver_bodega(p_bodega) then
    raise exception 'Esa bodega no es de tu empresa' using errcode = '42501'; end if;
  if nullif(btrim(p_referencia), '') is null then
    raise exception 'Indica una referencia para la carga (ej. INVENTARIO-2025-01)' using errcode = '22023'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'p_filas debe ser una lista con al menos una fila' using errcode = '22023'; end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    v_cod := f->>'epp_codigo'; v_talla := nullif(btrim(f->>'talla'), '');
    v_cant := (f->>'cantidad')::int;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Cantidad inválida para %', v_cod using errcode = '22023'; end if;
    select requiere_talla into v_req from public.epp_catalogo where codigo = v_cod;
    if not found then raise exception 'El código EPP % no existe', v_cod using errcode = '23503'; end if;
    if v_req and v_talla is null then
      raise exception 'El código % requiere talla', v_cod using errcode = '22023'; end if;
    perform public._stock_aplicar(p_bodega, 'ingreso', v_cod, v_talla, v_cant,
        'carga_inicial', btrim(p_referencia), null, 'Carga inicial', null,
        nullif(f->>'costo_unitario', '')::numeric, auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.registrar_ingreso_stock(uuid,text,text,int,text,text,numeric,text) from public, anon;
revoke all on function public.cargar_stock_inicial(uuid,text,jsonb) from public, anon;
revoke all on function public.puede_ver_bodega(uuid,uuid) from public, anon;
grant execute on function public.registrar_ingreso_stock(uuid,text,text,int,text,text,numeric,text) to authenticated;
grant execute on function public.cargar_stock_inicial(uuid,text,jsonb) to authenticated;
grant execute on function public.puede_ver_bodega(uuid,uuid) to authenticated;

-- COMPROBACIÓN (solo lectura): ver diagnostico-stock-bodega.sql

-- ROLLBACK (comentado; el libro con datos se pierde: respáldalo antes)
-- drop trigger if exists epp_entrega_items_descuenta_stock on public.epp_entrega_items;
-- drop function if exists public.stock_descontar_por_entrega();
-- drop function if exists public.cargar_stock_inicial(uuid,text,jsonb);
-- drop function if exists public.registrar_ingreso_stock(uuid,text,text,int,text,text,numeric,text);
-- drop function if exists public._stock_aplicar(uuid,text,text,text,int,text,text,uuid,text,text,numeric,uuid);
-- drop view if exists public.stock_saldos;
-- drop table if exists public.stock_movimientos, public.stock_minimos;
-- drop trigger if exists empresa_crea_bodega on public.empresa;
-- drop function if exists public.bodega_por_defecto_nueva_empresa();
-- drop table if exists public.bodegas;
-- drop function if exists public.puede_ver_bodega(uuid,uuid);
-- drop function if exists public.stock_movimientos_inmutable();
-- delete from public.roles_permisos where permiso like 'bodega.stock.%';
-- delete from public.permisos where clave like 'bodega.stock.%';
