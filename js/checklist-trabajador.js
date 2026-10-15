// ===================================================================
// js/checklist-trabajador.js
// ===================================================================
// EL CHECKLIST DE INGRESO Y DE TÉRMINO, EN LA FICHA DEL TRABAJADOR
// ===================================================================
//
// ---------------------------------------------------------------------
// LA LISTA DE TAREAS VIVE AQUÍ, NO EN LA BASE
// ---------------------------------------------------------------------
//
// Y POR QUÉ
//
// Porque la base guarda lo que se le manda y no necesita saber qué tareas existen.
// Si la lista estuviera en la base, agregar una quinta tarea sería una migración, y
// el día que una tarea dejara de aplicar habría que borrarla de los registros de
// todos los trabajadores.
//
// Con la lista acá: agregar una tarea es agregar una línea a un arreglo. Y una tarea
// que se saca de la lista sigue guardada en los registros viejos, que es lo que
// tiene que pasar: el archivo de una persona de marzo dice lo que se hizo en marzo.
//
// ---------------------------------------------------------------------
// LAS CLAVES SON CORTO A PROPÓSITO
// ---------------------------------------------------------------------
//
// "remuneraciones", y no "Subir el contrato al sistema de remuneraciones". Porque la
// clave es lo que se guarda en la base y lo que se lee al imprimir, y dentro de seis
// meses un texto largo guardado cien veces es una invitación a que quede distinto en
// algún lado.
//
// El texto que ve la persona sí es largo, y está escrito acá.
//
// ---------------------------------------------------------------------
// Y POR QUÉ SON LAS MISMAS CUATRO EN LAS DOS ETAPAS
// ---------------------------------------------------------------------
//
// Porque son los mismos cuatro sistemas: remuneraciones, control de asistencia,
// movimientos de personal y DT. Lo que cambia es la dirección, subir o bajar, y por
// eso van en dos etapas separadas y no en una lista con un campo de sentido.

const TAREAS_INGRESO = [
  {clave:'remuneraciones', texto:'Contrato subido al sistema de remuneraciones'},
  {clave:'asistencia', texto:'Alta en el control de asistencia'},
  {clave:'movimientos', texto:'Movimientos de personal realizados'},
  {clave:'dt', texto:'Contrato subido a la DT'}
];

const TAREAS_TERMINO = [
  {clave:'remuneraciones', texto:'Contrato dado de baja en remuneraciones'},
  {clave:'asistencia', texto:'Baja en el control de asistencia'},
  {clave:'movimientos', texto:'Movimientos de personal realizados'},
  {clave:'dt', texto:'Contrato dado de baja en la DT'}
];

function tareasDe(etapa){
  return etapa==='termino'?TAREAS_TERMINO:TAREAS_INGRESO;
}

// ---------------------------------------------------------------------
// EL ESTADO QUE ESTÁ CARGADO
// ---------------------------------------------------------------------
//
// Y POR QUÉ HAY UNA COPIA EN MEMORIA
//
// Porque la ficha del trabajador se vuelve a dibujar cada vez que se marca una
// casilla, y sin la copia cada marca sería una consulta a la base. Con la copia,
// marcar es guardar y volver a dibujar de la memoria.
//
// Y POR QUÉ SEPARADO DE LAS LISTAS DE ARRIBA
//
// Porque las listas son las tareas que el programa SÍ conoce, y el estado son las que
// esa persona tiene en la base. Si el estado saliera solo de la lista, una tarea
// cargada de antes y que ya no está en la lista desaparecería del papel, que es
// justo lo contrario de lo que tiene que pasar.
let tareasEstado={};
let tareasEstadoError='';

// ---------------------------------------------------------------------
// CARGAR
// ---------------------------------------------------------------------
//
// Y QUÉ PASA SI LA TABLA NO EXISTE TODAVÍA
//
// Que se diga. No un espacio en blanco y no una lista vacía, porque una lista vacía
// en un checklist significa "no se hizo ninguna tarea", y eso es una afirmación
// grave cuando lo que pasó es que la consulta no se pudo hacer.
async function cargarTareas(code){
  tareasEstadoError='';
  if(!code){tareasEstado={};return;}
  const {data,error}=await window.supabaseClient.from('trabajador_tareas')
    .select('*').eq('code',code);
  if(error){
    // Y EL MENSAJE DICE SI FALTA LA TABLA O FALLA LA CONSULTA
    //
    // Porque son dos problemas distintos y la respuesta es distinta: si la tabla no
    // está, hay que correr la migración 089; si la consulta falla, hay que mirar la
    // red. Decir "no se pudieron leer" para los dos deja a la persona sin saber qué
    // hacer.
    //
    // Y CÓMO SE RECONOCE QUE FALTA LA TABLA
    //
    // Porque Supabase lo dice en varios formatos según de dónde venga el error, y
    // con uno solo la mitad de las veces la persona lee un mensaje técnico en vez de
    // "corré la migración 089", que es lo único que puede hacer:
    //
    //   relation "public.trabajador_tareas" does not exist
    //   Could not find the table 'public.trabajador_tareas' in the schema cache
    //   PGRST205: Could not find the table
    //
    // Y EL NOMBRE DE LA TABLA TIENE QUE ESTAR EN EL MENSAJE
    //
    // Porque "does not exist" a secas también lo dice un índice o una columna que
    // falta, y eso es otro problema con otra solución.
    const mensajeError=String(error.message||error);
    const faltaTabla=/trabajador_tareas/.test(mensajeError)
      && /(does not exist|Could not find the table|schema cache|PGRST205)/i.test(mensajeError);
    tareasEstadoError=faltaTabla
      ? 'Falta correr la migración 089: la tabla trabajador_tareas no está en la base todavía.'
      : 'No se pudieron leer las tareas: '+mensajeError;
    tareasEstado={};
    return;
  }
  tareasEstado={};
  (data||[]).forEach(t=>{
    if(t&&t.etapa&&t.tarea)tareasEstado[t.etapa+'|'+t.tarea]=t;
  });
}

// ---------------------------------------------------------------------
// MARCAR
// ---------------------------------------------------------------------
//
// Y POR QUÉ VA POR UNA FUNCIÓN DE LA BASE Y NO POR UN "UPDATE" DIRECTO
//
// Por dos cosas. La primera es que el nombre de quien marca sale de "profiles" y no
// del navegador: con un "update", el Javascript podría mandar el nombre de otro, y
// un checklist que dice "lo marcó Fulano" cuando lo marcó alguien más es peor que
// uno que no dice el nombre.
//
// La segunda es que la fila puede no existir todavía: la primera vez que alguien
// marca hay que crearla, y un "update" no la crea.
async function marcarTarea(code,etapa,tarea,hecho){
  if(!code)return;
  const {error}=await window.supabaseClient.rpc('marcar_tarea_trabajador',{
    p_code:code,p_etapa:etapa,p_tarea:tarea,p_hecho:hecho,p_nota:null
  });
  if(error){
    tareasEstadoError='No se pudo guardar: '+(error.message||error);
    renderChecklist();
    return;
  }
  // Y SE VUELVE A CARGAR DESDE LA BASE, NO SE INVENTA EL ESTADO
  //
  // Porque si se armara el objeto acá, y la base guardara otra cosa, la pantalla y la
  // base dirían cosas distintas hasta el próximo recargo. Y esa es la clase de bug
  // que más cuesta encontrar después.
  await cargarTareas(code);
  renderChecklist();
}

// ---------------------------------------------------------------------
// DIBUJAR
// ---------------------------------------------------------------------
//
// Y POR QUÉ UNA CAJA CON UN TICK Y NO UN BOTÓN QUE DICE "HECHO"
//
// Porque la caja se parece a lo que va a haber en el papel, y el papel es donde queda
// el registro. Si la pantalla y el papel se ven distintos, la persona que marca en la
// pantalla y después firma el papel no está marcando lo mismo.
//
// Y QUÉ PASA SI NO HAY PERMISO
//
// Las cajas salen apagadas y no se pueden marcar. No se esconden: una tarea que no se
// ve es una tarea que nadie va a hacer.
function renderChecklist(){
  const caja=document.getElementById('checklistCaja');
  if(!caja)return;
  const code=(typeof fichaEnPantalla!=='undefined'&&fichaEnPantalla?fichaEnPantalla:null);
  if(!code){caja.innerHTML='<small>Abre una ficha de trabajador.</small>';return;}

  let html='';
  if(tareasEstadoError){
    html+='<div class="gpsWarn"><b>No se pudieron leer las tareas.</b><br><small>'
      +escHtml(tareasEstadoError)+'</small></div>';
  }

  ['ingreso','termino'].forEach(etapa=>{
    const tareas=tareasDe(etapa);
    const hechas=tareas.filter(t=>{
      const e=tareasEstado[etapa+'|'+t.clave];
      return e&&e.hecho;
    }).length;
    html+='<h4 class="checkTitulo">'+(etapa==='ingreso'?'Ingreso':'Término')
      +'<small>'+hechas+' de '+tareas.length+'</small></h4>';
    if(!tareas.length){html+='<small>No hay tareas cargadas para esta etapa.</small>';return;}
    html+='<div class="checkTareas">';
    tareas.forEach(t=>{
      const e=tareasEstado[etapa+'|'+t.clave];
      const hecho=!!(e&&e.hecho);
      const puede=typeof puedeGuardar==='function'?puedeGuardar('contratacion.editar'):true;
      // Y LA FECHA Y EL NOMBRE, SOLO SI ESTÁ HECHA
      //
      // Porque un tilde sin fecha no se puede auditar, y un tilde con la fecha de
      // "guardado" y no la de "hecho" dice cuándo se miró por última vez, que es otra
      // cosa.
      const detalle=hecho
        ? ((e.hecho_por_nombre||'sin nombre')+' · '+(e.hecho_at?fechaLegible(e.hecho_at,true):'sin fecha'))
        : (puede?'':'sin permiso para marcar');
      html+='<label class="checkTarea'+(hecho?' hecho':'')+(puede?'':' bloqueado')+'">'
        +'<input type="checkbox" data-etapa="'+escHtml(etapa)+'" data-tarea="'+escHtml(t.clave)+'"'
        +' data-permiso="'+(puede?'1':'0')+'"'
        +(hecho?' checked':'')+'>'
        +'<span class="checkCaja" aria-hidden="true"></span>'
        +'<span class="checkTexto">'+escHtml(t.texto)+'</span>'
        +'<span class="checkDetalle">'+escHtml(detalle)+'</span>'
        +'</label>';
    });
    html+='</div>';
  });
  caja.innerHTML=html;

  // Y LOS MANEJADORES, ATADOS DESPUÉS DE DIBUJAR
  //
  // Porque el contenido se reemplaza entero cada vez que se marca una casilla, y los
  // manejadores de las cajas anteriores mueren con el contenido viejo.
  caja.querySelectorAll('input[data-etapa]').forEach(c=>{
    if(c.dataset.permiso==='0'){c.disabled=true;return;}
    c.addEventListener('change',()=>{
      marcarTarea(code,c.dataset.etapa,c.dataset.tarea,c.checked);
    });
  });
}

// ---------------------------------------------------------------------
// LAS PRECAUCIONES, PARA LA FICHA IMPRESA
// ---------------------------------------------------------------------
//
// Y POR QUÉ ESTÁ ACÁ Y NO EN EL ARCHIVO DE IMPRESIÓN
//
// Porque las indicaciones de prevención y las de asistencia social son datos del
// trabajador, y quien las tiene es la ficha. El archivo de impresión solo las
// escribe. Si se copiaran al revés, quedarían en dos lugares, y el día que cambie
// una en la pantalla el papel seguiría con la vieja.
//
// Y QUÉ SE JUNTA
//
// Las cuatro cosas que una persona tiene que saber antes de trabajar, y que viven
// en cuatro columnas distintas: la nota de salud, los medicamentos, las precauciones,
// y las indicaciones que dejó prevención o la asistente social.
function advertenciasDe(w){
  const partes=[];
  const agregar=(etiqueta,valor)=>{
    if(valor&&String(valor).trim())partes.push({etiqueta,valor:String(valor).trim()});
  };
  agregar('Salud',w&&w.salud_notas);
  agregar('Medicamentos',w&&w.medicamentos);
  agregar('Precauciones en obra',w&&w.precauciones);
  agregar('Indicaciones de prevención',w&&w.indicaciones_prevencion);
  agregar('Indicaciones de asistencia social',w&&w.indicaciones_sociales);
  agregar('Contacto de emergencia',w&&((w.emerg_nombre||'')+' '+(w.emerg_telefono||'')
    +(w.emerg_relacion?(' ('+w.emerg_relacion+')'):'')).trim());
  return partes;
}

// Y LA FOTO QUE SE USA
//
// La de seguridad, y si no hay, la casual. Y si no hay ninguna, un recuadro que lo
// diga: un hueco en blanco en una ficha de archivador parece un dato que se perdió,
// y es una foto que nunca se tomó.
function fotoDe(w){
  if(!w)return {url:'',falta:true};
  const url=w.foto_seguridad_url||w.foto_casual_url||'';
  return {url,falta:!url,deSeguridad:!!w.foto_seguridad_url};
}

// ---------------------------------------------------------------------
// EL CHECKLIST PARA EL PAPEL
// ---------------------------------------------------------------------
//
// Y POR QUÉ EL PAPEL LLEVA LA CAJA VACÍA AL LADO
//
// Porque el papel va al archivador físico, y en el archivador físico alguien marca a
// mano. Si el papel imprimiera el estado en pantalla, en la copia que se archivó sin
// terminar de completar no se vería qué faltaba.
//
// Por eso cada tarea sale con la caja: marcada si la base la tiene marcada, y vacía
// si no. Las dos se pueden tachar con tinta después, y eso es a propósito.
function checklistParaElPapel(w){
  let html='';
  ['ingreso','termino'].forEach(etapa=>{
    const tareas=tareasDe(etapa);
    const hechas=tareas.filter(t=>{
      const e=tareasEstado[etapa+'|'+t.clave];
      return e&&e.hecho;
    }).length;
    html+='<h4 style="margin:10px 0 4px;font-size:.85rem">'
      +escHtml(etapa==='ingreso'?'INGRESO':'TÉRMINO')
      +' <small>('+hechas+' de '+tareas.length+')</small></h4>';
    html+='<table style="width:100%;border-collapse:collapse;font-size:.75rem">';
    tareas.forEach(t=>{
      const e=tareasEstado[etapa+'|'+t.clave];
      const hecho=!!(e&&e.hecho);
      const cuando=hecho&&e.hecho_at?(' · '+fechaLegible(e.hecho_at,true)):'';
      html+='<tr><td style="width:22px;text-align:center;border-bottom:1px solid #ccc">'
        +'<span style="display:inline-block;width:11px;height:11px;border:1.2px solid #333">'
        +(hecho?'&#10003;':'')+'</span></td>'
        +'<td style="border-bottom:1px solid #ccc">'+escHtml(t.texto)+'</td>'
        +'<td style="width:130px;border-bottom:1px solid #ccc;font-size:.68rem">'
        +escHtml(hecho?((e.hecho_por_nombre||'')+cuando):'')
        +'</td></tr>';
    });
    html+='</table>';
  });
  return html;
}