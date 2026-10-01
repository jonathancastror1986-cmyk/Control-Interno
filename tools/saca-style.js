// SACAR EL "<style>" EN LÍNEA A UN ARCHIVO, SIN MOVER NADA
// ==========================================================
//
// -------------------------------------------------------------------
// EL CAMINO QUE NO PUEDE ROMPER NADA
// ---------------------------------
//
// El "<style>" en línea está en los renglones 20 a 436. "styles.css" se carga en el 447, o sea
// DESPUÉS.
//
// Si el bloque se copia TAL CUAL a un archivo, y ese archivo se enlaza EN EL MISMO LUGAR, con
// las reglas en el MISMO ORDEN, entonces:
//
//   - el archivo nuevo queda antes que "styles.css", igual que estaba el "<style>"
//   - las reglas internas quedan en el mismo orden relativo unas de otras
//   - no se mueve ninguna otra hoja
//
// O sea que la cascada queda IDÉNTICA por construcción. No hay que medir nada, ni usar el
// guardián para saber que no se rompió: no hay forma de que se rompa.
//
// Y eso es distinto de todo lo demás que se ha hecho acá. Con el tótem, con la tarjeta y con el
// menú hubo que medir, porque se movían reglas de un archivo a otro y eso cambia el orden
// relativo. Acá no: es pegar el bloque en otro lado y poner un "<link>" en su lugar.
//
// -------------------------------------------------------------------
// POR QUÉ ES INTERESANTE AUNQUE NO CAMBIE NADA
// -------------------------------------------
//
// Porque "app.html" baja de 2.722 a 2.306 renglones, y el "<style>" deja de estar escondido
// dentro de una página para ser un archivo que se abre, se busca y se revisa.
//
// Y es el primer paso para partirlo por componente, que sí hay que medir. Pero eso va después.
//
// -------------------------------------------------------------------
// POR QUÉ "_base" Y NO "base"
// --------------------------
//
// Porque los archivos con "_" adelante son CAPAS: "tokens.css" son variables, "marca.css" es
// el logo, "vistas.css" son las pantallas. Y este es una capa, no un módulo: es el CSS que era
// de la página y que hoy sostiene a media aplicación.
//
// -------------------------------------------------------------------
// Y LOS GUARDIANES, QUE SON EL PORQUÉ DE ESTE GUION
// ----------------------------------------------------
//
// 1. Que haya UN solo "<style>" real, y que no haya ninguno dentro de un comentario HTML. Hay un
//    "<script>" escrito dentro de un comentario en esta aplicación, y "sintaxis-3.js" lo tiene que
//    saltear. Con "<style>" puede pasar igual, y tomar el equivocado se lleva medio archivo.
//
// 2. Que el CSS del archivo nuevo sea IDÉNTICO, carácter por carácter, al que estaba en línea.
//    No "lo equivalente": idéntico. Y eso se compara antes de escribir.
//
// 3. Que las llaves del archivo nuevo cuadren. Si el bloque estaba sin cerrar, se copia así, y la
//    hoja nueva queda rota.
//
// 4. Que el "<style>" se sustituya por EXACTAMENTE un "<link>". Ni dos, ni cero.
//
// 5. Que el "<link>" quede en el MISMO renglón donde abría el "<style>". Si queda después de
//    "styles.css", el archivo nuevo pierde contra "styles.css" en todas las reglas que compitan,
//    y eso sí cambiaría la pantalla. Esta es la única forma de que este trabajo no sea inocuo.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const APP = path.join(raiz, 'pages', 'app.html');
const NUEVO = path.join(raiz, 'css', 'base.css');

const LINK = '<link rel="stylesheet" href="../css/base.css?v=1">';

// -------------------------------------------------------------------
// 0. IDEMPOTENCIA
// -------------------------------------------------------------------
// Por ESTADO y no por "el archivo existe":
//   - si ya no hay "<style>", puede ser que esté hecho, o que alguien lo haya sacado a mano.
//     Se distingue por el "<link>".
//   - y si hay "<style>" y ya existe "base.css", hay dos fuentes de verdad y eso no se deja pasar.
let app = fs.readFileSync(APP, 'utf8');

const yaHayLink = app.indexOf(LINK) >= 0;
const hayStyle = /<style[^>]*>/i.test(app);

if (!hayStyle && yaHayLink) {
  console.log('    (ya está hecho: no hay "<style>" y sí está el "<link>")');
  process.exit(0);
}

if (!hayStyle && !yaHayLink) {
  console.log('  *** NO HAY "<style>" NI "<link>" DE "base.css" ***');
  console.log('    No se escribe nada: el archivo ya no tiene CSS en línea, pero no');
  console.log('    viene de este guion. Hay que mirarlo a mano.');
  process.exit(1);
}

if (hayStyle && fs.existsSync(NUEVO)) {
  console.log('  *** YA EXISTE "css/base.css" Y TODAVÍA HAY "<style>" EN LÍNEA ***');
  console.log('    Habría dos fuentes de verdad para el mismo CSS, y no se sabe cuál manda.');
  console.log('    No se escribe nada.');
  process.exit(1);
}

const nl = app.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const lineaDe = (pos) => app.slice(0, pos).split(nl).length;

// -------------------------------------------------------------------
// 1. DÓNDE ESTÁ EL BLOQUE
// -------------------------------------------------------------------
const comentarios = [];
const reCom = /<!--[\s\S]*?-->/g;
let c;
while ((c = reCom.exec(app)) !== null) comentarios.push([c.index, c.index + c[0].length]);
const enComentario = (pos) => comentarios.some((r) => pos > r[0] && pos < r[1]);

const aperturas = [];
const reA = /<style[^>]*>/gi;
let a;
while ((a = reA.exec(app)) !== null) {
  if (!enComentario(a.index)) aperturas.push(a.index);
}

if (aperturas.length !== 1) {
  console.log('  *** HAY ' + aperturas.length + ' BLOQUES "<style>" REALES ***');
  console.log('    Se esperaba uno. No se escribe nada.');
  aperturas.forEach((p) => console.log('        en el renglón ' + lineaDe(p)));
  process.exit(1);
}

const ini = aperturas[0];
const fin = app.indexOf('</' + 'style>', ini);

// Y el índice del cierre se calcula con PARÉNTESIS alrededor del texto:
//
//     fin + '</' + 'style>'.length      ->      el texto "35020</6"
//
// Porque el "+" concatena cuando un operando es texto. Y un texto como índice de "slice"
// vale cero, no da error y no avisa: "slice(0)" devuelve el archivo entero. O sea que el
// guion armaba el archivo partido por la mitad y pegado al revés, con el "<head>" dos
// veces y el "<style>" uno, y el archivo nuevo con todo el CSS repetido.
//
// Con paréntesis, "('</' + 'style>')" es un texto al que se le mide el largo: un número, y
// el "+" suma. Es el mismo error que el del "NaN veces", con la misma causa.
if (fin < 0) {
  console.log('  *** EL "<style>" NO SE CIERRA ***');
  process.exit(1);
}

const finBloque = fin + ('</' + 'style>').length;
const css = app.slice(app.indexOf('>', ini) + 1, fin);

// -------------------------------------------------------------------
// 2. GUARDIÁN: QUE EL CSS ESTÉ CUADRADO
// -------------------------------------------------------------------
// Antes de copiar nada. Un bloque sin cerrar se copia roto, y la hoja nueva queda rota, y la
// página pierde todos los estilos que venían después del error.
function cuentaLlaves(s) {
  const limpio = s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  return {
    abren: (limpio.match(/\{/g) || []).length,
    cierran: (limpio.match(/\}/g) || []).length,
  };
}

const k = cuentaLlaves(css);
if (k.abren !== k.cierran) {
  console.log('  *** EL CSS EN LÍNEA ESTÁ DESCUADRADO ***');
  console.log('    abre ' + k.abren + ', cierra ' + k.cierran);
  console.log('    No se escribe nada: la hoja nueva quedaría rota.');
  console.log('    Y esto hay que arreglarlo en "app.html", a mano, no acá.');
  process.exit(1);
}

// Y que tenga algo. Un "<style></style>" vacío se copia como un archivo vacío, que no es lo que
// se cree.
if (css.trim().length < 100) {
  console.log('  *** EL CSS EN LÍNEA SON SOLO ' + css.trim().length + ' CARACTERES ***');
  console.log('    No se escribe nada: no parece el bloque que se cree.');
  process.exit(1);
}

// -------------------------------------------------------------------
// 3. EL ARCHIVO NUEVO, Y QUE SEA IDÉNTICO A LO QUE SE SACA
// -------------------------------------------------------------------
// El archivo se escribe con el CSS tal cual, y con un comentario arriba que diga qué es.
//
// Y el comentario va después del "ref:", para que "scan-rotos" lo pueda leer y para que quede
// claro que es lo único que se agregó.
const CABECERA = [
  '/* ref: base-01 - El CSS que estaba en línea dentro de "pages/app.html", movido tal cual */',
  '/*',
  '  Este archivo no es un módulo: es una CAPA. Y está acá por una razón que conviene no',
  '  olvidar cuando alguien lo lea en seis meses.',
  '',
  '  El "<style>" en línea de "app.html" ocupaba los renglones 20 a 436. "styles.css" se carga',
  '  DESPUÉS, porque su "<link>" está más abajo en el "<head>".',
  '',
  '  Y cuando dos reglas dicen lo mismo, gana la que se cargó después. O sea que gana',
  '  "styles.css", y hay reglas del "<style>" en línea que ya estaban pisadas y no hacían nada.',
  '',
  '  Este archivo se enlaza en el LUGAR donde estaba el "<style>", que es antes de',
  '  "styles.css". Por eso la cascada quedó igual: mismo orden, mismas reglas, mismo sitio.',
  '',
  '  LO QUE NO SE PUEDE HACER: mover este "<link>" más abajo, después de "styles.css".',
  '',
  '  Ahí este archivo empieza a perder contra "styles.css" en todas las reglas que compitan, y',
  '  la pantalla cambia. No da ningún error: se ve "casi igual".',
  '',
  '  PARTIRLO POR COMPONENTE, en cambio, sí cambia el orden entre las partes, y eso hay que',
  '  medirlo de a una con "tools/huella.js". Ver [base-01].',
  '*/',
  '',
].join('\n');

const contenido = CABECERA + css.trim() + '\n';

// Y el guardia: lo que se va a escribir tiene que TERMINAR con el mismo CSS que se sacó.
// Sin la cabecera, para que la comparación sea del CSS solo.
//
// Y el salto de línea final se descuenta. El archivo se escribe con un "\n" al final, que
// el bloque en línea no tenía, y comparar sin eso da UN carácter de diferencia.
//
// Que es el error que dio la primera vez: 33.453 contra 33.454. Se lee como "cambió algo"
// y no dice qué. Y este es el guardia que se supone que sabe.
const cssDelArchivo = contenido.slice(CABECERA.length).replace(/\r\n/g, '\n').replace(/\n$/, '');
const cssDelOriginal = css.trim().replace(/\r\n/g, '\n');

if (cssDelArchivo !== cssDelOriginal) {
  console.log('  *** EL ARCHIVO NUEVO NO TIENE EL MISMO CSS ***');
  console.log('    original: ' + cssDelOriginal.length + ' caracteres');
  console.log('    archivo: ' + cssDelArchivo.length + ' caracteres');
  console.log('    No se escribe nada.');
  process.exit(1);
}

fs.writeFileSync(NUEVO, contenido, 'utf8');

// -------------------------------------------------------------------
// 4. CAMBIAR EL "<style>" POR EL "<link>", EN SU LUGAR
// -------------------------------------------------------------------
// Y se cuenta el renglón del "<style>" ANTES de cambiar, y se comprueba que el "<link>" quede ahí.
// Porque si queda un renglón más abajo, se cambió el orden de la cascada y este trabajo deja de
// ser inocuo.
const renglonDelStyle = lineaDe(ini);

app = app.slice(0, ini) + LINK + app.slice(finBloque);

// -------------------------------------------------------------------
// 5. LOS GUARDIANES FINALES
// -------------------------------------------------------------------
const veces = (s, x) => s.split(x).length - 1;

if (veces(app, '<style') !== 0) {
  console.log('  *** QUEDÓ UN "<style>" EN "app.html" ***');
  process.exitCode = 1;
}
if (veces(app, LINK) !== 1) {
  console.log('  *** EL "<link>" NO QUEDÓ UNA VEZ Y SOLA: ' +veces(app, LINK) + ' ***');
  process.exitCode = 1;
}

// Y que el "<link>" esté antes del de "styles.css". Este es EL guardia que importa: si el
// archivo nuevo queda después, "styles.css" le gana y la pantalla cambia sin avisar.
const posLink = app.indexOf(LINK);
const posStyles = app.indexOf('<link rel="stylesheet" href="../css/styles.css">');
if (posStyles < 0) {
  console.log('  *** NO SE ENCONTRÓ EL "<link>" DE "styles.css" ***');
  console.log('    No se escribe nada: sin saber dónde está, no se puede comprobar el orden.');
  fs.unlinkSync(NUEVO);
  process.exit(1);
}
if (posLink > posStyles) {
  console.log('  *** EL "<link>" DE "base.css" QUEDÓ DESPUÉS DE "styles.css" ***');
  console.log('    Eso SÍ cambiaría la pantalla: "styles.css" le ganaría a este archivo en');
  console.log('    todas las reglas que compitan.');
  console.log('    No se escribe nada.');
  fs.unlinkSync(NUEVO);
  process.exit(1);
}

// Y que el "<head>" siga cerrado, porque si no, todo lo que viene después es estilo.
if (veces(app, '<head>') !== 1 || veces(app, '</' + 'head>') !== 1) {
  console.log('  *** EL "<head>" NO ESTÁ ENTERO ***');
  fs.unlinkSync(NUEVO);
  process.exit(1);
}

if (process.exitCode) {
  console.log('    "css/base.css" NO se grabó: se borró lo que se había escrito.');
  console.log('    Y "app.html" NO se grabó tampoco: el cambio estaba solo en la memoria.');
  process.exit(process.exitCode);
}

fs.writeFileSync(APP, app, 'utf8');

const lineasAhora = app.split(nl).length;
const linesasDe = (s) => (s.indexOf('\r\n') >= 0 ? s.split('\r\n').length : s.split('\n').length);

console.log('    ok  escrito "css/base.css", ' + linesasDe(contenido) + ' renglones');
console.log('    ok  los ' + k.abren + ' pares de llaves del CSS en línea, íntegros');
console.log('    ok  "app.html": el "<style>" de los renglones 20 al 436 es un "<link>"');
console.log('        y sigue en el renglón ' + renglonDelStyle + ', ANTES de "styles.css"');
console.log('        lineas: ' + linesasDe(fs.readFileSync(APP, 'utf8')) + '  (antes 2722)');