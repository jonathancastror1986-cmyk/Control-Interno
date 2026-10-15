-- ===================================================================
-- 089_checklist_trabajador.sql
-- ===================================================================
-- EL CHECKLIST DE INGRESO Y DE TÉRMINO
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- QUÉ ES Y POR QUÉ NO ESTÁ EN LA FICHA DEL TRABAJADOR
-- ---------------------------------------------------------------------
--
-- La idea: cuando alguien entra, hay cuatro cosas que hay que hacer en otros
-- sistemas —el contrato al sistema de remuneraciones, el alta en control de
-- asistencia, los movimientos de personal, el contrato a la DT— y cuatro cosas
-- que hay que hacer cuando se va. Es una lista de tareas, no un dato.
--
-- La tentación es poner cuatro columnas booleanas en "trabajadores", y por eso
-- está escrito que NO:
--
--   - no se sabe quién marcó cada una. Con una columna, la respuesta es "alguien".
--   - no se sabe cuándo. Y para un archivador, "se hizo el 12 de marzo" es la
--     diferencia entre una lista y un registro.
--   - el día que aparezca una quinta tarea hay que hacer una migración que
--     agregue una columna, y el día que se quiera quitar una, otra.
--
-- Con una fila por tarea quedan guardados los tres, y agregar una tarea es
-- guardarla y nada más.
--
-- ---------------------------------------------------------------------
-- POR QUÉ LA CLAVE ES (code, etapa, tarea) Y NO UN ID
-- ---------------------------------------------------------------------
--
-- Porque el par esos tres valores ya no puede repetirse. Un id propio obligaría a
-- preguntar por el id para poder convertir, y es lo mismo que pasó con
-- "firmas_documento" y "permiso_horario": toda tabla con id propio termina
-- necesitando el código entero para cruzarse con "trabajadores", que es la tabla
-- de la que cuelga todo.
--
-- Y QUE "tarea" SEA TEXTO Y NO UNA LISTA FIJA
--
-- Porque la lista de tareas la define la aplicación, no la base. Si mañana entra
-- una quinta tarea, no hay que alterar nada: la aplicación la manda y la base la
-- guarda. La base no necesita saber qué tareas existen; necesita saber que lo que
-- le mandaron se guardó.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ "hecho" ES BOOLEANO Y NO UNA FECHA
-- ---------------------------------------------------------------------
--
-- Porque hay dos cosas distintas y se confunden: que la tarea esté HECHA, y
-- cuándo se hizo. El "hecho_at" es lo segundo. Y una tarea hecha hoy, con
-- "hecho" en falso y "hecho_at" con fecha, no tiene sentido: o se hizo, o no.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ HAY UNA FUNCIÓN PARA MARCAR Y NO UN "UPDATE" DIRECTO
-- ---------------------------------------------------------------------
--
-- Porque el permiso de escribir tiene que estar en la base, y porque "quién lo
-- marcó" no puede ser un dato que se mande desde el navegador: el Javascript
-- podría mandar el nombre de otro. Con una función, el nombre sale de "profiles" y
-- no hay manera de inventarlo.
--
-- El mismo criterio que "pedir_permiso_horario" de la 086.
--
-- ---------------------------------------------------------------------
-- LAS DOS ETAPAS
-- ---------------------------------------------------------------------
--
--     ingreso    lo que hay que hacer cuando entra
--     termino    lo que hay que hacer cuando se va
--
-- Y "termino" no es lo mismo que "desvinculado": el estado del trabajador ya es
-- "desvinculado", y eso significa que dejó de trabajar acá. El checklist de
-- término son las tareas de baja, que se hacen después, en otros sistemas. Por
-- eso la etapa va en la tabla y no se deduce del estado del trabajador.

begin;

-- ---------------------------------------------------------------------
-- LA TABLA
-- ---------------------------------------------------------------------
create table if not exists public.trabajador_tareas (
  -- Y LA PERSONA, IGUAL QUE EN TODAS LAS DEMÁS TABLAS
  --
  -- "code" y no un id, porque "trabajadores" tiene "code" como clave y todo lo
  -- demás cuelga de ahí.
  code text not null references public.trabajadores(code) on delete cascade,

  -- Y LA ETAPA, CON SU LISTA CERRADA
  --
  -- Porque "ingreso" y "termino" no son lo mismo, y mezclarlos en una sola lista
  -- haría que al imprimir la ficha de un trabajador que se fue aparecieran las
  -- tareas de ingreso como si faltaran.
  etapa text not null check (etapa in ('ingreso','termino')),

  -- Y LA TAREA
  --
  -- Es el identificador corto que manda la aplicación, como "remuneraciones" o
  -- "control_asistencia". Texto y no una lista fija: la base guarda lo que le
  -- mandan, y la lista de qué tareas existen la tiene el programa.
  tarea text not null check (length(btrim(tarea)) > 0),

  -- Y SI ESTÁ HECHA
  --
  -- El default es falso, que es lo correcto: una tarea que nadie ha tocado no está
  -- hecha, y el defecto tiene que ser el que obliga a preguntar.
  hecho boolean not null default false,

  -- Y QUIÉN LA MARCÓ Y CUÁNDO, QUE ES LA PARTE QUE JUSTIFICA LA TABLA
  --
  -- Con nombre y rol, aparte del uuid, por el mismo motivo que en
  -- "asistencia_auditoria": un perfil se puede borrar, y un checklist sin nombre es
  -- un checklist que no se puede auditar.
  hecho_por         uuid references public.perfiles(id) on delete set null,
  hecho_por_nombre text,
  hecho_por_rol    text,
  hecho_at         timestamptz,

  -- Y UNA NOTA, PARA LO QUE NO ENTRA EN LA CASILLA
  --
  -- Porque las cuatro tareas casi nunca son un sí o un no llanos: "se.contracto se
  -- sube con la observación de que falta el documento X".
  nota text,

  -- Y CUÁNDO SE REGISTRÓ LA FILA, QUE ES DISTINTO DE CUÁNDO SE MARCÓ
  --
  -- Una tarea puede existir desde el ingreso y marcarse meses después, cuando se
  -- regulariza un movimiento. El "hecho_at" es cuándo se resolvió; el
  -- "creado_en" es cuándo apareció en la lista.
  creado_en timestamptz not null default now(),

  -- Y LAS TRES JUNTAS, QUE YA SON UNICAS
  --
  -- Sin id propio: el par de tarea y persona ya no puede repetirse, y agregar un
  -- id obligaría a tener cuidado de no duplicar.
  primary key (code, etapa, tarea)
);

-- ---------------------------------------------------------------------
-- EL ÍNDICE QUE SÍ SE USA
-- ---------------------------------------------------------------------
--
-- La consulta de la pantalla es "las tareas de esta persona en esta etapa". Con la
-- clave primaria ya está: el índice de la clave primaria sirve para eso.
--
create index if not exists trabajador_tareas_etapa
  on public.trabajador_tareas (etapa, code);

-- Y UN ÍNDICE PARA EL HISTÓRICO DE LA EMPRESA
--
-- Porque también se va a consultar "¿qué tareas de ingreso se han marcado en
-- esta empresa este mes?", que no es por persona. Sin índice, eso es un recorrido
-- de la tabla entera.
create index if not exists trabajador_tareas_marcadas
  on public.trabajador_tareas (hecho_at)
  where hecho;

-- ---------------------------------------------------------------------
-- EL AISLAMIENTO
-- ---------------------------------------------------------------------
--
-- Igual que la 086 y por el mismo motivo: la tabla cuelga de "code", y "code"
-- cuelga de "trabajadores", que ya tiene su "empresa_id" y su política. Filtrar la
-- lista de trabajadores ya acota todo lo que cuelga de ellos, así que no hace
-- falta una columna "empresa_id" más que no se mantiene.
alter table public.trabajador_tareas enable row level security;

drop policy if exists "tareas por empresa read" on public.trabajador_tareas;
create policy "tareas por empresa read" on public.trabajador_tareas for select
  using ( public.es_admin()
    or exists (select 1
                 from public.trabajadores t
                 join public.perfil_empresas pe on pe.empresa_id = t.empresa_id
                where t.code = trabajador_tareas.code
                  and pe.user_id = auth.uid()) );

-- Y NO HAY UNA POLÍTICA DE ESCRITURA, A PROPÓSITO
--
-- Porque la escritura va por la función de abajo, que es "security definer" y
-- comprueba el permiso. Si hubiera una política de "insert" o de "update", el
-- permiso dependería de que la tabla esté bien y no de que la función lo compruebe.
--
-- Con las dos, el permiso depende de dos cosas, y alcanza con que una falle.

-- ---------------------------------------------------------------------
-- MARCAR UNA TAREA
-- ---------------------------------------------------------------------
--
-- Y POR QUÉ "UPSERT" Y NO "INSERT" O "UPDATE"
--
-- Porque son tres cosas que el Javascript tiene que hacer y que con una función
-- sola no se pueden hacer juntas: si la tarea existe, cambiarle el estado; si no
-- existe, crearla. Con "insert ... on conflict do update" las dos salen de una,
-- y es el patrón que ya usa el resto del proyecto.
create or replace function public.marcar_tarea_trabajador(
  p_code  text,
  p_etapa text,
  p_tarea text,
  p_hecho boolean,
  p_nota  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- -----------------------------------------------------------------
  -- EL PERMISO, QUE ES EL DE EDITAR LA CONTRATACIÓN
  -- -----------------------------------------------------------------
  --
  -- Porque marcar "el contrato está subido a remuneraciones" es parte de armar el
  -- ingreso, que es lo mismo que "contratacion.editar". No se inventa un permiso
  -- nuevo para esto: un permiso que solo sirve para marcar una casilla es un
  -- permiso que hay que repartir, auditar y explicar.
  if not (public.es_admin() or public.tiene_permiso('contratacion.editar')) then
    raise exception 'No tienes permiso para marcar tareas del checklist'
      using errcode = '42501';
  end if;

  -- -----------------------------------------------------------------
  -- Y QUE LA ETAPA SEA UNA DE LAS DOS
  -- -----------------------------------------------------------------
  --
  -- El "check" de la columna lo impediría, pero el error de Postgres no dice
  -- "esa etapa no existe". Con la lista escrita acá, el error dice cuál es.
  --
  -- Y POR QUÉ EL VALOR VA CON UN "%" Y NO CON "||"
  --
  -- Porque en PL/pgSQL el "raise exception" no es una expresión: no acepta que se le
  -- pegue una concatenación atrás. La primera versión de este archivo usaba
  --
  --     raise exception 'La etapa tiene que ser... ' || coalesce(p_etapa,'vacia')
  --
  -- y Postgres la rechazó con "syntax error at or near ||". La forma que sí funciona
  -- es la del marcador: un "%" en el texto y el valor como argumento.
  if p_etapa not in ('ingreso','termino') then
    raise exception 'La etapa tiene que ser ingreso o termino, y es "%"', coalesce(p_etapa,'vacia')
      using errcode = '22023';
  end if;

  if p_tarea is null or btrim(p_tarea) = '' then
    raise exception 'Falta la tarea' using errcode = '22023';
  end if;

  -- -----------------------------------------------------------------
  -- Y QUE LA PERSONA EXISTA, ANTES DE INSERTAR
  -- -----------------------------------------------------------------
  --
  -- Para que el error sea "no encontré a esa persona" y no una violación de clave
  -- foránea, que no dice ni el nombre ni el código.
  if not exists (select 1 from public.trabajadores where code = p_code) then
    raise exception 'No encontré al trabajador "%"', coalesce(p_code,'(sin código)')
      using errcode = '22023';
  end if;

  insert into public.trabajador_tareas (
    code, etapa, tarea, hecho, hecho_por, hecho_por_nombre, hecho_por_rol,
    hecho_at, nota
  )
  values (
    p_code, p_etapa, btrim(p_tarea), p_hecho,
    -- Y CUANDO SE DESMARCA, NO QUEDA EL NOMBRE DE QUIÉN LA MARCÓ ANTES
    --
    -- Porque si alguien la deshace, la tarea ya no está hecha, y dejar el nombre
    -- sería un registro que dice que está hecha. El que deshizo se guarda en la
    -- auditoría de la tabla de asistencia, que es donde ya se guarda eso.
    case when p_hecho then auth.uid() else null end,
    case when p_hecho then (select nombre from public.perfiles where id = auth.uid()) else null end,
    case when p_hecho then (select rol from public.perfiles where id = auth.uid()) else null end,
    case when p_hecho then now() else null end,
    nullif(btrim(coalesce(p_nota, '')), '')
  )
  on conflict (code, etapa, tarea) do update
    set hecho         = excluded.hecho,
        hecho_por     = excluded.hecho_por,
        hecho_por_nombre = excluded.hecho_por_nombre,
        hecho_por_rol = excluded.hecho_por_rol,
        hecho_at      = excluded.hecho_at,
        nota          = excluded.nota;
end;
$$;

grant execute on function public.marcar_tarea_trabajador(text,text,text,boolean,text)
  to authenticated;

-- ---------------------------------------------------------------------
-- LA COMPROBACIÓN, ADENTRO DE LA BASE
-- ---------------------------------------------------------------------
--
-- Porque las dos cosas que arruinan esto son un tipo que no corresponde y una
-- tabla que no existe. Y las dos se comprueban acá, en el mismo pantallón que
-- dice que se aplicó.
--
-- La de los tipos viene de la 088: "returning id into v_id" con la variable
-- declarada de otro tipo daba 22P02 recién cuando alguien usaba la función. Esta
-- función no devuelve nada, así que no tiene ese problema, pero el control queda
-- igual para que no se agregue después sin querer.
do $$
declare
  v_tabla text;
  v_columnas int;
begin
  select table_name into v_tabla
  from information_schema.tables
  where table_schema = 'public' and table_name = 'trabajador_tareas';

  if v_tabla is null then
    raise exception 'No se creó la tabla trabajador_tareas';
  end if;

  select count(*) into v_columnas
  from information_schema.columns
  where table_schema = 'public' and table_name = 'trabajador_tareas';

  if v_columnas <> 10 then
    raise exception 'La tabla tiene % columnas y tiene que tener 10', v_columnas;
  end if;

  raise notice 'OK: la tabla trabajador_tareas está con sus % columnas', v_columnas;
end;
$$;

comment on table public.trabajador_tareas is
  'Checklist de ingreso y de término. Una fila por persona, etapa y tarea. Guarda QUIÉN marcó y CUÁNDO, que es lo que una columna booleana en "trabajadores" no guardaba. La lista de tareas la define la aplicación, no esta tabla. Ver js/checklist-trabajador.js y migrations/089_checklist_trabajador.sql.';

comment on function public.marcar_tarea_trabajador(text,text,text,boolean,text) is
  'Marca o desmarca una tarea del checklist. El permiso es "contratacion.editar", el mismo del ingreso. El nombre de quien marca sale de "profiles" y no del navegador: no se puede mandar el nombre de otro.';

commit;

-- ---------------------------------------------------------------------
-- LO QUE HAY QUE CORRER DESPUÉS
-- ---------------------------------------------------------------------
--
--   node tools/comprueba-parentesis.js
--   node tools/revisa-nombres-sql.js
--   node tools/comprueba-codigo-sql.js
--
-- ---------------------------------------------------------------------
-- Y PARA VOLVER ATRÁS
-- ---------------------------------------------------------------------
--
--   drop table if exists public.trabajador_tareas cascade;
--   drop function if exists public.marcar_tarea_trabajador(text,text,text,boolean,text);
--
-- Ojo: "cascade" en la tabla tira también la política. La función no tiene
-- dependencia con la tabla y se puede tirar antes.