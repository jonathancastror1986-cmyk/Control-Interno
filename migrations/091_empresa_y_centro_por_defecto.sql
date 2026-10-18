-- ===================================================================
-- 091_empresa_y_centro_por_defecto.sql
-- ===================================================================
-- CARGA LA EMPRESA Y EL CENTRO DE COSTO QUE FALTABAN
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- MEDIDO EN PRODUCCIÓN, ANTES DE ESCRIBIR ESTO
-- ---------------------------------------------------------------------
--
-- De 47 trabajadores:
--
--     42 con empresa_id vacío
--      3 en la "Empresa principal"
--      2 en la "Empresa de Prueba"
--      1 con centro de costo cargado
--
-- Y eso explica por qué el aislamiento no estaba acortando nada: con 42
-- trabajadores sin empresa, la pregunta "¿esta empresa es la tuya?" no
-- tenía contra qué compararse, y la respuesta le decía sí a todo el mundo.
--
-- ---------------------------------------------------------------------
-- QUÉ HACE, EN ORDEN
-- ---------------------------------------------------------------------
--
--   1. Revisa que la "Empresa principal" sea UNA SOLA.
--   2. Crea el centro de costo por defecto de esa empresa, si no existe.
--   3. Le pone esa empresa a los 42 que no tenían ninguna.
--   4. Le pone el centro por defecto a los que ya están en la principal y no
--      tienen centro.
--
-- Y NO TOCA:
--
--   - Los 2 de "Empresa de Prueba". Tienen empresa y esa empresa es la suya.
--   - El trabajador que ya tiene centro de costo. Un centro cargado a mano
--     vale más que un centro por defecto.
--   - `perfil_centros_costo`. El alcance de aprobación NO se da aquí: lo
--     decide una persona, y dar alcance automáticamente es exactamente el
--     agujero que la 090 cerró.
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTO NO ES SOLO UN ARREGLO DE DATOS SUCIOS
-- ---------------------------------------------------------------------
--
-- Porque con 42 personas sin empresa, el flujo de permisos con hora no tiene
-- contra qué acotar: la función pregunta "es una de mis empresas" y no hay
-- empresa con la que comparar. La 090 quedó con la puerta cerrada y la base
-- casi vacía. Esto llena la base para que esa puerta sirva de algo.

begin;

-- ---------------------------------------------------------------------
-- 1) LA EMPRESA PRINCIPAL, Y QUE SEA UNA SOLA
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ SE BUSCA POR NOMBRE Y NO POR ID
--
-- Porque el ID depende del orden en que se crearon las empresas, y ese orden
-- no está escrito en ningún archivo. El nombre sí.
--
-- Y POR QUÉ SE DETIENE SI HAY MÁS DE UNA
--
-- Porque "Empresa principal" la crea la 014 solo si la tabla estaba vacía
-- (014_multi_empresa.sql:37-39), y la tuya se creó de otra forma. Si hay dos
-- con ese nombre, elegir una al azar es asignarle 42 personas a una empresa que
-- no es la que cree nadie, y eso no se descubre hasta que alguien busca a un
-- trabajador y no lo encuentra.
do $$
declare
  v_cuantas int;
begin
  select count(*)::int into v_cuantas
    from public.empresa
   where nombre = 'Empresa principal';

  if v_cuantas <> 1 then
    raise exception
      'Hay % empresas llamadas "Empresa principal" y tiene que haber exactamente una. No se toca nada.',
      v_cuantas;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) EL CENTRO DE COSTO POR DEFECTO
-- ---------------------------------------------------------------------
--
-- Se llama "PRINCIPAL" / "Principal".
--
-- Y POR QUÉ EL CÓDIGO Y NO EL NOMBRE ES EL QUE VA DENTRO DEL "UNIQUE"
--
-- Porque el único de "centros_costo" es (empresa_id, code), no el nombre
-- (030_relojes_totem.sql:83-89). Dos empresas pueden tener las dos un centro
-- que se llame "Principal" sin que choquen, y por eso el nombre va como texto
-- libre y no como clave.
--
-- Y POR QUÉ "ON CONFLICT" NO ALCANZA
--
-- Porque "on conflict" nombra UNA columna, y el único de acá es de dos. Con
-- "on conflict" habría que escribir la condición entera, que es más difícil de
-- leer que un "if not exists".
insert into public.centros_costo (code, nombre, empresa_id)
select 'PRINCIPAL', 'Principal', e.id
  from public.empresa e
 where e.nombre = 'Empresa principal'
   and not exists (select 1
                     from public.centros_costo c
                    where c.empresa_id = e.id
                      and c.code = 'PRINCIPAL');

-- ---------------------------------------------------------------------
-- 3) LA EMPRESA A LOS QUE NO TENÍAN
-- ---------------------------------------------------------------------
--
-- Solo los que están en NULL. Los que ya tienen una empresa quedan como están,
-- incluidos los de "Empresa de Prueba".
--
-- Y POR QUÉ NO SE LIMITA A LOS 42 CÓDIGOS DE LA LISTA
--
-- Porque la lista de más abajo es para DESHACER, y para deshacer bien tiene
-- que ser exacta. Para aplicar, lo correcto es la regla: "los que no tienen
-- empresa". Si alguien ya cargó una empresa a mano antes de correr esto, esa
-- persona entra y no se le pisa, que es lo que tiene que pasar.
update public.trabajadores t
   set empresa_id = e.id
  from public.empresa e
 where e.nombre = 'Empresa principal'
   and t.empresa_id is null;

-- ---------------------------------------------------------------------
-- 4) EL CENTRO A LOS QUE NO TENÍAN, Y SOLO DE LA PRINCIPAL
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ LA CONDICIÓN DEL CENTRO VA DENTRO DEL "UPDATE" Y NO ANTES
--
-- Porque si el "update" se escribiera sin la condición, el filtro de afuera
-- corre una vez, y entre que se arma la frase y se ejecuta, alguien puede
-- haber cargado un centro a un trabajador. La migración le pisaría el centro que
-- esa persona acababa de poner, y no habría forma de saber que pasó. Con la
-- condición adentro, cada fila se compara en el momento de escribirse.
--
-- Y POR QUÉ "t.empresa_id = e.id" ESTÁ EXPRESO
--
-- Porque la unión con "empresa" ya lo limita, pero dejarlo escrito es lo que
-- hace que un cambio futuro en esa unión no abra esto sin que nadie lo note.
update public.trabajadores t
   set centro_costo_id = c.id
  from public.empresa e
  join public.centros_costo c
    on c.empresa_id = e.id
   and c.code = 'PRINCIPAL'
 where e.nombre = 'Empresa principal'
   and t.empresa_id = e.id
   and t.centro_costo_id is null;

-- ---------------------------------------------------------------------
-- 5) QUE LA LISTA DEL DESHACER SIGA SIENDO COMPLETA
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ ESTO ES UNA COMPROBACIÓN Y NO UN AVISO
--
-- Porque el bloque de deshacer de más abajo solo menciona 42 códigos: los que
-- había sin empresa el día que se escribió esto. Si hoy hay un trabajador SIN
-- empresa cuyo código no está en esa lista, esta migración lo va a asignar y el
-- deshacer no lo va a devolver. El archivo quedaría diciendo que se puede
-- volver atrás cuando en realidad parte queda sin empresa.
--
-- Con esta comprobación eso se detiene y se ve el número de los que sobran.
do $$
declare
  v_esperados constant text[] := array[
    '2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18',
    '19','20','22','23','24','25','26','27','28','29','30','31','32','33','34',
    '35','36','37','38','39','40','41','42','43','44'
  ];
  v_principales int;
  v_sin_empresa int;
  v_fuera int;
  v_ya_puestas int;
begin
  select count(*)::int into v_principales
    from public.empresa where nombre = 'Empresa principal';
  if v_principales <> 1 then
    raise exception 'Aparecieron % empresas llamadas "Empresa principal". Se revierte todo.',
      v_principales;
  end if;

  -- Y LOS QUE QUEDARON SIN EMPRESA Y NO ESTÁN EN LA LISTA
  --
  -- Si esto sale distinto de cero, no es un problema de esta migración: es que
  -- hay trabajadores que no estaban el día que se escribió. Y en ese caso el
  -- deshacer los dejaría con la empresa puesta sin poder volverlos atrás.
  select count(*)::int into v_fuera
    from public.trabajadores
   where empresa_id is null
     and not (code = any (v_esperados));

  if v_fuera > 0 then
    raise exception
      'Quedan % trabajadores sin empresa cuyo código NO está en la lista del 2 al 44 sin el 21. Esta migración los cambiaría y el bloque de deshacer no los cubre. Revisar la lista primero.',
      v_fuera;
  end if;

  select count(*)::int into v_sin_empresa
    from public.trabajadores where empresa_id is null;

  -- Y LOS DE LA LISTA QUE YA TENÍAN EMPRESA: no es un error, es que alguien los
  -- cargó antes. Se avisa, porque son los que el deshacer no va a tocar.
  select count(*)::int into v_ya_puestas
    from public.trabajadores
   where code = any (v_esperados)
     and empresa_id is not null;

  raise notice
    'Sin empresa quedan %. De los % códigos esperados, % ya tenían empresa: esta migración no los cambia y el deshacer tampoco los vuelve atrás.',
    v_sin_empresa, 42, v_ya_puestas;
end;
$$;

commit;

-- ===================================================================
-- CÓMO COMPROBAR QUE QUEDÓ BIEN
-- ===================================================================
--
-- Las consultas están en `migrations/diagnostico-091-verificacion.sql`, que es
-- solo lectura y se puede correr las veces que haga falta.
--
-- Y POR QUÉ NO ESTÁN ESCRITAS ACÁ, COMENTADAS
--
-- Porque el guardián `comprueba-codigo-sql` marca el SQL comentado como
-- sospechoso, y tiene razón: en este proyecto una línea "--   select ..." es
-- código que parece activo y no lo está. Una vez dogue una migración con un
-- `insert` comentado que después alguien corrió creyendo que era parte del
-- script.
--
-- Un bloque de verificación pegable es un `diagnostico-*.sql`, que es para lo
-- que existen. Acá queda la referencia.

-- ===================================================================
-- CÓMO DESHACERLA
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- POR QUÉ VA COMENTADO Y NO ES UN BLOQUE QUE SE PUEDA CORRER
-- ---------------------------------------------------------------------
--
-- Porque deshacer una migración ya aplicada es una decisión, no una tarea: se
-- escribe para que esté a mano el día que haga falta, y no para apretarlo por las
-- dudas.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ SOLO ESOS 42 CÓDIGOS
-- ---------------------------------------------------------------------
--
-- Porque son los que estaban sin empresa: del 2 al 20 y del 22 al 44, sin el
-- 21. Deshacer por regla, con "todos los de la empresa principal", llevaría la
-- empresa a NULL de alguien que la cargó a mano después, y eso sería peor que no
-- deshacer.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ CON LA CONDICIÓN DE "SOLO SI SIGUEN CON LO QUE LES PUSO"
-- ---------------------------------------------------------------------
--
-- Porque entre que se aplicó esta migración y el día que se deshace, alguien
-- puede haber cambiado la empresa o el centro de un trabajador a mano. Si se lo
-- pone en NULL sin preguntar, se borra un dato que esta migración nunca puso. Con
-- la condición, solo se vuelve atrás lo que esta migración puso, y lo que alguien
-- cambió después se queda como estaba.
--
-- ---------------------------------------------------------------------
-- Y EL ORDEN IMPORTA
-- ---------------------------------------------------------------------
--
-- Primero los trabajadores, DESPUÉS el centro. Al revés, el "on delete set null"
-- de la columna (064_centro_costo_trabajador.sql:76-77) pone a los trabajadores
-- en NULL igual, pero después de que el centro ya no exista y no haya vuelta atrás.
--
-- ---------------------------------------------------------------------
-- EL SQL
-- ---------------------------------------------------------------------
--
--   begin;
--
--   -- 1) LA EMPRESA EN NULL: SOLO LOS 42, Y SOLO SI SIGUEN EN LA PRINCIPAL
--   update public.trabajadores
--      set empresa_id = null
--    where code = any (array[
--      '2','3','4','5','6','7','8','9','10','11','12','13','14','15','16',
--      '17','18','19','20','22','23','24','25','26','27','28','29','30','31',
--      '32','33','34','35','36','37','38','39','40','41','42','43','44'])
--      and empresa_id = (select id from public.empresa where nombre = 'Empresa principal');
--
--   -- 2) EL CENTRO EN NULL: SOLO LOS 42, Y SOLO SI SIGUEN EN EL PRINCIPAL
--   update public.trabajadores
--      set centro_costo_id = null
--    where code = any (array[
--      '2','3','4','5','6','7','8','9','10','11','12','13','14','15','16',
--      '17','18','19','20','22','23','24','25','26','27','28','29','30','31',
--      '32','33','34','35','36','37','38','39','40','41','42','43','44'])
--      and centro_costo_id = (select id from public.centros_costo
--                               where code = 'PRINCIPAL'
--                                 and empresa_id = (select id from public.empresa
--                                                    where nombre = 'Empresa principal'));
--
--   -- 3) Y SOLO AHORA EL CENTRO, QUE YA NO LO USA NADIE
--   delete from public.centros_costo
--    where code = 'PRINCIPAL'
--      and empresa_id = (select id from public.empresa where nombre = 'Empresa principal');
--
--   commit;
--
-- ---------------------------------------------------------------------
-- Y PARA COMPROBAR QUE SE DESHIZO
-- ---------------------------------------------------------------------
--
--   select count(*) filter (where empresa_id is null) as sin_empresa,
--          count(*) filter (where centro_costo_id is null) as sin_centro
--     from public.trabajadores;
--
-- Lo que tiene que volver a salir: 42 sin empresa. Y 42 sin centro, SALVO que
-- el único trabajador que ya tenía centro sea uno de los 42: en ese caso su
-- centro se queda puesto, porque el punto 2 del deshacer solo toca los que
-- quedaron con el centro por defecto.