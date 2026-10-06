-- ===================================================================
-- 084 — LA EMPRESA DE CADA TRABAJADOR
-- ===================================================================
--
-- Corre esto ENTERO en el SQL Editor de Supabase. EN ESTE ORDEN:
--
--   PASO 1 — la vista previa, que NO cambia nada. Corré solo eso primero.
--   PASO 2 — si la vista previa dice lo que esperabas, corré el UPDATE.
--
-- ---------------------------------------------------------------------
-- EL PROBLEMA
-- ---------------------------------------------------------------------
--
-- "trabajadores.empresa_id" está VACÍA en las fichas. El diagnóstico devolvió
-- 30 filas y todas con la empresa en NULL.
--
-- Y eso rompe dos cosas:
--
--   1. La huella del papel firmado. "firmas_documento" tiene "empresa_id NOT
--      NULL", y el navegador lo busca en el trabajador. Sin eso, la huella no se
--      guarda y el papel firmado queda sin prueba de que no se cambió.
--
--   2. El aislamiento por empresa. La política "trabajadores por empresa"
--      compara "trabajadores.empresa_id" contra el "perfil_empresas" del
--      usuario. Con la columna vacía, esa comparación nunca da, y NADIE ve a
--      NADIE salvo el administrador.
--
-- ---------------------------------------------------------------------
-- DE DÓNDE SE SACA LA EMPRESA, Y POR QUÉ NO SE ADIVINA
-- ---------------------------------------------------------------------
--
-- Hay tres caminos, y se usan en este orden. El primero es el que se usa
-- siempre; los otros dos son para los que no lo tienen.
--
--   1. EL SUPERVISOR. Un trabajador con supervisor pertenece a la misma empresa
--      que su supervisor. Y el supervisor sí tiene empresa: se le\Supportó de la
--      ficha.
--
--   2. LA FICHA DEL USUARIO. Si no tiene supervisor, se busca si algún usuario
--      con esa misma empresa lo tiene asignado en "perfil_empresas".
--
--   3. NADA. Si no hay de dónde sacarla, la ficha se queda vacía y se ve en la
--      vista previa. NO se inventa una empresa: una ficha en la empresa
--      equivocada es peor que una ficha sin empresa, porque la ficha aparece
--      donde tiene que aparecer y donde no.
--
-- ---------------------------------------------------------------------
-- POR QUÉ UNA VISTA PREVIA Y NO UN UPDATE DIRECTO
-- ---------------------------------------------------------------------
--
-- Porque esto escribe en 153 fichas. Si la regla está mal, se pierde la
-- información de a qué empresa pertenecía cada uno, y no hay forma de saber
-- cuáles eran antes.
--
-- La vista previa muestra: cuántos quedan con empresa, cuántos se van a
-- resolver por el supervisor, cuántos por la ficha del usuario, y cuántos se
-- quedan sin nada. Y lista los nombres de los que quedan sin nada, para que
-- se puedan resolver a mano en la pantalla.
--
-- ===================================================================
-- PASO 1 — LA VISTA PREVIA
-- ===================================================================
-- Esto NO cambia nada. Solo muestra qué haría el paso 2.

with supervisor_de(
  trabajador_code, empresa_id
) as (
  -- EL CAMINO 1: POR EL SUPERVISOR
  --
  -- Se usa solo el supervisor que YA tiene empresa. Si un trabajador tiene un
  -- supervisor sin empresa, ese camino no sirve y se prueba el siguiente.
  select t.code, s.empresa_id
  from public.trabajadores t
  join public.trabajadores s on s.code = t.supervisor_code
  where t.empresa_id is null
    and s.empresa_id is not null
  -- Y EL MÁS ANTIGUO TIENE LA PRIORIDAD
  --
  -- Si un trabajador tiene varios supervisores en la ficha (no debería, pero
  -- la ficha es un formulario que alguien puede haber llenado mal), se toma el
  -- de empresa más chica. Es el orden estable, y hace que la vista previa y la
  -- escritura den siempre el mismo resultado.
  --
  -- Y POR QUÉ EL "ORDER BY" ESTÁ DENTRO DEL CTE
  --
  -- Porque es lo que hace el desempate. Sin él, si hay dos supervisores con
  -- empresa, cuál gana depende del orden en que PostgreSQL devuelva las filas, y
  -- eso puede cambiar entre la vista previa y la escritura. Con el orden, los
  -- dos dan lo mismo.
  order by t.code, s.empresa_id
),
usuario_de(
  trabajador_code, empresa_id
) as (
  -- EL CAMINO 2: POR LA FICHA DEL USUARIO
  --
  -- Si el propio trabajador tiene una cuenta de usuario con esa empresa
  -- asignada en "perfil_empresas", esa es su empresa. Es el camino más seguro
  -- de los dos después del supervisor, porque la asignación la hizo una
  -- persona a propósito.
  --
  -- Y NO HACE FALTA IR A "auth.users": "perfil_empresas.user_id" ya es el
  -- identificador del usuario, y "perfiles.id" es el mismo identificador. La
  -- tabla "perfiles" tiene el "codigo" del trabajador.
  select t.code, min(pe.empresa_id)
  from public.trabajadores t
  join public.perfiles pr on pr.codigo = t.code
  join public.perfil_empresas pe on pe.user_id = pr.id
  where t.empresa_id is null
    and not exists (select 1 from supervisor_de d where d.trabajador_code = t.code)
  group by t.code
)
select
  (select count(*) from public.trabajadores)                              as "1_total",
  (select count(*) from public.trabajadores where empresa_id is not null) as "2_ya_tenian",
  (select count(*) from supervisor_de)                                    as "3_se_resuelven_por_supervisor",
  (select count(*) from usuario_de)                                      as "4_se_resuelven_por_usuario",
  (select count(*) from public.trabajadores t
     where t.empresa_id is null
       and not exists (select 1 from supervisor_de d where d.trabajador_code = t.code)
       and not exists (select 1 from usuario_de d where d.trabajador_code = t.code)
  )                                                                      as "5_QUE_QUEDAN_SIN_EMPRESA";

-- Y LOS QUE QUEDAN SIN EMPRESA, PARA RESOLVERLOS A MANO
--
-- Estos son los que no tienen supervisor con empresa, ni usuario con esa
-- empresa asignada. No se les pone nada: se los resuelve desde la ficha del
-- trabajador, en la pantalla.
select code, name, supervisor_code
from public.trabajadores t
where t.empresa_id is null
  and not exists (select 1
                  from public.trabajadores s
                  where s.code = t.supervisor_code and s.empresa_id is not null)
order by code;

-- Y CÓMO SE VERÁ EL RESULTADO, PARA COMPROBAR ANTES DE ESCRIBIR
--
-- Toma los primeros diez con empresa ya resuelta y muestra de dónde salió.
-- Es una muestra: sirve para ver si la regla está haciendo lo que uno cree.
with supervisor_de(trabajador_code, empresa_id) as (
  select t.code, s.empresa_id
  from public.trabajadores t
  join public.trabajadores s on s.code = t.supervisor_code
  where t.empresa_id is null and s.empresa_id is not null
  order by t.code, s.empresa_id
),
resuelto(trabajador_code, empresa_id, de_donde) as (
  select trabajador_code, empresa_id, 'supervisor' from supervisor_de
)
select r.trabajador_code, t.name, r.empresa_id, r.de_donde,
       (select name from public.empresa e where e.id = r.empresa_id) as "la_empresa"
from resuelto r
join public.trabajadores t on t.code = r.trabajador_code
order by r.trabajador_code
limit 10;

-- ===================================================================
-- PASO 2 — ESCRIBIR
-- ===================================================================
-- ===================================================================
--
-- ESTE ES EL QUE ESCRIBE. Solo correrlo si el paso 1 mostró lo que esperabas.
--
-- Y ESTÁ ESCRITO COMO UN "UPDATE" CON "CTE", QUE LO PUEDE LEER Y REVISAR
--
-- El "with" calcula la empresa de cada ficha, y el "update" la escribe. Se ven
-- las dos mitades juntas, y el "update" es solo la última línea.
--
with supervisor_de(trabajador_code, empresa_id) as (
  select t.code, s.empresa_id
  from public.trabajadores t
  join public.trabajadores s on s.code = t.supervisor_code
  where t.empresa_id is null and s.empresa_id is not null
  order by t.code, s.empresa_id
),
usuario_de(trabajador_code, empresa_id) as (
  select t.code, min(pe.empresa_id)
  from public.trabajadores t
  join public.perfiles pr on pr.codigo = t.code
  join public.perfil_empresas pe on pe.user_id = pr.id
  where t.empresa_id is null
    and not exists (select 1 from supervisor_de d where d.trabajador_code = t.code)
  group by t.code
),
resuelto(trabajador_code, empresa_id) as (
  select trabajador_code, empresa_id from supervisor_de
  union all
  select trabajador_code, empresa_id from usuario_de
)
update public.trabajadores t
   set empresa_id = r.empresa_id
  from resuelto r
 where t.code = r.trabajador_code
   and t.empresa_id is null;   -- Y SOLO LOS QUE ESTÁN VACÍOS

-- Y CUÁNTAS QUEDARON SIN EMPRESA, QUE DEBERÍA SER EL MISMO NÚMERO
-- DEL PASO 1. Si no es el mismo, algo cambió entre los dos pasos y hay que
-- parar a mirar antes de seguir.
select count(*) filter (where empresa_id is null) as "sin_empresa",
       count(*) filter (where empresa_id is not null) as "con_empresa"
from public.trabajadores;

-- ===================================================================
-- PARA VOLVER ATRÁS
-- ===================================================================
--
-- Esto NO se puede deshacer con un solo "update": una vez escrita la empresa, no
-- queda registro de cuál era antes.
--
-- Por eso el paso 1 es solo consulta.
--
-- Si hizo falta cambiar algo, la forma es revisar las fichas a mano. Y son pocas:
-- las que quedaron sin empresa son las únicas que hay que decidir.