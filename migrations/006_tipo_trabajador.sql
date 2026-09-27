-- Tipo de trabajador: interno de la empresa o de una empresa subcontratista.
-- Se usa en la tarjeta (badge "Interno Empresa" / "Subcontrato") y para que
-- Prevención pueda filtrar/ingresar personal de subcontrato.
alter table trabajadores
  add column if not exists tipo_trabajador text not null default 'interno';

alter table trabajadores
  drop constraint if exists trabajadores_tipo_trabajador_check;

alter table trabajadores
  add constraint trabajadores_tipo_trabajador_check
  check (tipo_trabajador in ('interno','subcontrato'));
