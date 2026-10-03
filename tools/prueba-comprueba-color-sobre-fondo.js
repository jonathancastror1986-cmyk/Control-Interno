// PRUEBA DE "comprueba-color-sobre-fondo.js": QUE AGARRE EL BLANCO SOBRE BLANCO
// ===========================================================================
//
// ---------------------------------------------------------------------
// POR QUÉ ESTA PRUEBA EXISTE
// ---------------------------------------------------------------------
//
// Porque un guardián que no se ha visto fallar no se sabe si funciona. Y este se escribió para un
// defecto real, de modo que la prueba tiene que arrancar de la regla REAL, con su comentario y
// todo, y sacarle el "color".
//
// ---------------------------------------------------------------------
// LAS DOS FORMAS DE HACERLA MAL, Y LAS DOS PASARON
// ---------------------------------------------------------------------
//
// Y son las dos cosas que hay que mirar antes de creerse una prueba.
//
// PRIMERA: copiar el cuerpo de la regla con "indexOf" hasta el primer "}". Y el primer "}" está
// DENTRO del comentario, porque el comentario cita la regla global con sus llaves:
//
//     "styles.css" L165 tiene "th{background:var(--accent2);color:#fff}"
//
// El cuerpo sale truncado a mitad de comentario, y la "regla inyectada" no es la regla.
//
// SEGUNDA: copiar la regla TAL CUAL del archivo, que ya está arreglado. Entonces el defecto no
// existe, el guardián pasa, y la prueba pasa por la razón equivocada: no porque él sea bueno,
// sino porque no se inyectó nada.
//
// ---------------------------------------------------------------------
// Y ESO ES LO PEOR QUE PUEDE HACER UNA PRUEBA
// ---------------------------------------------------------------------
//
// No fallar, no avisar, y ocupar el lugar de la que sí avisa. Por eso hay dos guardas: si el
// archivo de referencia no tiene color, la prueba se termina diciendo que no hay nada que
// inyectar, en vez de dar verde.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GUARDIAN = path.join(__dirname, 'comprueba-color-sobre-fondo.js');
const CSS = path.join(__dirname, '..', 'views', 'asistencia', 'asistencia.css');

// ---------------------------------------------------------------------
// EL CUERPO DE UNA REGLA, SALTEANDO LOS COMENTARIOS
// ---------------------------------------------------------------------
function cuerpoDeRegla(texto, desdeSelector) {
  let i = desdeSelector;
  while (i < texto.length && texto[i] !== '{') i++;
  const cuerpo = [];
  let nivel = 1;
  let enComentario = false;
  for (let k = i + 1; k < texto.length && nivel > 0; k++) {
    const c = texto[k];
    const dos = texto.slice(k, k + 2);
    if (enComentario) {
      if (dos === '*/') { enComentario = false; k++; }
      continue;
    }
    if (dos === '/*') { enComentario = true; k++; continue; }
    if (c === '{') nivel++;
    if (c === '}') { nivel--; if (nivel === 0) break; }
    cuerpo.push(c);
  }
  return cuerpo.join('');
}

const real = fs.readFileSync(CSS, 'utf8');
const iSel = real.indexOf('#v-asistencia #matrixArea th,\n#v-supervisores #supMatrixArea th{');

if (iSel < 0) {
  console.log('  *** NO SE ENCONTRÓ LA REGLA DE REFERENCIA. La prueba no sirve. ***');
  console.log('    Buscó: "#v-asistencia #matrixArea th,\\n#v-supervisores #supMatrixArea th{"');
  process.exit(1);
}

const cuerpoReal = cuerpoDeRegla(real, iSel);
const elColor = /(^|[\s;])color\s*:\s*([^;]+);?/.exec(cuerpoReal);

// Y LA GUARDA: sin color en la regla real, no hay defecto que inyectar y la prueba no dice nada.
if (!elColor) {
  console.log('  *** LA REGLA DE REFERENCIA NO TIENE COLOR ***');
  console.log('    No hay defecto que inyectar, así que la prueba no probaría nada.');
  console.log('    Con lo que hay ahora, no se puede probar este guardián.');
  process.exit(1);
}

const sinColor = cuerpoReal.replace(/(^|[\s;])color\s*:\s*[^;]+;?/, '$1');
const fondo = (/background\s*:\s*([^;]+)/.exec(cuerpoReal) || ['', '(ninguno)'])[1].trim();

console.log('  la regla de referencia, tal cual está en el archivo:');
console.log('    fondo: ' + fondo + '    color: ' + elColor[2].trim());
console.log('    llaves en el cuerpo: ' + (cuerpoReal.match(/[{}]/g) || []).length
  + '   (0 = los comentarios se saltaron bien)');
console.log('    comentarios en el cuerpo: ' + (cuerpoReal.indexOf('/*') >= 0 ? 'sí' : 'no')
  + '   (no = el cuerpo es la regla, no un pedazo)');
console.log('');

// ---------------------------------------------------------------------
// EL ÁRBOL DE COPIA
// ---------------------------------------------------------------------
// El guardián recibe su raíz por variable de ambiente, y si no la tiene usa la del proyecto. Es lo
// que permite correrlo contra un árbol de mentira sin tocar el de verdad.
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'prueba-color-'));
fs.mkdirSync(path.join(raiz, 'css'), { recursive: true });

const codigo = fs.readFileSync(GUARDIAN, 'utf8')
  .replace(/^const RAIZ = .*$/m, "const RAIZ = process.env.RAIZ_PRUEBA || path.join(__dirname, '..');");
if (codigo === fs.readFileSync(GUARDIAN, 'utf8')) {
  console.log('  *** EL GUARDIÁN NO ADMITE UNA RAÍZ DE PRUEBA ***');
  console.log('    No se encontró la línea "const RAIZ = …" para reemplazar.');
  console.log('    Sin eso no se puede correr contra un árbol de mentira.');
  fs.rmSync(raiz, { recursive: true, force: true });
  process.exit(1);
}
const copia = path.join(raiz, 'guardian.js');
fs.writeFileSync(copia, codigo, 'utf8');

function corre() {
  const r = spawnSync(process.execPath, [copia], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { RAIZ_PRUEBA: raiz }),
  });
  return { codigo: r.status, salida: (r.stdout || '') + (r.stderr || '') };
}

const SELECTOR = '#v-asistencia #matrixArea th,\n#v-supervisores #supMatrixArea th{';

// Y el cuerpo va CON su selector y su llave de cierre. La primera versión escribía el cuerpo solo,
// y el guardián contó 0 reglas con "th": un cuerpo de regla sin selector no es una regla, es un
// texto. Y el guardián pasó, por la razón equivocada, una tercera vez.
const regla = (cuerpo) => SELECTOR + cuerpo.trim() + '\n}';

const CASOS = [
  {
    nombre: '1. la regla real con su color, que es como está ahora',
    css: regla(cuerpoReal),
    tiene: 'pasar',
    porQue: 'TIENE QUE PASAR. Es el archivo como está, ya arreglado.',
  },
  {
    nombre: '2. la MISMA regla sin el color, que es como estaba',
    css: regla(sinColor),
    tiene: 'fallar',
    porQue: 'TIENE QUE FALLAR. Con "background:var(--card)" y sin color, el "#fff" global queda '
      + 'encima y en tema claro no se ve nada. Si esto pasa, el guardián no sirve para nada.',
  },
  {
    nombre: '3. una regla de "th" con fondo oscuro y sin color',
    css: '#v-cualquiera th{background:var(--accent2);padding:4px}',
    tiene: 'pasar',
    porQue: 'TIENE QUE PASAR. "--accent2" es #101a14 en tema claro y el "#fff" se lee. El '
      + 'guardián tiene que distinguir el fondo, no rechazar toda regla que no lleve color.',
  },
];

let malas = 0;

CASOS.forEach(function (caso) {
  fs.writeFileSync(path.join(raiz, 'css', 'inyectado.css'),
    caso.css.trim() + '\n', 'utf8');
  const r = corre();
  const paso = r.codigo === 0;
  const bien = caso.tiene === 'pasar' ? paso : !paso;
  if (!bien) malas++;
  console.log('  ' + (bien ? 'ok  ' : '*** ') + caso.nombre);
  console.log('        salida ' + r.codigo + ', y tenía que ' + (caso.tiene === 'pasar' ? 'pasar' : 'fallar'));
  console.log('        ' + caso.porQue);
  if (!bien) {
    console.log('        --- lo que dijo ---');
    r.salida.split(/\r\n|\n/).slice(0, 10).forEach((x) => console.log('          ' + x));
  }
  console.log('');
});

fs.rmSync(raiz, { recursive: true, force: true });

if (malas) {
  console.log('  *** ' + malas + ' DE ' + CASOS.length + ' CASOS');
  process.exit(1);
}
console.log('  ok  los ' + CASOS.length + ' casos: el guardián ve el defecto y no ve el resto.');