// LOS COLORES Y LAS FUENTES DEL MENU, Y CUALES ESTAN SUELTOS
// ============================================================
//
// -------------------------------------------------------------------
// PARA QU\u00c9
// ---------
//
// El usuario quiere poder cambiar la paleta del men\u00fa con sus fuentes, sin tener que buscarlas
// en un archivo de 5.700 renglones. Eso es una REFORM\u00c0: los valores no cambian, se les pone nombre.
//
// Y para poner nombre hay que saber qu\u00e9 hay. Con la lista completa a la vista, y no de memoria.
//
// -------------------------------------------------------------------
// QU\u00c9 ES "EL MENU"
// ------------------
//
// El encabezado, las dos barras de botoneras, el desplegable de cada boton, y la marca.
//
// Y no el resto: los botones de acci\u00f3n ("CERRAR SESI\u00d3N", la empresa, el reloj) son de la
// aplicaci\u00f3n, no del men\u00fa, y tienen su propia paleta.
//
// -------------------------------------------------------------------
// Y POR QU\u00c9 SE DISTINGUE "SUELTO" DE "CON NOMBRE"
// ----------------------------------------------
//
// Porque un color escrito como "#d4dbe4" est\u00e1 en un solo lugar: si hay que cambiarlo, hay que
// saber d\u00f3nde est\u00e1. Un "var(--algo)" est\u00e1 en un lugar y en todos los que lo usan.
//
// Y la cuenta importa: si hay 17 colores sueltos, el trabajo es de 17 l\u00edneas. Si hay 3, es de 3.
//
// -------------------------------------------------------------------
// Y LO QUE NO SE TOCA
// --------------------
//
// "--fondo-seccion", "--fondo-nav" y "--fondo-subnav" YA SON variables, y ya est\u00e1n nombradas y
// definidas por grupo de men\u00fa. Es exactamente lo que se ped\u00eda, y ya existe.
//
// Se miden para poder REPORTAR d\u00f3nde est\u00e1n, no para moverlas: mudarlas cambia d\u00f3nde caen en la
// cascada, y eso hay que medirlo con el guardi\u00e1n.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');

// Los selectores que son del men\u00fa. Se prueban por palabra, porque un selector del men\u00fa puede
// ser "header h1" o "#subNav .nav-dropdown-trigger", y ninguno se parece a una palabra suelta.
const DEL_MENU = [
  'header',
  'nav',
  '#mainNav',
  '#subNav',
  'marca',
  'nav-dropdown',
  'nav-compacto',
];

const HOJAS = ['css/base.css', 'css/styles.css', 'css/marca.css',
  'css/vistas.css', 'css/componentes/tarjeta.css'];

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
      if (prof === 0) { out.push({ sel, ini, cuerpo: texto.slice(ini + 1, i) }); sel = ''; ini = -1; }
      i++; continue;
    }
    if (prof === 0) sel += c;
    i++;
  }
  return out;
}

// Lo que se busca en el cuerpo de una regla del men\u00fa.
const COLOR = /(?:^|;)\s*(color|background|background-color|border-color|border-bottom(?:-color)?|border-top(?:-color)?|fill|stroke|outline-color)\s*:\s*([^;]+)/gi;
const FUENTE = /(?:^|;)\s*(font|font-family|font-size|font-weight|letter-spacing|text-transform|line-height)\s*:\s*([^;]+)/gi;

const sueltos = {};
const conNombre = {};
const fuentes = {};

HOJAS.forEach((rel) => {
  const p = path.join(raiz, rel);
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  const n2 = txt.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

  reglas(txt).forEach((r) => {
    const sel = r.sel.replace(/\s+/g, ' ');
    if (sel.indexOf('@') === 0) return;

    // Y el selector, o alguna parte de \u00e9l, tiene que ser del men\u00fa.
    // Y "marca" NO puede coincidir dentro de "marcajes". Después de la palabra tiene que
    // haber un separador de verdad, no una letra.
    const sinSimbolos = sel.replace(/[#.>,\s:+~[\]()="']/g, ' ');
    const esMenu = DEL_MENU.some((d) => {
      const limpia = d.replace(/^[#.]/, '');
      let desde = 0;
      while (true) {
        const i = sinSimbolos.indexOf(limpia, desde);
        if (i < 0) return false;
        const despues = sinSimbolos[i + limpia.length] || '';
        if (!/[a-z0-9]/.test(despues)) return true;
        desde = i + 1;
      }
    });
    if (!esMenu) return;

    const linea = txt.slice(0, r.ini).split(n2).length;

    let m;
    COLOR.lastIndex = 0;
    while ((m = COLOR.exec(r.cuerpo)) !== null) {
      const valor = m[2].trim();
      const item = { sel, linea, prop: m[1].toLowerCase(), valor };
      if (valor.indexOf('var(') >= 0) {
        const nombre = (valor.match(/var\(\s*(--[a-z0-9-]+)/i) || [])[1];
        if (!conNombre[nombre]) conNombre[nombre] = [];
        conNombre[nombre].push(item);
      } else if (valor !== 'none' && valor !== 'transparent' && valor !== 'inherit') {
        if (!sueltos[valor]) sueltos[valor] = [];
        sueltos[valor].push(item);
      }
    }

    FUENTE.lastIndex = 0;
    while ((m = FUENTE.exec(r.cuerpo)) !== null) {
      const valor = m[2].trim();
      if (!fuentes[valor]) fuentes[valor] = [];
      fuentes[valor].push({ sel, linea, prop: m[1].toLowerCase() });
    }
  });
});

// -------------------------------------------------------------------
// LOS COLORES SUELTOS
// -------------------------------------------------------------------
const claves = Object.keys(sueltos).sort((a, b) => sueltos[b].length - sueltos[a].length);

console.log('  LA PALETA DEL MENU: LO QUE ESTA SUELTO');
console.log('  ======================================');
console.log('');
console.log('    Un color escrito como "#d4dbe4" est\u00e1 en un solo lugar. Si hay que cambiarlo, hay');
console.log('    que saber d\u00f3nde est\u00e1. Un "var(--algo)" est\u00e1 en uno y en todos los que lo usan.');
console.log('');
console.log('    valor          veces  d\u00f3nde');
console.log('    ' + '-'.repeat(74));

let totalSueltos = 0;
claves.forEach((v) => {
  const xs = sueltos[v];
  totalSueltos += xs.length;
  const donde = xs.slice(0, 3).map((x) => x.sel.slice(0, 26)).join('  ');
  console.log('    ' + v.padEnd(14) + String(xs.length).padStart(6) + '  ' + donde
    + (xs.length > 3 ? '  ...' : ''));
});

console.log('    ' + '-'.repeat(74));
console.log('    ' + String(totalSueltos).padStart(4) + ' declaraciones de color, con solo '
  + claves.length + ' valores distintos');
console.log('');

// -------------------------------------------------------------------
// LAS VARIABLES QUE YA EXISTEN
// -------------------------------------------------------------------
const nombres = Object.keys(conNombre).sort();
console.log('  Y LAS QUE YA TIENEN NOMBRE (' + nombres.length + ')');
console.log('');
nombres.forEach((n) => {
  console.log('    ' + n.padEnd(22) + String(conNombre[n].length).padStart(3) + ' usos');
});
console.log('');

// -------------------------------------------------------------------
// LAS FUENTES
// -------------------------------------------------------------------
const ffuentes = Object.keys(fuentes).sort((a, b) => fuentes[b].length - fuentes[a].length);
console.log('  LAS FUENTES DEL MENU');
console.log('');
console.log('    valor                                       veces');
console.log('    ' + '-'.repeat(74));
let totalF = 0;
ffuentes.forEach((v) => {
  totalF += fuentes[v].length;
  console.log('    ' + v.slice(0, 46).padEnd(47) + String(fuentes[v].length).padStart(6));
});
console.log('    ' + '-'.repeat(74));
console.log('    ' + String(totalF).padStart(4) + ' declaraciones de fuente, con '
  + ffuentes.length + ' valores distintos');
console.log('');

// -------------------------------------------------------------------
// LO QUE PROPONDRÍA
// -------------------------------------------------------------------
console.log('  LO QUE SE PUEDE NOMBRAR SIN MOVER NADA');
console.log('  ----------------------------------------');
console.log('');
console.log('  Los ' + claves.length + ' colores sueltos: uno por valor, con nombre. Se reemplaza cada');
console.log('  "#d4dbe4" por "var(--menu-boton)" y queda en un solo archivo.');
console.log('');
console.log('  Y las fuentes, que se repiten en ' + ffuentes.length + ' formas distintas. Hoy cada boton');
console.log('  escribe la pila completa: "600 .75rem \'Montserrat\',system-ui,sans-serif".');
console.log('  Con "--menu-fuente" eso se escribe una vez.');