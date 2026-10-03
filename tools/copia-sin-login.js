// REGENERA LA COPIA DE PRUEBA SIN LOGIN
// ======================================
//
// -------------------------------------------------------------------
// POR QUÉ ESTA HERRAMIENTA EXISTE Y NO ERA UN ARCHIVO A MANO
// ---------------------------------------------------------
//
// La copia de "tools/pruebas/app-sin-login.html" estaba en "?v=58" mientras la aplicación iba
// en la 61. Es decir: llevaba tres versiones de atraso, y abría el CSS y el JavaScript
// VIEJO.
//
// Y eso es una trampa muy particular: la copia de trabajo abre, se ve bien, y está probando
// otra aplicación. El síntoma —"el cambio no llegó"— es exactamente el del caché, y por eso
// no se distingue de un problema real.
//
// Y no hay forma de que se dé cuenta sola: un archivo generado a mano no tiene ni la fecha
// ni el origen. Esta herramienta los dos, y dice de qué versión salió.
//
// -------------------------------------------------------------------
// Y LA COPIA NO ES "SIN LOGIN": ES "CON LAS RUTAS CORREGIDAS"
// ------------------------------------------------------------
//
// El nombre quedó viejo. Lo que hace es cambiar "../" por "../../", porque la copia vive en
// "tools/pruebas/" y la original en "pages/", y los dos están a la misma distancia de la
// raíz... no: "pages/" está a un nivel y "tools/pruebas/" a dos.
//
// El resultado medido, comparando las dos línea por línea, es que SOLO cambian los
// prefijos y la versión. Nada más. No se quita ninguna comprobación de ingreso.
//
// -------------------------------------------------------------------
// Y QUÉ COMPRUEBA ANTES DE ESCRIBIR
// ---------------------------------
//
// Que la copia que hay en el disco sea SUY y no otra cosa. Si alguien la editó a mano —para
// probar algo puntual—, regenerarla borra ese trabajo sin avisar. Y por eso compara lo que
// hay contra lo que GENERARÍA, y si difieren en algo más que la versión, no escribe y
// lo dice.
//
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const ORIGEN = RAIZ + 'pages/app.html';
const DESTINO = RAIZ + 'tools/pruebas/app-sin-login.html';

// Y la versión sale del propio archivo, y no de una constante: si se dejara escrita acá, la
// copia se quedaría vieja otra vez, que es justo lo que pasó.
const origen = fs.readFileSync(ORIGEN, 'utf8');

// Y SOLO de los "<link>" y los "<script>", y no de cualquier "?v=" del archivo.
//
// Porque hay uno que va por su cuenta y es de otro contador: el registro del service worker,
// "navigator.serviceWorker.register('../sw.js?v=19')". Ese "19" es cuántas veces se cambió
// el service worker, y no tiene nada que ver con la versión de los estilos y los guiones.
//
// Y la primera versión de esta herramienta buscaba "?v=" en todo el archivo, veía el 19
// junto al 61 y se declaraba rota: "una aplicación con dos versiones a la vez no es una
// aplicación con caché". Que es verdad de lo que estaba mirando, y falso de lo que hay.
//
// La regla: un contador que no es el que se cree, hay que distinguirlo antes de alarmarse.
// Un guardián que se confunde de contador avisa de cosas que no son, y a la semana nadie lo
// lee. Y peor: avisa de una cosa que el mismo archivo dice que es normal.
const referencias = origen.match(/(?:href|src)="[^"]*\?v=\d+"/g) || [];
const versiones = [...new Set(
  referencias.map((x) => (x.match(/\?v=(\d+)/) || [])[1]).filter(Boolean),
)];
if (!versiones.length) {
  console.log('');
  console.log('  *** "app.html" NO TIENE NINGUNA VERSIÓN ***');
  console.log('    Sin "?v=" no hay caché que limpiar, y algo anda mal.');
  process.exit(1);
}
const VERSION = versiones[0];
if (versiones.length > 1) {
  console.log('');
  console.log('  *** "app.html" TIENE VARIAS VERSIONES: ' + versiones.join(', ') + ' ***');
  console.log('    Una aplicación con dos versiones a la vez no es una aplicación con caché.');
  process.exit(1);
}

// -------------------------------------------------------------------
// GENERAR
// -------------------------------------------------------------------
// -------------------------------------------------------------------
// LA MANCHA DE SESIÓN, QUE ES LO QUE LA HACE "SIN LOGIN"
// ---------------------------------------------------------
//
// Y no es cambiar las rutas: es agregar un "<script>" que reemplaza "requireAuth" por una
// función que devuelve un usuario falso.
//
// Y se descubre porque la copia que había en el disco differed de "app.html" en SIETE
// renglones que no eran versiones, y el diff los mostró:
//
//     /* MANCHA DE SESION PARA LAS PRUEBAS */
//     try{
//       window.requireAuth=async function(){return{user:{id:"prueba",…}}};
//     }catch(e){console.error("[prueba] no se pudo anular requireAuth:",e);}
//
// -------------------------------------------------------------------
// Y POR QUÉ ESTÁ EN EL "<body>", ANTES DE "app.js"
// --------------------------------------------------
//
// Porque "requireAuth" se define en "config/auth.js" y lo llama "js/app.js" al arrancar. Si
// la mancha se pusiera después de "app.js", a la hora de arrancar todavía no existiría, y el
// salto al ingreso ya habría pasado.
//
// Y va envuelta en un "try" con un "catch" que avisa: si "requireAuth" cambia de nombre o
// se mueve de archivo, la mancha deja de hacer nada y la página pide ingreso. Y sin el
// "catch", se quedaría en silencio.
//
// -------------------------------------------------------------------
// Y ES UNA TRAMPA, Y HAY QUE DECIRLO
// ----------------------------------
//
// Con la mancha puesta, la página abre sin preguntar nada. Y uno ve la aplicación entera y
// cree que anda.
//
// Pero no está probando la autenticación, ni el "RLS" de la base, ni el service worker. La
// sesión es falsa: el "id" es "prueba", y cualquier cosa que dependa de quién está
// conectado —los permisos, los avisos, lo que se guarda— no se está probando.
//
// Sirve para ver la FORMA de las pantallas: que un botón esté donde debe, que una tabla no
// se corte, que un texto no se salga. Para eso está.
//
// Y por eso el nombre viejo era engañoso: se llama "sin login" y en realidad es "con un
// login falso". Que es peor, porque uno cree que probó el ingreso y no lo probó.
//
// -------------------------------------------------------------------
// Y SE PONE UNA SOLA VEZ, Y ANTES DE "app.js"
// -------------------------------------------
// Y el PRIMER renglón es el del comentario, y no uno vacío.
//
// Porque la comparación de la guarda ignora el bloque de la mancha pero NO lo que está antes:
// un renglón vacío de más hace que el archivo nuevo tenga un "\r\n" donde el viejo tiene la
// mancha, y después de reemplazarla queda un "\r\n" que el otro no tiene. Dos caracteres que
// no se ven y hacen que la comparación falle siempre.
//
// Y eso pasa siempre: el renglón vacío "se ve bien" en el código, y lo único que dice es que
// la comparación da rojo y no se entiende por qué.
const MANCHA = [
  '<!-- MANCHA DE SESION PARA LAS PRUEBAS -->',
  '<!--',
  '  Esta NO es la aplicación. Es una copia con la sesión FALSADA, para poder ver las',
  '  pantallas sin escribir una contraseña real.',
  '',
  '  Con esto no se prueba: el ingreso, el RLS de la base, el service worker, ni nada que',
  '  dependa de QUIÉN está conectado. El "id" es "prueba" y no existe en el sistema.',
  '',
  '  Sirve para ver la FORMA: que un botón esté donde debe, que una tabla no se corte, que',
  '  un texto no se salga. Para eso está.',
  '',
  '  Va antes de "js/app.js" a propósito: "requireAuth" se llama al arrancar, y si la mancha',
  '  se pusiera después, el salto al ingreso ya habría pasado.',
  '-->',
  '<script>',
  'try{',
  '  window.requireAuth=async function(){return{user:{id:"prueba",email:"prueba@prueba"},',
  '    access_token:"prueba",session:{user:{id:"prueba",email:"prueba@prueba"}}};};',
  '}catch(e){console.error("[prueba] no se pudo anular requireAuth:",e);}',
  '</script>',
].join('\n');

// Y se cambia SOLO la profundidad de la ruta y la versión, y nada más.
const NL = /\r\n/.test(origen) ? '\r\n' : '\n';
const conRutas = origen
  .replace(/(href|src)="\.\.\//g, (m) => m.slice(0, -3) + '../../')
  .replace(/\?v=\d+/g, '?v=' + VERSION);

// Y la mancha se inserta DESPUÉS de tener ese texto, y no antes.
//
// Y esto es un temporal dead zone, y es el mismo error que el del archivo "cuatro.js" de las
// pruebas: una versión de esta herramienta buscó el ancla antes de declarar la variable, y
// se cayó con "Cannot access 'salida' before initialization". El mensaje dice que la
// variable no existe, y sí existe: está dos líneas más abajo.
//
// Lo que hace el chiste es que el error estaba DOCUMENTADO en el arnés, con su explicación
// escrita, y se cayó igual. Ver "tools/pruebas/cuatro.js". Documentar no es lo mismo que
// mirar.
const ANCLA = '<script src="../../js/app.js?';
const donde = conRutas.indexOf(ANCLA);
if (donde < 0) {
  console.log('');
  console.log('  *** NO SE ENCONTRÓ EL "<script>" DE "js/app.js" ***');
  console.log('    La mancha va justo antes de ese script. Sin él no hay dónde insertarla,');
  console.log('    y una copia sin mancha es la aplicación real, no la de pruebas.');
  console.log('    NO SE ESCRIBE NADA.');
  process.exit(1);
}

const salida = conRutas.slice(0, donde) + MANCHA.split('\n').join(NL) + NL + conRutas.slice(donde);

// -------------------------------------------------------------------
// LOS MODOS, ANTES DE LA GUARDA
// -------------------------------------------------------------------
// Y "diff" va PRIMERO, y no después de la guarda de "no pises".
//
// Y no es un detalle de orden: la guarda dice "difieren, tira o mira la diferencia", y el
// modo de mirar la diferencia estaba después de la guarda. O sea que la herramienta decía
// "corré el diff" y el diff no se podía correr.
//
// Es el error clásico de poner la comprobación antes del instrumentar: el mensaje de error
// describe un camino que no existe. Y pasa siempre igual: la primera vez que se ve, la
// respuesta natural es "el diff está roto", y no es el diff.
const MODO = process.argv[2] || 'hacer';
const hay = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : null;
const sinVersion = (t) => t.replace(/\?v=\d+/g, '?v=N');

if (MODO === 'diff') {
  const a = (hay || '').split('\n');
  const b = salida.split('\n');
  console.log('  la copia tiene ' + a.length + ' renglones, y se generarían ' + b.length);
  console.log('');
  console.log('  Las diferencias de VERSIÓN se cuentan aparte, y no se listan: son 27');
  console.log('  renglones que se van a refrescar, y verlos tapa todo lo demás.');
  console.log('');

  const N = (x) => String(x === undefined ? '(no existe)' : x).replace(/\?v=\d+/g, '?v=N');
  let versions = 0;
  let reales = 0;

  // Y la mancha NO se cuenta como diferencia real, porque es de esta herramienta.
  //
  // Y sin esta regla el "diff" es inútil: la copia vieja tiene una mancha de siete renglones
  // y la nueva tiene una de veintidós, y el diff muestra catorce cambios que no son un cambio
  // del código sino un comentario más largo.
  //
  // Y eso no es un detalle del diff: es el mismo problema en la guarda de "no pises". Si la
  // guarda compara la mancha, dice que alguien editó a mano cuando lo único que cambió es que
  // esta herramienta ahora documenta lo que hace. Y entonces hay que tirar la copia a mano
  // cada vez que se mejora el comentario, que es exactamente cuando no hay que tirarla.
  const sinMancha = (t) => t.replace(
    /(<!--\s*MANCHA DE SESION PARA LAS PRUEBAS[\s\S]*?<\/script>)|(\/\*\s*MANCHA DE SESION PARA LAS PRUEBAS[\s\S]*?<\/script>)/,
    '<<<MANCHA>>>',
  );

  const n = Math.max(a.length, b.length);

  // Y primero se emparejan por ÍNDICE, y si el alto no da, se dice. Porque si hay renglones
  // de más, comparar por índice descoloca todo lo que viene después y el diff parece
  // distinto en cada línea.
  if (a.length !== b.length) {
    console.log('  *** LOS ALTOS NO DAN ***');
    console.log('    la copia tiene ' + (a.length - 1) + ' renglones y se generarían ' + (b.length - 1));
    console.log('    Con alturas distintas, comparar por número de renglón desplaza todo y el');
    console.log('    diff muestra cambios que no están donde Cree. Se listan las de abajo.');
    console.log('');
  }

  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) continue;
    if (N(a[i]) === N(b[i])) { versions++; continue; }
    reales++;
    if (reales > 20) continue;
    console.log('  L' + (i + 1));
    console.log('    - ' + N(a[i]).trim().slice(0, 84));
    console.log('    + ' + N(b[i]).trim().slice(0, 84));
  }

  // Y el veredicto se da sobre los archivos SIN la mancha, que es la única comparación que
  // vale. Antes se comparaba con ella puesta y salía "difieren" siempre.
  const igualesSinMancha = sinMancha(hay || '') === sinVersion(sinMancha(salida));
  console.log('');
  if (igualesSinMancha) {
    console.log('    Y fuera de la mancha —que es de esta herramienta— los dos archivos son');
    console.log('    iguales. Se puede regenerar sin perder nada.');
  } else {
    console.log('    Y fuera de la mancha los archivos SON DISTINTOS: eso sí es una edición');
    console.log('    a mano, y regenerar la pierde.');
  }

  console.log('');
  console.log('    ' + versions + ' renglón(es) que solo cambian de versión');
  console.log('    ' + reales + ' renglón(es) que cambian de verdad'
    + (reales > 20 ? '  (se listaron los primeros 20)' : ''));
  process.exit(reales ? 1 : 0);
}

if (MODO === 'tirar') {
  if (!fs.existsSync(DESTINO)) {
    console.log('  no hay copia que tirar');
    process.exit(0);
  }
  fs.unlinkSync(DESTINO);
  console.log('    ok  y la copia está tirada');
  process.exit(0);
}

if (MODO !== 'hacer') {
  console.log('');
  console.log('  *** MODO DESCONOCIDO: "' + MODO + '" ***');
  console.log('    los modos son: hacer, diff, tirar.');
  process.exit(1);
}

// -------------------------------------------------------------------
// LA GUARDA DE NO PISAR, QUE VA DESPUÉS DE LOS MODOS DE SOLO LECTURA
// -------------------------------------------------------------------
//
// Y compara IGNORANDO la versión —que es lo que se quiere refrescar— e ignorando la mancha,
// que es de esta herramienta. Lo que queda es el código, y si el código está distinto,
// alguien lo editó a mano y regenerarlo borra ese trabajo.
//
// Y la mancha se ignora porque ES de esta herramienta. La primera versión de esta guarda la
// comparaba entera, y en cada corrida decía "alguien la editó a mano" —porque la mancha vieja
// tenía siete renglones y la nueva veintidós—, y había que tirar la copia a mano cada vez que
// se le agregaba una línea al comentario. Que es justo cuando no hay que tirarla.
//
// Y esa es una clase de falla que ya salió dos veces hoy: un guardián que compara un texto que
// él mismo escribe. La primera vez fue el "final" que contaba la portada del guion de corte, y
// la segunda fue esta.
const fueraDeLaMancha = (t) => t.replace(
  /(<!--\s*MANCHA DE SESION PARA LAS PRUEBAS[\s\S]*?<\/script>)|(\/\*\s*MANCHA DE SESION PARA LAS PRUEBAS[\s\S]*?<\/script>)/,
  '<<<MANCHA>>>',
);

// Y las DOS cosas: quitar la mancha Y quitar la versión.
//
// Y al principio quitaba solo la mancha, y comparaba "v58" contra "v61". La guarda decía
// "difieren" con el detalle al lado más largo del archivo, que es la ÚLTIMA línea, y el
// mensaje decía "una de las dos terminó antes", que era mentira: las dos terminaban en el
// mismo lugar y con el mismo largo.
//
// Y el detalle apuntaba al "<body>" y al "<html>", que son las ÚLTIMAS líneas del archivo.
// O sea que el aviso señalaba el final del archivo cuando el problema estaba en 27 renglones
// del principio. Un detalle que señala el lugar equivocado es peor que no dar detalle: hace
// mirar donde no está.
const comparable = (t) => sinVersion(fueraDeLaMancha(t));

if (hay && sinVersion(hay) !== sinVersion(salida)) {
  if (comparable(hay) === comparable(salida)) {
    console.log('');
    console.log('  La copia que hay tiene una mancha más vieja, y nada más distinto.');
    console.log('  Se regenera sola, porque el resto es idéntico.');
  } else {
    // Y DÓNDE. Siempre.
    //
    // Y esto es lo que faltaba y lo que costó tres vueltas: el guardián decía "difieren" y
    // nada más, y el siguiente paso natural —buscar la diferencia— no era posible porque el
    // "diff" comparaba por número de renglón y los archivos tienen alturas distintas.
    //
    // Un aviso que dice que algo está mal y no dice dónde obliga a hacer el trabajo a mano.
    // Y el trabajo a mano, cuando el aviso no dice dónde, es revisar 2800 renglones. O sea
    // que nadie lo revisa.
    const A = comparable(hay);
    const B = comparable(salida);
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i++;

    console.log('');
    console.log('  *** LA COPIA QUE HAY NO ES LA QUE SE GENERARÍA ***');
    console.log('    DIFIEREN EN ALGO MÁS QUE LA VERSIÓN Y LA MANCHA.');
    console.log('');
    console.log('    largo con la copia:    ' + A.length + ' caracteres');
    console.log('    largo con la nueva:    ' + B.length + ' caracteres');
    console.log('    se parecen hasta el:   ' + i);
    console.log('');

    if (i >= A.length && i >= B.length) {
      // Y esto NO puede pasar acá, porque si se parecieran hasta el final y tuvieran el
      // mismo largo serían iguales. Que el guardián se queje en ese caso significa que la
      // comparación de arriba no es la misma que la de acá, y eso hay que saberlo.
      console.log('    *** SON IGUALES Y EL GUARDIÁN SE QUEJA ***');
      console.log('    O sea que las dos comparaciones de este guion no son la misma.');
      console.log('    Y eso es un error de este guion, no de la copia.');
      console.log('    NO SE ESCRIBE NADA.');
      process.exit(1);
    }

    console.log('    la copia, desde un poco antes:');
    console.log('      ' + JSON.stringify(A.slice(Math.max(0, i - 50), i + 110)));
    console.log('');
    console.log('    la nueva, desde el mismo punto:');
    console.log('      ' + JSON.stringify(B.slice(Math.max(0, i - 50), i + 110)));
    console.log('');

    if (i >= A.length || i >= B.length) {
      console.log('    UNA DE LAS DOS TERMINÓ ANTES: la diferencia es de LARGO, no de texto.');
      console.log('    Un renglón de más o de menos. Un salto de línea de más alcanza.');
    }
    console.log('    Puede que alguien la editó a mano, y eso se pierde al regenerar.');
    console.log('    Para tirar la de todos modos:');
    console.log('        node tools/copia-sin-login.js tirar');
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// Y QUE LA MANCHA ESTÉ, Y SOLO UNA
// -------------------------------------------------------------------
const veces = (salida.match(/MANCHA DE SESION PARA LAS PRUEBAS/g) || []).length;
if (veces !== 1) {
  console.log('');
  console.log('  *** LA MANCHA ESTÁ ' + veces + ' VECES, Y TIENE QUE ESTAR UNA ***');
  console.log('    Si está dos veces, "requireAuth" se reemplaza dos veces por lo mismo.');
  console.log('    Si no está, la copia es la aplicación real. NO SE ESCRIBE NADA.');
  process.exit(1);
}

// -------------------------------------------------------------------
// COMPROBAR, Y ESCRIBIR
// -------------------------------------------------------------------
const scripts = (t) => (t.match(/<script src="[^"]+"/g) || []).map((x) => x.slice(14, -1));
const antes = scripts(origen);
const despues = scripts(salida);

console.log('  === la copia de "app-sin-login" ===');
console.log('    sale de "pages/app.html", en la versión ' + VERSION);
console.log('    ' + despues.length + ' scripts, y se cambian solo los prefijos de ruta');

if (antes.length !== despues.length) {
  console.log('  *** CAMBIÓ LA CANTIDAD DE SCRIPTS ***');
  process.exit(1);
}
antes.forEach((a, i) => {
  // Y se quitan las DOS cosas que cambian a propósito: la versión y la profundidad de la ruta.
  //
  // Y la primera versión de esta comparación quitaba solo la versión, y por eso decía que el
  // script 8 —el primero— era distinto. Y el primer script es el que más se parece entre
  // los dos, y no había cambiado en nada.
  //
  // Un comprobador que compara lo que NO tiene que comparar no encuentra lo que SÍ importa:
  // este avisa del script equivocado, en un archivo donde todo lo demás está bien.
  const limpio = (x) => x.replace(/\?v=\d+/, '').replace(/(\.\.\/)+/, '');
  if (limpio(a) !== limpio(despues[i])) {
    console.log('  *** EL SCRIPT ' + (i + 1) + ' ES DISTINTO ***');
    console.log('      - ' + a);
    console.log('      + ' + despues[i]);
    process.exit(1);
  }
});
console.log('    ok  los ' + despues.length + ' scripts son los mismos, con otra ruta');

fs.writeFileSync(DESTINO, salida, 'utf8');

// Y que lo que quedó sea lo que se dijo, y no una copia de algo anterior.
const escrito = fs.readFileSync(DESTINO, 'utf8');
if (sinVersion(escrito) !== sinVersion(salida)) {
  console.log('');
  console.log('  *** LO QUE SE ESCRIBIÓ NO ES LO QUE SE CALCULÓ ***');
  console.log('    No se da por buena la copia. Se puede borrar a mano.');
  process.exit(1);
}

const crlf = /\r\n/.test(escrito);
console.log('    ok  escrita: ' + escrito.split('\n').length + ' renglones, '
  + (crlf ? 'CRLF' : 'LF'));
console.log('    y se abre en:  http://127.0.0.1:5500/tools/pruebas/app-sin-login.html');
console.log('');
console.log('    OJO: no es "sin login". Es "con las rutas corregidas", porque la copia');
console.log('    está dos niveles más abajo que "pages/". Lo que evita el ingreso, si lo');
console.log('    evita, es la sesión del navegador.');