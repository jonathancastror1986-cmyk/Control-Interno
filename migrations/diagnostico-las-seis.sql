-- ===================================================================
-- LAS SEIS QUE "NO SE PUEDEN VERIFICAR"  (sí se pueden)
-- ===================================================================
--
-- Corre esto ENTERO en el SQL Editor de Supabase.
--
-- ---------------------------------------------------------------------
-- POR QUÉ EL DIAGNÓSTICO ANTERIOR NO LAS VEÍA
-- ---------------------------------------------------------------------
--
-- Porque las seis solo tocan objetos que YA EXISTÍAN. No crean ninguna tabla
-- nueva, y el diagnóstico buscaba tablas nuevas para preguntar "¿existe?".
--
-- No Having ningún objeto con nombre no significa que no se pueda comprobar.
-- Estas seis agregan columnas, políticas, índices y permisos sobre objetos que
-- ya están. Y eso se verifica mirando si están.
--
-- ---------------------------------------------------------------------
-- CADA UNA Y QUÉ DEBERÍA ESTAR
-- ---------------------------------------------------------------------
--
-- 004   El estado de la asistencia admite la lluvia:
--         una restricción con 'LL' adentro. Si el "check" no tiene la 'LL', la
--         migración no corrió, y marcar lluvia va a fallar.
--
-- 068   El bucket de respaldos de EPP. Es una fila en "storage.buckets", que
--         no tiene ancla porque vive en el esquema de Supabase, no en el mío.
--
-- 070   Dos permisos de la oficina para tocar sueldos:
--         "rem.editar" y "rem.exportar". Si faltan, la oficina carga la
--         planilla y no tiene permiso.
--
-- 071   Las entregas de EPP aisladas por empresa: una política con ese nombre.
--
-- 073   El acceso total cortado: RLS prendido en "trabajadores" y en
--         "epp_entregas", sin ninguna política que lo abra.
--
-- 074   Lo mismo para "asistencia" y "perfiles".

-- ===================================================================
-- 004 — EL DÍA DE LLUVIA
-- ===================================================================
-- La restricción tiene que aceptar 'LL'. Se lee el "check" de la base, que es
-- el texto que se puso de verdad, y se busca la letra dentro.
select case
         when exists (
           select 1 from pg_constraint
           where conname = 'asistencia_estado_check'
             and conrelid = 'public.asistencia'::regclass
             and pg_get_constraintdef(oid) like '%LL%'
         ) then 'ok — la 004 CORRIO: el estado admite lluvia (LL)'
         when exists (
           select 1 from pg_constraint
           where conname = 'asistencia_estado_check'
             and conrelid = 'public.asistencia'::regclass
         ) then '*** CORRIO A MEDIAS: existe el check pero NO tiene la LL. Vuelve a correr la 004.'
         else '*** NO CORRIO: no existe el check. Corre la 004_dia_lluvia.sql.'
       end as "004_dia_lluvia";

-- El detalle del "check", para verlo con los propios ojos
select pg_get_constraintdef(oid) as "el_check_de_estado"
from pg_constraint
where conname = 'asistencia_estado_check'
  and conrelid = 'public.asistencia'::regclass;

-- ===================================================================
-- 068 — EL BUCKET DE RESPALDOS
-- ===================================================================
select case
         when exists (select 1 from storage.buckets where id = 'epp-respaldos')
         then 'ok — el bucket "epp-respaldos" existe'
         else '*** NO EXISTE el bucket. Corre la 068_bucket_epp_respaldos.sql.'
       end as "068_bucket";

-- Y los buckets que hay, para ver el nombre real si no es ese
select id as "buckets_que_existen" from storage.buckets order by id;

-- ===================================================================
-- 070 — LOS PERMISOS DE LA OFICINA
-- ===================================================================
-- Y ESTOS CUENTAN: no basta con que el permiso exista en "permisos", tiene que
-- estar ASIGNADO al rol "oficina". Un permiso que existe pero no está asignado
-- es un permiso que nadie tiene.
select case
         when exists (select 1 from roles_permisos where rol = 'oficina' and permiso = 'rem.editar')
         then 'ok — la oficina tiene rem.editar'
         else '*** la oficina NO tiene rem.editar. Corre la 070.'
       end as "070_rem_editar";

select case
         when exists (select 1 from roles_permisos where rol = 'oficina' and permiso = 'rem.exportar')
         then 'ok — la oficina tiene rem.exportar'
         else '*** la oficina NO tiene rem.exportar. Corre la 070.'
       end as "070_rem_exportar";

-- Y los permisos de la oficina que hay ahora, para ver el estado
select p.clave, p.descripcion
from permisos p
join roles_permisos rp on rp.permiso = p.clave
where rp.rol = 'oficina'
order by p.clave;

-- ===================================================================
-- 071 Y 073 Y 074 — EL RLS Y LAS POLÍTICAS
-- ===================================================================
-- Y LA DIFERENCIA ENTRE LAS TRES, QUE ES LO IMPORTANTE
--
-- 071 prende el RLS y mete UNA política que abre lo de EPP por empresa.
-- 073 y 074 apagan el acceso: RLS prendido y SIN políticas.
--
-- O sea que las tres pueden estar bien con algo DISTINTO en cada caso. No se
-- comprueba "existe la política", sino "el estado es el que corresponde".
--
-- Para cada tabla: si el RLS está prendido y hay políticas, la gente ve
-- solamente lo que las políticas dejan. Si está prendido y NO hay ninguna
-- política, no ve nada de esa tabla — y eso también es una decisión.
select c.relname as "tabla",
       c.relrowsecurity as "rls_prendido",
       case
         when c.relrowsecurity = false then '*** RLS APAGADO: cualquiera ve toda la tabla'
         else 'ok  RLS prendido'
       end as "estado_del_rls",
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = c.relname) as "politicas",
       case
         when c.relname = 'epp_entregas' and c.relrowsecurity
              and exists (select 1 from pg_policies
                          where schemaname='public' and tablename='epp_entregas'
                            and policyname='epp entregas por empresa')
         then 'ok  la 071 CORRIO: hay su política por empresa'
         when c.relname = 'epp_entregas' and c.relrowsecurity
              and (select count(*) from pg_policies
                   where schemaname='public' and tablename='epp_entregas') = 0
         then 'ok  la 073 CORRIO: sin políticas, que es el acceso cortado'
         when c.relrowsecurity
         then 'rls prendido, pero mirá las políticas de esta tabla'
         else '*** sin rls'
       end as "que_corresponde"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('epp_entregas','trabajadores','asistencia','perfiles')
order by c.relname;

-- Y TODAS LAS POLÍTICAS DE ESAS CUATRO TABLAS, para leerlas
select tablename as "tabla", policyname as "politica",
       cmd as "permite", roles::text as "a_quien", qual as "condicion"
from pg_policies
where schemaname = 'public'
  and tablename in ('epp_entregas','trabajadores','asistencia','perfiles')
order by tablename, policyname;

-- ===================================================================
-- PARA VOLVER ATRÁS
-- ===================================================================
-- Para deshacer la 004, si el "check" molesta:
--   alter table asistencia drop constraint if exists asistencia_estado_check;
--
-- Este archivo solo consulta. No cambia nada.