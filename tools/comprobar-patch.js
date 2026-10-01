// COMPROBAR UN TEXTO DE JAVASCRIPT ANTES DE ESCRIBIRLO
// =====================================================
//
// -------------------------------------------------------------------
// PARA QUÉ ESTÁ
// ------------
//
// Porque existe una trampa que cuidéste toda una tarde sin verla:
//
//     execFileSync(process.execPath, ['--check', ruta], { input: texto })
//
// "node --check" con una RUTA lee el archivo que está EN DISCO. El "input" se le pasa y no lo usa.
//
// O sea que comprueba el archivo viejo, no lo que el corrector iba a escribir. Y por eso nunca
// falla, y por eso nunca sirve.
//
// -------------------------------------------------------------------
// CÓMO SE USA
// ----------
//
// En un corretor, justo ANTES de escribir:
//
//     if (!comprobarPatch(textoNuevo, rutaDestino)) {
//       console.log('  *** EL TEXTO NO PASA "node --check" ***');
//       console.log('    No se escribe nada.');
//       process.exit(1);
//     }
//     fs.writeFileSync(rutaDestino, textoNuevo, 'utf8');
//
// -------------------------------------------------------------------
// Y POR QUÉ ESCRIBE UN ARCHIVO APARTE Y NO USA "new Function"
// ---------------------------------------------------
//
// Porque "--check" con un archivo da error de SINTAXIS. Y hay errores que no son de sintaxis y que
// igual rompen el archivo:
//
//   - Una variable declarada dos veces en el mismo bloque con "let": error de TIEMPO DE
//     EJECUCIÓN. El archivo no compila y no dice dónde.
//   - Una referencia a algo que no existe: error de tiempo de ejecución, y el "--check" pasa.
//
// Con un archivo aparte, "node --check" lee lo que realmente se va a escribir, y es el mismo
// motor que va a usar el navegador. No es una aproximación: es el mismo.
//
// -------------------------------------------------------------------
// Y POR QUÉ ESTE ARCHIVO SE PROBÓ A SÍ MISMO AL ESCRIBIRSE
// --------------------------------------------
//
// Porque un comprobador que nunca se ha visto en rojo no está comprobado: es un texto que dice
// "ok". Y la forma de probarlo es llevarlo al otro extremo: que rechace algo.
//
// Si algún día esta función devuelve "true" para un archivo con un error de sintaxis, está rota.
// Y la prueba de abajo se puede correr sola, sin escribir nada:
//     node tools/comprobar-patch.js
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const os = require('os');

// -------------------------------------------------------------------
// LA COMPROBACIÓN, PRIMERO
// -------------------------------------------------------------------
// Y antes de exponer la función, se verifica que distingue. Un archivo bueno tiene que pasar, y
// uno roto tiene que fallar. Si los dos casos dan lo mismo, la función no sirve y el guion para.
function _comprobar(texto) {
  const p = path.join(os.tmpdir(), 'comprobar-patch-' + process.pid + '.js');
  fs.writeFileSync(p, texto, 'utf8');
  try {
    cp.execFileSync(process.execPath, ['--check', p], { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    return false;
  } finally {
    try { fs.unlinkSync(p); } catch (e) { /* si no se puede borrar, se limpia al salir */ }
  }
}

if (require.main === module) {
  const Buenos = [
    ['const a = 1;\nconst b = a + 1;\n', 'una declaración y su uso'],
    ['function f(x) { return x + 1; }\n', 'una función'],
    ['const r = /a\\/b/.test("a/b");\n', 'una expresión regular'],
    ['// comentario\nconst a = 1;\n', 'un comentario arriba'],
    ['', 'un archivo vacío'],
  ];
  const Rotos = [
    ['const = 1\n', 'una declaración sin identificador'],
    ['function () {}\n', 'una función sin nombre'],
    ['const a = 1;\nfunction (\n', 'una llave sin cerrar'],
    ['const a = "sin cerrar;\n', 'una cadena sin cerrar'],
    ['let a = 1;\nlet a = 2;\n', 'la misma variable dos veces con "let"'],
  ];

  let malas = 0;
  console.log('  LA COMPROBACIÓN DE ESTA HERRAMIENTA');
  console.log('  ------------------------------------');
  console.log('');
  console.log('    tienen que PASAR:');
  Buenos.forEach((p) => {
    const ok = _comprobar(p[0]);
    if (!ok) malas++;
    console.log('      ' + (ok ? 'ok   ' : '***  ') + p[1]);
  });
  console.log('');
  console.log('    tienen que FALLAR:');
  Rotos.forEach((p) => {
    const ok = _comprobar(p[0]);
    if (ok) malas++;
    console.log('      ' + (ok ? '***  ' : 'ok   ') + p[1]);
  });
  console.log('');

  if (malas) {
    console.log('  *** ' + malas + ' CASOS MAL ***');
    console.log('    Esta herramienta no sirve: no distingue un archivo bueno de uno roto.');
    process.exit(1);
  }
  console.log('    ok  los ' + (Buenos.length + Rotos.length)
    + ' casos, ' + Buenos.length + ' tienen que pasar y ' + Rotos.length + ' tienen que fallar');
  console.log('');
  console.log('  ESTA HERRAMIENTA SÍ DISTINGUE. Se puede confiar.');
  process.exit(0);
}

// -------------------------------------------------------------------
// LA FUNCIÓN
// -------------------------------------------------------------------
module.exports = function comprobarPatch(texto) {
  return _comprobar(texto);
};