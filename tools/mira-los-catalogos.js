// LAS COLUMNAS DE LAS TABLAS "SIN EMPRESA", PARA DECIDIR UNA POR UNA
// ====================================================================
//
// El guion anterior dijo que ocho tablas "no cuelgan de ninguna". Y eso es cierto, pero
// insufficiente: una tabla puede no tener empresa_id y CONTENER datos de una empresa.
//
// Y eso es justo lo que hay que mirar antes de decir "aquí no hay nada que filtrar".
//
// ---------------------------------------------------------------------
// LAS TRES PREGUNTAS DE CADA UNA
// ---------------------------------------------------------------------
//
//   UNO: ¿tiene empresa_id? Si sí, el filtro es directo.
//
//   DOS: ¿cuelga de otra que sí tiene, por "code"? Si sí, el filtro es un JOIN —es lo que hace
//        la 067 con "trabajadores".
//
//   TRES: ¿su contenido es el mismo para todos? Un catálogo de herramientas, una lista de
//        feriados, los grupos de cargo: eso es lo mismo para la empresa A y para la B, y no
//        hay nada que filtrar.
//
// Y la cuarta, que es la que decide entre las tres: ¿GUARDA DATOS DE PERSONAS o de NEGOCIO?
// Un catálogo no. Una entrega de EPP sí, aunque no tenga empresa_id: si la empresa A puede
// ver las entregas de la empresa B, está viendo qué se le entregó a sus trabajadores.
//
// ---------------------------------------------------------------------
// LO QUE MIDE ESTE GUION
// ---------------------------------------------------------------------
//
// Las columnas completas de cada tabla, y una pregunta por columna: ¿es un dato de persona, de
// negocio, o un catálogo? Y el veredicto sale de eso, no de un supuesto.
const fs = require('fs');
const path = require('path');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const MIG = path.join(RAIZ, 'migrations');

const ARCHIVOS = ['001_schema.sql', '007_tarjetas.sql', '008_epp_firma.sql',
  '009_qr_inventario.sql', '011_especialidades.sql', '012_kits_multiples.sql',
  '017_marcajes_diarios.sql'];

// Y dónde va cada tabla, con su archivo.
const DONDE = {};
ARCHIVOS.forEach(function (f) {
  const l = fs.readFileSync(path.join(MIG, f), 'utf8').split(/\r\n|\n/);
  l.forEach(function (x, i) {
    const m = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/i.exec(x);
    if (m && !DONDE[m[1].toLowerCase()]) DONDE[m[1].toLowerCase()] = { archivo: f, linea: i + 1 };
  });
});

console.log('  === las ocho que el hallazgo da por abiertas ===');
console.log('');

const A_REVISAR = [
  { tabla: 'tarjetas', que: 'la credencial' },
  { tabla: 'herramientas_catalogo', que: 'el catálogo de herramientas' },
  { tabla: 'feriados_adicionales', que: 'feriados que se agregan' },
  { tabla: 'dia_overrides', que: 'días que se cambian' },
  { tabla: 'empresa', que: 'la empresa misma' },
  { tabla: 'epp_catalogo', que: 'el catálogo de EPP' },
  { tabla: 'epp_tallas', que: 'las tallas' },
  { tabla: 'epp_especialidades', que: 'las especialidades' },
];

A_REVISAR.forEach(function (x) {
  const d = DONDE[x.tabla];
  if (!d) {
    console.log('  ' + x.tabla + ': NO SE ENCUENTRA');
    return;
  }

  const l = fs.readFileSync(path.join(MIG, d.archivo), 'utf8').split(/\r\n|\n/);
  let txt = '';
  for (let k = d.linea - 1; k < d.linea + 34 && l[k] !== undefined; k++) {
    txt += l[k] + '\n';
    if (/\);/.test(l[k])) break;
  }

  const cols = [];
  const rc = /^\s*"?([a-z_][a-z0-9_]*)"?\s+([a-z]+)/gim;
  let m;
  while ((m = rc.exec(txt)) !== null) {
    if (/^(primary|foreign|unique|check|constraint)$/i.test(m[1])) break;
    cols.push({ nombre: m[1].toLowerCase(), tipo: m[2].toLowerCase() });
  }

  console.log('  ' + x.tabla + '   (' + x.que + ')');
  console.log('    ' + d.archivo + ':' + d.linea);
  cols.forEach(function (c) {
    const marcas = [];
    if (/empresa/.test(c.nombre)) marcas.push('EMPRESA');
    if (c.nombre === 'code' || /_code$/.test(c.nombre)) marcas.push('CUELGA DE TRABAJADOR');
    if (/activo|fecha|descripcion|nombre|grupo|categoria|tipo/.test(c.nombre)) marcas.push('catálogo');
    if (c.tipo === 'date' || /fecha/.test(c.nombre)) marcas.push('DATO DE NEGOCIO');
    console.log('      ' + c.nombre.padEnd(26) + c.tipo.padEnd(12)
      + (marcas.length ? marcas.join(' ') : ''));
  });
  console.log('');
});
