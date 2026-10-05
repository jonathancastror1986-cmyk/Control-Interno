// ===================================================================
// COMPRUEBA-CODIGO-SQL: QUE UNA MIGRACION NO LLEVE CODIGO COMENTADO
// ===================================================================
//
// Corre esto ENTERO en la carpeta del proyecto:  node tools/comprueba-codigo-sql.js
// Y no toca la base: solo lee los archivos .sql de migrations/.
//
// ---------------------------------------------------------------------
// POR QUE EXISTE ESTE GUARDIAN
// ---------------------------------------------------------------------
//
// Las migraciones 076 y 077 se leyeron enteras,<byte> el escaner de caracteres rotos dio limpio, y
// el guardian de nombres SQL dio verde. Y las dos NO compilaban:
//
//   076: el "values" terminaba en ";" y dejaba el "on conflict" solo, Syntax error at or near "on".
//   077: dos columnas quedaron como "--   asig_fam      integer,", y la tabla se creo sin ellas.
//        Despues fallo el "comment on column" con 42703.
//
// Y ESO ES LO PEOR DE ESTOS ERRORES: no se ven leyendo. La 077 tiene treinta columnas y dos estan
// comentadas, y el texto se ve perfecto. Un archivo con codigo comentado tiene el mismo aspecto que
// uno con codigo.
//
// ---------------------------------------------------------------------
// POR QUE NO ALCANZA CON QUE LA BASE LO DIJA
// ---------------------------------------------------------------------
//
// Porque la base es del usuario. El guardian corre antes de que el usuario tenga que pegarlo en
// el panel, y un error de sintaxis que se descubre pegandolo son dos minutos perdidos del suyo y
// una confianza perdida en el archivo.
//
// ---------------------------------------------------------------------
// LOS TRES ERRORES QUE BUSCA
// ---------------------------------------------------------------------
//
//   1. CODIGO COMENTADO: una linea "--   columna integer," o "-- select ..." que en realidad es
//      codigo. Se busca por la FORMA, no por una lista de palabras: cualquier linea comentada que
//      parezca un tipo de dato de PostgreSQL o una palabra clave de SQL.
//
//   2. UN ";" ANTES DE "ON CONFLICT": el sintoma clasico del insert partido. Se busca el ";" entre
//      el "insert" y el "on conflict", que es lo unico que puede estar.
//
//   3. UN "COMMENT ON COLUMN" DE UNA COLUMNA QUE NO ESTA DEFINIDA: que es como se manifesto el
//      de la 077. Se cruzan los "comment on column" contra las columnas del "create table" de la
//      misma migracion.
//
// Y NO SE APLICA A LAS MIGRACIONES VIEJAS: el archivo se salta solo si es anterior a la 076, que
// es donde empieza a mirar. Las viejas ya compilan, y revisarlas todas seria ruido.

const { execSync } = require('child_process');
const fs = require('fs');

// Y CON "--OTHERS", PORQUE UNA MIGRACION NUEVA NO ESTA RASTREADA TODAVIA
//
// "git ls-files" a secas solo lista lo que ya esta en el indice, y este guardián se ejecuta justo
// antes de commitear: la migracion que se esta revisando es SIEMPRE nueva, y con la lista a secas
// no la ve. Es el mismo error que se cometio una vez en "comprueba-codigos", y se manifesto
// probando el guardian con un archivo de prueba: no dio ninguna alarma, porque no existia para el.
const arch = execSync('git ls-files --cached --others --exclude-standard migrations', { maxBuffer: 1e8 }).toString()
  .split(/\r\n|\n|\r/).filter(f => f.endsWith('.sql'));

// Y DESDE QUE MIGRACION SE APLICA. Antes de la 076 no se mira nada.
const DESDE = 76;

const TIPOS = /\b(integer|int|bigint|smallint|numeric|decimal|text|varchar|char|boolean|date|timestamp|timestamptz|uuid|json|jsonb|bytea)\b/i;
const CLAVES = /^(select|insert|update|delete|alter|create|drop|with|values|from|where|group|order|limit|on\s+conflict|returning|comment\s+on|insert\s+into)\b/i;

// Y LA FORMA DE UNA DEFINICION DE COLUMNA, QUE ES LO QUE DISTINGUE EL CODIGO DE LA PROSA
//
// Un tipo suelto no basta: "real" es un tipo de PostgreSQL y tambien una palabra que aparece en
// cualquier frase("-- de un archivo real, no de un modelo"), y el guardian gritaba por una linea
// de comentario normal. Lo que tiene que verse es un NOMBRE seguido de un TIPO, que es lo unico
// que una linea de codigo tiene y una frase no.
const COLUMNA = /^\s*[a-z_][a-z0-9_]*\s+(integer|int|bigint|smallint|numeric|decimal|text|varchar|char|boolean|date|timestamp|timestamptz|uuid|json|jsonb|bytea)\b/i;

let malas = 0;
let vistas = 0;

arch.forEach(function (f) {
  const m = /(\d+)_/.exec(f);
  const n = m ? parseInt(m[1], 10) : 0;

  // Y LOS DIAGNÓSTICOS TAMBIÉN SE MIRAN, Y NO TIENEN NÚMERO
  //
  // El filtro de "DESDE" se come todo lo que no empieza con tres dígitos, y los archivos
  // "diagnostico-*.sql" no tienen. Por eso el diagnostic de migraciones tenía una raya de sección
  // sin el "--", y al pegarla dio "operator too long at or near ===" -- EL MISMO ERROR, POR SEGUNDA
  // VEZ, en un archivo que este guardián deberia haber mirado.
  //
  // Un diagnostico se pega en el panel igual que una migración, así que se revisa igual.
  const esDiagnostico = /diagnostico/i.test(f);
  if (!esDiagnostico && n < DESDE) return;

  const txt = fs.readFileSync(f, 'utf8');
  const l = txt.split(/\r\n|\n|\r/);
  const poder = [];

  // ---- 1) CODIGO COMENTADO, SOLO EN LAS MIGRACIONES ----
  //
  // En una migración, una línea de código comentada es un error mío: la empujé con la función
  // equivocada y la tabla quedó sin columnas. En un diagnóstico es lo contrario: alguien desactivó
  // una consulta a propósito porque no le servía, y eso hay que dejarlo.
  //
  // Y por eso el cambio es de alcance, no de regla: la misma comprobación significa dos cosas
  // distintas según el archivo, y no puede ser la misma.
  // Y EL BLOQUE DE "PARA VOLVER ATRÁS", QUE ES CÓDIGO COMENTADO A PROPÓSITO
  //
  // Toda migración cierra con el "drop" de lo que creó, comentado, para que
  // se pueda deshacer. Eso es código comentado, y la comprobación de arriba
  // lo marca: lo salta.
  //
  // Pero el caso de "código comentado" que hay que cazar es OTRO: la
  // definición de una tabla a la que faltaba una columna, porque la línea
  // "--  Something text," se coló. Ahí el código se empujó sin querer y la
  // tabla quedó incompleta. Eso nunca es a propósito.
  //
  // ---- Y POR QUÉ NO PUEDO SALTAR "DESDE EL ROLLBACK HACIA EL FINAL" ----
  //
  // Porque se probó y NO funciona: si el rollback aparece arriba del
  // archivo, todo lo que está debajo queda sin mirar, y el bug de la columna
  // faltante se cuela sin que nadie lo note. Que es justo lo que este
  // guardián existe para evitar. El primer intento hacía eso y falló.
  //
  // El arreglo: se salta el BLOQUE, no el resto del archivo. El bloque
  // termina en cuanto aparece una línea que NO es comentario. Un rollback de
  // verdad es un bloque de comentarios al final; uno puesto en el medio
  // corta ahí, y lo que sigue se sigue revisando.
  const enRollback = new Array(l.length).fill(false);
  for (let i = 0; i < l.length; i++) {
    const t = l[i].trim();
    if (!(t.startsWith('--') && /volver\s+atr|rollback|deshacer|revertir/i.test(t))) continue;
    // Y DESDE EL TÍTULO, SE MARCA HASTA QUE TERMINE EL BLOQUE
    for (let j = i; j < l.length; j++) {
      const q = l[j].trim();
      if (q && !q.startsWith('--')) break;   // se acaba el bloque
      enRollback[j] = true;
    }
  }

  if (!esDiagnostico) {
    l.forEach(function (x, i) {
      const t = x.trim();
      if (!t.startsWith('--')) return;
      // Y EL ROLLBACK, QUE SE SALTA ENTERO
      if (enRollback[i]) return;
      const dentro = t.replace(/^--\s*/, '');
      if (!COLUMNA.test(dentro) && !CLAVES.test(dentro)) return;
      poder.push('L' + (i + 1) + '  CODIGO COMENTADO: ' + t.slice(0, 64));
    });
  }

  // ---- 2) EL ";" ANTES DEL "ON CONFLICT" ----
  const posIns = txt.indexOf('insert into');
  const posOn = txt.indexOf('on conflict');
  if (posIns >= 0 && posOn >= 0 && posOn > posIns && txt.slice(posIns, posOn).indexOf(';') >= 0) {
    const ln = txt.slice(0, posOn).split(/\r\n|\n|\r/).length;
    poder.push('L' + (ln + 1) + '  hay un ";" ANTES del "on conflict": el insert quedo partido');
  }

  // ---- 3) UN "COMMENT ON COLUMN" DE UNA COLUMNA QUE NO ESTA ----
  const columnas = new Set();
  l.forEach(function (x) {
    // Y CON CUALQUIER NUMERO DE ESPACIOS DE SANGRIA, NO CON DOS FIJOS
    //
    // Las columnas del 077 quedaron con tres espacios y el patron pedia dos, asi que decia que
    // "provision" no estaba definida -- y si lo estaba. Un guardian que se equivoca de lado hace
    // dudar del otro lado tambien.
    const mm = /^\s+([a-z_][a-z0-9_]*)\s+(integer|int|text|date|boolean|uuid|numeric|timestamptz)\b/i.exec(x);
    if (mm) columnas.add(mm[1]);
  });
  if (columnas.size) {
    l.forEach(function (x, i) {
      const mm = /comment on column\s+public\.(\w+)\.(\w+)/i.exec(x);
      if (!mm) return;
      if (columnas.has(mm[2])) return;
      poder.push('L' + (i + 1) + '  hace comment de "' + mm[2] + '", que no esta definida en el create table');
    });
  }

  // ---- 5) PARÉNTESIS Y COMILLAS ----
//
// Y POR QUÉ SOLO CUENTO Y NO INTERPRETO
//
// Revisar sintaxis SQL de verdad necesita un motor: hay que entender el "with", los "case", los
// agregados de ventana y cien reglas más. No hay un Postgres local, y no lo voy a pretender.
//
// Lo que SÍ se puede es contar delimitadores, y eso tapa una clase entera de errores: un
// paréntesis de más, una comilla sin cerrar, un dollar-quote sin parejar.
//
// Y ESTOS ERRORES SALIERON EN UN DÍA Y NINGUNO LO AGARRÓ UN GUARDIÁN
//
//   "on conflict" huérfano         el ";" cortaba la sentencia
//   position(record, unknown)      se usó el nombre del CTE como columna
//   CASE/WHEN debe ser booleano    el "||" tiene más precedencia que el "~"
//   operator too long at "="        una raya de sección perdió el "--"
//   syntax error at or near ")"     un CTE cerrado dos veces
//
// Los dos primeros ya los tapaban otras comprobaciones. Estas dos tapas las de conteo, que
// son las que se repitieron.
//
// ---- Y EL ORDEN: PRIMERO SE SACAN COMENTARIOS Y CADENAS, DESPUÉS SE CUENTA ----
//
// Porque un "(" dentro de un comentario no cuenta, y uno dentro de una cadena tampoco: un
// " where (a, '') " tiene un paréntesis y dos comillas que no son nada. Contar sobre el
// archivo entero da un número que no significa nada, y un guardián que da números que no
// significan nada entrena a que lo ignoren.
  const soloCodigo = txt
    .split('\n')
    .map(x => (/^\s*--/.test(x) ? '' : x))   // los comentarios de línea entera
    .join('\n')
    .replace(/\$\$\$\$[\s\S]*?\$\$\$\$/g, "")    // los dollar-quote completos
    .replace(/'([^']|'')*'/g, "''");            // las cadenas simples

  const nAbren = (soloCodigo.match(/\(/g) || []).length;
  const nCierran = (soloCodigo.match(/\)/g) || []).length;
  if (nAbren !== nCierran) {
    poder.push('parentesis desbalanceados: ' + nAbren + ' abren y ' + nCierran + ' cierran');
  }

  const nComillas = (soloCodigo.match(/'/g) || []).length;
  if (nComillas % 2 !== 0) {
    poder.push('comillas desbalanceadas: ' + nComillas + ' (un numero impar: falta cerrar una)');
  }

// ---- 4) UNA RAYA DE SECCION SIN EL "--" ----
  //
  // Y ESTE ES EL ERROR QUE MAS CUESTA VER, PORQUE NO ESTA EN EL CODIGO
  //
  // Las rayas de "=====" que separan las secciones son COMENTARIOS: llevan "--" adelante. Una vez
  // se escribieron con la funcion que empuja codigo en vez de la que empuja comentario, y la raya
  // quedo suelta. Al pegarla, PostgreSQL la leyo como un operador de igualdad gigante y contesto
  // "42601: operator too long at or near =========", que no dice nada de un comentario perdido.
  //
  // Y el "--" no se ve al leer, porque el archivo se ve igual de prolijo: la raya esta donde
  // corresponde y tiene el ancho correcto. Solo falta el dos guiones del principio.
  const rayasSueltas = [];
  l.forEach((x, i) => {
    const t2 = x.trim();
    if (t2.length > 10 && /^={10,}$/.test(t2)) rayasSueltas.push(i + 1);
  });
  if (rayasSueltas.length) {
    poder.push('raya de seccion SIN "--" en la linea(s) ' + rayasSueltas.join(', ')
      + ': al pegarla da "operator too long at or near ==="');
  }

  if (!poder.length) {
    vistas++;
    console.log('  ok  ' + f.split('/').pop() + ': nada sospechoso');
    return;
  }
  malas += poder.length;
  console.log('  *** ' + f.split('/').pop() + ': ' + poder.length + ' problema(s)');
  poder.forEach(function (p) { console.log('        ' + p); });
});

console.log('');
if (malas) {
  console.log('  *** ' + malas + ' PROBLEMA(S). ESTA MIGRACION NO VA A COMPILAR: NO SE SUBE.');
  process.exit(1);
}
console.log('  ok  las ' + vistas + ' migraciones desde la 076 no llevan codigo comentado ni inserts partidos.');
