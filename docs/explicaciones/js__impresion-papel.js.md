# js/impresion-papel.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ===================================================================
// LA IMPRESION DEL PAPEL, EN UNA VENTANA PROPIA
// ===================================================================
//
// ---------------------------------------------------------------------
// POR QUE UNA VENTANA NUEVA Y NO CSS
// ---------------------------------------------------------------------
//
// Porque se intentó tres veces con CSS de impresión y las tres salió una hoja
// en blanco. Y las tres veces el problema era el MISMO, con distinta forma:
//
//   1. "pantallaTotal" está en "position: fixed; left: -10000px". Al imprimir,
//      un elemento fijo se posiciona respecto de la VENTANA, que es la hoja.
//      El documento entero queda diez mil píxeles a la izquierda.
//
//   2. Esconder con "visibility: hidden" es una cascada. Para que el papel se
//      imprima hay que devolver la visibilidad en cada ancestro, y si a uno se
//      le olvida, no sale.
//
//   3. Esconder con "display: none" y devolver el papel: el papel queda con
//      ancestros, y cualquiera con un estilo raro los rompe.
//
// Los tres dependen de acertar cómo se imprime DENTRO de la página de la
// aplicación. Y no se puede acertar a ciegas, porque "getComputedStyle" en
// pantalla NO lee las reglas de "@media print": no hay forma de comprobarlo sin
// abrir el diálogo de impresión.
//
// ---------------------------------------------------------------------
// LA VENTANA NUEVA LO ARREGLA TODO DE UNA
// ---------------------------------------------------------------------
//
// Porque el papel se imprime SOLO, en un documento que no tiene:
//
//   - el <main> de la aplicación, ni el <header>, ni los menús
//   - la regla "body * { visibility: hidden }"
//   - el "position: fixed" de la caja escondida
//   - ninguna hoja de estilo de la aplicación
//
// El documento nuevo tiene un solo elemento en el cuerpo: el papel. No hay
// ancestros que se puedan olvidar. No hay CSS de la aplicación que pueda
// pisarlo. Y el motor de impresión no tiene nada más que imprimir.
//
// ---------------------------------------------------------------------
// Y LOS ESTILOS VAN EN EL DOCUMENTO NUEVO, NO EN UN "@media print"
// ---------------------------------------------------------------------
//
// Porque en la ventana nueva NO hay que imprimir SÓLO el papel: se puede
// dejar todo a la vista, porque no hay nada más. Y eso es más simple: los
// estilos van en el "<style>" del documento, y el "@media print" es un bloque
// más que puede salir mal.
//
// El "@media print" queda solo para lo único que hay que ajustar en la hoja
// física: los márgenes, que en pantalla no sirven.
//
// ---------------------------------------------------------------------
// Y SI EL NAVEGADOR BLOQUEA LA VENTANA
// ---------------------------------------------------------------------
//
// "window.open" puede devolver null si el navegador lo bloquea. Pasa cuando se
// llama desde un temporizador, no desde un clic.
//
// Por eso esta función se llama DIRECTO desde el clic de "Descargar", sin
// "await" en el medio. Y si aun así devuelve null, se avisa en vez de no hacer
// nada: una ventana bloqueada es un aviso de menos en una pantalla que está
// tratando de decir qué pasó.
// ---------------------------------------------------------------------
// EL TAMAÑO DE LA HOJA
// ---------------------------------------------------------------------
// Y POR QUÉ NO SE USA EL "@page" DEL CSS PRINCIPAL
//
// Porque esta ventana no carga el CSS de la aplicación, y ahí estaba el
// "@page".Va aquí, escrito en el documento, que es donde tiene que estar.
//
// A4 son 210 x 297 mm. Y los márgenes de 15mm dejan 180mm de ancho útil, que es
// lo que usa la tabla del papel.
```


## undefined

```js
// ---------------------------------------------------------------------
// LOS ESTILOS DE LA VENTANA
// ---------------------------------------------------------------------
// Y POR QUÉ NO SE COPIA EL CSS DE LA APLICACIÓN
//
// Porque no interesa cómo se ve en la pantalla. El papel es blanco con texto
// negro, y lo que se necesita es que:
//   - el texto sea del tamaño de un documento, no de una pantalla
//   - las tablas conserven sus columnas
//   - las firmas se vean
//
// Si el papel trae algo que el CSS de la aplicación no tiene, tampoco sale. Y
// eso no se puede arreglar sin el CSS. Por eso los estilos van aparte, y son
// pocos.
```


## undefined

```js
// ---------------------------------------------------------------------
// LA FUNCIÓN
// ---------------------------------------------------------------------
// Y EL ORDEN DE LAS COSAS, QUE IMPORTA
//
//  1. Se abre la ventana.
//  2. Se escribe el documento COMPLETO. Un "document.write" parcial deja la
//     ventana sin "<head>", y sin "<head>" no hay "<style>", y sin "<style>"
//     el papel sale sin formato.
//  3. Se espera a que las imágenes carguen. Las firmas son "data URL", y una
//     imagen que no terminó de cargar imprime un cuadrito vacío.
//  4. Se imprime.
//  5. Se cierra.
//
// Y EL "await" DE LAS IMÁGENES
//
// Es lo que hace que la firma salga. Con "<img>" de un "data URL" la carga es
// casi inmediata, pero no es instantánea, y el motor de impresión no espera.
```


## undefined

```js
    // =============================================================
    // PASO NUEVO: COMPROBAR QUE EL CSS ENTRA, Y AJUSTAR A UNA HOJA
    // =============================================================
    //
    // Y POR QUÉ HAY QUE COMPROBARLO
    //
    // Porque se mandó un "<style>" escrito con "document.write" y no entró. Se
    // midió en un PDF real de esa versión: las firmas salieron de 96 mm, que es
    // su TAMAÑO NATURAL, y eso solo pasa si la regla "max-width" no está puesta.
    // Y las hojas salieron de 216 x 279 mm, que es CARTULINA, no A4, y eso solo
    // pasa si la regla "@page" tampoco está puesta.
    //
    // O sea: las dos pruebas dicen que el papel se imprimió SIN NINGÚN ESTILO.
    // Con 16 px en vez de 11 pt, el papel crece, y un papel que crece se parte en
    // ocho hojas.
    //
    // Y POR QUÉ SE COMPRUEBA EN VEZ DE ASUMIR
    //
    // Porque "getComputedStyle" sí lee los estilos del documento nuevo —no es el
    // "@media print" el que no se lee, que es otra cosa—, así que se puede
    // preguntar al navegador si la fuente del papel es la que se puso. Si no lo
    // es, se vuelve a poner, y si tampoco, se avisa en la misma ventana.
```


## undefined

```js
      // =============================================================
      // Y LA COMPROBACIÓN TIENE QUE SER DE DOS COSAS, NO DE UNA
      // =============================================================
      //
      // Porque mirando solo el tamaño de la letra, un papel SIN estilos pasa por
      // bueno: el navegador pone 16 px por su cuenta, y 16 está a 1,3 de los 14,67
      // que produce "11pt". Con un margen de 1,5 el papel sin estilo se daba por
      // bueno, que es el peor resultado posible: el papel sale a ocho hojas y el
      // código cree que todo anda bien.
      //
      // Así que son dos cosas, y las dos tienen que ser ciertas:
      //
      //   1. Que el documento TIENGA hojas de estilo. Si "document.write" no
      //      aceptó el "<style>", no hay ninguna, y eso no se puede confundir con
      //      nada.
      //   2. Que la letra del cuerpo sea la del documento. Y con margen chico:
      //      menos de 0,8 píxeles de diferencia, porque 16 px está a 1,33 y tiene
      //      que quedar afuera.
```


## undefined

```js
    // =============================================================
    // Y AJUSTAR EL PAPEL A UNA SOLA HOJA
    // =============================================================
    //
    // Y POR QUÉ SE MIDE EL PAPEL Y NO SE CONFÍA
    //
    // Porque el alto final en la hoja impresa no se puede leer desde la pantalla:
    // "getComputedStyle" no lee las reglas de "@media print", y la paginación la
    // hace el motor de impresión. Lo único que se puede medir es el alto del
    // papel en milímetros, y eso es justo lo que decide si entra en una hoja.
    //
    // Y SE MIDE EN MILÍMETROS DE VERDAD, CON UNA REGLA
    //
    // No se divide por "96/25,4", que es el valor teórico. Se mide una regla de
    // 100 mm con el mismo navegador y se usa el factor que dio. Si el zoom del
    // sistema está en 110%, el factor real es otro, y el cálculo con el número
    // teórico saldría mal.
```
