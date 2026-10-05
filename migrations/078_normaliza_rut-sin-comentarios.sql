create or replace function public.rut_digito_verificador(cuerpo text)
returns text
language plpgsql
immutable
strict
as $fn$
declare
  v_cuerpo text := cuerpo;
  v_suma   int  := 0;
  v_peso   int  := 2;
  v_dig    int;
  v_i      int;
  v_ch     text;
begin
  if v_cuerpo !~ '^[0-9]+$' then
    return null;
  end if;

  for v_i in reverse length(v_cuerpo) .. 1 loop
    v_ch := substr(v_cuerpo, v_i, 1);
    v_suma := v_suma + (v_ch::int * v_peso);
    v_peso := v_peso + 1;
    if v_peso > 7 then v_peso := 2; end if;
  end loop;

  v_dig := 11 - (v_suma % 11);

  if v_dig = 11 then v_dig := 0; end if;
  if v_dig = 10 then return 'K'; end if;

  return v_dig::text;
end;
$fn$;

create or replace function public.rut_normalizado(rut text)
returns text
language plpgsql
immutable
strict
as $fn$
declare
  v_t     text;   -- el RUT limpio, sin puntos ni espacios, CON el guion
  v_cuerpo text;
  v_dv    text;
begin
  v_t := upper(regexp_replace(coalesce(rut, ''), '[^0-9A-Z-]', '', 'g'));

  if position('-' in v_t) > 0 then
    v_cuerpo := left(v_t, position('-' in v_t) - 1);
    v_dv    := right(v_t, length(v_t) - position('-' in v_t));
  else
    v_cuerpo := regexp_replace(v_t, '(K+)$', '');
    v_dv    := null;
  end if;

  if v_cuerpo !~ '^[0-9]+$' then
    return null;
  end if;

  if v_dv = 'K' then
    v_dv := 'K';
  elsif v_dv is null or v_dv !~ '^[0-9]$' then
    v_dv := public.rut_digito_verificador(v_cuerpo);
  end if;

  return v_cuerpo || '-' || v_dv;
end;
$fn$;

comment on function public.rut_normalizado(text) is 'El RUT en una sola forma: cuerpo sin puntos, guion, y el digito como numero o K. El K es el valor 10 del digito, no otra forma de escribirlo, asi que normalizar es CALCULARLO. La usan las dos puntas de cualquier cruce por RUT, y si un lado usa otra regla el cruce falla sin avisar.';

comment on function public.rut_digito_verificador(text) is 'El digito verificador de un cuerpo de RUT, por el modulo 11. Sirve sola para la carga: si la ficha guarda el cuerpo sin el digito, esta devuelve la letra o el numero que le falta.';

create index if not exists trabajadores_rut_normalizado_idx
  on public.trabajadores (public.rut_normalizado(rut));

select code,
       nombre,
       rut                                as como_esta,
       public.rut_normalizado(rut)         as normalizado,
       case when rut is distinct from public.rut_normalizado(rut)
            then 'cambia' else 'igual' end as comparacion
  from public.trabajadores
 where rut is not null and btrim(rut) <> ''
 order by code
 limit 20;

select count(*) filter (where btrim(coalesce(rut,'')) <> '')                            as con_rut,
       count(*) filter (where rut is distinct from public.rut_normalizado(rut)
                          and btrim(coalesce(rut,'')) <> '')                                    as los_que_normaliza,
       count(*) filter (where btrim(coalesce(rut,'')) <> ''
                          and public.rut_normalizado(rut) is null)                               as ilegibles
  from public.trabajadores;

select code, nombre, rut
  from public.trabajadores
 where btrim(coalesce(rut,'')) <> ''
   and public.rut_normalizado(rut) is null
 order by code;
