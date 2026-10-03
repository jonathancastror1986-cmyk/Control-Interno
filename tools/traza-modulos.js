// TRAZA LAS FUNCIONES DE NIVEL SUPERIOR Y DICE QUÉ TABLA TOCA CADA UNA
// =======================================================================
//
// Y POR QUÉ SE TRAZA DESDE ".from()" Y NO DESDE EL NOMBRE
// ------------------------------------------------------
//
// Porque "marcajes" aparece 81 veces en el código, y esas 81 son: una tabla, una columna,
// tres variables locales y un identificador de pantalla. CERO declaraciones se llaman
// "marcaje*". Filtrar por el nombre no encuentra la entidad: encuentra palabras. Y el plan
// entero sale de un número que salió de contar menciones, así que el plan estaba mal antes de
// arrancar. Ver [arq-07].
//
// Lo que sí es un ancla es ".from('algo')": cada vez que el código habla con la base,
// escribe el nombre de la tabla ahí, y esa línea no depende de cómo se llamen las funciones
// de arriba.
//
// -------------------------------------------------------------------
// Y LA UNIDAD QUE SE MUEVE ES LA FUNCIÓN, NO LA LÍNEA
// ----------------------------------------------------
//
// ".from()" marca una línea, pero lo que se puede mover es la función que la contiene, y a
// veces la función toca dos tablas y a veces la tabla la tocan cuatro funciones que son la
// misma cosa. Por eso el informe da las dos cosas: qué función, y qué tablas.
//
// -------------------------------------------------------------------
// Y EL CORTE SE MIDE, NO SE OPINA
// -------------------------------
//
// Al final se cuenta cuántas funciones quedan "de este lado" y cuántas "del otro", y además
// cuántas NO tocan la base —que son las que hay que decidir a mano—. Porque una función sin
// ninguna tabla es la que define la frontera: puede ser de cualquiera de los dos lados, y
// es la primera que hay que discutir.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const OBJETIVO = process.argv[2] || 'views/asistencia/relojes.js';
const OTRO = process.argv[3] || 'views/administracion/documentos.js';

const f = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

// -------------------------------------------------------------------
// 1) LAS FUNCIONES DE NIVEL SUPERIOR, CON SU LÍNEA Y SU LÍNEA FINAL
// -------------------------------------------------------------------
// Y "de nivel superior" significa una columna cero. Una función anidada no se puede mover por
// separado, y contarla como si se pudiera es lo que hace que un plan de mudanza no cuadre.
function funciones(txt) {
  const out = [];
  const lineas = txt.split('\n');
  lineas.forEach((x, i) => {
    const m = x.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (!m) return;
    // Y "export function" también es de nivel superior, por si algún archivo usa módulos.
    const e = x.match(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    out.push({ nombre: e ? e[1] : m[1], desde: i + 1, hasta: null });
  });
  for (let i = 0; i < out.length - 1; i++) out[i].hasta = out[i + 1].desde - 1;
  if (out.length) out[out.length - 1].hasta = lineas.length;
  return out;
}

// -------------------------------------------------------------------
// 2) LAS TABLAS, DE LA FORMA QUE EL CÓDIGO LAS ESCRIBE
// -------------------------------------------------------------------
// Y se aceptan las dos formas de "supabase-js": ".from('nombre')" y ".from("nombre")".
const RE_TABLA = /\.from\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
// Y "rpc(" también habla con la base, y una función que solo hace eso es de la vista o del
// modelo igual que una que hace un select.
const RE_RPC = /\.rpc\(\s*['"`]([^'"`]+)['"`]/g;

function tablasDe(txt) {
  const out = new Set();
  let m;
  RE_TABLA.lastIndex = 0;
  while ((m = RE_TABLA.exec(txt)) !== null) out.add(m[1]);
  RE_RPC.lastIndex = 0;
  while ((m = RE_RPC.exec(txt)) !== null) out.add('rpc:' + m[1]);
  return out;
}

const fA = funciones(f(OBJETIVO));
const cuerpo = f(OBJETIVO).split('\n');

const filas = fA.map((fn) => {
  const trozo = cuerpo.slice(fn.desde - 1, fn.hasta).join('\n');
  return {
    nombre: fn.nombre,
    desde: fn.desde,
    hasta: fn.hasta,
    largo: fn.hasta - fn.desde + 1,
    tablas: [...tablasDe(trozo)].sort(),
  };
});

// -------------------------------------------------------------------
// 3) EL INFORME
// -------------------------------------------------------------------
console.log('  === ' + OBJETIVO + ' ===');
console.log('  ' + filas.length + ' funciones de nivel superior, '
  + filas.reduce((a, b) => a + b.largo, 0) + ' líneas');
console.log('');

// Y la lista de tablas del archivo entero, para tener el catálogo antes de ver quién usa cuál.
const todas = [...tablasDe(f(OBJETIVO))].sort();
console.log('  las tablas que toca el archivo, en total ' + todas.length + ':');
todas.forEach((t) => console.log('    ' + t));
console.log('');

console.log('  función                      líneas  tablas');
console.log('  ' + '-'.repeat(70));
filas.forEach((fn) => {
  const tablas = fn.tablas.length ? fn.tablas.join(', ') : '(ninguna)';
  console.log('  ' + fn.nombre.slice(0, 28).padEnd(28) + '  '
    + String(fn.largo).padStart(5) + '  ' + tablas.slice(0, 46));
});

// -------------------------------------------------------------------
// 4) EL CORTE, Y SU NÚMERO
// -------------------------------------------------------------------
console.log('');
console.log('  === el corte, y lo que NO se puede decidir solo ===');

// Y la pregunta que decide dónde va cada función: ¿de qué trata? Y el dato que lo dice no es
// el nombre de la función —"guardarPlantilla" es claro, "renderRelojes" también, y hay otras
// que no— sino a qué tabla escribe.
const POR_TABLA = new Map();
filas.forEach((fn) => {
  fn.tablas.forEach((t) => {
    if (!POR_TABLA.has(t)) POR_TABLA.set(t, []);
    POR_TABLA.get(t).push(fn.nombre + ' (L' + fn.desde + ')');
  });
});

[...POR_TABLA.keys()].sort().forEach((t) => {
  const fs_ = POR_TABLA.get(t);
  console.log('  ' + t.padEnd(24) + fs_.length + ' función(es)');
  fs_.forEach((x) => console.log('      ' + x));
});

const sinTabla = filas.filter((x) => !x.tablas.length);
console.log('');
console.log('  y ' + sinTabla.length + ' función(es) NO tocan la base, que son la frontera:');
sinTabla.forEach((x) => console.log('      ' + x.nombre + ' (L' + x.desde + ')  ' + x.largo + ' líneas'));
console.log('');
console.log('  Esas son las que hay que decidir a mano: pueden ser de cualquiera de los dos');
console.log('  lados, y son la primera que hay que discutir. No se cuentan como de un módulo');
console.log('  ni del otro solo porque no hablen con la base.');

// -------------------------------------------------------------------
// 5) Y LAS FUNCIONES QUE TOCAN MÁS DE UNA TABLA
// -------------------------------------------------------------------
const mixtas = filas.filter((x) => x.tablas.length > 1);
console.log('');
console.log('  y ' + mixtas.length + ' función(es) tocan MÁS DE UNA tabla:');
mixtas.forEach((x) => console.log('      ' + x.nombre + '  ->  ' + x.tablas.join(', ')));
if (mixtas.length) {
  console.log('');
  console.log('  Estas son las que decidirán si el corte es posible: una función que habla');
  console.log('  con dos tablas de dos módulos distintos es un punto de unión, y se parte o');
  console.log('  se deja, pero no se puede mover entera a un lado.');
}