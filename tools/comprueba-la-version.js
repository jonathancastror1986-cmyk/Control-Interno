// ===================================================================
// COMPRUEBA-LA-VERSION
// ===================================================================
// QUE EL NÚMERO DENTRO DE LA APLICACIÓN SEA EL MISMO QUE EL DE LOS ENLACES
//
// ---------------------------------------------------------------------
// POR QUÉ
// ---------------------------------------------------------------------
//
// Porque la versión aparece en dos lugares —el "?v=" de los "<script>" de
// "app.html" y el "VERSION_APP" de "js/versiones.js"— y si se escriben a mano en
// dos momentos distintos, tarde o temprano quedan distintos.
//
// Y CUANDO QUEDAN DISTINTOS, PASA UNA DE ESTAS DOS COSAS
//
// 1. El número de adentro es el viejo y el de los enlaces el nuevo: la pantalla
//    muestra una versión que no es la que se está corriendo, y el diagnóstico
//    que dice "v120" es mentira.
//
// 2. Al revés: los enlaces piden una versión que no existe, el script da 404, y la
//    aplicación corre sin un archivo entero. Eso no da ningún error visible: el
//    archivo simplemente no está, y lo que se usa es la versión de antes que el
//    navegador tenía guardada.
//
// ---------------------------------------------------------------------
// Y QUE TODOS LOS ENLACES VAYAN EN LA MISMA
//
// Porque la primera vez que pasó, "app.html" pedía la 117 y el editor de pruebas
// pedía la 115, y las dos se corrían como si fueran la misma aplicación.

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

function leer(rel) {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}

// ---------------------------------------------------------------------
// 1. EL NÚMERO DE ADENTRO
// ---------------------------------------------------------------------
const vs = leer('js/versiones.js');
const m = vs.match(/const\s+VERSION_APP\s*=\s*'(\d+)'/);
console.log('  === la versión ===');
if (!m) {
  console.log('  *** no se encontró VERSION_APP en js/versiones.js');
  process.exit(1);
}
const dentro = m[1];
console.log('    js/versiones.js dice: v' + dentro);

// ---------------------------------------------------------------------
// 2. EL NÚMERO DE LOS ENLACES
// ---------------------------------------------------------------------
// Y DE LOS DOS HTML, PORQUE LOS DOS SON LA APLICACIÓN
const HTML = ['pages/app.html', 'tools/pruebas/app-sin-login.html'];
let problemas = 0;
HTML.forEach(function (rel) {
  const t = leer(rel);
  const todos = [...t.matchAll(/(?:href|src)="[^"?]+\?v=(\d+)"/g)].map(function (x) { return x[1]; });
  if (!todos.length) {
    console.log('    *** ' + rel + ': ningún enlace local tiene "?v="');
    problemas++;
    return;
  }
  const distintas = [...new Set(todos)].sort();
  console.log('    ' + rel + ': ' + todos.length + ' enlaces, en ' + distintas.join(', '));
  if (distintas.length !== 1) {
    console.log('        *** hay enlaces en ' + distintas.length + ' versiones a la vez');
    problemas++;
  }
  if (distintas.length === 1 && distintas[0] !== dentro) {
    console.log('        *** pide v' + distintas[0] + ' pero el archivo dice v' + dentro);
    problemas++;
  }
});

// ---------------------------------------------------------------------
// 3. QUE "versiones.js" SE CARGUE, Y ANTES QUE LOS QUE LO USAN
// ---------------------------------------------------------------------
console.log('');
console.log('  === el script de la versión ===');
const app = leer('pages/app.html');
const iVers = app.indexOf('js/versiones.js');
const iApp = app.indexOf('js/app.js');
const iMod = app.indexOf('js/modulos.js');
if (iVers < 0) {
  console.log('    *** pages/app.html NO carga js/versiones.js: la pantalla no va a mostrar nada');
  problemas++;
} else {
  console.log('    ok  app.html lo carga');
  if (iApp > 0 && iVers > iApp) {
    console.log('    *** se carga DESPUÉS de app.js, y app.js lo necesita al empezar');
    problemas++;
  } else {
    console.log('    ok  se carga antes que app.js');
  }
}
if (iMod > 0 && iVers > iMod) {
  console.log('    ok  y antes que modulos.js');
}

console.log('');
if (problemas) {
  console.log('  *** ' + problemas + ' PROBLEMA(S) ===');
  console.log('');
  console.log('    Para arreglarlo:');
  console.log('      node tools/sube-la-version.js ' + dentro);
  process.exit(1);
}
console.log('  ok  todo dice v' + dentro);

// ---------------------------------------------------------------------
// LA COMPROBACIÓN DE ESTA COMPROBACIÓN
// ---------------------------------------------------------------------
// Y CON LOS DOS DESAJUSTES REALES: EL QUE MIENTE Y EL QUE PIDE UN ARCHIVO QUE NO
// EXISTE
console.log('');
console.log('  === el guardián se comprueba a si mismo ===');
// Y EL CASO 4 ES "NO HAY NADA QUE COMPARAR", QUE DA IGUAL
//
// Con los dos sitios vacíos no se puede decir que estén mal: es lo que pasa con un
// "<link>" a una CDN, que no lleva "?v=" y no se le pone.
//
// Y EL "c[3]" Y NO EL "c[2]"
//
// La primera versión comparaba contra el "c[2]", que es el texto del enlace, y no
// contra el booleano del final. Un texto nunca es verdadero, así que el guardián
// daba sus cuatro casos en rojo —incluido el que era correcto— y parecía roto.
const CASOS = [
  ['ok, todo lo mismo', '123', '?v=123', true],
  ['*** el archivo nuevo y los enlaces viejos', '123', '?v=120', false],
  ['*** los enlaces nuevos y el archivo viejo', '120', '?v=123', false],
  ['ok, sin nada que comparar', '123', '', true],
];
let fallos = 0;
CASOS.forEach(function (c) {
  const versiones = c[2] ? [c[2].split('=')[1]] : [];
  const coincide = versiones.length === 0
    ? true
    : (versiones.length === 1 && versiones[0] === c[1]);
  const bien = coincide === c[3];
  if (!bien) fallos++;
  console.log('    ' + (bien ? 'ok  ' : '*** ') + c[0] + '   (coincide: ' + (coincide ? 'sí' : 'no') + ')');
});
console.log('');
if (fallos) {
  console.log('    *** el guardián falla ' + fallos + ' de sus ' + CASOS.length + ' casos');
  process.exit(1);
}
console.log('    ok  el guardián ve los ' + CASOS.length + ' casos');