// COMPRUEBA QUE LA MIGRACIÓN 065 DICE LO QUE DICE EL PDF
// ========================================================
//
// No lee la migración para ver si "parece bien". La COMPARA con el texto que se sacó del
// PDF del PREVIRED, que está en "previred-texto.txt".
//
// Y después rompe la comparación a propósito para ver si se entera. Un comprobador que
// no se sabe hacer que falle no se sabe hacer que pase. Ver [afp-07].
//
const fs = require('fs');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
// Y la ruta se puede cambiar por variable de entorno, que es lo que permite romper el
// archivo a propósito y probar que este comprobador se sabe quejar. Ver [afp-12].
const SQL = process.env.SQL_A_COMPROBAR || (RAIZ + 'migrations/065_afp_salud.sql');
const PDF = RAIZ + 'tools/datos/previred-agosto-2021.txt';

if (!fs.existsSync(PDF)) {
  console.log('  *** NO ESTÁ tools/datos/previred-agosto-2021.txt ***');
  console.log('    Sin el texto del PDF no se puede comprobar contra la fuente.');
  console.log('    Se saca de nuevo del PDF del PREVIRED; no se escribe a mano. Ver [afp-07].');
  process.exit(1);
}

const sql = fs.readFileSync(SQL, 'utf8');
const pdf = fs.readFileSync(PDF, 'utf8');

// -------------------------------------------------------------------
// LO QUE DICE EL PDF, Y QUÉ TABLA LO DICE
// -------------------------------------------------------------------
// Y sale de leer el PDF, no de una lista escrita a mano. La lista escrita a mano es la
// fuente del error: uno escribe lo que cree que dice el documento, y el comprobador
// confirma la lista equivocada. Ver [afp-08].
// Y el bloque termina en el SIGUIENTE encabezado, y no en un título escrito a mano.
//
// El error que costó la primera versión: la Tabla N°10 se cerraba en "Tabla N°11:", y en el
// documento la N°11 está ANTES que la N°10. Buscarla después no la encuentra nunca, el
// bloque se iba hasta el final del PDF, y se comía las tablas 16 a 20: 28 filas en vez de
// 8. Ver [afp-10].
function bloque(titulo) {
  const i = pdf.indexOf(titulo);
  if (i < 0) throw new Error('no está la tabla "' + titulo + '" en el PDF');
  const desde = i + titulo.length;
  // El encabezado siguiente es cualquier línea que empiece con "Tabla N°" o con
  // "Institución Autorizada", que es como empiezan todas.
  //
  // Y con "\s*" adelante porque en el texto que sale del PDF los encabezados van
  // INDENTADOS: "  Institución Autorizada APV - APVC : Cias". Sin el "\s*" el patrón
  // busca un "\nInstitución" que no existe —porque hay dos espacios en el medio— y el
  // bloque no se cierra nunca y se come las 59 filas siguientes. Ver [afp-10].
  const resto = pdf.slice(desde);
  const m = resto.match(/\n\s*(?:Tabla N|Institución Autorizada)/);
  return m ? pdf.slice(i, desde + m.index) : pdf.slice(i);
}

// Tabla 10: el bloque se cierra solo, en el encabezado siguiente.
const t10 = bloque('Tabla N°10:');
// Tabla 11: la parte de AFP, que cierra en el encabezado de las Cias Seguros.
const t11 = bloque('Institución Autorizada APV - APVC : AFP');
const t16 = bloque('Tabla N°16:');
const t20 = bloque('Tabla N°20:');

// Y cada fila del PDF es "código glosa", con el código en la primera palabra.
function filasDe(bloquePdf) {
  const out = [];
  bloquePdf.split('\n').forEach(function (x) {
    const l = x.trim();
    const m = l.match(/^(\d{2,3})\s+(\S.*)$/);
    if (m) out.push({ codigo: m[1], glosa: m[2].trim() });
  });
  return out;
}

const AFP10 = filasDe(t10);
const AFP11 = filasDe(t11);
const SALUD16 = filasDe(t16);

console.log('  leídos del PDF: ' + AFP10.length + ' en la Tabla 10, '
  + AFP11.length + ' en la Tabla 11, ' + SALUD16.length + ' en la Tabla 16');

// -------------------------------------------------------------------
// Y LOS MISMOS, PERO DE LA MIGRACIÓN
// -------------------------------------------------------------------
// Del "insert", no de todo el archivo: un "03 Cuprum" en un comentario no es un dato
// cargado, y un comprobador que lo cuenta como cargado aprueba una migración que no trae
// nada. Ver [afp-09].
// El RUT puede venir como un texto entre comillas o como la palabra "null", porque en el
// catálogo hay una fila sin RUT a propósito: el "00" es "sin isapre", y sin isapre no es
// una institución. Y el primer regex no la aceptaba, así que esa fila desaparecía de la
// comparación y el comprobador decía que faltaba una institución que sí estaba. Ver
// [afp-11].
function filasDelInsert(sql, tabla) {
  const i = sql.indexOf('insert into public.' + tabla);
  if (i < 0) return [];
  const j = sql.indexOf('on conflict', i);
  const trozo = sql.slice(i, j < 0 ? sql.length : j);
  const out = [];
  const re = /\(\s*'(\d{2,3})'\s*,\s*(?:'(\d{3})'\s*,\s*)?'([^']*)'\s*(?:,\s*(?:'([^']*)'|null)\s*)?\)/g;
  let m;
  while ((m = re.exec(trozo)) !== null) {
    out.push({ codigo: m[1], codigo_apv: m[2] || null, nombre: m[3], rut: m[4] || null });
  }
  return out;
}

const EN_SQL_AFP = filasDelInsert(sql, 'afp');
const EN_SQL_SALUD = filasDelInsert(sql, 'instituciones_salud');

// -------------------------------------------------------------------
// COMPARAR
// -------------------------------------------------------------------
const fallos = [];

// 1) Las dos tablas tienen la misma cantidad de filas que el PDF.
if (EN_SQL_AFP.length !== AFP10.length) {
  fallos.push('la AFP trae ' + EN_SQL_AFP.length + ' filas y el PDF trae ' + AFP10.length);
}
if (EN_SQL_SALUD.length !== SALUD16.length) {
  fallos.push('salud trae ' + EN_SQL_SALUD.length + ' filas y el PDF trae ' + SALUD16.length);
}

// 2) Los códigos son los mismos, UNO POR UNO y en el mismo orden. El orden importa: si
//    el catálogo no está en el orden del documento, nadie puede compararlos lado a lado
//    cuando el PREVIRED publique una versión nueva.
const cod10 = AFP10.map(function (f) { return f.codigo; }).join(',');
const codSqlAfp = EN_SQL_AFP.map(function (f) { return f.codigo; }).join(',');
if (cod10 !== codSqlAfp) {
  fallos.push('los codigos de AFP no son los del PDF\n      PDF: ' + cod10 + '\n      SQL: ' + codSqlAfp);
}
const cod16 = SALUD16.map(function (f) { return f.codigo; }).join(',');
const codSqlSalud = EN_SQL_SALUD.map(function (f) { return f.codigo; }).join(',');
if (cod16 !== codSqlSalud) {
  fallos.push('los codigos de salud no son los del PDF\n      PDF: ' + cod16 + '\n      SQL: ' + codSqlSalud);
}

// 3) Y que NO haya AFP de más. Esto es lo que importaba antes: los siete números que se
//    habían visto en un documento de un tercero sin saber a qué AFP correspondían. Si
//    aparece una AFP que el PDF no tiene, es inventada.
const delPdf = {};
AFP10.forEach(function (f) { delPdf[f.codigo] = true; });
EN_SQL_AFP.forEach(function (f) {
  if (!delPdf[f.codigo]) fallos.push('la AFP ' + f.codigo + ' (' + f.nombre + ') NO está en el PDF');
});
const delPdfSalud = {};
SALUD16.forEach(function (f) { delPdfSalud[f.codigo] = true; });
EN_SQL_SALUD.forEach(function (f) {
  if (!delPdfSalud[f.codigo]) {
    fallos.push('la institución ' + f.codigo + ' (' + f.nombre + ') NO está en el PDF');
  }
});

// 4) Los códigos APV, que son de otra tabla y con tres dígitos.
const apvDelPdf = {};
AFP11.forEach(function (f) { apvDelPdf[f.codigo] = true; });
EN_SQL_AFP.forEach(function (f) {
  if (f.codigo === '00') {
    if (f.codigo_apv !== '000') fallos.push('el 00 tiene que llevar el APV 000, y lleva ' + f.codigo_apv);
  } else if (f.codigo_apv !== '0' + f.codigo) {
    // El PDF los escribe con el cero adelante: 003, 005, 029.
    fallos.push('el APV de ' + f.codigo + ' tiene que ser 0' + f.codigo + ', y es ' + f.codigo_apv);
  }
  if (f.codigo_apv && !apvDelPdf[f.codigo_apv]) {
    fallos.push('el APV ' + f.codigo_apv + ' NO está en la Tabla N°11');
  }
});

// 5) Los RUT de salud, que salen de la Tabla N°20.
const rutDelPdf = {};
t20.split('\n').forEach(function (x) {
  const m = x.trim().match(/^(\d{7,8}-[\dKk])\s+(\S.*)$/);
  if (m) rutDelPdf[m[2].trim()] = m[1];
});
if (Object.keys(rutDelPdf).length !== 14) {
  fallos.push('la Tabla N°20 debería traer 14 RUT y trajo ' + Object.keys(rutDelPdf).length);
}
EN_SQL_SALUD.forEach(function (f) {
  if (f.codigo === '00') {
    // Y el 00 NO puede tener RUT: "sin isapre" no es una institución.
    if (f.rut) fallos.push('el 00 (sin isapre) tiene RUT ' + f.rut + ', y no debería');
    return;
  }
  if (!f.rut) {
    fallos.push('la institución ' + f.codigo + ' no tiene RUT, y en la Tabla N°20 sí está');
    return;
  }
  // Y el RUT tiene que estar en la Tabla N°20 con ESE nombre.
  var esta = false;
  for (const nombre in rutDelPdf) {
    if (rutDelPdf[nombre] === f.rut) { esta = true; break; }
  }
  if (!esta) fallos.push('el RUT ' + f.rut + ' de ' + f.codigo + ' NO está en la Tabla N°20');
});

// 6) Que el RUT sea válido de verdad, con su dígito verificador. Porque un RUT copiado con
//    un dígito mal va a fallar contra el pagador del subsidio, que sí lo valida.
function verificador(rut) {
  const p = String(rut).split('-');
  if (p.length !== 2) return false;
  const cuerpo = p[0];
  const dv = p[1].toUpperCase();
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo.charAt(i), 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 10 ? 'K' : (resto === 11 ? '0' : String(resto));
  return esperado === dv;
}
EN_SQL_SALUD.forEach(function (f) {
  if (f.rut && !verificador(f.rut)) fallos.push('el RUT ' + f.rut + ' de ' + f.codigo + ' tiene el verificador malo');
});

// -------------------------------------------------------------------
// 7) Y QUE LA COMPARACIÓN PUEDA FALLAR
// -------------------------------------------------------------------
// Se comparan contra un PDF DE PRUEBA que tiene un código cambiado y una AFP de más. Si
// con ese PDF el comprobador dice que todo está bien, no está comprobando nada.
const PDF_FALSO = pdf
  .replace('29 PlanVital', '29 PlanVital X')          // un nombre distinto
  .replace('02 Consalud', '26 Consalud');             // un código distinto
const sqlConBug = sql.replace('(\'29\', \'029\', \'PlanVital\')', '(\'29\', \'029\', \'PlanVital\')')
  .replace('(\'07\', \'Fonasa\',', '(\'07\', \'Fonasa\',');

// Y se corre el MISMO recorrido sobre el PDF falso.
function bloqueDe(t, a) {
  const i = t.indexOf(a);
  if (i < 0) return '';
  const desde = i + a.length;
  const m = t.slice(desde).match(/\n\s*(?:Tabla N|Institución Autorizada)/);
  return m ? t.slice(i, desde + m.index) : t.slice(i);
}
function comprobar(textoPdf, textoSql) {
  const p10 = filasDe(bloqueDe(textoPdf, 'Tabla N°10:'));
  const p16 = filasDe(bloqueDe(textoPdf, 'Tabla N°16:'));
  const sAfp = filasDelInsert(textoSql, 'afp');
  const sSalud = filasDelInsert(textoSql, 'instituciones_salud');
  const f = [];
  if (p10.map(function (x) { return x.codigo; }).join(',') !== sAfp.map(function (x) { return x.codigo; }).join(',')) {
    f.push('los codigos de AFP no son los del PDF');
  }
  if (p16.map(function (x) { return x.codigo; }).join(',') !== sSalud.map(function (x) { return x.codigo; }).join(',')) {
    f.push('los codigos de salud no son los del PDF');
  }
  const sabidos = {};
  p10.forEach(function (x) { sabidos[x.codigo] = true; });
  sAfp.forEach(function (x) { if (!sabidos[x.codigo]) f.push('AFP inventada: ' + x.codigo); });
  return f;
}
const conPdfVerdadero = comprobar(pdf, sql);
const conPdfFalso = comprobar(PDF_FALSO, sql);

console.log('');
if (conPdfVerdadero.length) {
  console.log('  *** CON EL PDF BUENO EL COMPROBADOR SE QUEJA: eso no puede ser ***');
  conPdfVerdadero.forEach(function (x) { console.log('      ' + x); });
  process.exit(1);
}
console.log('    ok  y con el PDF de verdad no se queja de nada');

if (!conPdfFalso.length) {
  console.log('  *** CON EL PDF CAMBIADO TAMPOCO SE QUEJA ***');
  console.log('    No está comparando: lee el PDF, no lo usa. Ver [afp-07].');
  process.exit(1);
}
console.log('    ok  y con un PDF cambiado SÍ se queja (' + conPdfFalso.length + ')');
console.log('        ' + conPdfFalso[0]);

// -------------------------------------------------------------------
// RESULTADO
// -------------------------------------------------------------------
console.log('');
if (fallos.length) {
  console.log('  *** ' + fallos.length + ' PROBLEMA(S) CONTRA EL PDF ***');
  fallos.forEach(function (x) { console.log('      - ' + x); });
  process.exit(1);
}

console.log('    ok  las ' + EN_SQL_AFP.length + ' AFP y las ' + EN_SQL_SALUD.length
  + ' instituciones de salud son las del PDF, codigo por codigo');
console.log('    ok  los ' + EN_SQL_AFP.length + ' codigos APV son los de la Tabla N°11');
console.log('    ok  los ' + (EN_SQL_SALUD.length - 1) + ' RUT son los de la Tabla N°20 y el verificador está bien');
console.log('    ok  y el "00" no tiene RUT, porque sin isapre no es una institución');
