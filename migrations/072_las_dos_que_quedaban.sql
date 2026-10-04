-- ===================================================================
-- 072: LAS DOS QUE QUEDABAN ABIERTAS DE VERDAD (2026-10-04)
-- ===================================================================
--
-- La 071 cerró "epp_entregas" y, al final, dejó escrito que "epp_entrega_items" seguía abierta
-- "hasta que se mida". Acá está la medición, y cambió el plan.
--
-- ---------------------------------------------------------------------
-- LO QUE SE MEDIÓ Y NO ERA LO QUE SE SUPONÍA
-- ---------------------------------------------------------------------
--
-- "docs/que-falta-por-empresa.md" decía que las tres tablas que quedaban eran "inventario_qr",
-- "epp_kits_cargo" y "epp_kits", y que colgaban de "epp_entrega_items" y de "herramientas",
-- que a su vez cuelgan de "trabajadores". Por eso habría que filtrarlas con un JOIN de dos
-- saltos.
--
-- Sus columnas, una por una:
--
--     inventario_qr    id, tipo, herramienta_id, epp_codigo, nombre, precio, estado,
--                      motivo_anulacion, created_at
--     epp_kits_cargo    cargo, epp_codigo, cantidad, orden, especialidad_id, talla_sugerida
--     epp_kits          id, especialidad_id, nombre, descripcion, orden, activo, created_at
--
-- NINGUNA tiene una columna que apunte a un trabajador, y ninguna cuelga de "epp_entrega_items".
-- La ruta que se describía no existe. Las tres son catálogos: una herramienta o un EPP con
-- código QR, qué EPP necesita cada cargo, y los kits de una especialidad.
--
-- Eso las saca de la lista, y no por opinar: no hay por dónde filtrarlas.
--
-- ---------------------------------------------------------------------
-- LAS QUE SÍ QUEDABAN, Y SON DOS
-- ---------------------------------------------------------------------
--
-- De la cadena de datos de personas, dos seguían con "cualquier usuario activo":
--
--     herramientas_asignaciones   qué herramienta tiene CADA trabajador
--                                  001_schema.sql L125
--                                  usando: exists (select 1 from perfiles p
--                                                 where p.id = auth.uid() and p.activo)
--
--     epp_entrega_items            QUÉ EPP se le entregó a cada uno, el detalle
--                                  008_epp_firma.sql L112
--                                  usando: la misma condición
--
-- Esa condición no menciona ninguna empresa. La cumple CUALQUIER usuario activo, de cualquier
-- empresa. No es una inferencia: es el texto de la política.
--
-- Y el caso de "herramientas_asignaciones" es el más raro de todos: tiene
-- "code text not null references trabajadores(code)", o sea EXACTAMENTE la forma de un salto
-- que la 067 ya resolvió en "asistencia", "marcajes" y "tarjetas". La 067 la pasó por alto.
-- No es un JOIN difícil: es la misma línea que ya está escrita y probada cuatro veces.
--
-- ---------------------------------------------------------------------
-- POR QUÉ "epp_entrega_items" NO PUEDE SER UNA LÍNEA
-- ---------------------------------------------------------------------
--
-- Porque no tiene "code". Sus columnas son:
--
--     id, entrega_id uuid not null references epp_entregas(id) on delete cascade,
--     epp_codigo, nombre, detalle, talla, cantidad, created_at
--
-- O sea que el código del trabajador hay que sacarlo de "epp_entregas". Son DOS saltos, y por eso
-- hace falta una función: porque la regla tiene que vivir en un solo lugar, como la 067 lo dice
-- de "puede_ver_trabajador".
--
-- Y sin esto, la 071 cerraba solo la cabecera: se veía a QUIÉN se le entregó, y no QUÉ. Al revés
-- de lo que uno pensaría —"ya cerré las entregas"— y por eso era importante cerrarlo.
--
-- ---------------------------------------------------------------------
-- LAS CUATRO SALVAGUARDAS, IGUAL QUE EN LA 067 Y LA 071
-- ---------------------------------------------------------------------
--
-- UNA: "with check" en escritura, en las dos. Sin él se puede escribir en una empresa propia una
-- fila que después queda en la ajena, y esa fila es invisible para el que la escribió.
--
-- DOS: la salida del administrador. Viene DENTRO de las dos funciones: "puede_ver_trabajador"
-- arranca con "public.es_admin(uid) or …", y "puede_ver_entrega" de abajo hace lo mismo. Un
-- administrador tiene que ver todo, o no puede trabajar.
--
-- TRES: RE-EJECUTABLE. Dos "drop policy if exists" por tabla: el que borra la política vieja y
-- el que borra la que crea ESTA migración. Sin el segundo, la segunda corrida da "already
-- exists" y —como el primer drop ya corrió— la tabla queda SIN políticas: con el RLS prendido,
-- no la lee nadie, ni un administrador. Ya pasó con la 071.
--
-- CUATRO: filas huérfanas. "herramientas_asignaciones.code" y "epp_entrega_items.entrega_id"
-- tienen clave foránea con "on delete cascade", así que no puede haber huérfanas: si el
-- trabajador o la entrega se borran, el renglón se borra. No hay que hacer nada, y conviene
-- dejarlo escrito para que nadie agregue una columna de toleratedor.
--
-- ---------------------------------------------------------------------
-- LO QUE NO SE TOCA, Y POR QUÉ
-- ---------------------------------------------------------------------
--
-- Los catálogos —los siete de [rls-06] más estas tres— no se filtran. Su contenido es el mismo
-- para todas las empresas: el mismo grupo de herramientas cuesta lo mismo en todas las obras.
--
-- "perfiles" y "perfil_roles" cuelgan de "auth.users", no de una empresa. Su problema es el
-- alcance de los ROLES, que es distinto del filtro de filas y puede ser más grave: no es que un
-- usuario vea una fila de más, es que un usuario tenga un rol que no debería tener. Eso se mide
-- aparte.
--
-- Y "sueldo_base" sigue en "trabajadores", que el RLS no acota por columnas. Ver [rem-01].

-- -------------------------------------------------------------------
-- 0) QUE LO QUE SE USA EXISTA
-- -------------------------------------------------------------------
--
-- Y no por prolijidad: como el editor SQL ejecuta todo como una transacción, si algo falla no se
-- aplica NADA. Y el que la corrió cree que salió bien. Ya pasó dos veces.
--
-- Y el guardián también avisa si el ESQUEMA no es el que se midió. Porque una política que
-- referencia una columna que no existe no avisa: se crea, y falla en tiempo de consulta, que es
-- cuando alguien la está usando.
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
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'herramientas_asignaciones'
                   and column_name = 'code') then
    raise exception 'La tabla herramientas_asignaciones no tiene la columna "code". Esta migración se midió con ella; el esquema cambió.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'epp_entrega_items'
                   and column_name = 'entrega_id') then
    raise exception 'La tabla epp_entrega_items no tiene la columna "entrega_id". Esta migración se midió con ella; el esquema cambió.';
  end if;
end $$;


-- ===================================================================
-- 1) LA FUNCIÓN DEL SEGUNDO SALTO
-- ===================================================================

create or replace function public.puede_ver_entrega(entrega_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin(uid)
      or exists (
        select 1
        from public.epp_entregas e
        where e.id = entrega_id
          and public.puede_ver_trabajador(e.code, uid)
      );
$$;

comment on function public.puede_ver_entrega(uuid, uuid) is
  'Verdadero si el usuario puede ver los renglones de esa entrega: es administrador, o la entrega '
  'es de un trabajador que puede ver. El "code" del trabajador hay que sacarlo de "epp_entregas" '
  'porque "epp_entrega_items" no lo tiene: ese es el motivo de que esta función exista. Ver [rls-06].';


-- ===================================================================
-- 2) LAS DOS POLÍTICAS
-- ===================================================================

-- ---------------------------------------------------------------------
-- 2A) herramientas_asignaciones: UN salto, la misma línea de siempre
-- ---------------------------------------------------------------------

drop policy if exists "asignaciones rw" on public.herramientas_asignaciones;
drop policy if exists "asignaciones por empresa" on public.herramientas_asignaciones;

create policy "asignaciones por empresa" on public.herramientas_asignaciones for all
  using (public.puede_ver_trabajador(herramientas_asignaciones.code))
  with check (public.puede_ver_trabajador(herramientas_asignaciones.code));

comment on policy "asignaciones por empresa" on public.herramientas_asignaciones is
  'Reemplaza "asignaciones rw", que era "cualquier usuario activo". Dice qué herramienta tiene '
  'cada trabajador, con su precio y su fecha: es información de personas. Esta tabla tiene la '
  'misma forma que asistencia, marcajes y tarjetas —"code" contra "trabajadores"— y quedó fuera '
  'de la 067 sin que nadie lo notara. Ver [rls-06].';

alter table public.herramientas_asignaciones enable row level security;

-- ---------------------------------------------------------------------
-- 2B) epp_entrega_items: DOS saltos, por la función
-- ---------------------------------------------------------------------

drop policy if exists "epp items rw" on public.epp_entrega_items;
drop policy if exists "epp items por empresa" on public.epp_entrega_items;

create policy "epp items por empresa" on public.epp_entrega_items for all
  using (public.puede_ver_entrega(epp_entrega_items.entrega_id))
  with check (public.puede_ver_entrega(epp_entrega_items.entrega_id));

comment on policy "epp items por empresa" on public.epp_entrega_items is
  'Reemplaza "epp items rw", que era "cualquier usuario activo". Sin esto, la 071 cerraba solo la '
  'cabecera de las entregas y el detalle quedaba abierto para todas las empresas. La condición va '
  'por "puede_ver_entrega" porque esta tabla no tiene "code": hay que sacarlo de "epp_entregas". '
  'Ver [rls-06].';

alter table public.epp_entrega_items enable row level security;


-- ===================================================================
-- CÓMO SE COMPRUEBA
-- ===================================================================
--
-- Uno: que las políticas viejas no estén y las nuevas sí.
--
--     select tablename, policyname, cmd, qual is not null as con_using,
--            with_check is not null as con_check
--       from pg_policies
--      where schemaname='public'
--        and tablename in ('herramientas_asignaciones','epp_entrega_items',
--                          'epp_entregas','asistencia','marcajes','tarjetas')
--      order by tablename, policyname;
--
-- Tiene que haber una sola por tabla, con "with check" en todas, y el "using" de las dos nuevas
-- tiene que traer "puede_ver_trabajador" y "puede_ver_entrega".
--
-- Dos: que la función exista y responda.
--
--     select public.puede_ver_entrega('<un id de entrega>', null);
--
-- Con "null" como usuario tiene que dar FALSE, y no un error. Si da error, la función se creó
-- mal y la política que la usa va a fallar en tiempo de consulta.
--
-- Tres: con la sesión de un usuario de UNA empresa, en la consola del navegador:
--
--     const a = await supabaseClient.from('herramientas_asignaciones').select('code');
--     [...new Set(a.data.map(x => x.code))]
--     const b = await supabaseClient.from('epp_entrega_items').select('entrega_id');
--     [...new Set(b.data.map(x => x.entrega_id))]
--
-- Y se comparan con lo que la aplicación le está mostrando a ese usuario. Si la base devuelve
-- códigos o entregas que la pantalla no, NO FUNCIONÓ.
--
-- ---------------------------------------------------------------------
-- EL CASO QUE NO SE PUEDE PROBAR CON DATOS INVENTADOS
-- ---------------------------------------------------------------------
--
-- Con la llave ANÓNIMA las dos dan cero filas, porque "auth.uid()" es null y
-- "exists (… where p.id = null …)" es falso. O sea que la prueba anónima no dice nada sobre esto,
-- en ninguna dirección: da cero tanto si la política está como si no.
--
-- La prueba buena es la del punto tres, con la sesión de un usuario de verdad.
--
-- ---------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO HACE
-- ---------------------------------------------------------------------
--
-- No toca "perfiles" ni "perfil_roles". Su problema no es el filtro de filas: es que un usuario
-- tenga un rol de una empresa que no le corresponde. Eso es alcance de rol, y se mide aparte.
--
-- Y no mueve "sueldo_base" fuera de "trabajadores". El RLS no acota columnas, así que ese
-- número sigue siendo legible con la llave del navegador mientras viva ahí. Ver [rem-01].