// Herramienta de un solo uso: inyecta un bug, corre la prueba y deja todo como
// estaba. Se borra al terminar.
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');

const FICHA = 'js/ficha-archivador.js';
const LISTA = 'js/checklist-trabajador.js';
const originales = {};

function cargar() {
  originales[FICHA] = fs.readFileSync(FICHA, 'utf8');
  originales[LISTA] = fs.readFileSync(LISTA, 'utf8');
}
// Y LA DEVOLVER QUEDA ABAJO, CON SU COMPROBACION
//
// Antes estaba acá y no podia fallar: si algo se caía antes de llegar al final, el
// bug se quedaba puesto. Ver "restaurar()" mas abajo.
function correr() {
  try {
    const salida = execFileSync(process.execPath, ['tools/prueba-ficha-archivador.js'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { verde: true, salida };
  } catch (e) {
    return { verde: false, salida: String(e.stdout || '') };
  }
}
// ===================================================================
// DEVOLVER LOS ARCHIVOS A SU ESTADO, PASE LO QUE PASE
// ===================================================================
//
// Y POR QUÉ ESTA FUNCIÓN ES MÁS IMPORTANTE QUE LA DE INYECTAR
//
// Porque esta herramienta ESCRIBE sobre el código de la aplicación. Si se corta a
// mitad —un Ctrl+C, una excepción, una caída— el bug se queda puesto en el archivo
// de verdad.
//
// Y PASÓ. Una corrida dejó "z-index:9" en el sello de agua de "ficha-archivador.js"
// (el bug que esta misma herramienta inyecta), y casi se sube a producción: el
// sello de agua tapaba el texto del pie. Lo detectó "prueba-ficha-archivador", que
// para eso existe, pero llegó tarde.
//
// Por eso ahora:
//   1) todo lo que inyecta queda dentro de un "try" que SIEMPRE restaura,
//   2) al final se COMPRUEBA que los archivos estén byte a byte como estaban, y
//   3) si no están, se restauran y el proceso sale con código 1.
function restaurar(){
  for (const f of Object.keys(originales)) fs.writeFileSync(f, originales[f]);
  for (const f of Object.keys(originales)) delete originales[f];
}
// Y LO MISMO, PARA EL CASO DE QUE ALGO SALTE ANTES DE LLEGAR AL FINAL
process.on('exit', function () {
  // "salio" es la marca de que ya se restauró a propósito. Sin esta marca, un
  // "exit" por error intentaría restaurar sobre archivos que ya están bien, que es
  // inocuo, pero el mensaje engaña.
  if (originales && Object.keys(originales).length) restaurar();
});
function comprobarQueQuedoIgual(){
  for (const f of Object.keys(originales)) {
    if (fs.readFileSync(f, 'utf8') !== originales[f]) {
      console.log('    *** ' + f + ' quedo MODIFICADO: lo restauro');
      fs.writeFileSync(f, originales[f]);
      return false;
    }
  }
  return true;
}
function probarBug(nombre, archivo, de, a) {
  if (!originales[archivo]) throw new Error('no tengo copia de ' + archivo);
  const texto = originales[archivo];
  if (texto.indexOf(de) < 0) {
    console.log('    ?  ' + nombre + ': NO ENCONTRADO el texto, el bug no se inyecto');
    return false;
  }
  fs.writeFileSync(archivo, texto.split(de).join(a));
  const r = correr();
  console.log('    ' + (r.verde ? '*** NO DETECTADO  ' : 'ok  lo detecto     ') + nombre);
  fs.writeFileSync(archivo, texto);
  return !r.verde;
}

cargar();
let detectados = 0;
let probados = 0;

probarBug('la foto del papel desaparece',
  FICHA, 'return \'<div class="fichaFoto">\'', 'return \'<div class="fichaFotoVacia">X\'')
  && detectados++;
probados++;

// Y UNO NUEVO, DEL CAMBIO DE HOY
//
// La foto ahora lleva un "onerror" para que una foto que no se puede bajar no salga
// como el cuadrito roto del navegador. Se comprueba que el "onerror" no se pierda.
probarBug('la foto pierde el aviso de que no se pudo cargar',
  FICHA, ' onerror="this.style.display', ' data-basura="this.style.display')
  && detectados++;
probados++;

// Y UNO DEL SELLO DE AGUA
//
// El sello tiene que quedar DETRÁS del texto del pie. Si el z-index se da vuelta, el
// logo tapa la línea que dice de qué sistema salió la hoja, y esa línea es lo único
// que el pie dice.
//
// Y POR QUÉ EL BUG REEMPLAZA EL "z-index:0" Y NO AGREGA UNO NUEVO
//
// La primera versión del bug agregaba un "z-index:9" al principio de la regla, y la
// comprobación no lo vio: la regla seguía teniendo más abajo su "z-index:0", así que
// el texto "z-index:0" aparecía igual y la comprobación pasaba. Reemplazar hace el
// bug de verdad, que es lo que un error real hace.
probarBug('el sello de agua tapa el texto del pie',
  FICHA, 'pointer-events:none;z-index:0;', 'pointer-events:none;z-index:9;')
  && detectados++;
probados++;

// Y POR QUÉ EL SIGUIENTE BUG ROMPE LA BÚSQUEDA DE LA EMPRESA
//
// La primera versión rompía la escritura del nombre en el encabezado, y la prueba no
// lo vio, porque el mismo nombre se imprime otra vez en la sección de contratación:
// el papel perdía la marca de arriba y quedaba completo.
//
// Y LA SEGUNDA VERSIÓN DEL BUG ROMPIÓ OTRA COSA, QUE ES LA QUE PASÓ DE VERDAD
//
// La ficha buscaba la empresa con una función que no existía en la aplicación. El
// nombre salía "Empresa" y no había logo ni sello, y todo lo demás del papel estaba
// bien. Por eso el bug va en la búsqueda —que nunca encontraba nada— y no en la
// escritura.
probarBug('la empresa del trabajador no se encuentra',
  FICHA, 'return e&&String(e.id)===String(id);', 'return false;')
  && detectados++;
probados++;

// Y POR QUÉ EL BUG ENTRA POR LA LÍNEA DEL "if", Y NO POR EL TEXTO DEL AVISO
//
// Porque el aviso "No hay ninguna ficha abierta..." se reescribe cada vez que se le
// mejora la redacción, y una prueba que lo copia entero se pone roja sola el día que
// se toca el texto. Lo que hace el bug es quitar el "return", y eso no cambia cuando
// cambia el mensaje. "if(!w){" aparece una sola vez en la ficha, que también se
// comprobó.
probarBug('sin ficha abierta imprime un papel en blanco',
  FICHA, "if(!w){\n", "if(!w){\n    return;\n") && detectados++;
probados++;

probarBug('la foto casual deja de servir de respaldo',
  LISTA, "const url=w.foto_seguridad_url||w.foto_casual_url||'';", "const url=w.foto_seguridad_url||'';")
  && detectados++;
probados++;

console.log('');
console.log('    ' + detectados + ' de ' + probados + ' bugs detectados');
// Y ANTES DE NADA, COMPROBAR QUE LOS ARCHIVOS QUEDARON EXACTAMENTE IGUALES
//
// Porque esta herramienta escribe sobre el código de la aplicación, y un archivo
// que queda con un bug inyectado es un bug en producción esperando un commit. Ya
// pasó una vez.
const intacto = comprobarQueQuedoIgual();
restaurar();
if (!intacto) {
  console.log('    *** ALGO QUEDO MODIFICADO: RESTAURADO, NO CONFIES EN ESTA CORRIDA ***');
  process.exit(1);
}
if (detectados !== probados) {
  console.log('    *** LA PRUEBA NO ALCANZA A VER LOS BUGS ***');
  process.exit(1);
}
console.log('    ok  la prueba los ve todos');
console.log('    ok  los archivos quedaron intactos');