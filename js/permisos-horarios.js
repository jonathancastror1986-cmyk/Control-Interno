let permisosHorarioLista = [];
let permisosHorarioError = '';
let permisosHorarioDia = [];
let permisosHorarioDiaError = '';

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

function estadoPermisoHorario(estado){
  if(estado==='confirmado')return {texto:'Confirmado',clase:'confirmado'};
  if(estado==='anulado')return {texto:'Anulado',clase:'anulado'};
  return {texto:'Pendiente · Nadie lo ha revisado',clase:'pendiente'};
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
    const puedeResolver = p.estado==='pendiente' && puedeGuardar('tarja.aprobar_cambio');
    return `<tr>
      <td>${textoSeguroPermisoHorario(persona?persona.name:p.code)}</td>
      <td>${textoSeguroPermisoHorario(String(p.hora_inicio||'').slice(0,5))}–${textoSeguroPermisoHorario(String(p.hora_fin||'').slice(0,5))}</td>
      <td>${textoSeguroPermisoHorario(p.motivo)}</td>
      <td><span class="permisoHorarioEstado ${estado.clase}">${textoSeguroPermisoHorario(estado.texto)}</span></td>
      <td>${textoSeguroPermisoHorario(p.pedido_por_nombre||'Sin nombre')}<small class="permisoHorarioMeta">${textoSeguroPermisoHorario(p.pedido_por_rol||'')}${pedidoCuando?' · '+textoSeguroPermisoHorario(pedidoCuando):''}</small></td>
      <td>${p.confirmado_por_nombre?textoSeguroPermisoHorario(p.confirmado_por_nombre):'—'}${resueltoCuando?`<small class="permisoHorarioMeta">${textoSeguroPermisoHorario(resueltoCuando)}</small>`:''}${p.comentario?`<small class="permisoHorarioMeta">${textoSeguroPermisoHorario(p.comentario)}</small>`:''}
        ${puedeResolver?`<div class="row" style="margin-top:6px;gap:6px;justify-content:flex-start"><button class="btn" type="button" onclick="resolverPermisoHorario(${Number(p.id)},true)">Confirmar</button><button class="btn secondary" type="button" onclick="resolverPermisoHorario(${Number(p.id)},false)">Anular</button></div>`:''}
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
      .select('id,code,fecha,hora_inicio,hora_fin,motivo,estado,pedido_por_nombre,pedido_por_rol,creado_en,confirmado_por_nombre,confirmado_at,comentario')
      .eq('fecha',fechaConsulta).in('code',codesConsulta).order('hora_inicio');
    if(error)throw error;
    permisosHorarioLista=Array.isArray(data)?data:[];
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
      .select('code,fecha,hora_inicio,hora_fin,estado')
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
  if(!puedeGuardar('tarja.marcaje')){
    mostrarErrorPermisoHorario('No tienes permiso para pedir permisos horarios.', '42501');
    return;
  }
  const codigo=document.getElementById('permisoHorarioPersona');
  const fecha=document.getElementById('permisoHorarioFecha');
  const inicio=document.getElementById('permisoHorarioInicio');
  const fin=document.getElementById('permisoHorarioFin');
  const motivo=document.getElementById('permisoHorarioMotivo');
  const comentario=document.getElementById('permisoHorarioComentario');
  const pCode=codigo?codigo.value:'';
  const pFecha=fecha?fecha.value:'';
  const pInicio=inicio?inicio.value:'';
  const pFin=fin?fin.value:'';
  const pMotivo=motivo?motivo.value.trim():'';
  const pComentario=comentario?comentario.value.trim():'';
  if(!pCode){mostrarErrorPermisoHorario('Selecciona una persona para pedir el permiso.', '22023');return;}
  if(!pFecha){mostrarErrorPermisoHorario('Falta la fecha del permiso.', '22023');return;}
  if(!pInicio||!pFin){mostrarErrorPermisoHorario('Faltan las horas del permiso.', '22023');return;}
  if(!pMotivo){mostrarErrorPermisoHorario('Falta el motivo del permiso. Un permiso sin motivo no se puede defender.', '22023');return;}
  if(pFin<=pInicio){mostrarErrorPermisoHorario('La hora de fin tiene que ser posterior a la de inicio.', '22023');return;}
  try{
    const {error}=await window.supabaseClient.rpc('pedir_permiso_horario',{
      p_code:pCode,
      p_fecha:pFecha,
      p_hora_inicio:pInicio,
      p_hora_fin:pFin,
      p_motivo:pMotivo,
      p_comentario:pComentario||null
    });
    if(error)throw error;
    limpiarErrorPermisoHorario();
    if(motivo)motivo.value='';
    if(comentario)comentario.value='';
    if(inicio)inicio.value='';
    if(fin)fin.value='';
    await cargarPermisosHorarioDia();
    await renderDiaria();
  }catch(error){
    const codigoM=error&&error.code?String(error.code):'';
    const msg=String((error&&error.message)||error||'No se pudo guardar el permiso.');
    mostrarErrorPermisoHorario(msg, codigoM);
  }
}

async function resolverPermisoHorario(id, acepta, comentario){
  if(!puedeGuardar('tarja.aprobar_cambio')){
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

function marcaPermisoHorario(code){
  if(permisosHorarioDiaError)return '<small class="permisoHorarioMarca error">No se pudieron leer permisos horarios</small>';
  const permisos=permisosHorarioDia.filter(p=>p.code===code);
  if(!permisos.length)return '';
  return permisos.map(p=>{
    const estado=estadoPermisoHorario(p.estado);
    return `<small class="permisoHorarioMarca ${estado.clase}">Permiso ${textoSeguroPermisoHorario(String(p.hora_inicio||'').slice(0,5))}–${textoSeguroPermisoHorario(String(p.hora_fin||'').slice(0,5))} · ${textoSeguroPermisoHorario(estado.texto)}</small>`;
  }).join('');
}