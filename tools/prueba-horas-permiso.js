// ===================================================================
// PRUEBA-HORAS-PERMISO
// ===================================================================
// LOS CINCO CASOS DIFÍCILES DE "horasDePermiso", CON SU NÚMERO ESPERADO
//
// ---------------------------------------------------------------------
// POR QUÉ UNA PRUEBA Y NO SÓLO MIRAR EL CÓDIGO
// ---------------------------------------------------------------------
//
// Porque "horasDePermiso" devuelve un número, y un número un poco bajo no se ve
// mal: se ve raro. Nadie va a leer una tabla de permisos y pensar "esta hora
// está mala". Se lo cree, se lo copia a un informe y el error viaja.
//
// Con la función pura —datos por parámetro, sin pantalla ni base— los cinco
// casos que salen mal en la vida real se pueden comprobar con Node. Y son los
// mismos cinco que se.Invariant:
//
//   1. el permiso que pasa de medianoche        (sin +24 h, sale negativo)
//   2. el permiso que NO cubre la colación      (restarla sería inventarse tiempo)
//   3. el permiso que SÍ cubre la colación      (no restarla sería inventar)
//   4. la empresa sin colación cargada          (restar 30 de relleno)
//   5. el rango que daría negativo              (un "-0:30" en una planilla)
//
// ---------------------------------------------------------------------
// Y POR QUÉ SE COPIA EL CÓDIGO REAL DEL ARCHIVO
// ---------------------------------------------------------------------
//
// Si la prueba tuviera su propia copia del cálculo, las dos podrían estar bien
// y la pantalla hacer otra cosa. Se saca de "views/administracion/
// registro-permisos.js", el archivo que la aplicación carga de verdad. Y si
// "horasDePermiso" desapareciera de allá, esta prueba tiene que romperse: eso es
// justo lo que tiene que pasar.
//
// ---------------------------------------------------------------------
// Y POR QUÉ SE INYECTA "minutosDe" Y "textoDuracion"
// ---------------------------------------------------------------------
//
// Porque no están en ese archivo: viven en "administracion.js", y los archivos
// comparten el ámbito. Se copian desde SU archivo, por la misma razón que en
// "prueba-conciliacion.js".

'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------
// 1. COPIAR LA FUNCIÓN REAL
// ---------------------------------------------------------------------
const RUTA_FUENTE = 'views/administracion/registro-permisos.js';
const src = fs.readFileSync(path.join(RAIZ, RUTA_FUENTE), 'utf8');

const desde = src.indexOf('function horasDePermiso(');
if (desde < 0) {
  console.log('  *** no se encontró "horasDePermiso" en ' + RUTA_FUENTE);
  process.exit(1);
}
// Y SE CORTA POR LA PRIMERA LLAVADA QUE CIERRA EN LA COLUMNA 0
//
// Es la forma que no se rompe por los finales de línea: el archivo está con
// CRLF y un "indexOf('\n}')" a secas no lo encuentra. Ver el mismo apunte en
// "prueba-conciliacion.js".
const finFuncion = src.indexOf('\n}', desde) + 2;
let bloque = src.slice(desde, finFuncion);

// Y LAS DOS AYUDAS QUE USA, DESDE SU ARCHIVO
function copiarFuncion(archivo, nombre) {
  const s = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
  const i = s.indexOf('function ' + nombre + '(');
  if (i < 0) {
    console.log('  *** no se encontró "' + nombre + '" en ' + archivo
      + ', y "horasDePermiso" lo necesita');
    process.exit(1);
  }
  return s.slice(i, s.indexOf('\n}', i) + 2);
}
bloque += '\n' + copiarFuncion('views/administracion/administracion.js', 'minutosDe');
bloque += '\n' + copiarFuncion('views/administracion/administracion.js', 'textoDuracion');

const api = new Function(bloque + '\nreturn {horasDePermiso};')();
console.log('  el bloque copiado mide ' + bloque.length + ' caracteres');
console.log('');

// ---------------------------------------------------------------------
// 2. LOS CASOS
// ---------------------------------------------------------------------

// Una empresa con colación cargada, que es el caso normal.
const EMPRESA_CON_COLACION = { colacion_inicio: '13:00', colacion_duracion_min: 30 };
// Y una empresa que todavía no acordado su jornada: NO se inventa nada.
const EMPRESA_SIN_COLACION = { colacion_inicio: null, colacion_duracion_min: null };
// Y una empresa con la colación tarde, para el permiso de la noche.
const EMPRESA_COLACION_TARDE = { colacion_inicio: '23:00', colacion_duracion_min: 30 };

const CASOS = [
  {
    nombre: 'el permiso simple, sin colación de por medio',
    porque: '09:00 a 12:00 son tres horas, y da igual dónde esté la colación.',
    inicio: '09:00', fin: '12:00', empresa: EMPRESA_CON_COLACION,
    minutos: 180, cruza: false
  },
  {
    nombre: 'NO cubre la colación, y no se descuenta',
    porque: 'Termina a las 12:00 y la empresa almuerza a las 13:00: esa persona no se fue a colación.',
    inicio: '09:00', fin: '12:00', empresa: EMPRESA_CON_COLACION,
    minutos: 180, cruza: false
  },
  {
    nombre: 'SÍ cubre la colación, y se descuenta',
    porque: 'De 12:00 a 16:00, con colación de 30 minutos a las 13:00: son dos horas y media.',
    inicio: '12:00', fin: '16:00', empresa: EMPRESA_CON_COLACION,
    minutos: 210, cruza: false
  },
  {
    nombre: 'cruza la medianoche',
    porque: 'De 22:00 a 02:00 son cuatro horas de reloj, no menos veinte.',
    inicio: '22:00', fin: '02:00', empresa: EMPRESA_CON_COLACION,
    minutos: 240, cruza: true
  },
  {
    nombre: 'cruza la medianochez Y cubre una colación tardía',
    porque: 'De 23:00 a 03:00 con colación a las 23:30: media hora menos.',
    inicio: '23:00', fin: '03:00', empresa: EMPRESA_COLACION_TARDE,
    minutos: 210, cruza: true
  },
  {
    nombre: 'la empresa no tiene colación cargada',
    porque: 'Sin "colacion_inicio" no hay nada que descontar. Si se descontara un valor de relleno, se inventarían 30 minutos de cada permiso.',
    inicio: '12:00', fin: '16:00', empresa: EMPRESA_SIN_COLACION,
    minutos: 240, cruza: false
  },
  {
    nombre: 'el rango que daría negativo',
    porque: 'Un permiso de cero minutos que igual alcanza a cubrir una colación de una hora. Se muestra 0 y se avisa, nunca -1 h.',
    inicio: '13:00', fin: '13:00',
    empresa: { colacion_inicio: '13:00', colacion_duracion_min: 60 },
    minutos: 0, cruza: false, inconsistente: true
  },
  {
    nombre: 'horas que no se pueden leer',
    porque: 'Una franja con la hora vacía no puede dar NaN en una tabla.',
    inicio: '', fin: '10:00', empresa: EMPRESA_CON_COLACION,
    minutos: 0, cruza: false, inconsistente: true
  },
  {
    nombre: 'segundos en vez de "HH:MM"',
    porque: 'Postgres devuelve "time" como "09:00:00". Cortar los primeros cinco es lo mismo, pero tiene que ser lo mismo.',
    inicio: '09:00:00', fin: '12:00:00', empresa: EMPRESA_CON_COLACION,
    minutos: 180, cruza: false
  }
];

let fallos = 0;
CASOS.forEach(function (c) {
  const r = api.horasDePermiso(c.inicio, c.fin, c.empresa);
  const problemas = [];
  if (r.minutos !== c.minutos) {
    problemas.push('minutos: esperaba ' + c.minutos + ' y salió ' + r.minutos);
  }
  if (!!r.cruza_medianoche !== !!c.cruza) {
    problemas.push('cruza_medianoche: esperaba ' + !!c.cruza + ' y salió ' + !!r.cruza_medianoche);
  }
  if (!!r.inconsistente !== !!c.inconsistente) {
    problemas.push('inconsistente: esperaba ' + !!c.inconsistente + ' y salió ' + !!r.inconsistente);
  }
  // Y NUNCA UN NÚMERO NEGATIVO, EN NINGÚN CASO
  if (!(r.minutos >= 0)) problemas.push('salió negativo: ' + r.minutos);
  // Y CUANDO ES INCONSISTENTE, TIENE QUE DECIR POR QUÉ
  if (r.inconsistente && !r.nota) problemas.push('es inconsistente pero no explica por qué');

  if (problemas.length) {
    fallos++;
    console.log('  *** ' + c.nombre);
    console.log('      ' + c.porque);
    problemas.forEach(function (p) { console.log('      - ' + p); });
  } else {
    console.log('  ok  ' + c.nombre);
    console.log('      ' + c.inicio + ' a ' + c.fin + '  ->  ' + r.minutos + ' min  (' + r.horas + ')');
    if (r.nota) console.log('      nota: ' + r.nota);
  }
});

// ---------------------------------------------------------------------
// 3. LO QUE EL CÓDIGO DICE EN COMENTARIO, Y LO QUE HACE
// ---------------------------------------------------------------------
// Y NO ES COSMÉTICO: la regla de la colación está escrita arriba en el archivo,
// y si alguien la cambia sin leer el comentario, esta comprobación se entera.
console.log('');
console.log('  === la función tiene que seguir hablando de sus reglas ===');
const REGLAS = [
  ['medianoche', 'el cruce de medianoche'],
  ['colación', 'la regla de la colación']
];
REGLAS.forEach(function (r) {
  const esta = src.indexOf(r[0]) >= 0;
  console.log('    ' + (esta ? 'ok  ' : '*** ') + 'menciona ' + r[1] + ' en un comentario');
  if (!esta) fallos++;
});

console.log('');
if (fallos) {
  console.log('  *** ' + fallos + ' PROBLEMA(S). El cálculo de horas no es el que dice el comentario.');
  console.log('');
  process.exit(1);
}
console.log('  ok  los ' + CASOS.length + ' casos dan el número que corresponde');
console.log('');