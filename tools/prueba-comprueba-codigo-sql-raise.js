// ===================================================================
// prueba-comprueba-codigo-sql-raise.js
// ===================================================================
// EL GUARDIÁN DE SQL TIENE QUE VER EL "||" EN EL "raise exception"
// ===================================================================
//
// ---------------------------------------------------------------------
// POR QUÉ ESTA PRUEBA EXISTE Y NO ES UN ADORNADO
// ---------------------------------------------------------------------
//
// La regla 6 del guardián se agregó después de que la migración 089 se cayera en la
// base con un "syntax error at or near ||". Un guardián que no se prueba solo es una
// línea de código que parece que protege algo.
//
// Y el modo de fallar de este tipo de regla es muy traicionero: como busca un texto
// literal, funciona perfecto contra el archivo de ejemplo y no encuentra nunca el
// bug real. Por eso la prueba mete el bug en una migración de verdad y la saca
// después.
//
// ---------------------------------------------------------------------
// Y POR QUÉ USA UNA MIGRACIÓN REAL Y NO UN ARCHIVO DE EJEMPLO
// ---------------------------------------------------------------------
//
// Porque el guardián recorre "migrations" con una lista de archivos que saca del
// git. Un archivo de ejemplo que estuviera en otra carpeta ni siquiera lo miraría, y
// la prueba pasaría verde sin comprobar nada.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const RAIZ = path.resolve(__dirname, '..');
const OBJETIVO = path.join(RAIZ, 'migrations', '089_checklist_trabajador.sql');
const ORIGINAL = fs.readFileSync(OBJETIVO, 'utf8');

let fallos = 0;
function ok(condicion, texto) {
  if (condicion) console.log('    ok   ' + texto);
  else { console.log('    ***  ' + texto); fallos++; }
}

function correrGuardian() {
  try {
    const salida = execFileSync(process.execPath, [path.join(__dirname, 'comprueba-codigo-sql.js')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { rojo: false, salida };
  } catch (e) {
    return { rojo: true, salida: String(e.stdout || '') };
  }
}

function dejarComoEstaba() {
  fs.writeFileSync(OBJETIVO, ORIGINAL);
}

console.log('');
console.log('  === el guardián de SQL y el "raise exception" ===');

// ---------------------------------------------------------------------
// 1. EL ESTADO SANO TIENE QUE PASAR
// ---------------------------------------------------------------------
let r = correrGuardian();
ok(!r.rojo, 'con el archivo bien, el guardián pasa');

// ---------------------------------------------------------------------
// 2. EL BUG TIENE QUE CAER
// ---------------------------------------------------------------------
//
// Se vuelve a poner la línea que se cayó en la base, tal cual:
// el "||" pegado al texto del "raise".
const CON_EL_BUG = "raise exception 'La etapa tiene que ser ingreso o termino, y es ' || coalesce(p_etapa,'vacia')";
const BUENO = "raise exception 'La etapa tiene que ser ingreso o termino, y es \"%\"', coalesce(p_etapa,'vacia')";

if (ORIGINAL.indexOf(BUENO) < 0) {
  console.log('    ***  el archivo ya no tiene la forma buena, la prueba no sirve');
  process.exit(1);
}

fs.writeFileSync(OBJETIVO, ORIGINAL.split(BUENO).join(CON_EL_BUG));
r = correrGuardian();
ok(r.rojo, 'con el "||" de vuelta, el guardián lo agarra');
ok(/RAISE CON/.test(r.salida), 'y lo dice por su nombre, con el número de línea');
ok(/086|089/.test(r.salida), 'y nombrando el archivo');
dejarComoEstaba();

// ---------------------------------------------------------------------
// 3. Y QUE NO SE DISPARE POR CASOS LEGÍTIMOS
// ---------------------------------------------------------------------
//
// Porque la regla es "dentro de un dollar-quote", no "siempre". Una concatenación
// de verdad, afuera, es SQL correcto y no puede tocarse.
fs.writeFileSync(OBJETIVO, ORIGINAL + "\nselect 'a' || 'b' as prueba_de_concatenacion;\n");
r = correrGuardian();
ok(!r.rojo, 'una concatenación de verdad, afuera del dollar-quote, pasa: es SQL correcto');
dejarComoEstaba();

// Y DENTRO del cuerpo, pero en un "select", que sí es válido
fs.writeFileSync(OBJETIVO,
  ORIGINAL + "\ndo $$\nbegin\n  perform 'a' || 'b';\nend;\n$$;\n");
r = correrGuardian();
ok(!r.rojo, 'y un "||" dentro de un "perform" también pasa: no es un raise');
dejarComoEstaba();

// ---------------------------------------------------------------------
// 4. Y QUE EL ARCHIVO QUEDE EXACTO COMO ESTABA
// ---------------------------------------------------------------------
const final = fs.readFileSync(OBJETIVO, 'utf8');
ok(final === ORIGINAL, 'el archivo de la migración quedó igual que antes de la prueba');

console.log('');
if (fallos) {
  console.log('  *** ' + fallos + ' CASO(S) FALLAN ===');
  process.exit(1);
}
console.log('  ok  el guardián ve el "raise" con "||", y no se dispara por los demás');
console.log('');