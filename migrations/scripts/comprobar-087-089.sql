-- ===================================================================
-- migrations/scripts/comprobar-087-089.sql
-- ===================================================================
-- COMPROBAR QUE 087, 088 Y 089 QUEDARON BIEN, SIN TOCAR NADA
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- ESTE SCRIPT NO MODIFICA NADA
-- ---------------------------------------------------------------------
--
-- Solo son consultas de lectura. Se puede correr las veces que haga falta y no
-- deja nada atrás.
--
-- ---------------------------------------------------------------------
-- POR QUÉ EXISTE SI LAS MIGRACIONES YA SE COMPROBAN SÍ MISMAS
-- ---------------------------------------------------------------------
--
-- Porque cada migración lleva su comprobación, pero esa comprobación contesta
-- UNA pregunta: la de esa migración. Si las tres dieron "Success", cada una
-- está bien en lo suyo.
--
-- Lo que no contestan es si quedaron bien JUNTAS: que la función del 088 apunte
-- a la tabla del 086, que la del 089 pueda marcar tareas de verdad, que el
-- permiso que exige exista. Eso es lo que se pregunta acá.
--
-- ---------------------------------------------------------------------
-- CÓMO CORRERLO
-- ---------------------------------------------------------------------
--
-- En el panel de SQL de Supabase, en un solo bloque: se puede correr entero. Cada
-- consulta sale en la grilla de abajo, en orden.
--
-- O una por una, si se prefiere verlas de a una. Es lo mismo.

-- ---------------------------------------------------------------------
-- 1. LAS TRES MIGRACIONES, UNA POR RENGLÓN
-- ---------------------------------------------------------------------
-- Y QUÉ ESTÁ MIRANDO CADA COSA
--
-- perfiles           la 087 cambió "profiles", que no existe, por "perfiles"
-- pedir_permiso_horario  la 086 creó la función; la 088 la volvió a crear con
--                         el tipo correcto
-- permiso_horario    la tabla de la 086
-- trabajador_tareas  la tabla de la 089
-- marcar_tarea_trabajador  la función de la 089
--
-- Lo que sale abajo tiene que ser un "t" (verdadero) en las seis.
select
  to_regclass('public.perfiles')                      is not null  as hay_perfiles,
  to_regclass('public.permiso_horario')               is not null  as hay_permiso_horario,
  to_regproc('public.pedir_permiso_horario(text,date,time,time,text,text)')
                                                        is not null  as hay_pedir_permiso,
  to_regclass('public.trabajador_tareas')             is not null  as hay_trabajador_tareas,
  to_regproc('public.marcar_tarea_trabajador(text,text,text,boolean,text)')
                                                        is not null  as hay_marcar_tarea;

-- ---------------------------------------------------------------------
-- 2. LOS TIPOS, QUE ES LO QUE SE CAYÓ LA PRIMERA VEZ
-- ---------------------------------------------------------------------
--
-- Las dos columnas de abajo tienen que decir lo mismo: "integer".
--
-- Si la función dijera "bigint", esto saldría distinto y el error volvería a
-- aparecer recién al guardar un permiso, que es lo más tarde posible.
--
-- La 086 creó la columna como "id serial", y "serial" es un "integer": por eso
-- tiene que decir integer y no bigint.
select
  (select pg_catalog.format_type(p.prorettype, null)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'pedir_permiso_horario')
  as tipo_que_devuelve_la_funcion,
  (select data_type
     from information_schema.columns
    where table_schema = 'public' and table_name = 'permiso_horario'
      and column_name = 'id')
  as tipo_de_la_columna_id,
  (select count(*)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'trabajador_tareas')
  as columnas_de_trabajador_tareas;

-- ---------------------------------------------------------------------
-- 3. QUE LAS COLUMNAS DE LAS TAREAS SEAN LAS DIEZ QUE DICE EL CÓDIGO
-- ---------------------------------------------------------------------
--
-- La función "marcar_tarea_trabajador" escribe diez columnas: code, etapa, tarea,
-- hecho, hecho_por, hecho_por_nombre, hecho_por_rol, hecho_at, nota y creado_en.
--
-- Si la tabla tuviera menos, la función se caería al marcar la primera casilla.
--
-- Esto tiene que salir 10.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'trabajador_tareas'
 order by ordinal_position;

-- ---------------------------------------------------------------------
-- 4. QUE EL PERMISO QUE PIDE LA 089 EXISTA
-- ---------------------------------------------------------------------
--
-- La función de marcar una tarea exige el permiso "contratacion.editar". Si ese
-- permiso no está en la base, la casilla se ve pero al apretarla contesta que no
-- hay permiso, y no es un error: es que el permiso no existe.
--
-- Tiene que salir un "t" abajo.
select
  exists (select 1 from public.permiso_definiciones where clave = 'contratacion.editar')
  as existe_el_permiso_contratacion_editar;

-- ---------------------------------------------------------------------
-- 5. LO QUE YA SE MARCÓ, QUE CON LAS MIGRACIONES NUEVAS TIENE QUE ESTAR VACÍO
-- ---------------------------------------------------------------------
--
-- La 089 se acaba de aplicar, así que acá no puede haber nada. Si aparece algo, es
-- que la tabla ya existía de antes.
--
-- Tiene que salir 0.
select count(*) as tareas_ya_marcadas from public.trabajador_tareas;

-- ---------------------------------------------------------------------
-- SI ALGO SALIÓ MAL
-- ---------------------------------------------------------------------
--
-- El punto 1 con un "f": falta esa tabla o esa función. Se mira cuál y se corre
-- la migración que falta. El orden es 086, 087, 088, 089.
--
-- El punto 2 con dos tipos distintos: la 088 se tiene que volver a correr con la
-- versión corregida, que dice "returns integer".
--
-- El punto 3 con un número distinto de 10: la 089 se tiene que volver a correr.
--
-- El punto 4 con un "f": el permiso "contratacion.editar" no existe. La casilla se
-- va a ver apagada y al apretarla va a decir que no hay permiso. Eso no se
-- arregla con una migración: lo tiene que cargar alguien con el permiso de
-- administrador del sistema.