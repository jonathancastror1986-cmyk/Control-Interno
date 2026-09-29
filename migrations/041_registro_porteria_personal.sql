-- ===================================================================
-- 041 - EL REGISTRO DE LA PORTERÍA PARA LOS TRABAJADORES
-- ===================================================================
--
-- QUE RESUELVE
-- ------------
-- Que exista un registro de quién entró y salió de la obra, que es
-- distinto del registro de quién marcó.
--
-- Es distinto, y esa es toda la gracia:
--
--   marcajes          el reloj. Dice si la persona estuvo trabajando.
--   porteria_registros la portería. Dice si la persona cruzó la puerta.
--
-- Los dos se necesitan porque se contradicen, y cuando se contradicen
-- hay algo que mirar. Un puede marcar desde adentro y no haber cruzado
-- la puerta: la marcación la hizo un compañero, o la tarjeta quedó en
-- otro lado. O al revés: cruzó la puerta pero no marcó, y entonces no
-- hay registro de que estuvo trabajando.
--
-- Con los dos juntos se puede avisar. Con uno solo, no.
--
--
-- POR QUÉ NO SE USA "marcajes" PARA ESTO
-- --------------------------------------
-- Porque "marcajes" es la evidencia de la jornada. Si se le mete el
-- ingreso a la portería, la planilla empieza a tener horas que nadie
-- fichó, y a la primera impugnación no hay forma de decir cuál de las
-- dos horas es real.
--
-- Quedan separadas, y el cruce se hace cuando se necesita: para el
-- diagnóstico, y para el aviso de la asistencia diaria.
--
--
-- LOS ESTADOS, Y POR QUÉ SON ESTOS
-- ---------------------------------
--   normal      entró y salió como corresponde
--   permiso     tiene permiso para estar o para irse a otra hora
--   accidente   entró o salió por un accidente
--   licencia     no le corresponde estar, pero se registra igual
--
-- La diferencia importa porque cambia lo que se puede hacer después. Un
-- permiso se autoriza con un documento. Un accidente genera una
-- denuncia. Una licencia se respeta y no se toca.
--
-- Y el "como" también: una entrada con tarjeta es una evidencia; una
-- anotada de memoria por el portero es la palabra de una persona. No es
-- lo mismo, y saber cuál fue, importa cuando se revisa.
--
-- ------------------------------------------------------------------
-- 1) LA TABLA
-- ------------------------------------------------------------------
create table if not exists public.porteria_registros (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.trabajadores(code) on delete cascade,
  fecha date not null default current_date,
  hora time not null,

  -- Que cruzó la puerta. No "entrada y salida" en un solo registro: son
  -- dos hechos separados en el tiempo, y unirlos obliga a adivinar la
  -- hora de salida de todos.
  tipo text not null check (tipo in ('entrada','salida')),

  -- Por qué. Con la lista cerrada de arriba, para que el color de la
  -- pantalla sea el mismo en todos lados.
  motivo text not null default 'normal'
    check (motivo in ('normal','permiso','accidente','licencia','visita')),

  -- Cómo se registró. Una entrada con tarjeta y una anotada de memoria
  -- no pesan lo mismo cuando se revisa un mes después.
  registrado_con text not null default 'tarjeta'
    check (registrado_con in ('tarjeta','lector','manual','reloj')),

  -- El documento con el que se justifica, cuando hay: un permiso, un
  -- parte, una orden. La referencia, no el papel: el papel se archiva
  -- aparte y a veces no existe copia.
  documento text,
  documento_fecha date,

  -- El vehiculo, cuando entra en uno. Un maestro que sube con la
  -- camioneta no es lo mismo que uno que viene a pie.
  patente text,

  nota text,

  registrado_por uuid references public.perfiles(id) on delete set null,
  registrado_por_nombre text,
  creado_at timestamptz not null default now()
);

-- El cruce del día: quién entró a la obra. Es la consulta que hace la
-- pantalla, y tiene que ser rápida con 200 personas por día.
create index if not exists porteria_fecha_tipo on public.porteria_registros (fecha, tipo, code);

-- Por persona, que es como se revisa un caso.
create index if not exists porteria_code_fecha on public.porteria_registros (code, fecha desc);

-- Las entradas del día, que es la lista de trabajo de la portería.
create index if not exists porteria_entradas on public.porteria_registros (fecha, hora) where tipo = 'entrada';

-- Por patente, que es como se busca el auto que se quedó adentro.
create index if not exists porteria_patente on public.porteria_registros (lower(patente)) where patente is not null;

comment on table public.porteria_registros is
  'Ingresos y salidas de la PORTERIA para el personal de la obra. NO es lo mismo que "marcajes": el reloj dice si estuvo trabajando, la portería dice si cruzó la puerta. Se guardan aparte justamente porque se contradicen, y cuando se contradicen hay algo que revisar.';
comment on column public.porteria_registros.motivo is
  'normal, permiso, accidente, licencia o visita. Es lo que da el color de la pantalla, y la lista es cerrada a proposito: si admite cualquier texto, cada uno escribe una palabra distinta y el color no se puede leer.';
comment on column public.porteria_registros.registrado_con is
  'Como se registro: tarjeta, lector, manual o reloj. Una entrada con tarjeta y una anotada de memoria por el portero no son la misma evidencia, y saber cual fue importa cuando se revisa un mes despues.';

-- ------------------------------------------------------------------
-- 2) LA DIFERENCIA CON LA ASISTENCIA
-- ------------------------------------------------------------------
-- Esta es la funcion que da sentido a tener las dos tablas. Devuelve las
-- tres cosas que hay que mirar:
--
--   ingreso sin marcaje  la persona cruzó la puerta y no fichó. Puede
--                        ser que se le olvidó, o que fichó mal.
--   marcaje sin ingreso  fichó y no hay registro de que entrara. O la
--                        marcación la hizo otro, o el registro se perdió.
--   salida sin entrada   entró dos veces y salió una, o al reves. Es un
--                        error de conteo, y hay que verlo antes de que
--                        se repita.
--
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
  with entradas as (
    select code, min(hora) as hora_in, max(hora) as hora_out, count(*) filter (where tipo = 'entrada') as n_in,
           count(*) filter (where tipo = 'salida') as n_out
      from public.porteria_registros
     where fecha = p_fecha
     group by code
  )
  select 'ingresó pero no marcó', e.code, w.name,
         'Cruzó la puerta a las ' || to_char(e.hora_in, 'HH24:MI')
         || ' y no hay ninguna marcación de ese día. Puede que se le olvidó la tarjeta.'
    from entradas e
    join public.trabajadores w on w.code = e.code
   where exists (select 1 from public.marcajes m where m.code = e.code and m.fecha = p_fecha) is false

  union all

  select 'marcó pero no hay ingreso', m.code, w.name,
         'Tiene marcaciones del día y ningún registro de que entrara a la obra. '
         || 'La marcación la hizo otra persona, o el registro de la portería se perdió.'
    from (select distinct code from public.marcajes where fecha = p_fecha) m
    join public.trabajadores w on w.code = m.code
    left join entradas e on e.code = m.code
   where e.code is null

  union all

  select 'entradas y salidas no cuadran', e.code, w.name,
         'Entró ' || e.n_in || ' veces y salió ' || e.n_out || '.'
    from entradas e
    join public.trabajadores w on w.code = e.code
   where e.n_in <> e.n_out;
$$;

comment on function public.diagnostico_porteria_trabajadores(date) is
  'Las tres diferencias entre lo que dice el reloj y lo que dice la portería. Es lo que hace que valga la pena tener las dos tablas: solas no se contradicen porque no se pueden ver.';

-- ------------------------------------------------------------------
-- 3) CUANDO QUEDA ESPERANDO LA SALIDA
-- ------------------------------------------------------------------
-- Para el control de salida: quien entró y todavía no salió, con quantas
-- horas lleva adentro. Se usa en la puerta, al final del turno, para ver a
-- quién falta.
--
-- Las horas van calculadas por la base y no por el navegador, porque en la
-- puerta hay dos relojes y el del aparato puede estar corrido.
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
   where e.n_in > e.n_out;
$$;

comment on function public.pendientes_de_salida(date) is
  'Quién entró y todavía no salió, con las horas que lleva adentro. Es la lista que se revisa en la puerta al final del turno, para ver a quién falta. En la práctica se le cruza con la jornada para marcar los 30 minutos de margen. El intervalo sale de la base y no del navegador, porque en la puerta hay dos relojes y el del aparato puede estar corrido; si el ingreso es de un dia anterior, sale negativo, y eso tambien avisa.';

-- ------------------------------------------------------------------
-- 4) LOS PERMISOS
-- ------------------------------------------------------------------
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('porteria.registro', 'Registrar ingresos y salidas del personal por la portería', 'porteria', 13)
on conflict (clave) do update set descripcion = excluded.descripcion;

insert into public.roles_permisos (rol, permiso) values
  ('porteria',    'porteria.registro'),
  ('supervisores','porteria.registro')
on conflict do nothing;

-- ------------------------------------------------------------------
-- 5) DIAGNÓSTICO DE LA MIGRACIÓN
-- ------------------------------------------------------------------
create or replace function public.diagnostico_041()
returns table (problema text, cuantos bigint)
language sql
stable
as $$
  select 'la tabla del registro de portería no existe',
         (select case when to_regclass('public.porteria_registros') is null then 1 else 0 end)

  union all select 'hay entradas del personal sin hora de salida y hace más de 14 horas',
         (select count(*) from (
            select code from public.porteria_registros
             where fecha = current_date and tipo = 'entrada'
             group by code
            having (current_date + min(hora)) < now() - interval '14 hours'
              and count(*) filter (where tipo = 'salida') = 0
          ) z)

  union all select 'hay registros de personal con un motivo que no es de la lista',
         (select count(*) from public.porteria_registros
           where motivo not in ('normal','permiso','accidente','licencia','visita'))
$$;

-- ------------------------------------------------------------------
-- PARA VOLVER ATRÁS
-- ------------------------------------------------------------------
--   drop table if exists public.porteria_registros;
--   drop function if exists public.diagnostico_041();
--   drop function if exists public.pendientes_de_salida(date);
--   drop function if exists public.diagnostico_porteria_trabajadores(date);
--   delete from public.roles_permisos where permiso = 'porteria.registro';
--   delete from public.permisos where clave = 'porteria.registro';
