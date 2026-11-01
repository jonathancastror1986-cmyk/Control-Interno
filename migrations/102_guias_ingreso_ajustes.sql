-- 102: ingresos por guía y ajustes manuales de stock (apoyado en 100_stock_bodega y 101_pedidos_reposicion).
-- Idempotente. No edita migraciones anteriores. Requiere la 100 y la 101 aplicadas.
-- Las guías, sus líneas y el libro de stock no se editan ni se borran. Lo único que cambia en una guía
-- es registrada -> anulada (con motivo), y un trigger deja pasar solo eso.

-- 1) TABLAS ---------------------------------------------------------------
create table if not exists public.guias_ingreso (
  id uuid primary key default gen_random_uuid(),
  empresa_id int not null references public.empresa(id),
  bodega_id uuid not null,
  proveedor text not null check (nullif(btrim(proveedor), '') is not null),
  proveedor_norm text generated always as (lower(btrim(proveedor))) stored,
  numero text not null check (nullif(btrim(numero), '') is not null),
  numero_norm text generated always as (lower(btrim(numero))) stored,
  tipo text not null check (tipo in ('guia_despacho','factura','otro')),
  fecha_documento date not null,
  archivo_path text,
  pedido_id uuid references public.pedidos_materiales(id),
  estado text not null default 'registrada' check (estado in ('registrada','anulada')),
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  anulada_por uuid,
  anulada_en timestamptz,
  motivo_anulacion text,
  constraint guias_bodega_empresa_fk foreign key (bodega_id, empresa_id)
    references public.bodegas (id, empresa_id),
  constraint guias_anulada_con_motivo check (
    estado = 'registrada' or nullif(btrim(motivo_anulacion), '') is not null)
);
-- Una guía vigente no se carga dos veces. Si se anula, el mismo número se puede volver a cargar (corrección).
create unique index if not exists guias_unica_vigente
  on public.guias_ingreso (empresa_id, proveedor_norm, numero_norm) where estado = 'registrada';
create index if not exists guias_bodega_idx on public.guias_ingreso (bodega_id, creado_en desc);
create index if not exists guias_pedido_idx on public.guias_ingreso (pedido_id) where pedido_id is not null;

create table if not exists public.guia_lineas (
  id uuid primary key default gen_random_uuid(),
  guia_id uuid not null references public.guias_ingreso(id),
  epp_codigo text not null references public.epp_catalogo(codigo),
  talla text,
  cantidad int not null check (cantidad > 0),
  costo_unitario numeric(14,2) check (costo_unitario is null or costo_unitario >= 0)
);
create unique index if not exists guia_lineas_clave
  on public.guia_lineas (guia_id, epp_codigo, coalesce(talla, ''));

-- Referencias propias en el libro: una sola vez por guía, código y talla (segunda barrera contra doble ingreso o doble reversa).
create unique index if not exists stock_mov_guia_unico
  on public.stock_movimientos (referencia_tipo, referencia_id, epp_codigo, talla_norm)
  where referencia_tipo in ('guia_ingreso','guia_reversa');

-- 2) INMUTABILIDAD ------------------------------------------------------------
create or replace function public.guias_inmutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Las guías de ingreso no se editan ni se borran: anúlala con motivo' using errcode = '42501';
end $$;

create or replace function public.guias_solo_anular()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'registrada' and new.estado = 'anulada'
     and (to_jsonb(new) - 'estado' - 'anulada_por' - 'anulada_en' - 'motivo_anulacion')
       = (to_jsonb(old) - 'estado' - 'anulada_por' - 'anulada_en' - 'motivo_anulacion') then
    return new;
  end if;
  raise exception 'Las guías de ingreso no se editan ni se borran: anúlala con motivo' using errcode = '42501';
end $$;

drop trigger if exists guias_solo_anular_tg on public.guias_ingreso;
create trigger guias_solo_anular_tg before update or delete on public.guias_ingreso
  for each row execute function public.guias_solo_anular();
drop trigger if exists guias_no_truncar on public.guias_ingreso;
create trigger guias_no_truncar before truncate on public.guias_ingreso
  for each statement execute function public.guias_inmutable();
drop trigger if exists guia_lineas_no_editar on public.guia_lineas;
create trigger guia_lineas_no_editar before update or delete on public.guia_lineas
  for each row execute function public.guias_inmutable();
drop trigger if exists guia_lineas_no_truncar on public.guia_lineas;
create trigger guia_lineas_no_truncar before truncate on public.guia_lineas
  for each statement execute function public.guias_inmutable();

-- 3) PERMISOS (clave de texto, como 013, 088, 100 y 101; órdenes 27-30 libres) ----------
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('bodega.guias.ver',      'Ver guías de ingreso y sus archivos',          'bodega', 27),
  ('bodega.guias.registrar','Registrar guías de ingreso y subir el archivo','bodega', 28),
  ('bodega.guias.anular',   'Anular guías de ingreso (reversa el stock)',   'bodega', 29),
  ('bodega.stock.ajustar',  'Ajustar stock manualmente (inventario)',       'bodega', 30)
on conflict (clave) do nothing;
insert into public.roles_permisos (rol, permiso)
select r.rol, r.permiso from (values
  ('bodega','bodega.guias.ver'), ('bodega','bodega.guias.registrar'),
  ('admin','bodega.guias.ver'), ('admin','bodega.guias.registrar'),
  ('admin','bodega.guias.anular'), ('admin','bodega.stock.ajustar')
) as r(rol, permiso)
join public.permisos p on p.clave = r.permiso
on conflict do nothing;
-- Anular y ajustar quedan solo para admin; se otorgan a otro rol desde Soporte > Permisos.

-- 4) RLS POR EMPRESA (mismo patrón que 100 y 101) ------------------------------
alter table public.guias_ingreso enable row level security;
alter table public.guia_lineas enable row level security;

drop policy if exists "guias leer" on public.guias_ingreso;
create policy "guias leer" on public.guias_ingreso for select
  using (public.puede_ver_bodega(bodega_id)
         and (public.es_admin() or public.tiene_permiso('bodega.guias.ver')));
drop policy if exists "guia_lineas leer" on public.guia_lineas;
create policy "guia_lineas leer" on public.guia_lineas for select
  using (exists (select 1 from public.guias_ingreso g
                 where g.id = guia_id and public.puede_ver_bodega(g.bodega_id))
         and (public.es_admin() or public.tiene_permiso('bodega.guias.ver')));
-- Sin política de escritura: solo escriben las funciones.
revoke all on public.guias_ingreso, public.guia_lineas from anon;
revoke insert, update, delete, truncate on public.guias_ingreso, public.guia_lineas from authenticated;

-- 5) VALIDACIÓN DE ARTÍCULO (interna) -------------------------------------------
-- Devuelve la talla normalizada (null si no lleva).
create or replace function public._stock_validar_articulo(p_codigo text, p_talla text, p_exigir_activo boolean)
returns text language plpgsql stable security definer set search_path = public as $$
declare c record; v_talla text := nullif(btrim(p_talla), '');
begin
  select requiere_talla, activo into c from public.epp_catalogo where codigo = p_codigo;
  if not found then
    raise exception 'El código EPP % no existe en el catálogo', p_codigo using errcode = '23503'; end if;
  if p_exigir_activo and not c.activo then
    raise exception 'El artículo % está inactivo: actívalo en el catálogo antes de ingresarlo', p_codigo using errcode = '22023'; end if;
  if c.requiere_talla then
    if v_talla is null then
      raise exception 'El artículo % requiere talla', p_codigo using errcode = '22023'; end if;
    if not exists (select 1 from public.epp_tallas where talla = v_talla) then
      raise exception 'La talla "%" no es válida para %', v_talla, p_codigo using errcode = '22023'; end if;
  elsif v_talla is not null then
    raise exception 'El artículo % no lleva talla (recibió "%")', p_codigo, v_talla using errcode = '22023';
  end if;
  return v_talla;
end $$;

-- 6) REGISTRAR GUÍA (atómica) -----------------------------------------------------
-- p_lineas: [{"epp_codigo":"CASCO-001","talla":null,"cantidad":10,"costo_unitario":1500,"justificacion":null}, ...]
-- p_guia_id: opcional; el navegador lo genera para subir el archivo a "<empresa>/<guia_id>/<archivo>" antes de llamar.
-- p_archivo: ruta dentro del bucket "guias-ingreso" (debe empezar con "<empresa>/<guia_id>/").
-- Con p_pedido aplica las reglas de recibir_pedido: pedido enviado o parcial, de la misma bodega,
-- línea existente, y pasarse de lo pedido exige "justificacion".
create or replace function public.registrar_guia(
  p_bodega uuid, p_proveedor text, p_numero text, p_tipo text, p_fecha date, p_lineas jsonb,
  p_archivo text default null, p_pedido uuid default null, p_guia_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; p record; x record; l record;
  v_id uuid; v_prov text; v_num text; v_talla text; v_arch text; v_pref text;
  v_n int := 0; v_estado text;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.guias.registrar')) then
    raise exception 'No tienes permiso para registrar guías de ingreso' using errcode = '42501'; end if;
  select * into b from public.bodegas where id = p_bodega;
  if not found then raise exception 'La bodega no existe' using errcode = '23503'; end if;
  if not public.puede_ver_bodega(p_bodega) then
    raise exception 'Esa bodega no es de tu empresa' using errcode = '42501'; end if;
  if not b.activa then raise exception 'La bodega está inactiva' using errcode = '22023'; end if;

  v_prov := nullif(btrim(p_proveedor), ''); v_num := nullif(btrim(p_numero), '');
  if v_prov is null then raise exception 'Indica el proveedor' using errcode = '22023'; end if;
  if v_num is null then raise exception 'Indica el N° de la guía' using errcode = '22023'; end if;
  if p_tipo is null or p_tipo not in ('guia_despacho','factura','otro') then
    raise exception 'Tipo de documento inválido (guia_despacho, factura u otro)' using errcode = '22023'; end if;
  if p_fecha is null then raise exception 'Indica la fecha del documento' using errcode = '22023'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'p_lineas debe ser una lista con al menos una línea' using errcode = '22023'; end if;

  if exists (select 1 from jsonb_to_recordset(p_lineas) as y(epp_codigo text, talla text)
              group by btrim(y.epp_codigo), coalesce(nullif(btrim(y.talla), ''), '') having count(*) > 1) then
    raise exception 'Hay artículos repetidos en la guía: junta las cantidades en una sola línea' using errcode = '22023'; end if;

  v_id := coalesce(p_guia_id, gen_random_uuid());
  v_arch := nullif(btrim(p_archivo), '');
  if v_arch is not null then
    v_pref := b.empresa_id::text || '/' || v_id::text || '/';
    if left(v_arch, length(v_pref)) <> v_pref then
      raise exception 'El archivo debe estar en la carpeta de tu empresa y de esta guía (%)', v_pref using errcode = '22023'; end if;
  end if;

  if exists (select 1 from public.guias_ingreso g
              where g.empresa_id = b.empresa_id and g.proveedor_norm = lower(v_prov)
                and g.numero_norm = lower(v_num) and g.estado = 'registrada') then
    raise exception 'La guía % del proveedor % ya fue cargada', v_num, v_prov using errcode = '23505'; end if;

  if p_pedido is not null then
    select * into p from public.pedidos_materiales where id = p_pedido for update;
    if not found then raise exception 'El pedido no existe' using errcode = '23503'; end if;
    if p.bodega_id <> p_bodega then
      raise exception 'El pedido es de otra bodega' using errcode = '22023'; end if;
    if p.estado not in ('enviado','recibido_parcial') then
      raise exception 'Solo se recibe un pedido enviado o parcial (estado actual: %)', p.estado using errcode = '22023'; end if;
  end if;

  insert into public.guias_ingreso (id, empresa_id, bodega_id, proveedor, numero, tipo, fecha_documento, archivo_path, pedido_id)
  values (v_id, b.empresa_id, p_bodega, v_prov, v_num, p_tipo, p_fecha, v_arch, p_pedido);

  -- Orden fijo por (código, talla): evita bloqueos cruzados entre guías simultáneas.
  for x in select btrim(y.epp_codigo) as epp_codigo, y.talla, y.cantidad, y.costo_unitario,
                  nullif(btrim(y.justificacion), '') as justificacion
             from jsonb_to_recordset(p_lineas) as y(epp_codigo text, talla text, cantidad int, costo_unitario numeric, justificacion text)
            order by 1, coalesce(nullif(btrim(y.talla), ''), '') loop
    if x.cantidad is null or x.cantidad <= 0 then
      raise exception 'La cantidad de % debe ser mayor que 0', x.epp_codigo using errcode = '22023'; end if;
    if x.costo_unitario is not null and x.costo_unitario < 0 then
      raise exception 'El costo de % no puede ser negativo', x.epp_codigo using errcode = '22023'; end if;
    v_talla := public._stock_validar_articulo(x.epp_codigo, x.talla, true);

    insert into public.guia_lineas (guia_id, epp_codigo, talla, cantidad, costo_unitario)
    values (v_id, x.epp_codigo, v_talla, x.cantidad, x.costo_unitario);
    perform public._stock_aplicar(p_bodega, 'ingreso', x.epp_codigo, v_talla, x.cantidad,
        'guia_ingreso', v_id::text, null,
        'Guía ' || p_tipo || ' ' || v_num, v_prov, x.costo_unitario, auth.uid());

    if p_pedido is not null then
      select * into l from public.pedido_lineas
       where pedido_id = p_pedido and epp_codigo = x.epp_codigo and coalesce(talla, '') = coalesce(v_talla, '') for update;
      if not found then
        raise exception '% talla % no está en el pedido folio %', x.epp_codigo, coalesce(v_talla, '(sin talla)'), p.folio using errcode = '23503'; end if;
      if l.cantidad_recibida + x.cantidad > l.cantidad_pedida and x.justificacion is null then
        raise exception 'Se pidieron % de % talla % y ya hay % recibidas: recibir % más exige una justificación',
          l.cantidad_pedida, x.epp_codigo, coalesce(v_talla, '(sin talla)'), l.cantidad_recibida, x.cantidad using errcode = '22023'; end if;
      insert into public.pedido_recepciones (pedido_id, linea_id, guia, cantidad, justificacion)
      values (p_pedido, l.id, v_num || ' [' || left(v_id::text, 8) || ']', x.cantidad, x.justificacion);
      update public.pedido_lineas set cantidad_recibida = cantidad_recibida + x.cantidad where id = l.id;
    end if;
    v_n := v_n + 1;
  end loop;

  if p_pedido is not null then
    v_estado := case when exists (select 1 from public.pedido_lineas
                                   where pedido_id = p_pedido and cantidad_recibida < cantidad_pedida)
                     then 'recibido_parcial' else 'recibido' end;
    update public.pedidos_materiales set estado = v_estado where id = p_pedido;
    perform public._pedido_historial(p_pedido, p.estado, v_estado, 'Guía ' || v_num || ' (' || v_prov || '): ' || v_n || ' línea(s)');
  end if;
  return jsonb_build_object('guia_id', v_id, 'lineas', v_n, 'pedido_estado', v_estado);
end $$;

-- 7) ANULAR GUÍA (reversa; nunca borra) --------------------------------------------
-- Falla entera (no deja nada a medias) si la reversa dejaría algún saldo negativo.
create or replace function public.anular_guia(p_guia uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g record; p record; l record; v_mot text; v_n int := 0; v_estado text;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.guias.anular')) then
    raise exception 'No tienes permiso para anular guías' using errcode = '42501'; end if;
  v_mot := nullif(btrim(p_motivo), '');
  if v_mot is null then raise exception 'Indica el motivo de la anulación' using errcode = '22023'; end if;
  select * into g from public.guias_ingreso where id = p_guia for update;
  if not found then raise exception 'La guía no existe' using errcode = '23503'; end if;
  if not public.puede_ver_bodega(g.bodega_id) then
    raise exception 'Esa guía no es de tu empresa' using errcode = '42501'; end if;
  if g.estado <> 'registrada' then
    raise exception 'La guía ya está anulada' using errcode = '22023'; end if;

  if g.pedido_id is not null then
    select * into p from public.pedidos_materiales where id = g.pedido_id for update;
  end if;

  for l in select * from public.guia_lineas where guia_id = p_guia order by epp_codigo, coalesce(talla, '') loop
    perform public._stock_aplicar(g.bodega_id, 'ajuste_inventario', l.epp_codigo, l.talla, -l.cantidad,
        'guia_reversa', p_guia::text, null,
        'Anulación de guía ' || g.numero || ': ' || v_mot, g.proveedor, l.costo_unitario, auth.uid());
    if g.pedido_id is not null then
      update public.pedido_lineas
         set cantidad_recibida = greatest(0, cantidad_recibida - l.cantidad)
       where pedido_id = g.pedido_id and epp_codigo = l.epp_codigo and coalesce(talla, '') = coalesce(l.talla, '');
    end if;
    v_n := v_n + 1;
  end loop;

  update public.guias_ingreso
     set estado = 'anulada', anulada_por = auth.uid(), anulada_en = now(), motivo_anulacion = v_mot
   where id = p_guia;

  if g.pedido_id is not null and p.estado in ('recibido','recibido_parcial') then
    v_estado := case
      when not exists (select 1 from public.pedido_lineas where pedido_id = g.pedido_id and cantidad_recibida < cantidad_pedida) then 'recibido'
      when exists (select 1 from public.pedido_lineas where pedido_id = g.pedido_id and cantidad_recibida > 0) then 'recibido_parcial'
      else 'enviado' end;
    if v_estado <> p.estado then
      update public.pedidos_materiales set estado = v_estado where id = g.pedido_id;
      perform public._pedido_historial(g.pedido_id, p.estado, v_estado, 'Guía ' || g.numero || ' anulada: ' || v_mot);
    end if;
  end if;
  return jsonb_build_object('guia_id', p_guia, 'lineas_revertidas', v_n, 'pedido_estado', v_estado);
end $$;

-- 8) AJUSTAR STOCK (inventario) -----------------------------------------------------
-- Indica UNA sola cosa: p_nueva_cantidad (queda ese saldo) o p_diferencia (suma o resta).
-- Cada llamada genera un movimiento nuevo con referencia propia: dos llamadas = dos ajustes.
create or replace function public.ajustar_stock(
  p_bodega uuid, p_epp_codigo text, p_talla text, p_motivo text,
  p_nueva_cantidad int default null, p_diferencia int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_talla text; v_mot text; v_saldo int; v_delta int;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (public.es_admin() or public.tiene_permiso('bodega.stock.ajustar')) then
    raise exception 'No tienes permiso para ajustar stock' using errcode = '42501'; end if;
  if not exists (select 1 from public.bodegas where id = p_bodega) then
    raise exception 'La bodega no existe' using errcode = '23503'; end if;
  if not public.puede_ver_bodega(p_bodega) then
    raise exception 'Esa bodega no es de tu empresa' using errcode = '42501'; end if;
  v_mot := nullif(btrim(p_motivo), '');
  if v_mot is null or length(v_mot) < 5 then
    raise exception 'Escribe el motivo del ajuste (mínimo 5 caracteres)' using errcode = '22023'; end if;
  if (p_nueva_cantidad is null) = (p_diferencia is null) then
    raise exception 'Indica la nueva cantidad O la diferencia, no ambas ni ninguna' using errcode = '22023'; end if;
  if p_nueva_cantidad is not null and p_nueva_cantidad < 0 then
    raise exception 'La nueva cantidad no puede ser negativa' using errcode = '22023'; end if;
  v_talla := public._stock_validar_articulo(p_epp_codigo, p_talla, false);

  -- Mismo bloqueo que _stock_aplicar (reentrante en la transacción): el saldo no cambia entre leer y escribir.
  perform pg_advisory_xact_lock(hashtextextended(p_bodega::text || '|' || p_epp_codigo || '|' || coalesce(v_talla, ''), 0));
  select coalesce(sum(cantidad), 0) into v_saldo from public.stock_movimientos
   where bodega_id = p_bodega and epp_codigo = p_epp_codigo and talla_norm = coalesce(v_talla, '');
  v_delta := coalesce(p_diferencia, p_nueva_cantidad - v_saldo);
  if v_delta = 0 then
    raise exception 'El saldo ya es %: no hay nada que ajustar', v_saldo using errcode = '22023'; end if;
  if v_saldo + v_delta < 0 then
    raise exception 'El ajuste dejaría el stock en %: no se permite un saldo negativo', v_saldo + v_delta using errcode = '23514'; end if;

  perform public._stock_aplicar(p_bodega, 'ajuste_inventario', p_epp_codigo, v_talla, v_delta,
      'ajuste_manual', gen_random_uuid()::text, null,
      v_mot || ' (saldo ' || v_saldo || ' -> ' || (v_saldo + v_delta) || ')', null, null, auth.uid());
  return jsonb_build_object('saldo_anterior', v_saldo, 'diferencia', v_delta, 'saldo_nuevo', v_saldo + v_delta);
end $$;

-- 9) ARCHIVO DE LA GUÍA: BUCKET PRIVADO "guias-ingreso", RUTA "<empresa_id>/<guia_id>/<archivo>" ----
do $$ begin
  insert into storage.buckets (id, name, public) values ('guias-ingreso', 'guias-ingreso', false)
  on conflict (id) do nothing;
exception when others then
  raise notice 'No se pudo crear el bucket desde SQL (%). Créalo en Storage > New bucket (privado) con el nombre guias-ingreso.', sqlerrm;
end $$;

-- Las políticas de storage.objects NO se crean aquí (ver 068): se crean desde el panel, usando estas dos funciones.
--   Storage > Policies > bucket "guias-ingreso" (una política por operación; NO crear UPDATE ni DELETE):
--     Lectura (SELECT): usar la función puede_ver_archivo_guia sobre la columna name.
--     Subida (INSERT): usar la función puede_subir_archivo_guia sobre la columna name.
create or replace function public.puede_ver_archivo_guia(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and (public.es_admin() or public.tiene_permiso('bodega.guias.ver'))
     and (public.es_admin() or (split_part(object_name, '/', 1) ~ '^[0-9]+$'
          and exists (select 1 from public.perfil_empresas pe
                       where pe.user_id = auth.uid() and pe.empresa_id = split_part(object_name, '/', 1)::int)));
$$;
create or replace function public.puede_subir_archivo_guia(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and (public.es_admin() or public.tiene_permiso('bodega.guias.registrar'))
     and (public.es_admin() or (split_part(object_name, '/', 1) ~ '^[0-9]+$'
          and exists (select 1 from public.perfil_empresas pe
                       where pe.user_id = auth.uid() and pe.empresa_id = split_part(object_name, '/', 1)::int)));
$$;

-- 10) EXECUTE: fuera anon y public; internas cerradas -----------------------------------
revoke all on function public._stock_validar_articulo(text,text,boolean) from public, anon, authenticated;
revoke all on function public.guias_inmutable() from public, anon, authenticated;
revoke all on function public.guias_solo_anular() from public, anon, authenticated;
revoke all on function public.registrar_guia(uuid,text,text,text,date,jsonb,text,uuid,uuid) from public, anon;
revoke all on function public.anular_guia(uuid,text) from public, anon;
revoke all on function public.ajustar_stock(uuid,text,text,text,int,int) from public, anon;
revoke all on function public.puede_ver_archivo_guia(text) from public, anon;
revoke all on function public.puede_subir_archivo_guia(text) from public, anon;
grant execute on function public.registrar_guia(uuid,text,text,text,date,jsonb,text,uuid,uuid) to authenticated;
grant execute on function public.anular_guia(uuid,text) to authenticated;
grant execute on function public.ajustar_stock(uuid,text,text,text,int,int) to authenticated;
grant execute on function public.puede_ver_archivo_guia(text) to authenticated;
grant execute on function public.puede_subir_archivo_guia(text) to authenticated;

-- COMPROBACIÓN (solo lectura): ver diagnostico-guias-ingreso.sql

-- ROLLBACK (comentado). Borra las guías: respáldalas antes. Los movimientos del libro NO se pueden borrar y quedan.
-- drop function if exists public.puede_subir_archivo_guia(text);
-- drop function if exists public.puede_ver_archivo_guia(text);
-- drop function if exists public.ajustar_stock(uuid,text,text,text,int,int);
-- drop function if exists public.anular_guia(uuid,text);
-- drop function if exists public.registrar_guia(uuid,text,text,text,date,jsonb,text,uuid,uuid);
-- drop function if exists public._stock_validar_articulo(text,text,boolean);
-- drop table if exists public.guia_lineas;
-- drop table if exists public.guias_ingreso;   -- DROP TABLE no dispara los triggers de inmutabilidad
-- drop function if exists public.guias_solo_anular();
-- drop function if exists public.guias_inmutable();
-- drop index if exists public.stock_mov_guia_unico;
-- delete from public.roles_permisos where permiso in ('bodega.guias.ver','bodega.guias.registrar','bodega.guias.anular','bodega.stock.ajustar');
-- delete from public.permisos where clave in ('bodega.guias.ver','bodega.guias.registrar','bodega.guias.anular','bodega.stock.ajustar');
-- Bucket: vaciarlo y borrarlo desde Storage (y sus 2 políticas).
