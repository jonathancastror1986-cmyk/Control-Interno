-- 099: reglas de horas del permiso por hora, en la base.
-- Hasta la 090 pedir_permiso_horario exigía las dos horas y la pantalla decidía todo lo demás.
-- Ahora la base resuelve: todo el día, solo llegada (fin), solo salida (inicio) o intermedio.
-- Horario: trabajadores.turno_id -> empresa_turnos (053). Sin turno, empresa.hora_entrada/hora_salida (052),
-- y solo si las dos están cargadas. Nunca se inventan horas.
-- Día completo = 00:00 a 23:59 (la tabla exige hora_fin > hora_inicio, 086).
-- No edita la 086 ni la 090. Idempotente. Rollback al final.

-- 1) Indicador de día completo, siempre consistente con las horas.
alter table public.permiso_horario
  add column if not exists dia_completo boolean
  generated always as (hora_inicio = time '00:00' and hora_fin = time '23:59') stored;

-- 2) Alcance sobre un trabajador (misma regla que la 090): centro de costo, o empresa si no tiene centro.
create or replace function public.alcance_trabajador_permiso(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from public.trabajadores t
     where t.code = p_code
       and case when t.centro_costo_id is null
                then exists (select 1 from public.perfil_empresas pe where pe.user_id = auth.uid() and pe.empresa_id = t.empresa_id)
                else exists (select 1 from public.perfil_centros_costo pcc where pcc.user_id = auth.uid() and pcc.centro_costo_id = t.centro_costo_id)
           end);
$$;

-- 3) La lógica única. Interna: sin permisos propios, solo la llaman las funciones de abajo.
create or replace function public.calcular_horas_permiso(
  p_code text, p_fecha date, p_hora_inicio time, p_hora_fin time, p_todo_el_dia boolean default false)
returns table (desde time, hasta time, tipo text, origen text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_turno integer; v_ent time; v_sal time; v_cruza boolean := false; v_origen text;
begin
  if p_fecha is null then
    raise exception 'Falta la fecha del permiso' using errcode = '22023';
  end if;

  if coalesce(p_todo_el_dia, false) then
    if p_hora_inicio is not null or p_hora_fin is not null then
      raise exception 'Marcaste "todo el día" y además indicaste horas. Elige una de las dos opciones.'
        using errcode = '22023';
    end if;
    return query select time '00:00', time '23:59', 'dia_completo', 'todo_el_dia';
    return;
  end if;

  if p_hora_inicio is null and p_hora_fin is null then
    raise exception 'Indica la hora de inicio, la de fin o marca "todo el día".' using errcode = '22023';
  end if;

  if p_hora_inicio is not null and p_hora_fin is not null then
    if p_hora_fin <= p_hora_inicio then
      raise exception 'La hora de fin (%) tiene que ser posterior a la de inicio (%). Un permiso no puede cruzar la medianoche: registra uno por día.',
        to_char(p_hora_fin, 'HH24:MI'), to_char(p_hora_inicio, 'HH24:MI') using errcode = '22023';
    end if;
    return query select p_hora_inicio, p_hora_fin,
      case when p_hora_inicio = time '00:00' and p_hora_fin = time '23:59' then 'dia_completo' else 'intermedio' end,
      'indicadas';
    return;
  end if;

  -- Falta una de las dos horas: se completa con el turno del trabajador.
  select t.turno_id into v_turno from public.trabajadores t where t.code = p_code;
  if v_turno is not null then
    select et.hora_entrada, et.hora_salida, et.cruza_medianoche into v_ent, v_sal, v_cruza
      from public.empresa_turnos et where et.id = v_turno;
    v_origen := 'turno';
  else
    select e.hora_entrada, e.hora_salida into v_ent, v_sal
      from public.trabajadores t join public.empresa e on e.id = t.empresa_id where t.code = p_code;
    v_origen := 'empresa';
  end if;

  if v_ent is null or v_sal is null then
    raise exception 'El trabajador no tiene horario cargado para el %: indica la hora de inicio y la de fin, o marca "todo el día".',
      to_char(p_fecha, 'DD-MM-YYYY') using errcode = '22023';
  end if;

  if coalesce(v_cruza, false) or v_sal <= v_ent then
    raise exception 'El turno del trabajador cruza la medianoche (% a %): con una sola hora no se puede resolver. Indica la hora de inicio y la de fin dentro del mismo día, o marca "todo el día".',
      to_char(v_ent, 'HH24:MI'), to_char(v_sal, 'HH24:MI') using errcode = '22023';
  end if;

  if p_hora_inicio is null then
    if p_hora_fin <= v_ent then
      raise exception 'La hora de fin (%) tiene que ser posterior a la entrada del turno (%).',
        to_char(p_hora_fin, 'HH24:MI'), to_char(v_ent, 'HH24:MI') using errcode = '22023';
    end if;
    return query select v_ent, p_hora_fin, 'llegada_tardia', v_origen;
  else
    if p_hora_inicio >= v_sal then
      raise exception 'La hora de inicio (%) tiene que ser anterior a la salida del turno (%).',
        to_char(p_hora_inicio, 'HH24:MI'), to_char(v_sal, 'HH24:MI') using errcode = '22023';
    end if;
    return query select p_hora_inicio, v_sal, 'salida_anticipada', v_origen;
  end if;
end;
$$;

-- 4) Solo lectura, con la misma lógica que la de guardar.
create or replace function public.ver_horas_permiso(
  p_code text, p_fecha date, p_hora_inicio time default null, p_hora_fin time default null,
  p_todo_el_dia boolean default false)
returns table (desde time, hasta time, tipo text, origen text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_admin() or public.tiene_permiso('permisos_horario.pedir')
          or public.tiene_permiso('permisos_horario.aprobar') or public.tiene_permiso('permisos_horario.visar')) then
    raise exception 'No tienes permiso para consultar permisos horarios' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trabajadores t where t.code = p_code) then
    raise exception 'No encontré al trabajador "%"', coalesce(p_code, '(sin código)') using errcode = '22023';
  end if;
  if not public.alcance_trabajador_permiso(p_code) then
    raise exception 'Ese trabajador no es de tu empresa o centro de costo' using errcode = '42501';
  end if;
  return query select * from public.calcular_horas_permiso(p_code, p_fecha, p_hora_inicio, p_hora_fin, p_todo_el_dia);
end;
$$;

-- 5) pedir_permiso_horario: mismas validaciones de la 090 (permiso, motivo, alcance, pisado), horas resueltas en la base.
drop function if exists public.pedir_permiso_horario(text,date,time,time,text,text);

create or replace function public.pedir_permiso_horario(
  p_code text, p_fecha date, p_hora_inicio time, p_hora_fin time, p_motivo text,
  p_comentario text default null, p_todo_el_dia boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_id integer; v_motivo text; v_centro integer; v_ini time; v_fin time;
begin
  if not (public.es_admin() or public.tiene_permiso('permisos_horario.pedir')) then
    raise exception 'No tienes permiso para pedir permisos horarios' using errcode = '42501';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if v_motivo = '' then
    raise exception 'Falta el motivo del permiso. Un permiso sin motivo no se puede defender.' using errcode = '22023';
  end if;

  select t.centro_costo_id into v_centro from public.trabajadores t where t.code = p_code;
  if not found then
    raise exception 'No encontré al trabajador "%"', coalesce(p_code, '(sin código)') using errcode = '22023';
  end if;

  if v_centro is null then
    if not public.es_admin()
       and not exists (select 1 from public.perfil_empresas pe join public.trabajadores t on t.code = p_code where pe.user_id = auth.uid() and pe.empresa_id = t.empresa_id) then
      raise exception 'Ese trabajador no está en ninguna de tus empresas' using errcode = '42501';
    end if;
  elsif not public.es_admin()
    and not exists (select 1 from public.perfil_centros_costo pcc where pcc.user_id = auth.uid() and pcc.centro_costo_id = v_centro) then
    raise exception 'Ese trabajador es de un centro de costo que no te corresponde' using errcode = '42501';
  end if;

  select c.desde, c.hasta into v_ini, v_fin
    from public.calcular_horas_permiso(p_code, p_fecha, p_hora_inicio, p_hora_fin, p_todo_el_dia) c;

  if exists (select 1 from public.permiso_horario ph where ph.code = p_code and ph.fecha = p_fecha and ph.estado <> 'anulado' and v_ini < ph.hora_fin and v_fin > ph.hora_inicio) then
    raise exception 'Ese horario se pisa con un permiso que ya existe para ese día' using errcode = '22023';
  end if;

  insert into public.permiso_horario (code, fecha, hora_inicio, hora_fin, motivo, estado, pedido_por, pedido_por_nombre, pedido_por_rol, comentario)
  values (p_code, p_fecha, v_ini, v_fin, v_motivo, 'pendiente', auth.uid(),
          (select nombre from public.perfiles where id = auth.uid()),
          (select rol from public.perfiles where id = auth.uid()),
          nullif(btrim(coalesce(p_comentario, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- 6) Permisos de ejecución.
revoke all on function public.calcular_horas_permiso(text,date,time,time,boolean) from public, anon, authenticated;
revoke all on function public.alcance_trabajador_permiso(text) from public, anon;
revoke all on function public.ver_horas_permiso(text,date,time,time,boolean) from public, anon;
revoke all on function public.pedir_permiso_horario(text,date,time,time,text,text,boolean) from public, anon;
grant execute on function public.alcance_trabajador_permiso(text) to authenticated;
grant execute on function public.ver_horas_permiso(text,date,time,time,boolean) to authenticated;
grant execute on function public.pedir_permiso_horario(text,date,time,time,text,text,boolean) to authenticated;

-- ROLLBACK (a mano; ejecutar en este orden):
--   drop function if exists public.pedir_permiso_horario(text,date,time,time,text,text,boolean);
--   drop function if exists public.ver_horas_permiso(text,date,time,time,boolean);
--   drop function if exists public.calcular_horas_permiso(text,date,time,time,boolean);
--   drop function if exists public.alcance_trabajador_permiso(text);
--   alter table public.permiso_horario drop column if exists dia_completo;
--   y volver a correr el bloque 4.1 de la 090 (pedir_permiso_horario de 6 parámetros, con su grant).
