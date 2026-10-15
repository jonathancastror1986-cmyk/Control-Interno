// ===================================================================
// tools/corre-los-guardianes.js
// ===================================================================
// CORRE TODOS LOS GUARDIANES Y DICE SI ALGUNO ESTÁ EN ROJO
// ===================================================================
//
// ---------------------------------------------------------------------
// POR QUÉ ESTE ARCHIVO EXISTE
// ---------------------------------------------------------------------
//
// Porque la lista de guardianes vivía dentro de un comando de Powershell que se
// escribía a mano, cada vez, antes de cada push. Cuarenta veces está bien. La
// cuarenta y primera, con un guardián nuevo que se te olvidó en la lista, es un push
// que sale con un código roto.
//
// Y eso no es un descuido del que escribe: es una lista escrita en un lugar donde no
// se puede revisar. Un guardián que existe pero que nadie corre es lo mismo que un
// guardián que no existe.
//
// ---------------------------------------------------------------------
// Y POR QUÉ LA LISTA ESTÁ ACÁ Y NO SE DESCUBRE SOLO
// ---------------------------------------------------------------------
//
// Porque en la carpeta hay cosas que NO son guardianes: "sirve.js" levanta un
// servidor, "sube-la-version.js" escribe archivos, "saca-comentarios.js" reescribe
// código. Si se corriera todo lo que hay, un push ejecutaría un servidor y se quedaría
// colgado.
//
// La lista es explícita a propósito: si un guardián nuevo no está acá, hay que
// agregarlo, y al agregarlo queda a la vista que es nuevo.
//
// ---------------------------------------------------------------------
// Y POR QUÉ FALLA EL PROCESO Y NO SOLO IMPRIME
// ---------------------------------------------------------------------
//
// Porque este script corre antes de cada push, y lo que corre antes de un push
// tiene que poder detener el push. Si solamente imprimiera un rojo, tarde o temprano
// alguien lee elScroll y empuja igual.
//
// El código de salida es 1 si algún guardián falló.

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------
// LA LISTA, QUE ES LO ÚNICO QUE HAY QUE MANTENER
// ---------------------------------------------------------------------
//
// Y POR QUÉ ESTÁ ORDENADA POR LO QUE PROTEGE Y NO POR EL NOMBRE
//
// Porque cuando un guardián nuevo se agrega al final, el que se lee es el último, y
// el último es el que nadie revisa. Y en esta lista el orden no es alfabético, es el
// orden en que importa que estén verdes.
//
// El orden real: primero lo que evita que no compile nada, después lo que evita que
// se rompa la base, después lo que evita que la pantalla mienta, y al final lo que
// revisa los acuerdos entre archivos.
const GUARDIANES = [
  // Y LO PRIMERO: QUE EL CÓDIGO SEA CÓDIGO
  'compila-javascript',
  'prueba-compila-javascript',
  'compila-juntos',
  'comprueba-parentesis',
  'comprueba-mojibake',
  'comprueba-codigos',
  'prueba-comprueba-codigos',
  'parea-finales',

  // Y DESPUÉS: QUE LA BASE NO SE ROMPA
  // -------------------------------------------------------------------
  // Los guardianes de SQL van acá y no más abajo porque una migración con un tipo
  // mal declarado no se rompe en la pantalla: se rompe cuando alguien la corre, y
  // para entonces ya está aplicada.
  'revisa-nombres-sql',
  'prueba-revisa-nombres-sql',
  'comprueba-codigo-sql',
  'prueba-comprueba-codigo-sql-raise',
  'comprueba-columnas',
  'comprueba-migracion-corta',
  'prueba-comprueba-065',
  'comprueba-rpc-que-existen',
  'prueba-el-guardian-rpc',

  // Y DESPUÉS: QUE LA PANTALLA NO MINTA
  'comprueba-ids-unicos',
  'prueba-ids-unicos',
  'comprueba-rutas',
  'comprueba-la-vista',
  'comprueba-modulos',
  'prueba-campos',
  'prueba-campos-contrato',
  'prueba-conciliacion',
  'prueba-movil',
  'prueba-hora-excel',
  'prueba-archivo-seguro',

  // Y DESPUÉS: LOS ACUERDOS ENTRE ARCHIVOS
  'comprueba-la-version',
  'prueba-sube-versiones',
  'prueba-rut-normalizado',
  'permiso-estricto',
  'comprueba-color-sobre-fondo',
  'prueba-comprueba-color-sobre-fondo',
  'comprueba-060',

  // Y AL FINAL, LAS PRUEBAS DE LO NUEVO
  // -------------------------------------------------------------------
  // Van al final porque son las que se escriben hoy, y porque son las que hay que
  // volver a mirar cuando se cambia algo en esa parte.
  'prueba-ficha-archivador',
  'inyecta-bug-ficha'
];

const SALIDA_LIMPIA = 'pipe';

function correrUno(nombre) {
  const ruta = path.join(__dirname, nombre + '.js');
  const r = spawnSync(process.execPath, [ruta], {
    encoding: 'utf8',
    stdio: ['ignore', SALIDA_LIMPIA, SALIDA_LIMPIA],
    timeout: 10 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024
  });
  // Y UN GUARDIÁN QUE SE CUELGA ES UN GUARDIÁN EN ROJO
  //
  // Porque "no terminó nunca" y "terminó bien" se ven iguales desde el shell si no se
  // pregunta, y un guardián colgado es un guardián que no está protegiendo nada.
  if (r.error && r.error.code === 'ETIMEDOUT') {
    return { nombre, ok: false, motivo: 'se colgó: pasó de los 10 minutos' };
  }
  if (r.error) {
    return { nombre, ok: false, motivo: 'no se pudo ejecutar: ' + r.error.message };
  }
  if (r.status !== 0) {
    return { nombre, ok: false, motivo: 'exit ' + r.status };
  }
  return { nombre, ok: true };
}

console.log('');
console.log('  === los ' + GUARDIANES.length + ' guardianes ===');

let rojos = [];
const salida = [];
for (const nombre of GUARDIANES) {
  const r = correrUno(nombre);
  if (r.ok) {
    console.log('    ok   ' + r.nombre);
  } else {
    console.log('    ***  ' + r.nombre + '  (' + r.motivo + ')');
    rojos.push(r);
    // Y SE CORRE EL RESTO IGUAL, PARA NO TENER QUE VOLVER A ESCRIBIR LA LISTA
    //
    // Porque interesa saber cuántos están rojos, no solo el primero. Si se cortara en
    // el primero, cada pasada nueva taparía los demás y habría que ir de a uno.
  }
}

console.log('');
if (rojos.length) {
  console.log('  *** ' + rojos.length + ' EN ROJO. NO SE SUBE NADA:');
  rojos.forEach(function (r) { console.log('        ' + r.nombre + '  (' + r.motivo + ')'); });
  console.log('');
  process.exit(1);
}
console.log('  ok  los ' + GUARDIANES.length + ' guardianes en verde');
console.log('');