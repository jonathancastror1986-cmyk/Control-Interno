-- ===================================================================
-- COMPROBAR 084_campos_del_contrato.sql
-- ===================================================================
--
-- QUE SE CORRE A MANO, DESPUES DE APLICAR LA MIGRACION
--
-- Y POR QUE ESTA SEPARADA Y NO ESTA AL FINAL DE LA MIGRACION
--
-- Porque una migracion que termina en DDL se puede volver a correr sin riesgo, y
-- una que termina en un "select" se corre entera cada vez. Este guion es solo de
-- lectura: se puede ejecutar las veces que haga falta.
--
-- Y ES UNA SOLA CONSULTA, PORQUE NO HAY BASE LOCAL
--
-- Todo lo que se necesita saber de la base se pregunta desde el panel. Y si son
-- varias preguntas, se responden en una: pegar una sola vez es mejor que pegar
-- cuatro y esperar cuatro viajes de ida y vuelta.
--
--
-- ---------------------------------------------------------------------
-- LA REGLA QUE HACE QUE ESTO NO FALLE
-- ---------------------------------------------------------------------
--
-- Cada rama de este "union" termina con "cast(... as text)".
--
-- Y NO ES POR ESTILO. Es porque la primera versión de este guion no lo tenía, y
-- falló:
--
--     ERROR: 42804: UNION types text and bigint cannot be matched
--
-- Porque "count(*)" en Postgres es "bigint", no un número de texto, y las otras
-- ramas devolvían palabras. Postgres no perdona la mezcla: la rechaza entera, y
-- no dice en qué renglón del guion está el problema, ni cuál de las dos ramas es
-- la que está mal. Solo dice "text" y "bigint".
--
-- Y ESO NO SE PUDO VER ANTES DE PEGARLO
--
-- Porque no hay Postgres local: ni "psql", ni Docker. Un error de tipos solo
-- existe cuando Postgres lee el guion, y ese es el único momento en que no se
-- tiene a mano.
--
-- Y NO SE HIZO UN GUARDIÁN PARA ESTO
--
-- Se intentó, y se borró. Marcaba como sospechoso cualquier "count(*)" dentro de
-- un "case when ... = 0" —que es una comparación— y "select 'de ' || count(*)",
-- que Postgres resuelve a texto solo. Daba falsos positivos en este mismo guion,
-- que ya estaba bien.
--
-- Un guardián que reporta lo que no entiende se termina ignorando, y después no
-- sirve para nada. Ver [sql-03].
--
--
-- ---------------------------------------------------------------------
-- QUE TIENE QUE DECIR ESTA CONSULTA
-- ---------------------------------------------------------------------
--
-- 1. QUE LAS NUEVE COLUMNAS ESTAN. Si falta una, "dbToWorker" y "workerToDb"
--    van a leer y escribir una columna que no existe, y el "select" de
--    trabajadores falla entero: no aparece ninguna ficha.
--
-- 2. QUE LAS DE ANTES SIGUEN ESTAN. Que falte una de esas seria peor.
--
-- 3. QUE LAS REGLAS ESTAN PUESTAS. Si "contrato_tipo_plazo" acepta cualquier
--    texto, se puede guardar "cualquier cosa" y el papel imprime eso.
--
-- 4. CUANTAS FICHAS TIENEN EL DATO. Y el dato que decide si esto sirve o no esta
--    al final: las columnas vacias no rompen nada, rompen la promesa. Si se dice
--    "el contrato se arma solo" y las fichas estan sin fecha de nacimiento, el
--    contrato sale con el marcador adentro, que es peor que un campo que no
--    existe porque se ve.

with nuevas(clave) as (
  values ('fecha_nac'), ('estado_civil'), ('nacionalidad'), ('profesion'), ('comuna'),
         ('contrato_tipo_plazo'), ('contrato_plazo_dias'),
         ('contrato_fecha_inicio'), ('contrato_fecha_hasta')
),
viejas(clave) as (
  values ('code'), ('name'), ('cargo'), ('phone'), ('rut'), ('fecha_ingreso'),
         ('tipo_trabajador'), ('nombres'), ('apellido_paterno'), ('apellido_materno'),
         ('direccion'), ('correo'), ('afp_codigo'), ('afp_nombre'), ('is_supervisor'),
         ('supervisor_code'), ('foto_casual_url'), ('foto_seguridad_url'),
         ('emerg_nombre'), ('emerg_telefono'), ('emerg_relacion'),
         ('salud_notas'), ('medicamentos'), ('precauciones'),
         ('alerta_social'), ('alerta_social_nota'),
         ('alerta_prevencion'), ('alerta_prevencion_nota'),
         ('indicaciones_sociales'), ('indicaciones_prevencion'),
         ('status'), ('fecha_desvinculacion'), ('fecha_termino'), ('articulo_termino'),
         ('especialidad_clave'), ('motivo_desvinculacion'),
         ('desvinculado_por_nombre'), ('sueldo_base'), ('empresa_id'),
         ('centro_costo_id')
)
select
  cast('--- 1. LAS NUEVE, UNA POR RENGLON ---' as text)   as seccion,
  cast(n.clave as text)                                   as columna,
  cast(case
    when c.column_name is null
      then '*** NO ESTA: la migracion 084 no esta aplicada'
    else 'ok  ' || c.data_type
  end as text)                                            as resultado
from nuevas n
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = 'trabajadores'
 and c.column_name = n.clave
union all
select
  cast('--- 2. LAS DE ANTES: SOLO LAS QUE FALTAN ---' as text),
  cast(v.clave as text),
  cast(case when c.column_name is null then '*** FALTA UNA QUE EXISTIA' else 'ok' end as text)
from viejas v
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = 'trabajadores'
 and c.column_name = v.clave
where c.column_name is null
union all
select
  cast('--- 3. LAS REGLAS ---' as text),
  cast(cn.conname as text),
  cast('ok  puesta' as text)
from pg_constraint cn
where cn.conrelid = 'public.trabajadores'::regclass
  and cn.conname in ('trabajadores_contrato_tipo_plazo_chk',
                     'trabajadores_contrato_plazo_dias_chk')
union all
select
  cast('--- 4. CUANTAS FICHAS TIENEN EL DATO ---' as text),
  cast('fecha de nacimiento' as text),
  cast(case
    when (select count(*) from public.trabajadores where fecha_nac is not null) = 0
      then '*** NINGUNA tiene fecha de nacimiento: hay que pedirlas antes de armar el contrato'
    else cast((select count(*) from public.trabajadores where fecha_nac is not null) as text)
         || ' de ' || cast((select count(*) from public.trabajadores) as text)
         || ' fichas'
  end as text)
union all
select
  cast('--- 4. CUANTAS FICHAS TIENEN EL DATO ---' as text),
  cast('estado civil' as text),
  cast(case
    when (select count(*) from public.trabajadores where estado_civil is not null) = 0
      then '*** NINGUNA tiene estado civil'
    else cast((select count(*) from public.trabajadores where estado_civil is not null) as text)
         || ' de ' || cast((select count(*) from public.trabajadores) as text)
  end as text)
union all
select
  cast('--- 4. CUANTAS FICHAS TIENEN EL DATO ---' as text),
  cast('tipo de plazo' as text),
  cast(case
    when (select count(*) from public.trabajadores where contrato_tipo_plazo is not null) = 0
      then '*** NINGUNA tiene plazo: el contrato sale con el marcador adentro'
    else cast((select count(*) from public.trabajadores where contrato_tipo_plazo is not null) as text)
         || ' de ' || cast((select count(*) from public.trabajadores) as text)
  end as text)
union all
select
  cast('--- 5. LAS QUE ESTAN A MEDIAS ---' as text),
  cast('tipo de plazo pero sin su fecha o sus dias' as text),
  cast((select count(*) from public.trabajadores
          where contrato_tipo_plazo = 'fecha' and contrato_fecha_hasta is null)
     + (select count(*) from public.trabajadores
          where contrato_tipo_plazo = 'dias'  and contrato_plazo_dias is null) as text)
union all
select
  cast('--- 5. Y CUANTAS TIENEN EMPRESA ---' as text),
  cast('empresa_id en NULL' as text),
  cast(case
    when (select count(*) from public.trabajadores where empresa_id is null) = 0
      then 'ok  todas tienen empresa: la huella se puede guardar'
    else '*** ' || cast((select count(*) from public.trabajadores where empresa_id is null) as text)
         || ' de ' || cast((select count(*) from public.trabajadores) as text)
         || ' fichas SIN empresa: la huella NO se guarda en esas'
  end as text)
order by 1, 2;