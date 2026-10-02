// QUE NINGÚN "id" ESTÉ REPETIDO EN UNA PÁGINA
// ===========================================
//
// -------------------------------------------------------------------
// POR QUÉ ESTE GUARDIÁN
// -------------------
//
// En "app.html" había tres bloques pegados dos o cuatro veces:
//
//   · la barra de tarjetas, 4 veces            <-- la que se vio en pantalla
//   · los cuatro filtros de la bitácora, 2 veces
//   · el aviso del centro de costo, 2 veces
//
// Y la causa fue la misma en los tres: el guion que pegaba llevaba la guarda mirando un
// archivo donde la palabra NO aparece. Guardaba "app.js" y pegaba en "app.html", así que la
// guarda nunca frenó nada y cada corrida pegaba otra copia. Ver [tarja-07].
//
// -------------------------------------------------------------------
// POR QUÉ HACE FALTA EL GUARDIÁN Y NO SÓLO ARREGLAR
// -----------------------------------------------
//
// Porque un "id" repetido NO da error. El HTML es válido, el JavaScript compila, la pantalla
// carga, y no aparece ni un error en la consola. Peor: "getElementById" se queda con la
// PRIMERA y la segunda queda muerta sin avisar.
//
// En la bitácora eso significaba que se veían dos renglones de filtros y que el segundo
// renglón no filtraba nada. No es que se viera feo: era un control que no funcionaba y que
// el usuario podía usar creyendo que sí. Ver [tarja-12].
//
// -------------------------------------------------------------------
// Y POR QUÉ NO MARCA ERROR EL HTML VÁLIDO
// ---------------------------------------
//
// Porque en la especificación el "id" tiene que ser único, pero los navegadores no lo
// avisan: repiten el elemento con el mismo "id" en la ventana de variables, como si fueran
// variables distintas. Un formulario con dos "name" iguales también es válido y también
// manda los dos valores. Ver [tarja-13].
//
const fs = require('fs');
const path = require('path');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';

// -------------------------------------------------------------------
// LOS ARCHIVOS QUE SE REVISAN
// --------------------------
//
// Y se revisan las de "pages/", que son las de la aplicación, y las de "tools/pruebas/",
// que son copias con una sesión de mentira. Las dos se abren en el navegador y las dos
// tienen que estar sanas.
//
// Y la de la copia importa más de lo que parece: es una copia COMPLETA de "app.html", y
// por lo tanto todos los "id" duplicados de "app.html" aparecen duplicados ahí también. Es
// como se encontraron los tres bloques del turno pasado. Ver [tarja-12].
//
// Y lo que NO se revisa es el resto del proyecto: textos, datos y copias de trabajo, donde
// un "id" repetido no hace nada porque no los abre nadie.
const CARPETAS = ['pages', 'tools/pruebas'];

function htmlDe(carpeta) {
  const salida = [];
  const completo = path.join(RAIZ, carpeta);
  if (!fs.existsSync(completo)) return salida;
  fs.readdirSync(completo).forEach(function (n) {
    if (n.toLowerCase().endsWith('.html')) salida.push(carpeta + '/' + n);
  });
  return salida.sort();
}

// -------------------------------------------------------------------
// LA COMPROBACIÓN
// ---------------
//
// Y se cuentan las apariciones, no se busca la segunda: si un "id" aparece tres veces hay que
// decir "3", porque borrar una y dejar dos sigue roto.
function repetidosDe(texto) {
  const cuenta = {};
  const orden = [];
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    if (cuenta[m[1]] === undefined) { cuenta[m[1]] = []; orden.push(m[1]); }
    cuenta[m[1]].push(texto.slice(0, m.index).split('\n').length);
  }
  return orden.filter(function (k) { return cuenta[k].length > 1; })
    .map(function (k) { return { id: k, lineas: cuenta[k] }; });
}

const archivos = [];
CARPETAS.forEach(function (c) { htmlDe(c).forEach(function (p) { archivos.push(p); }); });

if (!archivos.length) {
  console.log('');
  console.log('    *** NO SE ENCONTRÓ NINGÚN ".html" EN ' + CARPETAS.join(' ni ') + ' ***');
  process.exit(1);
}

console.log('    reviso ' + archivos.length + ' archivo(s): ' + archivos.join(', '));

let malas = 0;

archivos.forEach(function (P) {
  const crudo = fs.readFileSync(RAIZ + P, 'utf8');
  const ids = crudo.split('id="').length - 1;
  const repes = repetidosDe(crudo);

  if (!repes.length) {
    console.log('    ok  ' + P + ': ' + ids + ' "id", ninguno repetido');
    return;
  }

  malas++;
  console.log('');
  console.log('  *** ' + P + ' TIENE ' + repes.length + ' "id" REPETIDOS (de ' + ids + ') ***');
  repes.forEach(function (r) {
    console.log('      id="' + r.id + '"  ' + r.lineas.length + ' veces, en L'
      + r.lineas.join(', L'));
  });
  console.log('    Y eso NO da error en el navegador: "getElementById" se queda con la');
  console.log('    primera y las demás quedan muertas. Ver [tarja-12].');
});

console.log('');
if (malas) {
  console.log('  *** ' + malas + ' ARCHIVO(S) CON "id" REPETIDOS ***');
  process.exit(1);
}
console.log('    ok  ningún "id" está repetido en ninguna página');
