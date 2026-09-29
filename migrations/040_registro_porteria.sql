-- ===================================================================
-- 040 - EL REGISTRO DE PORTERÍA
-- ===================================================================
--
-- QUE RESUELVE
-- ------------
-- Tres cosas que pasan en la portería y que hoy no se registran en
-- ningun lado:
--
--   1. QUIÉN ENTRA. Las visitas: proveedores, visitas de otras obras,
--      clientes, el que venga. Con hora de entrada y de salida.
--
--   2. QUÉ ENTRA. Los camiones: patente, transportista, conductor, de
--      dónde viene y a dónde va.
--
--   3. CON QUÉ DOCUMENTO. La guía de despacho: el papel que acompaña la
--      carga, con la foto, y con los datos que trae el QR para no
--      escribirlos a mano.
--
--
-- LO MÁS IMPORTANTE: ESTO NO MARCA ASISTENCIA
-- -------------------------------------------
-- Un proveedor no es un trabajador. No entra, no sale, no tiene horario
-- que registrar en la planilla.
--
-- Y no se puede meter en "marcajes" aunque se quiera: esa tabla tiene
--   code text not null references trabajadores(code)
-- o sea que el código del trabajador es obligatorio y tiene llave
-- foránea contra la ficha. Para que un proveedor marcara habria que
-- inventar un trabajador, y ahi se empezaria a contaminar la asistencia
-- de gente que nunca estuvo en la obra.
--
-- Por eso son tablas aparte, con su propio registro. La asistencia se
-- sigue leyendo en un solo lado, y la portería en otro.
--
--
-- LA FOTO DE LA GUÍA, Y POR QUÉ ES OBLIGATORIA PARA CAMIONES
-- -----------------------------------------------------------
-- Porque una carga que entró sin foto es una carga que no se puede
-- probar. Si mañana se pierde material, o se reclama por material que
-- "se retiró", la foto es lo único que dice qué entró.
--
-- Y va al BUCKET, no a la base. Las fotos de los trabajadores van en
-- base64 dentro de la base, y eso está bien: son una o dos por persona,
-- tomadas una vez. Acá son una por camión, y en una obra con movimiento
-- son cientos por día. En base64 eso revienta la base y hace lenta
-- cualquier consulta, porque Postgres tiene que leer esos campos para
-- devolver cualquier otra cosa de la fila.
--
--
-- EL QR DE LA GUÍA, Y POR QUÉ SE GUARDA APARTE DE LO ESCRITO
-- -------------------------------------------------------------
-- El QR trae lo que DECLARA el transportista. Lo que escribe el portero
-- es lo que LLEGA. Cuando esos dos no coinciden, hay que poder ver los
-- dos.
--
-- Es el mismo caso que el reloj y la planilla: dos registros distintos
-- de lo mismo, que se contradicen, y de los dos se necesita. Si se
-- guarda solo lo escrito, se pierde lo declarado, y con el se pierde la
-- diferencia, que es justo lo que sirve.
--
-- Por eso: datos_qr guarda el JSON tal cual lo leyo el lector, sin
-- tocar, y los campos de la tabla guardan lo que se escribio o se
-- confirmo.
--
--
-- LOS ESTADOS DE LA GUÍA
-- ----------------------
--   en_espera   llego el camion, todavia nadie lo recibio
--   en_descarga se esta descargando
--   recibida    entro a bodega, con la firma de quien recibio
--   rechazada   no entro, y queda por que
--   anulada     se dio de baja el registro
--
-- "en_espera" y "recibida" son los dos que importan el dia a dia. Los
-- otros tres existen para que el registro sea honesto: una guia que se
-- rechaza tiene que quedar rejectionada, no borrada.
--
-- ------------------------------------------------------------------
-- 1) EL BUCKET DE LAS FOTOS
-- ------------------------------------------------------------------
-- Uno solo para las fotos de portería, y privado. No se mezcla con el de
-- EPP porque las políticas son distintas: una foto de EPP la ve el
-- supervisor del área, y una foto de portería la ve quien esté en la
-- puerta y el que recibe en bodega.
insert into storage.buckets (id, name, public)
values ('porteria-ingresos', 'porteria-ingresos', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- 2) LAS VISITAS
-- ------------------------------------------------------------------
-- Quien entra, de donde viene, a quien viene, y hasta cuando.
create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  hora_entrada time not null,
  hora_salida time,

  -- Quien es. Con el documento, porque en una obra un nombre solo no
  -- alcanza: "el de la camisa azul" no sirve para nada.
  nombre text not null,
  documento text,                -- RUT, cedula, o pasaporte. Libre a proposito.
  empresa text,                  -- procedencia: de que obra o empresa viene
  motivo text,                   -- a que va

  -- A quien viene. Con llave foranea, para que no queden visitas colgadas
  -- a un nombre que despues cambio.
  visita_a text references public.trabajadores(code) on delete set null,

  -- El vehiculo, si viene en uno. Un patron con camion es distinto de un
  -- patron que viene a pie.
  patente text,
  vehiculo text,

  -- El carnet, que es un numero y no una ficha de trabajador.
  tarjeta_visita text,

  estado text not null default 'en_sitio'
    check (estado in ('en_sitio','retirada','anulada')),
  nota text,
  registrado_por uuid references public.perfiles(id) on delete set null,
  registrado_por_nombre text,
  creado_at timestamptz not null default now()
);

create index if not exists visitas_en_sitio on public.visitas (fecha) where estado = 'en_sitio';
create index if not exists visitas_nombre on public.visitas (lower(nombre));
create index if not exists visitas_fecha_hora on public.visitas (fecha, hora_entrada desc);
-- Para buscar a alguien por documento: es la llave con que se verifica
-- quien es en la puerta.
create index if not exists visitas_documento on public.visitas (documento) where documento is not null;
-- El vehiculo, que se busca por la patente cuando el camion vuelve.
create index if not exists visitas_patente on public.visitas (lower(patente)) where patente is not null;

comment on table public.visitas is
  'Registro de gente que entra a la obra y no es del personal. NO genera marcaje de asistencia: un proveedor no tiene horario que registrar en la planilla, y meterselo en "marcajes" seria inventar un trabajador.';
comment on column public.visitas.tarjeta_visita is
  'El numero del carnet de visita, que no es una tarjeta de asistencia. Uno no habilita a marcar: marca el reloj, no la porteria.';

-- ------------------------------------------------------------------
-- 3) LAS GUÍAS DE DESPACHO
-- ------------------------------------------------------------------
-- El papel de la carga. Con lo que declara el transportista, lo que
-- llego, y la foto de respaldo.
create table if not exists public.guias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  hora_llegada time not null,
  hora_recibida time,

  -- El documento.
  numero text,                   -- el numero de la guia. Libre: cada
                                  -- transportista le pone lo que quiere.
                                  -- Con indice encima, porque se busca.
  tipo_movimiento text not null default 'ingreso'
    check (tipo_movimiento in ('ingreso','egreso','traslado')),
  obra_origen text,              -- de donde viene la carga
  obra_destino text,             -- a donde va

  -- El camion.
  patente text not null,
  transportista text,            -- nombre de la empresa transportista
  transportista_rut text,
  conductor text,                -- quien maneja
  conductor_rut text,
  licencia text,

  -- Lo que DECLARA el QR. Se guarda entero y sin tocar, para poder
  -- compararlo con lo que se escribio. Si los dos no coinciden, hace
  -- falta ver los dos: es el mismo caso que el reloj y la planilla.
  datos_qr jsonb,
  qr_leido_at timestamptz,
  qr_fuente text,                -- de donde salio: el papel, un archivo

  -- Lo que LLEGO y lo que se escribio.
  guia_foto_url text,            -- la foto de la guia, en el bucket
  guia_foto_tomada_at timestamptz,
  bultos int,                    -- cuantos bultos, si viene informado
  observaciones text,

  -- Quien recibio en bodega. Ahi se anota la firma del que recibe.
  recibido_por uuid references public.perfiles(id) on delete set null,
  recibido_por_nombre text,

  estado text not null default 'en_espera'
    check (estado in ('en_espera','en_descarga','recibida','rechazada','anulada')),
  motivo_rechazo text,

  registrado_por uuid references public.perfiles(id) on delete set null,
  registrado_por_nombre text,
  creado_at timestamptz not null default now()
);

create index if not exists guias_fecha_hora on public.guias (fecha desc, hora_llegada desc);
-- La patente: es como se busca el camion cuando vuelve, y si hay dos
-- de la misma, cual de los dos entrances.
create index if not exists guias_patente on public.guias (lower(patente));
-- El numero de guia, que es como lo pronuncia el transportista por radio.
create index if not exists guias_numero on public.guias (numero) where numero is not null;
-- Las que estan esperando: es la lista de trabajo de la puerta.
create index if not exists guias_en_espera on public.guias (hora_llegada) where estado = 'en_espera';
create index if not exists guias_recibidas on public.guias (recibido_por, fecha desc) where estado = 'recibida';

comment on table public.guias is
  'Guias de despacho: que entro a la obra, con quien, y con que documento. NO es un marcaje: es un registro de carga.';
comment on column public.guias.datos_qr is
  'El JSON del QR, tal cual lo leyo el lector. Se guarda APARTE de los campos de la tabla, a proposito: el QR es lo que declara el transportista, y los campos son lo que llego. Cuando no coinciden hay que ver los dos, y si se guardara solo lo escrito se perderia la diferencia.';
comment on column public.guias.guia_foto_url is
  'La foto de la guia, en el bucket "porteria-ingresos". Va al bucket y no a la base: son cientos por dia, y en base64 revientan la tabla.';

-- ------------------------------------------------------------------
-- 4) LAS LÍNEAS DE LA GUÍA
-- ------------------------------------------------------------------
-- Que traia la carga. Sin esto, "entro un camion" no dice nada, y la
-- guia no sirve para descargar el Excel de la carga.
create table if not exists public.guias_lineas (
  id uuid primary key default gen_random_uuid(),
  guia_id uuid not null references public.guias(id) on delete cascade,
  linea int not null default 1,
  codigo text,                   -- el codigo del producto, si viene
  descripcion text not null,
  cantidad numeric,
  unidad text,
  lote text,
  -- Si el producto existe en el catalogo, se enlaza. Y si no existe, la
  -- guia lo crea: es la forma de que la obra lea lo que compro.
  herramienta_id uuid,
  creado_at timestamptz not null default now()
);

create index if not exists guias_lineas_guia on public.guias_lineas (guia_id, linea);
create index if not exists guias_lineas_codigo on public.guias_lineas (lower(codigo)) where codigo is not null;

comment on table public.guias_lineas is
  'Las lineas de la guia: que traia el camion. Sin esto el registro dice "entro un camion" y no sirve para nada.';

-- ------------------------------------------------------------------
-- 5) LA TARJETA DE VISITA
-- ------------------------------------------------------------------
-- Un numero, no una ficha. Y NO habilita a marcar: el que marca es el
-- reloj, con su token, y eso no lo tiene un cartel de la porteria.
create table if not exists public.tarjetas_visita (
  codigo text primary key,
  etiqueta text,                 -- "PROVEEDORES", "VISITAS", "OBRA 2"
  estado text not null default 'activa'
    check (estado in ('activa','anulada')),
  entrega_por text,
  entrega_a text,
  fecha_entrega date,
  created_at timestamptz not null default now()
);

comment on table public.tarjetas_visita is
  'Carteles de la porteria: PROVEEDORES, VISITAS. NO son tarjetas de asistencia. No habilitan a marcar en el reloj, que exige el token del reloj.';

alter table public.visitas enable row level security;
alter table public.guias enable row level security;
alter table public.guias_lineas enable row level security;
alter table public.tarjetas_visita enable row level security;

-- ------------------------------------------------------------------
-- 6) LOS PERMISOS
-- ------------------------------------------------------------------
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('porteria.visitas',  'Registrar visitas y retiros en la portería',   'porteria', 10),
  ('porteria.guias',    'Registrar guías de despacho y la entrada de camiones', 'porteria', 11),
  ('porteria.bodega',   'Recibir carga en bodega y firmar la guía',      'bodega',    12)
on conflict (clave) do update set descripcion = excluded.descripcion, categoria = excluded.categoria;

-- El que esta en la puerta entra a las tres. El que recibe en bodega, solo
-- a la tercera: no necesita ver el registro de visitas para descargar.
insert into public.roles_permisos (rol, permiso) values
  ('porteria', 'porteria.visitas'),
  ('porteria', 'porteria.guias'),
  ('porteria', 'porteria.bodega'),
  ('bodega',    'porteria.bodega'),
  ('supervisores', 'porteria.visitas'),
  ('supervisores', 'porteria.guias')
on conflict do nothing;

-- ------------------------------------------------------------------
-- 7) LAS FUNCIONES
-- ------------------------------------------------------------------
-- Registrar una visita y devolver un numero de turno, para el cartel de
-- la puerta. Es lo unico que la puerta necesita: un numero, un nombre, y
-- la hora de entrada.
create or replace function public.registrar_visita(
  p_nombre text,
  p_hora time default null,
  p_documento text default null,
  p_empresa text default null,
  p_motivo text default null,
  p_visita_a text default null,
  p_patente text default null,
  p_tarjeta text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'NOMBRE_VACIO' using errcode = 'check_violation',
      hint = 'Un nombre escrito solo con espacios no es un nombre.';
  end if;

  insert into public.visitas (
    fecha, hora_entrada, nombre, documento, empresa, motivo,
    visita_a, patente, tarjeta_visita,
    registrado_por, registrado_por_nombre
  ) values (
    current_date,
    coalesce(p_hora, localtime),
    btrim(p_nombre),
    nullif(btrim(coalesce(p_documento, '')), ''),
    nullif(btrim(coalesce(p_empresa, '')), ''),
    nullif(btrim(coalesce(p_motivo, '')), ''),
    nullif(btrim(coalesce(p_visita_a, '')), ''),
    nullif(btrim(coalesce(p_patente, '')), ''),
    nullif(btrim(coalesce(p_tarjeta, '')), ''),
    auth.uid(),
    (select nombre from public.perfiles where id = auth.uid())
  ) returning id into v_id;

  return v_id;
end $$;

comment on function public.registrar_visita(text,time,text,text,text,text,text,text) is
  'Registra una visita y devuelve su id. No crea marcaje: una visita no es asistencia.';

-- El retiro. Va como funcion y no como un update suelto, para que la hora
-- de salida la ponga la base y no el que aprieta el boton.
create or replace function public.retirar_visita(p_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.visitas
     set hora_salida = localtime,
         estado      = 'retirada'
   where id = p_id
     and estado = 'en_sitio';
  if not found then
    raise exception 'NO_ESTABA_EN_SITIO' using errcode = 'no_data_found',
      hint = 'Esa visita ya estaba cerrada, o el identificador no existe.';
  end if;
  return true;
end $$;

-- Registrar la llegada de un camion con su guia. La foto va aparte: se
-- sube al bucket y se pasa la ruta.
create or replace function public.registrar_guia(
  p_patente text,
  p_numero text default null,
  p_tipo text default 'ingreso',
  p_transportista text default null,
  p_conductor text default null,
  p_hora time default null,
  p_foto text default null,
  p_datos_qr jsonb default null,
  p_origen text default null,
  p_destino text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_estado text;
begin
  if coalesce(btrim(p_patente), '') = '' then
    raise exception 'PATENTE_VACIA' using errcode = 'check_violation',
      hint = 'Sin patente no se sabe que camion llego, y es lo primero que se pregunta.';
  end if;

  if p_tipo not in ('ingreso','egreso','traslado') then
    raise exception 'TIPO_INVALIDO' using errcode = 'check_violation',
      hint = 'El movimiento es ingreso, egreso o traslado.';
  end if;

  insert into public.guias (
    fecha, hora_llegada, numero, tipo_movimiento, obra_origen, obra_destino,
    patente, transportista, conductor,
    guia_foto_url, guia_foto_tomada_at,
    datos_qr, qr_leido_at, qr_fuente,
    estado,
    registrado_por, registrado_por_nombre
  ) values (
    current_date,
    coalesce(p_hora, localtime),
    nullif(btrim(coalesce(p_numero, '')), ''),
    p_tipo,
    nullif(btrim(coalesce(p_origen, '')), ''),
    nullif(btrim(coalesce(p_destino, '')), ''),
    upper(btrim(p_patente)),
    nullif(btrim(coalesce(p_transportista, '')), ''),
    nullif(btrim(coalesce(p_conductor, '')), ''),
    nullif(btrim(coalesce(p_foto, '')), ''),
    case when btrim(coalesce(p_foto, '')) = '' then null else now() end,
    p_datos_qr,
    case when p_datos_qr is null then null else now() end,
    case when p_datos_qr is null then null else 'lector' end,
    'en_espera',
    auth.uid(),
    (select nombre from public.perfiles where id = auth.uid())
  ) returning id into v_id;

  return v_id;
end $$;

comment on function public.registrar_guia(text,text,text,text,text,time,text,jsonb,text,text) is
  'Registra la llegada de un camion con su guia, y la deja en "en_espera". Guarda el JSON del QR aparte de los campos, para poder compararlos.';

-- Recibir en bodega. Ahi se anota quien recibio, que es lo que convierte
-- el registro en prueba de que la carga entro.
create or replace function public.recibir_guia(
  p_id uuid,
  p_lineas jsonb default null,
  p_observaciones text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_linea jsonb;
  v_n int := 0;
begin
  select estado into v_estado from public.guias where id = p_id for update;
  if not found then
    raise exception 'GUIA_INEXISTENTE' using errcode = 'no_data_found';
  end if;
  if v_estado = 'recibida' then
    raise exception 'YA_RECIBIDA' using errcode = 'check_violation',
      hint = 'Esta guia ya estaba recibida. Si hay un error, se anula y se vuelve a registrar.';
  end if;
  if v_estado = 'anulada' then
    raise exception 'GUIA_ANULADA' using errcode = 'check_violation',
      hint = 'Esta guia esta anulada.';
  end if;

  -- Las lineas, si las mandaron. Se insertan una por una porque el JSON
  -- trae las claves en ingles y los campos en español, y porque asi se
  -- puede avisar cual fallo sin perder las que ya entraron.
  if p_lineas is not null then
    for v_linea in select * from jsonb_array_elements(p_lineas) loop
      if btrim(coalesce(v_linea->>'descripcion', v_linea->>'description', '')) = '' then
        raise exception 'LINEA_SIN_DESCRIPCION' using errcode = 'check_violation',
          hint = 'Una linea de la guia no tiene que trae. Sin descripcion no se sabe que entro.';
      end if;
      v_n := v_n + 1;
      insert into public.guias_lineas (guia_id, linea, codigo, descripcion, cantidad, unidad, lote)
      values (
        p_id,
        v_n,
        nullif(btrim(coalesce(v_linea->>'codigo', v_linea->>'code', '')), ''),
        btrim(v_linea->>'descripcion' || coalesce(v_linea->>'description', '')),
        nullif(v_linea->>'cantidad', v_linea->>'quantity')::numeric,
        nullif(btrim(coalesce(v_linea->>'unidad', v_linea->>'unit', '')), ''),
        nullif(btrim(coalesce(v_linea->>'lote', v_linea->>'lot', '')), '')
      );
    end loop;
  end if;

  update public.guias
     set estado             = 'recibida',
         hora_recibida      = localtime,
         recibido_por       = auth.uid(),
         recibido_por_nombre= (select nombre from public.perfiles where id = auth.uid()),
         observaciones      = nullif(btrim(coalesce(p_observaciones, '')), '')
   where id = p_id;

  return true;
end $$;

comment on function public.recibir_guia(uuid,jsonb,text) is
  'Marca la guia como recibida y guarda las lineas. Quien recibe queda anotado: eso es lo que prueba que la carga entro.';

-- ------------------------------------------------------------------
-- 8) EL DIAGNÓSTICO
-- ------------------------------------------------------------------
create or replace function public.diagnostico_porteria()
returns table (problema text, cuantos bigint)
language sql
stable
as $$
  select 'el bucket de fotos no existe',
         (select case when not exists (select 1 from storage.buckets where id = 'porteria-ingresos')
                     then 1 else 0 end)

  union all select 'visitas sin hora de salida, y ya se fueron',
         (select count(*) from public.visitas
           where estado = 'retirada' and hora_salida is null)

  union all select 'visitas en sitio de hace mas de 12 horas',
         (select count(*) from public.visitas
           where estado = 'en_sitio'
             and (fecha + hora_entrada) < now() - interval '12 hours')

  union all select 'guias esperando hace mas de 8 horas',
         (select count(*) from public.guias
           where estado = 'en_espera'
             and (fecha + hora_llegada) < now() - interval '8 hours')

  union all select 'guias recibidas sin quien recibio',
         (select count(*) from public.guias
           where estado = 'recibida' and recibido_por is null)

  union all select 'guias sin foto, que no se pueden probar',
         (select count(*) from public.guias where guia_foto_url is null)

  union all select 'guias sin linea: dice que entro un camion y nada mas',
         (select count(*) from public.guias g
           where g.estado = 'recibida'
             and not exists (select 1 from public.guias_lineas l where l.guia_id = g.id));
$$;

comment on function public.diagnostico_porteria() is
  'Lo que hay que mirar a diario en porteria. Las dos ultimas filas son las que importan para la obra: una guia sin foto y sin lineas no sirve para probar nada.';

-- ------------------------------------------------------------------
-- PARA VOLVER ATRÁS
-- ------------------------------------------------------------------
--   drop table if exists public.guias_lineas;
--   drop table if exists public.guias;
--   drop table if exists public.visitas;
--   drop table if exists public.tarjetas_visita;
--   drop function if exists public.diagnostico_porteria();
--   drop function if exists public.registrar_visita(text,time,text,text,text,text,text,text);
--   drop function if exists public.registrar_guia(text,text,text,text,text,time,text,jsonb,text,text);
--   drop function if exists public.recibir_guia(uuid,jsonb,text);
--   delete from storage.buckets where id = 'porteria-ingresos';
--   delete from public.roles_permisos where permiso like 'porteria.%';
--   delete from public.permisos where clave like 'porteria.%';
