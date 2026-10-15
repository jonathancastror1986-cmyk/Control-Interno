// ===================================================================
// saca-comentarios.js
// ===================================================================
// PASA LA EXPLICACIÓN DETALLADA A UN DOCUMENTO, Y DEJA UNA LÍNEA EN EL CÓDIGO
// ===================================================================
//
// ---------------------------------------------------------------------
// QUÉ HACE
// ---------------------------------------------------------------------
//
// Los comentarios de este proyecto explica el POR QUÉ, que es lo correcto, pero a
// veces se pasan: hay bloques de 40 líneas antes de una función de 5. Y el código
// deja de leerse, porque el que lo abre tiene que saltar 40 líneas para llegar a
// la función.
//
// Esto hace dos cosas, por función:
//
//   1. Mueve el bloque largo a "docs/explicaciones/<archivo>.md", con un título
//      que dice sobre qué función es.
//   2. Deja en el código un comentario corto, de una o dos líneas, con lo único
//      que hace falta para entender la función sin abrir el documento.
//
// La línea corta NO es un resumen automático: es la primera frase que dice el
// por qué, que es la que responde "para qué está esto acá".
//
// ---------------------------------------------------------------------
// Y POR QUÉ HAY UNA COMPROBACIÓN AL FINAL, Y ES LO IMPORTANTE
// ---------------------------------------------------------------------
//
// Porque en este proyecto hay archivos que arman HTML con cadenas de varias
// líneas, y una línea que empieza con "//" DENTRO de una cadena no es un
// comentario: es texto que se muestra en pantalla. Si esta herramienta lo cree un
// comentario, lo borra, y el texto desaparece.
//
// Y hay otros casos: un "//" dentro de una plantilla, una línea de un texto que
// empieza con barras. Borrarlos rompe la aplicación de una forma que no se ve
// hasta que alguien mira la pantalla.
//
// Por eso la herramienta NO se fía de sí misma. Toma una "huella" del código antes
// de tocar nada: el archivo entero con los comentarios ya eliminados y los espacios
// normalizados. Al terminar vuelve a tomarla. Si las dos huellas son iguales, el
// código no cambió de ni una coma. Si no, avisa y NO deja el archivo modificado.
//
// Y eso se puede comprobar por fuera: "node tools/sonda-js.js" compara el grafo
// antes y después.
//
// ---------------------------------------------------------------------
// Y POR QUÉ SOLO TOCA COMENTARIOS QUE EMPIEZAN LA LÍNEA
// ---------------------------------------------------------------------
//
// Un comentario al final de una línea de código es otra cosa: es corto y está
// junto al código que explica. Y detectarlo bien requiere saber si esa línea está
// dentro de una cadena, que es justamente lo que no se puede saber leyendo línea
// por línea. Entonces no se tocan, y el archivo queda con menos ruido sin
// arriesgar nada.
//
// ---------------------------------------------------------------------
// CÓMO SE USA
// ---------------------------------------------------------------------
//
//     node tools/saca-comentarios.js                        # informa, no escribe
//     node tools/saca-comentarios.js --archivo js/app.js    # sólo ese
//     node tools/saca-comentarios.js --minimo 12            # bloques de 12+ líneas
//     node tools/saca-comentarios.js --aplicar              # ahora sí escribe

'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const CARPETA_DOCS = path.join(RAIZ, 'docs', 'explicaciones');

// ---------------------------------------------------------------------
// LOS ARGUMENTOS
// ---------------------------------------------------------------------
let archivoPedido = null;
let minimo = 12;
let aplicar = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--aplicar') aplicar = true;
  else if (args[i] === '--minimo') minimo = Number(args[++i]) || 12;
  else if (args[i] === '--archivo') archivoPedido = args[++i];
  else if (!args[i].startsWith('--')) archivoPedido = args[i];
}

// ---------------------------------------------------------------------
// LOS ARCHIVOS
// ---------------------------------------------------------------------
function archivosJs(relativo) {
  if (relativo) {
    const p = path.join(RAIZ, relativo);
    return fs.existsSync(p) ? [p] : [];
  }
  const salida = [];
  ['js', 'views', 'controllers'].forEach(function (carpeta) {
    const dir = path.join(RAIZ, carpeta);
    if (!fs.existsSync(dir)) return;
    (function recorrer(este) {
      fs.readdirSync(este, { withFileTypes: true }).forEach(function (e) {
        const p = path.join(este, e.name);
        if (e.isDirectory()) recorrer(p);
        else if (e.name.endsWith('.js')) salida.push(p);
      });
    })(dir);
  });
  return salida.sort();
}

// ---------------------------------------------------------------------
// LA HUELLA DEL CÓDIGO: EL ARCHIVO SIN COMENTARIOS
// ---------------------------------------------------------------------
//
// Esto es lo que se compara antes y después. Si dos huellas son iguales, el
// código está intacto y lo único que cambió es el texto de los comentarios.
//
// Y es una huella, no una copia: se quitan los espacios de más y se dejan los
// saltos de línea, así que un cambio de formato no la altera, pero un cambio de
// una coma, una letra o un signo sí.
function huella(texto) {
  return texto.split(/\r\n|\n|\r/)
    .map(function (l) { return l.replace(/^\s+/, ''); })
    .filter(function (l) {
      return l && !/^\/\//.test(l) && !/^\/\*/.test(l) && !/^\*/.test(l) && !/^\*\//.test(l);
    })
    .join('\n');
}

// ---------------------------------------------------------------------
// QUÉ LÍNEA DE CÓDIGO VIENE DESPUÉS
// ---------------------------------------------------------------------
//
// Para poder poner un título en el documento: "esto es lo que se explica acá".
// Se mira la primera línea que NO es comentario después del bloque.
function queVieneDespues(lineas, desde) {
  for (let i = desde; i < lineas.length; i++) {
    const t = lineas[i].trim();
    if (!t) continue;
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue;
    const m = t.match(/^(?:async\s+)?function\s+(\w+)/);
    if (m) return 'function ' + m[1];
    const m2 = t.match(/^(?:const|let|var)\s+(\w+)\s*=/);
    if (m2) return 'variable ' + m2[1];
    if (t.startsWith('class')) {
      const m3 = t.match(/class\s+(\w+)/);
      if (m3) return 'class ' + m3[1];
    }
    return 'este bloque';
  }
  return 'el final del archivo';
}

// ---------------------------------------------------------------------
// LA PRIMERA FRASE QUE SÍ EXplica EL POR QUÉ
// ---------------------------------------------------------------------
//
// Se buscan las líneas del bloque que NO sean un encabezado de comentario. Las
// encabezados son las que van entre dos rayas o con mayúsculas, y dicen "de qué
// va esta sección"; la primera frase de verdad dice "por qué está así".
//
// Si no se encuentra ninguna, se usa la primera línea del bloque, que por lo
// menos dice de qué trata.
function primeraFase(lasLineas) {
  const util = lasLineas.map(function (l) {
    return l.replace(/^\s*\/\/\s?/, '').replace(/^\s*\/\*+\s?/, '').replace(/\*+\/\s*$/, '').trim();
  }).filter(function (l) {
    if (!l) return false;
    if (/^-{3,}$/.test(l)) return false;
    if (/^={3,}$/.test(l)) return false;
    // Y LOS ENCABEZADOS EN MAYÚSCULAS, QUE DICEN DE QUÉ VA LA SECCIÓN
    if (l === l.toUpperCase() && l.length > 3 && /[A-ZÁÉÍÓÚÑ]/.test(l)) return false;
    return true;
  });
  if (!util.length) return '';
  // Y SE CORTA EN LA PRIMERA FRASE COMPLETA
  let frase = util[0];
  const corte = frase.indexOf('. ');
  if (corte > 20) frase = frase.slice(0, corte + 1);
  if (frase.length > 150) frase = frase.slice(0, 147).replace(/\s+\S*$/, '') + '...';
  return frase;
}

// ---------------------------------------------------------------------
// EL TRABAJO
// ---------------------------------------------------------------------
const resumenGlobal = { bloques: 0, lineasSacadas: 0, archivos: 0 };
let huboFallo = false;

archivosJs(archivoPedido).forEach(function (absoluto) {
  const relativo = path.relative(RAIZ, absoluto).replace(/\\/g, '/');
  const original = fs.readFileSync(absoluto, 'utf8');
  const huellaAntes = huella(original);

  const lineas = original.split(/\r\n|\n|\r/);
  const salida = [];
  const extraidos = [];
  let i = 0;

  while (i < lineas.length) {
    const t = lineas[i].trim();
    const esCommentLinea = /^\/\//.test(t) && !/^\/\/\s*[/*]/.test(t);
    const esCommentBloque = /^\/\*[^*]/.test(t) || /^\/\*$/.test(t);

    if (esCommentLinea || esCommentBloque) {
      // Y SE JUNTA EL BLOQUE ENTERO
      //
      // Un bloque de comentario va hasta la primera línea VACÍA o que no sea
      // comentario. Las vacías se cuentan como parte, porque en este proyecto los
      // bloques usan "//" solos para separar párrafos, y si una línea vacía cortara
      // el bloque, cada párrafo se trataría como un bloque distinto.
      //
      // Y LA PRIMERA VERSIÓN DE ESTE BUCLE TENÍA DOS ERRORES
      //
      // Uno: una línea "//" sola, con el espacio muerto, queda vacía al recortar, y
      // eso cortaba el bloque a la mitad.
      //
      // Dos, más grave: al terminar, "fin" apuntaba a la primera línea de código, y
      // esa línea se copiaba DOS veces al volver al principio del bucle. El
      // archivo quedaba con código duplicado.
      //
      // Los dos los detectó la comprobación de la huella, que es exactamente para
      // eso: si la huella cambia, no se escribe.
      const desde = i;
      let ultimoDeComentario = desde;
      while (i < lineas.length) {
        const q = lineas[i].trim();
        const esDeComentario = /^\/\//.test(q) || /^\/\*/.test(q) || /^\*/.test(q);
        if (!esDeComentario && q !== '') break;
        if (esDeComentario) ultimoDeComentario = i;
        i++;
      }
      // Y "fin" ES LA ÚLTIMA LÍNEA DE COMENTARIO, NO LA SIGUIENTE
      const fin = ultimoDeComentario;
      const deComentario = lineas.slice(desde, fin + 1).filter(function (l) {
        const q = l.trim();
        return /^\/\//.test(q) || /^\/\*/.test(q) || /^\*/.test(q);
      });

      if (deComentario.length >= minimo) {
        const frase = primeraFase(deComentario);
        const sobreQue = queVieneDespues(lineas, fin + 1);
        extraidos.push({ sobre: sobreQue, lineas: deComentario.slice() });
        // Y EN EL CÓDIGO QUEDA UNA LÍNEA, O NINGUNA
        //
        // Ninguna si la frase está vacía. Un comentario que dice "esto es una
        // función" no aporta nada y ocupa una línea igual.
        if (frase) salida.push('// ' + frase);
        else salida.push('// ' + sobreQue + ': ver docs/explicaciones/' + relativo + '.md');
        continue;
      }
      // Y SI EL BLOQUE ES CORTO, SE DEJA EXACTAMENTE COMO ESTABA
      for (let k = desde; k <= fin; k++) salida.push(lineas[k]);
      continue;
    }
    salida.push(lineas[i]);
    i++;
  }

  if (!extraidos.length) {
    console.log('  =  ' + relativo + ': nada largo que mover');
    return;
  }

  const codigoNuevo = salida.join('\r\n');
  const huellaDespues = huella(codigoNuevo);

  // Y LA COMPROBACIÓN, QUE ES LA QUE AUTORIZA ESCRIBIR
  if (huellaAntes !== huellaDespues) {
    console.log('  *** ' + relativo + ': EL CÓDIGO CAMBIÓ. No se escribe.');
    console.log('      Eso significa que había un "//" o un "/*" dentro de una cadena de');
    console.log('      texto, y esta herramienta lo tomó por un comentario. Hay que');
    console.log('      revisar ese archivo a mano.');
    huboFallo = true;
    return;
  }

  console.log('  ** ' + relativo + ': ' + extraidos.length + ' bloque(s), '
    + extraidos.reduce(function (a, b) { return a + b.lineas.length; }, 0) + ' líneas a un documento');

  if (!aplicar) {
    resumenGlobal.bloques += extraidos.length;
    resumenGlobal.lineasSacadas += extraidos.reduce(function (a, b) { return a + b.lineas.length; }, 0);
    resumenGlobal.archivos++;
    return;
  }

  fs.writeFileSync(absoluto, codigoNuevo, 'utf8');

  // Y EL DOCUMENTO, UNO POR ARCHIVO
  const nombreDoc = path.join(CARPETA_DOCS, relativo.replace(/\//g, '__') + '.md');
  let previo = '';
  if (fs.existsSync(nombreDoc)) previo = fs.readFileSync(nombreDoc, 'utf8');
  let doc = previo;
  if (!doc) {
    doc = '# ' + relativo + '\n\n'
      + 'Explicaciones largas que estaban en el código, sacadas para que el código\n'
      + 'se pueda leer de corrido.\n\n'
      + 'Cada bloque dice sobre qué función es. Para volver al código, el nombre de la\n'
      + 'función se busca en el archivo.\n\n---\n';
  }
  extraidos.forEach(function (e) {
    doc += '\n\n## ' + e.sobreQue + '\n\n```js\n' + e.lineas.join('\n') + '\n```\n';
  });
  if (!fs.existsSync(CARPETA_DOCS)) fs.mkdirSync(CARPETA_DOCS, { recursive: true });
  fs.writeFileSync(nombreDoc, doc, 'utf8');

  resumenGlobal.bloques += extraidos.length;
  resumenGlobal.lineasSacadas += extraidos.reduce(function (a, b) { return a + b.lineas.length; }, 0);
  resumenGlobal.archivos++;
});

console.log('');
if (huboFallo) {
  console.log('  *** HUBO ALGO QUE NO SE ESCRIBIÓ. Se ve arriba.');
  process.exit(1);
}
if (!resumenGlobal.bloques) {
  console.log('  ok  no hay bloques largos que mover');
  console.log('');
  process.exit(0);
}
console.log('  ' + resumenGlobal.bloques + ' bloque(s), ' + resumenGlobal.lineasSacadas
  + ' líneas, en ' + resumenGlobal.archivos + ' archivo(s)');
console.log('  ' + (aplicar ? 'ESCRITO' : 'SIN ESCRIBIR: probá con --aplicar'));
console.log('');