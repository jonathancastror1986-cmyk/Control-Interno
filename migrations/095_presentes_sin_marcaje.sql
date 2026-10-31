-- 095: lectura para la Fase A (aviso al supervisor y lista de Administración).
-- Solo lectura. No toca marcajes ni asistencia. SECURITY INVOKER (por defecto):
-- la RLS por empresa de trabajadores/asistencia/marcajes sigue aplicando.

-- 1) ¿Ya se cargó el Excel/reloj de ese día para esa empresa?
create or replace function public.marcajes_cargados(p_fecha date, p_empresa_id int default null)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.marcajes m
      join public.trabajadores t on t.code = m.code
     where m.fecha = p_fecha
       and m.origen in ('excel','reloj')
       and (p_empresa_id is null or t.empresa_id = p_empresa_id)
  );
$$;

-- 2) Presentes según el supervisor que no marcaron.
-- Devuelve vacío si el Excel de ese día aún no está cargado: sin él,
-- "no marcó" no se puede afirmar.
create or replace function public.presentes_sin_marcaje(p_fecha date, p_empresa_id int default null)
returns table (
  code text,
  nombre text,
  supervisor_code text,
  supervisor_nombre text,
  hora_anotada time
)
language sql
stable
set search_path = public
as $$
  select t.code, t.name, t.supervisor_code, s.name, a.hora_llegada
    from public.asistencia a
    join public.trabajadores t on t.code = a.code
    left join public.trabajadores s on s.code = t.supervisor_code
   where a.fecha = p_fecha
     and a.estado = 'X'
     and a.origen = 'manual'
     and t.status = 'activo'
     and t.tipo_trabajador = 'interno'
     and (p_empresa_id is null or t.empresa_id = p_empresa_id)
     and public.marcajes_cargados(p_fecha, p_empresa_id)
     and not exists (
       select 1 from public.marcajes m
        where m.code = a.code and m.fecha = a.fecha and m.tipo = 'entrada'
     )
   order by s.name nulls last, t.name;
$$;

grant execute on function public.marcajes_cargados(date, int) to authenticated;
grant execute on function public.presentes_sin_marcaje(date, int) to authenticated;
