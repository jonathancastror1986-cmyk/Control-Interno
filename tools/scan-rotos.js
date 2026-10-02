// REVISAR QUE NO HAYAN QUEDADO CARACTERES ROTOS
// ==============================================
// Acepta VARIOS archivos y los revisa todos. Antes solo leía el primero, y con eso: uno
// pasa tres rutas, el guion mira la primera, la primera está limpia, e imprime
// "sin caracteres rotos". El archivo que uno quería revisar es el segundo y nadie lo miró.
//
// Eso es peor que no tener escáner: es un escáner que dice que pasó. Ver [cache-06].
//
// Y al final imprime cuántos archivos leyó, para que se vea en la salida. Si el número no
// es el que se le pasó, el "ok" de arriba no era de este trabajo.
const fs = require('fs');

// -------------------------------------------------------------------
// EL RANGO SE ARMA CON NUMEROS, NO CON LOS CARACTERES
// ----------------------------------------------------
//
// Este guion se marcaba a sí mismo. Su propio patrón de busca, escrito con los caracteres
// literales, es una línea llena de ideogramas y cirílico — que es exactamente lo que busca.
// Es decir que se detecta a sí mismo como roto, y con eso el escáner se desacredita a sí
// mismo: si marca el archivo que hace la comprobación, ¿qué más va a marcar?
//
// La causa es la misma que en [cache-11]: la barra invertida se rompe entre capas, y lo que
// era un escape termina siendo un caracter literal. Con "String.fromCharCode" no hay barra
// invertida en el archivo: hay números.
//
const R = String.fromCharCode;
const rango = (ini, fin) => R(ini) + '-' + R(fin);

const ROTO = new RegExp('['
  + R(0xFFFD)                       // el caracter de reemplazo
  + rango(0x4E00, 0x9FFF)           // chino
  + rango(0x3040, 0x30FF)           // japones, hiragana y katakana
  + rango(0xAC00, 0xD7AF)           // coreano
  + rango(0x0400, 0x04FF)           // cirilico
  + ']', 'g');

// -------------------------------------------------------------------
// Y PROBAR EL RANGO, PORQUE UN RANGO MAL ESCRITO NO MARCA NADA
// ---------------------------------------------------------------
//
// Si el rango se escribe mal, "x.match(...)" devuelve "null" siempre y el guion dice que todo
// está limpio. Eso ya pasó: sonó "ok" sobre archivos que estaban rotos.
//
// Se prueba con una cadena de cada tipo. Y tiene que encontrarlas a todas.
[
  ['chino', R(0x4E00)], ['cirilico', R(0x0416)], ['japones', R(0x30A2)],
  ['coreano', R(0xD55C)], ['reemplazo', R(0xFFFD)],
].forEach(([nombre, ch]) => {
  if (!new RegExp(ROTO.source).test('x' + ch + 'y')) {
    console.log('');
    console.log('  *** EL RANGO NO ENCUENTRA EL ' + nombre.toUpperCase() + ' ***');
    console.log('    Y sin eso, el guion dice "limpio" sobre cualquier cosa.');
    process.exit(1);
  }
});

// Y con algo sano, que NO debe marcar. Si marcara, seria al revés: marcaría todo.
if (new RegExp(ROTO.source).test('carga el niño y la mamá, el año, José Ángel')) {
  console.log('');
  console.log('  *** EL RANGO MARCA UN TEXTO SANO ***');
  process.exit(1);
}

const rutas = process.argv.slice(2);
if (!rutas.length) {
  console.log('');
  console.log('  hay que pasar al menos un archivo');
  process.exit(1);
}

let malos = 0;
let leidos = 0;

rutas.forEach((P) => {
  let t;
  try {
    t = fs.readFileSync(P, 'utf8');
  } catch (e) {
    console.log('');
    console.log('  *** NO SE PUDO LEER ' + P + ' ***');
    console.log('    ' + e.message);
    malos++;
    return;
  }
  leidos++;
  const l = t.split('\n');
  l.forEach((x, i) => {
    const roto = x.match(ROTO);
    if (roto) {
      malos++;
      console.log('  ' + P + ':' + (i + 1) + ': ROTOS ' + JSON.stringify(roto) + '  ->  ' + x.trim().slice(0, 100));
    }
  });
});

console.log('');
if (malos) {
  console.log('  *** ' + malos + ' PROBLEMA(S), en ' + leidos + ' archivo(s) leido(s) ***');
  process.exit(1);
}
console.log('  ok  los ' + leidos + ' archivo(s) están limpios, y se leyeron los ' + leidos);
