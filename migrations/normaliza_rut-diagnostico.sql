-- ===================================================================
-- NORMALIZA_RUT: QUE PASO, Y COMO SE COMPRUEBA
-- ===================================================================
--
-- ESTO NO ES UNA MIGRACION. ESTA SEPARADO A PROPOSITO.
--
-- El panel de Supabase corre todo lo que se pega en una sola transaccion. Si la migracion
-- termina con un "select" y ese select falla, se revierte TODO, incluidas las funciones que
-- se habian creado mas arriba.
--
-- Asi se perdio la 078: el "select" fallo con 42703 porque decia "nombre" en vez de "name", y
-- las dos "create or replace function" desaparecieron con el.
--
-- Por eso: primero la migracion, y en otra pestana esto.
--


-- ===================================================================
-- 4) NO SE TOCAN LOS DATOS, Y ESTA ES LA PARTE QUE MAS SE IMPACIENTA POR HACER
-- ===================================================================

-- Se podria escribir un UPDATE que cambie todos los RUT de las fichas a la forma
-- normalizada. NO se hace, por dos razones.

-- La primera es el indice unico de la 020, que prohibe dos fichas con el mismo
-- RUT. Si al normalizar dos RUT que hoy son distintos pasan a ser el mismo -- uno
-- escrito "11.285.312-K" y el otro "11285312k" -- el UPDATE se cae por violacion
-- de unicidad. Y se cae A MEDIAS: unas filas quedan normalizadas y otras no.

-- La segunda es que el RUT guardado es el que se muestra y el que se imprime. Si
-- alguien lo escribio con puntos porque lo copio de un documento, se le cambia el
-- dato que conocia por uno "correcto" que nadie le pidio.

-- Con el indice de arriba, el cruce funciona igual sin tocar un solo dato.

-- ===================================================================
-- 5) QUE PASO, EN UN PANEL
-- ===================================================================

-- Y LA PRIMERA COMPARA LAS TRES FORMAS, PARA VER SI HAY QUE NORMALIZAR ALGUNA

-- Si "como_esta" y "normalizado" son iguales, es que las fichas ya venían limpias.
-- Si son distintos, el cruce los va a encontrar igual, y eso es lo que importa.

select code,
       name,
       rut                                as como_esta,
       public.rut_normalizado(rut)         as normalizado,
       case when rut is distinct from public.rut_normalizado(rut)
            then 'cambia' else 'igual' end as comparacion
  from public.trabajadores
 where rut is not null and btrim(rut) <> ''
 order by code
 limit 20;

-- -- Y EL RECUENTO. "ilegible" es el que NO cruza con ninguno, y hay que verlo.
select count(*) filter (where btrim(coalesce(rut,'')) <> '')                            as con_rut,
       count(*) filter (where rut is distinct from public.rut_normalizado(rut)
                          and btrim(coalesce(rut,'')) <> '')                                    as los_que_normaliza,
       count(*) filter (where btrim(coalesce(rut,'')) <> ''
                          and public.rut_normalizado(rut) is null)                               as ilegibles
  from public.trabajadores;

-- -- Y LOS ILEGIBLES, UNO POR RENGLON
select code, name, rut
  from public.trabajadores
 where btrim(coalesce(rut,'')) <> ''
   and public.rut_normalizado(rut) is null
 order by code;

-- Y LOS RUT CUYO DIGITO NO CALZA, QUE NO SON LOS MISMOS QUE LOS ILEGIBLES
--
-- Un RUT ilegible es "abc" o "": no es un RUT y no cruza con nadie. Uno ilegible se ve a simple
-- vista y se corrige en la ficha.
--
-- Un RUT con el digito mal es otra cosa: es un RUT DE VERDAD, con cuerpo valido y el ultimo
-- caracter equivocado. "11285312-4" es el mismo cuerpo que "11285312-K", asi que el cruce SI lo
-- encuentra con la ficha. Pero si la ficha tiene "11285312-K", el cruce compara
-- "11285312-4" contra "11285312-K" y NO los junta.
--
-- Y ESO ES LO QUE HAY QUE VER: el cruce falla en silencio, con dos RUT que son la misma persona
-- escritos distinto y que el sistema no sabe que son la misma.
--
-- Y POR QUE "rut_normalizado" NO LO CORRIGE
--
-- Porque reescribir un RUT es cambiar una identidad legal en silencio. Si la ficha tiene el
-- digito mal, el problema es de la ficha, y se corrige en la ficha, donde alguien lo ve.
-- Normalizar SOLO deja una forma de escribir: sin puntos, sin espacios, con guion.
--
-- El calculo del digito esta aparte justamente para esto: la funcion existe, se puede consultar,
-- y comparar contra lo que vino. La decision de que hacer con la diferencia es de una persona.
select code,
       name,
       rut                                       as esta,
       public.rut_normalizado(rut)                como_quedaria,
       public.rut_digito_verificador(split_part(public.rut_normalizado(rut), chr(45), 1)) as calza
  from public.trabajadores
 where btrim(coalesce(rut, '')) <> ''
   and public.rut_normalizado(rut) is not null
   and split_part(public.rut_normalizado(rut), chr(45), 1) <> chr(39) || chr(39)
   and public.rut_digito_verificador(split_part(public.rut_normalizado(rut), chr(45), 1))
       <> split_part(public.rut_normalizado(rut), chr(45), 2)
 order by code;

-- Y EL RECUENTO, PARA DECIDIR SI ES UN CASO O SON MUCHOS
select count(*) filter (where btrim(coalesce(rut, '')) <> '')                                as con_rut,
       count(*) filter (where btrim(coalesce(rut, '')) <> ''
                          and public.rut_normalizado(rut) is null)                             as ilegibles,
       count(*) filter (where public.rut_normalizado(rut) is not null
                          and split_part(public.rut_normalizado(rut), '-', 1) <> ''
                          and public.rut_digito_verificador(split_part(public.rut_normalizado(rut), '-', 1))
                              <> split_part(public.rut_normalizado(rut), '-', 2))          as digito_mal
  from public.trabajadores;
