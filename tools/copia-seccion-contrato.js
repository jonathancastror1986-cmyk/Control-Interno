// COPIA LA SECCIÓN NUEVA AL EDITOR DE PRUEBAS, SIN ESCRIBIRLA DOS VECES
//
// Y POR QUÉ ESTE GUION EXISTE
//
// Porque "tools/pruebas/app-sin-login.html" tiene SU PROPIA COPIA del formulario
// del trabajador, para poder probar sin iniciar sesión. Y esa copia se wrote a
// mano, una vez. Después se desincronizó: se le agregaron campos a "app.html" y la
// de pruebas quedó con la versión vieja.
//
// Y EL RESULTADO DE ESA DESINCRONIZACIÓN ES EL PEOR
//
// No es que falte un campo. Es que el formulario de pruebas NO TIENE el campo, y
// una prueba que corre ahí puede dar verde mientras la pantalla real está rota. O
// al revés: uno corrige en el archivo que no es el que se abre, y el cambio no se
// ve.
//
// Y POR QUÉ SE COPIA EL BLOQUE Y NO SE ESCRIBE DE NUEVO
//
// Porque las dos versiones escritas a mano siempre terminan diferentes: una lleva
// un texto de ayuda y la otra no, y nadie sabe cuál es la buena. Copiando el mismo
// bloque, son el mismo texto por construcción.
//
// Y SOLO COPIA LA SECCIÓN NUEVA, NO TODO EL FORMULARIO
//
// Porque el resto ya está y copiarlo entero reescribiría cosas que funcionan.
const fs = require('fs');
const R = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const ORIGEN = R + 'pages/app.html';
const DESTINO = R + 'tools/pruebas/app-sin-login.html';

// Y LOS DOS EXTREMOS DEL BLOQUE, QUE SON LO QUE LO DEFINEN
const DESDE = '<div class="w-seccion">\r\n      <h4>Datos para el contrato</h4>';
const DESDE_LF = '<div class="w-seccion">\n      <h4>Datos para el contrato</h4>';
const HASTA = '<h4>Datos de contratación</h4>';

function bloqueEn(texto) {
  // Y EL ARCHIVO PUEDE ESTAR CON FINES DE LÍNEA NORMALES O NO: los de git salen
  // con CR LF en Windows. Se buscan las dos formas, y se devuelve el bloque tal
  // cual estaba, para no cambiarle los fines de línea al pegar.
  const iCr = texto.indexOf(DESDE);
  const iLf = texto.indexOf(DESDE_LF);
  let i = -1;
  if (iCr >= 0 && (iLf < 0 || iCr <= iLf)) i = iCr;
  else if (iLf >= 0) i = iLf;
  if (i < 0) return null;
  // Y HASTA EL "<h4>" DE LA SECCIÓN SIGUIENTE, QUE ES LA QUE VA DESPUÉS
  const j = texto.indexOf(HASTA, i);
  if (j < 0) return null;
  return texto.slice(i, j + HASTA.length);
}

const origen = fs.readFileSync(ORIGEN, 'utf8');
const bloque = bloqueEn(origen);
if (!bloque) {
  console.log('  *** no se encontró la sección en app.html');
  process.exit(1);
}
console.log('  el bloque en app.html mide ' + bloque.length + ' caracteres');
console.log('  trae ' + (bloque.match(/id="w-/g) || []).length + ' campos');

let destino = fs.readFileSync(DESTINO, 'utf8');

// Y SI YA ESTÁ, SE SACA PRIMERO, PARA QUE CORRER EL GUION DOS VECES NO DUPLIQUE
const viejo = bloqueEn(destino);
if (viejo) {
  destino = destino.replace(viejo, '');
  console.log('  estaba la versión anterior: se saca antes de pegar');
}
if (destino.indexOf('w-contrato-tipo-plazo') >= 0) {
  console.log('  *** quedó "w-contrato-tipo-plazo" y no estaba la versión vieja: no se toca');
  process.exit(1);
}

// Y SE PEGA EN EL MISMO LUGAR: antes de "Datos de contratación"
const ancla = '<h4>Datos de contratación</h4>';
const k = destino.indexOf(ancla);
if (k < 0) {
  console.log('  *** en el editor de pruebas no está "Datos de contratación"');
  process.exit(1);
}
// Y EL "<div class=\"w-seccion\">" QUE ABRE ESA SECCIÓN VIENE ANTES DEL "<h4>"
const abre = destino.lastIndexOf('<div class="w-seccion">', k);
destino = destino.slice(0, abre) + bloque + destino.slice(abre);

fs.writeFileSync(DESTINO, destino, 'utf8');
console.log('  pegado en el editor de pruebas');

// Y SE COMPRUEBA QUE AHORA TIENE LO MISMO
const despues = fs.readFileSync(DESTINO, 'utf8');
const campos = [...origen.matchAll(/id="(w-(?:fecha-nac|estado-civil|nacionalidad|profesion|comuna|contrato-[a-z-]+))"/g)].map(function (m) { return m[1]; });
const faltan = campos.filter(function (c) { return despues.indexOf('id="' + c + '"') < 0; });
console.log('');
console.log('  campos nuevos que hay que copiar: ' + campos.length);
campos.forEach(function (c) {
  console.log('    ' + (despues.indexOf('id="' + c + '"') >= 0 ? 'ok  ' : '*** ') + c);
});
if (faltan.length) {
  console.log('  *** ' + faltan.length + ' quedaron afuera');
  process.exit(1);
}
console.log('');
console.log('  ok  los dos archivos tienen los mismos ' + campos.length + ' campos del contrato');