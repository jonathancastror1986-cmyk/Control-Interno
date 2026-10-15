# views/administracion/administracion.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ---------------------------------------------------------------------
// LA HORA DE SALIDA DEL TURNO, PARA PODER CERRAR UN DÍA SIN QUE NADIE FICHARA
// ---------------------------------------------------------------------
//
// Y POR QUÉ HACE FALTA UNA FUNCIÓN APARTE
//
// Porque "horaEntradaDe()" ya existe y devuelve '08:00' si la empresa no tiene
// hora puesta. Para la entrada eso está bien: una entrada sin hora configurada
// igual hay que compararla con algo.
//
// Para la salida es distinto, y por eso NO tiene valor por omisión. Si una
// empresa no tiene hora de salida puesta, no se puede inventar una: se cierra el
// día con la hora de la última entrada, que es un dato real, y se avisa que fue
// esa. Poner un '17:00' inventado sería fabricar una hora en un registro que se
// usa para calcular cuántas horas trabajó.
// Y DEVUELVE NULL CUANDO NO HAY, PARA QUE EL QUE CIERRA LO SEPA
```


## undefined

```js
// ---------------------------------------------------------------------
// LAS DOS HORAS DE ENTRADA: LA DEL RELOJ Y LA DEL SUPERVISOR
// ---------------------------------------------------------------------
//
// Y POR QUÉ HAY QUE SEPARARLAS
//
// Porque son dos hechos distintos y la tabla los mezclaba en una sola columna.
//
//   la del reloj     la máquina de la obra leyó la tarjeta. Es un dato.
//   la del supervisor alguien vio a la persona y lo anotó. Es un dato también.
//
// Y al mezclarlas pasaba esto: la columna ENTRADA mostraba una de las dos, sin
// decir cuál, y el "Presente, tarde" se calculaba sobre la que apareciera primero.
// Con la del reloj a las 08:00 y la del supervisor a las 12:21, la fila decía
// "Presente, tarde" — y no se sabía si llegaba tarde o si el supervisor lo vio
// más tarde.
//
// Y LA DECISIÓN, QUE NO ES MÍA
//
// El reloj manda para el atraso, y la del supervisor se muestra aparte. La razón
// es que el reloj no se puede equivocar ni tener mauvaise voluntad: si leyó la
// tarjeta, esa hora es el hecho. La del supervisor es lo que él vio, que puede
// ser más tarde porque llegó después.
//
// ---------------------------------------------------------------------
// QUÉ ES "DEL RELOJ" Y QUÉ ES "DEL SUPERVISOR"
//
// Y POR QUÉ NO SE USA EL NOMBRE DEL ORIGEN SINO LA LISTA
//
// Porque "marcajes.origen" fue creciendo migración por migración: 017 lo creó con
// (qr, manual, excel, porteria, app), 020 le agregó 'reloj', 026 le agregó 'sistema',
// 035 le agregó 'offline_csv'. Un día de estos aparece otro y queda del lado
// equivocado sin que nadie lo note.
//
// Las dos listas están acá, en un solo lugar, y se pueden leer de un vistazo.
```


## undefined

```js
// ---------------------------------------------------------------------
// EL DETALLE DE LOS DÍAS ABIERTOS, DÍA POR DÍA
// ---------------------------------------------------------------------
//
// Y POR QUÉ ESTO ESTÁ EN LA MISCA PANTALLA Y NO EN UNA CONSOLA SUELTA
//
// Porque hasta ahora el conteo decía "7 personas, 13 días abiertos, el más
// antiguo el 28-09" y no decía NI UNO de esos trece días. Con ese dato solo hay
// dos historias posibles —un día que se rompió a todos, o trece atrasos de trece
// personas—, y son cosas COMPLETAMENTE distintas: la primera se arregla en el
// sistema, la segunda hablando con la gente.
//
// Y esa pregunta se contesta mirando la columna "origen" de cada día abierto:
// 'excel' es una importación, 'qr' es que alguien pasó la tarjeta y no volvió a
// pasarla, 'manual' es que alguien lo anotó a mano. Con la lista a la vista se
// sabe en un segundo de dónde vino el problema.
//
// Y POR QUÉ "SALIDAS=0" EN TODOS
//
// Porque "diasSinSalida()" —y por lo tanto el estado "Entró y no fichó salida"—
// busca días con entrada y SIN salida. Cada fila abierta es, por definición, un día
// donde hay una entrada y no hay ninguna salida.
//
// Y ESO ES LO QUE HACE QUE ESTA LISTA SEA MÁS ÚTIL QUE EL CONTEO: si en algún día
// apareciera una salida con "salida pendiente", ahí sí hay un problema de la
// persona y no del sistema, y esa fila se va a ver distinta. Por eso la columna se
// llama así y no "salida pendiente": no promete que falte, muestra lo que hay.
//
// ---------------------------------------------------------------------
```


## undefined

```js
  // Y ANTES DE ESCRIBIR LA ENTRADA DE HOY, SE CIERRAN LOS DÍAS VIEJOS
  //
  // Va primero, y por una razón que parece al revés: una entrada nueva es la
  // señal de que esa persona volvió a la obra. Si tenía días abiertos de antes,
  // esos días ya no están esperando nada: pasaron. Cerrarlos ahora, y no en una
  // tarea aparte, es lo que evita que se acumulen para siempre.
  //
  // Y SOLO CUANDO ES UNA ENTRADA
  //
  // Cuando es una salida no se cierra nada: significaría cerrar el día de hoy con
  // una salida y después marcarla de nuevo, y el día quedaría con dos salidas, que
  // el índice único de (code, fecha, tipo) no deja.
```


## undefined

```js
// ---------------------------------------------------------------------
// EL CIERRE AUTOMÁTICO DE UN DÍA QUE QUEDÓ ABIERTO
// ---------------------------------------------------------------------
//
// Y EL PROBLEMA QUE RESUELVE
//
// La regla de "el siguiente escaneo es la salida" funciona solo si la persona
// vuelve a pasar la tarjeta al salir. Si pasa la tarjeta una sola vez al llegar —
// que es lo normal— ese día queda abierto para siempre. Y como nadie vuelve al
// lector de salida, cada día abierto queda abierto para siempre.
//
// MEDIDO en la base: 50 días abiertos, y CERO salidas registradas en ninguno. El
// 28 de septiembre entraron 35 personas de golpe por la importación del reloj, y
// de ahí en adelante las que pasaron la tarjeta no volvieron a pasarla.
//
// Y POR QUÉ CIERRA CON LA HORA DE SALIDA DEL TURNO, Y NO CON UNA INVENTADA
//
// Porque la hora de salida está configurada por empresa: es "empresa.hora_salida",
// la misma que ya usa el reporte de colación. Si existe, se usa: es la hora en que
// la gente se va, y por lo tanto la hora en que terminó ese día.
//
// Y SI NO ESTÁ CONFIGURADA
//
// No se inventa. Se usa la última entrada que hay de ese día, que es un dato real,
// y la nota lo dice. Poner un '17:00' inventado sería fabricar una hora en un
// registro que después se usa para calcular cuántas horas trabajó, y eso es peor
// que un día visiblemente abierto.
//
// Y LA MARCA DE QUE FUE INFERIDO
//
// El origen es 'sistema', que ya estaba en el "check" de la columna desde la
// migración 026, justamente para esto: un marcaje que no hizo ni el reloj ni una
// persona. Y la nota lo dice en texto, para que quien lo lea no piense que la
// persona se quedó hasta esa hora.
//
// ---------------------------------------------------------------------
```


## undefined

```js
// Formatea una fecha sin arriesgarse a mostrar "Invalid Date" si el dato
// viene vacío o con un formato inesperado.
//
// Ojo con las fechas de Postgres: una columna "date" llega como
// "2026-09-20", y new Date() la interpreta como MEDIANOCHE UTC. En Chile
// eso es el 19 a las 21:00, así que el día se mostría corrido en uno. Por
// eso las fechas "YYYY-MM-DD" se arman a mano en hora local.
// Y CÓMO SE DIBUJA CADA UNA DE LAS DOS HORAS
//
// Y POR QUÉ UNA CELDA CON DOS HORAS EN VEZ DE UNA COLUMNA QUE LAS JUNTE
//
// Porque juntarlas en un renglón obliga a leer una etiqueta chiquita para saber
// cuál es cuál, y con siete personas y cuatro horas en pantalla eso se lee mal.
//
// Y por qué la del reloj va marcada: es la que manda para el atraso, y si se ve
// que una fila tiene dos horas, hay que poder distinguir de un vistazo cuál de
// las dos está mandando. Por eso la del reloj va en negrita y la del supervisor en
// tono bajo, y no al revés.
//
// Y CUANDO SOLO HAY UNA, NO SE DICE DE QUIÉN ES
//
// Porque una sola hora no necesita etiqueta: no hay dos cosas de las que
// distinguir. La etiqueta solo aparece cuando hay las dos, que es cuando hay algo
// que distinguir.
```


## undefined

```js
// LA SITUACION, Y SU COLOR
//
// Todo el color sale de aca, en un solo lugar. Si se decidiera en cada
// parte de la pantalla, cada parte tendria su propia idea de que es
// "tarde", y el mismo trabajador saldria de dos colores segun donde se mire.
//
// Los cuatro primeros no dependen de ninguna migracion: salen de los
// marcajes del dia. Los del medio vienen del motivo del registro de la
// porteria, que es la 041, y si esa no esta, nunca entran.
//
//   sin marcar                rojo      no hay marcaje de entrada
//   accidente o licencia      azul      hay que avisar a donde corresponda
//   permiso                   amarillo  la porteria dijo que tiene permiso
//   tarde                     amarillo  entro despues de la hora
//   sin salida                amarillo  entro y todavia no salio
//   presente o completo       verde     esta bien
//
// EL ORDEN IMPORTA
// ---------------
// La falta le gana a todo. Si no entro, el color verde o amarillo seria
// mentira: no se puede estar "presente" sin haber entrado.
//
// Y el motivo de la porteria le gana a "tarde" y a "sin salida", porque es
// una explicacion mejor: si el portero dijo que es un accidente, "tarde"
// es una forma de tapar lo que really paso.
// El motivo de la portería de HOY para cada persona. La fila lo usa, pero no
// existía: sin esto, la columna de la situación se pinta siempre con los dos
// colores viejos.
//
// No se rompe si la 041 no está aplicada. La consulta falla, el catch la
// traga, y el mapa queda vacío. Es la diferencia entre degradar y romper: si
// la pantalla no abriera porque falta una tabla, el supervisor no podría
// marcar asistencia, y el peor lugar para descubrirlo es en la portería, con
// gente esperando.
```


## undefined

```js
// ---------------------------------------------------------------------
// EL MOTIVO DE LA PORTERÍA, Y DE DÓNDE SALE DE VERDAD
// ---------------------------------------------------------------------
//
// Y LA FUNCIÓN QUE SE LLAMABA NO EXISTE
//
// Antes esto llamaba a "rpc('motivos_porteria_hoy')". Esa función NO ESTÁ en
// ninguna migración: se inventó el nombre. El resultado era un 404 en cada
// dibujado de la tabla, o sea en cada cambio de fecha y cada vez que se abría la
// pantalla, y el "catch" se lo tragaba en silencio.
//
// Y lo peor del silencio: sin esos motivos, la fila de una persona con licencia o
// con accidente se pintaba como "Sin marcar" en rojo. O sea que el mismo error
// hacía que la pantalla dijera UNA cosa falsa y no dijera nada.
//
// Y DÓNDE ESTÁ EL DATO, QUE YA EXISTE
//
// Está en "asistencia.estado", que es la planilla. La lista de estados es:
//
//     X   presente          F   falta
//     P   permiso           L   licencia
//     A   accidente mutuo   PP  permiso pagado
//     V   vacaciones       LL  día lluvia
//
// Y "asistenciaDia" ya está cargado en memoria: lo llena "cargarAsistenciaDelDia()"
// con el mismo día que se está dibujando. No hace falta una consulta por la fila, y
// no hace falta una función en la base.
//
// ---------------------------------------------------------------------
// Y EL MAPEO, Y POR QUÉ NO SE USA EL CÓDIGO CRUDO DE LA BASE
//
// Porque "A" en la base es "accidente mutuo" y en el código la fila dice
// "Accidente"; "P" es permiso y "PP" es permiso pagado, que NO es lo mismo: un
// permiso pagado no es una excepción de horario, es un día que ya se payó. Por eso
// los dos están separados acá y no en la base.
//
// Y "X" NO APARECE EN EL MAPEO
//
// Porque "X" es "estuvo", que es lo normal y no es un motivo. Si "X" entrara en el
// mapa, la fila que está bien sería tratada como si tuviera un motivo.
```


## undefined

```js
// Y LA FECHA CORTA DE LA ETIQUETA
//
// Ya existe una: "fechaCorta()" en "views/administracion/documentos.js", que
// devuelve "28/09/2026". Se usa esa y no otra.
//
// Y POR QUÉ NO SE ESCRIBE UNA AQUÍ
//
// Porque "documentos.js" se carga DESPUÉS que este archivo, así que una función
// con el mismo nombre escrita acá se pierde en silencio: no da error, simplemente
// la de más abajo gana. Ya se cayó en eso una vez, y el síntoma es que la fecha
// sale con otro formato del esperado y nadie sabe por qué.
//
// Y está bien que gane esa: es la que usa el resto de las pantallas, y una fecha
// escrita de una manera en la asistencia y de otra en los relojes se lee como un
// error aunque no lo sea.
```


## undefined

```js
  // Y POR QUÉ EL MOTIVO SE MIRA PRIMERO, Y NO AL FINAL
  //
  // Antes la primera pregunta era "¿fichó?". Con esa pregunta primero, un
  // trabajador con licencia y sin marcaje salía como "Sin marcar", en rojo: que es
  // exactamente lo contrario de lo que dice la portería, que lo licenció. Y al
  // supervisor le tocaba ir a preguntarle por qué no marcó, cuando la respuesta ya
  // estaba escrita y a la vista.
  //
  // Y la otra mitad del problema: si la pregunta va primero, el color de licencia
  // sólo aparecía para quien había fichado. O sea que el mismo motivo pintaba de
  // dos colores distintos según si la persona pasó su tarjeta o no. Un día con
  // licencia no depende de que la persona pase la tarjeta.
  //
  // Y por eso ahora el motivo gana siempre. "Sin marcar" queda para cuando no hay
  // ningún motivo, que es el único caso en que la falta de marcaje es un problema.
```


## undefined

```js
  // Y UN DÍA ABIERTO VIEJO NO ES UNA ALERTA, Y POR QUÉ
  //
  // La decisión fue del usuario: en amarillo o rojo solo lo de HOY. Un día sin
  // salida de hace un mes no es algo que el supervisor pueda ir a resolver esta
  // mañana, y si aparece en amarillo cada día, la lista de pendientes se llena de
  // cosas que no se van a resolver nunca y la lista de verdad se deja de mirar.
  //
  // Y QUÉ ES "VIEJO"
  //
  // Un día. Porque el cierre automático ocurre cuando la persona vuelve a marcar
  // entrada: si estuvo ayer y hoy llegó, lo de ayer ya se cerró solo. Si sigue
  // abierto después de un día, es porque no volvió a pasar, y eso sí es raro y sí
  // merece una llamada.
  //
  // Y EL TEXTO DICE QUÉ DÍA ES
  //
  // Porque un gris sin fecha no dice nada. Si dice "abierto del 28-09", uno puede
  // decidir si le importa; si solo dice "abierto", no hay nada con qué decidir.
```


## undefined

```js
    // Y POR QUÉ EL ERROR SE PONE EN LA LISTA Y NO EN LA CONSOLA
    //
    // Porque este es el segundo error seguido que terminaba dejando la pantalla
    // en blanco, y en los dos la consola tenía la respuesta mientras la persona
    // veía una tabla que no estaba. Un error que borra todo parece una pantalla
    // sin datos, y hace perder el rato buscando datos que sí estaban.
    //
    // Con esto, si vuelve a pasar, sale el texto del motivo en el mismo lugar
    // donde debería estar la tabla.
    //
    // Y POR QUÉ ACA NO SE USA "escHtml"
    //
    // Porque se probó, y falló: al romper "escHtml" a propósito para ver si el
    // aviso aparecía, lo que pasó fue que el aviso también se cayó. El
    // mensajero estaba hecho con la misma herramienta que se había roto, así que
    // cuando el camino estaba cortado no quedaba nadie para decir que estaba
    // cortado.
    //
    // Por eso el escapado se escribe acá, con cuatro replacements y sin llamar a
    // nada. Si el aviso tiene que ser lo último que funciona, no puede depender
    // de lo primero.
```


## undefined

```js
// ---------- LA LEYENDA DE LAS LETRAS ----------
//
// Y se ARMA con "ESTADOS_TARJA", que es la lista real. No escrita a mano.
//
// Porque una leyenda escrita a mano se desactualiza en silencio: se agrega un estado a la lista y
// el cartel sigue diciendo ocho. Y el que lo lee Cree que ese estado no existe.
//
// Y las dos filas de abajo no son estados: son combinaciones y fondos, que no están en
// "ESTADOS_TARJA" porque no se eligen a mano.
// Y EL CARTEL ES EL MISMO EN LAS DOS TARJAS, Y POR QUÉ
//
// Las dos pantallas -- la del supervisor y la mensual -- arman la grilla con la misma función, "buildMatrixHtml", y por eso muestran las mismas letras con el mismo significado. Si cada una tuviera su cartel, uno se actualiza y el otro no, y quedan dos verdades.
//
// Así que el cartel se arma una vez, en un función aparte, y las dos pantallas la llaman. Lo único que cambia es el identificador de la caja donde se muestra, y eso va como argumento en vez de estar escrito adentro: si estuviera escrito, la segunda pantalla no encontraría su caja y no se vería nada.
//
// Y un botón que no abre nada no falla en la consola: no se ve. Es el peor de los errores de JavaScript, porque la pantalla está bien y no hay nada en el log que mirar.
```


## undefined

```js
// ---------- EL CARTEL FLOTANTE DE LAS COLUMNAS ----------
//
// Y NO SE REUSA EL "<details class=ayuda>" QUE YA HAY EN EL PROYECTO
//
// Porque ése es un bloque normal con el cartel absoluto adentro, y acá el cartel va dentro de la
// tabla. Y la tabla vive adentro de un ".overflow", que tiene "overflow-x:auto" -- y en CSS, si un
// eje no es "visible", el otro deja de serlo también. O sea que el ".overflow" recorta en los dos
// ejes, y un cartel absoluto dentro de él se cortaría al llegar al borde de la tabla.
//
// Eso no es teórico: la tabla tiene 31 columnas de días más las seis del resumen, y el ancho
// siempre va a pasar del de la tarjeta. El cartel se abriría y se vería cortado por la derecha.
//
// Por eso el cartel se cuelga de "<body>" con "position:fixed", y se coloca con las medidas del
// botón. "fixed" no lo recorta ningún ancestro, porque no depende de ninguno: se posiciona contra
// la pantalla.
//
// Y se reutiliza la APARIENCIA de ".ayuda-caja" --mismo ancho, mismo borde, misma sombra--, que es
// lo que hace que se vea igual que las otras ayudas del sistema y no como un invento nuevo.
```


## undefined

```js
  // Y SE COLOCA DEL LADO QUE HAY LUGAR, Y CON EL ALTO QUE SE PIDE
  //
  // El alto se mide DESPUÉS de estar en el DOM, porque antes no tiene: un elemento que no está en
  // la página no tiene caja, y un "getBoundingClientRect" de eso da ceros.
  //
  // Y el cartel mide 728px, que es más que media pantalla. Así que hay dos cosas que decidir: de qué
  // lado abrir, y hasta qué alto. Abrir siempre hacia abajo lo saca de la pantalla cuando el botón
  // está a media altura, que es donde está la tabla en una pantalla normal.
  //
  // Se comparan los dos lados y se elige el más grande. Y si ninguno alcanza, el alto se recorta al
  // del lado elegido y el cartel scrollea adentro: es mejor un cartel con scroll que uno cortado
  // por el borde, porque lo que se perdió es justo la parte de abajo, que es donde están las
  // columnas del resumen.
```


## undefined

```js
// ---------- LAS SEIS COLUMNAS DE RESUMEN, CON SU LETRA ----------
//
// Y ES UNA LISTA, Y NO SEIS TEXTOS SUELTOS EN EL ENCABEZADO
//
// Porque el rótulo corto y el significado largo tienen que salir del mismo lugar. Si el
// encabezado dice "LL" escrito a mano y el cartel dice "días de lluvia" escrito a mano, son dos
// verdades: el día que uno cambie, el otro queda diciendo la cosa vieja. Y el que lee la grilla
// ve "LL" y no tiene de dónde saber qué es.
//
// Con la lista, el encabezado y el cartel salen de los mismos seis objetos. No pueden
// separarse.
//
// Y las letras NO SON INVENTADAS: tres ya estaban en el rótulo viejo --"Días lluvia (LL)",
// "Lic./Acc. (L,A)", "Inasist. (F,P)"-- y lo que se hizo fue dejar la letra yllevar la
// palabras al "title" y al cartel. Las otras tres no tenían letra, y se les puso una que se
// lea: "30" es la base, "EF" son efectivos, "RT" son reales. Ver [tarja-18].
```


## undefined

```js
  // Y el ".overflow" va ACÁ, alrededor de la tabla sola, y no en el HTML afuera.
  //
  // Porque "buildMatrixHtml" devuelve la tabla Y las tres leyendas, y si el scroll
  // horizontal envuelve todo, las leyendas se desplazan con la tabla: para leer el texto
  // de abajo hay que volver a arrastrar a la izquierda, y eso esconde la grilla. La
  // leyenda es de la persona, no de la tabla. Ver [tarja-07].
  // Y EL "COLGROUP", QUE ES DONDE VAN LOS ANCHOS DE LAS COLUMNAS FIJAS
  //
  // La tabla va con "table-layout:fixed" para que las columnas de día sean iguales. Con "fixed" el
  // ancho sale de la PRIMERA FILA, y se puede poner en la celda... salvo en la primera.
  //
  // MEDIDO: la columna del código quedaba en 227 píxeles en vez de los 86 que pedía su regla, y el
  // nombre sí tomaba los 220 de la suya. La única diferencia entre las dos es que la del código
  // tiene "position:sticky", y una celda sticky no la mide el reparto de columnas: la mide el sticky.
  //
  // Y por eso los anchos van en un "colgroup": es el mecanismo que existe justamente para esto, y
  // no le importa si la celda está pegada o no.
```


## undefined

```js
  // Y LAS SEIS COLUMNAS DEL RESUMEN, CON LA LETRA Y NO CON LA FRASE
  //
  // Antes cada encabezado decía la frase entera --"Días lluvia (LL)"-- y la columna quedaba
  // ancha por la frase, no por el número que lleva adentro. Con dos dígitos dentro, una columna
  // de 140px es un desperdicio, y seis columnas así se comen la grilla.
  //
  // Y el "title" queda en cada una, que es lo que se ve al pasar el puntero por encima: el
  // nombre entero sigue ahí para quien lo necesite, sin estar escrito en la celda todo el día.
  //
  // Y la última celda es el botón de información. Va AQUÍ, al final de la fila de las columnas, y
  // no en la barra de controles de arriba: el que no entiende "LL" tiene el botón al lado de la
  // "LL", que es donde está la pregunta. Puesto arriba, entre el año y el mes, queda a tres
  // campos de distancia de lo que no entiende.
```


## undefined

```js
// ------------------------------------------------------------------
// EL MOTIVO DEL CAMBIO
// ------------------------------------------------------------------
// Por qué un cuadro propio y no un prompt(): el motivo queda guardado para
// siempre en la bitácora, así que no es un dato de paso. Con prompt() no se
// ve qué se está cambiando, ni se puede corregir, y el texto se pierde si
// alguien aprieta Cancelar sin querer.
//
// La base de datos es la que exige el motivo (migración 028): si falta,
// rechaza la escritura. Esta función no lo pide "para ser buena", lo pide
// porque la base lo va a rechazar. Por eso `guardarAsistencia` primero
// intenta y, si la base dice "falta el motivo", recién ahí abre el cuadro.
// Un camino nuevo que se olvide del motivo no deja un cambio sin rastro:
// deja un error, que es justo lo que hay que ver.
```


## undefined

```js
// ¿El error es "todavía no está aplicada la migración que hace falta"?
//
// ESTO ESTABA MAL Y SE VIO EN PANTALLA AL DESVINCULAR.
//
// Se buscaba "does not exist" en el mensaje, pero PostgREST no escribe eso.
// Escribe:
//
//   Could not find the function public.desvincular_trabajador(...) in the
//   schema cache
//
// Con el patrón anterior el error no se reconocía, se caía al mensaje
// crudo, y la persona veía una línea de inglés técnico sin ninguna pista
// de que lo que le faltaba era abrir el SQL Editor y correr una
// migración. Peor todavía: pasaba en un formulario donde ya había escrito
// la fecha de término y el artículo, así que parecía que esos datos estaban
// mal.
//
// Se busca por las dos formas y por el nombre de la función, que es lo
// único que no cambia entre versiones de PostgREST.
```


## undefined

```js
// ------------------------------------------------------------------
// LOS DOS EXCEL, Y CÓMO SABER CUÁL ES
// ------------------------------------------------------------------
// Hay dos importadores y piden archivos con formas distintas:
//
//  - el del RELOJ (pestaña "Registrar marcaje"): el reporte de RelojControl,
//    con Tipo/Evento, Rut, Colaborador, Fecha y Hora. Cada fila es un
//    fichaje.
//  - el de la PLANILLA (esta pestaña): columnas codigo, fecha, estado,
//    hora_llegada. Cada fila es el resumen del día de un trabajador.
//
// Antes no se distinguían. Si elegías el archivo equivocado, el único
// mensaje era "no se encontraron filas válidas (revisa columnas codigo y
// fecha)", que no dice nada de qué hay que hacer. Ahora se mira el
// encabezado y se dice qué es el archivo y a dónde va.
```


## undefined

```js
// ---------------------------------------------------------------------
// LLEVAR AL IMPORTADOR DEL RELOJ
// ---------------------------------------------------------------------
// Y POR QUÉ HAY UN BOTÓN QUE SÓLO LLEVA A OTRA PANTALLA
//
// Porque hay DOS importadores de Excel y se llamaban los dos "Cargar desde
// Excel". Uno trae el archivo del RELOJ —columnas Tipo, Evento, Rut,
// Colaborador, Fecha, Hora— y el otro trae una PLANILLA —columnas codigo, fecha,
// estado—.
//
// Con los dos igual de nombrados, el que se abría primero era el equivocado, y el
// síntoma era "el archivo no tiene filas", que es un mensaje de un archivo que sí
// las tenía: sólo que de otro tipo.
//
// Y POR QUÉ NO SE COPIA EL IMPORTADOR DEL RELOJ ACÁ
//
// Es el mismo código, con el mismo análisis de a quién pertenece cada marcaje y las
// mismas reglas para el caso de un RUT que no está en la lista. Copiarlo sería la
// segunda versión de lo mismo, y las dos versiones divergen: primero en un
// mensaje, después en un criterio, y al final nadie sabe cuál manda.
//
// Y POR QUÉ COMPRUEBA EL PERMISO ANTES DE LLEVAR
//
// Porque la pantalla del supervisor exige "tarja.marcaje". Sin ese permiso el
// botón llevaría a una vista que no abre, y el que hizo clic pensaría que la
// aplicación se rompió.
```
