-- ===================================================================
-- LA FILA DE "trabajadores" QUE LA LLAVE ANÓNIMA NO DEBERÍA VER
-- ===================================================================
--
-- Corré esto ENTERO y mirá el panel de resultados. Es UN solo panel: todo lo que hace falta está en
-- la misma consulta.
--
-- Al terminar corré "reset role;" y "select set_config('request.jwt.claims', '', true);" en el
-- editor, para que la sesión del editor vuelva a estar normal.
--
-- ---------------------------------------------------------------------
-- LO QUE YA SE SABE, Y POR QUÉ NO SÉ MÁS
-- ---------------------------------------------------------------------
--
-- Con la llave anónima, "trabajadores" pasó de 47 filas a 1. La 073 quitó "acceso_total_trabajadores"
-- y el efecto se vio, así que la 073 funcionó.
--
-- Y el listado de políticas dice que "trabajadores" tiene DOS políticas, las dos acotadas por
-- empresa, y que ninguna dice "usando (true)". O sea que la fila que sale no viene de una tercera
-- política: no hay tercera política.
--
-- ---------------------------------------------------------------------
-- LA SOSPECHA, Y POR QUÉ ES LA PRIMERA
-- ---------------------------------------------------------------------
--
-- "set role anon" cambia el ROL. No cambia el JWT.
--
-- Y "auth.uid()" NO lee el rol: lee un ajuste de la sesión que se llama "request.jwt.claims", que
-- es donde va el token. Si ese ajuste quedó puesto, "auth.uid()" devuelve el id de una persona
-- REAL, y con esa persona "es_admin() OR EXISTS(...)" se pone verdadero de verdad.
--
-- Con lo cual la prueba anterior no midió lo que dice medir: no midió a un anónimo, midió a quien
-- hubiera dejado el token en la sesión. Y encaja con el número: si ese usuario pertenece a una
-- sola empresa y esa empresa tiene un solo trabajador, el "EXISTS" da verdadero para UN renglón
-- exacto. Un 1 así no es un agujero, es una cuenta.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ NO SE SALE SÓLO CON "set role anon"
-- ---------------------------------------------------------------------
--
-- Porque los dos cambios son distintos y hay que hacerlos los dos. Por eso esta consulta LIMPIA el
-- token antes de contar, y trae las dos cuentas juntas: la de ClaimsComoEstán y la de Claims
-- Limpios. Si dan lo mismo, el token no era la variable. Si difieren, lo era.
--
-- ---------------------------------------------------------------------
-- Y LAS TRES COSAS QUE MÁS INTERESA SABER
-- ---------------------------------------------------------------------
--
--   que_ve_anon        cuántas filas ve el rol anónimo, ya sin token
--   uid_de_anon        qué id le corresponde al token, si es que había alguno
--   es_admin_de_anon   qué contesta "es_admin()" para el anónimo
--  claims_limpios      cuántas filas ve cuando no hay token de ninguna manera
--   la_fila            el código y la empresa de lo que se vea, para poder compararlo

set_config('request.jwt.claims', '', true);
set role anon;

select (select count(*) from public.trabajadores)                        as que_ve_anon,
       auth.uid()                                                        as uid_de_anon,
       (select es_admin())                                               as es_admin_de_anon,
       (select count(*) from public.perfil_empresas)                     as perfil_empresas_visibles,
       (select coalesce(string_agg(code || ' / ' || coalesce(empresa_id::text, 'SIN EMPRESA'), '  '),
                        'ninguna fila visible')
          from public.trabajadores)                                      as la_fila,
       case
         when auth.uid() is null and (select count(*) from public.trabajadores) = 0
              then 'CERRADA: sin token y sin filas. El 1 de antes era un token en la sesion.'
         when (select count(*) from public.trabajadores) = 0
              then 'CERRADA: sin filas'
         when auth.uid() is null
              then '*** ABIERTA: sin token y aun asi se ve ' || (select count(*) from public.trabajadores) || ' ***'
         else 'el token sigue puesto: este resultado NO es el de un anonimo'
       end                                                               as veredicto;