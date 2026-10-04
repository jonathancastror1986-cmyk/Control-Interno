// QUITAR UN RANGO DE RENGLONES, DICIENDO QUÉ SE VA
// ===================================================
//
// Cuando una edición deja un bloque huérfano, hay que borrarlo. Y borrarlo por número de renglón a
// pelo es peligroso: si el archivo se corrió una línea entre que se mide y se borra, se van dos
// renglones equivocados y el que queda es el bueno.
//
// ---------------------------------------------------------------------
// Y POR QUÉ ESTA HERRAMIENTA EXIGE QUE SE DIGA QUÉ SE VA
// ---------------------------------------------------------------------
//
// Porque el borrado se ejecuta sin preguntar, y sin pregunta borra lo que le parezca. Acá el
// argumento obligatorio es el texto del primer renglón del rango, y si el archivo no lo tiene
// exactamente ahí, no borra nada.
//
// O sea que hay que nombrar el renglón antes de poder borrarlo. Si uno dice "borra el 5253" y el
// 5253 es otra cosa, la herramienta dice que no está y no hace nada. Si dice "borra desde el que
// dice X hasta Y", y X no está en esa línea, tampoco.
//
// ---------------------------------------------------------------------
// Y EL RANGO VA HASTA EL FINAL, O HASTA OTRA LÍNEA
// ---------------------------------------------------------------------
//
// "hasta" es opcional: sin él, borra hasta el final del archivo, que es el caso de una cola que se
// quedó colgando.

const fs = require('fs');

const P = process.argv[2];
const DESDE = parseInt(process.argv[3], 10);
const ESPERA = process.argv[4] || '';
const HASTA_texto = process.argv[5] || '';
const HASTA = HASTA_texto ? HASTA_texto.split('|').map((x) => x.trim()) : null;

if (!P || !DESDE || !ESPERA) {
  console.log('  uso: node tools/quita-renglones.js [archivo] [linea] [que-decir] [hasta-donde...]');
  console.log('    "hasta donde" se separa con "|", y es opcional: sin eso borra hasta el final.');
  process.exit(1);
}

const antes = fs.readFileSync(P, 'utf8');
const lineas = antes.split(/\r\n|\n|\r/);

console.log('  === 1) el renglón que se busca ===');
console.log('    archivo: ' + P);
console.log('    línea ' + DESDE + ' de ' + lineas.length);
const real = String(lineas[DESDE - 1] || '');
console.log('    dice:    ' + real.slice(0, 76));
if (real.trim() !== ESPERA) {
  console.log('    *** NO DICE "' + ESPERA + '" ***');
  console.log('    NO SE BORRA NADA.');
  process.exit(1);
}
console.log('    ok  dice lo que se esperaba');

let hasta = lineas.length - 1;
if (HASTA) {
  hasta = -1;
  for (let i = DESDE - 1; i < lineas.length; i++) {
    const t = String(lineas[i]).trim();
    if (HASTA.some(function (x) { return t === x; })) { hasta = i; break; }
  }
  if (hasta < 0) {
    console.log('    *** NO SE ENCONTRÓ EL FINAL ***');
    console.log('    NO SE BORRA NADA.');
    process.exit(1);
  }
}

console.log('');
console.log('  === 2) lo que se borra ===');
console.log('    de L' + DESDE + ' a L' + (hasta + 1) + ': ' + (hasta - DESDE + 2) + ' renglones');
lineas.slice(DESDE - 1, Math.min(DESDE + 4, hasta + 1)).forEach(function (x, k) {
  console.log('      L' + (DESDE + k) + '  ' + String(x).slice(0, 62));
});
console.log('      ...');
lineas.slice(Math.max(DESDE - 1, hasta - 2), hasta + 1).forEach(function (x, k) {
  console.log('      L' + (Math.max(DESDE - 1, hasta - 2) + k + 1) + '  ' + String(x).slice(0, 62));
});

const restantes = lineas.slice(0, DESDE - 1).concat(lineas.slice(hasta + 1));
const despues = restantes.join('\n');

console.log('');
console.log('  === 3) las comprobaciones ===');

const CHEQUEOS = [
  ['el archivo no perdió nada fuera del rango',
    restantes.length === lineas.length - (hasta - DESDE + 2)],
  ['el rango estaba dentro del archivo', DESDE >= 1 && hasta < lineas.length],
  ['el texto del renglón de arranque sigue en el archivo',
    despues.indexOf(ESPERA) < 0 || DESDE > lineas.indexOf(ESPERA) + 1],
  ['quedan llaves balanceadas en el texto',
    (function () {
      const n = (despues.match(/{/g) || []).length;
      const c = (despues.match(/}/g) || []).length;
      return n === c;
    })()],
];

let malas = 0;
CHEQUEOS.forEach(function (c) {
  if (!c[1]) malas++;
  console.log('  ' + (c[1] ? 'ok  ' : '*** ') + c[0]);
});

if (malas) {
  console.log('');
  console.log('  *** ' + malas + ' *** NO SE BORRA NADA.');
  process.exit(1);
}

fs.writeFileSync(P, despues);
console.log('');
console.log('  ok  borrado. ' + P.split(/[\\/]/).pop() + ' quedó en ' + restantes.length + ' renglones.');