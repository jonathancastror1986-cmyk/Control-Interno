// ARREGLAR LA COMPROBACION DE MOJIBAKE, SIN BARRAS INVERTIDAS
// ===========================================================
//
// -------------------------------------------------------------------
// EL PROBLEMA
// ----------
//
// La comprobación era  /[À-ÿ][ -ÿ]/.test(h)  escrita con los caracteres LITERALES.
//
// Y eso está mal por dos cosas a la vez, y las dos hacen que la comprobación no sirva:
//
//   1. El primer rango, À a ÿ, INCLUYE la coma y la tilde. Son acentos normales. O sea que
//      cualquier línea con un acento normal la marcaba como rota.
//
//   2. El segundo rango empieza en el espacio. Entonces "(a)(b)" con un espacio entre los dos
//      paréntesis da un positivo falso, y "correo electrónico" también.
//
// El resultado era un guardián que marcaba archivos sanos. Y un guardián que marca todo es
// lo mismo que un guardián roto: nadie lo mira, porque aprendió que siempre dice que hay un
// problema. Ver [cache-10].
//
// -------------------------------------------------------------------
// POR QUÉ "String.fromCharCode" Y NO "\u00c3"
// -------------------------------------------
//
// Porque la barra invertida se rompe por capas: yo la escribo, la herramienta la transmite, y
// entre una capa y otra se puede convertir en una barra doble, que en una expresión regular
// deja de ser un escape y pasa a ser un carácter literal.
//
// Y con "String.fromCharCode" no hay barra invertida en el archivo: hay un número. Y el
// número es el número, no se puede equivocar de camino. Ver [cache-11].
//
const fs = require('fs');

// Y el mismo patrón que usa "scan-rotos.js", para que los dos miren lo mismo.
const COMILLA = String.fromCharCode(0xA1);   // la inverted: "¡", primer byte tras Ã
const TILDE = String.fromCharCode(0xFF);     // "ÿ", último byte de una vocal mal escrita
const MOJIBAKE = new RegExp('[' + String.fromCharCode(0xC3) + '][' + COMILLA + '-' + TILDE + ']');

// -------------------------------------------------------------------
// PROBARLO, ANTES DE USARLO
// -------------------------------------------------------------------
// Y porque una comprobación que nunca se prueba es una comprobación que no funciona.
//
// -------------------------------------------------------------------
// Y LA CADENA "ROTA" SE CONSTRUYE, NO SE ESCRIBE
// --------------------------------------------
//
// La primera vez que escribí esto puse la misma cadena sana en los dos casos: escribí un "ñ"
// con "ñ" en el caso que debía estar roto. O sea que la autoprueba no probaba nada y además
// dijo que la comprobación estaba rota, porque en efecto no veía nada.
//
// El mojibake es lo que pasa cuando los bytes UTF-8 de una letra se leen como Latin-1. La "ñ"
// son dos bytes, C3 B1, y leídos mal dan U+00C3 seguido de U+00B1.
//
// Así que la cadena rota se arma con esos dos números. Y el "á" también sirve: son C3 A1. Ver
// [cache-12].
//
const C3 = String.fromCharCode(0xC3);
const ROTO = 'el ni' + C3 + String.fromCharCode(0xB1) + 'o fue a ma' + C3 + String.fromCharCode(0xB1) + 'ana';
const SANO = 'aviso: cargar el ni\u00f1o y la ma\u00f1ana, la direcci\u00f3n de Jos\u00e9 y el a\u00f1o';

if (!MOJIBAKE.test(ROTO)) {
  console.log('');
  console.log('  *** LA COMPROBACIÓN NO VE EL MOJIBAKE ***');
  console.log('    La cadena de prueba debería verse rota y no se ve.');
  process.exit(1);
}
if (MOJIBAKE.test(SANO)) {
  console.log('');
  console.log('  *** LA COMPROBACIÓN MARCA UN ARCHIVO SANO ***');
  console.log('    Y con eso es peor que no comprobara: siempre dice que hay problema.');
  process.exit(1);
}
console.log('    ok  la ve en el roto y deja pasar el sano');

// -------------------------------------------------------------------
// Y AHORA SÍ, SOBRE LOS ARCHIVOS QUE SE PIDAN
// -------------------------------------------------------------------
const rutas = process.argv.slice(2);
if (!rutas.length) {
  console.log('    (sin archivos que comprobar)');
  process.exit(0);
}

let malos = 0;
rutas.forEach((P) => {
  const t = fs.readFileSync(P, 'utf8');
  t.split('\n').forEach((x, i) => {
    const donde = x.indexOf(String.fromCharCode(0xC3));
    // Y se marca solo la parte mala, no la línea entera: la línea entera en un archivo de
    // tres mil es inútil de leer.
    if (MOJIBAKE.test(x)) {
      malos++;
      console.log('  ' + P + ':' + (i + 1) + ': ' + JSON.stringify(x.slice(Math.max(0, donde - 12), donde + 22)));
    }
  });
});

console.log('');
if (malos) {
  console.log('  *** ' + malos + ' MOJIBAKE, en ' + rutas.length + ' archivo(s) ***');
  console.log('    Arreglo: git checkout -- <archivo>, y se escribe de nuevo con Node.');
  process.exit(1);
}
console.log('    ok  ' + rutas.length + ' archivo(s) sin mojibake, con una comprobación probada');
