// ===================================================================
// SUBE-LA-VERSION
// ===================================================================
// SUBE EL "?v=N" DE CUALQUIER HTML, INCLUIDO EL EDITOR DE PRUEBAS
//
// ---------------------------------------------------------------------
// POR QUÉ ESTE GUION, SI YA ESTÁ "sube-versiones.js"
// ---------------------------------------------------------------------
//
// Porque "sube-versiones.js" reconoce una sola forma de enlace:
//
//     src="../js/app.js?v=116"
//
// Y el editor de pruebas, "tools/pruebas/app-sin-login.html", usa DOS niveles:
//
//     src="../../js/app.js?v=116"
//
// Así que el guardián —que hace todo lo demás bien— pasa por el editor de
// pruebas sin tocar una sola referencia. Y el editor de pruebas queda pidiendo la
// versión vieja: las pruebas miden una aplicación que no es la que se abre.
//
// Y PEOR: PASA DESPACITO, Y NO SE NOTA
//
// Una versión vieja en el editor de pruebas hace que una prueba dé verde
// mientras la pantalla real está rota. El código está bien, la prueba pasa, y el
// problema aparece en la pantalla. Al revés de lo que se quiere.
//
// ---------------------------------------------------------------------
// POR QUÉ "sube-versiones.js" NO SE TOCA
// ---------------------------------------------------------------------
//
// Porque tiene una cualidad que esta no tiene: sin argumento NO ESCRIBE NADA, y
// solo mira. Eso se agregó a propósito, después de que uno lo corriera para
// comprobar y le bajara los 26 archivos a "?v=1" sin que nadie lo viera. Ver
// [cache-06].
//
// Este guion es lo contrario a propósito: SIEMPRE escribe, porque siempre se lo
// llama para subir. Y por eso pide el número y se niega a correr sin él: un
// guardián que reescribe lo que está comprobando es el que daño hace.
//
// ---------------------------------------------------------------------
// EL USO
// ---------------------------------------------------------------------
//
//     node tools/sube-la-version.js 117
//     node tools/sube-la-version.js 117 pages/app.html
//     node tools/sube-la-version.js 117 --solo-mira
//
// ---------------------------------------------------------------------
// LO QUE NO TOCA
// ---------------------------------------------------------------------
//
// Las librerías de CDN. Esas llevan su propia versión, en la URL entera, y ponerles
// "?v=117" al final no cambia nada y confunde: "cdn.jsdelivr.net/npm/x.js?v=116".
// Se reconocieron porque llevan "http".

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------
// LOS NÚMEROS
// ---------------------------------------------------------------------
const args = process.argv.slice(2);
const PILA = args.filter(function (a) { return !/^\d+$/.test(a) && a.indexOf('--') !== 0; });
const PEDIDO = args.filter(function (a) { return /^\d+$/.test(a); })[0];
const SOLO_MIRA = args.indexOf('--solo-mira') >= 0;

if (!PEDIDO) {
  console.log('  *** falta el número de versión.');
  console.log('    Un guardián que escribe lo que está comprobando es el que hace daño.');
  console.log('    Para SOLO MIRAR, sin escribir nada, se le dice: --solo-mira');
  console.log('');
  console.log('        node tools/sube-la-version.js --solo-mira');
  process.exit(1);
}
const NUEVA = PEDIDO;

// Y LOS ARCHIVOS
const POR_DEFECTO = ['tools/pruebas/app-sin-login.html', 'pages/app.html'];
const objetivos = PILA.length ? PILA : POR_DEFECTO;

// Y EL RECONOCIMIENTO DE UN ENLACE LOCAL
//
// Se busca "?v=" DESPUÉS de una comilla de cierre o de un paréntesis, para no
// pillar el "?v=" de una URL de CDN ni de un texto.
const RE_LOCAL = /((?:href|src)=")([^"?]*?)(\?v=)(\d+)(")/g;

let problemas = 0;
let subidos = 0;
let yaEstaban = 0;

objetivos.forEach(function (rel) {
  const ruta = path.join(RAIZ, rel);
  if (!fs.existsSync(ruta)) {
    console.log('  *** no existe: ' + rel);
    problemas++;
    return;
  }
  const antes = fs.readFileSync(ruta, 'utf8');
  const estilos = antes.match(RE_LOCAL) || [];
  const cdn = estilos.filter(function (x) { return /https?:\/\//.test(x); }).length;
  const locales = estilos.filter(function (x) { return !/https?:\/\//.test(x); });

  // Y QUÉ VERSIONES TENÍA
  const tenia = {};
  locales.forEach(function (x) { const n = (x.match(/\?v=(\d+)/) || [])[1]; if (n) tenia[n] = (tenia[n] || 0) + 1; });

  console.log('  ---- ' + rel + ' ----');
  console.log('    ' + locales.length + ' enlace(s) local(es) con versión'
    + (cdn ? '   y ' + cdn + ' de CDN, que no se tocan' : ''));
  const lista = Object.keys(tenia).sort(function (a, b) { return Number(b) - Number(a); })
    .map(function (k) { return 'v' + k + ' (' + tenia[k] + ')'; });
  console.log('    ahora: ' + (lista.length ? lista.join(', ') : 'ninguno tiene versión'));

  if (!locales.length) {
    console.log('    *** NINGÚN enlace local tiene "?v=". Es distinto de lo que se supone.');
    problemas++;
    return;
  }

  if (SOLO_MIRA) {
    const distintos = locales.filter(function (x) { return (x.match(/\?v=(\d+)/) || [])[1] !== NUEVA; }).length;
    if (distintos) {
      console.log('    *** ' + distintos + ' enlace(s) están en otra versión, y --solo-mira no escribe.');
      problemas++;
    } else {
      console.log('    ok  los ' + locales.length + ' ya están en v' + NUEVA);
      yaEstaban += locales.length;
    }
    return;
  }

  const despues = antes.replace(RE_LOCAL, function (m, a, archivo, q, num, cierre) {
    if (/https?:\/\//.test(archivo)) return m;          // CDN: no se toca
    if (num === NUEVA) { yaEstaban++; return m; }
    subidos++;
    return a + archivo + q + NUEVA + cierre;
  });

  if (despues === antes) {
    console.log('    ok  no había nada que subir');
    return;
  }
  fs.writeFileSync(ruta, despues, 'utf8');
  console.log('    **  subido a v' + NUEVA);

  // Y SE COMPRUEBA, PORQUE ESCRIBIR UN ARCHIVO Y DECIR "ok" NO ES COMPROBAR NADA
  const releido = fs.readFileSync(ruta, 'utf8');
  const despuesDe = (releido.match(RE_LOCAL) || [])
    .filter(function (x) { return !/https?:\/\//.test(x); })
    .filter(function (x) { return (x.match(/\?v=(\d+)/) || [])[1] !== NUEVA; });
  if (despuesDe.length) {
    console.log('    *** ' + despuesDe.length + ' quedaron en otra versión');
    problemas++;
  } else {
    console.log('    ok  releído: los ' + (locales.length - yaEstaban) + ' quedaron en v' + NUEVA);
  }
});

console.log('');
if (problemas) {
  console.log('  *** ' + problemas + ' PROBLEMA(S)');
  process.exit(1);
}
console.log('  ok  ' + subidos + ' enlace(s) subidos, ' + yaEstaban + ' ya estaban en v' + NUEVA);

// ---------------------------------------------------------------------
// LA COMPROBACIÓN DE ESTA COMPROBACIÓN
// ---------------------------------------------------------------------
// Y POR QUÉ ESTÁ AL FINAL
//
// Porque un guardián que no se sabe a sí mismo es un guardián que no se puede
// creer. Y el caso que importa es el que falló: un archivo con rutas de TRES
// niveles, que "sube-versiones.js" no ve, y que por eso quedó en la versión vieja
// sin que nadie lo notara.
console.log('');
console.log('  === el guardián se comprueba a si mismo ===');
const CASOS = [
  ['ok, dos niveles', '<script src="../js/app.js?v=116"></script>', '117',
    '<script src="../js/app.js?v=117"></script>'],
  ['ok, tres niveles, el que no veía el otro guardián', '<script src="../../js/app.js?v=116"></script>', '117',
    '<script src="../../js/app.js?v=117"></script>'],
  ['ok, los dos a la vez', '<link href="../css/a.css?v=116"><script src="../../js/b.js?v=115"></script>', '117',
    '<link href="../css/a.css?v=117"><script src="../../js/b.js?v=117"></script>'],
  ['ok, y que NO toque la CDN', '<script src="https://cdn.jsdelivr.net/npm/x.js?v=9"></script>', '117',
    '<script src="https://cdn.jsdelivr.net/npm/x.js?v=9"></script>'],
];
let fallos = 0;
CASOS.forEach(function (c) {
  // Y SE USA EL MISMO RECONOCIMIENTO DEL GUARDIÓN, NO OTRO
  const salio = c[1].replace(RE_LOCAL, function (m, a, archivo, q, num, ci) {
    if (/https?:\/\//.test(archivo)) return m;
    return a + archivo + q + c[2] + ci;
  });
  const bien = salio === c[3];
  if (!bien) fallos++;
  console.log('    ' + (bien ? 'ok  ' : '*** ') + c[0]);
  if (!bien) console.log('          salio: ' + salio + '\n          esperaba: ' + c[3]);
});
console.log('');
if (fallos) {
  console.log('    *** el guardián falla ' + fallos + ' de sus ' + CASOS.length + ' casos');
  process.exit(1);
}
console.log('    ok  el guardián sube los ' + CASOS.length + ' casos, y no toca la CDN');