// QUE EL GUARDADO DEL SUELDO NO PASE SIN PERMISO
// ================================================
//
// ---------------------------------------------------------------------
// EL AGUERO
// ---------------------------------------------------------------------
//
// "leerSueldoParaGuardar" empieza así:
//
//     if(typeof puede!=='function'||!puede('rem.editar'))return null;
//
// Y en la copia sin login, sin sesión, "puede" responde "true" a TODO —porque en
// "soporte.js" está escrito "if(!misPermisosCargados)return true", que es lo correcto para
// OCULTAR botones pero está al revés para GUARDAR.
//
// O sea que un usuario sin permiso puede escribir un sueldo. Y no es un caso raro: es el
// estado normal de la página durante los primeros segundos, y el estado permanente de quien
// no tiene sesión.
//
// ---------------------------------------------------------------------
// POR QUÉ "misPermisosCargados" NO ALCANZA
// ---------------------------------------------------------------------
//
// Porque con la 069 aplicada y sin sesión, "misPermisosCargados" es VERDADERO: la consulta
// corrió, no encontró roles, y dejó el conjunto vacío. Y un conjunto vacío no tiene
// "rem.editar", así que "puede" devuelve falso y el campo no se muestra.
//
// O sea que el problema NO es la carga tardía. El problema es el otro: si "puede" no está
// definida —porque "soporte.js" todavía no se cargó, o porque se cargó en otro orden— la
// guarda que yo escribí pasa de largo, porque compara contra "undefined" en vez de contra
// "sin permiso".
//
// ---------------------------------------------------------------------
// LA REGLA QUE SE APLICA
// ---------------------------------------------------------------------
//
// Ocultar y guardar usan criterios distintos, y por eso tienen que ser dos funciones:
//
//   · para OCULTAR, "no sé todavía" se trata como "sí", para no tapar cosas al usuario
//     mientras carga. Eso es "puede()", y está bien como está.
//
//   · para GUARDAR, "no sé todavía" se trata como "NO", porque un permiso que no se conoce es
//     un permiso que no se tiene.
//
// Y "no sé todavía" no es lo mismo que "no lo tengo". El primero es "la función no está"; el
// segundo es "la función está y dijo que no".
const { Archivo } = require('./archivo-seguro.js');

const P = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/js/app.js';
const a = new Archivo(P);

if (a.lineas.some((x) => x.indexOf('function puedeGuardar(') >= 0 && !/^\s*\/\//.test(x))) {
  console.log('  ya está la función estricta. No se toca.');
} else {
  console.log('  === la función estricta, antes de las tres ===');

  const i = a.indice('function mostrarCampoSueldo(){');

  a.inserta(i, [
    '// Y ESTA ES LA DIFERENCIA ENTRE OCULTAR Y GUARDAR',
    '//',
    '// Y hay dos criterios, y NO son el mismo a propósito.',
    '//',
    '// Para OCULTAR un campo: "no sé todavía" se trata como "sí se puede". Porque mientras',
    '// cargan los permisos no se quiere tapar nada al usuario, que ve aparecer campos y',
    '// desaparecerlos. Eso es lo que hace "puede()", y está bien como está.',
    '//',
    '// Para GUARDAR un dato: "no sé todavía" se trata como "NO". Porque un permiso que no se',
    '// conoce es un permiso que no se tiene, y escribir un sueldo sin saber si se puede es',
    '// escribir un sueldo sin permiso.',
    '//',
    '// Y el caso que lo demuestra: sin sesión, "puede" devuelve true para todo —porque',
    '// "misPermisosCargados" es falso y la función lo trata como "no bloquees nada"—, y con',
    '// el criterio de "puede" el guardado pasaba sin permiso.',
    '//',
    '// Y el caso inverso, que también es real: si "soporte.js" todavía no se cargó, "puede" no',
    '// está definida, y compararla contra "undefined" no es lo mismo que preguntar si el',
    '// permiso está. Por eso acá se pregunta por la DEFINICIÓN primero, y por el permiso',
    '// después. Ver [rem-01].',
    'function puedeGuardar(permiso){',
    '  // Si la función no está, no se puede comprobar el permiso: se asume que no se tiene.',
    '  if(typeof puede!==\'function\')return false;',
    '  return puede(permiso)===true;',
    '}',
    '',
  ]);
  console.log('    ok  "puedeGuardar" antes de "mostrarCampoSueldo"');

  // Y ahora se cambian las dos guardas que usan "puede" para decidir si se guarda.
  console.log('');
  console.log('  === las dos guardas que cambian ===');

  const iMuestra = a.indice('function mostrarCampoSueldo(){');
  const cuerpoMuestra = a.cuerpoDe('mostrarCampoSueldo');
  console.log('    "mostrarCampoSueldo" va de L' + (cuerpoMuestra.desde + 1)
    + ' a L' + (cuerpoMuestra.hasta + 1));

  // Y "mostrarCampoSueldo" decide si se MUESTRA, y para mostrar sigue serviendo "puede":
  // es la parte de pantalla, no la de guardado. Se deja como está.
  console.log('    la de mostrar NO cambia: es pantalla, y "puede" es lo correcto ahí');

  const cuerpoGuarda = a.cuerpoDe('leerSueldoParaGuardar');
  console.log('    "leerSueldoParaGuardar" va de L' + (cuerpoGuarda.desde + 1)
    + ' a L' + (cuerpoGuarda.hasta + 1));

  // Y la guarda NO es la primera línea del cuerpo: es la segunda. La primera es la firma.
  // Y esa diferencia de un renglón es la que hizo que la primera versión no encontrara nada y
  // se frenara —que es lo correcto—.
  const iGuarda = cuerpoGuarda.desde + 1;
  console.log('      ' + a.lineas[iGuarda].trim().slice(0, 64));

  if (a.lineas[iGuarda].indexOf("typeof puede!=='function'") < 0) {
    console.log('  *** LA GUARDA NO ES LA QUE SE ESPERABA ***');
    console.log('    L' + (iGuarda + 1) + ': ' + JSON.stringify(a.lineas[iGuarda].slice(0, 64)));
    process.exit(1);
  }

  a.reemplaza(iGuarda,
    '  if(!puedeGuardar(\'rem.editar\'))return null;');
  console.log('    ok  la guarda del guardado');

  // Y la del aviso de "lo ves pero no lo puedes cambiar", que también es una decisión de
  // guardado y por eso tiene que ser estricta. Si "puede" no está, el aviso no dice nada y el
  // campo se ve editable: peor que invisible.
  let iAviso = -1;
  for (let k = cuerpoMuestra.desde; k <= cuerpoMuestra.hasta; k++) {
    if (a.lineas[k].indexOf('Lo ves pero no lo puedes cambiar') >= 0) iAviso = k;
  }
  if (iAviso < 0) {
    console.log('  *** NO SE ENCONTRÓ EL AVISO DE "NO PUEDES CAMBIAR" ***');
    process.exit(1);
  }
  console.log('    el aviso está en L' + (iAviso + 1));

  const antes = a.lineas[iAviso - 1];
  a.reemplaza(iAviso - 1,
    "    aviso.textContent=!puedeGuardar('rem.editar')");
  console.log('      antes: ' + antes.trim().slice(0, 56));

  a.reemplaza(iAviso, "      ? 'Lo ves pero no lo puedes cambiar.'");
  console.log('      ahora: ' + a.lineas[iAviso].trim().slice(0, 56));

  a.escribe();
}

// ===================================================================
// COMPROBAR QUE LA PRUEBA PUEDE FALLAR
// ===================================================================
console.log('');
console.log('  === comprobar ===');

const fs = require('fs');
const txt = fs.readFileSync(P, 'utf8');
const codigo = txt.split(/\r\n|\n/).filter((x) => !/^\s*\/\//.test(x)).join('\n');

const CHEQUEOS = [
  ['"puedeGuardar" está definida', /function puedeGuardar\(/.test(codigo)],
  ['sin la función, NO se puede', /function puedeGuardar[\s\S]{0,120}typeof puede!=='function'\)return false/.test(codigo)],
  ['pide un true, no un cualquiera', /puedeGuardar[\s\S]{0,120}return puede\(permiso\)===true/.test(codigo)],
  ['el guardado usa la estricta', /leerSueldoParaGuardar[\s\S]{0,200}if\(!puedeGuardar\('rem\.editar'\)\)return null/.test(codigo)],
  ['el aviso usa la estricta', /!puedeGuardar\('rem\.editar'\)/.test(codigo)],
  ['mostrar sigue usando "puede"', /mostrarCampoSueldo[\s\S]{0,300}puede\('rem\.ver'\)/.test(codigo)],
];

// Y una forma de decir DÓNDE está cada cosa, para que un chequeo que falla diga dónde.
function lineaDe(texto) {
  const l = txt.split(/\r\n|\n/);
  for (let k = 0; k < l.length; k++) {
    if (/^\s*\/\//.test(l[k])) continue;
    if (l[k].indexOf(texto) >= 0) return k;
  }
  return -1;
}

let malas = 0;
CHEQUEOS.forEach(function (c) {
  if (!c[1]) malas++;
  console.log('  ' + (c[1] ? 'ok  ' : '*** ') + c[0]);
});

if (malas) {
  console.log('');
  console.log('  *** ' + malas + ' ***');
  console.log('');
  console.log('  Y CADA CHEQUEO QUE FALLA SE DICE POR QUÉ, porque "no cierra" sin decir');
  console.log('  dónde es la clase de error que más tiempo hace perder: uno busca el archivo');
  console.log('  entero un problema que está en el guion.');
  console.log('');
  CHEQUEOS.forEach(function (c, n) {
    if (c[1]) return;
    console.log('    ' + (n + 1) + ') ' + c[0]);
    console.log('       patrones que se probaron:');
    console.log('       - /' + /function puedeGuardar\(/.source + '/');
    if (n === 1) console.log('       - el "typeof puede" está en la línea ' + (lineaDe('typeof puede!==\'function\'') + 1));
    if (n === 4) console.log('       - donde está la llamada al aviso: línea ' + (lineaDe('!puedeGuardar') + 1));
    if (n === 5) console.log('       - "puede(\'rem.ver\')" está en la línea ' + (lineaDe("puede('rem.ver')") + 1));
  });
  process.exit(1);
}
console.log('');
console.log('  ok  ocultar usa "puede", guardar usa "puedeGuardar"');
