-- ===================================================================
-- 049: EL EXPEDIENTE DEL TRABAJADOR (2026-09-29)
-- ===================================================================
--
-- QUÉ ES
-- -------
-- Un expediente por trabajador: la carpeta donde vive todo lo que hay de él.
-- Contrato, anexos, certificado de salud, inducción, charlas. Un trabajador que
-- entra tiene una carpeta, no papeles sueltos, y de ahí sale lo de "firmas de
-- contratos y anexos después" sin refactor: es el mismo lugar.
--
-- EL EJE ES EL CENTRO DE COSTO, NO LA EMPRESA
-- --------------------------------------------
-- Hay una sola empresa y varias unidades: obras, sucursales, tiendas. Entonces
-- el expediente se ordena por CENTRO DE COSTO, que es lo que separa a la
-- gente, y no por empresa, que es lo mismo para todos.
--
-- Es la diferencia entre un expediente bien puesto y uno que hay que mover
-- después. Con empresa, un trabajador que cambia de obra necesita que le
-- cambien el expediente entero. Con centro de costo, se le cambia el campo y
-- queda.
--
-- -------------------------------------------------------------------
-- EL PAPEL ORIGINAL SÍ SE ARCHIVA
-- -------------------------------
-- Se imprimen dos copias: una al archivo, con la ficha, y una al trabajador.
-- El original se guarda en un archivador físico, en un folder por persona.
--
-- Y el escaneo firmado se sube después, como respaldo. Los dos juntos:
--
--   el papel  ->  lo que realmente se firmó
--   el escaneo + su huella  ->  que ese escaneo no cambió después
--
-- El hash NO reemplaza el papel: prueba que el escaneo es íntegro, no que sea
-- fiel al original. Por eso los dos se guardan.
--
-- -------------------------------------------------------------------
-- LA MONEDA DEL COBRO, Y POR QUÉ NO BASTA CON EL NÚMERO
-- ------------------------------------------------------
-- La comisión por trámites se le cobra a LA EMPRESA (el subcontratista), no
-- al trabajador. A un trabajador sería un descuento de renta, que lo regula el
-- Código del Trabajo.  REVISIÓN LEGAL: confirmar los límites, la notificación
-- y el derecho a oponerse. Fuente: Código del Trabajo en LeyChile (BCN).
--
-- La moneda se elige por cobro: pesos, dólares, o UF.
--
-- Y aquí está lo importante: un monto en UF SIN la UF de ese día no significa
-- nada. La UF cambia todos los días, así que "1,5 UF" en enero y en junio son
-- cifras distintas. Si se guardara solo el 1,5, dentro de un año el cobro
-- sería un número sin respaldo y nadie podría demostrar cuánto era.
--
-- Por eso el cobro guarda el monto en la moneda elegida Y el valor de esa
-- moneda en la fecha. Con pesos el monto ya es el valor. Con dólares y UF, el
-- valor se guarda ese día y no se vuelve a calcular nunca: un cobro de marzo
-- se informa en los pesos de marzo, no en los de hoy.
--
-- -------------------------------------------------------------------
-- RLS ENCENDIDO, SIN POLÍTICAS
-- ----------------------------
-- Igual que la 040, la 041, la 043, la 044, la 046 y la 047. La puerta son
-- las funciones de abajo, y cada una comprueba su permiso adentro.
-- ===================================================================

-- -------------------------------------------------------------------
-- LOS DOCUMENTOS QUE SE PUEDEN DEFINIR
-- -------------------------------------------------------------------
-- Un catálogo, para que no se escriba "charla de inducción" de cinco formas
-- distintas. "Charla", "Declaración de salud", "Inducción", "Contrato",
-- "Anexo" y lo que haga falta.
--
-- La plantilla es el contenido: qué se imprime y con qué campos. El
-- expediente guarda una COPIA de la plantilla en el momento de crearlo, y no
-- una referencia. Si mañana cambian la plantilla, los documentos ya emitidos
-- no cambian: son los que se entregaron y los que seSATA.
create table if not exists documentos_catalogo (
  codigo      text primary key,
  nombre      text not null,
  -- qué tiene que firmar: cada uno con su orden
  firmantes   jsonb not null default '[]'::jsonb,
  -- los campos de relleno. "auto" sale del perfil del supervisor y de la
  -- empresa; "manual" lo escribe quien llena el documento
  campos      jsonb not null default '[]'::jsonb,
  -- la paleta y el logo, por documento. Si no se elige, general.
  paleta      jsonb,
  -- el timbre, POR DOCUMENTO. Antes vivía en la empresa y era uno solo para
  -- todos; por documento, porque un contrato y una charla no llevan lo mismo.
  timbre      jsonb,
  requiere_firma_manuscrita boolean not null default true,
  copias      integer not null default 2,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- El timbre que se usa cuando un documento no trae el suyo
create table if not exists timbre_general (
  id            integer primary key default 1 check (id = 1),
  cargo         text not null default 'Supervisor',
  giro_grados   integer not null default -8,
  tamano        integer not null default 100,
  posicion      text not null default 'derecha',
  incluir_rut   boolean not null default true,
  nombre_cargo  boolean not null default true,
  nombre_firma  text,
  constraint timbre_general_cargo      check (cargo is not null and btrim(cargo) <> '')
);

insert into timbre_general (id) values (1) on conflict (id) do nothing;

-- -------------------------------------------------------------------
-- EL EXPEDIENTE
-- -------------------------------------------------------------------
create table if not exists expedientes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null references trabajadores(code) on delete cascade,

  -- EL EJE. Una persona puede tener varias filas: una por obra en la que
  -- estuvo. Un solo expediente "por trabajador" no alcanza cuando hay
  -- sucursales, porque el mismo puede entrar y salir dos veces.
  centro_costo_id integer references centros_costo(id) on delete set null,

  -- quién pidió el expediente, y desde qué papel
  abierto_por     uuid,
  abierto_por_nombre text,
  abierto_at      timestamptz not null default now(),

  -- técnico aprueba y hace la contratación
  aprobado_por    uuid,
  aprobado_por_nombre text,
  aprobado_at     timestamptz,

  estado          text not null default 'abierto'
    check (estado in ('abierto','aprobado','cerrado','retirado')),
  motivo_cierre   text,
  cerrado_at      timestamptz,

  created_at      timestamptz not null default now()
);

create unique index if not exists expedientes_trabajador_centro
  on expedientes (code, coalesce(centro_costo_id, -1));
create index if not exists expedientes_por_trabajador
  on expedientes (code, created_at desc);
create index if not exists expedientes_por_centro
  on expedientes (centro_costo_id, estado);

alter table expedientes enable row level security;

-- -------------------------------------------------------------------
-- LOS DOCUMENTOS DENTRO DEL EXPEDIENTE
-- -------------------------------------------------------------------
create table if not exists expediente_documentos (
  id            uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references expedientes(id) on delete cascade,
  documento_codigo text not null,

  -- LA COPIA DE LA PLANTILLA, no una referencia. Si mañana cambian la plantilla,
  -- este documento no cambia: es el que se entregó.
  contenido     jsonb not null,
  paleta        jsonb,
  timbre        jsonb,

  -- las respuestas: una por campo, con su tipo
  respuestas    jsonb not null default '{}'::jsonb,
  automatico     boolean not null default true,

  -- pendiente | entregado | firmado | retirado
  estado        text not null default 'pendiente'
    check (estado in ('pendiente','entregado','firmado','retirado')),

  -- LA COPIA DEL PAPEL AL TRABAJADOR
  -- El nombre sale del PERFIL del supervisor, y se copia acá. No se lee del
  -- perfil al imprimir: un perfil se cambia, y un papel entregado hace seis
  -- meses tiene que seguir diciendo lo que decía cuando se entregó.
  entregado_a   text,
  entregado_por uuid,
  entregado_por_nombre text,
  entregado_at  timestamptz,
  entregado_lugar text,

  -- EL ESCANEO FIRMADO, como respaldo
  archivo_url   text,
  -- El hash va EN LA RUTA del archivo, no solo anotado. Así un archivo nuevo
  -- es una ruta nueva, y el original no se puede sobrescribir: se puede
  -- agregar.
  archivo_sha256 text,
  archivo_bytes integer,
  subido_at     timestamptz,
  subido_por     uuid,

  -- RETIRAR, NO BORRAR
  -- Un borrado no deja rastro de que existió, que es justo lo que se pierde
  -- cuando alguien pide que un documento desaparezca.
  retirado_por  uuid,
  retirado_por_nombre text,
  retirado_at   timestamptz,
  motivo_retiro text,

  -- para volver a pedirlo sin perder el historial
  veces_reemitido integer not null default 0,

  created_at    timestamptz not null default now()
);

create index if not exists expediente_documentos_por_expediente
  on expediente_documentos (expediente_id, estado);
create index if not exists expediente_documentos_por_codigo
  on expediente_documentos (documento_codigo, estado);

alter table expediente_documentos enable row level security;

-- -------------------------------------------------------------------
-- LOS COBROS POR TRÁMITES
-- -------------------------------------------------------------------
-- A la empresa, nunca al trabajador. Ver la nota de arriba sobre la moneda.
create table if not exists expedientes_cobros (
  id            uuid primary key default gen_random_uuid(),
  expediente_id uuid references expedientes(id) on delete set null,
  code          text,

  concepto      text not null,
  moneda        text not null default 'CLP'
    check (moneda in ('CLP','USD','UF')),
  monto         numeric(14,4) not null,

  -- EL VALOR DE ESA MONEDA EN ESA FECHA. Con CLP el monto ya es el valor.
  -- Con UF y con dólares, sin esto el número no significa nada después.
  valor_moneda  numeric(14,6),
  valor_fecha   date,

  -- lo que costó de verdad, para saber el margen
  costo_real    numeric(14,4),
  costo_moneda  text default 'CLP',

  -- el comprobante que se le entrega a quien paga
  comprobante_url text,

  estado        text not null default 'pendiente'
    check (estado in ('pendiente','pagado','anulado')),
  pagado_at     timestamptz,

  registrado_por uuid,
  registrado_por_nombre text,
  created_at    timestamptz not null default now()
);

create index if not exists expedientes_cobros_por_fecha
  on expedientes_cobros (created_at desc, estado);
create index if not exists expedientes_cobros_por_expediente
  on expedientes_cobros (expediente_id);

alter table expedientes_cobros enable row level security;

-- -------------------------------------------------------------------
-- PERMISOS
-- -------------------------------------------------------------------
insert into permisos (clave, descripcion, categoria, orden) values
  ('expedientes.ver',     'Ver los expedientes de los trabajadores', 'contratacion', 120),
  ('expedientes.crear',   'Abrir un expediente y agregar documentos', 'contratacion', 121),
  ('expedientes.aprobar', 'Aprobar el expediente y entregar los documentos', 'contratacion', 122),
  ('expedientes.retirar', 'Retirar un documento, sin borrarlo', 'contratacion', 123),
  ('expedientes.cobrar',  'Registrar cobros por trámites', 'contratacion', 124)
on conflict (clave) do nothing;
