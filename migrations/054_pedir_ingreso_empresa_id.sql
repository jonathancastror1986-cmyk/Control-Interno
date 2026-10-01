-- 054: PEDIR INGRESO NO FUNCIONABA: LA FUNCIÓN INSERTABA EN "empresa"
-- =====================================================================
--
-- EL PROBLEMA
-- -----------
--
-- "public.pedir_ingreso()" no lograba guardar el pedido, y la pantalla mostraba:
--
--     column "empresa" of relation "ingresos_pendientes" does not exist
--
-- -------------------------------------------------------------------
-- POR QUÉ: LA TABLA ESTÁ BIEN, LA FUNCIÓN ESTÁ VIEJA
-- ---------------------------------------------------
--
-- La tabla "ingresos_pendientes" se creó con la columna "empresa_id", no con "empresa":
--
--     create table if not exists ingresos_pendientes (
--       ...
--       empresa_id integer references empresa(id),
--       ...
--
-- Y la función inserta en "empresa":
--
--     insert into ingresos_pendientes (
--       nombre, rut, telefono, especialidad, empresa, fecha_ingreso, nota,
--       ...
--
-- O sea que a la función nunca se le cambió el nombre de la columna. Y como es una función
-- de PostgreSQL, el error no aparece al crearla: PostgreSQL no la compila hasta que se
-- ejecuta. Por eso la migración corrió sin avisar nada, y el fallo apareció el primer día que
-- un supervisor quiso dar de alta a alguien.
--
-- Y el repo hasta tiene una función que.rename la columna:
--
--     public.corregir_columna_ingresos()
--
-- que devuelve "la columna empresa_id ya estaba bien". O sea que la tabla nunca estuvo mal, y
-- lo que está viejo es el código que escribe en ella.
--
-- -------------------------------------------------------------------
-- Y POR QUÉ NO SE ARREGLA EDITANDO EL 046
-- ---------------------------------------
--
-- Porque el 046 ya se corrió en la base de datos. Editarlo no cambia nada acá: los archivos de
-- migración no se vuelven a ejecutar.
--
-- Y no se arregla con un "alter table": la columna "empresa" no existe, así que no hay nada
-- que renombrar. Lo que hay que rehacer es la FUNCIÓN.
--
-- -------------------------------------------------------------------
-- LO QUE SE HACE
-- ---------------
--
-- Se vuelve a crear "public.pedir_ingreso" CON EL CUERPO EXACTO que tiene en el 046, con una
-- sola palabra cambiada: "empresa" pasa a ser "empresa_id".
--
-- Y se copia entera a propósito, y no "la función más un parche". Porque una función en
-- PostgreSQL se reemplaza COMPLETA o no se reemplaza: no hay parches parciales, y un
-- "create or replace" con el cuerpo incompleto deja la función rota de otra manera.
--
-- Y el resto de las funciones de ingresos_pendientes NO se tocan, porque se comprobó que
-- ninguna nombra la columna: "aprobar", "rechazar" y "corregir" usan "select * into" y
-- "update" sin lista de columnas, así que no dependen del nombre.

begin;

-- -------------------------------------------------------------------
-- EL ARREGLO
-- -------------------------------------------------------------------
create or replace function public.pedir_ingreso(
  p_nombre       text,
  p_rut          text,
  p_telefono     text default null,
  p_especialidad text default null,
  p_empresa_id   integer default null,
  p_fecha_ingreso date default null,
  p_nota         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre text;
  v_rut text;
begin
  if not (es_usuario_activo() or es_admin() or tiene_permiso('ingresos.pedir')) then
    raise exception 'No tienes permiso para pedir ingresos de trabajadores'
      using errcode = '42501';
  end if;

  v_nombre := btrim(coalesce(p_nombre, ''));
  v_rut    := btrim(coalesce(p_rut, ''));

  if v_nombre = '' then
    raise exception 'Falta el nombre del trabajador' using errcode = '22023';
  end if;
  if v_rut = '' then
    raise exception 'Falta el RUT del trabajador' using errcode = '22023';
  end if;

  if exists (select 1 from trabajadores t
              where upper(t.rut) = upper(v_rut)
                and t.status = 'activo') then
    raise exception 'Ese RUT ya está en la lista de trabajadores activos'
      using errcode = '22023';
  end if;

  if exists (select 1 from ingresos_pendientes i
              where i.estado = 'pendiente'
                and upper(i.rut) = upper(v_rut)) then
    raise exception 'Ya hay un ingreso pendiente con ese RUT. Espera a que RRHH lo resuelva.'
      using errcode = '22023';
  end if;

  -- Y ACÁ ESTÁ EL ARREGLO: "empresa" pasa a ser "empresa_id".
  --
  -- Y es la ÚNICA palabra que cambia. Todo lo demás es copia exacta del 046.
  insert into ingresos_pendientes (
    nombre, rut, telefono, especialidad, empresa_id, fecha_ingreso, nota,
    pedido_por, pedido_por_nombre
  )
  values (
    v_nombre, v_rut,
    nullif(btrim(coalesce(p_telefono, '')), ''),
    nullif(btrim(coalesce(p_especialidad, '')), ''),
    p_empresa_id,
    p_fecha_ingreso,
    nullif(btrim(coalesce(p_nota, '')), ''),
    auth.uid(),
    (select nombre from profiles where id = auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Y el permiso, que la función nueva lo necesita otra vez: "create or replace" conserva el
-- cuerpo, pero el permiso hay que asegurarlo.
grant execute on function public.pedir_ingreso(text,text,text,text,integer,date,text)
  to authenticated;

commit;

-- -------------------------------------------------------------------
-- CÓMO SE COMPRUEBA, Y POR QUÉ DESPUÉS DEL COMMIT
-- ---------------------------------------------------------------
--
-- Esto va DESPUÉS del "commit" a propósito. Es una comprobación de lectura, y si estuviera
-- dentro de la transacción que se acaba de confirmar, un error acá la dejaría deshecha.
--
-- Y la comprobación no es "corrí la migración y no se quejó". Es: ¿la función sigue nombrando
-- una columna que no existe? Porque ESO es lo que estaba roto, y un "create or replace" que
-- se ejecuta bien puede dejar el mismo error adentro.
--
-- 1. Que la función exista y que se pueda ver.
select
  'la función existe'      as que,
  count(*)::text           as resultado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'pedir_ingreso';

-- 2. Que la función NO mencione "empresa" suelto. Esta es la que importa.
--
-- Y se busca con los límites de palabra de PostgreSQL, que son "\y".
--
-- Y no "\b": en las expresiones regulares de PostgreSQL "\b" es un RETROCESO, no un límite de
-- palabra. Es un detalle de dialecto, y pasa porque el ejemplo de arriba está escrito para
-- otros motores.
--
-- Y "\y" sirve para lo que hace falta: "empresa_id" no se marca, porque después de "empresa"
-- sigue un "_", que es carácter de palabra, y entonces no hay límite ahí. Eso es lo que
-- distingue "la columna empresa" de "el parámetro p_empresa_id".
select
  case
    when pg_get_functiondef(p.oid) ~ '\yempresa\y'
      then 'MAL: la función todavía nombra "empresa" sin el "_id"'
    else 'BIEN: la función ya usa "empresa_id"'
  end as la_columna,
  n.nspname || '.' || p.proname as funcion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'pedir_ingreso';

-- 3. Las dos columnas que tienen que existir.
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'ingresos_pendientes'
  and column_name in ('empresa', 'empresa_id')
order by column_name;

-- Lo que tiene que salir: una sola fila, "empresa_id". Si salen las dos, o sale "empresa",
-- la tabla está en un estado raro y esto no lo arregla.
--
-- 4. Y la prueba de verdad, que es la que hace la persona: abrir "Solicitar ingreso de un
-- trabajador", llenar los datos y presionar "ENVIAR A RRHH". Que antes daba
--
--     column "empresa" of relation "ingresos_pendientes" does not exist
--
-- y ahora tiene que entrar en "LO QUE YA ENVIASTE".