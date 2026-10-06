// ===================================================================
// COMPRUEBA-CONST: QUE NADA REASIGNE UN "const"
// ===================================================================
//
// Corre:  node tools/comprueba-const.js
//
// ---------------------------------------------------------------------
// EL ERROR QUE ATRAPA
// ---------------------------------------------------------------------
//
//     const q=algo.select('*');
//     if(filtro)q=q.eq('x',1);        <-- "Assignment to constant variable"
//
// En JavaScript, "const" no se puede reasignar. Es un error que aparece SOLO
// cuando se corre, no cuando se lee el archivo. Por eso los otros 27
// guardianes no lo ven: ninguno ejecuta el codigo.
//
// Y SALIO EN PANTANA, DELANTE DE LA PERSONA
//
// La lista de papeles firmados decia:
//
//     No se pudieron cargar los papeles firmados.
//     Assignment to constant variable.
//
// Que es el mejor aviso posible de este error: el navegador lo tira con el
// nombre exacto del problema. Si no hubiera estado el aviso en la pantalla, el
// error habria sido invisible.
//
// ---------------------------------------------------------------------
// POR QUE NO BASTA CON BUSCAR "q=q."
// ---------------------------------------------------------------------
//
// Porque la reasignacion puede ser de cualquier variable y con cualquier
// operador: "q=q.eq", "total=total+1", "lista=lista.concat(...)", y tambien
// "x++" y "x+=1".
//
// Y el codigo de la aplicacion usa "++" y "+=" a proposito en algunos lados,
// que son variables "let" o "var". Por eso no se puede marcar todo como
// sospechoso: solo las reasignaciones de variables que se declararon
// "const" EN LA MISMA FUNCION.
//
// ---------------------------------------------------------------------
// EL ALCANCE
// ---------------------------------------------------------------------
//
// Se mira dentro de cada funcion, porque un "const" es visible hasta el final
// de su bloque. Un "const" de otra funcion no se puede reasignar desde esta.

const fs = require('fs');
const { execSync } = require('child_process');
const R = __dirname.replace(/[\\/]tools$/, '') + '/';

function leerTodosJs(dir, salida) {
  let entradas;
  try { entradas = fs.readdirSync(R + dir, { withFileTypes: true }); }
  catch (e) { return salida; }
  entradas.forEach(function (e) {
    const rel = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') return;
      leerTodosJs(rel, salida);
      return;
    }
    if (!e.name.endsWith('.js')) return;
    if (e.name.startsWith('_prueba') || /^prueba-/.test(e.name)) return;
    if (/^\d+_prueba/.test(e.name)) return;
    if (/^compila-|^prueba-/.test(e.name)) return;
    try { salida.push({ ruta: rel, txt: fs.readFileSync(R + rel, 'utf8') }); }
    catch (e2) { /* no se pudo leer */ }
  });
  return salida;
}

const ARCHIVOS = leerTodosJs('js', [])
  .concat(leerTodosJs('views', []))
  .concat(leerTodosJs('controllers', []));

const malas = [];
let revisadas = 0;

// Y QUITA LO QUE NO ES CODIGO: comentarios y cadenas
//
// Porque un "const x" dentro de un comentario no se ejecuta, y uno dentro de
// una cadena tampoco. Los dos aparecen en el archivo y los dos no son bugs.
// Y POR QUÉ NO SE PUEDE HACER LÍNEA POR LÍNEA
//
// Porque una PLANTILLA puede ocupar varias líneas:
//
//     stage.innerHTML=`<div class="labelCell">
//       <div id="lblqr"></div>
//     </div>`;
//
// El acento grave abre en una línea y cierra en otra. Si se sanitizea renglón
// por renglón, cada uno tiene un acento grave sin pareja, y el HTML de en medio
// se ve como si fuera código.
//
// Eso es lo que pasaba: el "<div id="lblqr">" de la línea del medio quedaba
// vivo, y el guardián reportaba "se reasigna id".
//
// Un "saneado" que no entienda las plantillas tiene que tratar el archivo
// ENTERO, no línea por línea. Por eso el bucle de comentarios va aparte, y el
// de cadenas se hace de una sola pasada sobre todo el texto.
function sinComentariosNiCadenas(txt) {
  // ------------------------------------------------------------------
  // 1) LOS COMENTARIOS DE LÍNEA
  // ------------------------------------------------------------------
  // Y SE RESPETA EL "?"", QUE ES "NO ES COMENTARIO"
  //
  // El código real de este proyecto tiene "url + '?v=' + v", y un "?" no abre
  // comentario en JavaScript. Por eso el "?" está ahí: es lo que hace que el
  // saneado no corte la línea a la mitad.
  //
  // Y el "<" antes del "!" es por los "<!--" de los comentarios de bloque.
  let lineaPorLinea = txt.replace(/<!--[\s\S]*?-->/g, function (m) { return ' '.repeat(m.length); });
  lineaPorLinea = lineaPorLinea.split(/\r\n|\n|\r/).map(function (x) {
    const m = /(^|[^:'"`\\])\/\//.exec(x);
    return m ? x.slice(0, m.index + m[1].length) : x;
  }).join('\n');

  // ------------------------------------------------------------------
  // 2) LAS CADENAS, DE UNA SOLA PASADA SOBRE TODO EL ARCHIVO
  // ------------------------------------------------------------------
  // Y SE CAMBIAN POR ESPACIOS, TODAS
  //
  // Por ESPACIOS y no por comillas vacías. Porque una plantilla tiene HTML
  // adentro, y "id=" seguiría ahí y parecería una reasignación. Con espacios,
  // el "<div          >" no tiene ningún "=" y desaparece.
  //
  // Y por eso no hace falta preguntar si algo está dentro de una cadena: si
  // está dentro de una cadena, ya no existe.
  let salida = '';
  let i = 0;
  while (i < lineaPorLinea.length) {
    const c = lineaPorLinea[i];
    // Un "://" de una URL: no abre nada
    if (c === '/' && lineaPorLinea[i + 1] === '/') {
      while (i < lineaPorLinea.length && lineaPorLinea[i] !== '\n') { salida += lineaPorLinea[i]; i++; }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const cierre = c;
      i++;
      // Y HASTA EL CIERRE, CRUZANDO RENGONES SI HACE FALTA
      while (i < lineaPorLinea.length) {
        if (lineaPorLinea[i] === '\\') { i += 2; continue; }
        if (lineaPorLinea[i] === cierre) { i++; break; }
        i++;
      }
      salida += '   ';
      continue;
    }
    salida += c;
    i++;
  }
  return salida;
}

ARCHIVOS.forEach(function (a) {
  const txt = sinComentariosNiCadenas(a.txt);
  const lineas = a.txt.split(/\r\n|\n|\r/);

  // Y POR FUNCIÓN, PORQUE UN "const" SOLO VIVE EN SU BLOQUE
  // Se corta por "function", porque es lo que delimita el alcance.
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/g;
  const cortes = [];
  let m;
  while ((m = re.exec(txt)) !== null) cortes.push(m.index);
  if (!cortes.length) return;
  cortes.push(txt.length);

  for (let i = 0; i < cortes.length - 1; i++) {
    const cuerpo = txt.slice(cortes[i], cortes[i + 1]);
    revisadas++;

    // Los "const" que se declaran en esta función
    const declarados = {};
    const reConst = /(?:\bconst|for\s*\(\s*const)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    let c;
    while ((c = reConst.exec(cuerpo)) !== null) declarados[c[1]] = true;

    if (!Object.keys(declarados).length) continue;

    // Y LAS REASIGNACIONES
    Object.keys(declarados).forEach(function (nombre) {
      // Y EL PATRÓN DE ESTA REASIGNACIÓN
      // (el que explica por qué "caja.textContent" no cuenta)
      // ---------------------------------------------------------------------
// Y EL PATRÓN, QUE ES LO QUE HIZO FALLAR DOS VECES A ESTE GUARDIÁN
// ---------------------------------------------------------------------
//
// Se busca la reasignación como UNA COSA COMPLETA: el nombre, y después un
// "=" que no sea comparación.
//
// Y EL "(?![.\w$])" DEL FINAL ES LO IMPORTANTE
//
// Por lo que no se "agarra" es porque el caracter de antes no puede ser punto.
// O sea:
//
//     caja.textContent = mensaje    <-- punto antes: NO es reasignar "caja"
//     q = q.eq('x')                  <-- espacio antes: SÍ es reasignar "q"
//
// Y eso es lo correcto: cambiar una PROPIEDAD no es reasignar la variable. La
// caja sigue siendo el mismo elemento; lo que cambia es lo que tiene adentro.
//
// ---------------------------------------------------------------------
// EL "=" QUE NO ES COMPARACIÓN
//
// En "x == y", "x === y" y "x => f", el "=" no reasigna. El patrón exige que
// el "=" NO vaya seguido de "=" ni de ">".
//
// Y ESTE PATRÓN VA DENTRO DEL BUCLE, POR CADA VARIABLE
//
// Porque cada variable necesita su propio patrón: si se arma una sola vez
// afuera, usa el nombre de la vuelta anterior, y el guardián reporta cosas que
// no tienen nada que ver.
      const reAsig = new RegExp(
        // El nombre, que no puede seguir a punto, a letra, a digito, a _ ni a $
        '(?<![.\\w$])' + nombre.replace(/\$/g, '\\$')
        // Y EL "=" QUE NO ES COMPARACION NI FLECHA
        //
        // "(?![=>])" es lo que descarta las dos cosas que empiezan con "=" y
        // NO reasignan:
        //
        //     caja == otro      comparacion
        //     caja === otro     comparacion
        //     nombreDe=c=>{...}  FUNCION FLECHA, que es una asignacion de
        //                        VERDAD pero de una funcion, no del valor de
        //                        "c". Y "c" ni se usa despues.
        //
        // Esa ultima era un falso positivo que aparecio en "nucleo.js": se
        // declaraba "const nombreDe=c=>{...}" y el guardian lo reportaba como
        // si se reasignara "c".
        + '\\s*(?:=(?![=>])|\\+\\+|--|\\+=|-=)',
        'g'
      );
      let a2;
      while ((a2 = reAsig.exec(cuerpo)) !== null) {
        // Y EL HTML YA NO ESTÁ, PORQUE LAS CADENAS SON ESPACIOS
        //
        // Este bloque quedó vacuo a propósito. Antes preguntaba si la posición
        // estaba dentro de una cadena, y esa pregunta ya no hace falta: las
        // cadenas se cambian por espacios, así que un "id" de HTML no existe.
        // La reasignación que hay que buscar es real o no es nada.
        // Y NO CUENTA LA DECLARACIÓN PROPIA
        const antes = cuerpo.slice(Math.max(0, a2.index - 12), a2.index);
        if (/\bconst\s+$/.test(antes)) continue;
        // Y NO CUENTA UNA DESTRUCTURACIÓN
        if (new RegExp('[({\\[,]\s*$').test(antes)) continue;

        const linea = txt.slice(0, cortes[i] + a2.index).split('\n').length;
        malas.push({ archivo: a.ruta, linea, nombre });
        reAsig.lastIndex = a2.index + 1;
      }
    });
  }
});

console.log('');
console.log('  funciones revisadas: ' + revisadas);
if (!malas.length) {
  console.log('  ok  ninguna función reasigna un "const".');
  process.exit(0);
}
console.log('');
console.log('  *** ' + malas.length + ' REASIGNACIÓN(ES) DE UN "const":');
malas.forEach(x => console.log('      ' + x.archivo + ' L' + x.linea + '  "' + x.nombre + '"'));
console.log('');
console.log('  Al correr sale: "Assignment to constant variable".');
process.exit(1);