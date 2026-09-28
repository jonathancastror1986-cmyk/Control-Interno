-- ============================================================
-- Migración 026: respaldo del reloj y cierre del día siguiente
-- ============================================================
-- EL CICLO DE TRABAJO, QUE ES LO QUE ORDENA TODO
--
--   DÍA D (en la obra, sin reloj todavía)
--     El supervisor escanea las tarjetas. El reporte del reloj NO ha
--     llegado: llega al día siguiente. Así que al escanear, NADIE tiene
--     respaldo del reloj, y eso no es una falla del trabajador: es que el
--     reporte todavía no existe.
--
--     Igual se deja registro, porque el supervisor está respaldando a esa
--     persona de palabra. Eso va a una bandeja en RRHH con el aviso
--     "no marcó asistencia en el reloj".
--
--   DÍA D+1 (llega el reporte)
--     El reporte trae las ENTRADAS del día D, las SALIDAS del día D y las
--     ENTRADAS del día D+1. Es un turno que cruza la medianoche.
--
--     Al importarlo:
--       · se cierran las salidas del día anterior que quedaron abiertas
--       · se registran las entradas de hoy
--       · y CADA AVISO DEL DÍA D SE CONFIRMA SOLO si el reloj coincide.
--         Si el reloj dice otra cosa, el aviso queda en la bandeja para
--         que RRHH lo mire.
--
-- POR QUÉ "SE RESUELVE SOLA" Y POR QUÉ NO ES INSEGURO
--
-- La comparación es entre dos fuentes independientes: lo que vio el reloj
-- y lo que anotó una persona. Si coinciden, nadie tiene que hacer nada.
-- Si NO coinciden, el aviso sigue abierto a propósito: ahí hay algo que
-- investigar, y callar eso sería justo el error que este circuito existe
-- para evitar.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 025 -> 026.
-- ============================================================

-- ------------------------------------------------------------
-- 1) "SISTEMA": EL MARCAJE QUE HIZO UNA PERSONA, NO EL RELOJ
-- ------------------------------------------------------------
-- La lista de orígenes de la 020 distingue de dónde viene cada marcaje.
-- Faltaba el caso que se agrega hoy: una persona lo registró a mano,
-- desde la bandeja de RRHH, porque el reloj no lo tenía. Es distinto de
-- "qr" (escaneado en portería) y de "excel" (viene del reporte).
--
-- Sin este valor no se puede saber después si un marcaje lo hizo el reloj
-- o lo hizo alguien, y la conciliación depende de esa diferencia.
alter table public.marcajes drop constraint if exists marcajes_origen_check;
alter table public.marcajes
  add constraint marcajes_origen_check
  check (origen in ('qr','manual','excel','porteria','app','reloj','sistema'));

-- ------------------------------------------------------------
-- 2) A QUIÉN LE LLEGA EL AVISO
-- ------------------------------------------------------------
-- Se guarda a quién va, en vez de sobreentenderlo. El aviso va a la
-- bandeja de RRHH, que es a quien le corresponde decidir si una marcación
-- sin respaldo del reloj corresponde. Guardarlo hace que la bandeja pueda
-- filtrar por destino si mañana aparece otro, y deja escrito en el
-- registro a dónde se mandó en vez de deducirlo.
alter table public.avisos_ingreso
  add column if not exists destino text not null default 'rrhh';

-- "confirmado_automatico" distingue "alguien lo confirmó" de "el reloj
-- lo confirmó solo". Es la diferencia entre un registro humano y una
-- comparación automática, y en una disputa de asistencia importa saber
-- cuál fue.
alter table public.avisos_ingreso
  add column if not exists confirmado_automatico boolean not null default false;

-- Se agrega 'sin_respaldo_reloj' como tipo. El nombre viejo, 'no_marco',
-- El tipo viejo, 'no_marco', no dice de dónde se saca: sin el reloj no se
-- puede distinguir "no fichó" de "el reporte todavía no llegó", que son
-- cosas distintas. El nuevo dice las dos: la persona no tiene marcaje
-- del reloj, y por eso hay que confirmarlo.
--
-- El viejo se conserva: hay avisos ya escritos con él, y borrarlos sería
-- perder el registro de lo que pasó.
alter table public.avisos_ingreso drop constraint if exists avisos_ingreso_tipo_check;
alter table public.avisos_ingreso
  add constraint avisos_ingreso_tipo_check
  check (tipo in ('no_marco','sin_respaldo_reloj','entrada_tarde','salida_temprana','otra'));

-- El índice único por (código, fecha, tipo) ya no sirve: con el tipo
-- nuevo, la misma persona y el mismo día puede tener un aviso del
-- supervisor y otro distinto que se agregue después, y el índice los
-- rechazaría. La unicidad que importa es "un aviso abierto por hecho", y
-- se garantiza con un índice parcial sobre las que están sin confirmar.
drop index if exists public.avisos_ingreso_unico_dia;
create unique index if not exists avisos_ingreso_unico_abierto
  on public.avisos_ingreso (code, fecha, tipo)
  where estado = 'enviado';

-- ------------------------------------------------------------
-- 3) SESIONES ABIERTAS, CON UNA SOLA DEFINICIÓN
-- ------------------------------------------------------------
-- "Entró y nunca se registró su salida". Es el dato que hay que mirar al
-- importar el reporte del día siguiente, y también el que la asistencia
-- diaria muestra como "salida pendiente".
--
-- Antes eso estaba escrito en dos lugares: una función en la app
-- (diasSinSalida) y el cálculo de la conciliación. Dos copias de la misma
-- regla es una esperando que se desincronicen. Acá queda UNA, y las dos
-- cosas la usan.
--
-- "dias_open" son los días abiertos: fechas con entrada y sin salida.
-- Se limita a días que ya pasaron, porque entrar y salir más tarde el mismo
-- día es normal y no es un problema a reportar.
create or replace function public.sesiones_abiertas(p_fecha date default current_date)
returns table (
  code text,
  nombre text,
  fecha date,
  hora_entrada time
)
language sql
stable
security definer
set search_path = public
as $$
  select t.code, t.name, m.fecha, m.hora
    from public.marcajes m
    join public.trabajadores t on t.code = m.code
   where m.tipo = 'entrada'
     and m.fecha < coalesce(p_fecha, current_date)
     and not exists (
       select 1 from public.marcajes s
        where s.code = m.code and s.tipo = 'salida' and s.fecha = m.fecha
     )
   order by m.fecha desc, t.code
$$;

-- ------------------------------------------------------------
-- 4) CONFIRMAR LOS AVISOS QUE EL RELOJ RESUELVE
-- ------------------------------------------------------------
-- Esto es lo que hace que el circuito se cierre solo.
--
-- Se llama DESPUÉS de importar el reporte, y confirma los avisos de días
-- anteriores que el reloj ahora respalda. Los que el reloj NO respalda
-- se quedan abiertos a propósito: ahí hay algo que mirar.
--
-- Que sea una función y no un bucle en la app es por dos razones: corre en
-- una transacción (o hace todo o no hace nada, y "a medias" en un circuito
-- de confirmaciones es lo peor que puede pasar), y se puede volver a
-- llamar sin efectos acumulativos.
create or replace function public.resolver_avisos_por_reloj()
returns table (
  confirmados integer,
  sin_respaldo integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmados integer := 0;
  v_sin integer := 0;
  r record;
begin
  for r in
    select a.id, a.code, a.fecha, m.hora
      from public.avisos_ingreso a
      join public.marcajes m
        on m.code = a.code and m.fecha = a.fecha and m.tipo = 'entrada'
     where a.estado = 'enviado'
       and a.tipo in ('no_marco','sin_respaldo_reloj')
       -- el respaldo tiene que ser del RELOJ, no de una persona: si el
       -- marcaje lo hizo alguien, no puede "confirmar" el aviso de que no
       -- lo tenía el reloj. Sería compararse consigo mismo.
       and m.origen in ('excel','reloj')
       -- solo días anteriores: el reporte de hoy recién llegó, y el día de
       -- hoy todavía puede cambiar.
       and a.fecha < current_date
  loop
    update public.avisos_ingreso
       set estado = 'confirmado',
           confirmado_automatico = true,
           confirmado_por_nombre = 'el reporte del reloj',
           confirmado_at = now(),
           comentario = 'El reporte del reloj registró la entrada a las ' || r.hora
                        || '. Confirmado solo, sin que nadie lo revisara.'
     where id = r.id;
    v_confirmados := v_confirmados + 1;
  end loop;

  -- Los que quedan abiertos: se cuentan para que la app lo diga, no para
  -- que se resuelvan. Un aviso que el reloj no respalda es exactamente el
  -- caso que necesita una persona.
  select count(*) into v_sin
    from public.avisos_ingreso a
   where a.estado = 'enviado'
     and a.tipo in ('no_marco','sin_respaldo_reloj')
     and a.fecha < current_date
     and not exists (
       select 1 from public.marcajes m
        where m.code = a.code and m.fecha = a.fecha
          and m.tipo = 'entrada' and m.origen in ('excel','reloj')
     );

  return query select v_confirmados, v_sin;
end $$;

-- ------------------------------------------------------------
-- 5) ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Autocontenida, como la 023 y la 025.
create or replace function public.es_usuario_activo(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles p where p.id = uid and p.activo)
$$;

create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfil_roles r
     where r.user_id = uid and r.rol = 'admin'
  )
$$;

create or replace function public.tiene_permiso(clave text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.perfil_roles pr
      join public.roles_permisos rp on rp.rol = pr.rol
     where pr.user_id = uid
       and rp.permiso = clave
  )
$$;

-- ------------------------------------------------------------
-- 6) COMPROBACIÓN DE SALUD
-- ------------------------------------------------------------
create or replace function public.diagnostico_respaldo_reloj()
returns table (
  origen_sistema_ok boolean,
  destino_ok boolean,
  sesiones_abiertas_ok boolean,
  politica_sistema_ok boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    -- "sistema" tiene que estar permitido en el check de origen, o el
    -- marcaje que hace RRHH va a rebotar con un 23514.
    exists (select 1 from pg_constraint
             where conname = 'marcajes_origen_check'
               and pg_get_constraintdef(oid) like '%sistema%'),
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'avisos_ingreso'
               and column_name = 'destino'),
    exists (select 1 from pg_proc
             where pronamespace = 'public'::regnamespace and proname = 'sesiones_abiertas'),
    -- El check de tipo tiene que aceptar el tipo nuevo.
    exists (select 1 from pg_constraint
             where conname = 'avisos_ingreso_tipo_check'
               and pg_get_constraintdef(oid) like '%sin_respaldo_reloj%')
$$;
