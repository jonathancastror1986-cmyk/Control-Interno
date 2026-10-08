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
// Y LAS SECCIONES DE VISTA, QUE SON OTRO HUECO DEL MISMO TIPO
// ---------------------------------------------------------------------
//
// Los scripts se copiaban. Las "<section class='view'>" no, y son lo mismo: una
// vista nueva que existe en la aplicación y no en el editor de pruebas es una
// vista que no se puede probar, y el editor de pruebas dice que todo anda bien.
//
// Y NO SE COPIAN TODAS, SOLO LAS QUE FALTAN, POR LA MISMA RAZA QUE LOS SCRIPTS
console.log('');
console.log('  === las vistas ===');

function vistas(rel) {
  const t = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  const out = [];
  const re = /<section class="view[^"]*" id="(v-[a-z0-9-]+)">[\s\S]*?<\/section>/gi;
  let m;
  while ((m = re.exec(t))) {
    out.push({ id: m[1], linea: t.slice(0, m.index).split(/\r\n|\n|\r/).length, texto: m[0] });
  }
  return out;
}
const VA = vistas(ORIGEN);
const VB = vistas(DESTINO);
const idsB = VB.map(function (v) { return v.id; });
const vfaltan = VA.filter(function (v) { return idsB.indexOf(v.id) < 0; });
const vsobran = VB.filter(function (v) {
  return !VA.some(function (x) { return x.id === v.id; });
});
console.log('    ' + ORIGEN + ': ' + VA.length + '   ' + DESTINO + ': ' + VB.length);
if (vsobran.length) console.log('    ojo  tiene de mas: ' + vsobran.map(function (v) { return v.id; }).join(', '));

if (!vfaltan.length) {
  console.log('    ok  no le falta ninguna vista');
} else {
  let texto = fs.readFileSync(path.join(RAIZ, DESTINO), 'utf8');
  vfaltan.forEach(function (v) {
    // Y ANTES DE PEGAR, SE SACA LA COPIA ANTERIOR
    //
    // Para que correr el guion dos veces no duplique la vista. Como un "<section>"
    // puede contener otro, el recorte por el "<section ... id='...'>" de ESTA vista
    // y el primer "</section>" que sigue es un recorte aproximado: alcanza para una
    // vista sin secciones adentro, que es el caso de todas las que se copiaron.
    const previo = texto.indexOf('id="' + v.id + '"');
    if (previo >= 0) {
      const desde = texto.lastIndexOf('<section', previo);
      const hasta = texto.indexOf('</section>', previo);
      if (desde >= 0 && hasta > desde) {
        texto = texto.slice(0, desde) + texto.slice(hasta + '</section>'.length);
        console.log('    **  ' + v.id + ': se saca la copia anterior antes de pegar');
      }
    }
    // Y LA ANCLA ES LA VISTA ANTERIOR QUE SÍ ESTÁ EN LOS DOS ARCHIVOS
    let ancla = null;
    for (let i = VA.indexOf(v) - 1; i >= 0; i--) {
      if (idsB.indexOf(VA[i].id) >= 0) { ancla = VA[i]; break; }
    }
    if (!ancla) { console.log('    *** ' + v.id + ': no hay ancla comun'); return; }
    const marca = '<section class="view';
    const p = texto.indexOf(marca, texto.indexOf('id="' + ancla.id + '"'));
    if (p < 0) { console.log('    *** ' + v.id + ': no se encuentra el ancla ' + ancla.id); return; }
    // Y ENTRE EL "<section ...>" Y SU ">", PARA QUEDAR EN EL MISMO LUGAR
    const fin = texto.indexOf('>', p);
    texto = texto.slice(0, fin + 1) + '\n\n' + v.texto + texto.slice(fin + 1);
    console.log('    **  ' + v.id + '  pegada después de ' + ancla.id);
  });
  fs.writeFileSync(path.join(RAIZ, DESTINO), texto, 'utf8');
  // Y SE COMPRUEBA POR EL "id", Y NO VOLVIENDO A CONTAR SECCIONES
  //
  // Porque el recorte por "<section ...> ... </section>" no entiende las vistas
  // anidadas: el "</section>" del primer nivel corta antes de tiempo y una vista
  // que sí está pegada puede parecer que no está. La comprobación tiene que mirar
  // lo único que importa: que el "id" aparezca una vez.
  const final = fs.readFileSync(path.join(RAIZ, DESTINO), 'utf8');
  const siguen = [];
  VA.forEach(function (v) {
    const n = final.split('id="' + v.id + '"').length - 1;
    if (n !== 1) siguen.push(v.id + ' (aparece ' + n + ' veces)');
  });
  if (siguen.length) {
    console.log('    *** problema con: ' + siguen.join(', '));
    process.exit(1);
  }
  console.log('    ok  el editor tiene las ' + VA.length + ' vistas, cada una una vez');
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