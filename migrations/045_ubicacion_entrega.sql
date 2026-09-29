-- ===================================================================
-- 045: DÓNDE SE ENTREGÓ EL ELEMENTO (pasillo, sector y nivel)
-- ===================================================================
--
-- PARA QUÉ
-- --------
-- "Se entregó EPP" no dice dónde. Cuando hay dos bodegas o la misma se
-- atiende desde más de un punto, el registro no sirve para saber qué se
-- entregó dónde, y un recambio de talla se pierde.
--
-- Los tres van en la MISMA tabla que la entrega, no en otra: pasillo, sector y
-- nivel son UNA ubicación, dividida en tres partes. Si fueran tablas
-- separadas habría que juntar tres consultas para armar una dirección, y con
-- la clave foránea mal puesta quedaría un pasillo sin sector.
--
-- POR QUÉ SOLO TRES COLUMNAS Y NO UNA DIRECCIÓN COMPLETA
-- ------------------------------------------------------
-- Son los tres niveles que la persona ya nombra de memoria en el momento de
-- entregar. Meter más campos (bodega, estante, caja) sería pedirle que escriba
-- cosas que no tiene delante. Si más adelante hacen falta, se agregan; el
-- registro viejo no se rompe porque las columnas quedan en null.
--
-- -------------------------------------------------------------------
-- SE PUEDEN DEJAR VACÍAS
-- -----------------------
-- Sí, y a propósito. Hay entregas que no son en un punto físico: una entrega
-- inicial que hace el menjawab de "\" en la propia obra no tiene pasillo ni
-- sector. Si fueran obligatorias, la gente escribiría cualquier cosa para
-- poder guardar, y un campo obligatorio que se cumple con basura es peor que
-- un campo opcional que a veces falta.
--
-- Lo que NO es opcional en esto sistema es la RACIONALIZACIÓN: nada de esto
-- reemplaza el registro de la entrega. El EPP se entrega porque alguien lo
-- entregó, no porque esté en un pasillo.
--
-- -------------------------------------------------------------------
-- ÍNDICE PARA BUSCAR POR UBICACIÓN
-- -------------------------------
-- La pregunta que va a aparecer es "qué se entregó en el pasillo 4 la semana
-- pasada", y sin índice es un recorrido de toda la tabla.
--
-- Va DESPUÉS del alter table, y no antes. En la primera versión estaba arriba,
-- y las columnas pasillo y sector todavía no existían: PostgreSQL tiró
-- "column does not exist". Peor que un error: el índice sobre columnas
-- inexistentes se lee como que la migración se aplicó bien, porque el
-- "create index" no falla hasta que las columnas están. Orden primero,
-- después índice.

-- ===================================================================
-- RLS, IGUAL QUE EL RESTO
-- ===================================================================
-- Las ocho tablas de 043 y 044 llevan "enable row level security" y NINGUNA
-- política: la puerta son las funciones "security definer". Esta es una tabla
-- que ya existe y ya tiene su RLS; no se toca.
--
-- Lo que sí se hace es dejar constancia de que la puerta sigue siendo la
-- misma, para que nadie agregue una política "para poder leer la ubicación"
-- y con eso abra la tabla entera.
--
-- -------------------------------------------------------------------
-- POR QUÉ NO HAY UNA FUNCIÓN NUEVA PARA ESCRIBIR
-- ------------------------------------------------
-- Las entregas se guardan desde la aplicación con el insert normal, que es lo
-- que ya hacen las demás columnas de esta tabla. Agregar una función
-- "security definer" para escribir la ubicación sería una puerta más que
-- mantener, sin ganar nada: la auditoría de quién entregó ya está en la
-- firma y en el registro de la entrega.

alter table epp_entregas
  add column if not exists pasillo text,
  add column if not exists sector  text,
  add column if not exists nivel   text;

-- Un comentario en la propia columna, que es donde se lee cuando alguien
-- abre la tabla en el editor de Supabase y no tiene el código abierto.
comment on column epp_entregas.pasillo is
  'Pasillo o rack donde se entregó, si aplica. Texto libre: el que use la persona en el momento.';
comment on column epp_entregas.sector is
  'Sector de la planta o del taller. Texto libre.';
comment on column epp_entregas.nivel is
  'Nivel o piso. Texto libre. "Planta baja", "2", "Sótano 1".';

-- El índice, ahora que las columnas existen.
create index if not exists idx_epp_entregas_ubicacion
  on epp_entregas (fecha, sector, pasillo);

-- ===================================================================
-- DIAGNÓSTICO
-- ===================================================================
-- La misma forma que el resto: una función que responde, no que repara. Si
-- falta la 045, la aplicación avisa y sigue guardando la entrega sin la
-- ubicación, en vez de perder la entrega entera.
create or replace function public.diagnostico_ubicacion_entrega()
returns table (
  columna text,
  existe boolean
)
language sql
security definer
set search_path = public
as $$
  select c.nombre, true
  from unnest(array['pasillo', 'sector', 'nivel']) as c(nombre)
  where exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'epp_entregas'
      and column_name = c.nombre
  )
  union all
  select c.nombre, false
  from unnest(array['pasillo', 'sector', 'nivel']) as c(nombre)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'epp_entregas'
      and column_name = c.nombre
  );
$$;

grant execute on function public.diagnostico_ubicacion_entrega() to authenticated;
