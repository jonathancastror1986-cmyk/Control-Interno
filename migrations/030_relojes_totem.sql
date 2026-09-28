-- ============================================================
-- Migración 030: centros de costo, relojes y marcaje por dispositivo
-- ============================================================
-- QUÉ ES ESTO
--
-- Un "reloj" acá es el DISPOSITIVO, no el despertador: el Android TV Box
-- con HDMI, o el equipo al que se le conecta un lector QR USB. De él
-- cuelgan tres cosas que se configuran juntas y que hoy están separadas:
-- dónde está (centro de costo), cómo lee (cámara o lector de teclado) y
-- qué jornada se le aplica.
--
-- POR QUÉ CENTRO DE COSTO Y NO SÓLO UBICACIÓN
--
-- Porque es lo que existe en la planilla de la empresa constructora, y es
-- por donde se revisa y se paga. Un reloj en "ALTO CIRUELOS" no dice
-- nada; un reloj en el centro de costo "ALTO CIRUELOS" sí, porque es
-- contra ese centro de costo que se Justifica la asistencia. La ubicación
-- se guarda igual, como texto libre, para los que la llaman de otra
-- forma.
--
-- EL LECTOR QR USB Y POR QUÉ ES "MODO TECLADO"
--
-- Esos lectores no son cámaras: se enumeran como teclado y escriben el
-- código. Presentan el orden de los caracteres muy rápido y mandan Enter
-- al final. De ahí salen las dos cosas que hay que hacer y que no son
-- detalles:
--   - autofocus permanente en un campo de texto, porque nadie va a tocar
--     la pantalla;
--   - una ventana antirrebote, porque al alejar la tarjeta se lee dos
--     veces. Ver "IDEMPOTENCIA" más abajo.
--
-- IDEMPOTENCIA
--
-- "marcajes" tiene un índice único en (code, fecha, tipo). Eso ya impide
-- el duplicado exacto, pero el caso real es otro: la misma lectura
-- repetida a los 2 segundos tiene que ignorarse SIN mostrar error, porque
-- la persona ya lo vio registrado. Y una marca de las 8:04 cuando la
-- entrada era a las 8:00 NO es un duplicado: es un atraso, y tiene que
-- verse.
--
-- Por eso la función devuelve tres cosas distintas, no dos:
--   ok           -> se registró
--   ya_marcado   -> ya había una de HOY; se devuelve la hora, para que la
--                   pantalla la muestre. No es un error: la persona fichó.
--   duplicado    -> se ignoró porque la anterior fue hace menos de N
--                   segundos. Tampoco es un error, y no se avisa en rojo.
--
-- COLACIÓN: POR QUÉ DOS TIPOS Y NO UNO
--
-- El control de colación necesita DOS marcajes (salida a colar y vuelta).
-- Con el índice único en (code, fecha, tipo), un tipo "colacion" solo
-- permitiría el primero: el segundo rebotaría con violación de unicidad.
-- Por eso son "colacion_entrada" y "colacion_salida". El índice único
-- sigue protegiendo y cada semiciclo tiene su fila.
--
-- EL TOKEN
--
-- Se guarda el HASH, no el token. El token en claro se muestra una sola
-- vez, al crearlo o al rotarlo, y no se puede volver a leer: es lo único
-- que impide que alguien con acceso a la base marque asistencia en
-- nombre de otro. Con el hash, leer la base no sirve para pasar asistencia.
--
-- Re-runnable.
-- ============================================================

-- ------------------------------------------------------------
-- 1) PERMISOS
-- ------------------------------------------------------------
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('relojes.ver',     'Ver los relojes y su configuración',        'relojes', 1),
  ('relojes.editar',  'Crear y configurar relojes',                 'relojes', 2),
  ('relojes.totem',   'Usar la pantalla de marcaje (tótem)',       'relojes', 3)
on conflict (clave) do update set descripcion = excluded.descripcion;

insert into public.roles_permisos (rol, permiso) values
  ('admin', 'relojes.ver'), ('admin', 'relojes.editar'), ('admin', 'relojes.totem'),
  ('rrhh',  'relojes.ver'), ('rrhh',  'relojes.editar')
on conflict do nothing;

-- ------------------------------------------------------------
-- 2) CENTROS DE COSTO
-- ------------------------------------------------------------
create table if not exists public.centros_costo (
  id serial primary key,
  code text not null,
  nombre text not null,
  empresa_id int references public.empresa(id) on delete cascade,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint centros_costo_codigo_unico unique (empresa_id, code)
);

comment on table public.centros_costo is
  'Centro de costo de la obra. Es contra este dato que se revisa y se paga la asistencia.';

-- Se indexa el nombre porque el listado lo busca por texto.
create index if not exists centros_costo_nombre_idx on public.centros_costo(nombre);

alter table public.centros_costo enable row level security;

drop policy if exists "centros_costo rw" on public.centros_costo;
create policy "centros_costo rw" on public.centros_costo for all
  using (public.tiene_permiso('relojes.ver'))
  with check (public.tiene_permiso('relojes.editar'));

-- ------------------------------------------------------------
-- 3) RELOJES (LOS DISPOSITIVOS)
-- ------------------------------------------------------------
create table if not exists public.relojes (
  id uuid primary key default gen_random_uuid(),
  -- El código es lo que se escribe en la URL del tótem: /totem/RELOJ-01
  code text not null unique,
  nombre text not null,
  -- Dónde está. El texto libre es para los que no usan centro de costo.
  ubicacion text,
  centro_costo_id int references public.centros_costo(id) on delete set null,
  empresa_id int references public.empresa(id) on delete cascade,
  -- Cómo lee. 'camara' usa la cámara del dispositivo; 'teclado' es un
  -- lector QR USB que se comporta como teclado.
  tipo_lector text not null default 'teclado'
    check (tipo_lector in ('camara','teclado')),
  -- Si es cámara: qué cámara usar. 'trasera' es la de arriba, que es la
  -- que está mirando a la gente en un tótem.
  camara text not null default 'trasera' check (camara in ('trasera','frontal','auto')),
  activo boolean not null default true,
  -- Ventana antirrebote, en segundos. 45 es suficiente para alejar la
  -- tarjeta y volver a acercarla, y corto para no tapar un marcaje real.
  segundos_antirrebote int not null default 45 check (segundos_antirrebote between 5 and 600),
  -- El token en claro NO se guarda: solo su hash.
  token_hash text,
  token_creado_at timestamptz,
  token_rotado_por uuid references public.perfiles(id) on delete set null,
  -- Para saber si el reloj está vivo, sin tener que esperar a un marcaje.
  ultima_lectura_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.relojes.tipo_lector is
  'camara = usa la camara del dispositivo. teclado = lector QR USB que actua como teclado.';
comment on column public.relojes.token_hash is
  'SHA-256 del token del dispositivo. El token en claro se muestra una vez y no se vuelve a leer.';

create index if not exists relojes_empresa_idx on public.relojes(empresa_id);
create index if not exists relojes_centro_costo_idx on public.relojes(centro_costo_id);

alter table public.relojes enable row level security;

drop policy if exists "relojes rw" on public.relojes;
create policy "relojes rw" on public.relojes for all
  using (public.tiene_permiso('relojes.ver'))
  with check (public.tiene_permiso('relojes.editar'));

-- ------------------------------------------------------------
-- 4) COLACIÓN EN MARCAJES
-- ------------------------------------------------------------
-- Se reemplaza el CHECK por uno que incluya los dos semiciclos. La
-- restricción tiene nombre propio, porque un "drop constraint" a secas
-- sobre una unnamed falla y el error no dice qué hacer.
alter table public.marcajes drop constraint if exists marcajes_tipo_check;
alter table public.marcajes add constraint marcajes_tipo_check
  check (tipo in ('entrada','salida','colacion_entrada','colacion_salida'));

-- De qué reloj vino. Sin esto no se puede saber después por qué esa máquina
-- registró una hora distinta a la del reloj de control, que es la pregunta
-- que siempre aparece.
alter table public.marcajes add column if not exists reloj_id uuid references public.relojes(id) on delete set null;

create index if not exists marcajes_reloj_idx on public.marcajes(reloj_id, fecha desc);

-- ------------------------------------------------------------
-- 5) EL TOKEN DEL DISPOSITIVO
-- ------------------------------------------------------------
-- Se usa el sha256() NATIVO de Postgres 11 y no digest() de pgcrypto.
--
-- La razón práctica: digest() viene en pgcrypto, que no está en todas las
-- instalaciones (PGlite, que es donde se prueban las migraciones, no lo
-- trae). El sha256() nativo no necesita extensión, funciona en todos lados
-- y es el mismo algoritmo.
--
-- Y no es una bajada de seguridad: el token tiene 24 bytes aleatorios
-- (192 bits), así que ningún hash sirve contra un ataque de fuerza bruta.
-- Lo que protege es que leer la tabla no deje pasar asistencia.
create or replace function public.hash_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_token,''), 'UTF8')), 'hex')
$$;

-- Genera un token nuevo para un reloj y devuelve el valor EN CLARO, una sola
-- vez. Es la única forma de obtenerlo: en la base solo queda el hash.
--
-- Se usa "security definer" porque el UPDATE lo hace la función, y el rol
-- del navegador no necesita permiso de escritura directo sobre la fila.
create or replace function public.rotar_token_reloj(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  -- El token es un UUID, no bytes aleatorios sueltos.
  --
  -- gen_random_bytes() viene de pgcrypto, que no está en todas partes.
  -- gen_random_uuid() es nativo desde Postgres 13 y no necesita extensión.
  -- Son 122 bits de entropía, de sobra para un dispositivo de obra, y el
  -- formato con guiones se puede leer y dictar sin errores.
  v_token := gen_random_uuid()::text;

  update public.relojes
     set token_hash = public.hash_token(v_token),
         token_creado_at = now(),
         token_rotado_por = auth.uid(),
         updated_at = now()
   where code = p_code;
  if not found then
    raise exception 'No existe un reloj con el codigo %', p_code
      using errcode = 'no_data_found';
  end if;
  return v_token;
end $$;

comment on function public.rotar_token_reloj(text) is
  'Genera un token nuevo para el reloj y lo devuelve en claro UNA vez. En la base solo queda el hash.';

-- ------------------------------------------------------------
-- 6) EL MARCAJE
-- ------------------------------------------------------------
-- POR QUÉ UNA FUNCIÓN Y NO QUE EL TÓTEM ESCRIBA DIRECTO
--
-- Tres cosas no se pueden dejar en el cliente:
--   - el token: la pantalla del tótem no debe conocerlo (va en la
--     edge function, no en el HTML);
--   - la ventana antirrebote: la tiene que aplicar el servidor, porque si
--     la aplica el navegador un tótem con la hora desfasada o alguien que
--     recarga la página se salta el control;
--   - la validación de la tarjeta y del estado del trabajador: si la
--     valida el cliente, un lector viejo sigue aceptando tarjetas
--     anuladas.
--
-- OJO CON LOS NOMBRES DE LA TABLA DE SALIDA
--
-- Se llaman trabajador_code, marca_hora, etc. y no code, hora, etc. a
-- propósito. En plpgsql los parámetros de salida son variables, y una
-- variable llamada "code" tapa la columna code de trabajadores: la consulta
-- falla con "column reference code is ambiguous" en la primera ejecución.
-- Se podría resolver con "#variable_conflict use_column", pero renombrar
-- deja el código legible sin una directiva que hay que recordar.
create or replace function public.marcar_por_reloj(
  p_token text,
  p_codigo text,
  p_tipo text default 'entrada',
  p_segundos_antirrebote int default null
)
returns table (
  resultado text,               -- ok | ya_marcado | duplicado
  trabajador_code text,
  trabajador_nombre text,
  marca_hora text,
  marca_tipo text,
  marca_fecha date,
  reloj_code text,
  centro_costo_nombre text,
  detalle text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reloj public.relojes%rowtype;
  v_trab public.trabajadores%rowtype;
  v_fecha date := (now() at time zone 'America/Santiago')::date;
  v_hora time := (now() at time zone 'America/Santiago')::time;
  v_tipo text := lower(btrim(coalesce(p_tipo,'entrada')));
  v_codigo text := btrim(coalesce(p_codigo,''));
  v_ventana int;
  v_antiguo record;
  v_uid uuid := auth.uid();
begin
  ------------------------------------------------------------------
  -- EL RELOJ
  ------------------------------------------------------------------
  select * into v_reloj from public.relojes where token_hash = public.hash_token(p_token);
  if not found then
    raise exception 'TOKEN_INVALIDO' using errcode = 'no_data_found';
  end if;
  if not v_reloj.activo then
    raise exception 'RELOJ_INACTIVO' using errcode = 'check_violation';
  end if;

  ------------------------------------------------------------------
  -- EL CÓDIGO
  ------------------------------------------------------------------
  if v_codigo = '' then
    raise exception 'CODIGO_VACIO' using errcode = 'check_violation';
  end if;
  if length(v_codigo) > 60 then
    raise exception 'CODIGO_LARGO' using errcode = 'check_violation';
  end if;

  ------------------------------------------------------------------
  -- LA TARJETA
  --
  -- Se busca por el código del trabajador y también por el ID de la
  -- tarjeta, porque el lector lee cualquiera de los dos: la credencial
  -- puede llevar el código del trabajador o el ID de la tarjeta emitida.
  ------------------------------------------------------------------
  select * into v_trab from public.trabajadores
   where code = v_codigo
      or code = ltrim(v_codigo, '0')   -- el 1 y el 0001 son el mismo código
   limit 1;

  if not found then
    select t.* into v_trab
      from public.tarjetas ta join public.trabajadores t on t.code = ta.code
     where ta.id = v_codigo
     limit 1;
  end if;

  if not found then
    raise exception 'CODIGO_DESCONOCIDO' using errcode = 'no_data_found';
  end if;

  -- Tarjeta anulada o bloqueada. Se avisa con el motivo: sin eso la persona
  -- cree que el sistema está malo y va a probar con otra tarjeta.
  if exists (select 1 from public.tarjetas
              where code = v_trab.code and estado = 'bloqueada') then
    raise exception 'TARJETA_BLOQUEADA' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.tarjetas
              where code = v_trab.code and estado = 'anulada') then
    raise exception 'TARJETA_ANULADA' using errcode = 'check_violation';
  end if;

  -- Estado del trabajador.
  if v_trab.status <> 'activo' then
    raise exception 'TRABAJADOR_NO_ACTIVO' using errcode = 'check_violation';
  end if;

  -- Ámbito de empresa. Un reloj de una empresa no marca a personal de otra.
  if v_reloj.empresa_id is not null and v_trab.empresa_id is not null
     and v_reloj.empresa_id <> v_trab.empresa_id then
    raise exception 'OTRA_EMPRESA' using errcode = 'check_violation';
  end if;

  ------------------------------------------------------------------
  -- LA MARCA
  ------------------------------------------------------------------
  if v_tipo not in ('entrada','salida','colacion_entrada','colacion_salida') then
    raise exception 'TIPO_INVALIDO' using errcode = 'check_violation';
  end if;

  v_ventana := coalesce(p_segundos_antirrebote, v_reloj.segundos_antirrebote, 45);

  select m.hora, m.created_at into v_antiguo
    from public.marcajes m
   where m.code = v_trab.code and m.fecha = v_fecha and m.tipo = v_tipo
   limit 1;

  if v_antiguo is not null then
    -- La marca existe. La diferencia entre "duplicado" y "ya marcado" es si
    -- la anterior fue hace nada: con la tarjeta pegada, el lector manda la
    -- misma lectura dos veces seguidas, y eso no se le muestra a nadie.
    if extract(epoch from (now() - v_antiguo.created_at)) <= v_ventana then
      return query select 'duplicado', v_trab.code, v_trab.name,
        to_char(v_antiguo.hora,'HH24:MI'), v_tipo, v_fecha,
        v_reloj.code, (select nombre from public.centros_costo where id = v_reloj.centro_costo_id),
        'Se ignoró la lectura repetida.';
      return;
    end if;
    -- Pasó más de la ventana: la persona ya marcó hoy. No es un error, se
    -- le muestra la hora con la que quedó y se deja la marca como estaba.
    return query select 'ya_marcado', v_trab.code, v_trab.name,
      to_char(v_antiguo.hora,'HH24:MI'), v_tipo, v_fecha,
      v_reloj.code, (select nombre from public.centros_costo where id = v_reloj.centro_costo_id),
      'Ya tenías esta marca de hoy.';
    return;
  end if;

  insert into public.marcajes (code, fecha, hora, tipo, origen, nota, reloj_id, registrado_por_nombre)
  values (v_trab.code, v_fecha, v_hora, v_tipo, 'qr',
          'Marcaje en '||coalesce(v_reloj.nombre, v_reloj.code), v_reloj.id,
          'Reloj '||v_reloj.code)
  returning id into v_antiguo;

  update public.relojes set ultima_lectura_at = now() where id = v_reloj.id;

  return query select 'ok', v_trab.code, v_trab.name,
    to_char(v_hora,'HH24:MI'), v_tipo, v_fecha,
    v_reloj.code, (select nombre from public.centros_costo where id = v_reloj.centro_costo_id),
    null;
end $$;

comment on function public.marcar_por_reloj(text, text, text, integer) is
  'Registra un marcaje desde un tótem. Idempotente dentro de una ventana de segundos. Devuelve ok / ya_marcado / duplicado.';

grant execute on function public.marcar_por_reloj(text, text, text, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- 7) DIAGNÓSTICO
-- ------------------------------------------------------------
-- Hay que eliminarla antes: "create or replace" no puede cambiar el tipo
-- de retorno de una funcion que ya existe, y la base puede tenerla de una
-- corrida anterior. El error que sale es
--   42P13: cannot change return type of existing function
-- que no dice en que linea esta el problema.
drop function if exists public.diagnostico_relojes();

create or replace function public.diagnostico_relojes()
returns table (
  tabla_relojes boolean,
  tabla_centros boolean,
  colacion_ok boolean,
  col_reloj_ok boolean,
  hash_fn boolean,
  marca_fn boolean,
  total_relojes bigint,
  sin_centro_costo bigint,
  sin_token bigint,
  con_colacion bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='relojes'),
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='centros_costo'),
    -- colacion_ok: los dos semiciclos tienen que estar permitidos, y el
    -- índice único por (code, fecha, tipo) tiene que seguir existiendo.
    --
    -- account(*) = 1 y no = 2: hay UNA sola restricción y tiene que
    -- mencionar los dos tipos. Con = 2 el diagnóstico decía "no está" con
    -- la migración aplicada, que es la peor forma de estar un diagnóstico.
    (select count(*) = 1 from pg_constraint
      where conname='marcajes_tipo_check'
        and pg_get_constraintdef(oid) like '%colacion_entrada%'
        and pg_get_constraintdef(oid) like '%colacion_salida%')
    and exists (select 1 from pg_indexes
                 where tablename='marcajes' and indexdef like '%UNIQUE%code%fecha%tipo%'),
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='marcajes' and column_name='reloj_id'),
    exists (select 1 from pg_proc where proname='hash_token' and pronamespace='public'::regnamespace),
    exists (select 1 from pg_proc where proname='marcar_por_reloj' and pronamespace='public'::regnamespace),
    (select count(*) from public.relojes),
    (select count(*) from public.relojes where centro_costo_id is null),
    (select count(*) from public.relojes where token_hash is null),
    (select count(*) from public.marcajes where tipo like 'colacion%')
$$;

comment on function public.diagnostico_relojes() is
  'Estado de los relojes: tablas, colacion, token, funcion de marcaje, y cuantos relojes quedan sin centro de costo o sin token.';

select * from public.diagnostico_relojes();
