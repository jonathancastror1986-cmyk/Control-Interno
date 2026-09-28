-- ============================================================
-- Migración 031: kit de contratación (charlas, formularios, firmas y timbre)
-- ============================================================
-- QUÉ ES ESTO
--
-- El papel que se le entrega a una persona el primer día: la inducción, la
-- declaración de salud, los elementos de protección, el acta de recepción
-- de herramientas. Todo eso en papel, firmado, con el timbre de la
-- empresa, y guardado.
--
-- POR QUÉ SON DOS COSAS Y NO UNA
--
-- LA PLANTILLA y LA ENTREGA.
--
-- La plantilla la escribe Prevención una vez y se puede cambiar las veces
-- que haga falta. La entrega es el papel firmado por una persona concreta
-- en una fecha concreta, y esa no se puede volver a hacer: si se borra, se
-- borra la prueba de que esa persona fue inducida. Por eso la entrega
-- tiene su tabla y no se toca nunca más.
--
-- Es la misma razón por la que la bitácora de asistencia (028) es
-- inalterable. Esto es lo mismo, del otro lado.
--
-- EL CONTENIDO LO ESCRIBE PREVENCIÓN, NO ESTA MIGRACIÓN
--
-- Acá va la estructura, no el texto de las charlas. El texto de una charla
-- de inducción es materia legal y técnica que redacta el prevencionista de
-- la obra: ponehärlo acá sería inventarlo. Lo que sí se hace es dejarle
-- una plantilla lista por especialidad para que parta de ahí, y un editor
-- para escribirla como un documento.
--
-- EL TIMBRE
--
-- Sale de la tabla `empresa`, que ya tiene nombre y RUT. No se duplica: si
-- el timbre tuviera su propio nombre, algún día los dos van a decir cosas
-- distintas y el timbre queda desactualizado. Lo que sí se guarda aparte es
-- lo que es del timbre y no de la empresa: quién lo firma (el cargo), si
-- muestra el RUT, el tamaño y la inclinación.
--
-- Re-runnable.
-- ============================================================

-- ------------------------------------------------------------
-- 1) PERMISOS
-- ------------------------------------------------------------
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('contratacion.ver',    'Ver el kit de contratación y las entregas',  'contratacion', 1),
  ('contratacion.editar', 'Escribir y editar las plantillas',            'contratacion', 2),
  ('contratacion.firmar', 'Generar el PDF y registrar la firma',        'contratacion', 3)
on conflict (clave) do update set descripcion = excluded.descripcion;

insert into public.roles_permisos (rol, permiso) values
  ('admin', 'contratacion.ver'), ('admin', 'contratacion.editar'), ('admin', 'contratacion.firmar'),
  ('rrhh',  'contratacion.ver'), ('rrhh',  'contratacion.editar'), ('rrhh',  'contratacion.firmar'),
  ('prevencion', 'contratacion.ver'), ('prevencion', 'contratacion.editar'),
  ('prevencion', 'contratacion.firmar')
on conflict do nothing;

-- ------------------------------------------------------------
-- 2) LAS ESPECIALIDADES
-- ------------------------------------------------------------
-- La tabla "epp_especialidades" ya existe (migración 011) y es la misma
-- lista: no se crea otra. Lo que se le agrega es un código por especialidad
-- que se pueda escribir, porque las charlas se identifican por clave y no
-- por un id que cambia según cómo se creó.
alter table public.epp_especialidades add column if not exists codigo_contratacion text;

-- La especialidad DEL TRABAJADOR, como clave y no como texto.
--
-- Antes el oficio estaba metido en `trabajadores.cargo`, que es texto
-- libre: "JORNAL ASEO", "MAESTRO ALBAÑIL", "maestro albañil". Para el EPP
-- alcanzaba con eso, pero para decidir qué charla le toca a cada uno no
-- sirve: no se puede comparar un texto libre contra una lista.
--
-- Se agrega la columna y se deja en NULL a propósito. No se adivina: se
-- llenaría con la specialty más parecida al texto, y el primero que
-- quedara mal would recibiría la charla del oficio equivocado, que es peor
-- que no receber ninguna. Se llena desde la ficha del trabajador.
--
-- Con la columna en NULL a esa persona le tocan solo las charlas generales,
-- que es lo correcto: es preferible una charla de seguridad general a una
-- charla de otro oficio.
alter table public.trabajadores add column if not exists especialidad_clave text;

create index if not exists trabajadores_especialidad_clave_idx
  on public.trabajadores(especialidad_clave)
  where especialidad_clave is not null;

comment on column public.trabajadores.especialidad_clave is
  'Clave de la especialidad (epp_especialidades.clave). Decide que charlas del kit le tocan. NULL = solo las generales.';

-- Las especialidades del formulario de inducción por especialidad.
--
-- Se siembran porque son las que usa la obra, y arrancar con la lista vacía
-- significa que la primera persona que use el módulo tiene que escribirlas
-- todas a mano.
--
-- POR QUÉ NO ES UN "INSERT ... VALUES" CON "ON CONFLICT DO NOTHING"
--
-- Porque la tabla YA TIENE especialidades de la migración 011, con la clave
-- en minúsculas: albanil, soldador, pintor, electricista, carpintero,
-- almacenista, maestro de obra, operador de maquinaria, topografo, trabajo
-- en altura. Con un insert de claves en mayúsculas, esas cinco quedaban
-- DOBLE: "albanil" y "ALBANIL" serían el mismo oficio con dos fichas, y
-- según cuál se eligiera el trabajador le tocaría una charla o ninguna.
--
-- Por eso el insert es condicional: solo entra lo que todavía no está, y
-- la comparación no es solo por clave sino también por nombre normalizado.
-- Así, sobre una base nueva quedan las que faltaban; sobre una que ya
-- tiene todo, no entra ninguna; y sobre una a la que alguien le cargó
-- "Albañil" a mano, esa gana y no se crea la versión en mayúsculas.
insert into public.epp_especialidades (clave, nombre, activa)
select v.clave, v.nombre, true
from (values
  ('ALBANIL',                    'Albanil'),
  ('ALCANTARILLERO',             'Alcantarillero'),
  ('ANDAMIERO',                  'Andamiero'),
  ('BANDERERO',                  'Banderero'),
  ('BODEGUERO',                  'Bodeguero'),
  ('CARPINTERO-OG',              'Carpintero O.G.'),
  ('CARPINTERO-TERMINACION',     'Carpintero Terminación'),
  ('CERAMISTA',                  'Ceramista'),
  ('CONCRETERO',                 'Concretero'),
  ('DESCIMBRADOR',               'Descimbrador'),
  ('ELECTRICISTA',               'Electricista'),
  ('ENFIERRADOR',                'Enfierrador'),
  ('GASFITER',                   'Gasfiter'),
  ('JORNALERO',                  'Jornalero'),
  ('LLAVERO',                    'Llavero'),
  ('OP-BANCO-DE-SIERRA',         'Op. Banco de Sierra'),
  ('OP-BANCO-DE-CORTE-LADRILLOS','Op. Banco de Corte de Ladrillos'),
  ('OP-EQUIPO-MENOR',            'Op. Equipo Menor'),
  ('OP-KANGO',                   'Op. Kango'),
  ('PAVIMENTADOR',               'Pavimentador'),
  ('PINTOR',                     'Pintor'),
  ('PORTERO',                    'Portero'),
  ('SOLDADOR',                   'Soldador'),
  ('TRAZADOR',                   'Trazador'),
  ('YESERO',                     'Yesero')
) as v(clave, nombre)
where not exists (
  select 1 from public.epp_especialidades e
   where upper(e.clave) = v.clave
      -- La comparación por nombre normalizado es la que evita el doble con
      -- las que ya estaban en minúsculas: "albanil" (la vieja) y "Albanil"
      -- (esta) se reconocen como lo mismo.
      or upper(regexp_replace(btrim(e.nombre), '[^A-Za-z0-9]', '', 'g'))
       = upper(regexp_replace(btrim(v.nombre), '[^A-Za-z0-9]', '', 'g'))
);

-- Lo que ya estaba y se queda con la clave en minúsculas no se renombra:
-- renombrar una clave rompe las referencias que ya se guardaron
-- apuntando a ella. Lo que se hace es dejar constancia de la equivalencia,
-- para que el formulario de la ficha ofrezca las claves que existen.
update public.epp_especialidades
   set codigo_contratacion = upper(clave)
 where codigo_contratacion is null;

-- ------------------------------------------------------------
-- 3) LAS PLANTILLAS
-- ------------------------------------------------------------
-- "contenido" es HTML, no texto con saltos de línea, porque es lo que se
-- imprime. Guardar texto plano obligaría a volver a interpretar los
-- saltos al imprimir, y el resultado cambia entre navegadores: es la razón
-- de que estas plantillas invariably se vean bien en la pantalla y mal en
-- el papel.
create table if not exists public.plantillas_contratacion (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  nombre text not null,
  -- 'charla'     : inducción, charla de especialidad
  -- 'formulario' : declaración de salud,_listados
  -- 'acta'       : acta de recepción
  tipo text not null check (tipo in ('charla','formulario','acta')),
  -- NULL = aplica a todos (la charla de seguridad general)
  especialidad_clave text,
  -- El contenido, con los {{campos}} que se rellenan al generar.
  contenido text not null default '',
  -- Versión. Las plantillas se cambian; las entregas guardan a qué versión
  -- se $$\text{firmaron, y eso es lo que hace válida la entrega.
  version int not null default 1,
  vigente boolean not null default true,
  -- Orden en el checklist del kit.
  orden int not null default 100,
  -- Quién firma este papel. Un solo valor, no un sí/no, porque hay tres
  -- casos y el booleano sólo alcanza para dos: si el papel no lo firma
  -- nadie (un informativo), lo firma el trabajador, o lo firman los dos.
  -- Con un booleano, el caso "nadie" se confunde con "el trabajador".
  firmas text not null default 'trabajador_supervisor'
    check (firmas in ('ninguno','trabajador','trabajador_supervisor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plantillas_contratacion_tipo_idx
  on public.plantillas_contratacion(tipo, vigente, orden);

comment on column public.plantillas_contratacion.contenido is
  'HTML de la plantilla. Usa {{nombre}}, {{rut}}, {{especialidad}}, {{empresa}}, {{centro}} y {{fecha}}.';
comment on column public.plantillas_contratacion.version is
  'Sube cada vez que se edita el contenido. Las entregas guardan la version con la que se firmaron.';

alter table public.plantillas_contratacion enable row level security;

drop policy if exists "plantillas_contratacion rw" on public.plantillas_contratacion;
create policy "plantillas_contratacion rw" on public.plantillas_contratacion for all
  using (public.tiene_permiso('contratacion.ver'))
  with check (public.tiene_permiso('contratacion.editar'));

-- ------------------------------------------------------------
-- 4) LAS ENTREGAS: CON FIRMA, Y NO SE TOCAN MÁS
-- ------------------------------------------------------------
create table if not exists public.entregas_contratacion (
  id uuid primary key default gen_random_uuid(),
  trabajador_code text not null references public.trabajadores(code) on delete cascade,
  plantilla_id uuid not null references public.plantillas_contratacion(id) on delete restrict,
  -- Se guarda el código y el nombre, no solo el id: si mañana se cambia el
  -- nombre de la plantilla, la entrega tiene que seguir diciendo con qué
  -- papel se firmó, y el nombre guardado es la copia de ese momento.
  plantilla_code text not null,
  plantilla_nombre text not null,
  plantilla_version int not null,
  -- Los datos con los que se generó. Se guardan enteros y no se vuelven a
  -- leer de la ficha del trabajador, porque la ficha cambia (el nombre, el
  -- RUT, la especialidad) y el papel firmado tiene que seguir diciendo lo
  -- que decía ese día.
  datos jsonb not null default '{}'::jsonb,
  -- Las firmas, en base64 (PNG). Van en la fila y no en un archivo aparte a
  -- propósito: un papel firmado que depende de que un bucket siga
  -- configurado deja de existir sin avisar.
  firma_trabajador text,
  firma_supervisor text,
  firmado_trabajador_at timestamptz,
  firmado_supervisor_at timestamptz,
  -- Cómo quedó completo: 'incompleto' mientras falta alguna firma.
  estado text not null default 'incompleto'
    check (estado in ('incompleto','completa','anulada')),
  generado_por uuid references public.perfiles(id) on delete set null,
  generado_por_nombre text,
  -- La hora en que se genero el PDF, que no es la de la firma. En una obra
  -- el papel se firma un día y se escanea otro.
  generado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un papel VIVO por persona y por plantilla. Las anuladas no cuentan: si
-- un papel se rehace, queda el viejo con su estado 'anulada' y el nuevo
-- aparte, que es lo que hace falta para responder "cuántas veces se firmó
-- esto y por qué se rehizo".
--
-- Es un índice PARCIAL y no una restricción unique normal por dos razones:
--   - con una normal, la fila anulada seguiría ocupando la clave y el
--     "on conflict" del guardado la pisaría en vez de crear una nueva,
--     perdiendo el historial de la anulación;
--   - y una restricción "deferrable" no puede ser árbitro de ON CONFLICT,
--     que es justo lo que usa la función de firma. Sale el error:
--     "ON CONFLICT does not support deferrable unique constraints".
create unique index if not exists entregas_unica_viva_idx
  on public.entregas_contratacion(trabajador_code, plantilla_id)
  where estado <> 'anulada';

create index if not exists entregas_contratacion_trabajador_idx
  on public.entregas_contratacion(trabajador_code, created_at desc);
create index if not exists entregas_contratacion_plantilla_idx
  on public.entregas_contratacion(plantilla_id);

comment on table public.entregas_contratacion is
  'Papeles firmados del kit de contratacion. No se borran: se anulan, para que quede el rastro.';

alter table public.entregas_contratacion enable row level security;

drop policy if exists "entregas_contratacion rw" on public.entregas_contratacion;
create policy "entregas_contratacion rw" on public.entregas_contratacion for all
  using (public.tiene_permiso('contratacion.ver'))
  with check (public.tiene_permiso('contratacion.firmar'));

-- ------------------------------------------------------------
-- 5) EL TIMBRE
-- ------------------------------------------------------------
-- NO tiene nombre ni RUT propios: se sacan de `empresa`. Duplicarlos haría
-- que algún día el timbre del papel diga una cosa y la empresa otra, y de
-- los dos el que vale es el que está en el timbre.
--
-- Lo que sí se guarda es lo que es del timbre y no de la empresa: qué
-- cargo lo suscribe, si se imprime el RUT, y cómo se dibuja.
create table if not exists public.configuracion_timbre (
  empresa_id int primary key references public.empresa(id) on delete cascade,
  -- El cargo de quien suscribe el timbre. Texto libre: puede ser "Jefe de
  -- Prevención" o "Prevencionista", y depende de cada obra.
  cargo text not null default 'Jefe de Prevención de Riesgos',
  -- Nombre de quien firma, cuando se quiere una persona y no un cargo.
  nombre_firmante text,
  incluir_rut boolean not null default true,
  incluir_direccion boolean not null default false,
  -- Tamaño y giro, en grados. El giro es lo que hace que un timbre parezca
  -- un timbre y no un recuadro con texto.
  tamano int not null default 100 check (tamano between 50 and 200),
  giro_grados numeric not null default -8 check (giro_grados between -45 and 45),
  -- Dónde va: 'inferior_derecha' es el lugar donde no pisa la firma.
  posicion text not null default 'inferior_derecha'
    check (posicion in ('inferior_derecha','inferior_izquierda','superior_derecha','superior_izquierda')),
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.configuracion_timbre is
  'Como se dibuja el timbre. El nombre y el RUT salen de la tabla empresa, no se duplican aqui.';

alter table public.configuracion_timbre enable row level security;

drop policy if exists "configuracion_timbre rw" on public.configuracion_timbre;
create policy "configuracion_timbre rw" on public.configuracion_timbre for all
  using (public.tiene_permiso('contratacion.ver'))
  with check (public.tiene_permiso('contratacion.editar'));

-- Se crea una fila por empresa activa, para que haya algo que configurar y
-- no haya que crear el registro antes de poder editarlo.
insert into public.configuracion_timbre (empresa_id)
select e.id from public.empresa e
where e.activa
on conflict (empresa_id) do nothing;

-- ------------------------------------------------------------
-- 6) LA FUNCIÓN QUE ARMA EL KIT
-- ------------------------------------------------------------
-- Devuelve, para una persona, la lista de papeles que le tocan: las
-- generales más las de su especialidad, con lo que ya firmó cada una.
--
-- Se hace en el servidor y no en la pantalla para que la lista sea la
-- misma para todos y no dependa de qué se haya cargado en el navegador. Con
-- 46 personas y cuatro plantillas, la diferencia es chica, pero el día que
-- haya un compendio son 200 y la lista mal armada es un papel que no se
-- entrega.
create or replace function public.kit_de_un_trabajador(p_code text)
returns table (
  plantilla_id uuid,
  plantilla_code text,
  plantilla_nombre text,
  tipo text,
  especialidad_clave text,
  version int,
  orden int,
  firmas text,
  estado text,               -- '' = no entregada
  entrega_id uuid,
  firmado_trabajador_at timestamptz,
  firmado_supervisor_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.code, p.nombre, p.tipo, p.especialidad_clave, p.version, p.orden,
    coalesce(p.firmas, 'trabajador'),
    coalesce(e.estado, ''),
    e.id,
    e.firmado_trabajador_at,
    e.firmado_supervisor_at
  from public.plantillas_contratacion p
  left join public.entregas_contratacion e
    on e.plantilla_id = p.id
   and e.trabajador_code = p_code
   and e.estado <> 'anulada'
  join public.trabajadores t on t.code = p_code
  where p.vigente
    -- Las generales (sin especialidad) y la de su especialidad. La
    -- comparación es sobre la CLAVE, no sobre el nombre: el nombre se puede
    -- cambiar y la clave no.
    and (p.especialidad_clave is null or p.especialidad_clave = t.especialidad_clave)
  order by p.orden, p.nombre
$$;

comment on function public.kit_de_un_trabajador(text) is
  'Los papeles que le tocan a un trabajador, con lo que ya firmó de cada uno.';

grant execute on function public.kit_de_un_trabajador(text) to authenticated;

-- ------------------------------------------------------------
-- 7) REGISTRAR LA FIRMA
-- ------------------------------------------------------------
-- Por RPC, y no un upsert desde la pantalla, por dos razones:
--   - la firma tiene que quedar atada a la versión de la plantilla con la
--     que se firmó, y eso se resuelve acá y no en el navegador;
--   - si la plantilla cambió entre que se abrió el papel y el momento de
--     firmar, hay que rechazarlo. Signar un papel con el texto viejo, en
--     silencio, es peor que no tener el módulo.
create or replace function public.registrar_firma_contratacion(
  p_plantilla_code text,
  p_trabajador_code text,
  p_version int,
  p_firma_trabajador text default null,
  p_firma_supervisor text default null,
  p_datos jsonb default '{}'::jsonb,
  p_anular boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.plantillas_contratacion%rowtype;
  v_id uuid;
  v_estado text;
begin
  select * into v_p from public.plantillas_contratacion where code = p_plantilla_code;
  if not found then
    raise exception 'PLANTILLA_NO_EXISTE' using errcode = 'no_data_found';
  end if;

  if p_anular then
    -- Anular, no borrar. Un papel firmado que se borra es un papel que no
    -- existió, y la anulación deja dicho por qué se rehace.
    update public.entregas_contratacion
       set estado = 'anulada', updated_at = now()
     where trabajador_code = p_trabajador_code
       and plantilla_id = v_p.id
       and estado <> 'anulada'
    returning id into v_id;
    if v_id is null then
      raise exception 'NO_HAY_ENTREGA_QUE_ANULAR' using errcode = 'no_data_found';
    end if;
    return v_id;
  end if;

  -- La versión tiene que ser la que está vigente. Si Prevención editó la
  -- charla entre que se abrió el papel y que se firmó, el papel que la
  -- persona leyó ya no es el que se le guardaría.
  if v_p.version <> p_version then
    raise exception 'VERSION_CAMBIO|La plantilla "%" cambió de la versión % a la % mientras se firmaba. Cerrá el papel y abrilo de nuevo.',
      p_plantilla_code, p_version, v_p.version;
  end if;

  v_estado := case
    when p_firma_trabajador is not null and p_firma_trabajador <> '' then 'completa'
    else 'incompleto'
  end;

  insert into public.entregas_contratacion as e (
    trabajador_code, plantilla_id, plantilla_code, plantilla_nombre, plantilla_version,
    datos,
    firma_trabajador, firmado_trabajador_at,
    generado_por, generado_por_nombre, generado_at, estado
  ) values (
    p_trabajador_code, v_p.id, v_p.code, v_p.nombre, v_p.version,
    coalesce(p_datos, '{}'::jsonb),
    nullif(p_firma_trabajador,''), case when nullif(p_firma_trabajador,'') is null then null else now() end,
    auth.uid(), (select nombre from public.perfiles where id = auth.uid()),
    case when nullif(p_firma_trabajador,'') is null then null else now() end,
    v_estado
  )
  on conflict (trabajador_code, plantilla_id) where estado <> 'anulada' do update
    set firma_trabajador = excluded.firma_trabajador,
        firmado_trabajador_at = excluded.firmado_trabajador_at,
        datos = excluded.datos,
        estado = excluded.estado,
        generado_por = excluded.generado_por,
        generado_por_nombre = excluded.generado_por_nombre,
        generado_at = excluded.generado_at,
        updated_at = now()
  returning id into v_id;

  -- La firma del supervisor va aparte, y SOLO si la plantilla la pide.
  -- Meterla siempre dejaría papeles con dos firmas donde la plantilla pide
  -- una, que es un documento mal hecho.
  if v_p.firmas in ('trabajador','trabajador_supervisor') and nullif(p_firma_supervisor,'') is not null then
    update public.entregas_contratacion
       set firma_supervisor = p_firma_supervisor,
           firmado_supervisor_at = now(),
           estado = 'completa',
           updated_at = now()
     where id = v_id;
  end if;

  return v_id;
end $$;

comment on function public.registrar_firma_contratacion(text, text, int, text, text, jsonb, boolean) is
  'Registra la firma de un papel del kit. Rechaza si la plantilla cambio de version mientras se firmaba.';

grant execute on function public.registrar_firma_contratacion(text, text, int, text, text, jsonb, boolean) to authenticated;

-- ------------------------------------------------------------
-- 8) DIAGNÓSTICO
-- ------------------------------------------------------------
create or replace function public.diagnostico_contratacion()
returns table (
  tabla_plantillas boolean,
  tabla_entregas boolean,
  tabla_timbre boolean,
  escanea_especialidad boolean,
  fn_kit boolean,
  fn_firma boolean,
  total_plantillas bigint,
  sin_contenido bigint,
  entregas_completas bigint,
  sin_firma_trabajador bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='plantillas_contratacion'),
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='entregas_contratacion'),
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='configuracion_timbre'),
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='epp_especialidades'
               and column_name='codigo_contratacion'),
    exists (select 1 from pg_proc where proname='kit_de_un_trabajador' and pronamespace='public'::regnamespace),
    exists (select 1 from pg_proc where proname='registrar_firma_contratacion' and pronamespace='public'::regnamespace),
    (select count(*) from public.plantillas_contratacion),
    (select count(*) from public.plantillas_contratacion
      where coalesce(btrim(contenido),'') = ''),
    (select count(*) from public.entregas_contratacion where estado = 'completa'),
    (select count(*) from public.entregas_contratacion
      where estado <> 'anulada' and firma_trabajador is null)
$$;

comment on function public.diagnostico_contratacion() is
  'Estado del kit de contratacion: tablas, funciones, cuantas plantillas hay, cuantas estan vacias y cuantas entregas quedaron sin firma.';

select * from public.diagnostico_contratacion();
