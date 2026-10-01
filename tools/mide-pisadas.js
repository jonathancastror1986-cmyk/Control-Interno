// CU\u00c1LES REGLAS DE "_base.css" NO LLEGAN NUNCA A LA PANTALLA
// ==============================================================
//
// -------------------------------------------------------------------
// POR QU\u00c9 HAY QUE REHACER ESTA MEDICI\u00d3N
// ---------------------------------------
//
// La versi\u00f3n anterior dec\u00eda "MUERTA" cuando el mismo selector aparec\u00eda m\u00e1s abajo con AL MENOS UNA
// declaraci\u00f3n en com\u00fan. Y cont\u00f3 48.
//
// Y eso est\u00e1 mal. El ejemplo que lo muestra:
//
//     _base.css  L36   header{ padding, border-bottom, position, top, background, ... 7 }
//     styles.css L16   header{ ... 5 en com\u00fan ... }
//
// O sea: hay 5 declaraciones en com\u00fan y 2 que "styles.css" NO pone. Esas dos S\u00cd llegan a la
// pantalla. Y si se borra la regla, desaparecen.
//
// -------------------------------------------------------------------
// Y POR QU\u00c9 ESO NO ES UN DETALLE, ES LO QUE HACE FALTA
// ---------------------------------------------------
//
// Porque "48 reglas muertas" es un n\u00famero que da confianza. Y si alguien borra 48 reglas y en
// realidad eran 4, la p\u00e1gina cambia y no se sabe por qu\u00e9.
//
// Y el n\u00famero se reporta porque se cita. Un n\u00famero overstated es peor que no dar n\u00famero.
//
// -------------------------------------------------------------------
// EL CRITERIO QUE S\u00cd SIRVE, Y ES EL \u00daNICO SIN DISCUSI\u00d3N
// -----------------------------------------------
//
// Una regla de "_base.css" est\u00e1 MUERTA si existe una regla m\u00e1s abajo, con el MISMO selector, que
// declare TODAS sus propiedades, con el MISMO valor.
//
//   - Mismo selector: misma especificidad, as\u00ed que gana la de abajo sin discusi\u00f3n.
//   - Todas las propiedades: si falta una, esa sigue aplicando.
//   - Mismo valor: si el valor es otro, el de abajo gana y el de "_base.css" no se ve, pero solo
//     para esa propiedad. Y si es IGUAL, da lo mismo, y la de "_base.css" es redundante.
//
// Y ojal\u00e1: si el valor es distinto, la de "_base.css" est\u00e1 pisada solo para esa propiedad. Eso es
// PARCIAL, que es una categor\u00eda aparte de MUERTA y de VIVA.
//
// -------------------------------------------------------------------
// Y POR QU\u00c9 "MISMO VALOR" CUENTA COMO MUERTA Y NO COMO VIVA
// ----------------------------------------------------------
//
// Porque si las dos reglas dicen "padding:8px" y la de "_base.css" est\u00e1 antes, la de "_base.css"
// nunca es la que se aplica. La p\u00e1gina muestra el valor de la de abajo. La de "_base.css" es c\u00f3digo que
// no hace nada, aunque se vea igual.
//
// O sea que no es "c\u00f3digo que se puede quitar porque no importa": es c\u00f3digo que no hace NADA. Y
// eso, cuando alguien lo lea dentro de seis meses, es una pregunta sin respuesta.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const BASE = path.join(raiz, 'css', '_base.css');

const DESPUES = [
  'css/styles.css',
  'css/_marca.css',
  'css/_vistas.css',
  'css/componentes/porteria.css',
  'css/componentes/totem.css',
  'css/componentes/tarjeta.css',
  'css/movil.css',
];

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

function norm(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~,])\s*/g, '$1')
    .replace(/\s*:\s+/g, ':')
    .trim();
}

// Las declaraciones como "propiedad" -> "valor". Con el valor normalizado: sin espacios de sobra,
// con las min\u00fasculas del nombre de la propiedad, y SIN tocar el valor, porque "1px" y "1 px" son
// lo mismo pero "#FFF" y "#fff" tambi\u00e9n, y no as\u00ed se baja a eso.
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

const base = fs.readFileSync(BASE, 'utf8');
const nlB = base.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const lineaDe = (pos) => base.slice(0, pos).split(nlB).length;

// -------------------------------------------------------------------
// EL \u00cdNDICE DE LAS HOJAS DE DESPU\u00c9S
// -------------------------------------------------------------------
const indice = {};
DESPUES.forEach((rel) => {
  const p = path.join(raiz, rel);
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  const n2 = txt.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  reglas(txt).forEach((r) => {
    const sel = norm(r.sel);
    if (sel.indexOf('@') === 0) return;     // un "@media" no compite en escritorio
    const decl = declaraciones(r.cuerpo);
    sel.split(',').forEach((uno) => {
      const k = uno.trim();
      if (!k || k.indexOf('@') === 0) return;
      if (!indice[k]) indice[k] = [];
      indice[k].push({ hoja: rel, linea: txt.slice(0, r.ini).split(n2).length, decl });
    });
  });
});

// -------------------------------------------------------------------
// CLASIFICAR
// -------------------------------------------------------------------
const muertas = [];
const parciales = [];
const vivas = [];

reglas(base).forEach((r) => {
  if (norm(r.sel).indexOf('@') === 0) return;
  const decl = declaraciones(r.cuerpo);
  const props = Object.keys(decl);
  if (!props.length) return;

  const sels = norm(r.sel).split(',').map((x) => x.trim()).filter((x) => x && x.indexOf('@') !== 0);
  if (!sels.length) return;

  let tapadaPor = null;     // una regla m\u00e1s abajo que cubra TODO
  let tapadaEn = 0;         // cu\u00e1ntas propiedades cubre otra, aunque no todas
  let igualesTodas = false; // y si además los valores coinciden: copia o resto viejo

  sels.forEach((s) => {
    (indice[s] || []).forEach((otro) => {
      let iguales = 0;
      let distintas = 0;
      let propias = 0;
      props.forEach((p) => {
        if (!(p in otro.decl)) { propias++; return; }
        if (otro.decl[p] === decl[p]) iguales++;
        else distintas++;
      });

      if (propias === 0) {
        // Cubre TODAS las declaraciones. Con eso basta: gana la de abajo por orden de
        // cascada, así que los valores de "_base.css" no se ven, no importa qué valgan.
        //
        // Y antes también se exigía que fueran IGUALES, y eso estaba de más: bajaba la
        // cuenta de 42 a 23, y 19 reglas muertas quedaban sin señalar.
        if (!tapadaPor) tapadaPor = otro;
        if (distintas === 0) igualesTodas = true;   // copia literal, no resto viejo
      } else if (propias < props.length) {
        if (tapadaEn < propias) tapadaEn = propias;
      }
    });
  });

  const item = { linea: lineaDe(r.ini), sels, props: props.map((p) => p + ':' + decl[p]), tapadaPor, tapadaEn, igualesTodas };

  if (tapadaPor) muertas.push(item);
  else if (tapadaEn > 0) parciales.push(item);
  else vivas.push(item);
});

console.log('  QU\u00c9 REGLAS DE "css/_base.css" NO LLEGAN A LA PANTALLA');
console.log('  ================================================');
console.log('');
console.log('  "_base.css" se carga en el rengl\u00f3n 20, ANTES que todas las dem\u00e1s hojas.');
console.log('  As\u00ed que cuando dos reglas dicen lo mismo, gana la de abajo.');
console.log('');
console.log('    MUERTAS    todo lo que dicen est\u00e1 en una hoja de abajo:  ' + muertas.length);
console.log('    PARCIALES una hoja de abajo tapa algunas, no todas:       ' + parciales.length);
console.log('    VIVAS      no hay nadie abajo que compita:               ' + vivas.length);
console.log('    (total ' + (muertas.length + parciales.length + vivas.length) + ' reglas con declaraciones)');
console.log('');

if (muertas.length) {
  console.log('  LAS MUERTAS: SE PUEDEN BORRAR');
  console.log('  ' + '-'.repeat(74));
  console.log('');
  muertas.forEach((x) => {
    console.log('    L' + String(x.linea).padStart(5) + '  ' + x.sels.join(', ').slice(0, 44));
    console.log('           la tapa: ' + x.tapadaPor.hoja + ' L' + x.tapadaPor.linea
      + '   (' + x.props.length + ' declaraciones)');
  });
  console.log('');
}

if (parciales.length) {
  console.log('  LAS PARCIALES: HAY QUE MIRARLAS');
  console.log('  ' + '-'.repeat(74));
  console.log('  Una hoja de abajo declara algunas de sus declaraciones, pero no todas.');
  console.log('  Las que NO declara siguen aplicando. No se puede borrar la regla entera.');
  console.log('');
  parciales.forEach((x) => {
    console.log('    L' + String(x.linea).padStart(5) + '  ' + x.sels.join(', ').slice(0, 44)
      + '   (' + x.tapadaEn + ' de ' + x.props.length + ' tapadas)');
  });
  console.log('');
}

console.log('  Y LO QUE NO SE DICE');
console.log('  ' + '-'.repeat(74));
console.log('  Que una regla est\u00e9 VIVA no significa que haga algo. Puede que est\u00e9 VIVA porque');
console.log('  pone una propiedad que nadie m\u00e1s pone, y esa s\u00ed hace algo. O puede que est\u00e9 VIVA');
console.log('  por un detalle que esta cuenta no mira: un pseudo-elemento, un "::before", una regla');
console.log('  dentro de un "@media" de otra hoja.');
console.log('');
console.log('  As\u00ed que "viva" aqu\u00ed significa solo "nadie la pisa con el MISMO selector". Que es');
console.log('  un piso, no un techo.');