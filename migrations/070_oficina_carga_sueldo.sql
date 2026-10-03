-- ===================================================================
-- 070: OFICINA TAMBIÉN CARGA EL SUELDO (2026-10-03)
-- ===================================================================
--
-- Y es una línea. Se dejó para después a propósito y se agrega ahora porque quedó decidido.
--
-- ---------------------------------------------------------------------
-- QUÉ CAMBIA Y QUÉ NO
-- ---------------------------------------------------------------------
--
-- Lo que cambia: "oficina" pasa de "rem.ver" a tener "rem.editar" y "rem.exportar".
--
-- Lo que NO cambia:
--
--   · La columna no se agrega. Ya está, desde la 069.
--   · El historial no se toca. Ya registra quién cambió qué, con el valor anterior.
--   · Las políticas de RLS no cambian. Y esto es lo importante: el permiso NO es lo que
--     protege la columna.
--
-- ---------------------------------------------------------------------
-- POR QUÉ EL PERMISO NO ES LO QUE PROTEGE
-- ---------------------------------------------------------------------
--
-- Y esto hay que dejarlo escrito, porque es la clase de error que hace que alguien piense que
-- con un permiso está cerrado.
--
-- El RLS de "trabajadores" tiene la política "por empresa": el usuario ve las filas de su
-- empresa. Y esa política habla de FILAS, no de COLUMNAS. El RLS no sabe que existe una
-- columna llamada "sueldo_base", y no tiene cómo saberlo.
--
-- O sea que "sueldo_base" se lee igual que "telefono" o "nombre". Y "select *" la trae.
--
-- Entonces:
--
--   · El permiso "rem.ver" decide si el CAMPO APARECE en la pantalla. Eso es de la aplicación.
--   · El permiso "rem.editar" decide si se puede ESCRIBIR desde la ficha. También de la
--     aplicación.
--   · Y NINGUNO de los dos impide leer la columna con la llave anónima del navegador.
--
-- Que es exactamente lo que pasa con las demás columnas: la llave es pública por diseño, está
-- en "config/supabase.config.js", y con el RLS puesto lo que sale es lo de tu empresa. Ver
-- [rls-01].
--
-- ---------------------------------------------------------------------
-- QUÉ HABRÍA QUE HACER PARA DE VERDAD
-- ---------------------------------------------------------------------
--
-- Y aquí está la parte incómoda, y por eso va escrita en mayúsculas.
--
-- Con el diseño actual, la columna "sueldo_base" es un dato de la fila del trabajador, y por
-- lo tanto es visible para cualquier usuario activo de la empresa que tenga permiso de leer
-- la ficha. Eso incluye a quien tenga "trabajadores.ver" y NO tenga "rem.ver".
--
-- Hay dos maneras de cerrarlo, y ninguna es un permiso:
--
--   UNA: una VISTA que exponga el trabajador SIN la columna del sueldo, y usar esa vista donde
--        no haga falta verla. Y que la columna solo aparezca cuando "rem.ver" está. Es lo que
--        hace el panel de SQL con "information_schema".
--
--   DOS: mover el sueldo a una tabla aparte, con su propia política de RLS. Es más trabajo, y
--        es la forma en que se resuelven las columnas que no cualquiera puede ver.
--
-- Ninguna de las dos está hecha. La 069 lo deja escrito en "[rem-01]" y lo marca como
-- pendiente. Y es la decisión correcta dejarla escrita en vez de resolverla de apurada: es un
-- cambio de esquema sobre una tabla con la asistencia de todos.
--
-- ---------------------------------------------------------------------
-- LO QUE SÍ ES CIERTO HOY
-- ---------------------------------------------------------------------
--
-- Que escribir un sueldo desde la pantalla exige "rem.editar", y que sin el permiso el campo
-- no se puede cambiar. Eso está comprobado en el navegador con siete casos.
--
-- Y que la 069 deja el rastro: quién cambió, de qué valor a qué valor, cuándo y por qué.
--
-- ---------------------------------------------------------------------
-- POR QUÉ NO SE TOCA NADA MÁS
-- ---------------------------------------------------------------------
--
-- Porque el pedido es "que oficina también pueda cargar", y eso es un permiso. Lo demás son
-- cambios de esquema sobre la tabla que tiene la asistencia de todos, y eso no se hace de
-- noche.
--
-- Re-ejecutable. Todo lleva "on conflict do nothing", así que correrla dos veces deja lo mismo.

-- -------------------------------------------------------------------
-- 0) QUE TODO LO QUE AGREGA EXISTA
-- -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'puede_ver_trabajador') then
    raise exception 'Falta public.puede_ver_trabajador(). Aplicar antes la 067_aislar_por_empresa.sql.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'trabajadores'
                   and column_name = 'sueldo_base') then
    raise exception 'Falta la columna trabajadores.sueldo_base. Aplicar antes la 069_sueldo_base.sql.';
  end if;
end $$;


-- ===================================================================
-- 1) LOS PERMISOS QUE LE FALTA
-- ===================================================================
--
-- Y "rem.ver" ya está desde la 069, así que no se repite. Solo los dos que le faltan.
--
-- Y la tabla "permisos" se verifica dentro del bloque de arriba implícitamente: si las filas
-- no existen, el "insert" de abajo falla por clave foránea, y el editor SQL ejecuta todo como
-- una transacción y no aplica NADA. Por eso el "do" verifica la columna antes: es la señal de
-- que la 069 corrió.

insert into roles_permisos (rol, permiso) values
  ('oficina', 'rem.editar'),
  ('oficina', 'rem.exportar')
on conflict (rol, permiso) do nothing;


-- ===================================================================
-- 2) QUÉ CHANGUE EN PANTALLA
-- ===================================================================
--
-- Y esto lo lee la aplicación, no la base. Que "oficina" tenga "rem.editar" hace que el campo
-- del sueldo aparezca editable en la ficha, y que sin el permiso aparezca con el aviso de
-- "lo ves pero no lo puedes cambiar".
--
-- Y para las otras personas del rol: "rem.exportar" habilita el botón de exportar una planilla
-- con sueldos, que todavía no está escrito en la pantalla. Ese botón es el paso siguiente, y
-- no se escribe acá porque es una función de la aplicación, no de la base.


-- ===================================================================
-- CÓMO SE COMPRUEBA
-- ===================================================================
--
-- Uno: el reparto, que tiene que salir completo.
--
--     select rol, string_agg(permiso, ' ' order by permiso) as permisos
--       from roles_permisos
--      where permiso like 'rem.%'
--      group by rol order by rol;
--
-- Y tiene que salir:
--
--     admin        rem.editar rem.exportar rem.ver
--     oficina      rem.editar rem.exportar rem.ver
--     rrhh         rem.editar rem.exportar rem.ver
--     supervisors  rem.ver
--     tecnica      rem.ver
--
-- Dos: que la escritura quede en el historial. Y eso NO se puede probar con una consulta: hay
-- que cambiar un sueldo de verdad, con la sesión de quien tenga "rem.editar", y mirar la tabla.
--
--     select trabajador_code, valor_anterior, valor_nuevo, motivo, created_at
--       from sueldo_base_historial
--      order by created_at desc limit 5;
--
-- Si alguien cambió un sueldo y no aparece, el permiso de "insert" del historial no está
-- funcionando. Ver [rem-01].
--
-- ---------------------------------------------------------------------
-- Y LO QUE ESTA MIGRACIÓN NO ARREGLA
-- ---------------------------------------------------------------------
--
-- Que con la llave anónima se pueda leer la columna. Eso lo dice más arriba, en mayúsculas, y
-- es un cambio de esquema que va aparte.
--
-- Y la prueba de eso, que es la que falta y hay que hacer con la sesión de un usuario SIN
-- "rem.ver":
--
--     await supabaseClient.from('trabajadores').select('code,sueldo_base').limit(3)
--
-- Si ahí salen números, el RLS no está acotando columnas —porque no puede— y hay que ir a la
-- vista o a la tabla aparte. Ver [rem-01].
