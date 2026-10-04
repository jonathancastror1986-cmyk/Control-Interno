-- ===================================================================
-- 073: SE CORTA LA POLÍTICA DE "acceso_total_trabajadores" (2026-10-04)
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- EL HALLAZGO
-- ---------------------------------------------------------------------
--
-- "trabajadores" tiene TRES políticas. Dos están bien y una lo abre todo:
--
--     acceso_total_trabajadores        for all
--                                        usando      (true)
--                                        with check  (true)
--
--     trabajadores por empresa read    for select
--                                        usando      (es_admin() OR existe(perfil_empresas
--                                                     unido a trabajadores por empresa_id))
--
--     trabajadores por empresa write   for all
--                                        usando      (es_admin() OR existe(…))
--                                        with check  (es_admin() OR existe(…))
--
-- Las dos últimas las escribió la 014_multi_empresa.sql, en L288 y L299. O sea que "trabajadores"
-- ESTÁ ACOTADA POR EMPRESA DESDE LA MIGRACIÓN 014.
--
-- Y "acceso_total_trabajadores" —con "usando (true)"— deshace las dos. Porque las políticas de
-- PostgreSQL se SUMAN con "or": con tres políticas, una fila se ve si CUALQUIERA de las tres lo
-- permite. Y una que dice "true" lo permite siempre.
--
-- ---------------------------------------------------------------------
-- LO QUE ESO ABRE, EN CONCRETO
-- ---------------------------------------------------------------------
--
-- La llave anónima —que está en el código del navegador y es pública por diseño— lee los 47
-- trabajadores de las 47 empresas. Con nombre, RUT, teléfono, correo, fecha de ingreso y sueldo.
--
-- Medido en el navegador: una consulta a "trabajadores" con la llave anónima y SIN sesión devuelve
-- 47 filas. Las demás tablas de la cadena dan cero sin sesión. Esa diferencia es exactamente esta
-- política: es la única que no pregunta por "auth.uid()".
--
-- Y "con check (true)" además deja ESCRIBIR. O sea que tampoco es solo una fuga de lectura.
--
-- ---------------------------------------------------------------------
-- POR QUÉ NO ESTÁ EN NINGUNA MIGRACIÓN
-- ---------------------------------------------------------------------
--
-- Porque se creó a mano, en el panel de Supabase. No hay ni un archivo del proyecto que la cree, ni
-- uno que la borre, y no hay forma de saber cuándo se hizo.
--
-- Eso tiene una consecuencia concreta: cualquier migración futura que dé por hecho que
-- "trabajadores" está acotada va a estar equivocada. La 067, la 071 y la 072 —las tres—FAI. No
-- aplican por lo que dicen las migraciones, sino por lo que hay en la base.
--
-- ---------------------------------------------------------------------
-- LA SEGUNDA CORRECCIÓN, Y POR QUÉ FALLÓ LA 071
-- ---------------------------------------------------------------------
--
-- "epp_entregas" tiene dos políticas: la de la 071, que está bien, y "epp rw", que es la vieja.
--
-- La 071 borra 'drop policy if exists "epp entregas rw"'. Ese no es el nombre. El nombre es
-- "epp rw", y lo puso la 001_schema.sql L121. O sea que la 071 nunca borró la vieja: la dejó, y
-- la que quedó sin "with check" es la vieja, no la nueva.
--
-- La 071 se ejecutó y dio "Success", y su diagnóstico dio LISTO, porque las dos cosas son ciertas:
-- la política de la 071 está puesta, y la que se llama "epp entregas rw" no está. El nombre que
-- buscaba no era el que existía.
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTA MIGRACIÓN NO ES "DROPEAR Y LISTO"
-- ---------------------------------------------------------------------
--
-- Porque si se borran las tres y queda una sola mala, o si se corre sobre una base donde las dos
-- buenas no existen, la tabla queda SIN políticas: con el RLS prendido, no la lee nadie. Ni un
-- administrador. Y eso no da error, da una pantalla vacía para todos.
--
-- Por eso el "do" del principio NO SE APLICA si las dos políticas buenas de "trabajadores" no
-- están: en ese caso hay que revisar a mano, no seguir.
--
-- Y por eso se dejan las dos buenas como estaban y se quita solo la que abre. Es el cambio más
-- pequeño que arregla el problema, y el único que se puede deshacer.
--
-- ---------------------------------------------------------------------
-- CÓMO SE COMPRUEBA
-- ---------------------------------------------------------------------
--
-- Uno: correr "migrations/diagnostico-trabajadores.sql". Tiene que quedar LISTO en las dos
-- políticas de "trabajadores", y solo una en "epp_entregas".
--
-- Dos: con la llave ANÓNIMA, en el navegador, "trabajadores" tiene que dar CERO filas. Antes daba
-- 47. Ese es el número que hay que mirar, porque es el que cambia.
--
--     const r = await supabaseClient.from('trabajadores').select('code');
--     r.data.length    →  0
--
-- Y con eso NO se puede probar que el filtro por empresa funciona, porque sin sesión no hay
-- "auth.uid()" y no hay nada que filtrar. Eso se prueba con la sesión de un usuario de verdad:
--
--     // un usuario de UNA empresa tiene que ver SOLO los de esa empresa
--     const r = await supabaseClient.from('trabajadores').select('code,empresa_id');
--     [...new Set(r.data.map(x => x.empresa_id))]     →  debería dar una sola
--
-- Tres: entrar a la aplicación y cargar una lista de trabajadores. Si aparece vacía, algo se
-- rompió: lo más probable es que el usuario no tenga empresas en "perfil_empresas".
--
-- ---------------------------------------------------------------------
-- Y SI ALGUIEN NECESITA VER TODAS LAS EMPRESAS
-- ---------------------------------------------------------------------
--
-- Para eso está "es_admin()", que las dos políticas buenas ya contemplan. Un usuario con rol
-- "admin" ve todo, sin necesidad de esta política.
--
-- Y si hay una pantalla que necesita ver todos los trabajadores LEGÍTIMAMENTE —un informe de la
-- casa, una Consolidation—, esa pantalla tiene que pasar por una función con "security definer"
-- que verifique el permiso en el servidor. No con una política que dice "true": eso no es un
-- permiso, es no tener permiso. Ver [rls-01] y [rls-07].

-- -------------------------------------------------------------------
-- 0) QUE NO SE DEJE LA TABLA SIN NADA QUE LA ABRA
-- -------------------------------------------------------------------
--
-- Y esto va PRIMERO, antes de borrar nada, porque el editor SQL ejecuta todo como una transacción:
-- si algo falla después, no se aplicó nada. Y al revés también: si esto falla, no se borra ninguna
-- política, que es lo que hay que asegurar.
do $$
declare
  v_read  int;
  v_write int;
begin
  select count(*) into v_read  from pg_policies
   where schemaname = 'public' and tablename = 'trabajadores'
     and policyname = 'trabajadores por empresa read';
  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename = 'trabajadores'
     and policyname = 'trabajadores por empresa write';

  if v_read = 0 or v_write = 0 then
    raise exception
      'Falta la política correcta de "trabajadores" (read=% v_write=%). Si se borra "acceso_total_trabajadores" sin ellas, la tabla queda SIN políticas y no la lee nadie, ni un administrador. Revisar a mano. Se va a abortar.', v_read, v_write;
  end if;
end $$;


-- ===================================================================
-- 1) LA QUE ABRE TODO
-- ===================================================================

-- Y NO se pone un "drop policy if exists" nuevo con el nombre viejo: esta política no tiene
-- "--" y no la creó ninguna migración, así que no hay nombre viejo que borrar. Se borra por su
-- nombre, y es idempotente.
drop policy if exists "acceso_total_trabajadores" on public.trabajadores;

comment on policy "trabajadores por empresa read" on public.trabajadores is
  'Acota la lectura por empresa: el administrador ve todo, y el resto ve los trabajadores de las '
  'empresas de su "perfil_empresas". Esta política existía desde la 014 y estaba anulada por otra '
  'que decía "usando (true)", creada a mano y que ninguna migración borraba. Ver [rls-08].';


-- ===================================================================
-- 2) LA VIEJA DE "epp_entregas", CON SU NOMBRE REAL
-- ===================================================================

drop policy if exists "epp rw" on public.epp_entregas;

-- Y se deja la de la 071 como estaba. Con esto queda UNA sola política en "epp_entregas": la que
-- llama a "puede_ver_trabajador", con "with check" incluido.


-- ===================================================================
-- 3) QUE EL RLS SIGA PRENDIDO
-- ===================================================================

alter table public.trabajadores  enable row level security;
alter table public.epp_entregas enable row level security;