// ===================================================================
// PRUEBA-CONCILIACION
// ===================================================================
// LOS ONCE CASOS REALES DE LA CONCILIACIÓN, CONTRA LA LISTA ÚNICA
//
// ---------------------------------------------------------------------
// POR QUE UNA PRUEBA Y NO SÓLO MIRAR EL CÓDIGO
// ---------------------------------------------------------------------
//
// Porque los dos bugs que se corrigieron salían de una línea: "conciliarDia" miraba
// sólo el estado "X". Con "X" todo anda bien, porque "X" es el caso fácil. El
// código se puede leer entero y parecer correcto.
//
// Y sin pantalla ni base, porque el clasificador es una función pura: recibe lo que
// se sabe de una persona y devuelve un nombre. Eso se puede comprobar con once
// casos, y son los once que se miden.
//
// ---------------------------------------------------------------------
// Y LOS ONCE CASOS SON LOS QUE PASARON EN LA VIDA REAL
// ---------------------------------------------------------------------
//
// No son inventados para que el código pase. Salen de los ocho estados que acepta
// "asistencia" —'X','F','P','L','A','PP','V','LL'— más los dos casos sin fila.
//
// ---------------------------------------------------------------------
// Y EL QUE MÁS IMPORTABA
// ---------------------------------------------------------------------
//
// El de "F" con marcaje. Antes decía "falta marcar en la planilla" y ofrecía el
// botón de marcar. Ahora tiene que decir "contradictorio" y NO ofrecer marcar.

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

// Y SE COPIA EL CÓDIGO REAL, PARA QUE LA PRUEBA NO SEA DE OTRA COSA
//
// Si la prueba tuviera su propia copia del clasificador, las dos podrían estar
// bien y la pantalla hacer otra cosa. Se saca del archivo que se usa en la app.
const src = fs.readFileSync(path.join(RAIZ, 'js/conciliacion.js'), 'utf8');
const desde = src.indexOf('const ESTADOS_JUSTIFICADOS');
// Y SE CORTA POR "const SITUACIONES", Y NO POR LA LÍNEA DE COMENTARIO QUE LA
// PRECEDE
//
// La primera versión buscaba la línea de guiones del comentario, con "\n" pelado.
// Y el archivo está con fines de línea CRLF, que es lo que deja git en Windows. Un
// "indexOf" con "\n" no encuentra "\r\n", así que el corte daba -1 y el bloque
// sale vacío: la prueba fallaba por el fin de línea y no por lo que prueba.
//
// Cortar por el "const" y después sacar las líneas de comentario del final es a
// prueba de CRLF y de LF.
const hasta = src.indexOf('const SITUACIONES');
if (desde < 0 || hasta < 0 || hasta <= desde) {
  console.log('  *** no se encontró el bloque del clasificador en js/conciliacion.js');
  process.exit(1);
}
let bloque = src.slice(desde, hasta);
const lineas = bloque.split(/\r\n|\n|\r/);
while (lineas.length && /^\s*\/\//.test(lineas[lineas.length - 1])) lineas.pop();
bloque = lineas.join('\n');
// Y "minutosDe" NO ESTÁ EN "conciliacion.js": YA EXISTE EN "administracion.js"
//
// Se copia desde SU archivo, por la misma razón que "fechaCorta" en la prueba de
// los campos del contrato: si la prueba usara su propia versión, probaría una
// función que la aplicación no usa. Y si aquélla desapareciera de allá, esta
// prueba tiene que romperse, que es lo que tiene que pasar.
const srcAd = fs.readFileSync(path.join(RAIZ, 'views/administracion/administracion.js'), 'utf8');
const iMin = srcAd.indexOf('function minutosDe(');
if (iMin < 0) {
  console.log('  *** no se encontró "minutosDe" en administracion.js, y conciliacion.js lo necesita');
  process.exit(1);
}
const fMin = srcAd.indexOf('\n}', iMin) + 2;
bloque += '\n' + srcAd.slice(iMin, fMin);
const api = new Function(bloque
  + '\nreturn {clasificarConciliacion,situacionDe,desempatePorHora,diferenciaDeMinutos,minutosDe,TOLERANCIA_MIN,ESTADOS_JUSTIFICADOS};')();
console.log('  el bloque copiado mide ' + bloque.length + ' caracteres');

function p(estado, hora) {
  if (estado === null || estado === undefined) return null;
  return { estado: estado, hora_llegada: hora || null };
}
// Y CADA CASO TRAE SU PROPIA HORA DE RELOJ
//
// La primera versión usaba un "reloj" fijo de 08:05 para los once casos, así que el
// caso de "30 minutos de diferencia" comparaba 08:00 contra 08:05 y salía
// "coincide". La prueba fallaba por el motivo equivocado: no probaba lo que decía
// probar, y el fallo no existía.
function relojDe(hora) {
  return hora ? { hora: hora, tipo: 'entrada' } : null;
}

// ---------------------------------------------------------------------
// LOS CASOS
// ---------------------------------------------------------------------
const CASOS = [
  // --- LOS QUE YA ESTABAN BIEN ---
  ['X', '08:00', '08:05', 'coincide',
    'los dos dicen presente y la hora está dentro de la tolerancia'],
  ['X', '08:00', '08:30', 'diferencia_hora',
    'los dos dicen presente pero con 30 minutos de diferencia'],
  ['X', '08:20', '08:00', 'diferencia_hora',
    'el reloj dice que entró ANTES de lo que dice la planilla: también es diferencia'],
  ['X', '08:10', '08:00', 'coincide',
    '10 minutos antes: es el borde de la tolerancia, y coincide'],
  ['X', null, '08:05', 'diferencia_hora_o_coincide',
    'NO hay hora en la planilla para comparar: no se puede afirmar que difieren'],
  ['X', null, null, 'sin_marcaje',
    'presente en la planilla, el reloj no registró nada'],

  // --- EL GRAVE: LA PLANILLA DICE AUSENTE Y EL RELOJ DICE QUE ENTRO ---
  ['F', null, '08:05', 'contradictorio',
    '*** este es el que se corrigió: antes decía "falta marcar" y ofrecía marcar'],
  ['F', null, null, 'ausente_coherente',
    'ausente y sin marcaje: es la única combinación coherente'],

  // --- LOS SEIS QUE SALÍAN COMO "SIN REGISTRO EN NINGUNO" ---
  ['L', null, null, 'justificado', 'licencia: no tiene por qué haber marcaje'],
  ['P', null, null, 'justificado', 'permiso'],
  ['V', null, null, 'justificado', 'vacaciones'],
  ['A', null, null, 'justificado', 'accidente mutual'],
  ['PP', null, null, 'justificado', 'permiso pagado'],
  ['LL', null, null, 'justificado',
    '*** día lluvia: es un estado de la base que NO estaba en la lista de justificados'],

  // --- LA PLANILLA QUE NO LO TIENE ---
  [null, null, '08:05', 'falta_en_planilla',
    'el reloj lo tiene y la planilla no: sí se puede marcar'],
  [null, null, null, 'ninguno', 'no hay nada en ninguno de los dos'],
];

console.log('  ---- los casos reales ----');
let mal = 0;
CASOS.forEach(function (c) {
  const situacion = api.situacionDe(p(c[0], c[1]), relojDe(c[2]));
  const ok = situacion === c[3];
  if (!ok) mal++;
  console.log('    ' + (ok ? 'ok  ' : '*** ')
    + ('[' + (c[0] || 'sin fila') + ' / reloj ' + (c[2] ? c[2].slice(0, 5) : 'no') + ']').padEnd(26)
    + '-> ' + situacion
    + (ok ? '' : '   esperaba ' + c[3]));
  if (c[4]) console.log('         ' + c[4]);
});

console.log('');
console.log('  ---- el caso grave, detallado ----');
const grave = api.situacionDe(p('F'), relojDe('08:05'));
const conMarcar = grave === 'falta_en_planilla';
console.log('    ' + (conMarcar ? '*** ' : 'ok  ') + 'planilla F + marcaje: ' + grave
  + '   (no puede ser "falta marcar")');
if (conMarcar) mal++;
const vieja = (function () {
  // Y EL CÁLCULO VIEJO, COPIADO, PARA COMPARAR
  const presenteEnPlanilla = !!p('F') && p('F').estado === 'X';
  return (relojDe('08:05') && !presenteEnPlanilla) ? 'falta_marcar' : 'otra';
})();
console.log('    el cálculo anterior daba: ' + vieja
  + (vieja === 'falta_marcar' ? '   <-- por eso estaba el bug' : ''));

console.log('');
console.log('  ---- la tolerancia, y va en los dos sentidos ----');
const con10 = api.desempatePorHora(p('X', '08:00'), { hora: '08:10:00' });
const con11 = api.desempatePorHora(p('X', '08:00'), { hora: '08:11:00' });
const antes10 = api.desempatePorHora(p('X', '08:00'), { hora: '07:50:00' });
const antes11 = api.desempatePorHora(p('X', '08:00'), { hora: '07:49:00' });
console.log('    ' + (con10 === 'coincide' ? 'ok  ' : '*** ') + '10 min después: ' + con10 + '   (tiene que coincidir)');
console.log('    ' + (con11 === 'diferencia_hora' ? 'ok  ' : '*** ') + '11 min después: ' + con11 + '   (tiene que diferir)');
console.log('    ' + (antes10 === 'coincide' ? 'ok  ' : '*** ') + '10 min ANTES:   ' + antes10 + '  (también coincide)');
console.log('    ' + (antes11 === 'diferencia_hora' ? 'ok  ' : '*** ') + '11 min antes:   ' + antes11 + '  (también difiere)');
if (con10 !== 'coincide' || con11 !== 'diferencia_hora'
    || antes10 !== 'coincide' || antes11 !== 'diferencia_hora') mal++;

console.log('');
console.log('  ---- y que "sin hora" no seija como coincidencia perfecta ----');
const sinHora = api.diferenciaDeMinutos(relojDe('08:05'), p('X'));
console.log('    ' + (sinHora === null ? 'ok  ' : '*** ') + 'la planilla sin hora devuelve: ' + sinHora
  + '   (tiene que ser null, no 0: 0 sería "las dos dicen 08:00")');
if (sinHora !== null) mal++;
const ceroReal = api.diferenciaDeMinutos({ hora: '08:00:00' }, p('X', '08:00'));
console.log('    ' + (ceroReal === 0 ? 'ok  ' : '*** ') + 'las dos a las 08:00 devuelve: ' + ceroReal + '   (cero de verdad)');
if (ceroReal !== 0) mal++;

console.log('');
console.log('  ---- y que la hora no dependa de la zona horaria ----');
// Y POR QUE SE PARTE EL TEXTO Y NO SE USA UNA FECHA
//
// "new Date('08:30')" en JavaScript es una fecha de 2001-08-30 en hora local. Si
// la máquina está en otra zona, la cuenta sale distinta. Y una diferencia de horas
// no puede depender de dónde se miró.
const texto = api.minutosDe('08:30');
const conZona = new Date('08:30').getHours();
console.log('    ' + (texto === 510 ? 'ok  ' : '*** ') + '"08:30" son ' + texto + ' minutos (8*60+30=510)');
console.log('    ' + (conZona !== 8 ? 'ok  ' : '*** ') + 'new Date("08:30") daría la hora ' + conZona
  + ': por eso no se usa una fecha');
if (texto !== 510) mal++;

console.log('');
if (mal) {
  console.log('  *** ' + mal + ' CASO(S) MAL');
  process.exit(1);
}
console.log('  ok  los once casos, el caso grave, la tolerancia y el null que no es cero.');