// QUE LAS MIGRACIONES NO NOMBREN TABLAS QUE NO EXISTEN
// =====================================================
//
// -------------------------------------------------------------------
// EL AGUERO
// ---------
//
// La migración 063-usaba "public.roles", "r.clave" y "r.sistema".
//
// En el proyecto la tabla se llama "roles_sistema", la clave está en "rol", y no hay columna
// "sistema": el rol con acceso total es el valor 'admin', no una bandera.
//
// El "insert" tiraba "42P01: relation public.roles does not exist". Y como iba al final, después
// de crear la tabla y las políticas, la migración se caía en el último paso: la tabla quedaba
// hecha, las políticas hechas, y los permisos sin dárselos a nadie.
//
// Un estado a medio hacer que no dice que está a medio hacer. Y nadie lo notó porque el error
// se lee en la consulta que el usuario estaba haciendo, no en la migración. Ver [firma-12].
//
// -------------------------------------------------------------------
// POR QUÉ NO BASTA CON LEER LOS NOMBRES
// --------------------------------------
//
// Porque el nombre correcto hay que BUSCARLO. Los comentarios dicen "public.roles_permisos",
// "public.permisos", "public.perfil_roles" — y de ahí sale fácil escribir "public.roles".
//
// Este guion lee las tablas que existen de verdad, de los "create table" del proyecto, y
// revisa que cada "public.<tabla>" que una migración menciona exista.
//
// Y marca a mano las de fuera del esquema "public", que son pocas y no se inventan.
//
const fs = require('fs');
const path = require('path');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const MIG = RAIZ + 'migrations';

// -------------------------------------------------------------------
// 1. LEER LAS TABLAS QUE EXISTEN, DE LOS "CREATE TABLE" DEL PROYECTO
// -------------------------------------------------------------------
const existen = new Set();
const DIR_SCHEMA = path.join(RAIZ, 'supabase');

function leerDel() {
  const archivos = [DIR_SCHEMA, MIG].filter(function (d) {
    return fs.existsSync(d) && fs.statSync(d).isDirectory();
  });
  const sql = [];
  archivos.forEach(function (d) {
    fs.readdirSync(d).forEach(function (f) {
      if (!/\.sql$/i.test(f)) return;
      sql.push(fs.readFileSync(path.join(d, f), 'utf8'));
    });
  });
  return sql;
}

leerDel().forEach(function (t) {
  // Y en un solo patrón, los tres formatos que se usan: con y sin esquema, con "if not exists"
  // y sin él.
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  let m;
  while ((m = re.exec(t)) !== null) existen.add(m[1].toLowerCase());
});

// Y un mínimo de los que se usan en el código y no se declaran en una migración, como
// "trabajadores" y "empresa", que vienen del esquema original de la aplicación.
['empresa', 'trabajadores', 'auth', 'storage'].forEach(function (t) { existen.add(t); });

console.log('    ' + existen.size + ' tablas conocidas del proyecto');

// -------------------------------------------------------------------
// 2. LAS FUNCIONES Y LAS VISTAS, DE TODO EL PROYECTO Y NO DE UN ARCHIVO SOLO
// -------------------------------------------------------------------
//
// Porque una migración puede usar una función que DEFINO otra migración. Y si el guardián
// solo mira el archivo que está revisando, esa función no la encuentra y la marca como si
// fuera una tabla que no existe. Ver [firma-13].
//
// Y se leen de todos los archivos del proyecto, no solo de las migraciones 06x: las
// funciones viejas son tanmismo nombre como las nuevas.
const funciones = new Set();
const vistas = new Set();

leerDel().forEach(function (t) {
  const rf = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  let q;
  while ((q = rf.exec(t)) !== null) funciones.add(q[1].toLowerCase());
  const rv = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  while ((q = rv.exec(t)) !== null) vistas.add(q[1].toLowerCase());
});

console.log('    ' + funciones.size + ' funciones y ' + vistas.size + ' vistas conocidas');

// -------------------------------------------------------------------
// 2. LEER LAS MIGRACIONES Y VERIFICAR
// -------------------------------------------------------------------
// Y solo las que empiezan con 06, que son las nuevas de esta tanda. Las viejas arrastran
// nombres que ya no existen y arreglarlas no sirve de nada: ya corrieron.
const archivos = fs.readdirSync(MIG)
  .filter(function (f) { return /^06\d.*\.sql$/i.test(f); })
  .sort();

if (!archivos.length) {
  console.log('    no hay migraciones 06x para revisar');
  process.exit(0);
}

// Y lo que sí existe y está fuera del esquema "public", que no son tablas: funciones,
// vistas y el catálogo. Se permiten.
const NO_ES_TABLA = /^(pg_|auth\.|storage\.|net\.|graphql_)/i;

let malas = 0;

archivos.forEach(function (f) {
  // Y se leen SIN los comentarios. Un "--" hasta el fin de la línea, y un "/* ... */".
  // Ver [firma-14]: el guardián miraba el texto donde se explica el error, y lo tomaba por el
  // error.
  const t = fs.readFileSync(path.join(MIG, f), 'utf8')
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Lo que se nombra después de "public." o después de "in public" o "from public".
  const re = /\bpublic\.([a-z_][a-z0-9_]*)/gi;
  const nombradas = new Set();
  let m;
  while ((m = re.exec(t)) !== null) nombradas.add(m[1].toLowerCase());

  const malas2 = [];
  nombradas.forEach(function (n) {
    if (NO_ES_TABLA.test(n)) return;
    if (funciones.has(n) || vistas.has(n)) return;
    if (existen.has(n)) return;
    malas2.push(n);
  });

  if (malas2.length) {
    console.log('');
    console.log('  *** ' + f + ' NOMBRA ' + malas2.length + ' COSA(S) QUE NO EXISTEN ***');
    malas2.forEach(function (n) {
      console.log('      public.' + n);
      console.log('        ¿es una tabla? ' + (existen.has(n) ? 'sí' : 'NO'));
    });
    console.log('');
    console.log('    Si no existe, la migración se cae donde lo nombra. Y como los "insert" van');
    console.log('    al final, la tabla y las políticas quedan hechas y los permisos sin dar.');
    console.log('    Ver [firma-12].');
    malas++;
    return;
  }
  console.log('    ok  ' + f + ': todo lo que nombra existe');
});

console.log('');
if (malas) {
  console.log('  *** ' + malas + ' MIGRACION(ES) CON NOMBRES QUE NO EXISTEN ***');
  process.exit(1);
}
console.log('    ok  las ' + archivos.length + ' migraciones 06x nombran solo cosas que existen');