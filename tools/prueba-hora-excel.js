// ===================================================================
// PRUEBA-HORA-EXCEL
// ===================================================================
// QUE LA HORA DEL RELOJ SE LEA BIEN, Y QUE NO DEPENDA DE LA ZONA HORARIA
//
// ---------------------------------------------------------------------
// EL BUG, CON SU NÚMERO
// ---------------------------------------------------------------------
//
// Con el archivo real ("Entrada Modelo.xlsx", del RelojControl), la primera fila
// trae la hora 0.31883101851851853, que es las 07:39.
//
// "leerPrimeraHoja" lee con "cellDates:true". Eso convierte una celda de SOLO HORA
// en un "Date", y SheetJS la arma en UTC:
//
//     1899-12-30T07:39:07Z
//
// Y "horaDesdeValor" leía eso con "getHours()", que es hora LOCAL. En Chile, 1899
// no era UTC-3: era la hora media local, UTC-4:42.
//
//     07:39  -  4:42  =  02:56
//
// O sea: el archivo dice 07:39 y se guardaba 02:56. Y no era un corrimiento
// redondo de 3 horas, sino de 4 horas y 43 minutos, que es el detalle que lo hace
// más difícil de reconocer.
//
// ---------------------------------------------------------------------
// Y POR QUÉ ES UN FALLO GRAVE Y NO UN DESCUADRE DE UNA HORA
// ---------------------------------------------------------------------
//
// 1. No da ningún error. El marcaje se guarda, la planilla lo acepta, y la
//    conciliación lo muestra como si fuera cierto.
//
// 2. Depende de la MÁQUINA. El desfase sale de la zona horaria donde se abre la
//    pantalla, así que el mismo archivo da horas distintas según el equipo. Un
//    número que depende de dónde se miró no es un dato.
//
// 3. Se descubre tarde. El que compara la hora de entrada con el reloj ve que algo
//    no calza, y no hay ningún rastro de por qué.
//
// ---------------------------------------------------------------------
// LO QUE SE COMPRUEBA
// ---------------------------------------------------------------------
//
//   - El número crudo, que es lo que da el reloj. Tiene que salir 07:39.
//   - El "Date" que arma SheetJS, que es lo que llega de verdad. También 07:39.
//   - Que no dependa de la zona horaria: la misma entrada tiene que dar lo mismo
//     con cualquier "TZ" del proceso.
//
// Y LA ÚLTIMA ES LA IMPORTANTE: si el resultado cambia con la zona horaria,
// el bug vuelve, aunque hoy el número del caso particular dé bien.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const RAIZ = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------
// EL CÓDIGO REAL
// ---------------------------------------------------------------------
// Y SE COPIA DEL ARCHIVO QUE USA LA APLICACIÓN, CON "hhmmDe" Y TODO
const src = fs.readFileSync(path.join(RAIZ, 'views/administracion/documentos.js'), 'utf8');
const i = src.indexOf('function horaDesdeValor(');
const j = src.indexOf('// Busca un encabezado sin importar tildes');
if (i < 0 || j < 0 || j <= i) {
  console.log('  *** no se encontró "horaDesdeValor" en documentos.js');
  process.exit(1);
}
const bloque = src.slice(i, j);

// ---------------------------------------------------------------------
// LOS CASOS, TOMADOS DEL ARCHIVO REAL
// ---------------------------------------------------------------------
const CASOS = [
  // [entrada, qué tiene que salir, por qué]
  [0.31883101851851853, '07:39', 'la primera fila del archivo real: 07:39'],
  [0.30071759259259262, '07:13', 'la segunda fila del archivo real: 07:13'],
  [0.25, '06:00', 'un cuarto del día son las 06:00'],
  [0.5, '12:00', 'la mitad del día es mediodía'],
  [0.9895833333333334, '23:45', 'casi el final del día'],
  [21, '21:00', 'el reloj también guarda 21 = 21:00, no 21/24'],
  [7.5, '07:30', 'hora de Excel con minutos'],
  ['07:45', '07:45', 'texto con dos puntos'],
  ['7.45', '07:45', 'punto en vez de dos puntos'],
  ['', '', 'vacío: no hay hora'],
  [null, '', 'nada: no hay hora'],
  [99, '', 'un número que no es hora ni fracción'],
];

// ---------------------------------------------------------------------
// LA CORRECCIÓN
// ---------------------------------------------------------------------
const fn = new Function(bloque + '\nreturn horaDesdeValor;')();
let mal = 0;
console.log('  ---- lo que dice la hora de cada fila ----');
CASOS.forEach(function (c) {
  const sale = fn(c[0], '2026-10-08');
  const ok = sale === c[1];
  if (!ok) mal++;
  console.log('    ' + (ok ? 'ok  ' : '*** ') + String(c[0]).padEnd(22) + '-> ' + JSON.stringify(sale)
    + (ok ? '   ' + c[2] : '   esperaba ' + JSON.stringify(c[1]) + ' · ' + c[2]));
});

// ---------------------------------------------------------------------
// EL CASO QUE SE ROMPIÓ: EL "DATE" QUE ARMA SHEETJS
// ---------------------------------------------------------------------
console.log('');
console.log('  ---- el Date que arma SheetJS con "cellDates:true" ----');
// Y SE CONSTRUYE AQUÍ, NO SE COPIA UN VALOR FIJO, PARA QUE EL CASO SIGA SIENDO
// VERDADERO SI SE CAMBIA EL FORMATO DE LA CELDA
const frac = 0.31883101851851853;
const comoDate = new Date(Date.UTC(1899, 11, 30) + Math.round(frac * 86400000));
console.log('    el archivo trae:  ' + frac + '   (son las 07:39)');
console.log('    SheetJS lo arma:  ' + comoDate.toISOString());
const conDate = fn(comoDate, '2026-10-08');
const conNumero = fn(frac, '2026-10-08');
console.log('    ' + (conDate === '07:39' ? 'ok  ' : '*** ') + 'con el Date:      ' + conDate
  + (conDate === '07:39' ? '' : '   <-- el bug: tenía que ser 07:39'));
console.log('    ' + (conNumero === '07:39' ? 'ok  ' : '*** ') + 'con el número:    ' + conNumero);
if (conDate !== '07:39') mal++;
if (conNumero !== '07:39') mal++;
// Y QUE LOS DOS CAMINOS DEN LO MISMO
console.log('    ' + (conDate === conNumero ? 'ok  ' : '*** ') + 'los dos caminos coinciden: '
  + (conDate === conNumero ? 'sí' : 'NO, y eso es lo que hacía que dependiera del formato'));
if (conDate !== conNumero) mal++;

// ---------------------------------------------------------------------
// Y QUE NO DEPENDA DE LA ZONA HORARIA DE LA MÁQUINA
// ---------------------------------------------------------------------
console.log('');
console.log('  ---- que no dependa de la zona horaria ----');
// Y SE CORRE EL MISMO CÓDIGO CON VARIAS ZONAS, EN PROCESOS SEPARADOS
//
// Y por qué en procesos separados y no cambiando una variable: "TZ" se lee una vez
// al arrancar el proceso de Node, y cambiarla por dentro no hace nada. Cambiarla
// de verdad es correr el mismo guion con la variable puesta en el ENTORNO del
// proceso hijo, que es lo que hace este llamado.
//
// Y LA PRIMERA VERSIÓN PASABA LA ZONA COMO ARGUMENTO Y NO EN EL ENTORNO
//
// Con el argumento, los cinco procesos corrían en la zona de la máquina y los cinco
// decían "07:39". El test daba verde, y no estaba probando nada: el bug original
// también daba verde en ese caso, porque en la máquina donde se probaba el
// desfase se.cancelaba solo. Un guardián que no puede fallar no es un guardián.
//
// Por eso ahora la zona va en el entorno, Y ADEMÁS se comprueba que los desfases
// sean distintos antes de dar por buena la prueba.
const ZONAS = ['America/Santiago', 'America/Bogota', 'America/Mexico_City', 'Europe/Madrid', 'Asia/Tokyo'];
const Temporal = path.join(path.dirname(process.argv[1] || __filename), 'prueba-hora-excel-zona.js');
const offsets = new Set();
const resultados = new Map();
ZONAS.forEach(function (z) {
  const salida = execFileSync(process.execPath, [Temporal, z], {
    encoding: 'utf8',
    // Y LA ZONA VA EN EL ENTORNO DEL HIJO, QUE ES LO QUE NODE LEE AL ARRANCAR
    env: Object.assign({}, process.env, { TZ: z }),
  });
  const r = JSON.parse(salida.trim().split(/\r\n|\n|\r/).pop());
  offsets.add(r.offset);
  resultados.set(z, r);
});

console.log('    los desfases quecorrieron de verdad: ' + [...offsets].sort((a, b) => a - b).join(', '));
// Y ESTE ES EL CONTROL IMPORTANTE
//
// Si todas las zonas dieron el mismo desfase, la máquina no hizo caso de "TZ" y la
// prueba no probó nada. Se avisa como fallo, porque un guardián que no puede
// detectar el error que dice detectar es peor que no tenerlo.
const variaron = offsets.size > 1;
console.log('    ' + (variaron ? 'ok  ' : '*** ') + 'las zonas horarias fueron de verdad distintas'
  + (variaron ? '' : ': esta máquina no hizo caso de "TZ" y la prueba NO midió nada'));
if (!variaron) mal++;

ZONAS.forEach(function (z) {
  const r = resultados.get(z);
  const ok = r.conDate === '07:39' && r.conNumero === '07:39';
  if (!ok) mal++;
  console.log('    ' + (ok ? 'ok  ' : '*** ') + z.padEnd(20) + '-> ' + r.conDate
    + '   (desfase ' + r.offset + ')');
});
const distintas = [...new Set([...resultados.values()].map(r => r.conDate))];
console.log('    ' + (distintas.length === 1 ? 'ok  ' : '*** ') + 'todas las zonas dan lo mismo: '
  + distintas.join(', '));
if (distintas.length !== 1) mal++;

console.log('');
if (mal) {
  console.log('  *** ' + mal + ' CASO(S) MAL');
  process.exit(1);
}
console.log('  ok  los ' + CASOS.length + ' casos, el Date de SheetJS, y el mismo resultado en 5 zonas horarias');