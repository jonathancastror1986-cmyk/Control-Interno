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
  //
  // Y "\r\r\n" va aparte, porque no es un "\r\n" con un "\r" de más: es una tercera cosa, y
  // se cuenta mirando DOS caracteres antes del salto, no uno.
  //
  // -------------------------------------------------------------------
  // POR QUÉ HACÍA FALTA UN CONTADOR PROPIO
  // -------------------------------------
  //
  // El conteo miraba solo el carácter inmediatamente anterior al "\n". En "\r\r\n" ese
  // carácter es un "\r", así que contaba como CRLF, y el archivo pasaba como sano.
  //
  // Y "pages/app.html" tenía 2.668 de esos. El guardián llevaba meses diciendo "los finales
  // de línea están parejos" sobre un archivo con 2.668 finales rotos.
  //
  // No rompía nada: "\r" y "\r\n" son los dos espacio en blanco para el navegador, y la
  // página se veía y funcionaba igual. Lo que rompía era el DIFF, porque Git cuenta el
  // renglón entero como cambiado. Un guardián que dice "está bien" sobre algo que está mal
  // es peor que no tener guardián: ocupa el lugar del que avisa. Ver [parea-01].
  //
  let crlf = 0, lfSuelto = 0, dobles = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 10) continue;
    if (i > 0 && buf[i - 1] === 13) {
      crlf++;
      // Y el que va antes del "\r" también es "\r": un doble retorno de carro.
      if (i > 1 && buf[i - 2] === 13) dobles++;
    } else lfSuelto++;
  }

  // Y las LÍNEAS donde están, que sin eso hay que buscarlas a mano una por una.
  const lineasDobles = [];
  {
    const crudo0 = buf.toString('utf8').split('\n');
    crudo0.forEach(function (x, i) {
      if (x.endsWith('\r\r')) lineasDobles.push(i + 1);
    });
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
  // Y "\r\r\n" NO es "mezclado": es un archivo parejo y con un byte de más. Se reporta
  // aparte y con su propia explicación, porque la explicación es distinta y lareparación es la
  // misma. Ver [parea-02].
  //
  if (dobles) {
    console.log('');
    console.log('  *** ' + P + ' TIENE ' + dobles + ' FINALES DE LÍNEA DOBLES ("\\r\\r\\n") ***');
    console.log('    Son ' + crlf + ' CRLF y ' + lfSuelto + ' LF, y los ' + dobles + ' dobles');
    console.log('    están dentro de los CRLF: el "\r" de al lado es un "\r" de sobra.');
    console.log('    renglones: ' + lineasDobles.slice(0, 10).join(', ')
      + (lineasDobles.length > 10 ? ' y ' + (lineasDobles.length - 10) + ' más' : ''));
    console.log('    El navegador no lo nota: "\\r" es espacio en blanco. Lo que se ensucia es');
    console.log('    el diff, porque Git cuenta el renglón entero como cambiado.');
  }

  if (crlf === 0 || lfSuelto === 0) {
    if (!dobles) {
      const cual = crlf === 0 ? 'LF' : 'CRLF';
      console.log('    ' + P + ': ' + (crlf + lfSuelto) + ' ' + cual + ', ninguno suelto. Está bien.');
      return;
    }
    // Y si hay dobles, NO se vuelve: se sigue abajo a normalizar. El "return" de arriba
    // era justo lo que hacía que un archivo con finales dobles pasara como sano.
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

  // Y el encabezado dice SI lo que está mal: "MEZCLA" o "FINALES DOBLES". Un encabezado que
  // dice siempre "MEZCLA" para un archivo que no mezcla enseña a desconfiar de él, que es
  // lo contrario de lo que se quiere. Ver [parea-03].
  console.log('');
  if (crlf !== 0 && lfSuelto !== 0) {
    console.log('  *** ' + P + ' MEZCLA FINALES DE LÍNEA ***');
    console.log('    ' + crlf + ' CRLF y ' + lfSuelto + ' LF sueltos. El archivo usa ' +
      (usaCrlf ? 'CRLF' : 'LF') + '.');
    console.log('    renglones sueltos: ' + sinCr.slice(0, 8).join(', ') +
      (sinCr.length > 8 ? ' y ' + (sinCr.length - 8) + ' más' : ''));
  } else {
    console.log('  *** ' + P + ' TIENE ' + dobles + ' FINALES DE LÍNEA DOBLES ***');
    console.log('    El archivo usa ' + (usaCrlf ? 'CRLF' : 'LF') + ' y no mezcla nada.');
    console.log('    Lo único que sobra es un "\\r" antes de algunos saltos.');
  }

  // Y la reparación: quitarle a cada renglón TODOS los "\r" del final, y juntarlos con el
  // final de línea que usa el archivo.
  //
  // -------------------------------------------------------------------
  // Y POR QUÉ "slice(0, -1)" NO ALCANZABA
  // -------------------------------------
  //
  // La versión anterior sacaba un solo "\r":
  //
  //     lineas.map(function (x) { return x.endsWith('\r') ? x.slice(0, -1) : x; }).join(NL)
  //
  // Para "\r\n" está bien: "foo\r\n" parte en "foo\r", y "slice(0,-1)" deja "foo".
  //
  // Para "\r\r\n" NO: "foo\r\r\n" parte en "foo\r\r", "slice(0,-1)" deja "foo\r", y al
  // juntar queda "foo\r" + "\r\n" = "foo\r\r\n". El "\r" de sobra sobrevive, intacto,
  // y el guardián —que ya sabía contarlos— reportaba que seguían ahí después de
  // arreglarlos.
  //
  // Y lo grave no es que la reparación fuera incompleta: es que yo había escrito un
  // comentario que decía que esa reparación ya funcionaba para los dobles. No la había
  // probado. Es [afp-24] en el sitio donde menos cuesta cuesta: dentro de un comentario que
  // nadie va a ejecutar, y por eso nadie lo va a contradecir. Ver [parea-02].
  //
  const limpio = lineas
    .map(function (x) { return x.replace(/\r+$/, ''); })
    .join(NL);

  fs.writeFileSync(P0, limpio, 'utf8');

  // Y se vuelve a contar, porque "escribir bien" no es lo mismo que "quedó bien".
  //
  // Y se cuentan TAMBIÉN los dobles, que es lo que faltaba. El conteo de después miraba un
  // solo carácter antes del "\n" y por eso decía "OK" sobre un archivo al que le quedaban
  // "\r\r\n". Decir que quedó bien sin mirar lo que se acaba de arreglar es la forma más
  // común de que un guardián mienta. Ver [parea-01].
  const b2 = fs.readFileSync(P0);
  let c2 = 0, l2 = 0, d2 = 0;
  for (let i = 0; i < b2.length; i++) {
    if (b2[i] !== 10) continue;
    if (i > 0 && b2[i - 1] === 13) {
      c2++;
      if (i > 1 && b2[i - 2] === 13) d2++;
    } else l2++;
  }
  if (d2 !== 0) {
    console.log('    *** QUEDARON ' + d2 + ' FINALES DOBLES ("\\r\\r\\n") ***');
    malas++;
    return;
  }
  if (c2 !== 0 && l2 !== 0) {
    console.log('    *** QUEDARON ' + c2 + ' CRLF Y ' + l2 + ' LF: SIGUE MEZCLADO ***');
    malas++;
    return;
  }
  console.log('    ok  ahora: ' + (c2 + l2) + ' ' + (c2 === 0 ? 'LF' : 'CRLF')
    + ', ninguno suelto y ninguno doble');
});

console.log('');
if (malas) {
  console.log('  *** ' + malas + ' ARCHIVO(S) SIGUEN MAL ***');
  process.exit(1);
}
console.log('    ok  los finales de línea están parejos, y no hay ninguno doble');
