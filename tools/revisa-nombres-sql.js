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
//
// Y NOTA: aquí ya NO están "auth" ni "storage", y antes sí. Eran ESQUEMAS, no tablas, y estar
// en la lista de tablas era lo que hacía que el guardián apruebara cualquier
// "public.storage.cualquierCosa" —porque de ese nombre el guardián solo leía "storage", y
// "storage" estaba en la lista. Ver [sql-01].
// Y "profiles" TAMBIÉN ESTÁ, Y POR QUÉ
//
// Viene del mismo lado que "trabajadores" y "empresa": el esquema original de la
// aplicación en Supabase. Ninguna migración del repositorio la crea con "create
// table", y sin embargo el código la usa en todas partes —
// "from('perfiles')", "auth.uid()", el nombre de quien creó una fila—.
//
// Y LO QUE PASÓ AL NO ESTAR
//
// La 086 nombra "public.profiles" en las funciones de permisos horarios, y el
// guardián dijo que no existía. Existe. Lo que no existía era la lista.
//
// Y por qué no se relaja el guardián para que pase: porque una lista incompleta que
// se relaja para que un archivo pase deja de avisar de los nombres que están de
// verdad mal. La lista se completa; el guardián sigue igual de estricto.
['empresa', 'trabajadores', 'profiles'].forEach(function (t) { existen.add(t); });

// Los esquemas que existen pero NO son del "public". Se permiten como prefijo, y solo como
// prefijo: "storage.objects" sí, "public.storage.objects" no.
const ESQUEMAS_FUERA = ['storage', 'auth', 'net', 'extensions', 'graphql_public'];

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
//
// Y ahora revisa las SETENTA Y UNA migraciones, no las diez de una tanda. El patrón pasó de
// "/^06\d/" a "/^0\d\d/", que es la convención del proyecto: 001, 014, 047, 067, 071.
//
// Y eso no es gratis: al Ampliar el filtro apareció un nombre que el guardián no conoce,
//
//     public.avisos_ingreso_unico_dia
//
// que es el ÍNDICE ÚNICO de la 026, no una tabla. Ver "ÍNDICES" más abajo. Y el filtro NO se
// vuelve atrás: dejar la 071 sin revisar sería peor que revisar de más.
const archivos = fs.readdirSync(MIG)
  .filter(function (f) { return /^0\d\d.*\.sql$/i.test(f); })
  .sort();

if (!archivos.length) {
  console.log('    no hay migraciones numeradas para revisar');
  process.exit(0);
}

// ---------------------------------------------------------------------
// ÍNDICES, QUE NO SON TABLAS Y EL GUARDIÁN NO LOS CONOCÍA
// ---------------------------------------------------------------------
//
// Y esto no se agrega para tapar el error: se agrega porque es un tipo de objeto que las
// migraciones usan y que el guardián no leía.
//
// "public.avisos_ingreso_unico_dia" aparece en la 026 como "drop index if exists". El
// guardián lo vio, lo buscó en la lista de tablas, no lo encontró —porque es un índice— y lo
// reportó como una tabla que no existe.
//
// Y el nombre engaña: termina en "_dia" como si fuera una tabla de días. Es un índice único
// sobre "avisos_ingreso", y se llama así porque evita dos avisos de ingreso el mismo día. Un
// nombre de índice no dice de qué es índice.
//
// Y por qué el filtro estaba ocultando esto: mientras solo revisaba la tanda 06x, ninguna
// migración vieja con un índice pasaba por acá. Al ampliarlo, aparecieron las 71.
//
// ---------------------------------------------------------------------
// POR QUÉ NO ES SOLO "AGREGAR ESTE ÍNDICE"
// ---------------------------------------------------------------------
//
// Porque la 026 nombra uno y hay otras 70 migraciones. Agregar el nombre de uno es arreglar el
// síntoma. Lo que se hace es leer los índices de las 71 migraciones, como ya se leen las
// tablas y las funciones.
//
// Y que sea automático importa: un índice escrito a mano en la lista se cae en la migración
// siguiente que agregue uno, y es el mismo problema de "hay que acordarse".
const indices = new Set();

function leerIndices(texto) {
  const sinComentarios = texto
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // "create index", "create unique index", "drop index if exists".
  const re = /(?:create\s+(?:unique\s+)?index|drop\s+index(?:\s+if\s+exists)?)\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  let m;
  while ((m = re.exec(sinComentarios)) !== null) indices.add(m[1].toLowerCase());
}

fs.readdirSync(path.join(RAIZ, 'supabase'))
  .filter(function (f) { return f.endsWith('.sql'); })
  .forEach(function (f) { leerIndices(fs.readFileSync(path.join(RAIZ, 'supabase', f), 'utf8')); });
leerDel().forEach(function (t) { leerIndices(t); });

console.log('    ' + indices.size + ' índices conocidos del proyecto');

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

  // -------------------------------------------------------------------
  // "public." CON UN ESQUEMA QUE NO ES "public"
  // -------------------------------------------------------------------
  //
  // Y esto es una comprobación aparte, y va PRIMERO, porque es la que hubiera cazado el
  // "public.storage.objects" de la 067.
  //
  // El error se ve en la consola como:
  //
  //     ERROR: 0A000: cross-database references are not implemented: "public.storage.objects"
  //
  // Y "cross-database" es la palabra que despista: no habla de permisos ni de conexión. Habla de
  // que Postgres NO ENCONTRÓ el primer nombre de la ruta, y cuando no lo encuentra interpreta
  // "public" como el nombre de una BASE DE DATOS. "public.storage" no existe —"storage" es un
  // esquema, no una tabla del esquema "public"—, y por eso el mensaje habla de otra base.
  //
  // El nombre correcto, cuatro líneas más abajo en el mismo proyecto, está en la 008:
  // "storage.objects". Y la 067 lo escribió con el "public." de más.
  //
  // -------------------------------------------------------------------
  // POR QUÉ NO LO CECHABA EL GUARDIÁN
  // -------------------------------------------------------------------
  //
  // Por dos razones que se tapaban entre sí, y las dos hay que arreglarlas:
  //
  //   · El patrón de abajo leía UN identificador después de "public." —el primero—. De
  //     "public.storage.objects" leía "storage".
  //   · Y "storage" estaba en la lista de tablas conocidas. O sea que leía un esquema, lo
  //     buscaba en la lista de tablas, lo encontraba, y decía "ok".
  //
  // Dos errores que se cancelan. Y el peor caso de dos errores que se cancelan no es que no
  // no pase nada: es que pase LO CONTRARIO. Un guardián que aprueba un archivo roto hace más
  // daño que uno que no existe, porque ocupa el lugar del que avisa.
  const reEsquema = new RegExp('\\bpublic\\.(' + ESQUEMAS_FUERA.join('|') + ')(?![a-z0-9_])', 'gi');
  const esquemasMalPuestos = [];
  let e;
  while ((e = reEsquema.exec(t)) !== null) esquemasMalPuestos.push(e[1].toLowerCase());

  if (esquemasMalPuestos.length) {
    console.log('');
    console.log('  *** ' + f + ': "public." CON UN ESQUEMA QUE NO ES "public" ***');
    esquemasMalPuestos.forEach(function (s) {
      console.log('      public.' + s + '.…');
      console.log('        "' + s + '" es un ESQUEMA, no una tabla del esquema "public".');
      console.log('        La tabla se escribe "' + s + '.objeto", sin el "public." delante.');
    });
    console.log('');
    console.log('    El error que sale dice "cross-database references are not implemented",');
    console.log('    y no habla de permisos: dice que no encontró el nombre y lo tomó por una base');
    console.log('    de datos. Ver [sql-01].');
    malas++;
  }

  const malas2 = [];
  nombradas.forEach(function (n) {
    if (NO_ES_TABLA.test(n)) return;
    if (funciones.has(n) || vistas.has(n)) return;
    // Y los índices, que son el cuarto tipo de objeto. Ver "ÍNDICES" más arriba.
    if (indices.has(n)) return;
    if (existen.has(n)) return;
    malas2.push(n);
  });

  if (malas2.length) {
    console.log('');
    console.log('  *** ' + f + ' NOMBRA ' + malas2.length + ' COSA(S) QUE NO EXISTEN ***');
    malas2.forEach(function (n) {
      console.log('      public.' + n);
      console.log('        ¿es una tabla? ' + (existen.has(n) ? 'sí' : 'NO'));
      console.log('        ¿es un índice? ' + (indices.has(n) ? 'sí' : 'NO')
        + (indices.has(n) ? '  (entonces el guardián no lo conocía)' : ''));
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
console.log('    ok  las ' + archivos.length
  + ' migraciones numeradas nombran solo cosas que existen');