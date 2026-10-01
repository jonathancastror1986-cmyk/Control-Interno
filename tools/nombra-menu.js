// NOMBRAR LA PALETA Y LA FUENTE DEL MENU, Y YA
// ================================================
//
// Hecho a mano, en tres pasos, después de fallar cuatro veces con herramientas que parcheaban
// otras herramientas. Un guion que hace una cosa es más fácil de revisar que uno que corrige a
// otro.
//
// -------------------------------------------------------------------
// PASO 1: LAS VARIABLES, EN "_tokens.css"
// --------------------------------------
// Y en ":root", al lado de la paleta, porque el archivo se titula "LA PALETA" y es donde uno va
// a buscar para cambiar un color.
//
// Hay precedente de una variable que solo está en ":root" y no en los dos bloques oscuros:
// "--ancho-maximo". Las que cambian con el tema van en los tres; esta no cambia, así que va en uno.
//
// -------------------------------------------------------------------
// PASO 2: LOS REEMPLAZOS, Y QUÉ ES CÓDIGO
// ---------------------------------------
//
// Un comentario es un RANGO de caracteres, y las líneas del medio de uno no empiezan por nada.
// Por eso el prefijo del renglón no sirve, y por eso el intento anterior metió texto de variable
// adentro de un comentario.
//
// La forma exacta: se buscan los rangos de comentario sobre el texto entero, y cada renglón se
// pregunta si su rango se superpone con alguno.
//
// -------------------------------------------------------------------
// PASO 3: LOS TRES REEMPLAZOS SON INDEPENDIENTES
// ----------------------------------------------
//
// El intento anterior tenía un "continue" en el del "#fff", y ese "continue" saltaba al de la
// fuente. Los renglones que tienen las dos cosas —"header h1" y "button.btn"— nunca llegaban al
// segundo, y por eso se cambiaban 7 de 10.
//
// Un "continue" dentro de una cadena de "if" que seguardsa uno al que sigue no es un detalle
// estilístico: es un salto que nadie ve en el código.
//
// -------------------------------------------------------------------
// Y EL REPORTE CON SU DENOMINADOR
// ------------------------------
//
// "7 renglones" se lee como completo. "9 de 10, y 1 estaba en un comentario" se lee como lo que
// es. La diferencia entre las dos formas fue justo lo que faltó.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const TOKENS = path.join(raiz, 'css', '_tokens.css');
const STYLES = path.join(raiz, 'css', 'styles.css');

const PILA = "'Montserrat',system-ui,sans-serif";

// -------------------------------------------------------------------
// LOS RANGOS DE COMENTARIO
// -------------------------------------------------------------------
function rangosDeComentario(texto) {
  const rangos = [];
  let i = 0;
  while (i < texto.length) {
    const dos = texto.substr(i, 2);
    if (dos === '/*') {
      const fin = texto.indexOf('*/', i + 2);
      if (fin < 0) { rangos.push([i, texto.length]); break; }
      rangos.push([i, fin + 2]);
      i = fin + 2;
      continue;
    }
    if (dos === '//') {
      const fin = texto.indexOf('\n', i);
      rangos.push([i, fin < 0 ? texto.length : fin]);
      i = fin < 0 ? texto.length : fin;
      continue;
    }
    i++;
  }
  return rangos;
}

let styles = fs.readFileSync(STYLES, 'utf8');
let tokens = fs.readFileSync(TOKENS, 'utf8');
const antes = styles;
const comentarios = rangosDeComentario(styles);

// Y el rango de cada renglón, calculado de una vez: son 5.700 y un "slice" por cada uno sería
// 5.700 recorridos del archivo entero.
const nl = styles.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const renglones = styles.split(nl);
const posDeLinea = [];
{
  let p = 0;
  for (let i = 0; i < renglones.length; i++) {
   posDeLinea.push([p, p + renglones[i].length]);
    p += renglones[i].length + nl.length;
  }
}
const choca = (a, b) => a[0] < b[1] && b[0] < a[1];
const enComentario = (i) => comentarios.some((c) => choca(posDeLinea[i], c));

// -------------------------------------------------------------------
// PASO 1
// -------------------------------------------------------------------
const ANCLA = '  /* ref: ancho-01 - El ancho de la pantalla';
const BLOQUE = [
  '  /* ------------------------------------------------------------------',
  '     MENU: LA PALETA Y LA FUENTE DE LAS DOS BARRAS',
  '     ------------------------------------------------------------------',
  '     Lo que estaba escrito a mano, con nombre. Los VALORES son los de siempre; lo unico',
  '     nuevo es que ahora estan en un solo lugar y se cambian en un renglon.',
  '',
  '     "--menu-boton" es el color de la palabra de los botones. "--menu-boton-activo" es el',
  '     del puntero y el de "estas aqui". El activo va en blanco a proposito: el quieto es un',
  '     gris azulado que se lee sobre los seis fondos de grupo.',
  '',
  '     Y los FONDOS de las barras no estan aqui: son "--fondo-seccion", "--fondo-nav" y',
  '     "--fondo-subnav", que se definen por grupo de menu. Ese es el color de la empresa.',
  '     Ver "--fondo-seccion" en "styles.css".',
  '',
  '     "--menu-fuente-pila" es la pila de fuentes. Antes cada boton la escribia entera, nueve',
  '     veces, y cambiar la fuente era buscarla en las nueve.',
  '     */',
  '',
  '  --menu-boton:#d4dbe4; --menu-boton-activo:#fff;',
  "  --menu-fuente-pila:'Montserrat',system-ui,sans-serif;",
  '',
].join('\n');

if (tokens.indexOf('--menu-boton:') >= 0) {
  console.log('    (las variables ya están)');
} else {
  if (tokens.indexOf(ANCLA) < 0) {
    console.log('  *** NO SE ENCONTRÓ EL ANCLA EN "_tokens.css" ***');
    process.exit(1);
  }
  tokens = tokens.replace(ANCLA, BLOQUE + ANCLA);
  console.log('    ok  las tres variables agregadas en ":root"');
}

// -------------------------------------------------------------------
// PASO 2 Y 3: LOS TRES REEMPLAZOS, INDEPENDIENTES
// -------------------------------------------------------------------
const cuenta = { boton: 0, activo: 0, fuente: 0, comentario: 0, pilaEnComentario: 0 };
const totalPila = antes.split(PILA).length - 1;

for (let i = 0; i < renglones.length; i++) {
  const esCodigo = !enComentario(i);

  if (renglones[i].indexOf('#d4dbe4') >= 0) {
    if (esCodigo) {
      renglones[i] = renglones[i].split('color:#d4dbe4').join('color:var(--menu-boton)');
      cuenta.boton++;
    } else {
      // El comentario nombra el color viejo. Se le pone el nombre nuevo, o el texto pasa a
      // mentir sobre el código que tiene al lado.
      renglones[i] = renglones[i].split('#d4dbe4').join('var(--menu-boton)');
      cuenta.comentario++;
    }
  }

  if (renglones[i].indexOf('#fff') >= 0 && esCodigo) {
    const t = renglones[i].trim();
    if (t.indexOf('mainNav') >= 0 || t.indexOf('subNav') >= 0
      || t.indexOf('barrasSuperiores') >= 0) {
      renglones[i] = renglones[i].split('color:#fff').join('color:var(--menu-boton-activo)');
      cuenta.activo++;
    }
  }

  if (renglones[i].indexOf(PILA) >= 0) {
    if (esCodigo) {
      renglones[i] = renglones[i].split(PILA).join('var(--menu-fuente-pila)');
      cuenta.fuente++;
    } else {
      cuenta.pilaEnComentario++;
    }
  }
}

styles = renglones.join(nl);

console.log('    ok  "--menu-boton": ' + cuenta.boton + ' regla(s) y '
  + cuenta.comentario + ' comentario(s)');
console.log('    ok  "--menu-boton-activo": ' + cuenta.activo + ' regla(s)');
console.log('    ok  "--menu-fuente-pila": ' + cuenta.fuente + ' de '
  + (totalPila - cuenta.pilaEnComentario) + ' que estaban en código, y '
  + cuenta.pilaEnComentario + ' que estaban en comentarios');

// -------------------------------------------------------------------
// LOS GUARDIANES
// -------------------------------------------------------------------
if (styles.indexOf('#d4dbe4') >= 0) {
  console.log('  *** QUEDÓ UN "#d4dbe4" ***');
  process.exit(1);
}
console.log('    ok  no queda ningún "#d4dbe4", ni en código ni en comentario');

let quedan = [];
for (let i = 0; i < renglones.length; i++) {
  if (enComentario(i)) continue;
  if (renglones[i].indexOf(PILA) >= 0) quedan.push(i + 1);
}
if (quedan.length) {
  console.log('  *** QUEDÓ LA PILA ESCRITA A MANO EN LOS RENGLONES ' + quedan.join(', ') + ' ***');
  console.log('    (de ' + (totalPila - cuenta.pilaEnComentario) + ' que había)');
  process.exit(1);
}
console.log('    ok  la pila no queda escrita a mano en ningún código');

['--menu-boton', '--menu-boton-activo', '--menu-fuente-pila'].forEach((v) => {
  const d = (tokens.match(new RegExp(v + ':', 'g')) || []).length;
  if (d !== 1) {
    console.log('  *** ' + v + ' ESTÁ DECLARADA ' + d + ' VECES ***');
    process.exit(1);
  }
});
console.log('    ok  las tres declaradas una vez cada una');

const llaves = (s) => {
  const l = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return [(l.match(/\{/g) || []).length, (l.match(/\}/g) || []).length];
};
const a = llaves(antes);
const b = llaves(styles);
if (a[0] !== b[0] || a[1] !== b[1]) {
  console.log('  *** CAMBIÓ LA CANTIDAD DE LLAVES ***');
  process.exit(1);
}

fs.writeFileSync(STYLES, styles, 'utf8');
fs.writeFileSync(TOKENS, tokens, 'utf8');
console.log('    ok  llaves: ' + a[0] + ' -> ' + b[0] + ', ni una cambiada');
console.log('');
console.log('    FALTA VERIFICAR EN EL NAVEGADOR: un "var()" mal escrito no da error, da otra cosa.');