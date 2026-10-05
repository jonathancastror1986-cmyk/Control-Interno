-- ===================================================================
-- 078  EL NORMALIZADOR DE RUT
-- ===================================================================

-- Corre esto ENTERO en el editor SQL de Supabase.

-- ---------------------------------------------------------------------
-- QUE FALTA
-- ---------------------------------------------------------------------

-- La 020_rut_importacion_marcajes.sql creo la columna trabajadores.rut y sus
-- indices, y no escribio COMO se compara un RUT con otro. Cada pantalla que cruza
-- RUT lo hace a su manera, y esas maneras no coinciden:

--     "11.285.312-K"    con puntos
--     "11285312-K"     sin puntos
--     "11285312k"      sin guion
--     " 11285312-K "   con espacios

-- Es el mismo RUT escrito de cuatro maneras, y lo normal es que dos de ellas no
-- se comparen iguales.

-- Y UN CRUCE QUE NO ENCUENTRA A NADIE NO DICE NADA

-- Una consulta que no encuentra filas no es un error: devuelve cero y el programa
-- sigue adelante. Por eso esto no se descubre nunca por una falla, sino meses
-- despues, cuando alguien pregunta por que no se importo nada.

-- ===================================================================
-- 1) EL DIGITO VERIFICADOR
-- ===================================================================

-- Y EL "-K" NO ES OTRA FORMA DE ESCRIBIRLO: ES EL DIGITO 10

-- Eso es lo que confunde. "11285312-K" no es una forma corta de "11285313-4": el
-- K es el valor 10 del digito, y el cuerpo del RUT sigue siendo el mismo. Un RUT
-- con cuerpo 11285312 SIEMPRE termina en K.

-- Por eso normalizar es CALCULARLO, y no cambiar una letra por un numero.

-- El algoritmo es el del modulo 11: los pesos 2, 3, 4, 5, 6 y 7 se aplican de
-- derecha a izquierda sobre el cuerpo, se suman, y el digito es 11 menos el resto.

-- Y CON TRES FINALES, NO UNO, QUE ES DONDE SE CAE ESTE ALGORITMO

--     resto 0  ->  sale 11  ->  se escribe 0
--     resto 1  ->  sale 10  ->  se escribe K

-- Sin recortar esos dos casos, el digito seria un numero de dos cifras y el
-- cruce fallaria justo en los RUT que mas se repiten.

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

  -- De derecha a izquierda. El primer peso es 2 y no 7, porque se empieza por la
  -- ultima cifra del cuerpo.
  for v_i in reverse length(v_cuerpo) .. 1 loop
    v_ch := substr(v_cuerpo, v_i, 1);
    v_suma := v_suma + (v_ch::int * v_peso);
    v_peso := v_peso + 1;
    if v_peso > 7 then v_peso := 2; end if;
  end loop;

  v_dig := 11 - (v_suma % 11);

  -- Y ESTOS DOS CASOS. 11 no es un digito, y 10 se escribe K.
  if v_dig = 11 then v_dig := 0; end if;
  if v_dig = 10 then return 'K'; end if;

  return v_dig::text;
end;
$fn$;

-- ===================================================================
-- 2) EL NORMALIZADOR
-- ===================================================================

-- Y EL GUION SE CONSERVA, Y ESO NO ES UN DETALLE

-- La primera version quitaba TODO lo que no fuera alfanumerico, y eso se llevaba el
-- guion. Con el guion borrado, "11285312-K" quedaba "11285312K", ya no habia forma de
-- separar el cuerpo del digito, y la funcion devolvia nulo.

-- Eso no era un detalle: once de los RUT del archivo terminan en K. Los once habrian
-- quedado sin cruzar con su ficha, sin error y sin aviso, que es la forma mas cara de
-- que una cosa falle.

-- Lo que se quita son los puntos, los espacios y los caracteres de una celda de
-- Excel. El guion se queda, porque es el separador.

create or replace function public.rut_normalizado(rut text)
returns text
language sql
immutable
strict
as $fn$
  -- Y CADA NIVEL LE PONE NOMBRE A SU COLUMNA, QUE ES LO QUE FALTABA
  --
  -- MEDIDO al pegarla: 42883, function pg_catalog.position(record, unknown) does not exist.
  --
  -- Escribir position(chr in limpio) es usar el NOMBRE del CTE, que es una fila, y no su
  -- columna. PostgreSQL lo recibe como record y responde que la funcion no existe. En
  -- JavaScript si funciona, porque alli es un valor: por eso se veia bien probado y se caia
  -- recien al pegarlo.
  --
  -- Y el cross join lateral deja que un nivel use el resultado del anterior sin repetir la
  -- expresion larga cuatro veces.
  select b.cuerpo || chr(45) ||
         case when b.dv = chr(75) then chr(75)
              when b.dv ~ chr(94) || chr(91) || chr(48) || chr(45) || chr(57) || chr(93) || chr(36) then b.dv
              else public.rut_digito_verificador(b.cuerpo) end
    from (
      select upper(regexp_replace(coalesce(rut, ''), '[^0-9A-Z-]', '', 'g')) as t
    ) a
    cross join lateral (
      select case when position(chr(45) in a.t) > 0
                  then left(a.t, position(chr(45) in a.t) - 1)
                  else regexp_replace(a.t, '(K+)$', '') end as cuerpo,
             case when position(chr(45) in a.t) > 0
                  then right(a.t, length(a.t) - position(chr(45) in a.t))
                  when a.t ~ '(K+)$' then 'K'
                  else null end as dv
    ) b
   where b.cuerpo ~ '^[0-9]+$';
$fn$;

comment on function public.rut_normalizado(text) is 'El RUT en una sola forma: cuerpo sin puntos, guion, y el digito como numero o K. El K es el valor 10 del digito, no otra forma de escribirlo, asi que normalizar es CALCULARLO. La usan las dos puntas de cualquier cruce por RUT, y si un lado usa otra regla el cruce falla sin avisar.';

comment on function public.rut_digito_verificador(text) is 'El digito verificador de un cuerpo de RUT, por el modulo 11. Sirve sola para la carga: si la ficha guarda el cuerpo sin el digito, esta devuelve la letra o el numero que le falta.';

-- ===================================================================
-- 3) EL INDICE DEL CRUCE
-- ===================================================================

-- Y VA SOBRE LA EXPRESION, NO SOBRE LA COLUMNA

-- El indice de la 020 esta sobre trabajadores(rut), que sirve para comparar
-- contra el texto crudo. Si el cruce normaliza, ese indice no sirve: PostgreSQL
-- no usa el indice de una columna para responder de una expresion.

create index if not exists trabajadores_rut_normalizado_idx
  on public.trabajadores (public.rut_normalizado(rut));

-- ===================================================================
-- 4) NO SE TOCAN LOS DATOS, Y ESTA ES LA PARTE QUE MAS SE IMPACIENTA POR HACER
-- ===================================================================

-- Se podria escribir un UPDATE que cambie todos los RUT de las fichas a la forma
-- normalizada. NO se hace, por dos razones.

-- La primera es el indice unico de la 020, que prohibe dos fichas con el mismo
-- RUT. Si al normalizar dos RUT que hoy son distintos pasan a ser el mismo -- uno
-- escrito "11.285.312-K" y el otro "11285312k" -- el UPDATE se cae por violacion
-- de unicidad. Y se cae A MEDIAS: unas filas quedan normalizadas y otras no.

-- La segunda es que el RUT guardado es el que se muestra y el que se imprime. Si
-- alguien lo escribio con puntos porque lo copio de un documento, se le cambia el
-- dato que conocia por uno "correcto" que nadie le pidio.

-- Con el indice de arriba, el cruce funciona igual sin tocar un solo dato.

-- ===================================================================
-- 5) QUE PASO, EN UN PANEL
-- ===================================================================

-- Y LA PRIMERA COMPARA LAS TRES FORMAS, PARA VER SI HAY QUE NORMALIZAR ALGUNA

-- Si "como_esta" y "normalizado" son iguales, es que las fichas ya venían limpias.
-- Si son distintos, el cruce los va a encontrar igual, y eso es lo que importa.

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

-- -- Y EL RECUENTO. "ilegible" es el que NO cruza con ninguno, y hay que verlo.
select count(*) filter (where btrim(coalesce(rut,'')) <> '')                            as con_rut,
       count(*) filter (where rut is distinct from public.rut_normalizado(rut)
                          and btrim(coalesce(rut,'')) <> '')                                    as los_que_normaliza,
       count(*) filter (where btrim(coalesce(rut,'')) <> ''
                          and public.rut_normalizado(rut) is null)                               as ilegibles
  from public.trabajadores;

-- -- Y LOS ILEGIBLES, UNO POR RENGLON
select code, nombre, rut
  from public.trabajadores
 where btrim(coalesce(rut,'')) <> ''
   and public.rut_normalizado(rut) is null
 order by code;
