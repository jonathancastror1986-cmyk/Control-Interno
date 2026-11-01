// APROBADORES DE EMPRESA (Soporte)
// ================================
// Configura, por empresa, qué trámites necesitan aprobación y quién aprueba cada
// paso. Usa lo que dejó la migración 103: tipos_aprobables, empresa_flujos y
// empresa_flujo_pasos. La 103 no trae una función para guardar la configuración:
// se escribe en las dos tablas de flujos, y la RLS ("flujos escribir" y
// "pasos escribir") exige el permiso aprobaciones.configurar y la empresa.
// Los trámites ya iniciados guardan una copia congelada de los pasos, así que
// cambiar un flujo nunca los toca. Los nombres llevan el prefijo "apb" porque
// los scripts comparten el ámbito global.

let apbEmpresaId='';
let apbTipos=null;                 // [{codigo,nombre,modulo}]
let apbGente={usuarios:[],roles:[]};   // usuarios: [{id,nombre,rol}], roles: [{rol,nombre}]
let apbFlujos={};                  // codigo -> estado editable del flujo
let apbListeners=false;

function apbEsc(t){return String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function apbMsgGeneral(texto,tipo){
  const el=document.getElementById('apbMsg');
  if(!el)return;
  el.textContent=texto||'';
  el.className='apb-msg'+(tipo?(' '+tipo):'');
}
function apbCard(codigo){return document.querySelector('#apbLista [data-tipo="'+codigo+'"]');}
function apbMsgTipo(codigo,texto,tipo){
  const c=apbCard(codigo);
  const el=c&&c.querySelector('.apb-msg-tipo');
  if(!el)return;
  el.textContent=texto||'';
  el.className='apb-msg-tipo apb-msg'+(tipo?(' '+tipo):'');
}
function apbEstado(codigo){
  if(!apbFlujos[codigo]){
    apbFlujos[codigo]={id:null,requiere:false,momento:'antes',pasos:[],base:{requiere:false,pasos:0},sucio:false};
  }
  return apbFlujos[codigo];
}
function apbNombreRol(rol){
  const r=apbGente.roles.find(x=>x.rol===rol);
  return r?r.nombre:rol;
}
function apbNombreUsuario(id){
  const u=apbGente.usuarios.find(x=>x.id===id);
  return u?u.nombre:('usuario '+String(id).slice(0,8));
}

// ---------- carga ----------
async function initAprobadoresEmpresa(){
  if(typeof exigirPermiso==='function'&&!exigirPermiso('aprobaciones.configurar','Necesitas el permiso "Configurar flujos y aprobadores" para abrir esta pantalla. Pídeselo a un administrador.'))return;
  const sel=document.getElementById('apbEmpresa');
  if(!sel)return;
  if(!apbListeners){
    const lista=document.getElementById('apbLista');
    lista.addEventListener('click',apbClick);
    lista.addEventListener('change',apbCambio);
    lista.addEventListener('input',apbEntrada);
    apbListeners=true;
  }
  const emps=(typeof empresas!=='undefined'&&Array.isArray(empresas))?empresas:[];
  if(!emps.length){
    sel.innerHTML='<option value="">(sin empresas)</option>';
    apbMsgGeneral('No hay empresas disponibles. Revisa que tu usuario tenga empresas asignadas.','error');
    return;
  }
  const previo=apbEmpresaId||sel.value;
  sel.innerHTML='<option value="">Elige una empresa…</option>'+emps.map(e=>'<option value="'+apbEsc(e.id)+'">'+apbEsc(e.nombre)+'</option>').join('');
  if(previo&&emps.some(e=>String(e.id)===String(previo)))sel.value=previo;
  apbElegirEmpresa(sel.value);
}

async function apbCargarTipos(){
  if(apbTipos)return;
  const {data,error}=await window.supabaseClient.from('tipos_aprobables')
    .select('codigo,nombre,modulo').eq('activo',true).order('modulo').order('nombre');
  if(error)throw new Error('No se pudo leer el catálogo de trámites: '+error.message+'. Revisa que la migración 103 esté aplicada.');
  apbTipos=data||[];
}

async function apbCargarGente(empresaId){
  const sb=window.supabaseClient;
  const [pe,adm,rs]=await Promise.all([
    sb.from('perfil_empresas').select('user_id').eq('empresa_id',empresaId),
    sb.from('perfiles').select('id,nombre,rol,activo').eq('rol','admin'),
    sb.from('roles_sistema').select('rol,nombre').order('orden')
  ]);
  if(pe.error)throw new Error('No se pudo leer quién tiene acceso a la empresa: '+pe.error.message);
  if(rs.error)throw new Error('No se pudo leer la lista de roles: '+rs.error.message);
  const ids=(pe.data||[]).map(x=>x.user_id);
  let perfiles=[];
  if(ids.length){
    const r=await sb.from('perfiles').select('id,nombre,rol,activo').in('id',ids);
    if(r.error)throw new Error('No se pudo leer los usuarios de la empresa: '+r.error.message);
    perfiles=r.data||[];
  }
  // Administración ve todas las empresas aunque no figure en perfil_empresas.
  const mapa=new Map();
  perfiles.concat(adm.data||[]).forEach(p=>{if(p.activo)mapa.set(p.id,{id:p.id,nombre:p.nombre||'(sin nombre)',rol:p.rol});});
  apbGente={
    usuarios:Array.from(mapa.values()).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')),
    roles:rs.data||[]
  };
}

async function apbCargarFlujos(empresaId){
  const sb=window.supabaseClient;
  const {data:fs,error}=await sb.from('empresa_flujos').select('id,tipo,requiere_aprobacion,momento').eq('empresa_id',empresaId);
  if(error)throw new Error('No se pudo leer los flujos de la empresa: '+error.message);
  let pasos=[];
  const ids=(fs||[]).map(f=>f.id);
  if(ids.length){
    const r=await sb.from('empresa_flujo_pasos')
      .select('flujo_id,orden,nombre,regla,roles,usuarios,restringir_centro').in('flujo_id',ids).order('orden');
    if(r.error)throw new Error('No se pudo leer los pasos: '+r.error.message);
    pasos=r.data||[];
  }
  return {fs:fs||[],pasos};
}
function apbAplicarFlujo(codigo,fila,pasosDb){
  const f={id:null,requiere:false,momento:'antes',pasos:[],base:{requiere:false,pasos:0},sucio:false};
  if(fila){
    f.id=fila.id;
    f.requiere=!!fila.requiere_aprobacion;
    f.momento=fila.momento||'antes';
    f.pasos=pasosDb.filter(p=>p.flujo_id===fila.id).map(p=>({
      nombre:p.nombre,regla:p.regla,roles:(p.roles||[]).slice(),usuarios:(p.usuarios||[]).slice(),
      restringir_centro:p.restringir_centro!==false
    }));
    f.base={requiere:f.requiere,pasos:f.pasos.length};
  }
  apbFlujos[codigo]=f;
}

async function apbElegirEmpresa(valor){
  apbEmpresaId=valor||'';
  const lista=document.getElementById('apbLista');
  if(!apbEmpresaId){
    lista.innerHTML='';
    apbMsgGeneral('Elige una empresa para ver sus trámites.','');
    return;
  }
  apbMsgGeneral('Cargando…','');
  try{
    await apbCargarTipos();
    await apbCargarGente(apbEmpresaId);
    const {fs,pasos}=await apbCargarFlujos(apbEmpresaId);
    apbFlujos={};
    apbTipos.forEach(t=>apbAplicarFlujo(t.codigo,fs.find(f=>f.tipo===t.codigo),pasos));
    apbPintar();
    const con=apbTipos.filter(t=>apbFlujos[t.codigo].base.requiere&&apbFlujos[t.codigo].base.pasos>0).length;
    apbMsgGeneral(con+' de '+apbTipos.length+' trámites de esta empresa ya tienen flujo.','ok');
  }catch(e){
    lista.innerHTML='';
    apbMsgGeneral(e.message+' Vuelve a elegir la empresa para reintentar.','error');
  }
}

// ---------- dibujo ----------
function apbResumen(f){
  if(!f.pasos.length)return 'Sin pasos todavía.';
  return f.pasos.map((p,i)=>{
    const nombres=p.roles.map(apbNombreRol).concat(p.usuarios.map(apbNombreUsuario));
    const union=p.regla==='todos'?' y ':' o ';
    return (i+1)+'. '+(p.nombre.trim()||'(sin nombre)')+(nombres.length?' ('+nombres.join(union)+')':' (sin aprobadores)');
  }).join(' → ');
}
function apbInsignia(f){
  if(f.base.requiere&&f.base.pasos>0)return {txt:'Con flujo · '+f.base.pasos+(f.base.pasos===1?' paso':' pasos'),clase:'ok'};
  if(f.base.requiere)return {txt:'Exige aprobación pero no tiene pasos',clase:'mal'};
  if(f.base.pasos>0)return {txt:'Flujo apagado ('+f.base.pasos+' pasos guardados)',clase:'neutro'};
  return {txt:'Sin flujo',clase:'neutro'};
}
function apbHtmlPaso(f,p,i){
  const todos=p.regla==='todos';
  const roles=apbGente.roles.map(r=>
    '<label class="apb-op"><input type="checkbox" data-campo="rol" value="'+apbEsc(r.rol)+'"'+(p.roles.includes(r.rol)?' checked':'')+(todos?' disabled':'')+'> '+apbEsc(r.nombre||r.rol)+'</label>').join('');
  const usuarios=apbGente.usuarios.length?apbGente.usuarios.map(u=>
    '<label class="apb-op"><input type="checkbox" data-campo="usuario" value="'+apbEsc(u.id)+'"'+(p.usuarios.includes(u.id)?' checked':'')+'> '+apbEsc(u.nombre)+' <small>('+apbEsc(apbNombreRol(u.rol))+')</small></label>').join('')
    :'<small>Esta empresa no tiene usuarios con acceso. Asígnaselos desde Usuarios.</small>';
  // Usuarios que ya no pertenecen a la empresa pero siguen elegidos: se muestran para poder quitarlos.
  const huerfanos=p.usuarios.filter(id=>!apbGente.usuarios.some(u=>u.id===id)).map(id=>
    '<label class="apb-op apb-op-mal"><input type="checkbox" data-campo="usuario" value="'+apbEsc(id)+'" checked> '+apbEsc(apbNombreUsuario(id))+' <small>(sin acceso a esta empresa)</small></label>').join('');
  return '<div class="apb-paso" data-i="'+i+'">'
    +'<div class="apb-paso-cab"><b>Paso '+(i+1)+'</b><span class="apb-acciones">'
    +'<button type="button" class="btn secondary" data-act="subir"'+(i===0?' disabled':'')+' aria-label="Subir el paso '+(i+1)+'">↑ Subir</button>'
    +'<button type="button" class="btn secondary" data-act="bajar"'+(i===f.pasos.length-1?' disabled':'')+' aria-label="Bajar el paso '+(i+1)+'">↓ Bajar</button>'
    +'<button type="button" class="btn secondary" data-act="quitar" aria-label="Quitar el paso '+(i+1)+'">Quitar</button></span></div>'
    +'<div class="apb-fila">'
    +'<div><label>Nombre del paso</label><input type="text" maxlength="80" data-campo="nombre" value="'+apbEsc(p.nombre)+'" placeholder="Ej.: Jefe de terreno"></div>'
    +'<div><label>Regla</label><select data-campo="regla"><option value="cualquiera"'+(todos?'':' selected')+'>Cualquiera de estos</option><option value="todos"'+(todos?' selected':'')+'>Todos (solo usuarios)</option></select></div>'
    +'</div>'
    +'<fieldset class="apb-grupo"><legend>Roles'+(todos?' (no aplica con "todos")':'')+'</legend><div class="apb-ops">'+roles+'</div></fieldset>'
    +'<fieldset class="apb-grupo"><legend>Usuarios de esta empresa</legend><div class="apb-ops">'+usuarios+huerfanos+'</div></fieldset>'
    +'<label class="apb-op"><input type="checkbox" data-campo="centro"'+(p.restringir_centro?' checked':'')+'> Solo aprobadores con el centro de costo del documento</label>'
    +'</div>';
}
function apbHtmlTipo(t){
  const f=apbEstado(t.codigo);
  const ins=apbInsignia(f);
  let cuerpo='';
  if(f.requiere){
    cuerpo='<div class="apb-cuerpo">'
      +'<div class="apb-fila"><div><label>Momento</label><select data-campo="momento">'
      +'<option value="antes"'+(f.momento==='antes'?' selected':'')+'>Antes de ejecutar</option>'
      +'<option value="despues"'+(f.momento==='despues'?' selected':'')+'>Después de ejecutar</option></select></div></div>'
      +f.pasos.map((p,i)=>apbHtmlPaso(f,p,i)).join('')
      +'<div class="apb-barra"><button type="button" class="btn secondary" data-act="agregar">+ Agregar paso</button></div>'
      +'<p class="apb-resumen" data-resumen><b>Resumen:</b> '+apbEsc(apbResumen(f))+'</p>'
      +'</div>';
  }
  return '<div class="apb-tipo" data-tipo="'+apbEsc(t.codigo)+'">'
    +'<div class="apb-cab">'
    +'<label class="apb-check"><input type="checkbox" data-campo="requiere"'+(f.requiere?' checked':'')+'> Necesita aprobadores</label>'
    +'<span class="apb-nombre"><b>'+apbEsc(t.nombre)+'</b> <small>'+apbEsc(t.modulo)+'</small></span>'
    +'<span class="apb-insignia '+ins.clase+'">'+apbEsc(ins.txt)+'</span>'
    +'<span class="apb-sucio" '+(f.sucio?'':'hidden')+'>Cambios sin guardar</span>'
    +'</div>'+cuerpo
    +'<div class="apb-pie"><button type="button" class="btn" data-act="guardar">Guardar este trámite</button>'
    +'<small class="apb-msg-tipo apb-msg" role="status"></small></div>'
    +'<small class="apb-nota">Los trámites que ya están en curso conservan el flujo que tenían; el cambio vale para los que se inicien desde ahora.</small>'
    +'</div>';
}
function apbPintar(){
  const lista=document.getElementById('apbLista');
  lista.innerHTML=(apbTipos||[]).map(apbHtmlTipo).join('')||'<small>No hay trámites configurables.</small>';
}
function apbPintarTipo(codigo){
  const t=(apbTipos||[]).find(x=>x.codigo===codigo);
  const c=apbCard(codigo);
  if(!t||!c)return;
  c.outerHTML=apbHtmlTipo(t);
}
function apbMarcarSucio(codigo){
  const f=apbEstado(codigo);
  f.sucio=true;
  const c=apbCard(codigo);
  const s=c&&c.querySelector('.apb-sucio');
  if(s)s.hidden=false;
}
function apbActualizarResumen(codigo){
  const c=apbCard(codigo);
  const r=c&&c.querySelector('[data-resumen]');
  if(r)r.innerHTML='<b>Resumen:</b> '+apbEsc(apbResumen(apbEstado(codigo)));
}

// ---------- eventos ----------
function apbContexto(ev){
  const card=ev.target.closest('[data-tipo]');
  if(!card)return null;
  const pasoEl=ev.target.closest('[data-i]');
  return {codigo:card.dataset.tipo,i:pasoEl?parseInt(pasoEl.dataset.i,10):-1};
}
function apbClick(ev){
  const b=ev.target.closest('[data-act]');
  const ctx=apbContexto(ev);
  if(!b||!ctx)return;
  const f=apbEstado(ctx.codigo);
  const act=b.dataset.act;
  if(act==='agregar'){
    f.pasos.push({nombre:'',regla:'cualquiera',roles:[],usuarios:[],restringir_centro:true});
  }else if(act==='quitar'&&ctx.i>=0){
    f.pasos.splice(ctx.i,1);
  }else if((act==='subir'||act==='bajar')&&ctx.i>=0){
    const j=act==='subir'?ctx.i-1:ctx.i+1;
    if(j<0||j>=f.pasos.length)return;
    const tmp=f.pasos[ctx.i];f.pasos[ctx.i]=f.pasos[j];f.pasos[j]=tmp;
  }else if(act==='guardar'){
    apbGuardar(ctx.codigo);
    return;
  }else{
    return;
  }
  f.sucio=true;
  apbPintarTipo(ctx.codigo);
}
function apbCambio(ev){
  const ctx=apbContexto(ev);
  const campo=ev.target.dataset&&ev.target.dataset.campo;
  if(!ctx||!campo)return;
  const f=apbEstado(ctx.codigo);
  const p=ctx.i>=0?f.pasos[ctx.i]:null;
  if(campo==='requiere'){
    f.requiere=ev.target.checked;
    if(f.requiere&&!f.pasos.length)f.pasos.push({nombre:'',regla:'cualquiera',roles:[],usuarios:[],restringir_centro:true});
    f.sucio=true;
    apbPintarTipo(ctx.codigo);
    return;
  }
  if(campo==='momento'){f.momento=ev.target.value==='despues'?'despues':'antes';apbMarcarSucio(ctx.codigo);return;}
  if(!p)return;
  if(campo==='regla'){
    p.regla=ev.target.value==='todos'?'todos':'cualquiera';
    if(p.regla==='todos'&&p.roles.length){
      p.roles=[];
      apbMsgTipo(ctx.codigo,'Con la regla "todos" solo se eligen usuarios: se quitaron los roles de ese paso.','');
    }
    f.sucio=true;
    apbPintarTipo(ctx.codigo);
    return;
  }
  const lista=campo==='rol'?p.roles:campo==='usuario'?p.usuarios:null;
  if(lista){
    const v=ev.target.value;
    const k=lista.indexOf(v);
    if(ev.target.checked&&k<0)lista.push(v);
    if(!ev.target.checked&&k>=0)lista.splice(k,1);
  }else if(campo==='centro'){
    p.restringir_centro=ev.target.checked;
  }
  apbMarcarSucio(ctx.codigo);
  apbActualizarResumen(ctx.codigo);
}
function apbEntrada(ev){
  const ctx=apbContexto(ev);
  if(!ctx||ctx.i<0||!ev.target.dataset||ev.target.dataset.campo!=='nombre')return;
  apbEstado(ctx.codigo).pasos[ctx.i].nombre=ev.target.value;
  apbMarcarSucio(ctx.codigo);
  apbActualizarResumen(ctx.codigo);
}

// ---------- validar y guardar ----------
// Devuelve un texto con el problema, o '' si el flujo se puede guardar.
function apbValidar(f){
  if(!f.requiere)return '';
  if(!f.pasos.length)return 'Agrega al menos un paso, o desmarca "Necesita aprobadores".';
  for(let i=0;i<f.pasos.length;i++){
    const p=f.pasos[i];
    const n='Paso '+(i+1);
    if(!p.nombre.trim())return n+': escribe un nombre.';
    if(!p.roles.length&&!p.usuarios.length)return n+': elige al menos un rol o un usuario que apruebe.';
    if(p.regla==='todos'&&(p.roles.length||!p.usuarios.length))return n+': con la regla "todos" solo se eligen usuarios, no roles.';
    for(const id of p.usuarios){
      if(!apbGente.usuarios.some(u=>u.id===id))return n+': '+apbNombreUsuario(id)+' no tiene acceso a esta empresa o está inactivo. Quítalo o asígnale la empresa en Usuarios.';
    }
    for(const rol of p.roles){
      const alcanza=rol==='admin'||apbGente.usuarios.some(u=>u.rol===rol);
      if(!alcanza)return n+': ningún usuario activo con el rol "'+apbNombreRol(rol)+'" ve esta empresa, así que nadie podría aprobar. Elige otro rol o asigna la empresa a alguien con ese rol.';
    }
  }
  return '';
}
async function apbGuardar(codigo){
  const f=apbEstado(codigo);
  const empresaId=parseInt(apbEmpresaId,10);
  if(!empresaId){apbMsgTipo(codigo,'Elige una empresa primero.','error');return;}
  const btn=apbCard(codigo)&&apbCard(codigo).querySelector('[data-act="guardar"]');
  if(btn)btn.disabled=true;
  try{
    await apbCargarGente(apbEmpresaId);   // el acceso pudo cambiar desde que se abrió la pantalla
    const problema=apbValidar(f);
    if(problema){apbMsgTipo(codigo,problema,'error');return;}
    const sb=window.supabaseClient;
    // El flujo queda apagado hasta que los pasos estén completos: si algo falla a medias
    // la empresa no queda exigiendo una aprobación sin pasos.
    const up=await sb.from('empresa_flujos')
      .upsert({empresa_id:empresaId,tipo:codigo,requiere_aprobacion:false,momento:f.momento},{onConflict:'empresa_id,tipo'})
      .select('id').single();
    if(up.error)throw new Error('No se pudo guardar el flujo: '+up.error.message);
    const flujoId=up.data.id;
    if(f.requiere){
      const del=await sb.from('empresa_flujo_pasos').delete().eq('flujo_id',flujoId);
      if(del.error)throw new Error('No se pudieron reemplazar los pasos: '+del.error.message);
      const ins=await sb.from('empresa_flujo_pasos').insert(f.pasos.map((p,i)=>({
        flujo_id:flujoId,orden:i+1,nombre:p.nombre.trim(),regla:p.regla,roles:p.roles,usuarios:p.usuarios,restringir_centro:p.restringir_centro
      })));
      if(ins.error)throw new Error('No se pudieron guardar los pasos (el flujo quedó apagado): '+ins.error.message);
      const on=await sb.from('empresa_flujos').update({requiere_aprobacion:true}).eq('id',flujoId);
      if(on.error)throw new Error('Los pasos se guardaron pero no se pudo activar el flujo: '+on.error.message);
    }
    const {fs,pasos}=await apbCargarFlujos(empresaId);
    apbAplicarFlujo(codigo,fs.find(x=>x.tipo===codigo),pasos);
    apbPintarTipo(codigo);
    apbMsgTipo(codigo,'Guardado. Los trámites en curso conservan el flujo que tenían.','ok');
  }catch(e){
    apbMsgTipo(codigo,e.message+' Revisa tu conexión y vuelve a pulsar Guardar.','error');
  }finally{
    const b=apbCard(codigo)&&apbCard(codigo).querySelector('[data-act="guardar"]');
    if(b)b.disabled=false;
  }
}
