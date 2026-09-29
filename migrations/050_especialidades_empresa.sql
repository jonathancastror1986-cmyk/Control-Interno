
-- ===================================================================
-- 050: ESPECIALIDADES POR EMPRESA, E IMPORTACIÓN (2026-09-29)
-- ===================================================================
--
-- QUÉ ES
-- -------
-- Hoy la lista de especialidades es UNA para todas las empresas. Con una sola
-- Constructora da lo mismo. Con varias, cada una tiene oficios que la otra no
-- tiene, y el ingreso de un trabajador muestra oficios que esa empresa no
-- maneja: alguien elige "Gasfitería" en la Bodega Sur y el sistema le asigna
-- un kit que ahí no existe.
--
-- Entonces: la lista maestra se queda como está, y una tabla nueva dice qué
-- especialidades ofrece cada empresa.
--
-- -------------------------------------------------------------------
-- POR QUÉ NO SE HACE UNA ESPECIALIDAD NUEVA POR EMPRESA
-- ------------------------------------------------------
-- Porque la especialidad es una CLAVE, y la clave decide qué kit recibe la
-- persona. Si la clave fuera por empresa, habría que cambiar
-- trabajadores.especialidad_clave, los kits, y todas las funciones que la
-- usan. Es el mismo callejón que el código del trabajador: una llave no se
-- parte, porque de ella cuelgan nueve tablas.
--
-- Así que la CLAVE es la misma para todos, y lo que cambia por empresa es el
-- nombre que se muestra. La Constructora puede llamarle "Gasfitería" y la
-- Bodega Sur "Instalación de gas", y las dos son el mismo oficio, con el
-- mismo kit y las mismas charlas.
--
-- -------------------------------------------------------------------
-- IMPORTAR, Y POR QUÉ ES UNA FUNCIÓN Y NO UN INSERT
-- -----------------------------------------------
-- Importar una lista de oficios desde un Excel tiene dos movimientos: crear
-- la especialidad en la lista maestra si no existe, y agregarla a la empresa.
--
-- Si eso fuera un insert desde el navegador, la clave se crearía ahí, en el
-- cliente, y dos personas importando a la vez podrían crear "Gasfiteria" y
-- "gasfitería" como dos especialidades distintas. Aquí la clave se arma
-- siempre de la misma manera, dentro de la función, y hay un índice único que
-- lo garantiza igual.
--
-- Y la importación DEVUELVE un resumen —cuántas se agregaron, cuántas ya
-- estaban, cuántas quedaron listas— en vez de fallar a la primera. Un archivo
-- con 40 oficios y uno repetido no debería rechazarse entero.
-- ===================================================================

-- -------------------------------------------------------------------
-- QUÉ ESPECIALIDADES TIENE CADA EMPRESA
-- -------------------------------------------------------------------
create table if not exists empresa_especialidades (
  empresa_id       integer not null references empresa(id) on delete cascade,
  especialidad_id  uuid not null references epp_especialidades(id) on delete cascade,

  -- el nombre POR EMPRESA. La clave no cambia; esto es lo que se muestra.
  nombre           text,

  orden            integer not null default 100,
  activa           boolean not null default true,

  -- quién lo agregó y cuándo, para que se sepa si fue una importación o alguien
  -- que lo marcó a mano
  agregado_por     uuid,
  agregado_por_nombre text,
  creado_en        timestamptz not null default now(),

  primary key (empresa_id, especialidad_id)
);

-- La pregunta que se hace siempre: qué especialidades tiene esta empresa.
create index if not exists empresa_especialidades_activas
  on empresa_especialidades (empresa_id, orden, nombre)
  where activa;

alter table empresa_especialidades enable row level security;

-- -------------------------------------------------------------------
-- EL HISTORIAL DE LAS IMPORTACIONES
-- -------------------------------------------------------------------
-- Para responder "¿cuándo se cargó esta lista y quién?", que es lo primero que
-- se pregunta cuando una especialidad aparece o falta de la nada.
create table if not exists especialidades_importaciones (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    integer not null references empresa(id) on delete cascade,
  archivo_nombre text,
  total         integer not null default 0,
  agregadas     integer not null default 0,
  ya_existian   integer not null default 0,
  nuevas_claves integer not null default 0,
  detail        jsonb,
  hecho_por     uuid,
  hecho_por_nombre text,
  hecho_at      timestamptz not null default now()
);

alter table especialidades_importaciones enable row level security;

-- -------------------------------------------------------------------
-- PERMISOS
-- -------------------------------------------------------------------
insert into permisos (clave, descripcion, categoria, orden) values
  ('especialidades.empresa.ver',     'Ver qué especialidades tiene cada empresa', 'contratacion', 130),
  ('especialidades.empresa.importar','Importar la lista de especialidades de una empresa', 'contratacion', 131)
on conflict (clave) do nothing;

-- -------------------------------------------------------------------
-- LAS FUNCIONES DE PERMISO, SELF-CONTAINED
-- -------------------------------------------------------------------
create or replace function public.es_usuario_activo(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from perfiles p where p.id = uid and p.activo)
$$;

create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from perfil_roles r where r.user_id = uid and r.rol = 'admin'
  )
$$;

create or replace function public.tiene_permiso(clave text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from perfil_roles pr
      join roles_permisos rp on rp.rol = pr.rol
     where pr.user_id = uid and rp.permiso = clave
  )
$$;

-- ===================================================================
-- LAS PUERTAS
-- ===================================================================

-- -------------------------------------------------------------------
-- LA LISTA QUE VE EL INGRESO
-- -------------------------------------------------------------------
-- Si la empresa no tiene ninguna especialidad dada de alta todavía, se
-- devuelve la lista MAESTRA entera. Porque una empresa recién configurada no
-- tiene por qué quedarse sin oficios: es mejor mostrar de más que no mostrar
-- nada, y el ingreso tiene que poder empezar a usarse desde el primer día.
create or replace function public.especialidades_de_empresa(p_empresa_id integer default null)
returns table (
  clave       text,
  nombre      text,
  orden       integer,
  de_la_lista boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with propias as (
    select ee.especialidad_id, ee.nombre, ee.orden
      from empresa_especialidades ee
     where ee.empresa_id = p_empresa_id and ee.activa
  )
  select e.clave,
         coalesce(nullif(btrim(p.nombre), ''), e.nombre) as nombre,
         coalesce(p.orden, 100) as orden,
         (p.especialidad_id is not null) as de_la_lista
    from propias p
    join epp_especialidades e on e.id = p.especialidad_id
   where e.activa
  union all
  -- La lista maestra, SOLO si esta empresa no tiene ninguna dada de alta
  select e.clave, e.nombre, 100, false
    from epp_especialidades e
   where e.activa
     and not exists (select 1 from propias)
   order by 3, 2
$$;

-- -------------------------------------------------------------------
-- IMPORTAR UNA LISTA
-- -------------------------------------------------------------------
-- El texto es un CSV o una lista con una especialidad por línea. Se acepta
-- "nombre" y también "nombre;clave" para quien ya tenga la clave.
--
-- La clave se arma SIEMPRE igual: sin tildes, con guion por el espacio, en
-- minúsculas. "Gasfitería" y "GASFIT" dan la misma clave, que es lo que
-- evita que la importación cree la misma especialidad dos veces.
create or replace function public.importar_especialidades(
  p_empresa_id     integer,
  p_texto          text,
  p_archivo_nombre text default null
)
returns table (
  agregadas     integer,
  ya_existian   integer,
  nuevas_claves integer,
  total         integer,
  claves        text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea   text;
  v_nombre  text;
  v_clave   text;
  v_esp     uuid;
  v_agreg   integer := 0;
  v_ya      integer := 0;
  v_nuevas  integer := 0;
  v_total   integer := 0;
  v_slugs   text := '';
begin
  -- LA PUERTA: ACTIVO Y CON PERMISO
  -- --------------------------------
  -- Son dos preguntas distintas y por eso van con "y", no con "o":
  --
  --   es_usuario_activo()  -> ¿esta cuenta existe y no está dada de baja?
  --   tiene_permiso(...)   -> ¿esta cuenta puede importar especialidades?
  --
  -- Con "o" entre las dos, la primera sola basta, y la primera es cierta
  -- para cualquiera que se haya registrado: alcanza con tener la cuenta
  -- viva para pasar la puerta. El permiso no se está pidiendo, se está
  -- decorando.
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('especialidades.empresa.importar'))) then
    raise exception 'No tienes permiso para importar especialidades'
      using errcode = '42501';
  end if;

  if p_empresa_id is null then
    raise exception 'Falta la empresa' using errcode = '22023';
  end if;
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'La lista llegó vacía' using errcode = '22023';
  end if;

  for v_linea in
    select btrim(x) from unnest(string_to_array(p_texto, chr(10))) as x
   where btrim(x) <> ''
     -- Quita el BOM y el carriage return de un CSV que viene de Excel
     and btrim(x) <> chr(13)
  loop
    v_total := v_total + 1;

    -- "nombre;clave" o "nombre"
    if position(';' in v_linea) > 0 then
      v_nombre := btrim(split_part(v_linea, ';', 1));
      v_clave  := btrim(split_part(v_linea, ';', 2));
    else
      v_nombre := v_linea;
      v_clave  := '';
    end if;

    if v_nombre = '' then
      v_total := v_total - 1;
      continue;
    end if;

    -- La clave sale del nombre si no viene dada: sin tildes, guion por el
    -- espacio, en minúsculas. Así "Gasfitería" y "GASFIT" dan la misma.
    --
    -- EL ORDEN IMPORTA Y POR ESO ESTÁ ESCRITO EN ESTE ORDEN
    ------------------------------------------------------
    -- Primero minúsculas, después sin tildes, después lo que no sea
    -- letra o número. Si el "regexp_replace" fuera primero, la mayúscula
    -- inicial todavía no estaría en minúsculas, no estaría en [a-z0-9], y
    -- se convertiría en guion: "Gasfitería" daría "-asfiteria", con un guion
    -- adelante. Todos los oficios empezarían por guion, el nombre de la
    -- especialidad quedaría partido por la mitad, y la lista del desplegable
    -- se vería así:
    --
    --     -asfiteria   Soldadura   -intura   -lectricidad
    --
    -- Son tres fallos que se ven juntos, y por eso esta línea no se puede
    -- escribir de otra manera aunque funcione.
    if v_clave = '' then
      v_clave := regexp_replace(
        translate(lower(v_nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouaeiounn'),
        '[^a-z0-9]+', '-', 'g');
    end if;
    v_clave := btrim(v_clave, '-');
    if v_clave = '' then
      v_total := v_total - 1;
      continue;
    end if;

    -- La especialidad en la lista maestra
    select id into v_esp from epp_especialidades where clave = v_clave;
    if v_esp is null then
      insert into epp_especialidades (clave, nombre, activa)
      values (v_clave, v_nombre, true)
      on conflict (clave) do nothing;
      select id into v_esp from epp_especialidades where clave = v_clave;
      if v_esp is not null then
        v_nuevas := v_nuevas + 1;
      end if;
    end if;

    if v_esp is null then
      continue;
    end if;

    -- Y su vínculo con esta empresa
    if exists (select 1 from empresa_especialidades
                where empresa_id = p_empresa_id and especialidad_id = v_esp) then
      v_ya := v_ya + 1;
    else
      insert into empresa_especialidades (
        empresa_id, especialidad_id, nombre, activa, agregado_por, agregado_por_nombre
      ) values (
        p_empresa_id, v_esp, v_nombre, true, auth.uid(),
        (select nombre from perfiles where id = auth.uid())
      )
      on conflict (empresa_id, especialidad_id) do nothing;
      v_agreg := v_agreg + 1;
    end if;

    v_slugs := v_slugs || case when v_slugs = '' then '' else ', ' end || v_clave;
  end loop;

  insert into especialidades_importaciones (
    empresa_id, archivo_nombre, total, agregadas, ya_existian, nuevas_claves,
    hecho_por, hecho_por_nombre
  ) values (
    p_empresa_id, p_archivo_nombre, v_total, v_agreg, v_ya, v_nuevas,
    auth.uid(), (select nombre from perfiles where id = auth.uid())
  );

  return query select v_agreg, v_ya, v_nuevas, v_total, nullif(v_slugs, '');
end;
$$;

-- -------------------------------------------------------------------
-- DAR DE BAJA UNA ESPECIALIDAD DE UNA EMPRESA
-- -------------------------------------------------------------------
-- Se desactiva, no se borra: está en el Maestro y en otras empresas, y borrarla
-- dejaría a la gente con una especialidad que ya no existe en ninguna parte.
create or replace function public.activar_especialidad_empresa(
  p_empresa_id      integer,
  p_especialidad_id uuid,
  p_activa          boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('especialidades.empresa.importar'))) then
    raise exception 'No tienes permiso para cambiar las especialidades de una empresa'
      using errcode = '42501';
  end if;

  insert into empresa_especialidades (empresa_id, especialidad_id, activa)
  values (p_empresa_id, p_especialidad_id, coalesce(p_activa, true))
  on conflict (empresa_id, especialidad_id)
  do update set activa = coalesce(p_activa, true);
end;
$$;

-- -------------------------------------------------------------------
-- DIAGNÓSTICO
-- -------------------------------------------------------------------
create or replace function public.diagnostico_especialidades_empresa()
returns table (
  existe_tabla boolean,
  rls_encendido boolean,
  tabla_maestra boolean,
  permiso_importar boolean,
  empresas_con_lista integer
)
language sql
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='empresa_especialidades'),
    coalesce((select relrowsecurity from pg_class
               where oid = 'empresa_especialidades'::regclass), false),
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='epp_especialidades'),
    exists (select 1 from permisos where clave = 'especialidades.empresa.importar'),
    (select count(distinct empresa_id)::integer from empresa_especialidades)
$$;

grant execute on function public.especialidades_de_empresa(integer) to authenticated;
grant execute on function public.importar_especialidades(integer,text,text) to authenticated;
grant execute on function public.activar_especialidad_empresa(integer,uuid,boolean) to authenticated;
grant execute on function public.diagnostico_especialidades_empresa() to authenticated;
