-- ===================================================================
-- DIAGNÓSTICO: QUÉ FALTA PARA PODER CORRER LA 076 Y LA 077
-- ===================================================================

-- Corre esto ENTERO. No cambia nada: solo mira y te dice qué falta.

-- ---------------------------------------------------------------------
-- POR QUÉ ESTE DIAGNÓSTICO EXISTE
-- ---------------------------------------------------------------------

-- Porque la 076 y la 077 se caeron al pegarlas, con dos errores que no se
-- veen leyendo el archivo:

--   · la 077 pide public.puede_ver_trabajador(), que crea la 067
--   · y ademas pedia una funcion que no existe en NINGUN archivo del
--     proyecto: se llamaba existe_permiso y la de veras se llama
--     tiene_permiso

-- Los dos aparecieron al pegarlas en el panel, que es donde menos conviene
-- descubrir que a una migración le falta algo.

-- ===================================================================
-- 1) LAS FUNCIONES QUE LA 076 Y LA 077 NECESITAN
-- ===================================================================

-- Y SOLO INTERESAN CUATRO. "si" en "puede" es lo que hay que mirar.

with necesario(nombre, para_que_sirve) as (
  values
    ('es_usuario_activo',        'las politicas de lectura de la 076'),
    ('puede_ver_trabajador',     'el aislamiento por empresa de la 077'),
    ('tiene_permiso',            'el permiso de cargar remuneraciones'),
    ('es_admin',                 'lo usan otras politicas del proyecto')
)
select n.nombre,
       n.para_que_sirve,
       case when exists (select 1 from pg_proc p
                       join pg_namespace ns on ns.oid = p.pronamespace
                     where p.proname = n.nombre and ns.nspname = 'public')
         then 'si' else 'FALTA' end as esta
  from necesario n
 order by esta desc, n.nombre;

-- Y SI ALGUNA DICE "FALTA", ESA ES LA MIGRACION QUE HAY QUE CORRER ANTES:

--   · es_usuario_activo, tiene_permiso  -> la 014_multi_empresa.sql
--   · puede_ver_trabajador              -> la 067_aislar_por_empresa.sql

-- Y NO SE PUEDE SALTAR LA 067. La 077 guarda el sueldo de cada persona, y
-- sin esa funcion no hay forma de saber de que empresa es el usuario: todas
-- las empresas se verian todos los sueldos.

-- ===================================================================
-- 2) LAS TABLAS QUE TIENEN QUE EXISTIR
-- ===================================================================

select t.nombre,
       case when exists (select 1 from pg_class c
                       join pg_namespace ns on ns.oid = c.relnamespace
                     where c.relname = t.nombre and ns.nspname = 'public'
                       and c.relkind = 'r')
         then 'si' else 'FALTA' end as esta
  from (values ('empresa'), ('trabajadores'), ('perfiles'), ('causas_termino')
       , ('remuneraciones')) as t(nombre)
 order by esta desc, t.nombre;

-- ===================================================================
-- 3) EL RUT DE LOS TRABAJADORES, QUE ES LA LLAVE DEL CRUCE
-- ===================================================================

-- Y ESTA ES LA QUE FALTA CONTESTAR

-- El libro de remuneraciones trae el RUT como "13467772-4" y "11285312-K".
-- Ese ultimo es un "RUT chico", con K en vez de dígito verificador.

-- Si el RUT esta guardado en la ficha con puntos, o con otro formato, el cruce
-- no encuentra a nadie y no avisa: cero planillas importadas y ningun error. Por
-- eso hay que ver como esta de verdad, no suponer.

select code,
       nombre,
       rut,
       case when rut is null or btrim(rut) = '' then 'VACIO' else 'tiene' end as estado
  from public.trabajadores
 where rut is not null and btrim(rut) <> ''
 order by code
 limit 15;

-- -- Y CUANTOS HAY CON RUT Y CUANTOS SIN EL. Si son muchos los sin RUT, el cruce
-- -- no va a funcionar para ellos y hay que cargarlo antes.
select count(*) filter (where rut is not null and btrim(rut) <> '') as con_rut,
       count(*) filter (where rut is null or btrim(rut) = '')       as sin_rut,
  from public.trabajadores;

-- ===================================================================
-- 4) EL VEREDICTO
-- ===================================================================

-- Y ESTE VA DE ULTIMO, PORQUE ES EL QUE DICE QUE HACER

select case
         when not exists (select 1 from pg_proc where proname = 'puede_ver_trabajador')
           then 'FALTA LA 067. Aplicala antes de la 076 y la 077.'
         when not exists (select 1 from pg_class where relname = 'causas_termino'
                                   and relnamespace = 'public'::regnamespace)
           then 'La 076 todavia no esta. Corréla, y despues la 077.'
         when not exists (select 1 from pg_class where relname = 'remuneraciones'
                                   and relnamespace = 'public'::regnamespace)
           then 'La 077 todavia no esta. Corréla despues de la 076.'
         else 'Las dos estan. Ya se puede trabajar con el libro de remuneraciones.'
       end as que_hacer;
