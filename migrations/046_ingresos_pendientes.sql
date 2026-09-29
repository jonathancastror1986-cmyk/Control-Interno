-- ===================================================================
-- 046: INGRESO DE TRABAJADOR A MEDIO HECHO (2026-09-29)
-- ===================================================================
--
-- EL PROBLEMA QUE RESUELVE
-- ------------------------
-- Un supervisor se encuentra a alguien nuevo en la puerta. Hoy no tiene dónde
-- anotarlo: la única forma de darlo de alta es Administración, y la ficha pide el
-- código del trabajador, que es la llave de TODO lo demás (tarjetas,
-- asistencia, EPP, herramientas, planillas).
--
-- Así que la pregunta no es "dónde lo anoto", sino "quién le pone el código".
--
-- -------------------------------------------------------------------
-- POR QUÉ UNA TABLA NUEVA Y NO UNA COLUMNA EN TRABAJADORES
-- ---------------------------------------------------------
-- Porque un ingreso a medio hecho NO es un trabajador.
--
-- Si fuera una fila de trabajadores con estado "pendiente":
--   - el código existiría desde el primer momento, que es justo lo que se
--     quiere que NO pase: lo asigna RRHH;
--   - se podría emitir una tarjeta, registrar asistencia o entregar EPP a
--     alguien que la empresa todavía no contrató;
--   - y la lista de trabajadores de la portería mostraría a un montón de
--     gente que no trabaja ahí.
--
-- Entonces son DOS cosas y no una con dos estados: el PEDIDO (lo escribe el
-- supervisor) y el TRABAJADOR (lo crea RRHH). El pedido se llama
-- "ingresos_pendientes" y guarda quién lo pidió y cuándo, y nunca se mezcla con
-- la lista de trabajadores.
--
-- -------------------------------------------------------------------
-- EL RUT ES LA LLAVE ANTES DEL CÓDIGO
-- ------------------------------------
-- El código no existe todavía, así que no puede ser la llave. El RUT sí: es lo
-- único que el supervisor tiene en la mano y que no cambia después.
--
-- Y es la única defensa contra el problema real de esto: dos supervisores dan
-- de alta a la misma persona el mismo día. Sin ese control, la cola de RRHH
-- tiene dos pedidos del mismo RUT y alguien termina creando dos fichas.
--
-- -------------------------------------------------------------------
-- LO QUE ESCRIBE EL SUPERVISOR Y LO QUE ESCRIBE RRHH
-- --------------------------------------------------
-- El supervisor escribe lo que tiene delante:
--     nombre, rut, telefono, especialidad, empresa, fecha_ingreso, nota
--
-- RRHH escribe el resto, y sobre todo el CÓDIGO:
--     todos los campos de trabajadores, incluido cargo, tipo, supervisor
--
-- El motivo de repartirlo así no es desconfianza. Es que el supervisor no sabe
-- el código, y un código inventado en la puerta colorea todo lo demás: la
-- tarjeta, la asistencia del primer día y el EPP quedan con un número que
-- después hay que corregir, y corregir un código que ya tiene historial es un
-- problema.
--
-- -------------------------------------------------------------------
-- LA APROBACIÓN ES UNA SOLA TRANSACCIÓN
-- -------------------------------------
-- aprobar_ingreso_pendiente() crea el trabajador Y cierra el pedido en la misma
-- transacción. Si el trabajador no se puede crear, el pedido no se cierra.
--
-- Nunca queda un pedido "aprobado" sin trabajador, ni un trabajador creado sin
-- que se sepa de qué pedido vino. El motivo es que el otro estado también es
-- malo: un trabajador sin pedido detrás es alguien que nadie autorizó.
--
-- -------------------------------------------------------------------
-- RLS ENCENDIDO, SIN POLÍTICAS
-- ----------------------------
-- El mismo patrón que la 040, la 041, la 043 y la 044. Se enciende el RLS y no
-- se define ninguna política, así que la puerta son las funciones de abajo.
-- Cada una comprueba su permiso adentro, con las funciones que ya existen.
-- ===================================================================

-- -------------------------------------------------------------------
-- LA TABLA
-- -------------------------------------------------------------------
-- -------------------------------------------------------------------
-- COLUMNA VIEJA: "empresa"

-- -------------------------------------------------------------------
-- SI LA TABLA QUEDO CON LA COLUMNA VIEJA, SE CORRIGE
-- -------------------------------------------------------------------
-- La primera versión usó la columna "empresa", y el editor alcanzó a crear la
-- FUNCIÓN aunque la tabla ya había fallado. Después la tabla quedó bien con
-- "empresa_id", y la función siguió pidiendo una columna que ya no existía:
-- "column empresa of relation ingresos_pendientes does not exist".
--
-- Va en una FUNCIÓN y no en un "do" por dos razones, y las dos_importantes:
--
--   1) El archivo quedó con "do $" y "end $;" — un signo de dollar menos en
--      cada lado. Al aplicarse da "syntax error at or near $" en la palabra
--      "do", que no dice que falte un signo.
--   2) El editor de SQL de Supabase parte el archivo por punto y coma, y un
--      "do" tiene punto y coma ADENTRO: lo corta. Las funciones con cuerpo
--      las respeta, y la llamada es una sentencia de una línea.
create or replace function public.corregir_columna_ingresos()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='ingresos_pendientes'
          and column_name='empresa')
     and not exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='ingresos_pendientes'
          and column_name='empresa_id') then
    alter table ingresos_pendientes rename column empresa to empresa_id;
    return 'se renombro empresa a empresa_id';
  end if;
  if exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='ingresos_pendientes'
          and column_name='empresa_id') then
    return 'la columna empresa_id ya estaba bien';
  end if;
  return 'ATENCION: ingresos_pendientes no tiene ni empresa ni empresa_id';
end;
$$;

-- Y la llamada, que es una sola linea y no se parte
select public.corregir_columna_ingresos();

create table if not exists ingresos_pendientes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  rut           text not null,
  telefono      text,
  especialidad  text,
  empresa_id    integer references empresa(id),
  fecha_ingreso date,
  nota          text,

  -- estado: pendiente = en la cola; aprobado = ya hay trabajador;
  -- rechazado = RRHH no lo aceptó, con su motivo
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobado','rechazado')),
  motivo_rechazo text,

  -- el código que RRHH asignó. Es la prueba de que el pedido se usó, y sirve
  -- para volver del trabajador al pedido sin adivinar
  trabajador_code text,

  -- quién pidió el ingreso. guardó el id aunque el usuario se borre después:
  -- el registro de "quién lo pidió" tiene que sobrevivirle
  pedido_por uuid,
  pedido_por_nombre text,
  pedido_at timestamptz not null default now(),

  -- quién lo resolvió
  resuelto_por uuid,
  resuelto_por_nombre text,
  resuelto_at timestamptz,

  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------
-- UN PEDIDO A LA VEZ POR RUT
-- -------------------------------------------------------------------
-- Un índice PARCIAL: solo cubre los que están en la cola. Una vez aprobado o
-- rechazado, el RUT se puede volver a usar, porque la persona ya tiene ficha (o
-- no se la tendrá nunca) y el dato histórico se queda.
--
-- Es lo que impide el doble ingreso del mismo día. Y como es un índice único,
-- la base lo garantiza sola: no depende de que la aplicación se acuerde de
-- mirar antes.
create unique index if not exists idx_ingresos_pendiente_por_rut
  on ingresos_pendientes (rut)
  where estado = 'pendiente';

-- La cola: pendientes primero, y los más viejos primero. Un pendiente de hace
-- tres semanas está más urgido que uno de hace una hora, no al revés.
create index if not exists idx_ingresos_pendientes_cola
  on ingresos_pendientes (estado, pedido_at);

-- El RLS, encendido y sin políticas. La puerta son las funciones de abajo.
alter table ingresos_pendientes enable row level security;

-- -------------------------------------------------------------------
-- PERMISOS
-- -------------------------------------------------------------------
-- Dos, no uno. "pedir" y "aprobar" son cosas distintas: el que puede
-- Approbar no tiene por qué poder pedir, y al revés.
--
-- Con un solo permiso, o todos los supervisores podrían dar de alta (y el
-- código lo asignaría quien puede), o nadie podría. Con dos, el supervisor
-- pide y RRHH aprueba.
insert into permisos (clave, descripcion, categoria, orden) values
  ('ingresos.pedir', 'Pedir el ingreso de un trabajador nuevo', 'ingresos', 100),
  ('ingresos.aprobar', 'Aprobar o rechazar un ingreso pendiente y asignarle el código', 'ingresos', 101)
on conflict (clave) do nothing;

-- -------------------------------------------------------------------
-- LAS FUNCIONES DE PERMISO, SELF-CONTAINED
-- -------------------------------------------------------------------
-- Se repiten aquí, como hicieron la 020, la 021, la 023, la 024 y las demás.
-- No es duplicación por descuido: cada migración se aplica en una base que
-- puede no tener la anterior. Y si esta dependiera de la 016, aplicarla sola
-- fallaría. Es el patrón del proyecto.
create or replace function public.es_usuario_activo(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles p where p.id = uid and p.activo)
$$;

create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfil_roles r
     where r.user_id = uid and r.rol = 'admin'
  )
$$;

create or replace function public.tiene_permiso(clave text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.perfil_roles pr
      join public.roles_permisos rp on rp.rol = pr.rol
     where pr.user_id = uid
       and rp.permiso = clave
  )
$$;

-- ===================================================================
-- LAS PUERTAS
-- ===================================================================

-- -------------------------------------------------------------------
-- PEDIR UN INGRESO
-- -------------------------------------------------------------------
-- La que llama el supervisor. Devuelve el id del pedido.
--
-- Comprueba el permiso, y comprueba el RUT antes de insertar. La comprobación
-- del RUT es una carrera si dos supervisores lo hacen el mismo instante, y por
-- eso el índice único de arriba es el que manda: si dos entran juntos, el
-- segundo recibe el error de la restricción, no un duplicado silencioso.
create or replace function pedir_ingreso(
  p_nombre       text,
  p_rut          text,
  p_telefono     text default null,
  p_especialidad text default null,
  p_empresa_id   integer default null,
  p_fecha_ingreso date default null,
  p_nota         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre text;
  v_rut text;
begin
  if not (es_usuario_activo() or es_admin() or tiene_permiso('ingresos.pedir')) then
    raise exception 'No tienes permiso para pedir ingresos de trabajadores'
      using errcode = '42501';
  end if;

  v_nombre := btrim(coalesce(p_nombre, ''));
  v_rut    := btrim(coalesce(p_rut, ''));

  if v_nombre = '' then
    raise exception 'Falta el nombre del trabajador' using errcode = '22023';
  end if;
  if v_rut = '' then
    raise exception 'Falta el RUT del trabajador' using errcode = '22023';
  end if;

  -- ¿ya es trabajador? Entonces no hay nada que pedir, y decirlo claro es
  -- mejor que dejar que RRHH descubra un pedido que no hacía falta
  if exists (select 1 from trabajadores t
              where upper(t.rut) = upper(v_rut)
                and t.status = 'activo') then
    raise exception 'Ese RUT ya está en la lista de trabajadores activos'
      using errcode = '22023';
  end if;

  -- ¿ya hay un pedido en la cola? El índice único lo impediría igual, pero
  -- Aquí se dice con palabras. Dejar que el error del índice le llegue a la
  -- persona como una restricción de la base no ayuda a nadie.
  if exists (select 1 from ingresos_pendientes i
              where i.estado = 'pendiente'
                and upper(i.rut) = upper(v_rut)) then
    raise exception 'Ya hay un ingreso pendiente con ese RUT. Espera a que RRHH lo resuelva.'
      using errcode = '22023';
  end if;

  insert into ingresos_pendientes (
    nombre, rut, telefono, especialidad, empresa, fecha_ingreso, nota,
    pedido_por, pedido_por_nombre
  )
  values (
    v_nombre, v_rut,
    nullif(btrim(coalesce(p_telefono, '')), ''),
    nullif(btrim(coalesce(p_especialidad, '')), ''),
    p_empresa_id,
    p_fecha_ingreso,
    nullif(btrim(coalesce(p_nota, '')), ''),
    auth.uid(),
    (select nombre from profiles where id = auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -------------------------------------------------------------------
-- VER LA COLA
-- -------------------------------------------------------------------
-- Quien puede aprobar ve todo. Quien solo puede pedir ve los suyos.
--
-- No es un detalle de cortesía: la lista de pendientes dice de qué empresa es
-- cada persona y cuándo entró. Un supervisor no tiene por qué ver los ingresos
-- de otro.
create or replace function public.ver_ingresos_pendientes()
returns table (
  id            uuid,
  nombre        text,
  rut           text,
  telefono      text,
  especialidad  text,     -- lo que escribe el supervisor, texto libre
  empresa_id    integer,
  fecha_ingreso date,
  nota          text,
  estado        text,
  pedido_por_nombre text,
  pedido_at     timestamptz,
  trabajador_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.nombre, i.rut, i.telefono, i.especialidad, i.empresa_id,
         i.fecha_ingreso, i.nota, i.estado, i.pedido_por_nombre, i.pedido_at,
         i.trabajador_code
    from public.ingresos_pendientes i
   where
     (es_admin() or tiene_permiso('ingresos.aprobar'))
     or i.pedido_por = auth.uid()
   order by (i.estado = 'pendiente') desc, i.pedido_at asc
$$;

-- -------------------------------------------------------------------
-- APROBAR: CREA EL TRABAJADOR Y CIERRA EL PEDIDO, JUNTOS
-- -------------------------------------------------------------------
-- Esta es la función importante. Hace las dos cosas en una transacción, así
-- que no puede quedar ni un trabajador sin pedido ni un pedido sin trabajador.
--
-- El código lo da RRHH y no se toca si ya existe una ficha con ese código: la
-- base lo rechaza y la función lo traduce a un mensaje que se puede entender.
create or replace function aprobar_ingreso_pendiente(
  p_ingreso_id   uuid,
  p_codigo       text,
  p_cargo        text default null,
  p_telefono     text default null,
  p_supervisor_code text default null,
  p_es_supervisor boolean default false,
  p_especialidad text default null,
  p_fecha_ingreso date default null,
  p_rut          text default null,
  p_nota         text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingreso ingresos_pendientes%rowtype;
  v_codigo text;
  v_nombre text;
begin
  if not (es_usuario_activo() or es_admin() or tiene_permiso('ingresos.aprobar')) then
    raise exception 'Solo RRHH puede aprobar ingresos'
      using errcode = '42501';
  end if;

  select * into v_ingreso from ingresos_pendientes where id = p_ingreso_id;
  if not found then
    raise exception 'Ese ingreso pendiente no existe' using errcode = 'P0002';
  end if;
  if v_ingreso.estado <> 'pendiente' then
    raise exception 'Ese ingreso ya fue %', v_ingreso.estado using errcode = '22023';
  end if;

  v_codigo := btrim(coalesce(p_codigo, ''));
  if v_codigo = '' then
    raise exception 'Falta el código del trabajador' using errcode = '22023';
  end if;

  if exists (select 1 from trabajadores t where t.code = v_codigo) then
    raise exception 'El código % ya está en uso por otro trabajador', v_codigo
      using errcode = '22023';
  end if;

  -- ¿El RUT ya quedó en una ficha? Puede haber pasado desde que se pidió el
  -- ingreso: alguien lo cargó en Administración mientras tanto
  if exists (select 1 from trabajadores t
              where upper(coalesce(t.rut, '')) = upper(coalesce(p_rut, v_ingreso.rut, ''))
                and t.status = 'activo'
                and t.code <> v_codigo) then
    raise exception 'Ese RUT ya está en la lista de trabajadores activos'
      using errcode = '22023';
  end if;

  v_nombre := v_ingreso.nombre;

  -- Las dos escrituras, en la misma transacción
  insert into trabajadores (
    code, name, cargo, phone, is_supervisor, supervisor_code,
    especialidad_clave, fecha_ingreso, rut
  )
  values (
    v_codigo, v_nombre,
    nullif(btrim(coalesce(p_cargo, '')), ''),
    nullif(btrim(coalesce(p_telefono, v_ingreso.telefono, '')), ''),
    coalesce(p_es_supervisor, false),
    nullif(btrim(coalesce(p_supervisor_code, '')), ''),
    nullif(btrim(coalesce(p_especialidad, v_ingreso.especialidad, '')), ''),
    coalesce(p_fecha_ingreso, v_ingreso.fecha_ingreso),
    nullif(btrim(coalesce(p_rut, v_ingreso.rut, '')), '')
  );

  update ingresos_pendientes
     set estado = 'aprobado',
         trabajador_code = v_codigo,
         resuelto_por = auth.uid(),
         resuelto_por_nombre = (select nombre from profiles where id = auth.uid()),
         resuelto_at = now()
   where id = p_ingreso_id;

  return v_codigo;
end;
$$;

-- -------------------------------------------------------------------
-- RECHAZAR
-- -------------------------------------------------------------------
-- Rechazar deja el motivo. Un pedido rechazado sin explicación es peor que no
-- tenerlo: el supervisor no sabe qué corregir.
create or replace function rechazar_ingreso_pendiente(
  p_ingreso_id uuid,
  p_motivo     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not (es_usuario_activo() or es_admin() or tiene_permiso('ingresos.aprobar')) then
    raise exception 'Solo RRHH puede rechazar ingresos'
      using errcode = '42501';
  end if;

  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo: el supervisor lo necesita para saber qué corregir'
      using errcode = '22023';
  end if;

  update ingresos_pendientes
     set estado = 'rechazado',
         motivo_rechazo = btrim(p_motivo),
         resuelto_por = auth.uid(),
         resuelto_por_nombre = (select nombre from profiles where id = auth.uid()),
         resuelto_at = now()
   where id = p_ingreso_id
  returning estado into v_estado;

  if v_estado is null then
    raise exception 'Ese ingreso pendiente no existe' using errcode = 'P0002';
  end if;
  if v_estado <> 'rechazado' then
    raise exception 'Ese ingreso ya estaba resuelto' using errcode = '22023';
  end if;
end;
$$;

-- -------------------------------------------------------------------
-- CORREGIR UN PEDIDO, POR QUIEN LO PIDIÓ
-- -------------------------------------------------------------------
-- El supervisor se equivocó en el teléfono. Mientras está en la cola, se
-- corrige. Una vez resuelto, no: el pedido es el historia de lo que pasó.
create or replace function corregir_ingreso_pendiente(
  p_ingreso_id   uuid,
  p_nombre       text default null,
  p_telefono     text default null,
  p_especialidad text default null,
  p_fecha_ingreso date default null,
  p_nota         text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingreso ingresos_pendientes%rowtype;
begin
  if not (es_usuario_activo() or es_admin()
          or tiene_permiso('ingresos.aprobar')
          or tiene_permiso('ingresos.pedir')) then
    raise exception 'No tienes permiso para corregir ingresos'
      using errcode = '42501';
  end if;

  select * into v_ingreso from ingresos_pendientes where id = p_ingreso_id;
  if not found then
    raise exception 'Ese ingreso pendiente no existe' using errcode = 'P0002';
  end if;
  if v_ingreso.estado <> 'pendiente' then
    raise exception 'Ese ingreso ya fue %: ya no se puede cambiar', v_ingreso.estado
      using errcode = '22023';
  end if;
  -- Quien puede aprobar corrige cualquiera. Quien solo puede pedir, el suyo
  if not (es_admin() or tiene_permiso('ingresos.aprobar'))
     and v_ingreso.pedido_por <> auth.uid() then
    raise exception 'Ese ingreso no lo pediste tú' using errcode = '42501';
  end if;

  update ingresos_pendientes
     set nombre = coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), nombre),
         telefono = coalesce(nullif(btrim(coalesce(p_telefono, '')), ''), telefono),
         especialidad = coalesce(nullif(btrim(coalesce(p_especialidad, '')), ''), especialidad),
         fecha_ingreso = coalesce(p_fecha_ingreso, fecha_ingreso),
         nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_ingreso_id;
end;
$$;

-- -------------------------------------------------------------------
-- DIAGNÓSTICO
-- -------------------------------------------------------------------
-- La misma forma que el resto del proyecto: responde, no repara. Si falta la
-- 046, la aplicación avisa y el resto sigue andando.
create or replace function public.diagnostico_ingresos_pendientes()
returns table (
  existe_tabla     boolean,
  rls_encendido    boolean,
  indice_rut_unico boolean,
  permiso_pedir    boolean,
  permiso_aprobar  boolean,
  columnas_trabajadores boolean
)
language sql
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='ingresos_pendientes'),
    coalesce((select relrowsecurity from pg_class
               where oid = 'public.ingresos_pendientes'::regclass), false),
    exists (select 1 from pg_indexes
             where schemaname='public' and indexname='idx_ingresos_pendiente_por_rut'),
    exists (select 1 from public.permisos where clave = 'ingresos.pedir'),
    exists (select 1 from public.permisos where clave = 'ingresos.aprobar'),
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='trabajadores' and column_name='especialidad')
$$;

grant execute on function public.pedir_ingreso(text,text,text,text,integer,date,text) to authenticated;
grant execute on function public.aprobar_ingreso_pendiente(uuid,text,text,text,text,boolean,text,date,text,text) to authenticated;
grant execute on function public.rechazar_ingreso_pendiente(uuid,text) to authenticated;
grant execute on function public.corregir_ingreso_pendiente(uuid,text,text,text,date,text) to authenticated;
grant execute on function public.ver_ingresos_pendientes() to authenticated;
grant execute on function public.diagnostico_ingresos_pendientes() to authenticated;
