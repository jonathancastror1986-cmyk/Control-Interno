-- ===================================================================
-- 065: CATALOGO DE AFP Y DE INSTITUCION DE SALUD (2026-10-02)
-- ===================================================================
--
-- DE DONDE SALEN LOS DATOS
-- -------------------------
--
-- "Tablas Equivalencia", documento del PREVIRED, versión de AGOSTO DE 2021. Las cuatro
-- tablas que se usan acá:
--
--     Tabla N°10  Códigos de AFP                        (de 2 dígitos)
--     Tabla N°11  Institución Autorizada APV, la parte de AFP   (de 3 dígitos)
--     Tabla N°16  Códigos de Institución de Salud       (de 2 dígitos)
--     Tabla N°20  Rut Pagadores de Subsidio
--
-- Y por qué se cita el documento y no la página: "Tabla N°16" es un número estable dentro
-- de la documentación del PREVIRED. La fecha de la versión es la que hay que mirar, porque
-- el PREVIRED publica una versión nueva cuando algo cambia, y un catálogo sin fecha es un
-- catálogo del que nadie sabe cuándo se copió.
--
--
-- -------------------------------------------------------------------
-- ESTO CIERRA LOS CÓDIGOS QUE ESTABAN SIN MAPEAR
-- ----------------------------------------------
--
-- Antes se tenían los nombres de siete AFP —Capital, Cuprum, Habitat, PlanVital, Provida,
-- Modelo, Uno— y siete números de dos dígitos —33, 03, 05, 29, 08, 34, 35— vistos en un
-- documento de un tercero, SIN saber a cuál correspondía cada número.
--
-- Y de Salud no había nada verificado.
--
-- Ahora sí, y está en la Tabla N°10 y en la N°16 del documento:
--
--     03 Cuprum    05 Habitat    08 Provida    29 PlanVital
--     33 Capital   34 Modelo     35 Uno
--
-- Los siete nombres y los siete números son los mismos siete. Ver [afp-02].
--
--
-- -------------------------------------------------------------------
-- Y EL NÚMERO NO SE ADIVINA: EL DOCUMENTO TIENE DOS, Y NO SON EL MISMO
-- -------------------------------------------------------------------------------------------
--
-- Las AFP aparecen en DOS tablas del documento, con el mismo número escrito distinto:
--
--     Tabla N°10:   03 Cuprum     (obligatorio, de 2 dígitos)
--     Tabla N°11:  003 Cuprum     (APV, de 3 dígitos)
--
-- No es un error de tipeo del documento: son dos tablas distintas. La N°10 es el campo de
-- cotización obligatoria; la N°11 es el de Ahorro Preliminar Voluntario, que se rellena
-- con tres dígitos. Por eso el catálogo guarda LOS DOS, y no uno suponiendo que
-- con tres dígitos también sirve para el otro. Ver [afp-03].
--
--
-- -------------------------------------------------------------------
-- POR QUÉ NO SE TOCA "trabajadores.afp_codigo"
-- --------------------------------------------
--
-- Porque ese campo YA guarda otra cosa, y no son números.
--
-- La migración 057 lo dejó así, y lo dejó bien pensado:
--
--     comment on column public.trabajadores.afp_codigo is
--       'Código corto de la AFP... Texto de tres a seis letras.'
--
-- O sea "AFPH", "CUP", "HAB". Y las importaciones desde Excel emparejan contra ESO.
--
-- Si se metiera "03" en esa columna, las importaciones que hoy funcionan dejarían de
-- emparejar, sin error: la importación no avisa "no encontré la AFP", simplemente deja la
-- columna de AFP vacía en la planilla. Ver [afp-04].
--
-- Entonces la columna nueva es OTRA, "afp_previred_codigo", y el catálogo dice a cuál de las
-- dos AFP del trabajador corresponde cada número. Las letras que ya están siguen como están.
--
--
-- -------------------------------------------------------------------
-- Y POR QUÉ "salud" NO SE LLAMA "salud"
-- ------------------------------
--
-- Porque "trabajadores" YA tiene "salud_notas", que es otra cosa: es lo que escribe la
-- persona sobre su salud —alergias, medicamentos, precauciones— y lo escribe en texto libre.
--
-- La institución a la que está afiliado es un dato de la planilla, no una nota. Meterlo en
-- un campo que se llama "salud" al lado de las alergias es exactamente el tipo de cosa que
-- después nadie sabe qué es. La tabla se llama "instituciones_salud" y la columna del
-- trabajador "salud_institucion_codigo". Ver [afp-05].
--
--
-- -------------------------------------------------------------------
-- CÓMO SE SABE SI QUEDÓ BIEN APLICADA
-- -----------------------------------
--
-- Tiene que dar 8 en la primera, 11 en la segunda, y 2 en la tercera.
--

-- -------------------------------------------------------------------
-- 1) LAS AFP
-- -------------------------------------------------------------------
-- "codigo" es el de la Tabla N°10 y "codigo_apv" el de la N°11. Los dos de texto y no
-- enteros, porque "03" y "3" tienen que ser el mismo dato: si la columna fuera entera, el
-- cero del principio se pierde al guardarlo y la planilla recibe "3" donde espera "03".
create table if not exists public.afp (
  codigo       text primary key,
  codigo_apv   text,
  nombre       text not null,
  activo       boolean not null default true,
  fuente       text not null default 'PREVIRED Tablas Equivalencia, agosto 2021',
  created_at   timestamptz not null default now(),

  -- Y los dos tienen que ser SOLO dígitos. El CHECK es lo que atrapa un código escrito
  -- como número, que es el error más probable de todos: nadie escribe "03" en una columna
  -- de texto pensando en el cero.
  constraint afp_codigo_solo_digitos  check (codigo ~ '^[0-9]{2}$'),
  constraint afp_codigo_apv_digitos    check (codigo_apv is null or codigo_apv ~ '^[0-9]{3}$')
);

create index if not exists afp_nombre_idx on public.afp (nombre) where activo;

comment on table public.afp is
  'Catalogo de AFP con los codigos del PREVIRED. Tabla N°10 (obligatorio, 2 digitos) y Tabla
  N°11 (APV, 3 digitos). Fuente: Tablas Equivalencia del PREVIRED, version agosto 2021. Es
  DISTINTO de trabajadores.afp_codigo, que guarda letras y es lo que empareja el Excel.';

comment on column public.afp.codigo is
  'Codigo del PREVIRED de cotizacion obligatoria, Tabla N°10, de DOS digitos con cero a la
  izquierda: 03, 05, 08, 29, 33, 34, 35. El "00" es "no esta en AFP", y no una AFP.';

comment on column public.afp.codigo_apv is
  'Codigo del PREVIRED de Ahorro Preliminar Voluntario, Tabla N°11, de TRES digitos: 003, 005,
  008, 029, 033, 034, 035. Son las mismas AFP con el cero adelante. El "000" es "no cotiza
  A.P.V.", y no una AFP.';

-- Y el catálogo. "on conflict do nothing" y no "do update": correr esta migración dos veces
-- no debe cambiar nada, y cambiar el nombre de una AFP es un acto deliberado —si el
-- PREVIRED lo cambia, se escribe una migración nueva y queda en el historial por qué.
insert into public.afp (codigo, codigo_apv, nombre) values
  ('00', '000', 'No está en AFP'),
  ('03', '003', 'Cuprum'),
  ('05', '005', 'Habitat'),
  ('08', '008', 'Provida'),
  ('29', '029', 'PlanVital'),
  ('33', '033', 'Capital'),
  ('34', '034', 'Modelo'),
  ('35', '035', 'Uno')
on conflict (codigo) do nothing;

-- -------------------------------------------------------------------
-- 2) LAS INSTITUCIONES DE SALUD
-- -------------------------------------------------------------------
-- Con el RUT de la Tabla N°20, que es el dato con que se identifica al pagador del
-- subsidio. Sin ese RUT no se puede cruzar contra un documento del pagador, y el cruce es
-- lo que permite saber si el pagado corresponde a la persona.
--
-- Y "00" no tiene RUT porque NO ES UNA INSTITUCIÓN: es "sin isapre". Se lo deja en el
-- catálogo y no se le inventa un RUT. Ver [afp-06].
create table if not exists public.instituciones_salud (
  codigo       text primary key,
  nombre       text not null,
  rut          text,
  activo       boolean not null default true,
  fuente       text not null default 'PREVIRED Tablas Equivalencia, agosto 2021',
  created_at   timestamptz not null default now(),

  constraint salud_codigo_solo_digitos check (codigo ~ '^[0-9]{2}$'),

  -- El RUT con guion, como lo trae la Tabla N°20, y no con puntos. La Tabla N°20 lo escribe
  -- con guion y es la que se copia tal cual; inventarle otro formato obligaría a convertirlo
  -- en cada uso.
  constraint salud_rut_con_guion check (rut is null or rut ~ '^[0-9]{7,8}-[0-9Kk]$')
);

create index if not exists instituciones_salud_nombre_idx
  on public.instituciones_salud (nombre) where activo;

comment on table public.instituciones_salud is
  'Catalogo de instituciones de salud con los codigos del PREVIRED. Tabla N°16 (codigo) y
  Tabla N°20 (RUT del pagador). Fuente: Tablas Equivalencia del PREVIRED, version agosto
  2021. Es DISTINTO de trabajadores.salud_notas, que son las alergias y medicamentos.';

comment on column public.instituciones_salud.rut is
  'RUT del pagador de subsidio, Tabla N°20, con guion. Es NULL en el codigo 00, porque "sin
  isapre" no es una institucion y no tiene RUT.';

insert into public.instituciones_salud (codigo, nombre, rut) values
  ('00', 'Sin Isapre',                        null),
  ('01', 'Banmédica',                         '96572800-7'),
  ('02', 'Consalud',                          '96856780-2'),
  ('03', 'VidaTres',                          '96502530-8'),
  ('04', 'Colmena',                           '76296619-0'),
  ('05', 'Isapre Cruz Blanca S.A.',           '96501450-0'),
  ('07', 'Fonasa',                            '61603000-0'),
  ('10', 'Nueva Masvida',                     '96504160-5'),
  ('11', 'Isapre de Codelco Ltda.',           '76334370-7'),
  ('12', 'Isapre Bco. Estado',                '71235700-2'),
  ('25', 'Cruz del Norte',                    '79906120-1')
on conflict (codigo) do nothing;

-- -------------------------------------------------------------------
-- 3) LAS DOS COLUMNAS DEL TRABAJADOR
-- -------------------------------------------------------------------
-- Y en NULL, no en ''. NULL es "todavía no se le preguntó"; '' es "se preguntó y no tiene",
-- que son cosas distintas. Lo mismo que en la 056 y en la 064.
--
-- Y con "on delete set null": si una institución se da de baja, el trabajador queda sin
-- institución, que se ve. Un trabajador borrado sería peor.
alter table public.trabajadores
  add column if not exists afp_previred_codigo text
    references public.afp(codigo) on delete set null,
  add column if not exists salud_institucion_codigo text
    references public.instituciones_salud(codigo) on delete set null;

comment on column public.trabajadores.afp_previred_codigo is
  'Codigo PREVIRED de la AFP, Tabla N°10: "03", "05"... Es DISTINTO de "afp_codigo", que
  guarda letras y es con el que empareja la importacion desde Excel. Ver [afp-04].';

comment on column public.trabajadores.salud_institucion_codigo is
  'Codigo PREVIRED de la institucion de salud, Tabla N°16. Es DISTINTO de "salud_notas", que
  son las alergias, los medicamentos y las precauciones. Ver [afp-05].';

-- Un índice por cada una, y en la parte de "tiene algo": son columnas que casi siempre
-- están vacías, y el índice completo las pagaría igual.
create index if not exists trabajadores_afp_previred_idx
  on public.trabajadores (afp_previred_codigo)
  where afp_previred_codigo is not null;

create index if not exists trabajadores_salud_institucion_idx
  on public.trabajadores (salud_institucion_codigo)
  where salud_institucion_codigo is not null;

-- -------------------------------------------------------------------
-- 4) QUIÉN PUEDE VER Y QUIÉN PUEDE ESCRIBIR
-- -------------------------------------------------------------------
-- Estos catálogos son de SOLO LECTURA para la aplicación. Salen de un documento oficial, y
-- que alguien los cambie desde la pantalla es exactamente el error que después se
-- propaga a todas las planillas.
--
-- Escribir es cosa del que administra la base, con una migración y su motivo.
alter table public.afp enable row level security;
alter table public.instituciones_salud enable row level security;

grant select on public.afp to authenticated, anon;
grant select on public.instituciones_salud to authenticated, anon;

-- -------------------------------------------------------------------
-- PARA CONFIRMAR
-- ---------------------
--
-- Tiene que dar 8.
select count(*) as afp from public.afp;

-- Y 11.
select count(*) as instituciones_salud from public.instituciones_salud;

-- Y 2: las dos columnas nuevas.
select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'trabajadores'
   and column_name in ('afp_previred_codigo','salud_institucion_codigo');

-- -------------------------------------------------------------------
-- Y LOS TRES QUE TIENEN QUE FALLAR
-- ------------------------------
--
-- El CHECK de los dígitos. Si alguno de estos NO falla, el CHECK no está puesto:
--
--     insert into public.afp (codigo, nombre) values ('3', 'Inventada');
--     insert into public.afp (codigo, nombre) values ('AB', 'Inventada');
--     update public.instituciones_salud set rut = '96.572.800-7' where codigo = '01';

-- Y para ver si los CHECK están de verdad, esta tiene que PASAR:
--
--     insert into public.afp (codigo, nombre) values ('03', 'Cuprum');
