-- 061_aprobacion_plantilla.sql
-- ============================
--
-- ¿QUÉ AGREGA
-- ------------
--
-- Una columna en "plantillas_contratacion":
--
--     requiere_aprobacion boolean not null default false
--
-- Y dice si ese papel tiene que pasar por alguien ANTES de entregarse al trabajador, o si se
-- firma y se entrega directo.
--
--
-- POR QUÉ UN BOOLEANO Y NO UN TEXTO, CUANDO "firmas" ES UN TEXTO
-- ---------------------------------------------------------------
--
-- Porque son dos preguntas distintas y el shapes distinto:
--
--   firmas                quién lo firma:  nadie / el trabajador / los dos.   TRES casos.
--   requiere_aprobacion   si tiene que pasar por revisión antes.           DOS casos.
--
-- El comentario de "firmas" en la tabla explica por qué ese no puede ser booleano: con un
-- booleano, "nadie" y "el trabajador" quedan igual. Acá no hay ese problema: o requiere
-- aprobación o no la requiere. Ver [aprob-01].
--
-- Y NO se reemplaza "firmas" con esto, ni se fusionan. Son dos preguntas que se contestan por
-- separado: un papel puede ser informativo y no requerir aprobación, o puede ser del
-- trabajador Y requerir aprobación antes de entregárselo.
--
--
-- Y EL POR QUÉ DE QUE SEA POR PLANTILLA Y NO POR TIPO
-- -------------------------------------------------------
--
-- Porque depende de la empresa y del documento, no del tipo. "Declaración de salud" puede
-- requerir aprobación en una obra y no en otra. Si estuviera en el "tipo", no se podría
-- distinguir. Ver [aprob-02].
--
-- Y NO se deducido del "tipo" con una regla en el código, porque eso obligaría a cambiar el
-- código para cambiar una política, y la política cambia; el código, no.
--
--
-- POR QUÉ "default false"
-- -----------------------
--
-- Porque las plantillas que YA están en la tabla no fueron marcadas. Y el valor por defecto
-- tiene que ser el que no cambia el comportamiento de lo que ya anda: si sale "true", a los
-- papeles que ya se estaban entregando les aparece de golpe una aprobación que nadie pidió.
--
-- Un papel que no se ha marcado nunca requiere aprobación. Si alguien quiere que sí, se
-- marca.
--
--
-- CÓMO SE MARCA
-- -------------
--
-- En la pantalla de plantillas, junto a "Quién lo firma". Y el checkbox está en el MISMO
-- formulario de creación, así que se marca al crear y no después.
--
-- Y el guardado va por ".update()" y ".insert()" directo sobre la tabla, no por una función,
-- así que no hay que tocar ninguna función de la base para que la columna se guarde.
-- Ver [aprob-03].
--

alter table public.plantillas_contratacion
  add column if not exists requiere_aprobacion boolean not null default false;

comment on column public.plantillas_contratacion.requiere_aprobacion is
  'Verdadero si ese papel tiene que pasar por revisión antes de entregarse al trabajador. Es
  distinto de "firmas", que dice QUIÉN lo firma: un papel puede ser del trabajador y además
  requerir aprobación, o no requerirla. Son dos preguntas separadas.';

-- -------------------------------------------------------------------
-- Y QUE SE VEA EN LA LISTA, QUE SI NO QUEDA OCULTA
-- -------------------------------------------------------------------
--
-- Una columna que existe y que nadie muestra es una columna que se va a llenar a ciegas y mal.
--
-- Y no se hace una vista: alcanza con la columna, porque la lista de plantillas se lee con
-- "select('*')" y la trae sola. Ver [aprob-04].
--
-- Y el índice es para el caso "dame las plantillas que requieren aprobación", que es la
-- consulta del circuito de aprobación. Cuando ese circuito exista va a filtrar por esta
-- columna, y sin índice son todas las de la empresa.
--
create index if not exists plantillas_contratacion_requiere_aprobacion_idx
  on public.plantillas_contratacion (requiere_aprobacion)
  where vigente;

-- -------------------------------------------------------------------
-- PARA CONFIRMAR, TIENE QUE DAR 1
-- -------------------------------------------------------------------
--
-- Y el "where vigente" del índice significa que el índice solo cubre las vigentes. Un índice
-- parcial es más chico, y acá no se consulta nunca por las dadas de baja.
--
select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'plantillas_contratacion'
   and column_name  = 'requiere_aprobacion';

-- Y cuántas plantillas hay, para saber cuántas quedaron sin marcar. Todas: el "default false"
-- no cambia ninguna.
select count(*) as plantillas_vigentes
  from public.plantillas_contratacion
 where vigente;