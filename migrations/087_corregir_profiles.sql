-- ===================================================================
-- 087_corregir_profiles.sql
-- ===================================================================
-- "relation public.profiles does not exist" — UN ERROR QUE CAUSÓ ESTE ARCHIVO
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- EL ERROR, TAL CUAL LO VIO LA PERSONA
-- ---------------------------------------------------------------------
--
-- En la pantalla de Permisos con hora, al apretar "Guardar permiso", salió en
-- rojo:
--
--     relation "public.profiles" does not exist
--     Código 42P01
--
-- 42P01 es "undefined_table": la tabla que se le pidió a Postgres no existe. Y
-- tiene razón: no existe.
--
-- ---------------------------------------------------------------------
-- POR QUÉ NO EXISTE
-- ---------------------------------------------------------------------
--
-- Porque la tabla se llama "perfiles", en castellano, y está definida desde la
-- migración 001, en migrations/001_schema.sql L7. Trae las columnas "id", "nombre",
-- "rol", "activo" y "created_at", y "nombre" y "rol" son las dos que se leen acá.
--
-- Y la 086 escribió "public.profiles", en inglés. Con el prefijo "public." y
-- todo, que por eso engaña: uno lee "public.profiles" y asume que es un nombre
-- real en un esquema real.
--
-- Y POR QUÉ NO SE COPIA LA DEFINICIÓN DE LA TABLA ACÁ
--
-- Porque copiarla dentro de este comentario es "código comentado", y un
-- comentario con código adentro se desactualiza solo: el día que la tabla cambie,
-- el comentario sigue mostrando la versión vieja y persuade de que la tabla es
-- así. Lo que se pone es dónde está, para que se vaya a mirar.
--
-- ---------------------------------------------------------------------
-- POR QUÉ TARDÓ TANTO EN APARECER
-- ---------------------------------------------------------------------
--
-- Porque la 086 se aplicó sin problema. "CREATE FUNCTION" no comprueba que las
-- tablas que aparecen adentro existan: PostgreSQL valida el cuerpo de un
-- PL/pgSQL recién cuando la función se ejecuta por primera vez. La tabla de
-- permisos se creó, las funciones se crearon, todo seemed bien.
--
-- Y el día que alguien apretó "Guardar permiso" —o sea, cuando alguien usó la
-- cosa por primera vez en serio— aparecieron las dos líneas de golpe.
--
-- Eso no es un defecto de Postgres: es lo que hace un lenguaje con funciones
-- que se validan en la primera llamada. Y es exactamente por eso que el error
-- tiene que verse EN PANTALLA y no en la consola. Esta vez se vio, y por eso
-- se pudo arreglar: en un aviso de la consola nadie lo habría visto.
--
-- ---------------------------------------------------------------------
-- POR QUÉ NO SE CORRIGE LA 086 Y SE HACE UNA 087
-- ---------------------------------------------------------------------
--
-- Porque la 086 ya está aplicada en la base de producción. Editar un archivo que
-- ya se corrió deja la base y el repositorio contando historias distintas: si
-- alguien vuelve a correr la 086, con el nombre viejo, rompe lo que esta 087
-- arregló.
--
-- Lo que se hace es una migración nueva que REEMPLAZA las dos funciones con el
-- nombre correcto. "CREATE OR REPLACE FUNCTION" con la misma firma pisa la
-- versión anterior sin tocar la tabla ni las filas.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ HAY QUE VOLVER A ESCRIBIR LAS FUNCIONES ENTERAS
-- ---------------------------------------------------------------------
--
-- Porque no hay un "SET" que renombre una referencia adentro del cuerpo de una
-- función. El nombre de la tabla está escrito en el código de la función, así
-- que la función se reescribe. Se copian tal cual, con una sola diferencia:
-- "public.profiles" pasa a ser "public.perfiles".
--
-- Las dos tienen la misma firma y el mismo cuerpo salvo ese nombre, así que la
-- consulta que hace el Javascript no cambia ni hace falta tocarlo.

begin;

-- ---------------------------------------------------------------------
-- PEDIR UN PERMISO
-- ---------------------------------------------------------------------
--
-- Y SE REESCRIBE ENTERA, Y NO SE USA UN "ALTER"
--
-- "ALTER FUNCTION" no puede cambiar el cuerpo de una función. Para cambiar lo
-- que hay adentro hay que volver a crearla con "CREATE OR REPLACE", y pasarle
-- el cuerpo completo. Por eso el archivo es largo: no es que cambiemos mucho,
-- es que Postgres no tiene una forma corta de cambiar una línea de adentro.
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
    -- <<<< LO QUE CAMBIA >>>>
    -- Antes decía "public.profiles", y esa tabla no existe. La que existe es
    -- "perfiles", que está en 001_schema.sql y trae "nombre" y "rol".
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
-- RESOLVER UN PERMISO
-- ---------------------------------------------------------------------
create or replace function public.resolver_permiso_horario(
  p_id         uuid,
  p_acepta     boolean,
  p_comentario text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.es_admin() or public.tiene_permiso('tarja.aprobar_cambio')) then
    raise exception 'Solo quien puede aprobar cambios resuelve los permisos horarios'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.permiso_horario
                  where id = p_id and estado = 'pendiente') then
    raise exception 'Ese permiso ya fue resuelto' using errcode = '22023';
  end if;

  update public.permiso_horario
     set estado = case when p_acepta then 'confirmado' else 'anulado' end,
         confirmado_por = auth.uid(),
         -- <<<< LO QUE CAMBIA >>>>
         -- Mismo nombre, mismo motivo: "public.profiles" -> "public.perfiles".
         confirmado_por_nombre = (select nombre from public.perfiles where id = auth.uid()),
         confirmado_at = now(),
         comentario = nullif(btrim(coalesce(p_comentario, '')), '')
   where id = p_id;
end;
$$;

grant execute on function public.resolver_permiso_horario(uuid,boolean,text)
  to authenticated;

-- ---------------------------------------------------------------------
-- UN COMENTARIO EN LA TABLA, PARA QUE NO SE REPITA EL ERROR
-- ---------------------------------------------------------------------
--
-- Porque un nombre de tabla se escribe mal una vez por lo menos. Y si alguien
-- vuelve a abrir la 086 y ve "public.profiles", va a pensar que es el nombre
-- bueno. Con esta nota, se ve que el nombre es "perfiles" y que el otro estuvo
-- mal.
comment on function public.pedir_permiso_horario(text,date,time,time,text,text) is
  'La tabla de usuarios es "public.PERFILES" (001_schema.sql), no "profiles". La 086 la nombro mal y por eso la pantalla daba 42P01. Ver migrations/087_corregir_profiles.sql.';

commit;

-- ---------------------------------------------------------------------
-- LO QUE HAY QUE CORRER DESPUÉS
-- ---------------------------------------------------------------------
--
--   node tools/comprueba-parentesis.js
--   migrations/scripts/comprobar-086-permisos-horarios.sql   (la parte B)
--
-- Y PARTE B, QUE AHORA SÍ TIENE QUE PODER DAR 42501 Y NADA MÁS
--
-- Desde el editor SQL, llamar a estas dos funciones va a contestar siempre
-- 42501, porque ahí no hay usuario con sesión. Lo que tiene que ContestAR es
-- "permiso denegado" y NADA MÁS.
--
-- Si sigue saliendo 42P01, es que quedó una función vieja en la base: la 087
-- tiene que haber corrido después de la 086.
--
-- Y PARA VOLVER ATRÁS
--
--   drop function if exists public.pedir_permiso_horario(text,date,time,time,text,text);
--   drop function if exists public.resolver_permiso_horario(uuid,boolean,text);
