// PRUEBA DE "sube-versiones.js": QUE EL GUARDIÁN MUERDA DE VERDAD
// ================================================================
//
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const GUARDIAN = RAIZ + 'tools/sube-versiones.js';
const REAL = RAIZ + 'pages/app.html';

// Y la prueba va en "pages/", y no en "tools/pruebas/".
//
// Y hay una razón técnica y no de gusto: el guardián resuelve los enlaces RELATIVOS AL HTML
// que los lleva, porque "../config/auth.js" desde "pages/app.html" es "config/auth.js". Si
// la copia se pone en "tools/pruebas/", "../config/auth.js" pasa a ser "tools/config/auth.js",
// que no existe, y el guardián acusa veinte enlaces rotos en un archivo que está perfecto.
//
// O sea que la copia tiene que estar donde está la original, o la prueba mide otra cosa.
//
// Y no ensucia el sitio por tres cosas: el nombre empieza con "_", que es lo que el
// guardián de versiones salta al descubrir archivos; el archivo NO está versionado, y
// "comprueba-rutas.js" solo revisa lo que devuelve "git ls-files"; y se borra en un
// "finally", o sea que también si el caso falla.
const PROBETA = RAIZ + 'pages/_prueba-versiones.html';

const original = fs.readFileSync(REAL, 'utf8');

console.log('  === probando "sube-versiones.js" ===');

// -------------------------------------------------------------------
// EL ARRASTRADOR
// -------------------------------------------------------------------
// Y cada caso se corre en un archivo NUEVO, no en el que quedó del caso anterior. Uno
// encima del otro esconde el defecto del primero.
let n = 0;
function correr(txt, etiqueta) {
  const donde = PROBETA.replace(/\.html$/, (n++) + '-' + etiqueta + '.html');
  fs.writeFileSync(donde, txt, 'utf8');
  try {
    const salida = execFileSync('node', [GUARDIAN], {
      cwd: RAIZ,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { HTML_PROBETA: donde }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { codigo: 0, salida };
  } catch (e) {
    return { codigo: e.status === undefined ? -1 : e.status, salida: (e.stdout || '') + (e.stderr || '') };
  } finally {
    // Y la copia se borra SÍ o SÍ. Un archivo de prueba que queda en "tools/pruebas/" es un
    // archivo que el próximo confunde con una prueba real, y "comprueba-rutas.js" lo revisa.
    fs.unlinkSync(donde);
  }
}

// -------------------------------------------------------------------
// CASO 1 — EL HTML DE VERDAD, SIN TOCAR
// -------------------------------------------------------------------
// Y sale en verde, y eso solo prueba que el archivo real está bien. No prueba que el
// guardián sirva. Para eso están los casos 2 y 3.
console.log('');
const c1 = correr(original, 'intacto');
console.log('  caso 1: el "app.html" de verdad, sin tocar');
if (c1.codigo === 0) {
  console.log('    el archivo real pasa: ok');
  console.log('    esto solo dice que el HTML está bien. Para decir que el GUARDIÁN sirve,');
  console.log('    están los casos 2 y 3, que son los que le meten el defecto.');
} else {
  console.log('    FALLÓ, y el archivo real está bien: el guardián está roto');
  console.log(c1.salida.split('\n').slice(0, 6).map((x) => '      ' + x).join('\n'));
  process.exit(1);
}

// -------------------------------------------------------------------
// CASO 2 — UN ENLACE QUE NO APUNTA A NINGÚN ARCHIVO
// -------------------------------------------------------------------
// Y esta es la comprobación NUEVA: la que reemplaza la lista de nombres escritos a mano.
//
// Y el nombre del archivo inventado importa: tiene que ser un archivo local, con "../" y con
// una carpeta que el guardián descubre. Si fuera "../inventado.js" el guardián lo miraría
// igual, pero conviene que sea de una carpeta real para que el fallo sea del enlace roto y
// no de otra cosa.
console.log('');
const roto = '../config/no-existe-nada.js';
const c2 = correr(original.replace('</head>', '  <script src="' + roto + '"></script>\n</head>'), 'roto');
console.log('  caso 2: un "<script>" que apunta a un archivo que no está');
if (c2.codigo !== 0 && /ENLACE\(S\) LOCALES/.test(c2.salida)) {
  console.log('    enlace roto detectado: PASÓ');
  const linea = c2.salida.split('\n').find((x) => x.indexOf(roto) >= 0);
  if (linea) console.log('    ' + linea.trim());
} else {
  console.log('    *** NO LO DETECTÓ ***');
  console.log('    Un enlace a un archivo inexistente tiene que ser un error, no un "ok".');
  process.exit(1);
}

// -------------------------------------------------------------------
// CASO 3 — UN "views/" SIN VERSIÓN
// -------------------------------------------------------------------
// Y este es el segundo agujero, y es más fino.
//
// El patrón viejo de "sin versión" era: /(?:href|src)="(\.\.\/(?:css|js)\/[^"?]+)"/ —solo
// "css/" y "js/"—, así que un archivo de "views/", "config/", "controllers/" o "models/" sin
// "?v=" NO SE MIRABA. El guardián imprimía "ok  y ninguna referencia local sin versión" sobre
// un archivo que el navegador nunca iba a volver a pedir.
//
// Y el archivo de las reglas de densidad ES de "views/". O sea que el agujero caía
// exactamente sobre el archivo que más se había tocado.
console.log('');
const sinVersion = '../views/asistencia/asistencia.css';
// Y sin el número escrito a mano. La primera versión de esto tenía "?v=58" pegado en el
// "replace", y el día que se subió a v59 el "replace" no reemplazó NADA: la copia quedó igual
// que el original, el guardián la aprobó, y el caso dio FALLA.
//
// O sea que la prueba falló por un número que el guardián ni siquiera mira. Y un caso que
// falla por eso es peor que un caso que no existe, porque ocupa el lugar del que sí.
//
// Y la forma correcta es una expresión regular que quite el "?v=" y lo que sea que siga, sin
// saber qué número hay.
const reVersion = new RegExp('(href|src)="(' + sinVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\?v=\\d+"', 'g');
if (!reVersion.test(original)) {
  console.log('  *** NO SE ENCONTRÓ "' + sinVersion + '?v=" en app.html ***');
  console.log('    El caso 3 no se puede armar. No se da por probado.');
  process.exit(1);
}
reVersion.lastIndex = 0;
const c3 = correr(original.replace(reVersion, '$1="$2"'), 'sin-version');
console.log('  caso 3: un "views/" sin "?v="');
if (c3.codigo !== 0 && /NO TIENEN VERSION/.test(c3.salida)) {
  console.log('    falta de versión detectada: PASÓ');
  const linea = c3.salida.split('\n').find((x) => x.indexOf('asistencia.css') >= 0);
  if (linea) console.log('    ' + linea.trim());
} else {
  console.log('    *** NO LO DETECTÓ ***');
  console.log('    Un archivo sin "?v=" nunca llega al navegador, y con el patrón viejo no se miraba.');
  process.exit(1);
}

// -------------------------------------------------------------------
// CASO 4 — QUE NO ESCRIBA CUANDO SOLO MIRA
// -------------------------------------------------------------------
// Y este caso es el que más cuesta caro cuando falla: si correr el guardián para comprobar
// baja las referencias a "?v=1", entonces no se puede correr antes de commitear, y el que no
// se corre deja de estorbar.
console.log('');
const antesDeMirar = fs.readFileSync(REAL, 'utf8');
const c4 = correr(antesDeMirar, 'solo-mira');
const despuesDeMirar = fs.readFileSync(REAL, 'utf8');
console.log('  caso 4: correr el guardián para comprobar no reescribe el archivo');
if (antesDeMirar === despuesDeMirar) {
  console.log('    "app.html" quedó igual: PASÓ');
} else {
  console.log('    *** REESCRIBIÓ "app.html" al solo comprobar ***');
  process.exit(1);
}

// -------------------------------------------------------------------
// Y QUE SIGUE MIRANDO EL ARCHIVO DE VERDAD
// -------------------------------------------------------------------
console.log('');
console.log('  y el archivo real, después de las pruebas:');
if (fs.readFileSync(REAL, 'utf8') === original) {
  console.log('    ok  sigue exactamente como estaba');
} else {
  console.log('    *** "app.html" CAMBIÓ ***');
  process.exit(1);
}

console.log('');
console.log('    ok  el guardián pesa los cuatro casos, y "app.html" sigue entero');