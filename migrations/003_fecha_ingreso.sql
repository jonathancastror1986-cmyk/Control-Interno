-- Fecha de ingreso del trabajador, usada en el formulario y la tarjeta definitiva.
alter table trabajadores
  add column if not exists fecha_ingreso date;