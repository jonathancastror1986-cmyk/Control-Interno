// EL "<style>" EN LÍNEA DE app.html: CUÁNTO PESA Y CUÁNDO SE PUEDE SACAR
// =======================================================================
//
// -------------------------------------------------------------------
// POR QUÉ HAY QUE MIRAR ANTES DE SACAR NADA
// ---------------------------------------
//
// Porque el "<style>" en línea está en los renglones 20 a 436, y "styles.css" se carga en el 447.
//
// O sea que "styles.css" está DESPUÉS. Y cuando dos reglas dicen lo mismo, gana la que se cargó
// después. O sea que gana "styles.css".
//
// Y eso significa que hay reglas en línea que ya están pisadas y no hacen nada. Y hay reglas en
// línea que sí mandan. Y la diferencia se decide POR REGLA, no por archivo.
//
// -------------------------------------------------------------------
// POR QUÉ NO SE SACA DE UNA VEZ
// --------------------------
//
// Porque al sacar reglas del "<style>" y ponerlas en un archivo, cambia el ORDEN relativo: las
// que estaban antes que una regla pasan a estar después. Y si esas dos se peleaban por la misma
// propiedad, el que ganaba cambia.
//
// Y eso no da ningún error. La página se ve "un poco distinta" y no se sabe por qué. Ya pasó
// con el menú: 150 elementos se movieron 1,8 píxeles.
//
// -------------------------------------------------------------------
// EL ORDEN DE CARGA, QUE ES LO QUE NO SE PUEDE CAMBIAR
// -----------------------------------------------------
//
//   1. el "<style>" en línea          renglones 20 a 436
//   2. las fuentes de Google          renglón 445
//   3. tokens.css                    renglón 446
//   4. styles.css                     renglón 447
//   5. marca.css                     renglón 483
//   6. vistas.css                    renglón 484
//   7. componentes/porteria.css       renglón 485
//   8. componentes/tarjeta.css        renglón 486
//   9. componentes/totem.css          renglón 487
//  10. movil.css                      renglón 488
//
// Y el camino que NO cambia nada: sacar el bloque ENTERO a un archivo, en el MISMO lugar, con
// las reglas en el MISMO orden. Entonces la cascada es idéntica por construcción, y ni el
// guardián hace falta.
//
// -------------------------------------------------------------------
// Y DESPUÉS PARTIRLO, QUE YA ES OTRO TRABAJO
// -----------------------------------------
//
// Partir "base.css" en varios archivos cambia el orden entre ellos, y ahí sí hay que medir cada
// regla. Eso es para el turno siguiente, con el guardián.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const APP = path.join(raiz, 'pages', 'app.html');

const app = fs.readFileSync(APP, 'utf8');
const nl = app.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const lineas = app.split(nl);

const lineaDe = (pos) => app.slice(0, pos).split(nl).length;

// -------------------------------------------------------------------
// 1. DÓNDE ESTÁ EL BLOQUE, Y QUE NO HAYA "<style>" DENTRO DE UN COMENTARIO
// -------------------------------------------------------------------
// Porque hay un "<script>" escrito dentro de un comentario HTML en esta aplicación, y "sintaxis-3.js"
// lo tenía que saltear. Con "<style>" puede pasar lo mismo.
//
// Un "<style>" dentro de un comentario no abre bloque, y tomar el "<style>" equivocado hace que
// el guion se lleve medio archivo.
const APERTURAS = [];
const reApertura = /<style[^>]*>/gi;
let a;
while ((a = reApertura.exec(app)) !== null) APERTURAS.push(a.index);

if (!APERTURAS.length) {
  console.log('  *** NO HAY "<style>" EN LÍNEA. Nada que hacer. ***');
  process.exit(1);
}

const comentarios = [];
const reCom = /<!--[\s\S]*?-->/g;
let c;
while ((c = reCom.exec(app)) !== null) comentarios.push([c.index, c.index + c[0].length]);

function enComentario(pos) {
  return comentarios.some((r) => pos > r[0] && pos < r[1]);
}

const reales = APERTURAS.filter((p) => !enComentario(p));

console.log('  EL "<style>" EN LÍNEA DE "pages/app.html"');
console.log('');
console.log('    "<style>" en total:            ' + APERTURAS.length);
if (APERTURAS.length !== reales.length) {
  console.log('    de los cuales en comentario:  ' + (APERTURAS.length - reales.length));
}
if (reales.length > 1) {
  console.log('    *** HAY ' + reales.length + ' BLOQUES "<style>" REALES ***');
  console.log('    Se mediría el primero y no el resto. Hay que mirarlo a mano.');
  process.exit(1);
}

const ini = reales[0];
const fin = app.indexOf('</' + 'style>', ini);
if (fin < 0) {
  console.log('  *** EL "<style>" NO SE CIERRA ***');
  process.exit(1);
}

const bloque = app.slice(ini, fin + '</' + 'style>'.length);
const css = app.slice(app.indexOf('>', ini) + 1, fin);

console.log('    abre en el renglón            ' + lineaDe(ini));
console.log('    cierra en el renglón          ' + lineaDe(fin + 8));
console.log('    renglones que ocupa           ' + (lineaDe(fin + 8) - lineaDe(ini) + 1));
console.log('    del archivo entero            ' + lineas.length);
console.log('    o sea el                     ' + (((lineaDe(fin + 8) - lineaDe(ini) + 1) / lineas.length) * 100).toFixed(0) + '%');
console.log('    caracteres de CSS             ' + css.length);
console.log('');

// -------------------------------------------------------------------
// 2. LEER LAS REGLAS DEL BLOQUE
// -------------------------------------------------------------------
// Alternando entre código y comentario, que es lo único que no se equivoca con un "}" dentro de
// un comentario o con un "/*" que abre otro "/*".
function reglas(texto) {
  const out = [];
  let i = 0;
  let enComentario = false;
  let sel = '';
  let iniR = -1;
  let prof = 0;

  while (i < texto.length) {
    const dos = texto.substr(i, 2);
    if (enComentario) {
      if (dos === '*/') { enComentario = false; i += 2; continue; }
      i++; continue;
    }
    if (dos === '/*') { enComentario = true; i += 2; continue; }
    const ch = texto[i];
    if (ch === '{') {
      if (prof === 0) sel = sel.trim();
      prof++;
      if (prof === 1 && iniR < 0) iniR = i;
      i++; continue;
    }
    if (ch === '}') {
      prof--;
      if (prof === 0) { out.push({ sel, ini: iniR, fin: i + 1 }); sel = ''; iniR = -1; }
      i++; continue;
    }
    if (prof === 0) sel += ch;
    i++;
  }
  return out;
}

const rs = reglas(css);
const enMedia = (css.match(/@(media|supports)/g) || []).length;

console.log('    reglas de primer nivel       ' + rs.length);
console.log('    de las cuales "@media"       ' + enMedia);
console.log('    comentarios                   '
  + (css.match(/\/\*/g) || []).length);
console.log('    comentarios HTML              '
  + (css.match(/<!--/g) || []).length
  + (css.match(/-->/g) || []).length ? '' : '');
console.log('');

// -------------------------------------------------------------------
// 3. LA PREGUNTA QUE DECIDE: ¿CUÁLES YA ESTÁN PISADAS?
// -------------------------------------------------------------------
// Porque si una regla en línea y una de "styles.css" dicen lo mismo, gana "styles.css" y la en
// línea no hace nada.
//
// Y esa es la pregunta que hay que responder antes de sacar nada: no todas las reglas valen
// igual, y separar las vivas de las muertas es lo que define el trabajo.
console.log('  ESTADO DEL BLOQUE');
console.log('');
console.log('    Para sacarlo ENTERO a un archivo, sin cambiar el orden, no hace falta medir nada:');
console.log('    la cascada queda idéntica por construcción.');
console.log('');
console.log('    Lo que sí hay que medir antes de PARTIRLO en varios archivos:');
console.log('    cuántas de estas reglas están pisadas por "styles.css". Esas son las que se');
console.log('    pueden ir sin miedo. Las demás hay que mirarlas de a una.');
console.log('');
console.log('    Esa medición es la del próximo turno, y usa el guardián de la cascada.');