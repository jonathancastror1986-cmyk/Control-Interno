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
   - KITS INICIALES POR ESPECIALIDAD
   - KIT DE CONTRATACIÓN
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

// ============================================================
let especialidadSeleccionada='';
let kitAdminSeleccionado='';   // id de epp_kits en el administrador

// ---------- carga ----------
async function loadEspecialidades(quiet){
  const {data,error}=await window.supabaseClient.from('epp_especialidades').select('*').order('nombre');
  if(error){bodegaError('No se pudieron cargar las especialidades (ejecuta la migración 011): '+error.message,quiet);return;}
  especialidades=(data||[]).filter(e=>e.activa!==false);
  if(!especialidades.some(e=>e.clave===especialidadSeleccionada))
    especialidadSeleccionada=especialidades.length?especialidades[0].clave:'';
}
async function loadKits(quiet){
  const {data,error}=await window.supabaseClient.from('epp_kits').select('*').order('nombre');
  if(error){bodegaError('No se pudieron cargar los kits (ejecuta la migración 012): '+error.message,quiet);return;}
  kits=(data||[]).filter(k=>k.activo!==false);
}
async function loadKitItems(quiet){
  const {data,error}=await window.supabaseClient.from('epp_kit_items').select('*').order('orden');
  if(error){bodegaError('No se pudieron cargar los elementos de los kits: '+error.message,quiet);return;}
  kitItems=data||[];
}
async function loadKitAsignaciones(quiet){
  const {data,error}=await window.supabaseClient.from('epp_kit_asignaciones').select('*').order('created_at',{ascending:false});
  if(error){bodegaError('No se pudieron cargar las asignaciones de kit: '+error.message,quiet);return;}
  const filas=data||[];
  if(filas.length){
    const {data:items}=await window.supabaseClient.from('epp_kit_asignacion_items').select('*').in('asignacion_id',filas.map(a=>a.id));
    const porAsig={};
    (items||[]).forEach(it=>{(porAsig[it.asignacion_id]=porAsig[it.asignacion_id]||[]).push(it);});
    filas.forEach(a=>{a.items=porAsig[a.id]||[];});
  }
  kitAsignaciones=filas;
}

// ---------- helpers ----------
// Los <select> devuelven SIEMPRE string, mientras que el id del modelo
// puede venir como uuid (string) o número según la fuente. Comparar con
// mismoId() evita que un filtro de la UI deje de encontrar su registro.
function mismoId(a,b){
  if(a==null||b==null)return false;
  return String(a)===String(b);
}
function especialidadPorClave(clave){return especialidades.find(e=>mismoId(e.clave,clave))||null;}
function especialidadPorId(id){return especialidades.find(e=>mismoId(e.id,id))||null;}
function kitsDeEspecialidad(espId){
  return kits.filter(k=>mismoId(k.especialidad_id,espId)).sort((a,b)=>(a.orden||0)-(b.orden||0)||a.nombre.localeCompare(b.nombre));
}
function itemsDeKit(kitId){
  return kitItems.filter(i=>mismoId(i.kit_id,kitId)).sort((a,b)=>(a.orden||0)-(b.orden||0));
}
// normalizarCargo() está definida en el módulo de EPP.
function especialidadDelTrabajador(code){
  const cargo=normalizarCargo(cargoDelTrabajador(code));
  if(!cargo)return null;
  return especialidades.find(e=>e.clave===cargo)
      || especialidades.find(e=>cargo.includes(e.clave))
      || null;
}
function progresoAsignacion(a){
  const total=(a.items||[]).length;
  const hechos=(a.items||[]).filter(i=>i.estado==='entregado').length;
  return {total,hechos,pendientes:total-hechos,pct:total?Math.round(hechos/total*100):0,completo:total>0&&hechos===total};
}

// ---------- 1) asignación ----------
function fillKitSelects(){
  const selEsp=document.getElementById('kit-esp');
  const selKit=document.getElementById('kit-select');
  if(!selEsp||!selKit)return;
  const espId=selEsp.value;
  const lista=kitsDeEspecialidad(espId);
  selKit.innerHTML=lista.length
    ?lista.map(k=>`<option value="${k.id}">${k.nombre} (${itemsDeKit(k.id).length} elem.)</option>`).join('')
    :'<option value="">— esa especialidad no tiene kits —</option>';
  renderKitPreview();
}
function renderKitPreview(){
  const box=document.getElementById('kitPreview');
  if(!box)return;
  const kitId=document.getElementById('kit-select').value;
  const items=itemsDeKit(kitId);
  if(!kitId||!items.length){box.innerHTML='<small class="gpsWarn">Ese kit no tiene elementos. Créalo en la sección 4.</small>';return;}
  const unidades=items.reduce((s,i)=>s+(i.cantidad||1),0);
  box.innerHTML=`<div class="kitResumen">Este kit tiene <b>${items.length}</b> tipo(s) de elemento, <b>${unidades}</b> unidad(es). Al asignarlo quedan todos <b>pendientes</b> y los vas marcando al entregar.</div>`;
}
async function asignarKit(){
  const code=document.getElementById('kit-worker').value;
  const espId=document.getElementById('kit-esp').value;
  const kitId=document.getElementById('kit-select').value;
  const fecha=document.getElementById('kit-fecha').value||hoyLocal();
  const kit=kits.find(k=>mismoId(k.id,kitId));
  const esp=especialidadPorId(espId);
  if(!code){alert('Selecciona o escanea al trabajador.');return;}
  if(!kit){alert('Elige un kit.');return;}
  const items=itemsDeKit(kitId);
  if(!items.length){alert('Ese kit no tiene elementos. Agrégalos primero en la sección 4.');return;}
  const nombre=(workers.find(w=>w.code===code)||{}).name||code;
  const abierta=kitAsignaciones.find(a=>a.code===code&&!a.completado);  if(abierta&&!confirm(`${nombre} ya tiene el kit "${abierta.kit_nombre}" abierto con ${progresoAsignacion(abierta).pendientes} pendiente(s). ¿Asignar otro kit aparte?`))return;
  if(!confirm(`¿Asignar el kit "${kit.nombre}" a ${nombre}? Quedarán ${items.length} elemento(s) pendientes.`))return;
  const {data,error}=await window.supabaseClient.from('epp_kit_asignaciones').insert({
    code,
    especialidad_id:espId,
    kit_id:kitId,
    especialidad_nombre:esp?esp.nombre:null,
    kit_nombre:kit.nombre,
    fecha,
    completado:false
  }).select().single();
  if(error){alert('No se pudo asignar el kit: '+error.message);return;}
  const filas=items.map(i=>{
    const cat=eppCatalog.find(c=>c.codigo===i.epp_codigo);
    const talla=i.talla_sugerida&&tallasDeTipo(cat&&cat.tipo_talla).includes(i.talla_sugerida)?i.talla_sugerida:'';
    return {
      asignacion_id:data.id,      epp_codigo:i.epp_codigo,
      nombre:cat?cat.nombre:i.epp_codigo,
      detalle:cat?cat.detalle:null,
      talla,
      cantidad:i.cantidad||1,
      tipo_talla:cat?cat.tipo_talla:null,
      estado:'pendiente'
    };
  });
  const {error:errItems}=await window.supabaseClient.from('epp_kit_asignacion_items').insert(filas);
  if(errItems){alert('Kit asignado pero fallaron sus elementos: '+errItems.message);return;}
  await loadKitAsignaciones(true);
  renderKitAsigList();
  fillKitAsigSelect();
  document.getElementById('kitAsigSel').value=data.id;
  renderKitEntrega();
  alert(`Kit "${kit.nombre}" asignado a ${nombre}: ${items.length} elemento(s) pendientes.`);
}

// ---------- 2) entrega parcial ----------
function fillKitAsigSelect(){
  const sel=document.getElementById('kitAsigSel');
  if(!sel)return;
  const abiertas=kitAsignaciones.filter(a=>!a.completado);
  sel.innerHTML=abiertas.length
    ?abiertas.map(a=>{
        const p=progresoAsignacion(a);
        const w=workers.find(x=>x.code===a.code);
        return `<option value="${a.id}">${a.code} ${w?w.name:''} · ${a.kit_nombre||'kit'} · ${p.hechos}/${p.total}</option>`;
      }).join('')
    :'<option value="">— no hay kits pendientes —</option>';
  renderKitEntrega();
}
function renderKitEntrega(){
  const sel=document.getElementById('kitAsigSel');
  const host=document.getElementById('kitEntregaRows');
  const prog=document.getElementById('kitProgreso');
  if(!sel||!host)return;
  const a=asignacionActual();
  if(!a){
    host.innerHTML='<div class="kitVacio">Selecciona una asignación para entregar elementos.</div>';
    if(prog)prog.innerHTML='';
    return;
  }
  const p=progresoAsignacion(a);
  if(prog){
    prog.innerHTML=`<div class="kitResumen">
      <span><b>${a.code}</b> · ${a.kit_nombre||'kit'} — ${p.hechos} de ${p.total} entregados (${p.pendientes} pendiente(s))</span>
      <span class="kitBar ${p.completo?'completo':''}" style="flex:1;min-width:140px"><i style="width:${p.pct}%"></i></span>
    </div>`;
  }
  const pendientes=(a.items||[]).filter(i=>i.estado==='pendiente');
  if(!pendientes.length){
    host.innerHTML=`<div class="kitVacio" style="color:var(--accent)">Kit completo: todos los elementos están entregados. ✓</div>`;
    return;
  }
  host.innerHTML=pendientes.map((it,idx)=>`
    <div class="kitFila" data-id="${it.id}">
      <div><input type="checkbox" id="kc-${idx}" checked onchange="kitItemSeleccionado('${it.id}',this.checked)"></div>
      <div><b>${it.epp_codigo||''}</b> ${it.nombre}<br><small>${it.detalle||''}</small><button class="btn secondary" type="button" data-dato="Escanear el código de este elemento del kit" style="padding:3px 7px;font-size:.62rem;margin-top:4px" onclick="openQrCamera('kit-item:${idx}')">📷 Escanear</button></div>
      <div><select onchange="kitItemTalla('${it.id}',this.value)">${tallaOptions(it.tipo_talla,it.talla)}</select></div>
      <div><input type="number" min="1" step="1" value="${it.cantidad}" onchange="kitItemCantidad('${it.id}',this.value)"></div>
      <div style="text-align:center"><b>${it.cantidad}</b></div>
      <div><span class="kitEstado pendiente">Pendiente</span></div>
    </div>`).join('');
}
function escanearKitItem(indice,codigo){
  const limpia=String(codigo||'').trim();
  if(!limpia)return;
  const fila=kitFilaActual(indice);
  if(!fila)return;
  const cat=eppCatalog.find(c=>normalizarCodigo(c.codigo)===normalizarCodigo(limpia));
  const sought=cat?cat.codigo:limpia;
  const enElKit=fila.items&&fila.items.find(i=>normalizarCodigo(i.epp_codigo||'')===normalizarCodigo(sought));
  const caja=document.getElementById('kitScanAviso');
  if(enElKit){
    const cb=document.getElementById('kc-'+indice);
    if(cb)cb.checked=true;
    if(caja)caja.innerHTML='<small style="color:var(--accent)"><b>'+escHtml(sought)+'</b> está en el kit. Queda marcado para entregar.</small>';
  }else{
    if(caja)caja.innerHTML='<small style="color:var(--warn-ink)"><b>'+escHtml(sought)+'</b>'
      +' no está en este kit. No se agregó: los elementos de un kit son los que trae la asignación, no los que se escanean.</small>';
  }
}
function kitItemSeleccionado(id,checked){
  const a=asignacionActual();
  const it=a&&(a.items||[]).find(x=>mismoId(x.id,id));
  if(it)it.seleccionado=checked;
}
function kitItemTalla(id,valor){
  const a=asignacionActual();
  const it=a&&(a.items||[]).find(x=>mismoId(x.id,id));
  if(it)it.talla=valor;
}
function kitItemCantidad(id,valor){
  const a=asignacionActual();
  const it=a&&(a.items||[]).find(x=>mismoId(x.id,id));
  if(it)it.cantidad=parseInt(valor,10)||1;
}
function asignacionActual(){
  const sel=document.getElementById('kitAsigSel');
  if(!sel)return null;
  return kitAsignaciones.find(x=>mismoId(x.id,sel.value))||null;
}
function marcarTodosPendientes(valor){
  const a=asignacionActual();
  if(!a)return;
  (a.items||[]).filter(i=>i.estado==='pendiente').forEach(i=>{i.seleccionado=!!valor;});
  document.querySelectorAll('#kitEntregaRows input[type=checkbox]').forEach(c=>{c.checked=!!valor;});
}async function entregarKitItems(){
  const btn=document.getElementById('kitSaveBtn');
  const msg=document.getElementById('kitSaveMsg');
  const a=asignacionActual();
  if(!a){alert('Selecciona una asignación de kit.');return;}
  const seleccionados=(a.items||[]).filter(i=>i.estado==='pendiente'&&i.seleccionado!==false);
  if(!seleccionados.length){alert('Marca al menos un elemento pendiente para entregar.');return;}
  const firma=signatureDataUrl('Kit');
  if(!firma&&!confirm('No hay firma en el recuadro. ¿Guardar la entrega igual?'))return;
  const unidades=seleccionados.reduce((s,i)=>s+(i.cantidad||1),0);
  const nombre=(workers.find(w=>w.code===a.code)||{}).name||a.code;
  if(!confirm(`¿Entregar ${seleccionados.length} elemento(s) (${unidades} unidad(es)) del kit "${a.kit_nombre||''}" a ${nombre}?`))return;

  btn.disabled=true;
  msg.textContent='Generando PDF…';
  msg.style.color='var(--muted)';
  try{
    const items=seleccionados.map(i=>({
      epp_codigo:i.epp_codigo,
      nombre:i.nombre,
      detalle:i.detalle,
      talla:i.talla||null,
      cantidad:i.cantidad||1
    }));
    const {data,error}=await window.supabaseClient.from('epp_entregas').insert({
      code:a.code,
      fecha:hoyLocal(),
      detalle:eppDetalleResumen(items),
      observacion:document.getElementById('kit-obs').value.trim()||null,
      pasillo:document.getElementById('kit-pasillo').value.trim()||null,
      sector:document.getElementById('kit-sector').value.trim()||null,
      nivel:document.getElementById('kit-nivel').value.trim()||null,
      es_entrega_inicial:true,
      cargo:a.especialidad_nombre||null,
      firma_url:null,
      firma_at:firma?new Date().toISOString():null,
      firma_metodo:firma?'canvas':null,
      firma_lat:eppGps?eppGps.lat:null,
      firma_lng:eppGps?eppGps.lng:null,
      firma_precision_m:eppGps?eppGps.precision:null,
      pdf_url:null
    }).select().single();
    if(error)throw new Error(error.message);
    const entrega=data;

    const {error:errItems}=await window.supabaseClient.from('epp_entrega_items')
      .insert(items.map(it=>({entrega_id:entrega.id,...it})));
    if(errItems)throw new Error(errItems.message);

    // marcar los elementos como entregados y ligarlos a esta entrega
    for(const it of seleccionados){
      const {error:errUp}=await window.supabaseClient.from('epp_kit_asignacion_items')
        .update({estado:'entregado',entrega_id:entrega.id,entregado_at:new Date().toISOString()})
        .eq('id',it.id);
      if(errUp)throw new Error(errUp.message);
    }

    msg.textContent='Subiendo firma y PDF…';
    const carpeta=`${entrega.code}/${entrega.id}`;
    if(firma){
      const firmaBlob=await (await fetch(firma)).blob();
      const firmaPath=`${carpeta}/firma.png`;
      await uploadToBucket(firmaPath,firmaBlob,'image/png');
      const {error:errF}=await window.supabaseClient.from('epp_entregas').update({firma_url:firmaPath}).eq('id',entrega.id);
      if(errF)throw new Error(errF.message);
    }
    const pdfPath=`${carpeta}/entrega_${entrega.fecha}.pdf`;
    await uploadToBucket(pdfPath,buildEppPdf(entrega,items,firma),'application/pdf');
    const {error:errP}=await window.supabaseClient.from('epp_entregas').update({pdf_url:pdfPath}).eq('id',entrega.id);
    if(errP)throw new Error(errP.message);

    // ¿quedó completo el kit?
    const restantes=(a.items||[]).filter(i=>i.estado==='pendiente'&&!seleccionados.some(s=>mismoId(s.id,i.id))).length;
    if(restantes===0){
      await window.supabaseClient.from('epp_kit_asignaciones')
        .update({completado:true,completado_at:new Date().toISOString()}).eq('id',a.id);
    }
    await Promise.all([loadEppDeliveries(true),loadKitAsignaciones(true)]);
    clearSignature('Kit');
    limpiarGps('Kit');
    document.getElementById('kit-obs').value='';
    fillKitAsigSelect();
    renderKitAsigList();
    const finTxt=restantes===0?' Kit completo ✓':` Quedan ${restantes} pendiente(s).`;
    msg.textContent=`Entregados ${seleccionados.length} elemento(s).${finTxt}`;
    msg.style.color='var(--accent)';
  }catch(error){
    msg.textContent='No se pudo guardar: '+error.message;
    msg.style.color='var(--danger)';
    alert('No se pudo entregar: '+error.message);
  }finally{
    btn.disabled=false;
  }
}

// ---------- 3) listado de asignaciones ----------
function renderKitAsigList(){
  const el=document.getElementById('kitAsigList');
  if(!el)return;
  if(!kitAsignaciones.length){el.innerHTML='<small>Nadie tiene un kit asignado todavía.</small>';return;}
  el.innerHTML=kitAsignaciones.map(a=>{
    const w=workers.find(x=>x.code===a.code);
    const p=progresoAsignacion(a);
    const pills=(a.items||[]).map(i=>`<span class="kitItemPill ${i.estado==='entregado'?'ok':'no'}">${i.epp_codigo||i.nombre}${i.talla?' '+i.talla:''} ×${i.cantidad}</span>`).join('');
    return `<div class="kitAsigCard">
      <div class="headline">
        <span><b>${a.code}</b> ${w?w.name:''} · ${a.especialidad_nombre||''} · kit <b>${a.kit_nombre||''}</b> · ${a.fecha}</span>
        <span>${p.completo
          ?'<span class="kitEstado entregado">Completo</span>'
          :`<span class="kitEstado pendiente">${p.hechos}/${p.total} entregados</span>`}</span>
      </div>
      <div class="kitBar ${p.completo?'completo':''}"><i style="width:${p.pct}%"></i></div>
      <div>${pills}</div>
    </div>`;
  }).join('');
}

// ---------- 4) administración ----------
async function addEspecialidad(){
  const nombre=document.getElementById('esp-nombre').value.trim();
  const descripcion=document.getElementById('esp-desc').value.trim();
  if(!nombre){alert('Escribe el nombre de la especialidad.');return;}
  const clave=normalizarCargo(nombre);
  if(especialidades.some(e=>e.clave===clave)){alert('Ya existe la especialidad "'+nombre+'".');return;}
  const {error}=await window.supabaseClient.from('epp_especialidades').insert({clave,nombre,descripcion:descripcion||null});
  if(error){alert('No se pudo crear la especialidad: '+error.message);return;}
  document.getElementById('esp-nombre').value='';
  document.getElementById('esp-desc').value='';
  await loadEspecialidades(true);
  especialidadSeleccionada=clave;
  renderEspecialidades();
  fillEspecialidadSelect();
}
function renderEspecialidades(){
  const el=document.getElementById('espList');
  if(!el)return;
  if(!especialidades.length){el.innerHTML='<small>No hay especialidades creadas.</small>';return;}
  el.innerHTML=especialidades.map(e=>{
    const nKits=kitsDeEspecialidad(e.id).length;
    return `<div class="espItem ${e.clave===especialidadSeleccionada?'sel':''}" onclick="seleccionarEspecialidad('${e.clave}')">
      <span style="flex:1;min-width:0">
        <span class="n">${e.nombre}</span><br>
        <span class="d">${nKits} kit(s)</span>
      </span>
      <span style="display:flex;gap:4px;align-items:center">
        <span class="ct" onclick="event.stopPropagation();eliminarEspecialidad('${e.clave}')" style="cursor:pointer" title="Eliminar">✕</span>
      </span>
    </div>`;
  }).join('');
}
function seleccionarEspecialidad(clave){
  especialidadSeleccionada=clave;
  const esp=especialidadPorClave(clave);
  const lista=kitsDeEspecialidad(esp?esp.id:'');
  kitAdminSeleccionado=lista.length?lista[0].id:'';
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  fillEspecialidadSelect();
}
function renderKitAdminList(){
  const el=document.getElementById('kitAdminList');
  if(!el)return;
  const esp=especialidadPorClave(especialidadSeleccionada);
  const lista=esp?kitsDeEspecialidad(esp.id):[];
  if(!lista.length){el.innerHTML='<small>Sin kits. Crea el primero (Pintor A, Pintor B…).</small>';return;}
  el.innerHTML=lista.map(k=>{
    const n=itemsDeKit(k.id).length;
    return `<div class="espItem ${mismoId(k.id,kitAdminSeleccionado)?'sel':''}" onclick="seleccionarKitAdmin('${k.id}')">
      <span style="flex:1;min-width:0"><span class="n">${k.nombre}</span><br><span class="d">${n} elemento(s)</span></span>
      <span class="ct" onclick="event.stopPropagation();eliminarKit('${k.id}')" style="cursor:pointer" title="Eliminar">✕</span>
    </div>`;
  }).join('');
}
function seleccionarKitAdmin(id){
  kitAdminSeleccionado=id;
  renderKitAdminList();
  renderKitDetalleAdmin();
}
async function addKitAdmin(){
  const esp=especialidadPorClave(especialidadSeleccionada);
  const nombre=document.getElementById('kitNombre').value.trim();
  if(!esp){alert('Selecciona una especialidad.');return;}
  if(!nombre){alert('Escribe el nombre del kit (ej. "Pintor A").');return;}
  if(kitsDeEspecialidad(esp.id).some(k=>k.nombre.toLowerCase()===nombre.toLowerCase())){
    alert('Esa especialidad ya tiene un kit llamado "'+nombre+'".');return;
  }
  const {data,error}=await window.supabaseClient.from('epp_kits')
    .insert({especialidad_id:esp.id,nombre,orden:kitsDeEspecialidad(esp.id).length})
    .select().single();
  if(error){alert('No se pudo crear el kit: '+error.message);return;}
  document.getElementById('kitNombre').value='';
  await loadKits(true);
  kitAdminSeleccionado=data.id;
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  fillEspecialidadSelect();
}
async function eliminarKit(id){
  const k=kits.find(x=>mismoId(x.id,id));
  if(!k)return;
  if(!confirm(`Se eliminará el kit "${k.nombre}" con sus ${itemsDeKit(id).length} elemento(s). ¿Continuar?`))return;
  const {error}=await window.supabaseClient.from('epp_kits').delete().eq('id',id);
  if(error){alert('No se pudo eliminar: '+error.message);return;}
  await loadKits(true);
  kitAdminSeleccionado='';
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  fillEspecialidadSelect();
}
async function eliminarEspecialidad(clave){
  const esp=especialidadPorClave(clave);
  if(!esp)return;
  const nKits=kitsDeEspecialidad(esp.id).length;
  if(!confirm(`Se eliminará "${esp.nombre}" y sus ${nKits} kit(s). ¿Continuar?`))return;
  const {error}=await window.supabaseClient.from('epp_especialidades').delete().eq('id',esp.id);
  if(error){alert('No se pudo eliminar: '+error.message);return;}
  await Promise.all([loadEspecialidades(true),loadKits(true)]);
  especialidadSeleccionada='';
  kitAdminSeleccionado='';
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  fillEspecialidadSelect();
}
function renderKitDetalleAdmin(){
  const el=document.getElementById('kitDetalleAdmin');
  if(!el)return;
  const kit=kits.find(k=>mismoId(k.id,kitAdminSeleccionado));
  if(!kit){el.innerHTML='<small>Selecciona un kit para ver sus elementos.</small>';return;}
  const items=itemsDeKit(kit.id);
  const filas=items.map(i=>{
    const cat=eppCatalog.find(c=>c.codigo===i.epp_codigo);
    return `<div class="kitFila">
      <div></div>
      <div><b>${i.epp_codigo}</b> ${cat?cat.nombre:i.epp_codigo}${cat&&cat.activo===false?' <small style="color:var(--danger)">(dado de baja)</small>':''}</div>
      <div><select onchange="setKitItemField('${kit.id}','${i.epp_codigo}','talla_sugerida',this.value)">${tallaOptions(cat&&cat.tipo_talla,i.talla_sugerida||'')}</select></div>
      <div><input type="number" min="1" step="1" value="${i.cantidad}" onchange="setKitItemField('${kit.id}','${i.epp_codigo}','cantidad',this.value)"></div>
      <div style="text-align:center">×${i.cantidad}</div>
      <div><button class="btn secondary" type="button" onclick="quitarKitItem('${kit.id}','${i.epp_codigo}')">Quitar</button></div>
    </div>`;
  }).join('');
  el.innerHTML=`
    <label>Elementos de ${kit.nombre}</label>
    <div class="eppItems" style="margin-top:6px">${filas||'<div class="kitVacio">Este kit está vacío.</div>'}</div>
    <div class="row" style="margin-top:8px">
      <div><label>Agregar elemento</label><select id="kitAddItem">${eppCatalog.filter(c=>c.activo!==false).map(c=>`<option value="${c.codigo}">${c.codigo} — ${c.nombre}</option>`).join('')}</select></div>
      <div style="display:flex;align-items:flex-end"><button class="btn" type="button" onclick="agregarItemAlKit('${kit.id}')">Agregar al kit</button></div>
    </div>`;
}
async function setKitItemField(kitId,codigo,campo,valor){
  const patch={};
  patch[campo]=campo==='cantidad'?(parseInt(valor,10)||1):valor;
  const {error}=await window.supabaseClient.from('epp_kit_items').update(patch).eq('kit_id',kitId).eq('epp_codigo',codigo);
  if(error){alert('No se pudo actualizar: '+error.message);return;}
  await loadKitItems(true);
  renderKitDetalleAdmin();
  renderKitAdminList();
}
async function agregarItemAlKit(kitId){
  const codigo=document.getElementById('kitAddItem').value;
  if(!codigo){alert('Elige un elemento del catálogo.');return;}
  if(itemsDeKit(kitId).some(i=>i.epp_codigo===codigo)){alert('Ese elemento ya está en el kit.');return;}
  const {error}=await window.supabaseClient.from('epp_kit_items')
    .insert({kit_id:kitId,epp_codigo:codigo,cantidad:1,orden:itemsDeKit(kitId).length+1});
  if(error){alert('No se pudo agregar al kit: '+error.message);return;}
  await loadKitItems(true);
  renderKitDetalleAdmin();
  renderKitAdminList();
  renderEspecialidades();
  fillEspecialidadSelect();
  renderKitPreview();
}
async function quitarKitItem(kitId,codigo){
  if(!confirm('¿Quitar '+codigo+' del kit?'))return;
  const {error}=await window.supabaseClient.from('epp_kit_items').delete().eq('kit_id',kitId).eq('epp_codigo',codigo);
  if(error){alert('No se pudo quitar: '+error.message);return;}
  await loadKitItems(true);
  renderKitDetalleAdmin();
  renderKitAdminList();
  renderEspecialidades();
  fillEspecialidadSelect();
  renderKitPreview();
}

// ---------- entrada a la vista ----------
// El selector de la sección de kits. El del trabajador lo llena
// llenarSelectoresEspecialidad(), que existe desde antes y hace lo mismo
// para los dos: guarda la clave, ordena por nombre y conserva lo que había.
//
// Se !"usa" la misma función en los dos lugares y no dos parecidas: con dos,
  // Se usa la misma función en los dos lugares y no dos parecidas: con dos,
// de con la clave. La clave es lo que compara kit_de_un_trabajador() en la
// base, así que con el id el trabajador deja de recibir su charla de oficio.
function fillEspecialidadSelect(){
  llenarSelectoresEspecialidad();
  const sel=document.getElementById('kit-esp');
  if(!sel)return;
  const previo=sel.value;
  sel.innerHTML=especialidades.length
    ?especialidades.map(e=>`<option value="${e.id}">${escHtml(e.nombre||e.clave)}</option>`).join('')
    :'<option value="">— crea primero una especialidad —</option>';
  if(previo&&especialidades.some(e=>mismoId(e.id,previo)))sel.value=previo;
}
function initKitsView(){
  const selW=document.getElementById('kit-worker');
  if(selW){
    const previo=selW.value;
    selW.innerHTML=opcionesTrabajadores();
    if(workers.some(w=>w.code===previo))selW.value=previo;
  }
  const fecha=document.getElementById('kit-fecha');
  if(fecha&&!fecha.value)fecha.value=hoyLocal();
  if(!especialidadSeleccionada){
    const esp=especialidadDelTrabajador(selW?selW.value:'');
    if(esp)especialidadSeleccionada=esp.clave;
  }
  fillEspecialidadSelect();
  if(selW&&selW.value){
    const esp=especialidadDelTrabajador(selW.value);
    if(esp)document.getElementById('kit-esp').value=esp.id;
  }
  fillKitSelects();
  fillKitAsigSelect();
  renderKitAsigList();
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  actualizarKitWorkerHint();
}
function actualizarKitWorkerHint(){
  const selW=document.getElementById('kit-worker');
  const el=document.getElementById('kitWorkerHint');
  if(!selW||!el)return;
  const w=workers.find(x=>x.code===selW.value);
  if(!w){el.innerHTML='';return;}
  const esp=especialidadDelTrabajador(w.code);
  const yaTiene=kitAsignaciones.find(a=>a.code===w.code&&!a.completado);
  el.innerHTML=`<small>Seleccionado: <b>${w.name}</b>${w.spec?' — '+w.spec:''}${esp?` · especialidad: <b>${esp.nombre}</b>`:''}${yaTiene?` · <span style="color:var(--danger)">ya tiene pendiente el kit "${yaTiene.kit_nombre}" (${progresoAsignacion(yaTiene).pendientes} elemento(s))</span>`:''}</small>`;
  if(esp)document.getElementById('kit-esp').value=esp.id;
  fillKitSelects();
  const stamp=document.getElementById('sigStampKit');
  if(stamp)stamp.textContent='Firma de '+w.name;
}
function seleccionarKitWorkerByScan(scanned){
  const w=resolverCodigoTrabajador(scanned);
  if(!w)return;
  if(typeof showView==='function')showView('bodega-kits');
  const sel=document.getElementById('kit-worker');
  if(sel)sel.value=w.code;
  actualizarKitWorkerHint();
  if(navigator.vibrate){try{navigator.vibrate(120);}catch(error){}}
  const esp=especialidadDelTrabajador(w.code);
  const hint=document.getElementById('kitWorkerHint');
  if(hint)hint.innerHTML=`<small style="color:var(--accent)">✓ ${w.name}${esp?` — kit de <b>${esp.nombre}</b>`:''}. Asigna el kit y luego marca lo que entregues.</small>`;
}

// ============================================================
// MULTI-EMPRESA
// Hay varias empresas en el sistema. Cada trabajador pertenece a
// una, y cada usuario del sistema solo ve los trabajadores de las
// empresas a las que tiene acceso (por eso "workers" se filtra al
// cargar: así todo lo demás —tarja, EPP, tarjetas— queda acotado).

// ===================================================================
//
// Lo que se le entrega a una persona el primer día: la inducción, la
// declaración de salud, los elementos de protección, el acta de
// recepción. En papel, firmado, con el timbre de la empresa.
//
// TRES PIEZAS Y POR QUÉ NO SE MEZCLAN
//
//  1. La PLANTILLA. La escribe Prevención y se puede cambiar.
//  2. La ENTREGA. El papel firmado por una persona en una fecha. Esa no
//     se toca más: si se borra, se borra la prueba de que la persona fue
//     inducida. Se anula, que es distinto, y queda el rastro.
//  3. El TIMBRE. Sale de la tabla `empresa`, que ya tiene nombre y RUT. No
//     se duplican acá: si el timbre tuviera su propio nombre, algún día los
//     dos dicen cosas distintas y el que vale es el del papel.
//
// POR QUÉ EL PDF SE GENERA RENDERIZANDO, NO ESCRIBIENDO TEXTO
//
// Escribir el PDF a mano con una librería obliga a elegir una fuente
// Metrics, y la fuente que traen esas librerías no tiene ñ, ni á, ni é. Con
// texto español sale "A\ufff1ez" o directamente nada. Hay que subir una
// fuente completa embebida, que son varios cientos de kilobytes.
//
// Renderizando el HTML con html2canvas y metiéndolo en el PDF se usa la
// fuente que está mirando la persona, con sus tildes, y además el timbre y
// la firma salen exactamente como se ven en pantalla. El costo es que el
// texto del PDF no es seleccionable. Para un papel firmado eso no es una
// pérdida: nadie busca texto adentro de un acta firmada.
//
// LA ESPECIALIDAD DEL TRABAJADOR
//
// La decide una persona desde la ficha. NO se adivina del texto libre del
// cargo: adivinar significa que el primero que quede mal recibe la charla
// del oficio equivocado, que es peor que no recibir ninguna.

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
    if(firmaT!==firmaS){
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

// ============================================================
// LA BITÁCORA, PARA PODER LEERLA
