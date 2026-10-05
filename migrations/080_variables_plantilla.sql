-- ===================================================================
-- 080  EL CATÁLOGO DE VARIABLES DE LAS PLANTILLAS
-- ===================================================================

-- Corre esto ENTERO en el editor SQL de Supabase. Termina en DDL.

-- ---------------------------------------------------------------------
-- QUÉ ES Y POR QUÉ ESTÁ EN LA BASE
-- ---------------------------------------------------------------------

-- Porque el documento que hay que llenar es un CONTRATO DE TRABAJO, y tiene datos de tres
-- lugares distintos que no separe uno del otro:

--   · la ficha del trabajador  nombre, RUT, domicilio, sueldo
--   · los datos de la empresa  nombre, RUT, representante
--   · la configuración        obra, permiso, hito, topes

-- Y si la lista de variables vive en el código, la persona que escribe la plantilla tiene que
-- acordarse de los nombres. Si vive en la base, la pantalla le muestra la lista con su ejemplo.

-- ---------------------------------------------------------------------
-- Y "fuente" ES LO QUE DECIDE LO QUE PASA SI FALTA
-- ---------------------------------------------------------------------

--   empresa        sale de la ficha de la empresa
--   trabajador     sale de la ficha del trabajador
--   configuracion  es el mismo para todos: obra, permiso, topes
--   regla          lo calcula el sistema: el sueldo en letras, la fecha, don/dona

-- Con esa columna, el generador sabe qué buscar y qué preguntar. Y "obligatoria" dice si el
-- documento se puede generar sin esa variable: un contrato sin RUT del trabajador no se firma,
-- pero uno sin el hito de la obra sí se puede dejar en blanco.

-- ---------------------------------------------------------------------
-- Y EL "ejemplo" ES DE UN CONTRATO QUE YA SE FIRMO
-- ---------------------------------------------------------------------

-- No son ejemplos inventados: son los valores del contrato de ARRAYANES IV de URBANIZA
-- CONSTRUCTORA, que está firmado con FirmaSimple. Ese documento existe, con su fecha y su
-- número de docto.

-- Y ESO SIRVE PARA MAS QUE PARA LEER: si una variable queda mal cargada, se compara contra un
-- contrato real y se ve. Un ejemplo inventado no sirve para eso.

-- ===================================================================
-- 1) LA TABLA
===================================================================

-- Y NO LLEVA "empresa_id", Y ESO ES A PROPOSITO

-- porque las variables son del CONTRATO LEGAL, no de una empresa. "El sueldo base" y "la fecha
-- de nacimiento" son las mismas en todas. Si llevara "empresa_id", cada empresa tendría que
-- mantener su propia lista y dos empresas con contratos parecidos terminarían con nombres
-- distintos para lo mismo.

create table if not exists public.variables_plantilla (
  nombre        text primary key check (nombre ~ '^[A-Z0-9_]+$'),
  descripcion   text    not null,
  fuente        text    not null
                check (fuente in ('empresa','trabajador','configuracion','regla')),
  obligatoria   boolean not null default false,
  ejemplo       text,
  orden         int     not null default 0,
  activa        boolean not null default true
);

-- Y EL "check" DEL NOMBRE ES A PROPOSITO, Y ESTA MAS DURO QUE PARECE

-- El nombre va entre corchetes en el documento: [SUELDO_BASE]. Si el nombre tuviera un espacio,
-- un acento o un punto, el reemplazo por texto no lo encontraría, y el documento saldría con
-- la variable escrita adentro, visible, en un contrato firmado. Con el "check", es imposible
-- guardar un nombre que no se pueda reemplazar.

comment on table public.variables_plantilla is 'Las variables que se pueden poner en una plantilla, con su descripcion y de donde sale el dato. Es de sistema: no lleva empresa_id, porque el contrato legal es el mismo para todas. La pantalla que escribe la plantilla muestra esta lista con su ejemplo, en vez de acordarse de los nombres.';

comment on column public.variables_plantilla.fuente is 'De donde sale el dato: empresa, trabajador, configuracion o regla. Con esto el generador sabe que buscar, y la fuente "regla" marca lo que calcula el sistema: el sueldo en letras, la fecha y el don o dona.';

-- ===================================================================
-- 2) EL RLS
-- ===================================================================

-- Y ES EL MISMO "cualquier usuario activo ve todo" DE LOS CATÁLOGOS

-- No lleva empresa_id, así que no hay a qué aislar. Y es el mismo criterio que usan las
-- tablas de catálogo que ya hay.

alter table public.variables_plantilla enable row level security;

drop policy if exists "variables leen" on public.variables_plantilla;
create policy "variables leen" on public.variables_plantilla for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

-- Y ESCRIBE SOLO QUIEN TIENE PERMISO DE REMUNERACIONES, QUE ES QUIEN ARMA LOS DOCUMENTOS

drop policy if exists "variables escriben" on public.variables_plantilla;
create policy "variables escriben" on public.variables_plantilla for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo)
                 and public.tiene_permiso('rem.editar'))
  with check (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo)
                 and public.tiene_permiso('rem.editar'));

-- ===================================================================
-- 3) LO QUE HAY DENTRO
-- ===================================================================

insert into public.variables_plantilla (nombre, descripcion, fuente, obligatoria, ejemplo, orden)
values
  ('EMPRESA', 'Nombre de la empresa', 'empresa', true, 'URBANIZA CONSTRUCTORA S.A.', 10),
  ('RUT_EMPRESA', 'RUT de la empresa', 'empresa', true, '76.361.420-4', 20),
  ('REPRESENTANTE', 'Nombre de quien representa a la empresa', 'empresa', true, 'CRISTOBAL ESTRADA GONZALEZ', 30),
  ('RUT_REPRESENTANTE', 'RUT de quien representa a la empresa', 'empresa', false, '16030939-3', 40),
  ('DOMICILIO_EMPRESA', 'Domicilio de la empresa', 'empresa', false, 'Avenida Presidente Riesco 5711, Oficina 901', 50),
  ('COMUNA_EMPRESA', 'Comuna de la empresa', 'empresa', false, 'Las Condes', 60),
  ('APELLIDO_TRABAJADOR', 'Apellido paterno del trabajador', 'trabajador', true, 'MADRID', 70),
  ('NOMBRE_TRABAJADOR', 'Nombres del trabajador', 'trabajador', true, 'JORGE ORLANDO', 80),
  ('APELLIDO_PATERNO_TRAB', 'Apellido paterno, para el nombre completo', 'trabajador', true, 'MADRID', 90),
  ('APELLIDO_MATERNO_TRAB', 'Apellido materno, para el nombre completo', 'trabajador', false, 'PEREZ', 100),
  ('RUT_TRABAJADOR', 'RUT del trabajador', 'trabajador', true, '9095708-2', 110),
  ('NACIONALIDAD', 'Nacionalidad', 'trabajador', true, 'Chileno/a', 120),
  ('FECHA_NACIMIENTO', 'Fecha de nacimiento', 'trabajador', true, '9 de Septiembre de 1959', 130),
  ('DIRECCION', 'Domicilio del trabajador', 'trabajador', true, 'PJE LA ESCUADRA NRO.713', 140),
  ('COMUNA', 'Comuna del trabajador', 'trabajador', true, 'PUENTE ALTO', 150),
  ('ESTADO_CIVIL', 'Estado civil', 'trabajador', true, 'Casado(a)', 160),
  ('DON', 'Como se llama al trabajador: don, dona o ambos', 'regla', true, 'don(a)', 170),
  ('ESPECIALIDAD', 'Oficio con que se contrató', 'trabajador', true, 'GASTOS GENERALES 6,1', 180),
  ('CARGO', 'Cargo en la obra', 'trabajador', true, 'AYUDANTE BODEGA', 190),
  ('SUELDO_BASE', 'Sueldo mensual', 'trabajador', true, '$460.500', 200),
  ('SUELDO_LETRAS', 'El mismo sueldo escrito en letras', 'regla', true, 'CUATROCIENTOS SESENTA MIL QUINIENTOS', 210),
  ('COLACION', 'Asignación de colación', 'trabajador', true, '$ 42.000', 220),
  ('LOCOMOCION', 'Asignación de movilización', 'trabajador', true, '$ 39.000', 230),
  ('TOPE_IMM', 'Tope de gratificación, en ingresos mínimos', 'configuracion', true, '4,75 Ingresos Mínimos Mensuales', 240),
  ('HORARIO', 'Jornada semanal', 'configuracion', false, '45 horas semanales', 250),
  ('HORARIO_COLACION', 'Horario de colación', 'configuracion', false, 'desde las 13:00 hasta las 13:45', 260),
  ('OBRA', 'Nombre de la obra', 'configuracion', true, 'ARRAYANES IV', 270),
  ('PERMISO_OBRA', 'Permiso de edificación de la obra', 'configuracion', false, 'Nº 20 del 02 de Febrero de 2022', 280),
  ('DIRECCION_OBRA', 'Dirección de la obra', 'configuracion', false, 'Camino El Cerrillo 690 Lote 3A, San Bernardo', 290),
  ('HITO', 'Hito en que termina el contrato', 'configuracion', false, 'Hasta Término Revisión R0 Casa Nº 36, Manzana Nº 2, Loteo Nº 24', 300),
  ('FECHA_CONTRATO', 'Fecha del contrato', 'regla', true, '1 de Febrero de 2023', 310),
  ('COMUNA_CONTRATO', 'Comuna donde se firma', 'regla', true, 'Santiago', 320),

-- Y "on conflict" CON "update", PORQUE LA LISTA SE CORRIGE

-- La primera vez se insertan. Después, si se corrige una descripción o se cambia un ejemplo,
-- tiene que_updated_: la migración es re-ejecutable y no deja datos viejos detrás.
-- Y por eso no es "do nothing" como en la 076: allí el catálogo es la ley, y acá son datos que
-- se van entendiendo.

on conflict (nombre) do update
  set descripcion = excluded.descripcion,
      fuente      = excluded.fuente,
      obligatoria = excluded.obligatoria,
      ejemplo     = excluded.ejemplo,
      orden       = excluded.orden;

-- ===================================================================
-- 4) LO QUE FALTA Y HAY QUE DECIDIR
-- ===================================================================

-- Faltan los datos de "configuracion". No son datos de una persona: son de la OBRA. La obra
-- ARRAYANES IV tiene su permiso, su direccion, su hito. Y el sistema no tiene donde guardarlos.

-- Eso es una tabla mas, y NO se agrega aqui porque es otra cosa:

--   · la OBRA tiene nombre, permiso, direccion y hito
--   · y despues el contrato pide "el de esta obra", y el_generador_ necesita saber cual

-- La variable "OBRA" queda con fuente "configuracion" y se lee de ahi cuando exista. mientras
-- tanto, el operador la completa a mano, que es lo de siempre y no rompe nada.
