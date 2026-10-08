-- ===================================================================
-- 086_permisos_horarios.sql
-- ===================================================================
-- PERMISOS CON HORA: "LLEGA A LAS 11:00"
--
-- ---------------------------------------------------------------------
-- QUÉ ES ESTO Y POR QUÉ NO ES "UNA SOLICITUD DE CAMBIO DE ESTADO"
-- ---------------------------------------------------------------------
--
-- Porque hay tres cosas distintas y se están confundiendo:
--
--   aviso de marcaje       "marcó entrada tarde". El reloj lo dice, y el
--                          supervisor lo asienta. Es un HECHO, no una decisión.
--
--   cambio de estado       "cámbiale la P por la X". Cambia una casilla de la
--                          planilla. Ya existe: solicitudes_cambio_asistencia.
--
--   permiso con hora       "se le va hasta las 14:00". NO cambia la casilla:
--                          el día sigue en X, porque estuvo. Lo que se registra
--                          es una EXCEPCIÓN de horario, y por eso va aparte.
--
-- Y por qué "el día queda X", que es la decisión que se tomó
--
-- Porque con las ocho casillas de "asistencia", un permiso de medio día no tiene
-- forma de escribirse: o el día entero pasa a "P", y entonces el día dice que
-- estuvo con permiso cuando en realidad trabajó cuatro horas; o no se registra, y el
-- tiempo que se le descontó no queda en ningún lado.
--
-- Con el permiso aparte, el día dice la verdad —"estuvo"— y la excepción dice lo
-- otro —"de 11:00 a 14:00 no estuvo"—. Y las dos se pueden consultar juntas.
--
-- ---------------------------------------------------------------------
-- POR QUÉ NO SE REUSA "avisos_ingreso", QUE YA TIENE "hora_reloj"
-- ---------------------------------------------------------------------
--
-- Porque "hora_reloj" es la hora de una MARCACIÓN: cuándo fichó. Un permiso es
-- otra cosa: una franja que empieza a las 11:00 y termina a las 14:00, que no
-- tiene marcación que la describa. Meter las dos cosas en la misma tabla con un
-- "tipo" es el começo de una tabla donde cada consulta nueva tiene que filtrar
-- por un texto para no leer la fila que no es.
--
-- ---------------------------------------------------------------------
-- Y LOS ESTADOS, Y POR QUÉ "PENDIENTE" ES EL PRIMERO
-- ---------------------------------------------------------------------
--
--     pendiente    el supervisor lo propuso y nadie lo ha resuelto
--     confirmado   RRHH lo aceptó
--     anulado      RRHH lo rechazó
--
-- Y "pendiente" es el estado por defecto, no por capricho: un permiso que alguien
--acceptable y nadie miró es exactamente el caso que hay que ver en pantalla. Si el
-- defecto fuera "confirmado", un permiso aparecería aplicado antes de que nadie lo
-- viera, que es el peor defecto posible para un permiso.
--
-- Y NO HAY UN ESTADO "APLICADO", Y POR QUÉ
--
-- Porque el permiso NUNCA cambia la planilla. El día queda en "X" siempre. El
-- permiso es un registro aparte que se lee junto a la planilla, no algo que la
-- modifique. Si alguna vez tiene que escribir en la planilla, ese día va a ser un
-- "cambio de estado" con su aprobación, que ya existe, y no un permiso con hora.

begin;

-- ---------------------------------------------------------------------
-- LA TABLA
-- ---------------------------------------------------------------------
create table if not exists public.permiso_horario (
  id serial primary key,

  -- Y LA PERSONA, Y POR QUÉ ES "code" Y NO UN "trabajador_id"
  --
  -- Porque "trabajadores" tiene "code" como clave y todo lo demás cuelga de ahí:
  -- "asistencia", "marcajes", "tarjetas", "avisos_ingreso". Una tabla con un id
  -- propio obliga a mirar el código entero para poder cruzarla con cualquiera de
  -- las otras, y el día que aparezca un id distinto queda la conversión que nadie
  -- revisa.
  code text not null references public.trabajadores(code) on delete cascade,

  -- Y EL DÍA, QUE ES EL DÍA DE LA ASISTENCIA Y NO OTRO
  fecha date not null,

  -- Y LA FRANJA DEL PERMISO
  --
  -- "hora_inicio" y "hora_fin" son horas, no fechas. Un permiso que empieza el
  -- lunes a las 11:00 y termina el martes a las 2 de la mañana no es un permiso, es
  -- un horario roto. Guardar la hora sola, con el día en su columna, hace que eso
  -- sea imposible de escribir.
  --
  -- Y LAS DOS SON OBLIGATORIAS, PORQUE UN PERMISO SIN UNA DE LAS DOS NO TIENE
  -- SENTIDO
  hora_inicio time not null,
  hora_fin    time not null,

  -- Y POR QUÉ EL FIN TIENE QUE SER DESPUÉS DEL COMIENZO
  --
  -- Sin esto, "de 14:00 a 11:00" se guarda y las horas dan NEGATIVAS. Y un resumen
  -- que dice "-3 horas de permiso" es un dato que hay que leer dos veces.
  --
  -- Y ES UNA REGLA DE LA BASE, NO DEL PANTALLA: el formulario se puede saltarse, un
  -- "insert" a mano no.
  constraint permiso_horario_fin_despues check (hora_fin > hora_inicio),

  -- Y POR QUÉ EL MOTIVO ES OBLIGATORIO
  --
  -- Porque un permiso sin motivo es una excepción que nadie puede defender. Se
  -- permite que el motivo sea corto, no que no exista.
  motivo text not null,

  -- Y EL ESTADO, CON SU LISTA CERRADA
  estado text not null default 'pendiente'
    check (estado in ('pendiente','confirmado','anulado')),

  -- Y QUIÉN LO PIDIÓ, CON SU NOMBRE Y SU ROL
  --
  -- El nombre y el rol se guardan APARTE del "uuid". Porque un "perfil" se puede
  -- borrar, y un permiso sin nombre es un permiso que no se puede auditar. Es el
  -- mismo criterio de "asistencia_auditoria".
  pedido_por         uuid references public.perfiles(id) on delete set null,
  pedido_por_nombre text,
  pedido_por_rol    text,

  -- Y QUIÉN LO RESOLVIÓ, Y CUÁNDO
  --
  -- Con "confirmado_at" en vez de un "modificado_en": la hora en que se resolvió
  -- es parte de la respuesta a "cuánto tarda RRHH en ver esto", que es una pregunta
  -- que se va a hacer.
  confirmado_por         uuid references public.perfiles(id) on delete set null,
  confirmado_por_nombre text,
  confirmado_at          timestamptz,

  -- Y EL COMENTARIO DE QUIEN RESOLVIÓ, QUE ES DISTINTO DEL MOTIVO
  --
  -- El motivo es del supervisor; el comentario es de quien dijo que sí o que no. Si
  -- van en el mismo campo, un "no" con el motivo del supervisor es indistinguible
  -- de un "sí" con su motivo.
  comentario text,

  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- LOS ÍNDICES, Y CUALES SON DE VERDAD
-- ---------------------------------------------------------------------
--
-- Y EL DEL DÍA Y LA PERSONA, QUE ES LA CONSULTA QUE SE HACE TODO EL DÍA
--
-- La vista de permisos y el resumen del día preguntan "qué permisos tiene esta
-- gente hoy". Sin este índice, cada pregunta es un recorrido de la tabla.
create index if not exists permiso_horario_dia
  on public.permiso_horario (fecha, code);

-- Y EL DE LOS PENDIENTES, QUE ES LA LISTA DE TRABAJO DE RRHH
--
-- Un índice con parte de una condición ("where") solo se usa si la consulta trae
-- la misma condición. Y la de la lista de trabajo la trae: "los pendientes de hoy".
-- Un índice entero acá no ayudaría a esa consulta, porque no se puede indexar una
-- columna que no está en el índice.
create index if not exists permiso_horario_pendientes
  on public.permiso_horario (fecha)
  where estado = 'pendiente';

-- Y EL ÚNICO ÍNDICE ÚNICO, Y ES EL QUE PROTEGE
--
-- "Una persona, un permiso, el mismo día y a la misma hora, no se repite."
--
-- Y POR QUÉ SÓLO PARA LOS PENDIENTES Y CONFIRMADOS, Y NO PARA TODOS
--
-- Porque un permiso ANULADO sí se puede volver a pedir para el mismo horario. Si el
-- índice fuera sobre los tres estados, un permiso rechazado no se podría volver a
-- pedir nunca, y el que lo rechazó hace un rato queda sin arreglo.
--
-- Y POR QUÉ UNA COMPROBACIÓN DE SOLAPAMIENTO EN VEZ DE SOLO ESTE ÍNDICE
--
-- Porque este índice impide el duplicado exacto, pero no el solapado: "de 11:00 a
-- 14:00" y "de 13:00 a 16:00" son distintos y se pueden guardar los dos. Y dos
-- permisos que se pisan son un día con dos ausencias que se cuentan dos veces. Eso
-- no lo agarra un índice, lo agarra la función de pedir, más abajo.
create unique index if not exists permiso_horario_no_repetido
  on public.permiso_horario (code, fecha, hora_inicio, hora_fin)
  where estado <> 'anulado';

-- ---------------------------------------------------------------------
-- LA AISLAMIENTO: RLS
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ NO SE USA "empresa_id", QUE ES LO QUE PIDEN OTRAS TABLAS
--
-- Porque "permiso_horario" cuelga de "code", y "code" cuelga de "trabajadores", que
-- ya tiene su "empresa_id" y su política por empresa. Es el mismo criterio con el
-- que "014_multi_empresa.sql" decidió NO agregar empresa_id a "asistencia": filtrar
-- la lista de trabajadores ya acota todo lo que cuelga de ellos.
--
-- Y por lo tanto la lectura es la MISMA expresión de "trabajadores", que ya está
-- probada. No es una política nueva: es la de siempre, aplicada a otra fila.
alter table public.permiso_horario enable row level security;

drop policy if exists "permiso horario por empresa read" on public.permiso_horario;
create policy "permiso horario por empresa read" on public.permiso_horario for select
  using ( public.es_admin()
    or exists (select 1
                 from public.trabajadores t
                 join public.perfil_empresas pe on pe.empresa_id = t.empresa_id
                where t.code = permiso_horario.code
                  and pe.user_id = auth.uid()) );

-- ---------------------------------------------------------------------
-- LAS DOS FUNCIONES, Y POR QUÉ NO SE ESCRIBE DIRECTO EN LA TABLA
-- ---------------------------------------------------------------------
--
-- Porque el permiso de escribir es lo que decide, y tiene que estar en la base. Si
-- la escritura se hiciera con un "insert" normal, haría falta una política que
-- aceptara a cualquiera con permiso, y entonces un "update" podría cambiar la hora
-- de un permiso ya confirmado sin que nadie lo notara.
--
-- Con funciones, la base comprueba el permiso, guarda QUIEN lo pidió y en qué
-- estado, y no hay camino para saltárselo.

-- ---------------------------------------------------------------------
-- PEDIR UN PERMISO
-- ---------------------------------------------------------------------
create or replace function public.pedir_permiso_horario(
  p_code        text,
  p_fecha       date,
  p_hora_inicio time,
  p_hora_fin    time,
  p_motivo      text,
  p_comentario  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_motivo text;
begin
  -- Y EL PERMISO: EL DE MARCAR, QUE ES EL DEL SUPERVISOR
  if not (public.es_usuario_activo() or public.es_admin()
          or public.tiene_permiso('tarja.marcaje')) then
    raise exception 'No tienes permiso para pedir permisos horarios'
      using errcode = '42501';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if v_motivo = '' then
    raise exception 'Falta el motivo del permiso. Un permiso sin motivo no se puede defender.'
      using errcode = '22023';
  end if;

  -- Y QUE LA HORA DE FIN VENGA DESPUÉS, QUE TAMBIÉN ESTÁ EN EL "CHECK"
  --
  -- Se repite acá para que el error diga qué pasó, en vez de que salga el error del
  -- "check", que dice "violates check constraint" y no dice que la hora está al
  -- revés. El "check" queda igual: es el que impide el "insert" a mano.
  if p_hora_fin is null or p_hora_inicio is null then
    raise exception 'Faltan las horas del permiso' using errcode = '22023';
  end if;
  if p_hora_fin <= p_hora_inicio then
    raise exception 'La hora de fin tiene que ser posterior a la de inicio'
      using errcode = '22023';
  end if;

  -- Y QUE NO SE PISE CON OTRO PERMISO DEL MISMO DÍA
  --
  -- Y POR QUÉ ESTO NO LO HACE UN ÍNDICE
  --
  -- El índice único de más abajo impide el duplicado exacto, pero no que dos
  --=franjas| se pisen: "11:00 a 14:00" y "13:00 a 16:00" son distintas y entran
  -- las dos. Y un día con dos ausencias que se pisan es un día con horas contadas
  -- dos veces, que es el error más caro de una planilla porque no se ve.
  --
  -- La comparación es "el inicio del nuevo está antes del fin del viejo, Y el fin
  -- del nuevo está después del inicio del viejo". Con horas, no con "overlap": en
  -- SQL el "overlap" es para "tsrange" y este proyecto no usa rangos en las horas.
  if exists (select 1 from public.permiso_horario ph
              where ph.code = p_code
                and ph.fecha = p_fecha
                and ph.estado <> 'anulado'
                and p_hora_inicio < ph.hora_fin
                and p_hora_fin > ph.hora_inicio) then
    raise exception 'Ese horario se pisa con un permiso que ya existe para ese día'
      using errcode = '22023';
  end if;

  insert into public.permiso_horario (
    code, fecha, hora_inicio, hora_fin, motivo, estado,
    pedido_por, pedido_por_nombre, pedido_por_rol, comentario
  )
  values (
    p_code, p_fecha, p_hora_inicio, p_hora_fin, v_motivo, 'pendiente',
    auth.uid(),
    (select nombre from public.profiles where id = auth.uid()),
    (select rol from public.perfiles where id = auth.uid()),
    nullif(btrim(coalesce(p_comentario, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.pedir_permiso_horario(text,date,time,time,text,text)
  to authenticated;

-- ---------------------------------------------------------------------
-- RESOLVER UN PERMISO
-- ---------------------------------------------------------------------
create or replace function public.resolver_permiso_horario(
  p_id       uuid,
  p_acepta   boolean,
  p_comentario text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Y EL PERMISO DE RESOLVER ES OTRO, Y DISTINTO DEL DE PEDIR
  --
  -- Es "tarja.aprobar_cambio", el mismo que usa "solicitudes_cambio_asistencia" y
  -- el que confirma los avisos de ingreso. Y es a propósito que sea otro: con el
  -- mismo, un supervisor podría aprobarse a sí mismo el permiso que acaba de pedir,
  -- y entonces el circuito de "alguien tiene que revisarlo" no revisaría nada.
  if not (public.es_admin() or public.tiene_permiso('tarja.aprobar_cambio')) then
    raise exception 'Solo quien puede aprobar cambios resuelve los permisos horarios'
      using errcode = '42501';
  end if;

  -- Y SOLO SE RESUELVE UNA VEZ
  if not exists (select 1 from public.permiso_horario
                  where id = p_id and estado = 'pendiente') then
    raise exception 'Ese permiso ya fue resuelto' using errcode = '22023';
  end if;

  update public.permiso_horario
     set estado = case when p_acepta then 'confirmado' else 'anulado' end,
         confirmado_por = auth.uid(),
         confirmado_por_nombre = (select nombre from public.profiles where id = auth.uid()),
         confirmado_at = now(),
         comentario = nullif(btrim(coalesce(p_comentario, '')), '')
   where id = p_id;
end;
$$;

grant execute on function public.resolver_permiso_horario(uuid,boolean,text)
  to authenticated;

-- ---------------------------------------------------------------------
-- LOS COMENTARIOS
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ UNA TABLA CUYA REGLA PRINCIPAL NO ESTÁ EN LA TABLA NECESITA
-- COMENTARIOS LARGUOS
--
-- La regla principal es "el día de la asistencia sigue en X". Eso no está en
-- ninguna columna: está en que NO hay columna que la cambie. Sin este comentario,
-- alguien abre la tabla, ve que no toca "asistencia", y concludes que es una tabla
-- más de avisos sin importancia.
comment on table public.permiso_horario is
  'Permisos con hora. NO cambia la planilla: el dia de "asistencia" queda en "X" porque la persona estuvo. Esto registra la EXCEPCION de horario: de 11:00 a 14:00 no estuvo. Se lee JUNTO a la planilla, no la reemplaza. Estados: pendiente, confirmado, anulado. Ver js/permisos-horarios.js.';
comment on column public.permiso_horario.motivo is
  'Por que se da el permiso. Obligatorio: un permiso sin motivo no se puede defender despues.';
comment on column public.permiso_horario.estado is
  'pendiente = nadie lo ha mirado. confirmed = RRHH lo acepto. anulado = rechazado, y se puede volver a pedir.';
comment on column public.permiso_horario.hora_inicio is
  'Hora, no fecha. El dia va en su propia columna, asi que "de 11:00 a 14:00" es lo unico que se puede escribir.';

commit;

-- ---------------------------------------------------------------------
-- LO QUE HAY QUE CORRER DESPUÉS
-- ---------------------------------------------------------------------
--
--   node tools/comprueba-parentesis.js
--   migrations/scripts/comprobar-086-permisos-horarios.sql
--
-- Y la comprobación tiene que decir, ademas de que las columnas estan, CUANTOS
-- permisos hay y cuantos siguen pendientes. Una tabla de permisos vacia es
-- exactamente lo que se espera el primer dia, y no es un error: es la pantalla
-- todavia sin nada que mostrar.
--
-- Y PARA VOLVER ATRÁS
--
--   drop table if exists public.permiso_horario cascade;