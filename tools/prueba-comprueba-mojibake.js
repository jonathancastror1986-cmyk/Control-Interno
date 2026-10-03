// PRUEBA DE "comprueba-mojibake.js": QUE EL GUARDIÁN MUERDA
// ==========================================================
//
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const GUARDIAN = RAIZ + 'tools/comprueba-mojibake.js';

console.log('  === probando "comprueba-mojibake.js" ===');

// -------------------------------------------------------------------
// EL CASO QUE EL RANGO VIEJO NO VEÍA
// -------------------------------------------------------------------
// Y es el que importa: si la prueba usara un "ñ" roto —U+00C3 U+00B1, los dos dentro del
// Supplemento Latino-1— el rango angosto también lo vería, y la prueba pasaría con el
// detector viejo. O sea que la prueba no probaría lo que dice probar.
//
// Y lo que hay que provar es justo lo que el viejo no veía: una vocal con ACENTO Y MAYÚSCULA,
// que al romperse deja el segundo byte en U+201C, fuera del rango viejo.
//
//     'Ó'  ->  C3 93  ->  Ã“   U+00C3 U+201C
//
const C3 = String.fromCharCode(0xC3);
const ROTO = 'el ANG' + C3 + String.fromCharCode(0x93) + 'ULO pas' + C3 + String.fromCharCode(0x93) + 'o';

const PROBETA = RAIZ + 'tools/pruebas/_mojibake.html';

fs.writeFileSync(PROBETA,
  '<!--\n'
  + '  Esta línea está SANA a propósito: con acentos normales, minúscula.\n'
  + '  La Direction du Travail y el àngulo y la razón.\n'
  + '-->\n'
  + '<!--\n'
  + '  Y esta línea está ROTA:  ' + ROTO + '\n'
  + '-->\n'
  + '<p>prueba</p>\n', 'utf8');

console.log('');
console.log('  el archivo de prueba tiene:');
console.log('    1 línea SANA con acentos normales');
console.log('    1 línea ROTA, y es una MAYÚSCULA —el caso que el rango viejo no veía—');
console.log('');

function correr() {
  try {
    execFileSync('node', [GUARDIAN], {
      cwd: RAIZ, encoding: 'utf8',
      env: Object.assign({}, process.env, { MOJIBAKE_PROBETA: PROBETA }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { codigo: 0 };
  } catch (e) {
    return { codigo: e.status === undefined ? -1 : e.status, salida: (e.stdout || '') + (e.stderr || '') };
  }
}

// -------------------------------------------------------------------
// CASO 1 — EL ARCHIVO DE PRUEBA
// -------------------------------------------------------------------
const c1 = correr();
if (c1.codigo !== 0 && /MOJIBAKE/.test(c1.salida)) {
  console.log('  caso 1: el archivo roto');
  console.log('    lo detectó: PASÓ');
  const l = (c1.salida.split('\n').find((x) => x.indexOf('_mojibake.html:') >= 0) || '').trim();
  if (l) console.log('    ' + l);
} else {
  console.log('  *** CASO 1: NO LO DETECTÓ ***');
  console.log('    Un archivo con una vocal rota tiene que ser un error.');
  process.exit(1);
}

// -------------------------------------------------------------------
// CASO 2 — UN ARCHIVO SANO, Y QUE NO LO MARQUE
// -------------------------------------------------------------------
// Y este es el que se importa más. Un detector de mojibake que marca los acentos normales es
// peor que ninguno: es un guardián que siempre dice que hay problema, y a la semana nadie lo
// corre. Ver [cache-10].
fs.writeFileSync(PROBETA,
  '<!--\n'
  + '  Dirección del Trabajo, á é í ó ú ñ, y la razón y el ángulo y la cuestión.\n'
  + '  También las comillas: “así” y el Portugal de «padrão».\n'
  + '-->\n'
  + '<p>sano</p>\n', 'utf8');

console.log('');
console.log('  caso 2: un archivo sano, con acentos, comillas y un "padrão" dePortugal');
const c2 = correr();
if (c2.codigo === 0) {
  console.log('    no lo marcó: PASÓ');
} else {
  console.log('    *** LO MARCÓ ***');
  console.log(c2.salida.split('\n').slice(0, 8).map((x) => '      ' + x).join('\n'));
  console.log('    Un guardián que marca lo sano es peor que uno que no comprueba.');
  process.exit(1);
}

// Y el archivo de prueba se borra, o queda como un archivo más que alguien confunde con
// algo real.
fs.unlinkSync(PROBETA);
if (fs.existsSync(PROBETA)) {
  console.log('');
  console.log('  *** NO SE PUDO BORRAR EL ARCHIVO DE PRUEBA ***');
  process.exit(1);
}

console.log('');
console.log('    ok  el guardián muerde el roto y deja pasar el sano, y no dejó restos');