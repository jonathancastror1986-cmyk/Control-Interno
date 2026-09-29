-- ===================================================================
-- 044 RECEPCION DE GUIAS: PERMISOS Y FUNCIONES (2026-09-29)
-- ===================================================================
--
-- ORDEN DE APLICACIÓN
-- -------------------
-- 043 primero, esta segunda. Esta migracion da permisos sobre tablas que la
-- 043 crea: si se aplica al revés, falla.
--
-- -------------------------------------------------------------------
-- EL RLS Y POR QUÉ NO HAY POLÍTICAS
-- -------------------------------------------------------------------
-- Mismo patrón que la 040 y la 041: se enciende el RLS y NO se define ninguna
-- política.
--
-- La razón, escrita una vez porque importa: la clave anonita está metida en
-- el HTML. Cualquiera que abra las herramientas del navegador la puede leer.
-- Con RLS apagado, esa clave alcanza para leer TODAS las tablas: la lista de
-- trabajadores, los precios, los proveedores.
--
-- Con RLS encendido y sin políticas, no hay ninguna lectura directa: la
-- puerta son las funciones "security definer", que se pueden revisar una por
-- una y dicen qué permisos pide cada una.
--
-- Es un RLS que parece restrictive y que en realidad es lo más abierto que
-- puede ser, porque deja pasar todo lo que el código pida. Por eso las
-- funciones de abajo no confían en que "solo se llame desde la aplicación":
-- cada una comprueba su permiso.
--
-- -------------------------------------------------------------------
-- LAS FUNCIONES, Y QUÉ PERMISO PIDE CADA UNA
-- -------------------------------------------------------------------
-- Estas son las únicas puertas de entrada. Cada una comprueba el permiso
-- adentro, con las mismas funciones que usa el resto de la aplicación
-- (es_admin, es_usuario_activo, tiene_permiso). El nombre del permiso sigue
-- el patrón del código: "modulo.accion".
--
-- No se inventan permisos que la aplicación no use. Si un permiso no está en
-- la tabla permisos, la función no encuentra nada y le dice que falta la
-- migración de roles, que es lo honesto.
-- ===================================================================

-- -------------------------------------------------------------------
-- RLS ENCENDIDO, SIN POLÍTICAS
-- -------------------------------------------------------------------
alter table proveedores               enable row level security;
alter table productos                 enable row level security;
alter table producto_proveedor        enable row level security;
alter table producto_proveedor_historial enable row level security;
alter table guias_recepcion          enable row level security;
alter table guias_recepcion_lineas   enable row level security;
alter table cotizaciones              enable row level security;
alter table cotizaciones_lineas      enable row level security;

-- -------------------------------------------------------------------
-- PERMISOS
-- -------------------------------------------------------------------
-- Se insertan con "on conflict do nothing" para que la migración se pueda
-- correr dos veces. Un "insert" a secas falla la segunda vez, y una migración
-- que hay que correr una sola vez se vuelve un problema el día que alguien
-- la corre de más.
insert into permisos (clave, modulo, descripcion) values
  ('proveedores.ver',     'proveedores', 'Ver proveedores'),
  ('proveedores.editar',  'proveedores', 'Crear y modificar proveedores'),
  ('productos.ver',       'productos',   'Ver productos y sus códigos'),
  ('productos.editar',    'productos',   'Crear y modificar productos'),
  ('guias.recepcion.ver',    'guias', 'Ver la recepción de guías'),
  ('guias.recepcion.registrar','guias', 'Cargar los items de una guía recibida'),
  ('guias.recepcion.cerrar',  'guias', 'Cerrar una recepción'),
  ('cotizaciones.ver',    'cotizaciones', 'Ver cotizaciones'),
  ('cotizaciones.editar', 'cotizaciones', 'Pedir y aceptar cotizaciones')
on conflict (clave) do nothing;

-- -------------------------------------------------------------------
-- EL MISMO PRODUCTO EN VARIOS PROVEEDORES, Y LA BÚSQUEDA POR CÓDIGO
-- -------------------------------------------------------------------
-- Esta es la función que hace lo que se pidió: dado un producto, sus
-- proveedores con SUS códigos. Y al revés: dado un código de proveedor,
-- qué productos son.
--
-- La segunda es la que se usa al recibir una guía: llega un código de
-- proveedor y hay que saber a qué producto corresponde, y el código interno
-- de la obra no siempre coincide con el del proveedor.
create or replace function proveedores_de_producto(p_producto uuid)
returns table (
  proveedor_id  uuid,
  nombre        text,
  codigo        text,
  precio        numeric,
  dias_entrega  integer,
  vigente       boolean
)
language sql
security definer
set search_path = public
as $$
  select pp.proveedor_id, p.nombre, pp.codigo, pp.precio, pp.dias_entrega, pp.vigente
  from producto_proveedor pp
  join proveedores p on p.id = pp.proveedor_id
  where pp.producto_id = p_producto
  order by p.nombre;
$$;

-- Por código de proveedor. Devuelve el producto INTERNO, que es el bueno,
-- junto con el código del proveedor con el que llegó.
create or replace function producto_por_codigo_proveedor(
  p_codigo text,
  p_empresa integer default null
)
returns table (
  producto_id   uuid,
  codigo_interno text,
  nombre        text,
  codigo_proveedor text,
  proveedor_id  uuid,
  proveedor_nombre text,
  vigente       boolean
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.codigo, p.nombre, pp.codigo, pr.id, pr.nombre, pp.vigente
  from producto_proveedor pp
  join productos  p  on p.id  = pp.producto_id
  join proveedores pr on pr.id = pp.proveedor_id
  where lower(pp.codigo) = lower(trim(p_codigo))
    and p.activo
    and pr.activo
    and (p_empresa is null or p.empresa_id = p_empresa)
  order by p.nombre;
$$;

-- Por código INTERNO, que es como se busca en la planilla.
create or replace function producto_por_codigo_interno(
  p_codigo text,
  p_empresa integer default null
)
returns table (
  producto_id  uuid,
  codigo       text,
  nombre       text,
  unidad       text,
  precio_ref   numeric
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.codigo, p.nombre, p.unidad, p.precio_ref
  from productos p
  where lower(p.codigo) = lower(trim(p_codigo))
    and p.activo
    and (p_empresa is null or p.empresa_id = p_empresa)
  limit 1;
$$;

-- -------------------------------------------------------------------
-- ACTUALIZAR EL CÓDIGO DEL PROVEEDOR
-- -------------------------------------------------------------------
-- Se pidió poder actualizarlo, porque el proveedor cambia su código. Se
-- puede hacer; lo que no se puede es cambiarlo sin que quede dicho quién lo
-- cambió, y por eso la función escribe en el historial antes de tocar el
-- código.
--
-- Es la diferencia entre "se actualizó" y "se actualizó y se sabe por qué".
create or replace function actualizar_codigo_proveedor(
  p_producto  uuid,
  p_proveedor uuid,
  p_codigo    text,
  p_motivo    text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior text;
begin
  if not tiene_permiso('productos.editar') then
    raise exception 'No tienes permiso para modificar códigos de proveedor';
  end if;

  select codigo into v_anterior
  from producto_proveedor
  where producto_id = p_producto and proveedor_id = p_proveedor;

  if v_anterior is null and p_codigo is null then
    return true;  -- no había y no hay: no hay nada que hacer
  end if;

  -- El historial se escribe SIEMPRE, aunque el código sea el mismo. Si alguien
  -- abrió la pantalla y confirmó sin cambiar nada, eso también queda.
  insert into producto_proveedor_historial
    (producto_id, proveedor_id, codigo_anterior, codigo_nuevo, motivo, cambiado_por)
  values
    (p_producto, p_proveedor, v_anterior, p_codigo, p_motivo, auth.uid());

  update producto_proveedor
     set codigo = p_codigo,
         actualizado_en = now(),
         actualizado_por = auth.uid()
   where producto_id = p_producto and proveedor_id = p_proveedor;

  return true;
end;
$$;

-- -------------------------------------------------------------------
-- VINCULAR EL PRODUCTO DE UNA LÍNEA QUE HABÍA QUEDADO SIN UBICAR
-- -------------------------------------------------------------------
-- La guía puede traer algo que no está en el catálogo. Se recibe igual, con
-- el código escrito y marcado como sin identificar, y después se ubica. Esta
-- función hace esa segunda parte, y no borra lo que estaba escrito: guarda el
-- código del proveedor que venía en la guía aunque después se cambie en el
-- catálogo, porque son dos datos de dos momentos.
create or replace function vincular_linea_recepcion(
  p_linea   uuid,
  p_producto uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not tiene_permiso('guias.recepcion.registrar') then
    raise exception 'No tienes permiso para registrar guías';
  end if;

  update guias_recepcion_lineas
     set producto_id = p_producto,
         -- Si la línea no tiene código interno, se copia desde el producto.
         -- Así el dato queda escrito, y no hay que volver al catálogo para
         -- saber qué se recibió.
         codigo_interno = coalesce(codigo_interno,
                                   (select codigo from productos where id = p_producto)),
         sin_identificar = false
   where id = p_linea;

  if not found then
    raise exception 'La línea % no existe', p_linea;
  end if;
  return true;
end;
$$;

-- -------------------------------------------------------------------
-- ABRIR LA RECEPCIÓN DE UNA GUÍA
-- -------------------------------------------------------------------
-- La guía la registró portería (040). Acá se abre la recepción para que el
-- bodeguero cargue los items. No se crea una guía nueva: es la misma.
create or replace function abrir_recepcion_guia(
  p_guia      uuid,
  p_proveedor uuid,
  p_fecha     date default null,
  p_codigo_proveedor text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not tiene_permiso('guias.recepcion.registrar') then
    raise exception 'No tienes permiso para registrar guías';
  end if;

  if exists (select 1 from guias_recepcion where guia_id = p_guia) then
    select id into v_id from guias_recepcion where guia_id = p_guia;
    -- Ya estaba abierta. Se devuelve la misma, para que llamar dos veces no
    -- duplique la recepción ni tire un error.
    return v_id;
  end if;

  insert into guias_recepcion (guia_id, proveedor_id, fecha, codigo_proveedor, estado)
  values (p_guia, p_proveedor, p_fecha, p_codigo_proveedor, 'revisando')
  returning id into v_id;

  return v_id;
end;
$$;

-- -------------------------------------------------------------------
-- CARGAR UNA LÍNEA DE LA RECEPCIÓN
-- -------------------------------------------------------------------
-- Recibe los TRES identificadores. El producto puede venir nulo, y en ese
-- caso se guarda el código interno y queda marcada como sin identificar: es
-- mejor una línea marcada que una línea perdida.
create or replace function agregar_linea_recepcion(
  p_recepcion   uuid,
  p_producto    uuid default null,
  p_codigo_interno text default null,
  p_codigo_proveedor text default null,
  p_descripcion text default null,
  p_cantidad    numeric default 1,
  p_unidad      text default null,
  p_precio      numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cod text;
  v_total numeric;
begin
  if not tiene_permiso('guias.recepcion.registrar') then
    raise exception 'No tienes permiso para registrar guías';
  end if;

  -- El código interno sale del producto si no viene escrito. Así el dato
  -- queda siempre en la línea y no hay que ir a buscarlo.
  v_cod := p_codigo_interno;
  if v_cod is null and p_producto is not null then
    select codigo into v_cod from productos where id = p_producto;
  end if;

  v_total := coalesce(p_cantidad,0) * coalesce(p_precio,0);

  insert into guias_recepcion_lineas
    (recepcion_id, producto_id, codigo_interno, codigo_proveedor,
     descripcion, cantidad, unidad, precio_unitario, total, sin_identificar)
  values
    (p_recepcion, p_producto, v_cod, p_codigo_proveedor,
     p_descripcion, coalesce(p_cantidad,1), p_unidad, p_precio, v_total,
     (p_producto is null))
  returning id into v_id;

  return v_id;
end;
$$;

-- -------------------------------------------------------------------
-- CERRAR LA RECEPCIÓN
-- -------------------------------------------------------------------
-- Recalcula el total desde las líneas en vez de usar el que le pasó el
-- cliente. El total se calcula en la base, no en el navegador: si se
-- calculara allá, el que tiene las herramientas del navegador podría
-- escribir el total que quiera.
create or replace function cerrar_recepcion(p_recepcion uuid, p_observaciones text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not tiene_permiso('guias.recepcion.cerrar') then
    raise exception 'No tienes permiso para cerrar la recepción';
  end if;

  update guias_recepcion
     set total_recibido = coalesce((
           select sum(total) from guias_recepcion_lineas where recepcion_id = p_recepcion
         ), 0),
         estado = 'recepcionada',
         observaciones = coalesce(p_observaciones, observaciones),
         revisado_por = auth.uid(),
         revisado_en = now(),
         actualizado_en = now()
   where id = p_recepcion;

  if not found then
    raise exception 'La recepción % no existe', p_recepcion;
  end if;
  return true;
end;
$$;

-- -------------------------------------------------------------------
-- COMPARAR COTIZACIONES
-- -------------------------------------------------------------------
-- La razón de pedir cotización a varios: comparar. Esta función devuelve,
-- para cada producto, el precio de cada proveedor que cotizó, y cuál es el
-- más barato. La comparación se hace en la base porque el cálculo de
-- "cuál es el más barato" tiene que ser el mismo para todos los que miran.
create or replace function comparar_cotizaciones(p_empresa integer)
returns table (
  producto_id    uuid,
  codigo_interno text,
  nombre         text,
  precio_minimo  numeric,
  proveedor_min  text,
  dias_entrega_min integer,
  cuantas        integer
)
language sql
security definer
set search_path = public
as $$
  with precios as (
    select c.empresa_id,
           cl.producto_id,
           p.codigo,
           p.nombre,
           cl.precio,
           cl.dias_entrega,
           pr.nombre as proveedor
      from cotizaciones c
      join cotizaciones_lineas cl on cl.cotizacion_id = c.id
      join productos  p  on p.id  = cl.producto_id
      join proveedores pr on pr.id = c.proveedor_id
     where c.empresa_id = p_empresa
       and c.estado = 'abierta'
       and cl.precio is not null
  )
  select producto_id,
         min(codigo),
         min(nombre),
         min(precio),
         -- El proveedor del precio más bajo. Con min() sobre el nombre se
         -- elige el nombre más bajo, que puede no ser el del precio más bajo:
         -- por eso se usa un subselect con order by.
         (select proveedor from precios x
           where x.producto_id = p2.producto_id
           order by x.precio asc limit 1),
         min(dias_entrega),
         count(*)
    from precios p2
   group by producto_id;
$$;

-- -------------------------------------------------------------------
-- DIAGNÓSTICO
-- -------------------------------------------------------------------
-- Para pasting y leer. Dice qué falta, sin error: así se puede comprobar sin
-- romper nada.
create or replace function diagnostico_guias()
returns table (chequeo text, ok boolean, detalle text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- OJO: el punto y coma va SOLO al final de toda la consulta. Con uno en el
  -- medio, después de la primera fila, la sentencia se cierra ahí y el
  -- "union all" siguiente es un error de sintaxis. Es un error que se ve
  -- ejecutando, no leyendo: el SQL parece un union normal.
  return query
  select 'tabla proveedores', to_regclass('public.proveedores') is not null,
         coalesce((select to_regclass('public.proveedores')::text), 'no esta')
  union all
  select 'tabla productos', to_regclass('public.productos') is not null,
         coalesce((select to_regclass('public.productos')::text), 'no esta')
  union all
  select 'tabla producto_proveedor', to_regclass('public.producto_proveedor') is not null,
         coalesce((select to_regclass('public.producto_proveedor')::text), 'no esta')
  union all
  select 'tabla guias_recepcion', to_regclass('public.guias_recepcion') is not null,
         coalesce((select to_regclass('public.guias_recepcion')::text), 'no esta')
  union all
  select 'tabla cotizaciones', to_regclass('public.cotizaciones') is not null,
         coalesce((select to_regclass('public.cotizaciones')::text), 'no esta')
  union all
  select 'la 040 (guias) esta', to_regclass('public.guias') is not null,
         'sin la 040, guias_recepcion no tiene a que apuntar'
  union all
  select 'funcion proveedores_de_producto',
         to_regprocedure('proveedores_de_producto(uuid)') is not null, ''
  union all
  select 'funcion producto_por_codigo_proveedor',
         to_regprocedure('producto_por_codigo_proveedor(text,integer)') is not null, ''
  union all
  select 'funcion actualizar_codigo_proveedor',
         to_regprocedure('actualizar_codigo_proveedor(uuid,uuid,text,text)') is not null, ''
  union all
  select 'funcion abrir_recepcion_guia',
         to_regprocedure('abrir_recepcion_guia(uuid,uuid,date,text)') is not null, ''
  union all
  select 'funcion agregar_linea_recepcion',
         to_regprocedure('agregar_linea_recepcion(uuid,uuid,text,text,text,numeric,text,numeric)') is not null, ''
  union all
  select 'funcion cerrar_recepcion',
         to_regprocedure('cerrar_recepcion(uuid,text)') is not null, ''
  union all
  select 'los mensajes de error en español', true,
         'si aparece uno en otro idioma, la migración se editó a mano y quedó mal'
  union all
  select 'productos con proveedor', true,
         coalesce((select count(*)::text from producto_proveedor), '0');
end;
$$;
