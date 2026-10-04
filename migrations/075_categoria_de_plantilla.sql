-- ===================================================================
-- 075  LA CATEGORÍA DE LAS PLANTILLAS
-- ===================================================================
--
-- Corre esto ENTERO en el editor SQL de Supabase. El panel que queda abierto es el último, y el
-- último es el que dice qué pasó.
--
-- ---------------------------------------------------------------------
-- QUÉ FALTA Y POR QUÉ
-- ---------------------------------------------------------------------
--
-- "plantillas.tipo" tiene un "check" de dos valores: 'doc' y 'formulario'. O sea que hoy no hay por
-- dónde separar un contrato de una charla, y la carpeta del trabajador no se puede armar por
-- categorías.
--
-- Las categorías que hacen falta son las del KIT DE CONTRATACIÓN:
--
--     contrato    el contrato del trabajador
--     anexo        lo que va adjunto al contrato
--     charla       la charla de inducción del supervisor
--     induction   la inducción por especialidad
--     prevencion   los documentos de prevención y seguridad
--     formulario   hoja de life, encuesta, declaración de salud
--
-- Y "tipo" NO se toca: sigue diciendo si el documento se llena o no, que es otra cosa. Son dos
-- preguntas: "¿se llena?" y "¿de qué sección va?".
--
-- ---------------------------------------------------------------------
-- POR QUÉ ES UNA COLUMNA Y NO UNA TABLA DE CATEGORÍAS
-- ---------------------------------------------------------------------
--
-- Porque las categorías son un número cerrado y corto, y ya está escrito arriba. Una tabla aparte
-- sería para categorías que cambian, y para agregarle una hay que tocar el código, la base y los
-- datos. Con un "check"Reach se agrega una categoría en una línea y queda impedido escribir una
-- que nadie sabe usar.
--
-- ---------------------------------------------------------------------
-- Y EL VALOR POR DEFECTO
-- ---------------------------------------------------------------------
--
-- 'contrato', porque el documento que más se arma es el contrato. Y se pone como defecto y no como
-- "not null sin defecto" a propósito: si el defecto fuera NULL, las plantillas que ya están en la
-- base quedarían sin categoría y el filtro de la carpeta no las mostraría en ningún lado.
--
-- El "update" de abajo les pone la categoría a las que ya estaban, para que ninguna quede afuera.

-- ===================================================================
-- 1) QUE NO ESTÉ LA COLUMNA TODAVÍA
-- ===================================================================
do $$
declare
  v_ya int;
begin
  select count(*) into v_ya
    from information_schema.columns
   where table_schema = 'public' and table_name = 'plantillas' and column_name = 'categoria';

  if v_ya > 0 then
    -- Y si ya está, no se hace nada más: esta migración es re-ejecutable y no quiere dejar
    -- columnas duplicadas ni volver a pasar el "update".
    raise notice 'La columna "categoria" ya existe. No se toca nada.';
    return;
  end if;

  -- ------------------------------------------------------------------
  -- 2) LA COLUMNA
  -- ------------------------------------------------------------------
  alter table public.plantillas
    add column categoria text not null default 'contrato';

  -- Y el "check", que es lo que impide que aparezca una categoría que nadie sabe qué es.
  --
  -- Se agrega como "check" y no como una tabla de tipos, porque las categorías son un número
  -- cerrado: seis. Y con el "check" escribirlas es agregar una línea, en vez de un INSERT más un
-- programa que las use.
  alter table public.plantillas
    drop constraint if exists plantillas_categoria_check;
  alter table public.plantillas
    add constraint plantillas_categoria_check
    check (categoria in ('contrato','anexo','charla','induction','prevencion','formulario'));

  -- ------------------------------------------------------------------
  -- 3) LO QUE YA ESTABA
  -- ------------------------------------------------------------------
  --
  -- Sin esto, las plantillas que ya están en la base quedan todas con 'contrato', porque ése es el
  -- defecto. Y una charla que ya existía pasa a ser un contrato, que es peor que no tener categoría:
  -- se archiva en la sección equivocada y después cuesta saber por qué.
  --
  -- Y el "update" es POR NOMBRE, y no por "tipo": una plantilla con tipo 'doc' puede ser un anexo.
  -- Lo que se sabe de cada una es el nombre, y es lo único que hay.
  update public.plantillas
     set categoria = case
       when lower(nombre) like '%charla%'        then 'charla'
       when lower(nombre) like '%inducci%'       then 'induction'
       when lower(nombre) like '%prevenci%'
         or lower(nombre) like '%seguridad%'    then 'prevencion'
       when lower(nombre) like '%anexo%'         then 'anexo'
       when lower(nombre) like '%declaraci%de salud%'
         or lower(nombre) like '%life%'
         or lower(nombre) like '%encuesta%'     then 'formulario'
       when lower(nombre) like '%contrato%'      then 'contrato'
       else 'contrato'
     end
   where categoria = 'contrato';

  comment on column public.plantillas.categoria is
    'Sección de la que va el documento: contrato, anexo, charla, induction, prevencion o formulario. '
    'Es la que arma las carpetas del trabajador. Distinto de "tipo", que solo dice si el documento '
    'se llena o no. Ver [rls-09] por el precedente de agregar una columna con "check" en vez de una '
    'tabla de tipos.';

  raise notice 'Columna "categoria" agregada.';
end $$;

-- ===================================================================
-- 4) QUÉ PASÓ, EN UN PANEL
-- ===================================================================
--
-- Y esto va AL FINAL, y es un SELECT, porque el editor de Supabase muestra un panel por sentencia
-- y sólo deja abierto el último. Si esto fuera un "alter table", el panel diría "Success. No rows
-- returned" y no se sabría si la columna se agregó.
select categoria,
       count(*)        as plantillas,
       string_agg(nombre, ' | ' order by nombre) as cuales
  from public.plantillas
 group by categoria
 order by categoria;