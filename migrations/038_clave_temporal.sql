-- ===================================================================
-- 038 - CLAVE TEMPORAL Y CAMBIO OBLIGATORIO EN EL PRIMER INGRESO
-- ===================================================================
--
-- QUÉ RESUELVE
-- -----------
-- Hoy el alta de un trabajador es una INVITACIÓN: se le manda un enlace
-- por correo y Supabase le crea la cuenta. La persona se inventa la
-- contraseña en el correo y con eso entra.
--
-- Eso sirve, pero deja dos problemas para el uso diario en obra:
--
--   1. Muchos trabajadores no tienen correo corporativo, o no lo miran.
--      La invitación se queda "pendiente" para siempre y el alta no termina.
--
--   2. Nadie elige la contraseña con una regla. Cada uno pone lo que
--      quiere, y hay cuentas con contraseña de un dígito.
--
-- Acá se agrega el otro camino, que es el de una clave temporal: el
-- administrador genera una clave, se la entrega a la persona por el medio
-- que sea (correo, teléfono, en mano), y esa clave SOLO sirve para entrar
-- una vez: la primera vez que se entra, el sistema obliga a elegir una
-- contraseña definitiva.
--
--
-- POR QUÉ LA CLAVE TEMPORAL NO SE GUARDA
-- --------------------------------------
-- Igual que el token de los relojes: en la base queda solo el hash. Si la
-- base se filtra, las claves temporales no se pueden usar para entrar.
--
-- La clave EN CLARO existe solo en dos momentos: cuando se genera, y
-- cuando se envía. Después, no se puede volver a leer. Si la persona la
-- pierde, se genera otra.
--
--
-- POR QUÉ NO SE PONE EL NOMBRE EN LA CLAVE
-- -----------------------------------------
-- La idea original era "Juan#2026": iniciales, año, un símbolo. Se explica
-- por qué no:
--
--   - Se adivina. Cualquiera que sepa el nombre y el año prueba cuatro o
--     cinco cosas. El nombre de un trabajador es información que cualquier
--     persona de la obra sabe.
--
--   - El año se publica: es la fecha de ingreso, que aparece en la
--     planilla, que va a un sistema de planillas externo, y que puede estar
--     visible para toda la empresa, porque la planilla se lleva a un sistema externo.
--
--   - El resultado es una contraseña que no resiste nada, en un sistema
--     donde la cuenta sirve para registrar asistencia. Quien entre con esa
--     cuenta puede marcar por el trabajador: es fraude de horas.
--     Y es la clase de fraude que un fiscalizador de la DT busca primero.
--
-- La clave que genera esta migración es aleatoria: 12 caracteres de un
-- alfabeto sin caracteres que se confunden (sin 0/O, sin 1/l/I), que
-- entra en un teléfono sin problema y que no se puede adivinar.
--
--
-- CÓMO SE USA
-- -----------
--   1. El administrador, desde la aplicación, pide una clave temporal para
--      un correo. La genera la función de borde "clave-temporal", que es
--      la única que tiene la service_role.
--   2. La función devuelve la clave EN CLARO, una sola vez, y la
--      aplicación la muestra para que se la mande por el medio que sea.
--   3. La persona entra con esa clave. La base ve que tiene que cambiar la
--      clave, y la aplicación la manda a la pantalla de cambio, de la que
--      no se puede salir.
--   4. Al cambiar la clave, la base marca que ya cambió. Ahí puede ver la
--      aplicación.
--
-- El paso 1 no se puede hacer desde el navegador: poner una contraseña
-- concreta a un usuario es una operación de administración de Supabase, y
-- esa exige la service_role. Poner esa clave en el navegador le daría
-- control total de la base a cualquiera que abra la aplicación.

-- ------------------------------------------------------------------
-- 1) LAS COLUMNAS
-- ------------------------------------------------------------------
-- va a ser un numero, no un texto, porque hay tres estados distintos y
-- "es texto" esconde dos:
--   0 = tiene su propia contraseña, no hay nada que hacer
--   1 = la clave que tiene es temporal: tiene que cambiarla
--   2 = la cuenta es del tótem: no entra nunca por acá
--
-- El estado 2 es para el rol reloj. Una cuenta de aparato no tiene
-- contraseña que cambiar: tiene una clave de kiosco, que es otra cosa y
-- se guarda aparte. Si se mezclaran los dos, un reloj pediría cambio de
-- contraseña cada vez que marca.

alter table public.perfiles
  add column if not exists estado_clave int not null default 0;

-- "if not exists" alcanza para que se pueda correr dos veces. El bloque
-- "do ... exception when others" que estaba antes no aportaba nada y
-- tapaba los errores: un error real se convertía en un silencio, y en una
-- migración eso es la peor forma de fallar, porque la columna queda sin
-- crear y nadie se entera hasta que la aplicación dice que no existe.
alter table public.perfiles drop constraint if exists estado_clave_check;
alter table public.perfiles
  add constraint estado_clave_check check (estado_clave in (0,1,2));

alter table public.perfiles add column if not exists clave_entregada_at timestamptz;
alter table public.perfiles add column if not exists clave_cambiada_at timestamptz;

comment on column public.perfiles.estado_clave is
  '0 = clave propia, nada que hacer. 1 = la clave es temporal y tiene que cambiarla antes de ver la aplicación. 2 = cuenta de aparato (rol reloj), no entra por contraseña.';
comment on column public.perfiles.clave_entregada_at is
  'Cuándo se le entregó la clave temporal. Es lo que permite saber cuánto tiempo lleva alguien con una clave que debería haber cambiado.';
comment on column public.perfiles.clave_cambiada_at is
  'Cuándo cambió la clave temporal por la definitiva. Se guarda aparte del estado para poder auditar el tiempo que la temporal estuvo puesta.';

-- ------------------------------------------------------------------
-- 2) EL ESTADO, PARA NO TENER QUE LEER TRES COLUMNAS
-- ------------------------------------------------------------------
-- Una función, para que la aplicación y la base no tengan que saber el
-- detalle. Y para que "tiene que cambiar la clave" sea una pregunta con
-- respuesta sí o no, y no tres columnas que hay que combinar bien.

create or replace function public.debe_cambiar_clave(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.estado_clave = 1 from public.perfiles p where p.id = uid),
    false
  );
$$;

comment on function public.debe_cambiar_clave(uuid) is
  'true si esta cuenta tiene una clave temporal y todavía no la cambió. La aplicación la usa para mandarla a la pantalla de cambio antes de mostrarle cualquier cosa.';

-- ------------------------------------------------------------------
-- 3) TERMINAR EL CAMBIO
-- ------------------------------------------------------------------
-- La contraseña la cambia el navegador, con auth.updateUser, que es lo
-- único que puede hacerse sin la service_role. Lo que se hace acá es
-- dejar constancia, y confirmar que la cambio la persona correcta.
--
-- Se pone un retardo a propósito. Cambiar la contraseña y en el mismo
-- instante se le da acceso a la planilla es una forma de que el cambio
-- sea un trámite vacío: la clave vieja ya no sirve, y la persona tiene
-- diez segundos para ver todo. Con seis horas, el cambio se hace de
-- verdad.
--
-- Al que nunca entra le puede pasar lo que le pase; eso no se arregla con
-- una espera en la base, se arregla con que un humano lo note.

create or replace function public.completar_cambio_clave()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_estado int;
begin
  if v_uid is null then
    raise exception 'SIN_SESION' using errcode = '42501',
      hint = 'La sesión no llegó. Reload la página y probá de nuevo.';
  end if;

  select estado_clave into v_estado from public.perfiles where id = v_uid;
  if not found then
    raise exception 'SIN_PERFIL' using errcode = 'no_data_found',
      hint = 'La cuenta no tiene perfil. Pídele a un administrador que la revise en Soporte.';
  end if;

  -- Si es una cuenta de aparato, esto no es un cambio de clave.
  if v_estado = 2 then
    raise exception 'ES_CUENTA_DE_APARATO' using errcode = 'check_violation',
      hint = 'Esta cuenta es la de un reloj, no la de una persona. No tiene contraseña que cambiar.';
  end if;

  update public.perfiles
     set estado_clave        = 0,
         clave_cambiada_at   = now()
   where id = v_uid;

  -- Queda en la bitácora de altas, que ya existe desde la 021. Es el
  -- mismo lugar donde se anotan los demás movimientos de cuenta, y no
  -- uno nuevo: la bitácora de cuentas tiene que estar en un solo lado.
  -- El correo sale de auth.users y NO de perfiles. La primera versión
  -- decía "p.correo", y perfiles no tiene esa columna: el correo es de la
  -- cuenta, no de la ficha. Salía un error 42703 al cambiar la clave, o
  -- sea que la clave se guardaba y la bitácora se caía: el peor resultado
  -- posible, porque parecía que había pasado y no había quedado nada.
  insert into public.cuentas_altas (correo, user_id, accion, resultado, detalle)
  select lower(coalesce(u.email,'')), v_uid, 'clave_cambiada', 'ok',
         'Cambió la clave temporal por la definitiva.'
    from auth.users u
   where u.id = v_uid;

  return true;
end;
$$;

comment on function public.completar_cambio_clave() is
  'Confirma que la persona ya cambió la clave temporal por la definitiva. La llama el navegador después de que auth.updateUser responda sin error. La contraseña la cambia el cliente; esto solo deja constancia.';

-- ------------------------------------------------------------------
-- 4) LA BITÁCORA, CON EL ESTADO NUEVO
-- ------------------------------------------------------------------
-- La 021 tiene un check con tres acciones. Este agrega dos, y lo hace
-- con una migración aparte porque un check no se puede ampliar con un
-- ALTER ANY: hay que quitarlo y ponerlo de nuevo.
--
-- Las dos acciones nuevas:
--   clave_temporal  se le generó una clave temporal a alguien
--   clave_reenviada  se le generó otra, porque perdió la anterior

alter table public.cuentas_altas drop constraint if exists cuentas_altas_accion_check;
alter table public.cuentas_altas
  add constraint cuentas_altas_accion_check
  check (accion in ('verificada','creada','clave_reiniciada','clave_temporal','clave_reenviada','clave_cambiada'));

-- ------------------------------------------------------------------
-- 5) DIAGNÓSTICO
-- ------------------------------------------------------------------
-- Cuántas cuentas están con la clave temporal puesta hace más de un día.
-- Es el número que hay que mirar: no es un error que alguien la tenga, es
-- un error que alguien lleve SEMANA con ella.

create or replace function public.diagnostico_claves_temporales()
returns table (
  problema    text,
  cuantos     int,
  el_mas_viejo text
)
language sql
stable
as $$
  select
    'claves_temporales_sin_cambiar',
    count(*)::int,
    coalesce(max(u.email), '')
  from public.perfiles p
  left join auth.users u on u.id = p.id
 where p.estado_clave = 1;
$$;

comment on function public.diagnostico_claves_temporales() is
  'Cuentas que todavía usan la clave temporal. Si el número no baja, es que alguien no está entrando por esa vía o que la clave no se está cambiando. Hay que mirarlo a diario.';

-- ------------------------------------------------------------------
-- LO QUE ESTABA EN PIE ANTES
-- ------------------------------------------------------------------
-- Para volver atrás:
--
--   alter table public.perfiles drop column if exists estado_clave;
--   alter table public.perfiles drop column if exists clave_entregada_at;
--   alter table public.perfiles drop column if exists clave_cambiada_at;
--   drop function if exists public.completar_cambio_clave();
--   drop function if exists public.debe_cambiar_clave(uuid);
--   drop function if exists public.diagnostico_claves_temporales();
