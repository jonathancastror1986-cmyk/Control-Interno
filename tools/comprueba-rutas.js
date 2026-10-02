// QUE TODAS LAS RUTAS DE TODOS LOS ".html" EXISTAN
// ================================================
//
// -------------------------------------------------------------------
// POR QUÉ ESTE GUARDIÁN
// -------------------
//
// Porque en un turno se rompieron CUATRO páginas y se cazaron TRES.
//
// El movimiento de módulos a carpetas cambió las rutas de "js/supabaseConfig.js" a
// "config/supabase.config.js". Los cuatro archivos que lo cargaban son:
//
//     pages/login.html
//     pages/registro.html
//     pages/reset-password.html
//     index.html              <-- la puerta de entrada de TODO
//
// Y el guion que los arreglaba recorria "pages/*.html". O sea, el 80%. Se arreglaron tres y
// el cuarto quedó roto, y el cuarto es el que se abre primero.
//
// Y la forma del fallo es la peor posible: "index.html" no da error visible, no muestra nada,
// y en la consola queda un "TypeError: Cannot read properties of undefined". El usuario abre
// la dirección del proyecto y no pasa nada. No hay un mensaje que diga "falta un archivo".
//
// -------------------------------------------------------------------
// POR QUÉ RECORRE "git ls-files" Y NO LA CARPETA
// -----------------------------------------------
//
// Porque hay copias de trabajo que no van al repositorio: "tools/pruebas/" tiene una copia
// COMPLETA de la aplicación con una sesión de mentira, que se regenera y va por delante o por
// detrás del archivo de verdad.
//
// Si el guardián mirara la carpeta, daría error por una copia que nadie mantiene, y uno se
// acostumbra a ignorarlo. Un guardián que se queja de algo que no importa es un guardián que
// no está mirando. Es el mismo argumento que ya está escrito para los guardianes que revisan
// "pages/" en vez de todo el proyecto. Ver [barra-09].
//
// Y "git ls-files" es exactamente "lo que se publica": lo que GitHub Pages sirve es el
// repositorio. Si un archivo no está en la lista, no se desplegó, y no hay nada que
// comprobar.
//
// -------------------------------------------------------------------
// Y POR QUÉ CUENTA LAS RUTAS, NO LOS ARCHIVOS
// ---------------------------------------------
//
// Porque el defecto no es "falta un archivo", es "esta ruta no lleva a ningún lado". Y una
// página puede tener la ruta bien escrita y apuntar al revés, y seguir rota. Ver [arq-22].
//
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';

// -------------------------------------------------------------------
// 1) LOS ".html" QUE SE PUBLICAN
// -------------------------------------------------------------------
let htmls = [];
try {
  htmls = execFileSync('git', ['ls-files', '*.html'], {
    cwd: RAIZ, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
} catch (e) {
  console.log('');
  console.log('  *** NO SE PUDO CORRER "git ls-files" ***');
  console.log('    No se puede saber qué se publica, así que no se puede comprobar nada.');
  console.log('    Un guardián que no sabe qué mira informa "todo bien" sin haber mirado.');
  process.exit(1);
}

if (!htmls.length) {
  console.log('');
  console.log('  *** NO HAY NINGÚN ".html" EN EL REPOSITORIO ***');
  process.exit(1);
}
htmls.sort();

console.log('    reviso ' + htmls.length + ' páginas que sí se publican:');
console.log('      ' + htmls.join(', '));

// -------------------------------------------------------------------
// 2) LAS RUTAS LOCALES DE CADA UNA
// -------------------------------------------------------------------
// Y SOLO las locales. Una "https://..." o una "//cdn..." no se comprueba contra el disco: no
// son de este proyecto. Y una que empieza con "#" o con "mailto:" tampoco.
//
// Y "../algo.js?v=54" se quita el "?v=54": en disco no existe un archivo llamado "algo.js?v=54",
// y decirlo sería un error falso.
const RUTA = /(?:\bhref|\bsrc)\s*=\s*"(?!https?:|\/\/|data:|mailto:|tel:|javascript:|#)([^"]+)"/g;

const sinVersion = function (u) { return u.split('?')[0].split('#')[0]; };

let malas = 0;
let totalRutas = 0;
const rutasLocales = new Set();

htmls.forEach(function (P) {
  const abs = path.join(RAIZ, P);
  if (!fs.existsSync(abs)) {
    console.log('  *** ' + P + ' ESTÁ EN GIT PERO NO EN EL DISCO ***');
    malas++;
    return;
  }
  const t = fs.readFileSync(abs, 'utf8');
  const carpeta = path.dirname(P);

  // -------------------------------------------------------------------
  // Y LOS COMENTARIOS SE BORRAN ANTES DE BUSCAR
  // -----------------------------------------
  //
  // "pages/plantilla-contrato.html" tiene, dentro de un comentario:
  //
  //     <!-- <img src="[LOGO_EMPRESA]" alt=""> -->
  //
  // Y la primera versión del guardián lo marcó como ruta rota: "[LOGO_EMPRESA] no existe".
  //
  // Un comentario no pide nada al servidor. Marcarlo es un error falso, y un guardián que da
  // errores falsos entrena a ignorar sus errores verdaderos: el que se acostumbra a ver
  // "roto" en un comentario deja de ver "roto" en una etiqueta. Ver [arq-23].
  const sinComentarios = t.replace(/<!--[\s\S]*?-->/g, '');

  const encontradas = [];
  let m;
  RUTA.lastIndex = 0;
  while ((m = RUTA.exec(sinComentarios)) !== null) encontradas.push(m[1]);

  const rotas = [];
  encontradas.forEach(function (u) {
    const rel = sinVersion(u);
    if (!rel) return;
    totalRutas++;
    rutasLocales.add(rel);

    // Y se resuelve RELATIVA al archivo, no a la raíz. "../css/base.css" en "pages/app.html" es
    // "css/base.css"; la misma cadena en la raíz apuntaría fuera del proyecto.
    const destino = path.normalize(path.join(carpeta, rel));
    if (destino.startsWith('..')) {
      rotas.push({ u: u, porque: 'sale del proyecto' });
      return;
    }
    if (!fs.existsSync(path.join(RAIZ, destino))) {
      rotas.push({ u: u, porque: 'no existe' });
    }
  });

  if (rotas.length) {
    malas++;
    console.log('');
    console.log('  *** ' + P + ' TIENE ' + rotas.length + ' RUTA(S) QUE NO LLEVAN A NADA ***');
    rotas.forEach(function (r) {
      console.log('      ' + r.u);
      console.log('        ' + r.porque + ': quedaría "' + r.u + '" desde "' + carpeta + '"');
    });
    console.log('    Y eso NO da error visible: la página carga y no muestra nada.');
  }
});

console.log('');
console.log('  === el resultado ===');
console.log('    ' + htmls.length + ' páginas, ' + totalRutas + ' rutas locales, '
  + rutasLocales.size + ' archivos distintos');

if (malas) {
  console.log('');
  console.log('  *** ' + malas + ' PÁGINA(S) CON RUTAS ROLAS ***');
  console.log('    Ver [arq-22]. Una ruta rota no avisa: la página carga y no pasa nada.');
  process.exit(1);
}

console.log('    ok  y todas las rutas locales existen');
