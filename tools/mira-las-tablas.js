// DÓNDE NACEN LAS TABLAS QUE NO FILTRAN POR EMPRESA
// ====================================================
//
// Y no es una pregunta retórica: es la que decide si las once tablas del hallazgo necesitan
// una política o no necesitan nada.
//
// ---------------------------------------------------------------------
// POR QUÉ HAY QUE MIRAR Y NO SUPONER
// ---------------------------------------------------------------------
//
// El hallazgo dice que hay quince tablas cuya política es "cualquier usuario activo". Y eso es
// un hecho: la política no mira de qué empresa es el usuario.
//
// Pero de ahí NO sale que haya que cambiar las quince. De una tabla cuyo contenido es el mismo
// para todos —los feriados nationwide, la lista de cargos— no hay nada que filtrar, y poner una
// condición de empresa sería inventar un dato que la tabla no tiene.
//
// Y ese es el riesgo real de este trabajo: agregar "empresa_id" a quince tablas porinherit.
//
// Y hay tres formas de que una tabla sea de una empresa:
//
//   UNO: tiene una columna "empresa_id". Entonces el filtro es directo.
//
//   DOS: cuelga de una que sí tiene, por "code" o por otro id. Entonces el filtro es un JOIN,
//     que es lo que hace la 067 con "trabajadores".
//
//   TRES: no cuelga de ninguna. Es lo mismo para todos. Entonces NO hay nada que filtrar, y
//     decir que está abierta es un error del hallazgo, no un defecto de la base.
//
// ---------------------------------------------------------------------
// LO QUE MIDE ESTE GUION
// ---------------------------------------------------------------------
//
// Para cada tabla: dónde se creó, qué columnas tiene, y de qué cuelga. Y al final, las tres
// listas, para que la migración se escriba sobre hechos y no sobre supuestos.
const fs = require('fs');
const path = require('path');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const MIG = path.join(RAIZ, 'migrations');

// Las quince del hallazgo, en el orden en que aparecen en el documento.
const TABLAS = [
  'trabajadores', 'asistencia', 'marcajes', 'tarjetas',
  'epp_entregas', 'herramientas_catalogo', 'herramientas_asignaciones',
  'feriados_adicionales', 'dia_overrides', 'empresa', 'perfiles',
  'epp_catalogo', 'epp_entrega_items', 'inventario_qr',
  'epp_kits_cargo', 'epp_tallas', 'epp_especialidades', 'epp_kits',
];

// Y todas las migraciones, porque una tabla puede haberse creado en cualquier archivo.
const archivos = fs.readdirSync(MIG)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// Y el texto de todas, para buscar "create table" en cualquiera.
const fuentes = archivos.map((f) => ({
  archivo: f,
  texto: fs.readFileSync(path.join(MIG, f), 'utf8'),
}));

console.log('  === dónde se crea cada tabla y qué columnas tiene ===');
console.log('');

const info = {};

TABLAS.forEach(function (tabla) {
  const re = new RegExp('create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?"?'
    + tabla + '"?\\s*\\(', 'i');

  let hallada = null;
  for (const f of fuentes) {
    const m = re.exec(f.texto);
    if (!m) continue;

    // Y el cuerpo: desde la llave hasta el paréntesis que cierra, contando.
    let i = m.index;
    let nivel = 0;
    let fin = -1;
    for (let k = i; k < f.texto.length; k++) {
      if (f.texto[k] === '(') nivel++;
      else if (f.texto[k] === ')') {
        nivel--;
        if (nivel === 0) { fin = k; break; }
      }
    }
    if (fin < 0) continue;
    hallada = { archivo: f.archivo, cuerpo: f.texto.slice(i, fin + 1) };
    break;
  }

  if (!hallada) {
    console.log('  ' + tabla.padEnd(24) + '  *** NO SE ENCUENTRA SU "CREATE TABLE" ***');
    console.log('      puede haberse creado desde la aplicación original, no por migración.');
    info[tabla] = { existe: false };
    return;
  }

  const cuerpo = hallada.cuerpo;
  const cols = [];
  const rc = /^\s*"?([a-z_][a-z0-9_]*)"?\s+(text|integer|int\b|bigint|boolean|date|timestamptz|numeric|uuid|jsonb)/gim;
  let m2;
  while ((m2 = rc.exec(cuerpo)) !== null) cols.push(m2[1].toLowerCase());

  const tieneEmpresa = cols.indexOf('empresa_id') >= 0;
  const tieneCode = cols.indexOf('code') >= 0;
  const cuelgaDe = [];
  if (/references\s+trabajadores/i.test(cuerpo)) cuelgaDe.push('trabajadores');
  if (/references\s+epp_/i.test(cuerpo)) cuelgaDe.push('epp_*');
  if (/references\s+herramientas/i.test(cuerpo)) cuelgaDe.push('herramientas');
  if (/references\s+auth\.users/i.test(cuerpo)) cuelgaDe.push('auth.users');

  console.log('  ' + tabla.padEnd(24)
    + ' ' + hallada.archivo.padEnd(34)
    + ' ' + cols.length + ' columnas');
  console.log('      empresa_id: ' + (tieneEmpresa ? 'SÍ' : 'no')
    + '   code: ' + (tieneCode ? 'sí' : 'no')
    + (cuelgaDe.length ? '   cuelga de: ' + cuelgaDe.join(', ') : ''));

  info[tabla] = {
    existe: true,
    archivo: hallada.archivo,
    columnas: cols,
    tieneEmpresa: tieneEmpresa,
    tieneCode: tieneCode,
    cuelgaDe: cuelgaDe,
  };
});

// ===================================================================
// Y LAS TRES LISTAS
// ===================================================================
console.log('');
console.log('  === las tres, según lo medido ===');

const directa = [];
const porJoin = [];
const sinEmpresa = [];

TABLAS.forEach(function (t) {
  const i = info[t];
  if (!i || !i.existe) { sinEmpresa.push(t + ' (no encontrada)'); return; }
  if (i.tieneEmpresa) directa.push(t);
  else if (i.cuelgaDe.length) porJoin.push(t);
  else sinEmpresa.push(t);
});

console.log('');
console.log('  CON "empresa_id" — el filtro es directo:');
directa.forEach(function (t) { console.log('    ' + t); });
if (!directa.length) console.log('    (ninguna)');

console.log('');
console.log('  CUELGAN DE OTRA — el filtro es un JOIN:');
porJoin.forEach(function (t) { console.log('    ' + t); });
if (!porJoin.length) console.log('    (ninguna)');

console.log('');
console.log('  NO CUELGAN DE NINGUNA — hay que decidir si hay algo que filtrar:');
sinEmpresa.forEach(function (t) { console.log('    ' + t); });
if (!sinEmpresa.length) console.log('    (ninguna)');

console.log('');
console.log('  Y LA LISTA DE LAS ÚLTIMAS ES LA IMPORTANTE:');
console.log('  una tabla de esa lista no es un agujero de seguridad por no filtrar por');
console.log('  empresa. Es una tabla cuyo contenido es el mismo para todos, y agregar una');
console.log('  condición sería inventar.');
