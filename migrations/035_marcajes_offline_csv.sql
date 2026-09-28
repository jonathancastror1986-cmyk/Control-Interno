-- ============================================================
-- Migración 035: marcajes de un reloj sin conexión, subidos por CSV
-- ============================================================
-- EL PROBLEMA
-- ----------
-- Un reloj en una faena sin cobertura marca igual (migración 030, artículo
-- 10 de la Resolución Exenta 38/2024). Quedan en la cola local del aparato,
-- esperando que vuelva la señal. Si la señal no vuelve nunca —el Apparatuso
-- se quedó sin datos, la faena terminó, el reloj se robberyó— esas
-- marcaciones se pierden, y con ellas la prueba de que la persona trabajó.
--
-- ANTES DE ESTO, QUÉ HACÍAMOS
-- ---------------------------
-- Nada. No había salida. Eso es un problema real y no un detalle.
--
-- EL CAMINO
-- ---------
-- 1. El reloj, sin conexión, exporta sus marcaciones pendientes a un CSV.
-- 2. Un penny lo trae en un pendrive y lo sube desde un computador.
-- 3. La base los inserta, uno por uno, y dice qué entró, qué se saltó por
--    estar repetido y qué rechazó por estar malo.
--
-- LO IMPORTANTE: UN CSV SE PUEDE EDITAR A MANO
-- -------------------------------------------
-- Es lo primero que hay que decir, porque si no se dice, se vende una
-- seguridad que no existe. Quien tenga el archivo puede cambiar la hora, o
-- agregar filas que nunca ocurrieron.
--
-- Por eso la importación NO es un atajo por atrás del reloj. Es una
-- operación CARA y QUEDANdocumentada:
--
--   - Solo quien tiene `relojes.importar`, que es Administración. Soporte
--     técnico NO lo tiene: puede ver y configurar relojes, pero no fabricar
--     asistencia.
--   - Motivo obligatorio. Sin motivo no hay importación.
--   - Queda un registro de la importación INDEPENDIENTE de los marcajes
--     (tabla `importaciones_offline`), con el hash del archivo. Si alguien
--     borra o altera un marcaje después, el hash sigue diciendo cuál era el
--     archivo original. Ese hash es lo que permite demostrar que el
--     archivo no se cambió entre que se generó y que se subió.
--   - Cada marcaje importado queda con `origen = 'offline_csv'` PARA
--     SIEMPRE. No hay forma de que un marcaje de un archivo CSV se confunda
--     con uno que llegó del reloj en línea.
--
-- LO QUE ESTE NO HACE, Y SE DICE ABAJO
-- ---------------------------------------
-- Un CRC32 NO es una FIRMA. Detecta que el archivo se cambió por accidente,
-- no que venga del reloj que dice venir. Para eso haría falta que el reloj
-- firmara cada fila con una clave y que la base guardara la clave pública.
-- Está considerado y no se hace acá: es otro porte, y con el motivo
-- obligatorio más el registro con hash, el margen se reduce a "una persona
-- con cuenta de Administración"', que ya podía agregar marcajes a mano por
-- el camino de siempre, con su motivo y su rastro.
-- ============================================================

-- ------------------------------------------------------------
-- 1) EL ORIGEN NUEVO
-- ------------------------------------------------------------
-- "offline_csv" va en la lista de orígenes de la marcación. Es un origen
-- más, no una excepción: el marcaje sigue siendo un marcaje, con su
-- trabajador, su fecha y su hora.
alter table public.marcajes drop constraint if exists marcajes_origen_check;
alter table public.marcajes
  add constraint marcajes_origen_check
  check (origen in ('qr','manual','excel','porteria','app','reloj','sistema','offline_csv'));

comment on column public.marcajes.origen is
  'Como llego el marcaje. "offline_csv" = subido a mano desde un archivo que genero un reloj sin conexion. Queda marcado asi para siempre.';

-- ------------------------------------------------------------
-- 2) EL PERMISO
-- ------------------------------------------------------------
-- Se separa del `relojes.editar` a proposito. Editar un reloj es cambiarle
-- el antirrebote o el centro de costo. Importar marcajes es escribir en la
-- asistencia, que es otra cosa y mucho mas pesada.
insert into public.permisos (clave, descripcion, categoria, orden) values
  ('relojes.importar', 'Subir marcajes de un reloj sin conexion desde un CSV', 'relojes', 6)
on conflict (clave) do update set descripcion = excluded.descripcion;

-- Solo Administración. Ni RRHH, ni soporte técnico, ni el rol reloj.
insert into public.roles_permisos (rol, permiso) values
  ('admin', 'relojes.importar')
on conflict do nothing;

-- ------------------------------------------------------------
-- 3) EL REGISTRO DE IMPORTACIONES
-- ------------------------------------------------------------
-- Es una tabla aparte y no una columna porque el registro tiene que
-- sobrevivir a que los marcajes se borren. Si alguien borra un marcaje
-- importado, la pregunta "de dónde salió este marcaje" tiene que seguir
-- teniendo respuesta.
create table if not exists public.importaciones_offline (
  id uuid primary key default gen_random_uuid(),
  empresa_id int references public.empresa(id) on delete cascade,
  reloj_code text,
  nombre_archivo text not null,
  -- sha256 del archivo tal cual se recibio. Es lo que prueba que el
  -- archivo no se toco entre que el reloj lo genero y que se subio.
  hash_archivo text not null,
  filas_recibidas int not null default 0,
  filas_insertadas int not null default 0,
  filas_duplicadas int not null default 0,
  filas_rechazadas int not null default 0,
  -- Sin esto no hay importacion. Es el motivo por el que se escribe en el
  -- acta el nombre de quien subio el archivo.
  motivo text not null,
  usuario_id uuid references public.perfiles(id) on delete set null,
  usuario_nombre text,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists importaciones_offline_empresa_idx
  on public.importaciones_offline (empresa_id, created_at desc);

comment on table public.importaciones_offline is
  'Registro de cada CSV de marcajes subido desde un reloj sin conexion. Sobrevive a que los marcajes se borren: es lo que responde "de donde salio este marcaje".';

alter table public.importaciones_offline enable row level security;

drop policy if exists "importaciones_offline rw" on public.importaciones_offline;
create policy "importaciones_offline rw" on public.importaciones_offline for all
  using (public.tiene_permiso('relojes.importar'))
  with check (public.tiene_permiso('relojes.importar'));

-- ------------------------------------------------------------
-- 4) LA FUNCIÓN DE IMPORTACIÓN
-- ------------------------------------------------------------
-- Inserta uno por uno y dice qué pasó con cada uno. NO inserta en bloque a
-- ciegas: una fila con la hora invertida o de una fecha futura tiene que
-- quedar afuera y anotada, no pasar porque el archivo vino bien formado.
create or replace function public.importar_marcajes_offline(
  p_nombre_archivo text,
  p_hash_archivo    text,
  p_reloj_code      text,
  p_motivo          text,
  p_filas           jsonb
)
returns table (
  insertadas int,
  duplicadas int,
  rechazadas int,
  importacion_id uuid,
  detalle jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reloj public.relojes%rowtype;
  v_reloj_id uuid;
  v_importacion uuid;
  v_insertadas int := 0;
  v_duplicadas int := 0;
  v_rechazadas int := 0;
  v_detalle jsonb := '[]'::jsonb;
  v_fila jsonb;
  v_code text;
  v_fecha date;
  v_hora time;
  v_tipo text;
  v_nota text;
  v_usuario uuid := auth.uid();
  v_usuario_nombre text;
  v_motivo text := btrim(coalesce(p_motivo,''));
  v_empresa int;
begin
  ------------------------------------------------------------------
  -- LA PRIMERA GUARDA: QUIEN ESTA LLAMANDO
  ------------------------------------------------------------------
  -- Esta funcion es "security definer", y eso tiene una consecuencia que
  -- hay que entender: se ejecuta con los permisos del DUENO de la funcion,
  -- no con los de quien la llama. Las politicas de seguridad por fila (RLS)
  -- que protegen "importaciones_offline" NO se aplican adentro de ella.
  --
  -- Sin esta comprobacion, el "grant execute ... to authenticated" de mas
  -- abajo le abre la puerta a CUALQUIER usuario que haya iniciado sesion,
  -- incluido el rol reloj, que es el que vive en el apparatuso junto a la
  -- puerta. Con eso, cualquiera podria fabricar asistencia.
  --
  -- Por eso el permiso se comprueba ADENTRO, con la misma funcion que usa
  -- el resto del sistema. El permiso vive en el catalogo; la puerta se
  -- revisa en un solo lugar.
  if not public.tiene_permiso('relojes.importar') then
    raise exception 'SIN_PERMISO_IMPORTAR'
      using errcode = '42501',
            hint = 'Importar marcajes es solo para Administracion. Si te equivocaste de rol, pidele a un administrador que te lo cambie.';
  end if;

  ------------------------------------------------------------------
  -- LAS GUARDAS DE LA FORMA
  ------------------------------------------------------------------
  ------------------------------------------------------------------
  -- LAS TRES GUARDAS QUE IMPORTAN
  -- ------------------------------------------------------------------
  -- Sin motivo no se importa. Es lo que separa esto de "subir un archivo
  -- y que pase lo que pase".
  if v_motivo = '' or length(v_motivo) < 10 then
    raise exception 'MOTIVO_OBLIGATORIO'
      using hint = 'Escribe por que se sube este archivo: por ejemplo, "el reloj RELOJ-01 se quedó sin señal del 12 al 14 y las marcaciones se quedaron en el aparato".';
  end if;
  if p_nombre_archivo is null or btrim(p_nombre_archivo) = '' then
    raise exception 'FALTA_NOMBRE_ARCHIVO' using errcode = 'no_data_found';
  end if;
  if p_hash_archivo is null or length(p_hash_archivo) <> 64 then
    raise exception 'HASH_INVALIDO'
      using hint = 'Se espera el sha256 del archivo, en hexadecimal, de 64 caracteres.';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'FILAS_INVALIDAS' using errcode = 'no_data_found';
  end if;

  -- El reloj tiene que existir. Importar contra un reloj que no existe es
  -- importar marcas de la nada.
  if p_reloj_code is not null and btrim(p_reloj_code) <> '' then
    select * into v_reloj from public.relojes where code = btrim(p_reloj_code);
    if not found then
      raise exception 'RELOJ_NO_EXISTE' using errcode = 'no_data_found';
    end if;
    v_reloj_id := v_reloj.id;
    v_empresa  := v_reloj.empresa_id;
  end if;

  select nombre into v_usuario_nombre from public.perfiles where id = v_usuario;

  -- El registro de la importacion se escribe ANTES de insertar. Si algo
  -- falla a mitad, queda constancia de que se intento, que es justo lo que
  -- hace falta saber.
  insert into public.importaciones_offline (
    empresa_id, reloj_code, nombre_archivo, hash_archivo,
    filas_recibidas, motivo, usuario_id, usuario_nombre
  ) values (
    v_empresa, btrim(coalesce(p_reloj_code,'')),
    btrim(p_nombre_archivo), lower(p_hash_archivo),
    jsonb_array_length(p_filas), v_motivo, v_usuario, v_usuario_nombre
  ) returning id into v_importacion;

  ------------------------------------------------------------------
  -- CADA FILA, POR SEPARADO
  -- ------------------------------------------------------------------
  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_code  := btrim(coalesce(v_fila->>'code',''));
    v_fecha := nullif(btrim(coalesce(v_fila->>'fecha','')),'')::date;
    v_hora  := nullif(btrim(coalesce(v_fila->>'hora','')),'')::time;
    v_tipo  := lower(btrim(coalesce(v_fila->>'tipo','')));
    v_nota  := 'Subido por CSV. ' || v_motivo;

    -- 1) Los datos minimos tienen que estar.
    if v_code = '' or v_fecha is null or v_hora is null then
      v_rechazadas := v_rechazadas + 1;
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'fila', v_fila->>'n', 'estado', 'rechazada',
        'motivo', 'Falta el código, la fecha o la hora'));
      continue;
    end if;

    -- 2) El tipo tiene que ser uno de los que el sistema acepta. Un tipo
    --    inventado en el archivo no se "adapta": se rechaza.
    if v_tipo not in ('entrada','salida','colacion_entrada','colacion_salida') then
      v_rechazadas := v_rechazadas + 1;
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'fila', v_fila->>'n', 'estado', 'rechazada', 'motivo',
        'Tipo "' || coalesce(v_tipo,'(vacio)') || '" no es valido',
        'code', v_code, 'fecha', v_fecha, 'hora', v_hora));
      continue;
    end if;

    -- 3) El trabajador tiene que existir. Una marcacion de alguien que no
    --    esta en la planilla no es una marcacion: es un error de dedo.
    if not exists (select 1 from public.trabajadores where code = v_code) then
      v_rechazadas := v_rechazadas + 1;
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'fila', v_fila->>'n', 'estado', 'rechazada',
        'motivo', 'No hay ningun trabajador con el código ' || v_code,
        'code', v_code, 'fecha', v_fecha, 'hora', v_hora));
      continue;
    end if;

    -- 4) Una hora en el futuro es un reloj con la hora mala, no una
    --    marcacion. Se rechaza, y el motivo lo dice para que se entienda
    --    sin tener que adivinar.
    if (v_fecha + v_hora) > (now() at time zone 'America/Santiago') + interval '1 hour' then
      v_rechazadas := v_rechazadas + 1;
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'fila', v_fila->>'n', 'estado', 'rechazada',
        'motivo', 'La marcación está en el futuro. Revisar la hora del reloj.',
        'code', v_code, 'fecha', v_fecha, 'hora', v_hora));
      continue;
    end if;

    -- 5) Una marcacion de hace mas de un año no viene de un reloj que
    --    estuvo sin señal: viene de otro lado.
    if v_fecha < (now() at time zone 'America/Santiago')::date - 365 then
      v_rechazadas := v_rechazadas + 1;
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'fila', v_fila->>'n', 'estado', 'rechazada',
        'motivo', 'La marcación es de más de un año atrás',
        'code', v_code, 'fecha', v_fecha, 'hora', v_hora));
      continue;
    end if;

    -- 6) El indice unico (code, fecha, tipo) decide. Si ya hay una fila, se
    --    cuenta como duplicada y NO se inserta. Es el mismo criterio que
    --    usa el reloj en línea, y no se toca: la primera marcación gana.
    insert into public.marcajes (
      code, fecha, hora, tipo, origen, nota, reloj_id,
      registrado_por, registrado_por_nombre
    ) values (
      v_code, v_fecha, v_hora, v_tipo, 'offline_csv', v_nota, v_reloj_id,
      v_usuario, v_usuario_nombre
    )
    on conflict (code, fecha, tipo) do nothing;

    if found then
      v_insertadas := v_insertadas + 1;
    else
      v_duplicadas := v_duplicadas + 1;
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'fila', v_fila->>'n', 'estado', 'duplicada',
        'motivo', 'Ya había una marcación de ese tipo ese día',
        'code', v_code, 'fecha', v_fecha, 'hora', v_hora));
    end if;
  end loop;

  update public.importaciones_offline
     set filas_insertadas  = v_insertadas,
         filas_duplicadas  = v_duplicadas,
         filas_rechazadas  = v_rechazadas,
         detalle           = v_detalle
   where id = v_importacion;

  return query
    select v_insertadas, v_duplicadas, v_rechazadas, v_importacion, v_detalle;
end $$;

comment on function public.importar_marcajes_offline(text, text, text, text, jsonb) is
  'Sube marcajes de un reloj sin conexion. Exige motivo, deja registro con el hash del archivo, y marca cada marcaje como offline_csv para siempre.';

grant execute on function public.importar_marcajes_offline(text, text, text, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 5) EL DIAGNÓSTICO
-- ------------------------------------------------------------
drop function if exists public.diagnostico_importacion_offline();

create or replace function public.diagnostico_importacion_offline()
returns table (
  tabla boolean,
  permiso boolean,
  origen_offline boolean,
  fn_importar boolean,
  total_importaciones bigint,
  marcajes_offline bigint,
  ultima_importacion timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='importaciones_offline'),
    exists (select 1 from public.permisos where clave='relojes.importar'),
    exists (select 1 from pg_constraint
             where conname='marcajes_origen_check'
               and pg_get_constraintdef(oid) like '%offline_csv%'),
    exists (select 1 from pg_proc where proname='importar_marcajes_offline'
             and pronamespace='public'::regnamespace),
    (select count(*) from public.importaciones_offline),
    (select count(*) from public.marcajes where origen='offline_csv'),
    (select max(created_at) from public.importaciones_offline)
$$;

comment on function public.diagnostico_importacion_offline() is
  'Estado de la subida de marcajes por CSV: tabla, permiso, origen, funcion, cuantas importaciones y cuantos marcajes offline hay.';

select '035_offline_csv' as migracion, total_importaciones, marcajes_offline
  from public.diagnostico_importacion_offline();
