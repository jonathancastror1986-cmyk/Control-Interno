/* Bandeja "Por aprobar" y utilidades del motor de aprobación (migración 103).
   Prefijo pap. La regla real vive en la base: aquí solo se llama y se muestra. */
let papPendientes=[];
let papOcupado=false;

function papEsc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function papMensajeError(error){
  const m=String((error&&error.message)||error||'Error desconocido');
  const c=error&&error.code?String(error.code):'';
  if(c==='42501')return m+' · Pide a Administración que revise tus permisos.';
  if(c==='0A000')return m+' · Ese tipo de trámite aún no está conectado al motor de aprobación en la base.';
  return m;
}

// Un solo paso de lectura para la lista y el PDF: trámites por tipo y documento.
async function papCargarTramites(tipo,ids){
  const mapa=new Map();
  const lista=[...new Set((ids||[]).map(String))];
  if(!lista.length)return mapa;
  const {data,error}=await window.supabaseClient.from('aprobaciones_documento')
    .select('id,documento_id,estado,pasos,paso_actual,motivo_cierre,creado_en')
    .eq('tipo',tipo).in('documento_id',lista).order('creado_en',{ascending:false});
  if(error)throw error;
  (data||[]).forEach(t=>{if(!mapa.has(String(t.documento_id)))mapa.set(String(t.documento_id),t);});
  return mapa;
}

function papNombresPaso(paso){
  if(!paso)return '';
  const partes=[...(paso.roles||[]),...(paso.usuarios||[])];
  return paso.nombre+(partes.length?' ('+partes.join(' o ')+')':'');
}

// Texto corto del estado del trámite, p. ej. "Esperando a: Jefe de terreno".
function papTextoTramite(t){
  if(!t)return '';
  if(t.estado==='pendiente'){
    const pasos=Array.isArray(t.pasos)?t.pasos:[];
    const paso=pasos.find(x=>Number(x.orden)===Number(t.paso_actual));
    return 'Esperando a: '+(paso?paso.nombre:'paso '+t.paso_actual);
  }
  if(t.estado==='aprobado')return 'Aprobado';
  if(t.estado==='rechazado')return 'Rechazado'+(t.motivo_cierre?': '+t.motivo_cierre:'');
  return 'Trámite anulado';
}

async function papCargarDecisiones(aprobacionId){
  const {data,error}=await window.supabaseClient.from('aprobaciones_decisiones')
    .select('paso,decidido_por_nombre,decidido_en,decision,nota,codigo_verificacion')
    .eq('aprobacion_id',aprobacionId).order('decidido_en',{ascending:true});
  if(error)throw error;
  return data||[];
}

function papHorario(inicio,fin){
  const h=v=>String(v||'').slice(0,5);
  return (h(inicio)==='00:00'&&h(fin)==='23:59')?'Todo el día':h(inicio)+' a '+h(fin);
}

// PDF único para permiso por hora y por día. d: {titulo,empresa,nombre,code,fecha,horario,motivo,pidio,folio,tramite,decisiones}
function papGenerarPdf(d){
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const w=doc.internal.pageSize.getWidth();
  let y=18;
  const pie=()=>{doc.setFont('helvetica','normal').setFontSize(7.5).setTextColor(122,127,133);doc.text('Documento generado automáticamente por el sistema de Control de Asistencia y Portería.',14,288);};
  doc.setFont('helvetica','bold').setFontSize(15).setTextColor(31,45,61);
  doc.text(d.empresa||'Control de Asistencia y Portería',14,y);
  doc.setFont('helvetica','normal').setFontSize(9).setTextColor(122,127,133);
  doc.text(d.titulo,14,y+6);
  doc.setFont('helvetica','bold').setFontSize(11).setTextColor(31,45,61);
  doc.text(d.folio==null?'Sin folio':'N° '+String(d.folio).padStart(6,'0'),w-14,y,{align:'right'});
  doc.setDrawColor(176,141,87).setLineWidth(0.5).line(14,y+9,w-14,y+9);
  y+=17;
  [['Empresa',d.empresa||'—'],['Trabajador',d.nombre+' ('+d.code+')'],['Fecha',d.fecha],['Horario',d.horario],['Motivo',d.motivo||'—'],['Solicitado por',d.pidio||'—']].forEach(([k,v])=>{
    doc.setFont('helvetica','bold').setFontSize(9).setTextColor(122,127,133);
    doc.text(k+':',14,y);
    doc.setFont('helvetica','normal').setFontSize(10).setTextColor(35,39,43);
    const l=doc.splitTextToSize(String(v),w-66);
    doc.text(l,52,y);
    y+=7*l.length;
  });
  y+=8;
  doc.setFont('helvetica','bold').setFontSize(12).setTextColor(31,45,61);
  doc.text('Aprobaciones',14,y);
  y+=6;
  const filas=[];
  const t=d.tramite;
  const decs=d.decisiones||[];
  if(!t){
    filas.push(['—','Sin trámite de aprobación','—','—','—']);
  }else{
    (Array.isArray(t.pasos)?t.pasos:[]).forEach(p=>{
      const hechas=decs.filter(x=>Number(x.paso)===Number(p.orden));
      if(!hechas.length){
        filas.push([p.nombre,'—',t.estado==='anulado'?'No requerida':'Pendiente','—','—']);
      }else{
        hechas.forEach(x=>filas.push([p.nombre,x.decidido_por_nombre||'—',x.decision==='aprobado'?'Aprobado':'Rechazado',typeof fechaLegible==='function'?fechaLegible(x.decidido_en,true):String(x.decidido_en||''),x.codigo_verificacion||'—']));
      }
    });
  }
  const cols=[14,56,100,128,165];
  doc.setFont('helvetica','bold').setFontSize(8.5).setTextColor(122,127,133);
  ['Cargo','Aprobador','Decisión','Fecha y hora','Verificación'].forEach((h,i)=>doc.text(h,cols[i],y));
  doc.setDrawColor(122,127,133).setLineWidth(0.3).line(14,y+1.5,w-14,y+1.5);
  y+=6;
  doc.setFont('helvetica','normal').setFontSize(8.5).setTextColor(35,39,43);
  filas.forEach(f=>{
    const celdas=f.map((c,i)=>doc.splitTextToSize(String(c),(cols[i+1]||w-14)-cols[i]-2));
    const alto=Math.max(...celdas.map(c=>c.length))*4.5;
    if(y+alto>280){pie();doc.addPage();y=18;}
    celdas.forEach((c,i)=>doc.text(c,cols[i],y));
    y+=alto+2;
  });
  pie();
  return doc.output('blob');
}

// Permiso por hora: trae el trámite y sus decisiones y genera el PDF.
async function papDescargarPdfPermisoHora(id){
  try{
    const p=(typeof permisosHorarioLista!=='undefined'?permisosHorarioLista:[]).find(x=>Number(x.id)===Number(id));
    if(!p)throw new Error('Ese permiso ya no está en la lista. Recarga la vista.');
    let tramite=null,decisiones=[],aviso='';
    try{
      tramite=(await papCargarTramites('permiso_hora',[id])).get(String(id))||null;
      if(tramite)decisiones=await papCargarDecisiones(tramite.id);
    }catch(e){aviso=' (No se pudo leer el trámite de aprobación: '+papMensajeError(e)+')';}
    const worker=workers.find(x=>x.code===p.code);
    const emp=empresaData(worker)||{};
    const pidio=(p.pedido_por_nombre||'—')+(p.pedido_por_rol?' ('+p.pedido_por_rol+')':'');
    const blob=papGenerarPdf({titulo:'Permiso por hora',empresa:emp.nombre,nombre:worker?worker.name:p.code,code:p.code,fecha:p.fecha,
      horario:p.dia_completo?'Todo el día':papHorario(p.hora_inicio,p.hora_fin),motivo:p.motivo,pidio,folio:p.folio,tramite,decisiones});
    guardarBlobComoArchivo(blob,'permiso_hora_'+p.code+'_'+p.fecha+'.pdf');
    if(aviso&&typeof mostrarErrorPermisoHorario==='function')mostrarErrorPermisoHorario('PDF generado con la sección Aprobaciones incompleta.'+aviso);
  }catch(error){
    if(typeof mostrarErrorPermisoHorario==='function')mostrarErrorPermisoHorario('No se pudo generar el PDF: '+papMensajeError(error));
    else alert('No se pudo generar el PDF: '+papMensajeError(error));
  }
}

// Permiso por día (justificar inasistencia). Intenta el motor; si el tipo no está conectado, avisa y sigue.
async function papPermisoDiaTrasJustificar(code,desde,hasta,estado,nota){
  const doc=code+'|'+desde+'|'+hasta;
  let tramite=null,decisiones=[],aviso='';
  try{
    const {data,error}=await window.supabaseClient.rpc('iniciar_aprobacion',{p_tipo:'permiso_dia',p_documento:doc});
    if(error)throw error;
    if(data&&data.estado==='pendiente')aviso='El permiso quedó esperando aprobación.';
    tramite=(await papCargarTramites('permiso_dia',[doc])).get(doc)||null;
    if(tramite)decisiones=await papCargarDecisiones(tramite.id);
  }catch(e){
    aviso='Aviso: no se inició la aprobación ('+papMensajeError(e)+'). La justificación sí se guardó.';
  }
  if(!window.confirm((aviso?aviso+'\n\n':'')+'¿Descargar el PDF del permiso por día?'))return;
  try{
    const worker=workers.find(x=>x.code===code);
    const emp=empresaData(worker)||{};
    const quien=(typeof usuarioActual!=='undefined'&&usuarioActual&&(usuarioActual.nombre||usuarioActual.email))||(tramite&&tramite.solicitante_nombre)||'—';
    const blob=papGenerarPdf({titulo:'Permiso por día ('+estado+')',empresa:emp.nombre,nombre:worker?worker.name:code,code,
      fecha:desde===hasta?desde:desde+' al '+hasta,horario:'Todo el día',motivo:nota,pidio:quien,folio:null,tramite,decisiones});
    guardarBlobComoArchivo(blob,'permiso_dia_'+code+'_'+desde+'.pdf');
  }catch(e){alert('No se pudo generar el PDF: '+papMensajeError(e));}
}

/* ---------- Vista "Por aprobar" ---------- */
function papMsg(texto,clase){
  const el=document.getElementById('papMsg');
  if(el){el.className='pap-msg '+(clase||'');el.textContent=texto||'';}
}

async function papActualizarInsignia(){
  try{
    if(!window.supabaseClient||typeof puedeGuardar!=='function')return;
    const {data,error}=await window.supabaseClient.rpc('pendientes_para_mi');
    if(error)throw error;
    papPintarInsignia((data||[]).length);
  }catch(e){papPintarInsignia(0);}
}

function papPintarInsignia(n){
  document.querySelectorAll('#subNav button[data-v="por-aprobar"]').forEach(b=>{
    let s=b.querySelector('.pap-insignia');
    if(!n){if(s)s.remove();return;}
    if(!s){s=document.createElement('span');s.className='pap-insignia';b.appendChild(s);}
    s.textContent=String(n);
    s.setAttribute('aria-label',n+' trámites por aprobar');
  });
}

async function initPorAprobar(){
  const box=document.getElementById('papLista');
  if(!box)return;
  box.innerHTML='<small>Cargando…</small>';
  papMsg('');
  try{
    const {data,error}=await window.supabaseClient.rpc('pendientes_para_mi');
    if(error)throw error;
    papPendientes=data||[];
    papPintarInsignia(papPendientes.length);
    // Detalle del permiso: si la RLS no lo deja leer, se muestra solo lo que dio la base.
    const ids=papPendientes.filter(x=>x.tipo==='permiso_hora').map(x=>Number(x.documento_id)).filter(Number.isFinite);
    const detalle=new Map();
    if(ids.length){
      const r=await window.supabaseClient.from('permiso_horario').select('id,code,fecha,hora_inicio,hora_fin,dia_completo,motivo').in('id',ids);
      if(!r.error)(r.data||[]).forEach(p=>detalle.set(String(p.id),p));
    }
    papRender(detalle);
  }catch(error){
    box.innerHTML='<div class="gpsWarn"><b>No se pudo leer la bandeja.</b> <small></small></div>';
    box.querySelector('small').textContent=papMensajeError(error)+' · Recarga la vista; si sigue, avisa a Soporte.';
  }
}

function papRender(detalle){
  const box=document.getElementById('papLista');
  if(!papPendientes.length){box.innerHTML='<small>No tienes trámites pendientes por aprobar.</small>';return;}
  const puedeDecidir=typeof puedeGuardar==='function';
  const filas=papPendientes.map(x=>{
    const p=detalle.get(String(x.documento_id));
    const w=p?workers.find(k=>k.code===p.code):null;
    const que=p?(w?w.name:p.code)+' · '+p.fecha+' · '+(p.dia_completo?'Todo el día':papHorario(p.hora_inicio,p.hora_fin)):'Documento '+x.documento_id;
    const cuando=typeof fechaLegible==='function'?fechaLegible(x.creado_en,true):x.creado_en;
    const aid=papEsc(x.aprobacion_id);
    return `<tr data-aid="${aid}" data-paso="${Number(x.paso)}">
      <td><b>${papEsc(x.tipo==='permiso_hora'?'Permiso por hora':x.tipo)}</b><small class="pap-meta">${papEsc(que)}</small></td>
      <td>${papEsc(x.solicitante_nombre||'—')}<small class="pap-meta">${papEsc(cuando)}</small></td>
      <td>${papEsc(p?p.motivo:'—')}</td>
      <td>${papEsc(x.paso_nombre||'Paso '+x.paso)}</td>
      <td class="pap-acc">${puedeDecidir?`<button class="btn" type="button" data-pap="aprobado">Aprobar</button><button class="btn secondary" type="button" data-pap="rechazado">Rechazar</button>`:''}</td>
    </tr>`;
  }).join('');
  box.innerHTML='<div class="overflow"><table class="pap-tabla"><thead><tr><th>Trámite</th><th>Pedido por</th><th>Motivo</th><th>Tu paso</th><th>Decisión</th></tr></thead><tbody>'+filas+'</tbody></table></div>';
}

async function papDecidir(fila,decision){
  if(papOcupado)return;
  const aid=fila.dataset.aid,paso=Number(fila.dataset.paso);
  let nota=null;
  if(decision==='rechazado'){
    nota=window.prompt('Escribe el motivo del rechazo (mínimo 5 letras). Es obligatorio.');
    if(nota===null)return;
    nota=nota.trim();
    if(nota.length<5){papMsg('El motivo del rechazo debe tener al menos 5 letras. No se registró nada.','error');return;}
  }else if(!window.confirm('¿Aprobar este trámite?'))return;
  papOcupado=true;
  fila.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
    const {data,error}=await window.supabaseClient.rpc('decidir_paso',{p_aprobacion:aid,p_paso:paso,p_decision:decision,p_nota:nota});
    if(error)throw error;
    papMsg((decision==='aprobado'?'Aprobado.':'Rechazado.')+(data&&data.codigo_verificacion?' Código de verificación: '+data.codigo_verificacion:''),'ok');
  }catch(error){
    papMsg('No se pudo registrar la decisión: '+papMensajeError(error)+' Revisa si otra persona ya decidió y recarga.','error');
  }finally{
    papOcupado=false;
  }
  await initPorAprobar();
}

document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('button[data-pap]');
  if(!b)return;
  const fila=b.closest('tr[data-aid]');
  if(fila)papDecidir(fila,b.dataset.pap);
});
