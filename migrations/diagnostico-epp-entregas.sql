-- ===================================================================
-- ¿QUÉ POLÍTICAS TIENE "epp_entregas" AHORA MISMO?
-- ===================================================================
--
-- Y es lo primero que hay que correr, antes de arreglar cualquier archivo.
--
-- La 071 falló en la segunda corrida con "policy already exists". El "drop" de la política
-- vieja corrió ANTES de que el "create" fallara, y eso deja dos posibilidades:
--
--   · el editor SQL usa transacción y revirtió el "drop"  ->  todo sigue como estaba
--   · el editor NO usa transacción                          ->  la tabla quedó SIN políticas
--
-- Y la segunda es un problema serio: con el RLS prendido y sin ninguna política, la tabla no
-- la lee nadie. Ni siquiera un administrador. La pantalla de EPP se vería vacía para todos.
--
-- ---------------------------------------------------------------------
-- LA CONSULTA
-- ---------------------------------------------------------------------
--
-- Y es un veredicto en una fila, porque con las políticas a la vista hay que compararlas a
-- mano con la lista de lo que debería haber, y ese es trabajo de quien lee.

select case
  when (select count(*) from pg_policies
         where schemaname='public' and tablename='epp_entregas') = 0
    then '*** SIN POLÍTICAS: la tabla no la lee nadie. Hay que crear la de la 071 YA. ***'
  when (select count(*) from pg_policies
         where schemaname='public' and tablename='epp_entregas'
           and policyname='epp entregas por empresa') = 1
    then 'LISTO. La política correcta está puesta y la vieja ya no está.'
  when (select count(*) from pg_policies
         where schemaname='public' and tablename='epp_entregas') > 1
    then '*** HAY MÁS DE UNA: la vieja sigue puesta y las dos se suman con "o". ***'
  else '*** HAY UNA PERO NO ES LA DE LA 071. Ver el detalle de abajo. ***'
end as veredicto;

-- Y el detalle, que siempre va después del veredicto.

select policyname,
       cmd,
       coalesce(qual, '(sin condición)')      as usando,
       coalesce(with_check, '(sin condición)') as al_escribir
  from pg_policies
 where schemaname='public' and tablename='epp_entregas'
 order by policyname;

-- Y si el RLS está prendido, que es lo que hace que todo esto sirva de algo.
--
-- Un detalle que parece obvio y no lo es: "alter table ... enable row level security" en la
-- 071 CORRIÓ en la primera aplicación, y en la segunda no llegó a correr porque el editor la
-- cortó en el error. O sea que debería estar prendido. Se confirma.

select relname as tabla,
       relrowsecurity as rls_prendido,
       relforcerowsecurity as rls_forzado
  from pg_class
 where relname='epp_entregas';

-- ---------------------------------------------------------------------
-- LO QUE HAY QUE HACER CON CADA RESPUESTA
-- ---------------------------------------------------------------------
--
--   "SIN POLÍTICAS" -> correr la 071 completa. El "do" del principio pasa porque
--      "puede_ver_trabajador" ya existe de la 067, y el "drop" no encuentra nada para borrar,
--      y el "create" la crea. Queda bien.
--
--   "LISTO" -> no hay nada que hacer. La segunda corrida no rompió nada.
--
--   "MÁS DE UNA" -> hay que borrar la vieja a mano:
--
--      drop policy if exists "epp entregas rw" on public.epp_entregas;
--
--   "UNA PERO NO ES LA DE LA 071" -> mirar el detalle y ver cuál es. Casi seguro es la vieja,
--      y en ese caso la 071 se corrió a medias.
--
-- Y "el detalle" también sirve para lo otro: si "usando" trae
-- "exists (select 1 from perfiles p ...)" sinmentionar "puede_ver_trabajador", es la VIEJA y
-- hay que borrarla.
