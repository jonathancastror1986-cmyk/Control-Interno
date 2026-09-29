-- ===================================================================
-- PROBAR LAS FUNCIONES DE LA 046 Y LA 047
-- ===================================================================
--
-- Pégala entera en el editor de SQL de Supabase y dale Run.
--
-- -------------------------------------------------------------------
-- POR QUÉ ESTA CONSULTA
-- ---------------------
-- Que la migración se aplique sin error NO dice que las funciones corran. Se
-- aplican, crean el texto, y PostgreSQL lo acepta aunque adentro haya un
-- problema. La 046 se aplicó limpia y aun así la función devolvió
-- "relation does not exist" al invocarla.
--
-- Esta consulta invoca cada función y separa dos resultados MUY distintos:
--
--   "sin permiso"  -> BIEN. La función corrió, llegó hasta la comprobación de
--                     permiso y la rechazó. Desde el editor de SQL no hay
--                     sesión iniciada, así que auth.uid() es nulo y TODO tiene
--                     que dar "sin permiso". Cualquier otra respuesta es un
--                     error real.
--
--   otro mensaje   -> MAL. Y el mensaje dice qué.
--
-- Por eso van en bloques DO con su propio manejador de excepción: si una
-- falla, las demás se prueban igual. Con SELECT sueltos se corta todo en la
-- primera.
-- ===================================================================

-- ===================================================================
-- 1) LOS DIAGNÓSTICOS: DICEN QUÉ FALTA, SI ALGO FALTA
-- ===================================================================
select * from public.diagnostico_ingresos_pendientes();
select * from public.diagnostico_amonestaciones();

-- El límite de una empresa sin configurar: tiene que dar 5
select public.limite_amonestacion(null) as limite_sin_configurar;

-- ===================================================================
-- 2) LAS PUERTAS, UNA POR UNA
-- ===================================================================
do $$
declare
  r text;
begin
  -- Cada bloque dice qué función es y qué pasó. "sin permiso" es lo esperado.

  begin
    perform public.pedir_ingreso('Prueba Nombre','11111111-9','+56900000000');
    r := 'CORRIÓ (no debería: el editor no tiene sesión)';
  exception when others then r := 'sin permiso: ' || sqlerrm;
  end;
  raise notice 'pedir_ingreso ..................... %', r;

  begin
    perform public.registrar_amonestacion('0001','Prueba de amonestación, con motivo suficiente');
    r := 'CORRIÓ (no debería: el editor no tiene sesión)';
  exception when others then r := 'sin permiso: ' || sqlerrm;
  end;
  raise notice 'registrar_amonestacion ........... %', r;

  begin
    perform public.archivar_amonestacion(gen_random_uuid(),'Motivo de prueba del archivo');
    r := 'CORRIÓ (no debería)';
  exception when others then r := 'sin permiso: ' || sqlerrm;
  end;
  raise notice 'archivar_amonestacion ............ %', r;

  -- Estas dos solo leen, no piden permiso para ver: tienen que devolver sin
  -- error. Si devuelven 0 filas está bien, significa que no hay nada todavía.
  begin
    perform count(*) from public.ver_ingresos_pendientes();
    r := 'leyó la cola de ingresos';
  exception when others then r := 'ERROR: ' || sqlerrm;
  end;
  raise notice 'ver_ingresos_pendientes .......... %', r;

  begin
    perform count(*) from public.ver_amonestaciones('0001');
    r := 'leyó las amonestaciones';
  exception when others then r := 'ERROR: ' || sqlerrm;
  end;
  raise notice 'ver_amonestaciones ............... %', r;

  begin
    perform public.corregir_ingreso_pendiente(gen_random_uuid(),'Otro nombre');
    r := 'CORRIÓ (no debería)';
  exception when others then r := 'sin permiso: ' || sqlerrm;
  end;
  raise notice 'corregir_ingreso_pendiente ....... %', r;

  begin
    perform public.rechazar_ingreso_pendiente(gen_random_uuid(),'Motivo de prueba del rechazo');
    r := 'CORRIÓ (no debería)';
  exception when others then r := 'sin permiso: ' || sqlerrm;
  end;
  raise notice 'rechazar_ingreso_pendiente ....... %', r;
end $$;

-- ===================================================================
-- 3) LO QUE HAY QUE LEER
-- ===================================================================
--
-- Las líneas que empiezan con NOTICE salen en el panel de abajo.
--
--   "sin permiso: No tienes permiso para ..."
--        -> la función CORRIÓ. Eso es lo que tiene que pasar desde el editor.
--
--   "sin permiso: relation \"profiles\" does not exist"
--        -> la función tiene un error de verdad. Y es el que se venía
--           persiguiendo: no era PGlite, era mío.
--
--   "sin permiso: function ... does not exist"
--        -> falta crearla: la migración se aplicó a medias.
--
-- En el punto 1, los diagnósticos tienen que salir con todas las columnas en
-- true, menos empresas_con_limite, que va en 0 y está bien: nadie ha
-- configurado ningún límite todavía, y por eso vale 5.
--
-- En el punto 2, limite_sin_configurar tiene que dar 5.
-- ===================================================================
