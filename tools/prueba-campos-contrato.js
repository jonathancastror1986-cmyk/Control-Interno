// LOS NUEVE CAMPOS DEL CONTRATO, CONTRA LO QUE ESCRIBE UN CONTRATO CHILENO
//
// Se copia el codigo real de "views/bodega/bodega.js" y se corre con fichas de
// mentira que tienen los cuatro tipos de plazo y los estados sin llenar.
//
// Y POR QUE SE COPIA EL CODIGO Y NO SE REESCRIBE
//
// Porque reescribir el codigo en la prueba seria probar otra cosa. Si el codigo
// tiene un error de tilde o una coma mal puesta, la prueba tiene que fallar
// tambien; si la prueba tiene su propia version, las dos pueden estar bien y la
// pantalla mostrar otra cosa.
const fs = require('fs');
const R = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const src = fs.readFileSync(R + 'views/bodega/bodega.js', 'utf8');

function trozo(desde, hasta, archivo) {
  const t = archivo ? fs.readFileSync(R + archivo, 'utf8') : src;
  const i = t.indexOf(desde);
  const j = t.indexOf(hasta, i + desde.length);
  if (i < 0 || j < 0 || j <= i) throw new Error('no se encontro: ' + desde + ' .. ' + hasta);
  return t.slice(i, j);
}
const cuerpo = trozo('function fechaLarga(', 'async function descargarEntrega');
// Y "fechaCorta" NO ESTA EN BODEGA.JS: se usa la de "documentos.js", porque los
// archivos comparten el ámbito y repetirla sería pisarla. Si esa función cambia
// de lugar, esta prueba tiene que romper, y por eso se saca de SU archivo.
const fechaCortaReal = trozo('function fechaCorta(iso)', '// EL FILTRO DE RELOJES',
  'views/administracion/documentos.js');
const REEMPLAZO = cuerpo + '\n' + fechaCortaReal
  + '\nreturn {reemplazarCampos,fechaLarga,fechaCorta,plazoDelContrato,domicilioDelContrato,marcadoresSinLlenar};';
const api = new Function(REEMPLAZO)();

// Y LAS DEPENDENCIAS DE MENTIRA
//
// Y "empresaActual" y "empresas" tambien hacen falta, porque el recorte del
// codigo REAL arrastra "empresaDelPapel", que los usa. Si no se definen, el error
// es "empresaActual is not defined" y la prueba falla por una razon que no es la
// que se esta probando.
globalThis.empresaActual = 1;
globalThis.empresas = [{ id: 1, nombre: 'URBANIZA CONSTRUCTORA S.A.', rut: '76.361.420-4' }];
globalThis.especialidadNombre = () => '';
globalThis.centroDeRelojDe = () => '';
globalThis.codigoMostrar = (c) => '00' + String(c).replace(/\D/g, '');
globalThis.relojes = [];

const BASE = {
  code: '001', name: 'Jonathan Antonio Castro Rocha', nombreCompleto: 'Jonathan Antonio Castro Rocha',
  rut: '11285312k', spec: 'Ayudante bodega', especialidad_clave: null,
  direccion: 'PJE LA ESCUADRA NRO.743', comuna: 'PUENTE ALTO',
  nacionalidad: 'Chileno/a', estado_civil: 'Casado(a)', profesion: 'Maestro de obras',
  fecha_nac: '1959-09-09', fecha_ingreso: '2023-02-01',
};

function ficha(extra) { return Object.assign({}, BASE, extra); }

// Y LOS RESULTADOS QUE TIENEN QUE SALIR
// Y LA ESPERA SE ESCRIBE COMO EL CONTRATO LO DICE, Y EL DATO COMO VIENE DE LA BASE
const ESPERA_FECHA = [
  ['1959-09-09', '9 de Septiembre de 1959'],
  ['2026-12-31', '31 de Diciembre de 2026'],
  ['2024-01-01', '1 de Enero de 2024'],
  ['2026-07-05', '5 de Julio de 2026'],
];
const ESPERA_PLAZO = [
  [{}, ''],
  [{ contrato_tipo_plazo: 'indefinido' }, 'indefinido'],
  [{ contrato_tipo_plazo: 'partida' }, 'por partida de contrato'],
  [{ contrato_tipo_plazo: 'dias', contrato_plazo_dias: 90 }, 'por 90 días'],
  [{ contrato_tipo_plazo: 'dias', contrato_plazo_dias: 1 }, 'por 1 día'],
  [{ contrato_tipo_plazo: 'fecha', contrato_fecha_hasta: '2026-12-31' }, 'hasta el 31 de Diciembre de 2026'],
  // Y LOS QUE ESTAN A MEDIAS NO SE INVENTAN NADA
  [{ contrato_tipo_plazo: 'dias' }, ''],
  [{ contrato_tipo_plazo: 'fecha' }, ''],
  [{ contrato_tipo_plazo: 'dias', contrato_plazo_dias: 0 }, ''],
  [{ contrato_tipo_plazo: 'cualquier cosa' }, ''],
];

let mal = 0;
console.log('  ---- la fecha como la escribe un contrato ----');
ESPERA_FECHA.forEach(function (c) {
  const ok = api.fechaLarga(c[0]) === c[1];
  if (!ok) mal++;
  console.log('    ' + (ok ? 'ok  ' : '*** ') + c[0] + '  ->  ' + JSON.stringify(api.fechaLarga(c[0]))
    + (ok ? '' : '   esperaba ' + JSON.stringify(c[1])));
});

console.log('');
console.log('  ---- el plazo, las cuatro formas ----');
ESPERA_PLAZO.forEach(function (par) {
  const sale = api.plazoDelContrato(ficha(par[0]));
  const ok = sale === par[1];
  if (!ok) mal++;
  const e = par[0];
  const desc = e.contrato_tipo_plazo
    ? e.contrato_tipo_plazo + (e.contrato_plazo_dias != null ? '/' + e.contrato_plazo_dias : '') + (e.contrato_fecha_hasta ? '/' + e.contrato_fecha_hasta : '')
    : '(sin plazo)';
  console.log('    ' + (ok ? 'ok  ' : '*** ') + desc.padEnd(28) + '-> ' + JSON.stringify(sale)
    + (ok ? '' : '   esperaba ' + JSON.stringify(par[1])));
});

console.log('');
console.log('  ---- el domicilio, que es direccion Y comuna ----');
// Y AQUÍ NO SE USA "ficha()", PORQUE ESA MEZCLA CON LA BASE Y NUNCA QUEDARIA SIN
// DIRECCION: los tres casos sin direccion saldrían con la de la base, y la
// prueba pasaría probando otra cosa.
[[{ direccion: 'PJE LA ESCUADRA NRO.743', comuna: 'PUENTE ALTO' }, 'PJE LA ESCUADRA NRO.743, comuna PUENTE ALTO'],
 [{ direccion: 'PJE LA ESCUADRA NRO.743', comuna: '' }, 'PJE LA ESCUADRA NRO.743'],
 [{ direccion: '', comuna: 'PUENTE ALTO' }, 'PUENTE ALTO'],
 [{ direccion: '', comuna: '' }, ''],
 [{ direccion: '  ', comuna: '  ' }, '']].forEach(function (c) {
  const sale = api.domicilioDelContrato(Object.assign({}, BASE, c[0]));
  const ok = sale === c[1];
  if (!ok) mal++;
  console.log('    ' + (ok ? 'ok  ' : '*** ') + JSON.stringify(c[1]) + (ok ? '' : '   salio ' + JSON.stringify(sale)));
});

console.log('');
console.log('  ---- el reemplazo, con los nueve campos ----');
const CASOS = [
  ['[FECHA_NAC]', '9 de Septiembre de 1959'],
  ['[ESTADO_CIVIL]', 'Casado(a)'],
  ['[NACIONALIDAD]', 'Chileno/a'],
  ['[PROFESION]', 'Maestro de obras'],
  ['[COMUNA]', 'PUENTE ALTO'],
  ['[DOMICILIO]', 'PJE LA ESCUADRA NRO.743, comuna PUENTE ALTO'],
  ['[PLAZO]', 'por 90 días'],
  ['{{plazo}}', 'por 90 días'],
  ['[FECHA_HASTA]', '31 de Diciembre de 2026'],
  ['[FECHA_INICIO_CONTRATO]', '1 de Febrero de 2023'],
  // Y LA CLÁUSULA COMPLETA DEL CONTRATO REAL
  ['nacido(a) el [FECHA_NAC], domiciliado(a) en [DOMICILIO], de estado civil [ESTADO_CIVIL]',
   'nacido(a) el 9 de Septiembre de 1959, domiciliado(a) en PJE LA ESCUADRA NRO.743, comuna PUENTE ALTO, de estado civil Casado(a)'],
];
const w = ficha({ contrato_tipo_plazo: 'dias', contrato_plazo_dias: 90, contrato_fecha_hasta: '2026-12-31' });
CASOS.forEach(function (c) {
  const sale = api.reemplazarCampos(c[0], w, {});
  const ok = sale === c[1];
  if (!ok) mal++;
  console.log('    ' + (ok ? 'ok  ' : '*** ') + c[0].slice(0, 44));
  if (!ok) console.log('          esperado: ' + JSON.stringify(c[1]) + '\n          salio:    ' + JSON.stringify(sale));
});

console.log('');
console.log('  ---- y los marcadores SIN LLENAR que hay que avisar ----');
// Y AQUÍ LA FICHA ES DELGADA A PROPÓSITO: sin fecha de nacimiento, sin estado
// civil, sin comuna. Con la ficha completa no queda ningún marcador, que es
// justamente el caso que hay que comprobar al revés.
const SIN_DATOS = {
  code: '001', name: 'Jonathan Antonio Castro Rocha', rut: '',
  fecha_nac: null, estado_civil: null, nacionalidad: null,
  profesion: null, comuna: null, direccion: null,
  contrato_tipo_plazo: null, contrato_plazo_dias: null,
  contrato_fecha_inicio: null, contrato_fecha_hasta: null,
};
const CASOS_HUECO = [
  // Y EL RUT VACIO TAMBIEN AVISA: ES JUSTO LO QUE PASO EN UN PDF REAL, CON EL
  // NOMBRE BIEN PUESTO AL LADO Y EL "RUT: {{rut}}" EN MEDIO DE LA CLAUSULA
  ['{{nombre}} {{rut}} {{fecha_nac}}', ['rut', 'fecha_nac']],
  ['[ESTADO_CIVIL] y [COMUNA]', ['estado_civil', 'comuna']],
  ['el plazo es [PLAZO] y termina [FECHA_HASTA]', ['plazo', 'fecha_hasta']],
  // Y QUE CUENTE UN DATO UNA SOLA VEZ, AUNQUE ESTE ESCRITO DE TRES FORMAS
  ['[RUT] y {{Rut}} y {rut}', ['rut']],
  ['{{nombre}} y {{nombre}} y {{nombre}}', []],
  ['{{fecha_nac}} y {{fecha_nac}}', ['fecha_nac']],
  ['RUT: {{rut}}', ['rut']],
  // Y QUE NO CUENTE LO QUE YA ESTA LLENO
  ['todo lleno {{nombre}} {{nombre_completo}}', []],
];
CASOS_HUECO.forEach(function (c) {
  const texto = api.reemplazarCampos(c[0], Object.assign({}, SIN_DATOS), {});
  const hallados = api.marcadoresSinLlenar(texto).map(function (x) { return x.clave; });
  const ok = JSON.stringify(hallados) === JSON.stringify(c[1]);
  if (!ok) mal++;
  console.log('    ' + (ok ? 'ok  ' : '*** ') + c[0].slice(0, 40) + '  ->  ' + JSON.stringify(hallados)
    + (ok ? '' : '   esperaba ' + JSON.stringify(c[1])));
});

console.log('');
if (!mal) console.log('  ok  los nueve campos, las cuatro formas de plazo y los huecos.');
else { console.log('  *** ' + mal + ' CASO(S) MAL'); process.exit(1); }