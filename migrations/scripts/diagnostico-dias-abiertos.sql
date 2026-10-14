-- ===================================================================
-- diagnostico-dias-abiertos.sql
-- ===================================================================
-- LOS 13 DÍAS ABIERTOS: ¿QUIÉN, QUÉ DÍA, Y CÓMO ENTRARON
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- POR QUÉ
-- ---------------------------------------------------------------------
--
-- El conteo de la pantalla de asistencia diaria dice:
--
--     Filas con días abiertos: 7 personas (13 días abiertos en total)
--     El más antiguo: 28-09-2026
--     Promedio de días abiertos por persona: 1.9
--
-- **Las 7 personas del equipo.** Siete de siete. Y todos empiezan el 28-09, el
-- mismo día.
--
-- Siete atrasos tienen fechas distintas. Siete personas con días abiertos
-- desde el MISMO día, eso no son siete problemas de siete personas: es un
-- problema de uno solo, del sistema, que pasó un día.
--
-- Y hasta ahora, cada una de esas filas Sale en amarillo en la pantalla
-- diciendo "salida pendiente". O sea que hoy la aplicación le está mostrando a
-- siete personas un problema que ellas no causaron.
--
-- ---------------------------------------------------------------------
-- LO QUE ESTE ARCHIVO NO HACE
-- ---------------------------------------------------------------------
--
-- No borra nada. No cambia nada. Solo mira. Todas son consultas de lectura.
--
-- La primera parte dice QUÉ PASA. La segunda parte dice CÓMO PASÓ, que es lo que
-- decide qué se corrige. Y la tercera dice qué se puede borrar, sin borrarlo.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ "ORIGEN" ES LA COLUMNA MÁS INTERESANTE
-- ---------------------------------------------------------------------
--
-- Porque "marcajes" tiene un "origen" que dice de dónde salió cada marcaje:
--
--     'qr'      lo pasó la persona con su tarjeta
--     'manual'  lo escribió el supervisor a mano
--     'excel'   vino de la importación del reloj
--     'porteria' lo anotó portería
--     'app'     desde la aplicación
--
-- Y hay un índice único en (code, fecha, tipo): a lo más una entrada y una
-- salida por día. Si una importación metió entradas de un día y las salidas se
-- perdieron, el origen va a delatarlo: van a ser todas 'excel' del mismo día.
--
-- ---------------------------------------------------------------------
-- CÓMO SE USA
-- ---------------------------------------------------------------------
--
-- Pegá esto en el SQL Editor y corrélo. Mandame los resultados en orden.
--
-- Si un solo paso da error, corré los demás igual: cada bloque es independiente.

-- ===================================================================
-- 1. LOS DÍAS ABIERTOS, UNA FILA POR DÍA
-- ===================================================================
--
-- Esta es la lista que hay que mirar. Si hay trece filas y todas dicen 'excel'
-- con la misma fecha, ya se sabe qué pasó sin mirar nada más.
--
-- Y la columna "diagnostico" intenta dizer en una línea qué le pasó a ese día, que
-- es lo que uno quiere saber antes de decidir qué hacer.
select
  e.code                                          as code,
  t.name                                          as nombre,
  e.fecha                                         as fecha,
  e.hora                                          as entrada,
  e.origen                                        as origen_entrada,
  case
    when e.fecha = (select min(fecha) from public.marcajes
                    where tipo = 'entrada' and origen = 'excel')
      then 'PRIMER DIA IMPORTADO: el reloj mandó entradas y no mandó salidas'
    when e.origen = 'excel' and s.id is null
      then 'entrada de Excel sin salida de Excel'
    when e.origen = 'excel'
      then 'entrada de Excel; la salida de ese día tiene otro origen'
    when e.origen = 'manual'
      then 'ENTRADA ESCRITA A MANO: alguien anotó y nunca anotó la salida'
    else 'entrada normal sin salida'
  end                                             as diagnostico,
  s.hora                                          as salida_que_existe,
  s.origen                                        as origen_salida
from public.marcajes e
join public.trabajadores t on t.code = e.code
left join public.marcajes s
       on s.code = e.code and s.fecha = e.fecha and s.tipo = 'salida'
where e.tipo = 'entrada'
  and e.fecha < current_date
  and s.id is null
order by e.fecha, e.code;

-- ===================================================================
-- 2. LA MISMA COSA CONTADA, PARA VER SI ES UN DÍA O UNA ÉPOCA
-- ===================================================================
--
-- Esto responde una sola pregunta: ¿estos 13 días son un día suelto que se
-- rompió, o se vienen rompiendo hace semanas?
--
-- Si acá sale UNA sola fecha con 13 filas, es un solo día roto.
-- Si salen varias fechas repartidas, se está roto de forma sostenida y hay que
-- buscar el motivo antes de borrar nada.
select
  e.fecha                                         as fecha,
  count(*)                                        as entradas_sin_salida,
  count(distinct e.code)                          as personas,
  count(*) filter (where e.origen = 'excel')      as de_excel,
  count(*) filter (where e.origen = 'qr')         as de_qr,
  count(*) filter (where e.origen = 'manual')     as a_mano,
  min(e.hora)                                     as entrada_mas_temprana,
  max(e.hora)                                     as entrada_mas_tarde
from public.marcajes e
left join public.marcajes s
       on s.code = e.code and s.fecha = e.fecha and s.tipo = 'salida'
where e.tipo = 'entrada'
  and e.fecha < current_date
  and s.id is null
group by e.fecha
order by e.fecha;

-- ===================================================================
-- 3. CÓMO ESTÁ LA IMPORTACIÓN DE ESOS DÍAS
-- ===================================================================
--
-- Porque si el reloj mandó entradas y no salidas, la pregunta siguiente es si las
-- mandó de verdad o si las que faltaban se perdieron al importar.
--
-- "marcajes_importaciones" (020_rut_importacion_marcajes.sql) es la tabla que
-- lleva el rastro de cada archivo importado. Si esa tabla tiene una importación
-- del 28-09 con menos salidas que entradas, el problema está en el archivo.
--
-- Y POR QUÉ NO HAY "ORDER BY"
--
-- Porque no se verificó cómo se llama la columna de fecha en esa tabla, y un
-- "order by" sobre una columna que no existe es un error que corta el archivo.
-- Con "limit 10" alcanza: lo que interesa es si hay una importación reciente, y
-- el orden exacto lo puede poner quien lo lea.
select *
from public.marcajes_importaciones
limit 10;

-- ===================================================================
-- 4. LO QUE HAY EN ESOS DÍAS, PARA VER SI FALTA LA SALIDA O FALTA EL DÍA
-- ===================================================================
--
-- Un día puede quedar abierto de dos maneras muy distintas:
--
--   a) la persona entró a las 08:00 y nunca hay salida -> le faltó fichar la salida
--   b) no hay nada de ese día -> ese día nunca se registró
--
-- Y la diferencia importa mucho: a) se resuelve preguntándole a la persona;
-- b) se resuelve mirando el archivo de Excel.
--
-- Con esta consulta se ve cuál de las dos es.
select
  e.fecha                                         as fecha,
  e.code                                          as code,
  t.name                                          as nombre,
  count(m.id)                                     as marcajes_ese_dia,
  count(m.id) filter (where m.tipo = 'entrada')   as entradas,
  count(m.id) filter (where m.tipo = 'salida')    as salidas,
  string_agg(distinct m.origen, ',')              as origenes
from public.marcajes e
join public.trabajadores t on t.code = e.code
left join public.marcajes m on m.code = e.code and m.fecha = e.fecha
where e.tipo = 'entrada' and e.fecha < current_date
group by e.fecha, e.code, t.name
having count(m.id) filter (where m.tipo = 'salida') = 0
order by e.fecha, e.code;

-- ===================================================================
-- 5. LA LISTA DE LO QUE SE PODRÍA BORRAR, SIN BORRAR NADA
-- ===================================================================
--
-- Lo que se está mostrando en amarillo son estas filas. Cuando se decida qué
-- hacer, la corrección va sobre "marcajes" y es un borrado o un cierre, y las dos
-- cosas las tiene que autorizar una persona: no lo hace este archivo.
--
-- ⚠️ ESTE BLOQUE NO HACE NADA. Está comentado a propósito, y es el ÚNICO bloque
-- de todo el archivo que escribe algo. Si lo descomentás, borra datos reales.
--
--   delete from public.marcajes
--    where tipo = 'entrada'
--      and fecha < current_date
--      and code in ('<code>','<code>')
--      and not exists (select 1 from public.marcajes s
--                       where s.code = marcajes.code
--                         and s.fecha = marcajes.fecha
--                         and s.tipo = 'salida');
--
-- Y POR QUÉ ESTÁ AL FINAL Y COMENTADO
--
-- Porque el archivo entero es de mirar. Si el borrado estuviera arriba, con un
-- error de sintaxis y un "Run" sobre el texto seleccionado se podría ejecutar
-- sin querer. Abajo, después de leer los cinco resultados, es otra cosa.
