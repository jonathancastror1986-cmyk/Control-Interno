// MATAR LA PALABRA ROTA DE UN RENGLÓN, POR SU POSICIÓN
// ========================================================
//
// El escaner "_scan-rotos_" marca L70 de "tools/inserta-rls-09.js" con cinco caracteres cirílicos:
// "no las<cirílico>eron". Y no se puede arreglar con una reemplazo de texto, porque el editor
// tendría que escribir esos cinco bytes exactos para encontrarlos, y no se pueden escribir a mano
// sin volver a introducir otro.
//
// ---------------------------------------------------------------------
// Y POR QUÉ NO SE USA "Set-Content" DE POWERSHELL
// ---------------------------------------------------------------------
//
// Porque en Windows, "Set-Content -Encoding UTF8" escribe un BOM al principio del archivo. El
// proyecto ya lo-midió: las lecturas de git con ">" dan basura, y un BOM en un archivo de texto
// rompe el guardado, y en un archivo de SQL rompe el "--" de la primera línea, que es un
// comentario que ya no secommenta.
//
// ---------------------------------------------------------------------
// Y POR QUÉ ESTE SCRIPT NO ES "UN SCRIPT DE UN SOLO USO" QUE SE BORRA
// ---------------------------------------------------------------------
//
// Porque lo que hace no es de un archivo: es quitar caracteres de un idioma que no sea el nuestro,
// en cualquier renglón, del archivo que se le pase. Y el escaner los va a volver a marcar mientras
// se escribe, porque no se pueden escribir a mano. O sea que se va a necesitar otra vez.
//
// Y no decide QUÉ palabra poner: el argumento es el texto limpio. El script sólo lo pone, y avisa
// de lo que sacó. Cambiar el significado de una frase es de quien lee el archivo, no de una
// herramienta.

const fs = require('fs');

const P = process.argv[2];
const LINEA = parseInt(process.argv[3], 10);
const NUEVO = process.argv[4];

if (!P || !LINEA || !NUEVO) {
  console.log('  uso: node tools/arregla-renglon.js [archivo] [linea] [texto-limpio]');
  process.exit(1);
}

const antes = fs.readFileSync(P, 'utf8');
// Y EL CORTE TIENE QUE SER EL MISMO EN LOS DOS LUGARES
//
// El archivo se lee con "split(/\r\n|\n|\r/)", que saca el "\r" de los finales CRLF. Y la
// comprobación de abajo partía con "split('\n')", que lo deja. O sea que comparaba renglones con
// "\r" contra renglones sin "\r": TODOS distintos, y el "sólo cambió ese renglón" daba falso.
//
// En un archivo con finales LF los dos cortes coinciden y el aviso no aparece nunca. En uno con
// CRLF --que es casi todo este proyecto-- la herramienta no servía para nada: se quejaba siempre,
// y lo que hacía era enseñar a ignorar el aviso.
const cortar = (t) => t.split(/\r\n|\n|\r/);
const lineas = cortar(antes);

console.log('  === 1) el renglón ===');
console.log('    archivo: ' + P);
console.log('    línea:   ' + LINEA + ' de ' + lineas.length);
const vieja = lineas[LINEA - 1];
console.log('    antes:   ' + vieja.slice(0, 78));

// Y QUÉ SACA, POR CARÁCTER, PARA PODER LEERLO
const fuera = [];
for (let i = 0; i < vieja.length; i++) {
  const c = vieja.codePointAt(i);
  const enRango = (c >= 0x0400 && c <= 0x04ff)      // cirílico
    || (c >= 0x4e00 && c <= 0x9fff)                   // chino
    || (c >= 0x3040 && c <= 0x30ff)                    // japonés
    || (c >= 0xac00 && c <= 0xd7af)                    // coreano
    || (c >= 0xff01 && c <= 0xff60);                   // de punta a punta
  if (enRango) fuera.push('    U+' + c.toString(16).toUpperCase().padStart(4, '0'));
}

console.log('');
console.log('  === 2) qué tiene de otro idioma ===');
if (fuera.length) fuera.forEach(function (x) { console.log(x); });
else console.log('    ninguno: la línea es sólo del nuestro');

lineas[LINEA - 1] = NUEVO;
const despues = lineas.join('\n');

console.log('');
console.log('  === 3) las comprobaciones ===');

const CHEQUEOS = [
  ['el archivo no cambió de renglones',
    cortar(despues).length === cortar(antes).length],
  ['el renglón no tiene caracteres de otro idioma',
    !/[\u0400-\u04ff\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\uff01-\uff60]/.test(lineas[LINEA - 1])],
  ['el renglón nuevo no está vacío', lineas[LINEA - 1].trim() !== ''],
  ['sólo cambió ese renglón',
    cortar(antes).filter(function (x, i) { return x !== lineas[i]; }).length === 1],
];

let malas = 0;
CHEQUEOS.forEach(function (c) {
  if (!c[1]) malas++;
  console.log('  ' + (c[1] ? 'ok  ' : '*** ') + c[0]);
});

console.log('');
console.log('    después: ' + lineas[LINEA - 1].slice(0, 78));

if (malas) {
  console.log('');
  console.log('  *** ' + malas + ' *** NO SE ESCRIBE NADA.');
  process.exit(1);
}

fs.writeFileSync(P, despues);
console.log('');
console.log('  ok  escrito.');