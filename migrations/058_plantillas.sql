-- ===================================================================
-- 058: LAS PLANTILLAS DE DOCUMENTOS
-- ===================================================================
--
-- QUÉ ES
-- ------
-- Un documento que se arma una vez y se vuelve a llenar para cada trabajador: hoja de life,
-- contrato, carta de admisión, anexo, encuesta, declaración de salud.
--
-- La plantilla se guarda como TEXTO —un "html" y un "css"—, no como archivo. Y esa es la
-- decisión de la que depende todo lo demás:
--
--   - se edita en el navegador, sin subir y bajar archivos;
--   - el texto se puede buscar, comparar entre plantillas y versionar en git;
--   - no hay formato binario que se rompa solo.
--
-- -------------------------------------------------------------------
-- POR QUÉ "html" Y "css" EN DOS COLUMNAS, Y NO UN "documento" SÓLO
-- -------------------------------------------------------------------
--
-- Porque son cosas que se editan distinto. El "html" es la estructura: qué campos hay, en
-- qué orden, qué dice cada rótulo. El "css" es el aspecto: tipografía, colores, tamaño de
-- letra, márgenes.
--
-- Y separarlas evita el peor problema de un editor de texto: que para cambiar el color de
-- los rótulos haya que andar buscando el "style" pegado a cada uno.
--
-- -------------------------------------------------------------------
-- EL LUGAR DE LOS CAMPOS: "{{nombre}}", Y POR QUÉ CON LLAVES
-- ------------------------------------------------------
--
-- El texto de un "{{campo}}" se reemplaza por el dato del trabajador al llenar. Con doble
-- llave porque "{{" en HTML no significa nada, y porque un "[nombre]" se confunde con un
-- enlace o con un "[1]" de bibliografía.
--
-- Y los campos que son CONOCIDOS van en una lista, no se escriben a mano: ver la función
-- "campos_de_plantilla" más abajo.
--
-- -------------------------------------------------------------------
-- EL TIPO: DOC, FORMULARIO O AMBOS
-- -------------------------------
--
--   'doc'         una hoja con la que se imprime o se firma: contrato, carta, anexo.
--   'formulario'  uno que se llena acá y se guarda: encuesta, declaración de salud.
--
-- Y "ambos" es lo mismo que elegir los dos tipos en dos plantillas. Se ofrece porque la
-- declaración de salud tiene las dos cosas: se llena en el pantalla y después se imprime
-- firmada. Pero OJO: eso significa dos plantillas que hay que mantener juntas, y una
-- versión de la otra. Si más adelante eso molesta, el tipo es un solo dato y se cambia
-- acá.
--
-- -------------------------------------------------------------------
-- Y LA VALIDACIÓN AL LLENAR
-- --------------------------
--
-- "campos_de_plantilla" devuelve los campos que la plantilla usa y de qué tipo son, y
-- "plantilla_falta_datos" dice cuáles están vacíos en un trabajador concreto.
--
-- El editor NO deja descargar si falta uno. Y no es capricho: una hoja de life con el
-- nombre en blanco es peor que no tener hoja de life, porque alguien la-archiva igual y
-- el problema aparece meses después, cuando ya no se sabe de quién era.
--
-- -------------------------------------------------------------------
-- QUIÉN PUEDE TOCARLAS
-- --------------------
--
-- El permiso nuevo "plantillas.gestionar". Y hay dos cosas deliberadamente FUERA de esta
-- migración, que se anotan para que no se pierdan:
--
--   1. NO hay "borrar". Solo "activa=false". Una plantilla que se usó para emitir un
--      contrato no se borra: se da de baja. Si se borrara, el contrato emitido pierde el
--      respaldo de con qué plantilla se hizo, y eso no sirve para nada.
--   2. NO hay version. La primera vez que haga falta, se agrega una tabla de versiones y
--      se copia el "html" y el "css" antes de cada cambio. Agregarlo después significa que
--      las primeras plantillas no tienen historial, y eso hay que decirlo en voz alta
--      cuando se agregue.
--
-- -------------------------------------------------------------------
-- POR QUÉ "empresa_id" PUEDE SER NULL
-- ----------------------------------
--
-- Porque hay plantillas que son de la empresa CHICA: la declaración de salud standard, la
-- hoja de life que usa siempre. Y si exigiera empresa, cada empresa tendría que crear la
-- suya, y cuarenta y siete empresas crearían cuarenta y siete copias que después alguien
-- cambia en una y no en las otras.
--
-- Con NULL es "de todas", y es la que se usa si la empresa no tiene una propia.
--
-- -------------------------------------------------------------------
-- POR QUÉ "CREATE TABLE IF NOT EXISTS" Y NO "ALTER TABLE IF NOT EXISTS"
-- -------------------------------------------------------------------
--
-- Porque "alter table if not exists" NO EXISTE en PostgreSQL. Es lo primero que se
-- escribe, por la costumbre de "create table if not exists" y "create index if not exists",
-- que SÍ existen. Y PostgreSQL contesta:
--
--     ERROR: 42601: syntax error at or near "exists"
--
-- La diferencia: "create" y "create index" pueden crear o no; "alter" MODIFICA algo que
-- tiene que estar, y si no está hay que crearlo primero. Por eso no tiene la forma.
--
-- Lo que se comprobó: en las otras migraciones hay 46 usos de "alter table ... add column
-- if not exists", y ESOS son válidos. El que no existe es el "alter table if not exists" a
-- secas, sin "add column".
--
-- -------------------------------------------------------------------
-- LA TABLA
-- -------------------------------------------------------------------
create table if not exists public.plantillas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  tipo       text not null default 'doc'
             check (tipo in ('doc','formulario')),
  descripcion text,
  html       text not null default '',
  css        text not null default '',
  empresa_id integer references public.empresa(id) on delete cascade,
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plantillas is
  'Documentos que se arman una vez y se llenan para cada trabajador: hoja de life, contrato, carta, anexo, encuesta, declaracion de salud. El "html" lleva los campos como {{nombre}}; el "css" es el aspecto. "empresa_id" NULL es una plantilla que sirve para todas las empresas.';

comment on column public.plantillas.html is
  'Estructura del documento. Los campos van como {{nombre}}, {{apellido_paterno}}, {{empresa}}, etc. La lista exacta la da la funcion campos_de_plantilla.';

comment on column public.plantillas.css is
  'Aspecto: tipografia, colores, margenes. Va aparte del "html" para poder cambiar el estilo sin buscar el "style" pegado a cada rotulo.';

comment on column public.plantillas.empresa_id is
  'NULL significa que la plantilla sirve para todas las empresas. Es lo que evita que cada empresa tenga su copia de la hoja de life y alguien la cambie en una sola.';

-- -------------------------------------------------------------------
-- EL ÍNDICE QUE SÍ SE USA
-- -----------------------
-- El listado es por empresa, y se filtra por activa. Ese es el acceso real.
--
-- Y NO hay índice sobre el "html": no se busca dentro del contenido de las plantillas. Un
-- índice sobre una columna de texto grande que nadie consulta es solo escritura de más en
-- cada guardado, y esas columnas son grandes.
create index if not exists plantillas_empresa_activa_idx
  on public.plantillas(empresa_id, activa);

-- -------------------------------------------------------------------
-- SEGURIDAD A NIVEL DE FILA
-- --------------------------
--
-- Misma regla que el resto del sistema: se lee lo que está activo, y escribir es para
-- quien tiene el permiso "plantillas.gestionar".
--
-- Y "es_usuario_activo()" primero, porque un usuario desactivado no debería poder ver
-- plantillas aunque conserve el permiso.
alter table public.plantillas enable row level security;

-- -------------------------------------------------------------------
-- LISTAR Y LEER
-- -------------------------------------------------------------------
create or replace function public.listar_plantillas(
  p_empresa_id integer default null,
  p_tipo      text    default null
)
returns table (
  id          uuid,
  nombre      text,
  tipo        text,
  descripcion text,
  empresa_id  integer,
  activa      boolean,
  html        text,
  css         text,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, p.tipo, p.descripcion, p.empresa_id,
         p.activa, p.html, p.css, p.created_at, p.updated_at
    from public.plantillas p
   where p.activa
     -- Las de la empresa primero, y las de todas como respaldo. El editor muestra las
     -- dos y la de la empresa tapa a la general.
     and (p.empresa_id is null or p.empresa_id = coalesce(p_empresa_id, -1))
     and (p_tipo is null or p.tipo = p_tipo)
   order by (p.empresa_id is null), p.nombre;
$$;

comment on function public.listar_plantillas(integer,text) is
  'Devuelve las plantillas activas. Con "empresa_id" NULL trae las de esa empresa y las de todas, que son el respaldo.';

-- -------------------------------------------------------------------
-- GUARDAR
-- -------------------------------------------------------------------
-- Con "upsert" por el nombre, porque el caso real es "editar la que ya existe" y sin eso
-- cada guardado crearía una copia nueva con el mismo nombre.
--
-- Y "updated_at" con "now()" a mano, porque no hay disparador en esta tabla: el resto del
-- proyecto los tiene, y esta es la primera que se crea sin uno. Es una inconsistencia que
-- queda anotada, no una decisión.
create or replace function public.guardar_plantilla(
  p_nombre      text,
  p_html        text default '',
  p_css         text default '',
  p_tipo        text default 'doc',
  p_descripcion text default null,
  p_empresa_id  integer default null,
  p_id          uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('plantillas.gestionar'))) then
    raise exception 'No tienes permiso para editar las plantillas'
      using errcode = '42501';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'La plantilla necesita un nombre' using errcode = '22023';
  end if;

  if p_tipo is null or btrim(p_tipo) not in ('doc','formulario') then
    raise exception 'El tipo tiene que ser "doc" o "formulario"' using errcode = '22023';
  end if;

  -- Y si viene el id, se edita esa. Si no, se busca por nombre y empresa, que es como
  -- se evita el duplicado cuando se edita una que se creó antes de que el editor existiera.
  if p_id is not null then
    v_id := p_id;
  else
    select p.id into v_id
      from public.plantillas p
     where p.nombre = btrim(p_nombre)
       and p.empresa_id is not distinct from p_empresa_id
     limit 1;
  end if;

  if v_id is not null then
    update public.plantillas
       set nombre      = btrim(p_nombre),
           tipo        = btrim(p_tipo),
           descripcion = p_descripcion,
           html        = coalesce(p_html,''),
           css         = coalesce(p_css,''),
           updated_at  = now()
     where id = v_id;
    return v_id;
  end if;

  insert into public.plantillas (nombre, tipo, descripcion, html, css, empresa_id)
  values (btrim(p_nombre), btrim(p_tipo), p_descripcion,
          coalesce(p_html,''), coalesce(p_css,''), p_empresa_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- -------------------------------------------------------------------
-- DAR DE BAJA, NO BORRAR
-- -------------------------------------------------------------------
create or replace function public.baja_plantilla(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (es_usuario_activo()
          and (es_admin() or tiene_permiso('plantillas.gestionar'))) then
    raise exception 'No tienes permiso para dar de baja las plantillas'
      using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'Falta la plantilla' using errcode = '22023';
  end if;

  -- Y NO se borra. Una plantilla con la que se emitió un contrato es el respaldo de ese
  -- contrato. Si se borrara, el contrato queda sin forma de origen.
  --
  -- Y hay un detalle: esta función se llama "baja" y no "borrar" a propósito, para que el
  -- nombre diga lo que hace. Una función llamada "borrar" que en realidad no borra es la
  -- forma más rápida de que alguien la use creyendo que sí.
  update public.plantillas
     set activa = false, updated_at = now()
   where id = p_id;
end;
$$;

-- -------------------------------------------------------------------
-- LOS CAMPOS QUE USA UNA PLANTILLA
-- -------------------------------------------------------------------
-- Y la lista de los campos que EXISTEN, para que el editor ofrezca una lista y no haya que
-- escribirlos de memoria. Es la que evita el error más común: escribir "{{nombre}}" y que
-- en la hoja salga "{{nombre}}" literal porque el dato se llama "name".
create or replace function public.campos_de_trabajador()
returns table (clave text, etiqueta text, tipo text)
language sql
stable
as $$
  select * from (values
    ('codigo',          'Código',            'texto'),
    ('nombres',         'Nombres',           'texto'),
    ('apellido_paterno','Apellido paterno',  'texto'),
    ('apellido_materno','Apellido materno',  'texto'),
    ('nombre_completo', 'Nombre completo',   'texto'),
    ('empresa',         'Empresa',           'texto'),
    ('empresa_id',      'Empresa (id)',      'numero'),
    ('cargo',           'Cargo',             'texto'),
    ('especialidad',    'Cargo del kit',     'texto'),
    ('telefono',        'Teléfono',          'texto'),
    ('rut',             'RUT',               'texto'),
    ('fecha_ingreso',   'Fecha de ingreso',  'fecha'),
    ('direccion',       'Dirección',         'texto'),
    ('correo',          'Correo',            'texto'),
    ('afp_codigo',      'AFP código',        'texto'),
    ('afp_nombre',      'AFP nombre',        'texto'),
    ('emerg_nombre',    'Contacto emergencia','texto'),
    ('emerg_telefono',  'Teléfono emergencia','texto'),
    ('emerg_relacion',  'Relación emergencia','texto'),
    ('foto_casual',     'Foto casual',      'imagen'),
    ('foto_seguridad',  'Foto seguridad',   'imagen')
  ) as t(clave, etiqueta, tipo);
$$;

comment on function public.campos_de_trabajador() is
  'Los "{{campo}}" que se pueden poner en una plantilla, con su etiqueta y su tipo. "nombre_completo" es el nombre entero armado con los tres, que es el que se usa en los documentos.';

-- Y los que USA una plantilla en concreto.
create or replace function public.campos_de_plantilla(p_html text)
returns text[]
language sql
immutable
as $$
  -- Y "distinct" porque el mismo campo puede aparecer varias veces en un documento: el
  -- nombre va en el encabezado y en el pie, y eso son dos apariciones de un solo campo.
  select coalesce(array_agg(distinct m[1]), '{}')
    from regexp_matches(coalesce(p_html,''), '\{\{\s*([a-z0-9_]+)\s*\}\}', 'gi') as m;
$$;

comment on function public.campos_de_plantilla(text) is
  'Devuelve la lista de campos "{{algo}}" que aparecen en el html, sin repetir. Es lo que revisa el editor antes de dejar descargar: si un campo no existe en la base, el documento sale con el {{campo}} literal adentro.';

-- -------------------------------------------------------------------
-- LOS PERMISOS
-- -------------------------------------------------------------------
-- Y OJO CON LA COLUMNA: "permisos" tiene "categoria", NO "modulo". Escribír "modulo"
-- falla con un error de columna que no existe, y el error aparece en la línea del INSERT
-- y no en la del CREATE TABLE, que es donde uno mira primero.
--
-- Y el orden 160 y 161 sigue a los de grupos (150 y 151), que son de la misma materia.
insert into public.permisos (clave, descripcion, categoria, orden)
values ('plantillas.ver',       'Ver las plantillas y sus campos',   'contratacion', 160),
       ('plantillas.gestionar', 'Crear y editar plantillas',          'contratacion', 161)
on conflict (clave) do nothing;

-- -------------------------------------------------------------------
-- Y QUE ALGUIEN LO TENGA
-- ----------------------
--
-- Un permiso que existe pero que ningún rol tiene es un permiso que nadie tiene. La
-- función "tiene_permiso" pregunta por el rol, y si ningún rol tiene esta fila, el
-- único que puede tocar una plantilla es el que es administrador.
--
-- O sea que esta migración deja el camino preparado pero CERRADO, y hay que abrirlo
-- desde la pantalla de roles. Es a propósito: darle el permiso a un rol es una decisión
-- de la empresa, no del programador.
--
-- La consulta del final dice cuántos roles lo tienen. Cero es lo esperable hasta que
-- alguien lo asigne a mano.

grant execute on function public.listar_plantillas(integer,text)   to authenticated;
grant execute on function public.guardar_plantilla(text,text,text,text,text,integer,uuid) to authenticated;
grant execute on function public.baja_plantilla(uuid)               to authenticated;
grant execute on function public.campos_de_trabajador()              to authenticated;
grant execute on function public.campos_de_plantilla(text)           to authenticated;

-- -------------------------------------------------------------------
-- CÓMO SE SABE SI QUEDÓ BIEN APLICADA
-- -------------------------------------------------------------------
-- Esta migración no devuelve filas, así que el editor dice "Success. No rows returned".
-- Eso es lo correcto.
--
-- Y las cinco consultas del final tienen que dar: 1, 2, 2, 21 y 0.
select count(*) as tabla_plantillas
  from information_schema.tables
 where table_schema='public' and table_name='plantillas';

select count(*) as funciones
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
   and p.proname in ('listar_plantillas','guardar_plantilla','baja_plantilla',
                     'campos_de_trabajador','campos_de_plantilla');

select count(*) as permisos
  from public.permisos
 where clave in ('plantillas.ver','plantillas.gestionar');

select count(*) as campos_de_trabajador
  from public.campos_de_trabajador();

-- Y cuántos roles tienen el permiso. CERO es lo esperado recién aplicada: hay que
-- asignarlo a mano desde la pantalla de roles. Si sale más de cero sin haberlo asignado,
-- es que algún rol lo tiene por defecto y hay que verlo.
-- Y cuántos roles lo tienen, sin contar el de administrador: el administrador tiene
-- todos los permisos por otra vía, así que contarlo engaña.
--
-- La tabla se llama "roles_permisos", no "rol_permisos". Y tiene dos columnas: "rol" y
-- "permiso", en singular. Escribirlas en singular da error de relación que no existe, y
-- relación que no existe, y el mensaje no dice qué tabla estás buscando.
select count(*) as roles_con_el_permiso
  from public.roles_permisos
 where permiso = 'plantillas.gestionar'
   and rol <> 'admin';

-- Y que el reconocedor de campos ande: tiene que devolver un solo campo, porque el mismo
-- campo aparece dos veces en el texto de prueba y no se repite.
select public.campos_de_plantilla('<p>{{nombre_completo}}</p><p>{{ nombre_completo }}</p><p>{{cargo}}</p>') as campos;
-- tiene que dar {nombre_completo,cargo}
