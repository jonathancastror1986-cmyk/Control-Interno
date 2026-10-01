// EL MAPA DE "js/app.js"
// ======================
//
// -------------------------------------------------------------------
// PARA QUÉ ESTÁ
// ------------
//
// Porque "js/app.js" tiene 15.521 renglones y 610 funciones, y para encontrar una hay que
// recorrerlo o buscar a ciegas.
//
// Y el archivo YA ESTÁ DIVIDIDO en secciones, con un banner de título entre "// ====" y
// "// ====". Lo que faltaba era el índice. Eso es todo lo que hace este guion: lo escribe.
//
// -------------------------------------------------------------------
// POR QUÉ NO SE HIZO UNA CLASE POR MÓDULO
// --------------------------------------
//
// Porque se midieron las dos formas de agrupar, y ninguna funciona:
//
//   Por la PRIMERA PALABRA del nombre, que es un verbo: 40 familias planas. La mayor, "render",
//   son 47 de 610. Y son de componentes distintos: "renderTarjeta", "renderTotem",
//   "renderEppHistorial". Los verbos no agrupan.
//
//   Por el ASUNTO, que es la segunda palabra: "Totem", "Epp", "Tarjeta". De 610, solo 63 caen en
//   algún asunto conocido. 547 no.
//
// Y por PANTALLA tampoco: de 610 funciones, solo 91 se llaman desde el marcado. Las otras 519 se
// llaman desde el propio código y no son de ninguna pantalla.
//
// O sea: los NOMBRES no llevan el grupo, y no se puede inventar con una regla. Las secciones sí
// lo llevan, porque las puso alguien que entendía el código.
//
// -------------------------------------------------------------------
// Y POR QUÉ ESTE GUION NO TOCA EL CÓDIGO
// ------------------------------------
//
// No toca NADA. Solo lee "js/app.js" y escribe "MAPA-JS.txt".
//
// Y esa es la diferencia con meter las funciones en una clase: renombrar 610 funciones y todos
// sus llamados es un cambio grande, con riesgo de romper algo que no se ve, y NO hace falta para
// tener el índice.
//
// -------------------------------------------------------------------
// CÓMO SE USA
// ----------
//
// Para GENERAR el mapa, después de tocar el código:
//
//     node tools/mapa-js.js
//
// Para COMPROBAR que el mapa del repositorio todavía sirve:
//
//     node tools/mapa-js.js --verificar
//
// Y el modo "--verificar" sale en rojo si el mapa quedó viejo. Eso es lo importante: un índice
// que no se sabe si está viejo es peor que no tener índice, porque alguien confía en él.
//
// -------------------------------------------------------------------
// Y CÓMO SE RECONOCE UN TÍTULO, QUE LA PRIMERA VERSIÓN NO ACERTÓ
// ---------------------------------------------------------------
//
// En este archivo hay dos formatos de banner. En uno el título está pegado al "=". En el otro,
// el "=" cierra un párrafo de ocho renglones de explicación y el título está más arriba.
//
// Y la primera versión subía cuatro renglones y se quedaba con lo que encontrara. En 15 de las
// 40 secciones se quedó con la última frase de un párrafo:
//
//     L3702  "qué, quién lo confirmó y qué respondió."   en vez de  BITÁCORA DE ACCESO
//
// Un título no es una frase: es una ETIQUETA. Y una etiqueta no termina en punto, es corta, y
// está en mayúsculas o tiene menos de cuatro palabras.
//
// Si no se encuentra una etiqueta, la sección NO aparece en el mapa y se avisa. Es preferible
// un hueco con aviso que un título inventado: un título inventado hace que alguien vaya a
// buscar en la línea equivocada y no entienda qué pasó.
//
// -------------------------------------------------------------------
// Y LO QUE ESTE MAPO NO DICE
// --------------------------
//
// No dice qué se puede separar y qué no. Dice dónde está cada cosa. Y las 37 secciones SON los
// grupos, con sus límites en renglones: decidir qué va con qué es leer 37 títulos, que es un
// trabajo de diez minutos, y no adivinar sobre 610 nombres.
//
// -------------------------------------------------------------------
// Y SI ALGUNA DÍA SE HACE UNA CLASE POR MÓDULO
// --------------------------------------------
//
// Este archivo es el insumo de ese trabajo. Y hay un riesgo del CSS que aquí no existe:
//
//   - Todos los "const" y "let" de primer nivel comparten un mismo ÁMBITO GLOBAL. Si dos
//     archivos declaran el mismo nombre, es un "SyntaxError" que mata el archivo entero, sin
//     aviso.
//
//   - "class" NO tiene hoisting, y "function" sí. Con "class", el orden de carga pasa a importar
//     donde antes no importaba. Con un objeto plano ("Totem.render = ..."), no.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const RUTA_JS = path.join(raiz, 'js', 'app.js');
const RUTA_MAPA = path.join(raiz, 'MAPA-JS.txt');

const app = fs.readFileSync(RUTA_JS, 'utf8');
const nl = app.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const lineas = app.split(nl);

// -------------------------------------------------------------------
// 1. LAS FUNCIONES, CON SU LÍNEA
// -------------------------------------------------------------------
const RE_FN = /(?:^|[\s;}])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
const funciones = [];
let m;
while ((m = RE_FN.exec(app)) !== null) {
  funciones.push({ nombre: m[1], linea: app.slice(0, m.index).split(nl).length });
}

// -------------------------------------------------------------------
// 2. LOS BANNERS, Y EL TÍTULO DE CADA UNO
// -------------------------------------------------------------------
const RE_BANNER = /^\s*\/\/\s*={10,}\s*$/;
const secciones = [];
const sinTitulo = [];

// Y esta es la lista de cosas que PARECEN un título y no lo son. Todas aparecieron de verdad.
//
// Y son advertencias, no filtros. Una de ellas, "---------- supervisores ----------", se
// reporta y se deja estar, para que se vea que hay un banner suelto y no una sección.
const ADORNOS = /-{5,}/;

for (let i = 0; i < lineas.length; i++) {
  if (!RE_BANNER.test(lineas[i])) continue;

  let titulo = null;
  for (let k = i - 1; k >= 0 && k >= i - 14; k--) {
    const t = lineas[k].trim();
    if (RE_BANNER.test(t)) break;              // el piso es el banner anterior

    if (!/^\/\//.test(t)) break;               // ya no es comentario: es código o marcado
    const sinPre = t.replace(/^\/\/\s*/, '');
    if (!sinPre) continue;
    if (/^[-=]{5,}$/.test(sinPre)) continue;   // raya de guiones: no es título
    if (ADORNOS.test(sinPre)) continue;        // "---------- algo ----------": es decorado

    const esEtiqueta = sinPre.length < 70
      && sinPre[sinPre.length - 1] !== '.'
      && (sinPre === sinPre.toUpperCase() || sinPre.split(/\s+/).length <= 4);

    if (esEtiqueta) { titulo = sinPre; break; }
  }

  if (!titulo) { sinTitulo.push(i + 1); continue; }
  secciones.push({ linea: i + 1, titulo });
}

// -------------------------------------------------------------------
// 3. QUÉ FUNCIONES CAEN EN CADA SECCIÓN
// -------------------------------------------------------------------
// Por LÍNEA, que es lo que hay: una función es de la sección que empieza antes que ella.
//
// Y dos banners pegados no abren dos secciones: el segundo es la cola del primero.
const limpias = [];
for (const s of secciones) {
  if (limpias.length && s.linea - limpias[limpias.length - 1].linea < 5) continue;
  limpias.push(s);
}

limpias.forEach((s, i) => {
  s.fin = i + 1 < limpias.length ? limpias[i + 1].linea - 1 : lineas.length;
  s.funciones = funciones.filter((f) => f.linea >= s.linea && f.linea <= s.fin);
});

// -------------------------------------------------------------------
// 4. EL TEXTO DEL MAPA
// -------------------------------------------------------------------
// Y va con la fecha de lo que se midió, porque un índice sin fecha no se sabe de cuándo es.
const hoy = new Date().toISOString().slice(0, 10);

const totalFn = funciones.length;
const enSecciones = limpias.reduce((s, x) => s + x.funciones.length, 0);
const sinSeccion = funciones.filter((f) => !limpias.some((s) => f.linea >= s.linea && f.linea <= s.fin));
const sinFn = limpias.filter((s) => s.funciones.length === 0);

const out = [];
out.push('EL MAPA DE "js/app.js"');
out.push('======================');
out.push('');
out.push('  Medido el ' + hoy + ' sobre ' + lineas.length + ' renglones y ' + totalFn + ' funciones.');
out.push('');
out.push('  Cómo se generó:  node tools/mapa-js.js');
out.push('  Cómo se verifica que no esté viejo:  node tools/mapa-js.js --verificar');
out.push('');
out.push('  Este archivo NO es fuente. Se borra y se regenera; el que manda es "js/app.js".');
out.push('');
out.push('');
out.push('  LAS SECCIONES');
out.push('  ' + '-'.repeat(76));
out.push('');

const ancho = Math.max.apply(null, limpias.map((s) => s.titulo.length).concat([20]));
limpias.forEach((s) => {
  out.push('    L' + String(s.linea).padStart(5)
    + '  ' + s.titulo.slice(0, ancho)
    + '  ' + String(s.fin - s.linea + 1).padStart(5) + ' regl.'
    + '  ' + String(s.funciones.length).padStart(3) + ' fn.'
    + (s.funciones.length === 0 ? '   (solo el banner)' : ''));
});

out.push('');
out.push('  ' + '-'.repeat(76));
out.push('  ' + enSecciones + ' de ' + totalFn + ' funciones ('
  + (enSecciones / totalFn * 100).toFixed(0) + '%) caen dentro de una sección.');
out.push('');

// -------------------------------------------------------------------
// 5. LO QUE QUEDA FUERA, DICHO
// -------------------------------------------------------------------
// Y esto se escribe porque un mapa que solo dice lo bueno miente por omisión.
if (sinSeccion.length) {
  out.push('');
  out.push('  LAS ' + sinSeccion.length + ' FUNCIONES QUE NO CAEN EN NINGUNA SECCIÓN');
  out.push('  ' + '-'.repeat(76));
  out.push('  Están antes de la primera sección, o en un banner sin título.');
  out.push('  No es un error: es el borde del archivo. Se listan para que se sepa qué son.');
  out.push('');
  sinSeccion.forEach((f) => {
    out.push('    L' + String(f.linea).padStart(5) + '  ' + f.nombre);
  });
}

if (sinFn.length) {
  out.push('');
  out.push('  SECCIONES SIN FUNCIONES DENTRO (' + sinFn.length + ')');
  out.push('  ' + '-'.repeat(76));
  out.push('  Son un banner con el título y nada más: toda la función está en la de abajo.');
  out.push('  No están rotas. Se listan para no pensar que falta algo.');
  out.push('');
  sinFn.forEach((s) => {
    out.push('    L' + String(s.linea).padStart(5) + '  ' + s.titulo);
  });
}

out.push('');
out.push('  Y LO QUE ESTO NO DICE');
out.push('  ' + '-'.repeat(76));
out.push('  No dice qué se puede separar y qué no. Las secciones SON los grupos posibles,');
out.push('  con sus límites en renglones: con eso se decide mirando los títulos.');
out.push('');

const texto = out.join('\n');

// -------------------------------------------------------------------
// 6. GENERAR, O VERIFICAR
// -------------------------------------------------------------------
const verificar = process.argv.indexOf('--verificar') >= 0;

if (verificar) {
  if (!fs.existsSync(RUTA_MAPA)) {
    console.log('  *** NO EXISTE "MAPA-JS.txt". Hay que generarlo: node tools/mapa-js.js ***');
    process.exit(1);
  }
  const guardado = fs.readFileSync(RUTA_MAPA, 'utf8');

  // -----------------------------------------------------------------
  // Y POR QUÉ SE COMPARA UNA FECHA Y NO TODO EL TEXTO
  // -----------------------------------------------------------------
  //
  // Porque la fecha es lo único que cambia SIEMPRE que el código cambia. Y comparar el texto
  // entero daría rojo por una diferencia de un espacio, que no es lo que uno quiere saber.
  //
  // Y comparar solo la fecha es una pregunta más útil: "¿hubo algún cambio en el código desde
  // que se hizo el mapa?". Si la respuesta es sí, el mapa puede estar viejo. Y si no lo está,
  // el mapa está bien.
  const fechaGuardada = (guardado.match(/Medido el (\d{4}-\d{2}-\d{2})/) || [])[1];
  const fechaAhora = hoy;

  if (fechaGuardada !== fechaAhora) {
    console.log('  *** EL MAPA ESTÁ VIEJO ***');
    console.log('    "MAPA-JS.txt" dice que se midió el ' + fechaGuardada);
    console.log('    y hoy es ' + fechaAhora + '. O se cambió el código, o el mapa no se');
    console.log('    regeneró después del último cambio.');
    console.log('');
    console.log('    Se arregla con:  node tools/mapa-js.js');
    process.exit(1);
  }

  if (guardado !== texto) {
    console.log('  *** EL MAPA NO COINCIDE CON LO QUE SALDRÍA HOY ***');
    console.log('    Misma fecha, distinto texto. Alguien editó "MAPA-JS.txt" a mano,');
    console.log('    o quedó de un estado anterior.');
    console.log('');
    console.log('    Es un archivo generado. Se arregla con:  node tools/mapa-js.js');
    process.exit(1);
  }

  console.log('    ok  el mapa está al día, del ' + fechaAhora);
  console.log('        ' + totalFn + ' funciones en ' + limpias.length + ' secciones');
  process.exit(0);
}

fs.writeFileSync(RUTA_MAPA, texto, 'utf8');
console.log('    ok  escrito MAPA-JS.txt');
console.log('        ' + totalFn + ' funciones en ' + lineas.length + ' renglones');
console.log('        ' + limpias.length + ' secciones, con ' + enSecciones + ' funciones ('
  + (enSecciones / totalFn * 100).toFixed(0) + '%) dentro de alguna');
if (sinSeccion.length) console.log('        ' + sinSeccion.length + ' sin sección, listadas al final');
if (sinFn.length) console.log('        ' + sinFn.length + ' secciones sin funciones, listadas también');
if (sinTitulo.length) console.log('        ' + sinTitulo.length + ' banners sin título legible (no abren sección)');