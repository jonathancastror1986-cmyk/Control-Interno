# views/administracion/documentos.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ============================================================
// El reloj de la obra manda un reporte con una fila por marcaje. Se
// leen las columnas del reporte y se guarda en la tabla "marcajes", que
// es la misma que alimenta la asistencia diaria: el supervisor no ve
// una lista aparte, ve exactamente los mismos marcajes.
//
// Nombres de columna que se aceptan, porque el reporte puede venir
// con o sin tildes y en minúsculas o mayúsculas:
//
//   Tipo      Entrada | Salida | Entrada Horas Extra
//   Evento    Inicio Jornada | Fin Jornada | Nuevo Ingreso
//   Fecha     28-09-2026 | 45744 (número de Excel)
//   Hora      07:45 | 0,3188 (fracción del día) | 21 (hora de Excel)
//   Rut       13199887-2
//   Colaborador  ADASME VERDUGO JAIME PATRICIO
//
// La pareja (Rut, Colaborador) se usa para saber de quién es cada
// fila. El RUT manda porque no cambia; el nombre es el respaldo para
// los trabajadores que todavía no lo tienen informado.
```


## undefined

```js
    // Y SI EL AÑO ES 1899, ES UNA CELDA DE SOLO HORA, Y HAY QUE LEERLA EN UTC
    //
    // Y POR QUÉ 1899 ES LA SEÑAL
    //
    // "leerPrimeraHoja" lee con "cellDates:true", y eso convierte una celda que
    // tiene una hora en un "Date". SheetJS la arma en UTC: la hora 0,3188 del
    // archivo —07:39— llega como "1899-12-30T07:39Z".
    //
    // Y si eso se lee con "getHours()", que es hora LOCAL, no sale 07:39. En Chile,
    // 1899 no era UTC-3: era la hora media local, UTC-4:42. Y 07:39 menos 4:42
    // son las 02:56.
    //
    // Medido con el archivo real: la fila dice 07:39 y se guardaba 02:56. Casi
    // cinco horas de corrimiento en cada marcaje, y sin ningún aviso: el marcaje
    // se guardaba, la planilla lo aceptaba, y el error se veía recién en la
    // conciliación, días después, cuando alguien comparaba horas y no encontraba
    // el motivo.
    //
    // Y POR QUÉ NO SE PUEDE USAR "getHours()" PARA NADA AQUÍ
    //
    // Porque el desfase depende de la zona horaria de la MÁQUINA que abre la
    // pantalla. En Santiago son 4:42; en otro Computers, otra cosa. El mismo
    // archivo da horas distintas según dónde se abra, que es la peor forma de que
    // falle una importación.
    //
    // Y LA REGLA ES SENCILLA: SI EL AÑO ES 1899 O MENOS, LEER EN UTC
    //
    // El 0 de Excel es el 30 de diciembre de 1899, así que una celda de hora
    // siempre cae ahí. Una celda de fecha de verdad tiene un año de este siglo, y
    // esa se sigue leyendo como hasta ahora.
```


## undefined

```js
    // OJO CON ESTO, que es un error de un día.
    //
    // SheetJS convierte una celda que SOLO tiene fecha a la medianoche UTC.
    // En Chile (UTC-3) esa medianoche son las 21:00 del día ANTERIOR, así
    // que leer la fecha con getDate() devuelve el 27 cuando la celda dice
    // 28. Se cargaba la asistencia entera corrida un día, y no se notaba:
    // 28 de septiembre parece un día tan bueno como cualquier otro.
    //
    // La diferencia se nota comparando la medianoche UTC con la local. Si
    // coinciden, la celda no tiene hora: se lee en UTC, que es como la
    // escribió el reloj. Si no coinciden, es una fecha con hora de verdad y
    // se lee en hora local, que es lo que quiere decir.
```


## undefined

```js
  // Y TODO EL BLOQUE VA DENTRO DE UN "TRY", PORQUE ANTES NO PASABA NADA
  //
  // Antes, si cualquiera de las cuatro esperas fallaba, la función salía por arriba
  // y "#diariaLista" se quedaba VACÍO: sin tabla, sin mensaje, sin nada.
  //
  // Y eso es lo que se veía en pantalla. No es que la asistencia no existiera: es
  // que el dibujo nunca llegó a correr, y un error que no dibuja nada parece una
  // pantalla que no tiene datos.
  //
  // Y POR QUÉ NO SE AVISA EN LA CONSOLA
  //
  // Porque la consola no la ve nadie. El error va al mismo lugar donde iba a estar
  // la tabla, que es donde uno va a mirar.
```


## undefined

```js
// ============================================================
// TARJA DE SUPERVISORES
// Un supervisor ve solo a la gente que tiene a cargo. Para saber
// cuál es su equipo hace falta vincular su usuario del sistema con su
// ficha: perfiles.trabajador_code (migración 015).
// Quien no esté vinculado (RRHH, administración) sigue viendo todos los
// equipos, porque para eso tiene el permiso de edición.
// ===================================================================
//
// EL CAMINO QUE CORRESPONDE
//
// La plantilla se escribe en Word, no en esta pantalla. El técnico de
// Prevención tiene el documento que le pasó la mutual, con su formato, sus
// tablas y su logo. Si hay que copiar eso a un cuadro de texto, se pierde
// el formato y se pierde el tiempo.
//
// El camino es al revés: bajar el documento, abrirlo en Word, editarlo,
// subirlo. Esto arma un .doc que Word abre y conserva el formato.
//
// POR QUÉ UN .doc Y NO UN .DOCX
//
// Un .docx es un ZIP con el documento adentro, con un formato binario
// interno que no se puede escribir a mano. Un .doc, en cambio, es HTML con
// la extensión cambiada, y Word lo abre sin preguntar nada. Se escribe en
// un segundo, con lo que ya hay, y abre igual.
//
// La diferencia se nota si después se guarda como .docx desde Word, que es
// lo normal: ahí el archivo ya es un Word de verdad.
//
// LO QUE CONTIENE
//
//   - El contenido de la plantilla, con el formato que tiene ahora.
//   - La lista de variables con su significado, arriba, para que la
//     persona sepa qué puede escribir.
//   - El pie con la explicación de cómo se reimporta.
//
// LO QUE NO HACE
//
// No baja el documento con los datos de un trabajador. Se baja vacío: la
// plantilla es la que se edita. Los datos se ponen al generar el papel.
```


## undefined

```js
    // ----------------------------------------------------------------
    // POR QUÉ ESTAS DOS LÍNEAS ESTÁN PARTIDAS EN DOS
    // ----------------------------------------------------------------
    // Aquí se cierra el documento de Word. Se vería más limpio escribir la
    // etiqueta de cierre del cuerpo y la del documento enteras, una sola
    // línea. Y así estaba.
    //
    // Rompía la aplicación completa, y solo en algunos equipos, que es lo
    // que lo hace especialmente bueno para volver a pasar.
    //
    // El navegador, adentro de un script, busca el cierre del script. La
    // etiqueta de cierre del cuerpo, escrita dentro de una cadena, no le
    // hace nada: la ve como texto y sigue. Por eso el archivo funcionaba
    // cuando se abría del disco o lo servía cualquier otro servidor.
    //
    // Live Server —el que recarga la página al guardar, y el que sirve el
    // archivo en el 127.0.0.1:5500— no funciona así. Ese lee el archivo
    // como texto plano, busca el PRIMER cierre de cuerpo que encuentra, y
    // mete ahí su propio script de recarga. El primero no era el del
    // documento: era este, que estaba escrito en JavaScript.
    //
    // Entonces le cayó código en medio del script. El comentario HTML que
    // inyecta es legal en JavaScript, así que pasó en silencio; el script
    // que le seguía no es nada válido, y ahí reventó con:
    //
    //     Uncaught SyntaxError: Invalid or unexpected token
    //
    // Un error de sintaxis tumba el script ENTERO. Por eso no había menú,
    // ni reloj, ni nada: todo había dejado de correr.
    //
    // La forma de evitarlo es no tener nunca el cierre de cuerpo escrito
    // entero en el archivo. Se arma pegando dos partes: una con el signo
    // menor y otra con el nombre de la etiqueta. Ninguna de las dos tiene
    // el cierre completo, así que Live Server no encuentra nada que
    // inyectarle. El .doc que se descarga queda idéntico: Word lo abre igual.
```


## undefined

```js
// ============================================================
// ROLES Y PERMISOS
// Un usuario puede tener varios roles; cada rol tiene un conjunto
// de permisos editables. La interfaz se arma según lo que la
// persona tenga permitido, y las acciones sensibles se bloquean.
// ===================================================================
//
// LOS CAMPOS PROPIOS DE LA EMPRESA, Y LA GENERACIÓN DE DOCUMENTOS
//
// ===================================================================
//
// -------------------------------------------------------------------
// DÓNDE ESTE TROZO ESTABA, Y POR QUÉ SE MUDÓ
// -------------------------------------------------------------------
//
// Estaba dentro de "views/asistencia/relojes.js", a partir de la línea 3396.
//
// Y ese archivo se llama "relojes.js" porque la primera mudanza partió los trozos por
// donde ya estaban, no por de qué son. Y este trozo no es de relojes: es el editor de
// plantillas, la generación del PDF y la importación desde Word. Tres cosas que no
// tienen nada que ver con un reloj.
//
// -------------------------------------------------------------------
// POR QUÉ AHORA Y NO ANTES
// -------------------------------------------------------------------
//
// En el lugar de donde salió había un comentario que lo decía, y decía esto:
//
//     POR QUÉ UN ARCHIVO NUEVO Y NO EN "relojes.js"
//
//     Porque el editor de plantillas está en "relojes.js" desde hace años, y esas son
//     74 menciones de "plantilla" que ya funcionan. Tocar ese archivo hoy, con lo que
//     hemos tocado, es mezclar dos cosas: lo que andaba y lo nuevo.
//
//     Y en un archivo aparte, el que llega después sabe dónde está lo nuevo. Si el
//     editor viejo se rompe, se deshace este archivo y no se toca lo otro.
//
// Eran razones buenas, y la segunda era la importante: durante una mudanza parcial, un
// archivo a medio mover es peor que uno entero sin mover, porque el síntoma aparece en
// una pantalla y se busca en el lugar equivocado.
//
// LO QUE CAMBIÓ es que la mudanza ya no es parcial. Este archivo es el ÚNICO bloque que
// se puede quitar entero sin dejar nada detrás: está al final, no tiene llamadas de
// nivel superior, sus tres declaraciones no colisionan con ninguna de las de este
// archivo, y este archivo se carga DESPUÉS en "app.html".
//
// Y la premisa "74 menciones que ya funcionan" era una conjetura sobre un número de
// menciones. Las funciones están medidas: son 49, y ninguna comparte nombre con otra.
// Ver "docs/plan-corte-relojes.md".
//
// -------------------------------------------------------------------
// LAS TRES DECLARACIONES DE NIVEL SUPERIOR QUE VIENEN ADELANTO
// -------------------------------------------------------------------
//
// Y viajan con el bloque, y eso es lo que lo hace posible.
//
// Un "let" o un "const" en el nivel superior NO se levanta antes de su línea: está en
// la zona muerta temporal hasta que se ejecuta. Leerlo antes es un ReferenceError con
// un mensaje que dice "no está definido", cuando sí está definido y solo falta
// ejecutarse.
//
// Por eso lo que se mueve son bloques COMPLETOS, con sus declaraciones. Y por eso este
// archivo tiene que cargarse después de "relojes.js": así, lo que quedó declarado allá
// ya existe cuando estas funciones corren. Ver "tools/pruebas/let-entre-scripts.html".
//
// ===================================================================
// KIT DE CONTRATACIÓN
// LOS CAMPOS PROPIOS DE LA EMPRESA
// ==================================
//
// -------------------------------------------------------------------
// QUÉ HACE
// --------
// El editor de plantillas que YA existía solo puede poner datos que ya están en
// "trabajadores". Acá van los que la empresa define: licencia, talla, centro de costo.
//
// Y son POR EMPRESA, porque "código de hazard" en una constructora y "código de patio" en
// un depot no son la misma cosa.
//
// -------------------------------------------------------------------
// POR QUÉ UN ARCHIVO NUEVO Y NO EN "relojes.js"
// ---------------------------------------------
//
// Porque el editor de plantillas está en "relojes.js" desde hace años, y esas son 74
// menciones de "plantilla" que ya funcionan. Tocar ese archivo hoy, con lo que hemos
// tocado, es mezclar dos cosas: lo que andaba y lo nuevo.
//
// Y en un archivo aparte, el que llega después sabe dónde está lo nuevo. Si el editor
// viejo se rompe, se deshace este archivo y no se toca lo otro.
//
// -------------------------------------------------------------------
// Y POR QUÉ UNA CLASE PROPIA EN EL CSS
// ------------------------------------
//
// Mismo motivo: "css/componentes/plantillas.css" con ".plantillaEditor". Dos columnas, un
// panel pegajoso y una lista de campos: eso es una pantalla, no un estilo suelto.
//
// -------------------------------------------------------------------
// LOS SIETE TIPOS, Y POR QUÉ NO SON MÁS
// --------------------------------------
//
// texto, numero, fecha, lista, casillas, imagen y firma. Los mismos siete que el "check" de
// la tabla. Si se agrega un tipo, se agrega en los dos lados: en el "check" de la tabla y en
// el "<select>" de esta pantalla.
//
// Y en el "SELECT" está escrito a mano a propósito, porque un tipo que la base acepta y la
// pantalla no ofrece es un campo que se puede crear de otra forma y no se puede editar acá.
```


## undefined

```js
// BAJAR UNA PLANTILLA CON LOS DATOS DE UN TRABAJADOR
// =====================================================
//
// -------------------------------------------------------------------
// EL ORDEN DE LAS CUATRO COSAS, Y POR QUÉ NO ES EL DE UNO
// -------------------------------------------------------------------
//
//   1. traer los datos        "datos_para_plantilla"
//   2. ver qué falta          "campos_faltantes"
//   3. recién ahí, completar  los "[CAMPO]" y los "[NOMBRE]"
//   4. y recién ahí, bajar
//
// El paso 2 antes del 3 es lo importante. Si se completara primero y se bajara, el
// documento saldría con un "[CAMPO:7-licencia]" literal adentro, que es peor que un hueco:
// un hueco se ve, y un texto entre corchetes se archiva como si estuviera completo.
//
// Y el error dice QUÉ falta y de QUÉ tipo, no "faltan datos". El que tiene que ir a buscar
// el dato es el usuario, y si el mensaje no dice cuál, vuelve a mirar la pantalla y no
// encuentra nada.
//
// -------------------------------------------------------------------
// POR QUÉ NO SE COMPLETA EN EL SERVIDOR
// -------------------------------------------------------------------
//
// Porque el contenido de la plantilla es HTML libre que edita el usuario, y meterle
// "replace" en el servidor significa escribir HTML con concatenación de cadenas, que es
// justo donde aparecen los problemas de comillas que el editor viejo ya sufrió una vez.
//
// Y porque los datos ya vienen en un jsonb con los nombres puestos: la base ya hizo el
// trabajo difícil. Acá solo se reemplazan "[NOMBRE]" y "[CAMPO:algo]", que es una operación
// de texto, no de HTML.
//
// -------------------------------------------------------------------
// Y LA VARIABLE QUE FALTA SE MARCA, NO SE BORRA
// -------------------------------------------------
//
// Una variable que no existe en el documento queda como está, en vez de desaparecer. Un
// "[NOMBRE]" que se queda es una pista de que falta algo. Un hueco en blanco no dice nada.
```


## undefined

```js
  // -------------------------------------------------------------------
  // LAS DOS FORMAS, Y POR QUÉ LAS DOS
  // -------------------------------------------------------------------
  // "[NOMBRE]" es la forma que ya usan los documentos que existen. Y "[CAMPO:7-licencia]" la
  // que se inventó después, con prefijo, para que un campo propio no se confundiera con una
  // variable fija.
  //
  // Se aceptan LAS DOS, y no es porcompatibilidad con uno mismo: hay documentos armorados con
  // la forma vieja, y un documento que deja de completarse a mitad es peor que un documento
  // con una sintaxis de más. Cambiar la forma es para los documentos NUEVOS.
  //
  // Y el orden importa: los "[CAMPO:...]" se reemplazan PRIMERO, porque si se buscara "[...]"
  // primero, "[CAMPO:7-licencia]" se partiría en "[7-licencia]" y "CAMPO:7-licencia]" queda
  // colgado adentro del documento.
```


## undefined

```js
// ====================================================================
// BAJAR EL .DOCX DE VERDAD, CON SU FORMATO
// ====================================================================
//
// Y esto NO existía, y la razón por la que no existía está escrita más arriba, en el
// formulario, y decía:
//
//     Y el ".docx" NO se acepta, porque es un archivo comprimido y desde el navegador no se
//     puede abrir sin una librería de ZIP que este proyecto no tiene.
//
// Y la razón era buena, y YA NO SE TIENE. "fflate" son 32 KB y se bajan de CDN, que es
// exactamente el mismo camino que ya usan jsPDF, html2canvas, JsBarcode, el lector de QR y
// las otras cinco librerías del proyecto.
//
// O sea que la frase "este proyecto no tiene una librería de ZIP" era cierta el día que se
// escribió, y es falsa hoy. Y una razón que se pone vieja hay que cambiarla, no esquivarla:
// la próxima que lea el comentario va a concluir que no se puede. Ver [word-06].
//
// -------------------------------------------------------------------
// Y POR QUÉ BAJAR EL .DOCX Y NO EL .DOC
// ---------------------------------------
//
// Porque el ".doc" que se baja hoy es un HTML con otra extensión, y el ".docx" es un ZIP con
// XML adentro, y tiene el formato.
//
// Y la diferencia se ve en las cosas que SOLO Word sabe hacer: las tablas que se parten entre
// páginas, los encabezados que se repiten al cambiar de hoja, la orientación del papel, los
// márgenes exactos. Con el ".doc" eso se pierde, porque pasa por HTML.
//
// Con el ".docx" no se pierde nada, porque solo se toca el "<w:t>" donde está el dato y el
// resto del archivo se copia byte por byte.
//
// -------------------------------------------------------------------
// Y POR QUÉ EL USUARIO ELIGE EL ARCHIVO, Y NO ESTÁ GUARDADO
// ----------------------------------------------------------
//
// Porque guardar el ".docx" necesita una columna nueva y un archivo en el almacen, y eso es
// una migración que se aplica aparte. Y esta función no depende de eso.
//
// O sea que esto no reemplaza al flujo guardado: lo complementa. El que tiene el papel guardado
// en la base sigue bajando el ".doc"; el que tiene el ".docx" en su computador lo elige y se
// lo lleva lleno. Y cuando el guardado esté, esta función es la misma con el archivo tomado
// de la base en vez de del disco.
//
// -------------------------------------------------------------------
// Y NUNCA SE BAJA UN PAPEL CON UN HUECO ADENTRO
// -----------------------------------------------
//
// Y esto es lo importante de toda la función.
//
// El motor deja "[falta]" donde no encuentra un dato. Y un "[falta]" en un archivo es un
// papel con un hueco adentro, y un papel con un hueco SE IMPRIME Y SE FIRMA IGUAL. El que lo
// descarga puede no mirar.
//
// Y por eso la función NO baja y avisa. Y avisa también de las llaves sin cerrar, que es el
// otro hueco posible: una variable partida entre dos párrafos queda sin reemplazar, y eso no
// lo ve ni el que la escribió.
//
// La regla: un papel con algo sin resolver no baja. Se avisa, se corrige la plantilla, y
// después baja.
```


## undefined

```js
// BAJAR LA PLANTILLA EN BLANCO
// ====================================================================
//
// Un ".doc" de Word es un HTML con otra extensión. Por eso se puede generar desde el navegador
// sin ninguna librería, que es lo único que hay acá.
//
// Y el manual viaja DENTRO del archivo. Un manual que está solo en la pantalla sirve mientras se
// está en la pantalla; el que va en el archivo sirve cuando alguien se lo pasa a otro.
// Ver [word-01].
//
// Y la lista de variables queda arriba para que nadie tenga que acordarse de cómo se llaman, y se
// borra con la línea que dice "FIN DE LAS INSTRUCCIONES". Ver [word-03].
// -------------------------------------------------------------------
// EL ESQUELETO DEL DOCUMENTO
// -------------------------------------------------------------------
// Va en una constante y no adentro de la función, porque es una constante: no cambia nunca. Y
// afuera se puede leer sin ejecutar nada, que es lo que hace la comprobación.
//
// Y con estilos dentro, porque Word los respeta. Sin estilo el documento sale como texto pelado
// y la persona tiene que armarlo entero, que es al revés de lo que se pidió.
```


## undefined

```js
// -------------------------------------------------------------------
// LA VISTA PREVIA, EN UN "iframe"
// -------------------------------------------------------------------
// Y en un "iframe", no en un "<div>". Porque los estilos del documento se meterían en la página
// de la aplicación: un "body{margin:0}" del documento borra los márgenes de la página, y un "h1"
// del documento se vuelve el "h1" de la aplicación.
//
// En un marco el documento es un documento aparte. Es literalmente lo mismo que baja el ".doc":
// la misma cosa que Word abre es la que se ve acá. Y no puede tocar la aplicación, porque no
// comparte nada con ella. Ver [ver-01].
//
// Y con "sandbox" sin scripts y sin formularios, porque el contenido viene de un archivo que sube
// una persona. Y con "allow-same-origin" para poder leer el alto, que es lo que hace que la hoja
// tenga el alto del papel y no el de la pantalla.
```


## undefined

```js
// LAS SEIS FUENTES DE LAS PLANTILLAS
// =====================================
//
// -------------------------------------------------------------------
// POR QUÉ ESTA LISTA VIVE ACÁ Y NO EN EL HTML
// -----------------------------------------
//
// El desplegable del editor se arma con esta lista. Y si la lista estuviera escrita en el
// HTML, habría dos lugares donde cambiar las fuentes: el desplegable y la plantilla
// general. Y algún día se cambiaría en uno y no en el otro, y el editor ofrecería una
// fuente que la plantilla no tiene.
//
// O sea que la lista tiene que estar en UN solo lugar, y el que se lee desde los dos
// lados es el JavaScript.
//
// -------------------------------------------------------------------
// POR QUÉ SEIS Y NO UN CATÁLOGO
// ----------------------------
//
// Porque "elegante" sin criterio es un catálogo entero, y con veinte fuentes disponibles
// cada documento sale con una distinta y la empresa deja de verse como empresa.
//
// Con seis hay una regla que se puede decir de una vez: una serif para el texto que se lee
// seguido, y una sans para lo que se escanea. Y si un día hay que agregar una, se agrega
// acá y en la plantilla, y son dos lugares.
//
// -------------------------------------------------------------------
// Y LA RAZÓN TÉCNICA, QUE ES LA IMPORTANTE
// ----------------------------------------
//
// WORD NO DESCARGA FUENTES DE GOOGLE. La fuente viaja con el archivo solo si va EMBEBIDA, y
// Word no la embebe desde un HTML.
//
// O sea que el documento descargado lleva la fuente pedida, pero la que Word va a mostrar
// es la primera de la lista que ese computador tenga instalada. Y por eso cada fuente trae
// una del sistema con el mismo carácter como segunda: si no está Lora, se ve Georgia, que
// es una serif de lectura parecida.
//
// Y esa segunda es la que hace que el documento NO se vea roto en la máquina de quien lo
// abre. Sin ella, en un computador sin la fuente, el texto cae en una tipografía de sistema
// que no se parece en nada, y el documento pierde toda la apariencia.
//
// -------------------------------------------------------------------
// Y POR QUÉ ESTAS SEIS
// --------------------
//
// Con serif para el cuerpo del texto, que es lo que se lee seguido en un contrato de
// veinte artículos:
//
//     Lora              la más cómoda de las tres para texto largo
//     Playfair Display  contraste alto, para títulos
//     Crimson Text      serif de lectura rápida, la mejor para artículos densos
//
// Con sans para títulos y rótulos, que es lo que se escanea:
//
//     Montserrat        la que ya usa este proyecto en sus menús
//     Source Sans 3     limpia, para rótulos largos
//     Inter             la más neutra, para datos
```


## undefined

```js
// -------------------------------------------------------------------
// APLICARLA
// -------------------------------------------------------------------
// Y con "styleWithCSS" en falso ANTES de aplicar la fuente, y no después.
//
// La diferencia se ve: con estilos en falso sale UN "<font face=...>" por la selección, y con
// estilos entrue sale un "<span style=...>" por renglón. Y el "<span>" es el problema: se
// multiplica con cada cambio de fuente y con cada pegada de Word, y a la tercera ya hay
// veinte capas anidadas y el documento pesa el doble sin que se vea.
//
// Y el ORDEN importa. Ponerlo después no deshace lo que ya hizo el comando anterior: cada
// "execCommand" usa el valor que había cuando empezó. Así que puesto después no sirve de
// nada, y seemed que sí.
//
// Medido en el navegador, con el diálogo abierto:
//
//     estilo en falso   <p><font face="Lora">texto</font></p>
//     estilo en true    <p><span style="font-family: Montserrat;">texto</span></p>
```


## undefined

```js
// LAS VARIABLES CON EL DATO PUESTO
// ====================================
//
// -------------------------------------------------------------------
// QUÉ CAMBIA
// ---------
//
// Antes la lista decía NOMBRE, RUT, CARGO... y nada más. Con eso hay que ir a buscar el dato
// a la ficha del trabajador, copiarlo, y pegarlo en el documento. Y si se pega mal, o se pega
// el de otra persona, el documento sale con el dato de otro.
//
// Ahora cada variable muestra SU valor, para el trabajador que esté elegido. Y es un clic
// para insertarla en la plantilla.
//
// -------------------------------------------------------------------
// Y LA LISTA TIENE QUE SEGUIR SIENDO UNA SOLA
// --------------------------------------------
//
// Hay tres fuentes y van en el mismo bloque, en este orden:
//
//   1. LA EMPRESA     nombre, RUT, dirección, teléfono, giro
//   2. EL TRABAJADOR  del "datos_para_plantilla": nombre, RUT, cargo, fecha...
//   3. LOS CAMPOS PROPIOS, de la empresa
//
// Y en UN bloque y no en tres, porque el que escribe la plantilla no puede estar adivinando
// de qué sección salió la variable. Y la empresa va arriba porque es lo primero que se llena.
//
// -------------------------------------------------------------------
// Y POR QUÉ UN "title" CON EL VALOR
// ---------------------------------
//
// Porque el valor completo puede ser largo —una dirección, un correo— y si se muestra entero
// la lista deja de ser una lista y pasa a ser un muro. Y el "title" lo tiene entero al pasar
// el mouse, sin sacar el valor de la vista.
//
// -------------------------------------------------------------------
// Y POR QUÉ EL VALOR VACÍO SE MARCA
// ---------------------------------
//
// Un "[NOMBRE]" con nada al lado y un "[NOMBRE]" con un dato se ven distinto al pasar el
// mouse, pero iguales de lejos. Y el que se escribe en mayúsculas con un guion al lado es un
// "[RUT]" que todavía no tiene nada.
//
// Y NO se esconde: se muestra. Un campo vacío que no se ve es un campo que se llena a mano.
```


## undefined

```js
// Y el "title" de una variable: el nombre del campo arriba, el dato abajo. Y arriba en
// monoespaciada, porque eso es lo que va a ir en el documento.
// Y DEVUELVE UN OBJETO, Y NO UN TEXTO
// --------------------------------
// Porque el filtro necesita tres cosas de cada variable: el texto para mostrar, la clave para saber
// cuál es, y el valor para poder ponerla en la vista previa. Con un solo texto hay que volver a
// desarmarlo después, y eso es adivinar dónde termina cada parte.
// -------------------------------------------------------------------
// A QUÉ PERTENECE CADA VARIABLE
// -------------------------------------------------------------------
// Y POR QUÉ HAY QUE DECIRLO
//
// Con veinte y pico variables en una lista, hay que leerlas todas para encontrar
// la que se busca. Y son tres grupos que se usan para cosas distintas:
//
//   del trabajador   lo que ya está en la ficha
//   de la empresa    el nombre, el RUT, el teléfono de la empresa
//   campo propio     lo que la empresa definió para sus plantillas
//
// Y el filtro va por grupo, no por tipo de dato. Filtrar por "texto" o "número"
// no sirve para elegir: casi todas son texto, y la que se busca casi nunca es la
// única que no lo es.
//
// -------------------------------------------------------------------
// EL GRUPO SE PASA POR PARÁMETRO, NO SE DEDUCE DEL NOMBRE
// -------------------------------------------------------------------
// Y POR QUÉ: PORQUE EL PREFIJO YA NO SE USA
//
// Los campos propios llegan de "datos_para_plantilla" con la clave CRUDA, sin
// el prefijo de empresa: "7-licencia" llega como "licencia". Eso lo hace la
// línea de más abajo, que dice:
//
//     const clave = k.replace(/^\d+-/, '');
//
// O sea que en la lista NINGUNA variable tiene un guion con números. La función
// que lo deduce del nombre, probada con "/^\d+-/", no encontraba NINGÚN campo
// propio: los contaba como "del trabajador".
//
// Y ESO ES LO QUE PEDISTE: que los campos propios aparezcan en su lugar. Si se
// deducen del nombre, no se pueden distinguir del resto.
//
// Por eso el grupo viene por parámetro. El que arma la lista sabe qué es cada
// cosa, porque lo está mirando. La función que pinta no tiene por qué adivinarlo.
```


## undefined

```js
// ------------------------------------------------------------------
// EL EDITOR DE PLANTILLAS
// ------------------------------------------------------------------
// Un <div contenteditable> con barra de formato, no un <textarea>.
//
// El textarea obliga a guardar texto plano y a reinterpretar los saltos al
// imprimir. El resultado cambia entre navegadores: el mismo papel se ve bien
// en un computador y mal en otro, y eso se descubre cuando ya se firmano
// veinte. Con HTML guardado, lo que se ve en el editor es lo que sale en el
// papel.
//
// execCommand está "obsoleto" según el estándar pero es lo único que da
// formato enriquecido sin instalar una librería de editor entera. Para un
// acta (negrita, cursiva, listas, tamaño) alcanza y sobra.
// Y LA FORMA QUE SE MUESTRA ES LA QUE SIRVE: [NOMBRE]
//
// ---------------------------------------------------------------------
// POR QUÉ ESTA TABLA CAMBIÓ DE "{{nombre}}" A "[NOMBRE]"
// ---------------------------------------------------------------------
//
// Porque se mostraba la forma vieja y no la buena. El que copia de acá y pega en el Word
// escribía "{{nombre}}", que la base reconoce pero que NO es la canónica: la que usa la función
// campos_de_plantilla() es "[NOMBRE]", con corchetes y mayúsculas.
//
// Y un documento con dos sintaxis es peor que uno sin variables, porque nadie sabe cuál usar. El
// que escribe tiene que mirar la ayuda, y si la ayuda muestra la vieja, escribe la vieja.
//
// ---------------------------------------------------------------------
// Y LAS DOS VIEJAS SIGUEN FUNCIONANDO
// ---------------------------------------------------------------------
//
// No se borran de la base: hay documentos ya armados con "{{nombre}}" y con "{nombre}", y si dejaran
// de recognized se romperían al descargar. Cambia lo que se MUESTRA, no lo que se ACEPTA.
//
// ---------------------------------------------------------------------
// Y EL NOMBRE EN MAYÚSCULAS DENTRO DEL CORCHETE
// ---------------------------------------------------------------------
//
// "[nombre]" con minúscula no es la misma variable que "[NOMBRE]", y esa diferencia se ve solo al
// descargar: el documento sale con la palabra "[nombre]" escrita adentro, en un contrato firmado.
// Por eso van todas en mayúscula, y por eso el catálogo tiene un "check" que lo prohíbe.
```


## undefined

```js
  // Y LA CATEGORÍA, QUE ANTES NO SE LLENABA AL ABRIR
  //
  // "plantillaCategoria" se leía al GUARDAR, pero nunca se ponía el valor de la
  // plantilla. O sea que al abrir una plantilla para editarla, el select
  // quedaba en su primera opción, y al guardar se leía esa.
  //
  // El resultado: editar una plantilla para cambiarle el texto le pisaba la
  // categoría por "formulario". Una charla de inductización que era charla se
  // volvía formulario, sin aviso, y sin que nadie lo hiciera a propósito.
  //
  // Es el mismo patrón del bug de la firma: una cosa que se lee pero nunca se
  // escribe, y el efecto aparece a la segunda vez que se usa, que es cuando
  // alguien edita algo que ya existía.
```


## undefined

```js
// ------------------------------------------------------------------
// EL ESTADO DEL TOKEN, DICHO ANTES DE PREGUNTAR
// ------------------------------------------------------------------
// La pregunta "no encuentro el token del reloj" viene de abrir el formulario
// y ver un campo vacío. Un campo vacío no dice si hay que pegar algo, si ya
// está instalado, o si hay que rotarlo. Con las tres respuestas posibles
// escritas, la persona sabe qué hacer sin preguntar.
// El campo de pegar el token, y el boton de olvidarlo.
//
// ------------------------------------------------------------------
// LA HORA, AL CENTRO Y GRANDE
// ------------------------------------------------------------------
// Estaba en la esquina superior derecha, chica. En un cartel de portería,
// colgado a la altura de la cabeza, a dos metros: la hora es lo primero
// que la gente mira para decidir si su marcación fue correcta, y si hay
// que acercarse a leerla, no sirve.
//
// Va centrada y con el segundero parado cuando la lectura es correcta. Es
// el mismo número que se acaba de guardar, y no el del reloj del aparato:
// si los dos difieren, hay que ver los dos, y verlos juntos muestra de
// una dónde está el desfase (casi siempre, en el reloj del aparato).
```


## undefined

```js
// -------------------------------------------------------------------
// LOS MARCAJES DE HOY, PARA EL TÓTEM
// -------------------------------------------------------------------
// Aparte de la variable "marcajes" de la planilla, y POR PROPOSITO, no por
// descuido:
//
// La "marcajes" la llena "loadMarcajesDia()", que es la que corre al abrir la
// PESTAÑA de la planilla del día, y pide 60 días. El tótem no puede pedir 60 días
// en una portería para pintar un número que es de HOY. Y si compartieran variable,
// abrir la planilla pisaría lo del tótem con 60 días y abrir el tótem la dejaría
// con un día: cada pantalla con lo suyo.
//
// ------------------------------------------------------------------
// LA FICHA PERSONAL, Y EL FORMATO
// ============================================================
// LOS MARCAJES
// ===================================================================
// LOS TRES NÚMEROS DE LA BARRA
// ===================================================================
//
// Se cuentan sobre lo que YA está cargado en la memoria, y no con una
// consulta nueva. La razón no es ahorrar: es que la pantalla del reloj se
// abre en la portería, muchas veces al mismo tiempo, y una consulta por cada
// marcaje y por cada reloj abierto es exactamente lo que hace que un aparato
// viejo se ponga lento.
//
// CUANDO NO SE SABE, SE ESCRIBE "—"
// ---------------------------------
// Si el rango de marcajes que se tiene cargado no incluye el día de hoy, los
// tres números se quedan en "—". Poner 0 sería peor que no poner nada: 0 dice
// "no marcó nadie", que es un hecho sobre la obra, y en una portería un 0
// falso se cree.
//
// Y no se inventa el dato yendo a buscarlo: en la portería, esperar una
// consulta es peor que no tener el número. Se muestra lo que se sabe.
// ------------------------------------------------------------------
// EL CENTRO DE COSTO
// ------------------------------------------------------------------
// El filtro por reloj no contesta "¿quién trabajó en la obra Norte?". El
// reloj es el aparato; el centro de costo es contra qué se paga, y es lo que
// necesita la planilla. Son dos cosas distintas y se piden las dos.
```


## undefined

```js
// ------------------------------------------------------------------
// COPIAR LA FICHA ENTERA
// ------------------------------------------------------------------
// Separado por tabuladores, NO por comas.
//
// El tabulador es el separador que Excel y Google Sheets reconocen al
// pegar, y es el unico que no se rompe con un punto y coma dentro de un
// texto. Un nombre de empresa con coma, o una observacion de salud con
// punto y coma, partirian la fila en dos y la mitad de los datos
// quedaria en la columna equivocada.
//
// Ademas lleva el nombre del campo arriba, con la misma lista. Pegado en
// una hoja queda con encabezado, y la persona ve que columna es cada
// cosa sin preguntar.
```


## undefined

```js
// -------------------------------------------------------------------
// EL CARGO SE ESCRIBE UNA SOLA VEZ
// -------------------------------------------------------------------
// Al elegir el cargo, "Cargo para las planillas" se completa con el nombre de ese cargo. Es
// el texto que sale impreso en las planillas y en la credencial, y antes había que
// escribirlo a mano, igual que ya estaba elegido en el desplegable.
//
// Tres reglas, y las tres importan:
//
//   1. SOLO SI EL CAMPO ESTÁ VACÍO. Si alguien ya escribió algo —"Maestro de obra, sector
//      norte"— no se pisa. Ese texto a mano es información que el desplegable no tiene.
//   2. AL VACIAR EL DESPLEGABLE TAMPOCO SE BORRA. "Sin asignar" no significa "el texto
//      está mal": el cargo puede no estar en el catálogo y el texto igual ser el correcto.
//   3. NO ESCRIBE SI NO HAY CARGO ELEGIDO. Por lo mismo del punto 2.
```


## undefined

```js
// ===================================================================
// ============================================================
// ============================================================
// ------------------------------------------------------------------
// QUE RESUELVE
// ------------
// Que se pueda llevar los datos de un trabajador a otro sistema. Y hay dos
// maneras, porque no todos los sistemas de remuneraciones dejan importar:
//
//   a) el que TIENE importacion: se le da el archivo
//   b) el que NO tiene: se copia campo por campo y se pega a mano
//
// Para el caso (b) no sirve de nada un boton de copiar por campo si el
// campo no esta, o si el boton no dice si se copio o no. Por eso el
// boton cambia un instante y lo dice.
//
//
// EL FORMATO ESTA DEFINIDO ACA, Y EN UN SOLO LADO
// -----------------------------------------------
// CAMPOS_FICHA es la unica lista. La pantalla la usa para pintar las
// filas, y la descarga la usa para escribir el archivo. No hay dos listas.
//
// Cuando hay dos listas, la primera se actualiza y la segunda no, y el
// resultado es una pantalla con un campo que el archivo no tiene, o al
// reves. Eso es peor que no tener formato: es un formato que miente.
//
// Con una sola lista no puede pasar: si el campo esta en la pantalla, esta
// en el archivo, porque salen del mismo lugar.
//
//
// QUE SIGNIFICA CADA COSA DE LA LISTA
// ----------------------------------
//   clave     el nombre del campo, como esta en la base. Cambia si cambia
//             la base, y eso hay que saberlo.
//   etiqueta  lo que se ve escrito. Es lo que el usuario lee para saber
//             que campo esta copiando.
//   grupo     para que la ficha no sea una lista de 25 renglones sueltos.
//   formato   como se convierte el valor al archivo. Un RUT se escribe
//             con guiones, un telefono sin ellos, y una fecha como AAAA-MM-DD.
//             Si no se dice, cada quien lo escribe como quiere y el
//             archivo entra igual en el sistema equivocado.
//
// LA VERSION DEL FORMATO
// ----------------------
// El archivo lleva su version en la primera linea. Si un dia se agrega un
// campo, la version pasa a 2, y el que recibe el archivo sabe que no es el
// mismo que recibio la vez pasada. Sin eso, un archivo viejo y uno nuevo se
// ven iguales y nadie sabe cual es cual.
//
// La version va PRIMERA y sola en su linea, con un # adelante para que
// ningun sistema la tome como un dato de un trabajador. Si el sistema
// receptor no la entiende, la ignora como un comentario: es preferible
// que ignore una linea a que tome la version como si fuera el nombre de
// un trabajador.
```


## undefined

```js
// -------------------------------------------------------------------
// Y POR QUÉ ANTES NO SALÍAN, Y POR QUÉ NO SE PREGUNTABA NADA
// -------------------------------------------------------------------
// Antes los tres números se contaban sobre "marcajes", que solo se llena al abrir
// la pestaña de la planilla. El tótem es otra pantalla: se abre con "abrirTotem()",
// y esa función no cargaba marcajes.
//
// O sea que los números salían solo si alguien, ANTES de ir a la portería, había
// abierto la planilla del día. En un aparato de la portería eso no pasa nunca.
//
// El código viejo lo decía sin ver la consecuencia: "se cuentan sobre lo que YA
// está cargado en la memoria, y no con una consulta nueva. La razón no es ahorrar:
// es que la pantalla del reloj se abre en la portería, muchas veces al mismo
// tiempo, y una consulta por cada marcaje y por cada reloj abierto es exactamente
// lo que hace que un aparato viejo se ponga lento."
//
// Lo que dice es cierto: una consulta POR MARCAJE es Mala idea en un aparato viejo.
// Lo que no decía es que "lo que ya está cargado" en la portería es NADA. De ahí
// salía el "—". La diferencia ahora es que hay UNA consulta al abrir, y ninguna
// por marcaje.
//
// ------------------------------------------------------------------
// COMPROBAR EL TOKEN CONTRA LA BASE
// ------------------------------------------------------------------
// La migración 036. Devuelve tres cosas y no un sí o un no, porque son
// tres casos que la persona tiene que distinguir:
//
//   - sinRed: la base no respondió. NO se toca lo que hay instalado.
//   - ok:     el token sirve para este reloj.
//   - motivo: por qué no sirve, en palabras.
//
// Un token puede estar mal por cinco razones, y cada una se arregla con
// una acción distinta. Que la base diga cuál es, y que esta función solo
// la traduzca, es lo que hace que el mensaje sirva de algo.
```


## undefined

```js
      // ----------------------------------------------------------------
      // LEER LA RESPUESTA, QUE VIENE EN ARRAY
      // ----------------------------------------------------------------
      // Esto era el bug que impedía instalar un token que estaba bien.
      //
      // comprobar_token_reloj devuelve "table (ok boolean, motivo text)",
      // y PostgREST responde a una función que devuelve tabla con un
      // ARRAY: [{ok:true, motivo:'OK'}].
      //
      // El código leía data.comprobar_token_reloj, que no existe en un
      // array, y se quedaba con el array entero. Entonces r.ok era
      // undefined, que es distinto de false, así que caía en la rama del
      // error y anunciaba "el token no es de este reloj".
      //
      // O sea: la base decía QUE SÍ, y la pantalla decía QUE NO. El
      // token estaba bien, el hash estaba bien, y no se podía instalar.
      //
      // En el resto de la aplicación el patrón correcto ya estaba usado:
      // "Array.isArray(data) ? data[0] : data". Acá no se usó, y por eso
      // el fallo era invisible: la respuesta era válida, solo que mal
      // leída.
```


## undefined

```js
// ------------------------------------------------------------------
// POR QUE EL CAMPO NO SE RELLENA CON LO QUE HAY GUARDADO
// ------------------------------------------------------------------
// Antes, al abrir esta pantalla el campo de pegar venia con el token que
// ya estaba en el navegador, y el cartel decia "este reloj ya está instalado en
// este navegador".
//
// El problema es que las dos cosas son verdad y las dos enganan. Lo que
// habia ahi podia ser cualquier cosa: en una instalacion de antes de que
// existiera la comprobacion, se guardaba lo que se pegara sin mirar. Quedo
// un id de usuario guardado como si fuera un token de un reloj.
//
// Entonces la persona veia "ya está instalado", apretaba Instalar, y la base
// contestaba "el token es válido pero no es el de este reloj". Sin forma de
// limpiar lo guardado, tampoco habia salida desde la pantalla.
//
// Ahora el campo arranca VACíO, con el ejemplo en el texto de ayuda. Si hay
// algo guardado, el cartel lo dice pero aclarando que no se sabe si es el
// bueno, y hay un boton para borrarlo.
//
// Vacío y no con el ejemplo puesto como valor: un valor de ejemplo es un token
// que no existe, y alguien lo va a instalar sin querer. Como texto de ayuda
// no se puede instalar por accidente.
```


## undefined

```js
// ------------------------------------------------------------------
// LEER LA FILA DE UNA FUNCIÓN QUE DEVUELVE TABLA
// ------------------------------------------------------------------
// PostgREST responde distinto según lo que devuelva la función:
//
//   returns table  ->  un ARRAY de filas:  [{ok:true}]
//   returns json   ->  {ok:true}
//   returns text   ->  el valor solo:     "algo"
//
// Y según la versión y el esquema, la fila puede venir envuelta con el
// nombre de la función. Por eso se prueban las tres formas y se devuelve
// la primera que tenga la forma de una fila.
//
// Es una función chiquita, pero es la que decide si el token se instala o
// no. Cuando la respuesta se leyó mal, el síntoma fue "el token no sirve"
// para un token que sí servía: un error de lectura disfrazado de error de
// la base, que es la forma más difícil de pillar que hay.
```


## undefined

```js
// ------------------------------------------------------------------
// EL GUARDAR EL TOKEN DESDE LA PANTALLA DE RELOJES
// ------------------------------------------------------------------
// Tres cosas estaban mal, y las tres terminan con un reloj que no marca y
// sin que nadie sepa por qué.
//
// 1) NO COMPROBABA EL TOKEN ANTES DE GUARDARLO.
//
//    El reloj, en su pantalla, comprueba el token antes de usarlo. Esta
//    pantalla no: guardaba lo que se le pegara. Se podía instalar el
//    token de otro reloj, o cortado al pegar, y la pantalla decía
//    "guardado". El error aparecía recién en el primer marcaje, en la
//    portería, con la gente esperando.
//
//    Y hay una razón de fondo para que sea grave: guardar un token
//    equivocado es una de las pocas acciones que deja al sistema sin
//    registrar, y sin que en la planilla se note que falta nada.
//
// 2) NO ACTUALIZABA EL ESTADO DE LA PANTALLA.
//
//    El texto de arriba decía "este reloj NO está instalado en este
//    navegador". Después de apretar Instalar, seguía diciendo exactamente
//    eso, con el token recién guardado. La pantalla le mintió a la
//    persona justo después de hacer lo que le pedía.
//
// 3) NO DISTINGUÍA "NO PUDO COMPROBAR" DE "NO SIRVE".
//
//    Un corte de conexión de un segundo y un token equivocado dan el
//    mismo error de la base. No pueden llevar la misma respuesta: con el
//    primero no se toca nada y se reintenta; con el segundo no se guarda
//    y hay que rotar el token.
//
// Lo que sigue: el token se comprueba contra la base antes de guardarlo,
// el estado se repinta después, y el diálogo se cierra para que la
// persona pueda ir a probarlo.
```


## undefined

```js
// ------------------------------------------------------------------
// LA CONEXIÓN
// ------------------------------------------------------------------
// Tres estados, y se distinguen a propósito:
//
//   CON CONEXIÓN   se puede marcar. Es lo normal.
//   SIN CONEXIÓN   el reloj sigue funcionando: guarda la marcación en el
//                  aparato y la sube cuando vuelve (art. 10 de la
//                  Resolución Exenta 38/2024). La gente tiene que saber
//                  esto, o se va a repetir la marcación cinco veces
//                  pensando que no entró.
//   COMPROBANDO    al abrir, antes de saber. Se muestra un instante.
//
// El icono es un punto de color, no un dibujo: a dos metros y con luz de
// obra, un punto de 14 px se ve y un glifo no. Y lleva texto al lado,
// porque el color solo no sirve para quien no distingue rojo de verde.
```


## undefined

```js
// ------------------------------------------------------------------
// DESCARGAR LA FICHA, CON SU FORMATO
// ------------------------------------------------------------------
// Un CSV, no un Excel. El motivo es concreto: el archivo va a un sistema
// de remuneraciones que lo lee por columnas, y un .xlsx tiene
// hojas, formatos y una estructura interna que hay que entender. Un CSV
// es texto plano: se abre en cualquier lado y se ve.
//
// Separa por punto y coma, que es lo que aceptan casi todos los sistemas
// de remuneraciones en la region. Y lo pone en la configuracion:
// si el sistema de destino usa coma, se cambia UNA constante y el archivo
// entero cambia con ella.
```


## undefined

```js
// -------------------------------------------------------------------
// CARGAR LOS MARCAJES DE HOY, UNA VEZ AL ABRIR EL TÓTEM
// -------------------------------------------------------------------
// Y UNA SOLA VEZ, no una por marcaje. Esa era la razón por la que el código viejo
// no consultaba nada: la pantalla se abre en la portería, muchas veces al mismo
// tiempo, y un aparato viejo se pone lento si cada marcaje va a la base.
//
// La diferencia es que antes no se consultaba NUNCA, y "nunca" en la portería es
// "nunca": no hay nadie abriendo la planilla del día en un aparato de la portería.
// Una consulta al abrir, y después el número vive en la memoria.
//
// Y si falla, se guarda el motivo y se sigue: el reloj tiene que poder MARCAR
// aunque los contadores no se pinten. Un contador que bloquea el marcaje es peor que
// un contador en "—".
```


## undefined

```js
// ------------------------------------------------------------------
// COPIAR
// ------------------------------------------------------------------
// Por que no se usa el portapapeles a secas: cuando la pagina no esta
// en https, o cuando el navegador lo niegue, navigator.clipboard no
// existe o falla, y la excepcion se come el error. En una obra, con la
// aplicacion instalada en un equipo viejo o abierta como archivo, eso
// pasa seguido.
//
// Por eso hay un camino de reserva con un textarea invisible, que es lo
// que funcione siempre. Y en los dos caminos el boton dice que copio:
// copiar en silencio deja a la persona creyendo que quedo en el
// portapapeles cuando no quedo, y eso es peor que no copiar.
```


## undefined

```js
// LA EMPRESA, EN LA PANTALLA DEL RELOJ
//
// El logo se sube en Configurar y queda en la empresa como un data-URL
// (columna "logo"). Esto lo trae a la pantalla del reloj.
//
// Va debajo de la camara, no arriba del todo, porque arriba esta la hora
// y la hora es lo que la persona viene a ver. La empresa va con la
// camara porque son las dos cosas que confirman que la persona esta
// donde debe: la camara es donde apunta la cara, y la empresa es de
// quien es el reloj.
//
// Si no hay logo, no se dibuja nada: queda solo el nombre. Un rectangulo
// vacio con un borde seria peor, porque parece que falta algo.
// EL PLACEHOLDER DEL CAMPO, SEGUN COMO LEE EL RELOJ
//
// El mensaje grande de arriba ya decia lo correcto: "frente a la camara" con
// camara, y "o pasala por el lector" con lector USB. Lo que decia mal era el
// placeholder del campo, que siempre mencionaba la camara.
//
// Ahora el placeholder se pone segun el lector, y no al reves. Un texto que
// dice una cosa y la pantalla dice otra es peor que un texto generico: la
// persona se queda con la instruccion que ve mas grande.
//
// Con camara: el campo es el respaldo, para cuando el QR no se lee. Se dice
// eso, y no "presenta la tarjeta", porque la camara ya se encarga.
//
// Con lector USB: la tarjeta se pasa por ahi y el campo queda solo para
// escribir el numero a mano. Que es lo unico que sirve hacer en el.
```


## undefined

```js
  // ------------------------------------------------------------------
  // LA EMPRESA DEL RELOJ, NO LA DEL DESPLEGABLE
  // ------------------------------------------------------------------
  // Antes usaba empresaDelPapel(), que devuelve la empresa seleccionada arriba.
  // En la portería eso no sirve: en la portería nadie selecciona nada, y el
  // reloj es de una empresa sola. Con el desplegable en "todas las empresas" o
  // en otra, el tótem mostraba el nombre y el logo de la empresa equivocada.
  //
  // Y no es un detalle: el logo es lo que dice de quién es el papel que se está
  // firmando ahí. Con dos empresas en el sistema se firmaba con el logo de la
  // otra.
  //
  // Si la empresa del reloj no está en la lista que esta persona puede ver, se
  // deja el nombre en el número de id: es mejor un código que un nombre
  // equivocado.
```


## undefined

```js
    // ------------------------------------------------------------------
    // EL REYLO ESTÁ CERRADO
    // ------------------------------------------------------------------
    // Es un caso aparte y no un error más, porque lo que la persona tiene que
    // hacer es otra cosa: no reintentar. El reloj tiene un horario y ahora no
    // está dentro, y la respuesta a eso no es provar otra vez con la tarjeta en
    // la mano.
    //
    // Y se dice a dónde ir. Un "no se pudo marcar" sin más en un aparato de la
    // portería es un callejón sin salida: la persona no tiene teléfono, no
    // tiene usuario y no puede hacer nada. Por eso el texto nombra a quién y
    // en qué pantalla.
```


## undefined

```js
// ------------------------------------------------------------------
// LOS AVISOS EN LA PANTALLA DEL RELOJ
// ------------------------------------------------------------------
// Un aviso es una indicacion que le dejo alguien a una persona: que se
// presente en Prevencion, que falta un documento, que la manden a la hora.
//
// Lo que ya existe y se usa aca: la tabla avisos_ingreso, de la 023. Trae
// lo que hace falta y no hay que inventar nada:
//
//   indicacion         que dice
//   enviado_por_nombre quien lo dejo
//   estado             enviado | confirmado | rechazado
//
//
// LOS TRES ESTADOS DEL RECUADRO
// -----------------------------
//   verde     marco y no tiene nada pendiente
//   amarillo  marco y TIENE un aviso sin confirmar
//   rojo      no se pudo marcar
//
// El amarillo va en el FONDO, no solo en el color de la letra, porque a
// dos metros de la porteria no se lee la diferencia entre dos textos
// oscuros. El fondo se ve igual.
//
//
// LO QUE NO SE DICE, Y POR QUE
// ---------------------------
// La ventana del aviso no dice "se envio a su correo" a secas. No hay
// proveedor de correo configurado, asi que el aviso esta REGISTRADO pero
// no esta ENVIADO, y si la pantalla le dice a la persona que lo tiene en
// el correo, la persona no lo va a buscar y el aviso se pierde.
//
// El texto se arma con el estado real: si nadie lo confirmo, dice que
// esta pendiente; si ya lo confirmo, dice cuando. Cuando haya proveedor,
// el mismo texto dira que si esta en el correo, y no habria que tocarlo.
//
//
// CUANDO SE ABRE LA VENTANA, Y CUANDO NO
// --------------------------------------
// En el momento del marcaje, si. La persona esta parada ahi, es el mejor
// momento posible para que se entere, y si no se le dice ahora, no se le
// dice nunca: se va a trabajar y se olvida.
//
// Despues, no. A las nueve de la noche no se le abre una ventana a
// nadie encima: se le deja un boton con la cantidad, y lo abre cuando
// quiera. Por eso el boton esta siempre ahi mientras haya algo pendiente.
```


## undefined

```js
// EL ESTADO REAL DEL AVISO, DICHO COMO ES
//
// Esto es lo mas importante de la ventana. Alguien tiene que poder leer
// aqui, sin adivinar, si esto ya se mando o no.
//
//   con correo configurado  "Tambien esta en tu correo."
//   sin correo configurado  "Queda registrado en el sistema, pero todavia
//                            NO se mando a ningun correo. Si no lo acatas
//                            aqui, avisale a tu supervisor."
//
// Decirle a la persona que esta en su correo cuando no esta hace que no
// lo busque, y el aviso se pierde sin que nadie se entere.
```


## undefined

```js
// ===================================================================
// LOS PAPELES FIRMADOS
// ===================================================================
//
// Qué muestra: los papeles que están en "firmas_documento", con los cuatro
// filtros que se pidieron.
//
// Y POR QUE NO SE USA "entregas_contratacion"
//
// Porque esa tabla tiene el papel "en curso" y el papel firmado en la misma
// fila, y el que manda para un contrato firmado es el que tiene la huella.
// "entregas_contratacion" se lee para abrir el papel; esta vista es para ver
// lo que ya quedó firmado, que es otra pregunta.
//
// ---------------------------------------------------------------------
// LOS FILTROS, Y POR QUÉ SON ESOS
// ---------------------------------------------------------------------
//
// El pedido fue "una vista donde ver los documentos firmados en su carpeta y
// filtros". "Su carpeta" es la de un trabajador: la lista de lo que firmó esa
// persona. Y los filtros tienen que responder las preguntas que se hacen en la
// oficina:
//
//   de qué persona      -> la carpeta
//   de qué tipo         -> solo contratos, solo anexos, solo Forms
//   de cuándo           -> desde / hasta
//   de qué empresa      -> cuando se ven todas las empresas
//   y un buscador       -> por nombre del papel o del trabajador
//
// El buscador va aparte de los desplegables a propósito: los desplegables son
// para valores exactos, y el buscador es para cuando uno no se acuerda del
// nombre exacto.
//
// ---------------------------------------------------------------------
// POR QUE EL RLS DEJA VERLO SIN PEDIR PERMISO NUEVO
// ---------------------------------------------------------------------
//
// La política de lectura de la 079 usa "puede_ver_trabajador", que ya responde
// "puedo ver a esta persona en esta empresa". Reusarla es lo correcto: si se
// escribiera una regla nueva para esta vista, habría dos reglas de empresa que
// se pueden desincronizar, y un día una muestra más que la otra.
//
// La pantalla igual pide "contratacion.ver" para abrir la vista, que es lo que
// corresponde al botón del menú.
// ---------------------------------------------------------------------
// EL ESTADO
// ---------------------------------------------------------------------
```


## undefined

```js
// ---------------------------------------------------------------------
// CARGAR
// ---------------------------------------------------------------------
// Y LA COLUMNA DE TRABAJADORES, PORQUE EL RUT Y LA ESPECIALIDAD ESTAN ALLA
//
// "puede_ver_trabajador" resuelve la pregunta con el "code", asi que se puede
// pedir el nombre desde la otra tabla. Pero la consulta es a "firmas_documento"
// y el RLS de "trabajadores" es el suyo: si se pide con "!inner", y el RLS
// esconde a alguien, desaparece la fila entera de la firma, y el papel firmado
// de esa persona no aparece en la lista. Eso es peor que mostrarlo sin nombre.
//
// Por eso es un "left join" implícito: se pide solo "firmas_documento", y el
// nombre sale de lo que ya esta cargado en "workers", que es la misma lista que
// usa el resto de la pantalla.
```


## undefined

```js
    // Y "let", NO "const"
    //
    // Porque abajo se le encadenan filtros, y cada ".eq()" devuelve una
    // consulta NUEVA. Con "const" la reasignacion tira "Assignment to constant
    // variable" y la lista entera no carga.
    //
    // Y ESTO NO LO AGARRA NINGUN GUARDIAN
    //
    // Los 27 guardianes comprueban que el archivo exista, que las variables
    // esten declaradas una vez y que los ids del HTML esten en el JS. Ninguno
    // EJECUTA el codigo, y este error solo aparece al correr: es el primero de
    // la clase "esta bien escrito y no funciona", que es la que los guardianes
    // no pueden ver.
```


## undefined

```js
// ---------------------------------------------------------------------
// EL RESUMEN, QUE DICE SI LA LISTA ESTÁ COMPLETA O TRUNCADA
// ---------------------------------------------------------------------
// Y POR QUE HACE FALTA
//
// El limite de 1000 filas es lo que hace que un listado "se vea bien y no esté
// completo". Con 1200 papeles firmados, la lista muestra 1000 y no dice nada.
// Quien lo use para contar, cuenta mal.
//
// Ojo: el aviso va también cuando hay exactamente 1000. Es el caso que no se
// puede distinguir, y por eso se dice. Es preferible un aviso de mas a una
// lista troncada en silencio.
```


## undefined

```js
// EL PAPEL QUE SE MUESTRA AL VER
//
// Y QUE NO ES EL DE HOY
//
// Acá está el motivo de que la huella sirva: el papel que se guarda con la
// firma es el que se VIO ese día, con los datos de ese día. Si el trabajador se
// llama distinto hoy, o la plantilla cambió, el papel de la firma sigue siendo
// el que se le mostró.
//
// Lo que se guarda, entonces, es la huella y las firmas. El texto no: la base
// no lo tiene. Por eso la vista muestra los datos copiados de la firma y la
// huella, y para ver el texto entero hay que volver a generar el papel. Y eso
// puede dar un texto distinto al que se firmó, que es justo lo que la huella
// sirve para detectar.
```


## undefined

```js
// VERIFICAR
//
// Y QUE RECALCULA EL PAPEL DE HOY, NO EL QUE SE FIRMÓ
//
// Esta es la parte que hay que entender, y es la que hace que la verificación
// tenga sentido: se rearma el papel con los datos de HOY y se compara su hash
// con el guardado.
//
//   iguales      -> el papel no cambió: ni la plantilla ni los datos
//   distintos    -> algo cambió. Puede ser la plantilla editada, o el
//                   trabajador cambiado de nombre, o specialty.
//
// Y eso NO es "el documento fue alterado": es "el papel de hoy no es el que se
// firmó". Las dos cosas son distintas, y la segunda es normal: la plantilla se
// edita, el nombre cambia. Lo que no puede pasar es que se edite el papel
// firmado, y para eso está la huella.
```


## undefined

```js
// DESCARGAR
//
// Y QUE ES EL .DOC QUE SE GENERA HOY, NO EL QUE SE FIRMÓ
//
// Y POR QUÉ NO SE PUEDE DESCARGAR EL ORIGINAL
//
// Porque la base no lo tiene. "firmas_documento" guarda la huella y las firmas,
// no el texto del papel: el papel se armaba en el navegador y se iba. Guardarlo
// entero necesitaría otra columna con el HTML, y el HTML tiene las firmas
// dibujadas adentro, que pesan.
//
// O sea: el papel firmado no se puede volver a bajar tal cual. Esto no es un
// recorte del tiempo, es lo que hay. Y por eso lo que se descarga es el papel
// de HOY, con la huella al lado, para que el que lo reciba pueda compararla.
// Y LA DESCARGA, COPIADA DEL PATRON QUE YA HACE "documentos.js"
//
// Porque ya existe y anda: arma un HTML completo, lo mete en un Blob de
// "application/msword" y lo baja. Un .doc de Word ES un HTML con otra
// extensión, y por eso el texto queda seleccionable y se puede buscar
// adentro. Es mejor que una imagen.
//
// El nombre del archivo lleva el nombre del trabajador: "Contrato.doc" en una
// carpeta con veinte descargas es un documento que no se encuentra.
```


## undefined

```js
// ===================================================================
// LOS MARCAJES: LA PANTALLA QUE FALTAVA
// ===================================================================
//
// Qué se encontró
// ---------------
//
// El HTML de la pantalla estaba completo: los seis filtros, los botones de
// atajo, y dos cajas de salida ("marcajesAviso" y "marcajesLista"). Y el
// codigo la llamaba bien:
//
//     (relojCargado?Promise.resolve():cargarRelojes())
//       .then(()=>cargarMarcajes())
//       .then(llenarFiltroRelojesMarcajes)
//       .then(llenarFiltroCentrosMarcajes)
//
// Pero de esa cadena, TRES funciones no existian: "cargarMarcajes",
// "llenarFiltroRelojesMarcajes" y "llenarFiltroCentrosMarcajes". Y tampoco
// "filtrarMarcajes" ni "atajoMarcajes", que el HTML llama desde los filtros.
//
// O sea: la pantalla entera estaba muerta. Los filtros se veian, se le
// escribia, y no pasaba nada: la lista nunca se dibujo nunca.
//
// ---------------------------------------------------------------------
// LOS DATOS, Y LOS NOMBRES QUE TIENEN DE VERDAD
// ---------------------------------------------------------------------
//
// Se leyo la migracion 017 (donde nace "marcajes") y la 030 (que le agrega
// "reloj_id"). Las columnas son:
//
//   id code fecha hora tipo origen nota
//   registrado_por registrado_por_nombre created_at reloj_id
//
// Y "marcajes" NO TIENE reloj_code, ni centro_costo_id, ni centro_costo.
//
// La primera version de esta pantalla asumia las tres. Habria mostrado "—" en
// cada fila y el filtro por centro no habria filtrado nada, sin ningun error.
//
// El reloj se llega por "reloj_id", que es un UUID, y el nombre esta en la
// tabla "relojes" (030), que tiene id, code, nombre y centro_costo_id. Ese
// ultimo es lo que permite filtrar por CENTRO sin tocar "marcajes": el centro
// es del reloj, no del marcaje.
//
// O sea que el camino correcto es una consulta sola que une las dos tablas.
// Una consulta, no dos y un cruce en el navegador: "relojes" tiene RLS y el
// marcaje puede verse sin que el reloj se vea, y un "left join" desde
// "marcajes" devuelve la fila igual.
//
// Y POR QUE NO ES "!inner"
//
// Porque si el reloj se borro, el marcaje sigue existiendo. Con "inner" el
// marcaje desaparece de la lista, y el contador de marcajes de la asistencia
// dejaria de cuadrar con lo que se ve.
// ---------------------------------------------------------------------
// EL ESTADO
// ---------------------------------------------------------------------
// Y SOLO UNA LISTA, NO DOS
//
// Antes habria dos: "brutos" y "vista". Pero si el filtro por reloj y por
// centro va en la consulta, lo unico que se filtra en el navegador es el texto.
// Y para eso no hace falta una segunda lista: se calcula al pintar.
```


## undefined

```js
// ---------------------------------------------------------------------
// FILTRAR
// ---------------------------------------------------------------------
// Y ESTA ES LA QUE EL HTML LLAMA DESDE CADA FILTRO
//
// El rango de fechas y el reloj y el centro van en la CONSULTA, asi que cambiar
// cualquiera de los tres recarga. Y "filtrarMarcajes" se llama desde el
// buscador de texto, que si se filtra aqui.
//
// Por eso la funcion recarga cuando NO hay texto, y solo repinta cuando hay.
//
// El texto es el unico filtro que se aplica aca, porque un texto libre no se
// puede mandar a la base sin traer todo lo posible. Los demas van en la
// consulta.
```


## undefined

```js
// ---------------------------------------------------------------------
// EL FILTRO DE RELOJES, QUE TAMPOCO EXISTIA
// ---------------------------------------------------------------------
// Y POR QUE SE USA LA LISTA DE RELOJES QUE YA ESTA CARGADA
//
// Porque el codigo la llama encadenada DESPUES de "cargarRelojes", que es lo
// que la deja poder leer. Si esta pantalla se abriera sin relojes cargados,
// la lista saldria vacia y el filtro no serviria para nada.
//
// Y por eso el <option> lleva el "id" y no el "code": el marcaje tiene
// "reloj_id" y nada mas. Si el <option> llevara el codigo, el filtro no
// encontraria nunca una coincidencia.
```


## undefined

```js
// Y EL DE CENTROS DE COSTO YA EXISTIA
//
// "llenarFiltroCentrosMarcajes" estaba mas arriba, en la parte de los filtros,
// y andaba bien. La volvi a escribir aqui y el guardian "compila-juntos" la
// vio declarada dos veces: los archivos comparten ambito, asi que la segunda
// pisa a la primera.
//
// No se toco la que estaba. La duplicada se borro.
// ---------------------------------------------------------------------
// LOS ATAJOS DE FECHA
// ---------------------------------------------------------------------
// "hoy", "ayer", "semana", "todo"
```


## undefined

```js
// ------------------------------------------------------------------
// LAS PESTAÑAS DEL KIT
// ------------------------------------------------------------------
// Los cuatro bloques de la vista del kit van en pestañas: plantillas, firmados,
// campos y timbre. Antes iban apilados y había que hacer scroll para llegar al
// último.
//
// Y NO SE USA "hidden" CON CLASES CSS
//
// El atributo "hidden" es lo que le dice al navegador y a los lectores de pantalla
// que ese bloque no existe. Con una clase que pone "display:none", el bloque sigue
// existiendo para el teclado: se puede llegar con el tabulador a un campo invisible.
// Con "hidden" no.
//
// Y POR QUÉ GUARDA LA PESTAÑA
//
// Porque la que se mira todos los días es "Firmados". Si siempre arrancara en
// "Plantillas", habría que apretarla cada vez.
```
