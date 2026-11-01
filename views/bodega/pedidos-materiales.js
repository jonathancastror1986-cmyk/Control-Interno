// PEDIDOS DE MATERIALES y STOCK DE BODEGA
// ========================================
// Usa lo que dejan las migraciones 100 y 101: la vista stock_saldos, las tablas
// stock_minimos, pedidos_materiales y pedido_lineas (se leen con RLS) y las
// funciones sugerir_pedido, crear_pedido, enviar_pedido, anular_pedido y
// recibir_pedido (todo lo que escribe pasa por ellas, nunca por insert directo).
// Todos los nombres de este archivo llevan el prefijo "pm" porque los scripts
// comparten el ámbito global.

let pmBodegas=[];
let pmBodegaId='';
let pmNombresEpp=null;       // {codigo: nombre}
let pmSugerencia=[];
let pmPedidos=[];
let pmPedidoAbierto=null;    // {pedido, lineas}
let pmPestana='sugerencia';
const PM_ESTADOS={borrador:'Borrador',enviado:'Enviado',recibido_parcial:'Recibido parcial',recibido:'Recibido',anulado:'Anulado'};
const PM_FALTANTES_CLAVE='pm_faltantes_v1';

function pmEsc(t){return (typeof escHtml==='function')?escHtml(String(t==null?'':t)):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function pmMsg(id,texto,tipo){
  const el=document.getElementById(id);
  if(!el)return;
  el.textContent=texto||'';
  el.style.color=tipo==='error'?'var(--danger)':tipo==='ok'?'var(--accent)':'var(--muted)';
}
function pmNombreEpp(codigo){return (pmNombresEpp&&pmNombresEpp[codigo])||codigo;}
function pmNombreEmpresa(id){
  const e=(typeof empresas!=='undefined'&&Array.isArray(empresas))?empresas.find(x=>String(x.id)===String(id)):null;
  return e?e.nombre:('Empresa '+id);
}
function pmFecha(iso){
  if(!iso)return '';
  const d=new Date(iso);
  return isNaN(d)?String(iso):d.toLocaleDateString('es-CL');
}

// ---------- datos comunes ----------
async function pmCargarCatalogo(){
  if(pmNombresEpp)return;
  const {data,error}=await window.supabaseClient.from('epp_catalogo').select('codigo,nombre');
  if(error)throw new Error('No se pudo leer el catálogo de EPP: '+error.message);
  pmNombresEpp={};
  (data||[]).forEach(f=>{pmNombresEpp[f.codigo]=f.nombre;});
}
async function pmCargarBodegas(selId,msgId){
  const sel=document.getElementById(selId);
  try{
    const {data,error}=await window.supabaseClient.from('bodegas')
      .select('id,empresa_id,nombre,es_defecto,activa,descuenta_stock').eq('activa',true).order('nombre');
    if(error)throw new Error(error.message);
    pmBodegas=data||[];
  }catch(e){
    pmBodegas=[];
    pmMsg(msgId,'No se pudieron leer las bodegas: '+e.message+'. Revisa que la migración 100 esté aplicada y que tengas permiso de bodega.','error');
  }
  if(pmBodegas.length&&!pmBodegas.some(b=>b.id===pmBodegaId)){
    pmBodegaId=(pmBodegas.find(b=>b.es_defecto)||pmBodegas[0]).id;
  }
  if(!sel)return;
  if(!pmBodegas.length){
    sel.innerHTML='<option value="">Sin bodegas</option>';
    pmBodegaId='';
    if(!document.getElementById(msgId)||!document.getElementById(msgId).textContent)
      pmMsg(msgId,'No hay bodegas activas para tu empresa. Pide a un administrador que aplique la migración 100.','error');
    return;
  }
  if(!pmBodegas.some(b=>b.id===pmBodegaId)){
    const def=pmBodegas.find(b=>b.es_defecto)||pmBodegas[0];
    pmBodegaId=def.id;
  }
  sel.innerHTML=pmBodegas.map(b=>'<option value="'+pmEsc(b.id)+'">'+pmEsc(b.nombre+' — '+pmNombreEmpresa(b.empresa_id))+'</option>').join('');
  sel.value=pmBodegaId;
}
function pmCambiarBodega(valor,donde){
  pmBodegaId=valor;
  if(donde==='stock')initBodegaStock(true);
  else if(donde==='guias')initBodegaGuias(true);
  else initBodegaPedidos(true);
}
function pmPuede(permiso){return (typeof puede==='function')?puede(permiso):true;}

// ---------- STOCK: panel de críticos y bajo mínimo ----------
async function pmCalcularStock(bodegaId){
  const [sal,min]=await Promise.all([
    window.supabaseClient.from('stock_saldos').select('epp_codigo,talla,saldo').eq('bodega_id',bodegaId),
    window.supabaseClient.from('stock_minimos').select('epp_codigo,talla,minimo,critico,objetivo').eq('bodega_id',bodegaId)
  ]);
  if(sal.error)throw new Error('No se pudo leer el saldo: '+sal.error.message);
  if(min.error)throw new Error('No se pudieron leer los mínimos: '+min.error.message);
  const clave=(c,t)=>c+'|'+(t||'');
  const filas={};
  (sal.data||[]).forEach(f=>{filas[clave(f.epp_codigo,f.talla)]={codigo:f.epp_codigo,talla:f.talla||'',saldo:f.saldo||0,minimo:null,critico:null,objetivo:null};});
  (min.data||[]).forEach(f=>{
    const k=clave(f.epp_codigo,f.talla);
    if(!filas[k])filas[k]={codigo:f.epp_codigo,talla:f.talla||'',saldo:0};
    Object.assign(filas[k],{minimo:f.minimo,critico:f.critico,objetivo:f.objetivo});
  });
  const lista=Object.values(filas).map(f=>{
    let estado='ok';
    if(f.critico!=null&&f.saldo<=f.critico)estado='critico';
    else if(f.minimo!=null&&f.saldo<=f.minimo)estado='bajo';
    return Object.assign(f,{estado});
  });
  return lista.sort((a,b)=>(a.estado===b.estado?0:a.estado==='critico'?-1:b.estado==='critico'?1:a.estado==='bajo'?-1:b.estado==='bajo'?1:0)||a.codigo.localeCompare(b.codigo));
}
async function initBodegaStock(sinRecargarBodegas){
  const caja=document.getElementById('stBody');
  if(!caja)return;
  if(!sinRecargarBodegas)await pmCargarBodegas('stBodegaSel','stMsg');
  pmMsg('stMsg','');
  caja.innerHTML='';
  if(!pmBodegaId)return;
  try{
    await pmCargarCatalogo();
    const lista=await pmCalcularStock(pmBodegaId);
    const crit=lista.filter(f=>f.estado==='critico').length;
    const bajo=lista.filter(f=>f.estado==='bajo').length;
    const etiqueta={critico:'Crítico',bajo:'Bajo mínimo',ok:'Normal'};
    caja.innerHTML=
      '<div class="pm-panel" role="status">'
      +'<div class="pm-cont pm-cont-crit"><b>'+crit+'</b><span>Críticos</span></div>'
      +'<div class="pm-cont pm-cont-bajo"><b>'+bajo+'</b><span>Bajo mínimo</span></div>'
      +'<div class="pm-panel-link">'+(pmPuede('bodega.pedidos.ver')
        ?'<a href="#" onclick="pmIrASugerencia();return false">Ver sugerencia de pedido →</a>':'')+'</div></div>'
      +(lista.length?'<div class="overflow"><table class="pm-tabla"><thead><tr><th>Artículo</th><th>Talla</th><th>Saldo</th><th>Mínimo</th><th>Crítico</th><th>Estado</th></tr></thead><tbody>'
        +lista.map(f=>'<tr><td>'+pmEsc(pmNombreEpp(f.codigo))+' <small>('+pmEsc(f.codigo)+')</small></td><td>'+pmEsc(f.talla||'—')+'</td><td class="pm-num">'+f.saldo+'</td><td class="pm-num">'
          +(f.minimo==null?'—':f.minimo)+'</td><td class="pm-num">'+(f.critico==null?'—':f.critico)+'</td><td><span class="pm-badge pm-'+f.estado+'">'+etiqueta[f.estado]+'</span></td></tr>').join('')
        +'</tbody></table></div>'
        :'<p class="pm-vacio">Esta bodega no tiene movimientos ni mínimos todavía. Carga el stock inicial y los mínimos para ver el estado.</p>');
  }catch(e){
    pmMsg('stMsg','No se pudo leer el stock: '+e.message+'. Revisa tu conexión y que la migración 100 esté aplicada.','error');
  }
  if(typeof giStockRefrescar==='function')giStockRefrescar();
}
function pmIrASugerencia(){
  if(typeof showView==='function')showView('bodega-pedidos');
  pmPestanaAbrir('sugerencia');
}

// ---------- PEDIDOS: pestañas ----------
function pmPestanaAbrir(nombre){
  pmPestana=nombre;
  document.querySelectorAll('#pmTabs button[data-pm-tab]').forEach(b=>{
    const on=b.dataset.pmTab===nombre;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  document.querySelectorAll('#v-bodega-pedidos .pm-pane').forEach(p=>{p.hidden=p.dataset.pmPane!==nombre;});
  if(nombre==='sugerencia')pmCargarSugerencia();
  if(nombre==='pedidos')pmCargarPedidos();
  if(nombre==='recibir')pmPrepararRecibir();
}
async function initBodegaPedidos(sinRecargarBodegas){
  if(!document.getElementById('pmTabs'))return;
  if(!sinRecargarBodegas)await pmCargarBodegas('pmBodegaSel','pmMsg');
  pmMsg('pmMsg','');
  pmRenderFaltantes();
  if(pmBodegaId)pmPestanaAbrir(pmPestana);
}

// ---------- Sugerencia ----------
async function pmCargarSugerencia(){
  const caja=document.getElementById('pmSugBody');
  if(!caja)return;
  caja.innerHTML='';
  pmMsg('pmSugMsg','Calculando…');
  try{
    await pmCargarCatalogo();
    const {data,error}=await window.supabaseClient.rpc('sugerir_pedido',{p_bodega:pmBodegaId});
    if(error)throw new Error(error.message);
    pmSugerencia=data||[];
    pmMsg('pmSugMsg','');
    if(!pmSugerencia.length){
      caja.innerHTML='<p class="pm-vacio">No hay artículos bajo el mínimo con cantidad por pedir. Si esperabas ver algo, revisa que estén cargados los mínimos y los objetivos de la bodega.</p>';
      return;
    }
    caja.innerHTML='<div class="overflow"><table class="pm-tabla"><thead><tr><th>Artículo</th><th>Talla</th><th>Saldo</th><th>Mínimo</th><th>Objetivo</th><th>En camino</th><th>Sugerida</th><th>Pedir</th></tr></thead><tbody>'
      +pmSugerencia.map((f,i)=>'<tr><td>'+pmEsc(pmNombreEpp(f.epp_codigo))+' <small>('+pmEsc(f.epp_codigo)+')</small></td><td>'+pmEsc(f.talla||'—')+'</td>'
        +'<td class="pm-num">'+f.saldo+'</td><td class="pm-num">'+f.minimo+'</td><td class="pm-num">'+(f.objetivo==null?'—':f.objetivo)+'</td><td class="pm-num">'+f.pendiente+'</td><td class="pm-num">'+f.sugerida+'</td>'
        +'<td><input type="number" min="0" step="1" value="'+f.sugerida+'" id="pmSugQty'+i+'" aria-label="Cantidad a pedir de '+pmEsc(f.epp_codigo)+'"></td></tr>').join('')
      +'</tbody></table></div>';
  }catch(e){
    pmMsg('pmSugMsg','No se pudo calcular la sugerencia: '+e.message+(/permiso/i.test(e.message)?'':'. Revisa que la migración 101 esté aplicada y vuelve a intentar.'),'error');
  }
}
async function pmCrearPedidoSugerido(){
  if(!pmPuede('bodega.pedidos.crear')){pmMsg('pmSugMsg','No tienes permiso para crear pedidos. Pide el permiso bodega.pedidos.crear a un administrador.','error');return;}
  const lineas=[];
  pmSugerencia.forEach((f,i)=>{
    const c=parseInt((document.getElementById('pmSugQty'+i)||{}).value,10);
    if(c>0)lineas.push({epp_codigo:f.epp_codigo,talla:f.talla||null,cantidad:c,costo_estimado:f.costo_estimado==null?null:f.costo_estimado});
  });
  if(!lineas.length){pmMsg('pmSugMsg','Pon una cantidad mayor que cero en al menos una línea.','error');return;}
  const proveedor=(document.getElementById('pmSugProv').value||'').trim()||null;
  const notas=(document.getElementById('pmSugNotas').value||'').trim()||null;
  const btn=document.getElementById('pmSugBtn');
  btn.disabled=true;
  try{
    const {data,error}=await window.supabaseClient.rpc('crear_pedido',{p_bodega:pmBodegaId,p_proveedor:proveedor,p_notas:notas,p_lineas:lineas});
    if(error)throw new Error(error.message);
    pmMsg('pmSugMsg','Pedido creado en borrador. Ábrelo en la pestaña "Pedidos" para enviarlo.','ok');
    await pmCargarSugerencia();
    pmPedidoAbierto=null;
    pmIdPorAbrir=data;
    pmPestanaAbrir('pedidos');
  }catch(e){
    pmMsg('pmSugMsg','No se pudo crear el pedido: '+e.message,'error');
  }finally{btn.disabled=false;}
}
let pmIdPorAbrir=null;

// ---------- Faltantes anotados desde las pantallas de entrega ----------
// No existe una función que agregue líneas a un borrador ya creado, y las tablas
// no se escriben directo. Por eso los faltantes se anotan aquí (en este
// navegador) y se convierten en UN pedido borrador nuevo con crear_pedido.
function pmLeerFaltantes(){
  try{
    const t=window.localStorage.getItem(PM_FALTANTES_CLAVE);
    const o=t?JSON.parse(t):{};
    return (o&&typeof o==='object')?o:{};
  }catch(e){return {};}
}
function pmGuardarFaltantes(o){
  try{window.localStorage.setItem(PM_FALTANTES_CLAVE,JSON.stringify(o));return true;}catch(e){return false;}
}
function pmAnotarFaltante(bodegaId,codigo,talla,cantidad){
  const o=pmLeerFaltantes();
  const lista=o[bodegaId]||[];
  const f=lista.find(x=>x.epp_codigo===codigo&&(x.talla||'')===(talla||''));
  if(f)f.cantidad=Math.max(f.cantidad,cantidad);
  else lista.push({epp_codigo:codigo,talla:talla||null,cantidad});
  o[bodegaId]=lista;
  return pmGuardarFaltantes(o);
}
function pmRenderFaltantes(){
  const caja=document.getElementById('pmFaltBox');
  if(!caja)return;
  const lista=(pmLeerFaltantes()[pmBodegaId])||[];
  if(!lista.length){caja.hidden=true;caja.innerHTML='';return;}
  caja.hidden=false;
  caja.innerHTML='<b>Faltantes anotados desde las entregas</b> ('+lista.length+')'
    +'<ul>'+lista.map(f=>'<li>'+pmEsc(pmNombreEpp(f.epp_codigo))+(f.talla?' talla '+pmEsc(f.talla):'')+': '+f.cantidad+'</li>').join('')+'</ul>'
    +'<button class="btn btn-compacto" type="button" onclick="pmCrearPedidoDeFaltantes()">Crear pedido con estos faltantes</button> '
    +'<button class="btn secondary btn-compacto" type="button" onclick="pmDescartarFaltantes()">Descartar</button>';
}
function pmDescartarFaltantes(){
  const o=pmLeerFaltantes();
  delete o[pmBodegaId];
  pmGuardarFaltantes(o);
  pmRenderFaltantes();
}
async function pmCrearPedidoDeFaltantes(){
  if(!pmPuede('bodega.pedidos.crear')){pmMsg('pmMsg','No tienes permiso para crear pedidos. Pide el permiso bodega.pedidos.crear a un administrador.','error');return;}
  const lista=(pmLeerFaltantes()[pmBodegaId])||[];
  if(!lista.length)return;
  try{
    const {data,error}=await window.supabaseClient.rpc('crear_pedido',{
      p_bodega:pmBodegaId,p_proveedor:null,p_notas:'Faltantes anotados desde las entregas',
      p_lineas:lista.map(f=>({epp_codigo:f.epp_codigo,talla:f.talla,cantidad:f.cantidad,costo_estimado:null}))});
    if(error)throw new Error(error.message);
    pmDescartarFaltantes();
    pmIdPorAbrir=data;
    pmMsg('pmMsg','Pedido creado en borrador con los faltantes.','ok');
    pmPestanaAbrir('pedidos');
  }catch(e){
    pmMsg('pmMsg','No se pudo crear el pedido: '+e.message+'. Los faltantes siguen anotados; vuelve a intentar.','error');
  }
}

// Lo llaman las pantallas de entrega cuando la base rechaza por falta de stock.
// Devuelve el HTML del botón, o '' si el error no es de stock.
function pmBotonFaltante(mensajeError){
  const m=/Stock insuficiente de (\S+) talla (.+?): hay (-?\d+), se piden (\d+)/.exec(String(mensajeError||''));
  if(!m)return '';
  const talla=m[2]==='(sin talla)'?'':m[2];
  const falta=Math.max(1,parseInt(m[4],10)-Math.max(0,parseInt(m[3],10)));
  return ' <button type="button" class="btn secondary btn-compacto" onclick="pmAgregarFaltanteDesdeEntrega(this,\''
    +encodeURIComponent(m[1])+'\',\''+encodeURIComponent(talla)+'\','+falta+')">Agregar al pedido</button>';
}
async function pmAgregarFaltanteDesdeEntrega(btn,codigoEnc,tallaEnc,falta){
  btn.disabled=true;
  try{
    if(!pmBodegas.length||!pmBodegaId)await pmCargarBodegas('','');
    const bodega=pmBodegas.find(b=>b.id===pmBodegaId)||pmBodegas.find(b=>b.es_defecto)||pmBodegas[0];
    if(!bodega)throw new Error('No hay una bodega activa para tu empresa');
    if(!pmAnotarFaltante(bodega.id,decodeURIComponent(codigoEnc),decodeURIComponent(tallaEnc),falta))
      throw new Error('el navegador no permite guardar la anotación');
    btn.textContent='Anotado ✓ (ver en Pedidos)';
  }catch(e){
    btn.disabled=false;
    alert('No se pudo anotar el faltante: '+e.message);
  }
}

// ---------- Lista de pedidos ----------
async function pmCargarPedidos(){
  const caja=document.getElementById('pmListBody');
  if(!caja)return;
  pmMsg('pmListMsg','Cargando…');
  try{
    let q=window.supabaseClient.from('pedidos_materiales')
      .select('id,empresa_id,bodega_id,folio,estado,proveedor,notas,creado_en,motivo_anulacion')
      .eq('bodega_id',pmBodegaId).order('folio',{ascending:false}).limit(300);
    const est=document.getElementById('pmFEstado').value;
    if(est)q=q.eq('estado',est);
    const {data,error}=await q;
    if(error)throw new Error(error.message);
    const desde=document.getElementById('pmFDesde').value;
    const hasta=document.getElementById('pmFHasta').value;
    const prov=(document.getElementById('pmFProv').value||'').trim().toLowerCase();
    pmPedidos=(data||[]).filter(p=>{
      const f=String(p.creado_en||'').slice(0,10);
      if(desde&&f<desde)return false;
      if(hasta&&f>hasta)return false;
      if(prov&&!String(p.proveedor||'').toLowerCase().includes(prov))return false;
      return true;
    });
    pmMsg('pmListMsg',pmPedidos.length?'':'No hay pedidos con esos filtros.');
    caja.innerHTML=pmPedidos.length?'<div class="overflow"><table class="pm-tabla"><thead><tr><th>Folio</th><th>Fecha</th><th>Proveedor</th><th>Estado</th><th></th></tr></thead><tbody>'
      +pmPedidos.map(p=>'<tr><td class="pm-num">'+p.folio+'</td><td>'+pmFecha(p.creado_en)+'</td><td>'+pmEsc(p.proveedor||'—')+'</td>'
        +'<td><span class="pm-badge pm-e-'+pmEsc(p.estado)+'">'+pmEsc(PM_ESTADOS[p.estado]||p.estado)+'</span></td>'
        +'<td><button class="btn secondary btn-compacto" type="button" onclick="pmAbrirPedido(\''+pmEsc(p.id)+'\')">Abrir</button></td></tr>').join('')
      +'</tbody></table></div>':'';
    if(pmIdPorAbrir){const id=pmIdPorAbrir;pmIdPorAbrir=null;await pmAbrirPedido(id);}
  }catch(e){
    caja.innerHTML='';
    pmMsg('pmListMsg','No se pudo leer la lista de pedidos: '+e.message+'. Revisa que la migración 101 esté aplicada y vuelve a intentar.','error');
  }
}
async function pmAbrirPedido(id){
  const caja=document.getElementById('pmDetalle');
  try{
    await pmCargarCatalogo();
    const [ped,lin]=await Promise.all([
      window.supabaseClient.from('pedidos_materiales').select('id,empresa_id,bodega_id,folio,estado,proveedor,notas,creado_en,motivo_anulacion').eq('id',id).single(),
      window.supabaseClient.from('pedido_lineas').select('id,epp_codigo,talla,cantidad_pedida,cantidad_recibida,costo_estimado').eq('pedido_id',id).order('epp_codigo')
    ]);
    if(ped.error)throw new Error(ped.error.message);
    if(lin.error)throw new Error(lin.error.message);
    pmPedidoAbierto={pedido:ped.data,lineas:lin.data||[]};
    pmRenderDetalle();
    caja.scrollIntoView({block:'nearest'});
  }catch(e){
    pmMsg('pmListMsg','No se pudo abrir el pedido: '+e.message,'error');
  }
}
function pmRenderDetalle(){
  const caja=document.getElementById('pmDetalle');
  if(!pmPedidoAbierto){caja.hidden=true;caja.innerHTML='';return;}
  const p=pmPedidoAbierto.pedido,ls=pmPedidoAbierto.lineas;
  const borr=p.estado==='borrador',env=p.estado==='enviado',parc=p.estado==='recibido_parcial';
  caja.hidden=false;
  caja.innerHTML='<h3>Pedido N° '+p.folio+' <span class="pm-badge pm-e-'+pmEsc(p.estado)+'">'+pmEsc(PM_ESTADOS[p.estado]||p.estado)+'</span></h3>'
    +'<p class="pm-meta">'+pmEsc(pmNombreEmpresa(p.empresa_id))+' · '+pmFecha(p.creado_en)+' · Proveedor: '+pmEsc(p.proveedor||'—')
    +(p.notas?' · '+pmEsc(p.notas):'')+(p.motivo_anulacion?' · Anulado: '+pmEsc(p.motivo_anulacion):'')+'</p>'
    +'<div class="overflow"><table class="pm-tabla"><thead><tr><th>Artículo</th><th>Talla</th><th>Pedida</th><th>Recibida</th><th>Costo est.</th></tr></thead><tbody>'
    +ls.map(l=>'<tr><td>'+pmEsc(pmNombreEpp(l.epp_codigo))+' <small>('+pmEsc(l.epp_codigo)+')</small></td><td>'+pmEsc(l.talla||'—')+'</td><td class="pm-num">'+l.cantidad_pedida+'</td><td class="pm-num">'+l.cantidad_recibida+'</td><td class="pm-num">'+(l.costo_estimado==null?'—':l.costo_estimado)+'</td></tr>').join('')
    +'</tbody></table></div>'
    +'<div class="pm-acciones">'
    +(borr&&pmPuede('bodega.pedidos.crear')?'<button class="btn btn-compacto" type="button" onclick="pmEnviarPedido()">Enviar</button>':'')
    +((borr||env)&&pmPuede('bodega.pedidos.anular')?'<button class="btn secondary btn-compacto" type="button" onclick="pmAnularPedido()">Anular</button>':'')
    +((env||parc)&&pmPuede('bodega.pedidos.recibir')?'<button class="btn btn-compacto" type="button" onclick="pmRecibirEste()">Recibir mercadería</button>':'')
    +'<button class="btn secondary btn-compacto" type="button" onclick="pmDescargarPdf()">Descargar PDF</button>'
    +'<button class="btn secondary btn-compacto" type="button" onclick="pmDescargarCsv()">Descargar Excel/CSV</button>'
    +'</div><small id="pmDetMsg" role="status"></small>';
}
async function pmEnviarPedido(){
  const p=pmPedidoAbierto.pedido;
  if(!confirm('¿Enviar el pedido N° '+p.folio+'? Después no se podrán cambiar sus líneas.'))return;
  try{
    const {error}=await window.supabaseClient.rpc('enviar_pedido',{p_pedido:p.id});
    if(error)throw new Error(error.message);
    await pmCargarPedidos();
    await pmAbrirPedido(p.id);
    pmMsg('pmDetMsg','Pedido enviado.','ok');
  }catch(e){pmMsg('pmDetMsg','No se pudo enviar: '+e.message,'error');}
}
async function pmAnularPedido(){
  const p=pmPedidoAbierto.pedido;
  const motivo=prompt('Motivo de la anulación del pedido N° '+p.folio+':');
  if(motivo===null)return;
  if(!motivo.trim()){pmMsg('pmDetMsg','Escribe un motivo para anular.','error');return;}
  try{
    const {error}=await window.supabaseClient.rpc('anular_pedido',{p_pedido:p.id,p_motivo:motivo.trim()});
    if(error)throw new Error(error.message);
    await pmCargarPedidos();
    await pmAbrirPedido(p.id);
    pmMsg('pmDetMsg','Pedido anulado.','ok');
  }catch(e){pmMsg('pmDetMsg','No se pudo anular: '+e.message+' (solo se anula un pedido sin recepciones).','error');}
}

// ---------- Exportar ----------
function pmFilasExport(){
  const p=pmPedidoAbierto.pedido;
  return pmPedidoAbierto.lineas.map(l=>[p.folio,pmNombreEmpresa(p.empresa_id),pmFecha(p.creado_en),p.proveedor||'',l.epp_codigo,pmNombreEpp(l.epp_codigo),l.talla||'',l.cantidad_pedida,l.cantidad_recibida,l.costo_estimado==null?'':l.costo_estimado]);
}
function pmDescargarCsv(){
  if(!pmPedidoAbierto)return;
  const cab=['Folio','Empresa','Fecha','Proveedor','Código','Artículo','Talla','Pedida','Recibida','Costo estimado'];
  const celda=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const csv='\uFEFF'+[cab].concat(pmFilasExport()).map(f=>f.map(celda).join(';')).join('\r\n');
  pmBajar(new Blob([csv],{type:'text/csv;charset=utf-8'}),'pedido_'+pmPedidoAbierto.pedido.folio+'.csv');
}
function pmBajar(blob,nombre){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=nombre;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function pmDescargarPdf(){
  if(!pmPedidoAbierto)return;
  try{
    if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('la librería de PDF no se cargó; recarga la página');
    const p=pmPedidoAbierto.pedido;
    const doc=new window.jspdf.jsPDF();
    let y=18;
    doc.setFont('helvetica','bold').setFontSize(14).text('Pedido de materiales N° '+p.folio,14,y);y+=8;
    doc.setFont('helvetica','normal').setFontSize(10);
    doc.text('Empresa: '+pmNombreEmpresa(p.empresa_id),14,y);y+=5;
    doc.text('Fecha: '+pmFecha(p.creado_en)+'    Estado: '+(PM_ESTADOS[p.estado]||p.estado),14,y);y+=5;
    doc.text('Proveedor: '+(p.proveedor||'—'),14,y);y+=8;
    doc.setFont('helvetica','bold');
    doc.text('Artículo',14,y);doc.text('Talla',120,y);doc.text('Pedida',145,y);doc.text('Recibida',170,y);y+=2;
    doc.line(14,y,196,y);y+=5;
    doc.setFont('helvetica','normal');
    pmPedidoAbierto.lineas.forEach(l=>{
      if(y>280){doc.addPage();y=18;}
      doc.text(String(pmNombreEpp(l.epp_codigo)).slice(0,60),14,y);
      doc.text(String(l.talla||'—'),120,y);
      doc.text(String(l.cantidad_pedida),145,y);
      doc.text(String(l.cantidad_recibida),170,y);
      y+=6;
    });
    doc.save('pedido_'+p.folio+'.pdf');
  }catch(e){pmMsg('pmDetMsg','No se pudo generar el PDF: '+e.message,'error');}
}

// ---------- Recibir mercadería ----------
function pmRecibirEste(){
  pmIdARecibir=pmPedidoAbierto.pedido.id;
  pmPestanaAbrir('recibir');
}
let pmIdARecibir=null;
let pmRecepcion=null;
async function pmPrepararRecibir(){
  const sel=document.getElementById('pmRecPedido');
  const form=document.getElementById('pmRecForm');
  form.innerHTML='';
  pmMsg('pmRecMsg','');
  try{
    await pmCargarCatalogo();
    const {data,error}=await window.supabaseClient.from('pedidos_materiales')
      .select('id,folio,estado,proveedor').eq('bodega_id',pmBodegaId).in('estado',['enviado','recibido_parcial']).order('folio',{ascending:false});
    if(error)throw new Error(error.message);
    const lista=data||[];
    sel.innerHTML='<option value="">Elige un pedido…</option>'+lista.map(p=>'<option value="'+pmEsc(p.id)+'">N° '+p.folio+' — '+pmEsc(p.proveedor||'sin proveedor')+' ('+pmEsc(PM_ESTADOS[p.estado])+')</option>').join('');
    if(!lista.length)pmMsg('pmRecMsg','No hay pedidos enviados o con recepción parcial. Primero envía un pedido desde la pestaña "Pedidos".');
    if(pmIdARecibir&&lista.some(p=>p.id===pmIdARecibir))sel.value=pmIdARecibir;
    pmIdARecibir=null;
    if(sel.value)await pmElegirRecepcion(sel.value);
  }catch(e){
    pmMsg('pmRecMsg','No se pudieron leer los pedidos por recibir: '+e.message,'error');
  }
}
async function pmElegirRecepcion(id){
  const form=document.getElementById('pmRecForm');
  form.innerHTML='';
  pmRecepcion=null;
  if(!id)return;
  try{
    const {data,error}=await window.supabaseClient.from('pedido_lineas')
      .select('id,epp_codigo,talla,cantidad_pedida,cantidad_recibida').eq('pedido_id',id).order('epp_codigo');
    if(error)throw new Error(error.message);
    pmRecepcion={id,lineas:data||[]};
    form.innerHTML='<div class="overflow"><table class="pm-tabla"><thead><tr><th>Artículo</th><th>Talla</th><th>Pedida</th><th>Ya recibida</th><th>Recibo ahora</th><th>Justificación (si es más de lo pedido)</th></tr></thead><tbody>'
      +pmRecepcion.lineas.map((l,i)=>{
        const pend=Math.max(0,l.cantidad_pedida-l.cantidad_recibida);
        return '<tr><td>'+pmEsc(pmNombreEpp(l.epp_codigo))+'</td><td>'+pmEsc(l.talla||'—')+'</td><td class="pm-num">'+l.cantidad_pedida+'</td><td class="pm-num">'+l.cantidad_recibida+'</td>'
          +'<td><input type="number" min="0" step="1" value="'+pend+'" id="pmRecQty'+i+'" aria-label="Cantidad recibida de '+pmEsc(l.epp_codigo)+'"></td>'
          +'<td><input type="text" id="pmRecJus'+i+'" maxlength="200"></td></tr>';
      }).join('')+'</tbody></table></div>';
  }catch(e){pmMsg('pmRecMsg','No se pudieron leer las líneas: '+e.message,'error');}
}
async function pmConfirmarRecepcion(){
  if(!pmPuede('bodega.pedidos.recibir')){pmMsg('pmRecMsg','No tienes permiso para recibir mercadería. Pide el permiso bodega.pedidos.recibir a un administrador.','error');return;}
  if(!pmRecepcion){pmMsg('pmRecMsg','Elige un pedido primero.','error');return;}
  const guia=(document.getElementById('pmRecGuia').value||'').trim();
  if(!guia){pmMsg('pmRecMsg','Escribe el N° de guía: evita que la misma recepción se cuente dos veces.','error');return;}
  const lineas=[];
  for(let i=0;i<pmRecepcion.lineas.length;i++){
    const l=pmRecepcion.lineas[i];
    const c=parseInt(document.getElementById('pmRecQty'+i).value,10)||0;
    if(c<=0)continue;
    const jus=(document.getElementById('pmRecJus'+i).value||'').trim();
    if(l.cantidad_recibida+c>l.cantidad_pedida&&!jus){
      pmMsg('pmRecMsg','Recibes más de lo pedido en '+pmNombreEpp(l.epp_codigo)+(l.talla?' talla '+l.talla:'')+': escribe una justificación.','error');return;
    }
    lineas.push({linea_id:l.id,cantidad:c,justificacion:jus||null});
  }
  if(!lineas.length){pmMsg('pmRecMsg','Pon una cantidad mayor que cero en al menos una línea.','error');return;}
  const btn=document.getElementById('pmRecBtn');
  btn.disabled=true;
  try{
    const {data,error}=await window.supabaseClient.rpc('recibir_pedido',{p_pedido:pmRecepcion.id,p_lineas:lineas,p_guia:guia});
    if(error)throw new Error(error.message);
    const r=Array.isArray(data)?data[0]:data;
    pmMsg('pmRecMsg','Recepción registrada: '+((r&&r.aplicadas)||0)+' línea(s) aplicada(s), '+((r&&r.repetidas)||0)+' repetida(s) omitida(s). Estado del pedido: '+(PM_ESTADOS[r&&r.estado]||(r&&r.estado)||'—')+'.','ok');
    document.getElementById('pmRecGuia').value='';
    await pmPrepararRecibir();
  }catch(e){
    pmMsg('pmRecMsg','No se pudo registrar la recepción: '+e.message,'error');
  }finally{btn.disabled=false;}
}
