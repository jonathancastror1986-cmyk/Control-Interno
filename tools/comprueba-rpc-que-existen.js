// ===================================================================
// comprueba-rpc-que-existen.js
// ===================================================================
// ¿EL CÓDIGO LLAMA A FUNCIONES QUE ALGUIEN CREÓ?
// ===================================================================
//
// ---------------------------------------------------------------------
// EL AGUARDIÁN QUE FALTA, Y POR QUÉ HACÍA FALTA
// ---------------------------------------------------------------------
//
// Porque la clase de bug más cara del proyecto no es que algo no funcione: es
// que el código llame a una función de la base que nadie escribió.
//
// El caso: "motivosDePuerta()" llamaba a "rpc('motivos_porteria_hoy')". Esa
// función no estaba en ninguna migración. El nombre estaba inventado.
//
// Y lo que pasó después es lo que lo hace caro:
//
//   - el navegador pedía la función y recibía un 404, en CADA dibujado de la
//     tabla, o sea en cada cambio de fecha
//   - el "catch" se lo tragaba en silencio, porque el código decía que "sin
//     registro de portería no es un error"
//   - y sin esos motivos, la fila de una persona con licencia se pintaba como
//     "Sin marcar" en rojo
//
// O sea que un nombre inventado producía un 404 silencioso Y una mentira en la
// pantalla, y no había ningún guardián que lo dijera.
//
// ---------------------------------------------------------------------
// POR QUÉ NO ALCANZA CON LEER LAS MIGRACIONES
// ---------------------------------------------------------------------
//
// Porque el problema no es que la función falte: es que ALGUIEN LA LLAMA. Las dos
// mitades están en archivos distintos, y hace falta juntarlas.
//
// ---------------------------------------------------------------------
// Y POR QUÉ ESTE GUARDIÁN NO ES NADA
// ---------------------------------------------------------------------
//
// Revisa que toda función que el Javascript pide por "rpc" exista en alguna
// migración. No mira si devuelve lo que el Javascript espera, ni si los
// argumentos coincidan: eso no se puede ver sin correr la base.
//
// ---------------------------------------------------------------------
// POR QUÉ IGNORA LOS COMENTARIOS
// ---------------------------------------------------------------------
//
// Porque este mismo archivo explica, en un comentario, que la función
// "motivos_porteria_hoy" no existía. Si no se ignoraran los comentarios, el
// guardián se quejaría de su propia explicación, y un guardián que se queja de
// su documentación se calla para siempre.
//
// Y esa es la razón de que la lista se arme sobre el CÓDIGO y no sobre el texto
// del archivo: un nombre en un comentario no llama a nadie.
//
// ---------------------------------------------------------------------
// CÓMO SE USA
// ---------------------------------------------------------------------
//
//     node tools/comprueba-rpc-que-existen.js
//     node tools/comprueba-rpc-que-existen.js js/permisos-horarios.js

'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------
// LOS ARCHIVOS DE CÓDIGO
// ---------------------------------------------------------------------
const CARPETAS = ['js', 'views', 'controllers', 'config'];

function archivosJs(relativas) {
  if (relativas && relativas.length) {
    return relativas.map(function (r) { return path.join(RAIZ, r); })
      .filter(function (p) { return fs.existsSync(p); });
  }
  const salida = [];
  CARPETAS.forEach(function (carpeta) {
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
// QUITAR LOS COMENTARIOS
// ---------------------------------------------------------------------
//
// Un "//" hasta el final de la línea, y los bloques "/* */" de varias líneas. Se
// quitan ANTES de buscar, porque un nombre de función escrito en un comentario no
// llama a nadie y no debe contar.
//
// Y por qué se quitan por línea y no con una sola expresión sobre el archivo
// entero: los bloques de comentario pueden empezar en una línea y terminar en otra,
// y un reemplazo con ".*" no sabe de un archivo a otro dónde está el final. Por eso
// se lleva un estado de si se está adentro de un bloque.
function sinComentarios(texto) {
  const lineas = texto.split(/\r\n|\n|\r/);
  let dentroDeBloque = false;
  return lineas.map(function (linea) {
    let fuera = linea;
    if (dentroDeBloque) {
      const fin = fuera.indexOf('*/');
      if (fin < 0) return '';
      fuera = fuera.slice(fin + 2);
      dentroDeBloque = false;
    }
    const abre = fuera.indexOf('/*');
    if (abre >= 0 && fuera.indexOf('*/', abre) < 0) {
      dentroDeBloque = true;
      fuera = fuera.slice(0, abre);
    }
    const guion = fuera.indexOf('//');
    if (guion >= 0) fuera = fuera.slice(0, guion);
    return fuera;
  }).join('\n');
}

// ---------------------------------------------------------------------
// LAS MIGRACIONES, Y QUÉ FUNCIONES DEFINEN
// ---------------------------------------------------------------------
//
// Se lee el archivo entero SIN quitar comentarios: acá no importa, porque un
// nombre dentro de un comentario es una función que nadie creó.
// ---------------------------------------------------------------------
const migraciones = fs.readdirSync(path.join(RAIZ, 'migrations'))
  .filter(function (n) { return n.toLowerCase().endsWith('.sql'); });

const definidas = new Set();
migraciones.forEach(function (nombre) {
  const texto = fs.readFileSync(path.join(RAIZ, 'migrations', nombre), 'utf8');
  // Y EL "PUBLIC." ES OPCIONAL, Y POR QUÉ ESO IMPORTA MUCHO
  //
  // La primera versión de esta línea exigía "public." antes del nombre, y por eso
  // marcaba dos funciones que SÍ existen: la 046 crea
  // "aprobar_ingreso_pendiente" sin esquema, porque el esquema por omisión de
  // Postgres es "public" y se puede escribir el nombre pelado.
  //
  // El resultado era un guardián en rojo señalando dos funciones que la base tiene.
  // Y eso es peor que no tener el guardián: un guardián que se queja de algo que
  // está bien se apaga, y con él se apaga la única forma de descubrir un nombre
  // inventado de verdad.
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)/gi;
  let m;
  while ((m = re.exec(texto))) definidas.add(m[1]);
});

// ---------------------------------------------------------------------
// LO QUE EL CÓDIGO PIDE
// ---------------------------------------------------------------------
const solo = process.argv.slice(2).filter(function (a) { return !a.startsWith('--'); });

console.log('');
console.log('  === las funciones que el codigo pide por rpc ===');
console.log('  migraciones leídas: ' + migraciones.length
  + '   funciones que definen: ' + definidas.size);

const usadas = new Map();
const CS = String.fromCharCode(39); // la comilla simple, escrita sin escribirla
const comilla = new RegExp('rpc\\(\\s*' + CS + '([a-z_][a-z0-9_]*)' + CS, 'g');

archivosJs(solo).forEach(function (absoluto) {
  const relativo = path.relative(RAIZ, absoluto).replace(/\\/g, '/');
  const codigo = sinComentarios(fs.readFileSync(absoluto, 'utf8'));
  let m;
  while ((m = comilla.exec(codigo))) {
    const nombre = m[1];
    if (!usadas.has(nombre)) usadas.set(nombre, []);
    usadas.get(nombre).push(relativo);
  }
});

if (!usadas.size) {
  console.log('  ok  el código no pide ninguna función por rpc');
  process.exit(0);
}

let problemas = 0;
Array.from(usadas.keys()).sort().forEach(function (nombre) {
  const donde = usadas.get(nombre);
  const existe = definidas.has(nombre);
  if (existe) {
    console.log('    ok   ' + nombre + '   (' + donde.length + ' lugar(es))');
    return;
  }
  problemas++;
  console.log('    *** ' + nombre + ': el codigo la pide y NINGUNA migración la crea');
  console.log('        la llama: ' + donde.join(', '));
  console.log('        Y ESO ES UN 404 EN CADA LLAMADA, CON EL "catch" encima.');
  console.log('        O se crea la función en una migración nueva, o se deja de llamar.');
});

console.log('');
if (problemas) {
  console.log('  *** ' + problemas + ' FUNCION(ES) QUE EL CODIGO PIDE Y NO EXISTEN ===');
  console.log('');
  console.log('    Con el "catch" encima, esto no se ve: se ve una pantalla que');
  console.log('    no muestra un dato y no dice por qué.');
  process.exit(1);
}
console.log('  ok  las ' + usadas.size + ' funciones que se piden existen todas');
console.log('');