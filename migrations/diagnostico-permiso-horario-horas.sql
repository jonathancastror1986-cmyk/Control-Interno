-- Diagnóstico de la 099. Solo lectura.

-- 1) Existen las funciones y la columna (esperado: 4 funciones, 1 columna)
select (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('pedir_permiso_horario','ver_horas_permiso','calcular_horas_permiso','alcance_trabajador_permiso')) as funciones,
       (select count(*) from information_schema.columns where table_schema='public'
         and table_name='permiso_horario' and column_name='dia_completo') as columna_dia_completo;

-- 2) Solo debe existir la firma de 7 parámetros de pedir_permiso_horario (esperado: 1)
select count(*) as firmas_de_pedir from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'pedir_permiso_horario';

-- 3) Permisos de día completo reconocidos
select dia_completo, count(*) from public.permiso_horario group by 1;

-- 4) Trabajadores sin horario resoluble (con una sola hora darían error)
select t.code, t.nombre
  from public.trabajadores t
  left join public.empresa_turnos et on et.id = t.turno_id
  left join public.empresa e on e.id = t.empresa_id
 where case when t.turno_id is not null then et.hora_entrada is null or et.hora_salida is null
            else e.hora_entrada is null or e.hora_salida is null end
 limit 50;
