// SACAR "js/nucleo.js" DE "js/app.js"
// =====================================
//
// -------------------------------------------------------------------
// QUÉ SE SACA
// ----------
//
// El núcleo son tres cosas:
//
//   1. LA CABEZA: los renglones 1 al 470, antes del primer banner. Ahí están las 25 variables
//      de estado de la aplicación ("workers", "tarjetas", "eppCatalog"...) y los ayudantes
//      chiquitos que usan todos los módulos.
//
//   2. "LA BITÁCORA, PARA PODER LEERLA"        (5 funciones)
//   3. "¿ESTÁ PUESTA LA BITÁCORA DE AUDITORÍA?" (22 funciones)
//   4. "EL ENCABEZADO SE ENCOGE AL BAJAR"       (3 funciones)
//
// -------------------------------------------------------------------
// POR QUÉ EL NÚCLEO, Y POR QUÉ VA PRIMERO
// ----------------------------------------
//
// "workers" la usan los ocho módulos. "attendance", cinco. Y así con 51 de las 151 variables
// de nivel superior.
//
// Y esas son "const" y "let", que NO se levantan como las "function". Si el módulo que las
// usa carga antes que el que las declara, se cae con "ReferenceError" al tocarlas.
//
// O sea que el núcleo tiene que cargar primero. No por las funciones: las funciones de nivel
// superior son globales y da igual el orden. Por las variables.
//
// -------------------------------------------------------------------
// EL RIESGO DE ESTE CORTE, Y POR QUÉ SE PUEDE HACER
// ------------------------------------------------
//
// Los fragmentos de un módulo NO son contiguos. El núcleo son cuatro trozos, con 13.700
// renglones de otras cosas en medio. Y juntarlos cambia el orden en que se declaran las
// cosas de nivel superior.
//
// Pero eso no rompe nada, y por qué:
//
//   Al concatenar se conserva el orden ORIGINAL de los fragmentos. O sea que si el fragmento
//   1 va antes del 4 en el archivo nuevo, también iba antes en el viejo.
//
//   Y en el archivo viejo no hay ninguna declaración de nivel superior que use algo
//   declarado más abajo, porque si la hubiera la aplicación no habría cargado.
//
//   Y entre módulos no puede haber una referencia de nivel superior hacia adelante, por la
//   misma razón. O sea que la única cosa que hay que cuidar es el ORDEN DE CARGA, y ese
//   queda escrito en el "<link>".
//
// -------------------------------------------------------------------
// LO QUE ESTE GUARDIÁN COMPRUEBA, Y POR QUÉ CADA COSA
// --------------------------------------------------
//
//   1. El mapa está al día. Si no, los cortes salen de una lectura vieja.
//   2. Los cuatro rangos tienen sus llaves parejas ANTES de cortar.
//   3. Las llaves que se van se CUENTAN en el trozo, no se suponen.
//   4. "app.js" queda con profundidad 0 al releerlo, y "nucleo.js" también.
//   5. Ninguna de las 25 variables de la cabeza queda DECLARADA en los dos archivos, porque
//      dos "const" con el mismo nombre en el ámbito global es un error de sintaxis.
//   6. Lo que se copia a "nucleo.js" tiene que estar EN "app.js", carácter por carácter.
//   7. Los dos archivos escritos COMPILAN, leyéndolos del disco.
//   8. Y los "<script>" quedan en el orden: núcleo, escáner, aplicación.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const raiz = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const APPJS = path.join(raiz, 'js', 'app.js');
const APPHTML = path.join(raiz, 'pages', 'app.html');
const NUEVO = path.join(raiz, 'js', 'nucleo.js');

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const LINK = '<script src="../js/nucleo.js?v=1"></script>';
const NL = '\r\n';

// -------------------------------------------------------------------
// 1. IDEMPOTENCIA, POR ESTADO Y NO POR "¿EL ARCHIVO EXISTE?"
// -------------------------------------------------------------------
const app0 = fs.readFileSync(APPJS, 'utf8');
const html0 = fs.readFileSync(APPHTML, 'utf8');
const lineas0 = app0.split(NL);

if (html0.indexOf(LINK) >= 0) {
  console.log('    (ya está hecho: el "<script>" de "nucleo.js" está en el HTML)');
  process.exit(0);
}
if (fs.existsSync(NUEVO)) {
  console.log('  *** ESTÁ "js/nucleo.js" PERO NO ESTÁ EN EL HTML ***');
  console.log('    Habría dos fuentes. No se escribe nada.');
  process.exit(1);
}

// -------------------------------------------------------------------
// 2. EL MAPA, VERIFICADO
// -------------------------------------------------------------------
const v = cp.spawnSync(process.execPath, [path.join(raiz, 'tools', 'mapa-js.js'), '--verificar'],
  { encoding: 'utf8' });
if (v.status !== 0) {
  console.log('  *** EL MAPA ESTÁ VIEJO ***');
  console.log('    ' + (v.stdout || '').trim().split('\n').slice(0, 3).join('\n    '));
  console.log('    Se arregla con:  node tools/mapa-js.js');
  process.exit(1);
}
console.log('    ok  el mapa está al día');

const mapa = fs.readFileSync(path.join(raiz, 'MAPA-JS.txt'), 'utf8');
const RE_SEC = /^\s*L\s*(\d+)\s\s(.+?)\s+(\d+) regl\.\s+(\d+) fn\./;

const secciones = [];
let dentro = false;
mapa.split('\n').forEach((l) => {
  if (!dentro && /^\s*LAS SECCIONES\s*$/.test(l)) { dentro = true; return; }
  if (dentro && /^\s*LAS \d/.test(l)) { dentro = false; return; }
  if (!dentro) return;
  const m = RE_SEC.exec(l);
  if (m) secciones.push({ linea: Number(m[1]), titulo: m[2].trim(), fn: Number(m[4]) });
});

if (secciones.length !== 36) {
  console.log('  *** SALIERON ' + secciones.length + ' SECCIONES, Y SON 36 ***');
  process.exit(1);
}
secciones.forEach((s, k) => { s.fin = (k < secciones.length - 1 ? secciones[k + 1].linea : lineas0.length) - 1; });

// Y el mapa se contrasta contra el archivo: los renglones tienen que estar donde dice.
const cronologia = secciones.every((s, k) => s.fin >= s.linea);
if (!cronologia) {
  console.log('  *** LOS RANGOS DEL MAPA ESTÁN CRUZADOS ***');
  process.exit(1);
}
console.log('    ok  36 secciones, con los rangos en orden');

// -------------------------------------------------------------------
// 3. LOS CORTES DEL NÚCLEO
// -------------------------------------------------------------------
const DEL_NUCLEO = /(BIT.CORA, PARA PODER LEERLA|BIT.CORA DE AUDITOR.A|ENCABEZADO SE ENCOGE)/;

const mias = secciones.filter((s) => DEL_NUCLEO.test(sinAcentos(s.titulo)));

// Y la cabeza: del renglón 1 hasta antes del primer banner.
const rangos = [{ desde: 1, hasta: secciones[0].linea - 1, que: 'la cabeza' }]
  .concat(mias.map((s) => ({ desde: s.linea, hasta: s.fin, que: s.titulo })));

console.log('');
console.log('    LOS ' + rangos.length + ' RANGOS QUE SE VAN');
console.log('');
rangos.forEach((r) => {
  console.log('      renglones ' + String(r.desde).padStart(6) + ' a ' + String(r.hasta).padStart(6)
    + '  (' + (r.hasta - r.desde + 1) + ')   ' + r.que.slice(0, 46));
});

const total = rangos.reduce((a, r) => a + (r.hasta - r.desde + 1), 0);
console.log('');
console.log('      en total: ' + total + ' renglones de ' + lineas0.length);
console.log('');

if (rangos.length !== 4) {
  console.log('  *** SON ' + rangos.length + ' RANGOS, Y SON 4 ***');
  console.log('    El mapa cambió. No se escribe nada.');
  process.exit(1);
}

// -------------------------------------------------------------------
// 4. LAS LLAVES, ANTES DE CORTAR
// -------------------------------------------------------------------
function llavesDe(s) {
  const l = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return [(l.match(/\{/g) || []).length, (l.match(/\}/g) || []).length];
}

rangos.forEach((r) => {
  const trozo = lineas0.slice(r.desde - 1, r.hasta).join('\n');
  const [a, b] = llavesDe(trozo);
  if (a !== b) {
    console.log('  *** EL RANGO "' + r.que + '" NO TIENE SUS LLAVES PAREJAS (' + a + ' y ' + b + ') ***');
    process.exit(1);
  }
});
console.log('    ok  los 4 rangos tienen sus llaves parejas');

const quitadas = rangos.reduce((acc, r) => {
  const [a, b] = llavesDe(lineas0.slice(r.desde - 1, r.hasta).join('\n'));
  acc[0] += a; acc[1] += b;
  return acc;
}, [0, 0]);

// -------------------------------------------------------------------
// 5. EL TEXTO, Y LA COMPROBACIÓN DE QUE SE COPIÓ BIEN
// -------------------------------------------------------------------
const CABECERA = [
  '/* ===================================================================',
  '   js/nucleo.js - LO QUE USA MÁS DE UN MÓDULO',
  '   ===================================================================',
  '',
  '   Este archivo carga PRIMERO. Y no por las funciones: las funciones de nivel',
  '   superior son globales, y da igual en qué orden carguen los módulos.',
  '',
  '   Es por las variables. "workers" la usan los ocho módulos, "attendance" cinco, y',
  '   hay 51 de las 151 variables de nivel superior que las usa más de uno.',
  '',
  '   Y esas son "const" y "let", que NO se levantan como las "function". Si el módulo',
  '   que las usa carga antes que el que las declara, se cae con "ReferenceError" al',
  '   tocarlas. Por eso el "<script>" de este archivo va el primero.',
  '',
  '   -------------------------------------------------------------------',
  '   LO QUE HAY AQUÍ',
  '   -------------------------------------------------------------------',
  '   1. LA CABEZA: el estado de la aplicación y los ayudantes que usan todos.',
  '      "workers", "attendance", "tarjetas", "eppCatalog", "kits",',
  '      "especialidades", "eppGps", "extraHolidays"...',
  '',
  '   2. La bitácora, para poder leerla.',
  '   3. Si está puesta la bitácora de auditoría.',
  '   4. El encabezado que se encoge al bajar.',
  '',
  '   -------------------------------------------------------------------',
  '   Y CÓMO SE SACÓ, Y POR QUÉ NO ROMPIÓ NADA',
  '   -------------------------------------------------------------------',
  '   Los cuatro trozos no son contiguos: hay 13.700 renglones de otras secciones en',
  '   medio. Y juntarlos cambia el orden en que se declaran las cosas de nivel superior.',
  '',
  '   Da igual, por dos razones juntas:',
  '',
  '     - Al concatenar se conserva el orden ORIGINAL de los trozos. Si el trozo 1 va',
  '       antes del 4 en el archivo nuevo, también iba antes en el viejo.',
  '     - Y en el archivo viejo no hay ninguna declaración de nivel superior que use',
  '       algo declarado más abajo. Si la hubiera, la aplicación no cargaría.',
  '',
  '   Entre módulos tampoco puede haber una referencia de nivel superior hacia adelante,',
  '   por la misma razón. Lo único que hay que cuidar es el ORDEN DE CARGA.',
  '',
  '   -------------------------------------------------------------------',
  '   LO QUE NO ESTÁ AQUÍ, Y DÓNDE ESTÁ',
  '   -------------------------------------------------------------------',
  '   Todavía no se partió el resto. "js/app.js" sigue con las 33 secciones de los',
  '   demás módulos, y carga después que este archivo.',
  '',
  '   Y "js/componentes/escaner.js" carga en el medio, como antes. No se le toca.',
  '',
  '   Ver la entrada [nucleo-01]. */',
  '',
  '',
].join(NL);

const trozos = rangos.map((r) => ({
  que: r.que,
  texto: lineas0.slice(r.desde - 1, r.hasta).join(NL),
}));

const cuerpo = trozos
  .map((x) => x.texto.replace(/\s+$/, ''))
  .join(NL + NL);

const nuevo = CABECERA + cuerpo + NL;

// Y la comprobación: cada trozo tiene que estar EN "app.js", tal cual.
//
// Y POR FRAGMENTO, y no el archivo entero junto. Porque los cuatro trozos están separados
// por 13.700 renglones de otras secciones: unidos no son ni pueden ser una parte contigua
// del texto viejo, y comparar eso siempre falla.
//
// Y por eso el guardia tiene que mirar cada trozo por separado. Una versión anterior de este
// mismo guion comparaba el cuerpo entero contra el archivo viejo, y salió en rojo siempre.
trozos.forEach((x) => {
  if (app0.indexOf(x.texto) < 0) {
    console.log('  *** EL TROZO "' + x.que + '" NO ESTÁ EN "app.js", TAL CUAL ***');
    console.log('    No se escribe nada.');
    process.exit(1);
  }
});
console.log('    ok  los 4 trozos están en "app.js", carácter por carácter');

// Y que cada trozo esté UNA vez, no repetido. Porque si un rango se solapa con otro, el
// código va a quedar dos veces y eso no lo ve el compilador.
trozos.forEach((x) => {
  const n = app0.split(x.texto).length - 1;
  if (n !== 1) {
    console.log('  *** EL TROZO "' + x.que + '" APARECE ' + n + ' VECES EN "app.js" ***');
    console.log('    Si un rango se solapa con otro, el código va a quedar dos veces.');
    console.log('    No se escribe nada.');
    process.exit(1);
  }
});
console.log('    ok  y cada uno aparece una vez sola, así que ningún rango se solapa con otro');

// -------------------------------------------------------------------
// 6. CORTAR "app.js", DE ATRÁS HACIA ADELANTE
// -------------------------------------------------------------------
// Y sobre el ARREGLO DE RENGLONES, no sobre el texto.
//
// Y con "slice" sobre el texto se mezclan dos cosas: "r.hasta" es un NÚMERO DE RENGLÓN, y
// "slice" cuenta CARACTERES. La primera versión cortaba en el carácter 470, que es la mitad
// del segundo renglón, y se llevó un solo par de llaves en vez de 347. Y el guardia lo
// detectó, porque el conteo de llaves no mintió: mintió el corte.
//
// Y de atrás hacia adelante, porque cada corte acorta y desplaza los siguientes.
const quitan = rangos.slice().sort((a, b) => b.desde - a.desde);

const resto = lineas0.slice();
const fuera = [];

quitan.forEach((r) => {
  fuera.unshift(resto.splice(r.desde - 1, r.hasta - r.desde + 1));
});

const app = resto.join(NL);

const quitados = fuera.reduce((a, x) => a + x.length, 0);
console.log('    renglones quitados de paso: ' + quitados);
if (quitados !== total) {
  console.log('  *** SE QUITARON ' + quitados + ' RENGLONES, Y SON ' + total + ' ***');
  console.log('    No se escribe nada.');
  process.exit(1);
}
console.log('    ok  y son los ' + total + ' que iban, ni uno más');

// Y el más fuerte de todos: el archivo nuevo tiene que ser el viejo SIN los rangos.
// O sea: todo renglón que quedó tiene que estar en el viejo, y en el mismo orden.
const enElViejo = new Set(lineas0);
const acompanados = resto.filter((l) => !enElViejo.has(l));
if (acompanados.length) {
  console.log('  *** HAY ' + acompanados.length + ' RENGLONES QUE NO ESTABAN EN "app.js" ***');
  acompanados.slice(0, 6).forEach((l) => console.log('      ' + l.slice(0, 80)));
  console.log('    No se escribe nada.');
  process.exit(1);
}
console.log('    ok  y todo lo que quedó estaba antes, palabra por palabra');

const l1 = llavesDe(app0);
const l2 = llavesDe(app);
if (l1[0] - l2[0] !== quitadas[0] || l1[1] - l2[1] !== quitadas[1]) {
  console.log('  *** CAMBIÓ LA CANTIDAD DE LLAVES DE "app.js" ***');
  console.log('    antes ' + l1[0] + '/' + l1[1] + ', ahora ' + l2[0] + '/' + l2[1]);
  console.log('    se esperaban ' + quitadas[0] + ' y ' + quitadas[1] + ' menos.');
  process.exit(1);
}
console.log('    ok  llaves de "app.js": ' + l1[0] + ' -> ' + l2[0] + ', ' + quitadas[0] + ' menos de cada una');

// Y la PROFUNDIDAD, releyendo el archivo.
//
// Y el invariante NO es "que termine en cero", sino "que no cambie".
//
// Y eso porque "js/app.js" ya tenía, antes de tocarlo, un "}" más que "{": 3543 contra
// 3544. No es que esté roto: es que hay una llave de más dentro de una cadena o de un
// comentario con una forma rara, y este contador salta comentarios pero no cadenas.
//
// Y si el invariante fuera "terminar en cero", el guion pararía siempre, y nadie iría a
// mirar si el archivo estaba roto de verdad. Un guardia que siempre dice que no no vigila
// nada.
function profundidadDe(txt) {
  let prof = 0;
  let enCom = false;
  for (let i = 0; i < txt.length; i++) {
    if (!enCom && txt[i] === '/' && txt[i + 1] === '*') { enCom = true; i++; continue; }
    if (enCom && txt[i] === '*' && txt[i + 1] === '/') { enCom = false; i++; continue; }
    if (enCom) continue;
    if (txt[i] === '{') prof++;
    if (txt[i] === '}') prof--;
    if (prof < 0) return prof;
  }
  return prof;
}

const profAntes = profundidadDe(app0);
const profDespues = profundidadDe(app);

console.log('    profundidad de "app.js": ' + profAntes + ' antes, ' + profDespues + ' ahora');
if (profAntes !== profDespues) {
  console.log('  *** LA PROFUNDIDAD CAMBIÓ ***');
  console.log('    Un corte de rangos con llaves parejas no puede cambiarla.');
  console.log('    No se escribe nada.');
  process.exit(1);
}
console.log('    ok  y no cambió. Que no llegue a cero es cosa del archivo, no del corte.');

// -------------------------------------------------------------------
// 7. LOS NOMBRES DECLARADOS, Y QUE NO SE REPITAN ENTRE LOS DOS ARCHIVOS
// -------------------------------------------------------------------
// Y esto es lo que más puede romper: dos "const" con el mismo nombre en el ámbito global.
const nombresDe = (texto) => {
  const salida = new Set();
  texto.split(/\r?\n/).forEach((l) => {
    if (l.indexOf(' ') === 0 || l.indexOf('\t') === 0) return;
    const m = l.match(/^(?:const|let|var|function|async\s+function|class)\s+([A-Za-z_$][\w$]*)/);
    if (m) salida.add(m[1]);
  });
  return salida;
};

const delViejo = nombresDe(app);
const delNuevo = nombresDe(nuevo);
const repetidos = [...delNuevo].filter((n) => delViejo.has(n));

if (repetidos.length) {
  console.log('  *** ' + repetidos.length + ' NOMBRES QUEDARÍAN DECLARADOS DOS VECES ***');
  repetidos.slice(0, 20).forEach((n) => console.log('      ' + n));
  console.log('    Dos "const" con el mismo nombre en el ámbito global es un error.');
  process.exit(1);
}
console.log('    ok  ninguno de los ' + delNuevo.size + ' nombres del núcleo queda en los dos archivos');

// -------------------------------------------------------------------
// 8. EL "<script>", Y EN SU LUGAR
// -------------------------------------------------------------------
const ANCLA = '<script src="../js/componentes/escaner.js?v=1"></script>';
if (html0.split(ANCLA).length - 1 !== 1) {
  console.log('  *** EL ANCLA DEL "<script>" NO ESTÁ UNA VEZ Y SOLA ***');
  process.exit(1);
}

// Y va ANTES que el escáner, que es lo que hace que el escáner siga viendo el estado.
let html = html0.replace(ANCLA, LINK + NL + ANCLA);

if (html.indexOf(LINK) > html.indexOf(ANCLA)) {
  console.log('  *** EL "<script>" DEL NÚCLEO NO QUEDÓ ANTES DEL ESCÁNER ***');
  process.exit(1);
}
if (html.indexOf(LINK) < html.indexOf('<script src="../js/app.js?v=1"></script>')) {
  console.log('    ok  "nucleo.js" queda antes de "escaner.js" y de "app.js"');
} else {
  console.log('  *** EL "<script>" DEL NÚCLEO NO QUEDÓ ANTES DE "app.js" ***');
  process.exit(1);
}

// Y que el "<head>" siga entero.
if (html.split('<head>').length - 1 !== 1) {
  console.log('  *** EL "<head>" NO ESTÁ ENTERO ***');
  process.exit(1);
}

// -------------------------------------------------------------------
// 9. ESCRIBIR, Y COMPROBAR DEL DISCO
// -------------------------------------------------------------------
fs.writeFileSync(NUEVO, nuevo, 'utf8');
fs.writeFileSync(APPJS, app, 'utf8');
fs.writeFileSync(APPHTML, html, 'utf8');

[APPJS, NUEVO].forEach((p) => {
  const r = cp.spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.log('  *** ' + path.basename(p) + ' NO COMPILA ***');
    console.log('    ' + (r.stderr || '').split('\n').slice(0, 5).join('\n    '));
    process.exit(1);
  }
});
console.log('    ok  los dos archivos escritos compilan, leyéndolos del disco');

const cuenta = (s) => s.split(/\r?\n/).length;
console.log('');
console.log('    ok  escrito "js/nucleo.js", ' + cuenta(nuevo) + ' renglones');
console.log('    ok  "js/app.js": ' + cuenta(app0) + ' -> ' + cuenta(app) + ' renglones');
console.log('');
console.log('    Y FALTA LO IMPORTANTE: abrir la copia y que la aplicación arranque de verdad.');
console.log('    Una "const" repetida, o una llamada de nivel superior que se quedó sin su');
console.log('    módulo, se ven en el navegador y no se ven leyendo el archivo.');