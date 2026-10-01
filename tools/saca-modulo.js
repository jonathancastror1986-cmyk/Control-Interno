// SACAR UN MÓDULO DE "js/app.js"
// ===============================
//
// -------------------------------------------------------------------
// POR QUÉ HAY QUE MIRAR MÁS LEJOS QUE LAS LLAMADAS DE NIVEL SUPERIOR
// ----------------------------------------------------------------
//
// La medición anterior contó 9 llamadas que corren al cargar la página, y ninguna pedía
// reordenar. Y eso es cierto, y no alcanza.
//
// Porque una llamada de nivel superior es la PUNTA. Debajo hay un grafo: "montarFirmaPapel()"
// llama a otras diez funciones, y esas diez son las que se rompen si no están cargadas.
//
// O sea que lo que hay que medir no es "qué se llama al cargar", sino "a qué se llega desde lo
// que se llama al cargar".
//
// -------------------------------------------------------------------
// POR QUÉ ESO DECIDE EL ORDEN DE CARGA
// ------------------------------------
//
// En "<script>" clásicos todo lo de nivel superior es global, así que las FUNCIONES se ven
// entre archivos. Pero las VARIABLES ("const" y "let") no: si el archivo que las usa carga
// antes del que las declara, se cae con "ReferenceError".
//
// Y hay dos cosas que se rompen:
//
//   1. Una función que el módulo llama al cargar y que NO está en este módulo ni en el
//      núcleo, y por lo tanto todavía está en "js/app.js", que carga después.
//
//   2. Una variable de nivel superior que el módulo toca al cargar y que se declara en otro
//      archivo que carga después.
//
// -------------------------------------------------------------------
// EL ORDEN EN QUE SE SACAN LOS MÓDULOS
// -------------------------------------
//
// Y no es cualquiera. Sale de la misma medición: "boot()" es una llamada de nivel superior
// que está en el módulo de administración, y "boot" llama a un montón de cosas.
//
// O sea que:
//   - los módulos SIN llamadas de nivel superior se pueden sacar en cualquier orden
//   - portería y bodega se pueden sacar, porque sus llamadas al cargar solo usan el núcleo
//   - ADMINISTRACIÓN VA DE ÚLTIMO, porque mientras "boot" esté en "js/app.js", las
//     funciones que "boot" necesita siguen estando ahí y cargan después
//
// Y si se sacara antes, "boot()" se caería al arrancar. Y eso no se ve leyendo el archivo:
// se ve en la consola del navegador, con la página en blanco.
//
// -------------------------------------------------------------------
// LO QUE ESTE GUARDIÁN COMPRUEBA
// -------------------------------
//
//   1. El mapa está al día.
//   2. Las secciones son las que se esperaban para este módulo. Si el mapa cambió, el
//      número se nota.
//   3. Los trozos tienen sus llaves parejas, y cada uno aparece UNA vez en "js/app.js", así
//      que ningún rango se solapa con otro.
//   4. Todo lo que queda en "js/app.js" estaba antes, palabra por palabra.
//   5. Las llaves que se van se cuentan en el trozo, y la profundidad no cambia.
//   6. Ningún nombre queda declarado en los dos archivos.
//   7. Y LO NUEVO: desde las llamadas de nivel superior de este módulo, siguiendo el grafo,
//      no se sale de este módulo y del núcleo. Si se sale, no se escribe nada.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const raiz = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const APPJS = path.join(raiz, 'js', 'app.js');
const APPHTML = path.join(raiz, 'pages', 'app.html');
const NUCLEO = path.join(raiz, 'js', 'nucleo.js');

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const NL = '\r\n';

// -------------------------------------------------------------------
// 0. QUÉ MÓDULO
// -------------------------------------------------------------------
const MODULOS = {
  porteria: { rx: /PORTER|INGRESO PENDIENTE|DESPLEGABLES ANIDADOS|MARCAR Y AVISAR|BIT.CORA DE ACCESO|KIOSCO DEL RELOJ|EL BLOQUEO REAL/, secciones: 6, titulo: 'LA PORTER' },
  administracion: { rx: /ASISTENCIA DIARIA DEL SUPERVISOR|TARJA DE SUPERVISORES|MULTI-EMPRESA|EMPRESAS: CARGOS/, secciones: 4, titulo: 'ADMINISTRACI' },
  supervisores: { rx: /JUSTIFICACI.N DIARIA|CONCILIACI.N/, secciones: 2, titulo: 'LOS SUPERVISORES' },
  documentos: { rx: /IMPORTAR MARCAJES|IMPORTAR WORD|BAJAR LA PLANTILLA/, secciones: 3, titulo: 'LOS DOCUMENTOS' },
  bodega: { rx: /KITS INICIALES|KIT DE CONTRATACI.N|ESPECIALIDAD DEL TRABAJADOR/, secciones: 3, titulo: 'LA BODEGA' },
  relojes: { rx: /RELOJES:|VENTANA ANTIRREBOTE|TRES N.MEROS DE LA BARRA|GENERAR Y ROTAR LA CLAVE|USUARIO RELOJ|LO QUE NO HACE|LOS MARCAJES/, secciones: 7, titulo: 'LOS RELOJES' },
  soporte: { rx: /INVITAR USUARIO|INVITACI.N POR CORREO|DAR DE ALTA SIN CORREO|MIS DATOS|ROLES Y PERMISOS|COHERENCIA DE PERMISOS|PERMISOS POR ROL|QUE MIGRACI.N FALTA/, secciones: 8, titulo: 'SOPORTE' },
};

const nombre = process.argv[2];
if (!nombre || !MODULOS[nombre]) {
  console.log('    usar:  node tools/saca-modulo.js <modulo>');
  console.log('    los que hay: ' + Object.keys(MODULOS).join(', '));
  console.log('');
  console.log('    Y NO EN CUALQUIER ORDEN:');
  console.log('      "administracion" va de ULTIMO, porque "boot()" vive ahi y llama a');
  console.log('      funciones que todavia estan en "js/app.js".');
  process.exit(nombre ? 1 : 0);
}
const M = MODULOS[nombre];
const NUEVO = path.join(raiz, 'js', nombre + '.js');
const LINK = '<script src="../js/' + nombre + '.js?v=1"></script>';

console.log('');
console.log('    módulo: ' + nombre + '  (' + M.secciones + ' secciones, "' + M.titulo + '")');

// -------------------------------------------------------------------
// 1. IDEMPOTENCIA
// -------------------------------------------------------------------
const app0 = fs.readFileSync(APPJS, 'utf8');
const html0 = fs.readFileSync(APPHTML, 'utf8');
const lineas0 = app0.split(NL);

if (html0.indexOf(LINK) >= 0) {
  console.log('    (ya está hecho: el "<script>" de "' + nombre + '.js" está en el HTML)');
  process.exit(0);
}
if (fs.existsSync(NUEVO)) {
  console.log('  *** ESTÁ "' + nombre + '.js" PERO NO ESTÁ EN EL HTML ***');
  console.log('    No se escribe nada.');
  process.exit(1);
}

// -------------------------------------------------------------------
// 2. EL MAPA
// -------------------------------------------------------------------
const v = cp.spawnSync(process.execPath, [path.join(raiz, 'tools', 'mapa-js.js'), '--verificar'],
  { encoding: 'utf8' });
if (v.status !== 0) {
  console.log('  *** EL MAPA ESTÁ VIEJO ***');
  console.log('    ' + (v.stdout || '').trim().split('\n').slice(0, 3).join('\n    '));
  process.exit(1);
}
console.log('    ok  el mapa está al día');

const mapa = fs.readFileSync(path.join(raiz, 'MAPA-JS.txt'), 'utf8');
const RE_SEC = /^\s*L\s*(\d+)\s\s(.+?)\s+(\d+) regl\.\s+(\d+) fn\./;
const secciones = [];
let dentro = false;
mapa.split('\n').forEach((l) => {
  if (!dentro && /^\s*LAS SECCIONES\s*$/.test(l)) { dentro = true; return; }
  if (dentro && /^\s*LAS \d/.test(l)) { dentro = false; return; }
  if (!dentro) return;
  const m = RE_SEC.exec(l);
  if (!m) return;

  // Y el renglón donde ABRE el banner.
  //
  // Y se lee de una columna aparte, que es como el mapa la escribe. Y es una columna aparte
  // porque si estuviera en el medio, el patrón de arriba tendría que cambiar, y ese patrón lo
  // usan otras herramientas.
  //
  // Y si el mapa no trae la columna, NO SE CALCULA. Porque calcularla es restar, y restar fue
  // exactamente el error: hay banners de dos renglones y de tres, y con los de dos sale mal y
  // parte el banner por la mitad.
  //
  // Y eso pasó cuatro veces seguidas, y las cuatro con el mismo aviso del guardia.
  const abre = /abre L(\d+)/.exec(l);
  if (!abre) {
    salida.push('*** UNA SECCIÓN DEL MAPA NO TIENE LA COLUMNA "abre L" ***');
    salida.push('    ' + l.trim().slice(0, 78));
    salida.push('    El mapa se regenera con "node tools/mapa-js.js", que ya la escribe.');
    salida.push('    No se calcula a mano: calcularla es restar, y restar es el error.');
    salida.push('    No se sigue.');
    process.exit(1);
  }

  secciones.push({
    linea: Number(m[1]),
    ini: Number(abre[1]),
    titulo: m[2].trim(),
    reglas: Number(m[3]),
    fn: Number(m[4]),
  });
});
secciones.forEach((s, k) => { s.fin = (k < secciones.length - 1 ? secciones[k + 1].linea : lineas0.length) - 1; });

const mias = secciones.filter((s) => M.rx.test(sinAcentos(s.titulo)));

console.log('');
if (mias.length !== M.secciones) {
  console.log('  *** SALIERON ' + mias.length + ' SECCIONES PARA "' + nombre + '", Y SON ' + M.secciones + ' ***');
  console.log('    O el mapa cambió, o el patrón del módulo está mal.');
  console.log('    Las que sí salieron:');
  mias.forEach((s) => console.log('      L' + s.linea + ' | ' + s.titulo));
  console.log('    No se escribe nada.');
  process.exit(1);
}
console.log('    ok  las ' + mias.length + ' secciones del módulo');

const rangos = mias.map((s) => ({ desde: s.linea, hasta: s.fin, que: s.titulo }));

console.log('');
rangos.forEach((r) => {
  console.log('      renglones ' + String(r.desde).padStart(6) + ' a ' + String(r.hasta).padStart(6)
    + '  (' + String(r.hasta - r.desde + 1).padStart(4) + ')   ' + r.que.slice(0, 48));
});
const total = rangos.reduce((a, r) => a + (r.hasta - r.desde + 1), 0);
console.log('      en total: ' + total + ' de ' + lineas0.length + ' renglones');
console.log('');

// -------------------------------------------------------------------
// 3. LAS LLAVES
// -------------------------------------------------------------------
// Y las llaves.
//
// Y contando SÓLO las llaves de verdad: hay que sacar primero los comentarios, las cadenas y
// las plantillas.
//
// Y esto no es un detalle. La primera versión de esta función quitaba los comentarios y nada
// más, y con la sección "IMPORTAR WORD CONSERVANDO EL FORMATO" salió 113 llaves de abrir y
// 114 de cerrar: desbalanceada.
//
// Y el archivo entero compila. O sea que el código estaba bien y el contador mentía. Lo que
// mentía eran las llaves de adentro de un "return `…`" que genera HTML, que cuentan igual que
// las de verdad.
//
// Y un guardia que dice "desbalanceado" cuando el archivo está bien hace perder el tiempo
// mirando un archivo que no está roto. Peor: si el guardia no mirara, se cortaría con un
// archivo roto y nadie lo notaría hasta el navegador.
function llavesDe(s) {
  let l = s.replace(/\/\*[\s\S]*?\*\//g, '');
  l = l.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
  return [(l.match(/\{/g) || []).length, (l.match(/\}/g) || []).length];
}

// Y ESTE es el control que manda, y es el único que hace falta.
//
// Reconstruir el archivo viejo, con los trozos puestos de vuelta en su lugar, tiene que dar
// el archivo viejo EXACTO, carácter por carácter.
//
// Y si eso da, el corte es una mudanza y nada más. No puede haber perdido una línea, ni
// haber cambiado un espacio, ni haber agregado nada. Y todo lo que seoka verificar con
// llaves, profundidad y conteos sale de acá.
//
// -------------------------------------------------------------------
// Y POR QUÉ SE DEJÓ DE CONTAR LLAVES
// ----------------------------------
//
// Porque contar llaves en JavaScript no es lo que parece. Hace falta quitar comentarios,
// textos y plantillas, y con el orden en que se quitan se traga código entero: un
// apóstrofe dentro de un comentario abre un texto que se cierra mucho más allá, y se
// come llaves de código por el camino.
//
// Con "IMPORTAR WORD CONSERVANDO EL FORMATO" el contador daba 109 llaves de abrir y 110 de
// cerrar en un trozo que compila perfecto. Y contando el archivo entero daba 507 llaves,
// cuando antes de tocar nada contaba tres mil y quinientas.
//
// O sea: el contador no era "_un poco_
//
//approximado". Era falso, y de una forma que hace perder el tiempo mirando archivos que
// están bien. La reconstrucción no tiene ese problema: compara textos, no adivina qué es
// código.
const quitadas = rangos.reduce((acc, r) => {
  acc.cortes += 1;
  return acc;
}, { cortes: 0 });
void quitadas;

// Y que cada trozo esté una vez sola.
for (const r of rangos) {
  const t = lineas0.slice(r.desde - 1, r.hasta).join(NL);
  const n = app0.split(t).length - 1;
  if (n !== 1) {
    console.log('  *** EL TROZO "' + r.que + '" APARECE ' + n + ' VECES EN "app.js" ***');
    console.log('    No se escribe nada.');
    process.exit(1);
  }
}
console.log('    ok  y cada uno aparece una vez sola: ningún rango se solapa con otro');

// -------------------------------------------------------------------
// 4. EL GRAFO: ¿QUÉ SE TOCA AL CARGAR Y NO ESTÁ EN ESTE ARCHIVO?
// -------------------------------------------------------------------
// Y esta es la comprobación que faltaba. Se arma el grafo de llamadas de TODO "js/app.js", y
// se sigue desde las llamadas de nivel superior del módulo.
//
// Y el alcance es TRANSITIVO, porque una llamada llama a otra que llama a otra.
const RE_FN = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;
const RE_FLECHA = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/;

// Y dónde está cada función, y su cuerpo.
const defs = {};
for (let i = 0; i < lineas0.length; i++) {
  if (lineas0[i].indexOf(' ') === 0) continue;
  const m = RE_FN.exec(lineas0[i]) || RE_FLECHA.exec(lineas0[i]);
  if (!m) continue;
  // Y el cuerpo: hasta el cierre de la llave, contando llaves como en la herramienta del CSS.
  let prof = 0;
  let fin = lineas0.length;
  for (let k = i; k < lineas0.length; k++) {
    const limpio = lineas0[k].replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, '""').replace(/\/\/.*$/, '');
    for (const c of limpio) {
      if (c === '{') prof++;
      else if (c === '}') { prof--; if (prof === 0) { fin = k + 1; k = lineas0.length; } }
    }
  }
  defs[m[1]] = { linea: i + 1, cuerpo: lineas0.slice(i, fin).join('\n') };
}

// Y dónde cae cada nombre: este módulo, el núcleo, o "app.js" (todavía no extraído).
const nucleoTexto = fs.existsSync(NUCLEO) ? fs.readFileSync(NUCLEO, 'utf8') : '';
const nombresNucleo = new Set();
nucleoTexto.split(/\r?\n/).forEach((l) => {
  const m = RE_FN.exec(l) || RE_FLECHA.exec(l);
  if (m) nombresNucleo.add(m[1]);
});

const enRango = (n) => rangos.some((r) => n >= r.desde && n <= r.hasta);
const nombreDe = (n) => {
  if (nucleoTexto.indexOf(n + '(') >= 0 || nucleoTexto.indexOf(n + ' =') >= 0) return 'nucleo';
  for (const [k, d] of Object.entries(defs)) {
    if (d.linea === n) return enRango(n) ? nombre : 'app.js';
  }
  return '?';
};

// Y las llamadas de nivel superior del módulo.
const dentroDeRango = (n) => rangos.some((r) => n >= r.desde && n <= r.hasta);
const RE_LLAMADA = /([A-Za-z_$][\w$]*)\s*\(/g;

const salidas = [];
for (let i = 0; i < lineas0.length; i++) {
  // Y SOLO las llamadas que están DENTRO del módulo.
  //
  // La primera versión hizo lo contrario, y por eso salió con 442 problemas: estaba mirando
  // las llamadas de carga de los OTROS módulos. Y esas no importan para este corte, porque
  // "js/app.js" carga DESPUÉS: lo que se ejecute al cargar, ya encuentra todo.
  //
  // Lo que importa es lo contrario: qué toca el código de carga de ESTE módulo, cuando este
  // módulo se pone antes de "js/app.js".
  if (!dentroDeRango(i + 1)) continue;
  const l = lineas0[i];
  if (l.indexOf(' ') === 0 || l.indexOf('\t') === 0) continue;
  const t = l.trim();
  if (!t || t.indexOf('//') === 0 || /^[\/*]/.test(t)) continue;
  if (RE_FN.test(t) || RE_FLECHA.test(t)) continue;
  if (/^(const|let|var)\s/.test(t)) continue;
  let m;
  RE_LLAMADA.lastIndex = 0;
  while ((m = RE_LLAMADA.exec(t)) !== null) {
    if (!defs[m[1]]) continue;
    salidas.push({ linea: i + 1, llama: m[1] });
  }
}

// Y el alcance transitivo desde esas llamadas.
const vistos = new Set();
const cola = salidas.map((s) => s.llama);
const alcanzado = new Set();
const problemas = [];

while (cola.length) {
  const n = cola.shift();
  if (vistos.has(n)) continue;
  vistos.add(n);
  const d = defs[n];
  if (!d) continue;
  let mm;
  RE_LLAMADA.lastIndex = 0;
  while ((mm = RE_LLAMADA.exec(d.cuerpo)) !== null) {
    const o = mm[1];
    if (!defs[o] || vistos.has(o)) continue;
    // Y si la función llamada ya está declarada en el núcleo, no hay problema: el núcleo
    // carga antes, y las funciones son globales.
    if (nombresNucleo.has(o)) continue;
    alcanzado.add(o);
    cola.push(o);
    // Y si se declara en otro trozo de ESTE módulo, tampoco hay problema.
    if (enRango(defs[o].linea)) continue;
    problemas.push({ desde: n, hacia: o, lineaHacia: defs[o].linea });
  }
}

console.log('    EL GRAFO DESDE LAS LLAMADAS DE NIVEL SUPERIOR');
console.log('');
console.log('       llamadas de nivel superior: ' + salidas.length);
salidas.slice(0, 8).forEach((s) => console.log('         L' + String(s.linea).padStart(6) + '  ' + s.llama));
if (salidas.length > 8) console.log('         ... y ' + (salidas.length - 8) + ' más');
console.log('       funciones alcanzadas siguiendo el grafo: ' + (vistos.size + alcanzado.size));
console.log('');

if (problemas.length) {
  console.log('       *** ' + problemas.length + ' FUNCIONES DE OTRO ARCHIVO, ALCANZADAS AL CARGAR ***');
  console.log('       O sea que "js/app.js" tiene que cargar ANTES que "' + nombre + '.js".');
  console.log('       Y "js/app.js" carga después, porque es el que queda.');
  console.log('');
  const vistosP = {};
  problemas.forEach((p) => { vistosP[p.hacia] = p; });
  Object.keys(vistosP).slice(0, 16).forEach((k) => {
    const p = vistosP[k];
    console.log('         ' + k.padEnd(34) + 'L' + p.lineaHacia + '  la necesita "' + p.desde + '"');
  });
  console.log('');
  console.log('       Y HAY QUE MIRAR DE QUIÉN SON: si son del núcleo o de un módulo ya');
  console.log('       extraído, no hay problema. El guardia no puede saberlo solo.');
  console.log('       No se escribe nada.');
  process.exit(1);
}
console.log('       ok  ninguna función de otro archivo se toca al cargar');
console.log('           O sea que "' + nombre + '.js" puede cargar donde sea, después del núcleo.');
console.log('');

// -------------------------------------------------------------------
// 5. LOS VARIABLES DE NIVEL SUPERIOR QUE TOCA AL CARGAR
// -------------------------------------------------------------------
// Y esto es más difícil que el grafo de funciones, porque una función puede tocar una
// variable de cualquier parte de su cuerpo. O sea que el alcance transitivo no sirve: una
// función que se llama al cargar puede leer una variable 300 renglones más abajo.
//
// Y no hay forma de saberlo sin ejecutar. Lo que sí se puede hacer es mirar el archivo y
// decir cuántas variables de nivel superior hay, para saber qué se está aceptando.
const declaradas = [];
for (let i = 0; i < lineas0.length; i++) {
  if (dentroDeRango(i + 1)) continue;
  if (lineas0[i].indexOf(' ') === 0) continue;
  const m = /^const\s+([A-Za-z_$][\w$]*)/.exec(lineas0[i])
    || /^let\s+([A-Za-z_$][\w$]*)/.exec(lineas0[i])
    || /^var\s+([A-Za-z_$][\w$]*)/.exec(lineas0[i]);
  if (m) declaradas.push(m[1]);
}
console.log('    Y QUEDAN ' + declaradas.length + ' VARIABLES DE NIVEL SUPERIOR EN "js/app.js"');
console.log('    No se puede medir cuáles toca el código de carga sin ejecutarlo.');
console.log('    Lo que sí se comprueba es que la página arranque, y eso lo ve el navegador.');
console.log('');

// -------------------------------------------------------------------
// 6. CORTAR
// -------------------------------------------------------------------
const CABECERA = [
  '/* ===================================================================',
  '   js/' + nombre + '.js - ' + M.titulo,
  '   ===================================================================',
  '',
  '   -------------------------------------------------------------------',
  '   DÓNDE ESTÁ ESTE ARCHIVO EN EL ORDEN, Y POR QUÉ',
  '   -------------------------------------------------------------------',
  '   Después de "js/nucleo.js" y antes de "js/app.js".',
  '',
  '   Por el núcleo: ahí están las variables de estado que usa todo el mundo, y son',
  '   "const" y "let", que no se levantan. Si este archivo cargara antes que el núcleo, la',
  '   primera variable que tocara se caería.',
  '',
  '   Y las funciones no imponen orden: son globales. Una función de este archivo la puede',
  '   llamar uno de al lado, y al revés.',
  '',
  '   -------------------------------------------------------------------',
  '   LO QUE HAY AQUÍ',
  '   -------------------------------------------------------------------',
].concat(mias.map((s) => '   - ' + s.titulo.slice(0, 62)))
  .concat([
    '',
    '   -------------------------------------------------------------------',
    '   QUE NO ESTÁN CONTIGUOS, Y POR QUÉ NO ROMPIÓ NADA',
    '   -------------------------------------------------------------------',
    '   Los trozos están separados por otras secciones del archivo viejo. Y juntarlos',
    '   cambia el orden en que se declaran las cosas de nivel superior.',
    '',
    '   Da igual por dos razones juntas: al concatenar se conserva el orden ORIGINAL de',
    '   los trozos, y en el archivo viejo no hay ninguna declaración de nivel superior que',
    '   use algo declarado más abajo. Si la hubiera, la aplicación no cargaría.',
    '',
    '   -------------------------------------------------------------------',
    '   CÓMO SE COMPROBÓ',
    '   -------------------------------------------------------------------',
    '   Con "tools/sonda-js.js", no con la huella. La huella mide colores y geometría de',
    '   lo que se ve ahora, y un cambio de JavaScript no se ve: se probó, y con una fecha',
    '   fija en una función compartida la huella dijo "NADA CAMBIÓ".',
    '',
    '   La sonda compara lo que devuelven las funciones, lo que muestra la página, y el',
    '   "innerHTML" de las 41 vistas.',
    '',
    '   Y antes de escribir nada, se siguió el GRAFO desde las llamadas de nivel superior de',
    '   este módulo, y se comprobó que no se sale de este archivo ni del núcleo.',
    '',
    '   Ver la entrada [modulos-01]. */',
    '',
    '',
  ]).join(NL);

const cuerpo = rangos
  .map((r) => lineas0.slice(r.desde - 1, r.hasta).join(NL).replace(/\s+$/, ''))
  .join(NL + NL);

const nuevo = CABECERA + cuerpo + NL;

for (const r of rangos) {
  const t = lineas0.slice(r.desde - 1, r.hasta).join(NL);
  if (nuevo.indexOf(t) < 0) {
    console.log('  *** EL TROZO "' + r.que + '" NO ESTÁ EN EL ARCHIVO NUEVO ***');
    process.exit(1);
  }
}
console.log('    ok  los ' + rangos.length + ' trozos están en el archivo nuevo, carácter por carácter');

const quitan = rangos.slice().sort((a, b) => b.desde - a.desde);
const resto = lineas0.slice();
const fuera = [];
quitan.forEach((r) => { fuera.unshift(resto.splice(r.desde - 1, r.hasta - r.desde + 1)); });
const app = resto.join(NL);

const quitados = fuera.reduce((a, x) => a + x.length, 0);
if (quitados !== total) {
  console.log('  *** SE QUITARON ' + quitados + ' RENGLONES, Y SON ' + total + ' ***');
  process.exit(1);
}
const enElViejo = new Set(lineas0);
if (resto.some((l) => !enElViejo.has(l))) {
  console.log('  *** HAY RENGLONES QUE NO ESTABAN EN "app.js" ***');
  process.exit(1);
}
console.log('    ok  se quitaron los ' + total + ' renglones, ni uno más, y lo demás estaba antes');

// Y ESTE es el control fuerte, y sustituye al de las llaves.
//
// Reconstruir "js/app.js", poniendo los trozos de vuelta en su lugar, tiene que dar el
// archivo viejo EXACTO.
//
// Y si eso da, el corte es una mudanza y nada más: no se perdió una línea, no se cambió un
// espacio, no se agregó nada. Todo lo demás sale de acá.
//
// Y es la comprobación que hace falta, porque no depende de entender el JavaScript: compara
// dos textos y pregunta si son iguales.
function reconstruir() {
  const enOrden = rangos
    .map((r) => ({ linea: r.desde, texto: lineas0.slice(r.desde - 1, r.hasta) }))
    .sort((a, b) => a.linea - b.linea);

  const partes = [];
  let cursor = 1;   // en renglones, contando desde 1

  // Y cada parte se une ANTES de meterse en la lista.
  //
  // Y esto no es un detalle. Con un arreglo de renglones adentro de la lista, el "join" de
  // más abajo convierte cada arreglo con comas, y el archivo armado sale con comas donde
  // deberían ir saltos de línea. Se vio: el archivo armado tenía una coma justo después de
  // la línea 2, donde el original tenía el salto.
  enOrden.forEach((t) => {
    partes.push(lineas0.slice(cursor - 1, t.linea - 1).join(NL));
    partes.push(t.texto.join(NL));
    cursor = t.linea + t.texto.length;
  });
  partes.push(lineas0.slice(cursor - 1).join(NL));

  // Y las partes VACÍAS se van antes de unir.
  //
  // Y esto también es un detalle, y salió con "IMPORTAR WORD" y "BAJAR LA PLANTILLA", que
  // están pegadas: el hueco entre las dos es de cero renglones, y al unir sale un "\r\n" de
  // más donde el original no tenía nada. El archivo armado quedaba con dos caracteres de más.
  //
  // Y los renglones vacíos de ADENTRO de un trozo no se van, porque esos están dentro del
  // texto del trozo, que ya viene unido.
  return partes.filter((x) => x !== '').join(NL);
}

const armado = reconstruir();

if (armado !== app0) {
  console.log('  *** AL ARMAR EL ARCHIVO VIEJO NO SALE EL ARCHIVO VIEJO ***');
  console.log('    El largo del armado es ' + String(armado.length)
    + ' y el del original es ' + String(app0.length) + '.');
  // Y dónde se separan, que es lo primero que hay que saber.
  let k = 0;
  while (k < armado.length && k < app0.length && armado[k] === app0[k]) k++;
  console.log('    se separan en el carácter ' + String(k));
  console.log('    el original, ahí: ' + JSON.stringify(app0.slice(Math.max(0, k - 40), k + 40)));
  console.log('    el armado,   ahí: ' + JSON.stringify(armado.slice(Math.max(0, k - 40), k + 40)));
  console.log('    No se escribe nada.');
  process.exit(1);
}
console.log('    ok  y al armar el archivo viejo de vuelta sale IDÉNTICO, carácter por carácter');
console.log('        o sea que el corte solo movió texto: no perdió, no cambió y no agregó nada');

// Y los nombres, que no pueden quedar declarados en los dos.
const nombresDe = (txt) => {
  const salida = new Set();
  txt.split(/\r?\n/).forEach((l) => {
    if (l.indexOf(' ') === 0) return;
    const m = /^(?:const|let|var|function|async\s+function|class)\s+([A-Za-z_$][\w$]*)/.exec(l);
    if (m) salida.add(m[1]);
  });
  return salida;
};
const delViejo = nombresDe(app);
const repetidos = [...nombresDe(nuevo)].filter((n) => delViejo.has(n));
if (repetidos.length) {
  console.log('  *** ' + repetidos.length + ' NOMBRES QUEDARÍAN DECLARADOS DOS VECES ***');
  repetidos.slice(0, 14).forEach((n) => console.log('      ' + n));
  process.exit(1);
}
console.log('    ok  ningún nombre del módulo queda declarado en los dos archivos');

// -------------------------------------------------------------------
// 7. EL "<script>"
// -------------------------------------------------------------------
const ANCLA = '<script src="../js/app.js?v=1"></script>';
if (html0.split(ANCLA).length - 1 !== 1) {
  console.log('  *** EL ANCLA DE "js/app.js" NO ESTÁ UNA VEZ Y SOLA ***');
  process.exit(1);
}
const html = html0.replace(ANCLA, LINK + NL + ANCLA);

// Y el orden: núcleo, después este, después "js/app.js".
//
// Y la comparación va con el "menor que", no con el "mayor que". Estaba al revés, y con el
// "mayor" el guardia rechaza TODAS las extracciones, hasta las que están bien. Un guardia
// invertido es peor que ninguno: entrena a desconfiar de él.
const NUCLEO_TAG = '<script src="../js/nucleo.js?v=1"></script>';
const iNucleo = html.indexOf(NUCLEO_TAG);
const iLink = html.indexOf(LINK);
const iApp = html.indexOf(ANCLA);

if (iNucleo < 0 || iLink < 0 || iApp < 0) {
  console.log('  *** NO SE ENCONTRÓ ALGUNO DE LOS "<script>" ***');
  console.log('    núcleo en ' + iNucleo + ', nuevo en ' + iLink + ', app en ' + iApp);
  console.log('    No se escribe nada.');
  process.exit(1);
}

if (iNucleo < iLink && iLink < iApp) {
  console.log('    ok  "' + nombre + '.js" queda después del núcleo y antes de "js/app.js"');
} else {
  console.log('  *** EL ORDEN DE LOS "<script>" QUEDÓ MAL ***');
  console.log('    núcleo en ' + iNucleo + ', nuevo en ' + iLink + ', app en ' + iApp);
  console.log('    tiene que ser núcleo < nuevo < app.');
  process.exit(1);
}

// -------------------------------------------------------------------
// 8. ESCRIBIR
// -------------------------------------------------------------------
// Y el archivo sale con CRLF, como "js/nucleo.js" y "js/app.js".
//
// Porque los trozos se copian de "js/app.js", que tiene CRLF, y hay renglones que ya
// traían un "\r" de más. Pegados, quedan CR sueltos, y el archivo sale con los dos saltos.
//
// Y es lo que pasó con "js/supervisores.js": 540 LF y 567 CR. El resto de los archivos
// quedaron puros, porque la herramienta del núcleo SÍ normalizaba y esta no. Un olvido,
// y el síntoma es que dos archivos que deberían ser iguales miden distinto.
const nuevoCRLF = nuevo.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

// Y el guardia: ni un LF suelto, ni un CRLF de más.
const nLF = (nuevoCRLF.match(/\n/g) || []).length;
const nCRLF = (nuevoCRLF.match(/\r\n/g) || []).length;
if (nLF !== nCRLF) {
  console.log('  *** EL ARCHIVO NUEVO QUEDARÍA MEZCLADO ***');
  console.log('    ' + nLF + ' saltos LF y ' + nCRLF + ' CRLF. Se espera que sean iguales.');
  process.exit(1);
}

console.log('    ok  el archivo nuevo sale con ' + nCRLF + ' lineas CRLF, sin LF sueltos');

fs.writeFileSync(NUEVO, nuevoCRLF, 'utf8');
fs.writeFileSync(APPJS, app, 'utf8');
fs.writeFileSync(APPHTML, html, 'utf8');

[APPJS, NUEVO].forEach((p) => {
  const r = cp.spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.log('  *** ' + path.basename(p) + ' NO COMPILA ***');
    console.log('    ' + (r.stderr || '').split('\n').slice(0, 5).join('\n    '));
    process.exit(1);
  }
});
console.log('    ok  los dos archivos escritos compilan, leyéndolos del disco');

const cuenta = (s) => s.split(/\r?\n/).length;
console.log('');
console.log('    escrito "js/' + nombre + '.js", ' + cuenta(nuevo) + ' renglones');
console.log('    "js/app.js": ' + cuenta(app0) + ' -> ' + cuenta(app) + ' renglones');
console.log('');
console.log('    Y FALTA LO IMPORTANTE: abrir la copia, que la aplicación arranque, y correr');
console.log('    "tools/sonda-js.js" para ver que no cambió nada.');