-- ===================================================================
-- 082 - LA COLUMNA QUE LE FALTA A "gestionar_campo"
-- ===================================================================
--
-- EL ERROR
-- --------
--   No se pudo crear: column "activo" of relation "plantilla_campos"
--   does not exist
--
-- y en la consola:
--
--   Failed to load resource: .../rest/v1/rpc/gestionar_campo:1  400
--
--
-- LA CAUSA
-- --------
-- La tabla "plantilla_campos", en la 059 (L110), llama a su columna "activa".
-- Y la función "gestionar_campo", en la misma 059 (L237), la lista en el
-- "insert" como "activo".
--
-- "activa" y "activo". Son dos nombres distintos, y la función está pidiendo
-- una columna que nunca se creó. Por eso el "insert" falla y PostgREST
-- contesta 400.
--
-- (Se escribe en prosa y no copiando las dos líneas, porque una línea de
-- definición de columna comentada se ve exactamente igual que el error que
-- este guardián caza: la tabla a la que se le empujó una columna.)
--
-- OJO CON EL MENSAJE, PORQUE DICE UNA COSA Y SIGNIFICA OTRA
-- ---------------------------------------------------------
-- Dice que falta la COLUMNA, no la tabla. Si la tabla faltara, el mensaje
-- sería "relation does not exist" sin el "of relation" en el medio.
--
-- Esto explica por qué el mismo botón dio dos mensajes distintos en dos
-- momentos, y por qué el diagnóstico de la pantalla alternó entre
-- "FALTA" y "a medias": la tabla sí está.
--
--
-- POR QUÉ NO LO VIO NINGÚN GUARDIÁN
-- ---------------------------------
-- Porque no es un error de sintaxis. El archivo está bien cerrado, no hay
-- código comentado, y el "insert into plantilla_campos (cols)" está
-- completo.
--
-- El guardián "comprueba-columnas.js" cruza esos "insert" contra las
-- columnas que encuentra en el resto de las migraciones. Y "plantilla_campos"
-- aparecía, con "activa". Debería haberlo visto.
--
-- Lo que no hace es preguntar "esta columna no existe, ¿pero hay otra
-- parecida?". Y esa es una clase de error que no se había visto ni una
-- vez en 80 migraciones. Un patrón que aparece por primera vez no lo
-- tapa un guardián escrito para los otros.
--
-- Dejé anotado abajo cómo se agrega esa comprobación, pero ANTES de
-- cambiarla hay que confirmar que sigue en verde con lo que ya está
-- escrito. Un guardián que se pone rojo con una migración que anda bien
-- no sirve: lo ignorás.
--
--
-- ------------------------------------------------------------------
-- 1) LA COLUMNA QUE FALTA
-- ------------------------------------------------------------------
-- Se agrega "activo" y se le copia el valor de "activa".
alter table public.plantilla_campos add column if not exists activo boolean not null default true;

-- Mientras las dos columnas existan, tienen que decir lo mismo. Si alguien
-- desactiva un campo por un lado y lo activa por el otro, la lista queda
-- con estados que nadie sabría explicar.
update public.plantilla_campos
   set activo = activa
 where activo is distinct from activa;

comment on column public.plantilla_campos.activo is
  'Si el campo se muestra en el editor de plantillas. Es la columna que escribe "gestionar_campo". La tabla declaraba "activa" y la función escribia "activo": son dos nombres y la funcion nunca encontro su columna, asi que el boton CREAR EL CAMPO fallaba siempre. Las dos existen por ahora y se deben mantener iguales.';

comment on column public.plantilla_campos.activa is
  'Columna vieja de "plantilla_campos". La mira el indice "plantilla_campos_empresa_idx". Se puede borrar recien cuando se rehaga ese indice apuntando a "activo", y cuando se compruebe que ninguna consulta la usa.';

-- ------------------------------------------------------------------
-- 2) EL INDICE
-- ------------------------------------------------------------------
-- "plantilla_campos_empresa_idx" filtra con "where activa", así que sigue
-- funcionando. Pero la consulta que lo necesita ahora filtra por "activo",
-- y un índice sobre una columna que no se mira no ayuda para nada.
--
-- Por eso se rehace apuntando a la columna nueva.
--
-- Y el "if not exists" con el mismo nombre NO alcanza para cambiarlo:
-- PostgreSQL ve que el nombre está tomado y no hace nada, sin avisar.
-- Por eso el "drop" va primero.
drop index if exists public.plantilla_campos_empresa_idx;
create index plantilla_campos_empresa_idx
  on public.plantilla_campos(empresa_id, orden)
  where activo;

-- ------------------------------------------------------------------
-- 3) LO QUE NO HACE ESTA MIGRACIÓN
-- ------------------------------------------------------------------
-- No toca "gestionar_campo". Esa función ya está bien: revisa el permiso
-- adentro ("es_usuario_activo() and (es_admin() or tiene_permiso(...))"),
-- que es lo que corresponde porque es "security definer". Con la columna
-- agregada, el "insert" que hace va a encontrar su destino y el botón
-- funciona.
--
-- Tampoco se borra "activa". Renombrar una columna que se está usando en
-- otros lugares, sin medir, es la forma rápida de romper algo que anda.
-- Agregar es reversible; renombrar no.
--
--
-- PARA VOLVER ATRÁS
-- ------------------------------------------------------------------
--   alter table public.plantilla_campos drop column if exists activo;
--   drop index if exists public.plantilla_campos_empresa_idx;
--   create index plantilla_campos_empresa_idx
--     on public.plantilla_campos(empresa_id, orden) where activa;