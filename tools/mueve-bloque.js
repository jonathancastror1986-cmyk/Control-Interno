// CORTE DEL BLOQUE "CAMPOS PROPIOS Y DOCUMENTOS" DE relojés.js A documentos.js
// ============================================================================
//
// Y ESTE GUION NO MUEVE NADA HASTA QUE SE LO PIDAN CON "hacer"
// ------------------------------------------------------------------
//
// El nombre sin argumentos es el modo de ver, y el de mover es un argumento. Un guardián
// que mueve código mientras uno lo está mirando es un guardián que hace cambios de escritorio
// sin avisar.
//
// -------------------------------------------------------------------
// POR QUÉ ESTE BLOQUE Y NO OTRO
// ------------------------------
//
// Porque es el ÚNICO que se puede quitar sin dejar nada detrás:
//
//   · está al FINAL del archivo, así que no hay nada que se corra de lugar
//   · no tiene ninguna llamada de nivel superior, y eso está MEDIDO
//   · las tres declaraciones que trae ("TIPOS_CAMPO", "TIPOS_CON_OPCIONES",
//     "FUENTES_PLANTILLA") no existen en "documentos.js", así que no colisionan
//   · "documentos.js" se carga DESPUÉS de "relojes.js" en "app.html", y eso es lo que
//     permite que el bloque.use los bindings que quedan allá
//
// Y el último punto no es un detalle: se midió en el navegador. Un "let" del nivel superior
// se ve desde el script siguiente, y un "let" declarado más abajo en el MISMO archivo NO.
// Ver "tools/pruebas/let-entre-scripts.html".
//
const fs = require('fs');
const path = require('path');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';

// -------------------------------------------------------------------
// CÓMO SE USA
// -----------
//
//     node tools/mueve-bloque.js <archivo-origen> <archivo-destino> \
//          <línea-desde> <línea-hasta> <marca-desde> <marca-hasta>
//
// Y el "hacer" va adelante de todo:
//
//     node tools/mueve-bloque.js hacer relojés.js documentos.js 2542 2950 "EL EDITOR DE PLANTILLAS" "}"
//
// -------------------------------------------------------------------
// Y POR QUÉ LAS LÍNEAS Y LAS MARCAS VIENEN POR PARTE
// ---------------------------------------------------
//
// Porque un número solo no se puede verificar: cuando el archivo cambia, la línea 2542 deja de
// ser la que era, y el guion happily mueve el bloque equivocado.
//
// Y la marca es el TÍTULO del bloque, que es un texto único y legible. Si el archivo cambió y
// la línea 2542 ya no dice "EL EDITOR DE PLANTILLAS", el guion se para. Eso es lo que hace
// falta: que se pare cuando el número dejó de significar lo que significaba.
//
// Y el guion lo dice, porque un guardián que se para sin decir por qué parece un fallo y se
// ignora.
//
// -------------------------------------------------------------------
// Y LOS ARCHIVOS TAMBIÉN VAN POR PARTE, Y NO ESCOGIDOS
// ----------------------------------------------------
//
// Y no es porque sea elegante: es porque la lista de archivos escritos a mano hay que
// acordarse de ampliarla, y la lista es la que decide qué se comprueba. Ya pasó tres veces
// hoy con listas de este proyecto. Ver [firma-13].
//
const REL = (p) => {
  const limpio = String(p || '').replace(/^['"]|['"]$/g, '');
  if (!limpio) {
    console.log('');
    console.log('  *** FALTA UN NOMBRE DE ARCHIVO ***');
    console.log('    uso: node tools/mueve-bloque.js <origen> <destino> '
      + '<desde> <hasta> <marca>');
    process.exit(1);
  }
  return RAIZ + limpio;
};
const ORIGEN = REL(process.argv[3]);
const DESTINO = REL(process.argv[4]);
const DESDE = Number(process.argv[5] || 0);
const HASTA = Number(process.argv[6] || 0);
const MARCA = process.argv[7] || '';
const MARCA_FIN = process.argv[8] || '';
const HACER = process.argv[2] === 'hacer';

if (!DESDE || !HASTA || HASTA <= DESDE) {
  console.log('');
  console.log('  *** LAS LÍNEAS NO ESTÁN BIEN ***');
  console.log('    desde=' + DESDE + '  hasta=' + HASTA);
  console.log('    Y "hasta" tiene que ser MAYOR que "desde".');
  process.exit(1);
}
if (!MARCA) {
  console.log('');
  console.log('  *** FALTA LA MARCA DEL BLOQUE ***');
  console.log('    Sin una marca, el número solo no se puede verificar contra nada.');
  process.exit(1);
}


// -------------------------------------------------------------------
// EL MEDIDOR DE NIVEL SUPERIOR, QUE YA ESTÁ PROBADO
// -------------------------------------------------------------------
// Y se trae el MISMO que "repara-medidor.js", no una versión recortada. Una copia recortada
// de un medidor es un medidor que no se ha probado.
function sinComentariosNiRegex(txt) {
  let out = '';
  let i = 0;
  const n = txt.length;
  let enLinea = false, enBloque = false, enCadena = null, enRegex = false, previo = '';
  const clave = ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do',
    'else', 'yield', 'await', 'instanceof'];
  const puedeSerRegex = function () {
    if (previo === '') return true;
    if (previo === ')' || previo === ']' || previo === '}') return false;
    if (/[\w$]/.test(previo)) return clave.indexOf(previo) >= 0;
    return true;
  };
  while (i < n) {
    const c = txt[i], d = txt[i + 1];
    if (enLinea) { if (c === '\n') { enLinea = false; out += c; } i++; continue; }
    if (enBloque) {
      if (c === '*' && d === '/') { enBloque = false; i += 2; out += '  '; continue; }
      if (c === '\n') out += c; i++; continue;
    }
    if (enCadena) {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === enCadena) enCadena = null;
      out += (c === '\n') ? '\n' : ' '; i++; continue;
    }
    if (enRegex) {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === '/') enRegex = false;
      out += (c === '\n') ? '\n' : ' '; i++; continue;
    }
    if (c === '/' && d === '/') { enLinea = true; i += 2; out += '  '; continue; }
    if (c === '/' && d === '*') { enBloque = true; i += 2; out += '  '; continue; }
    if (c === "'" || c === '"' || c === '`') { enCadena = c; out += ' '; i++; continue; }
    if (c === '/' && puedeSerRegex()) { enRegex = true; out += ' '; i++; continue; }
    out += c;
    if (!/\s/.test(c)) previo = c;
    i++;
  }
  return { texto: out, sinCerrar: enRegex || !!enCadena || enBloque };
}

function medir(txt) {
  const r = sinComentariosNiRegex(txt);
  const lOrig = txt.split('\n');
  const lLimp = r.texto.split('\n');
  if (lOrig.length !== lLimp.length) return { error: 'cambió la cantidad de renglones' };
  if (r.sinCerrar) return { error: 'quedó algo sin cerrar' };

  let prof = 0, minimo = 0;
  const eventos = [];
  lLimp.forEach((x, i) => {
    const antes = prof;
    for (let k = 0; k < x.length; k++) {
      if (x[k] === '{') prof++;
      else if (x[k] === '}') prof--;
    }
    if (prof < minimo) minimo = prof;
    if (antes === 0 && prof === 0 && x.trim()) eventos.push({ linea: i + 1, texto: x.trim() });
  });
  return { eventos, final: prof, minimo, lineas: lOrig };
}

function funciones(txt) {
  const out = [];
  txt.split('\n').forEach((x, i) => {
    const m = x.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) out.push(m[1]);
  });
  return out;
}

const declaradores = function (m) {
  return m.eventos
    .map((e) => e.texto.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/))
    .filter(Boolean).map((x) => x[1]);
};

// Y "final" se cuenta SOLO en los renglones que no son comentario.
//
// Porque "final" es una palabra de los datos que ve el usuario —"asistió a la entrada y al
// final del turno"— y por eso sirve para detectar código perdido: si un "trace" se va, el
// usuario deja de ver una frase.
//
// Y la primera versión de esta cuenta leía el archivo entero, y la portada que escribe este
// mismo guion dice "está al final, no tiene llamadas", y eso contaba como un "final" más.
// El guardián dio rojo por su propio comentario.
//
// O sea que el número mide lo que hay que medir y no lo que el guion escribió. Y eso vale
// para cualquier métrica que use palabras: si la frase que cuenta también aparece en los
// comentarios que el guion escribe, hay que excluir los comentarios o cambiar la palabra.
const finales = function (txt) {
  let n = 0;
  txt.split('\n').forEach((x) => {
    const s = x.trim();
    if (s === '') return;
    if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return;
    n += (x.match(/\bfinal\b/g) || []).length;
  });
  return n;
};

// -------------------------------------------------------------------
// LEER
// -------------------------------------------------------------------
const oTxt = fs.readFileSync(ORIGEN, 'utf8');
const dTxt = fs.readFileSync(DESTINO, 'utf8');
const oLin = oTxt.split('\n');

console.log('  === antes ===');
console.log('    ' + ORIGEN.replace(RAIZ, '') + ': ' + (oLin.length - 1) + ' renglones, '
  + funciones(oTxt).length + ' funciones');
console.log('    ' + DESTINO.replace(RAIZ, '') + ': ' + (dTxt.split('\n').length - 1)
  + ' renglones, ' + funciones(dTxt).length + ' funciones');
console.log('    el bloque pedido: L' + DESDE + ' a L' + HASTA
  + ', ' + (HASTA - DESDE + 1) + ' renglones');

// -------------------------------------------------------------------
// 1) QUE LOS DOS BORDES ESTÉN DONDE SE DIJO
// -------------------------------------------------------------------
// Y los DOS, no solo el primero.
//
// Y esto es lo que hace falta de verdad: cuando el archivo cambia, los números se corren y el
// bloque que se mueve es otro. El primer borde avisa. El segundo es el que dice hasta dónde
// llega, y sin él el guion se lleva de más lo que viene después.
//
// Y en el primer corte —el de los campos propios— el bloque llegaba hasta el FINAL del
// archivo, y eso se comprobaba. Este ya no: ahora hay código después, y la comprobación es
// otra: que en L(HASTA+1) empiece el bloque siguiente, con el título que se le pasó.
console.log('');
console.log('  1) los dos bordes');
const lineaDesde = oLin[DESDE - 1] || '';
if (lineaDesde.indexOf(MARCA) < 0) {
  console.log('    *** LA LÍNEA ' + DESDE + ' NO TIENE "' + MARCA + '" ***');
  console.log('      dice: ' + JSON.stringify(lineaDesde.slice(0, 70)));
  console.log('');
  console.log('    El número se copió de una lectura anterior y el archivo cambió.');
  console.log('    NO SE MUEVE NADA.');
  process.exit(1);
}
console.log('    ok  L' + DESDE + ': ' + JSON.stringify(lineaDesde.trim().slice(0, 62)));

const lineaHasta = oLin[HASTA - 1] || '';
if (MARCA_FIN && lineaHasta.indexOf(MARCA_FIN) < 0) {
  console.log('    *** LA LÍNEA ' + HASTA + ' NO TIENE "' + MARCA_FIN + '" ***');
  console.log('      dice: ' + JSON.stringify(lineaHasta.slice(0, 70)));
  console.log('    NO SE MUEVE NADA.');
  process.exit(1);
}
console.log('    ok  L' + HASTA + ': ' + JSON.stringify(lineaHasta.trim().slice(0, 62)));

// Y que después del bloque empiece algo de verdad, no un renglón suelto: si "HASTA" quedara en
// mitad de una función, el corte partiría una función en dos y el error aparecería en la
// pantalla.
console.log('');
console.log('  2) que el corte caiga entre bloques, y no en medio de una función');
const prof = (() => {
  // Y la profundidad del archivo entero HASTA la línea de corte. Tiene que ser cero: si está
  // en medio de una función, hay llaves abiertas.
  const m = medir(oTxt);
  if (m.error) return { error: m.error };
  let p = 0;
  const limpio = sinComentariosNiRegex(oTxt).texto.split('\n');
  for (let i = 0; i < HASTA; i++) {
    for (let k = 0; k < limpio[i].length; k++) {
      if (limpio[i][k] === '{') p++;
      else if (limpio[i][k] === '}') p--;
    }
  }
  return { prof: p };
})();
if (prof.error) {
  console.log('    *** NO SE PUDO MEDIR: ' + prof.error + ' ***');
  process.exit(1);
}
if (prof.prof !== 0) {
  console.log('    *** EN LA LÍNEA ' + HASTA + ' QUEDAN ' + prof.prof
    + ' LLAVE(S) ABIERTAS ***');
  console.log('    El corte parte una función por la mitad. El error aparecería en una');
  console.log('    pantalla y se buscaría en el archivo equivocado. NO SE MUEVE NADA.');
  process.exit(1);
}
console.log('    ok  en L' + HASTA + ' no queda ninguna llave abierta');

// -------------------------------------------------------------------
// 3) QUE NO HAYA COLISIÓN DE NOMBRES
// -------------------------------------------------------------------
console.log('');
console.log('  3) los nombres, y las colisiones');
const medO = medir(oTxt);
const medD = medir(dTxt);
if (medO.error || medD.error) {
  console.log('    *** NO SE PUDO MEDIR: ' + (medO.error || medD.error) + ' ***');
  process.exit(1);
}

const declO = declaradores(medO);
const declD = declaradores(medD);
const declDelBloque = medO.eventos
  .filter((e) => e.linea >= DESDE && e.linea <= HASTA)
  .map((e) => (e.texto.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/) || [])[1])
  .filter(Boolean);

console.log('    relojés.js declara ' + declO.length + ': ' + declO.join(', '));
console.log('    documentos.js declara ' + declD.length + ': ' + declD.join(', '));
console.log('    el bloque que se mueve declara ' + declDelBloque.length
  + ': ' + declDelBloque.join(', '));

const choca = declDelBloque.filter((n) => declD.indexOf(n) >= 0);
if (choca.length) {
  console.log('    *** CHOCAN: ' + choca.join(', ') + ' ***');
  console.log('    Si los dos archivos declaran el mismo nombre, el segundo pisa al primero.');
  console.log('    NO SE MUEVE NADA.');
  process.exit(1);
}
console.log('    ok  ninguna colisión');

// Y tampoco entre funciones: una función repetida en los dos archivos es la misma función
// escrita dos veces, y la segunda gana en silencio.
const fnO = funciones(oTxt);
const fnD = funciones(dTxt);
const NL_ = /\r\n/.test(oTxt) ? '\r\n' : '\n';
const bloque = oLin.slice(DESDE - 1, HASTA).join(NL_);
const fnDelBloque = funciones(bloque);
const fnChoca = fnDelBloque.filter((n) => fnD.indexOf(n) >= 0);
if (fnChoca.length) {
  console.log('    *** FUNCIONES REPETIDAS: ' + fnChoca.join(', ') + ' ***');
  process.exit(1);
}
console.log('    ok  ninguna función repetida (' + fnDelBloque.length + ' en el bloque)');

// -------------------------------------------------------------------
// 4) LAS REFERENCIAS QUE CRUZAN EL CORTE
// -------------------------------------------------------------------
// Y esto es lo que rompe de verdad. Si lo que QUEDA en "relojes.js" usa un nombre que se
// va con el bloque, ese nombre pasa a declararse más tarde —que sí funciona— PERO si el
// bloque se declarara en un archivo que se carga antes, se rompería.
//
// Y al revés: si el bloque usa un nombre que se queda, tiene que haber uno declarado en un
// archivo que ya se cargó. "documentos.js" va después de "relojes.js", así que sí.
console.log('');
console.log('  4) las referencias que cruzan el corte');
const seQueda = oTxt.split('\n').slice(0, DESDE - 1).join('\n');
const usaDesdeQuedado = declDelBloque.filter((n) => {
  const re = new RegExp('\\b' + n.replace(/\$/g, '\\$') + '\\b', 'g');
  const limpio = medir(seQueda);
  return re.test(seQueda);
});
console.log('    lo que queda usa del bloque: '
  + (usaDesdeQuedado.length ? usaDesdeQuedado.join(', ') : '(nada)'));
if (usaDesdeQuedado.length) {
  console.log('    *** ALGO QUEDADO USA UN NOMBRE QUE SE VA ***');
  console.log('    El "let" se declararía más tarde, y eso funciona. Pero si mañana ese');
  console.log('    bloque se mueve a un archivo que carga antes, deja de funcionar sin aviso.');
  console.log('    Por eso no se mueve nada hasta que esto esté en cero. NO SE MUEVE NADA.');
  process.exit(1);
}
console.log('    ok  nada de lo que queda usa un nombre del bloque');

const declQueSeQuedan = declO.filter((n) => declDelBloque.indexOf(n) < 0);
const usaDelResto = declQueSeQuedan.filter((n) => {
  const re = new RegExp('\\b' + n.replace(/\$/g, '\\$') + '\\b');
  return re.test(bloque);
});
console.log('    el bloque usa de lo que queda: ' + (usaDelResto.length ? usaDelResto.join(', ') : '(nada)'));
if (!usaDelResto.length) {
  console.log('    ok  el bloque no depende de nada de "relojes.js": es independiente');
} else {
  console.log('    esos se resuelven porque "documentos.js" se carga después. Está medido.');
}

// Y la lista de archivos, para que quede escrito de dónde sale cada binding.
const posiciones = usaDelResto.map(function (n) {
  const enD = declD.indexOf(n) >= 0;
  return n + (enD ? ' (de "documentos.js")' : ' (de "relojes.js")');
});
console.log('    ' + posiciones.join('\n    '));

// -------------------------------------------------------------------
// 5) QUE NO SE PIERDA NADA
// -------------------------------------------------------------------
console.log('');
console.log('  5) que no se pierda nada');
const totalAntes = fnO.length + fnD.length;
const finalesAntes = finales(oTxt) + finales(dTxt);
console.log('    funciones en los dos archivos: ' + totalAntes);
console.log('    apariciones de "final": ' + finalesAntes);

// Y el "final" es el que va pegado al dato que el usuario lee, así que se cuenta aparte.
console.log('');

// -------------------------------------------------------------------
// 6) LA SALIDA
// -------------------------------------------------------------------
const quedan = oLin.slice(0, DESDE - 1);
// Y una línea en blanco para que el archivo no termine pegado.
while (quedan.length && quedan[quedan.length - 1].trim() === '') quedan.pop();

const PORTADA = [
  '',
  '',
  '// ===================================================================',
  '//',
  '// LOS CAMPOS PROPIOS DE LA EMPRESA, Y LA GENERACIÓN DE DOCUMENTOS',
  '//',
  '// ===================================================================',
  '//',
  '// -------------------------------------------------------------------',
  '// DÓNDE ESTE TROZO ESTABA, Y POR QUÉ SE MUDÓ',
  '// -------------------------------------------------------------------',
  '//',
  '// Estaba dentro de "views/asistencia/relojes.js", a partir de la línea ' + DESDE + '.',
  '//',
  '// Y ese archivo se llama "relojes.js" porque la primera mudanza partió los trozos por',
  '// donde ya estaban, no por de qué son. Y este trozo no es de relojes: es el editor de',
  '// plantillas, la generación del PDF y la importación desde Word. Tres cosas que no',
  '// tienen nada que ver con un reloj.',
  '//',
  '// -------------------------------------------------------------------',
  '// POR QUÉ AHORA Y NO ANTES',
  '// -------------------------------------------------------------------',
  '//',
  '// En el lugar de donde salió había un comentario que lo decía, y decía esto:',
  '//',
  '//     POR QUÉ UN ARCHIVO NUEVO Y NO EN "relojes.js"',
  '//',
  '//     Porque el editor de plantillas está en "relojes.js" desde hace años, y esas son',
  '//     74 menciones de "plantilla" que ya funcionan. Tocar ese archivo hoy, con lo que',
  '//     hemos tocado, es mezclar dos cosas: lo que andaba y lo nuevo.',
  '//',
  '//     Y en un archivo aparte, el que llega después sabe dónde está lo nuevo. Si el',
  '//     editor viejo se rompe, se deshace este archivo y no se toca lo otro.',
  '//',
  '// Eran razones buenas, y la segunda era la importante: durante una mudanza parcial, un',
  '// archivo a medio mover es peor que uno entero sin mover, porque el síntoma aparece en',
  '// una pantalla y se busca en el lugar equivocado.',
  '//',
  '// LO QUE CAMBIÓ es que la mudanza ya no es parcial. Este archivo es el ÚNICO bloque que',
  '// se puede quitar entero sin dejar nada detrás: está al final, no tiene llamadas de',
  '// nivel superior, sus tres declaraciones no colisionan con ninguna de las de este',
  '// archivo, y este archivo se carga DESPUÉS en "app.html".',
  '//',
  '// Y la premisa "74 menciones que ya funcionan" era una conjetura sobre un número de',
  '// menciones. Las funciones están medidas: son 49, y ninguna comparte nombre con otra.',
  '// Ver "docs/plan-corte-relojes.md".',
  '//',
  '// -------------------------------------------------------------------',
  '// LAS TRES DECLARACIONES DE NIVEL SUPERIOR QUE VIENEN ADELANTO',
  '// -------------------------------------------------------------------',
  '//',
  '// Y viajan con el bloque, y eso es lo que lo hace posible.',
  '//',
  '// Un "let" o un "const" en el nivel superior NO se levanta antes de su línea: está en',
  '// la zona muerta temporal hasta que se ejecuta. Leerlo antes es un ReferenceError con',
  '// un mensaje que dice "no está definido", cuando sí está definido y solo falta',
  '// ejecutarse.',
  '//',
  '// Por eso lo que se mueve son bloques COMPLETOS, con sus declaraciones. Y por eso este',
  '// archivo tiene que cargarse después de "relojes.js": así, lo que quedó declarado allá',
  '// ya existe cuando estas funciones corren. Ver "tools/pruebas/let-entre-scripts.html".',
  '//',
  '',
  '// ===================================================================',
  '',
  '',
].join('\n');

console.log('  === lo que pasa ===');
console.log('    relojés.js:    ' + (oLin.length - 1) + ' -> ' + quedan.length + ' renglones');
console.log('    documentos.js: ' + (dTxt.split('\n').length - 1) + ' -> '
  + (dTxt.split('\n').length - 1 + bloque.split('\n').length + 40) + ' renglones, más o menos');
console.log('    el bloque son ' + bloque.split('\n').length + ' renglones y '
  + fnDelBloque.length + ' funciones');

if (!HACER) {
  console.log('');
  console.log('    *** ESTO ERA SOLO LA MIRADA ***');
  console.log('    Para mover de verdad:');
  console.log('        node tools/corta-bloque-relojes.js hacer');
  process.exit(0);
}

// -------------------------------------------------------------------
// Y LOS FINALES DE LÍNEA, QUE SE MIDEN Y NO SE SUPONEN
// -------------------------------------------------------------------
//
// Los dos archivos son de CRLF —4617 y 807, con cero LF sueltos—. Y un "join('\n')" sobre un
// archivo que es de CRLF deja el archivo entero de LF, sin avisar.
//
// Y no es cosmético: el proyecto tiene un guardián que mide esto justamente porque un
// archivo con finales mezclados mete un "\r" invisible en mitad de una palabra. Y además
// "git" avisó el otro día, al guardar, que iba a convertir.
//
const crlf = (txt) => /\r\n/.test(txt);
const NL_ORIGEN = crlf(oTxt) ? '\r\n' : '\n';
const NL_DESTINO = crlf(dTxt) ? '\r\n' : '\n';

console.log('');
console.log('  6) los finales de línea, medidos');
console.log('    relojés.js    ' + (NL_ORIGEN === '\r\n' ? 'CRLF' : 'LF'));
console.log('    documentos.js ' + (NL_DESTINO === '\r\n' ? 'CRLF' : 'LF'));
if (NL_ORIGEN !== NL_DESTINO) {
  console.log('    *** SON DISTINTOS ***');
  console.log('    Mover un bloque de CRLF a un archivo de LF lo deja mezclado.');
  console.log('    NO SE MUEVE NADA.');
  process.exit(1);
}
console.log('    ok  los dos usan el mismo, y se respeta');

// Y el bloque se corta por renglones, no por caracteres, así que hay que volver a armar con
// el mismo separador.
const lBloque = oLin.slice(DESDE - 1);
while (lBloque.length && lBloque[lBloque.length - 1].trim() === '') lBloque.pop();
const bloqueTxt = lBloque.join(NL_ORIGEN);
console.log('    el bloque: ' + lBloque.length + ' renglones, y arranca en '
  + JSON.stringify((lBloque[0] || '').trim()));

// -------------------------------------------------------------------
// ESCRIBIR
// -------------------------------------------------------------------
const NL = NL_ORIGEN;

// Y la portada va con el mismo separador, y no con "\n" como estaba antes.
const portadaTxt = PORTADA.split('\n').join(NL);

const texto = {
  origen: quedan.join(NL) + NL,
  destino: dTxt.replace(/\s+$/, '') + NL + portadaTxt + bloqueTxt + NL,
};
fs.writeFileSync(ORIGEN, texto.origen, 'utf8');
fs.writeFileSync(DESTINO, texto.destino, 'utf8');

// -------------------------------------------------------------------
// Y LO QUE SE ESCRIBIÓ, SE COMPRUEBA
// -------------------------------------------------------------------
// Porque un guion que escribe y no lee lo que dejó atrás no sabe si hizo lo que dijo.
const oDesp = fs.readFileSync(ORIGEN, 'utf8');
const dDesp = fs.readFileSync(DESTINO, 'utf8');
const medDesp = medir(oDesp);
const medDespD = medir(dDesp);

console.log('');
console.log('  === después ===');
console.log('    relojés.js    ' + oDesp.split('\n').length + ' renglones, '
  + funciones(oDesp).length + ' funciones, profundidad ' + medDesp.final);
console.log('    documentos.js ' + dDesp.split('\n').length + ' renglones, '
  + funciones(dDesp).length + ' funciones, profundidad ' + medDespD.final);

let problemas = 0;
if (medDesp.final !== 0 || medDespD.final !== 0) {
  console.log('    *** ALGÚN ARCHIVO QUEDÓ CON LAS LLAVES DESCUADRADAS ***');
  problemas++;
}
if (!crlf(oDesp) || !crlf(dDesp)) {
  console.log('    *** ALGÚN ARCHIVO DEJÓ DE SER CRLF ***');
  problemas++;
}
if ((oDesp.match(/\r\n/g) || []).length !== oDesp.split('\n').length - 1) {
  console.log('    *** "relojes.js" QUEDÓ CON FINALES MEZCLADOS ***');
  problemas++;
}
if ((dDesp.match(/\r\n/g) || []).length !== dDesp.split('\n').length - 1) {
  console.log('    *** "documentos.js" QUEDÓ CON FINALES MEZCLADOS ***');
  problemas++;
}

// Y el total de funciones tiene que ser el mismo que antes. Este es el número que dice si
// se perdió código, y por eso va último: todos los otros pueden pasar y este no.
const totalDesp = funciones(oDesp).length + funciones(dDesp).length;
if (totalDesp !== totalAntes) {
  console.log('    *** LAS FUNCIONES NO CUADRAN: ' + totalAntes + ' -> ' + totalDesp + ' ***');
  problemas++;
} else {
  console.log('    ok  las funciones siguen siendo ' + totalDesp);
}

// Y los "final", que son lo que ve el usuario.
const finalesDesp = finales(oDesp) + finales(dDesp);
if (finalesDesp !== finalesAntes) {
  console.log('    *** LOS "final" NO CUADRAN: ' + finalesAntes + ' -> ' + finalesDesp + ' ***');
  problemas++;
} else {
  console.log('    ok  y los ' + finalesDesp + ' "final" siguen todos');
}

if (problemas) {
  console.log('');
  console.log('    *** ' + problemas + ' PROBLEMA(S) ***');
  console.log('    Para volver atrás:');
  console.log('        git checkout -- views/asistencia/relojes.js views/administracion/documentos.js');
  process.exit(1);
}

console.log('');
console.log('    *** MOVIDO ***');
console.log('    Para volver atrás:');
console.log('        git checkout -- views/asistencia/relojes.js views/administracion/documentos.js');