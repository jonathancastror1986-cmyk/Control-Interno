-- ===================================================================
-- CAUSAS_TERMINO: QUE PASO, Y COMO SE COMPRUEBA
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
-- 5) QUE PASO, EN UN PANEL
-- ===================================================================

-- Y EL SELECT FINAL VA PRIMERO LO QUE NO SE PUDO NORMALIZAR, Y ESO ES A PROPOSITO

-- Porque el orden importa: si el catalogo se ve bien pero hay tres causales sin
-- catalogar, y eso se ve despues de cerrar el panel, nadie lo ve. Con las tres
-- raras primero, lo que hay que mirar es lo primero que aparece.

-- Y LAS QUE NO SE PUDIERON NORMALIZAR: ESTAS SON LAS QUE HAY QUE REVISAR A MANO
select coalesce(articulo_termino, '(sin causal)') as articulo,
       count(*)                       as trabajadores,
       string_agg(name,  ' | ' order by name) as quienes
  from public.trabajadores
 where status = 'desvinculado'
   and coalesce(btrim(articulo_termino), '') <> ''
   and upper(btrim(articulo_termino)) not in (select articulo from public.causas_termino)
 group by articulo_termino
 order by count(*) desc;

-- -- Y el catalogo completo, para confirmar que los ocho quedaron
select articulo, dias_indem_anio, tope_anios, aviso_previo, base_indem,
       left(descripcion, 46) as descripcion
  from public.causas_termino
 order by orden;
