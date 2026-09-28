-- ============================================================
-- Migración 029: desvinculación con artículo, fecha de término y bitácora
-- ============================================================
-- POR QUÉ
--
-- Hoy "desvincular" pone la fecha de HOY en `fecha_desvinculacion` y ya.
-- Eso está mal para el caso que más se da: una persona que se fue hace
-- meses y la ficha quedó abierta. Al desvincularla hoy, el sistema pasa a
-- decir que terminó hoy, y la planilla de los meses en que todavía
-- trabajaba queda con una baja en la fecha equivocada.
--
-- Y al ordenar un plano de obras aparece la ficha repetida: la misma
-- persona cargada dos veces, una con la asistencia del año pasado y otra
-- nueva. Para cerrar la vieja falta poder decir QUÉ PASÓ: el artículo del
-- Código del Trabajo que se usó y la fecha en que realmente terminó.
--
-- EL ARTÍCULO
--
-- Es un dato que se ANOTA, no que la aplicación pueda calcular. El artículo
-- lo elige una persona que lo conoce, según lo que se aplicó. La lista
-- desplegable es una ayuda, no una validación: el campo acepta cualquier
-- texto para que no quede un caso real sin poder registrarlo.
--
-- LA FECHA DE TÉRMINO
--
-- Aparte de `fecha_desvinculacion` (cuándo se hizo clic en el botón, que
-- es un dato del sistema) y de `fecha_termino` (cuándo terminó el
-- contrato, que es el dato laboral). Son cosas distintas y se guardan
-- las dos: sin las dos, no se puede saber después si alguien cerró una
-- ficha vieja hoy o si hoy de verdad se fue.
--
-- Re-runnable. Todos los objetos se crean con "if not exists" o con
-- "create or replace".
-- ============================================================

-- ------------------------------------------------------------
-- 1) COLUMNAS NUEVAS
-- ------------------------------------------------------------
alter table public.trabajadores add column if not exists fecha_termino date;
alter table public.trabajadores add column if not exists articulo_termino text;
alter table public.trabajadores add column if not exists motivo_desvinculacion text;
alter table public.trabajadores add column if not exists desvinculado_por uuid references public.perfiles(id) on delete set null;
alter table public.trabajadores add column if not exists desvinculado_por_nombre text;
alter table public.trabajadores add column if not exists desvinculado_at timestamptz;

comment on column public.trabajadores.fecha_termino is
  'Fecha en que termino el contrato. Distinta de fecha_desvinculacion, que es cuando se hizo el clic en la app.';
comment on column public.trabajadores.articulo_termino is
  'Articulo del Codigo del Trabajo que se aplico. Lo elige una persona; la app no lo valida.';

-- Lo que ya estaba desvinculado se completa con la fecha que se usó
-- entonces, para que el listado no aparezca con la fecha vacía. Es un dato
-- aproximado: puede no ser el día exacto en que terminó, y por eso el
-- artículo NO se inventa, que eso sí no se puede saber.
update public.trabajadores
   set fecha_termino = fecha_desvinculacion
 where fecha_termino is null
   and fecha_desvinculacion is not null;

-- El índice que hace falta para la búsqueda del listado cuando se filtra
-- por estado y se ordena por fecha de término.
create index if not exists trabajadores_fecha_termino_idx
  on public.trabajadores(fecha_termino);

-- ------------------------------------------------------------
-- 2) BITÁCORA DE DESVINCULACIONES
-- ------------------------------------------------------------
-- Desvincular a alguien saca a una persona de la asistencia del mes. Eso
-- es un cambio de la planilla, y por la misma razón que se bitacora la
-- asistencia (migración 028), queda anotado quién lo hizo y por qué.
--
-- A diferencia de la asistencia, SÍ se puede deshacer: revivir a un
-- trabajador es una corrección de un error de carga, y dejar rastro de
-- los errores es justamente el objetivo. Por eso esta tabla tiene
-- UPDATE permitido: lo que no se puede es borrar la traza.
create table if not exists public.desvinculaciones (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  nombre text,
  accion text not null check (accion in ('desvincula','revive')),
  fecha_termino date,
  fecha_desvinculacion date,
  articulo_termino text,
  motivo text not null check (length(btrim(motivo)) >= 5),
  usuario_id uuid,
  usuario_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists desvinculaciones_code_idx
  on public.desvinculaciones(code, created_at desc);
create index if not exists desvinculaciones_created_idx
  on public.desvinculaciones(created_at desc);

comment on table public.desvinculaciones is
  'Bitacora de altas y bajas de trabajadores. Se puede deshacer una desvinculacion, pero la traza no se borra.';

alter table public.desvinculaciones enable row level security;

drop policy if exists "desvinculaciones lectura" on public.desvinculaciones;
create policy "desvinculaciones lectura" on public.desvinculaciones for select
  using (public.tiene_permiso('trabajadores.ver'));

-- Se puede insertar (por la función de abajo) y no se puede borrar ni
-- cambiar una traza que ya está escrita.
revoke delete on public.desvinculaciones from authenticated, anon;
revoke insert on public.desvinculaciones from authenticated, anon;

-- ------------------------------------------------------------
-- 3) LA FUNCIÓN QUE USA LA APP
-- ------------------------------------------------------------
-- Por RPC y no con un update suelto por dos razones: el motivo es
-- obligatorio y tiene que comprobarlo la base, y la escritura en la
-- bitácora tiene que pasar en la misma transacción que el cambio. Si se
-- hicieran por separado, un error en el medio deja al trabajador
-- desvinculado sin que quede dicho por qué.
create or replace function public.desvincular_trabajador(
  p_code text,
  p_fecha_termino date,
  p_articulo text,
  p_motivo text,
  p_revivir boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w public.trabajadores%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_articulo text := nullif(btrim(coalesce(p_articulo, '')), '');
  v_nombre text;
  v_uid uuid := auth.uid();
  v_ya_era text;
begin
  select * into v_w from public.trabajadores where code = p_code for update;
  if not found then
    raise exception 'No existe un trabajador con el codigo %', p_code
      using errcode = 'no_data_found';
  end if;

  if length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la desvinculacion (al menos 5 caracteres). Queda registrado.'
      using errcode = 'check_violation';
  end if;

  v_ya_era := v_w.status;
  v_nombre := v_w.name;

  if p_revivir then
    -- Revivir es un error de carga. No cambia la fecha de término: la
    -- persona nunca dejó de trabajar hasta que se diga lo contrario, y
    -- cambiar la fecha dejaría la asistencia de meses con un hueco.
    update public.trabajadores
       set status = 'activo',
           fecha_termino = null,
           articulo_termino = null,
           motivo_desvinculacion = null,
           desvinculado_por = null,
           desvinculado_por_nombre = null,
           desvinculado_at = null,
           updated_at = now()
     where code = p_code;
  else
    if p_fecha_termino is null then
      raise exception 'Falta la fecha de termino. Sin ella la planilla quedaria con la baja en la fecha de hoy, que puede ser incorrecta.'
        using errcode = 'check_violation';
    end if;
    if p_fecha_termino > current_date then
      raise exception 'La fecha de termino no puede ser futura (pide %; hoy es %)', p_fecha_termino, current_date
        using errcode = 'check_violation';
    end if;
    -- Avisar, no impedir. Puede ser legítimo (un carta de desistimiento
    -- con fecha retroactiva) y lo decide una persona, no la base.
    if v_ya_era = 'desvinculado' and v_w.fecha_termino is not null
       and v_w.fecha_termino <> p_fecha_termino then
      raise notice 'Esta ficha ya estaba desvinculada con fecha de termino %; se cambia a %',
        v_w.fecha_termino, p_fecha_termino;
    end if;

    update public.trabajadores
       set status = 'desvinculado',
           fecha_termino = p_fecha_termino,
           articulo_termino = v_articulo,
           motivo_desvinculacion = v_motivo,
           fecha_desvinculacion = current_date,
           desvinculado_por = v_uid,
           desvinculado_por_nombre = (select nombre from public.perfiles where id = v_uid),
           desvinculado_at = now(),
           updated_at = now()
     where code = p_code;
  end if;

  insert into public.desvinculaciones (
    code, nombre, accion,
    fecha_termino, fecha_desvinculacion, articulo_termino, motivo,
    usuario_id, usuario_nombre
  ) values (
    p_code, v_nombre,
    case when p_revivir then 'revive' else 'desvincula' end,
    case when p_revivir then null else p_fecha_termino end,
    case when p_revivir then null else current_date end,
    case when p_revivir then null else v_articulo end,
    v_motivo, v_uid, (select nombre from public.perfiles where id = v_uid)
  );
  return true;
end $$;

comment on function public.desvincular_trabajador(text, date, text, text, boolean) is
  'Desvincula o revive a un trabajador, exigiendo fecha de termino, articulo y motivo, y dejando bitacora.';

-- ------------------------------------------------------------
-- 4) DIAGNÓSTICO
-- ------------------------------------------------------------
create or replace function public.diagnostico_desvinculacion()
returns table (
  columnas_puestas boolean,
  bitacora_existe boolean,
  funcion_existe boolean,
  desvinculados_sin_fecha bigint,
  fichas_duplicadas_activas bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) = 3 from information_schema.columns
      where table_schema = 'public' and table_name = 'trabajadores'
        and column_name in ('fecha_termino','articulo_termino','motivo_desvinculacion')),
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'desvinculaciones'),
    exists (select 1 from pg_proc
             where proname = 'desvincular_trabajador' and pronamespace = 'public'::regnamespace),
    -- fichas desvinculadas viejas que todavía no tienen fecha de término: son
    -- las que hay que revisar una a una
    (select count(*) from public.trabajadores
      where status = 'desvinculado' and fecha_termino is null),
    -- nombres repetidos entre fichas ACTIVAS: ahí sí hay algo que hacer
    (select count(*) from (
       select lower(btrim(name))
         from public.trabajadores
        where status = 'activo' and coalesce(btrim(name),'') <> ''
        group by lower(btrim(name))
       having count(*) > 1
     ) d)
$$;

comment on function public.diagnostico_desvinculacion() is
  'Estado de la desvinculacion con articulo y fecha: que falta, cuantas fichas quedan sin fecha y cuantos nombres repetidos hay entre las activas.';

select * from public.diagnostico_desvinculacion();
