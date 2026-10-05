-- ===================================================================
-- 080  LA CATEGORÍA, EN LA TABLA QUE USA EL KIT DE CONTRATACIÓN
-- ===================================================================

-- Corre esto ENTERO en el editor SQL de Supabase. Termina en DDL.

-- ---------------------------------------------------------------------
-- EL AGUERO
-- ---------------------------------------------------------------------

-- Hay dos tablas de plantillas, con dos "tipo" distintos:

--     plantillas              (058)   tipo: doc, formulario
--     plantillas_contratacion (031)   tipo: charla, formulario, acta

-- La pantalla de "contratos y anexos para firma fisica" usa la SEGUNDA, la del kit de
-- contratacion. Y en esa tabla no existe el valor "contrato": el check lo prohibe.

-- Por eso la opcion de contrato y anexo NO SALE. No es que este escondido ni que falte un
-- boton: el valor que la pantalla necesitaria, la base no lo acepta.

-- ---------------------------------------------------------------------
-- Y LA 075 PUSO LA CATEGORÍA EN LA TABLA EQUIVOCADA
-- ---------------------------------------------------------------------

-- La 075 agrego "categoria" a "plantillas", que es la de los documentos sueltos. La pantalla de
-- contratos no lee esa tabla. Es el mismo error de las tres "acceso_total_*": dos caminos
-- paralelos, y el que se arreglo primero no es el que se usa.

-- ---------------------------------------------------------------------
-- Y POR QUE SE AGREGA UNA COLUMNA Y NO SE BORRA EL "tipo"
-- ---------------------------------------------------------------------

-- Porque "tipo" responde "charla, formulario, acta": que SE USA el documento. Y "categoria"
-- responde "a que seccion va": contrato, anexo, charla, induction, prevencion, formulario.

-- Son dos preguntas distintas. Meter la categoria dentro de "tipo" seria mezclarlas, y el
-- contrato seria un "formulario" que ademas se escribe en un contrato.

-- Y NO SE TOCAN LAS PLANTILLAS QUE YA ESTAN
-- ---------------------------------------------------------------------

-- El UPDATE de abajo les pone categoria a las que no la tienen, y NO inventa nada: una charla
-- sigue siendo charla. Lo que hace es que la pantalla pueda mostrarlas agrupadas sin que nadie
-- tenga que elegir la categoria a mano las 8 que ya existen.

-- ===================================================================
-- 1) LA COLUMNA
===================================================================

-- Y ES UN "add column if not exists", COMO TODAS LAS QUE AGREGAN ALGO DESPUES

-- porque esta tabla ya tiene filas. Un "add column" sin el "if not exists" se cae al correrla
-- dos veces, y una migracion que se cae la segunda vez es una migracion que no se puede
-- re-aplicar.

alter table public.plantillas_contratacion
  add column if not exists categoria text not null default 'formulario';

-- Y EL DEFECTO ES "formulario" Y NO "contrato", Y ESO PARECE AL REVES

-- Porque la mayoria de las plantillas de esta tabla NO son contratos: son charlas de
-- induccion, actas y formularios. Poner "contrato" como defecto haria que las 8 que ya estan
-- aparecieran como contratos, que es lo contrario de la verdad.

-- Y EL "check" SE PONE DESPUES DE LA COLUMNA, Y NO DENTRO

-- Porque si el "check" estuviera en la misma sentencia del "add column", PostgreSQL no podria
-- leer la tabla mientras la esta alterando, y el ALTER fallaria. Con "drop constraint" y
-- "add constraint" separadas, cada una es una sentencia propia y no hay conflicto.

alter table public.plantillas_contratacion
  drop constraint if exists plantillas_contratacion_categoria_check;

alter table public.plantillas_contratacion
  add constraint plantillas_contratacion_categoria_check
  check (categoria in ('contrato','anexo','charla','induction','prevencion','formulario'));

-- ===================================================================
-- 2) LEER LAS QUE YA ESTAN
===================================================================

-- Y POR TIPO, Y PORQUE EL TIPO YA SABE LO QUE SON

-- El "tipo" de esta tabla SÍ dice que es cada plantilla: una charla es "charla", un acta es
-- "acta". O sea que la categoria se deduce del tipo sin adivinar, y solo hay que tratar el
-- "formulario" como lo que es.

-- Y POR QUE NO SE TOCA LAS QUE TIENEN "contrato" PUESTO A MANO

-- porque si alguien ya eligio la categoria de una plantilla, esa eleccion manda. Este UPDATE
-- solo mira las que siguen con el defecto.

update public.plantillas_contratacion
   set categoria = case tipo
     when 'charla'     then 'charla'
     when 'acta'       then 'formulario'
     else 'formulario'
   end
 where categoria = 'formulario'
   and tipo <> 'charla'
   and tipo <> 'acta';

-- Y EL INDICE, PORQUE LA PANTALLA VA A FILTRAR POR CATEGORIA

-- Y LA EMPRESA, QUE ES LA QUE HACE QUE LA PANTALLA MUESTRE LO DE ARRIBA

do $$
declare
  v_col int;
begin
  if to_regclass('public.perfiles') is null then
    raise exception 'Falta la tabla perfiles. Aplicar antes la 002_usuarios.sql';
  end if;

  select count(*) into v_col from information_schema.columns
   where table_schema = 'public' and table_name = 'plantillas_contratacion'
     and column_name = 'empresa_id';

  if v_col = 0 then
    raise exception 'La tabla plantillas_contratacion no tiene empresa_id. Revisar la 031 antes de seguir.';
  end if;
end $$;

create index if not exists plantillas_contratacion_categoria_idx
  on public.plantillas_contratacion (empresa_id, categoria, orden);

-- ===================================================================
-- 3) POR QUE ESTA TABLA Y NO LA OTRA
-- ===================================================================

-- porque la 075 ya le puso "categoria" a "plantillas", con los mismos seis valores. Las dos
-- tablas pueden tener categoria, y son de cosas distintas.

--     plantillas              los documentos sueltos: cartas, actas, formularios
--     plantillas_contratacion el kit: contrato, anexos, charlas, induction

-- Y SI DESPUES SE QUISIERAN JUNTAR, SE HACE UNA MIGRACION CON MOVIMIENTO DE DATOS Y LAS DOS
-- POLITICAS. No se juntan sobre la marcha: seria volver a hacer, y mas adelante, el error de
-- las tres "acceso_total_*".
