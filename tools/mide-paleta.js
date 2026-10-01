// \u00c9TAS LAS VARIABLES SE DEFINEN UNA VEZ O DOS, Y D\u00d3NDE SE USA CADA UNA
// ============================================================================
//
// -------------------------------------------------------------------
// PARA QU\u00c9
// ---------
//
// Porque la pregunta es si se puede poner la paleta por vista, y eso depende de un hecho: si los
// tres bloques dicen LO MISMO, o si el oscuro del sistema y el de "data-theme" no coinciden.
//
// -------------------------------------------------------------------
// Y POR QU\u00c9 ESO CONTESTA LA PREGUNTA
// ------------------------------
//
// Porque si los dos bloques oscuros ya son distintos, agregar una paleta por vista se multiplica el
// problema por la cantidad de vistas: habr\u00eda que mantener N paletas x 2 temas, y cada una
// medida.
//
// -------------------------------------------------------------------
// Y EL OTRO DATO QUE FALTA
// ------------------
//
// Cu\u00e1ntas variables hay, y cu\u00e1ntas se usan. Una variable declarada y no usada es c\u00f3digo muerto, y
// una usada y no declarada es un error que no se ve hasta que se usa.
//
// Y hay un caso peor, que ya pas\u00f3: una variable que existe en el tema claro y NO en el oscuro.
// Esa hereda el valor del tema anterior: el tema nuevo la muestra con el color del viejo, sin
// ning\u00fan aviso. Y por eso el archivo dice, en su propio comentario, que hay que declarar con su
// valor en los TRES bloques.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const TOK = path.join(raiz, 'css', '_tokens.css');
const txt = fs.readFileSync(TOK, 'utf8');

function bloque(desde, hasta) {
  const a = txt.indexOf(desde);
  if (a < 0) return '';
  const b = hasta ? txt.indexOf(hasta, a) : txt.length;
  return txt.slice(a, b < 0 ? txt.length : b);
}

const CLARO = bloque(':root{', '/* Modo oscuro');
const OSCURO_SISTEMA = bloque(':root:not([data-theme="light"]){', '}\n\n}');
const OSCURO_TEMA = bloque(':root[data-theme="dark"]{', null);

function variables(texto) {
  const salida = {};
  (texto.match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || []).forEach((d) => {
    const p = d.indexOf(':');
    const k = d.slice(0, p).trim();
    const v = d.slice(p + 1).trim();
    if (k !== '--ancho-maximo') salida[k] = v;   // el ancho no es un color
  });
  return salida;
}

const claro = variables(CLARO);
const oscuroS = variables(OSCURO_SISTEMA);
const oscuroT = variables(OSCURO_TEMA);

console.log('  LA PALETA, HOY');
console.log('  ===============');
console.log('');
console.log('    en ":root" (claro):                 ' + Object.keys(claro).length + ' variables');
console.log('    en ":root:not([data-theme=light])":  ' + Object.keys(oscuroS).length);
console.log('    en ":root[data-theme=dark]":        ' + Object.keys(oscuroT).length);
console.log('');

// -------------------------------------------------------------------
// 1. ¿LOS DOS OSCUROS SON IGUALES?
// -------------------------------------------------------------------
// Y esta es la comprobaci\u00f3n que importa. Si no son iguales, el mismo usuario ve dos paletas
// distintas seg\u00fan de d\u00f3nde lleg\u00f3.
const todas = new Set([].concat(
  Object.keys(claro), Object.keys(oscuroS), Object.keys(oscuroT)
));

const difieren = [];
const faltan = [];

todas.forEach((k) => {
  const a = oscuroS[k];
  const b = oscuroT[k];

  if (a === undefined || b === undefined) {
    faltan.push(k + '  (sistema: ' + (a === undefined ? 'NO EST\u00c1' : a) + ', data-theme: ' + (b === undefined ? 'NO EST\u00c1' : b) + ')');
    return;
  }
  if (a !== b) difieren.push(k + '  sistema: ' + a + '   data-theme: ' + b);
});

console.log('  \u00bfLOS DOS OSCUROS DICEN LO MISMO?');
console.log('');
if (difieren.length) {
  console.log('    *** NO. ' + difieren.length + ' VARIABLE(S) DIFIEREN ***');
  difieren.forEach((d) => console.log('      ' + d));
  console.log('');
  console.log('    Con esto, el mismo usuario ve dos paletas seg\u00fan si recarga la p\u00e1gina o vuelve de');
  console.log('    otra vista. Y es la forma m\u00e1s dif\u00edcil de depurar que hay.');
} else {
  console.log('    ok  los dos bloques oscuros dicen exactamente lo mismo');
}

if (faltan.length) {
  console.log('');
  console.log('    *** ' + faltan.length + ' FALTA EN ALG\u00daNO DE LOS DOS OSCUROS ***');
  faltan.forEach((d) => console.log('      ' + d));
  console.log('');
  console.log('    Una variable que no est\u00e1 en un tema hereda el valor del otro. O sea: se ve con el');
  console.log('    color del tema anterior, sin aviso.');
}
console.log('');

// -------------------------------------------------------------------
// 2. \u00bfTODAS LAS VARIABLES DEL CLARO EST\u00c1N EN LOS OSCUROS?
// -------------------------------------------------------------------
const soloClaro = Object.keys(claro).filter((k) => oscuroS[k] === undefined || oscuroT[k] === undefined);
if (soloClaro.length) {
  console.log('  LAS QUE SOLO EST\u00c1N EN EL TEMA CLARO: ' + soloClaro.join(', '));
  console.log('    Si son colores, el tema oscuro las muestra con el color claro.');
  console.log('');
} else {
  console.log('    ok  toda variable del tema claro tiene su valor en los dos oscuros');
  console.log('');
}

// -------------------------------------------------------------------
// 3. \u00bfCU\u00c1NTAS SE USAN?
// -------------------------------------------------------------------
// Y hay que contar en TODOS los archivos de CSS, no solo en la paleta.
const hojas = ['css/_base.css', 'css/styles.css', 'css/_marca.css', 'css/_vistas.css',
  'css/movil.css',
  'css/componentes/porteria.css', 'css/componentes/tarjeta.css', 'css/componentes/totem.css'];

const usos = {};
hojas.forEach((h) => {
  const p = path.join(raiz, h);
  if (!fs.existsSync(p)) return;
  const c = fs.readFileSync(p, 'utf8');
  (c.match(/var\(\s*(--[a-z0-9-]+)/gi) || []).forEach((m) => {
    const k = m.replace(/var\(\s*/i, '');
    usos[k] = (usos[k] || 0) + 1;
  });
});

const todasVar = Object.keys(claro);
const sinUso = todasVar.filter((k) => !usos[k]);

console.log('  \u00bfSE USAN?');
console.log('');
console.log('    declaradas:  ' + todasVar.length);
console.log('    usadas:      ' + (todasVar.length - sinUso.length));
if (sinUso.length) {
  console.log('    SIN USO:     ' + sinUso.join(', '));
  console.log('                 Son c\u00f3digo muerto. Y si alg\u00fan d\u00eda alguien las usa por costumbre,');
  console.log('                 no va a pasar nada, y va a pasar dentro de seis meses.');
}
console.log('');

// Y al rev\u00e9s: variables usadas que NO est\u00e1n declaradas. Eso es un error de verdad.
const declaradasTodas = new Set(todas);
const fantasma = Object.keys(usos).filter((k) => !declaradasTodas.has(k));
if (fantasma.length) {
  console.log('    *** USADAS Y NO DECLARADAS: ' + fantasma.length + ' ***');
  fantasma.forEach((k) => console.log('      ' + k + '   (' + usos[k] + ' veces)'));
  console.log('');
  console.log('    Con "var(--algo)" sin declarar, el navegador usa el texto "--algo" como si fuera el');
  console.log('    color. Se ve "transparent", o un "--algo" en pantalla, seg\u00fan d\u00f3nde se use.');
} else {
  console.log('    ok  ninguna variable se usa sin estar declarada');
}