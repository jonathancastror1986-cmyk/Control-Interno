// ===================================================================
// COMPRUEBA-COLUMNAS: QUE LAS MIGRACIONES NO NOMBREN COLUMNAS QUE NO EXISTEN
// ===================================================================
//
// Corre:  node tools/comprueba-columnas.js
// No toca la base: solo lee migrations/*.sql, en orden.
//
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// ---------------------------------------------------------------------
//
// Es el hueco que dejaron las otras comprobaciones. Estas verifican que existan TABLAS, FUNCIONES
// e ÍNDICES. Ninguna mira COLUMNAS, y una columna equivocada es el error que sale al pegar, con un
// código 42703 que dice qué columna falta pero no por qué se usó.
//
// Salió tres veces seguidas:
//
//     42703: column "nombre" does not exist       (trabajadores tiene "name")
//     42883: function existe_permiso(unknown)    (la de veras es tiene_permiso)
//     42703: column "activo" of plantilla_campos does not exist
//
// Las tres se coquieron en el panel del usuario, no antes.
//
// ---------------------------------------------------------------------
// QUE ES "UNA COLUMNA QUE NO EXISTE"
// ---------------------------------------------------------------------
//
// Solo se miran DOS formas, y las dos son inequívocas:
//
//   1. public.tabla.columna     una referencia con tabla explícita
//   2. insert into tabla (a, b, c)   la lista de columnas de un insert
//
// Y NO SE MIRA NADA MÁS. Un "select *" no se puede cruzar, un alias no es una columna, y el cuerpo
// de una función devuelve lo que devuelve. Un guardian que se pone a adivinar grita por el codigo
// correcto, y un guardian que grita por el codigo correcto entrena a que lo ignoren.
//
// ---------------------------------------------------------------------
// Y CÓMO SE SABE QUÉ COLUMNAS HAY
// ---------------------------------------------------------------------
//
// Leyendo las migraciones EN ORDEN y anotando lo que cada una define. Un "alter table ... add
// column" suma; un "rename column" cambia el nombre viejo por el nuevo. El orden importa: la 056
// agrego "nombres" a "trabajadores" DESPUES de existir "name", y las dos valen.

const { execSync } = require('child_process');
const fs = require('fs');

const arch = execSync('git ls-files --cached --others --exclude-standard migrations', { maxBuffer: 1e8 }).toString()
  .split(/\r\n|\n|\r/)
  .filter(f => /^migrations\/\d\d\d?_.*\.sql$/.test(f))
  .sort();

// ---------------------------------------------------------------------
// 1) LO QUE CADA MIGRACIÓN DEFINE
// ---------------------------------------------------------------------
// Y EL DICCIONARIO ES "tabla" -> "conjunto de columnas". Y una tabla que todavia no se ha visto no
// tiene columnas conocidas, y eso se distingue de "tiene cero columnas": la primera es "todavia
// no lei el create table", la segunda es "lei el create table y no tenia ninguna".
const tabla = {};
const tablasConocidas = new Set();

function sinComentarios(txt) {
  return txt.split(/\r\n|\n|\r/).map(x => (/^\s*--/.test(x) ? '' : x)).join('\n');
}

arch.forEach(function (f) {
  const txt = sinComentarios(fs.readFileSync(f, 'utf8'));
  const base = f.split('/').pop();

  // Y EL CREATE TABLE, QUE ES DONDE NACE LA TABLA
  const crea = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi;
  let m;
  while ((m = crea.exec(txt)) !== null) {
    const t = m[1].toLowerCase();
    tablasConocidas.add(t);
    tabla[t] = tabla[t] || new Set();
    m[2].split('\n').forEach(linea => {
      // Y EL TIPO "time" TIENE QUE ESTAR, Y POR QUENO ESTABA
      //
      // "time" no estaba en la lista, y por eso las columnas de hora de la
      // portería (porteria_grupos.hora y porteria_registros.hora) NUNCA se
      // leyeron. O sea que el guardián|reportaba que esas columnas no
      // existían, cuando sí.
      //
      // No es un detalle: una columna que el guardián no leyó es una columna
      // que no puede verificar, y el Insert que la usa queda comprobado a
      // medias.
      //
      // Y el orden importa: "time" va DESPUES de "timestamp", porque si fuera
      // antes, el "\b" cortaría "timestamp" por la mitad y esa dejaria de
      // leerse. Con "\b" al final, "timestamp" se prueba primero.
      const c = /^\s*([a-z_][a-z0-9_]*)\s+(integer|int|bigint|smallint|numeric|decimal|text|varchar|char|boolean|date|timestamp|timestamptz|time|uuid|json|jsonb|bytea|real)\b/i.exec(linea);
      if (c) tabla[t].add(c[1].toLowerCase());
    });
  }

  // Y EL ADD COLUMN
  const suma = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+([\s\S]*?);/gi;
  while ((m = suma.exec(txt)) !== null) {
    const t = m[1].toLowerCase();
    tablasConocidas.add(t);
    tabla[t] = tabla[t] || new Set();
    const cols = m[2].match(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi) || [];
    cols.forEach(c => {
      const n = /add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/i.exec(c);
      if (n) tabla[t].add(n[1].toLowerCase());
    });
  }

  // Y EL RENAME, QUE SACA EL VIEJO Y PONE EL NUEVO
  const ren = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+rename\s+column\s+(\w+)\s+to\s+(\w+)/gi;
  while ((m = ren.exec(txt)) !== null) {
    const t = m[1].toLowerCase();
    if (tabla[t]) {
      tabla[t].delete(m[2].toLowerCase());
      tabla[t].add(m[3].toLowerCase());
    }
  }
});

const totalCols = Object.keys(tabla).reduce((n, k) => n + tabla[k].size, 0);
console.log('  tablas que leidas: ' + Object.keys(tabla).length);
console.log('  columnas que leidas: ' + totalCols);

// ---------------------------------------------------------------------
// 2) LO QUE LAS MIGRACIONES USAN
// ---------------------------------------------------------------------
const DESDE = 76;
const malas = [];

arch.forEach(function (f) {
  const base = f.split('/').pop();
  const num = parseInt(base.slice(0, 3), 10);
  if (num < DESDE) return;

  const crudo = fs.readFileSync(f, 'utf8').split(/\r\n|\n|\r/);
  const txt = crudo.map(x => (/^\s*--/.test(x) ? '' : x)).join('\n');

  // ---- 2a) LAS REFERENCIAS CON TABLA EXPLICITA ----
  //
  // Y CUALQUIER "TABLA.COLUMNA", Y NO SOLO EL QUE VIENE DESPUES DE "FROM"
  //
  // La primera version pedia que la referencia estuviera pegada a un "from" o a un "join". Con eso
  // "select nombre from public.trabajadores" pasaba sin_revision, porque la columna viene ANTES del
  // "from". Y ese es justamente el caso que importa: "nombre" en vez de "name".
  //
  // Y SE DESCARTA TODO LO QUE PAREZCA UN ESQUEMA O UN ALIAS
  const ref = /(?:public\.)?(\w+)\.(\w+)/g;
  let m;
  while ((m = ref.exec(txt)) !== null) {
    const t = m[1].toLowerCase(), c = m[2].toLowerCase();
    if (!tabla[t] || !tabla[t].size) continue;
    if (tabla[t].has(c)) continue;
    // Y "pg_class.relname" y los demas nombres de catalogo de PostgreSQL se descartan por la
    // segunda parte: los nombres de columna del catalogo son de una sola palabra con guion bajo.
    if (/^(pg|information_schema|auth|storage|public)$/.test(t)) continue;
    malas.push({ base, linea: txt.slice(0, m.index).split('\n').length, t, c, tipo: 'referencia' });
  }

  // ---- 2b) LAS LISTAS DE COLUMNAS DE UN INSERT ----
  const ins = /insert\s+into\s+(?:public\.)?(\w+)\s*\(([^)]*)\)/gi;
  while ((m = ins.exec(txt)) !== null) {
    const t = m[1].toLowerCase();
    if (!tabla[t] || !tabla[t].size) continue;
    m[2].split(',').forEach(x => {
      const c = x.trim().toLowerCase().replace(/\s+.*/, '');
      if (!c || !/^[a-z_][a-z0-9_]*$/.test(c)) return;
      if (tabla[t].has(c)) return;
      malas.push({ base, linea: txt.slice(0, m.index).split('\n').length, t, c, tipo: 'insert' });
    });
  }
});

// ---------------------------------------------------------------------
// 3) EL REPORTE
// ---------------------------------------------------------------------
if (!malas.length) {
  console.log('');
  console.log('  ok  las migraciones desde la 076 no nombran columnas que no existan.');
  process.exit(0);
}

console.log('');
malas.forEach(x => {
  console.log('  *** ' + x.base + ' L' + x.linea + '  ' + x.tipo + ': ' + x.t + '.' + x.c
    + '  (esa tabla tiene ' + tabla[x.t].size + ' columnas leidas)');
});
console.log('');
console.log('  *** ' + malas.length + ' COLUMNA(S) QUE NO EXISTEN. Al pegarlas sale 42703.');
process.exit(1);
