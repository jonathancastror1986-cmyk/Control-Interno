-- Renombra el concepto "subcontrato" a "externo" sin perder datos ni permisos.
-- Es idempotente: se puede correr más de una vez.

-- 1) Tipo de trabajador: soltar el check, migrar datos, volver a crearlo.
alter table trabajadores
  drop constraint if exists trabajadores_tipo_trabajador_check;

update trabajadores
   set tipo_trabajador = 'externo'
 where tipo_trabajador = 'subcontrato';

alter table trabajadores
  add constraint trabajadores_tipo_trabajador_check
  check (tipo_trabajador in ('interno','externo'));

-- 2) Permiso: roles_permisos.permiso referencia permisos(clave) sin
-- "on update cascade", así que primero se crea la clave nueva, se mueven los
-- hijos y al final se borra la clave vieja.
insert into permisos (clave, descripcion, categoria, orden)
select 'prevencion.externo', 'Ingresar trabajadores externos', categoria, orden
  from permisos
 where clave = 'prevencion.subcontrato'
on conflict (clave) do nothing;

insert into roles_permisos (rol, permiso)
select rol, 'prevencion.externo'
  from roles_permisos
 where permiso = 'prevencion.subcontrato'
on conflict (rol, permiso) do nothing;

delete from roles_permisos where permiso = 'prevencion.subcontrato';
delete from permisos where clave = 'prevencion.subcontrato';

comment on column trabajadores.tipo_trabajador is
  'Tipo de trabajador: interno (de la empresa) o externo (antes "subcontrato").';
