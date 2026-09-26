-- Añade LL (día lluvia) como estado válido de asistencia.
alter table asistencia
  drop constraint if exists asistencia_estado_check;

alter table asistencia
  add constraint asistencia_estado_check
  check (estado in ('X','F','P','L','A','PP','V','LL'));