
-- ===================================================================
-- 052: HORARIO DE SALIDA, COLACIÓN Y HORARIOS DE MARCAJE (2026-09-29)
-- ===================================================================
--
-- QUÉ FALTA HOY
-- -------------
-- La empresa tiene hora de entrada y tolerancia. No tiene hora de salida, y
-- sin hora de salida el atraso se puede medir y la salida no: el sistema sabe
-- que alguien llegó tarde y no sabe si se fue a tiempo o se quedó tres horas
-- de más.
--
-- La colación YA EXISTE en la base desde la 034 (colacion_inicio y
-- colacion_duracion_min) y no está en ninguna pantalla. No es un campo nuevo:
-- es un campo que se escribió en una migración y se quedó a medias.
--
-- Y no hay forma de decir que un relojes solo marca entre las 7 y las 19.
--
-- -------------------------------------------------------------------
-- POR QUÉ UN ENVOLTORIO Y NO TOCAR marcar_por_reloj
-- -------------------------------------------------
-- La función que registra el marcaje es la que está en producción, la que
-- usan todos los relojes, y la que ha probado la portería. Agregarle el
-- control de horario significa reescribir su cuerpo entero, y un cambio ahí
-- se nota en el momento en que alguien está marcando.
--
-- Así que no se toca. La 052 mete una función ARRIBA: revisa el horario, y
-- si deja pasar, llama a la de siempre. El cambio es aditivo y la función
-- vieja sigue ahí, igual, para cuando haya que dar atrás.
--
-- -------------------------------------------------------------------
-- EL BLOQUEO NO SE ACTIVA SOLO
-- -----------------------------
-- Hay un interruptor por relojes, y empieza en falso. Poner ventanas
-- definidas y que de golpe la portería empiece a rechazar marcajes, sin que
-- nadie lo haya pedido, es la forma de que la primera vez que alguien pase la
-- tarjeta a las 19:30 se la rechace y no sepa por qué. Se define el horario,
-- se revisa, y después se enciende.
--
-- Y cuando está encendido, el marcaje NO SE PIERDE: se registra con resultado
-- "fuera_de_horario". Queda en la base, se ve en el historial, y es el
-- supervisor quien decide. Borrar el marcaje sería peor que aceptarlo: la
-- persona estuvo ahí, y que conste que estuvo es parte del registro.
-- ===================================================================

-- -------------------------------------------------------------------
-- 1) LA HORA DE SALIDA, QUE FALTABA
-- -------------------------------------------------------------------
-- time y no timestamptz porque es una hora del día, no un momento. Un turno
-- que termina a las 23:59 y uno a las 00:01 son turnos distintos, y con
-- timestamptz no se podría decir eso.
alter table public.empresa
  add column if not exists hora_salida time;

comment on column public.empresa.hora_salida is
  'Hora de salida pactada. NULL = no se controla la hora de salida, y el reporte no debe inventar una.';

-- Que la salida no sea antes que la entrada. Salida 07:00 con entrada 08:00
-- es casi siempre un error de tipeo, y si no se atrapa acá se convierte en
-- "salió 23 horas antes de entrar" en todos los reportes.
alter table public.empresa
  drop constraint if exists empresa_horario_salida_despues;
alter table public.empresa
  add constraint empresa_horario_salida_despues
  check (hora_salida is null or hora_entrada is null or hora_salida > hora_entrada);

-- -------------------------------------------------------------------
-- 2) EL INTERRUPTOR DEL RELOJ
-- -------------------------------------------------------------------
alter table public.relojes
  add column if not exists bloquear_fuera_horario boolean not null default false;

comment on column public.relojes.bloquear_fuera_horario is
  'Si es true, marcar_por_reloj_controlado() devuelve fuera_de_horario en vez de registrar. Empieza en false a proposito: definir ventanas no debe empezar a rechazar marcajes sin que nadie lo decida.';

-- -------------------------------------------------------------------
-- 3) LAS FRANJAS
-- -------------------------------------------------------------------
-- Una fila es una franja, de un día de la semana, para un relojes.
--
-- "desde" y "hasta" pueden dar la vuelta a medianoche: un turno de noche es
-- de 20:00 a 06:00, y con hasta > desde no se podría escribir. Por eso NO hay
-- un CHECK que prohíba que hasta sea menor que desde; al revés, esa es la
-- forma de escribir un turno de noche, y la función lo lee con aritmética de
-- 24 horas.
create table if not exists reloj_horarios (
  -- id propio, como el resto de las tablas del programa. La clave natural de
  -- abajo sirve para no duplicar la misma franja, pero la fila necesita su
  -- propia id: sin ella no hay forma de decir "quita ESTA franja" desde la
  -- pantalla, porque una franja es (reloj, día, desde) y el "desde" solo no
  -- la identifica entre las de entrada y las de salida.
  id          uuid primary key default gen_random_uuid(),
  reloj_id    uuid not null references public.relojes(id) on delete cascade,
  -- 0 = domingo, 6 = sábado. Es el mismo número que devuelve extract(dow) en
  -- Postgres, y no el ISO: el día de la semana que importa aquí es el del
  -- calendario, que es donde la gente piensa "el lunes".
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  desde      time not null,
  hasta      time not null,
  -- 'ambos' acepta entrada y salida; 'entrada' y 'salida' solo una de las
  -- dos. Un relojes de una obra con turno de día puede aceptar entradas hasta
  -- las 11 y salidas hasta las 20, y con una sola ventana no se puede.
  tipo       text not null default 'ambos' check (tipo in ('ambos','entrada','salida')),
  -- Por qué existe esta franja. Con el bloqueo prendido, esto es lo que va a
  -- leer el supervisor cuando pregunte por qué se rechazó un marcaje.
  motivo     text,
  activo     boolean not null default true,
  creado_at  timestamptz not null default now(),
  creado_por uuid,
  -- La natural va como restricción única y no como clave primaria: la
  -- primaria es el id de arriba, que es lo que se usa para quitar una franja.
  unique (reloj_id, dia_semana, desde, tipo)
);

create index if not exists reloj_horarios_lookup
  on reloj_horarios (reloj_id, dia_semana, activo)
  where activo;

alter table reloj_horarios enable row level security;

-- -------------------------------------------------------------------
-- 4) PERMISOS
-- -------------------------------------------------------------------
insert into permisos (clave, descripcion, categoria, orden) values
  ('relojes.horario',   'Definir los horarios de marcaje de los relojes', 'asistencia', 160),
  ('relojes.horario.ver','Ver si un relojes está dentro o fuera de horario',  'asistencia', 161)
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
-- ¿ESTÁ ABIERTO AHORA?
-- -------------------------------------------------------------------
-- Esta es la que usa la pantalla del tótem antes de que la persona acerque la
-- tarjeta, y la que decide el marcaje. Sale de una sola consulta para las dos,
-- para que no puedan discrepar: si la pantalla dice "abierto" y el marcaje
-- dice "fuera de horario", la persona cree que el sistema está roto.
--
-- CUANDO NO HAY NINGUNA FRANJA DEFINIDA, ABRE
-- --------------------------------------------
-- Un relojes sin franjas configurados no bloquea nunca. Es lo contrario de lo
-- que parece: un sistema nuevo, o un relojes recién agregado, tiene que poder
-- marcar desde el primer día. Y "no configurado" y "cerrado las 24 horas" no
-- pueden ser la misma cosa.
create or replace function public.reloj_horario(
  p_reloj_code text,
  p_cuando     timestamptz default now(),
  p_tipo       text default 'ambos'
)
returns table (
  reloj_code      text,
  bloquea         boolean,
  abierto         boolean,
  hay_horario    boolean,
  detalle         text,
  franja_desde    time,
  franja_hasta    time,
  motivo          text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reloj   record;
  v_dow     smallint;
  v_hora    time;
  v_tipo    text;
  v_tiene   integer;
  v_ok      record;
begin
  v_dow  := extract(dow from coalesce(p_cuando, now()))::smallint;
  v_hora := (coalesce(p_cuando, now()))::time;
  v_tipo := case when p_tipo in ('entrada','salida') then p_tipo else 'ambos' end;

  select r.code, r.bloquear_fuera_horario
    into v_reloj
    from relojes r where r.code = p_reloj_code;
  if v_reloj is null then
    return query select p_reloj_code, false, false, false,
                        'Ese reloj no existe', null::time, null::time, null::text;
    return;
  end if;

  select count(*) into v_tiene
    from reloj_horarios h
   where h.reloj_id = (select id from relojes where code = p_reloj_code)
     and h.activo;

  -- Sin franjas, o con el interruptor apagado: siempre se puede marcar
  if v_tiene = 0 or not coalesce(v_reloj.bloquear_fuera_horario, false) then
    return query select p_reloj_code, false, true, v_tiene > 0,
                        case when v_tiene = 0
                             then 'Este reloj no tiene horarios definidos: marca a cualquier hora.'
                             else 'El bloqueo está apagado en este reloj.' end,
                        null::time, null::time, null::text;
    return;
  end if;

  -- La franja que cubre ahora. Se comparan en minutos desde medianoche, y una
  -- ventana que da la vuelta (hasta < desde) se reconoce porque la hora actual
  -- cae en las dos puntas.
  select h.desde, h.hasta, h.motivo into v_ok
    from reloj_horarios h
   where h.reloj_id = (select id from relojes where code = p_reloj_code)
     and h.activo
     and h.dia_semana = v_dow
     and (h.tipo = 'ambos' or h.tipo = v_tipo)
     and (
       -- ventana normal: desde <= ahora < hasta
       (h.hasta > h.desde and v_hora >= h.desde and v_hora < h.hasta)
       -- ventana que pasa de medianoche
       or (h.hasta <= h.desde and (v_hora >= h.desde or v_hora < h.hasta))
     )
   order by h.desde
   limit 1;

  if v_ok is not null then
    return query select p_reloj_code, true, true, true,
                        'Dentro del horario de este relojes', v_ok.desde, v_ok.hasta, v_ok.motivo;
  else
    return query select p_reloj_code, true, false, true,
                        'Este reloj no está marcando a esta hora', null::time, null::time, null::text;
  end if;
end;
$$;

-- -------------------------------------------------------------------
-- DEFINIR Y QUITAR FRANJAS
-- -------------------------------------------------------------------
-- Un relojes de más se quita de la lista con activo=false y no se borra: la
-- franja dice que hubo un horario en esa obra, y eso se necesita cuando se
-- revisa un marcaje de hace tres meses.
create or replace function public.guardar_horario_reloj(
  p_reloj_code text,
  p_dias       smallint[],
  p_desde      time,
  p_hasta      time,
  p_tipo       text default 'ambos',
  p_motivo     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_dia  smallint;
  v_n    integer := 0;
begin
  if not (es_usuario_activo() and (es_admin() or tiene_permiso('relojes.horario'))) then
    raise exception 'No tienes permiso para definir los horarios de los relojes'
      using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null then
    raise exception 'Faltan las horas de la franja' using errcode = '22023';
  end if;
  if p_desde = p_hasta then
    raise exception 'La franja no puede empezar y terminar a la misma hora' using errcode = '22023';
  end if;
  if p_tipo not in ('ambos','entrada','salida') then
    raise exception 'Tipo de franja desconocido' using errcode = '22023';
  end if;

  select id into v_id from relojes where code = p_reloj_code;
  if v_id is null then
    raise exception 'Ese reloj no existe' using errcode = '22023';
  end if;

  foreach v_dia in array p_dias loop
    if v_dia is null or v_dia < 0 or v_dia > 6 then continue; end if;
    insert into reloj_horarios (reloj_id, dia_semana, desde, hasta, tipo, motivo, creado_por)
    values (v_id, v_dia, p_desde, p_hasta, p_tipo, nullif(btrim(coalesce(p_motivo,'')),''), auth.uid())
    on conflict (reloj_id, dia_semana, desde, tipo)
      do update set hasta     = excluded.hasta,
                    motivo    = excluded.motivo,
                    activo    = true;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

create or replace function public.borrar_horario_reloj(p_horario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (es_usuario_activo() and (es_admin() or tiene_permiso('relojes.horario'))) then
    raise exception 'No tienes permiso para cambiar los horarios de los relojes'
      using errcode = '42501';
  end if;
  -- Se desactiva, no se borra. Un horario que se dejó de aplicar sigue siendo
  -- un hecho: alguien lo definió y alguien lo quitó.
  update reloj_horarios set activo = false where id = p_horario_id;
  if not found then
    raise exception 'Esa franja no existe' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.encender_bloqueo_reloj(p_reloj_code text, p_bloquea boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (es_usuario_activo() and (es_admin() or tiene_permiso('relojes.horario'))) then
    raise exception 'No tienes permiso para cambiar el bloqueo de los relojes'
      using errcode = '42501';
  end if;

  -- No se prende el bloqueo sin franjas. Prenderlo con cero franjas no cierra
  -- nada en la práctica (reloj_horario abre siempre sin franjas), pero deja
  -- el interruptor en un estado que dice "bloquea" y no bloquea, que es peor
  -- que no tenerlo.
  if p_bloquea
     and not exists (select 1 from reloj_horarios h
                      where h.reloj_id = (select id from relojes where code = p_reloj_code)
                        and h.activo) then
    raise exception 'No se puede bloquear un reloj sin horarios definidos'
      using errcode = '22023';
  end if;

  update relojes set bloquear_fuera_horario = coalesce(p_bloquea, false) where code = p_reloj_code;
  if not found then
    raise exception 'Ese reloj no existe' using errcode = '22023';
  end if;
end;
$$;

-- -------------------------------------------------------------------
-- LAS FRANJAS DE UN RELOJ, PARA LA PANTALLA
-- -------------------------------------------------------------------
create or replace function public.ver_horarios_reloj(p_reloj_code text)
returns table (
  horario_id   uuid,
  dia_semana   smallint,
  dia_nombre   text,
  desde        time,
  hasta        time,
  tipo         text,
  motivo       text,
  activo       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.dia_semana,
         case h.dia_semana
           when 0 then 'Domingo' when 1 then 'Lunes'   when 2 then 'Martes'
           when 3 then 'Miércoles' when 4 then 'Jueves' when 5 then 'Viernes'
           else 'Sábado' end,
         h.desde, h.hasta, h.tipo, h.motivo, h.activo
    from reloj_horarios h
    join relojes r on r.id = h.reloj_id
   where r.code = p_reloj_code
   order by h.dia_semana, h.desde
$$;

-- -------------------------------------------------------------------
-- EL MARCAJE, CON HORARIO
-- -------------------------------------------------------------------
-- La función de siempre no se toca. Esta la llama, y solo la llama si el
-- horario deja pasar.
--
-- Cuando NO deja pasar se registra igual, con resultado
-- 'fuera_de_horario'. No se rechaza y no se guarda: se guarda. La persona
-- estuvo en la obra a las 19:30, y que eso quede escrito es lo que permite
-- después que el supervisor lo mire, lo acepte o no. Un marcaje que no se
-- registra no se puede ni aceptar ni rechazar: desapareció.
create or replace function public.marcar_por_reloj_controlado(
  p_token text,
  p_codigo text,
  p_tipo text default 'entrada',
  p_segundos_antirrebote int default null
)
returns table (
  resultado text,
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
  v_hor  record;
  v_tipo text;
begin
  -- De dónde viene el relojes: el token es lo que lo identifica, y el código es
  -- solo un respaldo para cuando el reloj viene en la URL.
  --
  -- "select ... into", NO "v_hor := * from". En plpgsql la forma con
  -- asterisco no existe: el asterisco se desarma en el SELECT, no en la
  -- asignación. Con la forma mala el error es "assignment source returned 8
  -- columns", que no dice qué línea es ni por qué.
  select * into v_hor from reloj_horario(
    coalesce(p_token, p_codigo),
    now(),
    case when p_tipo in ('entrada','salida') then p_tipo else 'ambos' end
  );

  if v_hor.bloquea and not v_hor.abierto then
    return query
      select 'fuera_de_horario'::text,
             null::text,
             null::text,
             to_char(now(), 'HH24:MI:SS'),
             p_tipo,
             current_date,
             p_codigo,
             null::text,
             case when v_hor.hay_horario
                  then 'Este reloj marca solo en su horario. '||coalesce(v_hor.detalle,'')
                  else v_hor.detalle end;
    return;
  end if;

  return query
    select * from marcar_por_reloj(p_token, p_codigo, p_tipo, p_segundos_antirrebote);
end;
$$;

-- -------------------------------------------------------------------
-- DIAGNÓSTICO
-- -------------------------------------------------------------------
create or replace function public.diagnostico_horarios()
returns table (
  columna_hora_salida  boolean,
  columna_bloqueo      boolean,
  tabla_horarios       boolean,
  rls_horarios         boolean,
  fn_horario           boolean,
  fn_controlada        boolean,
  empresa_con_salida   integer,
  empresa_con_colacion integer,
  relojes_con_franjas  integer,
  relojes_bloqueados   integer,
  permiso_horario      boolean
)
language sql
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.columns where table_schema='public'
             and table_name='empresa' and column_name='hora_salida'),
    exists (select 1 from information_schema.columns where table_schema='public'
             and table_name='relojes' and column_name='bloquear_fuera_horario'),
    exists (select 1 from information_schema.tables where table_schema='public'
             and table_name='reloj_horarios'),
    coalesce((select relrowsecurity from pg_class
               where oid='public.reloj_horarios'::regclass), false),
    exists (select 1 from pg_proc where proname='reloj_horario'
             and pronamespace='public'::regnamespace),
    exists (select 1 from pg_proc where proname='marcar_por_reloj_controlado'
             and pronamespace='public'::regnamespace),
    (select count(*)::integer from empresa where hora_salida is not null),
    (select count(*)::integer from empresa where colacion_inicio is not null),
    (select count(distinct reloj_id)::integer from reloj_horarios where activo),
    (select count(*)::integer from relojes where bloquear_fuera_horario),
    exists (select 1 from permisos where clave='relojes.horario')
$$;

grant execute on function public.reloj_horario(text,timestamptz,text) to authenticated;
grant execute on function public.guardar_horario_reloj(text,smallint[],time,time,text,text) to authenticated;
grant execute on function public.borrar_horario_reloj(uuid) to authenticated;
grant execute on function public.encender_bloqueo_reloj(text,boolean) to authenticated;
grant execute on function public.ver_horarios_reloj(text) to authenticated;
grant execute on function public.marcar_por_reloj_controlado(text,text,text,int) to authenticated;
grant execute on function public.diagnostico_horarios() to authenticated;
