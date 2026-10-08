// ===================================================================
// COPIA-AL-EDITOR
// ===================================================================
// PASA AL EDITOR DE PRUEBAS LOS SCRIPTS QUE LE FALTAN
//
// ---------------------------------------------------------------------
// POR QUÉ
// ---------------------------------------------------------------------
//
// Porque "tools/pruebas/app-sin-login.html" tiene su propia lista de scripts, y
// esa lista se escribe a mano. Cuando se agrega un archivo nuevo a la aplicación,
// el editor de pruebas no lo sabe.
//
// Y EL RESULTADO ES PEOR QUE "NO PASÓ NADA"
//
// El editor de pruebas existe para probar algo que no tiene sesión iniciada. Si
// le falta un archivo, la prueba corre sin él y da verde: el código está bien, la
// prueba pasa, y el problema aparece en la pantalla real. Al revés de lo que se
// quiere.
//
// ---------------------------------------------------------------------
// POR QUÉ NO COPIA LA LISTA ENTERA
// ---------------------------------------------------------------------
//
// Porque los dos archivos no tienen por qué tener los mismos scripts. El de
// pruebas puede cargar algo extra, y borrar lo que sobra dejaría de poder probar.
//
// Sólo copia lo que FALTA, y nunca borra. Y si un archivo está en los dos con
// distinta versión, avisa en vez de elegir: eso es el bug de las versiones, y
// decidirlo acá lo escondería.
//
// ---------------------------------------------------------------------
// Y EL OTRO PROBLEMA, QUE ES ESTE MISMO
// ---------------------------------------------------------------------
//
// Las versiones: el editor de pruebas usa "../../js/app.js", y el guardián de
// versiones sólo reconoce "../js/app.js". Por eso quedó en v115 mientras la
// aplicación iba en v117. Eso lo arregla "tools/sube-la-version.js", y este guion
// lo llama al final, para que un archivo agregado con "?v=118" no quede en
// "?v=1".

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const ORIGEN = 'pages/app.html';
const DESTINO = 'tools/pruebas/app-sin-login.html';

function lineaDe(f, patron) {
  const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const i = t.indexOf(patron);
  return i < 0 ? -1 : t.slice(0, i).split(/\r\n|\n|\r/).length;
}

function scripts(rel) {
  const t = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  const out = [];
  const re = /<script[^>]*src="([^"]+)"[^>]*><\/script>/g;
  let m;
  while ((m = re.exec(t))) {
    const linea = t.slice(0, m.index).split(/\r\n|\n|\r/).length;
    out.push({ linea: linea, texto: m[0], nombre: m[1].split('?')[0].split('/').pop() });
  }
  return out;
}

const A = scripts(ORIGEN);
const B = scripts(DESTINO);
console.log('  === los scripts ===');
console.log('    ' + ORIGEN + ': ' + A.length);
console.log('    ' + DESTINO + ': ' + B.length);

const nombresB = B.map(function (s) { return s.nombre; });
const faltan = A.filter(function (s) { return nombresB.indexOf(s.nombre) < 0; });

if (!faltan.length) {
  console.log('    ok  al editor no le falta ningún script');
} else {
  console.log('    *** le faltan ' + faltan.length + ': ' + faltan.map(function (s) { return s.nombre; }).join(', '));
  // Y SE COPIA UNO POR UNO, DESPUÉS DE SU ANCLA
  //
  // El ancla es el script anterior que SÍ está en los dos archivos. Insertar al
  // final en vez de después del ancla rompería el orden: hay archivos que se
  // usan desde otros al cargarse, no después.
  const destino = fs.readFileSync(path.join(RAIZ, DESTINO), 'utf8');
  let lineas = destino.split(/\r\n|\n|\r/);
  let cambios = 0;

  faltan.forEach(function (s) {
    // Y EL ANCLA: EL ÚLTIMO SCRIPT DEL ORIGEN QUE YA ESTÁ EN EL DESTINO Y VIENE ANTES
    //
    // Y SE BUSCA RECORRIENDO LA LISTA EN ORDEN, NO INDEXANDO POR NÚMERO DE LÍNEA
    //
    // La primera versión usaba "A[s.linea - 2]", que supone que el número de
    // renglón es el índice del arreglo. No lo es: los renglones llegan a 3200 y hay
    // 25 scripts. El resultado fue que el ancla salió "app.js" en vez de
    // "nucleo.js", y el archivo quedó pegado en el lugar equivocado. Funcionaba
    // igual —porque son funciones que se usan más tarde—, y por eso pasó
    // inadvertido. El día que el orden importe, va a fallar sin avisar.
    let ancla = null;
    for (let i = A.length - 1; i >= 0; i--) {
      if (A[i].linea < s.linea && nombresB.indexOf(A[i].nombre) >= 0) { ancla = A[i]; break; }
    }
    if (!ancla) {
      console.log('    *** ' + s.nombre + ': no hay ancla comun, no se sabe donde va');
      return;
    }
    const realAncla = lineas.findIndex(function (l) { return l.indexOf(ancla.nombre) >= 0 && l.indexOf('src=') >= 0; });
    if (realAncla < 0) {
      console.log('    *** ' + s.nombre + ': el ancla ' + ancla.nombre + ' no se encuentra en el destino');
      return;
    }
    // Y EL TEXTO CON LA RUTA DEL DESTINO, QUE TIENE UN NIVEL MÁS
    //
    // "../js/nucleo.js" en el archivo de la aplicación es "../../js/nucleo.js" en
    // el editor de pruebas. Pegarlo tal cual daría un archivo inexistente, que es
    // un 404 silencioso: el script no carga y no dice nada.
    const texto = s.texto.replace('src="../', 'src="../../');
    lineas.splice(realAncla + 1, 0, texto);
    cambios++;
    console.log('    **  ' + s.nombre + '  pegado después de ' + ancla.nombre);
  });

  if (cambios) {
    fs.writeFileSync(path.join(RAIZ, DESTINO), lineas.join('\n'), 'utf8');
    console.log('    ok  ' + cambios + ' script(s) agregados');
  }
}

// ---------------------------------------------------------------------
// Y LAS VERSIONES, QUE ES EL OTRO MEDIO DEL MISMO PROBLEMA
// ---------------------------------------------------------------------
console.log('');
console.log('  === las versiones ===');
// Y CON EL NÚMERO MÁS ALTO QUE HAYA EN EL ARCHIVO DE ORIGEN
//
// Que es el número que se acaba de usar. Si el destino tuviera uno más alto —porque
// se lo subió a mano— bajarlo sería perder un trabajo; por eso se avisa y no se
// toca.
const mayor = (function () {
  let n = 1;
  fs.readFileSync(path.join(RAIZ, ORIGEN), 'utf8').split(/[?&]v=/).slice(1).forEach(function (x) {
    const k = parseInt(x, 10);
    if (k > n) n = k;
  });
  return String(n);
})();
const exec = require('child_process').spawnSync(process.execPath,
  [path.join(RAIZ, 'tools', 'sube-la-version.js'), mayor, DESTINO],
  { cwd: RAIZ, encoding: 'utf8' });
console.log((exec.stdout || '').split(/\r\n|\n|\r/).filter(function (l) { return /^\s{4}/.test(l); }).join('\n'));
if (exec.status !== 0) {
  console.log('  *** "sube-la-version" no pudo terminar');
  process.exit(1);
}

// ---------------------------------------------------------------------
// Y LA COMPROBACIÓN: QUE EL DESTINO TENGA LO MISMO QUE EL ORIGEN
// ---------------------------------------------------------------------
console.log('');
const despues = scripts(DESTINO).map(function (s) { return s.nombre; });
const siguenFaltando = A.filter(function (s) { return despues.indexOf(s.nombre) < 0; });
if (siguenFaltando.length) {
  console.log('  *** siguen faltando: ' + siguenFaltando.map(function (s) { return s.nombre; }).join(', '));
  process.exit(1);
}
console.log('  ok  el editor de pruebas tiene los ' + A.length + ' scripts, los mismos que la aplicación');