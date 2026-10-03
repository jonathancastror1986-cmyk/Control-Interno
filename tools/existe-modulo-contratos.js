// CUÁNTO DE LO QUE PIDES YA EXISTE
// ==================================
//
// Y la razón de existir es una: antes de proponer una arquitectura nueva hay que saber qué
// hay. Porque el pedido describe un módulo completo —plantillas .docx, motor de reemplazo,
// conversión a PDF, estados de firma, firma en pantalla— y ese módulo, en este proyecto, ya
// está hecho. Casi entero.
//
// Y la forma de preguntarlo NO es "existe la función X". Es "¿cuántas veces aparece el
// concepto en el proyecto", porque un concepto puede estar en la base, en el JavaScript, en
// la interfaz y en las migraciones, y quedarse con la primera respuesta da una idea falsa del
// tamaño de lo que ya está.
//
// Y el conteo se hace sobre los archivos que Git publica, que es lo que de verdad existe.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';

const archivos = execFileSync('git', ['ls-files'], {
  cwd: RAIZ, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
}).split('\n').map((x) => x.trim())
  .filter((p) => /\.(js|html|css|sql|md)$/.test(p));

const leidos = archivos.map((p) => {
  try { return [p, fs.readFileSync(path.join(RAIZ, p), 'utf8')]; }
  catch (e) { return [p, '']; }
});

// -------------------------------------------------------------------
// LOS CONCEPTOS DEL PEDIDO
// -------------------------------------------------------------------
// Y cada uno con el patrón que lo busca. Y se busca en TODO el archivo, no en una lista de
// carpetas, porque el mismo concepto está repartido entre la interfaz, el código y la base.
const CONCEPTOS = [
  ['la tabla de plantillas', /plantillas_contratacion/g],
  ['los campos por empresa', /plantilla_campos/g],
  ['las variables {{...}}', /\{\{\s*\w+\s*\}\}/g],
  ['reemplazar variables', /completarPlantilla|reemplazar Variables|variablesConDatos/g],
  ['subir un .docx', /\.docx/gi],
  ['Word → HTML', /htmlDesdeArchivoDeWord|documentoDesdeArchivoDeWord/g],
  ['subir el archivo', /subirPlantillaArchivo/g],
  ['generar el PDF', /jsPDF|html2canvas|\.save\(\s*['"]doc\.pdf/g],
  ['la plantilla de descarga', /descargarPlantillaModelo|descargarPlantillaConDatos/g],
  ['el lienzo de firma', /firmaCanvas|montarFirmaPapel|lienzoFirma|canvasFirma/g],
  ['el modo de firma', /modo_firma/g],
  ['los estados de firma', /estado_firma|estadoFirma|Pendiente de Firma|Borrador/g],
  ['la firma en el PDF', /buildEppPdf|firma\.png|Firma del trabajador/g],
  ['el bucket de archivos', /epp-respaldos|plantillas-docx|storage\.from/g],
  ['la autorización', /firma_autorizaciones/g],
];

console.log('  === qué hay ya, de lo que pide el encargo ===');
console.log('  (contado sobre los ' + archivos.length + ' archivos que Git publica)');
console.log('');
CONCEPTOS.forEach(function (c) {
  let total = 0;
  const donde = [];
  leidos.forEach(function (par) {
    const n = (par[1].match(c[1]) || []).length;
    if (n) {
      total += n;
      if (donde.length < 4) donde.push(par[0].replace('views/', '').replace('.js', '') + '(' + n + ')');
    }
  });
  console.log('  ' + c[0].padEnd(24) + String(total).padStart(5) + '  ' + donde.join(' '));
});

// -------------------------------------------------------------------
// Y LAS TRES TABLAS, CON SUS COLUMNAS
// -------------------------------------------------------------------
console.log('');
console.log('  === las tablas, con lo que ya tienen ===');

const MIGRACIONES = [
  ['031_kit_contratacion.sql', 'plantillas_contratacion'],
  ['059_campos_empresa.sql', 'plantilla_campos'],
  ['063_autorizacion_firma.sql', 'firma_autorizaciones'],
];

MIGRACIONES.forEach(function (par) {
  const txt = fs.readFileSync(path.join(RAIZ, 'migrations', par[0]), 'utf8');
  const linea = txt.split('\n').findIndex((x) => x.indexOf('create table if not exists') >= 0
    && x.indexOf(par[1]) >= 0);
  if (linea < 0) {
    console.log('');
    console.log('  ' + par[1] + ':   *** no se encontró el "create table" ***');
    return;
  }
  const l = txt.split('\n');
  console.log('');
  console.log('  ' + par[1] + '   (' + par[0] + ')');
  // Y se leen las líneas de columnas, que están entre el "(" y el ")".
  let p = linea;
  let opened = 0;
  while (p < l.length) {
    const s = l[p].trim();
    if (s) {
      if (s.indexOf('(') >= 0) opened++;
      if (s === ');' || s === ')' || s.indexOf(');') >= 0) { if (opened) { console.log('    --'); } break; }
      if (/^\w+\s+[\w()]/.test(s) || s.indexOf('--') >= 0) {
        console.log('    ' + s.slice(0, 74));
      }
    }
    p++;
  }
});

// -------------------------------------------------------------------
// Y LAS FUNCIONES QUE YA HACEN EL TRABAJO
// -------------------------------------------------------------------
console.log('');
console.log('  === las funciones que ya hacen el trabajo ===');

const archivo = 'views/administracion/documentos.js';
const t = fs.readFileSync(path.join(RAIZ, archivo), 'utf8').split('\n');
const INTERESA = ['completarPlantilla', 'descargarPlantillaConDatos', 'descargarPlantillaModelo',
  'subirPlantillaArchivo', 'htmlDesdeArchivoDeWord', 'cargarCamposPropios', 'crearCampoPropio',
  'renderEditorTimbre', 'guardarPlantilla', 'pintarVariablesConDatos', 'cargarVariablesConDatos'];

INTERESA.forEach(function (nombre) {
  const i = t.findIndex((x) => new RegExp('^(?:async\\s+)?function\\s+' + nombre + '\\s*\\(').test(x.trim()));
  if (i < 0) {
    console.log('  ' + nombre.padEnd(30) + '   *** no está ***');
    return;
  }
  // Y el tamaño, que es lo que dice cuánto trabajo hay hecho.
  let largo = 0;
  let p = i;
  let prof = 0;
  while (p < t.length && (p === i || prof > 0)) {
    for (const ch of t[p]) {
      if (ch === '{') prof++;
      else if (ch === '}') prof--;
    }
    largo++;
    p++;
  }
  console.log('  ' + nombre.padEnd(30) + 'L' + String(i + 1).padStart(5) + '  '
    + String(largo - 1).padStart(4) + ' renglones');
});