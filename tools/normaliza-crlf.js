// LOS FINALES DE RENGLON DE relojés.js, UNO POR UNO
// ====================================================
//
// El bloque "EL EDITOR DE PLANTILLAS" resultaba estar en el renglon 5083 de un archivo que, con las
// herramientas del proyecto, tiene 6789 renglones. Y con "Archivo", que parte solo en los LF, el
// mismo archivo tiene 3395. Y la diferencia no se explicaba.
//
// ---------------------------------------------------------------------
// Y NO SE EXPLICABA PORQUE NO HAY DOS TIPOS DE FIN, HAY UN TERCERO
// ---------------------------------------------------------------------
//
// El archivo tiene 3394 bytes LF y 3394 de ellos vienen con un CR adelante: son CRLF, todos. Y a
// pesar de eso, al partirlo con "/\r\n|\n|\r/" salen 6789 pedazos en vez de 3395.
//
// O sea que hay CR sueltos: bytes 0x0d que no van adelante de un 0x0a. Y si van adelante de un
// 0x0a, el par es "\r\r\n": DOS CR y un LF. Partiendo por el patron, el primer "\r" se come como
// un fin de renglon, y despues queda el "\r\n" como otro. Uno se vuelve dos.
//
// ---------------------------------------------------------------------
// Y POR QUE ESTE ARCHIVO Y NO OTRO
// ---------------------------------------------------------------------
//
// Porque en "documentos.js" ya se quito -- quedo en cero --, y en "relojes.js" no. El archivo se
// escribio una vez con una conversion de finales de linea y otra vez con otra, y cada conversion
// agrego un CR. El sintoma es que el numero de renglon cambia segun con que herramienta se mire, y
// por eso "L5083" y "L2542" describen el mismo lugar sin que ninguna de las dos tenga razon.
//
// ---------------------------------------------------------------------
// Y POR QUE NO ES COSMETICO
// ---------------------------------------------------------------------
//
// Uno: cualquier linea que se cite por numero esta mal, y hay codigo que se corta por numero. Dos:
// un "\r" suelto antes de un "\n" es un caracter que el navegador no descarta; va a quedar adentro
// de un "<pre>" y de una cadena, y hay comparaciones de string que dejan de dar igual. Tres: el
// archivo tiene el doble de renglones del que tiene, y por eso las mediciones de antes --
// "6.789 renglones" -- dicen cualquier cosa.
//
// ---------------------------------------------------------------------
// Y QUE HAY QUE PROBAR ANTES DE NORMALIZAR
// ---------------------------------------------------------------------
//
// Que el archivo nuevo es el viejo con un CR menos en cada "\r\r\n", y con NADA mas. Si se
// escribiera el archivo partiendo en lineas y juntando con "\n", se perderian los finales que hay
// y el diff seria enorme otra vez. Por eso se replacesca la secuencia en el BYTE, y se comparan
// los bytes.

const fs = require('fs');
const R = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const ARCHIVOS = [
  'views/asistencia/relojes.js',
  'views/asistencia/asistencia.js',
  'views/administracion/documentos.js',
  'views/administracion/administracion.js',
  'js/nucleo.js',
  'css/styles.css',
  'views/asistencia/asistencia.css',
];

console.log('  === 1) los finales, archivo por archivo ===');
let conProblema = [];
ARCHIVOS.forEach(function (p) {
  let b;
  try { b = fs.readFileSync(R + p); } catch (e) { return; }
  const t = b.toString('utf8');
  const doble = (t.match(/\r\r\n/g) || []).length;
  const crSolo = (t.match(/\r(?!\n)/g) || []).length;
  const lfSolo = (t.match(/(?<!\r)\n/g) || []).length;
  const crlf = (t.match(/\r\n/g) || []).length;
  const marca = (doble || crSolo) ? '  *** ' : '  ok  ';
  console.log('  ' + marca + p.replace('views/', '').padEnd(26)
    + ' CRLF ' + String(crlf).padStart(5)
    + '   LF solo ' + String(lfSolo).padStart(5)
    + '   CR solo ' + String(crSolo).padStart(5)
    + '   CR CR LF ' + String(doble).padStart(5));
  if (doble || crSolo) conProblema.push({ p: p, b: b, doble: doble, crSolo: crSolo, crlf: crlf, lf: lfSolo });
});

console.log('');
console.log('  === 2) los que hay que normalizar ===');
console.log('    ' + conProblema.length + ' archivos');
if (!conProblema.length) {
  console.log('    ninguno, no se toca nada');
  process.exit(0);
}

const ARREGLA = process.argv[2] === 'arregla';
conProblema.forEach(function (a) {
  console.log('');
  console.log('    ' + a.p);
  const t = a.b.toString('utf8');
  const antes = t.split(/\r\n|\n|\r/).length;
  const nuevo = t.replace(/\r\r\n/g, '\r\n');
  const despues = nuevo.split(/\r\n|\n|\r/).length;
  const bytesAntes = a.b.length;
  const bytesDespues = Buffer.byteLength(nuevo, 'utf8');
  console.log('      renglones por la herramienta que parte doble: ' + antes + ' -> ' + despues);
  console.log('      bytes: ' + bytesAntes + ' -> ' + bytesDespues + '  (se quitan ' + (bytesAntes - bytesDespues) + ')');

  // Y el "continue" de una version anterior estaba DENTRO de un forEach, y un forEach no es un
  // bucle: "continue" no tiene a que continuar. Se ve al compilar, pero no al leer: la forma del
  // código es la misma en las dos versiones.
  if (!ARREGLA) return;

  // -------------------------------------------------------------------
  // Y LAS COMPROBACIONES, ANTES DE ESCRIBIR
  // -------------------------------------------------------------------
  console.log('      --- las comprobaciones ---');
  const CHEQUEOS = [
    ['se quita un CR por cada "CR CR LF"', (bytesAntes - bytesDespues) === a.doble],
    ['ya no queda ningun "CR CR LF"', nuevo.indexOf('\r\r\n') < 0],
    ['ya no queda ningun CR suelto', (nuevo.match(/\r(?!\n)/g) || []).length === 0],
    ['los CRLF que habia siguen siendo los mismos',
      (nuevo.match(/\r\n/g) || []).length === a.crlf],
    ['los LF que habia siguen siendo los mismos',
      (nuevo.match(/(?<!\r)\n/g) || []).length === a.lf],
    ['quedan los mismos renglones por la herramienta que parte doble',
      despues === a.crlf + a.lf + 1],
    ['el texto es identico si se borran todos los CR',
      nuevo.split('\r').join('') === t.split('\r').join('')],
    // Y POR QUE ESTA ES LA COMPROBACION, Y NO "PARTIR EN RENGLONES Y VOLVER A JUNTAR"
    //
    // Porque partir y juntar con "\n" convierte los 3394 finales que HAY en LF, y eso es un cambio
    // real del archivo, no una forma de escribirlo. Sale un diff gigante, y el gigante esconde lo
    // unico que importa: que no se toco ni una letra.
    //
    // La version anterior de esta comprobacia normalizaba primero --pasaba "\r\n" a "\n" y luego
    // buscaba los CR sueltos-- y fallaba siempre. No porque el archivo estuviera mal, sino porque
    // al cambiar "\r\r\n" a "\r\n" el primer CR ya queda pegado al "\n", y el patron de "CR suelto"
    // --que pide un CR que NO este seguido de otro CR-- deja de encontrarlo. El CR estaba ahi todo
    // el tiempo: la comprobacion era la que no lo veia.
    //
    // Y por que borrar los CR de los dos lados sirve: si al quitarle a los dos textos TODOS los CR
    // queda exactamente lo mismo, entonces los dos textos tienen las mismas letras en el mismo
    // orden, y lo unico que cambio es que se fueron CR. Eso es justo lo que se queria.
  ];
  let malas = 0;
  CHEQUEOS.forEach(function (c) {
    if (!c[1]) malas++;
    console.log('      ' + (c[1] ? 'ok  ' : '*** ') + c[0]);
  });
  if (malas) {
    console.log('      *** NO SE ESCRIBE NADA');
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(R + a.p, Buffer.from(nuevo, 'utf8'));
  console.log('      ok  escrito');
});

if (!ARREGLA) {
  console.log('');
  console.log('    (con "arregla" al final se escriben)');
}