
-- ===================================================================
-- 053: COLACIÓN POR DÍAS Y POR TURNO (2026-09-29)
-- ===================================================================
--
-- QUÉ FALTA
-- ----------
-- La 034 dejó la colación con dos cosas: la hora de inicio y la duración. Con
-- eso hay UNA colación para toda la empresa, todos los días, y todos los turnos.
--
-- Y eso no alcanza en tres casos que son la norma:
--
--   1. UNA OBRA COLACIONA DE LUNES A VIERNES. El sábado y el domingo no hay
--      colación, y con el modelo de hoy el fin de semana aparece con la
--      colación descontada. Alguien que acelera dos días de anticipo termina
--      con menos horas de las que trabajó, y el cálculo es correcto y el
--      resultado está mal.
--
--   2. HAY DOS TURNOS. El de la mañana colaciona a las 13:00 y el de la noche
--      a la 01:00. Con una sola hora, al segundo turno le toca la colación del
--      primero, que es una hora que no existe para esa gente.
--
--   3. LA COLACIÓN CAMBIA CON EL TURNO Y CON EL DÍA. En seasonally la semana
--      deScioli y la de verano no son iguales, y con un solo dato guardado no
--      hay forma de que las dos sean distintas.
--
-- -------------------------------------------------------------------
-- POR QUÉ UNA TABLA NUEVA Y NO MÁS COLUMNAS
-- -------------------------------------------
-- Porque "qué días" y "qué turno" no son una lista de siete y una lista de dos:
-- son un producto. La colación del turno de la noche del sábado es una fila, y
-- es distinta de la del turno de la mañana del sábado, y de la del turno de la
-- noche del lunes. Con columnas tendrías que guardar "dias_lunes boolean,
-- dias_martes boolean..." y "turno_noche_hora time, turno_noche_duracion int",
-- y a los tres turnos y los siete días son veintiuna combinaciones, y faltaría
-- una por cada una.
--
-- Con una tabla, la fila ES la combinación. Y agregar un turno nuevo no obliga a
-- cambiar el esquema.
--
-- -------------------------------------------------------------------
-- LO QUE NO SE BORRA
-- -------------------
-- La colacion_inicio y la colacion_duracion_min de la 034 SE QUEDAN. Son lo que
-- hay cargado ahora, y si esta migración los olvidara, las empresas que ya
-- tienen la colación cargada volverían a "no aplica".
--
-- Y la función de la 034 se sigue usando como respaldo: si no hay ninguna fila en
-- la tabla nueva, la colación es la de la 034, que es exactamente lo que había.
-- Así una empresa que no se toque sigue funcionando igual, y la tabla nueva
-- solo importa cuando alguien la llena.
-- ===================================================================

-- -------------------------------------------------------------------
-- 1) LOS TURNOS DE LA EMPRESA
-- -------------------------------------------------------------------
-- Antes que las colaciones, porque una colación es de un turno.
--
-- La clave es TEXTO y no un número, porque el turno se muestra en todas partes
-- y un "1" no dice nada en un informe. Y es por empresa, no global: la misma
-- empresa puede tener "AM" y "PM", y otra "M" y "N".
create table if not exists empresa_turnos (
  id            serial primary key,
  empresa_id    integer not null references public.empresa(id) on delete cascade,
  clave         text not null,
  nombre        text not null,
  -- La hora de entrada y de salida del turno. Nullable: hay turnos que solo se
  -- definen por la hora de la colación (un turno de colación a la 01:00 tiene
  -- entrada a las 20:00, pero eso se deduce de la duración, no hace falta
  -- guardarlo dos veces).
  hora_entrada  time,
  hora_salida   time,
  -- Si el turno pasa de medianoche. Sin esto, un turno de 20:00 a 06:00
  -- parece que sale a las 06:00, que es antes de que entre.
  cruza_medianoche boolean not null default false,
  orden         integer not null default 100,
  activo        boolean not null default true,
  creado_at     timestamptz not null default now(),
  constraint empresa_turnos_clave_unica unique (empresa_id, clave)
);

create index if not exists empresa_turnos_orden
  on empresa_turnos (empresa_id, activo, orden);

alter table empresa_turnos enable row level security;

comment on table public.empresa_turnos is
  'Turnos de una empresa. La colacion y el horario de marcaje se definen por turno, no por persona, porque el turno es lo que se pacta.';

-- -------------------------------------------------------------------
-- 2) LA COLACIÓN, POR DÍA Y POR TURNO
-- -------------------------------------------------------------------
-- Una fila es: este turno, este día de la semana, esta colación.
--
-- La semana va de 0 (domingo) a 6 (sábado), que es lo que devuelve
-- extract(dow) y no el ISO, porque el día que la gente tiene en la cabeza es el
-- del calendario.
--
-- Y el turno es NULL cuando la colación es la misma para todos. Un NULL en
-- turno no es "falta el dato": es "todos los turnos". Por eso el CHECK lo
-- permite, y por eso hay que mirar el turno con coalesce al consultar.
create table if not exists empresa_colaciones (
  id            serial primary key,
  empresa_id    integer not null references public.empresa(id) on delete cascade,
  -- NULL = la misma colación para todos los turnos de la empresa
  turno_id      integer references public.empresa_turnos(id) on delete cascade,
  dia_semana    smallint not null check (dia_semana between 0 and 6),
  inicio        time not null,
  duracion_min  integer not null,
  -- Si la colación se descuenta. Hay colaciones que existen (la persona tiene
  -- que ir) pero que no se pagan: un almuerzo de la propia empresa, por
  -- ejemplo. Guardar la hora sin esto obliga a tratar el caso aparte en cada
  -- reporte.
  se_descuenta   boolean not null default true,
  activo         boolean not null default true,
  creado_at      timestamptz not null default now(),
  constraint empresa_colaciones_minuto check (duracion_min between 0 and 240),
  -- La misma combinación no puede estar dos veces. Con el turno NULL, la
  -- combinación es (empresa, dia); con turno, es (empresa, turno, dia).
  constraint empresa_colaciones_una_vez
    unique nulls not distinct (empresa_id, turno_id, dia_semana)
);

create index if not exists empresa_colaciones_buscar
  on empresa_colaciones (empresa_id, dia_semana, activo);

alter table empresa_colaciones enable row level security;

-- -------------------------------------------------------------------
-- 3) EL TURNO EN EL TRABAJADOR
-- -------------------------------------------------------------------
-- on delete set null y no cascade: si se da de baja un turno, la gente que lo
-- tenía queda sin turno, no desaparece. Un trabajador sin turno es un dato
-- incompleto que se ve; un trabajador borrado es una pérdida.
--
-- Y es nullable a propósito: no todos trabajan por turnos. Un jefe de
-- supervisión, por ejemplo, no trabaja por turnos. Eso es un dato de la
-- persona, no un error en los datos.
alter table public.trabajadores
  add column if not exists turno_id integer references public.empresa_turnos(id) on delete set null;

create index if not exists trabajadores_turno_idx
  on public.trabajadores (turno_id)
  where turno_id is not null;

comment on column public.trabajadores.turno_id is
  'Turno del trabajador. NULL = no trabaja por turnos, que es una situacion real y no un dato faltante.';

-- -------------------------------------------------------------------
-- PERMISOS
-- -------------------------------------------------------------------
insert into permisos (clave, descripcion, categoria, orden) values
  ('turnos.ver',       'Ver los turnos de una empresa',             'asistencia', 170),
  ('turnos.gestionar',  'Crear turnos y definir la colacion',         'asistencia', 171)
on conflict (clave) do nothing;

-- -------------------------------------------------------------------
-- LAS FUNCIONES DE PERMISO, SELF-CONTAINED
-- -------------------------------------------------------------------
create or replace function public.es_usuario_activo(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from perfiles p where p.id = uid and p.activo) $$;

create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from perfil_roles r where r.user_id = uid and r.rol = 'admin') $$;

create or replace function public.tiene_permiso(clave text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from perfil_roles pr join roles_permisos rp on rp.rol = pr.rol
   where pr.user_id = uid and rp.permiso = clave ) $$;

-- ===================================================================
-- LAS PUERTAS
-- ===================================================================

-- -------------------------------------------------------------------
-- GUARDAR UN TURNO
-- -------------------------------------------------------------------
-- El nombre va PRIMERO y la clave después, aunque la clave sea la que se arma
-- sola. En PostgreSQL un parámetro con valor por omisión tiene que ir después
-- de todos los que no lo tienen, y el orden de los argumentos en una llamada
-- tiene que ser el que dice la declaración. Con el nombre primero, la llamada
-- se lee "un turno llamado mañana, con clave nula".
create or replace function public.guardar_turno(
  p_empresa_id integer,
  p_nombre    text,
  p_clave     text default null,
  p_entrada   time default null,
  p_salida    time default null,
  p_cruza     boolean default false,
  p_orden     integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    integer;
  v_clave text;
begin
  -- La puerta: activo Y con permiso. Con "o" entre las dos, que es como estaba
  -- en 046 y 047, la cuenta viva sola alcanza y el permiso no se pide.
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('turnos.gestionar'))) then
    raise exception 'No tienes permiso para definir los turnos'
      using errcode = '42501';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El turno necesita un nombre' using errcode = '22023';
  end if;

  -- El orden importa: minúsculas, después sin tildes, después lo que no sea
  -- letra o número. Al revés, la mayúscula inicial no está todavía en
  -- [a-z0-9] y se vuelve guion: "Mañana" daría "-añana".
  if p_clave is null or btrim(p_clave) = '' then
    v_clave := btrim(regexp_replace(
      translate(lower(btrim(p_nombre)), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn'),
      '[^a-z0-9]+', '-', 'g'), '-');
  else
    v_clave := btrim(lower(btrim(p_clave)), '-');
  end if;

  if v_clave = '' then
    raise exception 'Ese nombre no deja ninguna clave utilizable' using errcode = '22023';
  end if;

  -- Un turno que sale antes que entra solo tiene sentido si cruza la medianoche.
  -- Sin esa comprobación, "06:00 a 20:00" con la salida antes se guarda y el
  -- reporte arma un turno de 14 horas al revés.
  if p_entrada is not null and p_salida is not null
     and p_salida <= p_entrada and not coalesce(p_cruza, false) then
    raise exception 'La salida es antes que la entrada: si el turno pasa de medianoche, marcala'
      using errcode = '22023';
  end if;

  insert into empresa_turnos
    (empresa_id, clave, nombre, hora_entrada, hora_salida, cruza_medianoche, orden)
  values (p_empresa_id, v_clave, btrim(p_nombre), p_entrada, p_salida,
          coalesce(p_cruza, false), coalesce(p_orden, 100))
  on conflict (empresa_id, clave) do update
    set nombre            = excluded.nombre,
        hora_entrada      = excluded.hora_entrada,
        hora_salida       = excluded.hora_salida,
        cruza_medianoche  = excluded.cruza_medianoche,
        orden             = excluded.orden,
        activo            = true
  returning id into v_id;

  return v_id;
end;
$$;

-- -------------------------------------------------------------------
-- GUARDAR UNA COLACIÓN
-- -------------------------------------------------------------------
-- p_dias es la lista de días, como en la 051. Y el turno es NULL para "todos".
-- Igual que arriba: los que son de verdad (empresa, días, inicio, duración) van
-- primero, y los opcionales al final. p_turno_id es opcional porque NULL quiere
-- decir "todos los turnos", que es un valor y no una falta.
create or replace function public.guardar_colacion(
  p_empresa_id   integer,
  p_dias         smallint[],
  p_inicio       time,
  p_duracion_min integer,
  p_turno_id     integer default null,
  p_se_descuenta boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia  smallint;
  v_n    integer := 0;
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('turnos.gestionar'))) then
    raise exception 'No tienes permiso para definir la colacion'
      using errcode = '42501';
  end if;

  if p_inicio is null then
    raise exception 'Falta la hora de inicio de la colacion' using errcode = '22023';
  end if;
  if p_duracion_min is null or p_duracion_min < 0 or p_duracion_min > 240 then
    raise exception 'La duracion de la colacion va entre 0 y 240 minutos'
      using errcode = '22023';
  end if;

  if p_turno_id is not null
     and not exists (select 1 from empresa_turnos
                      where id = p_turno_id and empresa_id = p_empresa_id and activo) then
    raise exception 'Ese turno no existe en esta empresa' using errcode = '22023';
  end if;

  if p_dias is null or cardinality(p_dias) = 0 then
    raise exception 'Elige al menos un día' using errcode = '22023';
  end if;

  foreach v_dia in array p_dias loop
    if v_dia is null or v_dia < 0 or v_dia > 6 then continue; end if;
    insert into empresa_colaciones
      (empresa_id, turno_id, dia_semana, inicio, duracion_min, se_descuenta)
    values (p_empresa_id, p_turno_id, v_dia, p_inicio, p_duracion_min,
            coalesce(p_se_descuenta, true))
    on conflict (empresa_id, turno_id, dia_semana)
      do update set inicio       = excluded.inicio,
                    duracion_min = excluded.duracion_min,
                    se_descuenta = excluded.se_descuenta,
                    activo       = true;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- Se desactiva, no se borra. Una colación que se dejó de aplicar sigue siendo
-- un hecho: alguien la pactó y alguien la quitó.
create or replace function public.borrar_colacion(p_colacion_id integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('turnos.gestionar'))) then
    raise exception 'No tienes permiso para cambiar la colacion'
      using errcode = '42501';
  end if;
  update empresa_colaciones set activo = false where id = p_colacion_id;
  if not found then
    raise exception 'Esa colacion no existe' using errcode = '22023';
  end if;
end;
$$;

-- -------------------------------------------------------------------
-- LA COLACIÓN QUE APLICA
-- -------------------------------------------------------------------
-- La que el reporte tiene que usar, para un día y un turno.
--
-- Y AQUÍ ESTÁ EL RESPALDO DE LA 034: si no hay ninguna fila en la tabla nueva,
-- se devuelve la colación de la 034 con la fila de "para todos". Porque una
-- empresa que ya tenía la colación cargada y nunca toca la pantalla nueva tiene
-- que seguir saliendo igual. Perder la colación de una empresa por agregar una
-- tabla sería peor que no agregar la tabla.
--
-- El orden de búsqueda va de lo más específico a lo más general:
--   1. el turno Y el día
--   2. todos los turnos Y el día
--   3. el turno, sin importar el día
--   4. la 034, la de siempre
create or replace function public.colacion_de(
  p_empresa_id integer,
  p_dia        smallint default null,
  p_turno_id   integer default null
)
returns table (
  aplica          boolean,
  inicio          time,
  duracion_min    integer,
  termina         time,
  se_descuenta    boolean,
  origen          text,
  turno_clave     text,
  turno_nombre    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dia          smallint := coalesce(p_dia, (extract(dow from current_date))::smallint);
  -- Escalares, no records. Un record sin valor no se puede leer, y asignarle
  -- NULL a veces no alcanza porque el motor sigue diciendo que no se le puso
  -- nada. Y con escalares hay que nombrar cada dato, así que un error sale en la
  -- línea donde está escrito y no en el SELECT de abajo.
  v_id           integer := null;
  v_turno        integer := null;
  v_inicio       time    := null;
  v_duracion     integer := null;
  v_descuenta    boolean := true;
  v_tclave       text    := null;
  v_tnombre      text    := null;
  v_aplica       boolean := false;
  v_034_inicio   time    := null;
  v_034_duracion integer := null;
begin
  -- 1: la fila de la tabla nueva, la más específica: este turno y este día
  select c.id, c.inicio, c.duracion_min, c.se_descuenta
    into v_id, v_inicio, v_duracion, v_descuenta
    from empresa_colaciones c
   where c.empresa_id = p_empresa_id
     and c.activo
     and c.dia_semana = v_dia
     and p_turno_id is not null
     and c.turno_id = p_turno_id
   limit 1;

  -- 2: la de todos los turnos para este día
  if v_id is null then
    select c.id, c.inicio, c.duracion_min, c.se_descuenta
      into v_id, v_inicio, v_duracion, v_descuenta
      from empresa_colaciones c
     where c.empresa_id = p_empresa_id
       and c.activo
       and c.dia_semana = v_dia
       and c.turno_id is null
     limit 1;
  end if;

  if v_id is not null then
    -- El nombre del turno, si se pidió uno
    if p_turno_id is not null then
      select tt.clave, tt.nombre into v_tclave, v_tnombre
        from empresa_turnos tt where tt.id = p_turno_id;
    end if;
    return query select true, v_inicio, v_duracion,
                        colacion_termina(v_inicio, v_duracion),
                        v_descuenta, 'tabla'::text, v_tclave, v_tnombre;
    return;
  end if;

  -- 3: la de siempre, la 034. Y aquí está el respaldo que hace que agregar esta
  -- tabla no le haga perder la colación a ninguna empresa que ya la tenía.
  select e.colacion_inicio, e.colacion_duracion_min
    into v_034_inicio, v_034_duracion
    from empresa e
   where e.id = p_empresa_id;

  v_aplica := v_034_inicio is not null;
  return query select v_aplica, v_034_inicio, v_034_duracion,
                      colacion_termina(v_034_inicio, v_034_duracion),
                      true, 'empresa'::text, null::text, null::text;
end;
$$;

-- -------------------------------------------------------------------
-- LOS TURNOS DE UNA EMPRESA, PARA LA PANTALLA
-- -------------------------------------------------------------------
create or replace function public.ver_turnos(p_empresa_id integer)
returns table (
  turno_id       integer,
  clave          text,
  nombre         text,
  hora_entrada   time,
  hora_salida    time,
  cruza_medianoche boolean,
  orden          integer,
  n_personas     integer,
  colaciones     text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.clave, t.nombre, t.hora_entrada, t.hora_salida,
         t.cruza_medianoche, t.orden,
         (select count(*)::integer from trabajadores w where w.turno_id = t.id),
         -- El nombre del día se traduce acá y no con una columna: una columna
         -- "dia_nombre" sería el mismo dato guardado dos veces, y el día de la
         -- semana no cambia nunca.
         (select string_agg(
                    case d.dia_semana
                      when 0 then 'Dom' when 1 then 'Lun' when 2 then 'Mar'
                      when 3 then 'Mié' when 4 then 'Jue' when 5 then 'Vie'
                      else 'Sáb' end
                    || ' ' || to_char(d.inicio,'HH24:MI'), ', ' order by d.dia_semana)
            from empresa_colaciones d
           where d.turno_id = t.id and d.activo
             and d.se_descuenta)
    from empresa_turnos t
   where t.empresa_id = p_empresa_id and t.activo
   order by t.orden, t.nombre
$$;

-- -------------------------------------------------------------------
-- DIAGNÓSTICO
-- -------------------------------------------------------------------
create or replace function public.diagnostico_turnos()
returns table (
  tabla_turnos      boolean,
  tabla_colaciones  boolean,
  rls_turnos        boolean,
  rls_colaciones    boolean,
  col_turno_trab    boolean,
  empresas_con_turnos integer,
  empresas_con_colacion_nueva integer,
  empresas_siguen_con_034   integer,
  permiso_gestionar boolean
)
language sql
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='empresa_turnos'),
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='empresa_colaciones'),
    coalesce((select relrowsecurity from pg_class
               where oid='public.empresa_turnos'::regclass), false),
    coalesce((select relrowsecurity from pg_class
               where oid='public.empresa_colaciones'::regclass), false),
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='trabajadores'
               and column_name='turno_id'),
    (select count(distinct empresa_id)::integer from empresa_turnos),
    (select count(distinct empresa_id)::integer from empresa_colaciones where activo),
    -- Las que tienen la colación de siempre y todavía no usaron la nueva.
    -- No es un error: es la lista de las que falta migrar a la pantalla.
    (select count(*)::integer from empresa
      where colacion_inicio is not null
        and not exists (select 1 from empresa_colaciones c
                         where c.empresa_id = empresa.id and c.activo)),
    exists (select 1 from permisos where clave='turnos.gestionar')
$$;

grant execute on function public.guardar_turno(integer,text,text,time,time,boolean,integer) to authenticated;
grant execute on function public.guardar_colacion(integer,smallint[],time,integer,integer,boolean) to authenticated;
grant execute on function public.borrar_colacion(integer) to authenticated;
grant execute on function public.colacion_de(integer,smallint,integer) to authenticated;
grant execute on function public.ver_turnos(integer) to authenticated;
grant execute on function public.diagnostico_turnos() to authenticated;
