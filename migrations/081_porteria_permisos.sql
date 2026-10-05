-- ===================================================================
-- 081 - LA PORTERÍA NO DEBE ABRIRSE CON LA LLAVE ANÓNIMA
-- ===================================================================
--
-- QUÉ PASÓ
-- --------
-- La 041 y la 042 crearon ocho funciones "security definer". Las dos
-- migraciones compilaron, no dieron ningún error, y todo parecía bien.
--
-- Pero "security definer" no es una protección: es lo CONTRARIO de una.
-- Significa que la función corre con los permisos de quien la creó (el
-- postgres del proyecto), no con los de quien la llama. Es lo que permite
-- que una función escriba en una tabla que tiene RLS encendido y sin
-- políticas.
--
-- Y eso obliga a que la función revise el permiso ADENTRO. Es la regla del
-- patrón: si es "security definer", el permiso se comprueba en el cuerpo,
-- porque nadie más lo va a comprobar.
--
-- Las ocho de la portería no lo comprobaban. Y además ninguna tenía
-- "grant execute ... to authenticated" ni "revoke ... from anon".
--
-- POR QUÉ ESO ES UN AGUJERO
-- -------------------------
-- En Postgres, una función nueva nace con EXECUTE concedido a PUBLIC.
-- "PUBLIC" incluye a "anon", que es la llave que va incrustada en el HTML
-- de la aplicación y se lee abriendo las herramientas del navegador.
--
-- O sea: cualquiera que abra la página podía llamar, desde la consola,
-- estas ocho funciones. Escribiendo, además. Podía registrar entradas y
-- salidas de trabajadores que nunca cruzaron la puerta, con la patente
-- que quisiera, y firmando con el nombre de un supervisor.
--
-- Y esto NO da ningún error visible. La portería funciona, la pantalla se
-- ve bien, y el agujero está ahí abajo.
--
--
-- LAS DOS COSAS QUE HAY QUE ARREGLAR
-- ---------------------------------
-- 1) REVOCAR. Que "anon" no pueda llamar ninguna de las ocho.
--
-- 2) COMPROBAR DENTRO. Aunque el revoke ya basta para "authenticated",
--    el permiso se revisa igual adentro, por dos razones:
--      - si mañana alguien abre las funciones a otro rol, ya está chequeado
--      - el RLS de las tablas las dejó a un lado justamente por ser definer
--
--
-- POR QUÉ NO BORRO Y RECREO LAS TABLAS
-- ------------------------------------
-- No hace falta, y sería peligroso: la 042 ya corrió y puede tener datos.
-- Acá solo se tocan las funciones.
--
-- ------------------------------------------------------------------
-- 1) CERRAR LA PUERTA
-- ------------------------------------------------------------------
-- El "revoke ... from public" va PRIMERO, antes que el "grant". Si se
-- invirtieran, el grant a "authenticated" volvería a abrir el acceso para
-- "anon", porque "authenticated" es un miembro de "public".
--
revoke execute on function public.diagnostico_porteria_trabajadores(date) from public, anon;
revoke execute on function public.pendientes_de_salida(date) from public, anon;
revoke execute on function public.diagnostico_041() from public, anon;

revoke execute on function public.abrir_grupo_vehiculo(text,text,time,int,boolean,text,text,text) from public, anon;
revoke execute on function public.confirmar_grupo(uuid,text[],time,boolean) from public, anon;
revoke execute on function public.salir_grupo(uuid,text[],time) from public, anon;
revoke execute on function public.grupos_del_dia(date) from public, anon;

grant execute on function public.diagnostico_porteria_trabajadores(date) to authenticated;
grant execute on function public.pendientes_de_salida(date) to authenticated;
grant execute on function public.diagnostico_041() to authenticated;
grant execute on function public.abrir_grupo_vehiculo(text,text,time,int,boolean,text,text,text) to authenticated;
grant execute on function public.confirmar_grupo(uuid,text[],time,boolean) to authenticated;
grant execute on function public.salir_grupo(uuid,text[],time) to authenticated;
grant execute on function public.grupos_del_dia(date) to authenticated;

-- ------------------------------------------------------------------
-- 2) QUE LA 042 ESCRIBA SOLO CON PERMISO
-- ------------------------------------------------------------------
-- Las tres funciones que escriben. El permiso es "porteria.registro",
-- que es el mismo que usa la 040 para registrar ingresos: los roles
-- "porteria" y "supervisores".
create or replace function public.abrir_grupo_vehiculo(
  p_patente text,
  p_conductor text default null,
  p_hora time default null,
  p_esperados int default null,
  p_revision boolean default false,
  p_motivo_revision text default null,
  p_tipo text default null,
  p_empresa_veh text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ya_entro boolean;
begin
  -- EL PERMISO, PRIMERO DE TODO
  --
  -- Antes de mirar la patente, antes de contar los esperados, antes de
  -- insertar nada. Si el permiso falta, la función no hace ABSOLUTAMENTE
  -- NADA, ni siquiera devolver un error que diga qué dato miró.
  if not (public.es_usuario_activo() or public.es_admin()
          or public.tiene_permiso('porteria.registro')) then
    raise exception 'No tienes permiso para registrar ingresos de personal'
      using errcode = '42501',
        hint = 'El permiso es porteria.registro. Lo tienen los roles porteria y supervisores.';
  end if;

  if coalesce(btrim(p_patente), '') = '' then
    raise exception 'PATENTE_VACIA' using errcode = 'check_violation',
      hint = 'Sin patente no se sabe que vehiculo entro.';
  end if;

  -- Un grupo abierto para la misma patente, en la misma media hora, es el
  -- mismo grupo. Apretar dos veces el boton no tiene que crear dos
  -- grupos: eso parte a la gente en dos y el conteo queda mal.
  select id into v_id
    from public.porteria_grupos
   where lower(patente) = lower(btrim(p_patente))
     and estado = 'abierto'
     -- La ventana se compara como timestamp, no como "time". Postgres no
     -- puede restarle un interval a un time: no hay a que convertir el
     -- resultado, la condicion queda sin sentido, y el grupo repetido nunca
     -- se encuentra. Apretar dos veces el mismo auto creaba dos grupos y
     -- partia a la gente en dos.
     and (fecha + hora) between (current_date + coalesce(p_hora, localtime) - interval '30 minutes')
                             and (current_date + coalesce(p_hora, localtime) + interval '30 minutes')
   order by hora desc
   limit 1;

  if v_id is not null then
    -- Ya existe: se completa lo que faltaba y se devuelve el mismo.
    update public.porteria_grupos
       set esperados     = coalesce(p_esperados, esperados),
           revision_vehiculo = revision_vehiculo or coalesce(p_revision, false),
           motivo_revision = coalesce(p_motivo_revision, motivo_revision)
     where id = v_id;
    return v_id;
  end if;

  insert into public.porteria_grupos (
    fecha, hora, patente, tipo_vehiculo, empresa_vehiculo, conductor_code,
    esperados, revision_vehiculo, motivo_revision, estado,
    escaneado_por, escaneado_por_nombre
  ) values (
    current_date,
    coalesce(p_hora, localtime),
    upper(btrim(p_patente)),
    nullif(btrim(coalesce(p_tipo, '')), ''),
    nullif(btrim(coalesce(p_empresa_veh, '')), ''),
    nullif(btrim(coalesce(p_conductor, '')), ''),
    case when p_esperados is null then null
         when p_esperados < 1 then null
         else p_esperados end,
    coalesce(p_revision, false),
    nullif(btrim(coalesce(p_motivo_revision, '')), ''),
    'abierto',
    auth.uid(),
    (select nombre from public.perfiles where id = auth.uid())
  ) returning id into v_id;

  -- Y la entrada del que maneja, que si se registrara siempre. Si el no
  -- entro, no entro el grupo: el auto viene con alguien, y ese alguien
  -- tiene que estar.
  if p_conductor is not null and btrim(p_conductor) <> '' then
    select true into v_ya_entro
      from public.porteria_registros
     where code = btrim(p_conductor) and fecha = current_date and tipo = 'entrada';

    if not coalesce(v_ya_entro, false) then
      insert into public.porteria_registros (code, fecha, hora, tipo, motivo, registrado_con, patente, grupo_id, registrado_por, registrado_por_nombre)
      values (btrim(p_conductor), current_date, coalesce(p_hora, localtime), 'entrada', 'normal', 'tarjeta',
              upper(btrim(p_patente)), v_id, auth.uid(), (select nombre from public.perfiles where id = auth.uid()));
    else
      -- Si ya habia entrado antes, se le cuelga su entrada al grupo, para
      -- que la persona no quede dos veces.
      update public.porteria_registros
         set grupo_id = v_id
       where code = btrim(p_conductor) and fecha = current_date and tipo = 'entrada';
    end if;
  end if;

  return v_id;
end $$;

comment on function public.abrir_grupo_vehiculo(text,text,time,int,boolean,text,text,text) is
  'Pasa la tarjeta de quien maneja: queda registrada su entrada, y el grupo queda ABIERTO para que el supervisor confirme los acompañantes. Si el mismo auto aparece dos veces en media hora, devuelve el mismo grupo en vez de partir a la gente en dos. Revisa el permiso porteria.registro adentro, porque es security definer: corre como el dueño de la tabla, no como quien llama.';

-- Confirmar los acompañantes.
create or replace function public.confirmar_grupo(
  p_grupo_id uuid,
  p_codigos text[],
  p_hora time default null,
  p_cerrar boolean default true
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo public.porteria_grupos%rowtype;
  v_cod text;
  v_n int := 0;
begin
  -- Mismo permiso que abrir el grupo: confirmar ES registrar. Un grupo
  -- confirmado sin permiso seria un ingreso escrito por cualquiera.
  if not (public.es_usuario_activo() or public.es_admin()
          or public.tiene_permiso('porteria.registro')) then
    raise exception 'No tienes permiso para confirmar los acompanantes'
      using errcode = '42501',
        hint = 'Confirmar acompanantes es lo mismo que registrar un ingreso: necesita porteria.registro.';
  end if;

  select * into v_grupo from public.porteria_grupos where id = p_grupo_id for update;
  if not found then
    raise exception 'GRUPO_INEXISTENTE' using errcode = 'no_data_found';
  end if;
  if v_grupo.estado = 'anulado' then
    raise exception 'GRUPO_ANULADO' using errcode = 'check_violation';
  end if;

  foreach v_cod in array coalesce(p_codigos, '{}'::text[]) loop
    if btrim(v_cod) = '' then continue; end if;
    -- Un código que no existe en la ficha no se confirma: es peor meterlo
    -- que dejar la lista corta, porque queda un ingreso de alguien que
    -- nunca estuvo en la obra.
    if not exists (select 1 from public.trabajadores where code = btrim(v_cod)) then
      raise exception 'CODIGO_DESCONOCIDO' using errcode = 'check_violation',
        hint = 'El código ' || btrim(v_cod) || ' no está en la lista de trabajadores de esta obra.';
    end if;

    if not exists (
      select 1 from public.porteria_registros
       where code = btrim(v_cod) and fecha = current_date and tipo = 'entrada'
    ) then
      insert into public.porteria_registros (code, fecha, hora, tipo, motivo, registrado_con, patente, grupo_id, registrado_por, registrado_por_nombre)
      values (btrim(v_cod), current_date, coalesce(p_hora, v_grupo.hora), 'entrada', 'normal', 'tarjeta',
              v_grupo.patente, v_grupo.id, auth.uid(), (select nombre from public.perfiles where id = auth.uid()));
      v_n := v_n + 1;
    else
      update public.porteria_registros
         set grupo_id = v_grupo.id
       where code = btrim(v_cod) and fecha = current_date and tipo = 'entrada';
    end if;
  end loop;

  update public.porteria_grupos
     set confirmados = (select count(*) from public.porteria_registros
                         where grupo_id = v_grupo.id and fecha = current_date and tipo = 'entrada'),
         estado      = case when coalesce(p_cerrar, true) then 'cerrado' else 'abierto' end,
         cerrado_at  = case when coalesce(p_cerrar, true) then now() else null end,
         confirmado_por        = auth.uid(),
         confirmado_por_nombre = (select nombre from public.perfiles where id = auth.uid())
   where id = v_grupo.id;

  return v_n;
end $$;

comment on function public.confirmar_grupo(uuid,text[],time,boolean) is
  'Confirma los acompanantes del grupo, y a cada uno le deja su entrada. Se puede confirmar de a parte: van los que van, y los que quedaron no aparecen. Un codigo que no existe en la ficha se rechaza entero, para que no quede un ingreso de alguien que nunca estuvo. Necesita porteria.registro.';

-- Al terminar el turno pasa el que maneja.
create or replace function public.salir_grupo(
  p_grupo_id uuid,
  p_codigos text[] default null,
  p_hora time default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo public.porteria_grupos%rowtype;
  v_cod text;
  v_n int := 0;
begin
  if not (public.es_usuario_activo() or public.es_admin()
          or public.tiene_permiso('porteria.registro')) then
    raise exception 'No tienes permiso para registrar salidas del personal'
      using errcode = '42501',
        hint = 'El permiso es porteria.registro. Lo tienen los roles porteria y supervisores.';
  end if;

  select * into v_grupo from public.porteria_grupos where id = p_grupo_id for update;
  if not found then
    raise exception 'GRUPO_INEXISTENTE' using errcode = 'no_data_found';
  end if;

  -- Sin lista: salen todos los que todavia no salieron.
  if p_codigos is null then
    insert into public.porteria_registros (code, fecha, hora, tipo, motivo, registrado_con, patente, grupo_id, registrado_por, registrado_por_nombre)
    select r.code, current_date, coalesce(p_hora, localtime), 'salida', 'normal', 'tarjeta',
           v_grupo.patente, v_grupo.id, auth.uid(), (select nombre from public.perfiles where id = auth.uid())
      from public.porteria_registros r
     where r.grupo_id = v_grupo.id
       and r.fecha = current_date
       and r.tipo = 'entrada'
       and not exists (
         select 1 from public.porteria_registros s
          where s.code = r.code and s.fecha = current_date and s.tipo = 'salida'
       );
    get diagnostics v_n = row_count;
    return v_n;
  end if;

  -- Con lista: salen solo esos, y los demas quedan adentro.
  foreach v_cod in array p_codigos loop
    if btrim(v_cod) = '' then continue; end if;
    if not exists (
      select 1 from public.porteria_registros
       where code = btrim(v_cod) and fecha = current_date and tipo = 'entrada'
    ) then
      raise exception 'NO_ENTRO_HOY' using errcode = 'check_violation',
        hint = btrim(v_cod) || ' no tiene entrada registrada hoy. Si entró en otro grupo, hay que confirmar ese.';
    end if;
    insert into public.porteria_registros (code, fecha, hora, tipo, motivo, registrado_con, patente, grupo_id, registrado_por, registrado_por_nombre)
    values (btrim(v_cod), current_date, coalesce(p_hora, localtime), 'salida', 'normal', 'tarjeta',
            v_grupo.patente, v_grupo.id, auth.uid(), (select nombre from public.perfiles where id = auth.uid()));
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

comment on function public.salir_grupo(uuid,text[],time) is
  'Sale el grupo. Sin lista salen todos los que quedaron con la placa; con lista salen solo esos, y los demas se quedan adentro. Es el caso del que se queda a trabajar más. Necesita porteria.registro.';

-- ------------------------------------------------------------------
-- 3) Y LAS DOS QUE SOLO LEEN
-- ------------------------------------------------------------------
-- grupos_del_dia ya revisaba el permiso, pero en el WHERE de una función
-- "language sql". Eso funciona y no lo toco.
--
-- estado_porteria es otra cosa: era "language sql" SIN "security definer",
-- y eso la dejaba mirando las tablas con el RLS del LLANTE. Y el RLS de
-- "porteria_grupos" está encendido y sin políticas (lo hizo la 042), así
-- que la función no veía NINGUNA fila.
--
-- El síntoma es el peor posible: no daba error, devolvía cuatro filas con
-- ceros, y la pantalla decía "no hay nada que mirar". La portería funcionaba
-- y el contador nunca iba a marcar nada. Es el mismo tipo de fallo que las
-- firmas comparadas como iguales: no hay error, solo la ausencia del dato.
create or replace function public.estado_porteria(p_fecha date default current_date)
returns table (
  problema text,
  cuantos  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  -- EL PERMISO, EN UN CTE, Y NO COMO UNA TERCERA COLUMNA
  --
  -- La primera versión de esta función ponía el permiso con un ", true" al
  -- final de cada rama y un "where" debajo. Se lee bien, pero es una TERCERA
  -- columna de resultado, y la función declara dos:
  --
  --   ERROR:  42P13: return type mismatch in function declared to return
  --           record
  --   DETAIL: Final statement returns too many columns.
  --
  -- El permiso va mejor en un CTE y se filtra una sola vez, arriba. Por eso
  -- hay que revisar el conteo de columnas: el guardián de paréntesis y
  -- comillas lo pasó sin problema, porque el archivo estaba bien escrito.
  with permitted as (
    select (public.es_usuario_activo() or public.es_admin()
            or public.tiene_permiso('porteria.ver')) as ok
  )
  select 'grupos abiertos que todavía no se confirmaron'
       , (select count(*) from public.porteria_grupos
           where fecha = p_fecha and estado = 'abierto')
  where (select ok from permitted)

  union all

  select 'grupos con revisión pedida y sin revisar'
       , (select count(*) from public.porteria_grupos
           where fecha = p_fecha and revision_vehiculo and not revisado)
  where (select ok from permitted)

  union all

  select 'grupos que dijeron cuantos venian y cuantos confirmaron'
       , (select count(*) from public.porteria_grupos
           where fecha = p_fecha and esperados is not null and esperados > confirmados)
  where (select ok from permitted)

  union all

  select 'personas que entraron en grupo y no tiene salida'
       , (select count(*) from public.porteria_registros
           where fecha = p_fecha and grupo_id is not null and tipo = 'entrada'
             and not exists (select 1 from public.porteria_registros s
                              where s.code = porteria_registros.code
                                and s.fecha = p_fecha and s.tipo = 'salida'))
  where (select ok from permitted)
$$;

comment on function public.estado_porteria(date) is
  'Lo que hay que mirar en la puerta. La tercera fila es la que importa al final del turno: un grupo que decia que venían doce y confirmó ocho, y hay que ir a buscarlos. Necesita security definer porque porteria_grupos tiene RLS encendido y sin políticas: sin esto la función miraba con el RLS del que la llama y no veía ninguna fila.';

-- ------------------------------------------------------------------
-- 4) LAS TRES DE LA 041, QUE TAMBIÉN SON "SECURITY DEFINER"
-- ------------------------------------------------------------------
-- diagnostico_041 se queda sola: es la que sirve para comprobar si la
-- migración está bien, y a veces hay que correrla justo cuando algo está
-- mal. Cerrarle la puerta convertiría el diagnóstico en un callejón sin
-- salida. Se le deja el revoke a "anon" y nada más: se sigue podendo
-- llamar como usuario, que es lo que hace falta.
--
-- Las otras dos sí son de lectura de datos de personal, y van igual que
-- el resto.
create or replace function public.pendientes_de_salida(p_fecha date default current_date)
returns table (
  code       text,
  nombre     text,
  hora_in    time,
  dentro_de  interval,
  motivo     text
)
language sql
stable
security definer
set search_path = public
as $$
  -- Mismo caso que estado_porteria: sin "security definer" el RLS la
  -- dejaba ciega y devolvía una lista VACIA. Y una lista vacía en una
  -- pantalla de portería se lee como "todos salieron bien", que es lo
  -- contrario de lo que dice.
  --
  -- El permiso va con un "and" en el WHERE de la única unión que hay, así
  -- que no hay riesgo de que se lo coma otro.
  with e as (
    select code,
           min(hora) filter (where tipo = 'entrada')  as hora_in,
           count(*) filter (where tipo = 'entrada')  as n_in,
           count(*) filter (where tipo = 'salida')  as n_out
      from public.porteria_registros
     where fecha = p_fecha
     group by code
  )
  select e.code, w.name, e.hora_in,
         (p_fecha + e.hora_in) - now(),
         coalesce((select pr.motivo
                     from public.porteria_registros pr
                    where pr.code = e.code and pr.fecha = p_fecha and pr.tipo = 'entrada'
                    order by pr.hora asc limit 1), 'normal')
    from e
    join public.trabajadores w on w.code = e.code
   where e.n_in > e.n_out
     and (public.es_usuario_activo() or public.es_admin()
          or public.tiene_permiso('porteria.ver'));
$$;

comment on function public.pendientes_de_salida(date) is
  'Quién entró y todavía no salió, con las horas que lleva adentro. Es la lista que se revisa en la puerta al final del turno, para ver a quién falta. En la práctica se le cruza con la jornada para marcar los 30 minutos de margen. El intervalo sale de la base y no del navegador, porque en la puerta hay dos relojes y el del aparato puede estar corrido; si el ingreso es de un dia anterior, sale negativo, y eso tambien avisa. Necesita porteria.ver.';

create or replace function public.diagnostico_porteria_trabajadores(p_fecha date default current_date)
returns table (
  problema     text,
  code         text,
  nombre       text,
  que_pasa     text
)
language sql
stable
security definer
set search_path = public
as $$
  -- EL PERMISO VA EN UN CTE, Y ESO SÍ FUNCIONA CON UN "UNION ALL"
  --
  -- Un cte se ve desde las tres ramas, así que alcanza con escribirlo una
  -- vez arriba. La forma que NO funciona es poner el permiso solo en el
  -- "where" de la última rama: en un "union all" cada rama filtra la suya,
  -- y las de arriba se irían sin filtrar.
  --
  -- Y el "where" de cada rama queda tal cual, sin tocar.
  with entradas as (
    select code, min(hora) as hora_in, max(hora) as hora_out, count(*) filter (where tipo = 'entrada') as n_in,
           count(*) filter (where tipo = 'salida') as n_out
      from public.porteria_registros
     where fecha = p_fecha
     group by code
  ), permitted as (
    select (public.es_usuario_activo() or public.es_admin()
            or public.tiene_permiso('porteria.ver')) as ok
  )
  select 'ingresó pero no marcó', e.code, w.name,
         'Cruzó la puerta a las ' || to_char(e.hora_in, 'HH24:MI')
         || ' y no hay ninguna marcación de ese día. Puede que se le olvidó la tarjeta.'
    from entradas e
    join public.trabajadores w on w.code = e.code
   where exists (select 1 from public.marcajes m where m.code = e.code and m.fecha = p_fecha) is false
     and (select ok from permitted)

  union all

  select 'marcó pero no hay ingreso', m.code, w.name,
         'Tiene marcaciones del día y ningún registro de que entrara a la obra. '
         || 'La marcación la hizo otra persona, o el registro de la portería se perdió.'
    from (select distinct code from public.marcajes where fecha = p_fecha) m
    join public.trabajadores w on w.code = m.code
    left join entradas e on e.code = m.code
   where e.code is null
     and (select ok from permitted)

  union all

  select 'entradas y salidas no cuadran', e.code, w.name,
         'Entró ' || e.n_in || ' veces y salió ' || e.n_out || '.'
    from entradas e
    join public.trabajadores w on w.code = e.code
   where e.n_in <> e.n_out
     and (select ok from permitted)
$$;

comment on function public.diagnostico_porteria_trabajadores(date) is
  'Las tres diferencias entre lo que dice el reloj y lo que dice la portería. Es lo que hace que valga la pena tener las dos tablas: solas no se contradicen porque no se pueden ver. Necesita porteria.ver.';

-- ------------------------------------------------------------------
-- PARA VOLVER ATRÁS
-- ------------------------------------------------------------------
--   drop function public.abrir_grupo_vehiculo(text,text,time,int,boolean,text,text,text);
--   drop function public.confirmar_grupo(uuid,text[],time,boolean);
--   drop function public.salir_grupo(uuid,text[],time);
--   drop function public.estado_porteria(date);