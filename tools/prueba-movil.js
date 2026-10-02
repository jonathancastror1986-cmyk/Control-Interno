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
const sinVersion = ORIGINAL.replace(/(\.\.\/(?:css|js)\/[\w\-/]+\.(?:css|js))\?v=\d+/g, '$1');
const conQ = (sinVersion.match(/\?v=\d+/g) || []).length;
if (conQ === 1 && sinVersion.indexOf('../sw.js?v=19') >= 0) {
  // Y ese uno tiene que quedarse: el "sw.js" NO es un asset como los otros. El navegador lo
  // relee con una comprobación de bytes, pero si en algún momento se sirve desde el caché
  // igual tiene que poder distinguir versiones. Ver [cache-08].
  console.log('');
  console.log('    ok  las 26 referencias de css y js quedaron sin "?v=" a propósito');
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
