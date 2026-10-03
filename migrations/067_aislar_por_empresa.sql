-- ===================================================================
-- 067: AISLAR POR EMPRESA LAS TABLAS QUE CUELGAN DEL TRABAJADOR (2026-10-02)
-- ===================================================================
--
-- -------------------------------------------------------------------
-- QUÉ ESTÁ MAL HOY
-- -----------------
--
-- "trabajadores" está bien aislado. La 014 reemplazó las políticas originales por unas que
-- filtran con "perfil_empresas" y con "with check" en la escritura.
--
-- Las tablas que CUELGAN del trabajador por "code" no. Todas tienen la política de la 001, que
-- es:
--
--     create policy "asistencia rw" on asistencia for all
--       using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
--
-- O sea: "cualquier usuario activo", sin mirar de qué empresa es.
--
-- Y el RLS se evalúa POR TABLA. Que "trabajadores" esté acotado no acota "asistencia".
--
-- -------------------------------------------------------------------
-- POR QUÉ NO SE NOTÓ
-- ------------------
--
-- Porque la migración 014 dice, en su comentario:
--
--     No se agrega empresa_id a asistencia, tarjetas, EPP ni herramientas:
--     todo eso cuelga de trabajadores (por code), así que basta con filtrar
--     la lista de trabajadores para que el resto quede acotado.
--
-- Y eso es cierto SI Y SOLO SI la única forma de leer esas tablas es el propio código de la
-- aplicación.
--
-- No lo es. La llave anónima está en "config/supabase.config.js", que se carga en todas las
-- páginas, y es pública por diseño: es lo que permite que el navegador hable con la base sin
-- un servidor. Cualquiera la copia, abre la consola y escribe:
--
--     supabaseClient.from('marcajes').select()
--
-- Y le devuelve TODO. Ver [rls-01].
--
-- -------------------------------------------------------------------
-- POR QUÉ NO SE AGREGA "empresa_id" A ESTAS TABLAS
-- -------------------------------------------------
--
-- Porque no hace falta, y son quince tablas. PostgreSQL permite que la política pregunte por
-- otra tabla, y "trabajadores" ya tiene la columna:
--
--     using ( exists (
--       select 1
--       from perfil_empresas pe
--       join trabajadores t on t.empresa_id = pe.empresa_id
--       where pe.user_id = auth.uid() and t.code = asistencia.code
--     ) )
--
-- La política es la que se evalúa; el dato puede estar en otra tabla. Agregar la columna sería
-- cambiar el esquema de quince tablas para resolver lo que un JOIN resuelve. Y una columna que
-- hay que mantener sincronizada es una que algún día no lo está.
--
-- -------------------------------------------------------------------
-- POR QUÉ SOLO LAS TRES DE ESTA MIGRACIÓN
-- -----------------------------------------
--
-- Porque son las tres donde el daño es claro y el arreglo es el mismo:
--
--   · "asistencia" y "marcajes"  — quién estuvo y cuándo, de todas las empresas.
--   · "tarjetas"                 — "id" ES el valor del código de barras, con su estado de
--                                  activa o anulada. Una credencial.
--   · (el bucket "epp-respaldos" va aparte, en la 068. No se puede aplicar desde el
--                                  panel: "storage.objects" no es nuestra y su dueño no es el
--                                  rol del editor SQL. Ver [sql-02].)
--
-- Las otras once quedan fuera a propósito. No porque no importen, sino porque una migración de
-- seguridad sin probar con datos reales es un riesgo, y un riesgo grande sobre quince tablas
-- no se toma de una. Al final está la consulta que lista lo que falta.
--
-- -------------------------------------------------------------------
-- LAS CUATRO COSAS QUE ESTA MIGRACIÓN NO PUEDE HACER MAL
-- ------------------------------------------------------
--
-- UNA: "with check" en ESCRITURA. Sin él, se puede insertar una fila en una empresa propia que
-- después queda en una ajena, y esa fila es invisible para el que la escribió. Con "using" y
-- con "with check" iguales, una escritura solo pasa si el que la hace podría leerla después.
--
-- DOS: "es_admin()" con salida. Un administrador tiene que ver todo, o no puede trabajar. Y si
-- "es_admin()" se rompiera, el síntoma sería "nadie entra", que se ve de inmediato.
--
-- TRES: ser RE-EJECUTABLE. Lleva "drop policy if exists" antes de cada "create policy". Correrla
-- dos veces tiene que dejar lo mismo, no un error.
--
-- CUATRO: que las filas huérfanas NO desaparezcan. "tarjetas.code" NO tiene clave foránea a
-- "trabajadores" —a propósito, para poder dejar la tarjeta aunque el trabajador se borre—, así
-- que puede haber tarjetas cuyo código ya no existe en "trabajadores". Esas quedan fuera del
-- alcance de todo el mundo menos del administrador. Que es la dirección segura: una credencial
-- que no se puede leer, no se puede usar.
--
-- -------------------------------------------------------------------
-- CÓMO SE COMPRUEBA QUE ESTA MIGRACIÓN FUNCIONÓ
-- ----------------------------------------------
--
-- Al final hay una consulta. Y la prueba que de verdad importa es con la sesión de un usuario
-- de UNA empresa, y comparar contra lo que la propia aplicación le muestra a ese usuario.
--
-- -------------------------------------------------------------------
-- LO QUE NO SE TOCA Y POR QUÉ
-- ---------------------------
--
-- Las otras once tablas. Y "trabajadores", que ya está bien. Y las cinco funciones de permiso
-- —"es_admin()", "tiene_permiso()", "es_usuario_activo()"—, que están bien y se reescriben
-- enteras en casi todas las últimas migraciones.
--

-- -------------------------------------------------------------------
-- 0) QUE LAS FUNCIONES QUE SE USAN EXISTAN
-- -------------------------------------------------------------------
--
-- Y no por prolijidad: si "es_admin()" no existiera, TODA esta migración fallaría en la
-- primera política y no se aplicaría ninguna. Y si existiera con otra firma, fallaría igual, y
-- con un error que dice "function does not exist" en medio de un lote de veinte.
do $$
begin
  if not exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'es_admin') then
    raise exception 'Falta public.es_admin(). Aplicar antes la 016_permisos_coherentes.sql.';
  end if;
  if not exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'tiene_permiso') then
    raise exception 'Falta public.tiene_permiso(). Aplicar antes la 016_permisos_coherentes.sql.';
  end if;
end $$;

-- -------------------------------------------------------------------
-- 1) LAS FUNCIONES DE APOYO
-- -------------------------------------------------------------------
--
-- Y dos funciones nuevas, y no el "JOIN" repetido catorce veces dentro de cada política.
--
-- La razón no es la brevedad. Es que un "JOIN" repetido hay que mantenerlo repetido: el día
-- que se agrega un criterio —"y que el trabajador esté activo", por ejemplo— hay que acordarse
-- de cambiarlo en las veinte políticas, y no se acuerda ninguno.
--
-- Y además el error se ve en un solo lugar.
create or replace function public.puede_ver_trabajador(worker_code text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin(uid)
      or exists (
        select 1
        from public.perfil_empresas pe
        join public.trabajadores t on t.empresa_id = pe.empresa_id
        where pe.user_id = uid
          and t.code = worker_code
      );
$$;

comment on function public.puede_ver_trabajador(text, uuid) is
  'Verdadero si el usuario puede ver a ese trabajador: es administrador, o la empresa del '
  'trabajador está en su perfil_empresas. Es el único lugar donde vive esta regla.';

-- Y la del ARCHIVO, que es distinta porque no hay "code" en la columna: hay que sacarlo del
-- nombre.
--
-- Y el nombre es "<code>/<id de entrega>/<archivo>" —soporte.js:1551 y app.js:3479 lo arman
-- con `${entrega.code}/${entrega.id}`—, así que el código es lo que va antes del primer "/".
--
-- Y se usa "split_part" con "=" y no un "like": un "like" trata "%" y "_" como comodines, y un
-- código de trabajador que los tuviera —no debería, pero la base no lo prohíbe— matchearía
-- cualquier cosa. Ver [rls-02].
create or replace function public.puede_ver_archivo(object_name text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin(uid)
      or exists (
        select 1
        from public.trabajadores t
        join public.perfil_empresas pe on pe.empresa_id = t.empresa_id
        where pe.user_id = uid
          and t.code = split_part(object_name, '/', 1)
      );
$$;

comment on function public.puede_ver_archivo(text, uuid) is
  'Verdadero si el usuario puede ver ese archivo del bucket. El código del trabajador es lo '
  'que va antes del primer "/" del nombre, porque la ruta es "<code>/<entrega>/<archivo>".';

-- -------------------------------------------------------------------
-- 2) LAS CUATRO POLÍTICAS
-- -------------------------------------------------------------------

-- ASISTENCIA. -------------------------------------------------------
drop policy if exists "asistencia rw" on public.asistencia;
create policy "asistencia por empresa" on public.asistencia for all
  using (public.puede_ver_trabajador(asistencia.code))
  with check (public.puede_ver_trabajador(asistencia.code));

comment on policy "asistencia por empresa" on public.asistencia is
  'Reemplaza "asistencia rw", que era "cualquier usuario activo". Ver [rls-01].';

-- MARCAJES. --------------------------------------------------------
drop policy if exists "marcajes rw" on public.marcajes;
create policy "marcajes por empresa" on public.marcajes for all
  using (public.puede_ver_trabajador(marcajes.code))
  with check (public.puede_ver_trabajador(marcajes.code));

comment on policy "marcajes por empresa" on public.marcajes is
  'Reemplaza "marcajes rw", que era "cualquier usuario activo". Ver [rls-01].';

-- TARJETAS. --------------------------------------------------------
-- Y con una diferencia: "tarjetas.code" NO tiene clave foránea a "trabajadores" —a propósito,
-- para poder dejar la tarjeta aunque el trabajador se borre—, así que puede haber tarjetas cuyo
-- código ya no está. Esas quedan para el administrador solo, que es la dirección segura: una
-- credencial que nadie puede leer, nadie puede usar.
drop policy if exists "tarjetas rw" on public.tarjetas;
create policy "tarjetas por empresa" on public.tarjetas for all
  using (public.puede_ver_trabajador(tarjetas.code))
  with check (public.puede_ver_trabajador(tarjetas.code));

comment on policy "tarjetas por empresa" on public.tarjetas is
  'Reemplaza "tarjetas rw", que era "cualquier usuario activo". Las tarjetas cuyo código no '
  'existe en trabajadores quedan solo para el administrador. Ver [rls-03].';

-- EL BUCKET NO ESTÁ AQUÍ. ---------------------------------------------------
--
-- "storage.objects" no se puede tocar desde el editor SQL: no es una tabla del proyecto
-- y su dueño es un rol de Supabase, no el rol con el que corre el editor. Crear una
-- política sobre ella da "42501: must be owner of table objects". Ver [sql-02].
--
-- Está en la 068, que se hace A MANO desde el panel de Storage. Y hay un agujero de
-- seguridad abierto mientras eso no se haga: la política vieja del bucket sigue siendo
-- "cualquier usuario activo" y deja ver las FIRMAS de todas las empresas. Ver [rls-04].
--
--
-- ===================================================================
-- 3) CÓMO SE COMPRUEBA
-- ===================================================================
--
-- La primera consulta tiene que dar CERO filas. Si da alguna, hay una tabla cuya política sigue
-- sin empresa.
--
--     select tablename, policyname, cmd, qual, with_check
--     from pg_policies
--     where schemaname = 'public'
--       and tablename in ('asistencia','marcajes','tarjetas')
--       and qual is not null
--       and qual not like '%empresa%'
--       and qual not like '%puede_ver%'
--     order by tablename;
--
--
-- La segunda es el BACKLOG: las tablas que siguen abiertas. Hoy hay más de diez, y cada una
-- tiene que tener una razón escrita al lado de por qué sigue así.
--
--     select tablename, policyname, cmd, qual
--     from pg_policies
--     where schemaname = 'public'
--       and qual is not null
--       and qual not like '%empresa%'
--       and qual not like '%perfil_empresas%'
--       and qual not like '%puede_ver%'
--     order by tablename;
--
--
-- Y la tercera, la que HAY que correr con la sesión de un usuario de una sola empresa, es la
-- que de verdad importa. Con el cliente del navegador, en la consola:
--
--     // los códigos que la aplicación le está mostrando a este usuario
--     workers.map(w => w.code)
--
--     // y los que la base le devuelve si pregunta directo
--     const r = await supabaseClient.from('marcajes').select('code');
--     [...new Set(r.data.map(x => x.code))]
--
-- Si el segundo lista tiene códigos que el primero no, NO FUNCIONÓ. Y no hay que mirar nada más:
-- ese es el resultado.
--
-- Y la CUARTA es la del BUCKET, y es la que hay que mirar con más calma que las otras
-- tres, porque el RLS de "storage.objects" tiene una regla que las demás tablas no tienen:
--
--     LAS POLÍTICAS SE UNEN CON "O".
--
-- O sea que una política nueva NO acota nada si hay OTRA sobre el mismo bucket que también
-- permita. Agregar la política restrictiva a un bucket que ya tiene una permisiva es no
-- cambiar nada: las dos se quedan y la que abre gana siempre.
--
-- Y en este caso el riesgo es real y no teórico: el panel de Storage de Supabase crea
-- políticas de un clic, quedan ahí para siempre, y ninguna migración las mira —porque las
-- solo revisan las del esquema "public", y "storage" es otro esquema—.
--
--     select policyname, cmd, roles, qual, with_check
--     from pg_policies
--     where schemaname = 'storage' and tablename = 'objects'
--     order by policyname;
--
-- Lo que TIENE que aparecer es una sola política que hable de "epp-respaldos" y use
-- "puede_ver_archivo". Si aparece alguna más sobre ese bucket, hay que quitarla a mano:
-- desde el panel de Storage, o con un "drop policy" escrito.
--
-- Y las que crea Supabase por su cuenta —"Allow public read access" y parecidas— filtran
-- por los buckets con "public = true", y "epp-respaldos" es privado, así que no alcanzan.
-- Pero eso hay que VERLO en la consulta de arriba, y no suponerlo: una suposición sobre
-- quién puede leer las FIRMAS de todas las empresas no es una suposición admisible.
--
-- -------------------------------------------------------------------
-- PARA VOLVER ATRÁS
-- -----------------
--
-- Por si algo queda mal. Esto devuelve las cuatro al estado anterior —"cualquier usuario
-- activo"—, que es peor, y por eso está comentado: deshacer es una decisión, no un accidente.
--
-- drop policy if exists "asistencia por empresa" on public.asistencia;
-- create policy "asistencia rw" on public.asistencia for all
--   using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
--
-- drop policy if exists "marcajes por empresa" on public.marcajes;
-- create policy "marcajes rw" on public.marcajes for all
--   using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
--
-- drop policy if exists "tarjetas por empresa" on public.tarjetas;
-- create policy "tarjetas rw" on public.tarjetas for all
--   using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
--
-- drop policy if exists "epp respaldos por empresa" on storage.objects;
-- create policy "epp respaldos rw" on storage.objects for all
--   using (bucket_id = 'epp-respaldos'
--          and exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
--
-- drop function if exists public.puede_ver_archivo(text, uuid);
-- drop function if exists public.puede_ver_trabajador(text, uuid);
