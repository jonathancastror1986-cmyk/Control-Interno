// COMPILAR LOS ARCHIVOS EN EL ORDEN EN QUE LOS CARGA LA PÁGINA
// ============================================================
//
// -------------------------------------------------------------------
// POR QUÉ HAY QUE COMPILARLOS JUNTOS
// ---------------------------------
//
// Cada "<script>" de la página se ejecuta en la misma página y comparte el ámbito. Compilarlos
// por separado NO alcanza: dos "const" con el mismo nombre en archivos distintos compilan
// solos y rompen juntos.
//
// Y el orden importa: el que carga después pisa al que cargó antes. Con "function", la última
// gana. O sea que el orden de "app.html" decide cuál de dos funciones con el mismo nombre se
// ejecuta, y eso no es visible leyendo el código.
//
// -------------------------------------------------------------------
// Y EL ORDEN SE SACA DEL HTML, NO DE UNA LISTA
// --------------------------------------------
//
// Porque la lista escrita a mano es la que se queda vieja. El "<script src>" del HTML es lo que
// manda, y es lo que compila el navegador. Ver [cache-04].
//
const fs = require('fs');
const cp = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const HTML = RAIZ + 'pages/app.html';

const html = fs.readFileSync(HTML, 'utf8');

// Y en el orden en que aparecen en el archivo, que es el orden en que se cargan. Se les saca
// el "?v=N" del final, porque en disco no existe un archivo que se llame "relojes.js?v=22" y
// el guionVa a decir que faltan los catorce.
const orden = [...html.matchAll(/<script src="\.\.\/(js\/[^"?]+)\??[^"]*"/g)].map((m) => m[1]);

if (orden.length < 5) {
  console.log('  *** SE ENCONTRARON SOLO ' + orden.length + ' SCRIPT LOCALES ***');
  process.exit(1);
}
console.log('  ' + orden.length + ' archivos locales, en el orden de la página:');
orden.forEach((f, i) => console.log('   ' + String(i + 1).padStart(2) + '. ' + f));

// Y el contenido de cada uno. Los que no existen se avisan y se saltan.
const partes = [];
const faltan = [];
orden.forEach(function (rel) {
  const p = RAIZ + rel;
  if (!fs.existsSync(p)) { faltan.push(rel); return; }
  partes.push(fs.readFileSync(p, 'utf8'));
});

if (faltan.length) {
  console.log('');
  console.log('  *** FALTAN ' + faltan.length + ' ARCHIVO(S) QUE EL HTML PIDE ***');
  faltan.forEach((f) => console.log('      ' + f));
  console.log('    El HTML pide un archivo que no está: la página no abre.');
  process.exit(1);
}

// -------------------------------------------------------------------
// COMPILAR JUNTOS
// -------------------------------------------------------------------
const junto = partes.join('\n');
const tmp = 'C:/Users/mrj0t/AppData/Local/Temp/opencode/prueba-junta.js';
fs.writeFileSync(tmp, junto, 'utf8');

console.log('');
console.log('    junto: ' + junto.split('\n').length + ' lineas');

try {
  cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  console.log('    ok  compila todo junto');
} catch (e) {
  const err = String(e.stderr || e.message);
  console.log('');
  console.log('  *** NO COMPILA JUNTO ***');
  console.log(err.split('\n').slice(0, 12).join('\n'));
  console.log('');
  console.log('    Pero cada archivo SÍ compila solo. Entonces el problema es de dos archivos');
  console.log('    juntos: casi siempre un nombre declarado dos veces, o un bloque de');
  console.log('    comentario sin cerrar.');
  process.exit(1);
}

// -------------------------------------------------------------------
// Y NINGÚN NOMBRE DECLARADO DOS VECES
// -------------------------------------------------------------------
// Porque eso no da error de sintaxis: el archivo entero se pone a guardar en un solo nombre y
// la función que se quiso pisar nunca corre. Ver [word-04].
//
// Y lo que cuenta es lo de nivel superior, porque lo de adentro de una función no compite con
// nada.
const DECLARA = /^(?:const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;
const donde = {};
let total = 0;

orden.forEach(function (rel) {
  const p = RAIZ + rel;
  if (!fs.existsSync(p)) return;
  fs.readFileSync(p, 'utf8').split('\n').forEach(function (x, i) {
    const m = x.match(DECLARA);
    if (!m) return;
    total++;
    (donde[m[1]] = donde[m[1]] || []).push(rel + ':' + (i + 1));
  });
});

console.log('');
console.log('    ' + total + ' declaraciones de nivel superior');

const repetidos = Object.keys(donde).filter(function (n) { return donde[n].length > 1; });
if (repetidos.length) {
  console.log('');
  console.log('  *** ' + repetidos.length + ' NOMBRE(S) DECLARADO(S) DOS VECES ***');
  repetidos.forEach(function (n) {
    console.log('      ' + n);
    console.log('        en ' + donde[n].join('  y  '));
  });
  console.log('');
  console.log('    Los archivos comparten el ámbito. El que carga último pisa al otro.');
  console.log('    Ver [word-04].');
  process.exit(1);
}
console.log('    ok  y ningún nombre está declarado dos veces');
