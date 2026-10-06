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
const A4_ANCHO = '210mm';
const A4_ALTO = '297mm';
const MARGEN = '15mm';

// Y EL TEXTO DE LA VENTANA
//
// El nombre de la pestaña. No es lo que se descarga —eso lo pone el diálogo del
// sistema—, pero sirve para reconocibla en la barra de tareas si se abre más de
// una.
function nombreDeLaVentana(plantilla, trabajador) {
  const p = String(plantilla || 'documento').replace(/[\\/:*?"<>|]+/g, '').trim();
  const t = String(trabajador || '').replace(/[\\/:*?"<>|]+/g, '').trim();
  return (t ? p + ' - ' + t : p).slice(0, 90);
}

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
function estilosDeLaVentana() {
  return [
    '*{box-sizing:border-box;}',
    'html,body{margin:0;padding:0;background:#fff;color:#000;}',
    // Y 11pt, QUE ES UN CUERPO DE DOCUMENTO
    //
    // En pantalla el papel se ve con el tamaño de la pantalla, que es más
    // grande: se lee en un monitor, no en una hoja.
    'body{font-family:Georgia,"Times New Roman",serif;font-size:11pt;line-height:1.45;}',
    // Y EL ANCHO ÚTIL DE UNA A4
    //
    // "margin: 0 auto" lo centra en la hoja, y el ancho es lo que sobra
    // después de los márgenes.
    '.hoja-papel{width:' + '180mm' + ';margin:0 auto;}',
    // Y LAS TABLAS, QUE CON "display:block" PERDERÍAN SUS COLUMNAS
    //
    // Este es el defecto clásico: si se pone "display:block" en todo lo que
    // cuelga del papel, una tabla deja de ser tabla y las columnas se apilan
    // una debajo de la otra.
    'table{display:table;width:100%;border-collapse:collapse;}',
    'td,th{display:table-cell;border:0.5pt solid #999;padding:4pt;}',
    'th{background:#eee;font-weight:700;}',
    // Y LOS ESPACIOS INTERNOS
    //
    // El papel se arma con los márgenes de pantalla, y a medida que se
    // imprime hay que sacarlos: si no, media hoja se va en espacios.
    'p{margin:0 0 6pt;}',
    'h1,h2,h3{margin:0 0 8pt;}',
    // Y LA FIRMA, QUE ES LO MÁS IMPORTANTE DEL PAPEL
    //
    // "max-width" porque una firma dibujada con el dedo es una imagen
    // enormous: sin esto, en una hoja de 180mm de ancho se sale.
    '.firma-caja{border:0.5pt solid #666;min-height:14mm;padding:2mm;}',
    '.firma-caja img{max-width:100%;height:auto;}',
    '.firma-linea{border-top:0.5pt solid #000;margin-top:1mm;}',
    '.firma-bloque{display:inline-block;width:45%;margin:0 2%;vertical-align:top;}',
    '.firmas{text-align:center;margin-top:8mm;}',
    // Y EL TIMBRE, QUE GIRA
    '.timbre{position:absolute;}',
    // Y LA ÚNICA REGLA DE IMPRESIÓN QUE HACE FALTA
    //
    // Los márgenes de la hoja física. Todo lo demás ya está bien en el
    // documento nuevo.
    '@media print{@page{size:' + A4_ANCHO + ' ' + A4_ALTO + ';margin:' + MARGEN + ';}}',
  ].join('\n');
}

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
function imprimirPapelEnVentana(html, opciones) {
  const o = opciones || {};
  const win = window.open('', '_blank');
  if (!win) {
    // Y SI EL NAVEGADOR LO BLOQUEÓ, SE DICE POR QUÉ
    alert(
      'El navegador no dejó abrir la ventana de impresión.\n\n' +
      'Eso pasa cuando la ventana se pide después de un tiempo de espera, y no\n' +
      'desde el clic. Probá de nuevo: si sigue igual, el navegador tiene las\n' +
      'ventanas emergentes bloqueadas para esta página.\n\n' +
      'Mientras tanto, el papel se puede bajar en Word con el botón que está al lado.'
    );
    return false;
  }
  try { win.document.write(''); } catch (e) { /* algunos navegadores lo bloquean */ }
  win.document.open();
  win.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
    + '<title>' + escHtmlParaVentana(nombreDeLaVentana(o.plantilla, o.trabajador)) + '</title>'
    + '<style>' + estilosDeLaVentana() + '</style>'
    + '</head><body>'
    + html
    + '</body></html>');
  win.document.close();

  // Y SE ESPERA A QUE LAS IMÁGENES ESTÉN LISTAS
  const esperarImagenes = win.document.images
    ? Promise.all(Array.prototype.map.call(win.document.images, function (img) {
        if (img.complete) return Promise.resolve();
        return new Promise(function (r) {
          img.onload = r;
          img.onerror = r;
          setTimeout(r, 1200);   // el plan B: si nunca cargan, se imprime igual
        });
      }))
    : Promise.resolve();

  return esperarImagenes.then(function () {
    // Y UN CORTE MÁS, PARA QUE EL motor tenga tiempo de maquetar
    return new Promise(function (r) { setTimeout(r, 120); });
  }).then(function () {
    win.focus();
    win.print();
    // Y SE CIERRA, CON UN CORTE
    //
    // El corte es porque "print()" es bloqueante en algunos navegadores pero no
    // en todos. Cerrar en el mismo tick cancela el diálogo.
    setTimeout(function () {
      try { win.close(); } catch (e) { /* ya estaba cerrada */ }
    }, 800);
    return true;
  });
}

// Y EL ESCAPE DE TEXTO PARA EL "<title>"
//
// Porque el nombre de la pestaña va dentro de HTML, y un "&" o un "<" en el
// nombre de una plantilla rompería el documento.
function escHtmlParaVentana(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}