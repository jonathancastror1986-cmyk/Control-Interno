// QUE NINGÚN ARCHIVO PUBLICADO TENGA MOJIBAKE
// ============================================
//
const fs = require('fs');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const MIDE = RAIZ + 'tools/mide-tildes.js';

// -------------------------------------------------------------------
// POR QUÉ ESTE GUARDIÁN NO TIENE LA EXPRESIÓN DENTRO
// ----------------------------------------------------
//
// Porque "mide-tildes.js" ya la tiene, probada con ocho casos, y una expresión de mojibake
// duplicada en dos lugares es una que se arregla en uno.
//
// Y esa es una clase de falla que ya pasó en este proyecto: el rango angosto
// —"/[Ã][¡-ÿ]/"— estaba escrito en "mide-tildes.js" y también pegado dentro de cada
// guardián, y cuando uno se arregló el otro quedó viejo. O sea que la mitad de los guardianes
// seguían con el rango que no veía las vocales con mayúscula.
//
// La forma que no se rompe: que el guardián LLAME al que tiene la expresión, y no que la
// tenga también. Así no hay dos copias y no puede haber una vieja.
//
// -------------------------------------------------------------------
// Y POR QUÉ "mide-tildes.js" Y NO ESTE ARCHIVO EL QUE COMPRUEBA
// ------------------------------------------------------------
//
// Porque "mide-tildes.js" se autocomprueba en cada corrida: si su expresión dejara de ver el
// mojibake, se cae con un mensaje antes de mirar ningún archivo. Y si este guardián lo
// llamara a él, esa autoprueba corre sola y gratis en cada "node tools/comprueba-mojibake.js".
//
// Un guardián que se autocomprueba es el que puede correr en el_pipeline sin que nadie lo
// revise.
//
const PROBETA = process.env.MOJIBAKE_PROBETA;

let archivos;
try {
  archivos = execFileSync('git', ['ls-files'], {
    cwd: RAIZ, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }).split('\n').map((x) => x.trim())
    .filter((p) => /\.(js|html|css|sql|md|txt|json)$/.test(p));
} catch (e) {
  console.log('');
  console.log('  *** NO SE PUDO CORRER "git ls-files" ***');
  console.log('    Sin saber qué se publica no se puede saber qué está roto.');
  process.exit(1);
}

if (!archivos.length) {
  console.log('');
  console.log('  *** NO SE ENCONTRÓ NINGÚN ARCHIVO ***');
  process.exit(1);
}

if (PROBETA) {
  console.log('');
  console.log('  *** CON UN ARCHIVO DE PRUEBA ***');
  archivos = [PROBETA];
  console.log('    solo se mira: ' + PROBETA);
}

console.log('');
console.log('  === mojibake en los archivos del repositorio ===');
console.log('    ' + archivos.length + ' archivo(s), con el detector de "mide-tildes.js"');

let mal = 0;
try {
  const salida = execFileSync('node', [MIDE].concat(archivos), {
    cwd: RAIZ, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Y se imprime su salida tal cual, porque es la que sabe dónde está cada cosa. Un guardián
  // que reimprime el informe de otro con otro formato es el que se desincroniza.
  process.stdout.write(salida);
} catch (e) {
  mal = 1;
  process.stdout.write((e.stdout || '') + (e.stderr || ''));
}

if (mal) {
  console.log('');
  console.log('    Para ver cuál es el archivo bueno:');
  console.log('        node tools/mide-tildes.js <archivo>');
  console.log('');
  console.log('    Y si el aviso es de "mide-tildes.js" mismo, no es un error: ese archivo');
  console.log('    escribe mojibake a propósito para explicarlo, y se saltea.');
  process.exit(1);
}

console.log('    ok  ningún archivo del repositorio tiene mojibake');
console.log('');
console.log('    y el detector se autocomprobó en esta corrida, con sus ocho casos');