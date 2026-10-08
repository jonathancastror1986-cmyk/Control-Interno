-- ===================================================================
-- ENCENDER-MODULOS-085.sql
-- ===================================================================
--
-- ENCIENDE LOS MÓDULOS DE LAS EMPRESAS QUE YA EXISTEN
--
-- ---------------------------------------------------------------------
-- ESTE GUION CORRE DESPUÉS DE "085_modulos_por_empresa.sql", Y HAY QUE CORRERLO
-- ---------------------------------------------------------------------
--
-- Porque la tabla nueva decide que "SIN FILA = APAGADO", y una empresa que no
-- tiene fila no tiene ningún módulo. Al aplicar la migración, todas las
-- empresas quedan sin nada: no hay error, no hay aviso, y la aplicación abre
-- con el menú vacío.
--
-- Este guion es el que prende lo que hay que prender. Es escritura, no DDL, y
-- por eso vive acá y no en la migración.
--
-- ---------------------------------------------------------------------
-- QUÉ PRENDE, Y QUÉ NO
-- ---------------------------------------------------------------------
--
-- Prende once de los doce módulos. NO prende "relojes", que es el aparato físico:
-- el Tótem, el kiosco y el reloj en la obra, que es lo que todavía no está
-- certificado.
--
-- Y PRENDE "MARC AJES", QUE ES LO CONTRARIO DE LO QUE UNO PENSARÍA
--
-- Porque "relojes" y "marcajes" no son la misma cosa:
--
--     reloj      el aparato
--     marcajes   los datos: subir las marcas del sistema de asistencia y cruzarlas
--
-- Los datos se cargan a mano, en un archivo. No necesitan el aparato. Y son
-- justamente los que hacen falta ahora para poder verificar el Tótem después.
--
-- ---------------------------------------------------------------------
-- Y SI SE QUIERE EMPEZAR DE CERO
--
-- Borren el "insert" ynfiren solo lo que corresponda empresa por empresa. Este
-- guion es el que deja el sistema funcionando, no el que decide qué se
-- contrata: esa decisión es de a una.
--
-- ---------------------------------------------------------------------
-- POR QUÉ ES SEGURO DE VOLVER A CORRER
-- ---------------------------------------------------------------------
--
-- "on conflict do nothing" sobre la clave única "(empresa_id, modulo_nombre)".
-- Correrlo dos veces no prende nada nuevo ni cambia nada viejo: la segunda vez no
-- hay nada que insertar. Y no hay "update", así que no puede pisar una decisión que
-- alguien tomó después a mano.
--
-- Eso último es importante: si alguien apagó un módulo a propósito desde el
-- panel, y después se corre este guion otra vez, ese módulo NO se vuelve a
-- prender. Prenderlo tiene que ser una decisión, no un efecto secundario.

begin;

-- ===================================================================
-- LA VISTA PREVIA
-- ===================================================================
-- Y PRIMERO, ANTES DE ESCRIBIR NADA
--
-- Porque este guion enciende módulos, y encender un módulo equivocado abre una
-- pantalla que no debía estar abierta en 47 empresas. Verlo antes es lo que
-- separa "prendí lo que correspondía" de "se me pasó algo".
--
-- Y SON TRES CONSULTAS DE SOLO LECTURA: SI ESTA CONSULTA FALLA, NO SE CORRIÓ NADA

-- 1. Las empresas que hay, y lo que se va a crear en cada una.
--
-- Y POR QUÉ AQUÍ NO HAY UN "select count(*) from (values ...)" PARA DECIR
-- CUÁNTAS FILAS VAN A CREARSE
--
-- La primera versión lo tenía, para que la consulta dijera "se crearán 11
-- filas". No lo tiene ahora, y la razón es que esa construcción—anidada, con un
-- "values" adentro de un "select" dentro de un "cast" dentro de una concatenación
-- — tenía un paréntesis de más y PostgreSQL la rechazó entera:
--
--     ERROR: 42601: syntax error at or near ")"
--
-- O sea: por poner un número decorativo en una vista previa, no se encendió
-- NINGÚN módulo de NINGUNA empresa. Y el error no señalaba la causa: el paréntesis
-- de más estaba tres renglones más arriba del que marcaba.
--
-- El "cast(... as text)" tampoco hacía falta acá, porque una palabra ya es texto.
-- Se había puesto por uniformidad con las otras consultas, y la uniformidad fue
-- justo lo que hizo el error más difícil de ver.
select
  cast('--- 1. LAS EMPRESAS QUE HAY ---' as text)                              as texto,
  cast(e.id::text as text)                                                    as empresa_id,
  cast(e.nombre as text)                                                      as nombre,
  cast('una fila por cada módulo, MENOS "relojes"' as text)                   as filas,
  cast('*** "relojes" NO se prende: el aparato no esta certificado' as text)  as aviso
from public.empresa e
order by e.id;

-- 2. Lo que YA está escrito, para no perder de vista una decisión anterior.
--    Si acá aparece una fila con activo = false, alguien apagó ese módulo a
--    propósito, y este guion NO lo va a volver a prender.
select
  cast('--- 2. LO QUE YA ESTA ESCRITO ---' as text) as texto,
  cast(m.empresa_id::text as text)                  as empresa_id,
  cast(m.modulo_nombre as text)                     as modulo,
  cast(case when m.activo then 'prendido' else 'apagado a mano' end as text) as estado
from public.empresa_modulos m
order by m.empresa_id, m.modulo_nombre;

commit;

-- ===================================================================
-- EL ENCENDIDO
-- ===================================================================
--
-- Y DESPUÉS DEL "COMMIT" DE ARRIBA, PARA QUE LAS TRES CONSULTAS DE LA VISTA
-- PREVIA SEAN INDEPENDIENTES DEL ENCENDIDO
--
-- Si las dos cosas estuvieran en la misma transacción, una consulta que fallara
-- dejaría el encendido a medias, sin que se note.

begin;

-- Y LA LISTA DE LO QUE SE ENCIENDE, EN UN "CTE"
--
-- Y POR QUÉ UN "WITH" Y NO UN "(values ...)" ADENTRO DEL "INSERT"
--
-- Porque el "values" anidado dentro del "select" del "insert" es lo quedifficulta
-- contar paréntesis, y la primera versión de este guion tenía uno de más y no
-- prendió nada. Con un "with" la lista va arriba, aparte, y el "insert" de abajo
-- es una línea: es más fácil de leer y más difícil de romper.
--
-- Y LA LISTA APARECE DOS VECES EN ESTE ARCHIVO: ACÁ Y EN EL "INSERT"
--
-- Y no hay forma de que aparezca una sola vez, porque son dos sentencias
-- separadas y un "with" no sobrevive de una a otra. Se podría con una tabla
-- temporal, que es más trabajo para once palabras.
with mods(modulo) as (
  values ('porteria'),
         ('trabajadores'),
         ('asistencia'),
         ('carga_masiva'),
         ('empresas'),
         ('contratos'),
         ('expedientes'),
         ('solicitar_ingreso'),
         ('epp'),
         ('remuneraciones'),
         ('marcajes')
)
insert into public.empresa_modulos (empresa_id, modulo_nombre, activo)
select
  e.id,
  m.modulo,
  true
from public.empresa e
cross join mods m
-- Y "ON CONFLICT DO NOTHING", QUE ES LO QUE LO HACE SEGURO DE VOLVER A CORRER
--
-- Y sobre todo lo que lo hace seguro de NO PISAR: si el módulo ya está, esta fila
-- no se crea y la anterior queda como estaba. Un módulo que alguien apagó a
-- propósito sigue apagado después de correr este guion diez veces.
on conflict (empresa_id, modulo_nombre) do nothing;

commit;

-- ===================================================================
-- QUÉ TIENE QUE DECIR ESTE GUION, PARA PODER TERMINAR
-- ===================================================================
--
-- Y SON LAS MISMAS TRES CONSULTAS DE ARRIBA, PARA COMPARAR
--
-- Antes y después. Si las cifras no coinciden, algo se prendió de más y hay que
-- apagarlo a mano antes de que alguien lo use.

-- 1. Cuántas filas hay ahora por módulo. Lo esperable: una por módulo por
--    empresa, y NADIE con "relojes".
select
  cast('--- 1. FILAS POR MODULO ---' as text) as texto,
  cast(m.modulo_nombre as text)              as modulo,
  cast(count(*)::text as text)                                 as filas,
  -- Y EL "FILTER" VA DENTRO DEL "CAST", Y NO CON "::" ADELANTE
  --
  -- Porque "count(*) filter (where ...)::text" no está claro de qué se castea:
  -- el "::" se pega más fuerte que la cláusula "filter", y según cómo la arme el
  -- analizador puede castear el "where" en vez del resultado. Con
  -- "cast(count(*) filter (where ...) as text)" no hay duda: lo que se castea es
  -- la cuenta.
  cast(count(*) filter (where m.activo) as text) as prendidas,
  cast(case when m.modulo_nombre = 'relojes' and count(*) > 0
       then '*** el RELOJ se prendio: hay que apagarlo a mano'
       else 'ok' end as text)                  as aviso
from public.empresa_modulos m
group by m.modulo_nombre
order by m.modulo_nombre;

-- 2. Las empresas que quedaron sin NINGÚN módulo. Tiene que salir vacío.
--    Si sale una empresa, no le llegó el encendido y va a ver el menú vacío.
select
  cast('--- 2. EMPRESAS SIN NINGUN MODULO ---' as text) as texto,
  cast(e.id::text as text)                              as empresa_id,
  cast(e.nombre as text)                                as nombre,
  cast('*** va a abrir sin menu: revisar' as text)       as aviso
from public.empresa e
where not exists (select 1 from public.empresa_modulos m
                  where m.empresa_id = e.id)
order by e.id;

-- 3. Cuántas empresas tocan la política de lectura. Si son menos que las que hay,
--    hay empresas sin usuario y eso está bien: se prenden igual, y cuando alguien
--    se asigne a esa empresa va a ver los módulos.
select
  cast('--- 3. CONTROL ---' as text) as texto,
  cast((select count(*) from public.empresa)::text as text)      as empresas,
  cast((select count(*) from public.empresa_modulos)::text as text) as filas_de_modulos,
  cast((select count(*) from public.empresa_modulos where activo)::text as text) as prendidos,
  cast(case when (select count(*) from public.empresa_modulos where modulo_nombre = 'relojes' and activo) = 0
       then 'ok  "relojes" sigue apagado, como tiene que estar'
       else '*** HAY RELOJES PRENDIDOS' end as text)              as reloj
;