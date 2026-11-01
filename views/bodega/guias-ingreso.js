// Ingreso por guía, ajuste de stock y kits armables (migración 102). Prefijo gi / ga.
// Todo se escribe con RPC (registrar_guia, anular_guia, ajustar_stock); las tablas son de solo lectura.

const GI_MAX_ARCHIVO=10*1024*1024;
const GI_TIPOS_ARCHIVO=['application/pdf','image/jpeg','image/png','image/webp'];
const GI_TIPOS={guia_despacho:'Guía de despacho',factura:'Factura',otro:'Otro'};
let giCatalogo=null;          // [{codigo,nombre,requiere_talla,tipo_talla,activo}]
let giTallas=null;            // [{talla,tipo,orden}]
let giLineas=[];              // [{codigo,talla,cantidad,costo,justificacion}]
let giPendientes={};          // {codigo|talla: pendiente} del pedido elegido
let giGuiaId=null;            // se mantiene entre reintentos
let giArchivoSubido=null;     // ruta ya subida
let giGuardando=false;
let giGuias=[];
let giStockTab='saldos';
let giSaldosBodega=null;      // [{epp_codigo,talla,saldo}]

function giPuede(p){return pmPuede(p);}
function giPorCodigo(c){const u=String(c||'').trim().toUpperCase();return (giCatalogo||[]).find(a=>String(a.codigo).toUpperCase()===u)||null;}
function giCodigoDe(texto){
  const t=String(texto||'').trim();
  if(!t)return '';
  const cod=t.split(' — ')[0].trim();
  const a=giPorCodigo(cod)||(giCatalogo||[]).find(x=>String(x.nombre).toLowerCase()===t.toLowerCase());
  return a?a.codigo:'';
}
function giTallasDe(art){
  const todas=giTallas||[];
  const f=art&&art.tipo_talla?todas.filter(t=>t.tipo===art.tipo_talla):[];
  return (f.length?f:todas).map(t=>t.talla);
}

async function giCargarCatalogo(){
  if(giCatalogo&&giTallas)return;
  const [c,t]=await Promise.all([
    window.supabaseClient.from('epp_catalogo').select('*').order('nombre'),
    window.supabaseClient.from('epp_tallas').select('talla,tipo,orden').order('orden')
  ]);
  if(c.error)throw new Error('No se pudo leer el catálogo de artículos: '+c.error.message);
  if(t.error)throw new Error('No se pudieron leer las tallas: '+t.error.message);
  giCatalogo=(c.data||[]).filter(a=>a.activo!==false);
  giTallas=t.data||[];
  const dl=document.getElementById('giArticulos');
  if(dl)dl.innerHTML=giCatalogo.map(a=>'<option value="'+pmEsc(a.codigo+' — '+a.nombre)+'"></option>').join('');
}

// ---------- vista Ingreso por guía ----------
async function initBodegaGuias(sinRecargarBodegas){
  if(!document.getElementById('giLineas'))return;
  if(!sinRecargarBodegas)await pmCargarBodegas('giBodegaSel','giMsg');
  pmMsg('giMsg','');
  const puedeReg=giPuede('bodega.guias.registrar');
  const tabNueva=document.querySelector('#giTabs button[data-gi-tab="nueva"]');
  if(tabNueva)tabNueva.hidden=!puedeReg;
  try{
    await giCargarCatalogo();
  }catch(e){
    pmMsg('giMsg',e.message+'. Revisa tu conexión y vuelve a entrar a la vista.','error');
  }
  if(!document.getElementById('giFecha').value)document.getElementById('giFecha').value=new Date().toISOString().slice(0,10);
  await giCargarPedidos();
  giPestanaAbrir(puedeReg?'nueva':'lista');
  giPintarLineas();
}
function giPestanaAbrir(nombre){
  document.querySelectorAll('#giTabs button[data-gi-tab]').forEach(b=>{
    const on=b.dataset.giTab===nombre;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  document.querySelectorAll('[data-gi-pane]').forEach(p=>{p.hidden=p.dataset.giPane!==nombre;});
  if(nombre==='lista')giCargarGuias();
}

async function giCargarPedidos(){
  const sel=document.getElementById('giPedido');
  if(!sel)return;
  sel.innerHTML='<option value="">Sin pedido</option>';
  if(!pmBodegaId)return;
  try{
    const {data,error}=await window.supabaseClient.from('pedidos_materiales')
      .select('id,folio,proveedor,estado').eq('bodega_id',pmBodegaId).in('estado',['enviado','recibido_parcial']).order('folio',{ascending:false});
    if(error)throw new Error(error.message);
    sel.innerHTML='<option value="">Sin pedido</option>'+(data||[]).map(p=>'<option value="'+pmEsc(p.id)+'" data-prov="'+pmEsc(p.proveedor||'')+'">N° '+pmEsc(p.folio)+' — '+pmEsc(p.proveedor||'sin proveedor')+' ('+pmEsc(p.estado)+')</option>').join('');
  }catch(e){
    pmMsg('giFormMsg','No se pudieron leer los pedidos abiertos: '+e.message+'. Puedes registrar la guía sin pedido.','error');
  }
}
async function giElegirPedido(id){
  giPendientes={};
  if(!id){giPintarLineas();return;}
  try{
    const {data,error}=await window.supabaseClient.from('pedido_lineas')
      .select('epp_codigo,talla,cantidad_pedida,cantidad_recibida').eq('pedido_id',id);
    if(error)throw new Error(error.message);
    const pend=(data||[]).map(l=>({codigo:l.epp_codigo,talla:l.talla||'',pend:(l.cantidad_pedida||0)-(l.cantidad_recibida||0)})).filter(l=>l.pend>0);
    pend.forEach(l=>{giPendientes[l.codigo+'|'+l.talla]=l.pend;});
    const prov=document.querySelector('#giPedido option:checked');
    if(prov&&prov.dataset.prov&&!document.getElementById('giProv').value)document.getElementById('giProv').value=prov.dataset.prov;
    if(!pend.length){pmMsg('giFormMsg','Este pedido no tiene líneas pendientes de recibir.','error');return;}
    giLineas=pend.map(l=>({codigo:l.codigo,talla:l.talla,cantidad:l.pend,costo:'',justificacion:''}));
    [...new Set(giLineas.map(l=>l.codigo))].forEach(giAsegurarBloque);
    pmMsg('giFormMsg','Se precargaron '+pend.length+' líneas pendientes. Ajusta las cantidades a lo que realmente llegó.','ok');
    giPintarLineas();
  }catch(e){
    pmMsg('giFormMsg','No se pudieron leer las líneas del pedido: '+e.message+'. Agrega las líneas a mano.','error');
  }
}

function giArchivoElegido(){
  const f=document.getElementById('giArchivo').files[0];
  giArchivoSubido=null;
  if(!f){pmMsg('giArchMsg','');return;}
  if(GI_TIPOS_ARCHIVO.indexOf(f.type)<0){document.getElementById('giArchivo').value='';pmMsg('giArchMsg','Solo se aceptan PDF o fotos (JPG, PNG, WEBP).','error');return;}
  if(f.size>GI_MAX_ARCHIVO){document.getElementById('giArchivo').value='';pmMsg('giArchMsg','El archivo pesa más de 10 MB. Sácale la foto con menos resolución o comprime el PDF.','error');return;}
  pmMsg('giArchMsg',f.name+' ('+Math.round(f.size/1024)+' KB)','ok');
}

// ---------- líneas ----------
function giAgregarLinea(){giLineas.push({codigo:'',talla:'',cantidad:1,costo:'',justificacion:''});giPintarLineas();}
function giQuitarLinea(i){giLineas.splice(i,1);giPintarLineas();}
function giQuitarBloque(cod){giLineas=giLineas.filter(l=>l.codigo!==cod);giPintarLineas();}

// Los artículos con talla se muestran como un bloque (una cantidad por talla), pero
// giLineas sigue plano porque registrar_guia espera una línea por artículo y talla.
function giEsBloque(l){const a=giPorCodigo(l.codigo);return !!(a&&a.requiere_talla);}
// Una talla sin cantidad es "no llegó": no se valida ni se manda al RPC.
function giLineasActivas(){return giLineas.filter(l=>!giEsBloque(l)||Number(l.cantidad)>0);}
function giTotalUnidades(){return giLineasActivas().reduce((s,l)=>s+(Number(l.cantidad)||0),0);}
function giAsegurarBloque(cod){
  const art=giPorCodigo(cod);
  if(!art||!art.requiere_talla)return;
  giTallasDe(art).forEach(t=>{
    if(!giLineas.some(l=>l.codigo===art.codigo&&l.talla===t))giLineas.push({codigo:art.codigo,talla:t,cantidad:'',costo:'',justificacion:''});
  });
  // Un costo ya escrito en una talla vale para todo el bloque.
  const costo=(giLineas.find(l=>l.codigo===art.codigo&&l.costo!=='')||{}).costo;
  if(costo!==undefined)giLineas.forEach(l=>{if(l.codigo===art.codigo)l.costo=costo;});
}
function giEscanearLinea(code){
  const art=giPorCodigo(code);
  if(!art){pmMsg('giFormMsg','El código "'+code+'" no está en el catálogo. Agrégalo a mano o revisa el código.','error');return;}
  if(art.requiere_talla)giAsegurarBloque(art.codigo);
  else{
    const ex=giLineas.find(l=>l.codigo===art.codigo);
    if(ex)ex.cantidad=(Number(ex.cantidad)||0)+1;
    else giLineas.push({codigo:art.codigo,talla:'',cantidad:1,costo:'',justificacion:''});
  }
  pmMsg('giFormMsg','Agregado: '+art.nombre+(art.requiere_talla?' (escribe la cantidad de cada talla)':''),'ok');
  giPintarLineas();
}
function giActualizarTotales(){
  document.querySelectorAll('[data-gi-tot]').forEach(el=>{
    el.textContent=String(giLineas.filter(l=>l.codigo===el.dataset.giTot).reduce((s,l)=>s+(Number(l.cantidad)||0),0));
  });
  const t=document.getElementById('giTotalVivo');
  if(t)t.textContent=giTotalUnidades()+' unidades · '+giLineasActivas().length+' líneas';
}
function giCantidadTalla(el){
  const l=giLineas.find(x=>x.codigo===el.dataset.cod&&x.talla===el.dataset.talla);
  if(!l)return;
  l.cantidad=el.value===''?'':Number(el.value);
  giActualizarTotales();
}
// Al salir del campo se repinta solo si apareció o desapareció el pedido de justificación,
// para no quitarle el foco a quien va escribiendo la siguiente talla.
function giCantidadTallaListo(el){
  const l=giLineas.find(x=>x.codigo===el.dataset.cod&&x.talla===el.dataset.talla);
  if(!l)return;
  const pend=giPendientes[l.codigo+'|'+l.talla];
  const exceso=pend!=null&&Number(l.cantidad)>pend;
  if(exceso!==!!document.getElementById('giJ'+giLineas.indexOf(l)))giPintarLineas();
}
function giCostoBloque(el){
  giLineas.forEach(l=>{if(l.codigo===el.dataset.cod)l.costo=el.value;});
}
function giPintarLineas(){
  const caja=document.getElementById('giLineas');
  if(!caja)return;
  if(!giLineas.length){caja.innerHTML='<p class="pm-vacio">Aún no hay líneas. Usa "+ Agregar línea" o escanea el código del artículo.</p>';return;}
  const hechos={};
  const partes=giLineas.map((l,i)=>{
    const art=giPorCodigo(l.codigo);
    if(art&&art.requiere_talla){
      if(hechos[art.codigo])return '';
      hechos[art.codigo]=1;
      return giPintarBloque(art);
    }
    const pend=giPendientes[l.codigo+'|'+(l.talla||'')];
    const exceso=pend!=null&&Number(l.cantidad)>pend;
    return '<div class="gi-linea">'
      +'<div class="gi-c-art"><label>Artículo</label><input list="giArticulos" value="'+pmEsc(art?art.codigo+' — '+art.nombre:l.codigo)+'" autocomplete="off" onchange="giCambiarArticulo('+i+',this.value)"></div>'
      +'<div class="gi-c-talla"><label>Talla</label><input value="" disabled placeholder="No lleva"></div>'
      +'<div class="gi-c-cant"><label>Cantidad</label><input type="number" min="1" step="1" inputmode="numeric" value="'+pmEsc(l.cantidad)+'" onchange="giCampo('+i+',\'cantidad\',this.value,true)"></div>'
      +'<div class="gi-c-costo"><label>Costo unit. (opcional)</label><input type="number" min="0" step="1" inputmode="numeric" value="'+pmEsc(l.costo)+'" onchange="giCampo('+i+',\'costo\',this.value)"></div>'
      +'<div class="gi-c-quitar"><button class="btn secondary btn-compacto" type="button" aria-label="Quitar línea" onclick="giQuitarLinea('+i+')">Quitar</button></div>'
      +(exceso?'<div class="gi-c-just"><label>Llegó más de lo pedido (pendiente '+pend+'): justificación obligatoria</label><input value="'+pmEsc(l.justificacion)+'" maxlength="200" onchange="giCampo('+i+',\'justificacion\',this.value)"></div>':'')
      +'</div>';
  });
  caja.innerHTML='<p class="gi-total">Total de la guía: <b id="giTotalVivo"></b></p>'+partes.join('');
  giActualizarTotales();
}
function giPintarBloque(art){
  const ordenadas=giTallasDe(art);
  const propias=giLineas.map((l,i)=>({l,i})).filter(x=>x.l.codigo===art.codigo)
    .sort((a,b)=>{const p=ordenadas.indexOf(a.l.talla),q=ordenadas.indexOf(b.l.talla);return (p<0?999:p)-(q<0?999:q);});
  const costo=(propias.find(x=>x.l.costo!=='')||{l:{costo:''}}).l.costo;
  const filas=propias.map(({l,i})=>{
    const pend=giPendientes[l.codigo+'|'+l.talla];
    const exceso=pend!=null&&Number(l.cantidad)>pend;
    return '<div class="gi-talla"><label>Talla '+pmEsc(l.talla)+(pend!=null?' <small>(pend. '+pend+')</small>':'')+'</label>'
      +'<input type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="'+pmEsc(l.cantidad)+'" data-cod="'+pmEsc(l.codigo)+'" data-talla="'+pmEsc(l.talla)+'" oninput="giCantidadTalla(this)" onchange="giCantidadTallaListo(this)">'
      +(exceso?'<div class="gi-c-just" id="giJ'+i+'"><label>Más de lo pedido: justificación obligatoria</label><input value="'+pmEsc(l.justificacion)+'" maxlength="200" onchange="giCampo('+i+',\'justificacion\',this.value)"></div>':'')
      +'</div>';
  }).join('');
  return '<div class="gi-bloque"><div class="gi-bloque-cab">'
    +'<div class="gi-bloque-nom"><b>'+pmEsc(art.nombre)+'</b> <small>'+pmEsc(art.codigo)+'</small><span>Total del artículo: <b data-gi-tot="'+pmEsc(art.codigo)+'">0</b></span></div>'
    +'<div class="gi-c-costo"><label>Costo unit. (opcional, todas las tallas)</label><input type="number" min="0" step="1" inputmode="numeric" value="'+pmEsc(costo)+'" data-cod="'+pmEsc(art.codigo)+'" oninput="giCostoBloque(this)"></div>'
    +'<button class="btn secondary btn-compacto" type="button" aria-label="Quitar artículo" data-cod="'+pmEsc(art.codigo)+'" onclick="giQuitarBloque(this.dataset.cod)">Quitar</button>'
    +'</div><div class="gi-tallas">'+filas+'</div></div>';
}
function giCambiarArticulo(i,texto){
  const cod=giCodigoDe(texto);
  if(!cod&&texto)pmMsg('giFormMsg','"'+texto+'" no está en el catálogo. Elige una opción de la lista.','error');
  const art=giPorCodigo(cod);
  if(art&&art.requiere_talla){
    // La fila suelta se convierte en el bloque del artículo.
    giLineas.splice(i,1);
    giAsegurarBloque(cod);
  }else{
    giLineas[i].codigo=cod;
    giLineas[i].talla='';
  }
  giPintarLineas();
}
function giCampo(i,campo,valor,numero){
  giLineas[i][campo]=numero?(valor===''?'':Number(valor)):valor;
  if(campo==='cantidad')giPintarLineas();
}
function giLimpiar(){
  giLineas=[];giPendientes={};giGuiaId=null;giArchivoSubido=null;
  ['giProv','giNumero'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('giArchivo').value='';
  document.getElementById('giPedido').value='';
  pmMsg('giArchMsg','');pmMsg('giFormMsg','');
  const r=document.getElementById('giResumen');r.hidden=true;r.innerHTML='';
  giPintarLineas();
}

// ---------- validar, resumir y guardar ----------
function giValidar(){
  const prov=document.getElementById('giProv').value.trim();
  const num=document.getElementById('giNumero').value.trim();
  if(!pmBodegaId)return 'Elige una bodega arriba.';
  if(!prov)return 'Escribe el proveedor.';
  if(!num)return 'Escribe el N° del documento.';
  if(!document.getElementById('giFecha').value)return 'Elige la fecha del documento.';
  const activas=giLineasActivas();
  if(!activas.length)return giLineas.length?'Escribe la cantidad que llegó de al menos una talla.':'Agrega al menos una línea.';
  const vistos={};
  for(let i=0;i<activas.length;i++){
    const l=activas[i],n='Línea '+(i+1)+' ('+l.codigo+(l.talla?' talla '+l.talla:'')+'): ';
    const art=giPorCodigo(l.codigo);
    if(!art)return n+'elige un artículo de la lista.';
    if(art.requiere_talla&&!l.talla)return n+'el artículo '+art.nombre+' requiere talla.';
    if(!Number.isInteger(Number(l.cantidad))||Number(l.cantidad)<=0)return n+'la cantidad debe ser un entero mayor a cero.';
    if(vistos[l.codigo+'|'+l.talla])return n+'el artículo y la talla están repetidos; une las cantidades en una sola línea.';
    vistos[l.codigo+'|'+l.talla]=1;
    const pend=giPendientes[l.codigo+'|'+(l.talla||'')];
    if(pend!=null&&Number(l.cantidad)>pend&&String(l.justificacion||'').trim().length<5)return n+'llegó más de lo pedido; escribe la justificación.';
  }
  return '';
}
function giRevisar(){
  const err=giValidar();
  if(err){pmMsg('giFormMsg',err,'error');return;}
  const unidades=giTotalUnidades();
  const f=document.getElementById('giArchivo').files[0];
  const r=document.getElementById('giResumen');
  r.hidden=false;
  r.innerHTML='<h3>Confirma antes de registrar</h3>'
    +'<p><b>'+giLineasActivas().length+'</b> líneas · <b>'+unidades+'</b> unidades</p>'
    +'<p>'+pmEsc(GI_TIPOS[document.getElementById('giTipo').value])+' N° '+pmEsc(document.getElementById('giNumero').value.trim())+' · '+pmEsc(document.getElementById('giProv').value.trim())+' · '+pmEsc(document.getElementById('giFecha').value)+'</p>'
    +'<p>Adjunto: '+(f?pmEsc(f.name):'sin adjunto')+'</p>'
    +'<p><small>Al confirmar, el stock sube de inmediato. Si hay un error se corrige anulando la guía.</small></p>'
    +'<div class="pm-acciones"><button class="btn" id="giConfBtn" type="button" onclick="giGuardar(false)">Confirmar y registrar</button>'
    +'<button class="btn secondary" type="button" onclick="document.getElementById(\'giResumen\').hidden=true">Volver</button></div>';
  pmMsg('giFormMsg','');
}
function giNombreArchivo(n){return String(n||'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').slice(-80);}
async function giGuardar(sinAdjunto){
  if(giGuardando)return;
  const err=giValidar();
  if(err){pmMsg('giFormMsg',err,'error');return;}
  giGuardando=true;
  const bod=pmBodegas.find(b=>b.id===pmBodegaId);
  const f=document.getElementById('giArchivo').files[0];
  if(!giGuiaId)giGuiaId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():null;
  const r=document.getElementById('giResumen');
  try{
    let ruta=giArchivoSubido||null;
    if(f&&!sinAdjunto&&!ruta){
      pmMsg('giFormMsg','Subiendo el documento…');
      ruta=bod.empresa_id+'/'+giGuiaId+'/'+giNombreArchivo(f.name);
      const up=await window.supabaseClient.storage.from('guias-ingreso').upload(ruta,f,{contentType:f.type});
      if(up.error&&!/already exists|duplicate/i.test(up.error.message||'')){
        r.innerHTML+='<div class="pm-acciones"><button class="btn" type="button" onclick="giGuardar(false)">Reintentar subida</button><button class="btn secondary" type="button" onclick="giGuardar(true)">Guardar sin adjunto</button></div>';
        pmMsg('giFormMsg','No se pudo subir el documento: '+up.error.message+'. Lo digitado se conserva: reintenta o guarda sin adjunto.','error');
        return;
      }
      giArchivoSubido=ruta;
    }
    pmMsg('giFormMsg','Registrando la guía…');
    const lineas=giLineasActivas().map(l=>({epp_codigo:l.codigo,talla:l.talla||null,cantidad:Number(l.cantidad),
      costo_unitario:l.costo===''?null:Number(l.costo),justificacion:(l.justificacion||'').trim()||null}));
    const {data,error}=await window.supabaseClient.rpc('registrar_guia',{
      p_bodega:pmBodegaId,p_proveedor:document.getElementById('giProv').value.trim(),p_numero:document.getElementById('giNumero').value.trim(),
      p_tipo:document.getElementById('giTipo').value,p_fecha:document.getElementById('giFecha').value,p_lineas:lineas,
      p_archivo:sinAdjunto?null:ruta,p_pedido:document.getElementById('giPedido').value||null,p_guia_id:giGuiaId});
    if(error){
      const dup=error.code==='23505'||/ya fue cargada/i.test(error.message||'');
      pmMsg('giFormMsg',dup?'Esa guía ya fue cargada para este proveedor. Búscala en "Guías registradas"; no se duplicó el stock.':'No se registró la guía: '+error.message+'. Corrige y vuelve a intentar; lo digitado se conserva.','error');
      return;
    }
    const pe=data&&data.pedido_estado?' Pedido: '+data.pedido_estado+'.':'';
    giLimpiar();
    pmMsg('giFormMsg','Guía registrada ('+((data&&data.lineas)||'')+' líneas).'+pe,'ok');
    await giCargarPedidos();
  }catch(e){
    pmMsg('giFormMsg','Error inesperado: '+e.message+'. Revisa tu conexión y reintenta; lo digitado se conserva.','error');
  }finally{giGuardando=false;}
}

// ---------- listado, detalle, anulación ----------
async function giCargarGuias(){
  const caja=document.getElementById('giListBody');
  if(!caja||!pmBodegaId)return;
  pmMsg('giListMsg','Cargando…');
  try{
    let q=window.supabaseClient.from('guias_ingreso')
      .select('id,proveedor,numero,tipo,fecha_documento,archivo_path,pedido_id,estado,creado_en,motivo_anulacion').eq('bodega_id',pmBodegaId)
      .order('fecha_documento',{ascending:false}).order('creado_en',{ascending:false}).limit(200);
    const d=document.getElementById('giFDesde').value,h=document.getElementById('giFHasta').value;
    const p=document.getElementById('giFProv').value.trim().replace(/[%,()]/g,' '),e=document.getElementById('giFEstado').value;
    if(d)q=q.gte('fecha_documento',d);
    if(h)q=q.lte('fecha_documento',h);
    if(p)q=q.ilike('proveedor','%'+p+'%');
    if(e)q=q.eq('estado',e);
    const {data,error}=await q;
    if(error)throw new Error(error.message);
    giGuias=data||[];
    pmMsg('giListMsg',giGuias.length+' guías');
    caja.innerHTML=giGuias.length?'<div class="overflow"><table class="pm-tabla"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Documento</th><th>Estado</th><th></th></tr></thead><tbody>'
      +giGuias.map(g=>'<tr><td>'+pmFecha(g.fecha_documento+'T12:00:00')+'</td><td>'+pmEsc(g.proveedor)+'</td><td>'+pmEsc(GI_TIPOS[g.tipo]||g.tipo)+' '+pmEsc(g.numero)+'</td><td><span class="pm-badge '+(g.estado==='anulada'?'pm-critico':'pm-ok')+'">'+pmEsc(g.estado)+'</span></td>'
        +'<td><button class="btn secondary btn-compacto" type="button" onclick="giVerGuia(\''+pmEsc(g.id)+'\')">Ver detalle</button></td></tr>').join('')
      +'</tbody></table></div>':'<p class="pm-vacio">No hay guías con esos filtros.</p>';
  }catch(e){
    pmMsg('giListMsg','No se pudo leer el listado: '+e.message+'. Revisa tu conexión y que tengas permiso para ver guías.','error');
  }
}
async function giVerGuia(id){
  const g=giGuias.find(x=>x.id===id),box=document.getElementById('giDetalle');
  if(!g)return;
  box.hidden=false;box.innerHTML='Cargando…';
  try{
    const {data,error}=await window.supabaseClient.from('guia_lineas').select('epp_codigo,talla,cantidad,costo_unitario').eq('guia_id',id);
    if(error)throw new Error(error.message);
    const ls=data||[];
    await giCargarCatalogo().catch(()=>{});
    const nom=c=>{const a=giPorCodigo(c);return a?a.nombre:c;};
    box.innerHTML='<h3>'+pmEsc(GI_TIPOS[g.tipo]||g.tipo)+' N° '+pmEsc(g.numero)+' — '+pmEsc(g.proveedor)+'</h3>'
      +'<p>Estado: <b>'+pmEsc(g.estado)+'</b>'+(g.motivo_anulacion?' · Motivo de anulación: '+pmEsc(g.motivo_anulacion):'')+'</p>'
      +'<div class="overflow"><table class="pm-tabla"><thead><tr><th>Artículo</th><th>Talla</th><th>Cantidad</th><th>Costo unit.</th></tr></thead><tbody>'
      +ls.map(l=>'<tr><td>'+pmEsc(nom(l.epp_codigo))+' <small>('+pmEsc(l.epp_codigo)+')</small></td><td>'+pmEsc(l.talla||'—')+'</td><td class="pm-num">'+l.cantidad+'</td><td class="pm-num">'+(l.costo_unitario==null?'—':l.costo_unitario)+'</td></tr>').join('')
      +'</tbody></table></div><small id="giDetMsg" role="status"></small><div class="pm-acciones">'
      +(g.archivo_path?'<button class="btn secondary" type="button" onclick="giDescargarAdjunto(\''+pmEsc(g.id)+'\')">Descargar adjunto</button>':'<small>Sin adjunto.</small>')
      +(g.estado==='registrada'&&giPuede('bodega.guias.anular')?'<button class="btn danger" type="button" onclick="giAnular(\''+pmEsc(g.id)+'\')">Anular guía</button>':'')
      +'<button class="btn secondary" type="button" onclick="document.getElementById(\'giDetalle\').hidden=true">Cerrar</button></div>';
  }catch(e){
    box.innerHTML='<small class="gi-error">No se pudo leer el detalle: '+pmEsc(e.message)+'. Reintenta.</small>';
  }
}
async function giDescargarAdjunto(id){
  const g=giGuias.find(x=>x.id===id);
  try{
    const {data,error}=await window.supabaseClient.storage.from('guias-ingreso').createSignedUrl(g.archivo_path,60);
    if(error)throw new Error(error.message);
    window.open(data.signedUrl,'_blank','noopener');
  }catch(e){
    pmMsg('giDetMsg','No se pudo abrir el adjunto: '+e.message+'. Revisa que las políticas de Storage del bucket guias-ingreso estén creadas.','error');
  }
}
async function giAnular(id){
  const motivo=(window.prompt('Motivo de la anulación (obligatorio, revierte el stock ingresado):')||'').trim();
  if(motivo.length<5){pmMsg('giDetMsg','Escribe un motivo de al menos 5 caracteres.','error');return;}
  try{
    const {error}=await window.supabaseClient.rpc('anular_guia',{p_guia:id,p_motivo:motivo});
    if(error)throw new Error(error.message);
    pmMsg('giDetMsg','Guía anulada y stock revertido.','ok');
    await giCargarGuias();
    await giVerGuia(id);
  }catch(e){
    pmMsg('giDetMsg','No se anuló: '+e.message+'. Si dice que el stock quedaría negativo, parte de la mercadería ya se entregó.','error');
  }
}

// ---------- pestañas de Stock: ajustar y kits ----------
function giStockPestana(nombre){
  giStockTab=nombre;
  document.querySelectorAll('#stTabs button[data-st-tab]').forEach(b=>{
    const on=b.dataset.stTab===nombre;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  document.querySelectorAll('[data-st-pane]').forEach(p=>{p.hidden=p.dataset.stPane!==nombre;});
  if(nombre==='kits')giCargarKits();
}
async function giStockRefrescar(){
  const tab=document.querySelector('#stTabs button[data-st-tab="ajustar"]');
  if(tab)tab.hidden=!giPuede('bodega.stock.ajustar');
  if(giStockTab==='ajustar'&&tab&&tab.hidden)giStockTab='saldos';
  giSaldosBodega=null;
  try{await giCargarCatalogo();}catch(e){pmMsg('stMsg',e.message,'error');}
  giStockPestana(giStockTab);
  gaElegirArticulo();
}
async function giLeerSaldos(){
  if(giSaldosBodega)return giSaldosBodega;
  const {data,error}=await window.supabaseClient.from('stock_saldos').select('epp_codigo,talla,saldo').eq('bodega_id',pmBodegaId);
  if(error)throw new Error('No se pudo leer el saldo: '+error.message);
  giSaldosBodega=data||[];
  return giSaldosBodega;
}
function gaElegirArticulo(){
  const sel=document.getElementById('gaTalla');
  if(!sel)return;
  const art=giPorCodigo(giCodigoDe(document.getElementById('gaArt').value));
  sel.innerHTML=art&&art.requiere_talla?'<option value="">Elegir</option>'+giTallasDe(art).map(t=>'<option>'+pmEsc(t)+'</option>').join(''):'<option value="">No lleva talla</option>';
  sel.disabled=!(art&&art.requiere_talla);
  gaMostrarSaldo();
}
async function gaMostrarSaldo(){
  const out=document.getElementById('gaSaldo');
  const art=giPorCodigo(giCodigoDe(document.getElementById('gaArt').value));
  if(!art||!pmBodegaId){out.textContent='—';return;}
  const talla=art.requiere_talla?document.getElementById('gaTalla').value:'';
  if(art.requiere_talla&&!talla){out.textContent='Elige la talla';return;}
  try{
    const s=(await giLeerSaldos()).find(f=>f.epp_codigo===art.codigo&&(f.talla||'')===talla);
    out.textContent=String(s?s.saldo:0);
  }catch(e){out.textContent='—';pmMsg('gaMsg',e.message+'. Reintenta.','error');}
}
function gaCambiarModo(){
  document.getElementById('gaCantEt').textContent=document.getElementById('gaModo').value==='nueva'?'Cantidad nueva':'Diferencia (+ suma, − resta)';
}
async function gaGuardar(){
  const art=giPorCodigo(giCodigoDe(document.getElementById('gaArt').value));
  const talla=art&&art.requiere_talla?document.getElementById('gaTalla').value:'';
  const motivo=document.getElementById('gaMotivo').value.trim();
  const modo=document.getElementById('gaModo').value;
  const raw=document.getElementById('gaCant').value;
  if(!art)return pmMsg('gaMsg','Elige un artículo de la lista.','error');
  if(art.requiere_talla&&!talla)return pmMsg('gaMsg','Elige la talla.','error');
  if(raw===''||!Number.isInteger(Number(raw)))return pmMsg('gaMsg','Indica una cantidad entera.','error');
  if(modo==='nueva'&&Number(raw)<0)return pmMsg('gaMsg','El saldo nuevo no puede ser negativo.','error');
  if(motivo.length<5)return pmMsg('gaMsg','Escribe el motivo (mínimo 5 caracteres).','error');
  if(!window.confirm('Se ajustará el stock de '+art.nombre+(talla?' talla '+talla:'')+'. ¿Confirmas?'))return;
  const btn=document.getElementById('gaBtn');btn.disabled=true;
  try{
    const {data,error}=await window.supabaseClient.rpc('ajustar_stock',{p_bodega:pmBodegaId,p_epp_codigo:art.codigo,p_talla:talla||null,p_motivo:motivo,
      p_nueva_cantidad:modo==='nueva'?Number(raw):null,p_diferencia:modo==='dif'?Number(raw):null});
    if(error)throw new Error(error.message);
    pmMsg('gaMsg','Ajuste registrado: saldo '+data.saldo_anterior+' → '+data.saldo_nuevo+'.','ok');
    document.getElementById('gaCant').value='';document.getElementById('gaMotivo').value='';
    giSaldosBodega=null;
    await gaMostrarSaldo();
  }catch(e){
    pmMsg('gaMsg','No se ajustó: '+e.message+'. Revisa que tengas el permiso de ajuste y que la cantidad cambie el saldo.','error');
  }finally{btn.disabled=false;}
}

async function giCargarKits(){
  const caja=document.getElementById('stKitsBody');
  if(!caja||!pmBodegaId)return;
  pmMsg('stKitsMsg','Calculando…');
  try{
    await giCargarCatalogo();
    const [k,it,esp,sal]=await Promise.all([
      window.supabaseClient.from('epp_kits').select('id,especialidad_id,nombre,activo').order('nombre'),
      window.supabaseClient.from('epp_kit_items').select('kit_id,epp_codigo,cantidad'),
      window.supabaseClient.from('epp_especialidades').select('*'),
      giLeerSaldos()
    ]);
    if(k.error)throw new Error('No se pudieron leer los kits: '+k.error.message);
    if(it.error)throw new Error('No se pudieron leer los componentes: '+it.error.message);
    const nEsp={};(esp.data||[]).forEach(e=>{nEsp[e.id]=e.nombre;});
    const total={};sal.forEach(f=>{total[f.epp_codigo]=(total[f.epp_codigo]||0)+(f.saldo||0);});
    const kits=(k.data||[]).filter(x=>x.activo!==false);
    const filas=kits.map(kit=>{
      const comps=(it.data||[]).filter(c=>c.kit_id===kit.id&&c.cantidad>0);
      let min=null,lim=null;
      comps.forEach(c=>{
        const n=Math.floor(Math.max(total[c.epp_codigo]||0,0)/c.cantidad);
        if(min===null||n<min){min=n;lim=c;}
      });
      return {kit,min,lim,vacio:!comps.length};
    });
    pmMsg('stKitsMsg',filas.length+' kits');
    const nom=c=>{const a=giPorCodigo(c);return a?a.nombre:c;};
    caja.innerHTML=filas.length?'<div class="overflow"><table class="pm-tabla"><thead><tr><th>Kit</th><th>Especialidad</th><th>Se pueden armar</th><th>Componente que limita</th></tr></thead><tbody>'
      +filas.map(f=>'<tr><td>'+pmEsc(f.kit.nombre)+'</td><td>'+pmEsc(nEsp[f.kit.especialidad_id]||'—')+'</td>'
        +(f.vacio?'<td class="pm-num">—</td><td>El kit no tiene componentes</td>'
          :'<td class="pm-num"><span class="pm-badge '+(f.min===0?'pm-critico':'pm-ok')+'">'+f.min+'</span></td><td>'+pmEsc(nom(f.lim.epp_codigo))+' <small>(saldo '+(total[f.lim.epp_codigo]||0)+', usa '+f.lim.cantidad+' por kit)</small></td>')+'</tr>').join('')
      +'</tbody></table></div>':'<p class="pm-vacio">No hay kits activos definidos.</p>';
  }catch(e){
    pmMsg('stKitsMsg','No se pudo calcular: '+e.message+'. Revisa tu conexión y vuelve a abrir la pestaña.','error');
  }
}
