// ===================================================================
// prueba-ficha-archivador.js
// ===================================================================
// LA FICHA DEL ARCHIVADOR, PROBADA SIN IMPRIMIR
// ===================================================================
//
// ---------------------------------------------------------------------
// POR QUÉ NO SE PRUEBA EN EL NAVEGADOR
// ---------------------------------------------------------------------
//
// Porque "imprimirPapelEnVentana()" abre una ventana y ESPERA a que carguen las
// imágenes antes de imprimir. Con una ventana de mentira, esa espera no termina: la
// prueba se queda colgada y no dice nada.
//
// Y porque una ficha de archivador es papel: lo que importa es qué sale escrito, y
// eso se mira en el texto, no en una captura.
//
// ---------------------------------------------------------------------
// Y POR QUÉ SE USA EL CÓDIGO REAL Y NO UNA COPIA
// ---------------------------------------------------------------------
//
// Porque reescribir el código en la prueba sería probar otra cosa. Si la ficha
// tiene un error de comilla o una etiqueta mal cerrada, esta prueba tiene que
// fallar también. Si la prueba tuviera su propia versión, las dos podrían estar
// bien y el papel que sale, no.
//
// Los dos archivos se cargan enteros, en el mismo ámbito, que es lo que hace el
// navegador: primero el del checklist, que es el que tiene los datos, y después
// el de la ficha, que es el que dibuja.
//
// ---------------------------------------------------------------------
// Y POR QUÉ SE CARGAN COMPLETOS Y NO POR FRAGMENTOS
// ---------------------------------------------------------------------
//
// Porque la primera versión cortaba los archivos con cortes de texto para quedarse
// solo con las funciones que hacen falta, y se rompió: al cortar por un comentario
// el pedazo quedó incompleto y la prueba no arrancó.
//
// Los comentarios son la parte que cambia más, y partir por ahí es partir por lo
// frágil. Un archivo entero, en un ámbito, es lo que el navegador hace y no se
// desarma.

'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

let fallos = 0;
function ok(condicion, texto) {
  if (condicion) console.log('    ok   ' + texto);
  else { console.log('    ***  ' + texto); fallos++; }
}

// ---------------------------------------------------------------------
// LO QUE NECESITAN LOS DOS ARCHIVOS, QUE ES LO QUE LA APLICACIÓN LES PASA
// ---------------------------------------------------------------------
//
// Y POR QUÉ CADA MENTIRA DICE QUÉ ES
//
// Porque una función de mentira sin comentario es una trampa para el que lea esto
// dentro de seis meses: no se sabe si está en false por lo que mide o porque
// está mintiendo.
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fechaLarga(v) {
  const f = String(v || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(f)
    ? f.slice(8, 10) + '-' + f.slice(5, 7) + '-' + f.slice(0, 4) : f;
}
function fechaLegible(v) {
  const f = String(v || '');
  return /^\d{4}-\d{2}-\d{2}/.test(f) ? f.slice(8, 10) + '-' + f.slice(5, 7) : '';
}
const empresas = [{ id: 'e1', nombre: 'Constructora Prueba', centro_costo: 'PU' }];
function obtenerEmpresaActual() { return empresas; }
function puedeGuardar() { return true; }

let impreso = null;
function imprimirPapelEnVentana(html, opciones) { impreso = { html, opciones }; return true; }

// ---------------------------------------------------------------------
// LOS DOS ARCHIVOS, EN ORDEN
// ---------------------------------------------------------------------
const LISTA = fs.readFileSync(path.join(RAIZ, 'js', 'checklist-trabajador.js'), 'utf8');
const FICHA = fs.readFileSync(path.join(RAIZ, 'js', 'ficha-archivador.js'), 'utf8');

console.log('');
console.log('  === la ficha del archivador ===');

// ---------------------------------------------------------------------
// EL TRABAJADOR COMPLETO, PARA QUE NADA SALGA EN BLANCO
// ---------------------------------------------------------------------
const w = {
  code: '0021', name: 'Adasme Verdugo Jaime Patricio', cargo: 'Maestro Gasfiter',
  status: 'activo', rut: '13.199.887-2', fecha_nac: '1990-03-15',
  nacionalidad: 'Chilena', estado_civil: 'Soltero', profesion: 'Maestro de obras',
  comuna: 'Puente Alto', phone: '', email: '', supervisor_code: 'S9',
  contrato_tipo_plazo: 'fijo', contrato_plazo_dias: 90,
  contrato_fecha_inicio: '2026-08-01', contrato_fecha_hasta: '',
  fecha_ingreso: '2026-08-01', empresa_id: 'e1', centro_costo: 'PU',
  grupo_cargo: 'Maestros', afp_nombre: 'AFP Habitat', afp_rut: '12.345.678-9',
  tipo_trabajador: 'Permanente', cargo_planillas: '',
  foto_seguridad_url: 'https://ejemplo.test/foto.jpg',
  precauciones: 'Trabajo en altura. Uso de arnés obligatorio.',
  medicamentos: null, salud_notas: null,
  emerg_nombre: 'Ana Pérez', emerg_telefono: '+56 9 1234 5678', emerg_relacion: 'madre'
};

// Y LAS TAREAS: DOS HECHAS Y DOS NO, QUE ES EL CASO QUE IMPORTA
const TAREA_ESTADO = {
  'ingreso|remuneraciones': { hecho: true, hecho_por_nombre: 'Jonathan Castro', hecho_at: '2026-08-03T10:00:00Z' },
  'ingreso|asistencia': { hecho: true, hecho_por_nombre: 'Jonathan Castro', hecho_at: '2026-08-03T10:05:00Z' }
};

// ---------------------------------------------------------------------
// LA FUNCIÓN QUE CORRE LOS DOS ARCHIVOS CON LO QUE SE LES PASA
// ---------------------------------------------------------------------
//
// Y POR QUÉ EL ESTADO SE SIEMBRA DESPUÉS DE CARGAR Y NO ANTES
//
// Porque "checklist-trabajador.js" ya declara "let tareasEstado" y "let
// tareasEstadoError". Si la prueba los declarara antes con el mismo nombre,
// JavaScript dice "ya está declarado" y no arranca; y si los pasara como
// parámetros, el "let" de adentro los taparía y la prueba usaría los de adentro,
// que están vacíos: el papel saldría sin ninguna tarea marcada y la prueba no sabría
// por qué.
//
// La tercera forma, la que se usa, es cargar el archivo primero y después
// asignarle el estado. Es lo que hace la aplicación cuando alguien marca una casilla.
function correr(estadoTareas, textoError, ficha) {
  impreso = null;
  let alertas = null;
  const previo = global.alert;
  global.alert = function (m) { alertas = m; };
  try {
    const cuerpo = LISTA + '\n'
      + FICHA + '\n'
      + 'return {\n'
      + '  sembrar:function(e,t){tareasEstado=e;tareasEstadoError=t;},\n'
      + '  imprimirFichaTrabajador:function(){return imprimirFichaTrabajador();}\n'
      + '};';
    const api = new Function(
      'escHtml', 'fechaLarga', 'fechaLegible',
      'obtenerEmpresaActual', 'puedeGuardar', 'imprimirPapelEnVentana',
      'fichaEnPantalla', 'workers', 'window', 'document', 'alert',
      cuerpo
    )(
      escHtml, fechaLarga, fechaLegible,
      obtenerEmpresaActual, puedeGuardar, imprimirPapelEnVentana,
      ficha, [], { supabaseClient: {} }, {}, function (m) { alertas = m; }
    );
    api.sembrar(estadoTareas, textoError);
    api.imprimirFichaTrabajador();
  } finally {
    global.alert = previo;
  }
  return { impreso, alertas };
}

// ---------------------------------------------------------------------
// EL CASO PRINCIPAL
// ---------------------------------------------------------------------
let r = correr(TAREA_ESTADO, '', w);
ok(!!r.impreso, 'la función imprime un papel');

if (!r.impreso) {
  console.log('  *** sin papel no hay nada que comprobar');
  process.exit(1);
}
const h = r.impreso.html;
const texto = h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

ok(/FICHA/.test(texto), 'el papel dice que es una ficha');
ok(h.indexOf('0021') >= 0, 'el código del trabajador está');
ok(h.indexOf('Adasme') >= 0, 'el nombre está');
ok(h.indexOf('Constructora Prueba') >= 0, 'la empresa está en el encabezado');
// Y QUE LA EMPRESA SALGA ARRIBA, NO SOLO EN LA SECCION C
//
// Porque "cab.empresa" se escribe en dos lugares del papel y el encabezado es el que
// se lee de reojo. Si el encabezado se rompe y queda la sección C, el papel parece
// completo y en realidad le falta la marca de arriba.
ok(/fichaMarca"><b>Constructora Prueba<\/b>/.test(h),
  'la empresa va arriba, en la marca, no solo en la sección de contratación');
ok(h.indexOf('>PU<') >= 0, 'el centro de costo está en el encabezado');
ok(h.indexOf('13.199.887-2') >= 0, 'el RUT está');

// Y LAS SECCIONES, Y EN ORDEN
const secciones = (h.match(/<b>([A-E])<\/b>/g) || []).map(function (s) { return s.replace(/<\/?b>/g, ''); });
ok(secciones.join('') === 'ABCDE',
  'las cinco secciones están y en orden, y son: ' + secciones.join(''));

// Y EL PLAZO, QUE TIENE QUE IR JUNTO
//
// Porque "tipo" y "cantidad" son dos columnas y una sola persona. Impresas por
// separado sale "fijo" en una celda y "90" en otra, que no es un plazo.
ok(/fijo,?\s*90 d/i.test(texto), 'el plazo sale junto: tipo y cantidad en la misma línea');

// Y LA FOTO, QUE TIENE QUE ESTAR CUANDO HAY Y DECIR QUE FALTA CUANDO NO
//
// Y POR QUÉ SE BUSCA "class=\"fichaFoto\"" Y NO "fichaFoto"
//
// Porque "fichaFoto" está escrito adentro de "fichaFotoVacia". Buscando el
// pedazo, un papel sin foto pasa la comprobación igual: la primera versión de esta
// prueba buscaba el nombre suelto, y por eso no veía el bug de que la foto se perdiera
// y quedara el recuadro en su lugar.
ok(/class="fichaFoto"><img/.test(h), 'con foto cargada, la foto va en el papel');
ok(!/fichaFotoVacia/.test(h), 'con foto cargada no sale el recuadro de "sin foto"');

// Y EL CASO CONTRARIO, QUE ES EL QUE SE CONFUNDE
const sinFoto = Object.assign({}, w, { foto_seguridad_url: '', foto_casual_url: '' });
r = correr(TAREA_ESTADO, '', sinFoto);
ok(/class="fichaFotoVacia"/.test(r.impreso.html) && !/<img/.test(r.impreso.html),
  'sin foto, sale el recuadro que lo dice y no un hueco en blanco');
ok(/Sin foto/.test(r.impreso.html), 'el recuadro dice que no hay foto');

// Y CUANDO HAY UNA FOTO PERO NO LA DE SEGURIDAD
//
// Porque "fotoDe()" usa la de seguridad y, si no hay, la casual. Si ese "si no hay"
// se pierde, la persona sale en el papel sin foto aunque tenga una.
const casual = Object.assign({}, w, { foto_seguridad_url: '', foto_casual_url: 'https://ejemplo.test/casual.jpg' });
r = correr(TAREA_ESTADO, '', casual);
ok(/<img/.test(r.impreso.html) && /Foto casual/.test(r.impreso.html),
  'si no hay foto de seguridad, sale la casual y el papel lo dice');

// ---------------------------------------------------------------------
// EL CHECKLIST, CON LAS MARCADAS Y LAS VACÍAS
// ---------------------------------------------------------------------
ok(/INGRESO/.test(texto), 'sale la etapa de ingreso');
ok(/MINO|TERMINO/.test(texto), 'sale la etapa de término');
ok((h.match(/width:11px/g) || []).length === 8, 'las ocho casillas, cuatro por etapa');
ok((h.split('10003').length - 1) === 2, 'solo dos casillas con tilde, que son las dos hechas');
ok(h.indexOf('Jonathan Castro') >= 0, 'el papel dice QUIÉN marcó, no solo que está hecha');

// Y LO QUE NO TIENE QUE ESTAR
//
// Porque un "undefined" o un "null" en una celda de una ficha archivada es un dato
// roto que alguien va a leer como si fuera algo.
ok(!/>undefined</.test(h), 'no sale "undefined" en ninguna celda');
ok(!/>null</.test(h), 'no sale "null" en ninguna celda');
ok(!/\bNaN\b/.test(h), 'no sale "NaN" en ninguna celda');

// Y EL GUION EN LO QUE NO ESTÁ
ok(h.indexOf('fichaVacio') >= 0, 'lo que no está lleno sale con un guion, no en blanco');

// Y LOS DOS TIPOS DE FILA VACÍA, QUE SE COMPRUEBAN POR SEPARADO
//
// Porque hay dos formas de fila y cada una tiene su html: la corta, con etiqueta y
// valor en la misma línea, y la larga, que pone la etiqueta sola en una fila y el
// valor en la de abajo. Se comprueban las dos porque una puede romperse sin que se
// rompa la otra.
ok(/Correo<\/td><td class="fichaValor"><span class="fichaVacio">/.test(h),
  'el campo corto vacío sale con el guion');

// Y POR QUÉ AQUÍ NO SE COMPRUEBA UN CAMPO LARGO VACÍO
//
// Porque no existe el caso: "advertenciasDe()" ya omite las advertencias que están
// vacías, así que una fila larga nunca llega vacía a "filaLarga()". La primera
// versión de esta prueba pedía una, falló, y la falla no era del código sino de la
// prueba: estaba suponiendo un hueco que el diseño ya tapona antes.
//
// Lo que sí importa es lo contrario: que las advertencias que no hay NO salgan como
// una fila con guion, porque una ficha con cinco renglones tachados parece una ficha
// donde le falta todo a alguien.
ok(h.indexOf('Medicamentos') === -1 && h.indexOf('Salud') === -1,
  'las advertencias que están vacías no salen, en vez de salir con un guion');
ok(/Precauciones en obra<\/td><\/tr><tr><td class="fichaValor" colspan="2">/.test(h),
  'la advertencia que sí está ocupa la fila entera, sin que le corten el texto');

// ---------------------------------------------------------------------
// EL CASO QUE MÁS SE CONFUNDE: NO SE PUDO LEER
// ---------------------------------------------------------------------
//
// Porque una ficha archivada con el checklist en blanco parece "no se hizo nada",
// y esa copia se archiva y dentro de seis meses alguien la usa como prueba.
r = correr({}, 'Falta correr la migración 089.', w);
ok(r.impreso.html.indexOf('NO se pudieron leer') >= 0,
  'si las tareas no se pudieron leer, el papel lo dice en vez de salir en blanco');

// ---------------------------------------------------------------------
// Y SIN FICHA ABIERTA
// ---------------------------------------------------------------------
r = correr({}, '', null);
ok(r.alertas && /ficha abierta/.test(r.alertas),
  'sin ficha abierta avisa en vez de imprimir un papel en blanco');

console.log('');
if (fallos) {
  console.log('  *** ' + fallos + ' CASO(S) FALLAN ===');
  process.exit(1);
}
console.log('  ok  la ficha sale con todo lo que tiene que salir, y sin lo que no');
console.log('');