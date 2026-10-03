// PROBAR QUE "comprueba-codigos" PUEDE FALLAR
// ============================================
//
// -------------------------------------------------------------------
// POR QUÉ HAY QUE PROBAR UN GUARDIÁN
// ----------------------------------
//
// Porque un guardián que nunca falla no está probando nada: pasa siempre, uno se acostumbra a
// verlo en verde y deja de mirarlo. Y el día que hay que confiar en él para decir "ya está", es
// cuando no sirve.
//
// La forma de comprobarlo es inyectar el defecto y ver que lo pesa. Ver [tarja-14].
//
// -------------------------------------------------------------------
// Y POR QUÉ EL GUARDIÁN TOMA LA RUTA DE UNA VARIABLE
// --------------------------------------------------
//
// Para que la prueba no toque "documentacion.txt". Quitarle un título al índice real para
// hacer fallar al guardián, y después devolverlo, es jugarse el índice entero en cada prueba:
// si algo se corta en el medio, el archivo queda a medias y nadie se entera hasta que alguien lo
// lee.
//
// Y sin esto el arnés estaría probando OTRA cosa: el guardián sobre el archivo de verdad, con la
// prueba escrita encima. Es el mismo error de [afp-12], donde el arnés no le pasaba la entrada
// al sistema que probaba y por eso daba "9 de 9" en verde con los nueve archivos rotos.
//
// -------------------------------------------------------------------
// Y POR QUÉ "prueba-comprueba-codigos.js" ESTUVO A PUNTO DE QUEDAR VACÍO
// --------------------------------------------------------------------
//
// Porque se creó en una carpeta y después se copió de otra con "Copy-Item -Force". El origen no
// existía —el archivo se había escrito directamente en el destino—, y "Copy-Item" con un
// origen que no está NO DA ERROR: crea el destino vacío.
//
// O sea que el archivo quedó en cero bytes, "node --check" lo aprobó —un archivo vacío es un
// programa vacío, y compila—, y el guion salía con 0.
//
// Y eso es [arq-20] de nuevo: un cero se ve igual cuando no hay nada y cuando la herramienta no
// está mirando. Por eso ahora, antes de nada, se comprueba que el archivo tenga contenido. Ver
// [arq-27].
//
const fs = require('fs');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const GUARDIAN = RAIZ + 'tools/comprueba-codigos.js';
const PROBETA = 'C:/Users/mrj0t/AppData/Local/Temp/opencode/doc-prueba.txt';
const BASE_PROBETA = 'C:/Users/mrj0t/AppData/Local/Temp/opencode/base-prueba.txt';

// -------------------------------------------------------------------
// LA LÍNEA BASE DE LA PRUEBA
// ---------------------------
//
// Y el guardián separa "nuevo" de "conocido", así que para el caso SANO hace falta una línea
// base que cubra todo lo que el proyecto cita y el índice de prueba no tiene.
//
// Y la primera versión no la tenía: con un índice de prueba de dos secciones, los otros 146
// códigos que cita el proyecto aparecían como "nuevos", y el guardián fallaba en el caso sano.
// Decir "el guardián está roto" cuando lo que está roto es el arnés. Ver [afp-12].
//
// Así que el arnés arma su propia línea base: TODOS los códigos que el proyecto cita, menos los
// dos que la prueba usa para romper. Con eso, el caso sano no tiene nada nuevo, y cuando el
// índice de prueba pierde un título ese código aparece como nuevo.
const { execFileSync: exec } = require('child_process');
const PATRON_CODIGO = /\[[a-z]+-\d+\]/g;
function codigosCitados() {
  const archivos = exec('git', ['ls-files'], {
    cwd: RAIZ, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }).split('\n').map(function (x) { return x.trim(); })
    .filter(function (p) { return /\.(js|html|css|sql|md)$/.test(p); });
  const s = new Set();
  archivos.forEach(function (P) {
    if (P === 'documentacion.txt') return;
    let t;
    try { t = fs.readFileSync(RAIZ + P, 'utf8'); } catch (e) { return; }
    (t.match(PATRON_CODIGO) || []).forEach(function (c) { s.add(c.slice(1, -1)); });
  });
  return s;
}

const PARA_ROMPER = ['imp-01', 'imp-02'];
function escribirBasePrueba() {
  const todos = codigosCitados();
  fs.writeFileSync(BASE_PROBETA, [...todos].filter(function (c) {
    return PARA_ROMPER.indexOf(c) < 0;
  }).sort().join('\n') + '\n', 'utf8');
  return todos.size;
}

// -------------------------------------------------------------------
// 0) QUE ESTE ARCHIVO EXISTA Y TENGA CONTENIDO
// -------------------------------------------------------------------
// Y es lo primero, antes de leer el guardián. Un arnés que se verifica a sí mismo al final es
// inútil si se quedó vacío: no falla, dice que todo bien, y no probó nada.
if (!fs.existsSync(GUARDIAN)) {
  console.log('  *** NO EXISTE EL GUARDIÁN ***');
  process.exit(1);
}
const fuente = fs.readFileSync(GUARDIAN, 'utf8');
if (fuente.length < 200) {
  console.log('  *** EL GUARDIÁN MIDE ' + fuente.length + ' BYTES ***');
  console.log('    No es un guardián. Verificar que el archivo no quedó vacío.');
  process.exit(1);
}
if (fuente.indexOf('DOC_PROBETA') < 0) {
  console.log('  *** EL GUARDIÁN NO ACEPTA UNA RUTA DE PRUEBA ***');
  console.log('    Sin eso hay que tocar el archivo real para probarlo. Ver [afp-12].');
  process.exit(1);
}
console.log('    ok  el guardián existe, tiene ' + fuente.length + ' bytes y toma la ruta del arnés');

// -------------------------------------------------------------------
// EL CORREDOR
// -------------------------------------------------------------------
function correr(etiqueta) {
  try {
    execFileSync(process.execPath, [GUARDIAN], {
      encoding: 'utf8', stdio: 'pipe',
      env: Object.assign({}, process.env, { DOC_PROBETA: PROBETA, CODIGOS_PROBETA: BASE_PROBETA }),
    });
    console.log('    ' + etiqueta + ': PASÓ');
    return true;
  } catch (e) {
    const salida = String(e.stdout || '');
    console.log('    ' + etiqueta + ': FALLÓ');
    salida.split('\n').filter(function (x) { return /REFERENCIA|TÍTULO|INTERNA/.test(x); })
      .slice(0, 4).forEach(function (x) { console.log('        ' + x.trim().slice(0, 72)); });
    return false;
  }
}

// Y el índice de prueba tiene que usar el FORMATO REAL, con la fila de guiones debajo de cada
// título. La primera versión no la tenía, y entonces el guardián no reconocía NINGÚN título:
// los dos códigos salían como nuevos y la referencia entre ellos salía rota.
//
// O sea que la prueba estaba probando el guardián contra un archivo que el guardián no puede
// leer, y concluía que el guardián estaba roto. Ver [arq-28].
//
// Y no es un detalle del arnés: el formato es lo que distingue un título de una mención, y si
// el arnés usa un formato que el guardián no reconoce, no está probando el guardián.
const G = '-'.repeat(80);
const BUENO = [
  '[imp-01] LA PRIMERA SECCIÓN',
  G,
  '',
  'Y el texto de la primera.',
  '',
  '[imp-02] LA SEGUNDA',
  G,
  '',
  'Que se refiere a la primera. Ver [imp-01].',
  '',
].join('\n');

let malas = 0;

// -------------------------------------------------------------------
// 1) SANO
// -------------------------------------------------------------------
console.log('');
console.log('  === el guardián con un índice sano ===');
const nCitados = escribirBasePrueba();
console.log('    la línea base de la prueba cubre ' + (nCitados - PARA_ROMPER.length) + ' de los ' + nCitados + ' códigos que cita el proyecto');
fs.writeFileSync(PROBETA, BUENO, 'utf8');
if (!correr('sano')) {
  console.log('  *** FALLA CON EL ÍNDICE SANO ***');
  process.exit(1);
}

// -------------------------------------------------------------------
// 2) UNA REFERENCIA SIN SECCIÓN
// -------------------------------------------------------------------
// Y el defecto real: el código cita "[imp-02]" —está en "js/app.js"—, y el título desaparece.
console.log('');
console.log('  === caso 1: el código cita algo que ya no está escrito ===');
fs.writeFileSync(PROBETA, BUENO.split('\n').filter(function (x) {
  return x.indexOf('[imp-02]') < 0;
}).join('\n') + '\nVer [imp-02].\n', 'utf8');
if (correr('sección borrada')) { console.log('  *** NO LO PESCA ***'); malas++; }

// -------------------------------------------------------------------
// 3) DOS CÓDIGOS EN UN TÍTULO
// -------------------------------------------------------------------
// Y este es el que un comprobador normal no ve: la línea PARECE un título, declara uno, y deja
// el otro citado en el código y sin sección. Ver [arq-26].
console.log('');
console.log('  === caso 2: dos códigos en un mismo renglón ===');
fs.writeFileSync(PROBETA, BUENO.replace('[imp-02] LA SEGUNDA', '[imp-01] Y [imp-02] DOS EN UNO'), 'utf8');
if (correr('dos códigos en un título')) { console.log('  *** NO LO PESCA ***'); malas++; }

// -------------------------------------------------------------------
// 4) EL MISMO CÓDIGO CON DOS TÍTULOS
// -------------------------------------------------------------------
console.log('');
console.log('  === caso 3: el mismo código con dos títulos ===');
fs.writeFileSync(PROBETA, BUENO + '\n[imp-01] OTRO TÍTULO PARA LO MISMO\n' + G + '\n', 'utf8');
if (correr('código repetido')) { console.log('  *** NO LO PESCA ***'); malas++; }

// -------------------------------------------------------------------
// 5) UNA REFERENCIA INTERNA ROTA
// -------------------------------------------------------------------
console.log('');
console.log('  === caso 4: "Ver [código]" dentro de la documentación, a la nada ===');
fs.writeFileSync(PROBETA, BUENO + '\nVer [nada-01].\n', 'utf8');
if (correr('referencia interna rota')) { console.log('  *** NO LO PESCA ***'); malas++; }

// -------------------------------------------------------------------
// 6) UNA REFERENCIA ENTRE SECCIONES NO ES DUPLICADO
// -------------------------------------------------------------------
// Y este es el caso de NO FALLO. Y tiene que comprobar que de verdad está pasando por lo que
// dice: si "[imp-01]" aparece una sola vez, la prueba no está probando nada.
console.log('');
console.log('  === caso 5: una referencia entre secciones NO es un duplicado ===');
fs.writeFileSync(PROBETA, BUENO, 'utf8');
const n = fs.readFileSync(PROBETA, 'utf8').split('[imp-01]').length - 1;
console.log('    (el índice tiene "[imp-01]" ' + n + ' veces: una de título y otra citada)');
if (n < 2) {
  console.log('  *** LA PRUEBA NO ESTÁ PROBANDO LO QUE DICE ***');
  process.exit(1);
}
if (!correr('referencia entre secciones')) { console.log('  *** LO TOMA POR DUPLICADO ***'); malas++; }

// -------------------------------------------------------------------
// 7) VOLVER AL ESTADO NORMAL
// -------------------------------------------------------------------
fs.unlinkSync(PROBETA);
if (fs.existsSync(BASE_PROBETA)) fs.unlinkSync(BASE_PROBETA);

console.log('');
console.log('  === y el índice real, después de las pruebas ===');
delete process.env.DOC_PROBETA;
try {
  execFileSync(process.execPath, [GUARDIAN], { encoding: 'utf8', stdio: 'pipe' });
  console.log('    y el guardián dice que el índice real está completo');
} catch (e) {
  console.log('    y el guardián detecta lo que queda pendiente en el índice real:');
  String(e.stdout || '').split('\n').filter(function (x) {
    return /SIN SECCIÓN|REFERENCIA|INTERNA|^    [a-z]+ +[0-9]+:/.test(x);
  }).slice(0, 10).forEach(function (x) { console.log('      ' + x.trim().slice(0, 72)); });
}

console.log('');
if (malas) {
  console.log('  *** ' + malas + ' CASO(S) MAL ***');
  process.exit(1);
}
console.log('    ok  el guardián pesa los cinco casos, y el índice real sigue entero');
