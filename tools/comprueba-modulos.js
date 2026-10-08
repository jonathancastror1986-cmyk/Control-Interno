// ===================================================================
// COMPRUEBA-MODULOS
// ===================================================================
// QUE LA LISTA DE "js/modulos.js" Y EL "CHECK" DEL SQL DIGAN LO MISMO
//
// ---------------------------------------------------------------------
// POR QUÉ HACE FALTA
// ---------------------------------------------------------------------
//
// Porque un módulo que está en un lado y no en el otro es un módulo que no hace
// nada, y no se nota:
//
//   - en el SQL y no en el JS: la fila se puede escribir, dice que el módulo está
//     prendido, y la aplicación no lo conoce. El módulo queda "prendido" y
//     apagado al mismo tiempo.
//
//   - en el JS y no en el SQL: el "insert" falla con un error de "check", que sí
//     se ve, pero llega tarde: alguien intentó prender un módulo que la base no
//     acepta, y hay que ir a leer la migración para entender por qué.
//
// El primero es el malo: no da ningún error.
//
// Y ALSO: QUE TODA VISTA CON PERMISO TENGA MÓDULO
//
// Porque una vista sin módulo no la filtra nada. Queda siempre visible, para todo
// el mundo, y parece que el filtro funciona. Es el mismo caso que un permiso que
// se declara y nunca se revisa: existe, y no hace nada.
//
// ---------------------------------------------------------------------
// Y LAS TRES COSAS QUE COMPARA
// ---------------------------------------------------------------------
//   1. La lista de "MODULOS_CONOCIDOS" contra el "check" de la tabla 085.
//   2. El mapa "MODULO_POR_VISTA" contra "VISTAS_POR_PERMISO": toda vista con
//      permiso tiene que tener módulo.
//   3. El mapa contra la lista: ningún módulo asignado puede estar fuera de la
//      lista.

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

function leer(rel) {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}

// ---------------------------------------------------------------------
// 1. LA LISTA DEL JAVASCRIPT
// ---------------------------------------------------------------------
const jsModulos = leer('js/modulos.js');
const iLista = jsModulos.indexOf('const MODULOS_CONOCIDOS');
const jLista = jsModulos.indexOf('];', iLista);
if (iLista < 0 || jLista < 0) {
  console.log('  *** no se encontró MODULOS_CONOCIDOS en js/modulos.js');
  process.exit(1);
}
const listaJs = (jsModulos.slice(iLista, jLista).match(/'([^']+)'/g) || [])
  .map(function (x) { return x.replace(/'/g, ''); });

// ---------------------------------------------------------------------
// 2. EL "CHECK" DEL SQL
// ---------------------------------------------------------------------
const sql = leer('migrations/085_modulos_por_empresa.sql');
const iCheck = sql.indexOf('empresa_modulos_nombre_chk');
if (iCheck < 0) {
  console.log('  *** no se encontró el check empresa_modulos_nombre_chk en la 085');
  process.exit(1);
}
const iParen = sql.indexOf('(', iCheck);
const iCierra = sql.indexOf('));', iParen);
const dentro = sql.slice(iParen, iCierra);
const listaSql = (dentro.match(/'([^']+)'/g) || []).map(function (x) { return x.replace(/'/g, ''); });

console.log('  === la lista de módulos ===');
console.log('    en js/modulos.js: ' + listaJs.length + '  ->  ' + listaJs.join(', '));
console.log('    en el check de la 085: ' + listaSql.length + '  ->  ' + listaSql.join(', '));
console.log('');

let problemas = 0;

// ---------------------------------------------------------------------
// LA COMPARACIÓN
// ---------------------------------------------------------------------
const soloJs = listaJs.filter(function (m) { return listaSql.indexOf(m) < 0; });
const soloSql = listaSql.filter(function (m) { return listaJs.indexOf(m) < 0; });

if (soloJs.length) {
  problemas += soloJs.length;
  console.log('    *** en el Javascript y NO en el check del SQL: ' + soloJs.join(', '));
  console.log('        Esa fila se puede escribir y dice que el módulo está prendido,');
  console.log('        pero la aplicación no lo conoce. Queda prendido y apagado a la vez.');
}
if (soloSql.length) {
  problemas += soloSql.length;
  console.log('    *** en el check del SQL y NO en el Javascript: ' + soloSql.join(', '));
  console.log('        Se puede prender, y no hace nada. Sin ningún error.');
}
if (!soloJs.length && !soloSql.length) {
  console.log('    ok  las dos listas dicen lo mismo');
}
console.log('');

// ---------------------------------------------------------------------
// 3. EL MAPA DE VISTAS
// ---------------------------------------------------------------------
console.log('  === las vistas con permiso, y su módulo ===');
const iMapa = jsModulos.indexOf('const MODULO_POR_VISTA');
const jMapa = jsModulos.indexOf('};', iMapa);
const dentroMapa = jsModulos.slice(iMapa, jMapa);
const mapa = {};
(dentroMapa.match(/'v-[a-z0-9-]+'\s*:\s*'[a-z0-9_]+'/g) || []).forEach(function (x) {
  const m = x.match(/'(v-[a-z0-9-]+)'\s*:\s*'([a-z0-9_]+)'/);
  if (m) mapa[m[1]] = m[2];
});

const sp = leer('views/soporte/soporte.js');
const iVP = sp.indexOf('const VISTAS_POR_PERMISO');
const jVP = sp.indexOf('};', iVP);
const vistas = (sp.slice(iVP, jVP).match(/'v-[a-z0-9-]+'\s*:/g) || [])
  .map(function (x) { return x.match(/'(v-[a-z0-9-]+)'/)[1]; });

const sinModulo = vistas.filter(function (v) { return !mapa[v]; });
console.log('    ' + vistas.length + ' vistas con permiso, ' + Object.keys(mapa).length + ' con módulo');
if (sinModulo.length) {
  problemas += sinModulo.length;
  console.log('    *** SIN MÓDULO, y por lo tanto sin filtro: ' + sinModulo.join(', '));
  console.log('        Se van a ver siempre, para todo el mundo. Parece que el filtro funciona.');
} else {
  console.log('    ok  toda vista con permiso tiene su módulo');
}

// Y NINGÚN MAPEADO APUNTA A UN MÓDULO QUE NO ESTÁ EN LA LISTA
const moduloFantasma = Object.keys(mapa)
  .filter(function (v) { return listaJs.indexOf(mapa[v]) < 0; })
  .map(function (v) { return v + ' -> ' + mapa[v]; });
if (moduloFantasma.length) {
  problemas += moduloFantasma.length;
  console.log('    *** apuntan a un módulo que no está en la lista: ' + moduloFantasma.join(', '));
} else {
  console.log('    ok  ningún módulo asignado está fuera de la lista');
}

console.log('');
if (problemas) {
  console.log('  *** ' + problemas + ' PROBLEMA(S) ===');
  process.exit(1);
}
console.log('  ok  el Javascript y el SQL dicen lo mismo, y toda vista tiene módulo');

// ---------------------------------------------------------------------
// LA COMPROBACIÓN DE ESTA COMPROBACIÓN
// ---------------------------------------------------------------------
// Y POR QUÉ ESTÁ AL FINAL
//
// Porque un guardián que no se sabe a sí mismo no se puede creer. Y los casos que
// importan son los dos que no dan ningún error: un módulo en el Javascript que no
// está en el SQL, y una vista sin módulo que queda visible para todos.
console.log('');
console.log('  === el guardián se comprueba a si mismo ===');

// Y SE USA EL MISMO RECONOCIMIENTO, CORRIENDO EL GUARDIÁN CONGELADO
// NO SE PUEDE: SON FUNCIONES SUELTAS. SE COPIA LA LÓGICA, QUE ES LO QUE SE
// ESTÁ COMPROBANDO.
function comparar(listaA, listaB) {
  return {
    soloA: listaA.filter(function (m) { return listaB.indexOf(m) < 0; }),
    soloB: listaB.filter(function (m) { return listaA.indexOf(m) < 0; }),
  };
}
// Y LAS EXPECTATIVAS DICEN "1, 1" Y NO "1, 0", Y POR QUÉ
//
// Porque comparar "reloj" contra "relojes" da diferencia en LAS DOS
// direcciones: "reloj" no está en la lista del SQL, y "relojes" no está en la del
// Javascript. Se|reportan| las dos. La primera vez que se escribió esto se
// anotó "1, 0" en un caso, y el guardián falló su propia prueba.
//
// Y ESO ESTÁ BIEN: son dos problemas distintos, y el del Javascript es el que no
// da ningún error.
const CASOS = [
  ['ok, las dos iguales', ['relojes', 'marcajes'], ['relojes', 'marcajes'], 0, 0],
  ['*** en el js y no en el sql, el que no da error', ['reloj'], ['relojes'], 1, 1],
  ['*** en el sql y no en el js, el otro que no da error', ['relojes'], ['reloj'], 1, 1],
  ['*** los dos, y en distinto orden', ['a', 'b'], ['b', 'c'], 1, 1],
];
let fallos = 0;
CASOS.forEach(function (c) {
  const r = comparar(c[1], c[2]);
  const bien = r.soloA.length === c[3] && r.soloB.length === c[4];
  if (!bien) fallos++;
  console.log('    ' + (bien ? 'ok  ' : '*** ') + c[0]
    + '   (solo js: ' + r.soloA.length + ', solo sql: ' + r.soloB.length + ')');
});
console.log('');
if (fallos) {
  console.log('    *** el guardián falla ' + fallos + ' de sus ' + CASOS.length + ' casos');
  process.exit(1);
}
console.log('    ok  el guardián ve los ' + CASOS.length + ' casos, incluido el que no da error');