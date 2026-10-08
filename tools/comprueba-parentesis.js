// ===================================================================
// COMPRUEBA-PARENTESIS
// ===================================================================
// QUE LOS PARÉNTESIS Y LAS COMILLAS DE LOS ARCHIVOS .SQL CUADREN
//
// ---------------------------------------------------------------------
// POR QUÉ ESTE GUARDIÁN, Y POR QUÉ NO ESTABA
// ---------------------------------------------------------------------
//
// Porque "comprueba-codigo-sql.js" avisa de código comentado y de "inserts
// partidos", y por el nombre parece que también revisa paréntesis. No lo hace.
//
// Se comprobó inyectando un error de verdad: un ")" de más al final de una
// consulta de "migrations/scripts/encender-modulos-085.sql", que es exactamente
// lo que hizo fallar ese guion contra PostgreSQL:
//
//     ERROR: 42601: syntax error at or or ")"
//
// Y el guardián dijo "ok".
//
// Y LO QUE PASÓ DESPUÉS
//
// El guion se había aplicado a medias: la consulta de vista previa falló, y las
// que iban después —incluido el "insert" que enciende los módulos— nunca
// corrieron. Cuarenta y siete empresas quedaron sin ningún módulo.
//
// ---------------------------------------------------------------------
// POR QUÉ CONTAR PARÉNTESIS SÍ SIRVE, Y ADIVINAR EL SQL NO
// ---------------------------------------------------------------------
//
// Contar paréntesis no adivina nada. Es una cuenta, y una cuenta se puede
// comprobar con un caso conocido: si el código da el mismo número que el
// Balanceo::<par> de PostgreSQL, y el código no se rompe, el número está bien.
//
// Y NO CUENTA DENTRO DE COMENTARIOS NI DENTRO DE CADENAS
//
// Que es donde se cuelan los paréntesis falsos: un "(" en un "--" que explica
// algo, o dentro de un texto con apóstrofos. Contarlos da un número que no es el
// del archivo.
//
// ---------------------------------------------------------------------
// Y OTRAS DOS COSAS QUE CUENTAN Y QUE TAMBIÉN SE ROMPEN
// ---------------------------------------------------------------------
//
//   - La coma al final del archivo, antes del ";", que es lo que permite partir
//     una migración en varias columnas sin tocar lo que hay.
//   - El paréntesis de "$$", que abre y cierra un cuerpo de función. Va
//     balanced en la mayoría de los casos, pero si un cuerpo termina con "$$;" y
//     otro con "$$\n", el conteo igual da bien. No se mira; queda dicho.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------
// LA CUENTA, SIN COMENTARIOS NI CADENAS
// ---------------------------------------------------------------------
// Y POR QUÉ SE RECORRE CARÁCTER A CARÁCTER Y NO CON UNA EXPRESIÓN REGULAR
//
// Porque "()" adentro de un comentario es un texto, y una expresión regular no
// sabe la diferencia entre un paréntesis y un paréntesis que está hablando de un
// paréntesis. El recorrido con estado sí: va viendo si está en comentario o en
// cadena antes de contar.
function contar(sql) {
  let parentesis = 0;
  let corchetes = 0;
  const bajo = [];
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const dos = sql.substr(i, 2);

    // 1. EL COMENTARIO DE UNA LÍNEA: "--" hasta el fin de línea
    if (dos === '--') {
      const fin = sql.indexOf('\n', i);
      i = (fin < 0 ? n : fin) + 1;
      continue;
    }

    // 2. EL COMENTARIO DE BLOQUE: "/* ... */", y THESE ES EL QUE MIENTE
    //
    // Porque se puede anidar en algunos dialectos y no en otros, y un "/*" dentro
    // de un "/*" no siempre está donde uno cree. Se cuenta la profundidad.
    if (dos === '/*') {
      let fondo = 1;
      i += 2;
      while (i < n && fondo > 0) {
        if (sql.substr(i, 2) === '/*') { fondo++; i += 2; }
        else if (sql.substr(i, 2) === '*/') { fondo--; i += 2; }
        else i++;
      }
      continue;
    }

    // 3. LAS CADENAS
    //
    // Con comillas simples se escapan duplicando la comilla: 'no soy ''esta'''
    // es una sola cadena, no dos. Sin eso se cuenta el final donde no es y el
    // número sale mal.
    if (ch === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }   // comilla escapada
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // 4. LOS IDENTIFICADORES CON COMILLAS DOBLES: "una tabla"
    if (ch === '"') {
      i++;
      while (i < n && sql[i] !== '"') i++;
      i++;
      continue;
    }

    // 5. EL DOLLAR-QUOTE DEL CUERPO DE UNA FUNCIÓN
    //
    // "$$ ... $$" y "$etiqueta$ ... $etiqueta$". Un "(" adentro no cuenta, y un
    // "$$" abre y cierra.
    if (ch === '$') {
      const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (m) {
        const cierre = sql.indexOf(m[0], i + m[0].length);
        bajo.push({ linea: lineaDe(sql, i), largo: m[0].length });
        i = (cierre < 0 ? n : cierre + m[0].length);
        continue;
      }
    }

    // 6. AHORA SÍ, CUENTO
    if (ch === '(') parentesis++;
    else if (ch === ')') parentesis--;
    else if (ch === '[') corchetes++;
    else if (ch === ']') corchetes--;

    // Y SI QUEDA NEGATIVO, NO HACE FALTA LLEGAR AL FINAL PARA SABER QUE ESTÁ MAL
    //
    // Un cierre de más no se compensa con una apertura de más que venga después:
    // el archivo ya está mal, y seguir contando es hacer trabajo para nada. Se
    // avisa en el renglón, que es lo que sirve.
    if (parentesis < 0) {
      return { parentesis: parentesis, corchetes: corchetes, linea: lineaDe(sql, i),
               motivo: 'un ")" de más: queda negativo en este renglón' };
    }
    if (corchetes < 0) {
      return { parentesis: parentesis, corchetes: corchetes, linea: lineaDe(sql, i),
               motivo: 'un "]" de más' };
    }
    i++;
  }

  if (parentesis !== 0 || corchetes !== 0) {
    return { parentesis: parentesis, corchetes: corchetes, linea: 0,
             motivo: 'faltan ' + (parentesis > 0 ? parentesis + ' "("' : Math.abs(parentesis) + ' ")"')
                     + (corchetes !== 0 ? ' y ' + corchetes + ' de corchete' : '') };
  }
  return { parentesis: 0, corchetes: 0, linea: 0, motivo: '' };
}

function lineaDe(sql, indice) {
  return sql.slice(0, indice).split(/\r\n|\n|\r/).length;
}

// ---------------------------------------------------------------------
// LOS ARCHIVOS
// ---------------------------------------------------------------------
let archivos;
try {
  archivos = execSync('git ls-files --cached --others --exclude-standard migrations',
    { cwd: RAIZ, encoding: 'utf8' })
    .split(/\r\n|\n|\r/)
    .filter(function (f) { return f.endsWith('.sql'); });
} catch (e) {
  console.log('  *** no se pudieron listar los archivos de migrations/');
  process.exit(1);
}

console.log('  === paréntesis y corchetes en los .sql de migrations/ ===');
console.log('    ' + archivos.length + ' archivo(s), y los de migrations/scripts/ van incluidos');
console.log('');

let malos = 0;
archivos.forEach(function (rel) {
  const sql = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  const r = contar(sql);
  if (r.motivo) {
    malos++;
    console.log('    *** ' + rel + (r.linea ? ':' + r.linea : ''));
    console.log('        ' + r.motivo);
    console.log('        PostgreSQL lo rechaza entero: "syntax error at or near \')\'".');
    console.log('        Y si el archivo es un guion con varias sentencias, las que');
    console.log('        vienen después NO SE EJECUTAN. Ya pasó con');
    console.log('        "encender-modulos-085.sql": falló la vista previa y no se');
    console.log('        encendió ningún módulo en ninguna empresa.');
  }
});
console.log('');
if (malos) {
  console.log('  *** ' + malos + ' ARCHIVO(S) CON DESCUADRE ===');
  process.exit(1);
}
console.log('  ok  los ' + archivos.length + ' archivos cuadran');

// ---------------------------------------------------------------------
// LA COMPROBACIÓN DE ESTA COMPROBACIÓN
// ---------------------------------------------------------------------
// Y CON LOS ERRORES REALES, NO CON ERRORES INVENTADOS
//
// El primero es textualmente el que se cometió: un ")" de más. El segundo es un
// "(" que nunca se cierra, que es el otro sentido del mismo error y que el
// recorrido tiene que ver también. Y los dos siguientes son los que NO tienen que
// ver: un paréntesis dentro de un comentario, y otro dentro de una cadena. Un
// guardián que los contara daría un error donde no hay.
console.log('');
console.log('  === el guardián se comprueba a si mismo ===');
const CASOS = [
  ['ok, lo normal', "select cast(x as text) from t;", true],
  ['*** el que se cometió: un ")" de más', "select 1) from t;", false],
  ['*** un "(" que no cierra', "select cast(x as text from t;", false],
  ['ok, un paréntesis en un comentario no cuenta',
   "select 1;  -- esto es un ( y otro ) y no vancuenta", true],
  ['ok, un paréntesis en una cadena no cuenta',
   "select 'un ( y un ) adentro' from t;", true],
  ['ok, una comilla escapada no cierra la cadena',
   "select 'no soy ''esta''' || '(' from t;", true],
  ['ok, un $$ ... $$ con paréntesis adentro',
   "create function f() returns int as $$ begin return (1); end $$ language plpgsql;", true],
  ['ok, un corchete de más', "select a[1] from t];", false],
];
let fallos = 0;
CASOS.forEach(function (c) {
  const r = contar(c[1]);
  const cuadra = r.motivo === '';
  const bien = cuadra === c[2];
  if (!bien) fallos++;
  console.log('    ' + (bien ? 'ok  ' : '*** ') + c[0]
    + '   (cuadra: ' + (cuadra ? 'sí' : 'no') + ')');
});
console.log('');
if (fallos) {
  console.log('    *** el guardián falla ' + fallos + ' de sus ' + CASOS.length + ' casos');
  process.exit(1);
}
console.log('    ok  el guardián ve los ' + CASOS.length + ' casos, y no ve los falsos');