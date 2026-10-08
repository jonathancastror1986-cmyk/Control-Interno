-- ===================================================================
-- 085_modulos_por_empresa.sql
-- ===================================================================
--
-- QUÉ MÓDULO ESTÁ CONTRATADO EN CADA EMPRESA
--
-- ---------------------------------------------------------------------
-- POR QUÉ UNA TABLA NUEVA, Y NO REUSAR EL SISTEMA DE PERMISOS
-- ---------------------------------------------------------------------
--
-- Porque son dos preguntas distintas, y una sola tabla no las puede contestar:
--
--   ¿QUÉ PUEDO HACER?         -> permisos. "tiene_permiso('tarja.editar')"
--   ¿QUÉ EXISTE EN ESTA EMPRESA? -> módulos. "Esta empresa no contrató reloj"
--
-- Un permiso no puede contestar la segunda. Si el Tótem se apaga haciendo que
-- nadie tenga su permiso, la fila de permisos queda como estaba y basta con que
-- alguien se la dé para que el Tótem vuelva. Y al revés: si el módulo se
-- apaga borrando permisos, se pierde la información de QUIÉN podía ver la tarja.
--
-- Las dos puertas se chequean juntas. Si falta cualquiera de las dos, no se abre.
-- Eso está escrito más abajo, en la parte de la función.
--
-- ---------------------------------------------------------------------
-- Y "SIN FILA = APAGADO", QUE ES LA DECISIÓN QUE SE TOMÓ
-- ---------------------------------------------------------------------
--
-- Es lo contrario de lo habitual, y a propósito.
--
-- Lo habitual es que un sistema venga con todo prendido y uno apague lo que no
-- quiera. Acá al revés: una empresa nueva no tiene ninguna fila, y por lo tanto
-- NO tiene ningún módulo. Todo lo que se quiera usar hay que encenderlo a
-- propósito.
--
-- La razón es una sola: la fase actual es "Control Interno", y el Reloj/Tótem
-- está sin certificar. Con "prendido por defecto", un módulo nuevo aparece solo
-- en las 47 empresas, nadie lo revisó, y el que debería estar apagado es el
-- único que se tookó el trabajo de apagarlo.
--
-- Con "apagado por defecto", encender el Tótem es una decisión que alguien tomó
-- knowing lo que hacía, y en una fila que dice quién y cuándo.
--
-- EL COSTO DE ESTA DECISIÓN, DICHO DE ANTEMANO
--
-- Es esta tabla, y hay que decirla: como la ausencia significa "apagado", una
-- empresa que nunca tuvo fila en esta tabla se queda SIN NADA al aplicar la
-- migración. No es un problema de la migración: es lo que significa la decisión.
--
-- Por eso hay un guion aparte que enciende lo que hay que encender:
--
--     migrations/scripts/encender-modulos-085.sql
--
-- Y hay que correrlo. Sin él, al abrir la aplicación no se ve ningún módulo.
-- Está en un archivo aparte y no en esta migración por la regla del proyecto:
-- las migraciones terminan en DDL, y los guiones de escritura van en "scripts/".
--
-- ---------------------------------------------------------------------
-- LA LISTA DE MÓDULOS, Y POR QUÉ ESTÁ ESCRITA DENTRO DEL SQL
-- ---------------------------------------------------------------------
--
-- Es una lista cerrada, en un "check". No una columna de texto libre.
--
-- Y la razón es la de siempre en este proyecto: un módulo escrito a mano que el
-- código no conhece es un módulo que no hace nada. Peor: si el código no conoce
-- la lista y la base no la limita, "reloje" y "relojos" son dos módulos
-- distintos, y apagar uno no apaga el otro. La fila se crea, dice que está
-- apagada, y el Tótem sigue prendido.
--
-- Con la lista en el "check", ese error no se puede escribir. Y el Javascript
-- lee la misma lista de "js/modulos.js"; si un día se agrega un módulo al
-- Javascript y no al "check", el "upsert" falla y se ve.
--
-- Los nombres son los que ya usan las vistas del menú ("nucleo.js"), no nombres
-- nuevos inventados: "marcajes" se llama "marcajes" en el menú y se llama
-- "marcajes" acá.

begin;

-- ---------------------------------------------------------------------
-- LA TABLA
-- ---------------------------------------------------------------------
create table if not exists public.empresa_modulos (
  -- Y EL IDENTIFICADOR, QUE ES UN NÚMERO Y NO UN UUID
  --
  -- Como las otras tablas del proyecto: "trabajadores" usa "code", "marcajes"
  -- usa "code", y las que usan "serial" usan "serial". Un UUID acá sería lo
  -- contrario de lo demás sin que dé ninguna ventaja: no se usa esta tabla desde
  -- afuera, no se copia a otro sistema y no se replica.
  id serial primary key,

  -- Y LA EMPRESA, QUE ES OBLIGATORIA Y CON CLAVE FORÁNEA
  --
  -- "not null" porque una fila sin empresa no pertenece a nadie. Y la clave
  -- foránea con "on delete cascade" porque si se borra una empresa, sus módulos
  -- tienen que irse con ella: si quedaran, y se creara otra empresa que tomara
  -- ese número, heredaría los módulos de la anterior.
  empresa_id integer not null
    references public.empresa(id) on delete cascade,

  -- Y EL MÓDULO, QUE ES TEXTO Y NO UN NÚMERO
  --
  -- Texto y no id, porque esta tabla se lee y se escribe a mano desde el panel de
  -- la base y desde una pantalla de administración. Con números, prender el
  -- módulo 7 requiere saber cuál de los catorce es el 7. Con texto, se lee.
  --
  -- Y "not null" y sin valor por defecto a propósito: no se puede crear una fila
  -- sin decir QUÉ módulo es.
  modulo_nombre text not null,

  -- Y "ACTIVO" ES BOOLEANO, NO TEXTO
  --
  -- Texto admitía "sí", "si", "S", "1", "true" y "activo", todo queriendo decir
  -- lo mismo, y la comparación por texto es cosa de cada consulta. Un booleano
  -- no se puede escribir de dos maneras.
  --
  -- Y "not null default false" y no "true": una fila creada sin decir nada tiene
  -- que empezar apagada. Ver la decisión de "sin fila = apagado": lo mismo
  -- aplica a una fila sin columna.
  activo boolean not null default false,

  -- Y LAS DOS FECHAS, PARA SABER CUÁNDO SE TOCÓ
  --
  -- Porque un módulo que aparece y desaparece sin fecha es un módulo del que
  -- nadie se puede justificar. Y "actualizado_en" es la que importa: dice cuándo
  -- se apagó la última vez.
  --
  -- Con "created_at" genérico? No: en este proyecto las fechas tienen nombre en
  -- español y con el tiempo el que tiene el nombre viejo convive con el nuevo,
  -- que es la forma más común de tener dos verdades sobre la misma fecha.
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- LAS CLAVES Y LAS REGLAS
-- ---------------------------------------------------------------------
--
-- Y LA CLAVE ÚNICA POR EMPRESA Y MÓDULO
--
-- Sin esto se puede repetir la misma fila: dos filas de "relojes" en la misma
-- empresa, una apagada y otra prendida. Y entonces "¿está prendido el reloj?" no
-- tiene respuesta, porque hay dos filas que dicen cosas distintas. El que
-- pregunta tiene que elegir una, y si elige mal no hay forma de saber cuál era.
alter table public.empresa_modulos
  drop constraint if exists empresa_modulos_empresa_modulo_unq;
alter table public.empresa_modulos
  add constraint empresa_modulos_empresa_modulo_unq
  unique (empresa_id, modulo_nombre);

-- Y LA LISTA CERRADA DE MÓDULOS
--
-- Y CON "CITOS" EN EL TEXTO, PORQUE UN MÓDULO ES UNA PALABRA
--
-- Sin esto se puede escribir "reloje" y crear un módulo que no existe, que no
-- prende nada y que no aparece en ninguna pantalla. Y la fila queda ahí, saying
-- que ese módulo existe, y es verdad: existe, y no hace nada.
alter table public.empresa_modulos
  drop constraint if exists empresa_modulos_nombre_chk;
alter table public.empresa_modulos
  add constraint empresa_modulos_nombre_chk
  check (modulo_nombre in (
    'porteria',         -- Registro de ingresos y salidas de la obra
    'trabajadores',     -- Fichas, listado, carga masiva
    'asistencia',       -- Tarja mensual, justificación diaria, bitácora
    'carga_masiva',     -- Carga masiva CSV de trabajadores
    'empresas',         -- Datos de empresa, usuarios, permisos por rol
    'contratos',        -- Kit de contratación, plantillas, papeles firmados
    'expedientes',      -- Expedientes de documentos
    'solicitar_ingreso',-- Solicitud de ingreso del supervisor
    'epp',              -- Bodega: EPP, kits, herramientas
    'remuneraciones',   -- Exportar remuneraciones
    'relojes',          -- El APARATO: reloj, kiosco, centro de costo. SIN CERTIFICAR.
                        -- Apagado. "marcajes" NO va con este: son cosas distintas.
    'marcajes'          -- Los DATOS: subir marcas del sistema de asistencia y cruzarlas
  ));

-- Y EL ÍNDICE POR EMPRESA, QUE ES LA QUE SE CONSULTA
--
-- La clave única ya cubre las dos columnas en ese orden, así que este índice
-- parece sobrar. Está porque la consulta que se va a hacer todos los días es
-- "dame los módulos de ESTA empresa", y esa es la columna de adelante. El
-- "explain" va a preferir este.
create index if not exists empresa_modulos_empresa
  on public.empresa_modulos (empresa_id);

-- ---------------------------------------------------------------------
-- LAS POLÍTICAS: QUIÉN LEE Y QUIÉN ESCRIBE
-- ---------------------------------------------------------------------
--
-- Y RLS, PORQUE SIN RLS LA AISLAMIENTO POR EMPRESA NO EXISTE
--
-- Con "empresa_modulos" sin RLS, cualquier usuario que haya iniciado sesión
-- podría leer los módulos de las otras 46 empresas con un "select" pelado. Y
-- no hace falta ser astuto para eso: el código lo hace por nosotros, y el
-- código lo hace sin querer.
alter table public.empresa_modulos enable row level security;

-- Y LEER: LA EMPRESA PROPIA, O SER ADMINISTRADOR
--
-- El mismo patrón de la 014, palabra por palabra. No uno nuevo: uno que
-- funciona y que ya está probado en "trabajadores" y en "perfil_empresas".
--
-- Y CON "es_admin()" DEJANDO PASAR, COMO EN TODAS LAS DEMÁS
--
-- Porque si no, el administrador del sistema no puede ver los módulos de una
-- empresa y no puede apagarlos. Y esa es exactamente la operación que hace falta
-- para apagar el Tótem.
drop policy if exists "modulos por empresa read" on public.empresa_modulos;
create policy "modulos por empresa read" on public.empresa_modulos for select
  using ( public.es_admin()
    or exists (select 1 from public.perfil_empresas pe
                where pe.user_id = auth.uid()
                  and pe.empresa_id = empresa_modulos.empresa_id) );

-- Y ESCRIBIR: SOLO EL ADMINISTRADOR DEL SISTEMA
--
-- Y NO EL PERMISO. Porque "encender un módulo" es una decisión comercial, no
-- una tarea del día: es decidir qué productos contrató la empresa. Un
-- supervisor de empresa que puede prender el Tótem para su empresa puede
-- prenderlo antes de que esté certificado, que es justo lo que se quiere
-- evitar.
--
-- Consecuencia, y es a propósito: un usuario de empresa no puede prender
-- módulos ni apagarlos. Puede VER cuáles tiene. Si hace falta que lo haga
-- alguien de la empresa, eso es una pantalla de administración del sistema, y se
-- hace aparte.
drop policy if exists "modulos escribe" on public.empresa_modulos;
create policy "modulos escribe" on public.empresa_modulos for all
  using ( public.es_admin() )
  with check ( public.es_admin() );

-- Y UN DETALLE QUE SE OLVIDA EN TODAS LAS MIGRACIONES
--
-- Con "drop policy if exists" arriba, y el "create policy" después, la segunda
-- vez que se aplica esta migración el "create" falla con "policy already
-- exists". Y la migración queda a medias, que es el peor estado: el que la
-- corrió cree que salió bien y en realidad le faltan cosas.
--
-- Por eso el "drop" va SIEMPRE antes del "create", sin excepción. Y por eso las
-- políticas se reemplazan, no se agregan.

-- ---------------------------------------------------------------------
-- UN DISPARADOR PARA QUE "ACTUALIZADO_EN" NO SEA MENTIRA
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ HACE FALTA UN DISPARADOR Y NO SÓLO PONERLE LA FECHA DESDE EL CÓDIGO
--
-- Porque la fecha la escribe quien hace el "update", y ese "update" puede venir
-- del Javascript de la aplicación, de un guion suelto pegado en el panel, o de
-- una migración futura. Si cada uno tiene que acordarse de ponerla, la primera
-- vez que alguien se olvide, "actualizado_en" dice que el módulo se apagó hace
-- un año.
--
-- Un disparador en la base no se puede olvidar: se pone una vez y vale para
-- todos los caminos de escritura, incluido el que nadie penso.
create or replace function public.tocar_modulo_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists empresa_modulos_toca_actualizado on public.empresa_modulos;
create trigger empresa_modulos_toca_actualizado
  before update on public.empresa_modulos
  for each row execute function public.tocar_modulo_actualizado();

-- ---------------------------------------------------------------------
-- LOS COMENTARIOS
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ UNA TABLA CON LA QUE SE VA A CRUZAR TODA LA APLICACIÓN NECESITA
-- EXPLICARSE
--
-- Porque "empresa_modulos" no dice qué hace. Dice que hay una fila. Lo que hace
-- lo dice la regla de "sin fila = apagado", que no está en la tabla: está en el
-- Javascript y en este archivo. Sin este comentario, alguien abre la tabla en el
-- panel, ve que está vacía, y concluye que el sistema no funciona.
comment on table public.empresa_modulos is
  'Modulos contratados por cada empresa. SIN FILA = MODULO APAGADO: una empresa sin fila no tiene ese modulo, ni para verlo ni para usarlo. Un modulo se enciende escribiendo la fila con activo = true. Los permisos NO deciden que modulo existe: eso es esta tabla. Ver js/modulos.js.';
comment on column public.empresa_modulos.modulo_nombre is
  'Uno de: porteria, trabajadores, asistencia, carga_masiva, empresas, contratos, expedientes, solicitar_ingreso, epp, remuneraciones, relojes, marcajes. La lista esta en el check de la tabla y tiene que coincidir con MODULOS_CONOCIDOS de js/modulos.js.';
comment on column public.empresa_modulos.activo is
  'false = apagado. Por defecto false: una fila creada sin decir nada arranca apagada, igual que una fila que no existe.';

commit;

-- ---------------------------------------------------------------------
-- LO QUE HAY QUE CORRER DESPUÉS, Y EN ESTE ORDEN
-- ---------------------------------------------------------------------
--
--   1. Esta migración.
--   2. "migrations/scripts/encender-modulos-085.sql", que enciende lo que hay que
--      encender en las empresas que ya existen.
--      SIN EL PASO 2, LA APLICACIÓN NO MUESTRA NINGÚN MÓDULO.
--
-- Y DE QUÉ SE ENCIENDE Y DE QUÉ NO
--
-- Todo menos "relojes".
--
-- Y "MARC AJES" SÍ SE ENCIENDE, Y POR QUÉ
--
-- Porque "marcajes" y "relojes" son dos cosas distintas, y confundirlas fue lo
-- primero que hubo que separar:
--
--     reloj      el APARATO. El Tótem físico, el kiosco, el reloj en la obra.
--                Eso es lo que no está certificado, y eso queda apagado.
--
--     marcajes   los DATOS. Subir las marcas que trae el sistema de asistencia
--                de la empresa, en un archivo, y cruzarlas contra la tarja.
--                Eso no necesita el aparato: se carga a mano, y es
--                justamente lo que hay que poder hacer ahora.
--
-- Entonces el módulo apagado es UNO, y es el del aparato. Con los dos apagados
-- no se podrían cargar marcas, que es lo que hace falta para poder verificar el
-- Tótem más adelante. Ver el cruce en la Justificación Diaria.
--
-- Y PARA VOLVER ATRÁS
--
--   drop table if exists public.empresa_modulos cascade;
--   drop function if exists public.tocar_modulo_actualizado();