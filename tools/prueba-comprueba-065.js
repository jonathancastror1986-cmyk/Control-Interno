// PROBAR QUE comprueba-065 PUEDE FALLAR, CON CADA ERROR QUE IMPORTA
// ================================================================
//
// Un comprobador que solo se sabe quejar de una cosa no sirve. Se meten, uno por uno, los
// errores que realmente se pueden cometer al escribir un catálogo así, y se mira si los
// ve. Ver [afp-07].
//
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const SQL = RAIZ + 'migrations/065_afp_salud.sql';
const GUARDIAN = RAIZ + 'tools/comprueba-065.js';

const bueno = fs.readFileSync(SQL, 'utf8');

// Y cada caso: qué se rompe, y qué tiene que decir el guardián para darlo por visto.
const CASOS = [
  {
    nombre: 'una AFP con un codigo que el PDF no tiene',
    romper: function (s) { return s.replace("('35', '035', 'Uno')", "('36', '036', 'Uno')"); },
    // Y un arnés que exige un texto exacto deja de ser una prueba: deja de importar que el
    // guardián se entere, y pasa a importar que diga la frase que el arnés escribió.
    tieneQueVer: ['NO está en el PDF', 'AFP inventada'],
  },
  {
    nombre: 'una AFP con el nombre de otra',
    romper: function (s) { return s.replace("('03', '003', 'Cuprum')", "('03', '003', 'Providencia')"); },
    // Y este NO se comprueba, y a propósito: el mismo PDF escribe "PlanVital" en una tabla
    // y "Planvital" en otra. Comparar los nombres obligaría a elegir una forma, y elegir es
    // inventar. Está declarado abajo.
    declarada: 'el nombre no se compara, a propósito',
  },
  {
    nombre: 'una institucion de salud que no existe',
    romper: function (s) { return s.replace("('25', 'Cruz del Norte',                    '79906120-1')", "('26', 'Cruz del Norte',                    '79906120-1')"); },
    tieneQueVer: ['NO está en el PDF', 'no son los del PDF'],
  },
  {
    nombre: 'un codigo de AFP cambiado de numero',
    romper: function (s) { return s.replace("('33', '033', 'Capital')", "('32', '032', 'Capital')"); },
    tieneQueVer: ['NO está en el PDF', 'no son los del PDF'],
  },
  {
    nombre: 'un RUT copiado mal, con el verificador cambiado',
    romper: function (s) { return s.replace("'96572800-7'", "'96572800-8'"); },
    tieneQueVer: ['verificador', 'NO está en la Tabla N°20'],
  },
  {
    nombre: 'un RUT que no esta en la Tabla N°20',
    romper: function (s) { return s.replace("'76334370-7'", "'11111111-1'"); },
    tieneQueVer: ['verificador', 'NO está en la Tabla N°20'],
  },
  {
    nombre: 'el 00 con RUT, siendo que sin isapre no es una institucion',
    romper: function (s) { return s.replace("('00', 'Sin Isapre',                        null)", "('00', 'Sin Isapre',                        '61603000-0')"); },
    tieneQueVer: ['no debería'],
  },
  {
    nombre: 'una institucion de salud sin RUT',
    romper: function (s) { return s.replace("('07', 'Fonasa',                            '61603000-0')", "('07', 'Fonasa',                            null)"); },
    tieneQueVer: ['no tiene RUT'],
  },
  {
    nombre: 'un codigo APV que no es el de la Tabla N°11',
    romper: function (s) { return s.replace("('08', '008', 'Provida')", "('08', '080', 'Provida')"); },
    tieneQueVer: ['tiene que ser 0', 'NO está en la Tabla N°11'],
  },
];

console.log('  === el archivo sano, primero ===');
const r0 = correr(bueno);
if (r0.codigo !== 0) {
  console.log('  *** EL ARCHIVO SANO FALLA Y NO DEBERÍA ***');
  console.log(r0.salida);
  process.exit(1);
}
console.log('    ok  y el archivo sano pasa');
console.log('');

let vistos = 0;
let declarados = 0;
let noVistos = [];

CASOS.forEach(function (c) {
  const roto = c.romper(bueno);
  if (roto === bueno) {
    console.log('  *** NO SE PUDO ROMPER: ' + c.nombre + ' ***');
    console.log('    o sea que el caso de prueba está mal, no el guardián.');
    process.exit(1);
  }
  const r = correr(roto);
  const texto = r.salida;

  // Y los casos que NO se comprueba a propósito, se cuentan aparte. No son fallos: son
  // cosas que alguien tiene que saber que no están cubiertas, para no confiar en ellas.
  if (c.declarada) {
    declarados++;
    const tapado = r.codigo === 0 ? 'no lo ve, y está declarado' : 'LO VE';
    console.log('    ' + (tapado === 'no lo ve, y está declarado' ? 'ok  ' : '***  ')
      + ' ' + c.nombre + '  ->  ' + c.declarada);
    return;
  }

  if (r.codigo === 0) {
    noVistos.push(c.nombre + '  --  el guardián lo aprobó y estaba roto');
    return;
  }
  const alguno = c.tieneQueVer.some(function (x) { return texto.indexOf(x) >= 0; });
  if (!alguno) {
    noVistos.push(c.nombre + '  --  se quejó pero no dijo por qué: ' + primerLinea(texto));
    return;
  }
  vistos++;
  console.log('    ok  lo ve: ' + c.nombre);
});

console.log('');
if (noVistos.length) {
  console.log('  *** ' + noVistos.length + ' CASO(S) QUE EL GUARDIÁN NO ATRAPA ***');
  noVistos.forEach(function (x) { console.log('      - ' + x); });
  process.exit(1);
}
console.log('    ok  y los ' + vistos + ' casos que tiene que ver, los ve');
console.log('    ok  y ' + declarados + ' caso(s) que NO se comprueba, declarados: alguien tiene');
console.log('        que saber qué es lo que no está cubierto, para no confiar en ello.');
console.log('');
console.log('  === Y LO QUE EL GUARDIÁN NO COMPRUEBA, DICHO ===');
console.log('    El NOMBRE de cada institución no se compara con el PDF.');
console.log('    Y eso es a propósito: la Tabla N°10 escribe "PlanVital" y la N°11 escribe');
console.log('    "Planvital", y la N°16 escribe "Isapre Bco. Estado" donde la N°20 escribe');
console.log('    "Isapre Banco Estado". El mismo documento escribe el mismo nombre de dos');
console.log('    formas. Comparar los nombres obligaría a elegir una de las dos, y elegir una');
console.log('    es inventar. Se conserva el de la tabla del catálogo, que es la que manda.');
console.log('    Lo que SÍ se comprueba son los códigos, que es lo que va a la planilla.');

function correr(textoSql) {
  const copia = 'C:/Users/mrj0t/AppData/Local/Temp/opencode/065-prueba.sql';
  const g = 'C:/Users/mrj0t/AppData/Local/Temp/opencode/comprueba-065-prueba.js';
  // El guardián de la prueba lee una ruta que se le pasa por variable de entorno, para no
  // tener que volver a escribirlo entero.
  fs.writeFileSync(copia, textoSql, 'utf8');
  let fuente = fs.readFileSync(GUARDIAN, 'utf8');
  fuente = fuente.replace(
    "const SQL = RAIZ + 'migrations/065_afp_salud.sql';",
    "const SQL = process.env.SQL_A_COMPROBAR || (RAIZ + 'migrations/065_afp_salud.sql');"
  );
  fs.writeFileSync(g, fuente, 'utf8');
  // Y acá está lo que faltaba: se le PASA el archivo roto por variable de entorno.
  //
  // Sin esto el guardián miraba siempre el archivo de verdad, que está sano, y aprobaba
  // los nueve casos rotos. Un arnés que comprueba el archivo bueno nueve veces no está
  // probando nada. Ver [afp-12].
  const entorno = {};
  Object.keys(process.env).forEach(function (k) { entorno[k] = process.env[k]; });
  entorno.SQL_A_COMPROBAR = copia;
  try {
    const salida = execFileSync(process.execPath, [g],
      { encoding: 'utf8', stdio: 'pipe', env: entorno });
    return { codigo: 0, salida: salida };
  } catch (e) {
    return {
      codigo: e.status === undefined ? -1 : e.status,
      salida: String(e.stdout || '') + String(e.stderr || ''),
    };
  }
}

function primerLinea(t) {
  const l = (t.split('\n').filter(function (x) { return x.trim(); }) || [])[3] || '(sin linea que lo diga)';
  return l.trim().slice(0, 70);
}
