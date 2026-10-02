// PROBAR QUE LA COMPROBACION DE MOVIL PUEDE FALLAR
// ================================================
//
// Una comprobación que nunca falló no está comprobando. Esta toma el "app.html" sano y le
// rompe una cosa a la vez, y aplica la MISMA expresión que usa la suite. Si la suite no se
// pone roja con estas tres cosas, la suite no está mirando lo que dice mirar.
//
const fs = require('fs');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const ORIGINAL = fs.readFileSync(RAIZ + 'pages/app.html', 'utf8');

// Y la MISMA expresión de la suite, copiada. Si mañana cambia la suite y no esta copia, esta
// prueba pasa a medir la expresión vieja y deja de servir. Ver [cache-14].
const reglas = [
  {
    nombre: 'movil.css DESPUES de styles.css',
    mira: (t) => {
      const iS = t.search(/href="\.\.\/css\/styles\.css(?:\?v=\d+)?"/);
      const iM = t.search(/href="\.\.\/css\/movil\.css(?:\?v=\d+)?"/);
      return iM > iS && iS >= 0;
    },
    rompe: (t) => {
      // Y al revés: movil primero.
      const a = t.match(/<link rel="stylesheet"[^>]*href="\.\.\/css\/styles\.css[^"]*">/)[0];
      const b = t.match(/<link rel="stylesheet"[^>]*href="\.\.\/css\/movil\.css[^>]*>/)[0];
      return t.replace(b, '@@B@@').replace(a, b).replace('@@B@@', a);
    },
  },
  {
    nombre: 'movil.css lleva media="(max-width: 860px)"',
    mira: (t) => /href="\.\.\/css\/movil\.css(?:\?v=\d+)?" media="\(max-width: 860px\)"/.test(t),
    rompe: (t) => t.replace('media="(max-width: 860px)"', 'media="(min-width: 861px)"'),
  },
];

let fallos = 0;
let falsos = 0;

reglas.forEach((r) => {
  // 1. El archivo sano tiene que PASAR. Si no pasa, la comprobación está mal antes de probar
  //    nada: no sirve para juzgar nada.
  if (!r.mira(ORIGINAL)) {
    console.log('  *** ' + r.nombre + ': el archivo SANO ya no pasa ***');
    console.log('    La comprobación está equivocada, no el archivo.');
    fallos++;
    return;
  }
  console.log('  ok    sano pasa:  ' + r.nombre);

  // 2. El archivo roto tiene que FALLAR. Si pasa, la comprobación no mira lo que dice mirar.
  const roto = r.rompe(ORIGINAL);
  if (roto === ORIGINAL) {
    console.log('  *** ' + r.nombre + ': el script de romper no cambió nada ***');
    fallos++;
    return;
  }
  if (r.mira(roto)) {
    console.log('  *** ' + r.nombre + ': el archivo ROTO también pasa ***');
    console.log('    La comprobación no ve la rotura que dice ver.');
    fallos++;
    return;
  }
  console.log('  ok    roto falla: ' + r.nombre);
});

// -------------------------------------------------------------------
// Y LA TERCERA: QUE "?v=" NO SEA LO QUE HACE FALLAR
// --------------------------------------------------
// La versión tiene que ser OPCIONAL. Si la quitara, la comprobación debe seguir dejando pasar
// el archivo, porque el "?v=" se puede borrar a mano y el CSS tiene que funcionar igual.
// Y con subcarpetas: ocho archivos viven en "componentes/", y un patrón que solo acepta
// letras y guiones en el nombre se los deja. O sea que los cuenta como "sin versión" sin
// haberlos tocado, y la comprobación pasa sin comprobar. Ver [cache-15].
//
// Y el patrón además tenía la lista de carpetas ESCRITA: "../(?:css|js)/". Cuando los
// módulos se movieron a "config/", "controllers/" y "views/<módulo>/", ese patrón dejó de
// quitarles el "?v=", y el guardián reportaba "QUEDARON 18 VERSIONES" sobre un archivo que
// estaba perfectamente bien: las 18 versiones eran de archivos que ya no están en "js/" ni en
// "css/".
//
// Es el TERCER guardián de este turno con la misma falla —"compila-juntos" con el mismo regex
// en la línea 34, "sube-versiones" con su lista en la línea 101— y los tres estaban escritos
// con la lista de carpetas del día que se hicieron. Ver [arq-14].
//
// Ahora el patrón es "cualquier carpeta local", y no hay que tocarlo la próxima vez.
// Y el patrón tiene que aceptar un PUNTO en el nombre del archivo, Y EXIGIR al menos una
// carpeta.
//
// La primera versión era "/\.\.\/[a-z][\w\-/]*\.(?:css|js)/", y funcionaba con los nombres
// que había: "relojes.js", "styles.css", "administracion.js". No con "supabase.config.js", que
// tiene un punto en medio: el carácter de la clase no era un punto, así que la coincidencia
// terminaba en "supabase" y buscaba un ".js" que no estaba.
//
// Y son dos archivos, no uno, y el guardián decía "QUEDARON 2 VERSIONES" sin decir cuáles
// hasta que las imprimió. Un número sin el nombre es un trabajo pendiente para el que lee.
//
// Un nombre de archivo con punto es perfectly legal y en JavaScript es común. El patrón es el
// que tenía que aprenderlo, no el nombre. Ver [arq-15].
//
// Y el "una carpeta o más" es lo que SALVA a "sw.js". "../sw.js" no tiene carpeta: vive en la
// raíz del repositorio. Y su "?v=" tiene que quedarse, porque no es un asset como los otros:
// el navegador lo relee con una comprobación de bytes, pero si alguna vez se sirve del caché
// tiene que poder distinguir versiones. Ver [cache-08].
//
// Con la "*" en vez de la "+", el patrón le quitaba la versión al "sw.js" también, y el
// guardián decía "QUEDARON 0 VERSIONES, y se esperaba 0 o 1" —que parece casi un acierto, y
// es el fallo entero. Un acierto parcial es peor que un fallo: no da nada que buscar.
const sinVersion = ORIGINAL.replace(/(\.\.\/(?:[\w\-]+\/)+[\w\-]+(?:\.[\w\-]+)*\.(?:css|js))\?v=\d+/g, '$1');
const conQ = (sinVersion.match(/\?v=\d+/g) || []).length;
const nTotales = (ORIGINAL.match(/\?v=\d+/g) || []).length;
if (conQ === 1 && sinVersion.indexOf('../sw.js?v=19') >= 0) {
  // Y ese uno tiene que quedarse: el "sw.js" NO es un asset como los otros. El navegador lo
  // relee con una comprobación de bytes, pero si en algún momento se sirve desde el caché
  // igual tiene que poder distinguir versiones. Ver [cache-08].
  console.log('');
  console.log('    ok  las ' + (nTotales - 1) + ' referencias de css y js quedaron sin "?v=" a propósito');
  console.log('    ok  y sw.js conserva la suya, que es a propósito');
} else {
  console.log('');
  console.log('  *** QUEDARON ' + conQ + ' VERSIONES, y se esperaba 0 o 1 ***');
  (sinVersion.match(/[\w\/]+\?v=\d+/g) || []).forEach((x) => console.log('      ' + x));
  process.exit(1);
}

reglas.forEach((r) => {
  if (!r.mira(sinVersion)) {
    console.log('  *** sin "?v=" falla: ' + r.nombre + ' ***');
    console.log('    La comprobación exige la versión, y eso no es lo que tiene que medir.');
    falsos++;
  }
});
if (falsos) process.exit(1);
console.log('    ok  y las dos siguen dando lo mismo sin la versión');

console.log('');
if (fallos) {
  console.log('  *** ' + fallos + ' COMPROBACION(ES) NO SIRVEN ***');
  process.exit(1);
}
console.log('    ok  las 2 comprobaciones pasan lo sano y ven lo roto');
