-- ============================================================
-- Migración 032: logo, firmas y variables en las plantillas del kit
-- ============================================================
-- QUÉ AGREGA
--
-- Tres cosas que la 031 no tenía y que el uso diario mostró que faltaban:
--
--  1. LOGO DE LA EMPRESA EN EL PAPEL. La tabla `empresa` ya tiene
--     `logo_url` desde la migración 014, pero las plantillas no tenían forma
--     de usarlo. Un acta de inducción sin el logo de laconstructora es media
--     acta: el encabezado "URBANIZA CONSTRUCTORA S.A." escrito en el texto
--     no es lo mismo que el sello de la empresa arriba.
--
--  2. QUIÉN FIRMA, COMO OPCIÓN Y NO COMO CASILLERO. La 031 traía
--     `requiere_supervisor boolean`, que obliga a dos estados: firma el
--     supervisor o no. Hay tres casos reales y el tercero no se podía
--     expresar: un acta de recepción la firma solo el trabajador, una
--    notification interna no la firma nadie, y un anexo de contrato la
--     firman los dos. Se reemplaza por un texto con tres valores.
--
--  3. NÚMEROS CORRELATIVOS DE PAPEL. Un documento firmado que no tiene número
--     es imposible de ordenar cuando hay que responder "¿cuál de las tres
--     actas es?". El correlativo se arma al generar, no al guardar la
--     plantilla, porque depende de cuántas entregas hay.
--
-- POR QUÉ SE ELIMINA `requiere_supervisor` Y NO SE DEJA
--
-- Dejarlo creates dos columnas que dicen lo mismo, y la que no se usa deja de
-- ser cierta: alguien que edite la plantilla desde la base y marque
-- `requiere_supervisor = true` no cambiaría el comportamiento, porque el
-- sistema lee `firmas`. Dos fuentes de verdad para un dato que decide si el
-- papel es válido es peor que una sola. Se migra el dato y se elimina la
-- columna en la misma migración.
--
-- Re-runnable.
-- ============================================================

-- ------------------------------------------------------------
-- 1) EL LOGO
-- ------------------------------------------------------------
alter table public.plantillas_contratacion
  add column if not exists mostrar_logo boolean not null default false;

alter table public.plantillas_contratacion
  add column if not exists posicion_logo text not null default 'superior_izquierda';

alter table public.plantillas_contratacion
  add column if not exists tamano_logo int not null default 100;

-- SeDefine la lista de posiciones acá y no en la aplicación para que no
-- puedan divergir: la restricción es la misma que valida el formulario.
alter table public.plantillas_contratacion
  drop constraint if exists plantillas_posicion_logo;
alter table public.plantillas_contratacion
  add constraint plantillas_posicion_logo
  check (posicion_logo in (
    'superior_izquierda','superior_derecha',
    'inferior_izquierda','inferior_derecha'
  ));

alter table public.plantillas_contratacion
  drop constraint if exists plantillas_tamano_logo;
alter table public.plantillas_contratacion
  add constraint plantillas_tamano_logo
  check (tamano_logo between 30 and 250);

comment on column public.plantillas_contratacion.mostrar_logo is
  'Imprime el logo de la empresa (empresa.logo_url) en el papel. Si la empresa no tiene logo, el papel sale sin el.';

comment on column public.plantillas_contratacion.tamano_logo is
  'Ancho del logo en el papel, en porcentaje del ancho de la hoja.';

-- ------------------------------------------------------------
-- 2) LAS FIRMAS
-- ------------------------------------------------------------
alter table public.plantillas_contratacion
  add column if not exists firmas text not null default 'trabajador_supervisor';

alter table public.plantillas_contratacion
  drop constraint if exists plantillas_firmas;
alter table public.plantillas_contratacion
  add constraint plantillas_firmas
  check (firmas in ('ninguno','trabajador','trabajador_supervisor'));

comment on column public.plantillas_contratacion.firmas is
  'Quién firma el papel. "ninguno" es para las notificaciones internas, que no se firman.';

-- El dato que ya estaba se traslada antes de eliminar la columna vieja.
-- Se hace en dos pasos para que la migración se pueda volver a aplicar: si
-- `requiere_supervisor` ya no existe, no hay nada que trasladar.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'plantillas_contratacion'
       and column_name = 'requiere_supervisor'
  ) then
    execute $q$
      update public.plantillas_contratacion
         set firmas = case when requiere_supervisor
                          then 'trabajador_supervisor'
                          else 'trabajador' end
    $q$;
  end if;
end $$;

alter table public.plantillas_contratacion
  drop column if exists requiere_supervisor;

-- El tenant estaba solo implícito: se llegaba a la empresa por el trabajador.
-- Eso obliga a un join en cada consulta de entregas por empresa, y hace
-- imposible un índice de correlativo por empresa sin repetir el join dentro de
-- la expresión del índice. Se materializa la columna y se llena desde el
-- trabajador.
alter table public.entregas_contratacion
  add column if not exists empresa_id int;

update public.entregas_contratacion e
   set empresa_id = t.empresa_id
  from public.trabajadores t
 where t.code = e.trabajador_code
   and e.empresa_id is null
   and t.empresa_id is not null;

-- Quedan en NULL solo las entregas de trabajadores sin empresa asignada, que
-- es un dato sucio del contratante y no un problema de esta migración. Se
-- avisa con un NOTICE en vez de inventar un valor.
do $$
declare v_sin_empresa int;
begin
  select count(*) into v_sin_empresa
    from public.entregas_contratacion where empresa_id is null;
  if v_sin_empresa > 0 then
    raise notice 'ATENCION: % entrega(s) quedaron sin empresa_id porque su trabajador no tiene empresa asignada.', v_sin_empresa;
  end if;
end $$;

create index if not exists entregas_empresa_idx
  on public.entregas_contratacion (empresa_id, created_at desc);

comment on column public.entregas_contratacion.empresa_id is
  'Empresa a la que pertenece la entrega. Se copia del trabajador al guardar.';

-- ------------------------------------------------------------
-- 3) EL CORRELATIVO DE PAPEL
-- ------------------------------------------------------------
-- Va en la entrega, no en la plantilla: el número depende de cuántas entregas
-- hay, y una plantilla puede tener cien entregas.
--
-- Se numera por empresa y por tipo de plantilla, que es como se archivan.
alter table public.entregas_contratacion
  add column if not exists numero_papel bigint;

create unique index if not exists entregas_numero_papel_idx
  on public.entregas_contratacion (empresa_id, plantilla_code, numero_papel)
  where numero_papel is not null;

comment on column public.entregas_contratacion.numero_papel is
  'Correlativo del papel dentro de la empresa y la plantilla. Se asigna al generar.';

-- ------------------------------------------------------------
-- 4) LA FUNCIÓN DE FIRMA, QUE LEÍA LA COLUMNA QUE SE ELIMINÓ
-- ------------------------------------------------------------
-- Hay que reescribirla: si no, el `v_p.requiere_supervisor` deja de existir
-- y la función deja de compilar, que en una función es un error diferido que
-- aparece en la primera llamada y no en la migración.
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

  if v_p.version <> p_version then
    raise exception 'VERSION_CAMBIO|La plantilla "%" cambió de la versión % a la % mientras se firmaba. Cerrá el papel y abrilo de nuevo.',
      p_plantilla_code, p_version, v_p.version;
  end if;

  -- Una plantilla sin firmas no tiene nada que registrar. Antes se guardaba
  -- igual, con estado "incompleto" para siempre, y esas filas se acumulaban
  -- en el listado sin que nadie supiera por qué.
  if v_p.firmas = 'ninguno' then
    raise exception 'PLANTILLA_SIN_FIRMA|La plantilla "%" no pide firmas. Generala sin firmar, no la guardes.',
      p_plantilla_code using errcode = 'no_data_found';
  end if;

  v_estado := case
    when p_firma_trabajador is not null and p_firma_trabajador <> ''
      and (v_p.firmas = 'trabajador' or
           (p_firma_supervisor is not null and p_firma_supervisor <> ''))
      then 'completa'
    else 'incompleto'
  end;

  insert into public.entregas_contratacion as e (
    trabajador_code, plantilla_id, plantilla_code, plantilla_nombre, plantilla_version,
    empresa_id, datos,
    firma_trabajador, firmado_trabajador_at,
    generado_por, generado_por_nombre, generado_at, estado
  ) values (
    p_trabajador_code, v_p.id, v_p.code, v_p.nombre, v_p.version,
    -- Se copia del trabajador, no del usuario que firma: un administrador de
    -- RRHH con acceso a varias empresas firma en nombre de la empresa del
    -- trabajador, no en nombre de la suya.
    (select empresa_id from public.trabajadores where code = p_trabajador_code),
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
  if v_p.firmas = 'trabajador_supervisor'
     and nullif(p_firma_supervisor,'') is not null then
    update public.entregas_contratacion
       set firma_supervisor = p_firma_supervisor,
           firmado_supervisor_at = now(),
           estado = 'completa',
           updated_at = now()
     where id = v_id;
  end if;

  return v_id;
end $$;

-- ------------------------------------------------------------
-- 5) LA LISTA DEL KIT, QUE TAMBIEN LEIA LA COLUMNA QUE SE ELIMINO
-- ------------------------------------------------------------
-- Mismo caso que arriba, y es el mas grave de los dos: esta es la
-- funcion que arma la pantalla de contratacion de un trabajador. Si queda
-- rota, no se puede abrir el kit de nadie.
--
-- Ademas se le agrega la columna "firmas" y se saca "requiere_supervisor"
-- de la lista, para que la app sepa que firma cada papel sin tener que
-- deducirlo de un booleano. Un papel que firma solo el trabajador y uno
-- que firman los dos se comportan distinto en pantalla.
--
-- "drop function" antes del "create or replace": cambiar la lista de
-- columnas de retorno es cambiar el tipo, y Postgres responde
--   42P13: cannot change return type of existing function
drop function if exists public.kit_de_un_trabajador(text);

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
as $kt$
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
$kt$;

comment on function public.kit_de_un_trabajador(text) is
  'Los papeles que le tocan a un trabajador, con lo que ya firmó de cada uno y qué firma pide cada papel.';

grant execute on function public.kit_de_un_trabajador(text) to authenticated;

comment on function public.registrar_firma_contratacion(text, text, int, text, text, jsonb, boolean) is
  'Registra la firma de un papel del kit. Rechaza si la plantilla cambio de version mientras se firmaba.';

-- ------------------------------------------------------------
-- 5) EL DIAGNÓSTICO
-- ------------------------------------------------------------
-- Se agregan dos columnas para avisar cuando la 032 no está aplicada.
--
-- HAY QUE ELIMINARLA ANTES, no reemplazarla. "create or replace" no puede
-- cambiar el tipo de retorno de una función que ya existe, y agregar columnas
-- al `returns table` es exactamente eso. El error que sale es
-- "cannot change return type of existing function", que no dice qué
-- bloque de la migración está mal.
--
-- Es una función `stable` sin efectos: eliminarla y crearla de nuevo no
-- pierde nada y no deja nada a medias.
drop function if exists public.diagnostico_contratacion();

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
  sin_firma_trabajador bigint,
  tiene_logo boolean,
  tiene_firmas boolean
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
      where estado <> 'anulada' and firma_trabajador is null),
    (select count(*) > 0 from information_schema.columns
      where table_schema='public' and table_name='plantillas_contratacion'
        and column_name='mostrar_logo'),
    (select count(*) > 0 from information_schema.columns
      where table_schema='public' and table_name='plantillas_contratacion'
        and column_name='firmas')
$$;

comment on function public.diagnostico_contratacion() is
  'Estado del kit de contratacion: tablas, funciones, cuantas plantillas hay, cuantas estan vacias y cuantas entregas quedaron sin firma.';

select '032_logo_firmas' as migracion, tiene_logo, tiene_firmas from public.diagnostico_contratacion();
