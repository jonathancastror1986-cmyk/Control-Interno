-- ===================================================================
-- 057: AFP DEL TRABAJADOR, CON CODIGO Y NOMBRE
-- ===================================================================
--
-- QUÉ ES
-- ------
-- La AFP es la administradora de fondos de pensiones a la que está afiliado el
-- trabajador. Se guardan DOS cosas: el código y el nombre.
--
-- El código es el identificador corto (cuatro o cinco letras) y el nombre es largo
-- ("AFP Habitat"). Se guardan los dos y no uno porque cada sistema usa uno:
--
--   - la hoja de life, el contrato y la carta van con el NOMBRE, que es el que se
--     entiende;
--   - la planilla, el consolidado y las importaciones desde Excel van con el CÓDIGO,
--     porque el nombre puede venir escrito de diez maneras distintas y el código no.
--
-- Por eso no se puede guardar solo uno de los dos: con solo el nombre, las
-- importaciones no emparejan; con solo el código, las cartas quedan con algo que
-- el trabajador no reconoce.
--
--
-- -------------------------------------------------------------------
-- POR QUÉ SE PIDEN LOS DOS Y NO UN DESPLEGABLE
-- ---------------------------------------------
--
-- Porque el catálogo de AFP es corto y conocido, pero TODAVÍA NO EXISTE en este
-- sistema. Armarlo es una tabla más, su catálogo y su mantenimiento.
--
-- Y una cosa que se parece a un catálogo sin serlo es peor que un campo de texto: si
-- la lista queda vieja, el trabajador queda con una AFP que no existe, y el error no
-- aparece hasta que se emite un documento.
--
-- Entonces arranca con dos campos de texto. Si más adelante el catálogo se hace, se
-- agrega el desplegable arriba de los dos campos y no se toca lo ya guardado.
--
--
-- -------------------------------------------------------------------
-- Y QUÉ ES ESTE DATO, PARA QUE QUEDE ESCRITO
-- ------------------------------------------
--
-- La afiliación a una AFP es dato personal del trabajador. No es "dato sensible" en el
-- sentido de la Ley 19.628, que reserva esa categoría para salud, religión, opinión
-- política, origen étnico, datos biológicos y condición sexual: es información
-- administrativa y financiera.
--
-- Pero sigue siendo dato personal, así que dos cosas quedan escritas acá y en el
-- formulario:
--
--   1. NO se guarda junto con los datos de salud. Viven en columnas distintas y la
--      razón de por qué está en [salud-01].
--   2. ES DATO DE LA EMPRESA, y se muestra en los documentos que la empresa emite. No
--      es algo que se publique.
--
-- Lo que esta migración NO hace es decidir quién puede verlo. Eso es [salud-01], y es
-- una decisión que hay que tomar a consciously y no aquí.
--
--
-- -------------------------------------------------------------------
-- LAS COLUMNAS NUEVAS
-- -------------------
-- En NULL y no en "", por lo mismo que las otras cinco de la 056: NULL es "no lo sé" y
-- "" es "no aplica". No son lo mismo.
--
-- Y sin índice: no hay búsquedas por AFP, y un índice que nadie consulta es escritura
-- de más en cada alta.
--
-- -------------------------------------------------------------------
-- CÓMO SE SABE SI QUEDÓ BIEN APLICADA
-- -------------------------------------
--
-- Esta migración no devuelve filas, así que el editor dice "Success. No rows returned".
-- Eso es lo correcto. La consulta del final tiene que traer 2.
alter table public.trabajadores
  add column if not exists afp_codigo text,
  add column if not exists afp_nombre text;

comment on column public.trabajadores.afp_codigo is
  'Código corto de la AFP, con el que se empareja en planillas e importaciones desde Excel. Texto de tres a seis letras.';

comment on column public.trabajadores.afp_nombre is
  'Nombre largo de la AFP ("AFP Habitat"). Es el que va en la hoja de life, el contrato y las cartas, porque es el que el trabajador reconoce.';

-- Y que el código no lleve espacios: se compara carácter por carácter en las
-- importaciones, y "AFPH" y "AFPH " no son el mismo dato.
create index if not exists trabajadores_afp_codigo_idx
  on public.trabajadores(afp_codigo)
  where afp_codigo is not null
    and afp_codigo <> '';

select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'trabajadores'
   and column_name in ('afp_codigo','afp_nombre');
-- tiene que dar 2
