-- Indicaciones independientes para los equipos de Asistencia Social y Prevención.
alter table trabajadores
  add column if not exists indicaciones_sociales text,
  add column if not exists indicaciones_prevencion text;