// PRUEBA DEL GUARDIÁN DE FINALES DE RenglÓN DE "archivo-seguro.js"
// ================================================================
//
// ---------------------------------------------------------------------
// POR QUÉ ESTA PRUEBA EXISTE
// ---------------------------------------------------------------------
//
// Porque el guardián de los finales de renglón estaba mal, y estuvo mal de una forma que se
// veía bien: en "documentacion.txt" rechazaba CUALQUIER inserción, porque el archivo es de LF puro
// y el chequeo contaba los LF puros. Un guardián que bloquea la corrección es el obstáculo de
// la corrección, y lo peor es que el aviso —"un renglón que era CRLF pasó a ser de LF"— no
// describía lo que había pasado. Ver [orden-04].
//
// Y cuando se arregla un guardián hay que probar las dos cosas: que ahora deja pasar lo que
// tiene que dejar pasar, y que SIGUE rechazando lo que tiene que rechazar. Un chequeo nuevo que
// solo se prueba con el caso bueno es un chequeo que no existe.
//
// ---------------------------------------------------------------------
// LOS TRES CASOS
// ---------------------------------------------------------------------
//
//   1. Un archivo de LF puro, y se le inserta un renglón.  TIENE QUE ACEPTAR.
//      Es el caso que estaba roto: el archivo es de LF puro, insertar un renglón sube el número
//      de LF puros, y el guardián viejo lo tomaba por una conversión de estilo.
//
//   2. Un archivo de CRLF, y se le convierte UN renglón de CRLF a LF.  TIENE QUE RECHAZAR.
//      Es el defecto que el guardián existe para agarrar, y el que hay que comprobar que sigue
//      agarrando: si este caso pasa, el guardián no protege nada.
//
//   3. Un archivo de CRLF, y se le inserta un renglón.  TIENE QUE ACEPTAR.
//      Insertar en un archivo de CRLF AGREGA un CRLF, y el total sube. El guardián tiene que
//      tolerar que suba y.rejectar solo que BAJE.
//
// ---------------------------------------------------------------------
// POR QUÉ SE CORRE EN UN PROCESO aparte
// ---------------------------------------------------------------------
//
// Porque "escribe()" llama a "process.exit(1)" cuando se niega. Si se probara en el mismo
// proceso, la primera negativa se comería el resto de la prueba y el script saldría con código
// 1 sin decir cuál de los tres casos falló.
//
// Y por eso el que se ejecuta es un archivo escrito por este mismo guion, con texto sin
// acentos: escrito con el "write" y no con un "node -e", porque por el camino se le cuelan
// letras de otro idioma y no se ve.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = __dirname + '/../';
const LIB = path.join(RAIZ, 'tools', 'archivo-seguro.js');

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'prueba-archivo-seguro-'));
const corredor = path.join(temporal, 'corre.js');
fs.writeFileSync(corredor, [
  "const { Archivo } = require(" + JSON.stringify(LIB.replace(/\\/g, '/')) + ");",
  'const a = new Archivo(process.argv[2]);',
  "a.inserta(1, ['un renglon nuevo']);",
  "if (process.argv[4] === 'convierte') {",
  '  let n = 0;',
  "  for (let i = 0; i < a.fines.length; i++) {",
  "    if (a.fines[i] === '\\r\\n') { a.fines[i] = '\\n'; n++; break; }",
  '  }',
  "  if (n === 0) { console.log('  el archivo de prueba no es de CRLF'); process.exit(3); }",
  '}',
  'a.escribe();',
  '',
].join('\n'), 'utf8');

function crlfDe(ruta) {
  const b = fs.readFileSync(ruta);
  let n = 0;
  for (let i = 1; i < b.length; i++) if (b[i] === 10 && b[i - 1] === 13) n++;
  return n;
}

function renglonesDe(ruta) {
  return fs.readFileSync(ruta, 'utf8').split(/\r\n|\n|\r/).length;
}

function arma(nombre, texto) {
  const ruta = path.join(temporal, nombre);
  fs.writeFileSync(ruta, texto);
  return ruta;
}

function corre(ruta, modo) {
  const r = spawnSync(process.execPath, [corredor, ruta, 'lo que sea', modo || ''],
    { encoding: 'utf8' });
  return { codigo: r.status, salida: (r.stdout || '') + (r.stderr || '') };
}

const CASOS = [];
let malas = 0;

CASOS.push(function casoUno() {
  const ruta = arma('puro-lf.txt', 'uno\ndos\ntres\n');
  const antes = renglonesDe(ruta);
  const r = corre(ruta, '');
  const ok = r.codigo === 0 && renglonesDe(ruta) === antes + 1;
  return {
    nombre: '1. un archivo de LF puro, y se le inserta un renglon',
    ok: ok,
    detalle: 'salida ' + r.codigo + ', ' + antes + ' -> ' + renglonesDe(ruta) + ' renglones',
    porQue: 'TIENE QUE ACEPTAR. Es el caso que estaba roto y que bloqueaba la mudanza de rls-06.',
  };
});

CASOS.push(function casoDos() {
  const ruta = arma('crlf.txt', 'uno\r\ndos\r\ntres\r\n');
  const antesCRLF = crlfDe(ruta);
  // Y como Buffer, no como texto: "equals" no acepta una cadena, y comparar así revienta con una
  // excepción que no dice nada del caso que se estaba probando.
  const antes = fs.readFileSync(ruta);
  const r = corre(ruta, 'convierte');
  const igual = fs.readFileSync(ruta).equals(antes);
  const ok = r.codigo !== 0 && igual;
  return {
    nombre: '2. un archivo de CRLF, y un renglon pasa de CRLF a LF',
    ok: ok,
    detalle: 'salida ' + r.codigo + ', el archivo quedo ' + (igual ? 'intacto' : 'MODIFICADO'),
    porQue: 'TIENE QUE RECHAZAR y no tocar el archivo. Es el defecto que el guardian existe '
      + 'para agarrar: si este caso pasa, el guardian no protege nada. CRLF antes: ' + antesCRLF,
  };
});

CASOS.push(function casoTres() {
  const ruta = arma('crlf2.txt', 'uno\r\ndos\r\ntres\r\n');
  const antesCRLF = crlfDe(ruta);
  const r = corre(ruta, '');
  const ahoraCRLF = crlfDe(ruta);
  const ok = r.codigo === 0 && ahoraCRLF === antesCRLF + 1;
  return {
    nombre: '3. un archivo de CRLF, y se le inserta un renglon',
    ok: ok,
    detalle: 'salida ' + r.codigo + ', CRLF ' + antesCRLF + ' -> ' + ahoraCRLF,
    porQue: 'TIENE QUE ACEPTAR. Insertar en un archivo de CRLF AGREGA un CRLF: el total sube y '
      + 'eso es lo correcto. El guardián tiene que tolerar que suba y rechazar solo que baje.',
  };
});

// ---------------------------------------------------------------------
// 4. UN ARCHIVO QUE YA Viene MEZCLADO
// ---------------------------------------------------------------------
//
// Y este es el caso que casi se manda sin mirar, y es el que importa.
//
// La regla anterior —"si el archivo es de CRLF, todo renglón menos el último tiene que terminar
// en CRLF"— suena más estricta, y es PEOR: el proyecto tiene once archivos mezclados de verdad,
// entre ellos "administracion.js" con 1.992 renglones de CRLF y 6 de LF. Con esa regla esos once
// archivos quedaban rechazados para siempre, y no se podían editar más.
//
// O sea que la regla parecía proteger más y protegía menos: rechazaba el archivo entero por
// algo que ya estaba y que no es un defecto. Los renglones de LF de esos archivos están así
// porque un bloque se movió de un archivo a otro, y el bloque tiene que poder seguir siendo eso.
//
// Un guardián que bloquea la corrección es el obstáculo de la corrección. Ver [orden-04].
CASOS.push(function casoCuatro() {
  const ruta = arma('mezclado.txt', 'uno\r\ndos\ntres\r\ncuatro\r\n');
  const r = corre(ruta, '');
  // Y el texto EXACTO, porque "aceptó" no es lo mismo que "aceptó bien". El renglón nuevo entra en
  // el segundo lugar y hereda el final de ahí, que es "\n" y no "\r\n": el archivo queda con la
  // mezcla que tenía, más un renglón del estilo del vecino.
  const esperado = 'uno\r\nun renglon nuevo\ndos\ntres\r\ncuatro\r\n';
  const obtenido = fs.readFileSync(ruta, 'utf8');
  const ok = r.codigo === 0 && obtenido === esperado;
  return {
    nombre: '4. un archivo que YA viene mezclado, y se le inserta un renglon',
    ok: ok,
    detalle: 'salida ' + r.codigo + ', el texto es ' + (obtenido === esperado ? 'el esperado' : 'OTRO'),
    porQue: 'TIENE QUE ACEPTAR. Que un archivo tenga ya renglones de CRLF y de LF no es un '
      + 'defecto: hay once en el proyecto. Lo que no puede pasar es que UN renglón que ya era '
      + 'del archivo cambie de estilo.',
  };
});

console.log('  prueba del guardian de finales de renglon');
console.log('  (los archivos se arman en ' + temporal + ')');
console.log('');

CASOS.forEach(function (c) {
  const r = c();
  if (!r.ok) malas++;
  console.log('  ' + (r.ok ? 'ok  ' : '*** ') + r.nombre);
  console.log('        ' + r.detalle);
  console.log('        ' + r.porQue);
  console.log('');
});

fs.rmSync(temporal, { recursive: true, force: true });

if (malas) {
  console.log('  *** ' + malas + ' de ' + CASOS.length + ' casos');
  process.exit(1);
}
console.log('  ok  los ' + CASOS.length + ' casos: acepta lo que debe y rechaza lo que debe.');