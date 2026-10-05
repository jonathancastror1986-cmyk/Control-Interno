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
