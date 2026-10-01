// LA PALETA POR GRUPO DE MENÚ, A SU PROPIO ARCHIVO
// ====================================================
//
// -------------------------------------------------------------------
// QUÉ SE MUEVE, Y CUÁNTO
// ----------------------
//
// Del "styles.css" salen 21 bloques de paleta, que son 7 grupos de menú por 3 temas:
//
//   [data-group="porteria"] { --fondo-seccion: …; --cat: …; --cat-claro: … }
//   :root:not([data-theme="light"]) [data-group="porteria"] { …cinco variables… }
//   :root[data-theme="dark"]           [data-group="porteria"] { …cinco variables… }
//
// Y sale UN duplicado: "[data-group=\"soporte\"]" está dos veces en el bloque del tema claro,
// con los mismos tres valores. La segunda no hace nada.
//
// -------------------------------------------------------------------
// Y POR QUÉ ES EL MISMO PATRÓN DE TRES BLOQUES DE "_tokens.css"
// ---------------------------------------------------
//
// Porque la paleta global ya usa tres bloques: ":root" a secas, ":root:not([data-theme=light])"
// para el sistema en oscuro, y ":root[data-theme=dark]" para el botón del encabezado.
//
// Y la paleta por grupo usa los mismos tres. Mismo criterio, mismo orden, misma razón.
//
// -------------------------------------------------------------------
// Y POR QUÉ EL TEMA CLARO TIENE MENOS VARIABLES, Y NO ES UN OLVIDO
// ----------------------------------------------------------
//
// Porque en el tema claro, los bloques solo declaran "--fondo-seccion". Y los otros dos, "--fondo-nav"
// y "--fondo-subnav", NO existen en el claro.
//
// Y eso es lo que hace que funcione: las reglas que las usan tienen una cadena de respaldo.
//
//     #mainNav  background: var(--fondo-nav,    var(--fondo-seccion, #101a14))
//     #subNav   background: var(--fondo-subnav, var(--panel))
//
// O sea: en tema claro, las DOS barras usan el mismo "--fondo-seccion" que el encabezado, y el
// submenú usa "--panel". En tema oscuro hay tres colores distintos.
//
// Y por eso hay que dejarlo EXACTAMENTE como está. Si alguien "completa" el bloque del tema claro
// con "--fondo-nav", cambia el tema claro entero, y no se va a enterar.
//
// -------------------------------------------------------------------
// Y DÓNDE SE ENLAZA, Y POR QUÉ AHÍ
// ------------------------------
//
// Después de "_tokens.css" y antes de "styles.css".
//
// Porque "[data-group=\"x\"]" tiene especificidad (0,1,0), igual que ":root". Y en empate gana el
// que se cargó después. Si esta hoja se enlazara antes de "_tokens.css", y "_tokens.css" llegara a
// definir alguno de estos nombres, perderían.
//
// Hoy "_tokens.css" NO define "--fondo-seccion" ni "--fondo-nav" ni "--fondo-subnav", así que no
// hay empate. Pero el orden se deja como tiene que ser por si mañana los agrega.
//
// -------------------------------------------------------------------
// Y LOS GUARDIANES
// ----------------
//
//  1. Que el CSS del archivo nuevo sea IDÉNTICO a lo que se saca. Carácter por carácter.
//  2. Que las llaves queden cuadradas, y con la misma cantidad de pares.
//  3. Que el "<link>" quede DESPUÉS de "_tokens.css" y ANTES de "styles.css".
//  4. Que no quede ningún bloque "[data-group=…]" dentro de "styles.css".
//  5. Y que el duplicado no se lleve por delante nada: es el MISMO bloque, con los mismos valores.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const STYLES = path.join(raiz, 'css', 'styles.css');
const APP = path.join(raiz, 'pages', 'app.html');
const NUEVO = path.join(raiz, 'css', '_grupos.css');

const LINK = '<link rel="stylesheet" href="../css/_grupos.css?v=1">';

// -------------------------------------------------------------------
// 0. IDEMPOTENCIA
// -------------------------------------------------------------------
const styles0 = fs.readFileSync(STYLES, 'utf8');
const app0 = fs.readFileSync(APP, 'utf8');

if (app0.indexOf(LINK) >= 0 && styles0.indexOf('[data-group=') < 0) {
  console.log('    (ya está hecho)');
  process.exit(0);
}
if (app0.indexOf(LINK) >= 0) {
  console.log('  *** ESTÁ EL "<link>" PERO "styles.css" TODAVÍA TIENE LOS BLOQUES ***');
  console.log('    Habría dos fuentes de verdad. No se escribe nada.');
  process.exit(1);
}

// -------------------------------------------------------------------
// 1. LEER LAS REGLAS DE PRIMER NIVEL
// -------------------------------------------------------------------
function reglas(texto) {
  const out = [];
  let i = 0;
  let enComentario = false;
  let sel = '';
  // Y DOS posiciones, porque son dos cosas distintas y confundirlas rompe el corte:
  //
  //   "iniLlave" es dónde está la "{". El CUERPO va de ahí para acá.
  //   "ini"      es dónde empieza el SELECTOR. El RANGO que se saca va de ahí.
  //
  // Con una sola, el rango empieza en la llave y deja el selector colgado.
  let ini = -1;
  let iniLlave = -1;
  let prof = 0;
  while (i < texto.length) {
    const dos = texto.substr(i, 2);
    if (enComentario) {
      if (dos === '*/') { enComentario = false; i += 2; continue; }
      i++; continue;
    }
    if (dos === '/*') { enComentario = true; i += 2; continue; }
    const c = texto[i];
    if (c === '{') {
      if (prof === 0) sel = sel.trim();
      prof++;
      // Y la llave se guarda APARTE. El rango empieza en el selector, no acá.
      if (prof === 1 && iniLlave < 0) iniLlave = i;
      if (prof === 1 && ini < 0) ini = i;
      i++; continue;
    }
    if (c === '}') {
      prof--;
      if (prof === 0) {
        out.push({
          sel,
          ini,
          iniLlave,
          fin: i + 1,
          // Y el cuerpo desde la LLAVE. No desde el selector.
          cuerpo: texto.slice(iniLlave + 1, i),
        });
        sel = '';
        ini = -1;
        iniLlave = -1;
      }
      i++; continue;
    }
    if (prof === 0) {
      // Y el rango arranca en el primer carácter que NO es blanco.
      //
      // Porque si arrancara en el primer blanco, cada corte se comería un renglón de
      // más, y al final de 36 cortes se pierde media encabezado del archivo.
      if (c.trim() !== '' && ini < 0) ini = i;
      sel += c;
    }
    i++;
  }
  // Y la profundidad a la que terminó, pegada al arreglo.
  //
  // Porque si queda una llave de menos, el conteo dice que todo esta cuadrado, y el texto
  // que viene despues quedo metido adentro de una regla que no se cierra. Las dos
  // preguntas hacen falta, y contestan cosas distintas.
  out.prof = prof;
  return out;
}

const RS = reglas(styles0);

// Los bloques de paleta: los que SOLO declaran estas variables y nada más.
//
// Y "solo declaran estas" hay que comprobarlo, no suponerlo: un bloque que además ponga un
// "background" no es un bloque de paleta, y moverlo cambia un color.
const DE_LA_PALETA = ['--fondo-seccion', '--fondo-nav', '--fondo-subnav', '--cat', '--cat-claro'];

function propsDe(cuerpo) {
  const limpio = cuerpo.replace(/\/\*[\s\S]*?\*\//g, '');
  const props = [];
  limpio.split(';').forEach((d) => {
    const p = d.indexOf(':');
    if (p >= 0) props.push(d.slice(0, p).trim().toLowerCase());
  });
  return props;
}

// Si un "@media" es todo de paleta.
//
// Y hay tres respuestas, no dos: que lo sea entero, que no tenga nada de paleta, o que sea
// mixto. El mixto es el que hay que detectar, porque con los otros dos se puede decidir solo.
function medioDePaleta(r) {
  if (r.sel.indexOf('@media') !== 0) return 'no-es-medio';
  const dentro = r.cuerpo;
  const rs = reglas(dentro);
  if (!rs.length) return 'vacio';

  let dePaleta = 0;
  let dePaletaConGrupo = 0;
  rs.forEach((x) => {
    if (x.sel.indexOf('[data-group=') < 0) return;
    const props = propsDe(x.cuerpo);
    if (!props.length) return;
    if (!props.every((p) => DE_LA_PALETA.indexOf(p) >= 0)) return;
    dePaleta++;
    dePaletaConGrupo++;
  });

  if (dePaleta === 0) return 'sin-paleta';

  // Y el "@media" no se mueve entero si DENTRO hay algo que no es de paleta.
  //
  // Porque si se saca el "@media" entero, se va también lo otro.
  if (dePaleta !== rs.length) return 'mixto';
  return { reglas: rs.length, conGrupo: dePaletaConGrupo };
}

// Y los "@media" que se mueven, y los que no, con el motivo.
const medios = [];
const mediosQueNo = [];
RS.forEach((r) => {
  const q = medioDePaleta(r);
  if (q === 'no-es-medio') return;
  if (q === 'vacio' || q === 'sin-paleta') return;
  if (q === 'mixto') { mediosQueNo.push(r); return; }
  medios.push(r);
});
const bloques = RS.filter((r) => {
  const s = r.sel.replace(/\s+/g, ' ');
  if (s.indexOf('[data-group=') < 0) return false;
  const props = propsDe(r.cuerpo);
  if (!props.length) return false;
  return props.every((p) => DE_LA_PALETA.indexOf(p) >= 0);
});

if (bloques.length === 0) {
  console.log('    (no hay bloques de paleta: ya se movieron)');
  process.exit(0);
}

// Y un "@media" con una regla de paleta y otra que NO, se frena todo.
//
// Porque moverlo entero se lleva la regla que no era de paleta, y mover solo la de paleta
// deja las reglas partidas en dos archivos. Las dos cosas están malas, y la segunda es peor,
// porque el archivo queda contando una historia que ya no es verdad.
if (mediosQueNo.length) {
  console.log('  *** HAY ' + mediosQueNo.length + ' "@media" MIXTOS ***');
  mediosQueNo.forEach((r) => console.log('    L' + lineaDe(styles0, r.ini) + ': ' + r.sel.slice(0, 60)));
  console.log('    Tienen reglas de paleta y reglas que no lo son.');
  console.log('    Hay que partir el "@media" a mano antes de seguir. No se escribe nada.');
  process.exit(1);
}

// Y el número de renglón de un punto del texto.
function lineaDe(texto, pos) {
  return texto.slice(0, pos).split(texto.indexOf('\r\n') >= 0 ? '\r\n' : '\n').length;
}

console.log('    "@media" de paleta que se van enteros: ' + medios.length);
medios.forEach((r) => console.log('        L' + lineaDe(styles0, r.ini) + ': ' + r.sel.slice(0, 56) + '   con ' + (r.cuerpo.match(/\{/g) || []).length + ' reglas'));
console.log('    bloques de paleta en "styles.css": ' + bloques.length);

// Y los que NO son de paleta pero tienen "[data-group=…]", que se quedan donde están.
const otros = RS.filter((r) => r.sel.replace(/\s+/g, ' ').indexOf('[data-group=') >= 0)
  .filter((r) => bloques.indexOf(r) < 0);
console.log('    bloques con "[data-group=…]" que NO son de paleta, y se quedan: ' + otros.length);
otros.forEach((r) => console.log('        ' + r.sel.replace(/\s+/g, ' ').slice(0, 66)));

// -------------------------------------------------------------------
// 2. EL DUPLICADO
// -------------------------------------------------------------------
// Y entre los de paleta, dos que dicen LO MISMO. Uno se va con el resto, y el otro se borra:
// está escrito dos veces en el mismo archivo, con los mismos valores, y la segunda no hace nada.
const firma = (r) => r.sel.replace(/\s+/g, ' ') + ' {' + r.cuerpo.replace(/\s+/g, ' ').trim() + '}';

const porFirma = {};
bloques.forEach((r) => {
  const k = firma(r);
  if (!porFirma[k]) porFirma[k] = [];
  porFirma[k].push(r);
});

const repetidos = Object.keys(porFirma).filter((k) => porFirma[k].length > 1);
let aBorrar = [];
repetidos.forEach((k) => {
  const xs = porFirma[k];
  // Se queda el PRIMERO, y los demás se borran. El primero porque es el que está en el bloque
  // de la paleta del tema, y el duplicado está suelto más abajo.
  aBorrar = aBorrar.concat(xs.slice(1));
  console.log('    DUPLICADO: ' + xs[0].sel.replace(/\s+/g, ' ').slice(0, 46)
    + '  aparece ' + xs.length + ' veces; se borra la de la línea '
    + styles0.slice(0, xs[1].ini).split(nlDe(styles0)).length);
});

function nlDe(t) { return t.indexOf('\r\n') >= 0 ? '\r\n' : '\n'; }

// Y lo que se mueve son UNIDADES: las hojas sueltas, y los "@media" de paleta completos.
//
// Y van en el orden en que están en el archivo, porque se pisan entre ellas.
const unidades = medios.concat(bloques).sort((a, b) => a.ini - b.ini);
const aMover = unidades.filter((r) => aBorrar.indexOf(r) < 0);
console.log('    a mover: ' + aMover.length + ', a borrar por duplicado: ' + aBorrar.length);
console.log('');

// -------------------------------------------------------------------
// 3. EL ARCHIVO NUEVO
// -------------------------------------------------------------------
// Con los bloques TAL CUAL, en el orden en que están. Y arriba, lo que hay que saber.
const CABECERA = [
  '/* ===================================================================',
  '   css/_grupos.css - LA PALETA POR GRUPO DE MENÚ',
  '   ===================================================================',
  '',
  '   Los siete colores del menú: portería, administración, bodega,',
  '   supervisores, soporte, prevención y asistente social.',
  '',
  '   -------------------------------------------------------------------',
  '   POR QUÉ ESTÁN EN SU PROPIO ARCHIVO, Y NO EN "styles.css"',
  '   -------------------------------------------------------------------',
  '   Porque son la paleta, y la paleta vive en "_tokens.css". Estos son los',
  '   mismos colores que "--menu-boton" y "--cat", pero por grupo de menú, y',
  '  olean al lado de ellos.',
  '',
  '   Se enlaza DESPUÉS de "_tokens.css" y ANTES de "styles.css". Porque',
  '   "[data-group=\"x\"]" tiene especificidad (0,1,0), igual que ":root". Y en empate gana el',
  '   que se cargó después.',
  '',
  '   -------------------------------------------------------------------',
  '   LOS TRES BLOQUES, Y POR QUÉ EL CLARO TIENE MENOS',
  '   -------------------------------------------------------------------',
  '   Los mismos tres que la paleta global: el de ":root" a secas, el del sistema',
  '   en oscuro, y el de "data-theme=dark".',
  '',
  '   Y el del tema claro declara SOLO "--fondo-seccion". Le faltan',
  '   "--fondo-nav" y "--fondo-subnav", y NO ES UN OLVIDO:',
  '',
  '     #mainNav   background: var(--fondo-nav,    var(--fondo-seccion, #101a14))',
  '     #subNav    background: var(--fondo-subnav, var(--panel))',
  '',
  '   En tema claro, las dos barras usan el mismo color que el encabezado, y el',
  '   submenú usa "--panel". En tema oscuro hay tres colores distintos.',
  '',
  '   -------------------------------------------------------------------',
  '   Y SI SE COMPLETA EL BLOQUE DEL CLARO, SE CAMBIA EL TEMA CLARO ENTERO',
  '   -------------------------------------------------------------------',
  '   Con "--fondo-nav" agregado, la barra del menú dejaría de seguir al',
  '   encabezado. Y el submenú dejaría de ser claro.',
  '',
  '   Es tentador porque "falta una variable" se lee como un error. No lo es.',
  '',
  '   -------------------------------------------------------------------',
  '   DE DÓNDE VIENE EL "data-group"',
  '   -------------------------------------------------------------------',
  '   De "tituloDeLaSeccion" en "js/app.js": lo pone en el "<body>", en el',
  '   "<h1>" del encabezado, y en "#subNav". El "<body>" para que exista en toda',
  '   la página y las barras la hereden; el "#subNav" para que tome el color de',
  '   la sección por la misma regla.',
  '',
  '   Ver la entrada [grupos-01]. */',
  '',
  '',
].join('\n');

// El texto de los bloques, en el orden del archivo, sin los duplicados.
function textoDe(lista) {
  return lista
    .slice()
    .sort((a, b) => a.ini - b.ini)
    .map((r) => styles0.slice(r.ini, r.fin).trim())
    .join('\n\n');
}

const cssNuevo = CABECERA + textoDe(aMover) + '\n';

// Y el archivo nuevo lleva los que SE MUEVEN. El duplicado no va: se borra.
const CSS_A_MOVER = textoDe(aMover);
if (cssNuevo.indexOf(CSS_A_MOVER) < 0) {
  console.log('  *** EL ARCHIVO NUEVO NO CONTIENE LO QUE SE VA A SACAR ***');
  console.log('    No se escribe nada.');
  process.exit(1);
}
console.log('    ok  el archivo nuevo contiene, carácter por carácter, lo que se saca');

// -------------------------------------------------------------------
// 4. SACAR DE "styles.css", DE ATRÁS HACIA ADELANTE
// -------------------------------------------------------------------
// Y de atrás hacia adelante, porque cada corte acorta el texto y desplaza los siguientes.
// Eso ya costó seis llaves de cerrar de más una vez.
const NL = nlDe(styles0);
let styles = styles0;

const aQuitar = unidades.slice().sort((a, b) => b.ini - a.ini);

// Y que cada rango tenga sus llaves parejas ANTES de cortar.
const descuadrados = aQuitar.filter((r) => {
  const trozo = styles0.slice(r.ini, r.fin);
  return (trozo.match(/\{/g) || []).length !== (trozo.match(/\}/g) || []).length;
});
if (descuadrados.length) {
  console.log('  *** ' + descuadrados.length + ' RANGOS DESCUADRADOS ***');
  console.log('    No se escribe nada.');
  process.exit(1);
}
console.log('    ok  los ' + aQuitar.length + ' rangos tienen las llaves parejas');

aQuitar.forEach((r) => {
  const desde = r.ini;
  const hasta = r.fin;
  styles = styles.slice(0, desde) + styles.slice(hasta);
});

// Y limpiar las líneas en blanco que quedaron en hilera.
styles = styles.replace(/(\r?\n){4,}/g, NL + NL + NL);

// -------------------------------------------------------------------
// 5. LOS GUARDIANES
// -------------------------------------------------------------------
function llaves(s) {
  const l = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return [(l.match(/\{/g) || []).length, (l.match(/\}/g) || []).length];
}
const a = llaves(styles0);
const b = llaves(styles);
if (a[0] !== b[1] * 2 - a[1] && false) { /* no-op */ }
// Y las llaves que se van, contadas EN EL TROZO, no suponidas.
function llavesDe(s) {
  const l = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return [(l.match(/\{/g) || []).length, (l.match(/\}/g) || []).length];
}
const quitadas = aQuitar.reduce((acc, r) => {
  const x = llavesDe(styles0.slice(r.ini, r.fin));
  acc[0] += x[0];
  acc[1] += x[1];
  return acc;
}, [0, 0]);

if (a[0] - b[0] !== quitadas[0] || a[1] - b[1] !== quitadas[1]) {
  console.log('  *** CAMBIÓ LA CANTIDAD DE LLAVES ***');
  console.log('    antes ' + a[0] + '/' + a[1] + ', ahora ' + b[0] + '/' + b[1]);
  console.log('    se esperaban ' + quitadas[0] + ' y ' + quitadas[1] + ' menos de cada una.');
  process.exit(1);
}
console.log('    ok  llaves: ' + a[0] + ' -> ' + b[0] + ', ' + quitadas[0] + ' menos de cada una');

if (b[0] !== b[1]) {
  console.log('  *** EL ARCHIVO QUEDÓ DESCUADRADO ***');
  process.exit(1);
}

// Y ahora la comprobación buena: leer el texto cortado y contar las reglas de paleta.
//
// Antes se preguntaba por el texto crudo, con "styles.indexOf('[data-group=')". Y eso se
// cumple con que quede la palabra dentro de un comentario. Dejó pasar un archivo entero.
const Restantes = reglas(styles);
if (Restantes.prof !== 0) {
  console.log('  *** EL ARCHIVO QUEDÓ DESCUADRADO ***');
  console.log('    la profundidad al final es ' + Restantes.prof + ', y tiene que ser 0');
  process.exit(1);
}
const paletaQueda = Restantes.filter((r) => {
  const s = r.sel.replace(/\s+/g, ' ');
  if (s.indexOf('[data-group=') < 0) return false;
  const props = propsDe(r.cuerpo);
  if (!props.length) return false;
  return props.every((p) => DE_LA_PALETA.indexOf(p) >= 0);
});
if (paletaQueda.length) {
  console.log('  *** QUEDARON ' + paletaQueda.length + ' REGLAS DE PALETA EN "styles.css" ***');
  paletaQueda.forEach((r) => console.log('    L' + lineaDe(styles, r.ini) + ': ' + r.sel.slice(0, 58)));
  process.exit(1);
}
console.log('    ok  el archivo cortado se relee bien, y no queda ninguna regla de paleta');
console.log('    ok  los "[data-group=" que quedan son de comentarios, que se dejan');

const sobrantes = estilosConGrupo(styles);
if (sobrantes.length) {
  console.log('  *** QUEDARON REGLAS CON "[data-group=" QUE NO SON DE PALETA ***');
  sobrantes.forEach((x) => console.log('    ' + x));
  process.exit(1);
}
console.log('    ok  y no queda ninguna otra regla con "[data-group="');

// Y devuelve el SELECTOR con sus declaraciones, no un número de renglón.
//
// Porque un número de renglón depende de dónde quedaron las cosas DESPUÉS de sacar los 36 bloques, y
// eso se corre. Y un guardia que señala la línea hace buscar el problema donde no está.
function estilosConGrupo(txt) {
  const rs2 = reglas(txt);
  const salida = [];
  rs2.forEach((r) => {
    if (r.sel.replace(/\s+/g, ' ').indexOf('[data-group=') >= 0) {
      salida.push(r.sel.replace(/\s+/g, ' ').slice(0, 58) + '  {' + propsDe(r.cuerpo).join(',') + '}');
    }
  });
  return salida;
}

// -------------------------------------------------------------------
// 6. EL "<link>", EN SU LUGAR
// -------------------------------------------------------------------
let app = app0;

const ANCLA_TOKENS = '<link rel="stylesheet" href="../css/_tokens.css?v=1">';
const ANCLA_STYLES = '<link rel="stylesheet" href="../css/styles.css">';

if (app.split(ANCLA_TOKENS).length - 1 !== 1 || app.split(ANCLA_STYLES).length - 1 !== 1) {
  console.log('  *** LOS ANCLAS DEL "<link>" NO ESTÁN UNA VEZ Y SOLA ***');
  process.exit(1);
}

app = app.replace(ANCLA_STYLES, LINK + NL + ANCLA_STYLES);

// Y que quede ENTRE los dos.
const pTok = app.indexOf(ANCLA_TOKENS);
const pLink = app.indexOf(LINK);
const pSty = app.indexOf(ANCLA_STYLES);
if (!(pTok < pLink && pLink < pSty)) {
  console.log('  *** EL "<link>" NO QUEDÓ ENTRE "_tokens.css" Y "styles.css" ***');
  console.log('    pos tokens ' + pTok + ', link ' + pLink + ', styles ' + pSty);
  process.exit(1);
}
console.log('    ok  el "<link>" quedó entre "_tokens.css" y "styles.css"');

if (app.split('<head>').length - 1 !== 1 || app.split('</' + 'head>').length - 1 !== 1) {
  console.log('  *** EL "<head>" NO ESTÁ ENTERO ***');
  process.exit(1);
}

// -------------------------------------------------------------------
// 7. ESCRIBIR
// -------------------------------------------------------------------
// Y el archivo sale con CRLF, como los demás que se sacaron del grande.
//
// Porque los bloques se copian de "styles.css", que tiene CRLF, y el encabezado se arma
// con "\n". Sin esto el archivo sale con los dos, y una mitad con un salto que la otra no
// tiene. Que es lo que pasó con "css/_grupos.css" y con "css/_marca.css".
const cssCRLF = cssNuevo.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

// Y el guardia: ni un LF suelto, ni un CRLF de más.
const nLF = (cssCRLF.match(/\n/g) || []).length;
const nCRLF = (cssCRLF.match(/\r\n/g) || []).length;
if (nLF !== nCRLF) {
  console.log('  *** EL ARCHIVO NUEVO QUEDARÍA MEZCLADO ***');
  console.log('    ' + nLF + ' saltos LF y ' + nCRLF + ' CRLF. Se wants que sean iguales.');
  process.exit(1);
}
console.log('    ok  el archivo nuevo sale con ' + nCRLF + ' lineas CRLF, sin LF sueltos');

fs.writeFileSync(NUEVO, cssCRLF, 'utf8');
fs.writeFileSync(STYLES, styles, 'utf8');
fs.writeFileSync(APP, app, 'utf8');

const l = (s) => (s.indexOf('\r\n') >= 0 ? s.split('\r\n').length : s.split('\n').length);
console.log('');
console.log('    ok  escrito "css/_grupos.css", ' + l(cssNuevo) + ' renglones');
console.log('    ok  "styles.css": ' + l(styles0) + ' -> ' + l(styles) + ' lineas');
console.log('        (' + aQuitar.length + ' bloques de paleta, '
  + aBorrar.length + ' de ellos duplicados)');
console.log('');
console.log('    Y FALTA LO IMPORTANTE: comprobar en el navegador que los siete grupos siguen');
console.log('    con su color en los DOS temas. Mover reglas cambia la cascada, y eso no se');
console.log('    comprueba leyendo el archivo.');