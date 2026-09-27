-- ============================================================
-- Migración 015: vincular el usuario del sistema con su ficha
-- ============================================================
-- Dos cosas:
--
-- 1) "perfiles" guardaba nombre, rol y activo, pero no el código del
--    trabajador. Sin eso la app no puede saber a qué equipo pertenece
--    quien está conectado, que es lo que permite que un supervisor vea
--    solo a los suyos.
--
-- 2) El "check (rol in (...))" de la 001 se quedó corto cuando la 013
--    añadió los roles nuevos: 'supervisores' y 'tecnica' no estaban y la
--    base los rechazaba. Como la app guarda en perfiles.rol el primer
--    rol de la persona, asignarle "supervisores" fallaba con un error de
--    clave ajena. Aquí se amplía la lista.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 014 -> 015.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ROLES ADMITIDOS
-- ------------------------------------------------------------
alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles
  add constraint perfiles_rol_check
  check (rol in ('admin','oficina','porteria','bodega','prevencion','rrhh','supervisores','tecnica'));

-- ------------------------------------------------------------
-- 2) VÍNCULO CON LA FICHA DEL TRABAJADOR
-- ------------------------------------------------------------
alter table perfiles
  add column if not exists trabajador_code text references trabajadores(code) on delete set null;

create index if not exists perfiles_trabajador_idx on perfiles(trabajador_code);

-- ------------------------------------------------------------
-- Un intento de vinculación automática por nombre
-- ------------------------------------------------------------
-- Si el usuario se llama igual que un trabajador supervisor, se le
-- vincula. Es solo una ayuda: se puede corregir a mano desde
-- Soporte -> Usuarios, y si no hay coincidencia exacta no pasa nada.
-- Se hace con UPDATE y no con INSERT porque "nombre" es NOT NULL y un
-- INSERT (id, trabajador_code) dejaría la fila inválida.
update perfiles p
   set trabajador_code = t.code
  from trabajadores t
 where p.trabajador_code is null
   and t.is_supervisor
   and lower(btrim(t.name)) = lower(btrim(coalesce(p.nombre, '')))
   and not exists (
     select 1 from perfiles p2 where p2.trabajador_code = t.code
   );
