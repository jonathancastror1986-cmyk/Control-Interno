// PROBAR QUE "comprueba-ids-unicos" PUEDE FALLAR
// ================================================
//
// -------------------------------------------------------------------
// POR QUÉ HAY QUE PROBAR UN GUARDIÁN
// ----------------------------------
//
// Porque un guardián que nunca falla no está probando nada: pasa siempre, uno se acostumbra
// a verlo en verde y deja de mirarlo. Y el día que hay que confiar en él para decir "ya
// está", es cuando no sirve.
//
// La forma de comprobarlo es inyectar el defecto y ver que lo pesca: se rompe a propósito y
// tiene que decir que está roto. Si el guardián pasa con el defecto adentro, el guardián
// está mal. Ver [tarja-14].
//
// -------------------------------------------------------------------
// Y CÓMO SE ROMPE
// ---------------
//
// Con lo mismo que rompió de verdad: un bloque repetido. Se copia una línea que ya tiene
// "id" y se pega al lado. Que es exactamente lo que hicieron tres guiones.
//
const fs = require('fs');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const GUARDIAN = RAIZ + 'tools/comprueba-ids-unicos.js';
const PROBETA = RAIZ + 'pages/_prueba-ids.html';
const TEMP = 'C:/Users/mrj0t/AppData/Local/Temp/opencode/';

function correr(etiqueta) {
  try {
    const salida = execFileSync(process.execPath, [GUARDIAN], {
      encoding: 'utf8', stdio: 'pipe',
    });
    console.log('    ' + etiqueta + ': el guardián PASÓ (salida ' + salida.length + ')');
    return true;
  } catch (e) {
    const salida = String(e.stdout || '');
    console.log('    ' + etiqueta + ': el guardián FALLÓ');
    salida.split('\n').filter(function (x) { return /REPETID|id=|L\d/.test(x); })
      .slice(0, 5).forEach(function (x) { console.log('        ' + x.trim().slice(0, 78)); });
    return false;
  }
}

let malas = 0;

console.log('  === el guardián con las páginas como están ===');
const antes = correr('estado real');
if (!antes) {
  console.log('');
  console.log('  *** EL GUARDIÁN FALLA CON EL CÓDIGO LIMPIO ***');
  process.exit(1);
}

// -------------------------------------------------------------------
// 1) UN "id" REPETIDO
// -------------------------------------------------------------------
console.log('');
console.log('  === caso 1: una línea repetida al lado ===');
fs.writeFileSync(PROBETA,
  '<!doctype html>\r\n<html><body>\r\n'
  + '  <input id="campo">\r\n'
  + '  <input id="campo">\r\n'
  + '</body></html>\r\n', 'utf8');
const c1 = correr('id repetido 2 veces');
if (c1) { console.log('  *** NO LO PESCA ***'); malas++; }

// -------------------------------------------------------------------
// 2) TRES VECES, Y QUE DIGA LAS TRES
// -------------------------------------------------------------------
console.log('');
console.log('  === caso 2: tres veces, y tiene que decir tres ===');
fs.writeFileSync(PROBETA,
  '<!doctype html>\r\n<html><body>\r\n'
  + '  <input id="campo">\r\n'
  + '  <input id="campo">\r\n'
  + '  <input id="campo">\r\n'
  + '</body></html>\r\n', 'utf8');
const c2 = correr('id repetido 3 veces');
if (c2) { console.log('  *** NO LO PESCA ***'); malas++; }

// Y que diga "3 veces". Borrar uno y dejar dos sigue roto, así que el número importa.
try {
  execFileSync(process.execPath, [GUARDIAN], { encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
  const salida = String(e.stdout || '');
  if (salida.indexOf('3 veces') < 0) {
    console.log('  *** DICE LAS COPIAS PERO NO EL NÚMERO ***');
    console.log('    Un guardián que solo avisa "repetido" no sirve para saber si hay que');
    console.log('    borrar dos o tres. Ver [tarja-15].');
    malas++;
  } else {
    console.log('    ok  y dice "3 veces", no solo "repetido"');
  }
}

// -------------------------------------------------------------------
// 3) DOS "id" DISTINTOS REPETIDOS
// -------------------------------------------------------------------
console.log('');
console.log('  === caso 3: dos "id" repetidos a la vez ===');
fs.writeFileSync(PROBETA,
  '<!doctype html>\r\n<html><body>\r\n'
  + '  <input id="uno"><input id="uno">\r\n'
  + '  <input id="dos"><input id="dos">\r\n'
  + '</body></html>\r\n', 'utf8');
const c3 = correr('dos ids repetidos');
if (c3) { console.log('  *** NO LOS PESCAN ***'); malas++; }

// -------------------------------------------------------------------
// 4) UN "id" QUE SOLO SE PARECE
// -------------------------------------------------------------------
// Y este es el que importa: "audEmpresa" y "audEmpresa2" NO son el mismo "id". Un guardián
// que los confunda se queja de algo que está bien, y uno que se acostumbra a quejarse
// deja de mirar el archivo.
console.log('');
console.log('  === caso 4: "id" parecidos pero distintos ===');
fs.writeFileSync(PROBETA,
  '<!doctype html>\r\n<html><body>\r\n'
  + '  <input id="audEmpresa">\r\n'
  + '  <input id="audEmpresa2">\r\n'
  + '  <input id="audEmpresaX">\r\n'
  + '</body></html>\r\n', 'utf8');
const c4 = correr('ids parecidos');
if (!c4) { console.log('  *** LOS CONFUNDE ***'); malas++; }

// -------------------------------------------------------------------
// 5) SIN NADA REPETIDO
// -------------------------------------------------------------------
console.log('');
console.log('  === caso 5: todo distinto ===');
fs.writeFileSync(PROBETA,
  '<!doctype html>\r\n<html><body>\r\n'
  + '  <input id="uno"><input id="dos"><input id="tres">\r\n'
  + '</body></html>\r\n', 'utf8');
const c5 = correr('nada repetido');
if (!c5) { console.log('  *** FALLA SIN MOTIVO ***'); malas++; }

// -------------------------------------------------------------------
// 6) UN "id" DENTRO DE UN "onclick" NO CUENTA
// -------------------------------------------------------------------
console.log('');
console.log('  === caso 6: un "id" dentro de código, no de una etiqueta ===');
fs.writeFileSync(PROBETA,
  '<!doctype html>\r\n<html><body>\r\n'
  + '  <button onclick="abrir(\'id=algo\')">x</button>\r\n'
  + '  <input id="real">\r\n'
  + '</body></html>\r\n', 'utf8');
const c6 = correr('id dentro de código');
if (!c6) { console.log('  *** CUENTA UN "id" QUE NO ES UN "id" ***'); malas++; }

// -------------------------------------------------------------------
// Y DEJAR TODO COMO ESTABA
// -------------------------------------------------------------------
fs.unlinkSync(PROBETA);

// -------------------------------------------------------------------
// 7) Y QUE AL FINAL EL CÓDIGO REAL SIGA PASANDO
// -------------------------------------------------------------------
console.log('');
console.log('  === y el código real, después de las pruebas ===');
const final = correr('estado real otra vez');
if (!final) {
  console.log('');
  console.log('  *** LAS PRUEBAS DEJARON ALGO ROTO ***');
  process.exit(1);
}

console.log('');
if (malas) {
  console.log('  *** ' + malas + ' CASO(S) MAL ***');
  process.exit(1);
}
console.log('    ok  el guardián pesa los seis casos y el código real sigue limpio');
