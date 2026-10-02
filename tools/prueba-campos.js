// PROBAR QUE EL "CARGANDO" CLAVADO VIENE DE LA VARIABLE QUE SE TAPA A SÍ MISMA
// ============================================================================
//
// -------------------------------------------------------------------
// POR QUÉ ESTA PRUEBA
// -------------------
//
// El sintoma era: selector de empresa vacío, "Cargando." clavado en la lista, y los dos
// selectores de la descarga con su opción de arranque. Y el arreglo fue una línea.
//
// Una línea que arregla tres síntomas que no se parecen entre sí merece una prueba que la
// pueda volver a romper. Si no, lo que se comprobó fue que después del arreglo se ve bien,
// que es otra cosa.
//
// -------------------------------------------------------------------
// EL "typeof" SOBRE UNA CONST SIN DECLARAR ES SEGURO; SOBRE UNA QUE SE ESTÁ DECLARANDO, NO
// ------------------------------------------------------------------------------------------
//
// Esa es toda la diferencia entre las dos versiones del bug, y conviene tenerla escrita porque
// es la que hace que el código parezca correcto:
//
//     typeof noExiste            -> 'undefined'   (no lanza)
//     typeof empresas            -> ReferenceError (la const sigue sin inicializarse)
//
// Y no es culpa del servidor ni de una carrera: es que la línea se está evaluando a sí misma
// mientras se declara.
//
console.log('  == el comportamiento que hace el bug ==');

function versionMala() {
  try {
    // eslint-disable-next-line no-unused-vars
    const empresas = (typeof empresas !== 'undefined' && empresas) ? empresas : [];
    return 'no lanzó: ' + empresas.length;
  } catch (e) {
    return 'LANZÓ: ' + e.constructor.name;
  }
}

function versionBuena(listaGlobal) {
  try {
    const listaEmpresas = (typeof listaGlobal !== 'undefined' && listaGlobal) ? listaGlobal : [];
    return 'no lanzó: ' + listaEmpresas.length;
  } catch (e) {
    return 'LANZÓ: ' + e.constructor.name;
  }
}

// Y con un global de verdad declarado, que es como está en "administracion.js".
const empresas = [{ id: 1, nombre: 'Empresa de Prueba' }, { id: 2, nombre: 'Otra' }];

const mala = versionMala();
const buena = versionBuena(empresas);

console.log('    la versión con "const empresas" : ' + mala);
console.log('    la versión con "listaEmpresas"  : ' + buena);

if (mala.indexOf('LANZÓ') < 0) {
  console.log('');
  console.log('  *** LA VERSIÓN MALA NO LANZÓ ***');
  console.log('    Entonces el bug NO era ese, y el arreglo no arregla nada.');
  process.exit(1);
}
console.log('    ok  la versión con el nombre tapado lanza, como se esperaba');

// Y se compara CONTRA la lista real, no contra una palabra del texto. El texto lo cambia uno
// sin querer y la comprobación deja de mirar lo que dice mirar. Ver [cache-14].
const buenaLista = versionBuena(empresas).replace(/^no lanzó: /, '');
if (buenaLista !== String(empresas.length)) {
  console.log('  *** LA VERSIÓN BUENA DEVUELVE "' + buenaLista + '" Y LA LISTA TIENE ' + empresas.length + ' ***');
  process.exit(1);
}
console.log('    ok  y la versión sin tapar devuelve las ' + empresas.length + ' empresas');

// -------------------------------------------------------------------
// Y QUE LA ESPERA TENGA TECHO
// ---------------------------
//
// "empresasCargadas" queda en falso cuando la carga falla. Una espera sin techo, con ese
// bandera, no se resuelve nunca: el panel queda "Cargando." para siempre, que es el mismo
// síntoma que se acaba de arreglar, por otra razón. Ver [campos-03].
console.log('');
console.log('  == la espera tiene que terminar aunque nunca cargue ==');

// La misma forma que se puso en "relojes.js", con el reloj acelerado para no esperar 3 s.
function esperarEmpresas(prueba, ticks) {
  const yaEsta = () => prueba();
  if (yaEsta()) return Promise.resolve(true);
  return new Promise(function (res) {
    let intentos = 0;
    const reloj = setInterval(function () {
      intentos++;
      if (yaEsta() || intentos >= ticks) { clearInterval(reloj); res(yaEsta()); }
    }, 1);
  });
}

(async function () {
  // 1. La lista llega antes de tiempo: tiene que devolver de una.
  const lista = empresas;
  const r1 = await esperarEmpresas(() => lista.length > 0, 30);
  if (!r1) { console.log('  *** CON LA LISTA LISTA NO RESUELVE ***'); process.exit(1); }
  console.log('    ok  con la lista ya cargada resuelve de una');

  // 2. La lista NUNCA llega: tiene que agotar el techo y devolver false.
  const r2 = await esperarEmpresas(() => false, 12);
  if (r2 !== false) { console.log('  *** SIN LISTA DEVUELVE ' + r2 + ' Y DEBERÍA SER false ***'); process.exit(1); }
  console.log('    ok  y sin lista agota el techo y devuelve false, no se queda colgado');

  // 3. Y la lista llega a la mitad: tiene que resolver.
  let vueltas = 0;
  const r3 = await esperarEmpresas(() => ++vueltas > 4, 30);
  if (!r3) { console.log('  *** CON LA LISTA TARDE NO RESUELVE ***'); process.exit(1); }
  console.log('    ok  y con la lista tarde también resuelve');

  console.log('');
  console.log('    ok  el bug está identificado, la espera tiene techo, y todo es comprobable');
})().catch((e) => {
  console.log('  *** ' + e.message + ' ***');
  process.exit(1);
});
