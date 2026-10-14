// ===================================================================
// tools/sirve.js
// ===================================================================
// UN SERVIDOR ESTÁTICO QUE SÍ ENTIENDE LAS DIRECCIONES SIN ".HTML"
//
// ---------------------------------------------------------------------
// POR QUÉ EXISTE ESTE ARCHIVO
// ---------------------------------------------------------------------
//
// Porque el servidor que estaba sirviendo en el 5500 no es nuestro: es el de
// Visual Studio Code. Y ese servidor sirve las rutas LITERALES, sin completarlas.
//
// Eso quiere decir que "/pages/app" no encuentra nada, porque en el disco no hay
// un archivo llamado "app": hay un "app.html". Y el navegador contesta
//
//     Cannot GET /pages/app
//
// que es un 404 del servidor, NO un error de la aplicación. Es el tipo de cosa
// que hace perder media hora buscando un error donde no lo hay.
//
// ---------------------------------------------------------------------
// POR QUÉ NO SE SIMPLEMENTE USA LA RAÍZ
// ---------------------------------------------------------------------
//
// Porque la raíz sí funciona: "/pages/index.html" manda a "pages/app.html" si hay
// sesión y a "pages/login.html" si no la hay. Está bien, y alcanza.
//
// Pero la mitad de las veces uno escribe la dirección de la pantalla que quiere
// ver, no la raíz. Y si esa dirección no existe sin ".html", el servidor dice que
// no y parece que se rompió algo.
//
// ---------------------------------------------------------------------
// QUÉ HACE ESTE, EN UNA FRASE
// ---------------------------------------------------------------------
//
// Prueba "/pages/app", y si no existe, prueba "/pages/app.html". Y manda
// "Cache-Control: no-store", para que recargar traiga de verdad el archivo nuevo.
//
// ---------------------------------------------------------------------
// Y EL 5500, QUE ESTÁ OCUPADO
// ---------------------------------------------------------------------
//
// El puerto 5500 lo tiene Visual Studio Code. Este guion NO lo mata: es el mismo
// proceso que tiene abierto tu editor, y cerrarlo te cerraría las pestañas.
//
// Así que prueba el 5500, y si está ocupado pasa al siguiente. Te dice con cuál
// quedó, y esa es la dirección que hay que usar.
//
// ---------------------------------------------------------------------
// CÓMO SE USA
// ---------------------------------------------------------------------
//
//     node tools/sirve.js
//     node tools/sirve.js 5501
//
// Y para cortarlo: Ctrl+C en la consola donde corre.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------
// LOS TIPOS DE ARCHIVO
// ---------------------------------------------------------------------
//
// Porque sin esto el navegador descarga el ".js" en vez de ejecutarlo, y el
// síntoma es un archivo de texto en la pantalla con un error que no dice nada de
// Javascript. Pasa más de lo que parece.
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8'
};
function tipoDe(ruta) {
  return TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
}

// ---------------------------------------------------------------------
// POR QUÉ NO SE USA req.url TAL CUAL PARA ARMAR LA RUTA
// ---------------------------------------------------------------------
//
// Porque "/../../secrets.txt" sale del proyecto y lee un archivo de arriba. Se
// resuelve la ruta y se corta si se sale de la raíz. Un servidor estático que
// sirve la carpeta equivocada es lo más DATA mientras no se lo mire.
function rutaSegura(urlPedida) {
  let pedida;
  try { pedida = decodeURIComponent(urlPedida.split('?')[0].split('#')[0]); }
  catch (error) { return null; }
  const limpia = pedida.replace(/\\/g, '/');
  const completa = path.resolve(RAIZ, '.' + limpia);
  // Y POR QUÉ LA COMPARACIÓN ES CON LA RAÍZ, Y NO CON LA RUTA COMPLETA
  //
  // Porque la primera versión hacía esto:
  //
  //     const conBarra = completa + path.sep;
  //     if (!completa.startsWith(conBarra)) return null;
  //
  // Y eso bloqueaba TODO, hasta "/pages/app". Porque "/pages/app" no empieza con
  // "/pages/app/", y la comparación daba falso: el servidor contestaba 403 a cada
  // archivo del proyecto, y el que lo veía、Web Code, pensaba que el problema era
  // suyo.
  //
  // La comparación correcta es una sola: la ruta tiene que estar ADENTRO de la
  // raíz, con su barra al final. Si la ruta resuelta es la raíz misma, es la
  // carpeta del proyecto, y eso se sirve con su index.
  const raizConBarra = RAIZ.endsWith(path.sep) ? RAIZ : RAIZ + path.sep;
  if (completa === RAIZ) return completa;
  if (!completa.startsWith(raizConBarra)) return null;
  return completa;
}

// ---------------------------------------------------------------------
// EL ARCHIVO QUE HAY QUE SERVIR, Y POR QUÉ HAY TRES INTENTOS
// ---------------------------------------------------------------------
//
// Porque "/pages/app" puede significar tres cosas, y probarlas en orden es lo que
// hace que la dirección funcione:
//
//   1. "/pages/app"                    tal cual, si existe el archivo sin extensión
//   2. "/pages/app.html"               le agregamos ".html"
//   3. "/pages/app/index.html"         es una carpeta
//
// Y si hay carpeta, se sirve su "index.html".
function buscarArchivo(rutaCompleta) {
  const intentos = [];
  if (fs.existsSync(rutaCompleta) && fs.statSync(rutaCompleta).isFile()) intentos.push(rutaCompleta);
  if (rutaCompleta.endsWith(path.sep)) {
    intentos.push(path.join(rutaCompleta, 'index.html'));
  } else {
    intentos.push(rutaCompleta + '.html');
    intentos.push(path.join(rutaCompleta, 'index.html'));
  }
  for (const p of intentos) {
    try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; }
    catch (error) { /* se sigue probando */ }
  }
  return null;
}

const servidor = http.createServer((req, res) => {
  const ruta = rutaSegura(req.url || '/');
  if (!ruta) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ruta fuera del proyecto');
    return;
  }

  const archivo = buscarArchivo(ruta);
  if (!archivo) {
    // Y POR QUÉ SE ESCRIBE QUÉ SE BUSCÓ
    //
    // Porque un 404 pelado no dice nada. Con esta lista, el que lo ve sabe
    // inmediatamente si escribió mal la dirección o si el archivo no existe, que
    // son dos problemas muy distintos.
    const conHtml = ruta + '.html';
    const pista = fs.existsSync(conHtml)
      ? 'El archivo existe como "' + path.basename(conHtml) + '". Fijate si va con .html.'
      : 'Probado: ' + [ruta, ruta + '.html', path.join(ruta, 'index.html')].join('  |  ');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><meta charset="utf-8">'
      + '<body style="font:16px sans-serif;padding:24px;max-width:760px">'
      + '<h2>No está: ' + ruta.replace(/[<>&]/g, '') + '</h2>'
      + '<p>' + pista.replace(/[<>&]/g, '') + '</p>'
      + '</body>');
    console.log('  404  ' + req.url);
    return;
  }

  fs.readFile(archivo, (error, datos) => {
    if (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No se pudo leer el archivo');
      return;
    }
    const relativo = path.relative(RAIZ, archivo).replace(/\\/g, '/');
    // Y EL "no-store", QUE ES EL MOTIVO DE ESTE SERVIDOR TAMBIÉN
    //
    // Porque cada archivo se guarda por separado, y recargar a veces cambia el
    // Javascript y deja el CSS viejo. Con esto no: cada recarga lee de verdad.
    res.writeHead(200, {
      'Content-Type': tipoDe(archivo),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(datos);
    console.log('  200  ' + relativo + (error ? '' : ''));
  });
});

// ---------------------------------------------------------------------
// EL PUERTO
// ---------------------------------------------------------------------
//
// El 5500 primero, porque es el que se usa siempre. Y si está ocupado, el
// siguiente. Con "--" adelante para que un puerto que empieza con guion no se
// confunda con una opción.
const arg = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : 5500;
const desde = Number.isFinite(arg) ? arg : 5500;

function probar(puerto, intentos) {
  servidor.once('error', function (error) {
    if (error && error.code === 'EADDRINUSE') {
      if (intentos <= 0) {
        console.log('');
        console.log('  *** No hay puerto libre entre ' + desde + ' y ' + (desde + 5) + '.');
        console.log('      Cerrá algo que esté usando esos puertos y volvé a correrlo.');
        process.exit(1);
      }
      console.log('  el puerto ' + puerto + ' está ocupado (lo tiene otro programa,');
      console.log('  normalmente Visual Studio Code). Probando el ' + (puerto + 1) + '.');
      probar(puerto + 1, intentos - 1);
      return;
    }
    console.log('');
    console.log('  *** No se pudo abrir el puerto ' + puerto + ': ' + (error && error.message));
    process.exit(1);
  });
  servidor.listen(puerto, '127.0.0.1', function () {
    console.log('');
    console.log('  Sirviendo ' + RAIZ);
    console.log('');
    console.log('    http://127.0.0.1:' + puerto + '/');
    console.log('    http://127.0.0.1:' + puerto + '/pages/app');
    console.log('');
    console.log('  Las dos direcciones funcionan, con y sin ".html".');
    console.log('  Para cortar: Ctrl+C');
    console.log('');
  });
}
probar(desde, 5);
