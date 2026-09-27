-- Tarjetas emitidas (temporales y definitivas). El QR y el código de barras
-- de cada tarjeta impresa codifican el "id" de esta tabla, no el código del
-- trabajador. Así, al emitir una tarjeta nueva (por ejemplo pasar de
-- temporal a definitiva, o reimprimir una extraviada) se puede anular la
-- anterior sin que siga funcionando en portería.
--
-- code NO tiene llave foránea a trabajadores a propósito: la tarjeta
-- temporal puede imprimirse antes de guardar al trabajador en el sistema.
create table if not exists tarjetas (
  id text primary key,               -- valor codificado en el QR/código de barras
  code text not null,                -- código del trabajador al que pertenece
  tipo text not null check (tipo in ('temporal','definitiva')),
  estado text not null default 'activa' check (estado in ('activa','anulada')),
  motivo_anulacion text,
  created_at timestamptz not null default now()
);
create index if not exists tarjetas_code_idx on tarjetas(code);
create index if not exists tarjetas_estado_idx on tarjetas(estado);

alter table tarjetas enable row level security;
drop policy if exists "tarjetas rw" on tarjetas;
create policy "tarjetas rw" on tarjetas for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
