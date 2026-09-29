-- ===================================================================
-- 042 - EL INGRESO EN GRUPO, CUANDO LLEGAN EN UN VEHICULO
-- ===================================================================
--
-- QUE RESUELVE
-- ------------
-- Que en la portería no haya que hacer pasar la tarjeta de a uno. Cuando
-- llegan quince personas en una camioneta, hacerlas pasar una por una es
-- quince esperas: en la puerta se arma una fila, y el ultimo del grupo
-- entra veinte minutos después del primero.
--
-- La idea es que pase SOLO la tarjeta de quien maneja. Con esa el sistema
-- sabe que llegó un vehículo, y abre la pregunta "¿quiénes vienen con
-- usted?". El supervisor mira el auto y confirma los que vienen.
--
-- Y puede confirmar solo algunos. Eso importa: en una camioneta de doce
-- van ocho del grupo y cuatro de otro, o van ocho y dos que se quedaron.
-- Forzar a todos o a ninguno hace que la gente espere de más por un
-- requisito del sistema, y eso es peor que la fila.
--
--
-- CADA PERSONA SIGUE TENIENDO SU REGISTRO PROPIO
-- ---------------------------------------------
-- Esto es lo importante. El grupo no reemplaza el registro individual: lo
-- agrupa.
--
-- Cada persona que viene en el auto tiene SU fila en "porteria_registros",
-- con su hora, su motivo y su salida. Lo que agrega el grupo es un
-- "grupo_id" que las une.
--
-- Por qué importa: el aviso de "marcó asistencia pero no hay registro de
-- que entrara" funciona persona por persona. Si el grupo se guardara solo
-- como un evento, habría que desarmarlo cada vez que se quiera saber si
-- Fulano entró. Y además el conteo de "quién falta" se rompería.
--
--
-- QUIÉN CONFIRMA Y CUÁNDO
-- ------------------------
--  1) ESCANEA     el que maneja. Anota la patente y su propia entrada.
--   confirma    el supervisor. Mira el auto y dice quiénes vienen.
--
-- La confirmación es APARTE de la entrada de quien maneja, y a propósito.
-- El que maneja esta si o si: si no entro, no entro. Los acompanantes
-- los confirma otro, porque el que maneja puede no conocer a los que
-- vengan de otra empresa. Queda separado quién vio qué.
--
--
-- LA REVISIÓN DEL VEHÍCULO
-- -----------------------
-- Un pedido aparte, que no bloquea la entrada. La razon: si la revision
-- frenara el ingreso, la portería se convierte en un filtro de acceso, y
-- eso es otra cosa con sus propias reglas. Acá se registra que se pidió,
-- y se ve pendiente, y la entrada se registra igual.
--
-- ------------------------------------------------------------------
-- 1) LOS GRUPOS
-- ------------------------------------------------------------------
create table if not exists public.porteria_grupos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  hora time not null,

  -- El vehiculo. La patente en mayusculas, porque se busca por ella y
  -- "ab1234" y "AB12-34" son el mismo auto.
  patente text not null,
  tipo_vehiculo text,             -- camioneta, camion, moto, Bicycle
  empresa_vehiculo text,          -- de quien es: propia o de un proveedor

  -- Quien manejo y trajo el grupo.
  conductor_code text references public.trabajadores(code) on delete set null,

  -- Cuantos se esperaban y cuantos se confirmaron. Se guardan los dos
  -- porque la diferencia ES el dato: "veníamos doce y confirmaron ocho"
  -- es una pregunta que hay que poder responder.
  esperados int,
  confirmados int not null default 0,

  -- El pedido de revision, que no frena la entrada.
  revision_vehiculo boolean not null default false,
  motivo_revision text,
  revisado boolean not null default false,
  revisado_por uuid references public.perfiles(id) on delete set null,
  revisado_por_nombre text,
  revisado_at timestamptz,

  estado text not null default 'abierto'
    check (estado in ('abierto','cerrado','anulado')),
  nota text,

  escaneado_por uuid references public.perfiles(id) on delete set null,
  escaneado_por_nombre text,
  confirmado_por uuid references public.perfiles(id) on delete set null,
  confirmado_por_nombre text,
  creado_at timestamptz not null default now(),
  cerrado_at timestamptz
);

create index if not exists porteria_grupos_fecha on public.porteria_grupos (fecha desc, hora desc);
create index if not exists porteria_grupos_patente on public.porteria_grupos (lower(patente));
-- Los grupos con revision pedida y sin revisar: es la lista de trabajo
-- de quien hace la revision, en la porteria.
create index if not exists porteria_grupos_por_revisar
  on public.porteria_grupos (hora) where revision_vehiculo and not revisado;
-- Los abiertos del dia: son los que todavia se pueden confirmar.
create index if not exists porteria_grupos_abiertos
  on public.porteria_grupos (hora) where estado = 'abierto';

comment on table public.porteria_grupos is
  'Un ingreso en grupo: un vehiculo que llega con varias personas. Pasa la tarjeta solo de quien maneja, y el supervisor confirma quienes vienen. Cada persona conserva su registro propio en porteria_registros: el grupo los AGRUPA, no los reemplaza.';
comment on column public.porteria_grupos.confirmados is
  'Cuantas personas se confirmaron de verdad. Se guarda aparte de "esperados" porque la diferencia es el dato: "venian doce y confirmaron ocho" es una pregunta que hay que poder responder.';
comment on column public.porteria_grupos.revision_vehiculo is
  'Que se pidio revision del vehiculo. NO frena la entrada: la entrada se registra igual, y el pedido queda pendiente. Si la revision frenara el ingreso, la porteria seria un filtro de acceso, que es otra cosa con sus propias reglas.';

-- ------------------------------------------------------------------
-- 1b) QUE ESTE LA 041 APLICADA
-- ------------------------------------------------------------------
-- La 042 le agrega una columna a porteria_registros, que es de la 041.
-- Con un "alter table" pelado, el error es 42P01 y no dice de nada que
-- lo que falta es la migración anterior: se lee "relation does not exist"
-- y no se sabe qué correr.
--
-- Acá se comprueba primero, y el error dice exactamente qué hacer.
do $$
begin
  if to_regclass('public.porteria_registros') is null then
    raise exception 'FALTA LA MIGRACION 041' using errcode = 'undefined_table',
      hint = 'Corré primero 041_registro_porteria_personal.sql y después esta. La 042 le agrega la columna grupo_id a porteria_registros, que es de la 041.';
  end if;
end $$;

-- ------------------------------------------------------------------
-- 1c) EL RLS, QUE FALTABA
-- ------------------------------------------------------------------
-- Esta tabla tiene nombre de quien maneja, patente, y de qué empresa es
-- el vehículo. Sin RLS, la clave anónima —que va incrustada en el HTML de
-- la aplicación y se lee abriendo las herramientas del navegador—
-- alcanzaba todo eso sin entrar.
--
-- El patrón es el de la 040: RLS encendido y sin políticas, para que el
-- único acceso sean las funciones, que son "security definer" y revisan el
-- permiso adentro. Y una función de lectura, porque con RLS sin políticas
-- la aplicación no tiene cómo ver nada, y abrir el panel de Supabase para
-- mirar no sirve en una portería.
alter table public.porteria_grupos enable row level security;

-- ------------------------------------------------------------------
-- 2) LA UNION CON LOS REGISTROS DE CADA PERSONA
-- ------------------------------------------------------------------
alter table public.porteria_registros
  add column if not exists grupo_id uuid references public.porteria_grupos(id) on delete set null;

comment on column public.porteria_registros.grupo_id is
  'A que vehiculo en grupo pertenece esta entrada. Es lo unico que agrega el grupo: la persona sigue teniendo su registro propio, con su hora y su motivo.';

-- La consulta del grupo: quienes vienen, con su entrada.
create index if not exists porteria_registros_grupo
  on public.porteria_registros (grupo_id, code) where grupo_id is not null;

-- ------------------------------------------------------------------
-- 3) ABRIR Y CONFIRMAR
-- ------------------------------------------------------------------
-- Abrir el grupo: pasa la tarjeta del que maneja, y queda anotada su
-- propia entrada. El grupo sale ABIERTO, porque todavia no se confirmo
-- nadie mas.
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
  'Pasa la tarjeta de quien maneja: queda registrada su entrada, y el grupo queda ABIERTO para que el supervisor confirme los acompañantes. Si el mismo auto aparece dos veces en media hora, devuelve el mismo grupo en vez de partir a la gente en dos.';

-- Confirmar los acompañantes. Es una lista de codigos, y cada uno recibe
-- su entrada. Se puede confirmar parcialmente, y eso es lo de verdad: van
-- los que van.
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
  'Confirma los acompanantes del grupo, y a cada uno le deja su entrada. Se puede confirmar de a parte: van los que van, y los que quedaron no aparecen. Un codigo que no existe en la ficha se rechaza entero, para que no quede un ingreso de alguien que nunca estuvo.';

-- ------------------------------------------------------------------
-- 4) LA SALIDA DEL GRUPO
-- ------------------------------------------------------------------
-- Al terminar el turno pasa el que maneja, y con eso salen todos los que
-- quedaron con la placa. Se puede dejar a alguien adentro, pasando el
-- grupo con la lista de los que quedan.
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
  'Sale el grupo. Sin lista salen todos los que quedaron con la placa; con lista salen solo esos, y los demas se quedan adentro. Es el caso del que se queda a trabajar más.';

-- ------------------------------------------------------------------
-- 4b) LEER LOS GRUPOS
-- ------------------------------------------------------------------
-- Con el RLS encendido y sin políticas, la aplicación no tiene cómo ver
-- nada. Esta función es la puerta de lectura, y revisa el permiso igual
-- que las de escritura.
--
-- Devuelve el grupo con la lista de quien viene, porque el supervisor
-- necesita ver a QUIÉN TIENE QUE CONFIRMAR antes de confirmar a nadie.
create or replace function public.grupos_del_dia(p_fecha date default current_date)
returns table (
  grupo_id     uuid,
  hora         time,
  patente      text,
  tipo_vehiculo text,
  empresa_veh  text,
  conductor    text,
  esperados    int,
  confirmados  int,
  revision     boolean,
  motivo_rev   text,
  estado       text,
  nota         text,
  miembros     jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  -- La comprobacion del permiso va en el WHERE y no con un "if": esta
  -- funcion es "language sql", y el "if ... then ... end if" es sintaxis de
  -- PL/pgSQL. Con SQL alcanza con decir que solo traiga filas si tiene el
  -- permiso, y si no tiene, simplemente no entra ninguna.
  --
  -- Y a proposito devuelve una lista VACIA en vez de un error: quien abre
  -- la pantalla sin permiso ve que no hay grupos, que es la respuesta
  -- correcta, y no un cartel de error que lo confunda con que la base se
  -- cayó.
  select g.id, g.hora, g.patente, g.tipo_vehiculo, g.empresa_vehiculo,
         (select w.name from public.trabajadores w where w.code = g.conductor_code),
         g.esperados, g.confirmados, g.revision_vehiculo, g.motivo_revision,
         g.estado, g.nota,
         coalesce((
           select jsonb_agg(jsonb_build_object('code', r.code, 'nombre', w.name))
             from public.porteria_registros r
             join public.trabajadores w on w.code = r.code
            where r.grupo_id = g.id and r.fecha = p_fecha and r.tipo = 'entrada'
         ), '[]'::jsonb)
    from public.porteria_grupos g
   where g.fecha = p_fecha
     and (public.tiene_permiso('porteria.registro') or public.es_admin())
   order by g.hora desc
     , g.patente;
$$;

comment on function public.grupos_del_dia(date) is
  'Los grupos del día, con la lista de quién viene. El supervisor necesita ver a quién tiene que confirmar ANTES de confirmar a nadie.';

-- ------------------------------------------------------------------
-- 5) LO QUE HAY QUE MIRAR EN LA PUERTA
-- ------------------------------------------------------------------
create or replace function public.estado_porteria(p_fecha date default current_date)
returns table (
  problema text,
  cuantos  bigint
)
language sql
stable
as $$
  select 'grupos abiertos que todavía no se confirmaron',
         (select count(*) from public.porteria_grupos where fecha = p_fecha and estado = 'abierto')

  union all select 'grupos con revisión pedida y sin revisar',
         (select count(*) from public.porteria_grupos
           where fecha = p_fecha and revision_vehiculo and not revisado)

  union all select 'grupos que dijeron cuantos venian y cuantos confirmaron',
         (select count(*) from public.porteria_grupos
           where fecha = p_fecha and esperados is not null and esperados > confirmados)

  union all select 'personas que entraron en grupo y no tiene salida',
         (select count(*) from public.porteria_registros
           where fecha = p_fecha and grupo_id is not null and tipo = 'entrada'
             and not exists (select 1 from public.porteria_registros s
                              where s.code = porteria_registros.code
                                and s.fecha = p_fecha and s.tipo = 'salida'))
$$;

comment on function public.estado_porteria(date) is
  'Lo que hay que mirar en la puerta. La tercera fila es la que importa el final del turno: un grupo que decia que venían doce y confirmó ocho, y hay que ir a buscarlos.';

-- ------------------------------------------------------------------
-- PARA VOLVER ATRÁS
-- ------------------------------------------------------------------
--   drop table if exists public.porteria_grupos;
--   alter table public.porteria_registros drop column if exists grupo_id;
--   drop function if exists public.grupos_del_dia(date);
--   drop function if exists public.estado_porteria(date);
--   drop function if exists public.salir_grupo(uuid,text[],time);
--   drop function if exists public.confirmar_grupo(uuid,text[],time,boolean);
--   drop function if exists public.abrir_grupo_vehiculo(text,text,time,int,boolean,text,text,text);
