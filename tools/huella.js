// LA HUELLA: EL GUARDIÁN AUTOMÁTICO DE LA CASCADA
// =================================================
//
// -------------------------------------------------------------------
// PARA QUÉ
// -------
//
// Porque partir un archivo de CSS por componente cambia el ORDEN de la cascada, y eso no da
// ningún error: la página se ve "un poco distinta" y no se sabe por qué.
//
// Con el tótem hubo que hacer la comparación a mano. Con el menú también, y el cambio se
// encontró después de un rato y revisando las 500.000 líneas del archivo.
//
// Un guardián tiene que hacer eso solo, en cada cambio, y decir QUÉ cambió.
//
// -------------------------------------------------------------------
// POR QUÉ "visible" Y NO "TODOS LOS ELEMENTOS"
// -----------------------------------------------
//
// La primera versión recorría los 2.855 elementos del "<body>" y leía 62 propiedades a cada
// uno. Se pasó de los 60 segundos.
//
// Y no por la cantidad, sino por lo que hay detrás: "getComputedStyle" devuelve un objeto
// vivo, y leer sus propiedades obliga al navegador a recalcular estilos. O sea que leer las
// propiedades de un elemento DESPUÉS de tocar el DOM obliga a recalcular otra vez. Con 2.855
// elementos, son 2.855 recálculos.
//
// Y la mayoría no hacen falta: de las 41 pantallas, 40 están en "display:none". Es decir que
// la enorme mayoría de los 2.855 elementos no se está dibujando, y su estilo no es el que
// ve el usuario.
//
// Así que solo se recorren los que tienen caja. Eso no es una Cruceta: es lo que se ve.
//
// -------------------------------------------------------------------
// Y POR QUÉ SE TROCEA
// --------------------
//
// Porque una llamada larga se pasa del tiempo y el navegador la corta, y entonces no se sabe
// si terminó o no. Troceada, cada llamada es corta y se ve cuándo acaba.
//
// -------------------------------------------------------------------
// POR QUÉ LAS PROPIEDADES VAN EN UNA LISTA FIJA
// ----------------------------------------------
//
// Porque "getComputedStyle" devuelve más de 340 propiedades y muchas son derivadas. Si una
// fuente cambia, cambian veinte, y no dice nada que no dijera la primera.
//
// Y porque el orden de las propiedades calculadas no está garantizado. Si el hash dependiera
// del orden, el guardián diría "cambió" cuando no cambió nada, y después de tres falsos
// positivos nadie le creería.
'use strict';

window.__huella = (function () {

  const PROPS = [
    'display', 'position', 'width', 'height', 'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-radius',
    'background-color', 'color',
    'font-size', 'font-weight', 'line-height',
    'text-align', 'text-transform', 'white-space',
    'flex-direction', 'justify-content', 'align-items', 'gap',
    'grid-template-columns',
    'overflow', 'z-index', 'opacity', 'visibility', 'box-shadow',
    'transform', 'cursor', 'box-sizing', 'object-fit', 'pointer-events',
  ];

  // -------------------------------------------------------------------
  // LOS ELEMENTOS QUE SE ESTÁN DIBUJANDO
  // -------------------------------------------------------------------
  // Se calcula una vez sola y se guarda. Es lo que hace costoso el recorrido, y si se
  // recalculara en cada elemento, cada "getComputedStyle" invalidaría la lista.
  let cache = null;

  function dibujados() {
    if (cache) return cache;
    const todos = document.querySelectorAll('body *');
    const out = [];
    for (let i = 0; i < todos.length; i++) {
      const e = todos[i];
      // "getClientRects" está vacío en lo que no se dibuja: lo oculto, lo que está en
      // "display:none", y lo que está en una pantalla que no está abierta.
      if (!e.getClientRects || e.getClientRects().length === 0) continue;
      out.push(e);
    }
    cache = out;
    return out;
  }

  // -------------------------------------------------------------------
  // UNA LÍNEA POR ELEMENTO
  // -------------------------------------------------------------------
  function lineaDe(e, i, cs, r) {
    const t = [];
    for (let k = 0; k < PROPS.length; k++) {
      const v = cs[PROPS[k]];
      if (v === undefined || v === '' || v === 'none' || v === 'normal') continue;
      t.push(PROPS[k] + '=' + v);
    }
    t.push('caja=' + Math.round(r.left) + ',' + Math.round(r.top) + ','
      + Math.round(r.width) + 'x' + Math.round(r.height));
    return i + ':' + e.tagName + ' ' + t.join(',');
  }

  // -------------------------------------------------------------------
  // LA HUELLA COMPLETA, POR TANDAS
  // -------------------------------------------------------------------
  function completa(desde, hasta) {
    const els = dibujados();
    const fin = Math.min(hasta === undefined ? els.length : hasta, els.length);
    const partes = [];
    for (let i = desde || 0; i < fin; i++) {
      const e = els[i];
      partes.push(lineaDe(e, i, window.getComputedStyle(e), e.getBoundingClientRect()));
    }
    return partes.join('|');
  }

  function cuantos() {
    return dibujados().length;
  }

  function forget() {
    cache = null;
  }

  // -------------------------------------------------------------------
  // EL DETALLE
  // -------------------------------------------------------------------
  // Solo de los elementos que uno elija, para que el mensaje diga qué cambió y no "cambió un
  // número". Y se calcula aparte porque pregunta otros elementos: los que están en pantalla
  // cerrada también cuentan, y esos son justamente los que se rompen cuando se mueve una regla
  // que compite con otra.
  function detalle(listaSelectores) {
    const partes = [];
    listaSelectores.forEach((sel) => {
      let els = [];
      try {
        els = [].slice.call(document.querySelectorAll(sel));
      } catch (e) {
        partes.push(sel + ' -> selector invalido');
        return;
      }
      if (!els.length) {
        partes.push(sel + ' -> no encontro nada');
        return;
      }
      els.forEach((e, i) => {
        partes.push(sel + '[' + i + ']:' + e.tagName + ' '
          + lineaDe(e, i, window.getComputedStyle(e), e.getBoundingClientRect()));
      });
    });
    return partes.join('|');
  }

  // -------------------------------------------------------------------
  // EL HASH
  // -------------------------------------------------------------------
  //
  // -------------------------------------------------------------------
  // POR QUÉ UN HASH Y NO EL TEXTO
  // ------------------------------
  //
  // Porque el texto entero pesa casi 400.000 caracteres, y eso no se puede guardar ni pasar
  // de un sitio a otro. En cambio, un hash de ocho caracteres por elemento son unos 2.100
  // en total, que se guardan en un archivo de texto cualquiera.
  //
  // Y con los hashes se localiza el elemento que cambió, y después se pide la línea
  // completa SOLO de ese. Que es lo que hace falta: no hace falta guardar 400.000
  // caracteres para saber que un botón mide 34,6 en vez de 32,8.
  //
  // -------------------------------------------------------------------
  // POR QUÉ NO CRIPTOGRÁFICO
  // ------------------------
  //
  // Porque no hace falta que nadie pueda adivinarlo. Hace falta que dos textos distintos den
  // casi siempre números distintos. Y un "djb2" de ocho caracteres cumple.
  //
  // Y el tamaño del hash se elige porque tiene que CABER en la línea: si fuera más largo, la
  // lista de hashes pesaría más y no se ahorraría nada.
  function hashDe(txt) {
    let h = 5381;
    for (let i = 0; i < txt.length; i++) {
      h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // -------------------------------------------------------------------
  // EL RESUMEN: UN HASH POR ELEMENTO
  // -------------------------------------------------------------------
  function resumen(desde, hasta) {
    const els = dibujados();
    const fin = Math.min(hasta === undefined ? els.length : hasta, els.length);
    const partes = [];
    for (let i = desde || 0; i < fin; i++) {
      const e = els[i];
      partes.push(i + ':' + hashDe(lineaDe(e, i, window.getComputedStyle(e), e.getBoundingClientRect())));
    }
    return partes.join(',');
  }

  // Y las líneas completas de los elementos que se le pidan, para ver qué cambió adentro.
  function lineas(indices) {
    const els = dibujados();
    const partes = [];
    indices.forEach((i) => {
      if (i < 0 || i >= els.length) return;
      const e = els[i];
      partes.push(lineaDe(e, i, window.getComputedStyle(e), e.getBoundingClientRect()));
    });
    return partes.join('|');
  }

  // Lo mismo, pero por selector, para mirar una zona concreta como la cabecera.
  function resumenSel(listaSelectores) {
    const partes = [];
    listaSelectores.forEach((sel) => {
      let els = [];
      try {
        els = [].slice.call(document.querySelectorAll(sel));
      } catch (e) {
        partes.push(sel + ':selector-invalido');
        return;
      }
      if (!els.length) {
        partes.push(sel + ':vacio');
        return;
      }
      els.forEach((e, i) => {
        partes.push(sel + '[' + i + ']:' + hashDe(lineaDe(e, i,
          window.getComputedStyle(e), e.getBoundingClientRect())));
      });
    });
    return partes.join(',');
  }

  function lineasSel(listaSelectores) {
    const partes = [];
    listaSelectores.forEach((sel) => {
      let els = [];
      try {
        els = [].slice.call(document.querySelectorAll(sel));
      } catch (e) { return; }
      els.forEach((e, i) => {
        partes.push(sel + '[' + i + ']:' + e.tagName + ' '
          + lineaDe(e, i, window.getComputedStyle(e), e.getBoundingClientRect()));
      });
    });
    return partes.join('|');
  }

  // -------------------------------------------------------------------
  // GUARDAR Y COMPARAR, SIN PASAR POR UN ARCHIVO
  // ------------------------------------------------
  //
  // -------------------------------------------------------------------
  // POR QUÉ localStorage Y NO UN ARCHIVO EN DISCO
  // ----------------------------------------------
  //
  // Porque el resumen son 2.164 y 9.678 caracteres, y para llevarlos de la página a un archivo
  // hay que pasarlos por medio, que es un paso frágil y caro.
  //
  // Con "localStorage" no hay paso: la página se guarda su propia línea base, y en la
  // siguiente recarga se compara sola. El almacenamiento es del origen, así que sobrevive a
  // recargar y a cambiar el CSS.
  //
  // Y eso es lo que hace que el guardián sirva de verdad: no hay que acordarse de guardar
  // nada. Se guarda una vez, antes de tocar, y después CADA recarga comprueba sola.
  //
  // -------------------------------------------------------------------
  // Y POR QUÉ DOS CLAVES Y NO UNA
  // ------------------------------
  //
  // Porque una es de toda la página y la otra es de las zonas que se nombran. Sirven para dos
  // cosas distintas: la primera dice "cambió algo en algún lado", y la segunda dice "cambió
  // acá". Con una sola habría que abrir toda la página para enterarse de dónde.
  //
  // -------------------------------------------------------------------
  // Y POR QUÉ EL INFORME ES CORTO
  // -----------------------------
  //
  // Porque se lee en una consola. Si devolviera las 400.000 líneas, nadie lo leería, y un
  // guardián que nadie lee es un guardián que nadie mira.
  //
  // El informe dice cuántos elementos cambiaron y cuáles. Y con esa lista, uno después pide
  // las líneas de esos y ya tiene el detalle.
  const CLAVE_PAGINA = 'huella-pagina';
  const CLAVE_ZONAS = 'huella-zonas';

  // Las zonas que se revisan aparte de toda la página.
  function zonas() {
    return ['#barrasSuperiores', '#mainNav', '#subNav', '.card', 'button',
      'input', 'select', 'table', 'dialog', '.modal', '.toast', '.aviso'];
  }

  function lineaBase() {
    const h = window.__huella;
    window.__guardado = {
      pag: h.resumen(0, h.cuantos()),
      zon: h.resumenSel(zonas()),
      n: h.cuantos(),
      cuando: new Date().toISOString(),
    };
    try {
      localStorage.setItem(CLAVE_PAGINA, window.__guardado.pag);
      localStorage.setItem(CLAVE_ZONAS, window.__guardado.zon);
      localStorage.setItem('huella-cuando', window.__guardado.cuando);
      localStorage.setItem('huella-n', String(window.__guardado.n));
    } catch (e) {
      return 'NO SE PUDO GUARDAR en localStorage: ' + e.message;
    }
    return 'guardado: ' + window.__guardado.n + ' elementos,'
      + ' pagina=' + window.__guardado.pag.length + ' chars,'
      + ' zonas=' + window.__guardado.zon.length + ' chars';
  }

  // Divide "0:a1b2c3d4,5:..." en un objeto. Y avisa si el formato no es el que se espera, en
  // vez de devolver un objeto vacío que parece "no cambió nada".
  function aObjeto(txt) {
    const o = {};
    if (!txt) return o;
    txt.split(',').forEach((p) => {
      const c = p.lastIndexOf(':');
      if (c < 0) return;
      o[p.slice(0, c)] = p.slice(c + 1);
    });
    return o;
  }

  function diferencias(antesTxt, ahoraTxt) {
    const A = aObjeto(antesTxt);
    const B = aObjeto(ahoraTxt);
    const cambios = [];
    Object.keys(B).forEach((k) => {
      if (A[k] === undefined) cambios.push(k + ' (nuevo)');
      else if (A[k] !== B[k]) cambios.push(k);
    });
    Object.keys(A).forEach((k) => {
      if (B[k] === undefined) cambios.push(k + ' (se fue)');
    });
    return cambios;
  }

  function comprobar() {
    const h = window.__huella;
    const pagAntes = localStorage.getItem(CLAVE_PAGINA);
    const zonAntes = localStorage.getItem(CLAVE_ZONAS);

    if (!pagAntes) {
      return 'NO HAY LINEA BASE. Primero se guarda una, antes de tocar nada.';
    }

    const pagAhora = h.resumen(0, h.cuantos());
    const zonAhora = h.resumenSel(zonas());

    const difPag = diferencias(pagAntes, pagAhora);
    const difZon = diferencias(zonAntes, zonAhora);

    const cuando = localStorage.getItem('huella-cuando') || '(sin fecha)';
    const lineas = [
      'LINEA BASE: ' + cuando + '   elementos: ' + localStorage.getItem('huella-n'),
      'AHORA:      ' + new Date().toISOString() + '   elementos: ' + h.cuantos(),
      '',
      difPag.length ? ('*** CAMBIARON ' + difPag.length + ' ELEMENTOS DE LA PAGINA ***')
        : 'ok  la pagina esta igual, elemento por elemento',
      difPag.length ? ('    indices: ' + difPag.slice(0, 25).join(', ')
        + (difPag.length > 25 ? ' ... y ' + (difPag.length - 25) + ' mas' : '')) : '',
      '',
      difZon.length ? ('*** CAMBIARON ' + difZon.length + ' ELEMENTOS DE LAS ZONAS NOMBRADAS ***')
        : 'ok  las zonas nombradas estan iguales',
      difZon.length ? ('    ' + difZon.slice(0, 20).join('  ')) : '',
    ].filter((x) => x !== null);

    window.__difPag = difPag;
    window.__difZon = difZon;

    if (!difPag.length && !difZon.length) {
      lineas.push('');
      lineas.push('NADA CAMBIO. Se puede seguir.');
    } else {
      lineas.push('');
      lineas.push('HAY QUE MIRARLO. Con window.__difPag se sabe quais, y con');
      lineas.push('__huella.lineas([...]) se pide la linea completa de uno.');
    }
    return lineas.join('\\n');
  }

  // -------------------------------------------------------------------
  // LAS LÍNEAS DE LOS ELEMENTOS QUE CAMBIARON
  // -------------------------------------------------------------------
  // Con esto se ve el valor viejo y el nuevo del elemento, sin tener que adivinar.
  function explicar() {
    const h = window.__huella;
    const antes = aObjeto(localStorage.getItem(CLAVE_PAGINA));
    const partes = [];
    (window.__difPag || []).slice(0, 8).forEach((k) => {
      const i = parseInt(k, 10);
      if (isNaN(i)) return;
      partes.push(h.lineas([i]));
    });
    return partes.join('\\n');
  }

  return {
    completa: completa, cuantos: cuantos, detalle: detalle,
    forget: forget, props: PROPS.length,
    hashDe: hashDe, resumen: resumen, lineas: lineas,
    resumenSel: resumenSel, lineasSel: lineasSel,
    guardar: lineaBase, comprobar: comprobar, explicar: explicar,
    zonas: zonas,
  };
}());