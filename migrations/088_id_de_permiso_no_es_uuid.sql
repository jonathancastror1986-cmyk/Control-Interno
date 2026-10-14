-- ===================================================================
-- 088_id_de_permiso_no_es_uuid.sql
-- ===================================================================
-- "invalid input syntax for type uuid" AL GUARDAR UN PERMISO
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- EL ERROR, TAL CUAL
-- ---------------------------------------------------------------------
--
-- En "Pedir permiso con hora", al apretar GUARDAR:
--
--     invalid input syntax for type uuid: ""
--     Código 22P02
--
-- ---------------------------------------------------------------------
-- LA CAUSA, Y ES UN ERROR DE TIPO
-- ---------------------------------------------------------------------
--
-- La tabla define la columna así:
--
--     id serial primary key
--
-- "serial" es un ENTERO que se autoincrementa. No es un "uuid".
--
-- Y la función declaraba, en cambio, que devolvía un "uuid", y guardaba el número
-- de la fila en una variable declarada como "uuid".
--
-- O sea: la función le pedía a Postgres que le devolviera un número dentro de una
-- variable de tipo "uuid". Postgres no puede inventar un uuid a partir del número 1,
-- así que contestaba 22P02.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ TARDÓ TANTO EN SALIR
-- ---------------------------------------------------------------------
--
-- Porque las dos cosas son válidas POR SEPARADO. "create table" con "id serial" no
-- tiene nada de malo, y "create function ... returns uuid" tampoco. El error
-- aparece recién en la línea del "returning", la primera vez que alguien guardó un
-- permiso de verdad.
--
-- Y por eso hay dos errores distintos que se confundieron: la 086 se aplicó sin
-- problema, creó la tabla y creó la función, y todo parecía bien. El 42P01 de
-- "public.profiles" y este 22P02 son los dos únicos lugares donde la función se
-- ejecuta de verdad, y los dos aparecieron el primer día que alguien la usó.
--
-- ---------------------------------------------------------------------
-- POR QUÉ EL ERROR DICE '""' Y NO EL NÚMERO
-- ---------------------------------------------------------------------
--
-- Porque un "serial" que todavía no tomó valor se representa como cadena vacía en
-- el mensaje. No importa mucho: el 22P02 es "no se puede convertir a uuid", y lo
-- que se está intentando convertir es un entero.
--
-- ---------------------------------------------------------------------
-- LA CORRECCIÓN, Y POR QUÉ ESTE CAMINO
-- ---------------------------------------------------------------------
--
-- Hay dos caminos y se elige el que no obliga a tocar lo demás.
--
--   a) Cambiar la columna "id" a "uuid", con "gen_random_uuid()". Sería lo más
--      limpio, pero cambiar el tipo de una columna con filas es una migración
--      pesada, y la tabla tiene su clave foránea y su índice.
--
--   b) Dejar la columna como está y corregir la FUNCIÓN. La función no la usa nadie
--      más que el Javascript, y el Javascript solo usa el valor que devuelve para
--      recargar la lista. No necesita que sea un uuid.
--
-- Se elige (b): no toca la tabla ni los datos, y se corre en un segundo.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ HAY QUE TIRAR LA FUNCIÓN ANTES DE VOLVER A CREARLA
-- ---------------------------------------------------------------------
--
-- Porque el tipo de salida es parte de la firma. "create or replace function"
-- NO puede cambiar el tipo de retorno: Postgres responde que no se puede
-- reemplazar una función que devuelve otro tipo.
--
-- Por eso el "drop function" va PRIMERO, y el "create" después. Y el "drop"
-- borra la función, no la tabla ni las filas: los permisos que ya se guardaron
-- siguen ahí.

begin;

-- ---------------------------------------------------------------------
-- TIRAR LA VERSIÓN VIEJA
-- ---------------------------------------------------------------------
--
-- Se borra con la firma COMPLETA, porque con dos funciones del mismo nombre y
-- distintos argumentos no hay forma de saber cuál se está borrando. Y sin la
-- firma completa, el "if exists" no encuentra nada y el "drop" se queja.
drop function if exists public.pedir_permiso_horario(text,date,time,time,text,text);

-- ---------------------------------------------------------------------
-- LA FUNCIÓN, CON EL TIPO QUE CORRESPONDE
-- ---------------------------------------------------------------------
create or replace function public.pedir_permiso_horario(
  p_code        text,
  p_fecha       date,
  p_hora_inicio time,
  p_hora_fin    time,
  p_motivo      text,
  p_comentario  text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Y POR QUÉ "bigint" Y NO EL "serial" DE LA COLUMNA
  --
  -- Porque "serial" es un atajo que crea una secuencia y un "default" por detrás.
  -- En PL/pgSQL no existe ese atajo: hay que poner el tipo de verdad, y el de un
  -- "serial" es un entero. Se usa "bigint" para no estar a dos dígitos de que se
  -- llene la tabla.
  v_id bigint;
  v_motivo text;
begin
  -- -----------------------------------------------------------------
  -- EL PERMISO: EL DE MARCAR, QUE ES EL DEL SUPERVISOR
  -- -----------------------------------------------------------------
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

  if p_hora_fin is null or p_hora_inicio is null then
    raise exception 'Faltan las horas del permiso' using errcode = '22023';
  end if;
  if p_hora_fin <= p_hora_inicio then
    raise exception 'La hora de fin tiene que ser posterior a la de inicio'
      using errcode = '22023';
  end if;

  -- Y QUE NO SE PISE CON OTRO PERMISO DEL MISMO DÍA
  --
  -- El índice único impide el duplicado exacto, pero no que dos franjas se pisen:
  -- "11:00 a 14:00" y "13:00 a 16:00" son distintas y entran las dos. Y un día con
  -- dos ausencias que se pisan es un día con horas contadas dos veces, que es el
  -- error más caro de una planilla porque no se ve.
  if exists (select 1 from public.permiso_horario ph
              where ph.code = p_code
                and ph.fecha = p_fecha
                and ph.estado <> 'anulado'
                and p_hora_inicio < ph.hora_fin
                and p_hora_fin > p_hora_inicio) then
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

-- ---------------------------------------------------------------------
-- LA COMPROBACIÓN, ADENTRO DE LA BASE
-- ---------------------------------------------------------------------
--
-- Antes esto se comprobaba desde un archivo aparte, que hubo que escribir, corregir
-- dos veces y hacer correr a mano. Acá la comprobación va en la propia migración, así
-- que el resultado aparece en el mismo pantallón que dice que se aplicó.
--
-- Y QUÉ COMPRUEBA
--
-- Que el tipo que devuelve la función sea el mismo tipo que la columna "id". Si
-- alguien vuelve a cambiar cualquiera de las dos cosas, esto avisa con el nombre de
-- los dos y no con un 22P02 que no dice nada.
do $$
declare
  v_tipo_funcion text;
  v_tipo_columna text;
begin
  select pg_catalog.format_type(p.prorettype, null)
    into v_tipo_funcion
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'pedir_permiso_horario';

  select data_type into v_tipo_columna
  from information_schema.columns
  where table_schema = 'public' and table_name = 'permiso_horario'
    and column_name = 'id';

  if v_tipo_funcion is null then
    raise exception 'No se encontro la funcion pedir_permiso_horario';
  end if;

  if v_tipo_funcion <> v_tipo_columna then
    raise exception 'La funcion devuelve % y la columna id es %: no son el mismo tipo, y al devolver la fila va a fallar',
      v_tipo_funcion, v_tipo_columna;
  end if;

  raise notice 'OK: la funcion devuelve % y la columna id es %', v_tipo_funcion, v_tipo_columna;
end;
$$;

comment on function public.pedir_permiso_horario(text,date,time,time,text,text) is
  'Devuelve el id (bigint) del permiso creado. Antes declaraba "returns uuid" con la columna "id serial", que son tipos distintos, y por eso salia 22P02 al guardar. Ver migrations/088_id_de_permiso_no_es_uuid.sql.';

commit;

-- ---------------------------------------------------------------------
-- LO QUE HAY QUE CORRER DESPUÉS
-- ---------------------------------------------------------------------
--
--   node tools/comprueba-parentesis.js
--   node tools/revisa-nombres-sql.js
--
-- Y si después de esto sigue saliendo 42P01 con el nombre "public.profiles", es que
-- la 087 no se corrió. El orden es 086, después 087, después 088.
--
-- ---------------------------------------------------------------------
-- Y PARA VOLVER ATRÁS
-- ---------------------------------------------------------------------
--
--   drop function if exists public.pedir_permiso_horario(text,date,time,time,text,text);
--
-- Ojo: al tirar la función desaparece el camino para pedir permisos, y hay que
-- volver a crearla con el cuerpo de este archivo. La tabla y las filas no se tocan.