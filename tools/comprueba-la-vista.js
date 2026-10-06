// ===================================================================
// COMPRUEBA-LA-VISTA: QUE EL HTML Y EL JS ESTEN DE ACUERDO
// ===================================================================
//
// Corre:  node tools/comprueba-la-vista.js
//
// ---------------------------------------------------------------------
// QUE FALLA Y COMO
// ---------------------------------------------------------------------
//
// Una vista nueva se rompe casi siempre por acá: un "getElementById" que
// devuelve null porque el id no existe en el HTML. Y eso NO da error al cargar
// la pagina. Da error cuando la persona aprieta el botón, en la mitad de una
// tarea, y el mensaje es "Cannot read properties of null".
//
// O al reves: un id en el HTML que nadie lee. Eso es peor, porque no da ningún
// error: el filtro está a la vista, se le escribe, y no filtra nada.
//
// ---------------------------------------------------------------------
// POR QUE ESTA SEPARADO Y NO DENTRO DE COMPRUEBA-CODIGOS
// ---------------------------------------------------------------------
//
// Porque mira una cosa distinta: los otros miran si el código está bien escrito.
// Este mira si el código y el HTML hablan el mismo idioma. Y tiene que mirar
// TODOS los archivos de javascript, no uno: las funciones estan repartidas entre
// "nucleo.js", "administracion.js" y los de cada vista, y buscar en uno solo da
// 162 funciones que no existen, cuando en realidad todas estan.
//
// ---------------------------------------------------------------------
// LO QUE NO COMPRUEBA
// ---------------------------------------------------------------------
//
// Que el id exista en el HTML: eso no se puede saber leyendo archivos, porque
// el HTML de las vistas se arma por javascript. Lo que se comprueba es al reves:
// que el JS no pida un id que el HTML no tiene, y que toda funcion que el HTML
// llama con "onclick" esté definida en algun archivo.

const fs = require('fs');
const path = require('path');
const R = __dirname.replace(/[\\/]tools$/, '') + '/';

function leer(ruta) {
  try { return fs.readFileSync(R + ruta, 'utf8'); }
  catch (e) { return ''; }
}

// ---------------------------------------------------------------------
// 1. TODO EL JAVASCRIPT DEL PROYECTO, JUNTO
// ---------------------------------------------------------------------
// Y POR QUE SE LEEN LOS ARCHIVOS QUE "app.html" CARGA, Y NO TODOS
//
// Porque leer todos los ".js" del proyecto mezcla los que se usan con los que
// no. En este repositorio hay archivos "_arnas-*.html" y "tools/pruebas/*.html"
// que son de unas funciones viejas: no los carga nadie. Y hay funciones que
// piden ids que no existen en ninguna pagina, de cosas que ya se sacaron.
//
// Cuando se leyeron todos: 29 ids falsos. Y un guardian que reporta 29 cosas
// buenas entrena a que lo ignoren, que es peor que no tener guardian.
//
// La lista real sale del "<script src=...>" del HTML. Se lee de ahi, asi que si
// manana se agrega un archivo a la pagina, entra solo, y si se saca, sale solo.
// Y no hay lista escrita que se pueda quedar vieja.

// Y LA PAGINA QUE MANDA
const PAGINA = leer('pages/app.html');

// Y LOS SCRIPTS LOCALES, EN ORDEN
const RE_SCRIPT = /<script[^>]*\ssrc="([^"]+)"/g;
const scriptsLocales = [];
let m0;
while ((m0 = RE_SCRIPT.exec(PAGINA)) !== null) {
  const src = m0[1];
  // Los que van a un CDN no son nuestros: no se pueden leer.
  if (/^https?:/.test(src)) continue;
  // Y EL "?v=113" NO ES PARTE DEL NOMBRE
  //
  // Sin esto se leeria "nucleo.js?v=113", que no existe, y el archivo se
  // contaria como faltante. Se limpia antes de buscarlo.
  const limpio = src.split('?')[0].replace(/^\.\.\//, '');
  scriptsLocales.push(limpio);
}

const JS = scriptsLocales.map(leer).join('\n');

// Y EL HTML: solo la pagina que manda, mas las que hay junto a ella
const HTML = [leer('pages/app.html'), leer('pages/plantilla-contrato.html')].join('\n');

if (!scriptsLocales.length) {
  console.log('');
  console.log('  *** no se encontro ningun script local en pages/app.html. El guardian no puede comparar.');
  process.exit(1);
}

// ---------------------------------------------------------------------
// Y EL PROBLEMA DE LEER SOLO EL HTML, QUE SALIO MEDIDO
//
// El primer Guardian reporto 29 ids que "el HTML no tiene". Se reviso uno por
// uno y NINGUNO era real:
//
//   ayudaColumnas        lo crea administracion.js con "caja.id = 'ayudaColumnas'"
//   permisosAviso        lo crea soporte.js con "div.id = 'permisosAviso'"
//   kitAddItem           esta dentro de un "innerHTML" con una plantilla
//   invEnlace            idem
//   idcard, camModal     son clases de CSS, no ids
//
// O sea: muchisimas partes de esta pagina las ARMA el javascript. Un id que
// se crea con "innerHTML" o con "elemento.id =" no aparece jamas en el HTML,
// porque todavia no existia cuando se leyo el archivo.
//
// Por eso el guardiano no se queda con el HTML: busca tambien en el JS. Y un
// id tiene que estar en UNO DE LOS DOS LADOS.
//
// Y ESO NO DEJA DE SER UN FALSO POSITIVO POSIBLE
//
// Un id puede no estar en ninguno de los dos y aun asi funcionar, si se crea
// con un nombre armado por concatenacion. Eso no se puede ver leyendo archivos.
// Por eso el reporte dice "revisar", y no "esto esta roto".

// 2. LOS IDS QUE EL JS PIDE
// ---------------------------------------------------------------------
// Y SOLO LOS QUE ESTAN EN UNA FORMA QUE SE PUEDE BUSCAR
//
// "getElementById('algo')". No se buscan los ids que se arman con una variable:
// ahi no hay forma de saber que va a pedir, y adivinar es peor que no comprobar.
const PIDE_ID = /getElementById\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)/g;

let m;
const piden = new Set();
while ((m = PIDE_ID.exec(JS)) !== null) piden.add(m[1]);

// Y POR QUE NO SE BUSCA EL ID DENTRO DEL JS ENTERO
//
// Porque el "getElementById" ES la busqueda: si se busca el nombre en el JS
// entero, siempre aparece, porque el nombre aparece en la propia llamada. Eso
// daria verde siempre, que es peor que no comprobar.
//
// Lo que hay que buscar es donde se CREA el id: un 'id="' ... '"' dentro de una
// cadena que se vuelca con "innerHTML", o un "algo.id = 'nombre'". No el
// getElementById.
const CREA_ID = /id\s*=\s*["'`]([a-zA-Z0-9_\-]+)["'`]/g;
const Asigna_ID = /\.id\s*=\s*["'`]([a-zA-Z0-9_\-]+)["'`]/g;

const creados = new Set();
let mc;
while ((mc = CREA_ID.exec(JS)) !== null) creados.add(mc[1]);
while ((mc = Asigna_ID.exec(JS)) !== null) creados.add(mc[1]);

const faltan = [];
[...piden].sort().forEach(function (id) {
  if (HTML.indexOf('id="' + id + '"') >= 0) return;
  if (HTML.indexOf("id='" + id + "'") >= 0) return;
  if (creados.has(id)) return;
  faltan.push(id);
});

// ---------------------------------------------------------------------
// 3. LAS FUNCIONES QUE EL HTML LLAMA CON ONCLICK
// ---------------------------------------------------------------------
const ONCLICK = /on(?:click|input|change|keydown|keyup|keypress|submit|focus|blur)="([a-zA-Z_][a-zA-Z0-9_]*)\(/g;
const llama = new Set();
while ((m = ONCLICK.exec(HTML)) !== null) llama.add(m[1]);

// Y LAS PALABRAS QUE SON JAVASCRIPT, NO NOMBRES DE FUNCION
//
// El HTML tiene esto, que es valido y funciona:
//
//     onkeydown="if(event.key==='Enter')doScan()"
//
// El "if(" no es una funcion: es un enunciado. Y el guardian lo reportaba
// como "el HTML llama a if(), que no existe". Es un falso positivo, y uno que
// hace ruido.
//
// Se descartan las palabras reservadas, que son pocas y se conocen. Es una
// lista, no un analisis: no se intenta adivinar que es codigo.
const RESERVADAS = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof',
  'await', 'function', 'do', 'else', 'try', 'void', 'new']);

const sinDefinir = [];
[...llama].sort().forEach(function (f) {
  if (RESERVADAS.has(f)) return;
  if (new RegExp('function\\s+' + f + '\\s*\\(').test(JS)) return;
  if (new RegExp('\\b' + f + '\\s*=\\s*(function|async)').test(JS)) return;
  if (new RegExp('(?:const|let|var)\\s+' + f + '\\s*=').test(JS)) return;
  sinDefinir.push(f);
});

// ---------------------------------------------------------------------
// 4. EL REPORTE
// ---------------------------------------------------------------------
console.log('');
console.log('  ids que el js pide: ' + piden.size + '   funciones que el html llama: ' + llama.size);

if (!faltan.length && !sinDefinir.length) {
  console.log('');
  console.log('  ok  el html y el js estan de acuerdo: existe todo id que el js pide,');
  console.log('      y toda funcion que el html llama esta definida.');
  process.exit(0);
}

console.log('');
if (faltan.length) {
  console.log('  *** ' + faltan.length + ' id(s) que el JS pide y el HTML no tiene.');
  console.log('      Un "getElementById" de esto devuelve null, y no falla al cargar:');
  console.log('      falla cuando alguien aprieta el boton.');
  faltan.forEach(x => console.log('        getElementById("' + x + '")'));
  console.log('');
}
if (sinDefinir.length) {
  console.log('  *** ' + sinDefinir.length + ' funcion(es) que el HTML llama y no estan definidas.');
  sinDefinir.forEach(x => console.log('        ' + x + '()'));
}
console.log('');
process.exit(1);