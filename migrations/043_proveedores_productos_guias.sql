-- ===================================================================
-- 043 PROVEEDORES, PRODUCTOS Y RECEPCION DE GUIAS (2026-09-29)
-- ===================================================================
--
-- QUE RESUELVE
-- ------------
-- 1) Un producto con CODIGO INTERNO, que es el de la obra y no cambia.
-- 2) Un mismo producto comprado a VARIOS PROVEEDORES, cada uno con su
--    propio codigo. El codigo del proveedor NO es una columna del producto:
--    es una tabla aparte, con la pareja (producto, proveedor).
-- 3) Recepcion de guias: el QR de la guia llena los datos del proveedor, y
--    el bodeguero ingresa los items con el codigo interno y el del proveedor.
-- 4) Cotizaciones: pedir precios a mas de un proveedor los mismos items.
-- 5) Actualizar el codigo de un proveedor sin perder el historial.
--
-- -------------------------------------------------------------------
-- POR QUE EL CODIGO DEL PROVEEDOR ES UNA TABLA Y NO UNA COLUMNA
-- --------------------------------------------------------------
-- Porque el mismo producto se compra a dos proveedores, y cada uno le pone
-- su codigo. Con una sola columna "codigo_proveedor" en el producto, solo se
-- puede guardar uno de los dos, y se pisa al cambiar de proveedor. Con dos
-- columnas, "codigo_proveedor_a" y "codigo_proveedor_b", al tercer proveedor
-- no hay donde ponerlo, y la que falta es la que mas se necesita.
--
-- La tabla tiene su clave primaria compuesta (producto_id, proveedor_id), y
-- eso hace que el mismo producto con el mismo proveedor no se pueda repetir:
-- es la regla del negocio, puesta en la base y no en la pantalla.
--
-- -------------------------------------------------------------------
-- LA CLAVE (producto_id, proveedor_id) Y LA ACTUALIZACION DEL CODIGO
-- ---------------------------------------------------------------
-- El codigo se puede cambiar: un proveedor cambia su codigo y hay que
-- actualizarlo. Por eso la clave NO lleva el codigo. Si llevara el codigo,
-- cambiarlo seria borrar una fila y crear otra, y se perderia todo el
-- historial de compras de ese par. Asi el codigo es un dato que se actualiza
-- con UPDATE, y el historial queda.
--
-- Y se guarda quien lo cambio y cuando, en codigo_proveedor_historial. Sin
-- eso, "cambié el código del proveedor" no se puede auditar, y en una compra
-- es el dato con el que se encuentra al proveedor.
--
-- -------------------------------------------------------------------
-- EL RLS Y POR QUE NO HAY POLITICAS
-- --------------------------------
-- Mismo patrón que la 040: se enciende el RLS y NO se define ninguna
-- política. Con la clave anonita embebida en el HTML, sin RLS cualquiera que
-- abra las herramientas del navegador puede leer las tablas. Con RLS
-- encendido y sin políticas, la única puerta son las funciones "security
-- definer", que se revisan una por una.
--
-- -------------------------------------------------------------------
-- ORDEN DE APLICACIÓN
-- -------------------
-- Esta migracion usa la tabla guias de la 040. Aplicala DESPUES de la 040 y
-- de la 041. Si te dice que falta la 040, esa es la causa.
-- ===================================================================

-- -------------------------------------------------------------------
-- PROVEEDORES
-- -------------------------------------------------------------------
create table if not exists proveedores (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    integer not null,
  rut           text,
  nombre        text not null,
  -- Cómo se le escribe: nombre corto para las listas largas.
  nombre_corto  text,
  contacto      text,
  telefono      text,
  email         text,
  direccion     text,
  -- Un proveedor que ya no se usa no se borra: sus compras quedan apuntando
  -- a el, y si se borra la fila, esas compras quedan sin proveedor.
  activo        boolean not null default true,
  -- Para no traer proveedores dados de baja en los selectores.
  creado_por    uuid,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists proveedores_empresa on proveedores(empresa_id);
-- El RUT identifica al proveedor. No se pone unique sin filtrar por
-- empresa: dos empresas distintas pueden tener proveedores con el mismo RUT
-- en la base, y con la restricción global la segunda no se puede guardar.
create unique index if not exists proveedores_rut_unico
  on proveedores(empresa_id, rut)
  where rut is not null and activo;

comment on table proveedores is
  'Proveedores de insumos. Se dan de baja con activo=false, nunca se borran: las compras historicas los nombran.';

-- -------------------------------------------------------------------
-- PRODUCTOS
-- -------------------------------------------------------------------
-- El código interno es el de la obra. Es el que se usa en la planilla y en
-- el inventario, y no depende de ningún proveedor.
create table if not exists productos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    integer not null,
  codigo        text not null,
  nombre        text not null,
  descripcion   text,
  unidad        text not null default 'unidad',
  -- Precio de referencia para comparar cotizaciones. No es el precio de
  -- compra: es el último conocido, para tener contra qué mirar.
  precio_ref    numeric,
  activo        boolean not null default true,
  creado_por    uuid,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists productos_empresa on productos(empresa_id);
-- El código interno es único DENTRO de la empresa. Dos empresas pueden tener
-- el mismo código interno, y en la práctica lo tienen.
create unique index if not exists productos_codigo_unico
  on productos(empresa_id, codigo)
  where activo;

comment on table productos is
  'Productos con codigo interno de la obra. El codigo del proveedor NO va aqui: va en producto_proveedor.';

-- -------------------------------------------------------------------
-- EL MISMO PRODUCTO, VARIOS PROVEEDORES
-- -------------------------------------------------------------------
-- Esta es la tabla que hace lo que se pidio: un producto, muchos
-- proveedores, cada uno con su codigo.
create table if not exists producto_proveedor (
  producto_id   uuid not null references productos(id) on delete cascade,
  proveedor_id  uuid not null references proveedores(id) on delete cascade,
  -- El codigo que le pone ESTE proveedor. Cambia con el tiempo.
  codigo        text,
  -- El precio de este proveedor para este producto, que no es el mismo que
  -- el de otro proveedor del mismo producto.
  precio        numeric,
  -- El proveedor es el que manda en la fecha de entrega.
  dias_entrega  integer,
  -- Se marca false cuando el proveedor deja de vender este producto, sin
  -- borrar: las compras viejas siguen apuntando acá.
  vigente       boolean not null default true,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  primary key (producto_id, proveedor_id)
);

create index if not exists producto_proveedor_prov on producto_proveedor(proveedor_id);
-- Para buscar por codigo de proveedor: es como se busca cuando llega una
-- guia y hay que encontrar a qué producto corresponde.
create index if not exists producto_proveedor_codigo on producto_proveedor(codigo);

comment on table producto_proveedor is
  'El codigo que cada proveedor le pone a un producto. Un producto puede estar en muchos proveedores.';

-- -------------------------------------------------------------------
-- HISTORIAL DE CAMBIOS DE CODIGO
-- -------------------------------------------------------------------
-- Para poder responder "antes el proveedor lo llamaba de otra forma, y el
-- cambio lo hizo tal persona el tal día".
create table if not exists producto_proveedor_historial (
  id            bigserial primary key,
  producto_id   uuid not null references productos(id) on delete cascade,
  proveedor_id  uuid not null references proveedores(id) on delete cascade,
  codigo_anterior text,
  codigo_nuevo  text,
  motivo        text,
  cambiado_por  uuid,
  cambiado_en   timestamptz not null default now()
);

create index if not exists pph_historial_par on producto_proveedor_historial(producto_id, proveedor_id);

-- -------------------------------------------------------------------
-- RECEPCION DE GUIAS
-- -------------------------------------------------------------------
-- guia_id apunta a la guia de la 040: es la MISMA guia, la que vio el
-- portero. No se duplica. Por eso "se mezcla con la recepcion de guias de
-- porteria" no es un vinculo: es la misma fila.
--
-- estado:
--   pendiente   el portero la registro, el bodeguero no la reviso
--   revisando   el bodeguero esta cargando los items
--   receptionada los items quedaron cargados y cuadrados
--   anulada     seuyo de mas
create table if not exists guias_recepcion (
  id            uuid primary key default gen_random_uuid(),
  guia_id       uuid not null references guias(id) on delete cascade,
  proveedor_id  uuid not null references proveedores(id),
  -- La fecha que dice la guia. Se guarda aparte de la fecha de registro,
  -- porque no siempre son el mismo día: una guia puede entrar después.
  fecha         date,
  -- El número que trae impreso. La 040 ya guarda el número de la guia; acá
  -- se repite para poder buscar por él sin tiene que ir a la otra tabla.
  numero        text,
  -- Si el codigo del proveedor se reconoce: se guarda para no perderlo
  -- aunque después se cambie en la tabla producto_proveedor.
  codigo_proveedor text,
  -- Quien reviso: es distinto de quien la registro en porteria.
  revisado_por  uuid,
  revisado_en   timestamptz,
  estado        text not null default 'pendiente'
                  check (estado in ('pendiente','revisando','recepcionada','anulada')),
  observaciones text,
  -- Cantidades de la guia, que a veces no coinciden con lo cargado. Se
  -- guardan para poder comparar después sin volver a mirar la foto.
  total_recibido numeric not null default 0,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists guias_recepcion_prov on guias_recepcion(proveedor_id);
create index if not exists guias_recepcion_estado on guias_recepcion(estado);
create unique index if not exists guias_recepcion_guia on guias_recepcion(guia_id);

comment on table guias_recepcion is
  'La recepcion del bodeguero de una guia que ya registro porteria. Una guia, una fila.';

-- -------------------------------------------------------------------
-- LAS LINEAS DE LA RECEPCION
-- -------------------------------------------------------------------
-- Cada línea trae los TRES identificadores, y esa es la parte que evita
-- equivocarse:
--
--   producto_id        el producto de la obra. Es el bueno.
--   codigo_interno      el codigo interno, copiado. Se guarda aunque también
--                       esté el producto, porque una guía puede venir con un
--                       item que no está en el catálogo todavía, y en ese
--                       caso el producto queda nulo y el código interno es
--                       lo único que hay.
--   codigo_proveedor    el código del proveedor en ESTA guía. Puede ser
--                       distinto del de la tabla producto_proveedor, porque
--                       el proveedor lo cambió y todavía no lo actualizamos.
--
-- Con los tres, se puede saber después por qué se recibió algo: por código
-- interno, por el del proveedor, o por los dos.
create table if not exists guias_recepcion_lineas (
  id            uuid primary key default gen_random_uuid(),
  recepcion_id  uuid not null references guias_recepcion(id) on delete cascade,
  linea         integer,
  -- El producto puede quedar nulo: la guía puede traer algo que todavía no
  -- está en el catálogo. Por eso producto_id NO es NOT NULL.
  producto_id   uuid references productos(id),
  codigo_interno text,
  codigo_proveedor text,
  descripcion   text,
  cantidad      numeric not null default 1,
  unidad        text,
  precio_unitario numeric,
  -- Si el producto quedó identificado, el precio sale del catálogo; si no,
  -- queda el que escribió el bodeguero. Sirve para no perder el dato.
  total         numeric,
  -- Un item que el bodeguero no pudo ubicar contra el catálogo. Se marca en
  -- vez de borrarse, para que la lista de pendientes sea de verdad.
  sin_identificar boolean not null default false,
  creado_en     timestamptz not null default now()
);

create index if not exists grl_recepcion on guias_recepcion_lineas(recepcion_id);
create index if not exists grl_codigo_interno on guias_recepcion_lineas(codigo_interno);
create index if not exists grl_codigo_proveedor on guias_recepcion_lineas(codigo_proveedor);
-- Para buscar pendientes de ubicar, que es la lista que se trabaja.
create index if not exists grl_pendientes on guias_recepcion_lineas(sin_identificar)
  where sin_identificar;

comment on column guias_recepcion_lineas.producto_id is
  'Nulo cuando el item todavia no esta en el catalogo. Por eso el codigo_interno tambien se guarda.';

-- -------------------------------------------------------------------
-- COTIZACIONES
-- -------------------------------------------------------------------
-- Pedir precios a más de un proveedor los mismos items es el uso real: con
-- una cotización sola no hay con qué comparar.
create table if not exists cotizaciones (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    integer not null,
  proveedor_id  uuid not null references proveedores(id),
  numero        text,
  fecha         date not null default current_date,
  -- Vence: después de esto el precio ya no sirve para decidir.
  valida_hasta  date,
  estado        text not null default 'abierta'
                  check (estado in ('abierta','aceptada','rechazada','vencida')),
  total         numeric,
  observaciones text,
  solicitada_por uuid,
  aceptada_por  uuid,
  aceptada_en   timestamptz,
  -- El motivo de la aceptacion: "más barato" no alcanza, porque el precio
  -- más barato puede tener 15 días de entrega.
  motivo_aceptacion text,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists cotizaciones_empresa on cotizaciones(empresa_id);
create index if not exists cotizaciones_proveedor on cotizaciones(proveedor_id);
create index if not exists cotizaciones_estado on cotizaciones(estado);

comment on table cotizaciones is
  'Pedidos de precio a un proveedor. Varias abiertas a la vez para comparar los mismos productos.';

create table if not exists cotizaciones_lineas (
  id            uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  producto_id   uuid not null references productos(id),
  cantidad      numeric not null default 1,
  -- El precio que puso el proveedor, que es el dato que se vino a buscar.
  precio        numeric,
  dias_entrega  integer,
  total         numeric,
  observaciones text
);

create index if not exists cl_cotizacion on cotizaciones_lineas(cotizacion_id);
-- La misma pareja no se repite dentro de una cotización: si el proveedor
-- Si el proveedor manda el precio de un producto dos veces, es una fila con
-- la cantidad sumada.
create unique index if not exists cl_unico on cotizaciones_lineas(cotizacion_id, producto_id);
