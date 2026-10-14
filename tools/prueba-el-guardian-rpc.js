// ===================================================================
// prueba-el-guardian-rpc.js  —  DE UN SOLO USO, SE BORRA DESPUÉS
// ===================================================================
// Inyecta UNA función inventada y comprueba que el guardián la vea.
//
// ---------------------------------------------------------------------
// POR QUÉ HAY QUE PROBARLO ASÍ Y NO CONFÍAR
// ---------------------------------------------------------------------
//
// Porque ya pasó: la primera vez que se probó, el "Replace" de PowerShell se
// comió el salto de línea del archivo y NO cambiaronada, y el guardián dio verde
// con el bug puesto. Un guardián que no se ha visto fallar nunca no se sabe si
// falla o no.
//
// Y es peor de lo que parece: si el guardián es verde con un nombre inventado en
// el código, está haciendo exactamente lo contrario de lo que se le pidió, y
// nadie se va a enterar.
//
// ---------------------------------------------------------------------
// POR QUÉ ESCRIBE CON NODE Y NO CON POWERSHELL
// ---------------------------------------------------------------------
//
// Porque el archivo está en CRLF y el "Replace" de PowerShell trabaja sobre texto
// que ya normalizó. Node lee los bytes y los cambia por posición, así que el
// archivo queda como estaba, solo con el nombre distinto.
//
// ---------------------------------------------------------------------
// Y AL FINAL LO DEVUELVE
// ---------------------------------------------------------------------
//
// Y además de volver atrás, comprueba que volvió: si el archivo queda distinto de
// como estaba, la prueba no sirve y no dice nada.

'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const REL = 'js/permisos-horarios.js';
const VIEJO = "rpc('pedir_permiso_horario'";
const NUEVO = "rpc('permiso_que_no_existe_en_ninguna_migracion'";

const p = path.join(RAIZ, REL);
const antes = fs.readFileSync(p, 'utf8');

console.log('');
console.log('  === probando el guardian de las rpc ===');

if (antes.indexOf(VIEJO) < 0) {
  console.log('  *** el texto a cambiar no está: la prueba no sirve');
  process.exit(1);
}

fs.writeFileSync(p, antes.replace(VIEJO, NUEVO), 'utf8');
const inyectado = fs.readFileSync(p, 'utf8');
if (inyectado.indexOf(NUEVO) < 0) {
  console.log('  *** la inyección no se aplicó: la prueba no sirve');
  fs.writeFileSync(p, antes, 'utf8');
  process.exit(1);
}
console.log('  ** inyectado: ahora el codigo pide "' + NUEVO + '"');
console.log('');

// Y SE CORRE EL GUARDIÁN
const { execFileSync } = require('child_process');
let fallo = null;
let salida = '';
try {
  salida = execFileSync(process.execPath, [path.join(RAIZ, 'tools', 'comprueba-rpc-que-existen.js')],
    { encoding: 'utf8' });
} catch (error) {
  // Un guardián en rojo sale con código distinto de cero, y eso es lo que se busca
  fallo = error.status;
  salida = error.stdout || '';
}

const vio = salida.indexOf('permiso_que_no_existe') >= 0;
const enRojo = fallo !== null && fallo !== 0;

// Y SE DEVUELVE EL ARCHIVO, Y SE COMPRUEBA QUE VOLVIÓ
fs.writeFileSync(p, antes, 'utf8');
const devuelto = fs.readFileSync(p, 'utf8');
const volvio = devuelto === antes;

console.log('');
console.log('  el guardian vio el nombre inventado : ' + (vio ? 'SI' : 'NO'));
console.log('  el guardian salio en rojo           : ' + (enRojo ? 'SI' : 'NO'));
console.log('  el archivo volvio a como estaba     : ' + (volvio ? 'SI' : 'NO'));
console.log('');

if (!vio || !enRojo || !volvio) {
  console.log('  *** LA PRUEBA FALLA: este guardian no sirve para nada ===');
  if (!vio) console.log('      no vio el nombre que se le inventó');
  if (!enRojo) console.log('      lo vio y no se quejó');
  if (!volvio) console.log('      y el archivo no quedó como estaba');
  process.exit(1);
}

console.log('  ok  el guardian ve el defecto, avisa, y el archivo queda como estaba');
console.log('');