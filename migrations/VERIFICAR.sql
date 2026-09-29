-- ===================================================================
-- VERIFICAR
-- ===================================================================
--
-- Pegá esto en el editor de Supabase y apretá Run. Devuelve una fila por
-- comprobación, con un veredicto en castellano.
--
--
-- POR QUÉ EXISTE
-- -------------
-- Hasta ahora cada vez que algo falló hubo que averiguarlo a posteriori: el
-- síntoma era un error de JavaScript que no decía nada de la causa, y la
-- causa estaba tres pasos más atrás. "Cannot set properties of null" puede
-- ser cuatro cosas distintas. "El token no sirve" puede ser cinco.
--
-- Esto da el estado real en un solo SELECT, y lo dice con el nombre de lo
-- que falta. Para que no haya que adivinar nunca más.
--
--
-- CÓMO LEERLO
-- -----------
--   BIEN       está
--   FALTA      no está, y hay que aplicar la migración que dice
--
-- No hace falta saber SQL. Lo que importa es que no haya filas en rojo.
--
--
-- QUÉ NECESITA PARA PODER CORRERSE
-- ---------------------------------
-- Al menos la 025 aplicada. Lee el catálogo de permisos (013) y la lista de
-- roles válidos (025), que es la que dice si un rol se puede asignar.
--
-- Con menos que eso este archivo tira un error de "la función no existe", y
-- un diagnóstico que falla justo cuando más se lo necesita no sirve de
-- nada. Por eso el requisito se dice acá y no se esconde: si esto no corre,
-- el problema es que faltan migraciones, que es lo mismo que informa el
-- resto del archivo.
--
--
-- ESTE ARCHIVO NO ES UNA MIGRACIÓN
-- -------------------------------
-- No se aplica, se lee. Está fuera de la numeración a propósito, así que
-- el que las corre en orden no lo toma por error: se llama VERIFICAR.sql y
-- no empieza con un número.

with
-- ------------------------------------------------------------------
-- LAS TABLAS QUE TIENE QUE HABER PARA QUE EL TOKEN FUNCIONE
-- ------------------------------------------------------------------
tablas as (
  select * from (values
    ('relojes',                    '030_relojes_totem.sql'),
    ('centros_costo',              '030_relojes_totem.sql'),
    ('marcajes',                   '030_relojes_totem.sql'),
    ('roles_sistema',              '013_roles_permisos.sql'),
    ('permisos',                   '013_roles_permisos.sql'),
    ('roles_permisos',             '013_roles_permisos.sql')
  ) as t(nombre, migracion)
),

-- ------------------------------------------------------------------
-- LAS FUNCIONES
-- ------------------------------------------------------------------
funciones as (
  select * from (values
    ('rotar_token_reloj(text)',                        '030_relojes_totem.sql',  'genera el token de un reloj y lo devuelve una vez'),
    ('marcar_por_reloj(text,text,text,integer)',       '030_relojes_totem.sql',  'el reloj registra la marcación'),
    ('hash_token(text)',                               '030_relojes_totem.sql',  'el hash con el que se guarda el token'),
    ('generar_pin_reloj(text)',                        '033_reloj_kiosco.sql',   'el candado para salir del kiosco'),
    ('verificar_pin_reloj(text,text)',                 '033_reloj_kiosco.sql',   'comprueba el candado'),
    ('comprobar_token_reloj(text,text)',               '036_comprobar_token_reloj.sql', 'dice si un token es de un reloj, sin marcar'),
    ('importar_marcajes_offline(text,text,text,text,jsonb)', '035_marcajes_offline_csv.sql', 'el CSV cuando el reloj no tiene señal')
  ) as t(signature, migracion, para_que_sirve)
),

-- ------------------------------------------------------------------
-- LAS COLUMNAS QUE SE USAN EN EL CÓDIGO
-- ------------------------------------------------------------------
columnas as (
  select * from (values
    ('relojes', 'token_hash',        '030_relojes_totem.sql'),
    ('relojes', 'kiosco_activo',     '033_reloj_kiosco.sql'),
    ('relojes', 'kiosco_pulsaciones','033_reloj_kiosco.sql'),
    ('relojes', 'hash_pin',          '033_reloj_kiosco.sql'),
    ('marcajes', 'origen',           '030_relojes_totem.sql'),
    ('marcajes', 'reloj_id',         '030_relojes_totem.sql')
  ) as t(la_tabla, la_columna, migracion)
),

-- ------------------------------------------------------------------
-- LOS PERMISOS DEL CATÁLOGO
-- ------------------------------------------------------------------
permisos_necesarios as (
  select * from (values
    ('relojes.ver'),
    ('relojes.editar'),
    ('relojes.marcaje')
  ) as p(clave)
)

-- ------------------------------------------------------------------
-- EL RESULTADO, TODO JUNTO
-- ------------------------------------------------------------------
select * from (

  -- 1) Las tablas
  select
    'tabla'          as tipo,
    t.nombre         as que,
    t.migracion      as donde,
    case when to_regclass('public.' || t.nombre) is not null
         then 'BIEN' else 'FALTA' end
    || case when to_regclass('public.' || t.nombre) is not null
             then '  — ' || t.nombre
             else '  — creá ' || t.nombre || ' con ' || t.migracion end
    as veredicto,
    1 as orden
  from tablas t

  union all
  -- 2) Las funciones
  select
    'funcion',
    f.signature,
    f.migracion,
    case when to_regprocedure('public.' || f.signature) is not null
         then 'BIEN  — ' || f.para_que_sirve
         else 'FALTA  — ' || f.para_que_sirve || ' (aplicá ' || f.migracion || ')' end,
    2
  from funciones f

  union all
  -- 3) Las columnas
  select
    'columna',
    c.la_tabla || '.' || c.la_columna,
    c.migracion,
    case
      when to_regclass('public.' || c.la_tabla) is null
        then '------  — la tabla ' || c.la_tabla || ' no está; aplicala primero'
      when exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name   = c.la_tabla
           and column_name  = c.la_columna)
        then 'BIEN'
      else 'FALTA  — agregala con ' || c.migracion
    end,
    3
  from columnas c

  union all
  -- 4) Los permisos del catálogo
  select
    'permiso',
    p.clave,
    '013_roles_permisos.sql',
    case when exists (select 1 from public.permisos where clave = p.clave)
         then 'BIEN'
         else 'FALTA  — no está en el catálogo; aplicala con 013_roles_permisos.sql' end,
    4
  from permisos_necesarios p

  union all
  -- 5) El rol reloj, que es el que permite tener la cuenta del aparato.
  --    Es lo último y lo más importante: sin esto se puede crear el reloj
  --    y el token, pero no hay usuario que lo use.
  select
    'rol',
    'reloj',
    '037_rol_reloj_asignable.sql',
    case
      when to_regprocedure('public.roles_validos_array()') is null
        then 'FALTA  — ni siquiera existe la lista de roles válidos (aplicá 025_roles_invalidos.sql)'
      when not exists (select 1 from public.roles_sistema where rol = 'reloj')
        then 'FALTA  — el rol reloj no existe en el catálogo (aplicá 033)'
      when not ('reloj' = any (public.roles_validos_array()))
        then 'FALTA  — el rol reloj existe pero NO se puede asignar a nadie (aplicá 037)'
      else 'BIEN  — se puede crear la cuenta del reloj'
    end,
    5

  union all
  -- 6) El resumen, que es lo que se lee de un vistazo
  -- Cada comprobacion lleva su nombre, para que el resumen diga cual
  -- falta y no haya que buscarlo en toda la lista.
  --
  -- La lista esta aca, UNA sola vez, y la sentencia de arriba no tiene la
  -- suya. Antes la llevaba, y por eso el resumen podia decir "no hay rojo"
  -- con un FALTA justo arriba: su lista no incluia el rol reloj, que es la
  -- comprobacion MAS IMPORTANTE (sin la fila del rol en el catalogo no se
  -- puede crear la cuenta del aparato, y el reloj no tiene con quien
  -- marcar).
  --
  -- Con una sola lista no puede volver a pasar: el resumen arma su
  -- veredicto con el mismo conteo que las filas de arriba. Y si manana se
  -- agrega una comprobacion, se agrega en un solo lugar.
  select
    'RESUMEN',
    case when fallos = 0 then 'todo lo de arriba' else 'fallan: ' || faltan end,
    '',
    case when fallos = 0
         then 'BIEN  — no hay rojo: el reloj debería poder marcar'
         else 'FALTA  — ' || fallos || ' comprobacion(es) en rojo: ' || faltan
    end,
    99
  from (
    select count(*)::int as fallos,
           coalesce(string_agg(nombre, ', '), '') as faltan
      from (
        select 'las tablas' as nombre,
               case when to_regclass('public.' || nombre) is null then 1 end as f
          from tablas
        union all
        select 'las funciones',
               case when to_regprocedure('public.' || signature) is null then 1 end
          from funciones
        union all
        select 'las columnas',
               case when not exists (
                 select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name = la_tabla
                    and column_name = la_columna
               ) then 1 end
          from columnas
        union all
        select 'los permisos',
               case when not exists (
                 select 1 from public.permisos
                  where clave = permisos_necesarios.clave
               ) then 1 end
          from permisos_necesarios
        union all
        select 'el rol reloj',
               case when (
                 not exists (select 1 from public.roles_sistema where rol = 'reloj')
                 or not ('reloj' = any (public.roles_validos_array()))
                 or not exists (
                   select 1 from public.roles_permisos
                    where rol = 'reloj' and permiso = 'relojes.marcaje')
               ) then 1 end
      ) c
     where c.f = 1
  ) f

) z
order by z.orden, z.que;
