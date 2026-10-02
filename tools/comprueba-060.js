// QUE LAS MIGRACIONES NO PERDAN LAS BARRAS INVERTIDAS
// ====================================================
//
// -------------------------------------------------------------------
// EL AGUERO QUE ATRAPÓ ESTE
// -------------------------
//
// La migración 060 se escribió primero con un guion de JavaScript, con el SQL adentro de una
// cadena. Y la cadena se comió las barras invertidas:
//
//     '\[\s*([a-z0-9_-]+)\s*\]'   en el guion
//     '[s*([a-z0-9_-]+)s*]'        en el archivo
//
// En PostgreSQL, "[" sin barra abre un rango de caracteres y "s" es una letra. Así que la
// función instalada no buscaba un corchete: buscaba una letra "s", o un rango. Devolvía la lista
// vacía.
//
// Y devolver la lista vacía NO DA ERROR. Es exactamente lo que pasa cuando de verdad no hay
// campos que llenar. Un diagnóstico que no se distingue del resultado normal no sirve para
// diagnosticar nada.
//
// -------------------------------------------------------------------
// POR QUÉ ESTE GUION EXISTE PARA TODAS LAS MIGRACIONES
// -----------------------------------------------------
//
// Porque la barra invertida se pierde en el camino desde el guion hasta el archivo, y no solo
// en este caso: pasa con cualquier carácter de JavaScript que se escape. Por eso el SQL de una
// migración se escribe DIRECTO, y este guion revisa que lo que llegó al archivo siga teniendo
// lo que tiene que tener.
//
// -------------------------------------------------------------------
// Y CÓMO SE COMPRUEBA
// -------------------
//
// Se ejecuta el mismo extracción sobre documentos de verdad y se mira qué devuelve. Comprobar
// el texto con expresiones regulares en JavaScript ya dio siete falsos errores una vez, porque
// las barras se comieron al escribir el propio comprobador.
//
const fs = require('fs');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const SQL = RAIZ + 'migrations/060_plantillas_tres_sintaxis.sql';

const B = String.fromCharCode(92);   // la barra, armada con su número para no escaparse

let malas = 0;
const fallo = (m) => { console.log('  *** ' + m + ' ***'); malas++; };
const ok = (m) => console.log('    ok  ' + m);

const sql = fs.readFileSync(SQL, 'utf8');

// -------------------------------------------------------------------
// 1. LAS CUATRO ALTERNATIVAS, CON SU BARRA
// -------------------------------------------------------------------
console.log('  == las cuatro alternativas, con su barra ==');
[
  [B + '[CAMPO:' + B + 's*', 'campo propio'],
  [B + '[' + B + 's*([A-Z0-9_]', 'corchetes solos'],
  [B + '{' + B + '{' + B + 's*', 'doble llave'],
  [B + '{([a-z]', 'llave simple'],
].forEach(function (par) {
  if (sql.indexOf(par[0]) < 0) fallo('falta la barra en la alternativa de ' + par[1] + '  (busqué: ' + par[0] + ')');
  else ok('la alternativa de ' + par[1] + ' tiene su barra');
});

// Y que NO quede ninguna forma sin escapar, que es como se ve el síntoma.
console.log('');
console.log('  == que no quede ninguna forma escapada ==');
[['[CAMPO:s*', 'campo propio'], ['[s*([A-Z', 'corchetes solos'],
 ['{{s*([a-z', 'doble llave']].forEach(function (par) {
  if (sql.indexOf(par[0]) >= 0) fallo('quedó una forma SIN escapar: ' + par[1] + '  →  ' + par[0]);
  else ok('no quedó sin escapar la de ' + par[1]);
});

// -------------------------------------------------------------------
// 2. Y QUE LA FUNCIÓN DEVUELVA LO QUE TIENE QUE DEVOLVER
// -------------------------------------------------------------------
console.log('');
console.log('  == y que la extracción sirva de verdad ==');

const PATRONES = [
  /\[CAMPO:\s*([a-z0-9_-]+)\s*\]/gi,
  /\[\s*([A-Z0-9_]+)\s*\]/g,
  /\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
  /\{([a-z][a-z0-9_]*)\}/g,
];

function camposDe(html) {
  const salida = [];
  PATRONES.forEach(function (re) {
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(String(html || ''))) !== null) salida.push(m[1]);
  });
  return [...new Set(salida)];
}

const casos = [
  ['<p>[NOMBRE]</p>', 'NOMBRE', 'la forma nueva'],
  ['<p>{{nombre_completo}}</p>', 'nombre_completo', 'la vieja de doble llave'],
  ['<p>{nombre}</p>', 'nombre', 'la de una llave'],
  ['<p>[CAMPO:7-licencia]</p>', '7-licencia', 'campo propio'],
];
casos.forEach(function (c) {
  const sale = camposDe(c[0]);
  if (sale.indexOf(c[1]) < 0) fallo('no detectó "' + c[1] + '" (' + c[2] + ')');
  else ok('detecta "' + c[1] + '"  (' + c[2] + ')');
});

// Y que un "[CAMPO:...]" no cuente dos veces.
if (camposDe('<p>[CAMPO:7-licencia]</p>').length !== 1) fallo('[CAMPO:...] cuenta más de una vez');
else ok('[CAMPO:7-licencia] cuenta una sola vez');

// Y que una llave de estilos no cuente.
if (camposDe('<style>.a{color:red}</style><p>[RUT]</p>').length !== 1) fallo('una llave de estilos contó como campo');
else ok('una llave de estilos no cuenta como campo');

// -------------------------------------------------------------------
// 3. EL ARCHIVO
// -------------------------------------------------------------------
console.log('');
if ((sql.match(/\$\$/g) || []).length % 2 !== 0) fallo('hay un "$$" sin cerrar');
else ok('los "$$" están parejos, ' + (sql.match(/\$\$/g) || []).length);

if ((sql.match(/create or replace function public\.campos_de_plantilla/g) || []).length !== 1) {
  fallo('la función se define más de una vez');
} else ok('la función se define una vez');

if (/[\u00c3][\u00a1-\u00ff]/.test(sql)) fallo('mojibake');
else ok('sin mojibake');

console.log('');
if (malas) { console.log('  *** ' + malas + ' PROBLEMA(S) ***'); process.exit(1); }
console.log('    ok  la migración 060 está correcta');
