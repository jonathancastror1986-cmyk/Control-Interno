-- ===================================================================
-- 084_campos_del_contrato.sql
-- ===================================================================
--
-- LOS DATOS QUE UN CONTRATO PIDE Y LA FICHA NO TENIA
--
-- Se pidio viendo un contrato de trabajo real: uno que ya estaba escrito y
-- firmado, con estas frases adentro:
--
--     don(ña) Jonathan Antonio Castro Rocha, RUT: 11285312-K, nacionalidad
--     Chileno/a, nacido(a) el 9 de Septiembre de 1959, domiciliado(a) en
--     PJE LA ESCUADRA NRO.743, comuna PUENTE ALTO, de estado civil Casado(a)
--
-- Y despues, en la cláusula del plazo, una de estas cuatro:
--
--     por partida de contrato  /  por 90 días  /  hasta el 31-12-2026  /  indefinido
--
-- La ficha del trabajador tiene 39 columnas mapeadas (se cuentan en
-- "dbToWorker", en "js/nucleo.js"). De todo lo que el contrato nombra, estan:
--
--     nombre, RUT, cargo, direccion y fecha de ingreso
--
-- Y faltan nueve:
--
--     fecha de nacimiento     el contrato la nombra siempre
--     estado civil            el contrato la nombra siempre
--     nacionalidad            el contrato la nombra siempre
--     profesion u oficio      el contrato lo nombra casi siempre
--     comuna                   el contrato la nombra con la direccion
--     y el plazo, que son cinco
--
--
-- ---------------------------------------------------------------------
-- POR QUE "EL PLAZO" SON CINCO COLUMNAS Y NO UNA
-- ---------------------------------------------------------------------
--
-- Porque un contrato no tiene "fecha de fin". Tiene un PLAZO, y el plazo tiene
-- cuatro formas que son datos distintos entre si:
--
--     indefinido            no tiene fin. Es lo mas comun en Chile.
--     por partida           un trabajo, y termina cuando el trabajo termina
--     por dias              90 dias, 180 dias, y termina
--     hasta una fecha       hasta el 31 de diciembre, y termina
--
-- Y con UNA sola columna no se puede guardar. Si la unica columna es
-- "fecha_hasta":
--
--     - el contrato indefinido se guarda como NULL
--     - un contrato a medio llenar se guarda como NULL tambien
--
-- Los dos son lo mismo en la base, y en un contrato la diferencia entre "no
-- tiene fin" y "a nadie lo han llenado" es TODA. Nadie puede decir despues si
-- el papel esta mal o si el campo quedo vacio.
--
-- Por eso:
--
--     contrato_tipo_plazo      cual de las cuatro formas es    (texto, no NULL si
--                                                          se eligio una)
--     contrato_plazo_dias      cuantos dias, si es "por dias"  (numero)
--     contrato_fecha_hasta     hasta que dia, si es "hasta una fecha"
--     contrato_fecha_inicio    desde que dia corre el contrato
--
-- Y "contrato_tipo_plazo" NO es nulo: es el que dice cual de las cuatro se
-- eligio. Un NULL en esa columna significa "nadie ha elegido plazo", que es un
-- dato que se puede preguntar. Un NULL en "contrato_fecha_hasta" con
-- "contrato_tipo_plazo" en 'indefinido' es un contrato bien escrito.
--
--
-- ---------------------------------------------------------------------
-- POR QUE "fecha_ingreso" NO SIRVE PARA EL INICIO DEL CONTRATO
-- ---------------------------------------------------------------------
--
-- Porque "fecha_ingreso" es cuando la persona entro a la EMPRESA, que es un
-- hecho de la relacion laboral. El contrato se puede firmar DESPUES de esa
-- fecha, con efecto retroactivo: alguien entró el 1 de enero y el contrato se
-- firmó el 10 de marzo diciendo que rigió desde el 1 de enero.
--
-- Con una sola columna para las dos cosas, o se pisa la fecha real de ingreso, o
-- el contrato dice una fecha que no es la que rigió. Son dos datos y van
-- separados.
--
--
-- ---------------------------------------------------------------------
-- POR QUE NO SE METEN COMO "CAMPOS PROPIOS" DEL PAPEL
-- ---------------------------------------------------------------------
--
-- Porque los campos propios del papel ("Campos y datos", del kit) pertenecen a
-- la PLANTILLA, no a la persona. Se responderían una vez por papel, y el dato se
-- perderia al cambiar de plantilla.
--
-- Y estos datos son de la persona: la fecha de nacimiento no cambia, el estado
-- civil puede cambiar, y el nombre con el que se firman todos los papeles es el
-- mismo. Van en "trabajadores".
--
-- Y SI ALGUIEN NECESITA ALGO MAS
--
-- El papel acepta "[CUALQUIER_COSA]" y si no esta en el catalogo queda el
-- marcador, y ahi se ve que falta. Ese camino sigue existiendo para lo
-- puntual; lo que va aca es lo que se usa en todos los papeles.
--
--
-- ---------------------------------------------------------------------
-- QUE SE ROMPE SI ESTA MIGRACION NO ESTA APLICADA
-- ---------------------------------------------------------------------
--
-- "dbToWorker" y "workerToDb" van a leer y escribir estas columnas. Si la tabla
-- no las tiene, el "select" falla entero y no cargan los trabajadores: no es un
-- campo que salga vacio, es que no aparece ninguna ficha.
--
-- Por eso esta migracion se aplica ANTES de usar el codigo, y si el codigo ya
-- esta arriba, hay que aplicar esta antes de recargar.
--
-- Y como se comprueba, al final, esta migracion termina en DDL y la comprobacion
-- esta en "migrations/scripts/comprobar-084-campos-del-contrato.sql". Por lo
-- mismo de siempre: las migraciones se aplican desde el panel de la base, no
-- desde aca.

begin;

-- ---------------------------------------------------------------------
-- LAS NUEVE COLUMNAS
-- ---------------------------------------------------------------------
alter table public.trabajadores
  -- -------------------------------------------------------------------
  -- LOS DATOS DE LA PERSONA
  -- -------------------------------------------------------------------
  --
  -- Y "fecha_nac" es tipo FECHA, no texto, a propósito. Si fuera texto, "9 de
  -- Septiembre de 1959", "09-09-1959" y "1959-09-09" serían tres personas
  -- distintas, y no se podría ordenar por edad ni buscar a quien cumple años.
  -- El texto se arma al imprimir, que es donde lo necesita el contrato.
  add column if not exists fecha_nac date,
  -- Y "estado civil" es texto y no una lista de la base, porque los valores que
  -- acepta un contrato chileno llevan la "(a)": "Casado(a)", "Soltero(a)". Una
  -- lista fija obligaria a guardar "Casada" y el contrato imprimiría "Casado".
  -- El "(a)" no es un dato del estado civil: es una convención de como se
  -- escribe el papel.
  add column if not exists estado_civil text,
  add column if not exists nacionalidad text,
  add column if not exists profesion text,
  -- Y "comuna" va aparte de "direccion" porque es lo que permite agrupar. Las dos
  -- admiten vacio, y el caso más común del uso real es "dirección pero sin comuna".
  add column if not exists comuna text,

  -- -------------------------------------------------------------------
  -- LOS DEL PLAZO DEL CONTRATO
  -- -------------------------------------------------------------------
  --
  -- Y CON LAS CINCO EN EL MISMO "alter table", A PROPOSITO.
  --
  -- Postgres aplica un "alter table" con varias columnas como una sola
  -- operacion de catalogo con su bloqueo. Separado en cinco "alter table", cada
  -- uno toma el bloqueo por separado, y entre el segundo y el tercero la tabla
  -- queda con "tipo_plazo" pero sin "fecha_hasta": un guardado que pase en ese
  -- hueco escribe con datos a medias.
  add column if not exists contrato_tipo_plazo text,
  add column if not exists contrato_plazo_dias integer,
  add column if not exists contrato_fecha_inicio date,
  add column if not exists contrato_fecha_hasta date;

-- ---------------------------------------------------------------------
-- LAS REGLAS QUE IMPIDEN QUE LOS DATOS DIGAN UNA COSA Y SEAN OTRA
-- ---------------------------------------------------------------------
--
-- Y SE SUELTAN PRIMERO, PORQUE "add constraint" NO ES "if not exists".
--
-- Sin esto, aplicar la migracion dos veces falla con "constraint already
-- exists", y la segunda queda a medias: unas columnas si y otras no.
alter table public.trabajadores drop constraint if exists trabajadores_contrato_tipo_plazo_chk;
alter table public.trabajadores drop constraint if exists trabajadores_contrato_plazo_dias_chk;

-- Y LA DEL TIPO DE PLAZO: SOLO LAS CUATRO FORMAS QUE EXISTEN
--
-- Y NO ES OBLIGATORIA, porque puede no haber plazo: un trabajador que todavia
-- no tiene contrato no tiene plazo, y eso es un dato valido, no un error.
alter table public.trabajadores
  add constraint trabajadores_contrato_tipo_plazo_chk
  check (contrato_tipo_plazo is null or contrato_tipo_plazo in ('indefinido','partida','dias','fecha'));

-- Y LA DE LOS DIAS: UN NUMERO POSITIVO O NADA
--
-- Cero dias no es un plazo: es un dato sin llenar. Y se guarda el numero entero
-- de dias, no una fecha de termino, porque "por 90 dias" se cuenta desde la
-- fecha de inicio y esa cuenta la hace la persona que firma, no el sistema.
alter table public.trabajadores
  add constraint trabajadores_contrato_plazo_dias_chk
  check (contrato_plazo_dias is null or contrato_plazo_dias > 0);

-- ---------------------------------------------------------------------
-- LOS COMENTARIOS, QUE SON LO QUE DICE LA CONSOLA CUANDO ALGUIEN MIRA
-- ---------------------------------------------------------------------
--
-- Y NO ES COSA DE ESTILO: es lo que aparece en el panel de la base cuando
-- alguien hace clic en una columna y quiere saber que guarda. Si el nombre no
-- alcanza, esta es la segunda linea de ayuda.
comment on column public.trabajadores.fecha_nac is
  'Fecha de nacimiento. Tipo fecha a proposito: el texto se arma al imprimir el papel.';
comment on column public.trabajadores.estado_civil is
  'Estado civil como lo escribe el contrato, con la (a): Casado(a), Soltero(a).';
comment on column public.trabajadores.nacionalidad is
  'Nacionalidad tal como sale en el contrato: Chileno/a.';
comment on column public.trabajadores.profesion is
  'Profesion u oficio. Distinto de "cargo", que es el puesto que ocupa.';
comment on column public.trabajadores.comuna is
  'Comuna del domicilio. Aparte de "direccion", que es la calle y el numero.';
comment on column public.trabajadores.contrato_tipo_plazo is
  'Como termina el contrato: indefinido, partida, dias o fecha. NULL = todavia no se eligio.';
comment on column public.trabajadores.contrato_plazo_dias is
  'Cantidad de dias, solo si el tipo de plazo es "dias".';
comment on column public.trabajadores.contrato_fecha_inicio is
  'Desde que dia rigio el contrato. Distinto de "fecha_ingreso", que es cuando entro a la empresa.';
comment on column public.trabajadores.contrato_fecha_hasta is
  'Hasta que dia rigio el contrato, solo si el tipo de plazo es "fecha". Con "indefinido" queda NULL a proposito.';

commit;

-- ---------------------------------------------------------------------
-- POR QUE NO HAY NADA DE COMPROBACION DESPUES DEL "COMMIT"
-- ---------------------------------------------------------------------
--
-- Porque esto ya es DDL y se acaba. Lo que hay que mirar para confirmar que
-- quedaron las nueve —y que la tabla sigue teniendo las 39 de antes— esta en
-- "migrations/scripts/comprobar-084-campos-del-contrato.sql", que se corre a
-- mano en el panel de la base.