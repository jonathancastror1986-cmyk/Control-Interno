// QUE CADA REFERENCIA DEL CÓDIGO TENGA SU SECCIÓN
// ================================================
//
// -------------------------------------------------------------------
// EL PROBLEMA QUE MIDE
// -------------------
//
// El código usa códigos de sección para señalar el porqué de una decisión: "Ver [imp-05]".
//
// Y hay 60 que no tienen sección. O sea: el código dice "el porqué de esto está en [imp-05]" y
// el porqué no está en ninguna parte.
//
// Lo que pasa cuando eso ocurre es simple: el que encuentra el comentario va a buscar [imp-05],
// no lo encuentra, y no sabe si el código está mal escrito, si la sección se borró, o si nunca
// se escribió. Y deja de mirar el comentario.
//
// Un índice con huecos enseña a no usar el índice.
//
// -------------------------------------------------------------------
// Y POR QUÉ NO SE USA "documentacion.txt" PARA LO MISMO
// ----------------------------------------------------
//
// Porque ese archivo mezcla dos cosas: las secciones que son TÍTULO, y las referencias que las
// citan. Y se necesita distinguirlas.
//
// Y hay un caso que obliga a distinguirlas de verdad: hay códigos que están citados por otros y
// tienen su título, y códigos que se citan a sí mismos. Contar "cuántas veces sale [imp-05]" da
// dos —el título y la referencia desde [imp-02]— y eso parece un duplicado.
//
// No lo es. Una referencia entre secciones es lo que hace que un índice sirva: sin ellas es una
// lista alfabética. Lo que tiene que ser único es el TÍTULO.
//
// -------------------------------------------------------------------
// Y LA FORMA DEL TÍTULO, QUE ES MÁS ESTRICTA DE LO QUE PARECE
// ----------------------------------------------------------
//
// El título es una línea que empieza por "[código] ". Y solo uno.
//
// Porque un turno escribía:
//
//     [afp-22] Y [afp-23] DOS ANCLAS QUE NO SE ENCONTRARON
//
// Y eso declara UNA sección, la de [afp-22]. El [afp-23] queda citado en el código y sin
// sección, y nada avisa: la línea parece un título perfectamente normal.
//
// Un comprobador que solo busca líneas que empiecen por "[algo]" no lo ve. Uno que ALSO compte
// cuántos corchetes hay en el renglón, sí. Ver [arq-26].
//
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';

// -------------------------------------------------------------------
// Y LA RUTA DEL ARCHIVO DE DOCUMENTACIÓN VIENE DE UNA VARIABLE
// ----------------------------------------------------------
//
// Para que se pueda probar sin tocar el archivo real. Porque hacer fallar al guardián
// quitándole un título a "documentacion.txt" y después devolverlo es jugarse el índice entero
// en cada prueba: si algo se corta en el medio, el archivo queda a medias y nadie se entera
// hasta que alguien lo lea.
//
// Y sin esto, el arnés estaría probando una cosa distinta de la que dice probar: el guardián
// sobre el archivo de verdad, con la prueba encima. Es el mismo error que [afp-12], donde el
// arnés no le pasaba la entrada al sistema que probaba y por eso daba "9 de 9" en verde con los
// nueve archivos rotos.
//
// Y no es una puerta trasera sin cartel: abajo se dice qué archivo se está leyendo.
//
const DOC = process.env.DOC_PROBETA || (RAIZ + 'documentacion.txt');
const ES_PRUEBA = !!process.env.DOC_PROBETA;

// -------------------------------------------------------------------
// 1) LEER
// -------------------------------------------------------------------
if (!fs.existsSync(DOC)) {
  console.log('');
  console.log('  *** NO EXISTE "documentacion.txt" ***');
  process.exit(1);
}
const doc = fs.readFileSync(DOC, 'utf8');
const lineas = doc.split('\n');

// -------------------------------------------------------------------
// 2) LOS TÍTULOS
// -------------------------------------------------------------------
// Y solo las líneas que EMPIEZAN por el código. Una referencia va precedida de "Ver" o está en
// medio de un párrafo, así que no empieza por "[".
// -------------------------------------------------------------------
// Y POR QUÉ HAY UNA LÍNEA BASE
// ---------------------------
//
// Porque hay 60 referencias sin sección, y eso lo hace fallar SIEMPRE. Y un guardián que
// siempre falla es un guardián que uno aprende a no mirar: es lo mismo que pasó con
// "tokens.css" y "documentacion.txt" marcados por tener finales de línea propios, y está
// escrito en [barra-10].
//
// Un guardián tiene que ser VERDE hoy y tener una razón para ponerse rojo mañana. Si no, su
// rojo es el color de fondo y no significa nada.
//
// Y la línea base es la deuda CONOCIDA, en "tools/codigos-pendientes.txt": un código por
// línea. Lo que no esté ahí y esté colgando es nuevo, y eso sí es un error.
//
// El efecto que importa: el pendiente SE ACHICA solo a medida que se documenta, y el guardián
// nunca vuelve a ponerse rojo por lo viejo. No hay que acordarse de ir limpiando la lista.
//
// -------------------------------------------------------------------
// Y CÓMO SE USA LA LISTA
// ---------------------
//
// Con "quitar" se saca de la lista todo lo que ya está escrito. Con "poner" se agrega lo que
// se acaba de romper. Sin argumentos, solo mira.
const BASE = process.env.CODIGOS_PROBETA || (RAIZ + 'tools/codigos-pendientes.txt');

function leerBase() {
  if (!fs.existsSync(BASE)) return new Set();
  return new Set(fs.readFileSync(BASE, 'utf8').split('\n')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x && x[0] !== '#'; }));
}

function escribirBase(codos) {
  fs.writeFileSync(BASE, [
    '#',
    '# LOS CÓDIGOS QUE EL CÓDIGO CITA Y QUE NO TIENEN SECCIÓN TODAVÍA.',
    '#',
    '# Un código por línea. "comprueba-codigos.js" falla por los que NO están en esta lista,',
    '# porque son nuevos. Los que están, son deuda conocida y se avisan aparte.',
    '#',
    '# Para sacarle uno: se lee el comentario del código que lo cita, se escribe la sección con',
    '# lo que ese comentario YA dice, y después:',
    '#',
    '#     node tools/comprueba-codigos.js quitar',
    '#',
    '# Para agregar uno que se acaba de romper:',
    '#',
    '#     node tools/comprueba-codigos.js poner [nombre-del-codigo]',
    '#',
    '',
  ].join('\n') + [...codos].sort().join('\n') + '\n', 'utf8');
}

const ACCION = process.argv[2];
const known = leerBase();

const TITULO = /^\[([a-z]+-\d+)\]/;
// Y un título NO es cualquier línea que empiece por "[código]". Lo es cuando la LÍNEA DEBAJO
// es una fila de guiones:
//
//     [tarja-07] LA GUARDA MIRABA EL ARCHIVO EQUIVOCADO
//     --------------------------------------------------------------------------------
//
// Y sin ese requisito el guardián inventó tres títulos repetidos de "modulos-01", que en
// realidad son tres renglones de prosa que arrancan con una referencia:
//
//     [modulos-01], que explica por qué.
//
// Tres falsos positivos sobre un código, y el primero que se mira dice "[modulos-01] ya tiene un
// título" y uno va a buscarlo y no lo encuentra. Un guardián que se queja de algo que está bien
// enseña a ignorar sus quejas. Ver [arq-28].
//
// Y la fila de guiones es un dato y no una convención: es lo que hace que un título se pueda
// distinguir de una mención sin depender de si la frase empieza con mayúscula.
const esTitulo = function (i) {
  if (!TITULO.test(lineas[i] || '')) return false;
  const abajo = lineas[i + 1] || '';
  return /^-{20,}$/.test(abajo.trim());
};

const titulos = new Map();   // codigo -> linea
const titulosRaros = [];

lineas.forEach(function (x, i) {
  if (!TITULO.test(x)) return;

  // Y cuántos códigos declara ESTA línea. Tiene que ser uno.
  const todos = x.match(/\[[a-z]+-\d+\]/g) || [];
  if (todos.length > 1) {
    titulosRaros.push({ linea: i + 1, texto: x.trim(), porQue: todos.length + ' códigos en un renglón' });
  }

  if (!esTitulo(i)) return;   // Y esto es lo que quita los falsos positivos.

  const m = x.match(TITULO);
  if (titulos.has(m[1])) {
    titulosRaros.push({ linea: i + 1, texto: x.trim(), porQue: 'el código ' + m[1] + ' ya tiene un título en L' + titulos.get(m[1]) });
    return;
  }
  titulos.set(m[1], i + 1);
});

// -------------------------------------------------------------------
// 3) LOS ARCHIVOS DEL REPOSITORIO
// -------------------------------------------------------------------
let archivos;
try {
  // ---------------------------------------------------------------------
  // Y TAMBIÉN LOS ARCHIVOS NUEVOS, QUE TODAVÍA NO ESTÁN VERSIONADOS
  // ---------------------------------------------------------------------
  //
  // "git ls-files" lista lo que ya está en el índice, y nada más. O sea que un archivo recién
  // escrito es INVISIBLE para esta comprobación: uno crea "074_las_dos_acceso_total.sql", le pone
  // un "[rls-09]" que no existe en la documentación, y el guardián dice que no hay ninguna
  // referencia nueva sin sección. Lo que acaba de pasar.
  //
  // Y es al revés de cómo se lee: uno supone que el guardián revisa lo que está escribiendo, y lo
  // que revisa es lo que ya estaba escrito. El hueco cae justo en el archivo nuevo, que es el
  // único que todavía se puede arreglar sin romper nada publicado.
  //
  // "--others --exclude-standard" da los no versionados, saltando los que están en el .gitignore.
  // Se unionan los dos listados y se quitan las repeticiones, porque un archivo puede estar en
  // ambos durante un "git add" a medio hacer.
  const salida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: RAIZ, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  archivos = salida.split('\n').map(function (x) { return x.trim(); })
    .filter(Boolean)
    .filter(function (p) { return /\.(js|html|css|sql|md)$/.test(p); });
} catch (e) {
  console.log('');
  console.log('  *** NO SE PUDO CORRER "git ls-files" ***');
  console.log('    Sin saber qué se publica no se puede saber qué está roto.');
  process.exit(1);
}

if (!archivos.length) {
  console.log('');
  console.log('  *** NO SE ENCONTRÓ NINGÚN ARCHIVO ***');
  process.exit(1);
}

// -------------------------------------------------------------------
// 4) LAS REFERENCIAS
// -------------------------------------------------------------------
const REF = /\[[a-z]+-\d+\]/g;
const usados = new Map();   // codigo -> [archivos]

archivos.forEach(function (P) {
  let t;
  try { t = fs.readFileSync(path.join(RAIZ, P), 'utf8'); } catch (e) { return; }
  // Y "documentacion.txt" se lee aparte: sus referencias van por el índice.
  if (P === 'documentacion.txt') return;

  (t.match(REF) || []).forEach(function (c) {
    const cod = c.slice(1, -1);
    if (!usados.has(cod)) usados.set(cod, new Set());
    usados.get(cod).add(P);
  });
});

// Y las referencias internas de la propia documentación: una referencia dentro de la
// documentación tiene que apuntar a una sección, y eso también se puede romper.
const colgandoDoc = [];
const tituloCodes = new Set(titulos.keys());
(doc.match(/Ver \[([a-z]+-\d+)\]/g) || []).forEach(function (r) {
  const c = r.slice(5, -1);
  if (!tituloCodes.has(c)) colgandoDoc.push(c);
});

// -------------------------------------------------------------------
// 5) EL RESULTADO
// -------------------------------------------------------------------
const colgando = [...usados.keys()].filter(function (c) { return !tituloCodes.has(c); }).sort();
const sinUso = [...tituloCodes].filter(function (c) { return !usados.has(c); }).sort();

console.log('    leo ' + (ES_PRUEBA ? 'un archivo DE PRUEBA' : 'documentacion.txt')
  + ': ' + titulos.size + ' secciones');
console.log('    ' + usados.size + ' códigos citados en ' + archivos.length + ' archivos');
console.log('    línea base: ' + known.size + ' códigos conocidos como pendientes');
console.log('');

// -------------------------------------------------------------------
// LAS ACCIONES
// -------------------------------------------------------------------
if (ACCION === 'quitar') {
  const quedan = [...new Set(colgando)].filter(function (c) { return !tituloCodes.has(c); });
  const nuevos = quedan.filter(function (c) { return !known.has(c); });
  const resueltos = [...known].filter(function (c) { return tituloCodes.has(c); });
  escribirBase(new Set([...known].filter(function (c) { return !tituloCodes.has(c); })));
  console.log('    ' + resueltos.length + ' código(s) ya tienen sección y salen de la lista:');
  resueltos.forEach(function (c) { console.log('      ' + c); });
  if (nuevos.length) {
    console.log('    y ' + nuevos.length + ' NUEVO(S) que hay que documentar:');
    nuevos.forEach(function (c) { console.log('      ' + c); });
  }
  console.log('');
  console.log('    quedan ' + quedan.length + ' en la lista.');
  process.exit(0);
}
if (ACCION === 'poner') {
  const nuevos = process.argv.slice(3).map(function (x) { return x.replace(/^\[|\]$/g, ''); });
  if (!nuevos.length) {
    console.log('  *** HAY QUE DECIR QUÉ CÓDIGO PONER ***');
    console.log('    uso: node tools/comprueba-codigos.js poner [nombre-del-codigo]');
    process.exit(1);
  }
  nuevos.forEach(function (c) { if (tituloCodes.has(c)) {
    console.log('  *** ' + c + ' YA TIENE SECCIÓN ***');
    console.log('    Si ya está escrito, va con "quitar", no con "poner".');
    process.exit(1);
  } });
  nuevos.forEach(function (c) { known.add(c); });
  escribirBase(known);
  console.log('    ' + nuevos.length + ' código(s) agregados a la línea base.');
  process.exit(0);
}
if (ACCION && ACCION !== 'quitar' && ACCION !== 'poner') {
  console.log('  *** ACCIÓN DESCONOCIDA: "' + ACCION + '" ***');
  console.log('    las únicas son: quitar, poner. Sin argumento, solo mira.');
  process.exit(1);
}

let malas = 0;

// --- los títulos raros ------------------------------------------------
if (titulosRaros.length) {
  malas++;
  console.log('  *** ' + titulosRaros.length + ' TÍTULO(S) CON PROBLEMA ***');
  titulosRaros.forEach(function (t) {
    console.log('    L' + t.linea + '  ' + t.porQue);
    console.log('      ' + t.texto.slice(0, 76));
  });
  console.log('    Un título declara UN código. Ver [arq-26].');
  console.log('');
}

// --- las referencias sin sección -------------------------------------
// Y aquí está la decisión de fondo: se separa lo NUEVO de lo CONOCIDO.
//
// "nuevos" son los que NO están en la línea base. Esos son un error: alguien acaba de citar un
// código que no existe, y eso se rompe hoy.
//
// "pendientes" son los que ya sabíamos. No son un error: son deuda, y se avisan para que la
// lista no crezca sola.
//
// La tentación es que los dos together fail, y así el guardián queda en rojo desde el primer
// día. Y un guardián en rojo desde el primer día es un guardián que nadie lee. Ver [barra-10].
const nuevos = colgando.filter(function (c) { return !known.has(c); });
const pendientes = colgando.filter(function (c) { return known.has(c); });

if (nuevos.length) {
  malas++;
  console.log('  *** ' + nuevos.length + ' REFERENCIA(S) NUEVA(S) SIN SECCIÓN ***');
  const porFamilia = {};
  nuevos.forEach(function (c) {
    const fam = c.split('-')[0];
    if (!porFamilia[fam]) porFamilia[fam] = [];
    porFamilia[fam].push(c);
  });
  Object.keys(porFamilia).sort().forEach(function (f) {
    console.log('    ' + f.padEnd(13) + porFamilia[f].length + ':  ' + porFamilia[f].join(', '));
  });
  console.log('');
  console.log('    Estas son nuevas: el código las cita y no hay sección. Hoy, no en marzo.');
  console.log('    Para dejar constancia de una a propósito:');
  console.log('        node tools/comprueba-codigos.js poner [' + nuevos[0] + ']');
  console.log('');
}

// --- las referencias internas de la documentación ---------------------
const sueltasDoc = [...new Set(colgandoDoc)];
if (sueltasDoc.length) {
  malas++;
  console.log('  *** ' + sueltasDoc.length + ' REFERENCIA(S) INTERNAS ROTOS ***');
  console.log('    ' + sueltasDoc.join(', '));
  console.log('    Son "Ver [código]" dentro de documentacion.txt que apuntan a nada.');
  console.log('');
}

// --- secciones que nadie cita ----------------------------------------
// Y esto NO es un error. Se avisa aparte porque es información, no una falla: una sección
// puede quedar sin citar y seguir siendo útil para el que la busque por otro camino.
if (sinUso.length) {
  console.log('    (y ' + sinUso.length + ' secciones que nadie cita desde el código:');
  console.log('     ' + sinUso.join(', ') + ')');
  console.log('     Eso no es un error: se avisar por si alguna se puede borrar.');
  console.log('');
}

if (pendientes.length) {
  console.log('    (y ' + pendientes.length + ' pendientes conocidos, que NO son error:');
  console.log('     están en la línea base y se van sacando a medida que se documentan)');
  console.log('');
}

if (malas) {
  console.log('  *** ' + malas + ' PROBLEMA(S) ***');
  console.log('');
  console.log('    Para sacar un pendiente: se lee el comentario del código que lo cita, y se');
  console.log('    escribe la sección con lo que ese comentario YA dice. No con lo que parece.');
  process.exit(1);
}

console.log('    ok  y no hay ninguna referencia nueva sin sección');
if (pendientes.length) {
  console.log('    quedan ' + pendientes.length + ' pendientes conocidos, para ir sacando de a uno');
}
