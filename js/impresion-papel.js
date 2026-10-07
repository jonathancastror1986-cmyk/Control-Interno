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
    // Y CUALQUIER IMAGEN, ESTÉ DONDE ESTÉ
    //
    // Antes la regla era ".firma-caja img": solo las firmas. Pero el papel trae
    // más imágenes —el timbre de la empresa, el logo— y una que no está dentro de
    // una ".firma-caja" sale a su tamaño natural. Medido en el PDF: las firmas
    // salieron de 96 mm, que es su tamaño natural, cuando deberían medir menos.
    //
    // Con "img" pelado no se puede escapar: cualquier imagen del papel queda
    // dentro del ancho de la hoja.
    'img{max-width:100%;height:auto;}',
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
  const titulo = nombreDeLaVentana(o.plantilla, o.trabajador);
  win.document.open();
  win.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
    + '<title>' + escHtmlParaVentana(titulo) + '</title>'
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
    return new Promise(function (r) { setTimeout(r, 120); });
  }).then(function () {
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
    const d = win.document;
    // =============================================================
    // Y LA SONDA ES EL "BODY", NO UN "<h2>" NI UN "<p>"
    // =============================================================
    //
    // Porque un "<h2>" tiene su propio tamaño de letra —1,5 veces la del padre— y
    // con la sonda en el "<h2>" el navegador decía 22 píxeles con el CSS puesto y
    // 24 sin él, y la comparación contra 14,67 daba "no entró" en los dos casos.
    // Se llegó a poner el aviso "SIN ESTILOS" sobre un papel que sí los tenía.
    //
    // El "body" es lo único a lo que el CSS le fija la letra directamente, así
    // que es lo único que se puede interrogar sin que otro estilo se adelante.
    const cuerpo = d.body;
    const papel = d.querySelector('.hoja-papel') || cuerpo;
    let cssEntra = false;
    try {
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
      const fuente = parseFloat(win.getComputedStyle(cuerpo).fontSize);
      cssEntra = d.styleSheets.length >= 1 && Math.abs(fuente - 14.667) < 0.8;
    } catch (e) { cssEntra = false; }

    if (!cssEntra) {
      // =============================================================
      // Y EL PLAN B: PONER EL CSS OTRA VEZ, CON EL MÉTODO DE LA DOM
      // =============================================================
      //
      // Porque "document.write" y "appendChild" son caminos distintos hacia el
      // mismo "<style>", y si uno falló el otro puede no fallar. Se hace con un
      // elemento de verdad, agregado al "<head>" que ya existe.
      const st = d.createElement('style');
      st.setAttribute('data-del-papel', '1');
      st.appendChild(d.createTextNode(estilosDeLaVentana()));
      (d.head || d.documentElement).appendChild(st);
      try {
        const fuente2 = parseFloat(win.getComputedStyle(cuerpo).fontSize);
        cssEntra = d.styleSheets.length >= 1 && Math.abs(fuente2 - 14.667) < 0.8;
      } catch (e) { }
    }

    // =============================================================
    // Y SI AUN ASÍ NO ENTRA, SE AVISA EN LA VENTANA, NO EN LA CONSOLA
    // =============================================================
    //
    // Porque la consola no la ve nadie. Un papel impreso sin estilo es un papel
    // que se ve mal y que nadie sabe por qué.
    if (!cssEntra) {
      const aviso = d.createElement('p');
      aviso.setAttribute('data-del-papel', 'aviso');
      aviso.style.cssText = 'font:13px sans-serif;color:#900;background:#fee;'
        + 'border:2px solid #900;padding:8px;margin:0 0 10px';
      aviso.textContent = 'ATENCIÓN: este papel se va a imprimir SIN los estilos del'
        + ' documento. Va a salir en letra grande y en varias hojas. Probá de nuevo,'
        + ' o bajalo en Word con el botón que está al lado.';
      (papel.parentNode || d.body).insertBefore(aviso, papel);
    }

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
    const regla = d.createElement('div');
    regla.style.cssText = 'position:absolute;visibility:hidden;height:100mm;width:1px';
    (d.body || d.documentElement).appendChild(regla);
    const pxPorMm = (regla.offsetHeight || 378) / 100;
    if (regla.parentNode) regla.parentNode.removeChild(regla);

    const ALTO_HOJA_MM = 249;   // 279 de cartulina, menos 15 de margen arriba y abajo
    const altoMm = papel.scrollHeight / pxPorMm;
    const anchoMm = papel.offsetWidth / pxPorMm;
    let factor = 1;
    if (altoMm > ALTO_HOJA_MM) {
      factor = ALTO_HOJA_MM / altoMm;
      // =============================================================
      // Y NUNCA POR DEBAJO DE LA MITAD
      // =============================================================
      //
      // Porque si el papel es larguísimo, achicarlo hasta que entre lo vuelve
      // ilegible, y un contrato ilegible es peor que un contrato de dos hojas.
      // El piso es la mitad: abajo de eso el papel sale en dos hojas, que es lo
      // correcto para un documento largo.
      if (factor < 0.5) factor = 0.5;
      // =============================================================
      // Y EL ZOOM VA EN EL CUERPO
      // =============================================================
      //
      // Porque "zoom" vuelve a maquetar el texto, y lo que se quiere achicar es
      // el texto. "transform: scale()" lo achicaría de forma visual y dejaría los
      // renglones cortados a la mitad.
      d.body.style.zoom = String(factor);
    }

    // =============================================================
    // Y EL RESULTADO SE ESCRIBE EN EL TÍTULO DE LA VENTANA
    // =============================================================
    //
    // Porque el título se ve en la barra de tareas sin abrir nada, y es el único
    // lugar donde se puede leer un dato sin modificar el papel. No se imprime:
    // el título de una pestaña no sale en la hoja.
    try {
      d.title = titulo + '  \u2014  ' + Math.round(anchoMm) + ' x '
        + Math.round(altoMm * factor) + ' mm'
        + (factor < 1 ? ' (achicado a ' + Math.round(factor * 100) + '%)' : '')
        + (cssEntra ? '' : '  \u2014  SIN ESTILOS');
    } catch (e) { }
    if (typeof console !== 'undefined' && console.info) {
      console.info('[papel] ' + Math.round(anchoMm) + ' x ' + Math.round(altoMm)
        + ' mm, css ' + (cssEntra ? 'ok' : 'NO aplico'), factor);
    }

    // Y UN CORTE MÁS, PARA QUE EL motor tenga tiempo de maquetar
    return new Promise(function (r) { setTimeout(r, 150); });
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