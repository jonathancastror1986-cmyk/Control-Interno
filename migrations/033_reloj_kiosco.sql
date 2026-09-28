-- ============================================================
-- Migración 033: rol de reloj, clave del kiosco y permisos de soporte
-- ============================================================
-- QUÉ RESUELVE
--
-- Tres cosas que se pidieron y que no existían:
--
--  1. UNA CUENTA PARA EL RELOJ. Había una sola forma de usar un reloj: el
--     token del dispositivo (migración 030), que se genera solo y no se puede
--     volver a leer. Si el Android TV Box se pierde, hay que ir a la obra a
--     revocarlo. Con un rol `reloj` se puede crear un usuario de acceso al
--     equipo, que además se puede reassignar a otro reloj desde la pantalla
--     de soporte.
--
--  2. QUE SOPORTE PUEDA AGREGAR RELOJES. Los permisos `relojes.editar`
--     estaban solo en Administración, así que un técnico que llega a
--     instalar un reloj no podía registrarlo. Le faltaba, y tampoco podía
--     verlos.
--
--  3. LA CLAVE DE LA PANTALLA. El kiosco se abre a pantalla completa y
--     bloquea el touch, así que tiene que haber una forma de salir. Con
--     cinco pulsaciones seguidas y una clave. La clave se guarda en hash,
--     como el token, y se muestra una sola vez.
--
-- POR QUÉ EL ROL `reloj` NO ES LO MISMO QUE `porteria`
--
-- `porteria` consulta fichas yTarjeta. `reloj` marca y nada más: no ve
-- nombres de otros trabajadores, no ve la tarja, no ve reportes. Es la
-- diferencia entre un usuario que entra al sistema y un aparato en la
-- puerta que no debería poder mirar nada.
--
-- Re-runnable.
-- ============================================================

-- ------------------------------------------------------------
-- 1) EL ROL
-- ------------------------------------------------------------
insert into public.roles_sistema (rol, nombre, descripcion, orden) values
  ('reloj', 'Reloj', 'Solo marca. No ve fichas, ni planillas, ni reportes', 9)
on conflict (rol) do nothing;

-- Si el rol ya existía con otra descripción, se actualiza: la descripción
-- es la que lee el usuario al elegirlo y no debería quedar desactualizada.
update public.roles_sistema
   set nombre = 'Reloj',
       descripcion = 'Solo marca. No ve fichas, ni planillas, ni reportes',
       orden = 9
 where rol = 'reloj';

-- ------------------------------------------------------------
-- 2) LOS PERMISOS
-- ------------------------------------------------------------
-- `relojes.marcaje` es el unico permiso del rol reloj. Deliberadamente
-- uno solo: un permiso mas seria la occasion de agregar otro sin pensarlo,
-- y la regla es que el aparato no ve nada.
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('relojes.marcaje',   'Registrar marcajes desde la pantalla del reloj', 'relojes', 4),
  ('relojes.gestionar', 'Agregar, editar, activar y revocar relojes',      'relojes', 5)
on conflict (clave) do update set descripcion = excluded.descripcion;

-- El rol reloj: un permiso y nada mas.
insert into public.roles_permisos (rol, permiso) values
  ('reloj', 'relojes.marcaje')
on conflict do nothing;

-- Lo que el rol reloj NO debe tener, por si alguien se lo agrega a mano.
-- Un rol que puede ver la planilla deja de ser un aparato.
delete from public.roles_permisos
 where rol = 'reloj'
   and permiso in (
     'tarja.ver','tarja.editar','tarja.marcaje','tarja.excel','tarja.exportar',
     'tarja.justificar','asistencia.auditar',
     'trabajadores.ver','trabajadores.editar','trabajadores.tarjeta',
     'sistema.usuarios','sistema.permisos','sistema.empresa',
     'porteria.ver','contratacion.ver','contratacion.editar','contratacion.firmar'
   );

-- Soporte tecnico: puede ver y administrar relojes.
--
-- `relojes.editar` incluye revocar credenciales, asi que es el mismo
-- permiso que tiene administracion. Se le da a tecnica porque instalar un
-- reloj en terreno es su trabajo, no porque deba poder dar de baja un
-- dispositivo que ya esta en servicio. Para eso, un permiso aparte habria
-- que agregarlo despues con cuidado, no ahora.
insert into public.roles_permisos (rol, permiso) values
  ('tecnica', 'relojes.ver'),
  ('tecnica', 'relojes.editar')
on conflict do nothing;

-- ------------------------------------------------------------
-- 3) LA CLAVE DE LA PANTALLA
-- ------------------------------------------------------------
-- En hash, como el token (migración 030). Se muestra una vez al crearse y
-- no se vuelve a leer: si se pierde, se rota.
--
-- Va separada del token a propósito. El token deja MARCAR; la clave deja
-- SACAR el dedo de la pantalla. Son permisos distintos y por eso son
-- secretos distintos: que alguien tenga el token de un reloj no le da el
-- derecho a desarmar el kiosco de otro.
alter table public.relojes
  add column if not exists hash_pin text;

alter table public.relojes
  add column if not exists kiosco_activo boolean not null default true;

-- Cuántas pulsaciones seguidas hay que hacer para que aparezca la clave.
-- Cinco es lo que se pidió. Es configurable por reloj porque en una obra
-- con paso de gente hay pantallas donde cinco pulsaciones se dan solas.
alter table public.relojes
  add column if not exists kiosco_pulsaciones int not null default 5;

alter table public.relojes
  drop constraint if exists relojes_kiosco_pulsaciones;
alter table public.relojes
  add constraint relojes_kiosco_pulsaciones
  check (kiosco_pulsaciones between 3 and 10);

comment on column public.relojes.hash_pin is
  'sha256 de la clave de 6 digitos del kiosco. Se muestra una vez al crearse. Distinta del token: el token marca, la clave abre la pantalla.';
comment on column public.relojes.kiosco_activo is
  'Si es falso, la pantalla de marcaje no se bloquea a pantalla completa. Para pruebas en un computador de escritorio.';

-- ------------------------------------------------------------
-- 4) GENERAR LA CLAVE
-- ------------------------------------------------------------
-- Se genera en la base y se devuelve en claro UNA vez, por la misma vía que
-- el token. Que la generación no dependa del navegador importa: si el
-- generara el cliente, un reloj sin JavaScript no tendria clave, y un reloj
-- sin clave queda trabado para siempre.
create or replace function public.generar_pin_reloj(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin text;
begin
  if not exists (select 1 from public.relojes where code = p_code) then
    raise exception 'RELOJ_NO_EXISTE' using errcode = 'no_data_found';
  end if;

  -- Se rechaza un PIN debil: 000000, 123456 y 111111 son los que se prueban
  -- primero. Una clave de 6 digitos con 300 combinaciones repetidas no es
  -- una clave, es un adorno.
  loop
    v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when v_pin not in ('000000','111111','123456','654321','000001')
            and v_pin not like '%000000';
  end loop;

  update public.relojes
     -- Se reutiliza public.hash_token(), que es la misma funcion que ya
     -- hashea el token del dispositivo. Escribir el sha256 a mano aqui
     -- dejaria dos formas de hashear secretos en la misma tabla, y el dia
     -- que se cambie una la otra se queda vieja y nadie lo nota.
     set hash_pin = public.hash_token(v_pin)
   where code = p_code;

  return v_pin;
end $$;

comment on function public.generar_pin_reloj(text) is
  'Genera la clave de 6 digitos del kiosco y devuelve el texto plano una sola vez.';

grant execute on function public.generar_pin_reloj(text) to authenticated;

-- Verificar la clave. Existe aunque no haya ningun reloj: sin reloj la clave
-- no puede ser correcta, y la respuesta tiene que ser la misma que cuando
-- es incorrecta, o sirve para probar claves.
create or replace function public.verificar_pin_reloj(
  p_code text,
  p_pin  text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.relojes
     where code = p_code
       and kiosco_activo
       and hash_pin is not null
       and hash_pin = public.hash_token(coalesce(p_pin,''))
  )
$$;

comment on function public.verificar_pin_reloj(text, text) is
  'Comprueba la clave del kiosco. Devuelve el mismo resultado si el reloj no existe, para no filtrar que codigos son validos.';

grant execute on function public.verificar_pin_reloj(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5) DIAGNÓSTICO
-- ------------------------------------------------------------
-- La 030 ya definio esta funcion. "create or replace" no puede cambiar el
-- tipo de retorno, y aca se agregan columnas: hay que eliminarla antes.
drop function if exists public.diagnostico_relojes();

create or replace function public.diagnostico_relojes()
returns table (
  tabla_relojes boolean,
  tabla_centros boolean,
  token_sha256 boolean,
  fn_marcar boolean,
  total_relojes bigint,
  sin_credential bigint,
  sin_hash_pin bigint,
  kiosco_inactivos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='relojes'),
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='centros_costo'),
    -- La columna se llama token_hash, no hash_token. La 030 escribio
    -- 'hash_token' en este mismo chequeo y por eso devolvia false con la
    -- columna correctamente creada: el diagnostico REPORTABA que faltaba
    -- algo que estaba ahi. Un diagnostico que miente es peor que ninguno,
    -- porque manda a buscar un problema que no existe.
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='relojes'
               and column_name='token_hash'),
    exists (select 1 from pg_proc where proname='marcar_por_reloj'
             and pronamespace='public'::regnamespace),
    (select count(*) from public.relojes),
    (select count(*) from public.relojes where token_hash is null),
    (select count(*) from public.relojes where hash_pin is null),
    (select count(*) from public.relojes where not kiosco_activo)
$$;

comment on function public.diagnostico_relojes() is
  'Estado de los relojes: tabla, token, pin del kiosco, cuantos hay y cuantos quedan sin credencial.';

select '033_reloj_kiosco' as migracion, total_relojes, sin_credential, sin_hash_pin
  from public.diagnostico_relojes();
