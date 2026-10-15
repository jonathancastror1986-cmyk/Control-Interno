// ===================================================================
// js/ficha-archivador.js
// ===================================================================
// LA FICHA DEL TRABAJADOR, PARA EL ARCHIVADOR DE PAPEL
// ===================================================================
//
// ---------------------------------------------------------------------
// DÓNDE ENTRA ESTO
// ---------------------------------------------------------------------
//
// Se dibuja con "imprimirPapelEnVentana()", que ya usa Bodega para las entregas.
// No se hace una segunda ruta de impresión: son dos salidas de papel con el mismo
// motor, y hacer una segunda es el comienzo de que un día el botón de un papel
// funcione y el del otro no.
//
// ---------------------------------------------------------------------
// EL ORDEN DE LAS SECCIONES
// ---------------------------------------------------------------------
//
// Es el de la ficha de papel que ya usan, que es el que llega a la carpeta:
//
//     identificación  ·  foto
//     A) datos personales
//     B) datos del contrato
//     C) datos de contratación
//     D) precauciones
//     E) checklist de ingreso
//     F) checklist de término
//
// Y ese orden tiene una razón que conviene no perder: primero lo que identifica a
// la persona, después lo que la ubica en la empresa, y al final lo que hay que
// hacer. Un archivador saca la ficha cuando busca a alguien, y lo primero que
// necesita es encontrarlo.
//
// ---------------------------------------------------------------------
// Y POR QUÉ EL CHECKLIST SALE CON LA CAJA VACÍA AL LADO
// ---------------------------------------------------------------------
//
// Porque el papel va a una carpeta física, y en la carpeta física alguien escribe.
// Si el papel saliera solo con el estado de la base, en la copia que se archivó sin
// terminar de completar no se vería qué faltaba.
//
// Por eso cada tarea sale con su cuadradito: marcado si la base la tiene marcada, y
// vacío si no. Las dos se pueden tachar después con tinta, y eso es a propósito.

'use strict';

// ---------------------------------------------------------------------
// LOS DATOS DE LA EMPRESA, PARA EL ENCABEZADO
// ---------------------------------------------------------------------
//
// Y POR QUÉ SE CALCULA UNA VEZ Y NO EN CADA Renglón
//
// Porque el nombre de la empresa y el centro de costo están arriba, en el título, y
// repetirlos en cada fila que los mentione hace una hoja más larga sin agregar nada.
// Se calcula una vez y se pasa a la plantilla.
function datosDeCabecera(w){
  const empresaActual=(typeof obtenerEmpresaActual==='function')?obtenerEmpresaActual():null;
  const emp=(empresaActual||[]).find(function(e){
    return e&&e.id==(w&&w.empresa_id);
  });
  return {
    empresa:(emp&&(emp.nombre||emp.razon_social))||'Empresa',
    centro:(w&&w.centro_costo)||(emp&&(emp.centro_costo))||'—',
    // Y EL NÚMERO DE LA FICHA
    //
    // Porque el papel archivado tiene que poder numerarse sin depender de una
    // aplicación: si va a un archivador, en tres años tiene que decir qué es. Y si
    // no hay número, un archivador le pone el suyo a mano y ese no tiene que ver con
    // el del sistema.
    numero:(w&&w.code)||'—',
    fecha:new Date().toLocaleDateString('es-CL')
  };
}

// ---------------------------------------------------------------------
// UNA FILA DE DATO
// ---------------------------------------------------------------------
//
// Y POR QUÉ UNA FUNCIÓN Y NO ESCRIBIR LOS CAMPOS A MANO
//
// Porque un campo que se escribe a mano se escribe una vez bien y las otras de
// cualquier manera. Con la función, todos salen con el mismo ancho, con el mismo
// guion de los que no hay, y con el mismo escape.
//
// Y EL GUION EN LOS VACÍOS
//
// Porque un espacio en blanco en una ficha archivada no dice que el dato falta:
// dice que alguien no lo escribió, o que no se ve. El guion lo dice.
function fila(etiqueta, valor){
  const hay=valor!==null&&valor!==undefined&&String(valor).trim()!=='';
  return '<tr>'
    +'<td class="fichaEtiqueta">'+escHtml(etiqueta)+'</td>'
    +'<td class="fichaValor">'+(hay?escHtml(String(valor)):'<span class="fichaVacio">—</span>')+'</td>'
    +'</tr>';
}
function filaLarga(etiqueta, valor){
  const hay=valor!==null&&valor!==undefined&&String(valor).trim()!=='';
  return '<tr><td class="fichaEtiqueta" colspan="2">'+escHtml(etiqueta)+'</td></tr>'
    +'<tr><td class="fichaValor" colspan="2">'
    +(hay?escHtml(String(valor)):'<span class="fichaVacio">—</span>')+'</td></tr>';
}

function tabla(filas){
  return '<table class="fichaTabla">'+filas.join('')+'</table>';
}

function seccion(letra,titulo,contenido){
  return '<h3 class="fichaSeccion"><b>'+letra+'</b> '+escHtml(titulo)+'</h3>'+contenido;
}

// ---------------------------------------------------------------------
// LA FOTO
// ---------------------------------------------------------------------
//
// Y POR QUÉ LA DE SEGURIDAD Y, SI NO HAY, LA CASUAL
//
// Porque las dos existen en la base: "foto_seguridad_url" y "foto_casual_url". La
// de seguridad es la que corresponde a la ficha de archivador, y la casual sirve
// cuando no hay.
//
// Y POR QUÉ SI NO HAY NINGUNA SALE UN RECUADRO QUE LO DICE
//
// Porque un hueco en blanco en una ficha archivada parece un dato que se perdió
// después. Un recuadro que dice "sin foto" dice la verdad: que nunca se tomó.
function bloqueFoto(w){
  const f=typeof fotoDe==='function'?fotoDe(w):{url:'',falta:true};
  if(f.falta){
    return '<div class="fichaFotoVacia">Sin foto</div>';
  }
  return '<div class="fichaFoto"><img src="'+escHtml(f.url)+'" alt="Fotografía del trabajador">'
    +'<small>'+(f.deSeguridad?'Foto de seguridad':'Foto casual')+'</small></div>';
}

// ---------------------------------------------------------------------
// LA FICHA ENTERA
// ---------------------------------------------------------------------
function imprimirFichaTrabajador(){
  const w=(typeof fichaEnPantalla!=='undefined')?fichaEnPantalla:null;
  if(!w){
    alert('No hay ninguna ficha abierta. Abrí la ficha de un trabajador primero.');
    return;
  }
  // Y SI NO SE LEYERON LAS TAREAS, EL PAPEL LO DICE
  //
  // Porque una ficha de archivador con el checklist en blanco parece "no se hizo
  // nada", cuando lo que pasó es que no se pudo consultar. Y esa copia se archiva,
  // y dentro de seis meses alguien la usa como prueba.
  let avisoTareas='';
  if(typeof tareasEstadoError!=='undefined'&&tareasEstadoError){
    avisoTareas='<div class="fichaAviso">Las tareas NO se pudieron leer al imprimir: '
      +escHtml(tareasEstadoError)+' Las casillas de abajo salen vacías porque no se sab&iacute;a cu&aacute;les estaban hechas.</div>';
  }

  const cab=datosDeCabecera(w);
  const advertencias=typeof advertenciasDe==='function'?advertenciasDe(w):[];
  const checklist=typeof checklistParaElPapel==='function'?checklistParaElPapel(w):'';

  // Y LOS DATOS DEL CONTRATO, QUE SON LOS NUEVE QUE SE PIDIERON
  //
  // Y EL PLAZO, QUE SE ESCRIBE ENTERO Y NO COMO NÚMERO
  //
  // Porque "contrato_tipo_plazo" y "contrato_plazo_dias" son dos columnas y una
  // persona. En el papel va junto: "Plazo fijo, 90 días", no "fijo" en una celda y
  // "90" en otra, que es lo que sale si se imprimen por separado.
  const plazo=(w.contrato_tipo_plazo||'')
    +(w.contrato_plazo_dias!=null&&String(w.contrato_plazo_dias).trim()!==''
      ?((w.contrato_tipo_plazo?', ':'')+w.contrato_plazo_dias+' días')
      :((w.contrato_tipo_plazo?'':'Sin elegir')));

  const html='<div class="fichaArchivador">'

    // Y EL ENCABEZADO, CON LA EMPRESA Y EL CENTRO DE COSTO
    +'<div class="fichaEncabezado">'
    +'<div class="fichaMarca"><b>'+escHtml(cab.empresa)+'</b><small>'+escHtml(cab.centro)+'</small></div>'
    +'<div class="fichaTitulo"><b>FICHA DEL TRABAJADOR</b>'
    +'<small>Para el archivo de documentación</small></div>'
    +'<table class="fichaMeta"><tbody>'
    +'<tr><td>Código</td><td>'+escHtml(cab.numero)+'</td></tr>'
    +'<tr><td>Nombre</td><td>'+escHtml(w.name||'')+'</td></tr>'
    +'<tr><td>Emitida</td><td>'+escHtml(cab.fecha)+'</td></tr>'
    +'</tbody></table>'
    +'</div>'

    +'<div class="fichaIdentificacion">'
    +bloqueFoto(w)
    +'<table class="fichaTabla fichaTablaIdent"><tbody>'
    +fila('Código',w.code)
    +fila('Nombre completo',w.name)
    +fila('Cargo',w.cargo)
    +fila('Estado',w.status==='desvinculado'?('Desvinculado'+(w.fecha_desvinculacion?(' el '+w.fecha_desvinculacion):'')):'Activo')
    +'</tbody></table>'
    +'</div>'

    +seccion('A','Datos personales',tabla([
      fila('RUT',w.rut),
      fila('Fecha de nacimiento',w.fecha_nac&&fechaLarga?fechaLarga(w.fecha_nac):w.fecha_nac),
      fila('Nacionalidad',w.nacionalidad),
      fila('Estado civil',w.estado_civil),
      fila('Profession / oficio',w.profesion),
      fila('Comuna',w.comuna),
      fila('Teléfono',w.phone),
      fila('Correo',w.email),
      fila('Supervisor',(function(){
        if(!w.supervisor_code)return '';
        const s=(typeof workers!=='undefined')?workers.find(function(x){return x.code===w.supervisor_code;}):null;
        return s?s.name:w.supervisor_code;
      })())
    ]))

    +seccion('B','Datos del contrato',tabla([
      fila('Inicio del contrato',w.contrato_fecha_inicio&&fechaLarga?fechaLarga(w.contrato_fecha_inicio):w.contrato_fecha_inicio),
      fila('Plazo',plazo),
      fila('Hasta',w.contrato_fecha_hasta&&fechaLarga?fechaLarga(w.contrato_fecha_hasta):w.contrato_fecha_hasta)
    ]))

    +seccion('C','Datos de contratación',tabla([
      fila('Empresa',cab.empresa),
      fila('Centro de costo',cab.centro),
      fila('Fecha de ingreso',w.fecha_ingreso&&fechaLarga?fechaLarga(w.fecha_ingreso):w.fecha_ingreso),
      fila('Grupo del cargo',w.grupo_cargo),
      fila('AFP',[w.afp_nombre,w.afp_rut].filter(Boolean).join(' · ')),
      fila('Tipo de trabajador',w.tipo_trabajador),
      fila('Cargo planillas',w.cargo_planillas)
    ]))

    // Y LAS PRECAUCIONES, QUE SI NO HAY DICEN QUE NO HAY
    +seccion('D','Precauciones y datos de salud',
      avisoTareas
      +(advertencias.length
        ?tabla(advertencias.map(function(a){return filaLarga(a.etiqueta,a.valor);}))
        :'<p class="fichaVacio">Sin advertencias registradas para este trabajador.</p>'))

    +seccion('E','Checklist de ingreso y término', checklist)

    +'<p class="fichaPie">Emitida por el sistema de asistencia. '
    +'Las casillas del checklist se pueden completar a mano después de imprimir.</p>'
    +'</div>';

  imprimirPapelEnVentana(html,{
    plantilla:'Ficha del trabajador',
    trabajador:w.name||w.code
  });
}