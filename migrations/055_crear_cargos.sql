-- ===================================================================
-- 055: CREAR CARGOS DESDE LA PANTALLA
-- ===================================================================
--
-- QUÉ FALTA
-- ---------
-- En "v-empresas-cargos" se puede crear un GRUPO en línea, con el campo de arriba y el
-- botón "Crear grupo". De un CARGO no se puede: hay que salir a otra pantalla, o cargar la
-- lista entera desde un Excel. Y el resultado es que nadie crea el cargo, y el trabajador
-- queda con un cargo genérico porque el que le corresponde no existe.
--
-- Por eso esta migración agrega "gestionar_cargo", que es el hermano de "gestionar_grupo".
--
--
-- POR QUÉ NO SE PUEDE REUSAR "gestionar_grupo"
-- -------------------------------------------
-- Porque "gestionar_grupo" escribe en "epp_grupos" y un cargo vive en "epp_especialidades",
-- que además tiene su columna "grupo" apuntando al grupo. Son dos tablas con dos reglas.
--
--
-- EL NOMBRE DE LA COLUMNA ES "nombre", NO "p_nombre"
-- --------------------------------------------------
-- Por legibilidad, como el de la función de al lado. No es un descuido.
--
--
-- -------------------------------------------------------------------
-- LA TRAMPA DE LAS CLAVES, Y POR QUÉ ESTE GUION ES MÁS LARGO
-- ------------------------------------------------------------
--
-- Las claves que ya están en "epp_especialidades" llevan ESPACIOS:
--
--     'maestro de obra'
--     'operador de maquinaria'
--
-- Y las de "epp_grupos" llevan GUIONES:
--
--     'obra'
--     'general'
--
-- O sea que dos catálogos que conviven usan convenciones distintas. Y si el nombre se
-- pasara a clave con la misma regla de "gestionar_grupo" (espacios y acentos salen como
-- guion), pasarían dos cosas malas:
--
--   1. DUPLICADO. "Maestro de obra" se guardaría como 'maestro-de-obra' al lado del
--      'maestro de obra' que ya está. Dos cargos que son el mismo, y cada trabajador
--      apuntaría a uno u otro según cuál se escribiera primero. El EPP y las charlas
--      dependen del cargo, así que se le entregaría el kit de uno a la mitad de la gente.
--   2. INCONSISTENCIA. El mismo nombre escrito con guion o sin guion daría dos claves,
--      y nadie sabría cuál es la buena.
--
-- La salida es la que ya usa el resto del catálogo: la clave de una especialidad es su
-- nombre en minúsculas, sin pasar a guion. Se escribe un nombre y sale una clave, sin que
-- haya que elegir entre las dos convenciones.
--
-- Y si el cargo ya existe con OTRA forma de la misma clave —con guion, sin guion, con
-- tilde— no se crea otro: se devuelve la que ya está. Ver "ya hay un cargo con ese
-- nombre, acá está su clave" más abajo.
--
--
-- -------------------------------------------------------------------
-- POR QUÉ "on conflict do update" Y NO SOLO "do nothing"
-- ---------------------------------------------------------
--
-- Porque escribir el nombre de un cargo que ya existe, con otro orden o con otro grupo, es
-- una corrección legítima: la pantalla tiene que poder arreglar el grupo de un cargo mal
-- puesto, y para eso tiene que poder guardarlo sin que la base diga "ya existe".
--
-- Y no se cambia la clave de un cargo que ya existe, aunque se le pase otra: la clave es la
-- que tienen apuntando los trabajadores, los kits, las charlas y las plantillas. Cambiarla
-- deja huérfano todo eso. Por eso la clave se lee una vez y no se vuelve a tocar.
--
create or replace function public.gestionar_cargo(
  p_clave       text    default null,
  p_nombre      text    default null,
  p_grupo_clave text    default 'general',
  p_activo      boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_clave  text;
  v_grupo  text;
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('grupos.gestionar'))) then
    raise exception 'No tienes permiso para gestionar los cargos'
      using errcode = '42501';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El cargo necesita un nombre' using errcode = '22023';
  end if;

  v_nombre := btrim(p_nombre);

  -- -----------------------------------------------------------------
  -- EL GRUPO TIENE QUE EXISTIR
  -- -----------------------------------------------------------------
  -- Y por defecto "general", que es el grupo de lo que no es de un grupo definido y que
  -- existe desde la 051. Sin ese default, llamar sin grupo dejaría el cargo con la columna
  -- en null, y un cargo sin grupo NO aparece en el desplegable anidado del ingreso: el
  -- primer desplegable lista los grupos y el segundo los cargos de ese grupo, así que un
  -- cargo sin grupo no se ve en ninguno de los dos.
  v_grupo := coalesce(nullif(btrim(p_grupo_clave), ''), 'general');

  if not exists (select 1 from epp_grupos where clave = v_grupo) then
    raise exception 'Ese grupo no existe' using errcode = '22023';
  end if;

  -- -----------------------------------------------------------------
  -- LA CLAVE
  -- -----------------------------------------------------------------
  -- Si viene, se respeta tal cual: es el caso de una importación que ya tiene su clave.
  if p_clave is not null and btrim(p_clave) <> '' then
    v_clave := btrim(lower(btrim(p_clave)));
  else
    -- -----------------------------------------------------------------
    -- DEL NOMBRE, Y CON ESPACIOS
    -- -----------------------------------------------------------------
    -- Minúsculas, sin tildes y sin tocar los espacios. Como el catálogo que ya existe.
    --
    -- El orden importa y es el mismo que en "gestionar_grupo": primero minúsculas,
    -- después sin tildes. Al revés, la mayúscula inicial todavía no está en [a-z0-9] y
    -- se pierde.
    --
    -- Y las dos cadenas del "translate" tienen la MISMA cantidad de letras, a propósito.
    -- Si el origen es más largo que el destino, las letras que se quedan sin pareja salen
    -- con la PRIMERA del destino, sin error: 'Á' se volvería 'e'. Hoy eso no se ve, porque
    -- "lower()" ya bajó las mayúsculas antes de que el "translate" las mire. O sea que el
    -- acierto depende de una propiedad que no se lee en el código. Ver [clave-01].
    v_clave := btrim(
      translate(lower(v_nombre), 'áéíóúüÁÉÍÓÚÜñÑ', 'aeiouuaeiouunn'),
      ' ');
  end if;

  if v_clave = '' then
    raise exception 'Ese nombre no deja ninguna clave utilizable' using errcode = '22023';
  end if;

  -- -----------------------------------------------------------------
  -- ¿YA EXISTE EL MISMO CARGO, ESCRITO DE OTRA MANERA?
  -- -----------------------------------------------------------------
  -- Acá se comparan las claves normalizadas: minúsculas, sin tildes, y con guion y
  -- espacio como si fueran lo mismo. Porque si alguien escribe "Maestro-de-obra" y ya
  -- hay "maestro de obra", el cargo no es nuevo: es el mismo, y crear un segundo sería
  -- el duplicado del que habla el comentario de arriba.
  --
  -- Y en ese caso se devuelve la clave que YA está, sin crear nada. La pantalla lo dice y
  -- el trabajador va a seguir viendo un cargo, que es lo que quería.
  if p_clave is null or btrim(p_clave) = '' then
    select e.clave into v_clave
      from epp_especialidades e
     where lower(regexp_replace(
             translate(e.clave, 'áéíóúüÁÉÍÓÚÜñÑ', 'aeiouuaeiouunn'),
             '[-_]+', ' ', 'g')) = v_clave
     limit 1;

    if v_clave is not null then
      return v_clave;
    end if;
  end if;

  -- -----------------------------------------------------------------
  -- EL INSERT
  -- -----------------------------------------------------------------
  insert into epp_especialidades (clave, nombre, grupo, activa)
  values (v_clave, v_nombre, v_grupo, coalesce(p_activo, true))
  on conflict (clave) do update
    set nombre = excluded.nombre,
        grupo = excluded.grupo,
        activa = excluded.activa;

  return v_clave;
end;
$$;

grant execute on function public.gestionar_cargo(text,text,text,boolean) to authenticated;

-- -------------------------------------------------------------------
-- POR QUÉ "authenticated" Y NO SOLO LOS ADMIN
-- -------------------------------------------------------------------
-- El permiso "grupos.gestionar" existe desde la 051 y describe justo esto: crear grupos y
-- mover cargos. El chequeo de adentro usa "tiene_permiso", así que un rol que lo tenga
-- alcanza y basta.
--
-- El "grant" va aparte porque sin él la función existe pero nadie la puede llamar: es el
-- motivo más común de "dice que la función no existe" cuando en realidad el permiso se
-- está comiendo el "search_path".
comment on function public.gestionar_cargo(text,text,text,boolean) is
  'Crea un cargo en "epp_especialidades" dentro de un grupo, y devuelve su clave. Si el cargo ya existe escrito de otra forma, devuelve la clave que ya hay y no crea un segundo.';
