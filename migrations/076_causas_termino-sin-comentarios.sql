create table if not exists public.causas_termino (
  articulo       text primary key,
  descripcion    text    not null,
  dias_indem_anio numeric(6,2) not null default 0 check (dias_indem_anio >= 0),
  tope_anios     int,
  aviso_previo   boolean not null default false,
  feriado_prop   boolean not null default true,
  base_indem     text    not null default 'ultima' check (base_indem in ('ultima','promedio_3')),
  activa         boolean not null default true,
  orden          int     not null default 0
);

comment on table public.causas_termino is 'Catalogo legal de causales de terminacion, con lo que cada una paga. Es de sistema: no lleva empresa_id. El calculo del finiquito lee dias_indem_anio y tope_anios de aca, y no de una lista escrita en el codigo.';

comment on column public.causas_termino.articulo is 'El articulo, con el numero de tres digitos y el inciso con dos: 159-05, 161-01, 160. Sin Art. adelante y sin espacios, porque es lo que permite comparar y agrupar.';

insert into public.causas_termino
  (articulo, descripcion, dias_indem_anio, tope_anios, aviso_previo, feriado_prop, base_indem, orden)
values
  ('159-05',
   'Indemnizacion por renuncia del trabajador: 2,5 dias por mes de servicio, con tope de 11 anos.',
   2.5, 11, false, true, 'promedio_3', 10),
  ('160',
   'Despido improcedente: PAGA feriado proporcional y NO paga indemnizacion.',
   0, null, false, true, 'ultima', 20),
  ('161-01',
   'Necesidades de la empresa: 1 mes de indemnizacion por ano de servicio, con tope de 11 anos.',
   1.0, 11, true, true, 'ultima', 30),
  ('159-01',
   'REVISAR: articulo 159 numero 1. NO pagar indemnizacion.',
   0, null, false, true, 'promedio_3', 40),
  ('159-02',
   'REVISAR: articulo 159 numero 2. NO pagar indemnizacion.',
   0, null, false, true, 'promedio_3', 50),
  ('159-04',
   'REVISAR: articulo 159 numero 4. NO pagar indemnizacion.',
   0, null, false, true, 'promedio_3', 60),
  ('161-03',
   'REVISAR: articulo 161 numero 3.',
   1.0, null, false, true, 'ultima', 70),
  ('163',
   'REVISAR: articulo 163.',
   1.0, null, false, true, 'ultima', 80),

on conflict (articulo) do nothing;

alter table public.causas_termino enable row level security;

drop policy if exists "causas Terminacion leen" on public.causas_termino;
create policy "causas Terminacion leen" on public.causas_termino for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

do $$
declare
  v_corregidas   int := 0;
  v_sin_catalogo int := 0;
  r record;
begin
  if to_regclass('public.perfiles') is null then
    raise exception 'Falta la tabla perfiles. Aplicar antes la 002_usuarios.sql';
  end if;

  for r in select code, articulo_termino from public.trabajadores
             where status = 'desvinculado'
               and coalesce(btrim(articulo_termino), '') <> ''
  loop
    declare
      v_limpio text := upper(regexp_replace(btrim(r.articulo_termino),
                                '^(art\.?|articulo)\s*', '', 'i'));
      v_corto  text := split_part(v_limpio, '-', 1);
      v_existe boolean;
    begin
      select true into v_existe from public.causas_termino where articulo = v_limpio;
      if v_existe then
        update public.trabajadores set articulo_termino = v_limpio where code = r.code;
        v_corregidas := v_corregidas + 1;
      else
        select true into v_existe from public.causas_termino where articulo = v_corto;
        if v_existe then
          update public.trabajadores set articulo_termino = v_corto where code = r.code;
          v_corregidas := v_corregidas + 1;
        else
          v_sin_catalogo := v_sin_catalogo + 1;
        end if;
      end if;
    end;
  end loop;

  raise notice 'Filas normalizadas: %   Sin catalogar, NO se tocaron: %', v_corregidas, v_sin_catalogo;
end $$;

select coalesce(articulo_termino, '(sin causal)') as articulo,
       count(*)                       as trabajadores,
       string_agg(name,  ' | ' order by name) as quienes
  from public.trabajadores
 where status = 'desvinculado'
   and coalesce(btrim(articulo_termino), '') <> ''
   and upper(btrim(articulo_termino)) not in (select articulo from public.causas_termino)
 group by articulo_termino
 order by count(*) desc;

select articulo, dias_indem_anio, tope_anios, aviso_previo, base_indem,
       left(descripcion, 46) as descripcion
  from public.causas_termino
 order by orden;
