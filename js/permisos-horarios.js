let permisosHorarioLista = [];
let permisosHorarioTramites = new Map();
let permisosHorarioTramitesError = false;
let permisosHorarioError = '';
let permisosHorarioDia = [];
let permisosHorarioDiaError = '';
let permisoRespaldoEnCurso = false;
const PERMISO_HORARIO_COLUMNAS = 'id,code,fecha,hora_inicio,hora_fin,dia_completo,motivo,estado,pedido_por_nombre,pedido_por_rol,creado_en,confirmado_por_nombre,confirmado_at,comentario,firma_estado,folio,respaldo_path,respaldo_sha256,respaldo_subido_nombre,respaldo_subido_at';

function textoSeguroPermisoHorario(valor){
  return String(valor==null?'':valor)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function equipoVisiblePermisoHorario(){
  const sel=document.getElementById('supDiariaSup');
  const supCode=sel?sel.value:miCodigoSupervisor;
  return supCode?equipoDe(supCode):[];
}

// Texto de la franja: la base marca dia_completo, el navegador solo lo muestra.
function franjaPermisoHorario(p){
  if(p&&(p.dia_completo||(String(p.hora_inicio||'').slice(0,5)==='00:00'&&String(p.hora_fin||'').slice(0,5)==='23:59')))return 'Todo el día';
  return String(p.hora_inicio||'').slice(0,5)+'–'+String(p.hora_fin||'').slice(0,5);
}

// Marca visual en la tarja mensual: días sin estado de asistencia que tienen un permiso por hora.
// No cambia ningún total: solo agrega clase, title y aria-label a celdas que ya existen.
let permisosTarjaSeq = 0;

function textoPermisoTarja(p){
  const estado=p.estado==='confirmado'?'confirmado':'pendiente';
  if(franjaPermisoHorario(p)==='Todo el día')return 'Permiso todo el día ('+estado+')';
  return 'Permiso desde '+String(p.hora_inicio||'').slice(0,5)+' hasta '+String(p.hora_fin||'').slice(0,5)+' ('+estado+')';
}

function avisoPermisosTarja(texto){
  const area=document.getElementById('matrixArea');
  if(!area)return;
  const previo=document.getElementById('tarjaAvisoPermisos');
  if(previo)previo.remove();
  if(!texto)return;
  const p=document.createElement('p');
  p.id='tarjaAvisoPermisos';
  p.className='tarjaAvisoPermisos';
  p.setAttribute('role','status');
  p.textContent=texto;
  area.insertBefore(p,area.firstChild);
}

async function marcarPermisosHoraEnTarja(y,m,codes){
  const seq=++permisosTarjaSeq;
  avisoPermisosTarja('');
  if(!codes||!codes.length||!window.supabaseClient)return;
  const mes=String(m).padStart(2,'0');
  const primerDia=y+'-'+mes+'-01';
  const ultimoDia=y+'-'+mes+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
  try{
    const {data,error}=await window.supabaseClient.from('permiso_horario')
      .select('code,fecha,hora_inicio,hora_fin,dia_completo,estado')
      .gte('fecha',primerDia).lte('fecha',ultimoDia).in('code',codes).order('hora_inicio');
    if(error)throw error;
    // Si mientras tanto se dibujó otra tarja, esta respuesta ya no corresponde.
    if(seq!==permisosTarjaSeq)return;
    const porDia=new Map();
    (Array.isArray(data)?data:[]).forEach(p=>{
      if(p.estado==='anulado')return;
      const k=p.code+'|'+p.fecha;
      if(!porDia.has(k))porDia.set(k,[]);
      porDia.get(k).push(p);
    });
    if(!porDia.size)return;
    document.querySelectorAll('#matrixArea td.attendance-cell').forEach(td=>{
      if(td.dataset.state||td.dataset.auto==='true')return;
      const lista=porDia.get(decodeURIComponent(td.dataset.code||'')+'|'+td.dataset.date);
      if(!lista)return;
      const texto=lista.map(textoPermisoTarja).join('; ');
      td.classList.add('tarja-permiso-hora');
      td.title=texto;
      td.setAttribute('aria-label',texto);
      const marca=document.createElement('span');
      marca.className='tarjaPermisoI';
      marca.setAttribute('aria-hidden','true');
      marca.textContent='i';
      td.appendChild(marca);
    });
  }catch(error){
    if(seq!==permisosTarjaSeq)return;
    avisoPermisosTarja('No se pudieron leer los permisos por hora; la tarja se muestra sin esa marca.');
  }
}

// Columna informativa "Permisos por hora" del resumen mensual: no entra en ningún otro total.
let resumenPermisosHoraSeq = 0;

async function completarPermisosHoraResumen(y,m,box,tipoPorCodigo){
  const seq=++resumenPermisosHoraSeq;
  const celdas=box.querySelectorAll('td[data-permiso-hora]');
  const poner=function(valores){
    celdas.forEach(td=>{td.textContent=valores?String(valores[td.dataset.permisoHora]):'—';});
  };
  const codes=[...tipoPorCodigo.keys()];
  if(!codes.length){poner({interno:0,externo:0,total:0});return;}
  const mes=String(m).padStart(2,'0');
  const primerDia=y+'-'+mes+'-01';
  const ultimoDia=y+'-'+mes+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
  try{
    const {data,error}=await window.supabaseClient.from('permiso_horario')
      .select('code,fecha,hora_inicio,hora_fin,estado')
      .gte('fecha',primerDia).lte('fecha',ultimoDia).in('code',codes);
    if(error)throw error;
    if(seq!==resumenPermisosHoraSeq)return;
    const cuenta={interno:0,externo:0,total:0};
    (Array.isArray(data)?data:[]).forEach(p=>{
      if(p.estado!=='pendiente'&&p.estado!=='confirmado')return;
      const tipo=tipoPorCodigo.get(p.code);
      if(!tipo)return;
      cuenta[tipo]++;
      cuenta.total++;
    });
    poner(cuenta);
  }catch(error){
    if(seq!==resumenPermisosHoraSeq)return;
    poner(null);
    const aviso=document.createElement('p');
    aviso.innerHTML='<small>No se pudieron leer los permisos por hora; esa columna queda en "—".</small>';
    box.appendChild(aviso);
  }
}

function estadoPermisoHorario(estado){
  if(estado==='confirmado')return {texto:'Confirmado',clase:'confirmado'};
  if(estado==='anulado')return {texto:'Anulado',clase:'anulado'};
  return {texto:'Pendiente · Nadie lo ha revisado',clase:'pendiente'};
}

// La firma en papel es aparte del estado: un permiso con papel nunca cuenta como firmado electrónicamente.
function estadoFirmaPermisoHorario(p){
  if(p&&p.firma_estado==='pendiente_papel')return {texto:'Pendiente de firma en papel',clase:'pendiente_papel'};
  if(p&&p.firma_estado==='firmada_papel')return {texto:'Firmado en papel',clase:'firmada_papel'};
  return null;
}

function insigniaFirmaPermisoHorario(p){
  const f=estadoFirmaPermisoHorario(p);
  if(!f)return '';
  const folio=p.folio!=null&&typeof folioTexto==='function'?` <small class="permisoHorarioMeta">${textoSeguroPermisoHorario(folioTexto(p.folio))}</small>`:'';
  return `<span class="permisoHorarioFirma ${f.clase}">${textoSeguroPermisoHorario(f.texto)}</span>${folio}`;
}

function nombreRespaldoPermisoHorario(p){
  return `respaldo_permiso_${p.code}_${p.fecha}.${String(p.respaldo_path||'').split('.').pop()}`;
}

function botonVerRespaldoPermisoHorario(p){
  if(!p.respaldo_path)return '';
  return `<button class="btn secondary" type="button" onclick="downloadFromBucket('${textoSeguroPermisoHorario(p.respaldo_path)}','${textoSeguroPermisoHorario(nombreRespaldoPermisoHorario(p))}')">📎 Ver respaldo</button>`;
}

// Esconder el botón es comodidad: la regla real está en la base (098 y 090).
function accionesFirmaPermisoHorario(p){
  const id=Number(p.id);
  const puedePreparar=puedeGuardar('permisos_horario.pedir')||puedeGuardar('permisos_horario.aprobar');
  const puedeAprobar=puedeGuardar('permisos_horario.aprobar');
  const b=[];
  b.push(`<button class="btn secondary" type="button" onclick="papDescargarPdfPermisoHora(${id})">Descargar PDF</button>`);
  if(p.estado==='pendiente'&&puedePreparar&&p.firma_estado!=='firmada_papel'){
    b.push(`<button class="btn secondary" type="button" onclick="descargarPdfPermisoHorario(${id})">📄 Descargar PDF para firma</button>`);
  }
  if(p.estado==='pendiente'&&puedeAprobar&&p.firma_estado==='pendiente_papel'){
    b.push(`<button class="btn" type="button" onclick="subirFirmadoPermisoHorario(${id},true)">Subir firmado y autorizar</button>`);
  }
  b.push(botonVerRespaldoPermisoHorario(p));
  if(puedeAprobar&&p.estado!=='anulado'&&p.firma_estado==='firmada_papel'){
    b.push(`<button class="btn secondary" type="button" onclick="subirFirmadoPermisoHorario(${id},false)">Reemplazar respaldo</button>`);
  }
  const html=b.filter(Boolean).join('');
  return html?`<div class="permisoHorarioAcciones">${html}</div>`:'';
}

function mostrarErrorPermisoHorario(mensaje,codigo=''){
  const box=document.getElementById('permisoHorarioError');
  if(!box)return;
  const texto=String(mensaje||'sin mensaje').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const cod=codigo?`<small> Código ${textoSeguroPermisoHorario(codigo)}</small>`:'';
  box.innerHTML=`<div class="gpsWarn"><b>${texto}</b>${cod}</div>`;
}

function limpiarErrorPermisoHorario(){
  const box=document.getElementById('permisoHorarioError');
  if(box)box.innerHTML='';
}

function renderListaPermisosHorario(){
  const box=document.getElementById('permisosHorarioLista');
  if(!box)return;
  if(permisosHorarioError){
    box.innerHTML='<div class="gpsWarn"><b>No se pudieron leer los permisos horarios.</b><br><small></small></div>';
    box.querySelector('small').textContent=permisosHorarioError;
    return;
  }
  if(!permisosHorarioLista.length){
    box.innerHTML='<small>No hay permisos horarios para esta persona en esta fecha.</small>';
    return;
  }
  const filas=permisosHorarioLista.map(p=>{
    const persona=workers.find(w=>w.code===p.code);
    const estado=estadoPermisoHorario(p.estado);
    const pedidoCuando=typeof fechaLegible==='function'?fechaLegible(p.creado_en,true):p.creado_en;
    const resueltoCuando=typeof fechaLegible==='function'?fechaLegible(p.confirmado_at,true):p.confirmado_at;
    const puedeResolver = p.estado==='pendiente' && puedeGuardar('permisos_horario.aprobar');
    // Con papel pendiente la base rechaza "Confirmar": solo se autoriza subiendo el firmado.
    const puedeConfirmar = puedeResolver && p.firma_estado!=='pendiente_papel';
    return `<tr>
      <td>${textoSeguroPermisoHorario(persona?persona.name:p.code)}</td>
      <td>${textoSeguroPermisoHorario(franjaPermisoHorario(p))}</td>
      <td>${textoSeguroPermisoHorario(p.motivo)}</td>
      <td><span class="permisoHorarioEstado ${estado.clase}">${textoSeguroPermisoHorario(estado.texto)}</span>${typeof papTextoTramite==='function'&&permisosHorarioTramites.get(String(p.id))?'<small class="pap-estado">'+textoSeguroPermisoHorario(papTextoTramite(permisosHorarioTramites.get(String(p.id))))+'</small>':''}${insigniaFirmaPermisoHorario(p)?'<div style="margin-top:4px">'+insigniaFirmaPermisoHorario(p)+'</div>':''}</td>
      <td>${textoSeguroPermisoHorario(p.pedido_por_nombre||'Sin nombre')}<small class="permisoHorarioMeta">${textoSeguroPermisoHorario(p.pedido_por_rol||'')}${pedidoCuando?' · '+textoSeguroPermisoHorario(pedidoCuando):''}</small></td>
      <td>${p.confirmado_por_nombre?textoSeguroPermisoHorario(p.confirmado_por_nombre):'—'}${resueltoCuando?`<small class="permisoHorarioMeta">${textoSeguroPermisoHorario(resueltoCuando)}</small>`:''}${p.comentario?`<small class="permisoHorarioMeta">${textoSeguroPermisoHorario(p.comentario)}</small>`:''}
        ${puedeResolver?`<div class="row" style="margin-top:6px;gap:6px;justify-content:flex-start">${puedeConfirmar?`<button class="btn" type="button" onclick="resolverPermisoHorario(${Number(p.id)},true)">Confirmar</button>`:''}<button class="btn secondary" type="button" onclick="resolverPermisoHorario(${Number(p.id)},false)">Anular</button></div>`:''}
        ${accionesFirmaPermisoHorario(p)}
      </td>
    </tr>`;
  }).join('');
  box.innerHTML='<div class="overflow"><table class="permisoHorarioTabla"><thead><tr>'
    +'<th>Persona</th><th>Franja</th><th>Motivo</th><th>Estado</th>'
    +'<th>Solicitado por</th><th>Resolución</th></tr></thead><tbody>'
    +filas+'</tbody></table></div>';
}

function prepararFiltroPermisoHorario(){
  const fecha=document.getElementById('permisosHorarioFecha');
  if(fecha&&!fecha.value)fecha.value=fechaDiaria;
  const persona=document.getElementById('permisosHorarioPersona');
  if(!persona)return [];
  const equipo=equipoVisiblePermisoHorario();
  const previo=persona.value;
  persona.innerHTML='<option value="">Todas las personas del equipo</option>'+
    equipo.map(w=>`<option value="${textoSeguroPermisoHorario(w.code)}">${textoSeguroPermisoHorario(w.name)}</option>`).join('');
  if(equipo.some(w=>w.code===previo))persona.value=previo;
  if(!persona.value&&equipo.length)persona.value=equipo[0].code;
  return equipo;
}

function prepararFormularioPermisoHorario(){
  const sel=document.getElementById('permisoHorarioPersona');
  if(!sel)return;
  const equipo=equipoVisiblePermisoHorario();
  const previo=sel.value;
  sel.innerHTML='<option value="">Selecciona una persona</option>'+
    equipo.map(w=>`<option value="${textoSeguroPermisoHorario(w.code)}">${textoSeguroPermisoHorario(w.name)}</option>`).join('');
  if(equipo.some(w=>w.code===previo)) sel.value=previo;
  if(!sel.value&&equipo.length)sel.value=equipo[0].code;
  const fecha=document.getElementById('permisoHorarioFecha');
  if(fecha&&!fecha.value)fecha.value=fechaDiaria;
}

async function cargarPermisosHorarioDia(){
  const box=document.getElementById('permisosHorarioLista');
  if(!box)return;
  const equipo=prepararFiltroPermisoHorario();
  prepararFormularioPermisoHorario();
  const fecha=document.getElementById('permisosHorarioFecha');
  const persona=document.getElementById('permisosHorarioPersona');
  const fechaConsulta=fecha&&fecha.value?fecha.value:fechaDiaria;
  const codeConsulta=persona&&persona.value?persona.value:'';
  permisosHorarioError='';
  permisosHorarioLista=[];
  if(!fechaConsulta){
    permisosHorarioError='Selecciona una fecha para consultar.';
    renderListaPermisosHorario();
    return;
  }
  if(!equipo.length){
    box.textContent='Selecciona un supervisor con trabajadores asignados.';
    await cargarPermisosParaAsistencia([]);
    return;
  }
  const codes=equipo.map(w=>w.code);
  const codesConsulta=codeConsulta?codes.filter(code=>code===codeConsulta):codes;
  if(!codesConsulta.length){
    permisosHorarioError='La persona seleccionada no pertenece al equipo visible.';
    renderListaPermisosHorario();
    await cargarPermisosParaAsistencia(codes);
    return;
  }
  try{
    const {data,error}=await window.supabaseClient.from('permiso_horario')
      .select(PERMISO_HORARIO_COLUMNAS)
      .eq('fecha',fechaConsulta).in('code',codesConsulta).order('hora_inicio');
    if(error)throw error;
    permisosHorarioLista=Array.isArray(data)?data:[];
    permisosHorarioTramites=new Map();
    permisosHorarioTramitesError=false;
    if(typeof papCargarTramites==='function'&&permisosHorarioLista.length){
      try{permisosHorarioTramites=await papCargarTramites('permiso_hora',permisosHorarioLista.map(p=>p.id));}
      catch(e){permisosHorarioTramitesError=true;}
    }
  }catch(error){
    permisosHorarioError=String((error&&error.message)||error||'sin mensaje');
  }
  renderListaPermisosHorario();
  if(fechaConsulta===fechaDiaria&&!codeConsulta){
    permisosHorarioDia=permisosHorarioLista.slice();
    permisosHorarioDiaError=permisosHorarioError;
  }else{
    await cargarPermisosParaAsistencia(codes);
  }
}

async function cargarPermisosParaAsistencia(codes){
  permisosHorarioDia=[];
  permisosHorarioDiaError='';
  if(!fechaDiaria||!codes.length)return;
  try{
    const {data,error}=await window.supabaseClient.from('permiso_horario')
      .select('code,fecha,hora_inicio,hora_fin,dia_completo,estado,firma_estado')
      .eq('fecha',fechaDiaria).in('code',codes).order('hora_inicio');
    if(error)throw error;
    permisosHorarioDia=Array.isArray(data)?data:[];
  }catch(error){
    permisosHorarioDiaError=String((error&&error.message)||error||'sin mensaje');
  }
}

async function cambiarSupervisorPermisoHorario(){
  await cargarPermisosHorarioDia();
  await renderDiaria();
}

async function pedirPermisoHorario(){
  // Y EL PERMISO, QUE ES EL NUEVO Y NO EL DE LA TARJA
  //
  // Antes pedía "tarja.marcaje", que es para registrar marcajes. Con la 090 la base
  // exige "permisos_horario.pedir", y con el nombre viejo el botón se veía pero la
  // base lo rechazaba: el error llegaba recién al apretar, y parecía un problema de
  // la base cuando el problema era que el navegador preguntaba otra cosa.
  if(!puedeGuardar('permisos_horario.pedir')){
    mostrarErrorPermisoHorario('No tienes permiso para pedir permisos horarios.', '42501');
    return;
  }
  const codigo=document.getElementById('permisoHorarioPersona');
  const fecha=document.getElementById('permisoHorarioFecha');
  const inicio=document.getElementById('permisoHorarioInicio');
  const fin=document.getElementById('permisoHorarioFin');
  const motivo=document.getElementById('permisoHorarioMotivo');
  const comentario=document.getElementById('permisoHorarioComentario');
  const todoDia=document.getElementById('permisoHorarioTodoDia');
  const pCode=codigo?codigo.value:'';
  const pFecha=fecha?fecha.value:'';
  const pInicio=inicio?inicio.value:'';
  const pFin=fin?fin.value:'';
  const pTodoDia=!!(todoDia&&todoDia.checked);
  const pMotivo=motivo?motivo.value.trim():'';
  const pComentario=comentario?comentario.value.trim():'';
  if(!pCode){mostrarErrorPermisoHorario('Selecciona una persona para pedir el permiso.', '22023');return;}
  if(!pFecha){mostrarErrorPermisoHorario('Falta la fecha del permiso.', '22023');return;}
  if(!pMotivo){mostrarErrorPermisoHorario('Falta el motivo del permiso. Un permiso sin motivo no se puede defender.', '22023');return;}
  const horas=resolverHorasPermisoHorario(pCode,pTodoDia,pInicio,pFin);
  if(horas.error){mostrarErrorPermisoHorario(horas.error, '22023');return;}
  try{
    const {data:idNuevo,error}=await window.supabaseClient.rpc('pedir_permiso_horario',{
      p_code:pCode,
      p_fecha:pFecha,
      p_hora_inicio:horas.inicio,
      p_hora_fin:horas.fin,
      p_motivo:pMotivo,
      p_comentario:pComentario||null
    });
    if(error)throw error;
    let avisoAprob='';
    try{
      const r=await window.supabaseClient.rpc('iniciar_aprobacion',{p_tipo:'permiso_hora',p_documento:String(idNuevo)});
      if(r.error)throw r.error;
      if(r.data&&r.data.estado==='pendiente')avisoAprob='El permiso quedó esperando aprobación.';
    }catch(errAprob){
      avisoAprob='El permiso se creó, pero no se pudo iniciar su aprobación: '+String((errAprob&&errAprob.message)||errAprob)+' Avisa a Administración.';
    }
    limpiarErrorPermisoHorario();
    if(avisoAprob)mostrarErrorPermisoHorario(avisoAprob);
    if(motivo)motivo.value='';
    if(comentario)comentario.value='';
    if(todoDia)todoDia.checked=false;
    alternarTodoDiaPermisoHorario();
    await cargarPermisosHorarioDia();
    await renderDiaria();
  }catch(error){
    const codigoM=error&&error.code?String(error.code):'';
    const msg=String((error&&error.message)||error||'No se pudo guardar el permiso.');
    mostrarErrorPermisoHorario(msg+ayudaErrorPermisoHorario(codigoM), codigoM);
  }
}

// Pista de qué hacer según el código; el mensaje de la base va siempre primero.
function ayudaErrorPermisoHorario(codigo){
  if(codigo==='42501')return ' · Pide a Administración que revise tus permisos o tu centro de costo.';
  if(codigo==='22023')return ' · Corrige el dato y vuelve a intentar.';
  if(codigo==='PGRST202'||codigo==='42883')return ' · Falta aplicar la migración 099 en Supabase.';
  return '';
}

function alternarTodoDiaPermisoHorario(){
  const todoDia=document.getElementById('permisoHorarioTodoDia');
  const marcado=!!(todoDia&&todoDia.checked);
  ['permisoHorarioInicio','permisoHorarioFin'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    if(marcado)el.value='';
    el.disabled=marcado;
  });
  programarResumenPermisoHorario();
}

function programarResumenPermisoHorario(){
  actualizarResumenPermisoHorario();
}

// Resuelve las horas del permiso con el horario de la empresa del trabajador.
// No cubre turnos que cruzan la medianoche: aquí se exige fin > inicio en el mismo día.
function resolverHorasPermisoHorario(code,todoDia,inicio,fin){
  const hm=v=>String(v||'').slice(0,5);
  inicio=hm(inicio);
  fin=hm(fin);
  if(todoDia){
    if(inicio||fin)return {error:'Con todo el día no se escriben horas.'};
    return {inicio:'00:00',fin:'23:59',todoDia:true};
  }
  if(!inicio&&!fin)return {error:'Indica la hora de inicio, la de fin, o marca todo el día.'};
  if(!inicio||!fin){
    const entrada=hm(horaEntradaRealDe(code));
    const salida=hm(horaSalidaDe(code));
    if(!inicio)inicio=entrada;
    if(!fin)fin=salida;
    if(!inicio||!fin)return {error:'Este trabajador no tiene horario ese día: indica ambas horas o marca todo el día.'};
  }
  if(fin<=inicio)return {error:'La hora de fin debe ser posterior a la de inicio.'};
  return {inicio,fin,todoDia:inicio==='00:00'&&fin==='23:59'};
}

function textoResumenPermisoHorario(code,todoDia,inicioTxt,finTxt){
  const r=resolverHorasPermisoHorario(code,todoDia,inicioTxt,finTxt);
  if(r.error)return {error:r.error};
  if(r.todoDia)return {texto:'Se registrará todo el día'};
  return {texto:`Se registrará de ${r.inicio} a ${r.fin}`};
}

function actualizarResumenPermisoHorario(){
  const box=document.getElementById('permisoHorarioResumen');
  if(!box)return;
  const val=id=>{const el=document.getElementById(id);return el?el.value:'';};
  const todoDia=document.getElementById('permisoHorarioTodoDia');
  const code=val('permisoHorarioPersona');
  const inicio=val('permisoHorarioInicio');
  const fin=val('permisoHorarioFin');
  const marcado=!!(todoDia&&todoDia.checked);
  if(!code||(!marcado&&!inicio&&!fin)){box.textContent='';return;}
  const r=textoResumenPermisoHorario(code,marcado,inicio,fin);
  box.innerHTML=r.error
    ?'<div class="gpsWarn"><b>'+textoSeguroPermisoHorario(r.error)+'</b></div>'
    :'<small><b>'+textoSeguroPermisoHorario(r.texto)+'</b></small>';
}

async function resolverPermisoHorario(id, acepta, comentario){
  // Y EL PERMISO, QUE ES EL NUEVO Y NO EL DE LA TARJA
  //
  // Antes pedía "tarja.aprobar_cambio", que es para aprobar cambios de asistencia y
  // para los avisos de ingreso. Con la 090, aprobar un permiso con hora es
  // "permisos_horario.aprobar", y a propósito NO es el mismo: con el viejo, "rrhh"
  // seguía viendo botones para aprobar y la base se los rechazaba.
  if(!puedeGuardar('permisos_horario.aprobar')){
    mostrarErrorPermisoHorario('No tienes permiso para resolver permisos horarios.', '42501');
    return;
  }
  if(!id){return;}
  let txt='';
  if(typeof comentario!=='string'){
    txt=window.prompt(acepta?'Comentario opcional para confirmar el permiso:':'Comentario opcional para anular el permiso:','');
    if(txt===null)return;
  }else{
    txt=comentario;
  }
  try{
    const {error}=await window.supabaseClient.rpc('resolver_permiso_horario',{
      p_id:id,
      p_acepta:!!acepta,
      p_comentario:txt.trim()||null
    });
    if(error)throw error;
    limpiarErrorPermisoHorario();
    await cargarPermisosHorarioDia();
    await renderDiaria();
  }catch(error){
    const codigoM=error&&error.code?String(error.code):'';
    const msg=String((error&&error.message)||error||'No se pudo resolver el permiso.');
    mostrarErrorPermisoHorario(msg, codigoM);
  }
}

function buildPermisoHorarioPdf(p,folio){
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const w=doc.internal.pageSize.getWidth();
  const worker=workers.find(x=>x.code===p.code);
  const emp=empresaData(worker);
  const hora=v=>String(v||'').slice(0,5);
  let y=18;
  doc.setFont('helvetica','bold').setFontSize(15).setTextColor(31,45,61);
  doc.text(emp.nombre||'Control de Asistencia y Portería',14,y);
  doc.setFont('helvetica','normal').setFontSize(9).setTextColor(122,127,133);
  doc.text('Permiso por hora · firma manual',14,y+6);
  doc.setFont('helvetica','bold').setFontSize(11).setTextColor(31,45,61);
  doc.text(folioTexto(folio),w-14,y,{align:'right'});
  doc.setDrawColor(176,141,87).setLineWidth(0.5).line(14,y+9,w-14,y+9);
  y+=17;
  const firmante=worker?worker.name:p.code;
  const pidio=(p.pedido_por_nombre||'—')+(p.pedido_por_rol?` (${p.pedido_por_rol})`:'');
  const datos=[
    ['Trabajador',`${firmante} (${p.code})`],
    ['Fecha del permiso',p.fecha],
    ['Horario',p.dia_completo?'Todo el día (00:00 a 23:59)':`${hora(p.hora_inicio)} a ${hora(p.hora_fin)}`],
    ['Motivo',p.motivo||'—'],
    ['Solicitado por',pidio]
  ];
  datos.forEach(([k,v])=>{
    doc.setFont('helvetica','bold').setFontSize(9).setTextColor(122,127,133);
    doc.text(k+':',14,y);
    doc.setFont('helvetica','normal').setFontSize(10).setTextColor(35,39,43);
    const lineas=doc.splitTextToSize(String(v),w-66);
    doc.text(lineas,52,y);
    y+=7*lineas.length;
  });
  y+=10;
  dibujarCuadroFirmaManual(doc,w,y,firmante,p.fecha,folio);
  y+=62;
  doc.setDrawColor(122,127,133).setLineWidth(0.4).line(14,y,104,y);
  doc.setFont('helvetica','bold').setFontSize(9).setTextColor(122,127,133);
  doc.text('Autorizado por',14,y+5);
  doc.setFont('helvetica','normal').setFontSize(8);
  doc.text('Nombre y firma · Fecha: ____ / ____ / ________',14,y+10);
  doc.setFont('helvetica','normal').setFontSize(7.5).setTextColor(122,127,133);
  doc.text('Documento generado automáticamente por el sistema de Control de Asistencia y Portería.',14,288);
  return doc.output('blob');
}

async function descargarPdfPermisoHorario(id){
  if(!(puedeGuardar('permisos_horario.pedir')||puedeGuardar('permisos_horario.aprobar'))){
    mostrarErrorPermisoHorario('No tienes permiso para preparar permisos horarios.','42501');
    return;
  }
  const p=permisosHorarioLista.find(x=>Number(x.id)===Number(id));
  if(!p||p.estado!=='pendiente'){
    mostrarErrorPermisoHorario('Ese permiso ya no está pendiente. Recarga la lista.');
    return;
  }
  try{
    // La base marca el permiso como pendiente de firma en papel y entrega el folio.
    const {data,error}=await window.supabaseClient.rpc('registrar_permiso_manual',{p_id:Number(id)});
    if(error)throw error;
    guardarBlobComoArchivo(buildPermisoHorarioPdf(p,data),`permiso_horario_${p.code}_${p.fecha}_folio${String(data).padStart(6,'0')}.pdf`);
    limpiarErrorPermisoHorario();
    await cargarPermisosHorarioDia();
  }catch(error){
    mostrarErrorPermisoHorario('No se pudo preparar el PDF: '+String((error&&error.message)||error),error&&error.code?String(error.code):'');
  }
}

function subirFirmadoPermisoHorario(id,autorizar){
  if(!puedeGuardar('permisos_horario.aprobar')){
    mostrarErrorPermisoHorario('No tienes permiso para subir el respaldo de un permiso horario.','42501');
    return;
  }
  const p=permisosHorarioLista.find(x=>Number(x.id)===Number(id));
  if(!p){mostrarErrorPermisoHorario('Ese permiso ya no está en la lista. Recarga la vista.');return;}
  const input=document.createElement('input');
  input.type='file';
  input.accept='application/pdf,image/jpeg,image/png';
  input.onchange=()=>{const f=input.files&&input.files[0];if(f)procesarFirmadoPermisoHorario(p,f,!!autorizar);};
  input.click();
}

async function procesarFirmadoPermisoHorario(p,file,autorizar){
  if(permisoRespaldoEnCurso)return;
  const problema=validarArchivoRespaldo(file);
  if(problema){mostrarErrorPermisoHorario(problema);return;}
  let motivo=null;
  if(p.respaldo_path){
    motivo=window.prompt('Este permiso ya tiene un respaldo firmado, subido el '+fechaLegible(p.respaldo_subido_at,true)+'.\nPara reemplazarlo indica el motivo (mínimo 5 letras). El anterior queda registrado en el historial.');
    if(motivo===null)return;
    motivo=motivo.trim();
    if(motivo.length<5){mostrarErrorPermisoHorario('El motivo debe tener al menos 5 letras. No se reemplazó nada.');return;}
  }
  permisoRespaldoEnCurso=true;
  let guardado=false;
  try{
    const {ruta,sha}=await subirArchivoRespaldo(file,`${p.code}/permiso-${p.id}`);
    if(p.respaldo_sha256===sha&&!autorizar)throw new Error('Ese archivo es idéntico al respaldo ya subido. No se cambió nada.');
    if(p.respaldo_sha256!==sha){
      const {error}=await window.supabaseClient.rpc('subir_respaldo_permiso',{p_id:Number(p.id),p_path:ruta,p_sha256:sha,p_motivo:motivo});
      if(error)throw new Error('El archivo subió pero no se pudo registrar en el permiso: '+error.message);
    }
    guardado=true;
    if(autorizar){
      const {error}=await window.supabaseClient.rpc('resolver_permiso_horario',{
        p_id:Number(p.id),p_acepta:true,
        p_comentario:'Firmado en papel · '+folioTexto(p.folio)
      });
      if(error)throw new Error('El respaldo quedó guardado, pero el permiso NO se autorizó: '+error.message+' Cuando se pueda, usa "Confirmar".');
    }
    limpiarErrorPermisoHorario();
  }catch(error){
    mostrarErrorPermisoHorario(String((error&&error.message)||error)+(guardado?'':' El permiso sigue como estaba.'));
  }finally{
    permisoRespaldoEnCurso=false;
  }
  await cargarPermisosHorarioDia();
  await renderDiaria();
}

function marcaPermisoHorario(code){
  if(permisosHorarioDiaError)return '<small class="permisoHorarioMarca error">No se pudieron leer permisos horarios</small>';
  const permisos=permisosHorarioDia.filter(p=>p.code===code);
  if(!permisos.length)return '';
  return permisos.map(p=>{
    const estado=estadoPermisoHorario(p.estado);
    const firma=estadoFirmaPermisoHorario(p);
    const sufijo=firma?` · ${firma.texto}`:'';
    return `<small class="permisoHorarioMarca ${firma&&p.estado==='pendiente'?'pendiente':estado.clase}">Permiso ${textoSeguroPermisoHorario(franjaPermisoHorario(p))} · ${textoSeguroPermisoHorario(estado.texto+sufijo)}</small>`;
  }).join('');
}