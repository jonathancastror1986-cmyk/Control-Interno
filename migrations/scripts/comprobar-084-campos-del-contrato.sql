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
-- QUE TIENE QUE DECIR ESTA CONSULTA
--
-- 1. QUE LAS NUEVE COLUMNAS ESTAN. Si falta una, "dbToWorker" y "workerToDb"
--    van a leer y escribir una columna que no existe, y el "select" de
--    trabajadores falla entero: no aparece ninguna ficha.
--
-- 2. QUE LAS 39 DE ANTES SIGUEN ESTAN. Que falte una de esas seria peor.
--
-- 3. QUE LAS REGLAS ESTAN PUESTAS. Si "contrato_tipo_plazo" acepta cualquier
--    texto, se puede guardar "cualquier cosa" y el papel imprime eso.
--
-- 4. CUANTAS FICHAS TIENEN EL PLAZO PUESTO Y CUANTAS NO. Para saber si el dato
--    hay que pedirlo o no hace falta: si las 153 estan en cero, la columna nueva
--    no sirve de nada hasta que alguien la llene, y eso hay que saberlo antes de
--    decir que el contrato ya se puede llenar solo.
--
-- Y LA 4 ES LA QUE DECIDE SI ESTO SIRVE O NO
--
-- Las columnas vacias no rompen nada: rompen la promesa. Si se dice "el contrato
-- se arma solo" y las 153 fichas estan sin fecha de nacimiento, el contrato sale
-- con el marcador adentro, que es peor que un campo que no existe porque se ve.

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
  '--- 1. LAS NUEVE, UNA POR RENGLON ---'                      as seccion,
  n.clave                                                      as columna,
  case when c.column_name is null
       then '*** NO ESTA: la migracion 084 no esta aplicada'
       else 'ok  ' || c.data_type
  end                                                           as resultado
from nuevas n
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = 'trabajadores'
 and c.column_name = n.clave
union all
select
  '--- 2. LAS DE ANTES: SOLO LAS QUE FALTAN ---',
  v.clave,
  case when c.column_name is null then '*** FALTA UNA QUE EXISTIA' else 'ok' end
from viejas v
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = 'trabajadores'
 and c.column_name = v.clave
where c.column_name is null
union all
select
  '--- 3. LAS REGLAS ---',
  cn.conname,
  'ok  puesta'
from pg_constraint cn
where cn.conrelid = 'public.trabajadores'::regclass
  and cn.conname in ('trabajadores_contrato_tipo_plazo_chk',
                     'trabajadores_contrato_plazo_dias_chk')
union all
select
  '--- 4. CUANTAS FICHAS TIENEN EL DATO ---',
  'de ' || (select count(*) from public.trabajadores) || ' fichas',
  case
    when (select count(*) from public.trabajadores where fecha_nac is not null) = 0
      then '*** NINGUNA tiene fecha de nacimiento: hay que pedirlas antes de armar el contrato'
    else (select count(*) from public.trabajadores where fecha_nac is not null)::text
         || ' con fecha de nacimiento'
  end
union all
select
  '--- 4. CUANTAS FICHAS TIENEN EL DATO ---',
  'estado civil',
  case
    when (select count(*) from public.trabajadores where estado_civil is not null) = 0
      then '*** NINGUNA tiene estado civil'
    else (select count(*) from public.trabajadores where estado_civil is not null)::text || ' con estado civil'
  end
union all
select
  '--- 4. CUANTAS FICHAS TIENEN EL DATO ---',
  'tipo de plazo',
  case
    when (select count(*) from public.trabajadores where contrato_tipo_plazo is not null) = 0
      then '*** NINGUNA tiene plazo: el contrato sale con el marcador adentro'
    else (select count(*) from public.trabajadores where contrato_tipo_plazo is not null)::text || ' con plazo'
  end
union all
select
  '--- 4. Y CUANTAS ESTAN A MEDIAS ---',
  'tipo de plazo pero sin su fecha o sus dias',
  (select count(*) from public.trabajadores
     where contrato_tipo_plazo = 'fecha'   and contrato_fecha_hasta is null)
  + (select count(*) from public.trabajadores
     where contrato_tipo_plazo = 'dias'    and contrato_plazo_dias is null)
union all
select
  '--- 4. Y LA EMPRESA, QUE ES LO QUE BLOQUEA LA HUELLA ---',
  'empresa_id en NULL',
  case
    when (select count(*) from public.trabajadores where empresa_id is null) = 0
      then 'ok  todas tienen empresa'
    else '*** ' || (select count(*) from public.trabajadores where empresa_id is null)::text
         || ' fichas sin empresa: la huella NO se puede guardar en esas'
  end
order by 1, 2;