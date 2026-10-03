// PRUEBA QUE EL GUARDIÁN DE SQL YA PUEDE FALLAR
// ==============================================
//
// ---------------------------------------------------------------------
// POR QUÉ HACE FALTA ESTA PRUEBA
// ---------------------------------------------------------------------
//
// Porque el guardián acaba de aprobar un archivo roto, y dijo "todo lo que nombra existe" con
// una seguridad que no tenía razón para tener. Ese es el peor estado posible de un guardián: no
// es que no sirva, es que MENTE.
//
// Y no se arregla escribiendo una comprobación y declarándola buena. Se arregla ROMPIÉNDOLA a
// propósito y viendo que se da cuenta. Si uno mete el error de nuevo y el guardián pasa, entonces
// la comprobación no está mirando lo que dice mirar.
//
// ---------------------------------------------------------------------
// LOS CASOS
// ---------------------------------------------------------------------
//
//   1. "public.storage.objects" — el error real de la 067, textual.
//   2. "public.auth.uid" — el mismo error con otro esquema.
//   3. "public.net.algo" — y con el tercer esquema de la lista.
//   4. "storage.objects" — lo CORRECTO: tiene que pasar.
//   5. "asistencia" — una tabla normal: tiene que pasar.
//   6. Una tabla que no existe: tiene que fallar, para saber que el guardián sigue vigilando lo
//      de antes y no solo lo nuevo.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';
const MIG = path.join(RAIZ, 'migrations');
const GUARDIAN = path.join(RAIZ, 'tools', 'revisa-nombres-sql.js');

// El archivo de prueba se llama "067z..." para que entre en el filtro "/^06\d.*\.sql$/", que es
// como el guardián decide qué revisa.
const PRUEBA = path.join(MIG, '067z_prueba_guardian.sql');

const CASOS = [
  { que: 'el error real de la 067: "public.storage.objects"', debe: 'fallar',
    sql: 'drop policy if exists "x" on public.storage.objects;' },
  { que: 'el mismo error con "auth"', debe: 'fallar',
    sql: 'select 1 from public.auth.uid;' },
  { que: 'el mismo error con "net"', debe: 'fallar',
    sql: 'alter table public.net.algo enable row level security;' },
  { que: 'una tabla que no existe', debe: 'fallar',
    sql: 'select 1 from public.tabla_que_no_existe_de_ningun_lado;' },
  { que: '"storage.objects" SIN el "public." — lo correcto', debe: 'pasar',
    sql: 'drop policy if exists "x" on storage.objects;' },
  { que: '"auth.uid" sin el "public." — lo correcto', debe: 'pasar',
    sql: 'select auth.uid();' },
  { que: 'una tabla de las 78 que existen', debe: 'pasar',
    sql: 'select 1 from asistencia;' },
];

console.log('  === ¿el guardián puede fallar? ===');

let fallos = 0;

CASOS.forEach(function (c) {
  fs.writeFileSync(PRUEBA, '-- archivo de prueba\n' + c.sql + '\n');

  let codigo = 0;
  let salida = '';
  try {
    salida = execFileSync('node', [GUARDIAN], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    codigo = 1;
    salida = (e.stdout || '') + (e.stderr || '');
  }

  const fallo = codigo !== 0;
  const bien = (c.debe === 'fallar' && fallo) || (c.debe === 'pasar' && !fallo);
  if (!bien) fallos++;

  console.log('');
  console.log('  ' + (bien ? 'ok  ' : '*** ') + c.que);
  console.log('        tiene que ' + c.debe + '  →  '
    + (fallo ? 'FALLÓ' : 'pasó') + (bien ? '' : '   *** NO ES LO QUE TIENE QUE HACER ***'));

  // Y se muestra lo que dijo, para que el fallo se pueda leer y no sea solo una palabra.
  const linea = String(salida).split(/\r?\n/)
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x.indexOf('***') >= 0 || x.indexOf('ESQUEMA') >= 0; });
  linea.slice(0, 3).forEach(function (x) { console.log('          ' + x.slice(0, 84)); });
});

try { fs.unlinkSync(PRUEBA); } catch (e) { void e; }


console.log('');
if (fallos) {
  console.log('  *** ' + fallos + ' CASO(S) DONDE EL GUARDIÁN NO HIZO LO QUE DEBÍA ***');
  process.exit(1);
}
console.log('    ok  los ' + CASOS.length + ' casos: el guardián falla cuando tiene que fallar');
console.log('        y pasa cuando tiene que pasar');
console.log('');
console.log('    Y el archivo de prueba se borró. Quedó en migrations/, no en el disco limpio:');
console.log('        ' + (fs.existsSync(PRUEBA) ? '*** TODAVÍA ESTÁ ***' : 'ok  no está'));
