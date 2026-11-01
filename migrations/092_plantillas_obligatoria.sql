-- ===================================================================
-- 092: OBLIGATORIEDAD DE LAS PLANTILLAS
-- ===================================================================
--
-- Una plantilla (contrato, anexo, charla, induction, prevencion, formulario)
-- puede ser obligatoria para el trabajador. Es distinta de "requiere_aprobacion":
-- la aprobacion es un flujo de quien aprueba; la obligatoriedad es un dato de la
-- plantilla (si el documento debe entregarse o exigirse).
--
-- Sin esta columna no se puede reportar si un documento es obligatorio, y sin
-- eso la vista de requerimientos no puede separar "obligatorio" de "aprobable".
--
-- ES RE-EJECUTABLE: la columna se agrega con "add column if not exists", que si
-- ya existe no hace nada.

alter table public.plantillas
  add column if not exists obligatoria boolean not null default false;

comment on column public.plantillas.obligatoria is
  'Si el documento es obligatorio para el trabajador. Distinto de "requiere_aprobacion", que es un flujo de aprobacion.';
