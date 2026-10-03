// PRUEBA DE "compila-javascript.js": QUE EL GUARDIÁN MUERDA
// ============================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const GUARDIAN = RAIZ + 'tools/compila-javascript.js';

console.log('  === probando "compila-javascript.js" ===');
console.log('');

// -------------------------------------------------------------------
// EL CASO QUE PASÓ DE VERDAD
// -------------------------------------------------------------------
//
// Y no es un caso inventado. Es lo que le pasó a "js/app.js": un guion propio reescribió un
// bloque y dejó el texto "undefined" donde iban 82 renglones de código.
//
// Y el archivo, con eso adentro, medía la mitad. Y la pantalla seguía abriendo.
console.log('  caso 1: el daño real — texto "undefined" pegado en medio del código');

const CASOS = [
  {
    nombre: 'el daño real, con "undefined" pegado',
    codigo: [
      'function a(){return 1;}',
      'undefinedfunction b(){return 2;}',
      'undefinedfunction c(){return 3;}',
    ].join('\n'),
  },
  {
    nombre: 'una llave que se cayó',
    codigo: [
      'function a(){',
      '  if(true){',
      '    return 1;',
      '  return 2;',
      '}',
    ].join('\n'),
  },
  {
    nombre: 'un archivo vacío, que PARSEA y no sirve',
    codigo: '',
  },
];

const PROBETA = RAIZ + 'tools/pruebas/_check.js';

let pasaron = 0;
CASOS.forEach(function (c, n) {
  fs.writeFileSync(PROBETA, c.codigo, 'utf8');
  let codigo = 0;
  let salida = '';
  try {
    salida = execFileSync('node', [GUARDIAN], {
      cwd: RAIZ, encoding: 'utf8',
      env: Object.assign({}, process.env, { CHECK_PROBETA: PROBETA }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    codigo = e.status === undefined ? -1 : e.status;
    salida = (e.stdout || '') + (e.stderr || '');
  }

  if (codigo !== 0 && /NO PARSEAN|VACIO/.test(salida)) {
    console.log('    ' + (n + 1) + '. ' + c.nombre + ': detectado   ok');
    const linea = salida.split('\n').find((x) => x.indexOf('_check.js') >= 0);
    if (linea) console.log('       ' + linea.trim().slice(0, 88));
    pasaron++;
  } else {
    console.log('    ' + (n + 1) + '. ' + c.nombre + ': *** NO LO DETECTÓ ***');
    console.log('       salida ' + codigo);
    console.log((salida.split('\n').slice(0, 8).map((x) => '         ' + x)).join('\n'));
  }
});

// -------------------------------------------------------------------
// Y EL CASO SANO, QUE ES EL IMPORTANTE
// -------------------------------------------------------------------
//
// Y porque un guardián que marca lo sano es peor que uno que no comprueba: es el que enseña a
// ignorar sus avisos. Ver [cache-10].
console.log('');
console.log('  caso ' + (CASOS.length + 1) + ': un archivo sano, con llaves, cadenas y una regex');

// Y el archivo sano va SIN escapes "\u".
//
// Y eso no es un detalle: la primera versión de este caso traía "/[\u0300-\u036f]/", y al
// escribir el archivo desde este guion, el "\u0300" se convirtió en el carácter de combinación
// REAL. O sea que el archivo de prueba tenía unos caracteres que este guion no podía escribir,
// y el guardián lo marcó —con razón, desde su punto de vista—.
//
// O sea que el guardián no tenía la culpa: el que estaba mal era el que armó el caso.
//
// Y el archivo tiene que llevar llaves en comentario, en cadena y en expresión regular, que
// es lo que rompe a un contador de llaves. Sin escapes, con texto normal.
const SANO = [
  '// Un comentario con una llave: { y con un paréntesis: (',
  '/* Y un bloque con otro: } */',
  'const re=/^[A-Za-z0-9_]+$/;',
  "const texto='una llave { adentro de una cadena';",
  'const objeto={llave:' + "'" + 'valor{' + "'" + '};',
  'function suma(a,b){',
  '  if(a>b){return a+b;}',
  '  return b-a;',
  '}',
  'function usa(){ return suma(1,2) + (texto.match(re)||[]).length; }',
  '',
  "if(typeof document!=='undefined'){",
  "  document.addEventListener('DOMContentLoaded',function(){",
  '    console.log(usa());',
  '  });',
  '}',
].join('\n');

fs.writeFileSync(PROBETA, SANO, 'utf8');

let codigoSano = 0;
let salidaSano = '';
try {
  salidaSano = execFileSync('node', [GUARDIAN], {
    cwd: RAIZ, encoding: 'utf8',
    env: Object.assign({}, process.env, { CHECK_PROBETA: PROBETA }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  codigoSano = 0;
} catch (e) {
  codigoSano = e.status === undefined ? -1 : e.status;
  salidaSano = (e.stdout || '') + (e.stderr || '');
}

if (codigoSano === 0) {
  console.log('    no lo marcó: PASÓ');
} else {
  console.log('    *** LO MARCÓ, y el archivo estaba bien ***');
  console.log('');
  // Y se imprime QUÉ DIJO, porque un "lo marcó" sin el motivo obliga a ir a buscar.
  console.log(salidaSano.split('\n').slice(0, 14).map((x) => '      ' + x).join('\n'));
  console.log('');
  console.log('    Un guardián que marca lo sano es peor que uno que no comprueba.');
  process.exit(1);
}

fs.unlinkSync(PROBETA);
if (fs.existsSync(PROBETA)) {
  console.log('');
  console.log('  *** NO SE PUDO BORRAR EL ARCHIVO DE PRUEBA ***');
  process.exit(1);
}

console.log('');
if (pasaron === CASOS.length) {
  console.log('    ok  el guardián pilla los ' + CASOS.length + ' daños y deja pasar el sano');
  console.log('    y no dejó el archivo de prueba en el repositorio');
} else {
  console.log('    *** ' + (CASOS.length - pasaron) + ' CASO(S) SIN DETECTAR ***');
  process.exit(1);
}