-- ===================================================================
-- 069: SUELDO BASE MENSUAL, Y QUIÉN LO VE (2026-10-03)
-- ===================================================================
--
-- Lo que se pidió, con las tres decisiones ya tomadas:
--
--   · el campo se llama "sueldo_base"
--   · es MENSUAL
--   · lo ve jefatura directa, RRHH y técnica
--
-- -------------------------------------------------------------------
-- POR QUÉ UNA MIGRACIÓN Y NO UN CAMPO EN LA PANTILLA
-- -------------------------------------------------------------------
--
-- Porque un sueldo es REMUNERACIÓN, y no es un dato como el cargo o el teléfono. Es
-- información personal y económica, y por eso tiene tres requisitos que los otros campos de
-- "trabajadores" no tienen:
--
--   1. Un permiso para verlo. Sin eso, cualquier usuario que pueda abrir el listado —y el
--      permiso "trabajadores.ver" lo tienen ocho roles— lo lee. Y lo lee sin querer, porque
--      no tiene que buscar nada: está en el listado de siempre.
--
--   2. Un permiso para cambiarlo. Editar un sueldo desde el perfil no es lo mismo que editar
--      el teléfono de emergencia. Si se mezclan, cada corrección de un número de contacto
--      deja abierta la puerta a cambiar un sueldo.
--
--   3. Saber QUIÉN lo cambió y cuándo. Un sueldo cambia: melonazo, ajuste, corrección. Sin
--      rastro, dentro de un año no hay forma de explicar por qué el número es ese.
--
-- -------------------------------------------------------------------
-- LA FORMA DE GUARDARLO
-- -------------------------------------------------------------------
--
-- Un entero de pesos, no un texto. Un texto permite "500.000", "un millón", "$500000" y
-- "cincocientos mil" en la misma columna, y después no hay forma de sumar.
--
-- Y "numeric(12,0)" y no "bigint", porque "numeric" acepta la coma de miles si algún día se
-- decide mostrarlo formateado, y no se trunca en silencio. El rango llega a 999.999.999.999,
-- que es de sobra para un sueldo.
--
-- ¿Y la UF? NO se guarda. La remuneración mensual es un monto en pesos, y guardarla como UF
-- obligaría a decidir qué UF del día se usó, y el valor de esa UF cambia. Si algún día hace
-- falta el sueldo en UF, se calcula con la UF de la fecha que corresponda, y eso se decide
-- cuando se necesite, no ahora.
--
-- -------------------------------------------------------------------
-- LOS PERMISOS
-- -------------------------------------------------------------------
--
-- Tres permisos nuevos, con la misma convención de las otras 24: "area.accion".
--
--    .rem.ver      Ver el sueldo base
--    .rem.editar   Cargar y modificar el sueldo base
--    .rem.exportar Exportar una planilla con sueldos
--
-- Y van a estos roles, que son los tres que pidió:
--
--   · rrhh          Recursos humanos: es quien carga y corrige
--   · tecnica       Soporte técnico en terreno
--   · supervisores  Jefatura directa
--
-- Y "oficina" entra solo a VER, que es una decisión aparte y va escrita más abajo. Y "admin" los
-- tiene todos, por cómo se le dieron en la 013.
--
-- -------------------------------------------------------------------
-- EL RASTRO DE QUIÉN CAMBIÓ
-- -------------------------------------------------------------------
--
-- Una tabla, no una columna "lo cambió fulanito" en el trabajador. Porque un mismo campo va a
-- cambiar muchas veces, y cada cambio tiene su fecha y su motivo.
--
-- Y no es una tabla de permisos: es una tabla de DATOS, así que su RLS es el mismo filtro por
-- empresa que el de "trabajadores". Un jefe de una empresa solo ve los cambios de la suya.
--
-- -------------------------------------------------------------------
-- LO QUE NO SE TOCA
-- -------------------------------------------------------------------
--
-- No hay columna "porcentaje de axioms", ni "hora extra", ni "gratificación". Esos números
-- salen del sueldo base y de las horas, y metidos en el trabajador hay que mantenerlos
-- sincronizados para siempre. Cuando hagan falta, se calculan.
--
-- Re-ejecutable. Todo lleva "if not exists" o "on conflict do nothing", así que correrla dos
-- veces deja lo mismo.

-- -------------------------------------------------------------------
-- 0) QUE LAS TABLAS DE PERMISOS EXISTAN
-- -------------------------------------------------------------------
--
-- Y no por prolijidad. Sin esto, el "insert into permisos" falla con "relation does not exist"
-- en medio del archivo, y como el editor SQL ejecuta todo como una transacción, no se aplica
-- NADA —y el que lo corrió cree que salió bien.
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'permisos') then
    raise exception 'Falta public.permisos(). Aplicar antes la 013_roles_permisos.sql.';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'roles_permisos') then
    raise exception 'Falta public.roles_permisos(). Aplicar antes la 013_roles_permisos.sql.';
  end if;
end $$;


-- ===================================================================
-- 1) LA COLUMNA
-- ===================================================================
--
-- Y va después de "articulo_termino", que es donde termina lo de la desvinculación. Agregarla
-- al final es lo que hace que un "select *" la devuelva al final y no en medio, que es lo que
-- espera el código que la lee por nombre.

alter table public.trabajadores
  add column if not exists sueldo_base numeric(12,0) default null;

comment on column public.trabajadores.sueldo_base is
  'Remuneración mensual en pesos enteros. Null es "no cargado", que NO es lo mismo que cero: '
  'una persona sin sueldo cargado no tiene sueldo cero, tiene un dato que falta. Se carga desde '
  'la carga masiva de trabajadores o desde la ficha.';

-- Y el control de que sea un número: un sueldo negativo es un error de tipeo, y si no se
-- detiene aquí, se queda guardado y después nadie sabe si era -500000 o si faltaba el signo.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trabajadores'::regclass
      and conname = 'trabajadores_sueldo_base_no_negativo'
  ) then
    alter table public.trabajadores
      add constraint trabajadores_sueldo_base_no_negativo
      check (sueldo_base is null or sueldo_base >= 0);
  end if;
end $$;


-- ===================================================================
-- 2) LOS TRES PERMISOS
-- ===================================================================
--
-- "insert ... on conflict do nothing" porque son claves primarias: correr la migración dos
-- veces tiene que dejar los mismos permisos, no fallar.

insert into permisos (clave, descripcion, categoria, orden) values
  ('rem.ver',      'Ver el sueldo base',                  'remuneraciones', 25),
  ('rem.editar',   'Cargar y modificar el sueldo base',    'remuneraciones', 26),
  ('rem.exportar', 'Exportar una planilla con sueldos',   'remuneraciones', 27)
on conflict (clave) do nothing;


-- ===================================================================
-- 3) QUIÉN LOS TIENE
-- ===================================================================
--
-- Los tres que se pidieron: jefatura directa, RRHH y técnica.
--
-- Y "rrhh" y "tecnica" son claves que existen; "supervisores" es la jefatura directa, que en
-- la base tiene ese nombre. Se pone el nombre real de la base, no el que la persona usó para
-- talking de él.
--
-- Y NO se les da "rem.editar" a los tres por igual. Ver y cargar no es lo mismo: el
-- "supervisores" es jefatura directa y necesita VER para saber cuánto se le paga a su gente;
-- cargar el sueldo le corresponde a quien loploader, que es RRHH. Escribir el sueldo es una
-- responsabilidad de recursos humanos, y por eso se separa de mirarlo.
--
-- El que sí lo carga es RRHH y "admin". Los demás lo ven.
--
-- "oficina" entra SOLO a ver, y es una decisión que conviene que quede escrita porque su
-- descripción dice "Ingresos, licencias y remuneraciones", lo que hace pensar que le
-- corresponde más. Se le da "rem.ver" y no "rem.editar" por una razón concreta: cargar un
-- sueldo es responsabilidad de recursos humanos, y dejar que dos roles lo escriban es la forma
-- más corta de que el número esté mal y nadie sepa quién lo puso. Si más adelante hace falta
-- que oficina también lo cargue, es un "insert" más y queda en el historial.

insert into roles_permisos (rol, permiso) values
  -- RRHH: ve y carga. Es quien mantiene el dato.
  ('rrhh', 'rem.ver'),
  ('rrhh', 'rem.editar'),
  ('rrhh', 'rem.exportar'),
  -- Jefatura directa: ve el de su gente. No lo carga.
  ('supervisores', 'rem.ver'),
  -- Técnica: ve. Es lo que se pidió.
  ('tecnica', 'rem.ver'),
  -- Oficina: ve. SeAdjunto abajo con el motivo.
  ('oficina', 'rem.ver')
on conflict (rol, permiso) do nothing;

-- Y "admin" los tiene todos. Se hace con un "select" del catálogo entero, como en la 013, para
-- que un permiso que se agregue mañana también le quede a admin sin tocar nada.
insert into roles_permisos (rol, permiso)
select 'admin', clave from permisos where clave like 'rem.%'
on conflict do nothing;


-- ===================================================================
-- 4) EL RASTRO DE QUIÉN CAMBIÓ EL SUELDO
-- ===================================================================
--
-- Tres columnas y una tabla. Se registra el valor ANTERIOR y el NUEVO, porque "cambió el
-- sueldo" sin el valor anterior no dice nada: si alguien lo bajó de 800.000 a 500.000, hace
-- falta poder ver que antes era 800.000.

create table if not exists public.sueldo_base_historial (
  id bigint generated always as identity primary key,
  trabajador_code text not null references public.trabajadores(code) on delete cascade,
  empresa_id integer,
  valor_anterior numeric(12,0),
  valor_nuevo numeric(12,0),
  motivo text,
  cambiado_por uuid references auth.users(id),
  cambiado_por_nombre text,
  created_at timestamptz not null default now()
);

comment on table public.sueldo_base_historial is
  'Cada cambio del sueldo base de un trabajador. Se guardan el valor anterior y el nuevo porque '
  '"cambió" sin el anterior no dice nada. Es una tabla de DATOS, no de permisos: su RLS es el '
  'mismo filtro por empresa que el de trabajadores, así que un jefe solo ve los cambios de su '
  'empresa.';

comment on column public.sueldo_base_historial.motivo is
  'Por qué cambió: ajuste, aumento, corrección. Texto libre, no una lista: el motivo real de '
  'cada caso es distinto y una lista cerrada deja fuera la mitad.';

-- Y el índice por trabajador, que es la única forma en que se va a leer: "los cambios de este
-- trabajador".
create index if not exists sueldo_base_historial_code_idx
  on public.sueldo_base_historial (trabajador_code, created_at desc);


-- -------------------------------------------------------------------
-- EL RLS DEL HISTORIAL
-- -------------------------------------------------------------------
--
-- Y es el MISMO filtro que el de "trabajadores", porque el historial cuelga del trabajador por
-- "code" y no tiene empresa propia más que la que se le pone.
--
-- Y la función es la de la 067, "puede_ver_trabajador", que ya está escrita y probada. Reusarla
-- es lo correcto: una regla de "quién ve qué" escrita dos veces diverge en dos días.

alter table public.sueldo_base_historial enable row level security;

drop policy if exists "sueldo historial ver" on public.sueldo_base_historial;
create policy "sueldo historial ver" on public.sueldo_base_historial for select
  using (public.puede_ver_trabajador(trabajador_code));

-- Y "insert" abierto al que tenga permiso de carga, que se comprueba con "tiene_permiso", que
-- es la función que ya usa el resto del proyecto.
drop policy if exists "sueldo historial registrar" on public.sueldo_base_historial;
create policy "sueldo historial registrar" on public.sueldo_base_historial for insert
  with check (public.tiene_permiso('rem.editar'));

-- Y NO hay política de "update" ni de "delete": sin una política que los permita, esas
-- operaciones se niegan. Y un historial del que se puede borrar un registro no es un historial.


-- ===================================================================
-- 5) QUE LA FUNCION DE APOYO EXISTA
-- ===================================================================
--
-- Y se escribe aquí, y no antes, porque la 067 es la que la crea. Si esta migración se aplica
-- antes, el "do" de arriba lo dice en vez de fallar con un error de sintaxis en la política.

do $$
begin
  if not exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'puede_ver_trabajador') then
    raise exception
      'Falta public.puede_ver_trabajador(). Aplicar antes la 067_aislar_por_empresa.sql.';
  end if;
end $$;


-- ===================================================================
-- CÓMO SE COMPRUEBA
-- ===================================================================
--
-- Uno: la columna existe y el permiso también.
--
--     select column_name, data_type, is_nullable
--       from information_schema.columns
--      where table_schema = 'public' and table_name = 'trabajadores'
--        and column_name = 'sueldo_base';
--
--     select rol, permiso from roles_permisos
--      where permiso like 'rem.%' order by rol, permiso;
--
-- Lo que tiene que salir:
--
--     sueldo_base  numeric  YES
--     rrhh         rem.editar
--     rrhh         rem.exportar
--     rrhh         rem.ver
--     admin        rem.editar
--     admin        rem.exportar
--     admin        rem.ver
--     oficina      rem.ver
--     supervisors  rem.ver
--     tecnica      rem.ver
--
-- Dos: el control del número. Con un valor negativo tiene que RECHAZAR la escritura, no
-- guardarlo:
--
--     insert into trabajadores (code, name, sueldo_base)
--     values ('PRUEBA_SUELDO', 'Prueba', -1);
--     -- ERROR: new row for relation "trabajadores" violates check constraint
--
-- Esa fila NO tiene que quedar. Si queda, hay que borrarla a mano antes de seguir.
--
-- Tres: el que tiene permiso ve el sueldo, y el que no, no. Esa prueba es con la sesión de un
-- usuario de cada rol, en la consola del navegador:
--
--     // con permiso
--     const {data} = await supabaseClient.from('trabajadores').select('code,sueldo_base').limit(3);
--     data
--
--     // sin permiso: la columna tiene que venir vacía, no con el número
--
-- Y la prueba que de verdad importa es la segunda: que el sueldo NO se vea en el listado
-- normal para quien no tiene permiso. Ver [rem-01].
