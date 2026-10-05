-- ===================================================================
-- 077  EL LIBRO DE REMUNERACIONES
-- ===================================================================

-- Corre esto ENTERO en el editor SQL de Supabase. El panel que queda abierto es el
-- ultimo, y el ultimo es el que dice que paso.

-- ---------------------------------------------------------------------
-- DE DONDE SALEN LOS NOMBRES DE ESTAS COLUMNAS
-- ---------------------------------------------------------------------

-- De un archivo real, no de un modelo. El libro de URBANIZA CONSTRUCTORA S.A.,
-- junio de 2025, hoja "LIBRO DE REMUNERACIONES", con veintidos columnas:

--     Cód | R.U.T | Nombre | DT | S. Base | H. Extras | Grat. Legal |
--     Otros Imp. | Total Imp. | Asig. Fam. | Otr. No Imp. | Tot. No Imp. |
--     Tot. Haberes | Previsión | Salud | Imp. Unico | Seg. Ces. |
--     Otros D.Leg. | Tot. D.Leg. | Desc. Varios | Tot. Desc. | Líquido

-- Se copian los nombres del archivo porque el calculo tiene que poder explicarse
-- contra el papel. Si la columna se llama "dt_dias" y en el libro dice "DT",
-- alguien que abra los dos queda dos que no es lo mismo.

-- ---------------------------------------------------------------------
-- LO QUE NO SE COPIA: EL "Cód"
-- ---------------------------------------------------------------------

-- La columna "Cód" del libro trae los valores 1, 10, 100, 101... de uno a tres
-- digitos. Los codigos de este sistema son de cuatro. No hay forma de cruzarlos,
-- asi que la llave es el RUT, que si existe y con indice unico desde la 020.

-- El RUT del libro queda guardado en la fila igual, aunque el cruce sea por RUT.
-- Porque si alguien pregunta de donde salio este sueldo, el RUT es lo que muestra
-- el papel, y sin el no hay forma de auditar el cruce.

-- ===================================================================
-- 1) LA TABLA: UNA FILA POR TRABAJADOR Y POR MES
-- ===================================================================

-- Y "periodo" ES EL PRIMER DIA DEL MES, Y NO UN TEXTO

-- Junio de 2025 es el 2025-06-01. Guardar el mes como texto obliga a castear en
-- cada consulta, y "6" y "06" y "junio" son tres meses distintos a ojos de la
-- base. Con una fecha, ordenar y comparar es ordenar y comparar.

-- Y LLEVA "empresa_id", QUE ES LO QUE LA DEJA AISLADA

-- Sin "empresa_id", los datos de todas las empresas quedan en la misma tabla
-- tabla y el filtro por empresa no tiene por donde meterse. Es el mismo agujero
-- quekins abrio "acceso_total_trabajadores", y ya se tapo una vez. Va el campo,
-- va la politica por empresa, y va el indice que la sostiene.

create table if not exists public.remuneraciones (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     integer not null references public.empresa(id) on delete cascade,
  periodo        date    not null,
  code           text    not null references public.trabajadores(code) on delete cascade,
  rut            text,
  nombre         text,

--   ---- LA MODALIDAD, Y POR QUE ES UNA COLUMNA Y NO UN CALCULO ----

-- Un trabajador con "DT" igual a 30 puede ser de base de 30, O uno de dia
-- efectivo que trabajo todos los dias del mes. El numero es identico y el
-- resultado del finiquito es el doble de distinto.

-- Y eso no se puede deducir del libro: el archivo tiene los dias trabajados,
-- pero no tiene la modalidad. Es un dato del contrato, y va como dato.

-- Y por eso el defecto es "base_30": es lo mayoritario, y cambiarlo despues es
-- un UPDATE, no una migracion nueva.
  modalidad_pago text    not null default 'base_30'
                check (modalidad_pago in ('base_30','dia_efectivo')),

--   ---- LOS DIAS ----

--   dt            = dias trabajados, tal cual vienen en el libro

--   dias_efectivos = los que se cuentan de la asistencia, NO del libro

-- El libro no trae la columna de dias efectivos: trae "DT", que es lo que se
-- pago. Los efectivos salen de la tarja, que ya los cuenta. Por eso aqui se
-- guarda el dato del libro, y el efectivo se cruza con la asistencia al
-- calcular, en vez de duplicarlo y que los dos se digan.
  dt            int,
  dias_efectivos int,

--   ---- LOS HABERES ----
  s_base        integer,
  h_extras      integer,
  grat_legal    integer,
  otros_imp     integer,
  total_imp     integer,

--   ---- LO QUE NO ES IMPONIBLE ----

--   Y "otr_no_imp" ES UNA BOLSA, NO LA COLACION

-- En el archivo, esta columna trae 54000 para unos y 90876, 44161 y 579856
-- para otros. Son colacion, locomocion y otros no imponibles juntos. Para el
-- finiquito hay que separarlos, y por eso la descomposicion va en columnas
-- propias y no se deduce de este numero.

   asig_fam      integer,
  otr_no_imp    integer,
  tot_no_imp    integer,
  tot_haberes   integer,

--   ---- LOS DESCUENTOS ----

--   Y "provision" VIENE AFP Y COTIZACION JUNTAS, Y ESO AL FINIQUITO NO LE ALCANZA

-- El descuento AFC historico necesita la AFP por separado. El archivo trae las
-- dos sumadas en una sola columna, que sirve para el total de descuentos y no para
-- el AFC. Por eso "afp" se deja como columna propia, vacia, esperando el dato
-- que si viene separado.

   provision     integer,
  afp           integer,
  salud         integer,
  imp_unico     integer,
  seg_ces       integer,
  otros_dleg    integer,
  tot_dleg      integer,

--   Y "desc_varios" ES IMPORTANTE, Y NO ES DESPENSO

-- Alli van los anticipos. Un anticipo es dinero que ya recibio el trabajador, y
-- un finiquito que lo ignora le paga de mas.
  desc_varios   integer,
  tot_desc      integer,
  liquido       integer,

--   ---- DE DONDE VIENE ----

--   Y SE GUARDA EL NOMBRE DEL ARCHIVO, PORQUE DESPUES HACE FALTA

-- La planilla es un documento. Dentro de tres años alguien va a preguntar por
-- que se pago esto, y la respuesta tiene que ser un archivo, no un recuerdo.
  archivo_origen text,
  importado_por  uuid references public.perfiles(id),
  importado_en   timestamptz not null default now(),
  created_at     timestamptz not null default now(),

--   ---- LAS CLAVES ----

--   Y LA UNIQUE ES POR LAS CUATRO, NO POR EL CODE SOLO

-- Un trabajador tiene un libro por mes, no un libro para siempre. Sin la clave
-- completa, subir dos veces el mismo mes duplica las filas y la planilla queda
-- doblada, y el doble no se ve hasta que alguien suma.
  constraint remuneraciones_periodo_unico
    unique (empresa_id, periodo, code)
);

comment on table public.remuneraciones is 'El libro de remuneraciones, una fila por trabajador y por mes, importado del archivo del sistema de remuneraciones. Los nombres de las columnas son los del archivo. El cruce con el trabajador es por RUT, porque el codigo del archivo no es el codigo de este sistema.';

comment on column public.remuneraciones.modalidad_pago is 'Si la remuneracion se prorratea sobre base de 30 o sobre los dias efectivamente trabajados. NO se deduce de dt: un trabajador con dt igual a 30 puede ser de las dos modalidades, y el resultado del finiquito es el doble de distinto. Es un dato del contrato.';

comment on column public.remuneraciones.dt is 'Dias trabajados, tal cual vienen en el archivo. Es lo que se pago, no lo que debio pagarse.';

comment on column public.remuneraciones.otr_no_imp is 'Colacion, locomocion y otros no imponibles, SUMADOS. El archivo no los separa. Para el finiquito hay que usar colacion y locomocion por separado, que estan en la ficha del trabajador.';

comment on column public.remuneraciones.provision is 'AFP y cotizacion, SUMADAS. Para el descuento AFC del finiquito hace falta la AFP sola, que va en la columna afp.';

comment on column public.remuneraciones.desc_varios is 'Anticipos y otros descuentos varios. Un anticipo es dinero que el trabajador ya recibio, y un finiquito que lo ignora le paga de mas.';

-- ===================================================================
-- 2) LOS INDICES QUE SOSTIENEN LAS DOS CONSULTAS QUE SE VAN A HACER
-- ===================================================================

-- Y SON DOS, Y CADA UNA ES UNA PREGUNTA

-- La primera es "todos los libros de esta empresa": es por empresa y periodo, y
-- sale de la pantalla de remuneraciones.

-- La segunda es "el historial de este trabajador", que es lo que lee el
-- finiquito para el AFC historico y para el promedio de los ultimos tres meses
-- del articulo 162. Esa es por code y de atras hacia adelante.

create index if not exists remuneraciones_empresa_periodo_idx
  on public.remuneraciones (empresa_id, periodo desc);

create index if not exists remuneraciones_code_periodo_idx
  on public.remuneraciones (code, periodo desc);

-- ===================================================================
-- 3) EL RLS, AISLADO POR EMPRESA
-- ===================================================================

-- Y CON LA REGLA QUE YA EXISTE, QUE ES "PUEDO VER A ESTE TRABAJADOR"

-- No se escribe una regla nueva. La 070 ya dejo "puede_ver_trabajador()", que
-- ya sabe cual es la empresa del usuario y si tiene acceso a ese trabajador. La
-- tabla de remuneraciones no necesita su propia logica de empresa: necesita la
-- misma, aplicada a las filas de SU trabajador.

-- Y ESO LA HACE MAS SEGURA QUE ESCRIBIRLA OTRA VEZ: si mañana cambia la regla
-- de "que empresas ve un usuario", no hay que acordarse de cambiarla en dos
-- lugares, porque hay uno.

do $$
begin
  if to_regprocedure('public.puede_ver_trabajador(text,uuid)') is null then
    raise exception 'Falta public.puede_ver_trabajador(), que crea la 067_aislar_por_empresa.sql. Sin ella no hay aislamiento por empresa: aplicala antes de esta.';
  end if;
if to_regprocedure('public.tiene_permiso(text,uuid)') is null then
    raise exception 'Falta public.tiene_permiso(), que crea la 014_multi_empresa.sql.';
  end if;
end $$;

alter table public.remuneraciones enable row level security;

--   ---- LEER ----

-- Se lee una fila si se puede ver a su trabajador. Y si no se puede ver a la
-- persona, no se pueden leer sus sueldos.

drop policy if exists "remuneraciones leen" on public.remuneraciones;
create policy "remuneraciones leen" on public.remuneraciones for select
  using (public.puede_ver_trabajador(code));

--   ---- ESCRIBIR ----

-- Y ESCRIBIR ES MAS DURO QUE LEER, A PROPOSITO

-- Guardar el sueldo es escribir el dato mas delicado que hay en el sistema: es
-- la cifra de lo que gano esa persona. Si un usuario puede insertar una fila para
-- un trabajador de otra empresa, no hace falta que vea ningun dato para
-- corruptir el libro: basta con escribir.

-- Por eso la escritura NO usa "puede_ver_trabajador", que es de lectura, sino
-- que el permiso explicito de cargar remuneraciones. Y el permiso ya existe: la
-- 069 creo "rem.editar" para el rol de oficina.

drop policy if exists "remuneraciones escriben" on public.remuneraciones;
create policy "remuneraciones escriben" on public.remuneraciones for all
  using (tiene_permiso('rem.editar'))
  with check (tiene_permiso('rem.editar'));