// EL GUARDIÁN DE LAS VERSIONES, QUE AHORA DESCUBRE Y NO SUPONE
// ============================================================
//
// -------------------------------------------------------------------
// EL AGUARDIÁN ANTECEDENTE MENTÍA
// -------------------------------
//
// El guion anterior llevaba una lista escrita a mano de los archivos que se versionan:
//
//     DE_ESTE = /(?:css\/(?:base|tokens|...)\.css|css\/componentes\/(?:tarjeta|porteria|totem)\.css|...)/g
//
// Y esa lista no tenía a "css/componentes/plantillas.css", que es de ESTE refactor.
//
// El resultado: "plantillas.css" se quedó en "?v=6" mientras todo lo demás subió a "?v=18",
// y el guardiáncompleto imprimió:
//
//     ok  y no queda ninguno de este refactor sin subir
//
// Y no era verdad. Porque el que comprobaba la lista era la misma lista que se había quedado
// corta: si el archivo no está en la lista, no hay nada que comprobar, y eso sale igual que
// "está todo bien". Ver [cache-04].
//
// Es el mismo error que ya tenía una vez este guion, con los grupos de captura: un informe
// que mira el lugar equivocado es peor que no mirar, porque hace perder el rato buscando un
// problema que ya se arreglado.
//
// -------------------------------------------------------------------
// Y POR QUÉ SE CAMBIA A DESCUBRIR
// --------------------------------
//
// Porque una lista escrita a mano hay que acordarse de ampliarla cada vez que se crea un
// archivo, y la lista es la que decide qué se comprueba. Si el que decide y el que
// comprueba son el mismo, un archivo nuevo es invisible hasta que alguien se da cuenta.
//
// Ahora la lista sale del disco: se listan "css/" y "js/", y se comprueba que cada uno de
// esos archivos que esté enlazado en "app.html" tenga la versión. Un archivo nuevo entra solo,
// sin que nadie se acuerde.
//
// -------------------------------------------------------------------
// Y POR QUÉ AHORA SE VERSIONAN LOS "PREVIOS"
// -------------------------------------------
//
// La regla anterior era: "los archivos que ya existían antes no se tocan, son de otra gente".
// Y con "css/styles.css" y "css/movil.css" eso es falso: los dos los editó este refactor
// —"styles.css" bajó de 7.882 a 3.961 líneas— y sin versión no llegan nunca.
//
// El costo de ponerles versión es uno: se vuelven a pedir una vez por subida. El costo de
// no ponerla es otro: un cambio puede no llegar nunca, y no da ningún error. Ver [cache-05].
//
const fs = require('fs');
const path = require('path');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';

// -------------------------------------------------------------------
// Y EL HTML QUE MIRA SE PUEDE APUNTAR A OTRO, PARA PODER PROBARLO
// -------------------------------------------------------------------
//
// Por lo mismo que "comprueba-codigos.js" y "comprueba-rutas.js": para comprobar que el
// guardián MUERDE hay que meterle el defecto, y hay que meterlo en una COPIA. Si se le
// mete al archivo de verdad, y algo se corta en el medio, "app.html" queda a medias y
// nadie se entera hasta que alguien lo abre.
//
// Y el aviso va en la salida, diciendo qué archivo se está leyendo. Una puerta trasera sin
// cartel es una puerta trasera.
const ALVO = process.env.HTML_PROBETA || (RAIZ + 'pages/app.html');
const ES_PRUEBA = !!process.env.HTML_PROBETA;
// -------------------------------------------------------------------
// ESTE GUION SOLO ARREGLA SI SE LE PIDE. SIN NÚMERO, SOLO MIRA.
//
// -------------------------------------------------------------------
// Antes decía:
//
//     const NUEVA = process.argv[2] || '1';
//
// Y eso convertía al GUARDIÁN en el que arregla. Correrlo para comprobar —que es lo que
// uno hace siempre, antes de commitear— le ponía "?v=1" a los 26 archivos de "app.html",
// y el archivo que estaba en v29 quedaba en v1.
//
// Y no es un error visible: el guion decía "ok" y el mensaje de salida incluso Farewell
// "v29 -> v1" como si fuera lo que se le pidió. Roto, y de paso, borro el estado.
//
// Un guardián que reescribe lo que está comprobando no se puede correr dos veces, y
// un guardián que no se puede correr sin miedo no se corre. Y el que no se corre
// deja de estorbar, y a la vez es el que se suponia que atajaba este problema.
//
// Ahora: sin argumento no escribe NADA y solo informa. Con argumento, sube a ese número.
// Ver [cache-06].
//
const PEDIDA = process.argv[2];
const SOLO_MIRA = !PEDIDA || !/^\d+$/.test(String(PEDIDA));
const NUEVA = PEDIDA || '1';

// -------------------------------------------------------------------
// DESCUBRIR, NO SUPONER
// -------------------------------------------------------------------
function archivosDe(carpeta, salida) {
  salida = salida || [];
  const llena = path.join(RAIZ, carpeta);
  if (!fs.existsSync(llena)) return salida;
  fs.readdirSync(llena, { withFileTypes: true }).forEach((e) => {
    const rel = carpeta + '/' + e.name;
    if (e.isDirectory()) {
      // Y "componentes" adentro de "css" y de "js", y los "_" son copias de trabajo.
      if (e.name.charAt(0) === '_') return;
      archivosDe(rel, salida);
    } else if (/\.(css|js)$/.test(e.name)) {
      salida.push(rel);
    }
  });
  return salida;
}

const CARPETAS_LOCALES = ['css', 'js', 'config', 'models', 'controllers', 'views'];
const LOCALES = CARPETAS_LOCALES.reduce(function (a, c) { return a.concat(archivosDe(c)); }, []);

if (LOCALES.length < 15) {
  console.log('  *** SE DESCUBRIERON SOLO ' + LOCALES.length + ' ARCHIVOS, SE ESPERABAN MAS ***');
  console.log('    Sin la lista completa, la comprobación no cubre nada.');
  process.exit(1);
}

let t = fs.readFileSync(ALVO, 'utf8');
const NL = t.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

// -------------------------------------------------------------------
// SUBIR
// -------------------------------------------------------------------
const cambiados = [];
LOCALES.forEach((archivo) => {
  // Con "escape" en el nombre, porque un "archivo" puede traer "." que en una expresión
  // regular es "cualquier carácter". Y con los grupos adentro "(?:...)" a propósito: con
  // grupos de captura, el número del grupo no es el número de versión.
  const esc = archivo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('((?:href|src)="\\.\\./' + esc + ')(\\?v=(\\d+))?(")', 'g');
  if (!re.test(t)) return;                       // no está enlazado: no se toca
  re.lastIndex = 0;
  // Y el número viejo se saca del enlace, antes de reescribirlo: dentro del "replace" solo
  // vive durante la llamada, y afuera no existe.
  const antes = (t.match(new RegExp('(?:href|src)="\\.\\./' + esc + '\\?v=(\\d+)"')) || [])[1];

  // Y si ya está en esta versión, no se cuenta como cambio. Sin esto el informe decía
  // "subidos a v19 (26)" con veintiséis líneas de "v19 -> v19", que es ruido: el que lo lee
  // no sabe si cambió algo o no, y termina sin leer el final, que es donde está la
  // comprobación buena. Ver [cache-16].
  if (antes === NUEVA) return;

  // Y ESTA ES LA LÍNEA QUE FALTABA.
  //
  // Si no se le pidió un número, no se reescribe NADA. Se sigue mirando o no, pero
  // "cambiados" queda vacío y el archivo no se escribe.
  //
  // Sin esto, el guardián que se corre para COMPROBAR antes de commitear era el mismo que
  // bajaba las 26 referencias a "?v=1". Y como además el mensaje de salida dizia "ok", nadie
  // veía el daño hasta que la página pedía la versión vieja. Ver [cache-06].
  if (SOLO_MIRA) return;

  t = t.replace(re, (m, hasta) => hasta + '?v=' + NUEVA + '"');
  cambiados.push(archivo + '  (v' + (antes || 'SIN v') + ' -> v' + NUEVA + ')');
});

// -------------------------------------------------------------------
// COMPROBAR, Y QUE LA COMPROBACIÓN SEA DE OTRO TIPO
// -------------------------------------------------------------------
// Y no con el patrón que ya se usó, sino con el inverso: se busca una referencia local SIN
// versión. Si el patrón de comprobación fuera el mismo que el de escritura, entonces un
// error en el de escritura aparecería también en el de comprobación y los dos pasarían.
//
// Este es el punto entero del cambio: el guardián anterior se comprobaba a sí mismo.
const SIN = [];
// Y el patrón usa LA MISMA lista de carpetas que se descubrió arriba, y no una escrita a
// mano con "css|js".
//
// Y esa diferencia era un agujero: "app.html" enlaza "views/asistencia/asistencia.css" y
// "config/auth.js", y con el patrón viejo —que solo miraba "css/" y "js/"— un archivo de
// "views/" o de "config/" SIN "?v=" pasaba el guardián en verde.
//
// O sea que la comprobación no fallaba por un archivo mal versionado: no miraba. Y el mismo
// guion seSEGURABA de que el archivo no se perdiera, con una lista escrita a mano que ya
// estaba vieja. Las dos listas manualizadas, en el mismo guion.
const RE_SIN = new RegExp('(?:href|src)="(\\.\\./(?:' + CARPETAS_LOCALES.join('|') + ')/[^"?]+)"', 'g');
let m;
while ((m = RE_SIN.exec(t)) !== null) {
  const rel = m[1].replace('../', '');
  if (LOCALES.indexOf(rel) >= 0) SIN.push(rel);
}

if (SIN.length) {
  console.log('');
  console.log('  *** ESTAS REFERENCIAS NO TIENEN VERSION ***');
  Array.from(new Set(SIN)).forEach((x) => console.log('      ' + x));
  console.log('    Un archivo sin "?v=" no llega nunca al navegador. Ver [cache-05].');
  process.exit(1);
}
console.log('');
console.log('    ok  ninguna referencia local sin versión');

// Y que esten TODOS los del disco enlazados. Un archivo en disco que no está enlazado es un
// archivo muerto, y se reporta aparte porque es otro problema: no es caché, es que no se usa.
const NO_ENLAZADOS = LOCALES.filter((a) => t.indexOf('../' + a) < 0);
if (NO_ENLAZADOS.length) {
  console.log('');
  console.log('    ojo  en disco pero NO enlazados en app.html: ' + NO_ENLAZADOS.join(', '));
  console.log('    No es un error de caché. Puede que se carguen desde otro archivo.');
}

// -------------------------------------------------------------------
// Y QUE NO SE ROMPIERA NADA
// -------------------------------------------------------------------
if (cambiados.length) fs.writeFileSync(ALVO, t, 'utf8');

console.log('');
if (cambiados.length) {
  console.log('    subidos a v' + NUEVA + ' (' + cambiados.length + '):');
  cambiados.forEach((x) => console.log('      ' + x));
} else {
  console.log('    nada nuevo que subir: ya estaba todo en v' + NUEVA);
}

const RAW = fs.readFileSync(ALVO, 'utf8');

// -------------------------------------------------------------------
// Y QUE CADA ENLACE LOCAL APUNTE A UN ARCHIVO QUE EXISTA
// -------------------------------------------------------------------
//
// Y ANTES esta comprobación era una lista escrita a mano de los "<script>" que tienen que
// seguir ahí:
//
//     ['../js/auth.js', '../js/theme.js', '../js/clima-reloj.js', ...]
//
// Y esa lista se quedó vieja el día que los módulos se movieron a carpetas: "auth.js"
// pasó a ser "config/auth.js", y el guardián cantó "DESAPARECIÓ ../js/auth.js" en un
// proyecto donde no faltaba nada.
//
// O sea que anunciaba una_rotura con el nombre del archivo viejo. Y eso es peor que no
// comprobar: un guardián que avisa de algo que no se rompió enseña a ignorar sus avisos, y
// el próximo "DESAPARECIÓ" se lee como ruido.
//
// Y la razón de fondo es la misma de arriba, y ya sale DOS VECES en este guion: una lista
// escrita a mano hay que acordarse de ampliarla, y la lista es la que decide qué se
// comprueba. Si el que decide y el que comprueba son el mismo, lo nuevo es invisible.
//
// Lo que se comprueba acá no es "estos ocho tienen que estar" sino lo que REALMENTE importa:
//
//     todo enlace local de app.html tiene que existir en el disco
//
// Y eso no se puede quedar viejo: se lee el HTML, se saca cada ruta, y se mira.
//
// Y hay una diferencia importante con la lista: una lista exige NOMBRES. Esto acepta CUALQUIER
// archivo nuevo sin que nadie se acuerde de agregarlo, que es lo mismo que ya hace el
// descubrimiento de arriba.
const REFERENCIAS = (RAW.match(/(?:href|src)="([^"]+)"/g) || [])
  .map((x) => x.replace(/^(?:href|src)="/, '').replace(/"$/, ''));

const rotas = [];
REFERENCIAS.forEach((x) => {
  // Las que no son del proyecto: direcciones de internet, anclas, datos en línea.
  if (/^(?:https?:)?\/\//.test(x)) return;
  if (x.charAt(0) === '#') return;
  if (/^(?:data|mailto|tel|javascript):/i.test(x)) return;
  if (x === '') return;
  // Y se le saca la versión antes de buscar el archivo: "../config/auth.js?v=58" es el
  // archivo "../config/auth.js", y buscarlo con el "?v=58" pegado da que no existe SIEMPRE
  // —o sea que sin esta línea el guardián sería rojo desde el primer día—.
  const rel = x.split('?')[0].split('#')[0];
  if (rel === '') return;
  // Y la ruta es relativa al HTML que la lleva, que está en "pages/". Resolverla desde la
  // raíz del repositorio daría "../config/auth.js" desde adentro de "pages/", que existe.
  const absoluto = path.resolve(path.dirname(ALVO), rel);
  if (!fs.existsSync(absoluto)) rotas.push(x);
});

if (rotas.length) {
  console.log('');
  console.log('  *** ' + rotas.length + ' ENLACE(S) LOCALES QUE NO APUNTAN A NINGÚN ARCHIVO ***');
  rotas.forEach((x) => console.log('      ' + x));
  console.log('    La página los pide, el servidor no los tiene, y sale un 404 en la consola.');
  console.log('    No hay lista de nombres: sale del HTML, así que no se puede quedar viejo.');
  if (ES_PRUEBA) console.log('    *** con un HTML DE PRUEBA ***');
  process.exit(1);
}
console.log('    ok  y los ' + REFERENCIAS.length + ' enlaces de app.html, los '
  + REFERENCIAS.filter((x) => /^\.\.\//.test(x)).length + ' del proyecto, existen todos');

// Y los "<script>" de CDN siguen igual: si se les toca el nombre, no cargan y no hay error
// visible, la página abre y no hace nada.
const CDN = ['qrcode.min.js', 'JsBarcode.all.min.js', 'xlsx.full.min.js',
 'html5-qrcode.min.js', 'html2canvas.min.js', 'jspdf.umd.min.js'];
const faltan = CDN.filter((x) => RAW.indexOf(x) < 0);
if (faltan.length) {
  console.log('');
  console.log('  *** FALTAN LIBRERAS DE CDN: ' + faltan.join(', ') + ' ***');
  process.exit(1);
}
console.log('    ok  y las 6 librerías de CDN siguen enlazadas');

if (RAW.indexOf('\r\n') >= 0 && NL !== '\r\n') {
  console.log('  *** CAMBIARON LOS SALTOS DE LÍNEA ***');
  process.exit(1);
}
console.log('    ok  y los saltos de línea siguen como estaban');

if (/[\u00c3][\u00a1-\u00ff]/.test(RAW)) {
  console.log('  *** MOJIBAKE ***');
  process.exit(1);
}
console.log('    ok  y sin mojibake');
console.log('');
console.log('    y ahora el guardián mira ' + LOCALES.length + ' archivos, y los cuenta desde el disco');
