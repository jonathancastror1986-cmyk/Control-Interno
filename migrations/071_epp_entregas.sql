-- ===================================================================
-- 071: EPP ENTREGAS, POR EMPRESA (2026-10-03)
-- ===================================================================
--
-- La primera de las cuatro que quedaban, y la más fácil: "epp_entregas" cuelga de
-- "trabajadores" por "code", exactamente igual que "asistencia" y "marcajes", que la 067 ya
-- resolvió. Es el mismo patrón y la misma función.
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTA PRIMERA Y NO LAS OTRAS TRES
-- ---------------------------------------------------------------------
--
-- Porque es la que tiene el camino más corto y el daño más claro:
--
--   · el camino es un solo JOIN —"code" contra "trabajadores"—, y la función que lo resuelve
--     ya existe y ya está probada en la 067;
--
--   · y registra QUÉ SE LE ENTREGÓ A QUIÉN Y CUÁNDO. Eso es información de personas: si la
--     empresa A ve las entregas de la empresa B, está viendo qué elementos de seguridad
--     lleva cada uno de sus trabajadores. Y hay una empresa de seguridad en el juego, así que
--     el dato no es menor.
--
-- Las otras tres tienen el JOIN de dos saltos, o cuelgan de "auth.users", y ahí hay que medir
-- antes de escribir. Ver [rls-06].
--
-- ---------------------------------------------------------------------
-- POR QUÉ NO SE AGREGA "empresa_id"
-- ---------------------------------------------------------------------
--
-- Porque no hace falta, y porque "trabajadores" ya tiene la columna. La política puede
-- preguntar por otra tabla: lo que se evalúa es la política, y el dato puede estar donde sea.
--
-- Agregar la columna sería cambiar el esquema para resolver lo que un JOIN resuelve. Y una
-- columna que hay que mantener sincronizada es una que algún día no lo está. Ver [rls-02].
--
-- ---------------------------------------------------------------------
-- LAS CUATRO SALVAGUARDAS, IGUAL QUE EN LA 067
-- ---------------------------------------------------------------------
--
-- UNA: "with check" en escritura. Sin él, se puede insertar una entrega en una empresa propia
-- que después queda en la ajena, y esa fila es invisible para el que la escribió.
--
-- DOS: "es_admin()" con salida. Un administrador tiene que ver todo, o no puede trabajar. Y si
-- se rompiera, el síntoma sería "nadie ve las entregas", que se ve de inmediato.
--
-- TRES: RE-EJECUTABLE. Lleva "drop policy if exists" antes de cada "create policy".
--
-- CUATRO: filas huérfanas. "epp_entregas.code" NO tiene clave foránea a "trabajadores" —igual
-- que las tarjetas—, así que puede haber entregas de un trabajador que ya no existe. Esas
-- quedan para el administrador solo. Que es la dirección segura: un registro que nadie puede
-- leer, no se puede usar contra nadie.
--
-- ---------------------------------------------------------------------
-- LO QUE NO SE TOCA
-- ---------------------------------------------------------------------
--
-- "inventario_qr", "epp_kits_cargo" y "epp_kits" cuelgan de "epp_entrega_items", que a su vez
-- cuelga de "trabajadores". Se filtran después y con medición, porque el JOIN tiene dos saltos
-- y ahí la pregunta es si hay algo que proteger, no que se pueda escribir.
--
-- "perfiles" y "perfil_roles" cuelgan de "auth.users" y no de una empresa. El problema de ahí
-- es el alcance de los ROLES, que es distinto del filtro de filas y puede ser más grave.
--
-- Y los siete catálogos no se tocan: su contenido es el mismo para todas las empresas, así que
-- filtrarlos no protegería nada. Ver [rls-06].

-- -------------------------------------------------------------------
-- 0) QUE LO QUE SE USA EXISTA
-- -------------------------------------------------------------------
--
-- Y no por prolijidad: si "puede_ver_trabajador" no existiera, la política se caería al
-- crearse y, como el editor SQL ejecuta todo como una transacción, no se aplicaría NADA. O
-- sea que el que la corre cree que salió bien y en realidad no se movió una fila.
do $$
begin
  if not exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'puede_ver_trabajador') then
    raise exception 'Falta public.puede_ver_trabajador(). Aplicar antes la 067_aislar_por_empresa.sql.';
  end if;
  if not exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'es_admin') then
    raise exception 'Falta public.es_admin(). Aplicar antes la 016_permisos_coherentes.sql.';
  end if;
end $$;


-- ===================================================================
-- 1) LA POLÍTICA
-- ===================================================================

drop policy if exists "epp entregas rw" on public.epp_entregas;
-- Y ESTE SEGUNDO DROP ES PORQUE LA MIGRACIÓN CORRE DOS VECES.
--
-- El de arriba borra la política que había antes de esta migración. El de abajo borra la
-- que crea ESTA migración, para que volver a correrla no choque con ella.
--
-- Sin el segundo, la segunda corrida da: policy "epp entregas por empresa" already exists.
-- Y eso no es inocuo: el primer drop ya corrió, así que la tabla puede quedar sin
-- políticas —y con el RLS prendido, sin políticas no la lee nadie, ni un administrador.
--
drop policy if exists "epp entregas por empresa" on public.epp_entregas;
create policy "epp entregas por empresa" on public.epp_entregas for all
  using (public.puede_ver_trabajador(epp_entregas.code))
  with check (public.puede_ver_trabajador(epp_entregas.code));

comment on policy "epp entregas por empresa" on public.epp_entregas is
  'Reemplaza "epp entregas rw", que era "cualquier usuario activo". Una entrega de EPP registra '
  'qué lleva puesto cada trabajador, y eso es información de personas aunque el elemento sea un '
  'catálogo compartido. Ver [rls-06].';

-- Y que el RLS esté prendido, que es lo que hace que la política sirva de algo.
alter table public.epp_entregas enable row level security;


-- ===================================================================
-- CÓMO SE COMPRUEBA
-- ===================================================================
--
-- Uno: que la política vieja no esté, y la nueva sí.
--
--     select policyname, cmd, qual, with_check
--       from pg_policies
--      where schemaname='public' and tablename='epp_entregas';
--
-- Tiene que haber una sola, que se llame "epp entregas por empresa", y las dos columnas de
-- condición tienen que traer "puede_ver_trabajador". Si la vieja sigue, no se aplicó.
--
-- Dos: con la sesión de un usuario de UNA empresa, en la consola del navegador:
--
--     // las entregas que la aplicación le está mostrando a este usuario
--     entregasDeEpp().then(e => e.map(x => x.trabajador))
--
--     // y las que la base le devuelve si pregunta directo
--     const r = await supabaseClient.from('epp_entregas').select('code');
--     [...new Set(r.data.map(x => x.code))]
--
-- Si el segundo lista códigos que el primero no, NO FUNCIONÓ.
--
-- Y un caso más, que es el de la credencial: las entregas de un trabajador borrado. Esas deben
-- salir vacías para cualquiera que no sea administrador. No hay que probarlas con datos
-- inventados: si hay alguna, se pregunta por ella.
--
-- ---------------------------------------------------------------------
-- Y LO QUE ESTA MIGRACIÓN NO HACE
-- ---------------------------------------------------------------------
--
-- No toca "epp_entrega_items", que cuelga de "epp_entregas" y tiene su propia política. Esa
-- queda con "cualquier usuario activo" hasta que se mida, porque sigue un JOIN de dos saltos.
--
-- Y eso significa que la entrega se acota pero su detalle no. Es un paso, no el final, y está
-- escrito acá para que no se lea como "el EPP quedó cerrado".
