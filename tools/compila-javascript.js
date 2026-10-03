// QUE TODO EL JAVASCRIPT DEL PROYECTO PARSEE
// ============================================
//
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const PROBETA = process.env.CHECK_PROBETA;

// -------------------------------------------------------------------
// POR QUÉ ESTE GUARDIÁN
// -------------------
//
// Porque elJavaScript de este proyecto se edita con guiones que reescriben bloques enteros, y
// un guion que reescribe puede dejar el archivo:
//   · con llaves desbalanceadas,
//   · con un renglón a medias,
//   · con el texto "undefined" pegado donde iba una línea.
//
// Y las tres cosas se ven IGUAL desde el navegador: la pantalla carga, los botones están, y
// las funciones que quedaron después del daño no existen. No hay error visible.
//
// -------------------------------------------------------------------
// Y LO QUE PASÓ, PORQUE ES MÁS ÚTIL QUE LA EXPLICACIÓN
// -------------------------------------------------------
//
// Se edits "js/app.js" con un guion propio, el guion dejó 82 apariciones del texto "undefined"
// repartidas por el archivo, y el archivo quedó con la mitad del contenido.
//
// Y la pantalla seguía abriendo. Los menús estaban. Los botones estaban. Lo que NO estaba
// eran las funciones que quedaron después del punto de daño: "renderEspecialidades",
// "descargarDocxConDatos" y otras.
//
// Y la pregunta natural —"¿por qué no están?"— no tiene respuesta mirando el archivo, porque
// el archivo lo que tiene es un texto que no debería estar.
//
// -------------------------------------------------------------------
// Y POR QUÉ NO LO ATRAPÓ NADA QUE YA HABÍA
// -----------------------------------------
//
// Porque los doce guardianes que ya tiene el proyecto miran cosas de CONTENIDO: que los
// códigos estén documentados, que las rutas existan, que las versiones suban, que no haya
// mojibake. Y un archivo con "undefined" pegado tiene todo eso bien.
//
// Y porque "node --check" se corría a mano, y a mano se corrió sobre "documentos.js",
// "docx.js" y "repara-medidor.js" —los archivos que se acababan de escribir— y no sobre
// "app.js", que era el que se había tocado.
//
// O sea que la comprobación existía, y era correcta, y no estaba donde estaba el problema.
//
// ESTE GUARDIÓN LA CORRE SOBRE TODOS LOS ".js" DEL REPOSITORIO, CADA VEZ, SIN QUE HAYA QUE
// ACORDARSE DE NADA.
//
// -------------------------------------------------------------------
// Y POR QUÉ NO BASTA CON CONTAR LLAVES
// ------------------------------------
//
// Porque contar llaves es contar llaves: hay que distinguir las que están en comentarios, en
// cadenas y en expresiones regulares, y un archivo con "{"" dentro de un texto rompe la cuenta.
// Y con eso hay questrepar de nuevo, y se vuelve aFallar.
//
// La diferencia con "node --check" es que no hay que acertar: es el mismo motor que va a
// ejecutar el archivo. Si el archivo no parsea, el navegador tampoco lo puede ejecutar, y no
// hay interpretación posible.
//
let archivos = execFileSync('git', ['ls-files'], {
  cwd: RAIZ, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
}).split('\n').map((x) => x.trim()).filter((x) => /\.js$/.test(x));

if (PROBETA) {
  console.log('');
  console.log('  *** CON UN ARCHIVO DE PRUEBA ***');
  console.log('    solo se mira: ' + PROBETA);
  archivos = [PROBETA];
}

if (!archivos.length) {
  console.log('');
  console.log('  *** NO SE ENCONTRÓ NINGÚN .js ***');
  process.exit(1);
}

console.log('');
console.log('  === el JavaScript parsea ===');
console.log('  ' + archivos.length + ' archivo(s)');

let malos = 0;
const rotos = [];

archivos.forEach(function (P) {
  // Y la ruta ABSOLUTA se usa tal cual.
  //
  // Y esto lo encontró la autoprueba: "path.join(RAIZ, '/ruta/absoluta')" NO da la ruta
  // absoluta, da RAIZ + "/ruta/absoluta", que no existe. Y el resultado es que el archivo de
  // prueba se reportaba como "no se pudo leer" —que es un mensaje cierto sobre un archivo que
  // sí se podía leer—, y el guardián seemed estar marcando un archivo sano.
  //
  // O sea que el guardián no mintió: dijo que no pudo leer algo, y no pudo leerlo. El que
  // estaba mal era el que le pasó la ruta.
  const completa = path.isAbsolute(P) ? P : path.join(RAIZ, P);
  // Y que el archivo no esté vacío. Un archivo de cero bytes PARSEA, porque un programa vacío
  // es un programa válido. Y "Copy-Item" con un origen inexistente deja un archivo de cero
  // bytes sin dar ningún error, que es la forma más común de que esto pase. Ver [cache-18].
  let bytes = 0;
  try { bytes = fs.statSync(completa).size; } catch (e) { bytes = -1; }

  if (bytes === 0) {
    rotos.push({ P: P, motivo: 'está VACÍO: cero bytes' });
    malos++;
    return;
  }
  if (bytes < 0) {
    rotos.push({ P: P, motivo: 'no se pudo leer' });
    malos++;
    return;
  }

  let mal = false;
  let salida = '';
  try {
    execFileSync('node', ['--check', completa], {
      cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    mal = true;
    salida = ((e.stdout || '') + (e.stderr || '')).split('\n')
      .filter((x) => x.trim()).slice(0, 3).join(' | ');
  }

  if (mal) {
    rotos.push({ P: P, motivo: salida || 'no parsea' });
    malos++;
  }
});

if (rotos.length) {
  console.log('');
  console.log('  *** ' + rotos.length + ' ARCHIVO(S) QUE NO PARSEAN ***');
  rotos.forEach(function (r) {
    console.log('      ' + r.P);
    console.log('        ' + r.motivo.slice(0, 150));
  });
  console.log('');
  console.log('    Un archivo que no parsea NO SE EJECUTA. Y no da ningún error en la pantalla:');
  console.log('    los menús están, los botones están, y las funciones que quedaron después del');
  console.log('    punto de daño simplemente no existen.');
  console.log('');
  console.log('    Para volver atrás:');
  console.log('        git checkout -- <archivo>');
  process.exit(1);
}

console.log('');
console.log('    ok  los ' + archivos.length + ' archivos parsean');
console.log('');
console.log('    Y esto corre el MISMO motor que va a ejecutar los archivos. Contar llaves');
console.log('    sirve hasta que hay un "{"" dentro de un texto; parsear no tiene excepción.');