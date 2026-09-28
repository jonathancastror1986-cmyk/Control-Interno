-- ============================================================
-- Migración 034: horario de colación en los datos de la empresa
-- ============================================================
-- QUÉ FALTA
--
-- El formulario de empresa tiene la hora de entrada y la tolerancia, pero
-- no tiene la colación. Sin ella no se puede calcular la jornada, y la
-- jornada es justamente lo que se paga.
--
-- POR QUÉ "HORA DE INICIO" Y "DURACIÓN", Y NO DESDE Y HASTA
-- ----------------------------------------------------------
-- La Resolución Exenta 38/2024 pide en el reporte de jornada diaria una
-- columna de colación con el formato "13:00:00 - 14:00:00" (art. 27 b)5).
-- Es decir, hace falta el TRAMO. Pero se configura con hora de inicio y
-- duración porque es lo que se pacta: "colación a las 13:00 por media
-- hora". El tramo se calcula.
--
-- Y hay una razón práctica: si alguien pide colación de 45 minutos en vez
-- de 30, con un solo campo se corrige; con dos, hay que acertar el cálculo a
-- mano. Un dato de más es un dato que hay que mantener.
--
-- POR QUÉ LA COLACIÓN ESTÁ EN LA EMPRESA Y NO EN CADA TRABAJADOR
-- -------------------------------------------------------------
-- Porque en una obra la colación la pacta la empresa, no cada persona. El
-- artículo 34 del Código del Trabajo fija un mínimo de media hora para
-- todos, y lo que se pacta por encima es materia de la relación laboral
-- con quien lo pactó.
--
-- Ponerla en el trabajador obligaría a escribirla 46 veces y a corregirla 46
-- veces. Si un día cambia para toda la obra, se cambia en un solo lugar.
--
-- Re-runnable.
-- ============================================================

-- ------------------------------------------------------------
-- 1) LAS COLUMNAS
-- ------------------------------------------------------------
alter table public.empresa
  add column if not exists colacion_inicio time;

alter table public.empresa
  add column if not exists colacion_duracion_min int not null default 30;

-- El rango va de 0 a 240 minutos. Más de 4 horas de colación ya no es una
-- colación: es una jornada partida, que es otra figura (art. 34 bis del
-- Código del Trabajo, para restaurantes, hoteles y clubes).
alter table public.empresa
  drop constraint if exists empresa_colacion_duracion_min;
alter table public.empresa
  add constraint empresa_colacion_duracion_min
  check (colacion_duracion_min between 0 and 240);

comment on column public.empresa.colacion_inicio is
  'Hora de inicio de la colacion. NULL = la empresa no controla la colacion, y el reporte debe decir "No aplica" (art. 27 b)6 de la Resolucion Exenta 38/2024).';
comment on column public.empresa.colacion_duracion_min is
  'Duracion de la colacion en minutos. Se guarda la duracion y no el fin porque es lo que se pacta; el fin se calcula.';

-- ------------------------------------------------------------
-- 2) EL FIN DE LA COLACIÓN, CALCULADO
-- ------------------------------------------------------------
-- Va en la base y no en la pantalla porque lo necesitan el reporte, la
-- planilla y el cálculo de horas, que son tres lugares distintos. Si cada
-- uno lo calculara, el día que cambie la regla los tres quedan distintos.
create or replace function public.colacion_termina(
  p_inicio time,
  p_duracion_min int
)
returns time
language sql
immutable
as $$
  -- `p_inicio` es `time` y Postgres no lo castea a `timestamp` directo:
  -- hay que anclarlo en un dia. Se usa el ancla '2000-01-01', que es
  -- una fecha cualquiera, porque aca no importa el dia: lo que importa
  -- es la aritmetica de horas.
  --
  -- El cast a `time` hace el recorte del dia. Postgres NO tiene el
  -- operador `%` entre timestamp e interval (solo existe para `date` y
  -- para numeros), asi que restar el dia con `date_trunc` seria lo
  -- correcto pero mas largo: el cast a time ya se queda con la parte
  -- del dia y por lo tanto una colacion que pasa de la medianoche
  -- vuelve a las horas que corresponden, en vez de devolver un 25:30:00.
  select case
    when p_inicio is null then null
    else (
      -- La fecha va PRIMERO. '2000-01-01 13:00:00' es un timestamp
      -- valido; al reves, '13:00:00 2000-01-01' no lo es y Postgres
      -- responde:
      --   invalid input syntax for type timestamp: "13:00:00 2000-01-01"
      -- que no dice que el problema es el orden de las dos partes.
      ('2000-01-01 ' || p_inicio::text)::timestamp
      + make_interval(mins => coalesce(p_duracion_min, 0))
    )::time
  end
$$;

comment on function public.colacion_termina(time, int) is
  'Hora de termino de la colacion. Se usa el modulo de 24 horas para que una colacion que pasa de medianoche no devuelva una hora invalida.';

grant execute on function public.colacion_termina(time, int) to authenticated;

-- La colacion de la empresa, ya con el tramo calculado. Es la forma en que
-- la consume el resto del sistema: una fila, con la hora, la duracion y el
-- fin.
create or replace function public.colacion_de_empresa(p_empresa_id int)
returns table (
  aplica boolean,
  inicio time,
  duracion_min int,
  termina time,
  texto text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.colacion_inicio is not null,
    e.colacion_inicio,
    e.colacion_duracion_min,
    public.colacion_termina(e.colacion_inicio, e.colacion_duracion_min),
    -- El texto tal como lo pide el reporte: "13:00:00 - 13:30:00".
    -- Con to_char y no con concatenacion, porque to_char le pone los dos
    -- puntos a la hora, que es justo lo que exige el formato del art. 27 b)5.
    case when e.colacion_inicio is null then 'No aplica'
         else to_char(e.colacion_inicio, 'HH24:MI:SS') || ' - '
              || to_char(public.colacion_termina(e.colacion_inicio, e.colacion_duracion_min), 'HH24:MI:SS')
    end
  from public.empresa e
  where e.id = p_empresa_id
$$;

comment on function public.colacion_de_empresa(int) is
  'La colacion de la empresa con el tramo ya calculado y el texto en el formato del reporte.';

grant execute on function public.colacion_de_empresa(int) to authenticated;

-- ------------------------------------------------------------
-- 3) DIAGNÓSTICO
-- ------------------------------------------------------------
drop function if exists public.diagnostico_colacion();

create or replace function public.diagnostico_colacion()
returns table (
  columnas boolean,
  fn_termina boolean,
  fn_empresa boolean,
  empresas_con_colacion bigint,
  empresas_sin_colacion bigint,
  duracion_invalida bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) = 2 from information_schema.columns
      where table_schema='public' and table_name='empresa'
        and column_name in ('colacion_inicio','colacion_duracion_min')),
    exists (select 1 from pg_proc where proname='colacion_termina'
             and pronamespace='public'::regnamespace),
    exists (select 1 from pg_proc where proname='colacion_de_empresa'
             and pronamespace='public'::regnamespace),
    (select count(*) from public.empresa where colacion_inicio is not null),
    (select count(*) from public.empresa where colacion_inicio is null),
    -- No puede dar positivo por la restriccion, pero el diagnostico sirve
    -- para una base donde la columna se agrego a mano sin la restriccion.
    (select count(*) from public.empresa
      where colacion_duracion_min is null
         or colacion_duracion_min < 0
         or colacion_duracion_min > 240)
$$;

comment on function public.diagnostico_colacion() is
  'Estado del horario de colacion: si las columnas y las funciones estan, cuantas empresas lo tienen cargado y cuantas no.';

select '034_colacion' as migracion, columnas, empresas_con_colacion, empresas_sin_colacion
  from public.diagnostico_colacion();
