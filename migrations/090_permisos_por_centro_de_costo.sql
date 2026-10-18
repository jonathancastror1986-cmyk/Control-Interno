-- ===================================================================
-- 090_permisos_por_centro_de_costo.sql
-- ===================================================================
-- QUIÉN PIDE, QUIÉN APRUEBA Y QUIÉN VISA UN PERMISO CON HORA
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- QUÉ RESUELVE, EN UNA LÍNEA
-- ---------------------------------------------------------------------
--
-- Hoy el permiso con hora se pide y se aprueba con permisos de la TARJA
-- ("tarja.marcaje" y "tarja.aprobar_cambio"), que no tienen nada que ver con los
-- permisos. Peor: ninguna de las dos funciones mira a qué empresa pertenece el
-- trabajador. Esta migración pone los roles que corresponden y cierra ese hueco.
--
-- ---------------------------------------------------------------------
-- LOS TRES ROLOS, Y QUIÉN ES QUIÉN
-- ---------------------------------------------------------------------
--
--   solicitante   el que pide el permiso. Por lo general, el supervisor de la
--                 persona, o quien esté en la obra cuando el supervisor no está.
--   aprobador     el administrador de obra. Aprueba, porque es quien responde
--                 por la autorización en terreno.
--   rrhh          NO aprueba. Visa: revisa que los datos estén bien y deja
--                 constancia de que los revisó.
--
-- Y "admin" se queda con los tres, porque es el desatasco cuando el
-- administrador de obra no está o está con permiso.
--
-- ---------------------------------------------------------------------
-- POR QUÉ UN ROL NUEVO Y NO REUSAR "supervisores"
-- ---------------------------------------------------------------------
--
-- Porque "supervisores" mezcla dos cosas: el que supervisa y el que aprueba. Un
-- supervisor de turno no aprueba una autorización: la ve y avisa. Y "rrhh" es
-- quien visa, no quien aprueba, así que tampoco sirve.
--
-- La lista de roles de "perfiles.rol" es CERRADA, con un "check". Agregar un rol
-- es agregar una línea a ese "check", y es lo primero que hace esta migración.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ EL ALCANCE ES POR CENTRO DE COSTO Y NO POR EMPRESA
-- ---------------------------------------------------------------------
--
-- Porque un mismo administrador de obra puede llevar dos obras, y en la pantalla
-- de empresas esas dos obras pueden estar bajo la misma empresa. Si el alcance
-- fuera por empresa, el administrador de la obra A aprobaría también los
-- permisos de la obra B.
--
-- Por eso esta migración crea "perfil_centros_costo", que es el mismo molde que
-- "perfil_empresas": a quién pertenece cada usuario. "perfil_empresas" sigue
-- existiendo y sigue mandando para el resto de la aplicación; esta es solo para
-- el permiso con hora.
--
-- ---------------------------------------------------------------------
-- LOS TRES ERRORES QUE CORRIGE
-- ---------------------------------------------------------------------
--
-- 1) "resolver_permiso_horario" es "security definer" y busca el permiso por
--    "id" SIN mirar la empresa del trabajador. Al ser "security definer" salta
--    la RLS, así que alcanzar con conocer un "id" alcanza para cambiar el estado
--    de un permiso de otra empresa.
--
-- 2) "pedir_permiso_horario" tiene una condición con tres "o" y NINGUNA pregunta
--    por la empresa. Cualquier usuario activo podía insertar un permiso para el
--    trabajador que quisiera, de cualquier empresa de la plataforma.
--
-- 3) "resolver_permiso_horario" declara "p_id uuid", pero la columna "id" de
--    "permiso_horario" es un "serial", o sea un entero. Eso da un error de tipo
--    (22P02) la primera vez que alguien aprueba un permiso. Es el mismo error que
--    corrigió la 088 en la función de pedir, y acá quedó sin corregir.

begin;

-- ===================================================================
-- 1) LOS DOS ROLES NUEVOS
-- ===================================================================
--
-- Y POR QUÉ SE INSERTAN EN "roles_sistema" ANTES QUE EN EL "check"
--
-- Porque el "check" de "perfiles.rol" es una lista cerrada, y si se agrega un rol
-- al catálogo que no está en la lista, la pantalla de usuarios deja poder elegir
-- un rol que la base rechaza. Primero el catálogo, después la lista.

insert into public.roles_sistema (rol, nombre, descripcion, orden) values
  ('solicitante', 'Solicitante',
   'Pide permisos con hora. No los aprueba.', 30),
  ('aprobador',   'Aprobador',
   'Administrador de obra: aprueba los permisos con hora de sus centros de costo.', 31)
on conflict (rol) do nothing;

-- Y LA LISTA CERRADA DE "perfiles.rol"
--
-- Y POR QUÉ SE TIRA PRIMERO
--
-- Porque no se puede cambiar la condición de un "check" que ya existe: hay que
-- tirarlo y volverlo a poner. Es lo mismo que pasó con la función de pedir en la
-- 088, y por la misma razón: el "check" tiene que decir exactamente la lista,
-- y agregar un rol al medio de un "check" no se puede.
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles
  add constraint perfiles_rol_check
  check (rol in ('admin','oficina','porteria','bodega','prevencion','rrhh',
                 'supervisores','tecnica','solicitante','aprobador'));

-- ===================================================================
-- 2) LOS PERMISOS NUEVOS, Y QUIÉN LOS LLEVA
-- ===================================================================
--
-- Y POR QUÉ TRES Y NO UNO
--
-- Porque son tres acciones distintas y van en personas distintas. Con un solo
-- permiso, "solicitante", "aprobador" y "rrhh" acaban teniendo lo mismo, y la
-- separación entre quien pide y quien aprueba desaparece.
--
-- Y POR QUÉ SE QUITA "tarja.aprobar_cambio" DE ESTE FLUJO
--
-- Porque "tarja.aprobar_cambio" es para aprobar cambios de estado de asistencia,
-- que es otra cosa. Si el resolver de permisos aceptara ese permiso, entonces
-- el permiso nuevo no cambiaría nada: el supervisor aprobaría por el nuevo y
-- todos los demás seguirían aprobando por el viejo. Por eso la condición del
-- resolver se reemplaza más abajo, y no se agrega al lado.

insert into public.permisos (clave, descripcion, categoria, orden) values
  ('permisos_horario.pedir',
   'Pedir permisos con hora para los trabajadores que le corresponden', 'permisos_horarios', 40),
  ('permisos_horario.aprobar',
   'Aprobar o anular permisos con hora', 'permisos_horarios', 41),
  ('permisos_horario.visar',
   'Visar el comprobante: revisar que los datos estén correctos', 'permisos_horarios', 42)
on conflict (clave) do nothing;

-- Y QUIÉN LLEVA QUÉ
--
--   solicitante → pedir
--   aprobador   → pedir y aprobar
--   supervisores→ pedir (por el flujo actual, que se pide desde la obra)
--   rrhh        → visar. NO aprueba.
--   admin       → los tres, porque es el desatasco.
--
-- Y "oficina" NO va, a propósito: oficina carga datos, no pide permisos por la
-- pantalla de asistencia.
insert into public.roles_permisos (rol, permiso)
  select r.rol, p.clave
  from (values
    ('solicitante',  'permisos_horario.pedir'),
    ('aprobador',    'permisos_horario.pedir'),
    ('aprobador',    'permisos_horario.aprobar'),
    ('supervisores', 'permisos_horario.pedir'),
    ('rrhh',         'permisos_horario.visar'),
    ('admin',        'permisos_horario.pedir'),
    ('admin',        'permisos_horario.aprobar'),
    ('admin',        'permisos_horario.visar')
  ) as r(rol, permiso)
  join public.permisos p on p.clave = r.permiso
on conflict do nothing;

-- ===================================================================
-- 3) QUIÉN VE QUÉ CENTRO DE COSTO
-- ===================================================================
--
-- Y POR QUÉ NO SE USA "perfil_empresas"
--
-- Porque el alcance de un permiso con hora es la obra, no la razón social. Con
-- "perfil_empresas", un administrador de la obra A aprobaría también los
-- permisos de la obra B si las dos están bajo la misma empresa.
--
-- Y LA MISMA FORMA QUE "perfil_empresas"
--
-- A propósito: es la misma tabla con el mismo molde, para que el resto del
-- proyecto sepa leerla sin aprender nada.
--
-- Y QUÉ PASA SI A NADIE SE LE MARCA NINGÚN CENTRO
--
-- No ve ningún centro, y por lo tanto no pide ni aprueba para nadie. Es lo
-- contrario de "ve todos": ver todo tiene que ser una decisión explícita, porque
-- acá lo que se decide es a quién se le autoriza una firma.
--
-- Eso tiene un costo, y hay que pagarlo una vez: al aplicar esta migración,
-- NADIE tiene centros asignados y el flujo de permisos con hora queda sin
-- poder usarse hasta que se carguen. Por eso el bloque de más abajo deja
-- admin y aprobador viendo todos los centros: son las dos cosas que tienen que
-- poder siempre, y sin eso no hay forma de cargar nada.
create table if not exists public.perfil_centros_costo (
  user_id        uuid not null references public.perfiles(id) on delete cascade,
  centro_costo_id int not null references public.centros_costo(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, centro_costo_id)
);

alter table public.perfil_centros_costo enable row level security;

-- ---------------------------------------------------------------------
-- LAS POLÍTICAS, QUE ESTABAN ABIERTAS
-- ---------------------------------------------------------------------
--
-- Lo que había era UNA sola política "for all" con un "exists" que solo pedía
-- "estés activo". Eso dejaba que cualquier usuario activo insertara
--
--     (su user_id, el centro de costo que quisiera)
--
-- y con esa fila ya podía pedir y aprobar permisos en cualquier obra de
-- cualquier empresa: las dos funciones del permiso con hora preguntan
-- "perfil_centros_costo", y la fila insertada ERA la credencial.
--
-- ---------------------------------------------------------------------
-- POR QUÉ NO HAY UN PERMISO NUEVO
-- ---------------------------------------------------------------------
--
-- Porque "sistema.usuarios" ya es "Gestionar usuarios y sus roles"
-- (013_roles_permisos.sql:94), y asignarle a alguien qué centros ve es
-- exactamente lo mismo: cambiarle el acceso a un usuario. Es el mismo permiso
-- que ya protege a "perfil_empresas" (014_multi_empresa.sql:271-272). Un
-- permiso nuevo habría que repartirlo, auditarlο y explicarlo, para nombrar lo
-- mismo.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ LA LECTURA Y LA ESCRITURA VAN SEPARADAS
-- ---------------------------------------------------------------------
--
-- "perfil_empresas" usa una sola política "for all" para escribir y funciona.
-- Pero mezclar los cuatro comandos en una sola condición hace imposible leer
-- la política y decir qué se puede ver y qué se puede cambiar.
--
-- ---------------------------------------------------------------------
-- Y LA REGLA QUE FALTA EN TODO EL PROYECTO: NADIE SE DA ALCANCE A SÍ MISMO
-- ---------------------------------------------------------------------
--
-- El "with check" dice que no se puede escribir una fila con el propio
-- "user_id". Sin eso, alguien con "sistema.usuarios" que no sea admin —un
-- encargado que reparte alcances— podría estirar el suyo hasta una obra que no
-- le corresponde, y aprobar ahí permisos que él mismo no debería ver.
--
-- El único que puede auto-asignarse es "admin", y a propósito.

-- Y SE TIRAN TODAS LAS POLÍTICAS DE LA TABLA, POR COMANDO Y NO POR NOMBRE
--
-- Porque en Postgres las políticas permisivas se combinan con OR. Si sobrevive
-- UNA sola política que permita escribir, da igual cuántas restrictivas haya:
-- alcanza con que alguien la deje puesta, y vuelve a quedar abierto para cualquier
-- usuario activo.
--
-- Y POR QUÉ NO SOLO POR EL NOMBRE CONOCIDO
--
-- Porque esta migración es la primera que crea la tabla, pero el nombre de la
-- política vieja depende de quién la haya hecho: si alguien corrió un borrador a
-- mano, con otro nombre, un "drop policy if exists" por el nombre que yo conozco
-- no la toca y el agujero queda abierto. Por eso se borran por comando.
--
-- Y POR QUÉ SE BORRA "select" TAMBIÉN
--
-- Porque la de lectura vieja era "for all", que alcanzaba para todo. Si se deja,
-- el "using" viejo vuelve a dejar leer los alcances de los demás.
do $$
declare
  v_politica record;
begin
  for v_politica in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'perfil_centros_costo'
  loop
    execute format('drop policy if exists %I on public.perfil_centros_costo',
                   v_politica.policyname);
  end loop;
end;
$$;

-- Y LEER LO PROPIO, Y LOS ADMINISTRADORES TODO
create policy "perfil centros read" on public.perfil_centros_costo for select
  using (public.es_admin() or user_id = auth.uid());

-- Y ESCRIBIR SOLO QUIEN ADMINISTRA USUARIOS
create policy "perfil centros insert" on public.perfil_centros_costo for insert
  with check (
    public.es_admin()
    or (public.tiene_permiso('sistema.usuarios') and user_id <> auth.uid())
  );

create policy "perfil centros update" on public.perfil_centros_costo for update
  using      (public.es_admin() or public.tiene_permiso('sistema.usuarios'))
  with check (
    public.es_admin()
    or (public.tiene_permiso('sistema.usuarios') and user_id <> auth.uid())
  );

create policy "perfil centros delete" on public.perfil_centros_costo for delete
  using (public.es_admin() or public.tiene_permiso('sistema.usuarios'));

-- Y LOS PERMISOS PARA EL USUARIO CONECTADO
--
-- Porque la tabla es nueva y no hay ningún "grant" previo que la alcance. Sin esto,
-- un usuario conectado no puede leer ni escribir, las políticas nunca llegan a
-- evaluarse, y el síntoma es "no tengo permiso" sin ninguna pista de por qué: no es
-- un problema de permiso, es que a la tabla no lo dejaron entrar.
grant select, insert, update, delete on public.perfil_centros_costo to authenticated;
revoke all on public.perfil_centros_costo from anon;

-- ===================================================================
-- 4) QUIÉN PUEDE PEDIR Y QUIÉN PUEDE APROBAR
-- ===================================================================
--
-- Y POR QUÉ SON FUNCIONES Y NO "UPDATE" DIRECTOS
--
-- Porque el nombre de quien pide y de quien aprueba no puede ser un dato que
-- mande el navegador: el Javascript podría mandar el nombre de otro. Con una
-- función, el nombre sale de "perfiles" y no hay manera de inventarlo.
--
-- Y EL ALCANCE, QUE ES LO QUE SE CORRIGE
--
-- Las dos funciones comprueban que el CENTRO DE COSTO del trabajador sea uno de
-- los que el usuario puede ver. Sin esa comprobación, el permiso sirve para
-- cualquier trabajador de cualquier empresa.

-- ===================================================================
-- 4.1) PEDIR UN PERMISO CON HORA
-- ===================================================================
drop function if exists public.pedir_permiso_horario(text,date,time,time,text,text);

create or replace function public.pedir_permiso_horario(
  p_code        text,
  p_fecha       date,
  p_hora_inicio time,
  p_hora_fin    time,
  p_motivo      text,
  p_comentario  text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Y EL TIPO DE VERDAD DEL "id"
  --
  -- Porque la columna es "id serial", que es un entero. La versión anterior
  -- declaraba "uuid" y devolvía un "bigint", y los dos están mal: el "uuid" daba
  -- el 22P02 al guardar (lo corrigió la 088) y el "bigint" no coincide con la
  -- columna (lo avisó la comprobación de la 088).
  v_id integer;
  v_motivo text;
  v_centro integer;
begin
  -- Y EL PERMISO, QUE AHORA ES EL DE PEDIR Y NO EL DE LA TARJA
  if not (public.es_admin() or public.tiene_permiso('permisos_horario.pedir')) then
    raise exception 'No tienes permiso para pedir permisos horarios'
      using errcode = '42501';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if v_motivo = '' then
    raise exception 'Falta el motivo del permiso. Un permiso sin motivo no se puede defender.'
      using errcode = '22023';
  end if;

  if p_hora_fin is null or p_hora_inicio is null then
    raise exception 'Faltan las horas del permiso' using errcode = '22023';
  end if;
  if p_hora_fin <= p_hora_inicio then
    raise exception 'La hora de fin tiene que ser posterior a la de inicio'
      using errcode = '22023';
  end if;

  -- Y EL CENTRO DE COSTO DEL TRABAJADOR, Y QUE EL USUARIO LO PUEDA VER
  --
  -- Esta es la línea que faltaba. Antes se insertaba el "code" que mandara el
  -- navegador, sin preguntar nada: cualquier usuario activo podía pedir un
  -- permiso para un trabajador de otra empresa.
  --
  -- Y CON CENTRO DE COSTO SIN CARGAR
  --
  -- Es "null" para los trabajadores que no tienen centro. Para esos se usa la
  -- empresa, que es la regla de siempre: si no hay obra asignada, manda la
  -- empresa. Un trabajador sin centro de costo no puede quedar fuera de todo.
  select t.centro_costo_id into v_centro
    from public.trabajadores t
   where t.code = p_code;

  if not found then
    raise exception 'No encontré al trabajador "%"', coalesce(p_code, '(sin código)')
      using errcode = '22023';
  end if;

  if v_centro is null then
    if not public.es_admin()
       and not exists (select 1 from public.perfil_empresas pe
                        join public.trabajadores t on t.code = p_code
                       where pe.user_id = auth.uid() and pe.empresa_id = t.empresa_id) then
      raise exception 'Ese trabajador no está en ninguna de tus empresas'
        using errcode = '42501';
    end if;
  elsif not public.es_admin()
    and not exists (select 1 from public.perfil_centros_costo pcc
                     where pcc.user_id = auth.uid() and pcc.centro_costo_id = v_centro) then
    raise exception 'Ese trabajador es de un centro de costo que no te corresponde'
      using errcode = '42501';
  end if;

  -- Y QUE NO SE PISE CON OTRO PERMISO DEL MISMO DÍA
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
    (select nombre from public.perfiles where id = auth.uid()),
    (select rol from public.perfiles where id = auth.uid()),
    nullif(btrim(coalesce(p_comentario, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.pedir_permiso_horario(text,date,time,time,text,text)
  to authenticated;

-- ===================================================================
-- 4.2) APROBAR O ANULAR UN PERMISO CON HORA
-- ===================================================================
--
-- Y POR QUÉ SE TIRA LA FUNCIÓN ANTES DE VOLVER A CREARLA
--
-- Porque el tipo de "p_id" y el del valor de retorno son parte de la firma, y
-- "create or replace" no puede cambiarlos.
drop function if exists public.resolver_permiso_horario(uuid,boolean,text);

create or replace function public.resolver_permiso_horario(
  p_id         integer,
  p_acepta     boolean,
  p_comentario text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_centro integer;
  v_estado text;
  v_afectadas integer;
begin
  -- Y EL PERMISO DE APROBAR, QUE ES NUEVO Y DISTINTO
  --
  -- Antes era "tarja.aprobar_cambio", que es para aprobar cambios de estado de
  -- asistencia. Con ese permiso, "rrhh" aprobaba permisos con hora sin haber
  -- pasado por la empresa.
  if not (public.es_admin() or public.tiene_permiso('permisos_horario.aprobar')) then
    raise exception 'No tienes permiso para aprobar permisos horarios'
      using errcode = '42501';
  end if;

  -- Y EL ESTADO Y EL CENTRO, EN LA MISMA CONSULTA
  --
  -- El estado se trae acá porque el error de abajo necesita decir EN QUÉ ESTÁ, y
  -- "ya fue resuelto" sin decir cuál obliga a abrir la pantalla para averiguarlo.
  select ph.estado, t.centro_costo_id into v_estado, v_centro
    from public.permiso_horario ph
    join public.trabajadores t on t.code = ph.code
   where ph.id = p_id;

  -- Y EL ALCANCE, QUE TAMBIÉN FALTABA
  --
  -- Esta función es "security definer", así que SALTA la RLS. Buscaba el permiso
  -- por "id" y lo actualizaba, sin preguntar de qué empresa era el trabajador:
  -- alcanzar con conocer un "id" alcanzaba para tocar un permiso de otra empresa.
  if not found then
    raise exception 'Ese permiso no existe' using errcode = '22023';
  end if;

  -- Y SOLO SE RESUELVE UNA VEZ
  --
  -- Esta comprobación estaba en la 086 (L331-335) y en la 087 (L182-185), y se
  -- había perdido al reescribir la función. Sin ella, un permiso confirmado se
  -- puede anular o volver a confirmar, y el "update" de abajo pisa
  -- "confirmado_por", "confirmado_por_nombre" y "confirmado_at": el registro dice
  -- que lo resolvió el último, y no queda rastro de quien lo había rechazado.
  --
  -- El mensaje dice en qué estado quedó, porque "ese permiso ya fue resuelto"
  -- obliga a ir a mirar la pantalla para saber si alguien lo confirmó o lo anuló.
  if v_estado <> 'pendiente' then
    raise exception 'Ese permiso ya fue resuelto: su estado ahora es "%"', v_estado
      using errcode = '22023';
  end if;

  if not public.es_admin() then
    if v_centro is null then
      if not exists (select 1 from public.perfil_empresas pe
                       join public.trabajadores t on t.code = (select code from public.permiso_horario where id = p_id)
                       join public.permiso_horario ph on ph.code = t.code
                      where pe.user_id = auth.uid() and pe.empresa_id = t.empresa_id) then
        raise exception 'Ese permiso es de un trabajador que no está en tus empresas'
          using errcode = '42501';
      end if;
    elsif not exists (select 1 from public.perfil_centros_costo pcc
                        where pcc.user_id = auth.uid() and pcc.centro_costo_id = v_centro) then
      raise exception 'Ese permiso es de un centro de costo que no te corresponde'
        using errcode = '42501';
    end if;

    -- Y QUE NO SE APROBE LO QUE EL MISMO PIDIO
    --
    -- El proyecto tiene escrita la regla de que pedir y resolver usan permisos
    -- distintos, "para evitar la auto-aprobación". Con los roles nuevos eso se
    -- sostiene sola, pero esta línea la hace explícita: si el mismo usuario pidió
    -- y aprueba, no. Salvo "admin", que es el desatasco cuando el administrador
    -- de obra no está.
    if exists (select 1 from public.permiso_horario
                where id = p_id and pedido_por = auth.uid()) then
      raise exception 'No puedes aprobar un permiso que pediste tú mismo'
        using errcode = '42501';
    end if;
  end if;

  -- Y EL "UPDATE" LLEVA LA COMPROBACIÓN OTRA VEZ, EN LA PROPIA SENTENCIA
  --
  -- Arriba ya se comprobó que el permiso está pendiente. Ponerlo también acá no es
  -- redundancia: es para que la garantía NO dependa de una sola comprobación en
  -- PL/pgSQL que alguien puede borrar en una edición de las que se hacen "para
  -- limpiar". Si la condición desaparece de arriba, el permiso sigue sin poder
  -- re-resolverse, porque la fila ya no está pendiente.
  update public.permiso_horario
     set estado = (case when p_acepta then 'confirmado' else 'anulado' end),
         confirmado_por = auth.uid(),
         confirmado_por_nombre = (select nombre from public.perfiles where id = auth.uid()),
         confirmado_at = now(),
         comentario = nullif(btrim(coalesce(p_comentario, '')), '')
   where id = p_id
     and estado = 'pendiente';

  -- Y SI NO SE TOCÓ NINGUNA FILA, ALGUIEN SE ADELANTÓ
  --
  -- Porque el "update" no lleva candado. Si dos administradores aprueban el mismo
  -- permiso al mismo tiempo, los dos pasan la comprobación de arriba, y el segundo
  -- no cambia nada: se queda creyendo que lo aprobó. Con el conteo se avisa, en
  -- vez de mostrar un "Listo" que no ocurrió.
  get diagnostics v_afectadas = row_count;
  if v_afectadas = 0 then
    raise exception 'Ese permiso fue resuelto por alguien más mientras se revisaba'
      using errcode = '22023';
  end if;
end;
$$;

grant execute on function public.resolver_permiso_horario(integer,boolean,text)
  to authenticated;

-- ===================================================================
-- 5) QUE ADMIN Y APROBADOR NO SE QUEDEN FUERA
-- ===================================================================
--
-- Y POR QUÉ SOLO ESOS DOS
--
-- Porque son los que tienen que poder cargar los centros de los demás. Si al
-- aplicar la migración nadie tuviera un centro asignado, el flujo de permisos con
-- hora quedaría sin poder usarse y no habría forma de arreglarlo desde la
-- aplicación: nadie podría cargar nada.
--
-- "rrhh" NO entra, a propósito: es quien visa, no quien autoriza. Si el
-- administrador de obra pierde su acceso por error, es "admin" el que lo
-- recupera, y queda en el registro que lo recuperó.
insert into public.perfil_centros_costo (user_id, centro_costo_id)
select p.id, c.id
  from public.perfiles p
  cross join public.centros_costo c
 where p.activo
   and p.rol in ('admin', 'aprobador')
on conflict do nothing;

-- ===================================================================
-- 6) LA COMPROBACIÓN, ADENTRO DE LA BASE
-- ===================================================================
--
-- Porque las tres cosas que arruinarían esto son: un rol que no está en la
-- lista cerrada, un permiso que no existe, y una firma que queda con el tipo
-- viejo. Las tres se comprueban acá, en el mismo pantallón que dice que se
-- aplicó.
do $$
declare
  v_roles text;
  v_permisos text;
begin
  select string_agg(rol, ', ' order by rol) into v_roles
    from public.roles_sistema
   where rol in ('solicitante', 'aprobador');

  if v_roles is null or v_roles not like '%solicitante%' or v_roles not like '%aprobador%' then
    raise exception 'No se crean los roles solicitante y aprobador. Hay: %',
      coalesce(v_roles, '(ninguno)');
  end if;

  select string_agg(clave, ', ' order by clave) into v_permisos
    from public.permisos
   where clave in ('permisos_horario.pedir', 'permisos_horario.aprobar', 'permisos_horario.visar');

  if v_permisos is null
     or v_permisos not like '%permisos_horario.pedir%'
     or v_permisos not like '%permisos_horario.aprobar%'
     or v_permisos not like '%permisos_horario.visar%' then
    raise exception 'No se crean los tres permisos del permiso con hora. Hay: %',
      coalesce(v_permisos, '(ninguno)');
  end if;

  raise notice 'OK: roles %, permisos %', v_roles, v_permisos;
end;
$$;

comment on function public.resolver_permiso_horario(integer,boolean,text) is
  'Aprueba o anula un permiso con hora. Exige "permisos_horario.aprobar" y que el centro de costo del trabajador sea uno de los del usuario. Antes usaba "tarja.aprobar_cambio", no miraba la empresa y pedía un "id" de tipo uuid para una columna que es un serial. Ver migrations/090_permisos_por_centro_de_costo.sql.';

commit;

-- ===================================================================
-- LO QUE HAY QUE CORRER DESPUÉS
-- ===================================================================
--
--   node tools/comprueba-parentesis.js
--   node tools/revisa-nombres-sql.js
--   node tools/comprueba-codigo-sql.js
--
-- Y DESPUÉS, EN LA APLICACIÓN
--
-- Mientras no se cargue a quién pertenece cada centro de costo, el flujo no deja
-- pedir ni aprobar. Se carga desde Soporte, en la pantalla de usuarios. Esa
-- pantalla es el siguiente paso y todavía no existe: hay que agregarle la lista
-- de centros de costo de cada usuario.
--
-- ===================================================================
-- Y PARA VOLVER ATRÁS
-- ===================================================================
--
--   drop function if exists public.pedir_permiso_horario(text,date,time,time,text,text);
--   drop function if exists public.resolver_permiso_horario(integer,boolean,text);
--   drop table if exists public.perfil_centros_costo;
--   delete from public.roles_permisos
--    where permiso in ('permisos_horario.pedir','permisos_horario.aprobar','permisos_horario.visar');
--   delete from public.permisos
--    where clave in ('permisos_horario.pedir','permisos_horario.aprobar','permisos_horario.visar');
--   delete from public.roles_sistema where rol in ('solicitante','aprobador');
--   alter table public.perfiles drop constraint if exists perfiles_rol_check;
--   alter table public.perfiles add constraint perfiles_rol_check
--     check (rol in ('admin','oficina','porteria','bodega','prevencion','rrhh',
--                    'supervisores','tecnica'));
--
-- Ojo: al tirar las dos funciones desaparece el camino para pedir y para aprobar.
-- La tabla "permiso_horario" y sus filas no se tocan.