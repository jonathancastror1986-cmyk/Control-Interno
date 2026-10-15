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
// Y LA LISTA DE EMPRESAS, CON LA FORMA QUE TIENE EN LA APLICACIÓN
//
// Y POR QUÉ NO SE USA "obtenerEmpresaActual()"
//
// Porque esa función no existe en la aplicación: se la inventó la primera versión de
// la ficha, y por eso la prueba pasaba mientras el papel real salía con la palabra
// "Empresa" y sin logo. La lista global real se llama "empresas" y cada elemento
// trae "logo_url", no "logo". MEDIDO en el PDF que salió de la app.
//
// Una prueba que falsea con la forma que el código espera —en vez de la que la app
// tiene— no está probando nada: está probando la invención.
const EMPRESAS_CON_LOGO = [{
  id: 'e1',
  nombre: 'Constructora Prueba',
  centro_costo: 'PU',
  logo_url: 'https://ejemplo.test/logo-empresa.png'
}];
const EMPRESAS_SIN_LOGO = [{
  id: 'e1',
  nombre: 'Constructora Prueba',
  centro_costo: 'PU',
  logo_url: null
}];
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
// ---------------------------------------------------------------------
// EL TRABAJADOR COMPLETO, PARA QUE NADA SALGA EN BLANCO
// ---------------------------------------------------------------------
//
// Y POR QUÉ USA LOS NOMBRES DE LA APLICACIÓN Y NO LOS DE LA FICHA
//
// Porque el nombre real del cargo en memoria es "spec", el del correo es "correo", el
// del código de AFP es "afp_codigo", y el del centro de costo es un ID. La primera
// versión de esta prueba usaba "cargo", "email", "afp_rut" y "centro_costo", que son
// los nombres que la ficha se había inventado.
//
// Con esos nombres, la prueba pasaba y el papel real salía con el cargo vacío y el
// centro de costo con un guion. Una prueba escrita con los nombres equivocados
// comprueba que el equivocado esté bien escrito.
//
// Y EL CENTRO DE COSTO ES UN NÚMERO, COMO EN LA BASE
// Porque en la base no está el nombre, está el ID, y el nombre lo da
// "nombreCentroCosto()". Esa función se falsea más abajo, con un solo centro.
const CENTROS = [{ id: 7, nombre: 'PU' }];
function nombreCentroCosto(id) {
  const c = CENTROS.filter(function (x) { return String(x.id) === String(id); })[0];
  return c ? c.nombre : '';
}
const w = {
  code: '0021', name: 'Adasme Verdugo Jaime Patricio',
  spec: 'Maestro Gasfiter',
  status: 'activo', rut: '13.199.887-2', fecha_nac: '1990-03-15',
  nacionalidad: 'Chilena', estado_civil: 'Soltero', profesion: 'Maestro de obras',
  comuna: 'Puente Alto', phone: '',
  correo: 'adasme@ejemplo.cl',
  supervisor_code: 'S9',
  contrato_tipo_plazo: 'fijo', contrato_plazo_dias: 90,
  contrato_fecha_inicio: '2026-08-01', contrato_fecha_hasta: '',
  fecha_ingreso: '2026-08-01', empresa_id: 'e1',
  centro_costo_id: 7,
  afp_nombre: 'AFP Habitat', afp_codigo: '12.345.678-9',
  tipo_trabajador: 'Permanente',
  foto_seguridad_url: 'https://ejemplo.test/foto.jpg',
  precauciones: 'Trabajo en altura. Uso de arnés obligatorio.',
  medicamentos: null, salud: null,
  emerg_name: 'Ana Pérez', emerg_phone: '+56 9 1234 5678', emerg_rel: 'madre'
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
// Y LA LISTA DE EMPRESAS SE PUEDE CAMBIAR POR CADA CORRIDA
//
// Porque hay que probar el caso de la empresa que no tiene logo, y sin esto no se
// podría: la lista era una constante.
// Y "argumentos", PARA PODER PROBAR LA FICHA DE ALGUIEN QUE SE PASA
//
// Porque "imprimirFichaTrabajador()" ahora recibe el trabajador y las opciones, que es
// lo que usa el botón "Guardar e imprimir ficha" de "Nuevo trabajador": no hay ninguna
// ficha abierta en la pantalla todavía.
function correr(estadoTareas, textoError, ficha, listaEmpresas, argumentos) {
  impreso = null;
  let alertas = null;
  const previo = global.alert;
  global.alert = function (m) { alertas = m; };
  try {
    const cuerpo = LISTA + '\n'
      + FICHA + '\n'
      + 'return {\n'
      + '  sembrar:function(e,t){tareasEstado=e;tareasEstadoError=t;},\n'
      + '  imprimirFichaTrabajador:function(t,o){return imprimirFichaTrabajador(t,o);}\n'
      + '};';
    // Y "empresas" SE PASA COMO PARÁMETRO, CON SU NOMBRE REAL
    //
    // Y con el nombre que tiene en la aplicación. Si el código de la ficha dejara de
    // mirar ese arreglo y pasara a usar otra cosa, la prueba lo vería al no encontrar
    // el nombre de la empresa, que es exactamente lo que pasó en el papel real.
    const api = new Function(
      'escHtml', 'fechaLarga', 'fechaLegible',
      'empresas', 'puedeGuardar', 'imprimirPapelEnVentana', 'nombreCentroCosto',
      'fichaEnPantalla', 'workers', 'window', 'document', 'alert',
      cuerpo
    )(
      escHtml, fechaLarga, fechaLegible,
      listaEmpresas || EMPRESAS_CON_LOGO,
      puedeGuardar, imprimirPapelEnVentana, nombreCentroCosto,
      ficha, [], { supabaseClient: {} }, {}, function (m) { alertas = m; }
    );
    api.sembrar(estadoTareas, textoError);
    api.imprimirFichaTrabajador.apply(null,argumentos||[]);
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

// Y EL CUERPO DEL PAPEL, SIN EL "<style>"
//
// Porque el papel ahora trae su CSS adentro —tiene que traerlo, la ventana de
// impresión no ve los archivos de la aplicación—, y el "<style>" nombra todas las
// clases que se usan en el cuerpo. Buscando sobre el papel entero, "no sale el
// recuadro de sin foto" encuentra el nombre de la clase DENTRO del CSS y falla,
// aunque el cuerpo esté bien.
//
// La primera versión de estas comprobaciones no separaba las dos cosas y por eso
// dio falsos tres veces el día que el papel empezó a traer su estilo.
const cuerpo = h.replace(/<style>[\s\S]*?<\/style>/g, '');

ok(/FICHA DEL TRABAJADOR/.test(texto), 'el papel dice que es una ficha');
ok(h.indexOf('0021') >= 0, 'el código del trabajador está');
ok(h.indexOf('Adasme') >= 0, 'el nombre está');
ok(h.indexOf('Constructora Prueba') >= 0, 'la empresa está en el encabezado');
// Y QUE LA EMPRESA SALGA ARRIBA, NO SOLO EN LA SECCION C
//
// Porque "cab.empresa" se escribe en dos lugares del papel y el encabezado es el que
// se lee de reojo. Si el encabezado se rompe y queda la sección C, el papel parece
// completo y en realidad le falta la marca de arriba.
// Y QUE EL NOMBRE DE LA EMPRESA ESTÉ DENTRO DE LA MARCA
//
// Antes se buscaba el texto pegado al "<div class=\"fichaMarca\">", y funcionaba
// porque la marca era una sola cosa. Ahora la marca lleva el logo antes del nombre
// y el nombre va en un "<div>" propio, así que el texto no está pegado al "<div>".
//
// Lo que se delimita es el bloque entero, desde la marca hasta el título de la hoja,
// que es lo que viene justo después. Así el nombre tiene que estar ahí adentro, y no
// en cualquier parte del papel que también lo tenga, que es la sección de
// contratación.
const bloqueMarca = (cuerpo.match(/<div class="fichaMarca">[\s\S]*?fichaTituloPapel/) || [''])[0];
ok(/Constructora Prueba/.test(bloqueMarca),
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
ok(/class="fichaFoto"><img/.test(cuerpo), 'con foto cargada, la foto va en el papel');
// Y QUE NO SALGA UN RECUADRO DE "SIN FOTO" CUANDO SÍ HAY FOTO
//
// Y POR QUÉ SE BUSCA EL "<div>" Y NO SOLO EL NOMBRE DE LA CLASE
//
// Porque el "onerror" de la foto lleva el nombre de la clase escrito adentro, que
// es justamente lo que tiene que llevar: reemplaza la imagen por el recuadro si la
// foto no se puede bajar. Buscando el nombre suelto, el papel da falso POSITIVO.
//
// Y es una comprobación más fuerte, no más floja: ahora mira que no exista el
// ELEMENTO, que es lo que importa.
ok(!/<div class="fichaFotoVacia">/.test(cuerpo),
  'con foto cargada no sale el recuadro de "sin foto"');

// Y QUE LA FOTO TENGA SU "onerror"
// Porque sin él, una foto que está guardada pero que ya no se puede bajar sale como
// el cuadrito roto del navegador, que en una ficha archivada parece una foto
// dañada, y no parece que hay que ir a buscarla.
ok(/onerror=/.test(cuerpo) && /No se pudo cargar la foto/.test(cuerpo),
  'la foto avisa cuando no se puede cargar, en vez de salir el cuadrito roto');

// Y EL CASO CONTRARIO, QUE ES EL QUE SE CONFUNDE
const sinFoto = Object.assign({}, w, { foto_seguridad_url: '', foto_casual_url: '' });
r = correr(TAREA_ESTADO, '', sinFoto);
const cuerpoSinFoto = r.impreso.html.replace(/<style>[\s\S]*?<\/style>/g, '');
// Y POR QUÉ SE BUSCA QUE NO ESTÉ EL "<div>" DE LA FOTO Y NO QUE NO HAYA NINGÚN "<img>"
//
// Porque el papel tiene más de una imagen: la del trabajador y la del logo de la
// empresa, en el encabezado y en el sello de agua. La primera versión pedía "ninguna
// imagen" y pasaba a dar falso en cuanto se agregó el logo, que es el orden natural
// en que se construyen estas cosas.
//
// Lo que importa es que la foto del trabajador no esté, no que el papel no tenga
// pictures.
ok(/class="fichaFotoVacia"/.test(cuerpoSinFoto) && !/class="fichaFoto">/.test(cuerpoSinFoto),
  'sin foto, sale el recuadro que lo dice y no un hueco en blanco');
ok(/Sin foto/.test(cuerpoSinFoto), 'el recuadro dice que no hay foto');
ok(/logo-empresa/.test(cuerpoSinFoto),
  'y eso no apaga el logo de la empresa, que va por su cuenta');

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
ok(/Ingreso/.test(texto), 'sale la etapa de ingreso');
ok(/T.rmino/.test(texto), 'sale la etapa de término');
// Y CUANTAS CASILLAS, CONTADAS POR SU CLASE Y NO POR UN ANCHO
//
// La primera versión contaba "width:11px". Cuando el papel pasó a traer su CSS
// adentro, ese ancho se escribe una vez en el "<style>" y ya no está en cada casilla,
// y la cuenta daba cero. Contando la clase, cada casilla aparece una vez, que es lo
// que se quiere comprobar.
ok((h.match(/class="fichaCheckCaja"/g) || []).length === 8, 'las ocho casillas, cuatro por etapa');
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
//
// Y EL VACÍO ES EL TELÉFONO, NO EL CORREO
//
// Porque el correo se le cargó para que la ficha tenga que traducir "correo" a
// "email" —que es uno de los nombres que se habían inventado— y entonces dejó de
// servir como ejemplo de campo vacío. El teléfono sí está vacío en el trabajador de
// esta prueba.
ok(/Tel\u00e9fono<\/td><td class="fichaValor"><span class="fichaVacio">/.test(h),
  'el campo corto vacío sale con el guion');

// ---------------------------------------------------------------------
// LOS DATOS QUE ESTABAN GUARDADOS Y NO SALÍAN
// ---------------------------------------------------------------------
//
// Y POR QUÉ ESTAS COMPROBACIONES SON EL MOTIVO DE ESTA PRUEBA
//
// Porque el PDF que salió de la app tenía el cargo en "Sin cargo cargado", el centro
// de costo en "—" y el correo vacío, y los tres estaban guardados. La ficha pedía
// "cargo", "centro_costo" y "email"; en la aplicación se llaman "spec", se llama
// "centro_costo_id" (un número) y "correo".
//
// Un "undefined" en una celda sale como guion, y un guion en una ficha archivada
// parece un dato que el trabajador no tiene.
ok(/Maestro Gasfiter/.test(h), 'el cargo sale, y sale del campo que se llama "spec"');
ok(h.indexOf('Sin cargo cargado') < 0, 'y NO dice que no tenga cargo');
ok(h.indexOf('>PU<') >= 0, 'el centro de costo sale, y sale del id resuelto por nombre');
ok(/adasme@ejemplo\.cl/.test(h), 'el correo sale, y sale del campo que se llama "correo"');
ok(/AFP Habitat · 12\.345\.678-9/.test(h), 'la AFP sale con el nombre y el código juntos');
ok(!/<td class="fichaEtiqueta">Grupo del cargo<\/td>/.test(cuerpo),
  'no sale una fila de grupo del cargo, porque ese dato no se guarda en ninguna parte');
ok(/Cargo para las planillas<\/td>/.test(cuerpo),
  'y en su lugar sale el cargo, que es el dato que sí existe');

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
// EL TRABAJADOR DESVINCULADO
// ---------------------------------------------------------------------
//
// Y POR QUÉ SE COMPRUEBA LA FECHA Y NO SOLO LA INSIGNIA
//
// Porque la insignia puede decir "Desvinculado" con cualquier fecha y quedar bien. Lo
// que se salió fue la fecha: salía como "2026-09-30" mientras dos renglones más abajo
// la de ingreso salía como "1 de Agosto de 2026". Dos formas de escribir una fecha en
// la misma hoja, y solo se vea mirando el papel.
r = correr(TAREA_ESTADO, '', Object.assign({}, w, {
  status: 'desvinculado', fecha_desvinculacion: '2026-09-30'
}));
ok(/fichaInsenia-desvinculado/.test(r.impreso.html),
  'un trabajador desvinculado sale con la insignia roja, no con la verde');

// Y LA FECHA, COMPARADA CONTRA LA PROPIA FUNCIÓN DE FECHA
//
// Y POR QUÉ NO SE ESCRIBE LA FECHA ESPERADA A MANO
//
// Porque esta prueba usa una versión corta de "fechaLarga" —la de la aplicación
// escribe "30 de Septiembre de 2026" y esta escribe "30-09-2026"— y si el papel
// depende de la función, lo que hay que comprobar es que la usó, no cómo escribe.
//
// Escribir la fecha esperada a mano obliged a cambiar el texto de la prueba cada vez
// que se toca el formato, y un día alguien lo cambia sin querer y la prueba sigue
// dando verde.
const esperada = fechaLarga('2026-09-30');
ok(r.impreso.html.indexOf('Desvinculado el ' + esperada) >= 0,
  'y la fecha de desvinculación pasa por "fechaLarga", sale como "' + esperada
  + '" y no cruda');
ok(r.impreso.html.indexOf('Desvinculado el 2026-09-30') < 0,
  'y NO sale cruda, que es como salía antes');

// ---------------------------------------------------------------------
// EL LOGO DE LA EMPRESA: ENCABEZADO Y SELLO DE AGUA
// ---------------------------------------------------------------------

// Y POR QUÉ SE COMPRUEBA QUE SALGAN DOS VECES
//
// Porque son dos usos distintos y son dos elementos distintos: el del encabezado se
// ve, y el del pie es un sello tendido detrás del texto. Si se escribiera una vez y
// se usara las dos, el sello se vería en el encabezado o el logo del encabezado
// saldría desvanecido.
//
// Y EL SELLO VA DETRÁS DEL TEXTO
//
// Porque por eso es un sello: tiene que estar sin estorbar. Si el texto del pie queda
// detrás de la imagen, ya no se sabe de qué sistema salió la hoja, y eso es lo único
// que el pie dice.
ok((cuerpo.match(/logo-empresa\.png/g) || []).length === 2,
  'el logo de la empresa sale dos veces: en el encabezado y en el sello de agua');
ok(/class="fichaMarcaLogo"/.test(cuerpo), 'el del encabezado es el logo, a la vista');
ok(/class="fichaSello"/.test(cuerpo), 'el del pie es el sello de agua');
ok(cuerpo.indexOf('fichaSello') < cuerpo.indexOf('fichaPieTxt'),
  'el sello se escribe antes que el texto del pie, para que quede detrás');
// Y EL ORDEN DE LAS DOS CAPAS, COMPROBADO POR SEPARADO
//
// Porque "está el z-index:0 en algún lado" no alcanza: si la regla del sello tuviera
// los dos, un "z-index:0" más abajo y un "z-index:9" más arriba, el texto seguiría
// apareciendo y la comprobación pasaría. Lo que importa es que el sello tenga UN
// z-index, y que sea cero.
const reglaSello = (h.match(/\.fichaSello\{([^}]*)\}/) || ['', ''])[1];
const capasSello = reglaSello.match(/z-index\s*:\s*(\S+?);/g) || [];
ok(capasSello.length === 1 && /z-index\s*:\s*0;/.test(capasSello[0]),
  'el sello tiene una sola capa, y es la de abajo: '
  + (capasSello.length ? capasSello.join(' y ') : 'no tiene ninguna'));
ok(/\.fichaPieTxt\{[^}]*z-index\s*:\s*1/.test(h),
  'y el texto del pie tiene su capa por encima, que es al revés de lo que se ve');
// Y LA OPACIDAD DEL SELLO, COMO RANGO Y NO COMO NÚMERO EXACTO
//
// Porque lo que importa no es "un nueve por ciento": es que se vea y que no tape el
// texto. Con el número pegado, subir un punto la opacidad —que es justo lo que se
// hizo después de mirarlo en la pantalla— daba falso, y el resultado era dejar de
// comprobar la única propiedad del sello que lo hace útil.
const opacidad = parseFloat((reglaSello.match(/opacity\s*:\s*([\d.]+)/) || [])[1]);
ok(opacidad > 0 && opacidad <= 0.25,
  'el sello se ve pero no tapa el texto del pie, y la opacidad es '
  + opacidad + ', entre 0 y 0.25');

// Y CUANDO LA EMPRESA NO TIENE LOGO
//
// Porque si no hay logo no puede haber sello, y el pie tiene que quedar igual. Un pie
// que aparece y desaparece según la empresa obliga a releerlo.
r = correr(TAREA_ESTADO, '', w, [{ id: 'e1', nombre: 'Constructora Prueba', centro_costo: 'PU' }]);
ok(!/logo-empresa/.test(r.impreso.html), 'sin logo, no sale ni el logo del encabezado ni el sello');
ok(/fichaPieTxt/.test(r.impreso.html),
  'sin logo, el pie sigue saliendo: no se pierde el texto que dice de qué sistema salió');

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

// ---------------------------------------------------------------------
// Y LA FICHA DE ALGUIÉN QUE SE PASA, SIN TENER NINGUNA ABIERTA
// ---------------------------------------------------------------------
//
// Porque es lo que hace el botón "Guardar e imprimir ficha para archivador": en el
// momento de imprimir, el trabajador recién creado no está en ninguna pantalla. Si esta
// parte no anduviera, ese botón imprimiría el papel de la persona que estuviera
// abierta de antes, que es el peor error posible en un archivador: un papel con el
// nombre equivocado.
const RECIEN_CREADO = {
  code: '0099', name: 'Nueva Apellido, testing',
  empresa_id: 'e1', fecha_ingreso: '2026-10-01',
  status: 'activo', foto_seguridad_url: '', foto_casual_url: ''
};
const VENTANA = { etiqueta: 'la del botón' };
r = correr({}, '', null, null, [RECIEN_CREADO, { ventana: VENTANA }]);

ok(!!r.impreso, 'un trabajador que se pasa imprime su ficha aunque no haya ninguna abierta');
ok(r.impreso && r.impreso.opciones && r.impreso.opciones.ventana === VENTANA,
  'y el papel va a la ventana que le pasó el botón, la que se abrió en el clic');
ok(!!r.impreso && /0099/.test(r.impreso.html) && /Nueva Apellido/.test(r.impreso.html),
  'y el papel es el de esa persona: código y nombre');

// Y EL CHECKLIST Y LA FOTO DE UN TRABAJADOR QUE NO TIENE NADA AÚ
//
// Porque un alta recién hecha no tiene filas en "trabajador_tareas" ni fotos subidas.
// Las ocho casillas tienen que salir igual, porque en el archivador se marcan a mano;
// y donde no hay foto tiene que salir el recuadro que lo dice.
const cuerpoNuevo = (r.impreso ? r.impreso.html : '').replace(/<style>[\s\S]*?<\/style>/g, '');
ok((cuerpoNuevo.match(/class="fichaCheckCaja"/g) || []).length === 8,
  'el recién creado igual sale con las ocho casillas del checklist');
ok(/<div class="fichaFotoVacia">Sin foto<\/div>/.test(cuerpoNuevo),
  'y sin foto sale el recuadro que lo dice, no un hueco');
ok(/0 de 4 hechas/.test(cuerpoNuevo),
  'y el checklist dice que está en cero, que es lo cierto');

console.log('');
if (fallos) {
  console.log('  *** ' + fallos + ' CASO(S) FALLAN ===');
  process.exit(1);
}
console.log('  ok  la ficha sale con todo lo que tiene que salir, y sin lo que no');
console.log('');