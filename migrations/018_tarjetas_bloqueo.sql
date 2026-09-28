-- ============================================================
-- Migración 018: bloqueo de tarjetas al desvincular al trabajador
-- ============================================================
-- El QR de una tarjeta codifica el "id" de la tarjeta, no el código del
-- trabajador. Al escanear se busca la tarjeta y con ella se sabe de qué
-- trabajador es, si la tarjeta sigue vigente y si el trabajador sigue
-- trabajando en la empresa.
--
-- Faltaba el estado "bloqueada": hoy solo existe "anulada", que
-- significa que la tarjeta se perdió o se reemplazó. El bloqueo es otro
-- cosa: la tarjeta está bien, pero el trabajador ya no trabaja acá y no
-- debe servir para pasar asistencia ni para recibir EPP.
--
-- El bloqueo es automático: en cuanto el trabajador queda desvinculado,
-- todas sus tarjetas activas pasan a bloqueadas; si vuelve a estar
-- activo, se desbloquean.
--
-- ES RE-EJECUTABLE. Orden: 001 -> ... -> 017 -> 018.
-- ============================================================

-- ------------------------------------------------------------
-- 1) NUEVOS ESTADOS Y MOTIVOS DE LA TARJETA
-- ------------------------------------------------------------
-- "bloqueada" la pone el sistema sola cuando el trabajador se va.
alter table tarjetas drop constraint if exists tarjetas_estado_check;
alter table tarjetas
  add constraint tarjetas_estado_check
  check (estado in ('activa','anulada','bloqueada'));

alter table tarjetas add column if not exists motivo_bloqueo text;
alter table tarjetas add column if not exists bloqueada_at timestamptz;
alter table tarjetas add column if not exists bloqueada_por uuid references perfiles(id) on delete set null;

-- Índice para la consulta del día a día: tarjetas usables de un trabajador.
create index if not exists tarjetas_code_estado_idx on tarjetas(code, estado);

-- ------------------------------------------------------------
-- 2) BLOQUEO AUTOMÁTICO
-- ------------------------------------------------------------
-- Se dispara con un trigger sobre "trabajadores" para que no importe si
-- el cambio viene de la app, de un UPDATE en SQL o de otra herramienta.
--
-- "desvinculado" es el estado que usa la app para dar de baja a alguien.
create or replace function public.bloquear_tarjetas_por_estado()
returns trigger as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'desvinculado' then
      update public.tarjetas
         set estado = 'bloqueada',
             motivo_bloqueo = 'Trabajador desvinculado',
             bloqueada_at = now()
       where code = new.code
         and estado = 'activa';
    elsif old.status = 'desvinculado' then
      -- volvió a estar activo: las tarjetas que solo estaban bloqueadas
      -- por la desvinculación vuelven a estar usables. Las anuladas por
      -- pérdida o reemplazo se respetan.
      update public.tarjetas
         set estado = 'activa',
             motivo_bloqueo = null,
             bloqueada_at = null
       where code = new.code
         and estado = 'bloqueada'
         and motivo_bloqueo = 'Trabajador desvinculado';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_bloquear_tarjetas on public.trabajadores;
create trigger trg_bloquear_tarjetas
  after update of status on public.trabajadores
  for each row execute function public.bloquear_tarjetas_por_estado();

-- ------------------------------------------------------------
-- 3) ESTADO REAL DE LAS TARJETAS QUE YA EXISTEN
-- ------------------------------------------------------------
-- A los trabajadores que ya estaban desvinculados antes de esta
-- migración, sus tarjetas activas también quedan bloqueadas.
update public.tarjetas t
   set estado = 'bloqueada',
       motivo_bloqueo = 'Trabajador desvinculado',
       bloqueada_at = now()
  from public.trabajadores w
 where t.code = w.code
   and w.status = 'desvinculado'
   and t.estado = 'activa';
