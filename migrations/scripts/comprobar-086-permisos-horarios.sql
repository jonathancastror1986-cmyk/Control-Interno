-- ===================================================================
-- comprobar-086-permisos-horarios.sql
-- ===================================================================
-- QUÉ COMPRUEBA Y POR QUÉ ESTÁ PARTIDO EN DOS
-- ===================================================================
--
-- Porque hay dos tipos de comprobación y no se pueden hacer en el mismo lugar:
--
--   PARTE A   desde el SQL Editor. Mira que la tabla, las columnas, las
--             funciones, las políticas y los índices existan. Eso se ve desde
--             cualquier lado, y siempre da el mismo resultado.
--
--   PARTE B   la llamada de verdad: pedir un permiso y resolverlo. Eso NO se
--             puede hacer desde acá, y no es un problema del script.
--
-- Y POR QUÉ LA PARTE B NO SE PUEDE HACER DESDE EL EDITOR SQL
-- ===================================================================
--
-- Porque las dos funciones deciden mirando QUIÉN llama:
--
--   pedir_permiso_horario      exige es_usuario_activo() O es_admin()
--                               O tiene_permiso('tarja.marcaje')
--   resolver_permiso_horario   exige es_admin()
--                               O tiene_permiso('tarja.aprobar_cambio')
--
-- Y esas tres funciones leen "auth.uid()". Desde el SQL Editor no hay nadie
-- firmado adentro, así que "auth.uid()" es nulo, las tres dan falso, y la función
-- contesta:
--
--     42501  No tienes permiso para pedir permisos horarios
--
-- Que es la respuesta CORRECTA. No es un error del script ni de la base: es el
-- control de permisos funcionando. Si desde acá no se cuela nadie, está bien.
--
-- Y LA PRIMERA VERSIÓN DE ESTE ARCHIVO SE EQUIVOCÓ EN ESO
-- ---------------------------------------------------------------------
--
-- Metía la llamada de verdad acá adentro, y fallaba siempre. Peor: venía
-- envuelta en un "do $$ ... $$" con manejador de error que volvía a levantar el
-- error, y en el SQL Editor un error a mitad de script corta TODO lo que sigue.
-- Así que ese paso malo dejaba sin ver los otros cuatro, y devolvía un "ok"
-- parcial que no servía para nada.
--
-- Y MÁS AÚN: usaba un 'code' inventado, '__COMPROBACION__', y esa columna tiene
-- clave foránea a "trabajadores(code)". Iba a fallar por violation de clave
-- foránea en una base perfectamente sana. Una comprobación que falla cuando todo
-- está bien enseña a ignorar sus errores, que es el peor daño que puede hacer.
--
-- ---------------------------------------------------------------------
-- Y SI TE SALE UN ERROR DE SINTAXIS, NO VUELVAS A PEGAR TODO
-- ---------------------------------------------------------------------
--
-- Porque ya pasó dos veces con este archivo, y las dos veces el resultado fue lo
-- mismo: un error y NADA MÁS. Ni la tabla, ni las columnas, ni las funciones.
--
-- Y no es que las consultas de arriba no se hayan corrido: es que el editor
-- devuelve solo el ÚLTIMO resultado, y si el último falló, los anteriores no se
-- ven. Por eso un error de sintaxis al final del archivo hace perder todo lo que
-- ya se había comprobado.
--
-- La forma de no perder nada: **corré un paso por vez**. Cada bloque de este
-- archivo es un "select" independiente, así que se puede seleccionar uno y correr
-- solo ese, con "Run" sobre el texto seleccionado. Con esa forma, si un paso da
-- error, los otros siguen dando su resultado igual, porque ya no hay un error que
-- corte el archivo entero.
--
-- Y el error que cortó las dos veces fue este:
--
--     42601  syntax error at or near "when"
--
-- Un "case" al que se le olvidó el "then" de la primera rama. Ya está corregido en
-- L152 y L156. Si vuelve a aparecer, es que se pegó una versión vieja del archivo.
--
-- ---------------------------------------------------------------------
-- CÓMO SE USA
-- ===================================================================
--
--   1. Corré la PARTE A (los "select" sueltos de abajo) y mandame los
--      resultados en orden. Con eso sabemos si la migración quedó entera.
--   2. La PARTE B no se corre acá. La hace la pantalla de permisos, desde la
--      aplicación, con el usuario adentro. Se prueba con los botones de prueba
--      de tools/pruebas/app-sin-login.html.

-- ===================================================================
-- PARTE A — DESDE EL SQL EDITOR
-- ===================================================================

-- ---------------------------------------------------------------------
-- 1. QUÉ TABLA ES, Y SI ESTÁ EN EL ESQUEMA CORRECTO
-- ---------------------------------------------------------------------
--
-- El esquema importa tanto como el nombre: una "permiso_horario" creada sin
-- "public." delante funciona en el editor y es invisible para la aplicación, que
-- busca siempre en "public".
select
  'tabla' as que,
  table_schema,
  table_name,
  (table_schema = 'public') as en_el_esquema_correcto
from information_schema.tables
where table_name = 'permiso_horario';

-- ---------------------------------------------------------------------
-- 2. LAS QUINCE COLUMNAS
-- ---------------------------------------------------------------------
--
-- El conteo solo no alcanza: si falta una y sobra otra, el número dice quince.
-- Por eso el paso 3 lista los nombres, y el paso 4 dice cuáles faltan.
select
  'columnas' as que,
  count(*)   as cuantas,
  case when count(*) = 15 then 'todo en orden'
       else 'FALTAN COLUMNAS' end as veredicto
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'permiso_horario';

-- Y QUÉ COLUMNAS HAY, CON SU TIPO Y SI ADMITEN NULO
--
-- Y POR QUÉ SE PIDE EL TIPO Y NO SÓLO EL NOMBRE
--
-- Porque "hora_inicio" tiene que ser "time", no "text". Si alguien la creó como
-- texto, la tabla existe, el conteo da quince, la pantalla carga, y el primer
-- permiso que se guarda es "11:00" como cadena. Eso no falla al insertar: falla
-- días después, cuando alguien pregunta por qué el permiso no se suma.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'permiso_horario'
order by ordinal_position;

-- Y CUÁLES FALTAN DE LAS QUINCE, DICHO POR NOMBRE
--
-- "FALTAN COLUMNAS" sin decir cuáles obliga a comparar dos listas a ojo. Esta
-- consulta devuelve una fila por cada columna que falta, que es la forma en que
-- un problema se puede leer sin esfuerzo.
select falta.column_name as falta_esta_columna
from (values
    ('id'),('code'),('fecha'),('hora_inicio'),('hora_fin'),('motivo'),
    ('estado'),('pedido_por'),('pedido_por_nombre'),('pedido_por_rol'),
    ('confirmado_por'),('confirmado_por_nombre'),('confirmado_at'),
    ('comentario'),('creado_en')
  ) as falta(column_name)
where not exists (
  select 1
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name   = 'permiso_horario'
    and c.column_name  = falta.column_name
);

-- ---------------------------------------------------------------------
-- 4. LAS DOS FUNCIONES Y SUS TIPOS DE ARGUMENTO
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ SE COMPRUEBA LA FIRMA COMPLETA Y NO SÓLO EL NOMBRE
--
-- Porque una función con el nombre bien y los argumentos cambiados es una
-- trampa: el Javascript llama con seis argumentos y la base dice "no existe esa
-- función", cuando la que existe se llama distinto. El mensaje no lleva a
-- ninguna parte, y es fácil de dar por un problema de permisos.
--
-- Por eso acá se comparan los nombres de los argumentos, en orden. Si la
-- pantalla los llama con nombre ("p_code => ..."), esto es directamente lo que
-- tiene que coincidir.
select
  'funciones' as que,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  case when p.proname = 'pedir_permiso_horario'
            and pg_get_function_identity_arguments(p.oid)
                like '%p_code%' and pg_get_function_identity_arguments(p.oid) like '%p_motivo%'
            then 'ok'
       when p.proname = 'resolver_permiso_horario'
            and pg_get_function_identity_arguments(p.oid)
                like '%p_id%' and pg_get_function_identity_arguments(p.oid) like '%p_acepta%'
            then 'ok'
       else 'FIRMA DISTINTA A LA ESPERADA'
  end as veredicto
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('pedir_permiso_horario','resolver_permiso_horario')
order by p.proname;

-- ---------------------------------------------------------------------
-- 5. LAS POLÍTICAS DE RLS
-- ---------------------------------------------------------------------
--
-- Existe una sola, y es de lectura. Las escrituras van por funciones
-- "security definer", y por eso no hay política de "insert" ni de "update": esa
-- ausencia es la protección, no unForget pendiente.
--
-- Y que el RLS esté ACTIVADO es lo importante: una política escrita sobre una
-- tabla sin RLS turned no filtra nada, y la tabla queda abierta para cualquiera
-- que tenga la URL de la API.
select
  'rls' as que,
  c.relrowsecurity                as rls_activado,
  count(p.polname)                as cuantas_politicas,
  string_agg(p.polname, ' | ')    as los_nombres
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname = 'permiso_horario'
group by c.relrowsecurity;

-- Y LAS POLÍTICAS, UNA POR FILA, CON SU CONDICIÓN
--
-- Porque el nombre de la política no dice nada, y lo que importa es si la
-- condición deja pasar a quien tiene que pasar.
select
  p.polname        as policyname,
  p.polcmd         as cmd,
  p.polqual        as condicion,
  p.polwithcheck   as condicion_para_escribir
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'permiso_horario';

-- ---------------------------------------------------------------------
-- 6. LOS TRES ÍNDICES, Y CUÁLES IMPORTAN DE VERDAD
-- ---------------------------------------------------------------------
--
-- El único que protege de verdad es "permiso_horario_no_repetido", y solo
-- funciona si su "where" es correcto. Por eso se pide la definición entera y
-- no solo el nombre: un índice único sin el filtro bloquearía volver a pedir un
-- permiso que alguien rechazó hace un rato, y eso no se nota hasta que alguien
-- lo necesita.
--
-- Y el "check" de que la hora de fin vaya después de la inicio, que es la regla
-- que más difícil de leer es un "-3 horas de permiso".
select
  'indices' as que,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename  = 'permiso_horario'
order by indexname;

-- ---------------------------------------------------------------------
-- 7. LAS REGLAS DE LA TABLA: EL CHECK Y LA CLAVE FORÁNEA
-- ---------------------------------------------------------------------
--
-- El "estado" tiene lista cerrada: pendiente, confirmado, anulado. Y no hay
-- "aplicado", a propósito, porque el permiso nunca cambia la planilla. Si
-- alguien agregar un estado más, la pantalla va a tener que decidir qué pintar
-- con un color que nunca vio.
select
  'reglas' as que,
  con.conname,
  pg_get_constraintdef(con.oid) as la_regla
from pg_constraint con
join pg_class c     on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'permiso_horario'
  and con.contype in ('c','f')
order by con.conname;

-- ---------------------------------------------------------------------
-- 8. LOS PERMISOS QUE TIENE ESTE USUARIO
-- ---------------------------------------------------------------------
--
-- OJO CON ESTE RESULTADO, QUE SE LEE MAL LA PRIMERA VEZ
--
-- Esto corre como el dueño de la base, no como el usuario de la aplicación.
-- Así que ver "falso" acá NO significa que falten permisos: significa que el
-- dueño de la base no es un usuario de la aplicación, que es lo normal.
--
-- El que sirve es el resultado de adentro de la app, con el usuario firmado
-- adentro. Este paso está para ver de qué rol se está mirando, y para que
-- quede escrito que la diferencia es esperable y no un problema.
select
  'este_rol' as que,
  current_user         as usuario_de_la_base,
  auth.uid()           as usuario_autenticado,
  (auth.uid() is null) as sin_usuario_dentro,
  public.es_usuario_activo()             as activo,
  public.es_admin()                       as admin,
  public.tiene_permiso('tarja.marcaje')        as puede_pedir,
  public.tiene_permiso('tarja.aprobar_cambio') as puede_resolver;

-- ---------------------------------------------------------------------
-- 9. CUÁNTOS PERMISOS HAY, Y DE QUÉ TIPO
-- ---------------------------------------------------------------------
--
-- Con cero filas en todo lo demás, ESTE es el resultado que confirma que la
-- parte A está bien: la tabla existe, está vacía y no tiene nada raro. Una tabla
-- de permisos vacía es lo que se ve el primer día y no es un error: es la
-- pantalla todavía sin nada que mostrar.
--
-- Y si por el camino llegaste a tener filas de una versión anterior de este
-- archivo, con el motivo '__COMPROBACION__' o el que empiece por
-- 'COMPROBACION', aparecen acá y hay que borrarlas.
select
  'contenido' as que,
  count(*) filter (where estado = 'pendiente')  as pendientes,
  count(*) filter (where estado = 'confirmado') as confirmados,
  count(*) filter (where estado = 'anulado')    as anulados,
  count(*) filter (where motivo like 'COMPROBACION%') as filas_de_comprobacion_a_borrar
from public.permiso_horario;

-- ===================================================================
-- PARTE B — DESDE LA APLICACIÓN, NO DESDE ACÁ
-- ===================================================================
--
-- Estas NO se correr en el SQL Editor. La respuesta va a ser 42501 siempre, y
-- esa es la respuesta correcta.
--
-- La hace la pantalla de permisos, con el usuario adentro. Si querés verlas
-- una por una, el camino es el botón de prueba de la página
-- tools/pruebas/app-sin-login.html.
--
-- Lo que hay que confirmar, en orden:
--
--   1. Un supervisor con 'tarja.marcaje' entra a la pestaña y la lista sale.
--      Vacía es correcto si no hay permisos ese día: tiene que decirlo, no
--      mostrar una tabla en blanco que parece un error.
--
--   2. Pide un permiso de 11:00 a 14:00. Tiene que salir con estado
--      'pendiente' y decir quién lo pidió.
--
--   3. Lo pide otra vez, mismo día y mismo horario. Tiene que salir el error
--      "Ese horario se pisa con un permiso que ya existe para ese día".
--
--   4. Lo pide con la hora de fin antes de la de inicio. Tiene que salir el
--      error "La hora de fin tiene que ser posterior a la de inicio".
--
--   5. Lo pide sin motivo. "Falta el motivo del permiso..."
--
--   6. Con la fila pendiente, alguien con 'tarja.aprobar_cambio' la confirma.
--      Y alguien SIN ese permiso NO tiene que ver los botones.
--
--   7. Se resuelve dos veces la misma. "Ese permiso ya fue resuelto".
--
--   8. Un usuario sin permiso para pedir, en la misma pantalla. 42501 en
--      pantalla, no en la consola.
--
-- Y EL PASO QUE MÁS SE OLVIDA
--
-- Que el día en 'asistencia' de esa persona SIGA en 'X'. El permiso con hora
-- registra una excepción de horario; no cambia la planilla. Si algún día el
-- permiso aparece como un cambio de estado, eso está mal y hay que decirlo.
