// VOLVER A UN SOLO FINAL DE LÍNEA EN UN ARCHIVO
// ================================================
//
// -------------------------------------------------------------------
// POR QUÉ PASA
// -----------
//
// En "saca-logo.js" se armó el texto de reemplazo con "\\n", y no con el final de línea del
// archivo. El archivo usa CRLF, así que quedaron cuatro renglones con LF y el resto con CRLF.
//
// Y "test-css-tokens.js" lo cacha, que es lo que tiene que hacer: un archivo con finales
// mezclados se ve bien en un editor y se ve mal en el diff, porque Git cuenta los 5257 renglones
// como cambiados en vez de cuatro.
//
// -------------------------------------------------------------------
// Y POR QUÉ NO SE BORRA Y SE VUELVE A ESCRIBIR
// --------------------------------------------
//
// Reescribir el archivo entero desde el texto limpio es lo correcto, y es lo que hace este
// guion. Lo que NO se hace es "reemplazar los LF por CRLF a ciegas": si el archivo ya tuviera
// CRLF legítimamente, se le SUMARÍA un "\\r" a cada uno y el archivo quedaría entero con "\\r\\r\\n".
// Ver [barra-08].
//
const fs = require('fs');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';

// Y SIN argumentos revisa los archivos que deben estar parejos, para que el guion se pueda correr
// solo como comprobación.
//
// Y la lista es explícita, no un "todo lo que hay": un archivo de texto de un sistema operativo,
// o un ".md" de una dependencia, puede usar LF a propósito, y marcarlos de error hace que el
// guardián se acostumbre a quejarse y deje de leerse. Ver [barra-09].
const POR_DEFECTO = [
  'pages/app.html',
  'css/styles.css',
  'css/marca.css',
  'css/base.css',
  'css/tokens.css',
  'css/vistas.css',
  'css/grupos.css',
  'css/plantillas.css',
  'js/nucleo.js',
  'js/relojes.js',
  'js/app.js',
  'js/documentos.js',
  'documentacion.txt',
];

const rutas = process.argv.slice(2);
const aRevisar = rutas.length ? rutas : POR_DEFECTO.filter(function (p) {
  return fs.existsSync(RAIZ + p);
});

if (!aRevisar.length) {
  console.log('');
  console.log('    hay que pasar al menos un archivo, y por defecto no hay ninguno de los conocidos');
  process.exit(1);
}
if (!rutas.length) {
  console.log('    (sin archivos: reviso los ' + aRevisar.length + ' conocidos)');
}

let malas = 0;

aRevisar.forEach(function (P) {
  const P0 = RAIZ + P;

  if (!fs.existsSync(P0)) {
    console.log('    ' + P + ': no existe, se salta');
    return;
  }
  const buf = fs.readFileSync(P0);

  // Y primero, qué hay: cuántos CRLF y cuántos LF sueltos.
  let crlf = 0, lfSuelto = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 10) continue;
    if (i > 0 && buf[i - 1] === 13) crlf++;
    else lfSuelto++;
  }

  // -------------------------------------------------------------------
  // Y "MEZCLADO" ES TENER DE LOS DOS
  // ---------------------------------
  //
  // La primera versión contaba como "suelto" TODOS los LF de un archivo que es de LF entero, y
  // después lo "normalizaba" al mismo LF y contaba otra vez igual. Resultado: "quedaron 2820 LF
  // sueltos" en un archivo que es de LF entero y estaba bien, siempre en rojo.
  //
  // Y hay archivos que son de LF a propósito: "tokens.css", "vistas.css" y "documentacion.txt".
  // Un guardián que los marca es un guardián al que uno aprende a no mirar. Ver [barra-10].
  //
  if (crlf === 0 || lfSuelto === 0) {
    const cual = crlf === 0 ? 'LF' : 'CRLF';
    console.log('    ' + P + ': ' + (crlf + lfSuelto) + ' ' + cual + ', ninguno suelto. Está bien.');
    return;
  }

  // Y ahora sí: hay de los dos, y por eso hay que parejar.
  const crudo = buf.toString('utf8');
  const lineas = crudo.split('\n');
  const sinCr = [];
  lineas.forEach(function (x, i) {
    if (!x.endsWith('\r')) sinCr.push(i + 1);
  });

  // Y el final de línea que manda: el del primer salto, que es el que ya estaba.
  const primero = crudo.indexOf('\n');
  const usaCrlf = primero > 0 && crudo.charAt(primero - 1) === '\r';
  const NL = usaCrlf ? '\r\n' : '\n';

  console.log('');
  console.log('  *** ' + P + ' MEZCLA FINALES DE LÍNEA ***');
  console.log('    ' + crlf + ' CRLF y ' + lfSuelto + ' LF sueltos. El archivo usa ' +
    (usaCrlf ? 'CRLF' : 'LF') + '.');
  console.log('    renglones sueltos: ' + sinCr.slice(0, 8).join(', ') +
    (sinCr.length > 8 ? ' y ' + (sinCr.length - 8) + ' más' : ''));

  // Y se normaliza TODA la vez, partiendo el archivo en renglones sin el "\r" y juntando con
  // el "\n" del archivo. Nunca "reemplazar \n por \r\n sobre el archivo entero".
  const limpio = lineas
    .map(function (x) { return x.endsWith('\r') ? x.slice(0, -1) : x; })
    .join(NL);

  fs.writeFileSync(P0, limpio, 'utf8');

  // Y se vuelve a contar, porque "escribir bien" no es lo mismo que "quedó bien".
  const b2 = fs.readFileSync(P0);
  let c2 = 0, l2 = 0;
  for (let i = 0; i < b2.length; i++) {
    if (b2[i] !== 10) continue;
    if (i > 0 && b2[i - 1] === 13) c2++;
    else l2++;
  }
  if (c2 !== 0 && l2 !== 0) {
    console.log('    *** QUEDARON ' + c2 + ' CRLF Y ' + l2 + ' LF: SIGUE MEZCLADO ***');
    malas++;
    return;
  }
  console.log('    ok  ahora: ' + (c2 + l2) + ' ' + (c2 === 0 ? 'LF' : 'CRLF') + ', ninguno suelto');
});

console.log('');
if (malas) {
  console.log('  *** ' + malas + ' ARCHIVO(S) SIGUEN MAL ***');
  process.exit(1);
}
console.log('    ok  los finales de línea están parejos');
