-- ===================================================================
-- 076  EL CATALOGO DE CAUSALES DE TERMINACION
-- ===================================================================

-- Corre esto ENTERO en el editor SQL de Supabase. El panel que queda abierto es el
-- ultimo, y el ultimo es el que dice que paso.

-- ---------------------------------------------------------------------
-- QUE FALTA HOY
-- ---------------------------------------------------------------------

-- La desvinculacion se guarda en dos columnas de texto libre, de la migracion 029:

--     articulo_termino        "160", "Art. 160", "160 "   <- lo que escribio alguien
--     motivo_desvinculacion   "se fue", "renuncia"          <- el motivo, en palabras

-- El texto libre se ensucia rapido: "160", "160 ", "Art. 160" y "art 160" son la misma
-- causal con cuatro nombres. Y el calculo del finiquito tiene que distinguir entre el
-- Art. 159 numero 5, que PAGA indemnizacion, y el Art. 160, que NO la paga. Si la
-- causal llega sucia, la indemnizacion se paga de mas o no se paga nunca.

-- ---------------------------------------------------------------------
-- POR QUE NO SE USA UNA COLUMNA "causal_termino" NUEVA
-- ---------------------------------------------------------------------

-- Porque "articulo_termino" YA ES ESA COSA, y esta llena. Agregar una columna
-- gemela parte los datos en dos y despues no se sabe cual manda. Lo que se hace
-- es atar la columna que ya existe a un catalogo adelante, y leer las filas viejas.

-- ---------------------------------------------------------------------
-- Y POR QUE UN CATALOGO Y NO UN "check"
-- ---------------------------------------------------------------------

-- Porque este catalogo tiene columnas de verdad: dias de indemnizacion por ano,
-- tope en anos, si paga aviso previo y sobre que remuneracion se calcula. Con un
-- "check" esa informacion no cabe, y el calculo la tendria que ir a buscar a otro
-- lado, en el codigo, donde se desincroniza del texto legal.

-- Y no lleva "empresa_id": es la ley, no la politica de una empresa. Se escribe una
-- vez y lo leen todas. Ver la politica de abajo, que es la de un catalogo.

-- ===================================================================
-- 1) EL CATALOGO
-- ===================================================================

-- Y "dias_indem_anio" en 0 NO es lo mismo que null: 0 es "esta causal no indemniza",
-- que es un dato, y null es "no se", que en un calculo legal no puede valer lo
-- mismo que un cero.

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

-- Y LA REGLA DEL 162, QUE ES LA QUE ELIGE LA BASE DE CALCULO

-- Para las causales del Art. 159 la indemnizacion va sobre el promedio de los
-- ultimos tres meses; para el Art. 161 numero 1, sobre la ultima remuneracion
-- devengada. Por eso "base_indem" es una columna y no una regla escrita en el
-- codigo: son dos reglas y cambian, y cuando cambien hay un solo lugar donde
-- cambiarlas.

comment on table public.causas_termino is 'Catalogo legal de causales de terminacion, con lo que cada una paga. Es de sistema: no lleva empresa_id. El calculo del finiquito lee dias_indem_anio y tope_anios de aca, y no de una lista escrita en el codigo.';

comment on column public.causas_termino.articulo is 'El articulo, con el numero de tres digitos y el inciso con dos: 159-05, 161-01, 160. Sin Art. adelante y sin espacios, porque es lo que permite comparar y agrupar.';

-- ===================================================================
-- 2) LO QUE HAY DENTRO, Y QUE TRES ESTAN SIN CONFIRMAR
-- ===================================================================

-- ---------------------------------------------------------------------
-- ESTO ES LO IMPORTANTE Y NO SE DEBE SALTAR
-- ---------------------------------------------------------------------

-- De los ocho articulos, TRES estan certainos: el 159-05, el 160 y el 161-01. Los
-- OTROS CINCO llevan una descripcion que NO afirma que pagan, sino que avisa que
-- hay que revisarlo.

-- Se eligio asi a proposito. Un catalogo con una descripcion inventada es peor
-- que uno con un hueco: el inventado se lee, se copia al documento y se archiva,
-- y el hueco se pregunta. Un "-- revisar --" no se puede archivar por error.

-- Y los que dicen "NO pagar indemnizacion" no necesitan mas que eso para el
-- calculo: el 0 en dias_indem_anio ya esta puesto, y lo que falta confirmar es
-- el inciso, no el monto.

-- Y EL AVISO PREVIO SE DEJA AFUERA DEL CATALOGO A PROPOSITO

-- Porque no es un numero fijo: es 15, 30 o 60 dias segun la antiguedad del
-- trabajador en el momento del termino. Si el valor viviera en el catalogo, el
-- calculo tendria que reescribirlo segun cada persona, y un catalogo es para lo
-- que es igual para todos.

-- Y "aviso_previo" queda en true solo en el 161-01, que es el unico de estos tres
-- que lo trae de forma propia. En el resto se pacta o no se pacta, y eso se
-- pregunta en la pantalla, no se decide aqui.

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

-- Y el "on conflict do nothing": esta migracion se puede volver a correr sin
-- duplicar, y sin pisar una descripcion que alguien ya haya corregido.
on conflict (articulo) do nothing;

-- ===================================================================
-- 3) EL RLS, IGUAL QUE LOS CATALOGOS QUE YA HAY
-- ===================================================================

alter table public.causas_termino enable row level security;

drop policy if exists "causas Terminacion leen" on public.causas_termino;
create policy "causas Terminacion leen" on public.causas_termino for select
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));

-- ===================================================================
-- 4) LAS FILAS VIEJAS, LEIDAS Y NORMALIZADAS
-- ===================================================================

-- ---------------------------------------------------------------------
-- POR QUE HAY QUE LEER LAS VIEJAS, Y ES LO QUE SE SALTA UNO
-- ---------------------------------------------------------------------

-- Porque con el catalogo puesto pero sin corregir, quedan filas con valores que
-- NO estan en el catalogo. Y esas filas son invisibles en el dropdown: el
-- trabajador queda con una causal guardada que el operador no puede ver ni
-- cambiar. Eso es peor que no tener dropdown, porque parece que si.

-- Y el calculo tampoco las encuentra: busca "160" y la fila tiene "Art. 160", y
-- no hay coincidencia. La indemnizacion se deja de pagar, en silencio, y no se
-- ve hasta el reclamo.

-- ---------------------------------------------------------------------
-- Y SE NORMALIZA, NO SE ADIVINA
-- ---------------------------------------------------------------------

-- La funcion saca "Art.", "articulo" y los espacios, y pasa a mayusculas. Si el
-- resultado esta en el catalogo, reescribe la fila. Si NO esta, NO la toca: la
-- deja como estaba y la lista al final. Un texto que no se reconoce es una
-- pregunta para una persona, no un error para que lo resuelva una funcion.

-- Y NUNCA SE BORRA NADA. Esto solo reescribe "articulo_termino"; el
-- "motivo_desvinculacion" queda intacto, porque es texto libre y le pertenece a
-- la empresa.

do $$
declare
  v_corregidas   int := 0;
  v_sin_catalogo int := 0;
  r record;
begin
  -- Sin la tabla de perfiles, la politica de arriba no tiene contra que evaluar y el RLS
  -- queda cerrado para todos, sin avisar. Es el mismo corte que usan las migraciones 070 y 074.
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
      -- Se acepta el articulo pelado si el catalogo lo tiene asi, porque anotar
      -- "159" sin el inciso es comun y no se puede descartar. Pero NO se elige
      -- un inciso al azar cuando hay varios: adivinar el inciso es inventar una
      -- indemnizacion, y eso no lo hace una funcion.
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