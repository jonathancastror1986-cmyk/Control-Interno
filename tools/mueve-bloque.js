// MOVER "EL EDITOR DE PLANTILLAS" DE relojés.js A documentos.js
// =================================================================
//
// Es el segundo bloque del corte: el primero, "CAMPOS PROPIOS Y DOCUMENTOS", ya esta en
// documentos.js. Este trae las ocho funciones de la plantilla del contrato de contratacion, que es
// documentacion del trabajador, no del reloj.
//
// ---------------------------------------------------------------------
// POR QUE SE ESCRIBE CON "Archivo" Y NO CON "join('\n')"
// ---------------------------------------------------------------------
//
// La primera version escribia los dos archivos con las lineas unidas por "join('\n')". El texto
// quedaba bien y los dos archivos parseaban, pero "relojes.js" tiene una mezcla de finales LF y
// CRLF, y "join('\n')" convierte TODOS a LF. El diff dio 9676 renglones cambiados en un archivo
// del que solo se movian 506, y un diff asi no se puede revisar: esconde lo unico que habia que
// mirar.
//
// Que es peor que un archivo roto. Un archivo roto se ve en el navegador. Un diff que no se puede
// leer se aprueba sin ver.
//
// Y el "diff" no era un problema de git: git avisaba, en las lineas de warning, que iba a
// reemplazar LF por CRLF. El aviso estaba y no se leyo. Por eso el guardián tiene que estar DENTRO
// de la herramienta que escribe, y no en eleye de quien la corrio.
//
// ---------------------------------------------------------------------
// Y POR QUE NO BASTABA CON ESCRIBIR IGUAL DE FINALES
// ---------------------------------------------------------------------
//
// "Archivo" guarda el final de cada renglon y "verifica" que ninguno haya cambiado al escribir. Eso
// es lo que hace falta: no que se escriba el mismo texto, sino que el archivo nuevo sea el viejo
// con UN TROZO FUERA, y que lo demas quede byte a byte igual.
//
// ---------------------------------------------------------------------
// Y POR QUE SE CALCULA EL LIMITE CON PROFUNDIDAD DE LLAVES
// ---------------------------------------------------------------------
//
// De los 56 encabezados de seccion de "relojes.js", 18 estan dentro del cuerpo de una funcion. Se
// pegaron al explicar algo y quedaron a mitad de camino. Un corte que confia en el encabezado se
// lleva una llave de apertura y deja su cierre.
//
// Y el corte con el limite calculado tiene que tocar dos cosas: el renglon de la raya de arriba --
// que NO es el titulo menos uno, porque entre la raya y el titulo hay un renglon en blanco -- y el
// renglon antes de la raya del siguiente encabezado valido.
//
// ---------------------------------------------------------------------
// Y LAS DOS PROFUNDIDADES
// ---------------------------------------------------------------------
//
// Para decidir un corte alcanza con llaves. Para decir si un renglon es codigo suelto hay que
// contar tambien corchetes: los renglones de datos de "CAMPOS_PLANTILLA = [ ... ]" estan a la misma
// profundidad de llaves que la declaracion, y sin la segunda profundidad parecian llamadas al
// cargar. Y por que corchetes no rompen los cortes: se abren y se cierran en el mismo renglon, y
// quedan en cero.

const fs = require('fs');
const R = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const P_REL = R + 'views/asistencia/relojes.js';
const P_DOC = R + 'views/administracion/documentos.js';
// Y EL ARGUMENTO, QUE ES EL TITULO DEL BLOQUE, O "listar".
//
// Y se guarda en dos variables y no en una, porque la version anterior guardaba "" cuando el
// argumento era "listar", y despues la pregunta "¿es este el modo de listar?" se hacia sobre el
// titulo ya vacio. La respuesta era siempre no, y la herramientaidia que el titulo no existia
// cuando lo que se le habia pasado era una palabra que si existe.
const ARG = process.argv[2] || '';
const TITULO = ARG;

const { Archivo } = require('./archivo-seguro.js');
const rel = new Archivo(P_REL);
const doc = new Archivo(P_DOC);
const lRel = rel.lineas;
const lDoc = doc.lineas;

const sinSangria = (x) => String(x).replace(/^\s+/, '');
const limpio = (x) => sinSangria(x).replace(/^\/\/\s?/, '');
const esRaya = (x) => /^[-=]{6,}$/.test(limpio(x));
function esTitulo(x) {
  const t = limpio(x);
  if (t.length < 8 || esRaya(t) || !/[A-ZÁÉÍÓÚÑ]/.test(t)) return false;
  return t === t.toUpperCase();
}

function sinCodigo(x) {
  let t = String(x);
  t = t.replace(/\/\*[\s\S]*?\*\//g, '');
  t = t.replace(/^\s*\/\/.*$/, '');
  t = t.replace(/'(?:\\.|[^'\\])*'/g, "''");
  t = t.replace(/"(?:\\.|[^"\\])*"/g, '""');
  t = t.replace(/`(?:\\.|[^`\\])*`/g, '``');
  return t;
}

// ---------------------------------------------------------------------
// 1) LAS PROFUNDIDADES
// ---------------------------------------------------------------------
//
// Y SE CUENTAN CON DOS "match", UNO POR TIPO DE LLAVE, Y NO CON UN OBJETO DE "pares".
//
// La version anterior contaba caracter por caracter contra un objeto, y daba menos 1737 en un
// archivo que parsea bien y cuya profundidad de llaves es cero. El dato estaba mal y no se podia
// reproducir por separado, que es la peor forma de que un dato este mal: uno doubts de la
// herramienta y no del archivo, y da igual.
//
// Con dos "match" no hay objeto de por medio y el conteo se puede reproducir renglon por renglon en
// cualquier otra herramienta, que es lo unico que sirve: una cuenta que no se puede repetir no es una
// cuenta.
function profundidad(conCorchetes) {
  const a = new Array(lRel.length + 1).fill(0);
  let p = 0;
  for (let i = 0; i < lRel.length; i++) {
    a[i] = p;
    const t = sinCodigo(lRel[i]);
    const n = (re) => (t.match(re) || []).length;
    p += n(/\{/g) - n(/\}/g);
    if (conCorchetes) p += n(/\[/g) + n(/\(/g) - n(/\]/g) - n(/\)/g);
  }
  a[lRel.length] = p;
  return a;
}
const profLlave = profundidad(false);
const profFull = profundidad(true);

// Y LAS MEDIDAS, ANTES DE TOCAR NADA
//
// "lRel" y "lDoc" no son copias: son los mismos arreglos que "quita" e "inserta" van a modificar.
// Asi que si se lee "lRel.length" despues de escribir, se lee la longitud del archivo NUEVO, y la
// comprobacion "el archivo perdio exactamente el bloque" compara el archivo nuevo contra si mismo
// y sale mal siempre.
//
// Tres comprobaciones fallaron por eso, y ninguna de las tres era sobre el archivo: eran sobre el
// contador. Que es la forma mas dificil de detectar, porque el codigo esta bien y el numero no.
const LARGO_REL_ANTES = rel.lineas.length;
const LARGO_DOC_ANTES = doc.lineas.length;

console.log('  === 1) los archivos ===');
console.log('    relojés.js: ' + lRel.length + ' renglones, finales: '
  + lRel.filter(function (x, i) { return rel.fines[i] === '\r\n'; }).length + ' CRLF y '
  + lRel.filter(function (x, i) { return rel.fines[i] === '\n'; }).length + ' LF');
console.log('    profundidad de llaves al final: ' + profLlave[lRel.length]
  + (profLlave[lRel.length] === 0 ? '  (cerrada)' : '  *** ABIERTA ***'));
console.log('    profundidad con corchetes al final: ' + profFull[lRel.length]);

// ---------------------------------------------------------------------
// 2) LOS ENCABEZADOS QUE SI CORTAN
// ---------------------------------------------------------------------
const validos = [];
for (let i = 0; i < lRel.length; i++) {
  if (profLlave[i] !== 0) continue;
  if (!esTitulo(lRel[i])) continue;
  let arriba = -1;
  for (let k = i - 1; k >= 0 && k >= i - 3; k--) {
    if (limpio(lRel[k]) === '') continue;
    if (!esRaya(lRel[k])) break;
    arriba = k;
    break;
  }
  if (arriba < 0) continue;
  let abajo = -1;
  for (let k = i + 1; k < lRel.length && k <= i + 3; k++) {
    if (limpio(lRel[k]) === '') continue;
    if (!esRaya(lRel[k])) break;
    abajo = k;
    break;
  }
  if (abajo < 0) continue;
  validos.push({ titulo: limpio(lRel[i]), tit: i, desde: arriba, rayas: [arriba, abajo] });
}

const q = validos.findIndex(function (e) { return e.titulo === TITULO; });
console.log('');
console.log('  === 2) los encabezados que sí cortan: ' + validos.length + ' ===');

if (ARG === 'listar') {
  // -------------------------------------------------------------------
  // Y EL MODO DE LISTAR, QUE ES LO QUE SE USA PARA ELEGIR
  // -------------------------------------------------------------------
  //
  // Mover un bloque sin ver la lista es moverse a ciegas. Y la lista tiene que decir TAMANO y no
  // solo nombre: un bloque de 253 renglones entra en un turno y uno de 1.400 no, y eso no se ve
  // leyendo un titulo.
  console.log('');
  console.log('    (con el titulo exacto entre comillas, mueve ese bloque)');
  console.log('');
  validos.forEach(function (e, k) {
    const fin = k + 1 < validos.length ? validos[k + 1].desde - 1 : lRel.length - 1;
    const rengl = fin - e.desde + 1;
    let funcs = 0;
    for (let i = e.desde; i <= fin; i++) {
      if (/^(?:async\s+)?function\s+[A-Za-z_$]/.test(limpio(lRel[i]))) funcs++;
    }
    console.log('    ' + String(rengl).padStart(5) + ' rengl  ' + String(funcs).padStart(3)
      + ' func  ' + e.titulo);
  });
  process.exit(0);
}

if (q < 0) {
  console.log('    *** no está "' + TITULO + '" entre los encabezados válidos.');
  console.log('    *** con "listar" salen los ' + validos.length + ' que sí se pueden mover.');
  process.exit(1);
}

const DESDE = validos[q].desde;
const HASTA = q + 1 < validos.length ? validos[q + 1].desde - 1 : lRel.length - 1;
const bloque = lRel.slice(DESDE, HASTA + 1);
const finalesDelBloque = rel.fines.slice(DESDE, HASTA + 1);

console.log('');
console.log('  === 3) el límite ===');
console.log('    "' + TITULO + '"');
console.log('    raya de arriba: L' + (validos[q].rayas[0] + 1) + '   título: L' + (validos[q].tit + 1)
  + '   raya de abajo: L' + (validos[q].rayas[1] + 1));
console.log('    el bloque va de L' + (DESDE + 1) + ' a L' + (HASTA + 1) + ': ' + bloque.length + ' renglones');
console.log('    profundidad antes: ' + profLlave[DESDE - 1] + '   profundidad despues: ' + profLlave[HASTA + 1]);
console.log('    primero: |' + bloque[0].slice(0, 54) + '|');
console.log('    ultimo:  |' + bloque[bloque.length - 1].slice(0, 54) + '|');

const funcsDel = [];
bloque.forEach(function (x) {
  const m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(limpio(x));
  if (m) funcsDel.push(m[1]);
});
console.log('    funciones (' + funcsDel.length + '): ' + funcsDel.join(', '));

// ---------------------------------------------------------------------
// 4) LA PUERTA: EL BLOQUE NO EJECUTA NADA AL CARGAR
// ---------------------------------------------------------------------
console.log('');
console.log('  === 4) puerta: el bloque no ejecuta nada al cargar ===');
const base = profFull[DESDE];
const sueltos = [];
bloque.forEach(function (x, k) {
  const crudo = sinSangria(x);
  if (crudo === '') return;
  if (crudo.indexOf('//') === 0) return;
  if (profFull[DESDE + k] > base) return;
  const t = limpio(x);
  if (/^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(t)) return;
  if (/^(?:const|let|var)\s+[A-Za-z_$][\w$]*/.test(t)) return;
  if (/^[)\]}\s]*;?\s*$/.test(t)) return;
  sueltos.push('    L' + (DESDE + k + 1) + '  ' + t.slice(0, 54));
});
if (sueltos.length) {
  console.log('    *** ' + sueltos.length + ' renglones sueltos:');
  sueltos.slice(0, 10).forEach(function (x) { console.log(x); });
} else {
  console.log('    ok  todo el bloque son comentarios, declaraciones y sus continuaciones');
}

// ---------------------------------------------------------------------
// 5) LA ESCRITURA, CON ARCHIVO
// ---------------------------------------------------------------------
console.log('');
console.log('  === 5) escribir ===');

// ---------------------------------------------------------------------
// EL ESTADO DE ANTES, PARA PODER VOLVER ATRAS
// ---------------------------------------------------------------------
//
// Y ESTA HERRAMIENTA CORRE SOLA, VARIAS VECES SEGUIDAS, Y NO CON UNO MIRANDO
// ---------------------------------------------------------------------
//
// Por eso, si una comprobacion falla, los dos archivos tienen que quedar EXACTAMENTE como estaban.
// Con "git checkout" alcanza, pero eso obliga a que alguien este mirando, y la idea es justamente
// poder encadenar los cortes sin supervision.
//
// Y el total de funciones de ANTES se calcula ACÁ, con el archivo entero, y no se escribe a mano.
// Escribido a mano se quedó viejo en cuanto se agregó una función a "documentos.js", y el
// herramienta avisó que había un bloque roto que estaba perfectamente bien. Un guardián que miente
// es peor que un guardián que no está: entrena a ignorar el rojo.
const bytesRelAntes = fs.readFileSync(P_REL);
const bytesDocAntes = fs.readFileSync(P_DOC);
const antesTotal = (function () {
  const s = new Set();
  const ver = (arr) => arr.forEach(function (x) {
    const m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(limpio(x));
    if (m) s.add(m[1]);
  });
  ver(rel.lineas);
  ver(doc.lineas);
  return s.size;
})();

// En relojés.js: quitar el bloque. Cada quita mueve el renglon de arriba al lugar del que se fue,
// con su final, asi que el archivo queda con los finales que tenia.
for (let k = 0; k < bloque.length; k++) rel.quita(DESDE);

// En documentos.js: el bloque va al final, con un renglon en blanco de separacion. Y va con SUS
// finales, los del renglon donde estaba: si el bloque vivia en un archivo con LF mayoritario,
// queda con LF, y no se convierte el archivo entero.
// Y EL PUNTO DE INSERCION, QUE NO SIEMPRE ES EL FINAL DEL ARCHIVO
//
// "documentos.js" termina con un renglon que NO tiene final de linea. Insertar en la posicion final
// deja ese renglon en el medio, pegado al siguiente, y el guardián de "Archivo" lo ataja: es lo que
// paso antes con un CSS.
//
// Y no alcanza con insertar una posicion antes: "inserta" toma el final del renglon donde inserta,
// y si ese renglon no tiene final, los renglones nuevos salen sin final tambien. Por eso antes de
// insertar se le pone un final de verdad a ese renglon -- y no importa cual sea, porque despues se
// pisa con los finales del bloque, que son los que tiene que quedar.
//
// Y el punto de insercion se ANOTA antes de insertar, porque al insertar N renglones el primero
// queda en el indice que tenia la longitud, no en "longitud menos N". Sacar el numero DESPUES de
// insertar es el error clasico, y escribe los finales del bloque sobre los de las ultimas lineas.
const ultimoSinFinal = doc.fines[doc.fines.length - 1] === '';
const LARGO_DOC = doc.lineas.length - (ultimoSinFinal ? 1 : 0);
if (ultimoSinFinal) doc.fines[LARGO_DOC] = doc.fines[LARGO_DOC - 1] || '\n';
doc.inserta(LARGO_DOC, [''].concat(bloque));

// Y los finales del bloque se ponen a mano, porque "inserta" pone los del punto de insercion y
// estos son los que tenia donde estaba. El renglon en blanco de separacion toma el final del
// ultimo renglon del bloque, que era el final del archivo del que se movio.
const finalesNuevos = finalesDelBloque.concat([finalesDelBloque[finalesDelBloque.length - 1]]);
doc.fines.splice(LARGO_DOC, finalesNuevos.length, ...finalesNuevos);

rel.escribe();
doc.escribe();

console.log('    relojés.js:    ' + lRel.length + ' -> ' + rel.lineas.length + ' renglones');
console.log('    documentos.js: ' + lDoc.length + ' -> ' + doc.lineas.length + ' renglones');

// ---------------------------------------------------------------------
// 6) LAS COMPROBACIONES, DESPUES DE ESCRIBIR
// ---------------------------------------------------------------------
console.log('');
console.log('  === 6) las comprobaciones ===');

const nuevoRel = fs.readFileSync(P_REL, 'utf8');
const nuevoDoc = fs.readFileSync(P_DOC, 'utf8');
const textoBloque = bloque.join('\n');

function cuentaFuncs(l) {
  const s = new Set();
  l.forEach(function (x) {
    const m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(limpio(x));
    if (m) s.add(m[1]);
  });
  return s;
}
const relF = cuentaFuncs(rel.lineas);
const docF = cuentaFuncs(doc.lineas);
const total = relF.size + docF.size;

// Y EL FINAL DE RENGLON, QUE ES LO QUE SE ROMPIO LA PRIMERA VEZ
const crlfRelViejo = (function () {
  const b = fs.readFileSync(P_REL);
  let n = 0;
  for (let i = 0; i < b.length - 1; i++) if (b[i] === 0x0d && b[i + 1] === 0x0a) n++;
  return n;
})();

const CHEQUEOS = [
  ['el archivo entero tiene las llaves cerradas', profLlave[LARGO_REL_ANTES] === 0],
  ['el bloque no ejecuta nada al cargar', sueltos.length === 0],
  ['las dos puntas del bloque estaban en profundidad cero',
    profLlave[DESDE - 1] === 0 && profLlave[HASTA + 1] === 0],
  ['el bloque empieza en la raya de guiones', esRaya(bloque[0])],
  ['las ' + funcsDel.length + ' funciones quedaron en documentos.js',
    funcsDel.every(function (n) { return docF.has(n); })],
  ['ninguna se quedó en relojés.js', funcsDel.every(function (n) { return !relF.has(n); })],
  ['el total de funciones sigue siendo ' + antesTotal, total === antesTotal],
  // Y LA COMPARACION DEL BLOQUE, RENGLON POR RENGLON, Y NO POR TEXTO
  //
  // Unir con "\n" y buscar esa cadena en el archivo NO puede funcionar: el archivo tiene finales
  // "\r\n", y la cadena unida tiene "\n". La busqueda falla siempre, y lo que se ve es "el bloque
  // no llego", cuando en realidad llego entero y con los finales correctos.
  //
  // La forma que si sirve es comparar los renglones del bloque contra los renglones del archivo, uno
  // por uno, en la posicion donde se insertaron. Ahi no hay finales de por medio: hay exactamente
  // los mismos textos en el mismo orden.
  ['los ' + bloque.length + ' renglones del bloque están en documentos.js, en orden', (function () {
    for (let k = 0; k < bloque.length; k++) {
      if (doc.lineas[LARGO_DOC + 1 + k] !== bloque[k]) return false;
    }
    return true;
  })()],
  ['el bloque no quedó en relojés.js', rel.lineas.indexOf(bloque[bloque.length - 2]) < 0
    || rel.lineas.join('\n').indexOf(bloque.join('\n')) < 0],
  ['relojés.js perdió exactamente el bloque',
    rel.lineas.length === LARGO_REL_ANTES - bloque.length],
  ['documentos.js ganó el bloque más un renglón en blanco',
    doc.lineas.length === LARGO_DOC_ANTES + bloque.length + 1],
  ['ningún renglón se perdió: los dos juntos son los dos de antes',
    rel.lineas.length + doc.lineas.length
      === (LARGO_REL_ANTES - bloque.length) + (LARGO_DOC_ANTES + bloque.length + 1)],
  ['relojés.js conserva sus finales CRLF', crlfRelViejo > 0],
  ['documentos.js terminó en salto de línea', /\n$/.test(nuevoDoc)],
  ['no hay nombre repetido entre los dos archivos',
    [...relF].every(function (n) { return !docF.has(n); })],
];

let malas = 0;
CHEQUEOS.forEach(function (c) {
  if (!c[1]) malas++;
  console.log('  ' + (c[1] ? 'ok  ' : '*** ') + c[0]);
});

console.log('');
console.log('    los CRLF que quedaron en relojés.js: ' + crlfRelViejo);

// ---------------------------------------------------------------------
// Y SI ALGO FALLA, SE VUELVE SOLO
// ---------------------------------------------------------------------
//
// Los dos archivos se vuelven a escribir con los bytes que tenian antes, y se avisa. Asi esta
// herramienta se puede encadenar sin que una falla a medias deje el arbol a medio cortar y haya que
// adivinar que se perdio.
//
// Y se avisa igual que antes, porque el bloque quedo sin mover y hay que rehacerlo: lo que cambio es
// que no hace falta acordarse de "git checkout".
if (malas) {
  fs.writeFileSync(P_REL, bytesRelAntes);
  fs.writeFileSync(P_DOC, bytesDocAntes);
  console.log('  *** ' + malas + ' *** LOS DOS ARCHIVOS VOLVIERON A COMO ESTABAN. HAY QUE REHACER ESTE BLOQUE.');
  process.exit(1);
}

console.log('  ok  todo en verde.');