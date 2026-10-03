// NINGUNA REGLA DE "th" PUEDE PONER UN FONDO CLARO Y DEJAR EL COLOR GLOBAL
// ==========================================================================
//
// ---------------------------------------------------------------------
// EL DEFECTO QUE ATRAPA
// ---------------------------------------------------------------------
//
// "css/styles.css" tiene, y aplica a toda la aplicación:
//
//     th{background:var(--accent2);color:#fff;font-weight:600}
//
// En tema CLARO "--accent2" es #101a14 —casi negro— así que el texto blanco se lee bien. Esa
// combinación está pensada y funciona.
//
// Y después hay reglas que le CAMBIAN EL FONDO a un token claro, como "--card", que en tema
// claro es #ffffff. Si la regla no le cambia el color, el "#fff" de la regla global se queda
// pegado y la celda queda BLANCA SOBRE BLANCA.
//
// ---------------------------------------------------------------------
// POR QUÉ ES EL PEOR DE LOS DEFECTOS
// ---------------------------------------------------------------------
//
// Porque no da error, no deja un hueco y no rompe nada de la estructura. La celda está, con su
// borde y su tamaño. Lo que no está es la LETRA.
//
// Y el síntoma se lee mal: "faltan los números de día". Y el número no faltaba —el HTML lo
// traía, en 39 celdas—, lo que pasaba es que no se veía. Una persona que reportaría eso tardaría
// mucho en llegar a la cascada del color.
//
// En la tarjeta del supervisor eran los números del encabezado, y la fila entera parecía
// dibujada y vacía.
//
// ---------------------------------------------------------------------
// LA REGLA
// ---------------------------------------------------------------------
//
// Si una regla le pone el fondo a un "th", tiene que ponerle el color también.
//
// Y no es una preferencia de estilo: es que el color de una celda no es de la celda, es de la
// más específica que la toca. Cambiar el fondo sin tocar el color deja el color del otro lado de
// la cascada, y del otro lado hay un "#fff" que estaba pensado para un fondo casi negro.
//
// ---------------------------------------------------------------------
// LO QUE ESTE GUARDIÁN NO HACE
// ---------------------------------------------------------------------
//
// No calcula contraste, porque medir contraste es un problema de ARITMÉTICA y esta regla es de
// ESTRUCTURA: no importa si el fondo es "#ffffff" o "#f8faf9", las dos cosas son claras y las dos
// se rompen igual con un texto blanco.
//
// Y no revisa "td", porque un "td" no tiene "#fff" global: hereda el color de texto normal, que
// funciona sobre cualquier fondo del sistema. El problema es del encabezado.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

// ---------------------------------------------------------------------
// LOS TOKENS QUE SON CLAROS EN TEMA CLARO
// ---------------------------------------------------------------------
//
// Y el criterio está escrito, no supuesto: sale de "css/tokens.css", L58 y L60, donde el tema
// claro los define.
//
//     --card            #ffffff
//     --panel           #ffffff
//     --bg              #f4f7f5
//     --surface-hover   #edf4ef
//
// Y con cualquiera de estos de fondo, un "#fff" encima es invisible.
//
// Y los que NO están en la lista, porque con ellos el blanco se lee:
//     --accent2         #101a14        el fondo del encabezado global
//     --accent          #218653
const CLAROS = ['var(--card)', 'var(--panel)', 'var(--bg)', 'var(--surface-hover)',
  'var(--surface)', 'var(--surface-2)'];

// ---------------------------------------------------------------------
// LEER LAS REGLAS
// ---------------------------------------------------------------------
//
// Y se parte el CSS por LLAVES, no por renglón, porque una regla puede ocupar varios renglones y
// partirlo por renglón parte las reglas de los selectores de grupo, que en este proyecto son
// todas.
//
// Y el selector se recorta por los comentarios, porque en estos archivos hay bloques largos de
// comentario arriba de cada regla y si no se quitan el mensaje dice "selector:  de arriba. */
// #v-asistencia…" que no ayuda a nadie.
function reglasDeTh(texto) {
  const salida = [];
  let linea = 1;
  texto.split('}').forEach(function (trozo) {
    const desde = linea;
    linea += (trozo.match(/\n/g) || []).length;
    const llave = trozo.indexOf('{');
    if (llave < 0) return;

    // Y el selector es lo que va antes de la llave, y sin comentarios.
    const crudo = trozo.slice(0, llave);
    const sinComentarios = crudo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').trim();
    if (!sinComentarios) return;
    if (!/(^|[\s,>+~])th(\[[^\]]*\])?([\s,>:+~]|$)/.test(sinComentarios)) return;

    const cuerpo = trozo.slice(llave + 1);
    const bg = /(^|[;{\s])background(-color)?\s*:\s*([^;}]+)/.exec(cuerpo);
    const col = /(^|[;{\s])color\s*:\s*([^;}]+)/.exec(cuerpo);
    salida.push({
      linea: desde,
      selector: sinComentarios.replace(/\s+/g, ' '),
      fondo: bg ? bg[3].trim() : null,
      color: col ? col[2].trim() : null,
    });
  });
  return salida;
}

const css = [];
(function camina(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'pruebas') return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return camina(p);
    if (/\.css$/i.test(e.name)) css.push(p);
  });
})(RAIZ);

const malas = [];
let total = 0;

css.forEach(function (ruta) {
  const rel = ruta.replace(RAIZ + path.sep, '');
  const texto = fs.readFileSync(ruta, 'utf8');
  const reglas = reglasDeTh(texto);
  total += reglas.length;
  reglas.forEach(function (r) {
    if (!r.fondo) return;
    if (!CLAROS.some((x) => r.fondo.indexOf(x) >= 0)) return;
    if (r.color) return;
    malas.push({ archivo: rel, linea: r.linea, selector: r.selector, fondo: r.fondo });
  });
});

console.log('  archivos de CSS leídos: ' + css.length);
console.log('  reglas que tocan "th":   ' + total);
console.log('  tokens claros vigilados: ' + CLAROS.join(', '));
console.log('');

if (malas.length) {
  console.log('  *** ' + malas.length + ' REGLA(S) QUE SON BLANCO SOBRE BLANCO EN TEMA CLARO ***');
  malas.forEach(function (m) {
    console.log('');
    console.log('    ' + m.archivo + ' L' + m.linea);
    console.log('      selector: ' + m.selector);
    console.log('      fondo:    ' + m.fondo);
    console.log('      color:    (ninguno)  →  queda el "#fff" de "styles.css"');
    console.log('      arreglo:  agregar  "color:var(--text);"  en la misma regla');
  });
  console.log('');
  process.exit(1);
}

console.log('  ok  ninguna regla le pone a un "th" un fondo claro sin ponerle color.');
console.log('      Y en tema oscuro tampoco, porque los tokens claros también son los del fondo.');