/* ===================================================================
   js/bodega.js - LA BODEGA
   ===================================================================

   -------------------------------------------------------------------
   DÓNDE ESTÁ ESTE ARCHIVO EN EL ORDEN, Y POR QUÉ
   -------------------------------------------------------------------
   Después de "js/nucleo.js" y antes de "js/app.js".

   Por el núcleo: ahí están las variables de estado que usa todo el mundo, y son
   "const" y "let", que no se levantan. Si este archivo cargara antes que el núcleo, la
   primera variable que tocara se caería.

   Y las funciones no imponen orden: son globales. Una función de este archivo la puede
   llamar uno de al lado, y al revés.

   -------------------------------------------------------------------
   LO QUE HAY AQUÍ
   -------------------------------------------------------------------
   - LA ESPECIALIDAD DEL TRABAJADOR

   -------------------------------------------------------------------
   QUE NO ESTÁN CONTIGUOS, Y POR QUÉ NO ROMPIÓ NADA
   -------------------------------------------------------------------
   Los trozos están separados por otras secciones del archivo viejo. Y juntarlos
   cambia el orden en que se declaran las cosas de nivel superior.

   Da igual por dos razones juntas: al concatenar se conserva el orden ORIGINAL de
   los trozos, y en el archivo viejo no hay ninguna declaración de nivel superior que
   use algo declarado más abajo. Si la hubiera, la aplicación no cargaría.

   -------------------------------------------------------------------
   CÓMO SE COMPROBÓ
   -------------------------------------------------------------------
   Con "tools/sonda-js.js", no con la huella. La huella mide colores y geometría de
   lo que se ve ahora, y un cambio de JavaScript no se ve: se probó, y con una fecha
   fija en una función compartida la huella dijo "NADA CAMBIÓ".

   La sonda compara lo que devuelven las funciones, lo que muestra la página, y el
   "innerHTML" de las 41 vistas.

   Y antes de escribir nada, se siguió el GRAFO desde las llamadas de nivel superior de
   este módulo, y se comprobó que no se sale de este archivo ni del núcleo.

   Ver la entrada [modulos-01]. */

// ===================================================================

let plantillasContratacion=[];
let entregasContratacion=[];
let configTimbre=null;
let reglaTimbre=null;
let contratacionError='';
let PAPEL_ANCHO=794;   // A4 a 96 dpi

// ------------------------------------------------------------------
// CARGA
// ------------------------------------------------------------------
async function cargarContratacion(){
  contratacionError='';
  const [pr,tr,tm]=await Promise.all([
    window.supabaseClient.from('plantillas_contratacion').select('*').order('orden').order('nombre'),
    window.supabaseClient.from('entregas_contratacion').select('*'),
    // Se busca por la empresa del timbre, que con "todas" es la única que
    // haya. Con varias y ninguna elegida no hay una sola, y el timbre tampoco:
    // se deja sin cargar y la vista lo explica en vez de imprimir un sello
    // con el nombre en blanco.
    empresaDelPapel()
      ?window.supabaseClient.from('configuracion_timbre').select('*').eq('empresa_id',empresaDelPapel().id).maybeSingle()
      :Promise.resolve({data:null,error:null})
  ]);
  // Las tres se leen juntas porque sin una de las otras la pantalla miente:
  // si las plantillas cargan y las entregas no, el checklist muestra todo
  // pendiente y alguien vuelve a firmar un papel que ya estaba firmado.
  if(pr.error){contratacionError=faltaLaMigracion(pr.error,['plantillas_contratacion'])
    ?'La migración 031_kit_contratacion.sql no está aplicada en la base de datos.'
    :'No se pudieron cargar las plantillas: '+pr.error.message;}
  if(tr.error&&!contratacionError){contratacionError=faltaLaMigracion(tr.error,['entregas_contratacion'])
    ?'La migración 031_kit_contratacion.sql no está aplicada en la base de datos.'
    :'No se pudieron cargar las entregas: '+tr.error.message;}
  plantillasContratacion=pr.data||[];
  entregasContratacion=tr.data||[];
  configTimbre=(tm.data||null);
  // reglaTimbre y configTimbre eran la MISMA cosa con dos nombres, y
  // htmlTimbre() leía la que nunca se asignaba: el timbre no salía en
  // ningún papel. Ahora hay una sola variable y las dos referencias
  // apuntan a ella.
  reglaTimbre=configTimbre;
  renderContratacion();
}
function entregasDe(code){
  return entregasContratacion.filter(e=>e.trabajador_code===code&&e.estado!=='anulada');
}
function plantillaPorId(id){
  return plantillasContratacion.find(p=>p.id===id)||null;
}
async function cargarKitDelTrabajador(code){
  // La lista la arma la base, no la pantalla: con 46 personas y cuatro
  // papeles la diferencia es chica, pero el día que haya un compendio son
  // 200, y una lista mal armada es un papel que no se entrega.
  const {data,error}=await window.supabaseClient.rpc('kit_de_un_trabajador',{p_code:code});
  if(error){
    renderKitVacio(faltaLaMigracion(error,['kit_de_un_trabajador'])
      ?'La migración 031_kit_contratacion.sql no está aplicada.'
      :error.message);
    return;
  }
  renderKit(data||[],code);
}
function renderKitVacio(motivo){
  document.getElementById('kitLista').innerHTML=
    '<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px">'+
    '<b>No se pudo armar el kit.</b> <small>'+escHtml(motivo||'')+'</small></div>';
}
async function renderKit(filas,code){
  const lista=document.getElementById('kitLista');
  if(!filas.length){
    lista.innerHTML='<small>No hay plantillas vigentes. Crealas en "Editar plantillas".</small>';
    return;
  }
  const w=workers.find(x=>x.code===code);
  const nombre=(w?w.name:code);
  const hechas=filas.filter(f=>f.estado==='completa').length;
  lista.innerHTML=
    '<div style="background:var(--surface);border:1px solid var(--line);padding:10px 12px;border-radius:8px;margin-bottom:12px">'+
    '<b>'+hechas+' de '+filas.length+'</b> papel(es) completos para <b>'+escHtml(nombre)+'</b>'+
    (w&&!w.especialidad_clave
      ?'<br><small style="color:var(--warn-ink)">Este trabajador no tiene especialidad asignada, así que le tocan solo los papeles generales. '+
        'Asignásela en su ficha para que le aparezcan las charlas de su oficio.</small>'
      :'')+
    '</div>'+
    filas.map(f=>{
      const completa=f.estado==='completa';
      const aMedias=f.estado==='incompleto';
      const estado=completa
        ?'<span class="pill" style="color:var(--accent);border-color:var(--accent)">Completo</span>'
        :aMedias
        ?'<span class="pill" style="color:var(--warn);border-color:var(--warn)">Falta firma</span>'
        :'<span class="pill">Sin firmar</span>';
      const esp=f.especialidad_clave
        ?(especialidadNombre(f.especialidad_clave))
        :'General';
      const cuando=completa&&f.firmado_trabajador_at
        ?new Date(f.firmado_trabajador_at).toLocaleDateString('es-CL'):'';
      return '<div class="list-item" style="cursor:default;display:block">'+
        '<div>'+
        '<b>'+escHtml(f.plantilla_nombre)+'</b> <small>('+escHtml(esp)+' · v'+escHtml(String(f.version))+' · '+
        escHtml(etiquetaTipo(f.tipo))+')</small> '+estado+
        (cuando?'<br><small>Firmado el '+escHtml(cuando)+'</small>':'')+
        '</div>'+
        '<span style="display:flex;gap:6px;flex:0 0 auto">'+
        '<button class="btn" type="button" style="padding:4px 8px;font-size:.8rem" onclick="abrirPapel(\''+
        escHtml(f.plantilla_code)+'\',\''+escHtml(code)+'\')">Abrir y firmar</button>'+
        (completa?'<button class="btn" type="button" style="padding:4px 8px;font-size:.8rem" onclick="descargarEntrega(\''+
          escHtml(f.entrega_id)+'\')">PDF</button>':'')+
        '</span></div>';
    }).join('');
}
function etiquetaTipo(tipo){
  return ({charla:'charla',formulario:'formulario',acta:'acta'})[tipo]||tipo;
}
// El nombre legible de una especialidad.
//
// Se usan las que ya carga el EPP (migracion 011). Eran dos listas leyendo
// la MISMA tabla --"especialidades" y "especialidadesContratacion"-- y la
// segunda se quedaba vieja en cuanto alguien creaba una especialidad en
// la pantalla de EPP: el selector del kit mostraba una lista y el otro
// otra. Dos copias de lo mismo siempre terminan en dos verdades.
function especialidadNombre(clave){
  if(!clave)return '';
  const lista=(typeof especialidades!=='undefined'&&especialidades)?especialidades:[];
  const e=(typeof especialidadPorClave==='function')
    ?especialidadPorClave(clave)
    :lista.find(x=>String(x.clave)===String(clave));
  return e?e.nombre:clave;
}
// Se mantiene el nombre de la funcion porque la usan las cadenas del
// editor de plantillas, pero ya no carga nada: espera a que la del EPP haya
// llenado "especialidades".
async function cargarEspecialidadesContratacion(){
  if(typeof loadEspecialidades==='function'&&!especialidades.length){
    await loadEspecialidades(true);
  }
}

// ------------------------------------------------------------------
// EL PAPEL: EL DOCUMENTO COMO SE VA A IMPRIMIR
// ------------------------------------------------------------------
// Los {{campos}} se reemplazan con los datos de la persona. Se hace con
// reemplazo de texto y no con innerHTML sobre datos, para que un nombre con
// < no rompa el documento: el nombre viene de la ficha, y las fichas se
// importan de Excel.
function reemplazarCampos(plantilla,w,extra){
  const empresa=empresaDelPapel()||{};
  const esp=especialidadNombre(w.especialidad_clave||'');
  const datos={
    nombre:w.name||'',
    codigo:codigoMostrar(w.code),
    rut:(w.rut||'').toUpperCase(),
    especialidad:esp||(w.spec||'')||'',
    cargo:w.spec||'',
    empresa:empresa.nombre||'',
    empresa_rut:(empresa.rut||'').toUpperCase(),
    centro:centroDeRelojDe(w)||'',
    fecha:new Date().toLocaleDateString('es-CL'),
    ...(extra||{})
  };
  return (plantilla||'').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,(m,clave)=>
    datos[clave]!==undefined?String(datos[clave]):m);
}
function centroDeRelojDe(w){
  if(!relojes.length)return '';
  // El centro de costo del reloj donde la persona marcan. Es una aproximación
  // —puede marcar en más de uno— pero es la que sirve para el papel, y se
  // escribe como "según el reloj" en la etiqueta.
  const codigos=workers.filter(x=>x.supervisor_code===w.code).map(x=>x.code);
  const candidatos=relojes.filter(r=>r.activo);
  return candidatos.length===1?centroDe(candidatos[0]):'';
}
// El timbre, en HTML. Sale de la empresa; el cargo y el nombre de quien
// suscribe salen de la configuración.
// La empresa del timbre y del papel.
//
// "empresaActual" es un NÚMERO (0 = todas), no un objeto. El timbre pertenece
// a UNA empresa, así que cuando la persona está viendo todas no hay con qué
// armar el sello: se avisa en vez de imprimir un timbre en blanco, que es lo
// que pasaba antes.
function empresaDelPapel(){
  const lista=(typeof empresas!=='undefined'&&empresas)?empresas:[];
  if(empresaActual){
    return lista.find(e=>e.id===empresaActual)
      ||(typeof empresaActual==='object'?empresaActual:null)
      ||null;
  }
  // Sin empresa elegida, el timbre no tiene a cuál pertenecer... salvo que
  // haya una sola. Y es el caso más común: una obra con un solo contrato.
  //
  // Antes devolvía null siempre en ese caso, y el papel salía con un
  // recuadro de timbre vacío. En un documento firmado, un timbre sin nombre
  // parece un error de la empresa, y no lo es.
  if(lista.length===1)return lista[0];
  return null;
}
function avisoSinEmpresaUnica(){
  return 'Estás viendo todas las empresas. El timbre pertenece a una sola: elegí una empresa arriba '
    +'para que el papel salga con el nombre y el RUT correctos. Con una sola empresa no hace falta.';
}
function htmlTimbre(){
  if(!reglaTimbre||!reglaTimbre.activo)return '';
  const empresa=empresaDelPapel()||{};
  const pos={
    inferior_derecha:'right:34px;bottom:26px;text-align:right',
    inferior_izquierda:'left:34px;bottom:26px;text-align:left',
    superior_derecha:'right:34px;top:26px;text-align:right',
    superior_izquierda:'left:34px;top:26px;text-align:left'
  }[reglaTimbre.posicion]||'right:34px;bottom:26px;text-align:right';
  const esc=escHtml;
  return '<div class="timbre" style="'+pos+';transform:rotate('+Number(reglaTimbre.giro_grados)+'deg);font-size:'+
    (Number(reglaTimbre.tamano)/100).toFixed(2)+'em">'
    +'<div class="timbre-borde">'
    +'<b>'+esc(empresa.nombre||'')+'</b>'
    +'<div class="timbre-linea">'
    +(reglaTimbre.incluir_rut&&empresa.rut?'RUT '+esc(String(empresa.rut).toUpperCase())+'<br>':'')
    +esc(reglaTimbre.cargo||'')
    +(reglaTimbre.nombre_firmante?'<br>'+esc(reglaTimbre.nombre_firmante):'')
    +'</div></div></div>';
}
// Los dos recuadros de firma. El del supervisor solo aparece si la
// plantilla lo pide: un papel con dos firmas donde la plantilla pide una
// es un documento mal hecho.
function htmlFirmas(plantilla,conFirmas){
  // 'ninguno' no muestra ni un recuadro: un aviso informativo que se
  // firma es un documento mal hecho, y el papel queda con una firma de
  // alguien que no firmó.
  const modoFirmas=plantilla.firmas||'trabajador_supervisor';
  const conSup=modoFirmas!=='ninguno';
  const soloTrabajador=modoFirmas==='trabajador';
  const bloque=(titulo,campo,quien)=>{
    const hay=campo&&String(campo).startsWith('data:image');
    return '<div class="firma-bloque">'
      +'<div class="firma-caja">'+(hay?'<img src="'+campo+'" alt="firma">':'')+'</div>'
      +'<div class="firma-linea"></div>'
      +'<div class="firma-pie"><b>'+escHtml(titulo)+'</b><br><small>'+escHtml(quien||'')+'</small></div>'
      +'</div>';
  };
  const conWorkers=(conFirmas&&conFirmas.firma_trabajador)||null;
  const firmaSup=(conFirmas&&conFirmas.firma_supervisor)||null;
  return '<div class="firmas">'
    +bloque('Firma del trabajador',conWorkers,'')
    +(conSup&&!soloTrabajador?bloque('Firma y nombre del supervisor',firmaSup,''):'')
    +'</div>';
}
function abrirPapel(plantillaCode,code){
  if(!exigirPermiso('contratacion.firmar','No tienes permiso para generar los papeles del kit.'))return;
  const p=plantillasContratacion.find(x=>x.code===plantillaCode);
  const w=workers.find(x=>x.code===code);
  if(!p||!w){alert('No se encontró el papel o el trabajador.');return;}
  const entrega=entregasDe(code).find(e=>e.plantilla_code===plantillaCode)||null;
  const dlg=document.getElementById('dlgPapel');
  document.getElementById('papelTitulo').textContent=p.nombre;
  document.getElementById('papelError').textContent='';
  document.getElementById('papelVersion').textContent='v'+p.version;
  const donde=document.getElementById('papelHoja');
  if(!empresaDelPapel()){
    document.getElementById('papelError').innerHTML=escHtml(avisoSinEmpresaUnica());
  }
  donde.innerHTML=reemplazarCampos(p.contenido,w,{
    centro:centroDeRelojDe(w)||((empresaDelPapel()||{}).nombre||'')
  })+htmlFirmas(p,entrega)+htmlTimbre();
  // Los dos recuadros de firma se vuelven a dibujar vacíos, con la
  // firma ya puesta de fondo si la había.
  montarFirmaPapel('papelFirmaTrab',entrega?entrega.firma_trabajador:null);
  // Con la columna nueva: el recuadro del supervisor se monta si la plantilla
// lo pide. Con la vieja (un sí/no) bastaba con el valor directo; con tres
// casos hay que comparar contra 'ninguno', porque ese es el que no
// muestra nada.
if((p.firmas||'trabajador_supervisor')!=='ninguno')montarFirmaPapel('papelFirmaSup',entrega?entrega.firma_supervisor:null);
  else document.getElementById('papelFirmaSupWrap').style.display='none';
  document.getElementById('papelGuardar').textContent=entrega&&entrega.estado==='completa'?'Volver a guardar':'Guardar firma';
  dlg._plantilla=p;dlg._code=code;dlg._entrega=entrega;
  dlg.showModal();
}

// ------------------------------------------------------------------
// LA FIRMA
// ------------------------------------------------------------------
// Un <canvas> como el de la entrega de EPP, que ya está hecho y anda. Se
// reusa el mismo patrón en vez de escribir otro: son el mismo problema y dos
// implementaciones se rompen por motivos distintos.
function montarFirmaPapel(id,firmaPrevia){
  const wrap=document.getElementById(id+'Wrap');
  wrap.style.display='';
  const canvas=document.getElementById(id);
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(firmaPrevia&&String(firmaPrevia).startsWith('data:image')){
    // Se dibuja la firma previa de fondo, para que quien reimprima un papel
    // ya firmado vea la misma imagen y no una caja vacía.
    const img=new Image();
    img.onload=()=>ctx.drawImage(img,0,0,canvas.width,canvas.height);
    img.src=firmaPrevia;
  }
  canvas._dibujando=false;canvas._vacio=true;
  const pos=(ev)=>{
    const r=canvas.getBoundingClientRect();
    return {x:(ev.clientX-r.left)*(canvas.width/r.width),y:(ev.clientY-r.top)*(canvas.height/r.height)};
  };
  canvas.onpointerdown=(ev)=>{
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    canvas._dibujando=true;canvas._vacio=false;
    const p=pos(ev);
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle='#111';
  };
  canvas.onpointermove=(ev)=>{
    if(!canvas._dibujando)return;
    const p=pos(ev);
    ctx.lineTo(p.x,p.y);ctx.stroke();
  };
  const fin=()=>{canvas._dibujando=false;};
  canvas.onpointerup=fin;canvas.onpointercancel=fin;canvas.onpointerleave=fin;
  canvas.ontouchend=fin;
}
function limpiarFirma(id){
  const canvas=document.getElementById(id);
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  canvas._vacio=true;
}
function firmaComoDatos(id){
  const canvas=document.getElementById(id);
  if(canvas._vacio)return null;
  // PNG en blanco: comprimiría a un símbolo y la base de guarda menos, pero
  // un papel firmado tiene que seguir siendo legible dentro de un año, en
  // una impresora cualquiera. Se deja sin comprimir.
  return canvas.toDataURL('image/png');
}

// ------------------------------------------------------------------
// GUARDAR
// ------------------------------------------------------------------
async function guardarPapel(){
  const dlg=document.getElementById('dlgPapel');
  const p=dlg._plantilla,code=dlg._code;
  if(!p)return;
  const err=document.getElementById('papelError');
  const btn=document.getElementById('papelGuardar');
  err.textContent='';
  const firmaT=firmaComoDatos('papelFirmaTrab');
  // Con la columna nueva hay tres casos, no dos:
  //   'ninguno'               -> no se pide ninguna firma
  //   'trabajador'            -> se pide solo la del trabajador
  //   'trabajador_supervisor' -> se piden las dos, y no se guarda con una
  // Antes, con un sí/no, el caso "nadie" no se distinguía de "solo el
  // trabajador": una plantilla informativa terminaba exigiendo una firma.
  const modoFirmas=p.firmas||'trabajador_supervisor';
  const firmaS=(modoFirmas!=='ninguno')?firmaComoDatos('papelFirmaSup'):null;
  if(modoFirmas==='ninguno'){
    // Un aviso informativo se entrega sin firmar. Se guarda igual: es lo
    // que pidió la plantilla, y la base lo registra.
  }else if(modoFirmas==='trabajador_supervisor'){
    if(!firmaT&&!firmaS){
      err.textContent='Este papel lo firma el trabajador Y el supervisor. Firmá las dos.';
      return;
    }
    if(!firmaT||!firmaS){
      // Y POR QUE SON DOS "!": Y NO UN "!="
      //
      // Antes decia "firmaT!==firmaS", que compara las DOS firmas como si fueran iguales. Dos
      // firmas dibujadas a mano nunca son iguales: cada trazo produce pixeles distintos, asi que el
      // base64 difiere siempre. El cartel aparecia con las dos firmas hechas y el boton
      // bloqueado, y no habia ningun error en ninguna parte.
      //
      // Lo que se quiere preguntar es si falta ALGUNA de las dos, y eso son dos "!": una por
      // firma.
      err.textContent='Este papel lo firma el trabajador Y el supervisor. Falta una de las dos.';
      return;
    }
  }else if(!firmaT){
    err.textContent='Firmá el trabajador para guardar el papel.';
    return;
  }
  const w=workers.find(x=>x.code===code);
  btn.disabled=true;btn.textContent='Guardando…';
  const {data,error}=await window.supabaseClient.rpc('registrar_firma_contratacion',{
    p_plantilla_code:p.code, p_trabajador_code:code, p_version:p.version,
    p_firma_trabajador:firmaT, p_firma_supervisor:firmaS,
    p_datos:{nombre:w?w.name:'',rut:w?w.rut:'',especialidad:especialidadNombre(w?w.especialidad_clave:'')},
    p_anular:false
  });
  btn.disabled=false;btn.textContent='Guardar firma';
  if(error){
    // La versión de la plantilla pudo cambiar mientras el papel estaba
    // abierto. El mensaje de la base lo dice y hay que decirlo también en
    // la pantalla: si no, la persona firma un texto que no es el que leyó.
    const cambio=/VERSION_CAMBIO/.test(error.message||'');
    err.innerHTML=cambio
      ?'La plantilla cambió mientras este papel estaba abierto.<br>'+
       '<small>Cerrá el papel y volvé a abrirlo para que se descargue el texto nuevo. Lo que escribiste no se guardó.</small>'
      :faltaLaMigracion(error,['registrar_firma_contratacion'])
      ?'La migración <b>031_kit_contratacion.sql</b> no está aplicada.'
      :escHtml(error.message);
    return;
  }
  dlg.close();
  await cargarContratacion();
  await cargarKitDelTrabajador(code);
  await renderList('');
  alert('El papel quedó guardado con la firma.');
}
async function anularPapel(plantillaCode,code){
  const p=plantillasContratacion.find(x=>x.code===plantillaCode);
  if(!p)return;
  if(!confirm('Anular el papel "'+p.nombre+'" de '+(workers.find(x=>x.code===code)||{}).name+'?\n\nEl papel NO se borra: queda como anulado, y la persona puede volver a firmarlo.\n\nSi lo firmaste por error, esto es lo correcto. Si lo querés borrar, no se puede: es un papel firmado.'))return;
  const {error}=await window.supabaseClient.rpc('registrar_firma_contratacion',{
    p_plantilla_code:plantillaCode, p_trabajador_code:code, p_version:p.version,
    p_firma_trabajador:null, p_firma_supervisor:null, p_datos:{}, p_anular:true
  });
  if(error){alert('No se pudo anular: '+error.message);return;}
  await cargarContratacion();
  await cargarKitDelTrabajador(code);
}

// ------------------------------------------------------------------
// EL PDF
// ------------------------------------------------------------------
async function descargarEntrega(entregaId){
  if(typeof jspdf==='undefined'||typeof html2canvas==='undefined'){
    alert('No se cargaron las librerías de PDF.\n\nRevisá la conexión a internet y recargá la página con Ctrl+F5.');
    return;
  }
  const e=entregasContratacion.find(x=>x.id===entregaId);
  if(!e){alert('No se encontró la entrega.');return;}
  const p=plantillaPorId(e.plantilla_id);
  const w=workers.find(x=>x.code===e.trabajador_code);
  if(!p||!w){alert('No se encontró la plantilla o el trabajador.');return;}
  const hoja=document.getElementById('pantallaTotal');
  hoja.innerHTML='<div class="hoja-papel">'
    +reemplazarCampos(p.contenido,w,e.datos||{})
    +htmlFirmas(p,e)
    +htmlTimbre()
    +'</div>';
  await new Promise(r=>setTimeout(r,150));
  // Se usa la global que ya está en el <head>, no un import().
  //
  // Importar la versión ESM de jspdf por dinámica cargaría una segunda copia
  // de la librería en la misma página: son más de 400 kB y dos copias del
  // mismo código con distinto estado interno. Para qué, si la del <head>
  // ya sirve.
  const Ctor=(window.jspdf&&(window.jspdf.jsPDF||window.jspdf))||null;
  if(!Ctor){
    alert('No se cargó la librería de PDF. Revisá la conexión a internet y recargá con Ctrl+F5.');
    return;
  }
  const canvas=await html2canvas(hoja.firstElementChild,{scale:2,backgroundColor:'#ffffff',logging:false});
  const pdf=new Ctor({unit:'pt',format:'a4',compress:true});
  const anchoUtil=PAPEL_ANCHO;
  const img=canvas.toDataURL('image/jpeg',0.92);
  const altoPagina=595.28;
  // El papel puede ser más largo que una hoja: se reparte en varias
  // páginas en vez de dejar el final cortado, que es lo que pasa si se
  // escala todo a una sola imagen.
  const imgAlto=(canvas.height*anchoUtil)/canvas.width;
  let resto=imgAlto;
  let pagina=0;
  while(resto>0){
    if(pagina>0)pdf.addPage();
    // Se recorta con un canvas auxiliar, porque drawImage con negative
    // offset no funciona en todos los navegadores.
    const trozo=Math.min(resto,altoPagina);
    const c2=document.createElement('canvas');
    c2.width=canvas.width;
    c2.height=Math.round((trozo*canvas.width)/anchoUtil);
    c2.getContext('2d').drawImage(canvas,
      0,Math.round((pagina*altoPagina*canvas.width)/anchoUtil),canvas.width,c2.height,
      0,0,canvas.width,c2.height);
    pdf.addImage(c2.toDataURL('image/jpeg',0.92),'JPEG',0,0,anchoUtil,trozo,undefined,'FAST');
    resto-=trozo;
    pagina++;
  }
  const nombre=(w.name||e.trabajador_code).replace(/[\\/:*?"<>|]/g,'').trim();
  pdf.save(p.nombre.replace(/[\\/:*?"<>|]/g,'')+' - '+nombre+'.pdf');
  hoja.innerHTML='';
}
