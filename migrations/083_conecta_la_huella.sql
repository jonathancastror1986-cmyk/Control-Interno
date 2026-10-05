-- ===================================================================
-- 083 - QUE LA FIRMA DE VERDAD DEJE PODER EDITARSE
-- ===================================================================
--
-- EL HECHO, QUE SE MIDIO LEYENDO EL CODIGO
-- ------------------------------------------
--
-- La firma funciona. Cuando firmaste, el cartel dijo "El papel quedó guardado
-- con la firma", y de verdad se guardó: la función "registrar_firma_contratacion"
-- de la 031 escribe en "entregas_contratacion", con la firma del trabajador, la del
-- supervisor y los datos del trabajador en ese momento.
--
-- PERO LA TABLA "firmas_documento" DE LA 079 ESTÁ VACÍA. Y ESTÁ VACÍA PORQUE
-- NADA LA ESCRIBE: se busco "firmas_documento" en todo el proyecto y los
-- unicos lugares donde aparece son la 079 misma y los dos diagnosticos.
--
-- Con eso, de la 079 queda muerta la parte que importa:
--
--     contenido_hash    nunca se calcula
--     verificar_firma()  nunca se llama
--     verificaciones     nunca se cuenta
--
-- Y QUEDE HACIENDO LO CONTRARIO DE LO QUE SE LE PIDIÓ
-- --------------------------------------------------
--
-- Un papel firmado se puede volver a guardar con otros datos: la funcion
-- "registrar_firma_contratacion" tiene un "on conflict" que pisa la firma si
-- se vuelve a firmar. El documento que se vuelve a generar tiene OTRO texto,
-- pero queda en la misma fila, con la misma fecha de firma, y nadie puede
-- notar la diferencia.
--
-- Eso es lo que se pidió evitar cuando se eligió el formato: "que no se pueda
-- modificar despues, y quede la copia de ese momento".
--
--
-- LA IDEA
-- -------
--
-- El HASH va del navegador a la base junto a la firma. El navegador es el
-- unico que tiene el documento entero: la base guarda el texto ya reemplazado
-- en "datos", no el papel. Asi que el hash se calcula en el navegador con
-- "crypto.subtle.digest", que ya se usa en el proyecto para otras cosas.
--
-- Y NO SE CALCULA SOBRE EL TEXTO CRUDO
--
-- Se calcula sobre el texto ya armado, con los datos puestos. Si se calculara
-- sobre la plantilla, dos personas distintas firmando la misma plantilla
-- darian el mismo hash, y la huella no probaria nada sobre el papel.
--
-- ------------------------------------------------------------------
-- 1) QUE LA TABLA ACEPTE EL TIPO DE PAPEL DEL KIT
-- ------------------------------------------------------------------
-- La 079 tiene un "check" que no deja pasar 'declaracion': solo acepta
-- contrato, anexo, charla, induction, prevencion, formulario y otro.
--
-- Y el kit tiene papeles que no son ninguno de esos. La plantilla
-- "Declaración De Salud Empresa de Prueba" se guardaria como 'formulario',
-- que pasa. Pero si mañana hay un tipo nuevo, el "insert" revienta con un
-- error de "check" que no dice qué hacer.
--
-- La salida es no inventar una restriction nueva: la columna es texto a
-- proposito, justamente para que un documento firmado no dependa de una
-- tabla de tipos. Se saca el "check".
--
-- Con esto, si el "check" esta presente se lo deja estar (una base ya
-- aplicada lo tiene), y si no esta, la columna queda libre. Por eso el
-- "drop" va con "if exists" sobre la restriccion nombrada.
alter table public.firmas_documento drop constraint if exists firmas_documento_tipo_check;
alter table public.firmas_documento drop constraint if exists firmas_documento_check;

-- ------------------------------------------------------------------
-- 2) LA COLUMNA DE LA PLANTILLA
-- ------------------------------------------------------------------
-- "firmas_documento.documento_id" es un uuid suelto, sin clave foranea a
-- "plantillas_contratacion", que es la tabla real de las plantillas.
--
-- Eso esta bien a proposito: la firma es de un PAPEL, no de una plantilla.
-- Si la plantilla se borra, el papel firmado tiene que seguir existiendo.
--
-- Lo que falta es poder decir DE QUE plantilla vino, y eso se hace con el
-- codigo, que es el identificador que ya usa el kit.
alter table public.firmas_documento add column if not exists plantilla_code text;
alter table public.firmas_documento add column if not exists plantilla_nombre text;

-- Y el nombre del trabajador, que se copia por la misma razon que la
-- firma: en tres años el nombre puede haber cambiado y lo que se firmó
-- es lo que dice ahi.
alter table public.firmas_documento add column if not exists trabajador_nombre text;

comment on column public.firmas_documento.plantilla_code is
  'El codigo de la plantilla del kit de la que salio este papel. No es una clave foranea a proposito: si la plantilla se borra o se edita, el papel firmado tiene que seguir existiendo como estaba.';

comment on column public.firmas_documento.documento_id is
  'Sin usar todavia. La firma es de un PAPEL, no de una plantilla, y el papel no tiene fila propia en ninguna tabla: se arma en el navegador con la plantilla y los datos del trabajador. La huella de "contenido_hash" es la que ata el papel a lo que se firmo.';

-- ------------------------------------------------------------------
-- 3) INDICES PARA PODER FILTRAR
-- ------------------------------------------------------------------
-- La vista que falta es "los papeles firmados de una carpeta", con filtros por
-- empresa, por trabajador, por tipo y por fecha.
--
-- Y el indice es por "(empresa_id, firmado_en desc)": que es como se pregunta
-- una lista de firmados.
create index if not exists firmas_documento_empresa_fecha
  on public.firmas_documento (empresa_id, firmado_en desc);

-- Y uno por trabajador, que es la vista "la carpeta de Fulano".
create index if not exists firmas_documento_trabajador
  on public.firmas_documento (empresa_id, code, firmado_en desc);

-- Y uno por tipo, para el filtro de "solo contratos" o "solo anexos".
create index if not exists firmas_documento_tipo
  on public.firmas_documento (empresa_id, tipo, firmado_en desc);

-- ------------------------------------------------------------------
-- 4) UNA VISTA QUE NO NECESITA MIGRACION
-- ------------------------------------------------------------------
-- "documentos firmados" se arma con la de RLS de la 079, que ya deja pasar
-- solo lo que el usuario puede ver. No hace falta una funcion nueva.
--
-- ------------------------------------------------------------------
-- 5) EL PERMISO DE ESCRITURA
-- ------------------------------------------------------------------
-- La politica de la 079 escribe con "rem.editar", que es el permiso de cargar
-- remuneraciones. Para firmar un papel del kit, el permiso que corresponde es
-- "contratacion.firmar", que es el que revisa el boton en la pantalla.
--
-- Con lo que esta ahora, hay una contradiccion: la pantalla exige
-- "contratacion.firmar" para abrir el papel, pero la base acepta que lo
-- escriba cualquiera con "rem.editar". O al reves: alguien con permiso para
-- firmar, sin el de remuneraciones, ve el boton y no puede guardar.
--
-- Se cambia la politica para que acepte los dos permisos. El boton de la
-- pantalla no cambia: sigue exigiendo "contratacion.firmar".
drop policy if exists "firmas escriben" on public.firmas_documento;
create policy "firmas escriben" on public.firmas_documento for all
  using (tiene_permiso('contratacion.firmar') or tiene_permiso('rem.editar'))
  with check (tiene_permiso('contratacion.firmar') or tiene_permiso('rem.editar'));

-- ------------------------------------------------------------------
-- PARA VOLVER ATRÁS
-- ------------------------------------------------------------------
--   drop index if exists public.firmas_documento_empresa_fecha;
--   drop index if exists public.firmas_documento_trabajador;
--   drop index if exists public.firmas_documento_tipo;
--   alter table public.firmas_documento drop column if exists plantilla_code;
--   alter table public.firmas_documento drop column if exists plantilla_nombre;
--   alter table public.firmas_documento drop column if exists trabajador_nombre;