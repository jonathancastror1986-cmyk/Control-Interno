-- ===================================================================
-- 064: CENTRO DE COSTO DEL TRABAJADOR (2026-10-02)
-- ===================================================================
--
-- EL POR QUÉ
-- -----------
--
-- Un trabajador no se paga solo: se paga CONTRA un centro de costo. Es lo mismo que
-- pasa con el reloj, pero del otro lado: el reloj dice en qué centro está el aparato,
-- y el trabajador dice contra qué centro se justifica su asistencia.
--
--
-- -------------------------------------------------------------------
-- ESTO SE PIDIÓ DOS VECES Y LAS DOS DICEN DISTINTO COSA
-- ---------------------------------------------------
--
-- La primera fue "en la tabla del listado, el centro de costo". Se respondió que
-- "derivado del reloj donde marca".
--
-- La segunda fue "falta ASIGNAR centro de costo; si está seleccionado uno sale por
-- defecto, si no debe solicitarlo". Eso es otra cosa: es guardar el dato en el
-- trabajador.
--
-- Y se guarda UNA de las dos, no las dos. Dos lugares que dicen el centro de costo de
-- la misma persona es el mismo error que ya costó una vez con las plantillas
-- (migración 060, "plantillas_contratacion"): uno de los dos queda viejo, nadie sabe
-- cuál manda, y la planilla sale contra el que no se actualizó.
--
-- Entonces: ESTA es la fuente. El reloj puede tener su centro, que es el del aparato y
-- no el de la persona, y si algún día hace falta mostrar ese, se muestra como otra
-- columna con otro nombre.
--
--
-- -------------------------------------------------------------------
-- POR QUÉ UNA CLAVE FORÁNEA Y NO UN TEXTO
-- ---------------------------------------
--
-- Porque "ALTO CIRUELOS" está escrito de diez maneras distintas, y el código es lo que
-- va en la planilla. Es el mismo criterio que "epp_grupo" en los cargos (migración 051):
-- lo que se escribe a mano es un problema de emparejamiento silencioso.
--
-- Y "on delete set null" y no "cascade", igual que en los expedientes (migración 049):
-- si se da de baja un centro de costo, el trabajador queda SIN centro, que se ve. Un
-- trabajador borrado es peor que un trabajador sin centro.
--
--
-- -------------------------------------------------------------------
-- Y POR QUÉ ES OBLIGATORIO EN LA PANTALLA Y NO ACÁ
-- -----------------------------------------------
--
-- Un "not null" en la base impediría cambiar de empresa, y el guardado desde el Excel
-- no tiene el campo. Lo que se hace es que la PANTALLA lo pida: si no hay ninguno
-- elegido, avisa y no guarda. Ver [centro-03].
--
-- Y se deja en NULL a propósito, no en 0: NULL es "todavía no se le preguntó", que es un
-- estado real y se puede ver. Un 0 no es ningún centro y no es ninguno: es un id que no
-- existe. Ver [centro-04].
--
--
-- -------------------------------------------------------------------
-- EL "SALE POR DEFECTO"
-- ----------------------
--
-- Tres casos, y los tres se leen en "llenarCentroCostoTrabajador":
--
--   1. Editando a alguien que ya tiene: sale el que tenía.
--   2. Al crear, y la empresa tiene UN solo centro activo: sale ese, solo.
--   3. Al crear, y la empresa tiene varios: no se elige ninguno y hay que elegirlo.
--
-- El caso 2 es el que evita el tedio de un solo clic cuando hay un solo destino posible.
-- Y NO se hace cuando hay varios, porque en ese caso adivinar es elegir por la persona.
--
--

alter table public.trabajadores
  add column if not exists centro_costo_id integer
    references public.centros_costo(id) on delete set null;

comment on column public.trabajadores.centro_costo_id is
  'Centro de costo contra el que se justifica y se paga la asistencia de esta persona. Es el
  dato que DECLARA el ingreso, y es distinto del centro del reloj (que es el del aparato).
  Ver [centro-01]. NULL significa "todavia no se le pregunto el destino", y no "no aplica".';

-- Y el índice, porque la consulta que se va a hacer es siempre la misma: "dame los
-- trabajadores de este centro". Sin índice, esa consulta recorre toda la tabla.
--
create index if not exists trabajadores_centro_costo_idx
  on public.trabajadores (empresa_id, centro_costo_id)
  where centro_costo_id is not null;

-- -------------------------------------------------------------------
-- PARA CONFIRMAR
-- ---------------------
--
-- Tiene que dar 1.
--
select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'trabajadores'
   and column_name  = 'centro_costo_id';

-- -------------------------------------------------------------------
-- Y DESPUÉS DE APLICAR ESTA, EN ESTE ORDEN
-- ----------------------------------------
--
-- 1. Esta migración.
-- 2. El JavaScript, que escribe "centro_costo_id".
--
-- Al revés NO: si primero se sube el código y se guarda un trabajador sin la columna en
-- la base, el "upsert" falla con
--
--     42703: column "centro_costo_id" of relation "trabajadores" does not exist
--
-- y no guarda NADA, ni siquiera el nombre de la persona. Ver [centro-02].
--
-- Y la razón de que ese error sea peligroso es que el "upsert" manda TODAS las columnas
-- del objeto: por eso el fallo es de la fila entera y no solo de este campo.
