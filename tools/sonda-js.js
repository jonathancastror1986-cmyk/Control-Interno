// LA SONDA QUE SÍ SIRVE PARA JAVASCRIPT
// ========================================
//
// -------------------------------------------------------------------
// POR QUÉ "tools/huella.js" NO ALCANZA PARA ESTE CORTE
// ----------------------------------------------------
//
// Se probó rompiendo "function hoyLocal(){return isoLocal(new Date());}" por una fecha fija
// en "js/nucleo.js". Y el guardián dijo "NADA CAMBIÓ".
//
// Y no se equivocó: la huella mide colores y geometría de lo que se ve AHORA, y en la vista
// de portería no se ve ninguna fecha. Con lo cual el guardián no miró ese cambio.
//
// Y está bien que sea así: para partir CSS, el guardián es la herramienta correcta. Acá lo
// que se movió es código, y el código se comprueba por lo que DEVUELVE.
//
// -------------------------------------------------------------------
// QUÉ MIDE ESTA SONDA
// -------------------
//
// Tres cosas, de menos a más:
//
//   1. Lo que devuelven las funciones compartidas. Si "hoyLocal" cambia, sale distinto.
//
//   2. Lo que la página muestra: el encabezado, los botones del menú, el submenú.
//
//   3. El "innerHTML" de las 41 vistas. Y esto es lo fuerte: esas 41 vistas las arman
//      funciones que viven en módulos distintos, y si una de ellas cambió aunque sea un
//      espacio, el texto cambia.
//
// Y el punto 3 es el que hace que esto sirva: no compara dos archivos, compara lo que la
// aplicación CONSTRUYE. Si una función cambió aunque sea un espacio, el texto cambia.
//
// -------------------------------------------------------------------
// Y CÓMO SE COMPARA
// -----------------
//
// La sonda se guarda en "localStorage", se cambia el código, se vuelve a correr, y la
// comparación se hace DENTRO de la página. Que es lo único que hay: no hay un archivo con el
// "antes" al que volver, porque el "antes" es la versión sin partir.
// La sonda se guarda en "localStorage", se cambia el código, se vuelve a correr, y la
// comparación se hace DENTRO de la página. Que es lo único que hay: no hay un archivo con el
// "antes" al que volver, porque el "antes" es la versión sin partir.
(function () {
  var out = [];

  // 1. LO QUE DEVUELVEN LAS FUNCIONES COMPARTIDAS
  out.push('== funciones ==');
  var pruebas = [
    ['hoyLocal()', function () { return hoyLocal(); }],
    ['isoLocal(2026-01-05)', function () { return isoLocal(new Date(2026, 0, 5)); }],
    ['isoLocal(2026-12-31)', function () { return isoLocal(new Date(2026, 11, 31)); }],
    ['normalizarRut("12.345.678-9")', function () { return normalizarRut('12.345.678-9'); }],
    ['normalizarRut("AB CD")', function () { return normalizarCodigo ? normalizarCodigo('AB CD') : '(no hay)'; }],
    ['escHtml("<b>x</b>")', function () { return escHtml('<b>x</b>'); }],
    ['escHtml("a\\"b")', function () { return escHtml('a"b'); }],
  ];
  pruebas.forEach(function (p) {
    var v;
    try { v = String(p[1]()); } catch (e) { v = 'ERROR: ' + e.message; }
    out.push('  ' + p[0] + ' = ' + v);
  });

  // Y el ancho de la tabla de la imagen: mide si el "devicePixelRatio" o algo cambió. No.
  // Lo que sí importa es que las fechas salgan igual.

  out.push('');
  out.push('== el estado ==');
  ['workers', 'attendance', 'tarjetas', 'eppCatalog', 'kits', 'especialidades',
    'extraHolidays', 'marcajes', 'empresas', 'relojes', 'miPerfil', 'modalCtx', 'solicitudes',
    'dayOverrides', 'eppDeliveries', 'eppTallas', 'eppItemRows', 'eppGps'].forEach(function (n) {
    var v;
    try {
      var x = eval(n);
      if (x && typeof x === 'object') v = 'objeto[' + Object.keys(x).length + ']';
      else if (Array.isArray(x)) v = 'lista[' + x.length + ']';
      else v = String(x);
    } catch (e) { v = 'ERROR: ' + e.message; }
    out.push('  ' + n + ' = ' + v);
  });

  out.push('');
  out.push('== lo que se ve ==');
  var h = document.getElementById('tituloSeccion');
  out.push('  #tituloSeccion = "' + (h ? h.textContent.trim() : '') + '"');
  out.push('  data-group del body = ' + (document.body.getAttribute('data-group') || ''));
  out.push('  data-theme = ' + (document.documentElement.getAttribute('data-theme') || ''));
  out.push('  botones de #mainNav = ' + document.querySelectorAll('#mainNav button').length);
  var activos = [];
  document.querySelectorAll('#mainNav button').forEach(function (b) {
    if (b.className.indexOf('active') >= 0) activos.push(b.dataset.group);
  });
  out.push('  elegido = ' + (activos.join(',') || '(ninguno)'));
  out.push('  hijos de #subNav = ' + document.getElementById('subNav').children.length);
  var sub = [];
  document.querySelectorAll('#subNav a, #subNav button').forEach(function (a) {
    sub.push((a.dataset.group ? a.dataset.group + ':' : '') + a.textContent.trim().slice(0, 24));
  });
  out.push('  #subNav = ' + sub.join(' | '));

  out.push('');
  out.push('== las 41 vistas: su HTML, que lo arman funciones de todos los módulos ==');
  var vs = document.querySelectorAll('section[id^="v-"]');
  out.push('  total: ' + vs.length);
  vs.forEach(function (s) {
    var t = s.innerHTML.replace(/\s+/g, ' ');
    out.push('  ' + s.id + ' :: ' + t.length + ' :: ' + t.slice(0, 150));
  });

  var texto = out.join('\n');

  // Y el hash, que es lo que se compara.
  var h2 = 0;
  for (var i = 0; i < texto.length; i++) {
    h2 = ((h2 << 5) - h2 + texto.charCodeAt(i)) | 0;
  }

  try {
    var antes = localStorage.getItem('__sonda');
    if (antes) {
      var partes = antes.split('\n#HASH#\n');
      out.push('');
      out.push('== COMPARACIÓN ==');
      out.push('  hash de antes: ' + partes[1]);
      out.push('  hash de ahora: ' + h2);
      out.push('  ' + (partes[1] === String(h2) ? 'IGUALES' : '*** CAMBIARON ***'));
      if (partes[1] !== String(h2)) {
        var a = partes[0].split('\n');
        var b = texto.split('\n');
        var cambios = 0;
        for (var k = 0; k < Math.max(a.length, b.length); k++) {
          if (a[k] !== b[k]) {
            out.push('    renglón ' + (k + 1) + ':');
            out.push('      antes: ' + String(a[k]).slice(0, 100));
            out.push('      ahora: ' + String(b[k]).slice(0, 100));
            cambios++;
            if (cambios > 8) { out.push('    ... y más'); break; }
          }
        }
        out.push('    renglones distintos: ' + cambios);
      }
    } else {
      out.push('');
      out.push('  (primera vez: queda guardado el hash para comparar después)');
    }
    localStorage.setItem('__sonda', texto + '\n#HASH#\n' + h2);
  } catch (e) {
    out.push('  (no se pudo guardar: ' + e.message + ')');
  }

  // Y se devuelve "out", no "texto".
  //
  // Y esa es la diferencia entre que la comparación se vea y no: "texto" se calculó ANTES de
  // agregar las líneas de comparación, así que devolverlo las deja fuera. La comparación se
  // ejecutaba, y no se leía nunca.
  return out.join('\n');
})()