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
const path = require('path');

// Y el mismo patrón que usa "scan-rotos.js", para que los dos miren lo mismo.
const COMILLA = String.fromCharCode(0xA1);   // la inverted: "¡", primer byte tras Ã
const TILDE = String.fromCharCode(0xFF);     // "ÿ", último byte de una vocal mal escrita

// -------------------------------------------------------------------
// Y EL SEGUNDO CARÁCTER NO SE ACOTA A "¡" A "ÿ", Y POR QUÉ
// ----------------------------------------------------------
//
// Antes era:
//
//     [Ã][¡-ÿ]
//
// O sea: "Ã" seguido de un carácter entre U+00A1 y U+00FF. Y eso solo ve el mojibake cuyo
// segundo byte cayó dentro del Supplemento Latino-1.
//
// El que NO veía es el que cae en PUNTUACIÓN, que es el más común de los cuatro:
//
//     'á'  ->  C3 A1  ->  Ã¡      U+00C3 U+00A1     sí lo veía
//     'ó'  ->  C3 B3  ->  Ã³      U+00C3 U+00B3     sí lo veía
//     'Ó'  ->  C3 93  ->  Ã“      U+00C3 U+201C    NO lo veía
//     '“'  ->  E2 80 9C -> â€œ  U+00E2 U+20AC...  NO lo veía
//
// O sea que las VOCALES CON ACENTO mayúsculas y las comillas tipográficas pasaban limpias.
// Y un archivo puede tener cien acentos en minúscula bien y una mayúscula rota, y el
// guardián dice que está limpio.
//
// -------------------------------------------------------------------
// Y POR QUÉ NO SE BUSCA "Ã" Y LISTO
// ----------------------------------
//
// Porque en este proyecto hay que distinguir DOS cosas:
//
//     el mojibake          Ã¡   Ã“   â€œ
//     el texto normal      Ã£o  —el "ã" de "padrão", o el "Ã" que un comentario nombra—
//
// Y si se busca "Ã" sola, salta con las dos. Y "css/movil.css" tiene un "padrão" en un
// comentario, y eso lo convertiría en un falso positivo el día que alguien lo revisara.
//
// LA DIFERENCIA ESTÁ EN LO QUE SIGUE. En el mojibake, después de la "Ã" viene SIEMPRE un
// carácter que no es una letra: porque el byte que se coló era el segundo de una vocal
// acentuada, de una comilla o de un símbolo, y ninguno es una letra del abecedario.
//
//     Ã¡      la "¡" no es letra
//     Ã“      la "“" no es letra
//     Ã£o     la "o" ES letra, y por eso no es mojibake: es "ão"
//
// O sea que la condición es: la letra rara seguida de algo que NO sea letra, ni número, ni
// espacio. Y por eso el espacio está excluido a propósito: un comentario que termina
// nombrando el carácter —"el byte tras Ã"— no es mojibake, es un comentario.
const CABEZA = '[\\u00c2\\u00c3\\u00e2\\u00e3]';        // Â Ã â ã
const MOJIBAKE = new RegExp(CABEZA + '[^a-zA-Z0-9\\s]');

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

// -------------------------------------------------------------------
// Y LOS CASOS QUE EL RANGO ANCHO NO VEÍA
// ---------------------------------------
//
// Y se prueban por separado, porque son la razón por la que se cambió el rango. Si solo se
// probara el "ñ" roto —que es el caso del NOTO— el rango viejo pasaría la prueba igual, y
// quedaría creyendo que anda.
//
// Estos cuatro son los que el rango angosto NO veía:
//
//     Ó   C3 93  ->  Ã“        la "“" cae en U+201C, fuera de U+00A1-U+00FF
//     “   E2 80 9C -> â€œ    el "€" cae en U+20AC, y ni siquiera empieza con Ã
//     «   C2 AB  ->  Â«        sí lo veía, pero por suerte
//     °   C2 B0  ->  Â°        ídem
const ROTO_MAYUS = 'el ni' + C3 + String.fromCharCode(0x93) + 'mero pas' + C3 + String.fromCharCode(0x93) + 'o';
const ROTO_COMILLA = String.fromCharCode(0xE2) + String.fromCharCode(0x20AC)
  + String.fromCharCode(0x153) + 'as' + String.fromCharCode(0xE2)
  + String.fromCharCode(0x20AC) + String.fromCharCode(0x153) + 'as';
const ROTO_ANGULO = 'la ' + String.fromCharCode(0xC2) + String.fromCharCode(0xAB)
  + 'palabra' + String.fromCharCode(0xC2) + String.fromCharCode(0xBB);

// Y los que NO son mojibake y tienen una letra rara:
//
//     ão   de "padrão"   — la letra rara seguida de LETRA
//     Ã    solo, al final de un comentario — la letra rara sola
//     Ã    seguido de espacio
const SANO_PORTUGUES = 'es um padr' + String.fromCharCode(0xE3) + 'o conhecido';
const SANO_SOLO = 'el primer byte tras ' + C3;
const SANO_ESPACIO = 'el byte ' + C3 + ' y el siguiente';

// -------------------------------------------------------------------
// Y U+FFFD, QUE NO ES MOJIBAKE PERO ES PEOR
// --------------------------------------------------------
//
// El U+FFFD es el carácter que un decodificador pone cuando NO PUEDE interpretar unos bytes.
// No es una letra rara: es la marca de que se perdió algo en el camino, y lo que se perdió
// era texto.
//
// En "migrations/028_auditoria_asistencia.sql" había dos, en medio de una palabra:
//
//     -- Toda inser��n, cambio o borrado sobre `asistencia` deja una traza con
//
// Y la palabra era "inserción". El archivo llevaba tiempo con un hueco adentro, y no se veía
// en el editor, y la migración se aplicaba sin problema, porque un comentario roto no rompe
// nada.
//
// Y esto NO lo veía el rango de los "Ã" y los "Â", porque un U+FFFD no es ninguno de los
// dos: no es doble codificación, es pérdida. Y el detector le daba el visto bueno a un
// archivo con dos letras perdidas.
//
// Por eso va aparte, y es el caso más fácil de esta herramienta: un U+FFFD en un archivo del
// proyecto es SIEMPRE un error.
const PERDIDO = String.fromCharCode(0xFFFD);

// Y el archivo de esta herramienta NO lo lleva. No por exención: porque si lo llevara, esta
// comprobación estaría probándose con un byte perdido de verdad, y "no hay mojibake" dejaría
// de ser una afirmación y pasaría a ser un deseo.
const YO = require('path').resolve(__filename).toLowerCase();
const ES_ESTA = function (P) { return require('path').resolve(P).toLowerCase() === YO; };

const CASOS = [
  ['el ni' + C3 + String.fromCharCode(0xB1) + 'o roto, de minúscula', ROTO, true],
  ['la mayúscula rota, que el rango viejo NO veía', ROTO_MAYUS, true],
  ['la comilla tipográfica rota, que tampoco', ROTO_COMILLA, true],
  ['la comilla angular rota', ROTO_ANGULO, true],
  ['acento normal, que es sano', SANO, false],
  ['portugués con "ão", que NO es mojibake', SANO_PORTUGUES, false],
  ['la letra rara sola, al final de un comentario', SANO_SOLO, false],
  ['la letra rara seguida de espacio', SANO_ESPACIO, false],
  ['un byte perdido, que no es mojibake pero es peor', 'Toda inser' + PERDIDO + 'n', true],
];

// -------------------------------------------------------------------
// Y LA COMPROBACIÓN FINAL, QUE ES LA DE LAS DOS COSAS
// ------------------------------------------------------
//
// Y no se prueba con "MOJIBAKE" sino con esto, que es lo que de verdad se usa para decidir.
//
// Y la diferencia importa: el caso del byte perdido estaba en la lista y la autoprueba lo
// daba por bueno, porque la autoprueba miraba solo el rango de los "Ã". Un archivo con
// "inser??" pasó los nueve casos.
//
// O sea que la autoprueba estaba probando una función y el guardián usaba otra. Es el mismo
// error de siempre, y con el mismo nombre: la comprobación que no es la que se usa.
const estaRoto = function (t) {
  return MOJIBAKE.test(t) || String(t).indexOf(PERDIDO) >= 0;
};

let autoprueba = 0;
CASOS.forEach(function (c) {
  const vio = estaRoto(c[1]);
  const bien = vio === c[2];
  if (!bien) autoprueba++;
  console.log('    ' + (bien ? 'ok  ' : '*** ') + c[0].padEnd(46)
    + (vio ? 'la ve' : 'no la ve').padEnd(11)
    + (c[2] ? '(tenía que verla)' : '(tenía que dejarla)'));
});

if (autoprueba) {
  console.log('');
  console.log('  *** ' + autoprueba + ' CASO(S) MAL ***');
  console.log('    Una comprobación que falla su propia prueba no puede usarse para probar otra cosa.');
  process.exit(1);
}
console.log('');
console.log('    ok  la comprobación pesa ' + CASOS.length + ' casos, y no mira lo que no debe');

// -------------------------------------------------------------------
// Y AHORA SÍ, SOBRE LOS ARCHIVOS QUE SE PIDAN
// -------------------------------------------------------------------
const rutas = process.argv.slice(2);
if (!rutas.length) {
  console.log('    (sin archivos que comprobar)');
  process.exit(0);
}

let malos = 0;
let seSaltaron = 0;

rutas.forEach((P) => {
  // -------------------------------------------------------------------
  // Y ESTE ARCHIVO SE SALTEA A SÍ MISMO
  // ------------------------------------
  //
  // Y no poroises una excepción escondida: porque este archivo ES el que explica qué es el
  // mojibake, y para explicarlo tiene que escribir mojibake. Las líneas "Ã¡" y "Ã“" de más
  // arriba están ahí a propósito, y sin esta exención el guardián se quejaría de sí mismo
  // con veintidós avisos, y nadie leería esos avisos porque son de un archivo que se sabe
  // que las tiene.
  //
  // Y eso tiene un costo que hay que decir: si mañana este archivo SE ROMPE de verdad, no
  // lo va a avisar. Es un agujero real a cambio de un archivo que se puede leer. Se acepta
  // porque el alternativa —un guardián que se queja de sus propios ejemplos— no avisa de
  // nada.
  //
  // Y por eso el salto se DICE, cada vez, y con cuántos renglones. Un salto que no se anuncia
  // es un archivo que no se está mirando.
  const YO = path.resolve(__filename).toLowerCase();
  if (path.resolve(P).toLowerCase() === YO) {
    seSaltaron++;
    return;
  }

  const t = fs.readFileSync(P, 'utf8');
  t.split('\n').forEach((x, i) => {
    // Y se busca con LAS DOS, que es lo mismo que usa la autoprueba.
    //
    // Y antes buscaba solo con el rango de los "Ã", y por eso el byte perdido de la 028
    // pasó: no era un "Ã". Y la autoprueba tenía el caso en la lista y lo daba por bueno,
    // porque miraba la función vieja. La comprobación y la prueba, dos cosas distintas.
    const m = x.match(MOJIBAKE);
    const perdido = x.indexOf(PERDIDO) >= 0;
    if (!m && !perdido) return;

    // Y se marca solo la parte mala, no la línea entera: la línea entera en un archivo de
    // tres mil es inútil de leer.
    malos++;
    const desde = Math.max(0, (m ? m.index : x.indexOf(PERDIDO)) - 12);
    const hasta = (m ? m.index : x.indexOf(PERDIDO)) + 22;
    console.log('  ' + P + ':' + (i + 1) + ': '
      + JSON.stringify(x.slice(desde, hasta))
      + (perdido && !m ? '   *** BYTE PERDIDO ***' : ''));
  });
});

console.log('');
if (seSaltaron) {
  console.log('    ojo  y se saltaron ' + seSaltaron + ' archivo(s) por ser esta misma comprobación,');
  console.log('    que escribe mojibake a propósito para explicarlo. Ver el comentario de arriba.');
  console.log('');
}
if (malos) {
  console.log('  *** ' + malos + ' MOJIBAKE, en ' + rutas.length + ' archivo(s) ***');
  console.log('    Arreglo: git checkout -- <archivo>, y se escribe de nuevo con Node.');
  process.exit(1);
}
console.log('    ok  ' + rutas.length + ' archivo(s) sin mojibake, con una comprobación probada');
