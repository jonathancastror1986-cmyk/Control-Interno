-- ===================================================================
-- 056: LOS NOMBRES PARTIDOS, DIRECCION Y CORREO DEL TRABAJADOR
-- ===================================================================
--
-- QUÉ FALTA
-- ---------
-- La ficha del trabajador tiene UN solo texto de nombre, que se usa como texto completo
-- en todos lados. Y con eso no se puede:
--
--   - ordenar ni buscar por apellido
--   - emitir una planilla con columnas separadas
--   - llamar a alguien por su nombre sin adivinar cuál era
--
-- Hoy el nombre va entero en "trabajadores.name". Y ese campo no se toca: sigue siendo el
-- texto completo, que es lo que usan las exportaciones, las importaciones desde Excel y
-- las búsquedas. Ver abajo por qué.
--
--
-- -------------------------------------------------------------------
-- POR QUÉ "name" QUEDA INTACTO Y NO SE PARTE
-- -------------------------------------------
--
-- Es lo importante de esta migración, y la razón de que sea aditiva y sola.
--
-- "trabajadores.name" es "text not null" y lo usan las exportaciones, las importaciones
-- desde Excel y las búsquedas por nombre. Si esta migración lo partiera en tres columnas
-- y lo dejara vacío, todo eso deja de funcionar de golpe, y además se pierde información
-- que hoy existe.
--
-- Y no se puede partir a posteriori, porque "Jonathan Castro Ro..." no dice cuál es el
-- apellido paterno y cuál el materno. Adivinarlo es inventar el dato de una persona, y el
-- nombre de una persona no se adivina.
--
-- Entonces: "name" sigue siendo el nombre entero, y estas columnas nuevas se llenan a
-- medida que se toque cada ficha. Cuando las tres estén llenas, "name" se puede armar
-- juntándolas, y ese día —no antes— se puede considerar dejar de usar la una.
--
--
-- -------------------------------------------------------------------
-- POR QUÉ LAS COLUMNAS NUEVAS EMPIEZAN VACÍAS Y NO SE LLENAN SOLAS
-- ------------------------------------------------------------------
--
-- Por lo de arriba: no hay forma correcta de separarlas sin que alguien las mire.
--
-- Y un dato inventado es peor que un dato vacío: uno se nota y se corrige, el otro se
-- cuela en una planilla y en un mailing, y nadie lo vuelve a revisar.
--
--
-- -------------------------------------------------------------------
-- POR QUÉ NO HAY ÍNDICES
-- ----------------------
--
-- Porque no hay ninguna búsqueda que las use todavía. Un índice que nadie consulta es
-- escritura extra en cada alta y cada cambio, y no hace más rápido nada. Si el día que
-- se busque por apellido se agrega, y es una línea.
--
--
-- -------------------------------------------------------------------
-- QUÉ NO ENTRA EN ESTA MIGRACIÓN
-- ------------------------------
--
-- "afp" y "salud". A propósito, y no por olvido.
--
-- "salud" es dato personal SENSIBLE en Chile: la Ley 19.628 lo pone en esa lista, y eso
-- obliga a consentimiento expreso, a una finalidad determinada y a garantías de acceso.
-- Y el formulario ya guarda "salud_notas", "medicamentos" y "precauciones", o sea que esa
-- obligación YA existe en el sistema y no está resuelta.
--
-- Agregar un campo más antes de aclarar para qué se usa, quién lo ve y cómo se protege
-- agranda una exposición que ya está ahí. Sacarlo después es otra historia, porque ya
-- tiene datos de personas adentro. Ver [salud-01].
--
-- ESTA MIGRACIÓN NO AGREGA NINGÚN DATO SENSIBLE. Solo nombres, una dirección y un correo.
--
--
-- -------------------------------------------------------------------
-- POR QUÉ "correos" Y NO "email"
-- ------------------------------
--
-- Porque el resto del proyecto dice "correo" en las etiquetas y "email" en la tabla de
-- empresa. Acá se usa "correo" porque es lo que se escribe en el formulario, y el
-- formulario es donde se escribe. Mezclar los dos nombres en el mismo grupo de columnas
-- es lo que hace que alguien busque "email" un día y no lo encuentre.
alter table public.trabajadores
  add column if not exists nombres           text,
  add column if not exists apellido_paterno  text,
  add column if not exists apellido_materno  text,
  add column if not exists direccion         text,
  add column if not exists correo            text;

-- -------------------------------------------------------------------
-- QUÉ ES CADA COSA
-- -------------------------------------------------------------------
comment on column public.trabajadores.nombres is
  'Solo los nombres de pila: "Jonathan". Es distinto de "name", que es el nombre entero y se sigue usando para las planillas y las importaciones.';

comment on column public.trabajadores.apellido_paterno is
  'Primer apellido. Es el que va en las planillas, y con el que se ordena.';

comment on column public.trabajadores.apellido_materno is
  'Segundo apellido. Opcional: no todo el mundo tiene dos.';

comment on column public.trabajadores.direccion is
  'Domicilio. Para la carta de admisión y los envíos; no se usa para calcular nada.';

comment on column public.trabajadores.correo is
  'Correo electrónico. A parte del RUT, es lo que permite reconocer al trabajador en una importación sin depender del nombre.';

-- -------------------------------------------------------------------
-- QUE LAS CINCO QUEDEN EN NULL Y NO EN ""
-- -------------------------------------
--
-- Para distinguirlas de las que alguien escribió en blanco a propósito. Con "", un
-- "¿está vacío?" tiene que preguntar por "", y con null pregunta por null, y no son lo
-- mismo: una es "no lo sé" y la otra es "no aplica".
--
-- Y no se pone un default "''" justamente para no mezclarlas.
--
-- -------------------------------------------------------------------
-- COMO SE SABE SI QUEDO BIEN APLICADA
-- -------------------------------------
--
-- Esta migración no devuelve filas, así que el editor dice "Success. No rows returned".
-- Eso es lo correcto, no un error. Para confirmar, la consulta del final tiene que traer
-- cinco.
select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'trabajadores'
   and column_name in ('nombres','apellido_paterno','apellido_materno','direccion','correo');
-- tiene que dar 5
