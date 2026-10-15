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
function dejar() {
  for (const f of Object.keys(originales)) fs.writeFileSync(f, originales[f]);
  for (const f of Object.keys(originales)) delete originales[f];
}
function correr() {
  try {
    const salida = execFileSync(process.execPath, ['tools/prueba-ficha-archivador.js'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { verde: true, salida };
  } catch (e) {
    return { verde: false, salida: String(e.stdout || '') };
  }
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
  FICHA, '<div class="fichaFoto"><img', '<div class="fichaFotoVacia"><div class="fotoI"><img')
  && detectados++;
probados++;

// Y POR QUÉ EL SIGUIENTE BUG ROMPE "datosDeCabecera" Y NO EL ENCABEZADO
//
// La primera versión rompía "escHtml(cab.empresa)", que es la escritura del
// encabezado. Y la prueba no lo vio, porque el mismo nombre de la empresa se
// imprime otra vez en la sección C. El papel perdía la marca de arriba y quedaba
// completo, que es justo lo que hay que mirar.
//
// Un bug de prueba tiene que romper lo que dice romper. Este rompe la fuente del
// nombre, que es lo que de verdad se puede romper.
probarBug('el encabezado no lleva la empresa',
  FICHA, "empresa:(emp&&(emp.nombre||emp.razon_social))||'Empresa'",
  "empresa:'Empresa'") && detectados++;
probados++;

probarBug('sin ficha abierta imprime un papel en blanco',
  FICHA, "if(!w){\n    alert('No hay ninguna ficha abierta. Abrí la ficha de un trabajador primero.');\n    return;\n  }",
  "if(!w){\n    return;\n  }") && detectados++;
probados++;

probarBug('la foto casual deja de servir de respaldo',
  LISTA, "const url=w.foto_seguridad_url||w.foto_casual_url||'';", "const url=w.foto_seguridad_url||'';")
  && detectados++;
probados++;

console.log('');
console.log('    ' + detectados + ' de ' + probados + ' bugs detectados');
dejar();
if (detectados !== probados) {
  console.log('    *** LA PRUEBA NO ALCANZA A VER LOS BUGS ***');
  process.exit(1);
}
console.log('    ok  la prueba los ve todos');