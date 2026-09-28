-- ============================================================
-- Migración 017: asistencia diaria con marcaje por tarjeta
-- ============================================================
-- El supervisor necesita ver, día a día, quién de su equipo fichó y
-- quién no. Para eso hasta ahora solo existía la tabla "asistencia",
-- que guarda un estado por trabajador y día: no alcanza para registrar
-- la hora real de entrada ni para saber si alguien marcó dos veces.
--
-- Aquí se agrega "marcajes" (una fila por entrada/salida del día) y la
-- hora de entrada de cada empresa, que es contra la que se calcula el
-- atraso.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 016 -> 017.
-- ============================================================

-- ------------------------------------------------------------
-- 1) HORA DE ENTRADA POR EMPRESA
-- ------------------------------------------------------------
-- Con eso se detecta el atraso: si fichó más tarde que la hora de
-- entrada más la tolerancia, sale la alerta de "debe ir a administración".
-- 08:00 y 10 minutos son valores de partida, se cambian por empresa.
alter table empresa add column if not exists hora_entrada time;
alter table empresa add column if not exists tolerancia_minutos int;

update empresa
   set hora_entrada = coalesce(hora_entrada, time '08:00'),
       tolerancia_minutos = coalesce(tolerancia_minutos, 10)
 where hora_entrada is null or tolerancia_minutos is null;

-- ------------------------------------------------------------
-- 2) MARCAJES
-- ------------------------------------------------------------
-- Un marcaje por tipo y día: la entrada se guarda una sola vez, aunque
-- la tarjeta se escanee varias veces, y la salida es aparte.
create table if not exists marcajes (
  id uuid primary key default gen_random_uuid(),
  code text not null references trabajadores(code) on delete cascade,
  fecha date not null,
  hora time not null,
  tipo text not null check (tipo in ('entrada','salida')),
  origen text not null default 'qr' check (origen in ('qr','manual','excel','porteria','app')),
  nota text,
  registrado_por uuid references perfiles(id) on delete set null,
  registrado_por_nombre text,
  created_at timestamptz not null default now()
);

create unique index if not exists marcajes_unico_dia on marcajes(code, fecha, tipo);
create index if not exists marcajes_fecha on marcajes(fecha);
create index if not exists marcajes_code_fecha on marcajes(code, fecha);

-- ------------------------------------------------------------
-- 3) ALERTAS QUE EL TRABAJADOR DEBE ATENDER
-- ------------------------------------------------------------
-- Lo que ya viene en "trabajadores" (alerta_social, alerta_prevencion y
-- sus notas) se lee al vuelo al momento de escanear, así que no hace
-- falta duplicarlo. Lo que sí queda registrado es a quién se le avisa
-- cada vez, para que la asistente social sepa que su mensaje llegó.
create table if not exists avisos_marcaje (
  id uuid primary key default gen_random_uuid(),
  marcaje_id uuid references marcajes(id) on delete cascade,
  code text not null references trabajadores(code) on delete cascade,
  fecha date not null,
  tipo_alerta text not null check (tipo_alerta in ('atraso','social','prevencion','sin_marcaje','otra')),
  mensaje text not null,
  visto boolean not null default false,
  visto_por uuid references perfiles(id) on delete set null,
  visto_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists avisos_marcaje_fecha on avisos_marcaje(fecha);
create index if not exists avisos_marcaje_vistos on avisos_marcaje(visto) where visto = false;

-- ------------------------------------------------------------
-- 4) ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table marcajes enable row level security;
alter table avisos_marcaje enable row level security;

-- Ambos los escribe quien fichó y los leen los usuarios activos. El
-- frontend además acota por empresa, igual que con los trabajadores.
drop policy if exists "marcajes rw" on marcajes;
create policy "marcajes rw" on marcajes for all
  using (public.es_usuario_activo())
  with check (public.es_usuario_activo());

drop policy if exists "avisos marcaje rw" on avisos_marcaje;
create policy "avisos marcaje rw" on avisos_marcaje for all
  using (public.es_usuario_activo())
  with check (public.es_usuario_activo());
