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
const path = require('path');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const HTML = RAIZ + 'pages/app.html';

const html = fs.readFileSync(HTML, 'utf8');

// Y en el orden en que aparecen en el archivo, que es el orden en que se cargan. Se les saca
// el "?v=N" del final, porque en disco no existe un archivo que se llame "relojes.js?v=22" y
// el guionVa a decir que faltan los catorce.
//
// -------------------------------------------------------------------
// Y POR QUÉ EL PATRÓN YA NO DICE "js/"
// ------------------------------------
//
// Antes decía:
//
//     /<script src="\.\.\/(js\/[^"?]+)\??[^"]*"/g
//
// O sea: solo los archivos de "js/". Y era correcto mientras todo vivía ahí. Pero los
// módulos se movieron a "config/", "models/", "controllers/" y "views/<módulo>/", y el
// patrón dejó de encontrar esos: el guion iba a imprimir "ok  ningún nombre está declarado
// dos veces" SIN HABER MIRADO UN SOLO ARCHIVO. Es el peor resultado posible: verde y falso.
//
// Y ya está escrito en los comentarios de arriba, con otro ejemplo: *"la lista escrita a
// mano es la que se queda vieja"*. Y este no era una lista, era un patrón, y es peor: una
// lista se ve cuando está vieja; un patrón no.
//
// Ahora el patrón toma cualquier carpeta del proyecto y cualquiera que no sea una URL. Y
// por eso no hay que tocarlo la próxima vez que se cree un módulo. Ver [arq-09].
//
const orden = [...html.matchAll(/<script src="\.\.\/(?!\/)([^"?]+)\??[^"]*"/g)].map((m) => m[1]);

if (orden.length < 5) {
  console.log('  *** SE ENCONTRARON SOLO ' + orden.length + ' SCRIPT LOCALES ***');
  console.log('    O el HTML cambió de forma, o el patrón dejó de encontrar los módulos.');
  console.log('    Antes de aceptar un cero: mirar qué "<script src=" hay en el HTML.');
  process.exit(1);
}

// -------------------------------------------------------------------
// Y QUE NO SE ESCAPE NINGÚN ARCHIVO DEL PROYECTO
// ------------------------------------------------
//
// Y esto es lo que convierte "el patrón encontró menos" en "el patrón encontró todos".
//
// Porque el guardián comprueba lo que el HTML pide. Si un archivo del proyecto NO está en el
// HTML, no lo comprueba: y no avisa. Ese archivo puede tener dos funciones con el mismo
// nombre y el guardián va a decir que todo está bien.
//
// Y hoy, con "/models" y "/controllers" armándose, es el caso normal y no la excepción. Ver
// [arq-10].
//
const CARPETAS_CODIGO = ['js', 'config', 'models', 'controllers', 'views'];
function recorrer(carpeta, salida) {
  const llena = path.join(RAIZ, carpeta);
  if (!fs.existsSync(llena)) return salida;
  fs.readdirSync(llena, { withFileTypes: true }).forEach(function (e) {
    const rel = carpeta + '/' + e.name;
    if (e.isDirectory()) recorrer(rel, salida);
    else if (e.name.endsWith('.js')) salida.push(rel);
  });
  return salida;
}
const enDisco = [];
CARPETAS_CODIGO.forEach(function (c) { recorrer(c, enDisco); });

const huerfanos = enDisco.filter(function (f) { return orden.indexOf(f) < 0; });
if (huerfanos.length) {
  console.log('');
  console.log('  *** ' + huerfanos.length + ' ARCHIVO(S) DEL PROYECTO QUE EL HTML NO PIDE ***');
  huerfanos.forEach(function (f) { console.log('      ' + f); });
  console.log('    Un archivo que el HTML no pide NO SE COMPRUEBA. Si tiene dos funciones con');
  console.log('    el mismo nombre, este guardián no lo va a ver, y va a decir que todo bien.');
  console.log('    Ver [arq-10].');
  process.exit(1);
}
console.log('  ok  y los ' + enDisco.length + ' archivos del proyecto están todos en el HTML');
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
