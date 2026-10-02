-- 062_modo_firma.sql
-- ==================
--
-- ¿QUÉ AGREGA
-- ------------
--
-- Una columna en "plantillas_contratacion":
--
--     modo_firma text not null default 'manuscrita'
--       check (modo_firma in ('manuscrita','digital','mixto'))
--
-- Y dice cómo se firma ese papel:
--
--   'manuscrita'  se firma en pantalla, se genera el PDF y se escanea
--   'digital'     lleva firma digital, que necesita certificado de entidad autorizada
--   'mixto'       el supervisor con certificado y el trabajador a mano
--
--
-- Y ES DISTINTA DE "requiere_aprobacion", QUE LA 061 AGREGÓ
-- ------------------------------------------------------
--
-- Son dos preguntas distintas y por eso son dos columnas:
--
--   requiere_aprobacion   si el papel pasa por alguien antes de entregarse
--   modo_firma            si se firma con certificado o a mano
--
-- Un contrato puede llevar firma digital y no pasar por aprobación. Una declaración de salud
-- puede pasar por aprobación y firmarse a mano. Con una sola bandera, el día que aparezca un
-- documento que necesita las dos cosas no hay forma de pedir las dos. Ver [firma-01].
--
--
-- POR QUÉ ES UNA LISTA Y NO UN BOOLEANO
-- --------------------------------------
--
-- Porque el caso "el supervisor con certificado y el trabajador a mano" es real y no cabe en un
-- sí o no. Los dos firman el mismo papel, pero con métodos distintos, y cada uno tiene su regla.
--
-- Es el mismo motivo por el que "firmas" es texto y no booleano: tres casos no entran en dos.
--
--
-- Y 'default manuscrita' PORQUE ES LO QUE YA ANDA
-- --------------------------------------------------
--
-- Todas las plantillas que están en la tabla se firman a mano hoy: hay un lienzo de firma y el
-- PDF se genera con lo que sale de ahí. Con otro valor por defecto, de golpe papers que ya se
-- estaban entregando pasarían a pedir certificado.
--
-- Ver [firma-02].
--
--
-- LO QUE ESTÁ LISTO Y LO QUE NO
-- -------------------------------
--
-- Lo que ya anda y no hay que hacer:
--
--   - el lienzo de firma, con el dedo o el mouse        [bodega, el bloque de entregas]
--   - "montarFirmaPapel", que la pone en el papel       idem
--   - el PDF, con jspdf y html2canvas                   idem
--   - el bucket de almacenamiento, para subirlo          EPP_BUCKET
--
-- Lo que NO está, y que este campo decide a quién le toca:
--
--   - la firma digital con certificado, que necesita un proveedor externo
--   - subir el PDF escaneado de un papel firmado en papel
--
-- Y POR QUÉ "mixto" SE PUEDE DEJAR SIN HACER
-- -------------------------------------------
--
-- Porque es el único de los tres que necesita las dos cosas, y es el menos frecuente. Se puede
-- dejar en el select y que por ahora caiga en el camino manuscrito, en vez de bloquear el
-- resto. Se dice acá para que no parezca un olvido. Ver [firma-03].
--

alter table public.plantillas_contratacion
  add column if not exists modo_firma text not null default 'manuscrita';

-- Y el CHECK se agrega aparte, y solo si la columna es nueva. Porque un "alter table ... add
-- column" con "check" en la misma línea falla si la columna ya existe de una corrida anterior,
-- y estas migraciones están para correrlas más de una vez.
alter table public.plantillas_contratacion
  drop constraint if exists plantillas_contratacion_modo_firma_check;

alter table public.plantillas_contratacion
  add constraint plantillas_contratacion_modo_firma_check
  check (modo_firma in ('manuscrita','digital','mixto'));

comment on column public.plantillas_contratacion.modo_firma is
  'Cómo se firma este papel: manuscripts, digital o mixto. Es distinto de "requiere_aprobacion",
  que dice si pasa por revision antes de entregarse. Digital y mixto necesitan un certificado de
  entidad autorizada, que todavia no esta integrado: hoy los tres caminos usan el lienzo.';

-- Para confirmar, tiene que dar 1
select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'plantillas_contratacion'
   and column_name  = 'modo_firma';