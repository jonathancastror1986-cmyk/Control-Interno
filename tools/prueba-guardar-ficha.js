// ===================================================================
// tools/prueba-guardar-ficha.js
// EL BOTÓN "GUARDAR E IMPRIMIR FICHA PARA ARCHIVADOR", PROBADO SIN IMPRIMIR
// ===================================================================
//
// ---------------------------------------------------------------------
// POR QUÉ ESTA PRUEBA EXISTE
// ---------------------------------------------------------------------
//
// Porque el botón tiene dos riesgos que no se ven mirando el código:
//
//   1. La ventana de impresión. "imprimirPapelEnVentana()" la abre con "window.open()",
//      y una ventana pedida DESPUÉS de un "await" la bloquean Chrome y Edge. Un
//      botón que guarda y después imprime se queda sin ventana siempre, y el
//      síntoma es un "alert" que dice que el navegador no dejó abrirla.
//
//   2. Que se imprima una ficha de alguien que no se guardó. Si el guardado falla
//      y el botón imprime igual, sale un papel falso para el archivador.
//
// Y los dos se pueden comprobar sin navegador: con una ventana de mentira que
// anota qué se le escribió, y un "saveWorker()" de mentira que devuelve a
// voluntad.
//
// ---------------------------------------------------------------------
// Y POR QUÉ SE USA EL CÓDIGO REAL Y NO UNA COPIA
// ---------------------------------------------------------------------
//
// Porque reescribir la función en la prueba sería probar otra cosa. Si alguien
// mete un "await" arriba del "window.open", esta prueba tiene que fallar también.
// La función se saca del archivo con un corte por llaves, sin tocarla.

'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

let fallos = 0;
function ok(condicion, texto) {
  if (condicion) console.log('    ok   ' + texto);
  else { console.log('    ***  ' + texto); fallos++; }
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------
// LA VENTANA DE MENTIRA
// ---------------------------------------------------------------------
//
// Y POR QUÉ ES UNA FUNCIÓN Y NO UN OBJETO SOLO
//
// Porque cada prueba necesita su propia: si comparten el "escrito", la segunda
// encuentra lo que escribió la primera y da verde con la ventana en blanco.
function ventanaFalsa(etiqueta) {
  const doc = {
    etiqueta,
    escrito: [],
    images: [],
    styleSheets: [{}],
    title: '',
    body: { appendChild() { }, style: {} },
    head: { appendChild() { } },
    open() { },
    write(html) { doc.escrito.push(html); },
    close() { },
    querySelector() { return { scrollHeight: 1000, offsetWidth: 700, parentNode: null }; },
    createElement() {
      return { style: {}, offsetHeight: 0, parentNode: null, setAttribute() { }, appendChild() { } };
    }
  };
  return {
    etiqueta,
    document: doc,
    impreso: false,
    focus() { },
    print() { this.impreso = true; },
    getComputedStyle() { return { fontSize: '14.667px' }; },
    cerrada: false,
    close() { this.cerrada = true; }
  };
}

console.log('');
console.log('  === guardar e imprimir la ficha para el archivador ===');

// ===================================================================
// PARTE 1: EL MOTOR DE IMPRESIÓN ACEPTA UNA VENTANA YA ABIERTA
// ===================================================================
//
// Porque es el arreglo que hace posible todo lo demás: si "imprimirPapelEnVentana()"
// no aceptara una ventana, el botón tendría que abrirla después del guardado, que es
// justo lo que el navegador bloquea.
const PAPEL = fs.readFileSync(path.join(RAIZ, 'js', 'impresion-papel.js'), 'utf8');
let abiertas = 0;
const ventanaGlobal = ventanaFalsa('propia');
function correrPapel(html, opciones) {
  const alertas = [];
  const f = new Function('window', 'alert', 'setTimeout', 'console', PAPEL + '\nreturn imprimirPapelEnVentana;');
  const imprimir = f(
    {
      open() { abiertas++; return ventanaGlobal; }
    },
    function (m) { alertas.push(m); },
    setTimeout,
    { info() { }, warn() { } }
  );
  return imprimir(html, opciones);
}

const ventanaDelLlamador = ventanaFalsa('del llamador');
abiertas = 0;
const r1 = correrPapel('<p id="marca">PAPEL UNO</p>', { ventana: ventanaDelLlamador, plantilla: 'X' });
ok(abiertas === 0,
  'con "opciones.ventana" no se llama a "window.open": no hay ventana emergente que bloquear');
ok(ventanaDelLlamador.document.escrito.join('').indexOf('PAPEL UNO') >= 0,
  'el papel se escribe en la ventana que le pasaron, no en otra');
r1.then(function () {
  ok(ventanaDelLlamador.impreso, 'y esa ventana es la que imprime');

  // Y QUE LOS DEMÁS LLAMADORES NO CAMBIEN NADA
  //
  // Porque Bodega, los kit y el botón de la ficha llaman a "imprimirPapelEnVentana()"
  // sin "ventana". Si este caso se rompiera, se romperían esos tres botones, que son
  // los que más se usan.
  const r2 = correrPapel('<p>PAPEL DOS</p>', { plantilla: 'X' });
  ok(abiertas === 1,
    'sin "opciones.ventana" se sigue abriendo la ventana propia, como antes');
  ok(ventanaGlobal.document.escrito.join('').indexOf('PAPEL DOS') >= 0,
    'y el papel va a esa ventana propia');
  return r2;
}).then(function () {
  // =================================================================
  // PARTE 2: EL MANEJADOR DEL CLIC
  // =================================================================
  //
  // Y POR QUÉ SE CORRE CON MENTIRAS Y NO CON LA BASE
  //
  // Porque lo que hay que comprobar aquí es la ORDEN: abrir la ventana, guardar,
  // y solo imprimir si el guardado salió bien. Con la base de verdad la prueba
  // dependería de que haya internet, de permisos y de un RUT libre.
  const APP = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');

  // Y EL CORTE POR LLAVES, QUE ES LO QUE HACE QUE LA PRUEBA VALGA
  //
  // Porque si el archivo cambia, la prueba cambia con él. No hay una copia del
  // código aquí abajo que pueda quedar vieja y dar verde igual.
  function sacarFuncion(fuente, nombre) {
    const arranque = fuente.indexOf(nombre);
    if (arranque < 0) return null;
    const fin = fuente.indexOf('\n}', arranque);
    if (fin < 0) return null;
    return fuente.slice(arranque, fin + 2);
  }
  const cuerpo = [
    sacarFuncion(APP, 'async function guardarEImprimirFicha(){'),
    sacarFuncion(APP, 'function escribirMensajeEnVentanaDePapel('),
    sacarFuncion(APP, 'function cerrarVentanaDePapel('),
    'return guardarEImprimirFicha;'
  ].join('\n');
  ok(cuerpo.indexOf('null') < 0,
    'las tres funciones del botón existen en js/app.js');

  // -----------------------------------------------------------------
  // LA MEDICIÓN DEL RIESGO (a): ¿"window.open" ESTÁ ANTES DEL PRIMER "await"?
  // -----------------------------------------------------------------
  //
  // Porque esto es lo que decide si la ventana se abre o si el navegador la
  // bloquea, y no se ve leyendo el código a ojo. Es la comprobación que de verdad
  // protege el botón: si alguien mete una espera arriba de esa línea, esto se
  // pone rojo y el guardián falla antes del push.
  const fuente = sacarFuncion(APP, 'async function guardarEImprimirFicha(){');
  // Y SIN LOS COMENTARIOS, QUE TAMBIÉN HABLAN DE ESPERAS Y DE VENTANAS
  //
  // Porque la explicación que va arriba de esta función dice "await" y "window.open"
  // en texto plano: midiendo sobre el archivo entero, la primera espera sería la
  // tercera línea del comentario, y la prueba daría verde con el código hecho
  // cualquier cosa.
  const codigo = fuente
    .split('\n').map(function (l) { return l.replace(/\/\/[^\n]*/g, ''); }).join('\n');
  const iOpen = codigo.indexOf('window.open');
  const iAwait = codigo.indexOf('await');
  ok(iOpen >= 0 && (iAwait < 0 || iOpen < iAwait),
    '"window.open" está antes de cualquier "await" del manejador'
    + ' (línea ' + (codigo.slice(0, iOpen).split('\n').length)
    + ' del manejador, primer "await" en la línea '
    + (codigo.slice(0, iAwait).split('\n').length) + ')');

  // Y QUE SEA LA PRIMERA INSTRUCCIÓN, NO SOLO QUE ESTÉ ADELANTE
  //
  // Porque si hay un "alert" o una consulta antes, la ventana ya no sale de un
  // clic y el navegador puede decidir que es una emergente.
  const despuesDeAbrir = codigo.slice(iOpen + 'window.open'.length);
  ok(/^\([^)]*\);?/.test(despuesDeAbrir.trim()),
    'la ventana se abre como primera instrucción, sin nada antes');

  function correrBoton(resultadoGuardado, opciones) {
    const o = opciones || {};
    const win = o.bloquearVentana ? null : ventanaFalsa('del botón');
    const alertas = [];
    const pasos = [];
    let impreso = null;
    let tareas = [];
    const ventanaFalsaGlobal = {
      open() { pasos.push('window.open'); return win; },
      supabaseFallo: o.supabaseFallo || null
    };
    const f = new Function(
      'window', 'saveWorker', 'alert', 'escHtml', 'cargarTareas', 'imprimirFichaTrabajador',
      cuerpo
    );
    const boton = f(
      ventanaFalsaGlobal,
      async function () {
        pasos.push('saveWorker');
        if (o.supabaseFallo) return { ok: true, worker: { code: '0001' } };
        return resultadoGuardado;
      },
      function (m) { alertas.push(m); },
      escHtml,
      async function (code) { pasos.push('cargarTareas'); tareas.push(code); },
      function (w, opciones2) { pasos.push('imprimir'); impreso = { w, opciones: opciones2 }; }
    );
    return boton().then(function () {
      return { win, alertas, pasos, impreso, tareas };
    });
  }

  return correrBoton({ ok: false })
    .then(function (falla) {
      // =================================================================
      // EL CASO QUE IMPORTA: EL GUARDADO FALLÓ
      // =================================================================
      ok(falla.pasos.indexOf('imprimir') < 0,
        'si el guardado falla, NO se imprime ninguna ficha');
      ok(falla.pasos[0] === 'window.open' && falla.pasos[1] === 'saveWorker',
        'la ventana se abre antes de guardar, y en ese orden');
      const escrito = (falla.win && falla.win.document.escrito.join('')) || '';
      ok(/No se guard/.test(escrito),
        'la ventana abierta dice que no se guardó, en vez de quedar en blanco');
      ok(!falla.win.cerrada,
        'y no se cierra sola: el aviso queda a la vista para leerlo');

      // =================================================================
      // Y EL CASO CONTRARIO: EL GUARDADO SALIÓ BIEN
      // =================================================================
      return correrBoton({ ok: true, worker: { code: '0001', name: 'Persona Nueva Pérez, Juan' } });
    })
    .then(function (exito) {
      ok(exito.impreso !== null, 'si el guardado salió bien, se imprime la ficha');
      ok(exito.impreso && exito.impreso.w && exito.impreso.w.code === '0001',
        'la ficha que se imprime es la del trabajador recién guardado');
      ok(exito.impreso && exito.impreso.opciones && exito.impreso.opciones.ventana === exito.win,
        'y se imprime en la ventana que se abrió al principio del clic');
      ok(exito.tareas.join() === '0001',
        'las tareas del checklist se cargan antes de imprimir');
      const orden = exito.pasos.join(' > ');
      ok(orden === 'window.open > saveWorker > cargarTareas > imprimir',
        'el orden completo es: ' + orden);

      // =================================================================
      // Y EL NAVEGADOR QUE BLOQUEA LA VENTANA
      // =================================================================
      //
      // Porque se puede, y lo que importa es que el trabajo no se pierda: el
      // trabajador queda guardado y el aviso lo dice.
      return correrBoton({ ok: true, worker: { code: '0001' } }, { bloquearVentana: true });
    })
    .then(function (bloqueado) {
      ok(bloqueado.impreso === null,
        'con la ventana bloqueada no se imprime, en vez de imprimir un papel a medias');
      ok(bloqueado.pasos.indexOf('saveWorker') >= 0,
        'pero el trabajador IGUAL se guarda: no se pierde lo que la persona escribió');
      ok(bloqueado.alertas.join(' ').indexOf('quedó guardado') >= 0
        && bloqueado.alertas.join(' ').indexOf('no se imprimió') >= 0,
        'y el aviso dice las dos cosas: que quedó guardado y que el papel no');

      // =================================================================
      // Y CUANDO NO HAY BASE
      // =================================================================
      return correrBoton({ ok: true, worker: { code: '0001' } }, { supabaseFallo: true });
    })
    .then(function (sinBase) {
      ok(sinBase.pasos.indexOf('saveWorker') < 0,
        'sin base (librería sin cargar) no se intenta guardar ni imprimir');
      ok(sinBase.alertas.join(' ').indexOf('Recarga') >= 0,
        'y el aviso dice qué hacer: recargar la página');
    });
}).catch(function (e) {
  console.log('  *** la prueba se cayó: ' + (e && e.stack ? e.stack : e));
  fallos++;
}).then(function () {
  console.log('');
  if (fallos) {
    console.log('  *** ' + fallos + ' CASO(S) FALLAN ===');
    process.exit(1);
  }
  console.log('  ok  guardar e imprimir la ficha: sin ventana bloqueada y sin papel falso');
  console.log('');
});