// BORRAR DE "css/base.css" LAS REGLAS QUE NO LLEGAN A LA PANTALLA
// ====================================================================
//
// -------------------------------------------------------------------
// Y POR QU\u00c9 ESTE TRABAJO ES DISTINTO DE TODOS LOS OTROS
// -----------------------------------------
//
// Con el t\u00f3tem, con la tarjeta y con el men\u00fa, el navegador era el testigo: se comparaban los
// estilos calculados antes y despu\u00e9s, y si cambiaba algo, estaba roto.
//
// Ac\u00e1 NO. Y no es un detalle del m\u00e9todo: es una consecuencia l\u00f3gica de lo que se est\u00e1
// borrando.
//
// -------------------------------------------------------------------
// POR QU\u00c9 EL NAVEGADOR NO PUEDE SER EL TESTIGO AC\u00c1
// ---------------------------------------------
//
// Porque si la regla est\u00e1 muerta, es porque NUNCA se aplic\u00f3. Y si nunca se aplic\u00f3, borrarla no
// cambia NADA de lo que se ve.
//
// O sea: la prueba de que est\u00e1 muerta es la misma que la prueba de que borrarla es inofensivo. Y
// por lo tanto el navegador, para este trabajo, no puede distinguir "est\u00e1 bien" de "la rompi\u00f3 pero
// no se nota". Dar\u00eda verde en los dos casos.
//
// -------------------------------------------------------------------
// Y PEOR TODAV\u00cdA: LA MITAD DE ESTAS REGLAS NO TIENE ELEMENTOS EN LA P\u00c1GINA
// -------------------------------------------------------
//
// Las catorce del bloque ".idcard*" apagan a elementos que NO EXISTEN en el documento: hay 0 de
// ".idcard". Se crean en JavaScript cuando se abre la pantalla de imprimir el carn\u00e9.
//
// O sea que esas reglas no se pueden ni siquiera MIRAR en la p\u00e1gina normal. Habr\u00eda que abrir
// esa pantalla, entrar a la vista de impresi\u00f3n y comparar all\u00ed. Y a\u00fan as\u00ed, si est\u00e1n muertas,
// el resultado ser\u00eda el mismo.
//
// -------------------------------------------------------------------
// ENTONCES, \u00c9QU\u00c9 ES EL TESTIGO
// ---------------------
//
// El an\u00e1lisis est\u00e1tico. Y es m\u00e1s fuerte que el navegador en este caso, porque es una
// demostraci\u00f3n y no una observaci\u00f3n:
//
//   Para cada regla que se borra, existe una hoja que se carga DESPU\u00c9S, con el MISMO selector, que
//   declara TODAS sus propiedades.
//
// Con lo mismo, la de abajo gana por orden de cascada. No hay especificidad que discutir, no hay
// "@media" que aplicar, no hay pantalla angosta. La regla no se aplic\u00f3 jams y no se va a
// aplicar si se le quita algo.
//
// Y si al final la p\u00e1gina se ve igual, eso es una comprobaci\u00f3n, no la prueba.
//
// -------------------------------------------------------------------
// Y EL GUARDIAN QUE IMPORTA: NO SE ESCRIBE NADA SI EL N\u00daMERO NO ES EL ESPERADO
// -------------------------------------------------------------------------------------
//
// El conjunto de reglas muertas est\u00e1 MEDIDO, no escrito a mano. Y si al correr el guion el n\u00famero
// no es el de la \u00faltima Medici\u00f3n, no se toca el archivo.
//
// Porque si alguien a\u00f1adi\u00f3 una regla a "styles.css" que cubra una de estas, el conjunto baja, y
// esa regla pasa a ser PARCIAL: tiene que quedarse. Y un guion que borrara las 23 de todos modos
// perder\u00eda una declaraci\u00f3n de verdad.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const BASE = path.join(raiz, 'css', 'base.css');

const DESPUES = [
  'css/styles.css',
  'css/marca.css',
  'css/vistas.css',
  'css/componentes/porteria.css',
  'css/componentes/totem.css',
  'css/componentes/tarjeta.css',
  'css/movil.css',
];

// El n\u00famero que sali\u00f3 en la \u00faltima Medici\u00f3n. Si no coincide, no se escribe nada.
const ESPERADAS = 42;

// -------------------------------------------------------------------
// LAS MISMAS FUNCIONES DE "mide-pisadas.js", Y POR QU\u00c9 EST\u00c1N COPIADAS
// ---------------------------------------------------------------
//
// Porque un guion que importa a otro tiene que confiar en que el otro est\u00e1 bien, y si un d\u00eda se
// cambia el uno y no el otro, el resultado es un n\u00famero que nadie sabe de d\u00f3nde sali\u00f3.
//
// Y no es que una copia sea mejor: es que las dos son cortas, y tenerlas separadas hace que cada
// una se pueda leer entera.
//
// Lo que S\u00cd tiene que ser igual es la comparaci\u00f3n, que es donde est\u00e1 el criterio.
function reglas(texto) {
  const out = [];
  let i = 0;
  let enComentario = false;
  let sel = '';
  let ini = -1;
  let prof = 0;
  while (i < texto.length) {
    const dos = texto.substr(i, 2);
    if (enComentario) {
      if (dos === '*/') { enComentario = false; i += 2; continue; }
      i++; continue;
    }
    if (dos === '/*') { enComentario = true; i += 2; continue; }
    const c = texto[i];
    if (c === '{') {
      if (prof === 0) sel = sel.trim();
      prof++;
      if (prof === 1 && ini < 0) ini = i;
      i++; continue;
    }
    if (c === '}') {
      prof--;
      if (prof === 0) { out.push({ sel, ini, fin: i + 1, cuerpo: texto.slice(ini + 1, i) }); sel = ''; ini = -1; }
      i++; continue;
    }
    if (prof === 0) sel += c;
    i++;
  }
  return out;
}

function norm(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1')
    .replace(/\s*:\s+/g, ':').trim();
}

function declaraciones(cuerpo) {
  const limpio = cuerpo.replace(/\/\*[\s\S]*?\*\//g, '');
  const mapa = {};
  limpio.split(';').forEach((d) => {
    const p = d.indexOf(':');
    if (p < 0) return;
    const prop = d.slice(0, p).trim().toLowerCase();
    const val = d.slice(p + 1).trim().replace(/\s+/g, ' ');
    if (prop && val) mapa[prop] = val;
  });
  return mapa;
}

let base = fs.readFileSync(BASE, 'utf8');
const antes = base;
const nlB = base.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const lineaDe = (pos) => base.slice(0, pos).split(nlB).length;

// -------------------------------------------------------------------
// 1. IDEMPOTENCIA, POR ESTADO
// -------------------------------------------------------------------
// Y se pregunta por el ESTADO, no por "el archivo existe".
//
// Si "css/base.css" ya no tiene reglas muertas, est\u00e1 hecho. Y si todav\u00eda tiene, hay que
// borrar. Y si tiene MUCHAS m\u00e1s de las esperadas, no se toca nada: alguien cambi\u00f3 algo y este
// guion ya no sabe de qu\u00e9 est\u00e1 hablando.
const indice = {};
DESPUES.forEach((rel) => {
  const p = path.join(raiz, rel);
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  const n2 = txt.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  reglas(txt).forEach((r) => {
    const sel = norm(r.sel);
    if (sel.indexOf('@') === 0) return;
    const decl = declaraciones(r.cuerpo);
    sel.split(',').forEach((uno) => {
      const k = uno.trim();
      if (!k || k.indexOf('@') === 0) return;
      if (!indice[k]) indice[k] = [];
      indice[k].push({ hoja: rel, linea: txt.slice(0, r.ini).split(n2).length, decl });
    });
  });
});

function muertasDe(texto) {
  const out = [];
  const n2 = texto.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  reglas(texto).forEach((r) => {
    if (norm(r.sel).indexOf('@') === 0) return;
    const decl = declaraciones(r.cuerpo);
    const props = Object.keys(decl);
    if (!props.length) return;
    const sels = norm(r.sel).split(',').map((x) => x.trim()).filter((x) => x && x.indexOf('@') !== 0);
    if (!sels.length) return;

    let tapadaPor = null;
    let igualesTodas = false;

    sels.forEach((s) => {
      (indice[s] || []).forEach((otro) => {
        if (props.some((p) => !(p in otro.decl))) return;   // le falta alguna: no la tapa
        if (!tapadaPor) tapadaPor = otro;
        if (props.every((p) => otro.decl[p] === decl[p])) igualesTodas = true;
      });
    });

    if (tapadaPor) out.push({ r, sels, props, tapadaPor, igualesTodas, linea: lineaDe(r.ini) });
  });
  return out;
}

const muertas = muertasDe(base);

if (muertas.length === 0) {
  console.log('    (ya est\u00e1 hecho: "css/base.css" no tiene reglas muertas)');
  process.exit(0);
}

if (muertas.length !== ESPERADAS) {
  console.log('  *** HAY ' + muertas.length + ' REGLAS MUERTAS, Y SE ESPERABAN ' + ESPERADAS + ' ***');
  console.log('');
  console.log('    No se escribe nada. O alguien cambi\u00f3 una hoja de abajo y el conjunto se');
  console.log('    redujo \u2014 y esas reglas nuevas hay que MIRARLAS antes de decidir \u2014 o se a\u00f1adi\u00f3 algo');
  console.log('    que este guion no conoce.');
  console.log('');
  console.log('    Para ver cu\u00e1les son ahora:  node tools/mide-pisadas.js');
  process.exit(1);
}

// -------------------------------------------------------------------
// 2. LO QUE SE VA A BORRAR, Y SI LOS VALORES SON IGUALES O DISTINTOS
// -------------------------------------------------------------------
// Y esa diferencia es informativa. Si los valores son IGUALES, el bloque se copi\u00f3 tal cual y
// qued\u00f3 duplicado. Si son DISTINTOS, alguien edit\u00f3 "styles.css" despu\u00e9s y el del "<style>" qued\u00f3
// como un resto viejo.
//
// Y el resultado es el mismo en los dos casos: la regla est\u00e1 muerta. Pero lo que cuenta el
// archivo no es lo mismo.
const iguales = muertas.filter((x) => x.igualesTodas).length;
const distintas = muertas.length - iguales;

console.log('    se borran ' + muertas.length + ' reglas:');
console.log('      ' + iguales + ' con los MISMOS valores en la hoja de abajo (copia literal)');
console.log('      ' + distintas + ' con valores DISTINTOS (la de abajo se edit\u00f3, el resto qued\u00f3 viejo)');
console.log('');

muertas.forEach((x) => {
  console.log('    L' + String(x.linea).padStart(5) + '  ' + x.sels.join(', ').slice(0, 40)
    + (x.igualesTodas ? '   (mismos valores)' : '   (valores distintos)'));
});

// -------------------------------------------------------------------
// 3. BORRAR
// -------------------------------------------------------------------
// Por el texto exacto de la regla, y de ATR\u00c1S para adelante, que es lo que no se puede romper.
//
// Y si una regla est\u00e1 al principio de l\u00ednea, y despu\u00e9s viene un comentario que la explica, el
// comentario SE QUEDA. Se deja: es informaci\u00f3n, y no es de esta regla.
// De ATRÁS HACIA ADELANTE. Cada corte acorta el texto, así que si se empieza por arriba,
// los rangos de abajo siguen siendo válidos.
//
// Y antes se iba en el orden en que venían, que es el del archivo, de arriba abajo. El primer
// corte desplazaba todos los siguientes, y el archivo quedó con 6 llaves de cerrar de más.
const ordenadas = muertas.slice().sort((a, b) => b.r.ini - a.r.ini);

// Y que cada rango tenga tantas llaves de abrir como de cerrar, ANTES de cortar nada. Es la
// comprobación que faltaba: el archivo puede estar cuadrado antes y después, y en el medio
// cortar el trozo equivocado.
const sinCuadrar = ordenadas.filter((x) => {
  const trozo = base.slice(x.r.ini, x.r.fin);
  return (trozo.match(/\{/g) || []).length !== (trozo.match(/\}/g) || []).length;
});

if (sinCuadrar.length) {
  console.log('  *** HAY ' + sinCuadrar.length + ' RANGOS QUE NO TIENEN LAS MISMAS LLAVES ***');
  sinCuadrar.forEach((x) => console.log('    L' + x.linea + '  ' + x.sels.join(', ')));
  console.log('    No se escribe nada: un corte descuadrado deja el archivo roto.');
  process.exit(1);
}

ordenadas.forEach((x) => {
  const desde = x.r.ini;
  const hasta = x.r.fin;
  base = base.slice(0, desde) + base.slice(hasta);
});

// -------------------------------------------------------------------
// 4. LOS GUARDIANES
// -------------------------------------------------------------------
const kAntes = (function (s) {
  const l = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return [(l.match(/\{/g) || []).length, (l.match(/\}/g) || []).length];
})(antes);
const kDespues = (function (s) {
  const l = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return [(l.match(/\{/g) || []).length, (l.match(/\}/g) || []).length];
})(base);

if (kAntes[0] !== kAntes[1]) {
  console.log('  *** "base.css" ESTABA DESCUADRADO ANTES ***');
  process.exit(1);
}
if (kDespues[0] !== kDespues[1]) {
  console.log('  *** EL ARCHIVO QUED\u00d3 DESCUADRADO ***');
  console.log('    abre ' + kDespues[0] + ', cierra ' + kDespues[1]);
  process.exit(1);
}
if (kAntes[0] - kDespues[0] !== ESPERADAS) {
  console.log('  *** SE SACARON ' + (kAntes[0] - kDespues[0]) + ' LLAVES DE ABRIR, Y SON ' + ESPERADAS + ' ***');
  process.exit(1);
}

// Y lo m\u00e1s importante: que NO quede ninguna regla muerta. O sea, que el bucle haya convergenceado
// en un solo paso.
const quedanMuertas = muertasDe(base);
if (quedanMuertas.length) {
  console.log('  *** QUEDAN ' + quedanMuertas.length + ' REGLAS MUERTAS ***');
  quedanMuertas.forEach((x) => console.log('    L' + x.linea + '  ' + x.sels.join(', ')));
  console.log('    No se escribe nada: un paso no alcanz\u00f3, y sin saber por qu\u00e9 no se sigue.');
  process.exit(1);
}

fs.writeFileSync(BASE, base, 'utf8');

const lA = antes.split(nlB).length;
const lD = base.split(nlB).length;
console.log('');
console.log('    ok  se borraron ' + ESPERADAS + ' reglas de "css/base.css"');
console.log('    ok  llaves: ' + kAntes[0] + ' -> ' + kDespues[0] + '  (' + ESPERADAS + ' menos, ni una de m\u00e1s)');
console.log('    ok  lineas: ' + lA + ' -> ' + lD);
console.log('    ok  y ya no queda ninguna regla muerta: el bucle lleg\u00f3 en un paso');
console.log('');
console.log('    Y CON ESTO EL NAVEGADOR NO SIRVE DE TESTIGO. No porque no se pueda abrir, sino');
console.log('    porque si una regla est\u00e1 muerta, borrarla no cambia NADA de lo que se ve: la prueba');
console.log('    de que est\u00e1 muerta es la misma que la de que borrarla es inofensivo.');
console.log('    La prueba de verdad es la de arriba: hay una hoja abajo, con el mismo selector,');
console.log('    que declara todas sus propiedades.');