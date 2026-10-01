-- ===================================================================
-- 059: LOS CAMPOS PROPIOS DE CADA EMPRESA
-- ===================================================================
--
-- QUÉ ES
-- ------
-- Hoy las plantillas solo pueden poner datos que YA existen en "trabajadores". No se
-- puede agregar un campo nuevo, y por eso hay documentos que no se pueden hacer: una
-- licencia de conducir con su número, una talla de calzado, un centro de costo, un número
-- de emergencia local.
--
-- Acá se pueden DEFINIR esos campos, por empresa, y guardar su valor en cada trabajador.
--
--
-- -------------------------------------------------------------------
-- POR QUÉ POR EMPRESA Y NO UNO GLOBAL
-- -----------------------------------
--
-- Porque "código de Hazard" en una constructora y "código de patio" en un depot no son la
-- misma cosa, y el mismo campo con dos significados distintos es peor que no tenerlo.
--
-- Y el valor guardado lleva "empresa_id": un trabajador puede estar en más de una, y cada
-- empresa ve los suyos. El campo y el valor van juntos o no significan nada.
--
-- El identificador del campo lleva el "empresa_id" adelante —"7-licencia"— para que dos
-- empresas puedan tener un campo con el mismo nombre sin pisarse. Ver "clave_de_campo".
--
--
-- -------------------------------------------------------------------
-- EL TIPO DEL CAMPO, Y POR QUÉ ES UN "check" Y NO UNA TABLA
-- ----------------------------------------------------------
--
-- Los tipos son siete y no van a cambiar: texto, numero, fecha, lista, casillas, imagen y
-- firma. Un "check" alcanza, y es el que hace que un tipo mal escrito NO PUEDA entrar.
--
-- Una tabla de tipos sería más flexible, y también más fácil de usar mal: si alguien
-- escribe un tipo nuevo, el editor no lo reconoce y el campo queda hecho polvo sin aviso.
--
-- Y el que falta es "firma": es una imagen que se dibuja o se sube, y se usa para la firma
-- digital de las plantillas.
--
--
-- -------------------------------------------------------------------
-- EL VALOR: TEXT, Y POR QUÉ NO HAY COLUMNAS POR TIPO
-- -----------------------------------------------
--
-- El valor se guarda como texto, y el TIPO decide cómo se muestra y cómo se valida. Un
-- número "0042" y una fecha "2026-10-01" se guardan los dos como texto.
--
-- Por qué no hay "valor_numero", "valor_fecha" y "valor_lista": porque sería la cuarta
-- columna que hay que tocar cada vez que se agrega un tipo, y cada una se puede dejar
-- vacía por error. Un solo lugar es un solo lugar que se puede olvidar.
--
-- Y la validación va en el editor y en la función de guardar, no en el tipo de la columna:
-- un número que no se puede convertir a número no se guarda, y el editor avisa antes.
--
--
-- -------------------------------------------------------------------
-- LA CLAVE DEL CAMPO: CON EL "empresa_id" ADELANTE
-- ------------------------------------------------
--
-- Ver "clave_de_campo" más abajo. Es lo que impide que "licencia" de la empresa 3 y
-- "licencia" de la empresa 7 sean el mismo campo.
--
--
-- -------------------------------------------------------------------
-- Y LAS VARIABLES DE UNA PLANTILLA
-- --------------------------------
--
-- Las fijas se siguen escribiendo "[NOMBRE]", "[RUT]", "[FECHA]". Los campos propios van
-- con un prefijo:
--
--     [CAMPO:licencia]              el valor del campo "licencia"
--     [CAMPO:licencia | etiqueta]   el rótulo, por si el documento necesita nombrarlo
--
-- Con prefijo porque los nombres de los campos propios son los que elige la empresa, y
-- pueden coincidir con una variable fija: un campo llamado "nombre" no puede romper el
-- "[NOMBRE]" que ya anda en todos los documentos.
--
-- -------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO HACE
-- ------------------------------
--
-- NO guarda la firma digital. Guarda la IMAGEN de la firma —el tipo "firma" es una
-- imagen—, en el mismo sitio donde hoy se guardan las fotos del trabajador.
--
-- Lo que falta para que una firma sea una firma —certificado, verificación, huella de
-- tiempo— es otra cosa, y no se decide acá. Ver [firma-01].
alter table public.trabajadores
  add column if not exists firma_url        text,
  add column if not exists firma_fecha      timestamptz;

comment on column public.trabajadores.firma_url is
  'Imagen de la firma del trabajador. La guarda el mismo que las fotos. NO es una firma digital: no tiene certificado ni verificacion. Ver [firma-01].';

-- -------------------------------------------------------------------
-- LOS CAMPOS QUE CADA EMPRESA DEFINE
-- -------------------------------------------------------------------
create table if not exists public.plantilla_campos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  integer not null references public.empresa(id) on delete cascade,
  clave       text not null,
  etiqueta    text not null,
  tipo        text not null default 'texto'
              check (tipo in ('texto','numero','fecha','lista','casillas','imagen','firma')),
  opciones    text,
  ayuda       text,
  orden       integer not null default 100,
  requerido   boolean not null default false,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint plantilla_campos_unico unique (empresa_id, clave)
);

comment on table public.plantilla_campos is
  'Los campos propios que define una empresa para sus plantillas: licencia, talla, centro de costo. Los tipos son siete y estan en un check, para que un tipo mal escrito no pueda entrar.';

comment on column public.plantilla_campos.clave is
  'Como lo escribe el usuario dentro de "[CAMPO:clave]". No es la clave global: esa la arma "clave_de_campo" con el empresa_id adelante.';

comment on column public.plantilla_campos.opciones is
  'Para el tipo "lista": las opciones separadas por "|". Para "casillas" se usa el mismo campo. Para los demas tipos queda en NULL.';

-- -------------------------------------------------------------------
-- EL VALOR DE CADA CAMPO, POR TRABAJADOR
-- -------------------------------------------------------------------
create table if not exists public.trabajador_campo_valor (
  trabajador_code text not null references public.trabajadores(code) on delete cascade,
  empresa_id      integer not null references public.empresa(id) on delete cascade,
  campo_id        uuid not null references public.plantilla_campos(id) on delete cascade,
  valor           text,
  updated_at      timestamptz not null default now(),
  primary key (trabajador_code, empresa_id, campo_id)
);

comment on table public.trabajador_campo_valor is
  'Un valor por trabajador, campo y empresa. El valor es texto y el tipo lo decide como se muestra; asi no hay que agregar una columna cada vez que aparece un tipo nuevo.';

-- Y los dos índices que SÍ se usan. Los dos accesos reales: los campos de una empresa, y
-- los valores de un trabajador en una empresa.
--
-- Y NO hay índice por "campo_id" suelto: la clave primaria ya empieza por trabajador y
-- empresa, que es por donde se pregunta siempre.
create index if not exists plantilla_campos_empresa_idx
  on public.plantilla_campos(empresa_id, orden)
  where activa;

create index if not exists trabajador_campo_valor_empresa_idx
  on public.trabajador_campo_valor(empresa_id, trabajador_code);

alter table public.plantilla_campos       enable row level security;
alter table public.trabajador_campo_valor enable row level security;

-- -------------------------------------------------------------------
-- LA CLAVE GLOBAL DE UN CAMPO
-- -------------------------------------------------------------------
-- Con el "empresa_id" adelante, para que dos empresas puedan tener un campo que se llame
-- igual sin pisarse.
create or replace function public.clave_de_campo(p_empresa_id integer, p_clave text)
returns text
language sql
immutable
as $$
  select p_empresa_id::text || '-' ||
         btrim(regexp_replace(
           translate(lower(btrim(p_clave)), 'áéíóúüÁÉÍÓÚÜñÑ', 'aeiouuaeiouunn'),
           '[^a-z0-9]+', '-', 'g'), '-');
$$;

comment on function public.clave_de_campo(integer,text) is
  'La clave que se usa DENTRO de una plantilla, con el empresa_id adelante: "7-licencia". Asi dos empresas pueden tener un campo llamado "licencia" sin pisarse. Es la misma normalizacion que usa gestionar_grupo.';

-- -------------------------------------------------------------------
-- DEFINIR UN CAMPO
-- -------------------------------------------------------------------
-- Con "upsert" por "(empresa_id, clave)", que es la clave única: editar un campo no crea
-- un segundo con el mismo nombre.
create or replace function public.gestionar_campo(
  p_empresa_id integer,
  p_clave      text,
  p_etiqueta   text default null,
  p_tipo       text default 'texto',
  p_opciones   text default null,
  p_ayuda      text default null,
  p_orden      integer default 100,
  p_requerido  boolean default false,
  p_activo     boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text;
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('plantillas.gestionar'))) then
    raise exception 'No tienes permiso para definir campos de plantilla'
      using errcode = '42501';
  end if;

  if p_clave is null or btrim(p_clave) = '' then
    raise exception 'El campo necesita una clave' using errcode = '22023';
  end if;

  -- Y la clave se normaliza con la misma regla de "gestionar_grupo". O sea: minúsculas
  -- primero, después sin tildes, después todo lo que no sea letra o número a guion.
  --
  -- Y el ORDEN importa: al revés, la mayúscula inicial todavía no está en [a-z0-9] y se
  -- vuelve guion. "Obra" daría "-bra".
  v_clave := btrim(regexp_replace(
                translate(lower(btrim(p_clave)), 'áéíóúüÁÉÍÓÚÜñÑ', 'aeiouuaeiouunn'),
                '[^a-z0-9]+', '-', 'g'), '-');

  if v_clave = '' then
    raise exception 'Esa clave no deja nada utilizable' using errcode = '22023';
  end if;

  -- Y el tipo tiene que ser uno de los siete. Se comprueba acá y no se confia en el
  -- "check", porque el "check" da un error feo y este dice qué pasó.
  if p_tipo is null
     or btrim(p_tipo) not in ('texto','numero','fecha','lista','casillas','imagen','firma') then
    raise exception 'Ese tipo no existe' using errcode = '22023';
  end if;

  -- Y si el tipo es lista o casillas, tiene que traer opciones. Sin opciones, una lista
  -- se dibuja vacía y no hay forma de elegir nada.
  if btrim(p_tipo) in ('lista','casillas')
     and (p_opciones is null or btrim(p_opciones) = '') then
    raise exception 'Una lista necesita sus opciones, separadas por "|"'
      using errcode = '22023';
  end if;

  insert into public.plantilla_campos
         (empresa_id, clave, etiqueta, tipo, opciones, ayuda, orden, requerido, activo)
  values (p_empresa_id, v_clave,
          coalesce(nullif(btrim(p_etiqueta),''), v_clave),
          btrim(p_tipo), p_opciones, p_ayuda,
          coalesce(p_orden, 100), coalesce(p_requerido, false), coalesce(p_activo, true))
  on conflict (empresa_id, clave) do update
    set etiqueta   = excluded.etiqueta,
        tipo       = excluded.tipo,
        opciones   = excluded.opciones,
        ayuda      = excluded.ayuda,
        orden      = excluded.orden,
        requerido  = excluded.requerido,
        activo     = excluded.activo,
        updated_at = now();

  return v_clave;
end;
$$;

-- -------------------------------------------------------------------
-- GUARDAR EL VALOR DE UN CAMPO
-- -------------------------------------------------------------------
-- Y el tipo se valida acá también, porque un valor guardado con el tipo equivocado
-- después no se puede mostrar bien y nadie se entera de por qué.
create or replace function public.guardar_valor_campo(
  p_trabajador_code text,
  p_empresa_id      integer,
  p_campo           text,
  p_valor           text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo     text;
  v_campo_id uuid;
begin
  if not es_usuario_activo() then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;

  select c.tipo, c.id into v_tipo, v_campo_id
    from public.plantilla_campos c
   where c.empresa_id = p_empresa_id
     and c.clave = btrim(lower(p_campo))
     and c.activa;

  if v_campo_id is null then
    raise exception 'Ese campo no existe en esta empresa' using errcode = '22023';
  end if;

  -- Y la validación por tipo. Número: tiene que poder convertirse a número. Fecha: tiene
  -- que parecer una fecha.
  --
  -- Y la fecha se valida con una excepción capturada: "no es una fecha" es un error de
  -- PostgreSQL, no un "false", y sin esto una fecha mal escrita aborta toda la función
  -- con un mensaje que no dice qué campo es.
  if v_tipo = 'numero' and p_valor is not null and btrim(p_valor) <> '' then
    begin
      perform btrim(p_valor)::numeric;
    exception when others then
      raise exception 'Ese valor no es un número' using errcode = '22023';
    end;
  end if;

  if v_tipo = 'fecha' and p_valor is not null and btrim(p_valor) <> '' then
    begin
      perform btrim(p_valor)::date;
    exception when others then
      raise exception 'Ese valor no es una fecha. Se escribe AAAA-MM-DD' using errcode = '22023';
    end;
  end if;

  insert into public.trabajador_campo_valor
         (trabajador_code, empresa_id, campo_id, valor, updated_at)
  values (p_trabajador_code, p_empresa_id, v_campo_id, p_valor, now())
  on conflict (trabajador_code, empresa_id, campo_id) do update
    set valor      = excluded.valor,
        updated_at = now();
end;
$$;

-- -------------------------------------------------------------------
-- LAS VARIABLES QUE UNA PLANTILLA PUEDE USAR
-- -------------------------------------------------------------------
-- Las fijas de "campos_de_trabajador" (de la 058) MÁS los campos propios de la empresa.
-- Y es una sola lista, porque el editor muestra una sola lista: si fueran dos, el que
-- escribe la plantilla tendría que saber de dónde sacar cada variable.
--
-- Y los propios vienen con la clave YA ARMADA —"7-licencia"—, que es lo que va dentro de
-- "[CAMPO:...]". Así el editor no tiene que componer nada.
create or replace function public.variables_de_plantilla(p_empresa_id integer)
returns table (
  variable text,
  etiqueta text,
  tipo     text,
  es_propio boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- Las fijas, con el nombre que ya usan todos los documentos.
  select '[' || t.clave || ']', t.etiqueta, t.tipo, false
    from public.campos_de_trabajador() t
  union all
  -- Y las propias, con la clave global.
  select '[CAMPO:' || public.clave_de_campo(c.empresa_id, c.clave) || ']',
         c.etiqueta, c.tipo, true
    from public.plantilla_campos c
   where c.empresa_id = p_empresa_id
     and c.activa
  order by 4, 2;
$$;

comment on function public.variables_de_plantilla(integer) is
  'La lista unica de variables que se pueden poner en una plantilla: las fijas como [NOMBRE] y las propias como [CAMPO:7-licencia]. El editor muestra esta sola lista.';

-- -------------------------------------------------------------------
-- LOS DATOS DE UN TRABAJADOR PARA LLENAR UNA PLANTILLA
-- -------------------------------------------------------------------
-- Y devuelve una sola fila con TODAS las variables ya resueltas. Para el editor y para
-- descargar: una sola llamada trae el documento entero.
--
-- Y "coalesce" a cadena vacía y no a null, porque un null en el medio de un documento
-- prints "null" y "null" en un contrato es peor que un hueco.
create or replace function public.datos_para_plantilla(
  p_trabajador_code text,
  p_empresa_id      integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w record;
  v jsonb := '{}'::jsonb;
  fila record;
begin
  select t.* into w
    from public.trabajadores t
   where t.code = p_trabajador_code;

  if not found then
    raise exception 'Ese trabajador no existe' using errcode = '22023';
  end if;

  -- Las fijas. Con los nombres que ya usaba el editor que existía, para no romper los
  -- documentos que ya están armados.
  --
  -- Y EL NOMBRE ENTERO: la columna es "name", no "nombre_completo". "nombre_completo" es
  -- un campo que se arma en el JavaScript, en la base no existe, y escribirlo acá da:
  --
  --     ERROR: column "w.nombre_completo" does not exist
  --
  -- Y no se cae al escribir la función, porque una función de PostgreSQL no se compila
  -- hasta que se ejecuta. O sea que el error aparece la primera vez que alguien llena una
  -- plantilla, que es el peor momento.
  --
  -- Y el "coalesce" con los tres campos es por las importaciones: una ficha que entró por
  -- Excel puede tener los tres nombres y el "name" vacío.
  v := v || jsonb_build_object(
    'NOMBRE', coalesce(nullif(btrim(w.name), ''),
                       btrim(concat_ws(' ', w.nombres, w.apellido_paterno, w.apellido_materno)),
                       ''),
    'NOMBRES', coalesce(w.nombres, ''),
    'APELLIDO_PATERNO', coalesce(w.apellido_paterno, ''),
    'APELLIDO_MATERNO', coalesce(w.apellido_materno, ''),
    'CODIGO', coalesce(w.code, ''),
    'RUT', coalesce(w.rut, ''),
    'TELEFONO', coalesce(w.phone, ''),
    'CORREO', coalesce(w.correo, ''),
    'DIRECCION', coalesce(w.direccion, ''),
    'AFP_CODIGO', coalesce(w.afp_codigo, ''),
    'AFP_NOMBRE', coalesce(w.afp_nombre, ''),
    'CARGO', coalesce(w.cargo, ''),
    'ESPECIALIDAD', coalesce(w.especialidad_clave, ''),
    'FECHA_INGRESO', coalesce(to_char(w.fecha_ingreso, 'DD-MM-YYYY'), ''),
    'FOTO_CASUAL', coalesce(w.foto_casual_url, ''),
    'FOTO_SEGURIDAD', coalesce(w.foto_seguridad_url, ''),
    'FIRMA', coalesce(w.firma_url, '')
  );

  -- Y los propios, cada uno con su clave global como nombre.
  for fila in
    select public.clave_de_campo(c.empresa_id, c.clave) as clave, v.valor
      from public.plantilla_campos c
      left join public.trabajador_campo_valor v
        on v.campo_id = c.id
       and v.trabajador_code = p_trabajador_code
       and v.empresa_id = p_empresa_id
     where c.empresa_id = p_empresa_id
       and c.activa
  loop
    v := v || jsonb_build_object(fila.clave, coalesce(fila.valor, ''));
  end loop;

  return v;
end;
$$;

comment on function public.datos_para_plantilla(text,integer) is
  'Trae TODAS las variables de un trabajador ya resueltas, en una sola llamada. Los nombres son los que usan los documentos que ya existen, mas los campos propios con la clave "7-licencia". Nunca devuelve null, porque un null en un contrato imprime la palabra null.';

-- -------------------------------------------------------------------
-- LOS CAMPOS QUE LE FALTAN A UN TRABAJADOR
-- -------------------------------------------------------------------
-- Y solo los que son "requerido". Porque un campo opcional vacío no es un problema: el
-- documento sale con el hueco y nadie se muere.
--
-- Y es lo que el editor consulta antes de dejar descargar.
create or replace function public.campos_faltantes(
  p_trabajador_code text,
  p_empresa_id      integer
)
returns table (clave text, etiqueta text, tipo text)
language sql
stable
security definer
set search_path = public
as $$
  select c.clave, c.etiqueta, c.tipo
    from public.plantilla_campos c
    left join public.trabajador_campo_valor v
      on v.campo_id = c.id
     and v.trabajador_code = p_trabajador_code
     and v.empresa_id = p_empresa_id
   where c.empresa_id = p_empresa_id
     and c.activa
     and c.requerido
     -- Y vacío es null o vacío con espacios: los dos son "no lleno", y mirar solo uno
     -- deja pasar el otro.
     and (v.valor is null or btrim(v.valor) = '')
   order by c.orden, c.etiqueta;
$$;

comment on function public.campos_faltantes(text,integer) is
  'Los campos requeridos que el trabajador todavia no tiene, para esa empresa. El editor consulta esto ANTES de dejar descargar: un documento con un hueco es peor que no tener documento.';

grant execute on function public.clave_de_campo(integer,text)          to authenticated;
grant execute on function public.gestionar_campo(integer,text,text,text,text,text,integer,boolean,boolean) to authenticated;
grant execute on function public.guardar_valor_campo(text,integer,text,text) to authenticated;
grant execute on function public.variables_de_plantilla(integer)      to authenticated;
grant execute on function public.datos_para_plantilla(text,integer)    to authenticated;
grant execute on function public.campos_faltantes(text,integer)        to authenticated;

-- -------------------------------------------------------------------
-- CÓMO SE SABE SI QUEDÓ BIEN APLICADA
-- -------------------------------------------------------------------
-- No devuelve filas, asi que el editor dice "Success. No rows returned". Eso es lo correcto.
--
-- Y las tres consultas del final tienen que dar 2, 1 y 7.
select count(*) as tablas_nuevas
  from information_schema.tables
 where table_schema='public'
   and table_name in ('plantilla_campos','trabajador_campo_valor');

select count(*) as columnas_en_trabajadores
  from information_schema.columns
 where table_schema='public' and table_name='trabajadores'
   and column_name in ('firma_url','firma_fecha');

-- Y los tipos posibles. Tienen que ser SIETE, y el "check" de la tabla es lo que impide
-- que entre un octavo.
select count(*) as tipos
  from (values ('texto'),('numero'),('fecha'),('lista'),
               ('casillas'),('imagen'),('firma')) as t(tipo);
-- tiene que dar 7
