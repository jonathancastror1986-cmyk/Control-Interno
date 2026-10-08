/* ===================================================================
   js/soporte.js - SOPORTE
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
   - INVITAR USUARIO DESDE LA APP
   - ENVIAR LA INVITACIÓN POR CORREO
   - DAR DE ALTA SIN CORREO
   - MIS DATOS
   - QUÉ MIGRACIÓN FALTA
   - ROLES Y PERMISOS
   - COMPROBACIÓN DE COHERENCIA DE PERMISOS

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
// El alta se decide acá y no en el panel de Supabase por dos razones:
//
//  1. El envío de invitaciones de Supabase manda un enlace a la "Site
//     URL" configurada en el proyecto, que suele ser localhost: la
//     persona recibe un link que no abre. Con este flujo no hay correo
//     ni redirección: la app le da el enlace directo a registro.html.
//
//  2. Al registrarse, el trigger handle_new_user (migración 019) le
//     aplica los roles, la empresa y la ficha que se eligen acá. No
//     hay que buscarla después a mano para "activarla".
//
// La app NO envía correos: eso lo hace el administrador, por el medio
// que prefiera (WhatsApp, correo, en persona). Lo que hace la app es
// dejarle el enlace listo para copiar.
let invitacionesCache=[];

async function initInvitarUsuario(){
  const cont=document.getElementById('inv-roles');
  if(!cont)return;
  if(!exigirPermiso('sistema.usuarios','Solo un administrador puede invitar usuarios.')){
    cont.innerHTML='<small class="gpsWarn">Sin permiso.</small>';
    return;
  }
  if(!catalogoRoles.length)await cargarCatalogosPermisos();
  cont.innerHTML=catalogoRoles.map(r=>
    `<label style="width:auto;display:inline-flex;align-items:center;gap:5px;margin:0 14px 6px 0;text-transform:none;font-size:.8rem;cursor:pointer">
       <input type="checkbox" class="invRol" value="${r.rol}" style="width:auto"> ${escHtml(r.nombre)}
     </label>`).join('')
    ||'<small>No hay catálogo de roles. Falta la migración 013.</small>';

  // Cualquier trabajador puede ser la ficha, no solo los supervisores.
  const selFicha=document.getElementById('inv-ficha');
  const previo=selFicha.value;
  selFicha.innerHTML='<option value="">Sin ficha — ve todos los trabajadores</option>'+
    workers.map(w=>`<option value="${escHtml(w.code)}">${escHtml(codigoMostrar(w.code)+' - '+w.name+(w.is_supervisor?' (supervisor)':''))}</option>`).join('');
  if(workers.some(w=>w.code===previo))selFicha.value=previo;

  // Empresas: solo las que este administrador puede ver.
  const selEmp=document.getElementById('inv-empresa');
  const previoEmp=selEmp.value;
  selEmp.innerHTML=empresas.map(e=>`<option value="${e.id}">${escHtml(e.nombre)}</option>`).join('')
    ||'<option value="">Sin empresa</option>';
  if(empresas.some(e=>String(e.id)===previoEmp))selEmp.value=previoEmp;

  document.getElementById('invResultado').innerHTML='';
  loadInvitaciones();
  loadAltasCuentas();
  avisarSiteUrl();
  // Se comprueba al abrir, no al pulsar: descubrir que la función no
  // está desplegada cuando ya estás creando la cuenta de alguien es
  // enterarse del problema a destiempo.
  comprobarFuncionesDesplegadas();
}

// El enlace de invitación que manda Supabase vuelve a su "Site URL". Si
// esa quedó en localhost, la persona recibe un enlace que no abre
// (ERR_CONNECTION_REFUSED). Desde la app no se puede leer esa
// configuración, así que se revisa lo que sí se sabe: la dirección con la
// que se está entrando ahora.
function avisarSiteUrl(host){
  const caja=document.getElementById('avisoSiteUrl');
  if(!caja)return;
  host=host!==undefined?host:location.hostname;
  if(host && host!=='localhost' && host!=='127.0.0.1' && !/^\d+\.\d+\.\d+\.\d+$/.test(host)){
    caja.innerHTML='';   // todo bien: hay una dirección real
    return;
  }
  caja.innerHTML='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px">'+
    '<b>Atención: la app está en '+escHtml(host||'una dirección local')+'.</b><br>'+
    '<small>Si la abriste desde la página de alguien más, su enlace de invitación le va a llegar '+
    'apuntando a <b>localhost</b>, que no le va a abrir. Se arregla en '+
    '<b>Supabase → Authentication → URL Configuration → Site URL</b>, poniendo ahí la dirección real '+
    'de la app. Mientras tanto, el enlace que aparece arriba en "Generar invitación" sí funciona, '+
    'porque se arma con la dirección desde la que estás entrando.</small></div>';
}

function enlaceDeRegistro(inv){
  // El enlace lleva el correo y el nombre ya escritos: a la persona
  // solo le queda poner la contraseña. Se arma con la dirección real
  // de la app, no con "localhost", que es lo que rompía el enlace de
  // Supabase.
  const base=location.origin+location.pathname.replace(/[^/]*$/,'');
  const p=new URLSearchParams({email:inv.correo});
  if(inv.nombre)p.set('nombre',inv.nombre);
  return base+'registro.html?'+p.toString();
}

async function crearInvitacion(){
  const msg=document.getElementById('invMsg');
  if(!exigirPermiso('sistema.usuarios'))return;
  const correo=document.getElementById('inv-correo').value.trim().toLowerCase();
  const nombre=document.getElementById('inv-nombre').value.trim();
  const roles=[...document.querySelectorAll('.invRol:checked')].map(c=>c.value);
  const ficha=document.getElementById('inv-ficha').value||null;
  const empresa=document.getElementById('inv-empresa').value||null;
  const dias=document.getElementById('inv-vence').value;
  const notas=document.getElementById('inv-notas').value.trim()||null;

  const limpiar=()=>{msg.textContent='';};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){
    msg.innerHTML='<span class="gpsWarn">Escribe un correo válido.</span>';return;
  }
  if(!roles.length){
    msg.innerHTML='<span class="gpsWarn">Marca al menos un permiso, si no la persona no podrá hacer nada.</span>';return;
  }

  // Si el correo ya tiene una cuenta, avisar antes de seguir: la
  // invitación no crearía nada y la persona terminaría con la
  // contraseña que ya tiene.
  const {data:yaExiste}=await window.supabaseClient.from('perfiles').select('id,nombre,activo').limit(200);
  const previo=(yaExiste||[]).find(p=>p.correo&&String(p.correo).toLowerCase()===correo);
  if(previo){
    msg.innerHTML=`<span class="gpsWarn">Ese correo ya tiene una cuenta (${escHtml(previo.nombre||'')}). `+
      'No hace falta invitarlo: cámbale los permisos en <b>Usuarios</b>.</span>';
    return;
  }

  // Si ya hay una invitación pendiente para ese correo, se reemplaza en
  // vez de acumular: el índice único lo impide, así que primero se
  // cancela la anterior.
  await window.supabaseClient.from('invitaciones')
    .update({estado:'cancelada'}).eq('correo',correo).eq('estado','pendiente');

  const {data:sesion}=await window.supabaseClient.auth.getSession();
  const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
  const fila={
    correo,
    nombre:nombre||null,
    roles,
    empresa_id:empresa?Number(empresa):null,
    trabajador_code:ficha,
    notas,
    estado:'pendiente',
    creado_por:miId,
    creado_por_nombre:miNombrePerfil(),
    expira_at:dias?new Date(Date.now()+Number(dias)*86400000).toISOString():null
  };
  const {data,error}=await window.supabaseClient.from('invitaciones').insert(fila).select().single();
  if(error){
    // Si la tabla no existe, el mensaje dice exactamente qué falta.
    if(/does not exist|schema cache/i.test(error.message)){
      msg.innerHTML='<span class="gpsWarn">Falta la migración 019. Ejecuta <b>019_invitaciones_perfiles.sql</b> en el editor de Supabase.</span>';
    }else if(/duplicate key|unique/i.test(error.message)){
      msg.innerHTML='<span class="gpsWarn">Ese correo ya tiene una invitación pendiente. Cancélala en la lista de abajo o usa "Volver a invitar".</span>';
    }else{
      msg.innerHTML='<span class="gpsWarn">No se pudo crear la invitación: '+escHtml(error.message)+'</span>';
    }
    return;
  }

  invitacionesCache.unshift(data);
  limpiar();
  ['inv-correo','inv-nombre','inv-notas'].forEach(id=>document.getElementById(id).value='');
  document.querySelectorAll('.invRol').forEach(c=>c.checked=false);
  mostrarInvitacionCreada(data);
  // Se espera el refresco: quien llama a esta función (o el test) debe
  // poder confiar en que la lista ya muestra lo que se acaba de crear.
  await loadInvitaciones();
  avisarSiteUrl();
}

// Al crear una, se muestra el enlace listo para copiar: es lo único
// que tiene que hacer el administrador.
function mostrarInvitacionCreada(inv){
  const caja=document.getElementById('invResultado');
  if(!caja)return;
  const enlace=enlaceDeRegistro(inv);
  const texto=`Hola ${inv.nombre||''}, te creamos tu cuenta en Control de Asistencia.
Entra a este enlace y pon tu contraseña: ${enlace}`;
  caja.innerHTML=`<div style="border:1px solid var(--accent);border-radius:8px;padding:12px;background:rgba(46,125,50,.06)">
    <b>Invitación creada para ${escHtml(inv.correo)}</b>
    <small style="display:block;color:var(--muted);margin:4px 0 8px">Copia el enlace y mándaselo por el medio que quieras.
      La persona solo tiene que poner su contraseña: los permisos ya quedan asignados.</small>
    <div class="row">
      <input id="invEnlace" readonly value="${escHtml(enlace)}" style="flex:1;min-width:220px;font-size:.78rem"
        onclick="this.select()">
      <button class="btn" type="button" onclick="copiarEnlaceInvitacion()">Copiar enlace</button>
      <button class="btn secondary" type="button" onclick="copiarMensajeInvitacion()">Copiar mensaje</button>
    </div>
  </div>`;
}
// ====================================================================
// ENVIAR LA INVITACIÓN POR CORREO

// ====================================================================
// El correo lo manda Supabase, no la app. Llamar a la API que envía
// invitaciones exige la service_role, y esa clave no puede estar en el
// navegador: quien la tuviera podría hacer cualquier cosa con la base.
// Por eso la llamada pasa por la Edge Function "invitar", que sí la
// puede usar porque corre en el servidor de Supabase.
//
// Si la función no está desplegada, o el proyecto no tiene SMTP
// configurado, se avisa con el mensaje real y el flujo de copiar el
// enlace sigue igual: la persona recibe el enlace por el medio que sea.
async function enviarInvitacionPorCorreo(){
  if(!exigirPermiso('sistema.usuarios'))return;
  const msg=document.getElementById('invEnvioMsg');
  const btn=document.getElementById('btnEnviarInv');
  // Se envía la última invitación que se acaba de generar; si no hay
  // ninguna a la vista, se pide el correo.
  let correo='';
  const enlace=document.getElementById('invEnlace');
  if(enlace){
    try{correo=new URL(enlace.value,location.href).searchParams.get('email')||'';}catch(error){correo='';}
  }
  if(!correo){
    correo=(prompt('¿A qué correo se la enviamos?')||'').trim().toLowerCase();
  }
  if(!correo)return;

  btn.disabled=true;
  btn.textContent='Enviando…';
  msg.innerHTML='';
  try{
    const {data:{session}}=await window.supabaseClient.auth.getSession();
    if(!session){msg.innerHTML='<span class="gpsWarn">Tu sesión expiró. Vuelve a iniciar sesión.</span>';return;}
    const {data,error}=await window.supabaseClient.functions.invoke('invitar',{
      body:{correo},
      headers:{Authorization:'Bearer '+session.access_token}
    });
    if(error){
      // Estos son los casos que el administrador puede resolver, y cada
      // uno con su propio mensaje: "algo falló" no le sirve de nada.
      msg.innerHTML='<span class="gpsWarn">'+errorDeInvocarFuncion(error,'invitar',
        'Mientras tanto, copia el enlace de arriba y mándalo por el medio que quieras.')+'</span>';
      return;
    }
    if(data&&data.error){
      const detalle=String(data.error);
      // El correo puede no salir por configuración, no por un fallo. En
      // ese caso el enlace sigue sirviendo, así que se dice qué hacer y
      // se recuerda el plan B en vez de dejar un error seco.
      if(/SMTP|mail provider|email provider|rate limit|too many/i.test(detalle)){
        msg.innerHTML='<span class="gpsWarn">Supabase no pudo enviar el correo ('+escHtml(detalle)+'). '+
          'Revisa <b>Authentication → Email</b> en el panel de Supabase. '+
          'Mientras tanto, copia el enlace de arriba y mándaselo por el medio que quieras.</span>';
      }else{
        msg.innerHTML='<span class="gpsWarn">'+escHtml(detalle)+'</span>';
      }
      return;
    }
    msg.innerHTML='<span style="color:var(--accent)">Invitación enviada a '+escHtml(correo)+'. Revisa la carpeta de Correo no deseado.</span>';
  }catch(error){
    msg.innerHTML='<span class="gpsWarn">No se pudo enviar: '+escHtml((error&&error.message)||error)+
      '. El enlace de arriba sirve igual.</span>';
  }finally{
    btn.disabled=false;
    btn.textContent='✉ Enviar invitación por correo';
  }
}

// Enviar una invitación que ya estaba en la lista, sin volver a generar
// el enlace: es el caso de "se le olvidó el correo" o "no le llegó".
async function enviarInvitacionDe(correo){
  const enlace=document.getElementById('invEnlace');
  if(enlace){
    try{
      const actual=new URL(enlace.value,location.href).searchParams.get('email');
      if(actual&&actual===correo){enviarInvitacionPorCorreo();return;}
    }catch(error){}
  }
  document.getElementById('inv-correo').value=correo;
  await enviarInvitacionPorCorreo();
}

async function copiarEnlaceInvitacion(){
  const input=document.getElementById('invEnlace');
  if(!input)return;
  input.select();
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      await navigator.clipboard.writeText(input.value);
    }else{
      document.execCommand('copy');
    }
    document.getElementById('invMsg').innerHTML='<span style="color:var(--accent)">Enlace copiado.</span>';
  }catch(error){
    document.getElementById('invMsg').innerHTML='<span class="gpsWarn">No se pudo copiar. Selecciona el enlace a mano y cópialo con Ctrl+C.</span>';
  }
}
async function copiarMensajeInvitacion(){
  const input=document.getElementById('invEnlace');
  if(!input)return;
  const texto=`Hola, te creamos tu cuenta en Control de Asistencia.\n\nEntra a este enlace y pon tu contraseña:\n${input.value}\n\nTus permisos ya están configurados.`;
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      await navigator.clipboard.writeText(texto);
    }else{
      document.execCommand('copy');
    }
    document.getElementById('invMsg').innerHTML='<span style="color:var(--accent)">Mensaje copiado.</span>';
  }catch(error){
    document.getElementById('invMsg').innerHTML='<span class="gpsWarn">No se pudo copiar. Copia el enlace a mano.</span>';
  }
}

async function loadInvitaciones(){
  const el=document.getElementById('invLista');
  if(!el)return;
  if(!exigirPermiso('sistema.usuarios')){el.innerHTML='<small>Sin permiso.</small>';return;}
  const {data,error}=await window.supabaseClient.from('invitaciones')
    .select('*').order('created_at',{ascending:false}).limit(100);
  if(error){
    el.innerHTML=`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
      <b>No se pudieron leer las invitaciones.</b> <small>${escHtml(error.message)}</small><br>
      <small>Falta la migración 019: ejecuta 019_invitaciones_perfiles.sql.</small></div>`;
    return;
  }
  invitacionesCache=data||[];
  if(!invitacionesCache.length){
    el.innerHTML='<small>No hay invitaciones todavía.</small>';
    return;
  }
  const hoy=new Date();
  el.innerHTML=`<table><thead><tr>
      <th class="izq">Correo</th><th class="izq">Nombre</th><th class="izq">Permisos</th>
      <th>Ficha</th><th>Estado</th><th>Creada</th><th></th>
    </tr></thead><tbody>${
    invitacionesCache.map(inv=>{
      const nombre=inv.nombre||'<small>(sin nombre)</small>';
      const roles=(inv.roles&&inv.roles.length)?inv.roles.map(nombreDeRol).map(escHtml).join(', '):'<small>ninguno</small>';
      // Vencida no es lo mismo que pendiente: el trigger ya no la va a
      // aplicar, así que ofrecer "ver enlace" mandaría a alguien por un
      // camino que no abre. Se ofrece volver a invitar en su lugar.
      const vencida=inv.estado==='pendiente'&&!!(inv.expira_at&&new Date(inv.expira_at)<hoy);
      let estado;
      if(inv.estado==='aceptada')estado='<span class="eppBadge firmado">Aceptada</span>';
      else if(inv.estado==='cancelada')estado='<span class="eppBadge sinFirma">Cancelada</span>';
      else if(vencida)estado='<span class="eppBadge sinFirma">Vencida</span>';
      else estado='<span class="eppBadge" style="color:#e08b1a;border-color:#e08b1a">Pendiente</span>';
      let acciones='<small>—</small>';
      if(inv.estado==='pendiente'&&!vencida){
        acciones=`<button class="btn secondary" type="button" onclick="reenlaceInvitacion('${inv.id}')">Ver enlace</button>
                  <button class="btn secondary" type="button" onclick="enviarInvitacionDe('${inv.correo}')">✉ Enviar</button>
                  <button class="btn secondary" type="button" onclick="altaDesdeInvitacion('${inv.correo}','${escHtml((inv.nombre||'').replace(/'/g,"\'"))}','verificar')">✓ Verificar</button>
                  <button class="btn secondary" type="button" onclick="altaDesdeInvitacion('${inv.correo}','${escHtml((inv.nombre||'').replace(/'/g,"\'"))}','crear')">🔑 Alta con clave</button>
                  <button class="btn secondary" type="button" onclick="cancelarInvitacion('${inv.id}')">Cancelar</button>`;
      }else if(vencida){
        acciones=`<button class="btn secondary" type="button" onclick="reinvitar('${inv.id}')">Volver a invitar</button>
                  <button class="btn secondary" type="button" onclick="altaDesdeInvitacion('${inv.correo}','${escHtml((inv.nombre||'').replace(/'/g,"\'"))}','crear')">🔑 Alta con clave</button>`;
      }
      return `<tr>
        <td class="izq">${escHtml(inv.correo)}</td>
        <td class="izq">${escHtml(nombre)}</td>
        <td class="izq"><small>${roles}</small></td>
        <td><small>${inv.trabajador_code?escHtml(inv.trabajador_code):'—'}</small></td>
        <td>${estado}</td>
        <td><small>${escHtml(fechaLegible(inv.created_at))}</small></td>
        <td>${acciones}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function reenlaceInvitacion(id){
  const inv=invitacionesCache.find(i=>i.id===id||String(i.id)===String(id));
  if(!inv){alert('No se encontró la invitación.');return;}
  mostrarInvitacionCreada(inv);
  document.getElementById('invResultado').scrollIntoView({behavior:'smooth',block:'nearest'});
}
// Salto desde la lista de invitaciones a la tarjeta de alta: se copian
// el correo y el nombre para no tener que volver a escribirlos, y se
// deja la acción elegida ya marcada en los botones.
function altaDesdeInvitacion(correo,nombre,accion){
  if(!exigirPermiso('sistema.usuarios'))return;
  document.getElementById('alta-correo').value=correo||'';
  document.getElementById('alta-nombre').value=nombre||'';
  const caja=document.getElementById('alta-clave');
  if(caja&&accion!=='verificar'&&!caja.value)generarClaveProvisional();
  const tarjeta=document.getElementById('alta-correo').closest('.card');
  if(tarjeta)tarjeta.scrollIntoView({behavior:'smooth',block:'start'});
  const msg=document.getElementById('altaMsg');
  if(accion==='verificar'){
    msg.innerHTML='<small>Pulsa <b>Verificar cuenta existente</b>. Sirve cuando la cuenta ya está en '+
      'Supabase pero quedó sin verificar por el límite de correos.</small>';
  }else{
    msg.innerHTML='<small>Se generó una clave. Revísala y pulsa <b>Crear cuenta con clave</b>: no se manda correo, '+
      'se la entregas tú.</small>';
  }
}
// Reenviar una invitación vencida es, en la práctica, volver a crearla:
// la anterior ya no sirve y el índice único no deja tener dos pendientes.
// Se copian los datos al formulario para no tener que volver a escribirlos.
function reinvitar(id){
  const inv=invitacionesCache.find(i=>i.id===id);
  if(!inv){alert('No se encontró la invitación.');return;}
  document.getElementById('inv-correo').value=inv.correo;
  document.getElementById('inv-nombre').value=inv.nombre||'';
  document.getElementById('inv-notas').value=inv.notas||'';
  document.getElementById('inv-ficha').value=inv.trabajador_code||'';
  document.getElementById('inv-empresa').value=inv.empresa_id||'';
  document.querySelectorAll('.invRol').forEach(c=>c.checked=(inv.roles||[]).includes(c.value));
  document.getElementById('inv-correo').focus();
  alert('Se copiaron los datos de la invitación vencida al formulario. Revísalos y vuelve a pulsar "Generar invitación".');
}
async function cancelarInvitacion(id){
  if(!exigirPermiso('sistema.usuarios'))return;
  if(!confirm('¿Cancelar esta invitación? Si la persona ya se registró, esto no le quita los permisos; para eso usa Usuarios.'))return;
  const {error}=await window.supabaseClient.from('invitaciones')
    .update({estado:'cancelada'}).eq('id',id);
  if(error){alert('No se pudo cancelar: '+error.message);return;}
  await loadInvitaciones();
}

// ============================================================
// DAR DE ALTA SIN CORREO

// ============================================================
// La invitación por correo depende de que Supabase pueda mandar correos,
// y el plan gratuito tiene un límite por hora. Al pasarse responde
// "email rate limit exceeded": la cuenta queda creada pero NO verificada,
// y quien la tenía no puede entrar. Estos tres botones escriben
// directo en la cuenta y no mandan nada, así que el límite deja de
// importar.
//
// El costo se dice en la pantalla, no acá: verificar un correo sin que
// nadie lo compruebe significa que la clave se entrega en persona. Es
// lo que corresponde en una obra y no lo que corresponde en un sistema
// abierto; la pantalla lo dice para que la decisión sea de quien
// pulse el botón.

// Una clave que se pueda decir de oído, sin 0/O ni 1/I, y que no sea
// adivinable. Se muestra en pantalla a propósito: hay que poder leerla
// y anotarla para dársela a la persona.
const ALFABETO_CLAVE='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generarClaveProvisional(){
  const largo=10;
  let clave='';
  for(let i=0;i<largo;i++)clave+=ALFABETO_CLAVE[Math.floor(Math.random()*ALFABETO_CLAVE.length)];
  // Se fuerza una letra: si salieran puros números, dictarla por teléfono
  // es un problema, y el 2 y el 3 se parecen al Z y al B.
  if(!/[A-Z]/.test(clave))clave=ALFABETO_CLAVE[Math.floor(Math.random()*26)]+clave.slice(1);
  const input=document.getElementById('alta-clave');
  if(input){input.value=clave;input.select();}
  const msg=document.getElementById('altaMsg');
  if(msg)msg.innerHTML='<small>Anótala y entrégasela en persona. La persona debería cambiarla al entrar.</small>';
}

async function llamarVerificarCuentas(accion){
  if(!exigirPermiso('sistema.usuarios'))return;
  const correo=document.getElementById('alta-correo').value.trim().toLowerCase();
  const nombre=document.getElementById('alta-nombre').value.trim();
  const clave=document.getElementById('alta-clave').value.trim();
  const nuevo=(document.getElementById('alta-correo-nuevo')||{}).value;
  const nuevoLimpio=String(nuevo||'').trim().toLowerCase();
  const msg=document.getElementById('altaMsg');
  const botones=['btnAltaVerificar','btnAltaCrear','btnAltaClave','btnAltaCorreo'].map(id=>document.getElementById(id));
  const textos={verificar:'Verificando…',crear:'Creando…',clave:'Cambiando…',correo:'Cambiando el correo…'};
  const etiquetaBoton={verificar:'btnAltaVerificar',crear:'btnAltaCrear',clave:'btnAltaClave',correo:'btnAltaCorreo'};

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){
    msg.innerHTML='<span class="gpsWarn">Escribe un correo válido: el que está arriba, el que hay que reparar.</span>';return;
  }
  // Solo "crear" y "clave" necesitan clave. "verificar" y "correo" no: la
  // cuenta ya existe y lo que se toca es un dato, no el acceso.
  if((accion==='crear'||accion==='clave')&&!clave){
    msg.innerHTML='<span class="gpsWarn">Sin clave la cuenta no serviría: la persona no podría entrar. Escribe una o pulsa "Generar".</span>';
    return;
  }
  if(accion==='correo'){
    if(!nuevoLimpio){
      msg.innerHTML='<span class="gpsWarn">Escribe el correo correcto en el campo de al lado. Si el que está arriba ya está bien, no necesitas esta opción: usa "Verificar cuenta existente".</span>';
      return;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoLimpio)){
      msg.innerHTML='<span class="gpsWarn">El correo nuevo no parece un correo válido. Revísalo: si le falta una letra, la cuenta queda con una dirección a la que no le llega nada.</span>';
      return;
    }
    if(nuevoLimpio===correo){
      msg.innerHTML='<span class="gpsWarn">El correo nuevo es igual al que ya tiene. Si lo que falta es verificar la cuenta, pulsa "Verificar cuenta existente".</span>';
      return;
    }
    // Se pide confirmación porque esto no tiene vuelta atrás con la misma
    // facilidad: cambiar el correo escribe en la cuenta, y la clave sigue
    // siendo la misma.
    //
    // El diálogo muestra la dirección nueva completa a propósito: la app
    // puede comprobar que un correo tiene forma de correo, pero no puede
    // saber que "gmial.com" es "gmail.com" mal escrito. Eso lo detecta una
    // persona mirando, y este es el único momento en que se le muestra.
    if(!confirm(
      'Se va a cambiar el correo de la cuenta:\n\n'+
      '   de:  '+correo+'\n'+
      '   a:    '+nuevoLimpio+'\n\n'+
      'Revisa la dirección nueva con atención. Esta pantalla puede decir si\n'+
      'un correo está mal formado, pero NO si el dominio existe: un\n'+
      '"gmial.com" escrito así se acepta igual que un "gmail.com" correcto.\n\n'+
      'No se manda ningún correo, ni a la dirección vieja ni a la nueva.\n'+
      'La clave NO cambia: la persona sigue entrando con la misma.\n'+
      'La cuenta queda verificada.\n\n'+
      'Avísale por otro medio, porque no se va a enterar por correo.\n\n¿Seguir?'
    ))return;
  }
  if(accion==='crear'&&!confirm(
    'Se va a crear la cuenta de '+correo+' con una clave que tú eliges.\n\n'+
    'No se manda ningún correo: entrégale la clave en persona y pídele que la cambie '+
    'al entrar.\n\n¿Seguir?'
  ))return;
  if(accion==='clave'&&!confirm(
    'Se va a cambiar la clave de '+correo+'. La persona tendrá que entrar con la nueva, '+
    'así que avísale antes de seguir.\n\n¿Seguir?'
  ))return;

  botones.forEach(b=>{if(b)b.disabled=true;});
  const propio=botones.find(b=>b&&b.id===etiquetaBoton[accion]);
  const etiqueta=propio?propio.textContent:'';
  if(propio)propio.textContent=textos[accion]||'…';
  msg.innerHTML='<small>Un momento…</small>';

  try{
    const {data,error}=await window.supabaseClient.functions.invoke('verificar-cuenta',{
      body:{correo,accion,clave,nombre,nuevo:nuevoLimpio||undefined}
    });
    if(error){
      msg.innerHTML='<span class="gpsWarn">'+errorDeInvocarFuncion(error,'verificar-cuenta',
        'Si la clave no está puesta, la cuenta se crea igual, pero sin poder verificarla.')+'</span>';
      return;
    }
    if(data&&data.error){
      // La función distingue los casos que necesitan una acción distinta.
      // "No existe" no es un fallo: es que hay que crearla, y se dice.
      if(data.no_existe&&accion!=='crear'){
        msg.innerHTML='<span class="gpsWarn">'+escHtml(data.error)+
          (accion==='correo'?'':' Si quieres darla de alta ahora, escribe la clave y pulsa <b>Crear cuenta con clave</b>.')+'</span>';
        return;
      }
      if(data.ya_existe){
        msg.innerHTML='<span class="gpsWarn">'+escHtml(data.error)+'</span>';
        return;
      }
      msg.innerHTML='<span class="gpsWarn">'+escHtml(data.error)+'</span>';
      return;
    }
    // La clave se borra de la pantalla apenas se usó: si el supervisor
    // deja la pestaña abierta, no queda escrita a la vista de cualquiera
    // que pase por detrás. Con "correo" no se usa clave, pero se limpia
    // igual para que el campo no quede con la anterior de otro intento.
    if(accion!=='verificar')document.getElementById('alta-clave').value='';
    if(accion==='correo'&&data&&data.correo){
      // Se escribe el correo nuevo en el campo de arriba, que es donde
      // queda el estado real ahora. Si no, el formulario seguiría
      // mostrando el viejo y el próximo clic intentaría cambiar algo que
      // ya no existe.
      document.getElementById('alta-correo').value=data.correo;
      const campoNuevo=document.getElementById('alta-correo-nuevo');
      if(campoNuevo)campoNuevo.value='';
    }
    const aviso=data&&data.aviso?'<br><small style="color:#e08b1a">'+escHtml(data.aviso)+'</small>':'';
    msg.innerHTML='<span style="color:var(--accent)">'+escHtml((data&&data.mensaje)||'Listo.')+'</span>'+aviso;
    await loadAltasCuentas();
    if(accion==='correo')await loadInvitaciones();
  }catch(error){
    msg.innerHTML='<span class="gpsWarn">No se pudo completar: '+escHtml((error&&error.message)||error)+'</span>';
  }finally{
    botones.forEach(b=>{if(b)b.disabled=false;});
    if(propio)propio.textContent=etiqueta;
  }
}
function corregirCorreoCuenta(){return llamarVerificarCuentas('correo');}
// ------------------------------------------------------------------
// ¿ESTÁN DESPLEGADAS LAS EDGE FUNCTIONS?
// ------------------------------------------------------------------
// Es la pregunta que más se repite y cuya respuesta cuesta un error en
// pantalla. Se responde al abrir la tarjeta, antes de que nadie pulse
// nada.
//
// La prueba es la propia función, con una petición que ella misma
// rechaza: un correo vacío. Si está desplegada contesta 400 con un JSON
// que dice "escribe un correo válido". Si no lo está, la URL devuelve la
// página de error del panel, el cliente no puede parsearla y reporta
// "Failed to send a request to the Edge Function".
//
// No se inventó una función "ping" para comprobarlo: eso sería obligar
// a desplegar una cuarta función solo para poder preguntar. Esta
// comprobación no necesita desplegar nada, y en la función el correo se
// valida antes que el permiso, así que no pide nada ni deja rastro.
//
// No bloquea nada: si la prueba falla por red o por lo que sea, la
// tarjeta se deja como está y el error se sigue viendo al pulsar.
async function comprobarFuncionesDesplegadas(){
  const aviso=document.getElementById('funcionesAviso');
  if(!aviso)return;
  try{
    const {data,error}=await window.supabaseClient.functions.invoke('verificar-cuenta',{
      body:{correo:'',accion:'verificar'}
    });
    // Desplegada y respondiendo: no hay nada que avisar.
    if(!error&&data)return;
    // Es un problema de sesión, no de despliegue: otro mensaje distinto.
    if(error&&/Invalid JWT|401/i.test(String(error.message||'')))return;
  }catch(error){}
  aviso.innerHTML='<div class="gpsWarn" style="line-height:1.6">'+
    '<b>Las funciones del servidor todavía no están desplegadas.</b><br>'+
    'Por eso el alta de cuentas y el envío de correos no funcionan todavía. '+
    'En la terminal, dentro del proyecto, ejecuta:<br>'+
    '<b style="font-family:ui-monospace,Consolas,monospace">supabase functions deploy verificar-cuenta<br>'+
    'supabase functions deploy invitar</b><br>'+
    '<small>Esto es del despliegue, no de los datos: todo lo demás de la app sigue funcionando.</small></div>';
}
function verificarCuentaExistente(){return llamarVerificarCuentas('verificar');}
function crearCuentaConClave(){return llamarVerificarCuentas('crear');}
function reiniciarClaveCuenta(){return llamarVerificarCuentas('clave');}

// El historial responde "¿quién dio de alta a esta persona?". Sin esto,
// dar de alta a alguien sería un acto invisible: nadie podría después
// decir por qué una cuenta quedó activa.
async function loadAltasCuentas(){
  const el=document.getElementById('altaHistorial');
  if(!el)return;
  if(!exigirPermiso('sistema.usuarios')){el.innerHTML='<small>Sin permiso.</small>';return;}
  const {data,error}=await window.supabaseClient.from('cuentas_altas')
    .select('*').order('created_at',{ascending:false}).limit(40);
  if(error){
    el.innerHTML=`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
      <b>No se pudo leer el historial de altas.</b> <small>${escHtml(error.message)}</small><br>
      <small>Falta la migración 021: ejecuta <b>021_altas_cuentas.sql</b>. El alta igual funciona; lo que no se guarda es quién la hizo.</small></div>`;
    return;
  }
  const filas=data||[];
  const verbos={verificada:'Verificada',creada:'Creada',clave_reiniciada:'Clave cambiada'};
  el.innerHTML=`<h3 style="font-size:.95rem;margin:0 0 4px">Historial de altas</h3>
    <small style="color:var(--muted)">Quién verificó o creó cada cuenta, y cuándo. Esto no se borra.</small>
    ${filas.length?`<table style="margin-top:8px"><thead><tr>
        <th class="izq">Correo</th><th>Qué se hizo</th><th>Resultado</th><th>Quién</th><th>Cuándo</th>
      </tr></thead><tbody>${
      filas.map(f=>{
        const mal=f.resultado!=='ok';
        return `<tr>
          <td class="izq">${escHtml(f.correo)}</td>
          <td><small>${escHtml(verbos[f.accion]||f.accion)}</small></td>
          <td>${mal?'<span class="eppBadge sinFirma">Falló</span>':'<span class="eppBadge firmado">OK</span>'}</td>
          <td><small>${escHtml(f.hecho_por_nombre||'—')}</small></td>
          <td><small>${escHtml(fechaLegible(f.created_at))}</small></td>
        </tr>`;
      }).join('')}</tbody></table>`
      :'<div style="margin-top:8px"><small>Todavía no hay altas registradas.</small></div>'}`;
}

// ============================================================
// MIS DATOS

// ============================================================
// Cualquier usuario puede corregir su nombre y su teléfono. Lo guarda
// una función de la base (completar_mi_perfil) y no un UPDATE normal a
// propósito: con un "update perfiles set ... where id = el mío" sin
// restricciones, cualquiera podría ascenderse solo con rol='admin'.
async function initMiPerfil(){
  const boxNombre=document.getElementById('perfil-nombre');
  if(!boxNombre)return;
  // nombreDeRol necesita el catálogo para poner "Administración" y no
  // "admin". Antes solo se cargaba al abrir Permisos por rol, así que
  // en el resto de la app salía la clave cruda.
  if(!catalogoRoles.length)await cargarCatalogosPermisos();
  boxNombre.value=(miPerfil&&miPerfil.nombre)||'';
  const ficha=miPerfil&&miPerfil.trabajador_code
    ?workers.find(w=>w.code===miPerfil.trabajador_code):null;
  document.getElementById('perfil-telefono').value=
    (miPerfil&&miPerfil.telefono)||(ficha&&ficha.phone)||'';

  const cont=document.getElementById('perfilPermisos');
  if(!cont)return;
  const empresasDeEsta=empresas.filter(e=>misEmpresas.includes(e.id));
  cont.innerHTML=
    (miPerfil&&!miPerfil.activo
      ?'<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px;margin-bottom:12px">'+
        '<b>Tu cuenta está inactiva.</b> Un administrador tiene que activarla en Soporte → Usuarios. '+
        'Mientras tanto puedes entrar, pero no vas a poder guardar nada.</div>'
      :'')+
    (miPerfil&&miPerfil.perfil_completo===false
      ?'<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px;margin-bottom:12px">'+
        '<b>Te falta completar tus datos.</b> Arriba está el formulario: pon tu nombre y guarda.</div>'
      :'')+
    `<div style="border:1px solid var(--line);border-radius:8px;padding:12px">
      <div><b>Permisos</b><br>${misRoles.length
        ?misRoles.map(r=>`<span class="eppBadge firmado">${escHtml(nombreDeRol(r))}</span>`).join(' ')
        :'<span class="gpsWarn">No tienes ningún permiso asignado. Pídele a un administrador que te asigne uno.</span>'}</div>
      <div style="margin-top:10px"><b>Correo</b><br><small>${escHtml(miCorreo||'(no disponible)')}</small></div>
      <div style="margin-top:10px"><b>Ficha de trabajador</b><br>${miPerfil&&miPerfil.trabajador_code
        ?`<small>${escHtml(miPerfil.trabajador_code)} — ${escHtml(ficha?ficha.name:'(no encontrada)')}${ficha&&ficha.is_supervisor?' · supervisor':''}</small>`
        :'<small>Sin ficha vinculada. Pídele a un administrador que te vincule a una si necesitas ver tu asistencia.</small>'}</div>
      <div style="margin-top:10px"><b>Empresas</b><br>${empresasDeEsta.length
        ?'<small>'+empresasDeEsta.map(e=>escHtml(e.nombre)).join(', ')+'</small>'
        :'<small class="gpsWarn">Sin empresa asignada: no verás ningún trabajador.</small>'}</div>
    </div>`;
}

async function guardarMiPerfil(){
  const msg=document.getElementById('perfilMsg');
  const nombre=document.getElementById('perfil-nombre').value.trim();
  const telefono=document.getElementById('perfil-telefono').value.trim();
  if(!nombre){
    msg.innerHTML='<span class="gpsWarn">El nombre no puede quedar vacío.</span>';return;
  }
  const {data,error}=await window.supabaseClient.rpc('completar_mi_perfil',{
    nuevo_nombre:nombre,
    nuevo_telefono:telefono||null
  });
  if(error){
    // Si la función no está, casi siempre es la 019 sin aplicar.
    // "Could not find the function" es el mensaje que devuelve
    // PostgREST cuando lo que falta es una función, no una tabla.
    if(/does not exist|schema cache|Could not find the function|not found/i.test(error.message)){
      msg.innerHTML='<span class="gpsWarn">Falta la migración 019: ejecuta 019_invitaciones_perfiles.sql.</span>';
    }else{
      msg.innerHTML='<span class="gpsWarn">No se pudo guardar: '+escHtml(error.message)+'</span>';
    }
    return;
  }
  // El perfil local se actualiza para que el resto de la app vea el
  // nombre nuevo sin recargar.
  if(miPerfil){miPerfil.nombre=nombre;miPerfil.telefono=telefono;miPerfil.perfil_completo=true;}
  quitarAvisoPerfilIncompleto();
  const cabecera=document.querySelector('header b, header strong');
  if(cabecera&&miPerfil&&miPerfil.nombre)cabecera.textContent=miPerfil.nombre;
  msg.innerHTML='<span style="color:var(--accent)">Datos guardados.</span>';
  initMiPerfil();
}

// ---------- exportar PDF de tarjetas (varias, frente y reverso) ----------
function fillPdfChecks(){
  document.getElementById('pdf-worker-checks').innerHTML = workers.map(w=>
    `<label style="display:block;font-weight:normal"><input type="checkbox" class="pdfChk" value="${w.code}" style="width:auto;display:inline-block;margin-right:6px">${w.code} - ${w.name}</label>`
  ).join('') || '<small>No hay trabajadores registrados.</small>';
}
function toggleAllPdfChecks(v){
  document.querySelectorAll('.pdfChk').forEach(c=>c.checked=v);
}
async function exportCardsPdf(){
  const codes=[...document.querySelectorAll('.pdfChk:checked')].map(c=>c.value);
  if(!codes.length){alert('Selecciona al menos un trabajador.');return;}
  const temporal=document.getElementById('pdf-tipo').value==='temporal';
  const msg=document.getElementById('pdfMsg');
  msg.innerHTML='<small>Generando PDF…</small>';
  // área oculta donde renderizamos cada tarjeta para capturarla
  const stage=document.getElementById('pdfStage')||(()=>{const d=document.createElement('div');d.id='pdfStage';d.style.position='fixed';d.style.left='-9999px';d.style.top='0';document.body.appendChild(d);return d;})();
  const { jsPDF } = window.jspdf;
  const pdf=new jsPDF({unit:'mm',format:'a4'});
  const cardW=85.6, cardH=53.98, cols=2, rows=4, marginX=(210-cols*cardW)/2, marginY=(297-rows*cardH)/2;
  const perPage=cols*rows;
  async function capturaFace(w,face,idSuffix){
    const backId=`${idSuffix}-back`;
    const cardId=await getOrIssueCard(w.code,'definitiva');
    stage.innerHTML=`<div class="idcard" style="margin:0"><div class="idcard-inner" style="transform:none">${face==='front'?cardFrontHtml(w,idSuffix,temporal):cardBackHtml(w,backId,temporal)}</div></div>`;
    if(face==='front')drawCardCodes(cardId,idSuffix,{barcodeHeight:26,barcodeWidth:2,fontSize:7,margin:10});
    else drawCardCodes(cardId,backId,{qrSize:220,barcodeHeight:24,barcodeWidth:2,fontSize:7,margin:10});
    const el=stage.querySelector(face==='front'?'.idcard-front':'.idcard-back');
    el.style.position='static';
    el.style.transform='none';
    el.style.backfaceVisibility='visible';
    const canvas=await html2canvas(el,{scale:3,backgroundColor:'#ffffff'});
    return canvas.toDataURL('image/png');
  }
  const lista=codes.map(c=>workers.find(w=>w.code===c)).filter(Boolean);
  if(temporal){
    const pairW=cardW*2, pairH=cardH, pairsPerPage=5;
    const pairMarginX=(210-pairW)/2, pairMarginY=(297-pairsPerPage*pairH)/2;
    for(let i=0;i<lista.length;i++){
      if(i>0&&i%pairsPerPage===0)pdf.addPage();
      const worker=lista[i], suffix=`temp-${worker.code}`;
      stage.innerHTML=tempCardPairHtml(worker,suffix);
      await drawTempCardPairCodes(worker,suffix);
      const canvas=await html2canvas(stage.querySelector('.temp-card-pair'),{scale:3,backgroundColor:'#ffffff'});
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',pairMarginX,pairMarginY+(i%pairsPerPage)*pairH,pairW,pairH);
    }
    stage.innerHTML='';
    pdf.save('tarjetas_temporales_frente_reverso.pdf');
    msg.innerHTML=`<small>${lista.length} pareja(s) lista(s). Frente y reverso quedan juntos; dobla por la línea central y corta el contorno. Imprime al 100 %.</small>`;
    return;
  }
  for(let pass=0; pass<2; pass++){ // pass 0 = frentes, pass 1 = reversos
    for(let i=0;i<lista.length;i++){
      if(i%perPage===0){ if(!(pass===0&&i===0)) pdf.addPage(); }
      const w=lista[i];
      const img=await capturaFace(w,pass===0?'front':'back','_'+w.code);
      const pos=i%perPage, col=pos%cols, row=Math.floor(pos/cols);
      pdf.addImage(img,'PNG', marginX+col*cardW, marginY+row*cardH, cardW, cardH);
    }
  }
  stage.innerHTML='';
  pdf.save(`tarjetas_${temporal?'temporales':'definitivas'}.pdf`);
  msg.innerHTML=`<small>Listo: ${lista.length} tarjeta(s) exportada(s). Frentes primero, reversos después en el mismo orden — imprime a doble cara volteando por el borde largo.</small>`;
}
// ============================================================
// BODEGA — EPP (catálogo, ítems, firma, GPS, PDF) y herramientas
// Todo se persiste en Supabase; las firmas y PDFs van al bucket
// privado "epp-respaldos" (ver migrations/008_epp_firma.sql).
// ============================================================
const EPP_BUCKET='epp-respaldos';
// Tallas: se cargan desde la tabla epp_tallas. Si la migración 010 todavía
// no está aplicada se usa esta lista de respaldo (calzado chileno 35-45).
const TIPO_TALLA_LABEL={calzado:'Calzado (tallas chilenas)',ropa:'Ropa',general:'General'};
const TALLAS_FALLBACK={
  calzado:['35','35,5','36','36,5','37','37,5','38','38,5','39','39,5','40','40,5','41','41,5','42','42,5','43','43,5','44','44,5','45'],
  ropa:['XS','S','M','L','XL','XXL','XXXL'],
  general:['Única','—']
};
// Devuelve las tallas de un tipo, ordenadas.
function tallasDeTipo(tipo){
  const t=tipo||'general';
  const fromDb=eppTallas.filter(x=>x.tipo===t).sort((a,b)=>a.orden-b.orden).map(x=>x.talla);
  return fromDb.length?fromDb:(TALLAS_FALLBACK[t]||TALLAS_FALLBACK.general);
}
// El tipo de talla que le corresponde a un elemento del catálogo.
function tipoTallaDeItem(row){
  if(row&&row.tipoTalla)return row.tipoTalla;
  const cat=eppCatalog.find(c=>c.codigo===row.eppCodigo);
  if(cat&&cat.tipo_talla)return cat.tipo_talla;
  if(row&&row.otro)return 'general';
  return 'general';
}
// Select de talla filtrado según el tipo del elemento elegido.
function tallaOptions(tipo,seleccionada){
  const t=tipo||'general';
  const tallas=tallasDeTipo(t);
  return `<optgroup label="${TIPO_TALLA_LABEL[t]||t}">${
    tallas.map(x=>`<option value="${x}" ${seleccionada===x?'selected':''}>${x}</option>`).join('')
  }</optgroup>`;
}

function initBodega(){
  const opts=opcionesTrabajadores();
  const selWorker=document.getElementById('epp-worker');
  const previo=selWorker.value;
  selWorker.innerHTML=opts;
  if(workers.some(w=>w.code===previo))selWorker.value=previo;
  document.getElementById('assign-worker').innerHTML=opts;
  const filtro=document.getElementById('epp-filter');
  const previoFiltro=filtro.value;
  filtro.innerHTML='<option value="">Todos los trabajadores</option>'+opts;
  if(previoFiltro)filtro.value=previoFiltro;
  document.getElementById('assign-tool').innerHTML=tools.filter(t=>t.activo!==false)
    .map(t=>`<option value="${t.id}">${t.nombre} ($${Number(t.precio).toLocaleString('es-CL')})</option>`).join('');
  const fecha=document.getElementById('epp-fecha');
  if(!fecha.value)fecha.value=hoyLocal();
  if(!eppItemRows.length)addEppItemRow();
  renderToolCatalog();
  renderEppHistory();
  renderToolAssignments();
  updateEppWorkerHint();
}

// ---------- EPP: catálogo ----------
function addEppCatalogItem(){
  const codigo=document.getElementById('cat-codigo').value.trim().toUpperCase();
  const nombre=document.getElementById('cat-nombre').value.trim();
  const detalle=document.getElementById('cat-detalle').value.trim();
  const tipoTalla=document.getElementById('cat-tipo-talla').value;
  if(!codigo||!nombre){alert('Ingresa el código y el nombre del elemento.');return;}
  if(eppCatalog.some(c=>c.codigo===codigo)){alert('Ya existe un elemento con el código '+codigo+'.');return;}
  (async()=>{
    const {error}=await window.supabaseClient.from('epp_catalogo').insert({
      codigo,nombre,detalle:detalle||null,requiere_talla:!!tipoTalla,tipo_talla:tipoTalla||null
    });
    if(error){alert('No se pudo guardar en el catálogo: '+error.message);return;}
    ['cat-codigo','cat-nombre','cat-detalle'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('cat-tipo-talla').value='';
    await loadEppCatalog();
    renderEppCatalog();
  })();
}
function renderEppCatalog(){
  const el=document.getElementById('eppCatalogList');
  if(!el)return;
  if(!eppCatalog.length){el.innerHTML='<small>Catálogo vacío. Agrega el primer elemento.</small>';return;}
  el.innerHTML=`<div class="overflow"><table>
    <thead><tr><th>Código</th><th>Nombre</th><th>Detalle</th><th>Talla</th><th></th></tr></thead>
    <tbody>${eppCatalog.map(c=>`<tr>
      <td><b>${c.codigo}</b></td>
      <td>${c.nombre}</td>
      <td style="text-align:left">${c.detalle||'—'}</td>
      <td>${c.tipo_talla?(TIPO_TALLA_LABEL[c.tipo_talla]||c.tipo_talla):'—'}</td>
      <td><button class="btn secondary" style="margin:0;padding:4px 8px;font-size:.65rem" onclick="toggleEppCatalog('${c.codigo}')">${c.activo===false?'Activar':'Desactivar'}</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}
async function toggleEppCatalog(codigo){
  const item=eppCatalog.find(c=>c.codigo===codigo);
  if(!item)return;
  const {error}=await window.supabaseClient.from('epp_catalogo').update({activo:item.activo===false}).eq('codigo',codigo);
  if(error){alert('No se pudo actualizar: '+error.message);return;}
  await loadEppCatalog();
  renderEppCatalog();
}

// ---------- EPP: filas de ítems del formulario ----------
function eppCatalogOptions(){
  const activos=eppCatalog.filter(c=>c.activo!==false);
  return '<option value="">— elegir elemento —</option>'+
    activos.map(c=>`<option value="${c.codigo}">${c.codigo} — ${c.nombre}</option>`).join('')+
    '<option value="__otro">+ Otro (carga manual)</option>';
}
function addEppItemRow(preset){
  eppItemRows.push({
    eppCodigo:preset&&preset.eppCodigo||'',
    nombre:preset&&preset.nombre||'',
    detalle:preset&&preset.detalle||'',
    talla:preset&&preset.talla||'',
    cantidad:preset&&preset.cantidad||1,
    otro:!!(preset&&preset.otro),
    tipoTalla:preset&&preset.tipoTalla||null
  });
  renderEppItemRows();
}
function renderEppItemRows(){
  const host=document.getElementById('eppItemRows');
  if(!host)return;
  if(!eppItemRows.length)addEppItemRow();
  host.innerHTML=eppItemRows.map((r,i)=>{
    const cat=eppCatalog.find(c=>c.codigo===r.eppCodigo);
    const tipo=tipoTallaDeItem(r);
    // La nota va en minúscula y sin el paréntesis de la etiqueta.
    //
    // "TIPO_TALLA_LABEL" está escrito con mayúscula inicial porque son los
    // nombres de un desplegable, donde eso tiene sentido. Pegado en medio de una
    // frase, "usa talla Calzado (tallas chilenas)" se ve como un error de
    // tipeo, y el paréntesis de la lista de tallas sobra: lo que hace falta es
    // qué tallas hay, y eso ya está en el desplegable de al lado.
    //
    // Antes había un ".replace('General','general')": un parche para una sola
    // palabra. Con la nota hecha en minúscula desde el principio, el parche no
    // hace falta.
    const etiquetaTalla=TIPO_TALLA_LABEL[tipo]||tipo;
    const nota=cat&&cat.tipo_talla
      ?'usa talla '+etiquetaTalla.charAt(0).toLowerCase()+etiquetaTalla.slice(1).replace(/\s*\(.*\)$/,'')
      :(cat&&cat.detalle?cat.detalle:'');
    return `<div class="eppItemRow" data-i="${i}">
      <div>
        <select onchange="onEppItemChange(${i},this.value)">
          <option value="__otro" ${r.otro?'selected':''}>+ Otro (carga manual)</option>
          <option value="" ${(!r.otro&&!r.eppCodigo)?'selected':''}>— elegir elemento —</option>
          ${eppCatalog.filter(c=>c.activo!==false).map(c=>`<option value="${c.codigo}" ${!r.otro&&r.eppCodigo===c.codigo?'selected':''}>${c.codigo} — ${c.nombre}</option>`).join('')}
        </select>
        ${r.otro?`<input style="margin-top:6px" placeholder="Nombre del elemento" value="${r.nombre}" oninput="eppItemRows[${i}].nombre=this.value">
        <select style="margin-top:6px" onchange="eppItemRows[${i}].tipoTalla=this.value;renderEppItemRows()">
          ${['','calzado','ropa','general'].map(t=>`<option value="${t}" ${tipo===t?'selected':''}>${t?('Talla: '+(TIPO_TALLA_LABEL[t]||t)):'Talla: según elemento'}</option>`).join('')}
        </select>`:''}
        <span class="eppItemMeta">${nota}</span>
      </div>
      <div><input placeholder="Detalle / especificación" value="${(r.detalle||'').replace(/"/g,'&quot;')}" oninput="eppItemRows[${i}].detalle=this.value"></div>
      <div><select onchange="eppItemRows[${i}].talla=this.value">${tallaOptions(tipo,r.talla)}</select></div>
      <div><input type="number" min="1" step="1" value="${r.cantidad}" oninput="eppItemRows[${i}].cantidad=this.value"></div>
      <div><button class="btn secondary" type="button" onclick="removeEppItemRow(${i})" ${eppItemRows.length===1?'disabled style="opacity:.4;cursor:not-allowed"':''}>Quitar</button></div>
    </div>`;
  }).join('');
}
function onEppItemChange(i,value){
  const row=eppItemRows[i];
  if(!row)return;
  if(value==='__otro'){
    row.otro=true;
    row.eppCodigo='';
    row.tipoTalla=null; // en carga manual lo elige el usuario
  }else{
    row.otro=false;
    row.eppCodigo=value;
    const cat=eppCatalog.find(c=>c.codigo===value);
    if(cat){
      row.nombre=cat.nombre;
      if(!row.detalle)row.detalle=cat.detalle||'';
    }
    // el tipo de talla lo manda el catálogo: hay que soltar el que
    // hubiera quedado de una carga manual anterior en esta misma fila
    row.tipoTalla=cat&&cat.tipo_talla?cat.tipo_talla:null;
  }
  // al cambiar de elemento la talla elegida puede dejar de existir
  const tallas=tallasDeTipo(tipoTallaDeItem(row));
  if(!tallas.includes(row.talla))row.talla='';
  renderEppItemRows();
}
// Un elemento escaneado que no está en el catálogo.
function avisarElementoFueraDeCatalogo(codigo){
  const hay=eppCatalog.find(c=>normalizarCodigo(c.codigo)===normalizarCodigo(codigo));
  if(hay)return false;
  const avis=document.getElementById('eppScanAviso');
  if(avis)avis.innerHTML='<small style="color:var(--warn-ink)"><b>'+escHtml(codigo)+'</b> no está en el catálogo de EPP, así que se agregó como carga manual. '
    +'Si es un elemento que se usa siempre, conviene darlo de alta en el catálogo.</small>';
  return true;
}
// El botón de escanear es UNO, al lado del título, y no uno en cada fila.
//
// Antes había uno por fila y eso obligaba a decidir la fila ANTES de escanear,
// que es un paso que no hacía falta: el código va siempre a la primera fila que
// todavía no tiene elemento, que es la que la persona está usando de todas
// maneras. Si todas tienen, se agrega una fila y escanea ahí.
//
// Con esto, agregar cinco elementos del mismo código son cinco pulsaciones y
// cinco filas, sin tener que apretar "Quitar" ni elegir dónde.
function escanearEppEnLaFilaVacia(codigo){
  let i=eppItemRows.findIndex(r=>!r.otro&&!r.eppCodigo);
  if(i<0){
    addEppItemRow();
    i=eppItemRows.length-1;
  }
  escanearEppItem(i,codigo);
  // Y la fila queda a la vista. Con varias filas, no ver dónde cayó el código
  // hace que la persona lo busque con la vista en vez de seguir trabajando.
  const fila=document.querySelector('.eppItemRow[data-i="'+i+'"]');
  if(fila&&fila.scrollIntoView)fila.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function escanearEppItem(indice,codigo){
  const fila=eppItemRows[indice];
  if(!fila)return;
  const limpia=String(codigo||'').trim();
  if(!limpia)return;
  const cat=eppCatalog.find(c=>normalizarCodigo(c.codigo)===normalizarCodigo(limpia));
  if(cat){
    fila.otro=false;
    fila.eppCodigo=cat.codigo;
    fila.nombre=cat.nombre;
    if(!fila.detalle)fila.detalle=cat.detalle||'';
    fila.tipoTalla=cat.tipo_talla||null;
    const tallas=tallasDeTipo(tipoTallaDeItem(fila));
    if(!tallas.includes(fila.talla))fila.talla='';
  }else{
    fila.otro=true;
    fila.eppCodigo='';
    fila.nombre=limpia;
    fila.tipoTalla=null;
    avisarElementoFueraDeCatalogo(limpia);
  }
  renderEppItemRows();
}
function removeEppItemRow(i){
  if(eppItemRows.length===1)return;
  eppItemRows.splice(i,1);
  renderEppItemRows();
}
function collectEppItems(){
  const out=[];
  eppItemRows.forEach(r=>{
    const nombre=(r.otro?r.nombre:(r.nombre||(eppCatalog.find(c=>c.codigo===r.eppCodigo)||{}).nombre)||'').trim();
    const cantidad=parseInt(r.cantidad,10);
    if(!nombre)return;
    if(!cantidad||cantidad<1)return;
    out.push({
      epp_codigo:r.otro?null:r.eppCodigo,
      nombre,
      detalle:(r.detalle||'').trim()||null,
      talla:(r.talla||'').trim()||null,
      cantidad
    });
  });
  return out;
}
function eppDetalleResumen(items){
  if(!items.length)return'';
  return items.map(i=>{
    const partes=[i.nombre];
    if(i.epp_codigo)partes.unshift(i.epp_codigo);
    if(i.talla)partes.push('talla '+i.talla);
    partes.push('x'+i.cantidad);
    return partes.join(' ');
  }).join(', ');
}

// ---------- EPP: entrega inicial por cargo ----------
// "Soldador", "soldador" y "SOLDADOR " deben encontrar el mismo kit.
function normalizarCargo(cargo){
  return String(cargo||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // quita tildes
    .toLowerCase().trim();
}
function cargoDelTrabajador(code){
  const w=workers.find(x=>x.code===code);
  return w?(w.spec||''):'';
}
// El botón "Agregar kit del cargo" lleva a la vista de kits: ahí la
// entrega se controla por ítem (pendiente/entregado), no de una sola vez.
function kitSugeridoPara(code){
  const esp=especialidadDelTrabajador(code);
  if(!esp)return null;
  const lista=kitsDeEspecialidad(esp.id);
  if(!lista.length)return null;
  const conItems=lista.find(k=>itemsDeKit(k.id).length);
  return {esp,kit:conItems||lista[0],total:itemsDeKit((conItems||lista[0]).id).length};
}
function actualizarSugerenciaKit(){
  const code=document.getElementById('epp-worker').value;
  const cargo=cargoDelTrabajador(code);
  const btn=document.getElementById('eppKitBtn');
  const tag=document.getElementById('eppCargoTag');
  const sugerencia=kitSugeridoPara(code);
  if(tag)tag.innerHTML=cargo?`Cargo: <b>${cargo}</b>`:'Selecciona un trabajador para ver su cargo.';
  if(!btn)return;
  if(sugerencia){
    btn.style.display='';
    btn.textContent=`Ir al kit de ${sugerencia.esp.nombre} (${sugerencia.total} elementos)`;
  }else{
    btn.style.display='none';
    btn.textContent='Ir al kit del cargo';
  }
}
function addEppCargoKit(){
  const code=document.getElementById('epp-worker').value;
  const sugerencia=kitSugeridoPara(code);
  if(!sugerencia){
    alert('No hay un kit configurado para este cargo. Créalo en "Kits por especialidad" o agrega los elementos a mano.');
    return;
  }
  showView('bodega-kits');
  const selW=document.getElementById('kit-worker');
  if(selW)selW.value=code;
  actualizarKitWorkerHint();
  document.getElementById('kit-esp').value=sugerencia.esp.id;
  fillKitSelects();
  document.getElementById('kit-select').value=sugerencia.kit.id;
  renderKitPreview();
}

// ---------- EPP: pad de firma (canvas, táctil para tablet) ----------
// Hay un pad por vista. El sufijo "" es el de Entrega de EPP y "Kit" el de
// Kits por especialidad; así una sola implementación sirve para ambos.
const sigInk={};   // id del canvas -> tiene trazo
function sigIds(suf){return{canvas:'sigPad'+suf,wrap:'sigPadWrap'+suf,stamp:'sigStamp'+suf};}
function sigHasInkOn(suf){return!!sigInk['sigPad'+(suf||'')];}
function initSignaturePad(suf){
  suf=suf||'';
  const ids=sigIds(suf);
  const canvas=document.getElementById(ids.canvas);
  if(!canvas||canvas.dataset.wired==='1')return;
  canvas.dataset.wired='1';
  const ctx=canvas.getContext('2d');
  const resize=()=>{
    const ratio=window.devicePixelRatio||1;
    const rect=canvas.getBoundingClientRect();
    if(!rect.width)return;
    const tiene=sigInk[ids.canvas];
    const data=tiene?ctx.getImageData(0,0,canvas.width,canvas.height):null;
    canvas.width=Math.max(1,Math.round(rect.width*ratio));
    canvas.height=Math.max(1,Math.round(rect.height*ratio));
    ctx.lineWidth=2.2*ratio;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.strokeStyle='#101a14';
    if(data)ctx.putImageData(data,0,0);
  };
  const pos=ev=>{
    const rect=canvas.getBoundingClientRect();
    return {x:(ev.clientX-rect.left),y:(ev.clientY-rect.top)};
  };
  let dibujando=false;
  const iniciar=ev=>{
    ev.preventDefault();
    dibujando=true;
    const p=pos(ev);
    const ratio=window.devicePixelRatio||1;
    ctx.beginPath();
    ctx.moveTo(p.x*ratio,p.y*ratio);
    sigInk[ids.canvas]=true;
    const wrap=document.getElementById(ids.wrap);
    if(wrap)wrap.classList.add('firmado');
    // Firmar ES el momento en que se toma la ubicación y la hora. Es un
    // gesto del usuario, y además el navegador permite pedir el permiso
    // geográfico desde acá sin que se queje.
    if(typeof alFirmar==='function')alFirmar(suf);
  };
  const trazar=ev=>{
    if(!dibujando)return;
    ev.preventDefault();
    const p=pos(ev);
    const ratio=window.devicePixelRatio||1;
    ctx.lineTo(p.x*ratio,p.y*ratio);
    ctx.stroke();
  };
  const terminar=()=>{dibujando=false;};
  canvas.addEventListener('pointerdown',iniciar);
  canvas.addEventListener('pointermove',trazar);
  canvas.addEventListener('pointerup',terminar);
  canvas.addEventListener('pointerleave',terminar);
  canvas.addEventListener('pointercancel',terminar);
  window.addEventListener('resize',resize);
  resize();
}
function clearSignature(suf){
  suf=suf||'';
  const ids=sigIds(suf);
  const canvas=document.getElementById(ids.canvas);
  if(!canvas)return;
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  sigInk[ids.canvas]=false;
  const wrap=document.getElementById(ids.wrap);
  if(wrap)wrap.classList.remove('firmado');
  // Firmar de nuevo es un hecho nuevo: se olvida la hora anterior y se
  // vuelve a pedir la ubicación. Si no, la entrega se firmaría con la hora
  // del primer intento, que ya no es la de la firma que se está guardando.
  firmaAl[suf]=null;
  gpsPedido[suf]=false;
  if(typeof limpiarGps==='function')limpiarGps(suf);
}
// Recorta los márgenes vacíos y devuelve el PNG de la firma, o null si está en blanco.
function signatureDataUrl(suf){
  suf=suf||'';
  const ids=sigIds(suf);
  if(!sigInk[ids.canvas])return null;
  const canvas=document.getElementById(ids.canvas);
  if(!canvas)return null;
  const ctx=canvas.getContext('2d');
  const {width,height}=canvas;
  const data=ctx.getImageData(0,0,width,height).data;
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      if(data[(y*width+x)*4+3]>10){
        if(x<minX)minX=x;
        if(x>maxX)maxX=x;
        if(y<minY)minY=y;
        if(y>maxY)maxY=y;
      }
    }
  }
  if(maxX<0)return null;
  const pad=8;
  minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);
  maxX=Math.min(width-1,maxX+pad);maxY=Math.min(height-1,maxY+pad);
  const out=document.createElement('canvas');
  out.width=maxX-minX+1;
  out.height=maxY-minY+1;
  out.getContext('2d').drawImage(canvas,minX,minY,out.width,out.height,0,0,out.width,out.height);
  return out.toDataURL('image/png');
}

// ---------- EPP: geolocalización y hora de la firma ----------
// sufijo "" = Entrega de EPP, "Kit" = Kits por especialidad
//
// POR QUÉ SE TOMA SOLA AL FIRMAR
//
// Antes había un botón "Capturar ubicación" aparte. El resultado era que
// casi ninguna entrega lo tenía: la persona firmaba, leía "Guardar
// entrega" y listo. Y una entrega sin coordenadas no sirve para verificar
// nada, que es justo para lo que se pide la firma.
//
// Así que la ubicación y la hora se toman en el instante en que el
// trabajador empieza a firmar, que es el momento que importa, y no cuando se
// apretó Guardar, que puede ser un rato después.
//
// SE PIDE UNA SOLA VEZ POR FIRMA. El navegador va incluida la última
// posición conocida si elapsed <maximumAge>, así que la ubicación es la de
// ese momento; y pedirla en cada trazo abriría el permiso una y otra vez,
// hasta que el navegador empieza a ignorarlo del todo.
const gpsEnCurso={};   // sufijo -> promesa de la captura
const firmaAl={};      // sufijo -> ISO del instante en que se empezó a firmar
const gpsPedido={};    // sufijo -> ¿ya se pidió en esta firma?

// Se dispara al empezar el trazo. Deja el reloj de la firma y pide la
// ubicación una única vez.
function alFirmar(suf){
  suf=suf||'';
  if(!firmaAl[suf])firmaAl[suf]=new Date().toISOString();
  if(gpsPedido[suf])return;
  gpsPedido[suf]=true;
  captureGps(suf);
}
function limpiarGps(suf){
  suf=suf||'';
  eppGps=null;
  const status=document.getElementById('gpsStatus'+suf);
  const val=document.getElementById('gpsVal'+suf);
  // Vuelve el texto que explica qué va a pasar, no un "sin ubicación" seco.
  // Este estado es el de partida de la próxima entrega, y la instrucción es
  // lo que la persona necesita ver en ese momento.
  // El texto tiene que ser EXACTAMENTE el mismo que el del HTML, porque al
  // limpiar el formulario se vuelve a poner este y la persona lee uno y
  // otro. "empiece" vs "empieza" no es grave, pero dos textos para lo mismo
  // es una de las cosas que hacen que la pantalla parezca menos cuidado.
  if(status){status.textContent='Se toma sola cuando el trabajador empieza a firmar.';status.className='';}
  if(val)val.textContent='—';
}
// Devuelve una promesa que resuelve con la ubicación, o con null si no se
// pudo. Antes no devolvía nada, y por eso no se podía esperar: el guardado
// seguía de largo y se guardaba sin coordenadas sin que nadie se enterara.
function captureGps(suf){
  suf=suf||'';
  const status=document.getElementById('gpsStatus'+suf);
  const val=document.getElementById('gpsVal'+suf);
  if(!navigator.geolocation){
    if(status){status.textContent='Este dispositivo no reporta ubicación.';status.className='gpsWarn';}
    return Promise.resolve(null);
  }
  if(status){status.textContent='Obteniendo ubicación…';status.className='';}
  const promesa=new Promise(resolve=>{
    navigator.geolocation.getCurrentPosition(
      pos=>{
        eppGps={lat:pos.coords.latitude,lng:pos.coords.longitude,precision:pos.coords.accuracy};
        if(status){
          status.textContent='Ubicación capturada ('+Math.round(pos.coords.accuracy)+' m de precisión).';
          status.className='gpsOk';
        }
        if(val)val.textContent=pos.coords.latitude.toFixed(6)+', '+pos.coords.longitude.toFixed(6);
        resolve(eppGps);
      },
      err=>{
        eppGps=null;
        if(status){
          status.textContent=err.code===1?'Permiso de ubicación denegado: la entrega se guardará sin GPS.':'No se pudo obtener la ubicación ('+err.message+').';
          status.className='gpsWarn';
        }
        if(val)val.textContent='—';
        resolve(null);
      },
      {enableHighAccuracy:true,timeout:10000,maximumAge:60000}
    );
  });
  gpsEnCurso[suf]=promesa;
  return promesa;
}
// Espera la ubicación con un tope. El tope importa: si la espera se queda
// colgada (sin señal, con el teléfono bloqueado), el botón de guardar no
// puede quedar esperando para siempre. Se suelta el GPS y se guarda igual,
// diciendo que no se obtuvo.
async function esperarGps(suf,ms){
  const p=gpsEnCurso[suf];
  if(!p)return eppGps;
  if(eppGps)return eppGps;
  let fin=null;
  const reloj=new Promise(r=>{fin=setTimeout(()=>r('timeout'),ms||9000);});
  const r=await Promise.race([p,reloj]);
  if(fin)clearTimeout(fin);
  return r==='timeout'?null:r;
}

// ---------- EPP: respaldo PDF ----------
function buildEppPdf(entrega,items,sigDataUrl){
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const w=doc.internal.pageSize.getWidth();
  // los datos son los de la empresa a la que pertenece quien recibe
  const emp=empresaData(workers.find(x=>x.code===entrega.code));
  let y=18;
  doc.setFont('helvetica','bold').setFontSize(15).setTextColor(31,45,61);
  doc.text(emp.nombre||'Control de Asistencia y Portería',14,y);
  doc.setFont('helvetica','normal').setFontSize(9).setTextColor(122,127,133);
  doc.text('Constancia de entrega de EPP / materiales',14,y+6);
  doc.setDrawColor(176,141,87).setLineWidth(0.5).line(14,y+9,w-14,y+9);
  y+=17;
  const worker=workers.find(x=>x.code===entrega.code);
  const firmante=worker?worker.name:entrega.code;
  doc.setFontSize(10).setTextColor(35,39,43);
  const tipoEntrega=entrega.es_entrega_inicial?'ENTREGA INICIAL (kit completo del oficio)':'Entrega / recambio';
  const datos=[
    ['Trabajador',`${firmante} (${entrega.code})`],
    ['Cargo',entrega.cargo||'—'],
    ['Tipo',tipoEntrega],
    ['Fecha de entrega',entrega.fecha],
    ['Firmado el',entrega.firma_at?new Date(entrega.firma_at).toLocaleString('es-CL'):'—'],
    ['Ubicación',entrega.firma_lat!=null?`${Number(entrega.firma_lat).toFixed(6)}, ${Number(entrega.firma_lng).toFixed(6)}`+(entrega.firma_precision_m?` (±${Math.round(entrega.firma_precision_m)} m)`:''):'no capturada'],
    ['Observación',entrega.observacion||'—']
  ];
  datos.forEach(([k,v])=>{
    doc.setFont('helvetica','bold').setFontSize(9).setTextColor(122,127,133);
    doc.text(k+':',14,y);
    doc.setFont('helvetica','normal').setFontSize(10).setTextColor(35,39,43);
    const anchoEtiqueta=entrega.cargo&&k==='Cargo'?14:38;
    doc.text(String(v),14+anchoEtiqueta,y);
    y+=7;
  });
  y+=4;
  if(entrega.es_entrega_inicial){
    doc.setFillColor(176,141,87).rect(14,y-5,w-28,8,'F');
    doc.setFont('helvetica','bold').setFontSize(9).setTextColor(255,255,255);
    doc.text('ENTREGA INICIAL: el trabajador declara recibir el EPP completo de su oficio.',16,y);
    y+=12;
  }
  doc.setFont('helvetica','bold').setFontSize(11).setTextColor(31,45,61);
  doc.text('Elementos entregados',14,y);
  y+=6;
  const cols=[14,58,104,138,160];
  const headers=['Código','Elemento','Detalle','Talla','Cant.'];
  doc.setFillColor(31,45,61).rect(14,y-5,w-28,8,'F');
  doc.setFont('helvetica','bold').setFontSize(8.5).setTextColor(255,255,255);
  headers.forEach((h,i)=>doc.text(h,cols[i]+1.5,y));
  y+=7;
  doc.setFont('helvetica','normal').setFontSize(8.5).setTextColor(35,39,43);
  items.forEach((it,idx)=>{
    if(y>262){
      doc.addPage();
      y=18;
    }
    if(idx%2===1){
      doc.setFillColor(246,247,245).rect(14,y-4.5,w-28,7,'F');
    }
    const tallas=String(it.talla||'—');
    const trunc=(s,max)=>{
      let t=String(s||'—');
      while(doc.getTextWidth(t)>max&&t.length>1)t=t.slice(0,-2);
      return t===String(s||'—')?t:t+'…';
    };
    doc.text(trunc(it.epp_codigo,40),cols[0]+1.5,y);
    doc.text(trunc(it.nombre,44),cols[1]+1.5,y);
    doc.text(trunc(it.detalle,32),cols[2]+1.5,y);
    doc.text(tallas,cols[3]+1.5,y);
    doc.text(String(it.cantidad),cols[4]+1.5,y);
    y+=7;
  });
  doc.setDrawColor(220,221,208).setLineWidth(0.3).line(14,y-2,w-14,y-2);
  y+=8;
  if(sigDataUrl){
    const firmaH=32;
    doc.setFont('helvetica','bold').setFontSize(9).setTextColor(122,127,133);
    doc.text('Firma del trabajador',14,y);
    try{
      doc.addImage(sigDataUrl,'PNG',14,y+4,70,firmaH);
    }catch(error){
      doc.setFont('helvetica','normal').setTextColor(181,80,74).text('[firma no disponible]',14,y+16);
    }
    doc.setDrawColor(122,127,133).setLineWidth(0.3).line(14,y+4+firmaH,90,y+4+firmaH);
    doc.setFont('helvetica','normal').setFontSize(7.5).setTextColor(122,127,133);
    doc.text(`${firmante} · ${entrega.fecha}`,14,y+9+firmaH);
    y+=44;
  }else{
    doc.setFont('helvetica','normal').setFontSize(9).setTextColor(181,80,74);
    doc.text('Entrega registrada sin firma.',14,y+4);
    y+=14;
  }
  doc.setFont('helvetica','normal').setFontSize(7.5).setTextColor(122,127,133);
  doc.text('Documento generado automáticamente por el sistema de Control de Asistencia y Portería.',14,288);
  return doc.output('blob');
}
async function uploadToBucket(path,blob,contentType){
  const {error}=await window.supabaseClient.storage.from(EPP_BUCKET).upload(path,blob,{contentType,upsert:true});
  if(error)throw new Error(error.message);
  return path;
}
async function downloadFromBucket(path,filename){
  const {data,error}=await window.supabaseClient.storage.from(EPP_BUCKET).download(path);
  if(error){alert('No se pudo descargar el respaldo: '+error.message);return;}
  const url=URL.createObjectURL(data);
  const link=document.createElement('a');
  link.href=url;
  link.download=filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}

// ---------- EPP: guardar entrega ----------
async function saveEpp(){
  const btn=document.getElementById('eppSaveBtn');
  const msg=document.getElementById('eppSaveMsg');
  const code=document.getElementById('epp-worker').value;
  const fecha=document.getElementById('epp-fecha').value||hoyLocal();
  const observacion=document.getElementById('epp-obs').value.trim();
  const esInicial=document.getElementById('epp-inicial').checked;
  const cargo=cargoDelTrabajador(code)||null;
  const items=collectEppItems();
  if(!code){alert('Selecciona o escanea al trabajador.');return;}
  if(!items.length){alert('Agrega al menos un elemento con nombre y cantidad.');return;}
  const resumenConfirm=`¿Confirmas ${esInicial?'la ENTREGA INICIAL':'la entrega'} de ${items.length} elemento(s) a ${(workers.find(w=>w.code===code)||{}).name||code}?`;
  if(!confirm(resumenConfirm))return;

  const sigDataUrl=signatureDataUrl();
  if(!sigDataUrl&&!confirm('No hay firma en el recuadro. ¿Guardar la entrega igual?'))return;

  btn.disabled=true;
  msg.textContent='Generando PDF…';
  msg.style.color='var(--muted)';

  // La ubicación se pidió al firmar, pero es asíncrona: si guardan justo
  // después de firmar puede que todavía no haya llegado. Se espera un poco
  // en vez de guardar sin coordenadas a ciegas, y si no llega se guarda
  // igual avisando que no se obtuvo.
  let gps=eppGps;
  if(sigDataUrl&&!gps&&gpsEnCurso['']){
    msg.textContent='Esperando la ubicación…';
    gps=await esperarGps('',9000);
    if(!gps)msg.textContent='No se obtuvo la ubicación; se guarda la firma igual.';
  }
  if(!gps)gps=eppGps;

  const stamp=new Date();
  const base={code,fecha,detalle:eppDetalleResumen(items),observacion:observacion||null,es_entrega_inicial:esInicial,cargo,
    pasillo:document.getElementById('epp-pasillo').value.trim()||null,
    sector:document.getElementById('epp-sector').value.trim()||null,
    nivel:document.getElementById('epp-nivel').value.trim()||null};
  // La hora que se guarda es la de la FIRMA, no la del guardado. Entre una
  // y otra puede pasar un rato: se revisa la entrega, se conversa con la
  // persona, se busca un elemento. Guardar la hora del guardado haría que
  // la entrega pareciera firmada más tarde de lo que fue.
  const firmaAt=sigDataUrl?(firmaAl['']||stamp.toISOString()):null;
  const payload={
    ...base,
    firma_url:null,
    firma_at:firmaAt,
    firma_metodo:sigDataUrl?'canvas':null,
    firma_lat:gps?gps.lat:null,
    firma_lng:gps?gps.lng:null,
    firma_precision_m:gps?gps.precision:null,
    pdf_url:null
  };
  try{
    const {data,error}=await window.supabaseClient.from('epp_entregas').insert(payload).select().single();
    if(error)throw new Error(error.message);
    const entrega=data;
    const {error:errItems}=await window.supabaseClient.from('epp_entrega_items')
      .insert(items.map(it=>({entrega_id:entrega.id,...it})));
    if(errItems)throw new Error(errItems.message);

    // firma + PDF al bucket privado
    msg.textContent='Subiendo firma y PDF…';
    const carpeta=`${entrega.code}/${entrega.id}`;
    if(sigDataUrl){
      const firmaBlob=await (await fetch(sigDataUrl)).blob();
      const firmaPath=`${carpeta}/firma.png`;
      await uploadToBucket(firmaPath,firmaBlob,'image/png');
      const {error:errF}=await window.supabaseClient.from('epp_entregas').update({firma_url:firmaPath}).eq('id',entrega.id);
      if(errF)throw new Error(errF.message);
      entrega.firma_url=firmaPath;
    }
    const pdfBlob=buildEppPdf(entrega,items,sigDataUrl);
    const pdfPath=`${carpeta}/entrega_${entrega.fecha}.pdf`;
    await uploadToBucket(pdfPath,pdfBlob,'application/pdf');
    const {error:errP}=await window.supabaseClient.from('epp_entregas').update({pdf_url:pdfPath}).eq('id',entrega.id);
    if(errP)throw new Error(errP.message);
    entrega.pdf_url=pdfPath;
    entrega.items=items.map(it=>({...it,entrega_id:entrega.id}));

    await loadEppDeliveries();
    eppItemRows=[];
    addEppItemRow();
    clearSignature();
    limpiarGps('');
    document.getElementById('epp-inicial').checked=false;
    document.getElementById('epp-obs').value='';
    document.getElementById('sigStamp').textContent='';
    // El formulario se limpia para la entrega siguiente, así que el estado
    // de la ubicación se pierde de la pantalla. Por eso la confirmación
    // dice si esta entrega quedó con ubicación o no: es el único momento en
    // que la persona puede enterarse de que faltó, y sirve para ir a
    // regularizarla.
    msg.textContent=gps
      ?'Entrega registrada con PDF, firma y ubicación.'
      :'Entrega registrada con PDF y firma, pero SIN ubicación. Se puede agregar después desde el historial.';
    msg.style.color=gps?'var(--accent)':'var(--warn-ink)';
  }catch(error){
    msg.textContent='No se pudo guardar: '+error.message;
    msg.style.color='var(--danger)';
    alert('No se pudo guardar la entrega: '+error.message);
  }finally{
    btn.disabled=false;
  }
}
function updateEppWorkerHint(){
  const code=document.getElementById('epp-worker').value;
  const w=workers.find(x=>x.code===code);
  const el=document.getElementById('eppWorkerHint');
  if(el)el.innerHTML=w?`<small>Seleccionado: <b>${w.name}</b>${w.spec?' — '+w.spec:''}${w.status==='desvinculado'?' <span class="eppBadge sinFirma">Desvinculado</span>':''}</small>`:'';
  if(w)document.getElementById('sigStamp').textContent='Firma de '+w.name;
  actualizarSugerenciaKit();
}

// ---------- EPP: historial ----------
// Tabla con UNA FILA POR TRABAJADOR. El detalle de cada uno se abre y se
// cierra con "Ver detalle", así se puede ver de un vistazo quién tiene
// entrega y quién no, en vez de una tarjeta por entrega (que con dos
// entregas del mismo trabajador lo parte en dos bloques y cuesta
// entender que es la misma persona).
//
// Los filtros no quitan columnas: acotan qué entregas se ven. Un
// trabajador aparece si tiene al menos una entrega que pase los filtros,
// y dentro de él solo se listan las que pasan. Si no, el filtro "Elemento
// EPP" wouldn't serve de nada.
const CODIGOS_MOSTRADOS_POR_FILA=4;
let eppFilaAbierta=null;   // código del trabajador con el detalle abierto
let eppFilaAbiertaAntesDeFiltrar=null;

function normalizar(t){
  return String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// ------------------------------------------------------------------
// FALTA UNA COLUMNA AL IMPORTAR
// ------------------------------------------------------------------
// "Could not find the 'rut' column of 'trabajadores' in the schema
// cache" no dice por qué, y hay dos causas con arreglos distintos:
//
//   1. La migración no está aplicada. El RUT no existe en la base.
//   2. La migración SÍ está aplicada, pero PostgREST tiene el esquema
//      viejo en memoria. La columna existe; lo que no la ve es la API.
//
// Es la misma diferencia entre "no lo hice" y "lo hice y no se enteró",
// y el arreglo es otro: en el primer caso hay que ejecutar un archivo,
// en el segundo hay que recargar la caché.
//
// Por eso se comprueba en vez de adivinar: se pregunta a la base por la
// columna. Si responde que existe, el problema es la caché. Si no
// responde, es la migración.
//
// Se nota que PostgREST solo conoce lo que tiene cacheado, así que
// cuando dice "no encuentro la columna" no se puede concluir que la
// columna no exista: por eso la pregunta va por otra vía (un RPC que
// mira information_schema, que es la base real).
function columnaDeLaImportacionFalta(error){
  const msg=String((error&&error.message)||error||'');
  const col=msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
  if(!col)return '';
  const columna=col[1];
  const tabla=col[2];
  const archivo=(MIGRACIONES_REQUERIDAS.find(m=>m.tabla===tabla&&m.columna===columna)||{}).archivo
    ||MIGRACIONES_REQUERIDAS.find(m=>m.tabla===tabla).archivo
    ||'';

  // Pregunta a la base real, no a la caché de PostgREST.
  const baseYaLaTiene=(async()=>{
    try{
      const {data,error:e}=await window.supabaseClient.rpc('columna_existe',{tabla,columna});
      if(e)return null;   // la 022 no está aplicada: no se puede saber
      return data===true;
    }catch(e){return null;}
  })();

  // El mensaje se arma después de responder, para poder decir la causa
  // correcta. Por eso devuelve una promesa: hay que esperarla antes de
  // ponerla en la pantalla.
  return baseYaLaTiene.then((existe)=>{
    if(existe===true){
      return '<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">'+
        '<b>La columna '+escHtml(columna)+' sí existe, pero la API no la ve.</b><br>'+
        '<small>La migración ya está aplicada y lo que quedó viejo es la caché de esquema de PostgREST. '+
        'En el <b>SQL Editor</b> de Supabase ejecuta:<br>'+
        '<b style="font-family:ui-monospace,Consolas,monospace">NOTIFY pgrst, \'reload schema\';</b><br>'+
        'Espera unos segundos y vuelve a importar. No hace falta volver a correr la migración.</small></div>';
    }
    if(existe===false){
      return '<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:8px 12px;border-radius:8px">'+
        '<b>Falta la migración '+escHtml(archivo||'que agrega '+columna)+'.</b><br>'+
        '<small>La columna <code>'+escHtml(columna)+'</code> no existe en la tabla <code>'+escHtml(tabla)+
        '</code>. Ábrela en el <b>SQL Editor</b> de Supabase y ejecútala, y después vuelve a importar. '+
        'Si ya la habías ejecutado, entonces el problema es la caché: <b>NOTIFY pgrst, \'reload schema\';</b></small></div>';
    }
    return '<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:8px 12px;border-radius:8px">'+
      '<b>Falta una migración: '+escHtml(archivo||columna)+'</b><br>'+
      '<small>Abre <b>'+escHtml(archivo||'la migración correspondiente')+'</b> en el SQL Editor de Supabase. '+
      'Si ya la ejecutaste y el error sigue, la caché de esquema está vieja: '+
      '<b>NOTIFY pgrst, \'reload schema\';</b></small></div>';
  });
}

// ------------------------------------------------------------------
// ERRORES AL INVOCAR UNA EDGE FUNCTION
// ------------------------------------------------------------------
// supabase-js devuelve dos cosas muy distintas y hay que separarlas:
//
//   · "FunctionsHttpError" con 404 -> la función no está desplegada.
//   · "Failed to send a request to the Edge Function" -> lo MISMO, en
//     la práctica. Cuando la función no existe, la URL devuelve la
//     página de error del panel en vez de JSON, el cliente no puede
//     parsearla y reporta ese texto genérico.
//
// Antes solo se miraba el primero, así que el segundo salía tal cual en
// pantalla: "Failed to send a request to the Edge Function". Eso no le
// dice nada a quien lo lee, y lo que necesita es el comando.
//
// "Invalid JWT" y "401" son otra cosa: la sesión caducó. Se distingue
// porque la solución es reentrar, no desplegar nada.
function errorDeInvocarFuncion(error,nombre,alternativa){
  const texto=String((error&&error.message)||error||'');
  if(/Invalid JWT|JWT|session|401|unauthor/i.test(texto)){
    return 'Tu sesión caducó. Vuelve a iniciar sesión e inténtalo de nuevo.';
  }
  if(/Failed to fetch|Network|Failed to send a request|not found|404|does not exist|non-2xx/i.test(texto)){
    return 'La función <b>'+escHtml(nombre)+'</b> no está desplegada todavía.<br>'+
      'En la terminal, dentro del proyecto:<br>'+
      '<b style="font-family:ui-monospace,Consolas,monospace">supabase functions deploy '+escHtml(nombre)+'</b>'+
      (alternativa?('<br><br>'+alternativa):'');
  }
  return 'No se pudo completar: '+escHtml(texto);
}
function valorFiltroEpp(id){
  const el=document.getElementById(id);
  return el?String(el.value||'').trim():'';
}
function limpiarFiltrosEpp(){
  ['epp-buscar','epp-filter','epp-filtro-item','epp-filtro-firma','epp-filtro-desde','epp-filtro-hasta']
    .forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderEppHistory();
}
function toggleEppDetalle(code){
  eppFilaAbierta=eppFilaAbierta===code?null:code;
  renderEppHistory();
}
// Entregas de un trabajador que pasan los filtros de la barra superior.
function entregasFiltradasDe(code){
  const desde=valorFiltroEpp('epp-filtro-desde');
  const hasta=valorFiltroEpp('epp-filtro-hasta');
  const firma=valorFiltroEpp('epp-filtro-firma');
  const item=valorFiltroEpp('epp-filtro-item');
  return eppDeliveries.filter(e=>{
    if(e.code!==code)return false;
    const f=e.fecha||'';
    if(desde&&f<desde)return false;
    if(hasta&&f>hasta)return false;
    if(firma==='firmadas'&&!e.firma_url)return false;
    if(firma==='sinfirma'&&e.firma_url)return false;
    if(item&&!(e.items||[]).some(i=>i.epp_codigo===item))return false;
    return true;
  });
}
// Los ítems de una entrega, o solo los del elemento que se está filtrando.
function itemsVisibles(e){
  const items=e.items||[];
  const item=valorFiltroEpp('epp-filtro-item');
  return item?items.filter(i=>i.epp_codigo===item):items;
}
// Enlace al mapa de la firma.
//
// Se arma con encodeURIComponent sobre el par de coordenadas, no con los
// números pelados: son doubles, y un "NaN" o un "undefined" dentro del href
// produce un enlace que no abre nada, que es peor que no tener enlace.
// Se usa la latitud primero porque así lo espera la URL de Google.
function enlaceMapa(lat,lng){
  const la=Number(lat), ln=Number(lng);
  if(!isFinite(la)||!isFinite(ln))return '#';
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(la+','+ln);
}
function etiquetaItemEpp(i){
  return i.epp_codigo||i.nombre||'—';
}
function codigosEppDe(entregas){
  const set=new Set();
  entregas.forEach(e=>itemsVisibles(e).forEach(i=>{
    const c=etiquetaItemEpp(i);
    if(c&&c!=='—')set.add(c);
  }));
  return Array.from(set);
}
function renderEppHistory(){
  const el=document.getElementById('eppHistory');
  if(!el)return;
  const buscar=normalizar(valorFiltroEpp('epp-buscar'));
  const soloTrabajador=valorFiltroEpp('epp-filter');

  // Un trabajador por fila, con las entregas que le corresponden.
  const porCodigo=new Map();
  eppDeliveries.forEach(e=>{
    if(!porCodigo.has(e.code))porCodigo.set(e.code,[]);
    porCodigo.get(e.code).push(e);
  });
  let filas=[];
  porCodigo.forEach((entregas,code)=>{
    if(soloTrabajador&&code!==soloTrabajador)return;
    const w=workers.find(x=>x.code===code);
    if(buscar){
      const heno=normalizar((w?w.name:'')+' '+code);
      if(heno.indexOf(buscar)<0)return;
    }
    const visibles=entregasFiltradasDe(code);
    if(!visibles.length)return;
    filas.push({code,w,entregas:visibles,total:entregas.length});
  });
  // la más reciente arriba
  filas.sort((a,b)=>{
    const fa=a.entregas[0].fecha||'',fb=b.entregas[0].fecha||'';
    return fa<fb?1:fa>fb?-1:(a.code<b.code?-1:1);
  });

  const fHayFiltro=!!(buscar||soloTrabajador||valorFiltroEpp('epp-filtro-item')||
    valorFiltroEpp('epp-filtro-firma')||valorFiltroEpp('epp-filtro-desde')||valorFiltroEpp('epp-filtro-hasta'));
  if(!filas.length){
    el.innerHTML=`<div class="eppVacio">${eppDeliveries.length
      ? 'Ningún trabajador coincide con los filtros.'
      : 'Sin entregas registradas todavía.'}</div>`;
    return;
  }
  const piezas=filas.reduce((s,f)=>s+f.entregas.reduce((t,e)=>t+itemsVisibles(e).reduce((u,i)=>u+(Number(i.cantidad)||1),0),0),0);
  el.innerHTML=
    (fHayFiltro?`<div class="eppVacio" style="padding:6px 0;text-align:left">
       <b>${filas.length}</b> trabajador(es) · <b>${piezas}</b> pieza(s) en lo filtrado.
       <button class="btn secondary" type="button" onclick="limpiarFiltrosEpp()">Limpiar filtros</button></div>`:'')+
    `<div class="overflow"><table class="eppTabla"><thead><tr>
       <th>Cód.</th><th class="izq">Nombre</th><th class="izq">EPP recibido</th>
       <th>Entregas</th><th>Piezas</th><th>Última</th><th>Firma</th><th></th>
     </tr></thead><tbody>`+
    filas.map(f=>{
      const abierta=eppFilaAbierta===f.code;
      const cods=codigosEppDe(f.entregas);
      const mostrados=cods.slice(0,CODIGOS_MOSTRADOS_POR_FILA);
      const sobra=cods.length-mostrados.length;
      // el "+N" abre el detalle, así que no hace falta que quepan todos
      const tituloCods=cods.length
        ?' title="'+escHtml(cods.join(', '))+'"'
        :' title="Sin ítems detallados"';
      const piezasF=f.entregas.reduce((t,e)=>t+itemsVisibles(e).reduce((u,i)=>u+(Number(i.cantidad)||1),0),0);
      const sinFirma=f.entregas.filter(e=>!e.firma_url).length;
      const ultima=(f.entregas[0].fecha||'');
      const badges=`<div class="eppCodigos"${tituloCods}>`+
        mostrados.map(c=>`<span class="eppCod">${escHtml(c)}</span>`).join('')+
        (sobra>0?`<span class="eppCod mas">+${sobra}</span>`:'')+
        (cods.length?'':'<small>—</small>')+
        `</div>`;
      const firma=sinFirma
        ?(f.entregas.length===sinFirma?'<span class="eppBadge sinFirma">Sin firma</span>':`<span class="eppBadge sinFirma">${sinFirma} sin firma</span>`)
        :'<span class="eppBadge firmado">Firmado</span>';
      const tr=`<tr class="eppFila${abierta?' eppFilaAbierta':''}">
        <td><b>${escHtml(f.code)}</b></td>
        <td class="izq">${f.w?escHtml(f.w.name):'<small>(fuera de la lista)</small>'}${f.w&&f.w.spec?` <small>· ${escHtml(f.w.spec)}</small>`:''}</td>
        <td class="izq">${badges}</td>
        <td>${f.entregas.length}${f.total!==f.entregas.length
        ?`<small title="de ${f.total} entregas en total"> / ${f.total}</small>`:''}</td>
        <td>${piezasF}</td>
        <td>${escHtml(ultima)}</td>
        <td>${firma}</td>
        <td><button class="btn secondary" type="button" onclick="toggleEppDetalle('${escHtml(f.code)}')"
            aria-expanded="${abierta}">${abierta?'Ocultar':'Ver detalle'} <span class="caret">▶</span></button></td>
      </tr>`;
      return abierta?tr+renderEppDetalleFila(f):tr;
    }).join('')+
    `</tbody></table></div>`;
}
// El detalle desplegado: una entrega por bloque, con sus ítems y los
// botones de PDF y firma. Se mantiene igual para no perder nada al
// cambiar la tabla a filas.
function renderEppDetalleFila(fila){
  const bloques=fila.entregas.map(e=>{
    const items=itemsVisibles(e);
    const filasItems=items.length
      ?`<div class="overflow"><table><thead><tr><th>Código</th><th class="izq">Elemento</th><th class="izq">Detalle</th><th>Talla</th><th>Cant.</th></tr></thead><tbody>${
          items.map(i=>`<tr><td>${escHtml(i.epp_codigo||'—')}</td><td class="izq">${escHtml(i.nombre)}</td><td class="izq">${escHtml(i.detalle||'—')}</td><td>${escHtml(i.talla||'—')}</td><td>${i.cantidad}</td></tr>`).join('')
        }</tbody></table></div>`
      :'<div class="eppVacio">Sin ítems detallados (registro anterior a la migración 008).</div>';
    // La ubicación viene de la base como double, pero se comprueba igual:
    // un NaN en pantalla ("NaN, NaN") no le sirve de nada a nadie.
    const num=Number(e.firma_lat), numLng=Number(e.firma_lng);
    const precision=Math.round(Number(e.firma_precision_m));
    const tieneGps=(e.firma_lat!=null&&e.firma_lng!=null&&isFinite(num)&&isFinite(numLng));
    // Las coordenadas son un enlace: ver dónde firmó en el mapa es lo que
    // sirve para verificar una entrega. El texto va pegado a la hora, porque
    // "dónde" y "cuándo" son la misma prueba y conviene verlas juntas.
    const gps=tieneGps
      ?`<small>📍 <a href="${enlaceMapa(num,numLng)}" target="_blank" rel="noopener noreferrer"`+
       ` title="Abrir en Google Maps" style="color:var(--accent)">${num.toFixed(5)}, ${numLng.toFixed(5)}`+
       `${isFinite(precision)?' (±'+precision+' m)':''} ↗</a></small>`
      :'<small class="gpsWarn">📍 sin ubicación</small>';
    return `<div class="eppEntrega">
      <div class="headline">
        <span><b>${escHtml(e.fecha)}</b>${e.cargo?` · ${escHtml(e.cargo)}`:''}</span>
        <span>
          ${e.es_entrega_inicial?'<span class="eppBadge" style="color:var(--accent);border-color:var(--accent)">Entrega inicial</span> ':''}
          <span class="eppBadge ${e.firma_url?'firmado':'sinFirma'}">${e.firma_url?'Firmado':'Sin firma'}</span>
        </span>
      </div>
      ${filasItems}
      <div class="eppActions">
        ${gps}
        ${e.firma_at?`<small>Firmado: ${escHtml(fechaLegible(e.firma_at,true))}</small>`:''}
        ${e.observacion?`<small>Obs.: ${escHtml(e.observacion)}</small>`:''}
        ${e.pdf_url?`<button class="btn secondary" type="button" onclick="downloadFromBucket('${escHtml(e.pdf_url)}','entrega_${escHtml(e.code)}_${escHtml(e.fecha)}.pdf')">📄 Descargar PDF</button>`:''}
        ${e.firma_url?`<button class="btn secondary" type="button" onclick="downloadFromBucket('${escHtml(e.firma_url)}','firma_${escHtml(e.code)}_${escHtml(e.fecha)}.png')">✍ Ver firma</button>`:''}
      </div>
    </div>`;
  }).join('');
  return `<tr class="eppDetalle"><td colspan="8">${bloques}</td></tr>`;
}

// ---------- bodega: herramientas ----------
// El código identifica el TIPO (HER-001 Taladro). La unidad física lleva
// su propio id en inventario_qr, que es lo que se codifica en la etiqueta.
function siguienteCodigoHerramienta(){
  const usados=new Set(tools.map(t=>String(t.codigo||'').toUpperCase()));
  for(let i=1;i<=9999;i++){
    const codigo='HER-'+String(i).padStart(3,'0');
    if(!usados.has(codigo))return codigo;
  }
  return '';
}
async function addTool(){
  const nombre=document.getElementById('tool-name').value.trim();
  const precio=parseFloat(document.getElementById('tool-price').value);
  const codigo=(document.getElementById('tool-codigo').value.trim()||siguienteCodigoHerramienta()).toUpperCase();
  if(!nombre||!precio){alert('Ingresa nombre y precio real de la herramienta.');return;}
  if(!codigo){alert('No hay más códigos disponibles en la serie HER-XXX.');return;}
  if(tools.some(t=>String(t.codigo||'').toUpperCase()===codigo)){alert('Ya existe una herramienta con el código '+codigo+'.');return;}
  const {error}=await window.supabaseClient.from('herramientas_catalogo').insert({codigo,nombre,precio});
  if(error){alert('No se pudo guardar en el catálogo: '+error.message);return;}
  ['tool-codigo','tool-name','tool-price'].forEach(id=>document.getElementById(id).value='');
  await loadTools();
  initBodega();
}
function unidadesDeHerramienta(herramientaId){
  return inventarioQr.filter(q=>q.tipo==='herramienta'&&mismoId(q.herramienta_id,herramientaId));
}
// Una unidad solo se puede entregar si su etiqueta está activa y no
// está en poder de alguien (asignación sin devolver).
function asignacionVigente(qrId){
  return toolAssignments.find(a=>mismoId(a.inventario_qr_id,qrId)&&!a.devuelta)||null;
}
function unidadesDisponibles(herramientaId){
  return unidadesDeHerramienta(herramientaId).filter(q=>q.estado==='activa'&&!asignacionVigente(q.id));
}
function renderToolCatalog(){
  const el=document.getElementById('toolCatalog');
  if(!el)return;
  if(!tools.length){el.innerHTML='<small>Catálogo vacío.</small>';return;}
  el.innerHTML=`<div class="overflow"><table><thead><tr><th>Código</th><th>Nombre</th><th>Precio (CLP)</th><th>Unidades</th><th>Estado</th></tr></thead><tbody>${
    tools.map(t=>{
      const total=unidadesDeHerramienta(t.id).length;
      const libres=unidadesDisponibles(t.id).length;
      return `<tr>
        <td><b>${t.codigo||'—'}</b></td>
        <td>${t.nombre}</td>
        <td>$${Number(t.precio).toLocaleString('es-CL')}</td>
        <td>${libres} libre(s) / ${total} emitida(s)</td>
        <td>${t.activo===false?'Inactiva':'Activa'}</td>
      </tr>`;
    }).join('')
  }</tbody></table></div>
  <small>Para entregar una unidad, emite su etiqueta en <b>QR / Etiquetas</b>.</small>`;
}
// Lista las unidades activas Y libres (no entregadas) de la herramienta elegida.
function fillAssignableUnits(){
  const selHerramienta=document.getElementById('assign-tool');
  const selUnidad=document.getElementById('assign-unit');
  const info=document.getElementById('assignUnitInfo');
  if(!selHerramienta||!selUnidad)return;
  const herramientaId=selHerramienta.value;
  const libres=unidadesDisponibles(herramientaId);
  const enObra=unidadesDeHerramienta(herramientaId).filter(q=>q.estado==='activa'&&asignacionVigente(q.id)).length;
  selUnidad.innerHTML=libres.length
    ?libres.map(q=>`<option value="${q.id}">${q.id}</option>`).join('')
    :'<option value="">— sin unidades disponibles —</option>';
  if(info){
    const herramienta=tools.find(t=>mismoId(t.id,herramientaId));
    if(!herramienta){info.innerHTML='<small>Selecciona una herramienta.</small>';return;}
    if(!libres.length){
      info.innerHTML=`<small style="color:var(--danger)">No hay unidades libres de <b>${herramienta.codigo} · ${herramienta.nombre}</b>${enObra?` (${enObra} en poder de trabajadores)`:''}. Emite una etiqueta en <b>QR / Etiquetas</b> o marca como devuelta una existente.</small>`;
    }else{
      info.innerHTML=`<small>Unidades libres de <b>${herramienta.codigo} · ${herramienta.nombre}</b>: <b>${libres.length}</b>${enObra?` · ${enObra} entregada(s)`:''}.</small>`;
    }
  }
}
async function assignTool(){
  const code=document.getElementById('assign-worker').value;
  const toolId=document.getElementById('assign-tool').value;
  const unidadId=document.getElementById('assign-unit').value;
  const fecha=document.getElementById('assign-fecha').value||hoyLocal();
  const tool=tools.find(t=>mismoId(t.id,toolId));
  const unidad=inventarioQr.find(q=>mismoId(q.id,unidadId)&&q.estado==='activa');
  if(!code||!tool){alert('Selecciona trabajador y herramienta.');return;}
  if(!unidad){alert('Selecciona la unidad (QR) a entregar. Sin una etiqueta activa no se puede rastrear.');return;}
  // segunda barrera: aunque el select diga que está libre, no entregues
  // una unidad que ya está en poder de otra persona
  const enPoderDe=asignacionVigente(unidad.id);
  if(enPoderDe){
    const dueno=workers.find(w=>w.code===enPoderDe.code);
    alert('La unidad '+unidad.id+' ya está en poder de '+(dueno?dueno.name:enPoderDe.code)+'. Márcala como devuelta antes de entregarla a otra persona.');
    fillAssignableUnits();
    return;
  }
  if(!confirm(`¿Entregar la unidad ${unidad.id} (${tool.codigo} · ${tool.nombre}) a ${(workers.find(w=>w.code===code)||{}).name||code}?`))return;
  const {error}=await window.supabaseClient.from('herramientas_asignaciones').insert({
    code,
    herramienta_id:toolId,
    herramienta_codigo:tool.codigo||null,
    herramienta_nombre:tool.nombre,
    precio:tool.precio,
    inventario_qr_id:unidad.id,
    fecha,
    devuelta:false
  });
  if(error){alert('No se pudo registrar la asignación: '+error.message);return;}
  await loadToolAssignments();
  initBodega();
}
function renderToolAssignments(){
  const el=document.getElementById('toolAssignments');
  if(!el)return;
  const encabezado='<h2>Herramientas en poder de trabajadores</h2>';
  // Primero el error, si lo hay. Un "no hay" cuando en realidad no se pudo
  // leer es peor que un vacío: hace perder tiempo buscando una devolución
  // que sí existe.
  if(toolAssignmentsError){
    el.innerHTML=encabezado+
      '<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">'+
      '<b>No se pudieron leer las asignaciones de herramientas.</b> Por eso la lista sale vacía, y eso NO significa que no haya ninguna.<br>'+
      '<small>'+escHtml(toolAssignmentsError)+'<br>Revisá en Soporte → Diagnóstico, y si es una tabla que falta, corré su migración.</small></div>';
    return;
  }
  const pendientes=toolAssignments.filter(a=>!a.devuelta);
  if(!toolAssignments.length){
    // La causa más común: existe la herramienta en el catálogo pero no se
    // emitió ninguna etiqueta física, y sin unidad con QR no hay nada que
    // entregar ni que devolver.
    const sinUnidades=tools.length&&!inventarioQr.some(q=>q.tipo==='herramienta');
    el.innerHTML=encabezado+'<div class="eppVacio">'+
      (tools.length
        ?(sinUnidades
          ?'Todavía no emitiste ninguna <b>etiqueta física</b> de herramienta. Sin una unidad con QR no se puede entregar ni devolver nada. Emitelas en <b>QR / Etiquetas</b>.'
          :'Hay herramientas en el catálogo y etiquetas emitidas, pero ninguna está entregada todavía. Asigná una desde arriba y después va a aparecer acá para devolverla.')
        :'Primero cargá el catálogo de herramientas en <b>Herramientas</b>.')+
      '</div>';
    return;
  }
  el.innerHTML=encabezado+
    (pendientes.length?'':'<small>No hay ninguna herramienta pendiente de devolución.</small>')+
    toolAssignments.map(a=>{
      const w=workers.find(x=>x.code===a.code);
      return `<div class="list-item" style="cursor:default"><span>${a.fecha} — <b>${escHtml(codigoMostrar(a.code))}</b> ${w?escHtml(w.name):''}: <b>${escHtml(a.herramienta_codigo||'—')}</b> ${escHtml(a.herramienta_nombre||'')} ($${Number(a.precio).toLocaleString('es-CL')}) ${a.inventario_qr_id?`<small style="font-family:ui-monospace,monospace"> · QR ${escHtml(a.inventario_qr_id)}</small>`:''} ${a.devuelta?`<span class="pill" style="color:var(--secondary-text);border-color:var(--secondary-text)">Devuelta${a.fecha_devolucion?' el '+escHtml(a.fecha_devolucion):''}</span>`:'<span class="pill" style="color:var(--warn-ink);border-color:var(--warn)">Pendiente</span>'}</span>${a.devuelta?'':`<button class="btn secondary" style="margin:0;padding:4px 8px" onclick="marcarDevuelta('${escHtml(a.id)}')">Marcar devuelta</button>`}</div>`;
    }).join('');
}
async function marcarDevuelta(id){
  const a=toolAssignments.find(x=>mismoId(x.id,id));
  if(!a){alert('Esa asignación ya no está en la lista. Recargá la vista.');return;}
  const unidad=inventarioQr.find(q=>mismoId(q.id,a.inventario_qr_id));
  const quien=workers.find(x=>x.code===a.code);
  const texto=`${quien?quien.name+' · ':''}${a.herramienta_nombre||a.herramienta_codigo||'herramienta'}`;
  if(!confirm(`¿Marcar como devuelta ${texto}${unidad?(' (unidad '+unidad.id+')'):''} del ${a.fecha}?`+
    (unidad?'\n\nEsa etiqueta vuelve a quedar disponible para entregar.':'\n\nOjo: esta asignación no tiene unidad (QR) vinculada, así que la etiqueta no cambia de estado.'))){
    return;
  }
  const {error}=await window.supabaseClient.from('herramientas_asignaciones')
    .update({devuelta:true,fecha_devolucion:hoyLocal()}).eq('id',id);
  if(error){alert('No se pudo marcar como devuelta: '+error.message);return;}
  // Con RLS, un UPDATE que no coincide con ninguna fila NO da error: sale
  // con cero filas afectadas y parece que se guardó. Por eso se comprueba
  // que el registro haya cambiado de verdad.
  await loadToolAssignments();
  const sigue=toolAssignments.find(x=>mismoId(x.id,id));
  if(sigue&&!sigue.devuelta){
    alert('La devolución NO se guardó. La carga por lo menos dice:\n'+(toolAssignmentsError||'las políticas de seguridad probablemente impiden modificarla. Revisá Soporte → Diagnóstico.'));
    return;
  }
  initBodega();
  renderToolAssignments();
  alert('Devolución registrada el '+hoyLocal()+'.');
}

// ---------- bodega: QR / Etiquetas de inventario ----------
// Una etiqueta por unidad física. El id del QR NO es el código del
// elemento: al anular una etiqueta y emitir otra, la anterior deja de
// servir sin que haya que tocar las unidades que ya están entregadas.
function generateAssetId(){
  const alfabeto='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones
  let id='';
  do{
    id=Array.from({length:8},()=>alfabeto[Math.floor(Math.random()*alfabeto.length)]).join('');
  }while(inventarioQr.some(q=>mismoId(q.id,id))||tarjetas.some(t=>mismoId(t.id,id)));
  return id;
}
function initQrView(){
  fillQrCatalog();
  renderQrList();
  renderToolCatalog();
}
function fillQrCatalog(){
  const tipo=document.getElementById('qrTipo').value;
  const sel=document.getElementById('qrCatalogo');
  if(tipo==='herramienta'){
    sel.innerHTML=tools.length
      ?tools.map(t=>`<option value="${t.id}">${t.codigo||'(sin código)'} — ${t.nombre} ($${Number(t.precio).toLocaleString('es-CL')})</option>`).join('')
      :'<option value="">— primero agrega herramientas al catálogo —</option>';
  }else{
    const activos=eppCatalog.filter(c=>c.activo!==false);
    sel.innerHTML=activos.length
      ?activos.map(c=>`<option value="${c.codigo}">${c.codigo} — ${c.nombre}</option>`).join('')
      :'<option value="">— el catálogo de EPP está vacío —</option>';
  }
}
function emitirQrUnidades(){
  const tipo=document.getElementById('qrTipo').value;
  const ref=document.getElementById('qrCatalogo').value;
  const cantidad=Math.min(50,Math.max(1,parseInt(document.getElementById('qrCantidad').value,10)||1));
  const msg=document.getElementById('qrMsg');
  let nombre='',precio=null,fila={};
  if(tipo==='herramienta'){
    const tool=tools.find(t=>mismoId(t.id,ref));
    if(!tool){alert('Elige una herramienta del catálogo.');return;}
    nombre=tool.nombre;
    precio=tool.precio;
    fila={tipo:'herramienta',herramienta_id:tool.id,epp_codigo:null};
  }else{
    const cat=eppCatalog.find(c=>c.codigo===ref);
    if(!cat){alert('Elige un material del catálogo.');return;}
    nombre=cat.nombre;
    fila={tipo:'epp',herramienta_id:null,epp_codigo:cat.codigo};
  }
  if(!confirm(`¿Emitir ${cantidad} etiqueta(s) para "${nombre}"?`))return;
  (async()=>{
    const nuevas=[];
    for(let i=0;i<cantidad;i++){
      nuevas.push(Object.assign({},fila,{id:generateAssetId(),nombre,precio,estado:'activa'}));
    }
    const {error}=await window.supabaseClient.from('inventario_qr').insert(nuevas);
    if(error){
      if(msg){msg.innerHTML=`<small style="color:var(--danger)">No se pudieron emitir: ${error.message}</small>`;}
      return;
    }
    await loadInventarioQr(true);
    initBodega();
    initQrView();
    qrSeleccionadas=nuevas.map(q=>q.id);
    renderQrList();
    if(msg)msg.innerHTML=`<small style="color:var(--accent)">${cantidad} etiqueta(s) emitida(s) para ${nombre}. Puedes imprimirlas con "Imprimir hoja de etiquetas".</small>`;
  })();
}
function renderQrList(){
  const el=document.getElementById('qrList');
  if(!el)return;
  const estado=document.getElementById('qrFiltroEstado').value;
  const lista=inventarioQr.filter(q=>!estado||q.estado===estado);
  if(!lista.length){el.innerHTML='<small>No hay etiquetas emitidas.</small>';return;}
  el.innerHTML=lista.map(q=>{
    const asignacion=toolAssignments.find(a=>mismoId(a.inventario_qr_id,q.id)&&!a.devuelta);
    const dueño=asignacion?(workers.find(w=>w.code===asignacion.code)||{name:asignacion.code}):null;
    const tipo=q.tipo==='herramienta'
      ?(tools.find(t=>mismoId(t.id,q.herramienta_id))||{}).codigo||'—'
      :q.epp_codigo||'—';
    const marca=qrSeleccionadas.includes(q.id);
    return `<div class="qrLabel ${q.estado==='anulada'?'anulada':''}" data-qr="${q.id}">
      <div class="qrBox" id="qrbox-${q.id}"></div>
      <div class="qrId">${q.id}</div>
      <div class="qrNombre">${q.nombre}</div>
      <div class="qrMeta">${tipo} · ${q.tipo==='herramienta'&&q.precio!=null?'$'+Number(q.precio).toLocaleString('es-CL'):'material'}</div>
      ${q.estado==='anulada'
        ?'<div class="qrOwner" style="color:var(--danger)">Anulada</div>'
        :dueño
          ?`<div class="qrOwner" style="color:var(--danger)">En poder de ${dueño.name} (${dueño.code})</div>`
          :'<div class="qrOwner" style="color:var(--accent)">Disponible</div>'}
      <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center">
        <button class="btn secondary" style="margin:0;padding:4px 7px;font-size:.62rem" onclick="toggleQrSel('${q.id}')">${marca?'✓':'Imprimir'}</button>
        ${q.estado==='activa'?`<button class="btn secondary" style="margin:0;padding:4px 7px;font-size:.62rem" onclick="anularQr('${q.id}')">Anular</button>`:''}
      </div>
    </div>`;
  }).join('');
  lista.forEach(q=>dibujarQrEtiqueta(q.id));
}
function dibujarQrEtiqueta(id){
  const box=document.getElementById('qrbox-'+id);
  if(!box)return;
  box.innerHTML='';
  try{
    new QRCode(box,{text:id,width:112,height:112});
  }catch(error){
    box.textContent=id;
  }
}
function toggleQrSel(id){
  const i=qrSeleccionadas.indexOf(id);
  if(i>=0)qrSeleccionadas.splice(i,1);
  else qrSeleccionadas.push(id);
  renderQrList();
}
async function anularQr(id){
  const q=inventarioQr.find(x=>mismoId(x.id,id));
  if(!q)return;
  const asignada=toolAssignments.find(a=>mismoId(a.inventario_qr_id,id)&&!a.devuelta);
  if(asignada){
    alert('No se puede anular: esa unidad está en poder de '+(workers.find(w=>w.code===asignada.code)||{name:asignada.code}).name+'. Márcala como devuelta primero.');
    return;
  }
  const motivo=prompt('Motivo de la anulación (se imprime en la etiqueta):','Etiqueta extraviada o unidad descartada');
  if(motivo===null)return;
  const {error}=await window.supabaseClient.from('inventario_qr')
    .update({estado:'anulada',motivo_anulacion:motivo||'sin motivo'}).eq('id',id);
  if(error){alert('No se pudo anular: '+error.message);return;}
  await loadInventarioQr(true);
  initBodega();
  renderQrList();
}
// Hoja A4 con 3x4 etiquetas por página (con los QR ya dibujados en canvas).
async function printQrLabels(){
  const ids=qrSeleccionadas.length?qrSeleccionadas:inventarioQr.filter(q=>q.estado==='activa').map(q=>q.id);
  if(!ids.length){alert('No hay etiquetas para imprimir.');return;}
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF({unit:'mm',format:'a4'});
  const ancho=pdf.internal.pageSize.getWidth();
  const alto=pdf.internal.pageSize.getHeight();
  const cols=3,filas=4;
  const margen=10,gap=3;
  const cw=(ancho-margen*2-gap*(cols-1))/cols;
  const ch=(alto-margen*2-gap*(filas-1))/filas;
  const emp=empresaData();
  const stage=document.createElement('div');
  stage.style.cssText='position:fixed;left:-10000px;top:0;';
  document.body.appendChild(stage);
  let enPagina=0;
  for(const id of ids){
    const q=inventarioQr.find(x=>mismoId(x.id,id));
    if(!q)continue;
    const col=enPagina%cols,fila=Math.floor(enPagina/cols);
    if(enPagina>0&&fila>=filas){pdf.addPage();enPagina=0;}
    const c2=enPagina%cols,f2=Math.floor(enPagina/cols);
    const x=margen+c2*(cw+gap);
    const y=margen+f2*(ch+gap);
    const tipo=q.tipo==='herramienta'
      ?(tools.find(t=>mismoId(t.id,q.herramienta_id))||{}).codigo||'—'
      :q.epp_codigo||'—';
    stage.innerHTML=`<div class="labelCell" style="width:${cw*3.78}px;height:${ch*3.78}px">
      <div class="lcEmpresa">${emp.nombre||'Bodega'}</div>
      <div class="lcName">${q.nombre}</div>
      <div class="lcMeta">${tipo}${q.precio!=null?' · $'+Number(q.precio).toLocaleString('es-CL'):''}</div>
      <div id="lblqr"></div>
      <div class="lcId">${q.id}</div>
      ${q.estado==='anulada'?'<div class="lcMeta" style="color:#b5504a;font-weight:700">ANULADA</div>':''}
    </div>`;
    const qrbox=stage.querySelector('#lblqr');
    new QRCode(qrbox,{text:q.id,width:112,height:112});
    // espera a que el canvas exista
    for(let i=0;i<30&&!qrbox.querySelector('canvas');i++)await new Promise(r=>setTimeout(r,20));
    const canvas=await html2canvas(stage.firstElementChild,{scale:3,backgroundColor:'#ffffff'});
    pdf.addImage(canvas.toDataURL('image/png'),'PNG',x,y,cw,ch);
    enPagina++;
  }
  stage.remove();
  pdf.save(`etiquetas_inventario_${hoyLocal()}.pdf`);
  const msg=document.getElementById('qrMsg');
  if(msg)msg.innerHTML=`<small style="color:var(--accent)">Hoja de ${ids.length} etiqueta(s) generada.</small>`;
}
// Escaneo de una etiqueta: muestra en quién está.
function lookupQrOwner(scanned){
  const id=String(scanned||'').trim().toUpperCase();
  const q=inventarioQr.find(x=>mismoId(x.id,id));
  const host=document.getElementById('assignUnitInfo')||document.getElementById('qrMsg');
  if(!q){
    if(host)host.innerHTML=`<small style="color:var(--danger)">El código ${id} no corresponde a ninguna etiqueta emitida.</small>`;
    return;
  }
  const asignacion=toolAssignments.find(a=>mismoId(a.inventario_qr_id,q.id)&&!a.devuelta);
  const herramienta=q.herramienta_id?tools.find(t=>mismoId(t.id,q.herramienta_id)):null;
  const tipoTxt=herramienta?`${herramienta.codigo||''} · ${herramienta.nombre}`:`${q.epp_codigo} · ${q.nombre}`;
  if(!host)return;
  if(q.estado==='anulada'){
    host.innerHTML=`<small style="color:var(--danger)"><b>Etiqueta anulada</b> (${q.motivo_anulacion||'sin motivo'}). ${tipoTxt}</small>`;
    return;
  }
  if(asignacion){
    const w=workers.find(x=>x.code===asignacion.code);
    host.innerHTML=`<small style="color:var(--danger)"><b>${tipoTxt}</b><br>Etiqueta ${q.id} — está en poder de <b>${w?w.name:asignacion.code} (${asignacion.code})</b> desde el ${asignacion.fecha}.</small>`;
  }else{
    host.innerHTML=`<small style="color:var(--accent)"><b>${tipoTxt}</b><br>Etiqueta ${q.id} — <b>disponible</b> para entregar.</small>`;
  }
}

// ============================================================
// KITS INICIALES POR ESPECIALIDAD
// Una especialidad puede tener varios kits (Pintor A, Pintor B).
// Al ingresar un trabajador se le asigna un kit: queda una lista de
// control con el estado de cada elemento, para poder entregar de a
// uno, de varios o de todos. Cada entrega genera su PDF con firma.

// ============================================================
// Cuando una migración no está aplicada, Postgres responde
//   Could not find the 'activa' column of 'empresa' in the schema cache
// Ese mensaje no dice qué hacer: parece un error de la app cuando en
// realidad falta ejecutar un archivo. Acá se traduce "no existe esta
// columna" → "ejecuta la migración 014", que es lo que la persona
// necesita saber.
//
// La lista se arma sola: cada migración declara qué tabla y qué columna
// la delatan. Agregar una migración nueva es agregar una línea.
const MIGRACIONES_REQUERIDAS=[
  {n:'001',archivo:'001_schema.sql',tabla:'trabajadores',columna:null},
  {n:'003',archivo:'003_fecha_ingreso.sql',tabla:'trabajadores',columna:'fecha_ingreso'},
  {n:'005',archivo:'005_indicaciones_trabajadores.sql',tabla:'trabajadores',columna:'indicaciones_sociales'},
  {n:'006',archivo:'006_tipo_trabajador.sql',tabla:'trabajadores',columna:'tipo_trabajador'},
  {n:'007',archivo:'007_tarjetas.sql',tabla:'tarjetas',columna:null},
  {n:'008',archivo:'008_epp_firma.sql',tabla:'epp_entrega_items',columna:null},
  {n:'009',archivo:'009_qr_inventario.sql',tabla:'inventario_qr',columna:null},
  {n:'010',archivo:'010_tipo_talla.sql',tabla:'epp_catalogo',columna:'tipo_talla'},
  {n:'011',archivo:'011_especialidades.sql',tabla:'epp_especialidades',columna:null},
  {n:'012',archivo:'012_kits_multiples.sql',tabla:'epp_kits',columna:null},
  {n:'013',archivo:'013_roles_permisos.sql',tabla:'perfil_roles',columna:null},
  // 014 es la que crea las columnas de empresa. Se listan todas: si
  // "empresa" se agranda después (017), el nombre exacto de la columna
  // sigue diciendo cuál de las dos falta.
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'empresa',columna:'activa'},
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'empresa',columna:'rut'},
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'empresa',columna:'giro'},
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'empresa',columna:'direccion'},
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'empresa',columna:'telefono'},
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'empresa',columna:'email'},
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'empresa',columna:'sitio_web'},
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'empresa',columna:'created_at'},
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'trabajadores',columna:'empresa_id'},
  // misma migración, pero su tabla es lo que delata si falta
  {n:'014',archivo:'014_multi_empresa.sql',tabla:'perfil_empresas',columna:null},
  {n:'015',archivo:'015_perfil_trabajador.sql',tabla:'perfiles',columna:'trabajador_code'},
  {n:'017',archivo:'017_marcajes_diarios.sql',tabla:'marcajes',columna:null},
  // hora_entrada la agrega la 017, no la 014: el orden importa
  {n:'017',archivo:'017_marcajes_diarios.sql',tabla:'empresa',columna:'hora_entrada'},
  {n:'017',archivo:'017_marcajes_diarios.sql',tabla:'empresa',columna:'tolerancia_minutos'},
  {n:'018',archivo:'018_tarjetas_bloqueo.sql',tabla:'tarjetas',columna:'bloqueada_at'},
  {n:'019',archivo:'019_invitaciones_perfiles.sql',tabla:'invitaciones',columna:null},
  {n:'020',archivo:'020_rut_importacion_marcajes.sql',tabla:'trabajadores',columna:'rut'},
  {n:'020',archivo:'020_rut_importacion_marcajes.sql',tabla:'marcajes_importaciones',columna:null},
  {n:'021',archivo:'021_altas_cuentas.sql',tabla:'cuentas_altas',columna:null},
  {n:'022',archivo:'022_columna_existe.sql',tabla:null,columna:null,rpc:'columna_existe'}
];
// Traduce el error que devuelve PostgREST al nombre de la migración que
// falta. Devuelve '' si el error no es de migración (es un problema real
// de datos o permisos, y conviene mostrarlo tal cual).
function migracionQueFalta(error){
  if(!error)return '';
  const msg=String(error.message||error);
  // "Could not find the 'X' column of 'Y' in the schema cache"
  const col=msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
  if(col){
    const hit=MIGRACIONES_REQUERIDAS.find(m=>m.tabla===col[2]&&m.columna===col[1]);
    if(hit)return hit.archivo;
    // Columna desconocida de una tabla que sí conocemos: se supone que
    // la agrega la PRIMERA migración que tocó esa tabla, no la última.
    // Con .pop() se le decía al usuario la 017 cuando lo que faltaba era
    // la 014, y el arreglo no resolvía nada.
    const porTabla=MIGRACIONES_REQUERIDAS.filter(m=>m.tabla===col[2])[0];
    if(porTabla)return porTabla.archivo;
    return '';
  }
  // "relation \"X\" does not exist" / "Could not find the table 'X'"
  // Postgres escribe el nombre con o sin esquema: "public.marcajes" o
  // solo "marcajes". Se quita el esquema antes de comparar.
  const rel=msg.match(/relation "([^"]+)" does not exist|Could not find the table '([^']+)'/i);
  if(rel){
    const tabla=String(rel[1]||rel[2]).replace(/^public\./,'');
    const hit=MIGRACIONES_REQUERIDAS.find(m=>m.tabla===tabla);
    if(hit)return hit.archivo;
    return '';
  }
  // "column ... does not exist" (a veces lo dice sin el "schema cache")
  if(/column .* does not exist/i.test(msg)){
    const c2=msg.match(/column "?([a-z_0-9]+)"? does not exist/i);
    if(c2){
      const hit=MIGRACIONES_REQUERIDAS.find(m=>m.columna===c2[1]);
      if(hit)return hit.archivo;
    }
  }
  return '';
}

// Si el error es de migración faltante, lo deja escrito en la pantalla
// (y no solo en el alert), con el nombre del archivo exacto. El alert se
// cierra y se pierde; esto se queda.
function mostrarFaltaDeMigracion(error){
  const archivo=migracionQueFalta(error);
  if(!archivo)return;
  const caja=document.getElementById('empDiag');
  if(!caja)return;
  caja.innerHTML='<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:12px;border-radius:8px">'+
    '<b>Falta migrations/'+escHtml(archivo)+'</b>.<br>'+
    '<small>Puede ser por dos cosas. Si no la has ejecutado: ábrela y pégala en el SQL Editor de '+
    'Supabase (es re-ejecutable, no hay riesgo). Si ya la habías ejecutado, la API puede tenerla '+
    'cacheada: en el SQL Editor ejecuta <code>NOTIFY pgrst, \'reload schema\';</code>. '+
    'Después recarga con <b>Ctrl+F5</b>.</small>'+
    '<br><small style="opacity:.75">Lo que respondió la base: '+escHtml(error.message||'')+'</small></div>';
  caja.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// Muestra un error de guardado diciendo qué migración falta, en vez de
// dejar que se vea el texto crudo de Postgres.
function errorDeGuardar(que,error){
  const archivo=migracionQueFalta(error);
  if(archivo){
    return que+'.\n\nFalta la migración '+archivo+'.\n\n'+
      'O no la has ejecutado (ábrela en el SQL Editor de Supabase), o ya la ejecutaste y hay que '+
      'recargar la caché de la API con:  NOTIFY pgrst, \'reload schema\';\n\n'+
      'Después recarga la app con Ctrl+F5.';
  }
  return que+': '+(error&&error.message?error.message:error);
}

// Revisa qué migraciones están aplicadas, mirando en la base si existe
// cada tabla y cada columna. Muestra solo las que faltan.
//
// Se agrupa por ARCHIVO y no por comprobación: la 014 se revisa mirando
// varias columnas de "empresa", y sin agrupar aparecería como cuatro
// migraciones distintas. El usuario solo tiene dos cosas que hacer:
// ejecutar dos archivos.
async function revisarMigraciones(){
  const caja=document.getElementById('empDiag');
  if(!caja)return;
  caja.innerHTML='<small>Revisando la base de datos…</small>';
  // archivo -> qué le falta
  const porArchivo=new Map();
  for(const m of MIGRACIONES_REQUERIDAS){
    let error=null;
    try{
      if(m.rpc){
        // Una migración que crea una FUNCIÓN se comprueba llamándola. Un
        // select a una tabla no serviría: la función no es una tabla.
        // Se llama con datos que no pueden tener efecto: si existe y
        // responde, está.
        const res=await window.supabaseClient.rpc(m.rpc,{tabla:'__no_existe__',columna:'__no_existe__'});
        // "no existe" es una respuesta VÁLIDA de columna_existe, no un
        // error. Lo que falla es que la función no esté.
        error=res.error;
      }else{
        // Pedir la columna explícita: si no existe, Postgres lo dice en vez
        // de devolver una lista incompleta en silencio.
        const q=m.columna
          ?window.supabaseClient.from(m.tabla).select(m.columna).limit(1)
          :window.supabaseClient.from(m.tabla).select('*').limit(1);
        const res=await q;
        error=res.error;
      }
    }catch(e){error=e;}
    if(!error)continue;
    if(!porArchivo.has(m.archivo))porArchivo.set(m.archivo,[]);
    porArchivo.get(m.archivo).push({tabla:m.rpc?'la función '+m.rpc:m.tabla,columna:m.columna,error});
  }
  // Una migración puede estar aplicada y aun así quedar incompleta. La
  // 020 es el caso: su "alter table marcajes" va dentro de un DO que se
  // salta si la 017 no estaba, así que se puede aplicar "bien" dejando
  // la restricción de "origen" como la de la 017, que no acepta 'reloj'.
  // Todas las tablas existen, el botón diría "todo bien", y la
  // importación de marcajes fallaría recién en el INSERT con un error de
  // check constraint que no dice qué hacer.
  const avisos=[];
  try{
    const {data:dia}=await window.supabaseClient.rpc('diagnostico_importacion_marcajes');
    const d=dia&&dia[0];
    if(d&&d.tabla_ok){
      if(!d.marcajes_ok&&!porArchivo.has('017_marcajes_diarios.sql')){
        avisos.push('<b>migrations/017_marcajes_diarios.sql</b><br><small>La 020 quedó aplicada pero falta la tabla <code>marcajes</code>, que crea la 017. Sin ella no funcionan los marcajes ni la asistencia diaria.</small>');
      }else if(d.marcajes_ok&&!d.origen_ok){
        avisos.push('<b>Vuelve a ejecutar migrations/020_rut_importacion_marcajes.sql</b><br><small>La restricción de <code>marcajes.origen</code> quedó sin el valor <code>reloj</code>, que es el que usa el importador del reloj. Sin esto, importar marcajes falla con un error de check constraint que no dice la causa.</small>');
      }
    }
  }catch(e){}
  if(!porArchivo.size&&!avisos.length){
    caja.innerHTML='<div style="background:rgba(46,125,50,.1);border:1px solid var(--accent);color:var(--accent);padding:10px 12px;border-radius:8px">'+
      '<b>La base está al día.</b> <small>Las '+new Set(MIGRACIONES_REQUERIDAS.map(m=>m.archivo)).size+
      ' migraciones revisadas están aplicadas.</small></div>';
    return;
  }
  const archivos=Array.from(porArchivo.keys());
  const total=archivos.length+avisos.length;
  caja.innerHTML='<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:12px;border-radius:8px">'+
    '<b>Falta aplicar '+(total===1?'1 migración':total+' migraciones')+'.</b> '+
    '<small>Ejecútalas en el <b>SQL Editor</b> de Supabase, en orden, y recarga con <b>Ctrl+F5</b>. '+
    'Son re-ejecutables: repetirlas no rompe nada.</small>'+
    '<ul style="margin:8px 0 0;padding-left:18px">'+
    archivos.map(a=>{
      const detalles=porArchivo.get(a);
      const falta=detalles.map(d=>{
        // Una migración puede crear una FUNCIÓN, no una tabla. Se dice
        // explícitamente, porque "falta columna_existe" no dice si hay
        // que ejecutar un archivo o crear algo a mano.
        if(String(d.tabla).indexOf('la función ')===0)return '<code>'+d.tabla+'</code>';
        return d.columna?'<code>'+d.columna+'</code> de <code>'+d.tabla+'</code>':'la tabla <code>'+d.tabla+'</code>';
      }).join(', ');
      return '<li style="margin-bottom:6px"><b>migrations/'+escHtml(a)+'</b><br><small>Falta: '+falta+'</small></li>';
    }).join('')+
    avisos.join('')+
    '</ul></div>';
}

// ------------------------------------------------------------------
// EL LOGO, LEÍDO Y ACHICADO
// ------------------------------------------------------------------
// Se lee el archivo que eligió la persona y se devuelve un data URL de como
// mucho 600 px de ancho.
//
// POR QUÉ 600: la credencial se imprime a 86 mm de ancho. A 300 dpi eso
// son unos 1000 px, pero el logo nunca ocupa toda la tarjeta, así que 600
// alcanza de sobra y pesa una fracción. Un logo de 600 px pesa entre 20 y
// 60 KB; el mismo archivo sin achicar, con fotos incrustadas, pesa 400 KB o
// más, y la diferencia se nota en cada consulta de la lista de empresas.
//
// POR QUÉ EN EL NAVEGADOR: porque pedir un archivo más chico a la persona
// casi nunca rinde. Nadie tiene el logo optimizado, y la respuesta a "te
//_ERROR_LOGO_GRANDE_" va a ser "no sé cómo".
async function leerLogoAchicado(archivo){
  const dataUrl=await leerArchivoComoTexto(archivo);
  // Si no es una imagen (alguien subió un PDF), se devuelve tal cual: que
  // falle al mostrar es más claro que un error raro acá.
  if(!/^data:image\//.test(dataUrl))return dataUrl;
  try{
    const img=await cargarImagen(dataUrl);
    const ANCHO=600;
    if(img.width<=ANCHO)return dataUrl;
    const alto=Math.round(img.height*ANCHO/img.width);
    // Un canvas sin argumentar devuelve un PNG. El JPG se pide explícito
    // porque un logo de fotos con transparencia necesita PNG, y ahí el
    // tamaño ya no es problema a 600 px.
    const esJpg=/jpe?g/.test(dataUrl);
    const c=document.createElement('canvas');
    c.width=ANCHO;c.height=alto;
    const g=c.getContext('2d');
    g.imageSmoothingQuality='high';
    g.drawImage(img,0,0,ANCHO,alto);
    return c.toDataURL(esJpg?'image/jpeg':'image/png',0.92);
  }catch(error){
    // Si el canvas falla (imagen corrupta, formato raro), se devuelve la
    // original. Es preferible guardar algo grande a no guardar nada.
    console.warn('No se pudo achicar el logo:',error);
    return dataUrl;
  }
}
function leerArchivoComoTexto(archivo){
  return new Promise((resolver,rechazar)=>{
    const r=new FileReader();
    r.onload=e=>resolver(e.target.result);
    r.onerror=()=>rechazar(new Error('No se pudo leer el archivo del logo.'));
    r.readAsDataURL(archivo);
  });
}
function cargarImagen(src){
  return new Promise((resolver,rechazar)=>{
    const img=new Image();
    img.onload=()=>resolver(img);
    img.onerror=()=>rechazar(new Error('La imagen no se pudo abrir.'));
    img.src=src;
  });
}

// ------------------------------------------------------------------
// AVISAR EL TAMAÑO ANTES DE SUBIR
// ------------------------------------------------------------------
// El error "no guarda el logo" casi siempre es tamaño. Un archivo de 6 MB
// de una foto del logo tomada con el celular se convierte en 8 MB de texto,
// y eso no entra. Se avisa al elegir el archivo, no después de guardar.
function avisarTamanoLogo(){
  const caja=document.getElementById('emp-logo-aviso');
  const f=document.getElementById('emp-logo').files[0];
  if(!caja)return;
  if(!f){caja.innerHTML='';return;}
  const KB=Math.round(f.size/1024);
  const grande=f.size>900*1024;
  caja.innerHTML=grande
    ?'<div class="aviso-fila" style="margin:6px 0 0">Este archivo pesa '+KB+' KB. Se va a achicar a 600 px '
      +'de ancho antes de guardarse, que es lo que necesita una credencial de 86 mm. Si aun así no sale, '
      +'el logo no es una imagen válida.</div>'
    :'<small style="display:block;margin:4px 0 0">Archivo de '+KB+' KB.</small>';
}

async function saveEmpresa(){
  if(!exigirPermiso('sistema.empresa','No tienes permiso para guardar empresas.'))return;
  const nombre=document.getElementById('emp-name').value.trim();
  if(!nombre){alert('El nombre de la empresa es obligatorio.');return;}
  const idBruto=document.getElementById('emp-id').value;
  const id=idBruto?parseInt(idBruto):null;   // la columna es int: sin number no matchea
  const payload=empresaToDb({
    nombre,
    rut:document.getElementById('emp-rut').value.trim(),
    giro:document.getElementById('emp-giro').value.trim(),
    direccion:document.getElementById('emp-direccion').value.trim(),
    telefono:document.getElementById('emp-telefono').value.trim(),
    email:document.getElementById('emp-email').value.trim(),
    sitio_web:document.getElementById('emp-web').value.trim(),
    hora_entrada:document.getElementById('emp-hora-entrada').value||'08:00',
    // Sin hora de salida se manda null y no una cadena vacía. La columna es
    // 'time': una cadena vacía no es una hora, es basura, y Postgres la
    // rechazaría con un error que no dice "dejaste en blanco la salida".
    hora_salida:document.getElementById('emp-hora-salida').value||null,
    tolerancia_minutos:parseInt(document.getElementById('emp-tolerancia').value,10)||0,
    // Igual que la salida: vacío es null, que es lo que significa "esta empresa
    // no controla la colación" en el reporte.
    colacion_inicio:document.getElementById('emp-colacion-inicio').value||null,
    colacion_duracion_min:parseInt(document.getElementById('emp-colacion-duracion').value,10)||0,
    activa:document.getElementById('emp-activa').checked
  });
  const file=document.getElementById('emp-logo').files[0];
  const finish=async logo=>{
    if(logo)payload.logo_url=logo;   // sin archivo nuevo se conserva el logo que había
    let error;
    if(id){
      ({error}=await window.supabaseClient.from('empresa').update(payload).eq('id',id));
    }else{
      ({error}=await window.supabaseClient.from('empresa').insert(payload).select().single());
    }
    if(error){
      alert(errorDeGuardar('No se pudo guardar la empresa',error));
      mostrarFaltaDeMigracion(error);
      return;
    }
    await loadEmpresas();
    renderEmpresas();
    // Se refresca el diagnóstico: si el aviso anterior era "falta la
    // migración 014", dejarlo pegado después de aplicar la 014 sería
    // mandarlo a hacer de nuevo algo que ya está hecho.
    await revisarMigraciones();
    alert('Empresa guardada.');
  };
  if(file){
    // Se devuelve una promesa que termina cuando el archivo se leyó y la
    // empresa quedó guardada. Antes se llamaba finish() sin esperar, así
    // que saveEmpresa() retornaba antes de terminar: quien la llamaba no
    // podía saber si se guardó o no.
    try{
      const icono=await leerLogoAchicado(file);
      if(!icono){
        alert('No se pudo leer el archivo del logo. Se guardó la empresa sin cambiar el logo anterior.');
        return finish(null);
      }
      await finish(icono);
    }catch(error){
      alert('No se pudo procesar el logo: '+error.message+'\n\nSe guardó la empresa sin cambiar el logo anterior.');
      return finish(null);
    }
    // Se avisa de lo que quedó guardado, no de lo que se eligió. Es la
    // diferencia entre "subí el logo" y "el logo está en la tarjeta".
    if(icono){
      const KB=Math.round(icono.length*0.75/1024);
      alert('Empresa guardada. El logo quedó guardado en '+KB+' KB y se verá en las tarjetas nuevas.\n\n'
        +'Las tarjetas ya impresas llevan el logo anterior: hay que reimprimirlas.');
    }
    return;
  }
  return finish(null);
}

// ===================================================================
// IMPORTAR WORD CONSERVANDO EL FORMATO, Y DESCARGAR LA PLANTILLA

// ============================================================
let misRoles=[];             // ['rrhh','tecnica',...]
let misPermisos=new Set();   // ['tarja.ver', ...]
let miPerfil=null;           // {id,nombre,rol,activo} del usuario conectado
let miCorreo='';             // correo con el que entró
let catalogoPermisos=[];     // [{clave,descripcion,categoria,orden}]
let catalogoRoles=[];        // [{rol,nombre,descripcion,orden}]
let misPermisosCargados=false;

// Permiso → vista que habilita. Se usa para armar el menú.
const VISTAS_POR_PERMISO={
  'v-porteria':'porteria.ver',
  'v-nuevo-trabajador':'trabajadores.editar',
  'v-listado-trabajadores':'trabajadores.ver',
  'v-asignar-supervisor':'trabajadores.editar',
  'v-carga-csv-trabajadores':'trabajadores.editar',
  'v-buscar-tarjeta':'trabajadores.tarjeta',
  'v-imprimir-tarjetas':'trabajadores.tarjeta',
  'v-asistencia':'tarja.ver',
  'v-exportar':'tarja.exportar',
  'v-alertas-sociales':'social.ver',
  'v-indicaciones-sociales':'social.ver',
  'v-alertas-prevencion':'prevencion.ver',
  'v-indicaciones-prevencion':'prevencion.ver',
  'v-bodega-epp':'bodega.epp.entregar',
  'v-bodega-historial':'bodega.epp.historial',
  'v-bodega-epp-catalogo':'bodega.epp.catalogo',
  'v-bodega-kits':'bodega.kits',
  'v-bodega-kits-admin':'bodega.kits',
  'v-bodega-catalogo':'bodega.herramientas',
  'v-bodega-asignar':'bodega.herramientas',
  'v-bodega-qr':'bodega.qr',
  'v-solicitar-cambio':'tarja.solicitar_cambio',
  'v-solicitar-ingreso':'ingresos.pedir',
  'v-ingresos-cola':'ingresos.aprobar',
  'v-supervisores':'tarja.ver',
  'v-sup-diaria':'tarja.marcaje',
  'v-just-diaria':'tarja.justificar',
  'v-auditoria':'asistencia.auditar',
  'v-relojes':'relojes.ver',
  'v-marcajes':'relojes.ver',
  'v-kit':'contratacion.ver',
  'v-plantillas-kit':'contratacion.editar',
  'v-aprobar-cambio':'tarja.aprobar_cambio',
  'v-usuarios':'sistema.usuarios',
  'v-invitar-usuario':'sistema.usuarios',
  'v-permisos':'sistema.permisos',
  'v-empresa':'sistema.empresa'
};
// Permiso de cada grupo del menú principal (para hiding de la nav)
const GRUPOS_POR_PERMISOS={
  porteria:['porteria.ver'],
  administracion:['trabajadores.ver','tarja.ver','tarja.exportar','tarja.aprobar_cambio','sistema.usuarios','sistema.permisos','sistema.empresa','ingresos.aprobar'],
  bodega:['bodega.epp.entregar','bodega.epp.historial','bodega.epp.catalogo','bodega.kits','bodega.herramientas','bodega.qr'],
  supervisores:['tarja.ver','trabajadores.ver','prevencion.ver','ingresos.pedir'],
  soporte:['sistema.usuarios','sistema.permisos','sistema.empresa','tarja.aprobar_cambio','tarja.ver','trabajadores.ver'],
  'asistente-social':['social.ver'],
  prevencion:['prevencion.ver','prevencion.subcontrato']
};

function puede(permiso){
  if(!permiso)return true;
  // Administración es acceso total: no depende de que el catálogo de
  // permisos tenga la fila (si faltara una, el menú se quedaría vacío).
  if(misRoles.includes('admin'))return true;
  if(!misPermisosCargados)return true;  // antes de cargar, no bloquea nada
  return misPermisos.has(permiso);
}
function soyAdmin(){
  return misRoles.includes('admin');
}
function nombreDeRol(rol){
  const r=catalogoRoles.find(x=>x.rol===rol);
  return r?r.nombre:rol;
}

async function loadPermisosUsuario(){
  misRoles=[];misPermisos=new Set();misPermisosCargados=false;
  try{
    const {data:sessionData}=await window.supabaseClient.auth.getSession();
    const usuario=sessionData&&sessionData.session&&sessionData.session.user;
    const uid=usuario&&usuario.id;
    if(!uid)return;
    miCorreo=(usuario&&usuario.email)||'';
    // Con una sesión nueva, el trigger puede haber creado el perfil
    // recién ahora. Si sigue sin aparecer, es que la 019 no está
    // aplicada: el aviso de más abajo lo dice.

    const {data:roles,error:e1}=await window.supabaseClient.from('perfil_roles').select('rol').eq('user_id',uid);
    if(e1)throw new Error(e1.message);
    misRoles=(roles||[]).map(r=>r.rol);
    // nombre del usuario, para firmar solicitudes y resolverlas
    const {data:perfil}=await window.supabaseClient.from('perfiles').select('*').eq('id',uid).maybeSingle();
    miPerfil=perfil||null;
    if(miPerfil&&miPerfil.rol&&!misRoles.length)misRoles=[miPerfil.rol];
    // admin entra siempre con todos los permisos
    if(misRoles.includes('admin')){
      const {data:perms}=await window.supabaseClient.from('permisos').select('clave');
      (perms||[]).forEach(p=>misPermisos.add(p.clave));
    }else if(misRoles.length){
      const {data:rp}=await window.supabaseClient.from('roles_permisos').select('permiso').in('rol',misRoles);
      (rp||[]).forEach(r=>misPermisos.add(r.permiso));
    }
    misPermisosCargados=true;
    quitarAvisoPermisos();
  }catch(error){
    // Si falla (migración 013 sin aplicar) no se bloquea la app, pero se
    // avisa: sin este control cualquier persona ve y cambia todo.
    console.warn('No se pudieron cargar los permisos:',error.message);
    mostrarAvisoPermisos('⚠️ No se pudieron cargar tus permisos ('+error.message+'). Se muestra todo sin restricciones. Ejecuta la migración 013 y revisa que tengas roles asignados en Soporte → Permisos por rol.');
  }
  aplicarPermisos();
  // Y LOS MÓDULOS, DESPUÉS DE LOS PERMISOS Y ANTES DE QUE SE ABRA NADA
  //
  // Y en este orden porque son dos puertas y la segunda necesita el ámbito que
  // deja la primera: los permisos dicen qué puede ver esta persona, y los módulos
  // dicen qué existe en las empresas a las que tiene acceso. Si los módulos se
  // leyeran primero, "aplicarModulos" correría con el ámbito viejo.
  //
  // Y sin "await" a propósito: que el menú no espere a la base. "cargarModulos"
  // deja pasar todo mientras no haya leído (ver "moduloActivo"), así que la
  // aplicación abre igual, y los módulos se aplican cuando llegan. Bloquear la
  // apertura sería peor que esperar un instante.
  if(typeof cargarModulos==='function')cargarModulos();
  // Los iconos de las pestañas van desde el arranque, no cuando se elige
  // una: la primera que se muestra ya tiene que salir con su icono.
  ponerIconosEnPestanas();
  // Los iconos de las pestañas van desde el arranque, no cuando se elige
  // una: la primera que se muestra ya tiene que salir con su icono.
  ponerIconosEnPestanas();
  // el equipo depende del usuario conectado: se recalcula siempre aquí para
  // que un cambio de roles o de ficha no deje el ámbito del anterior
  if(typeof recalcularMiSupervisor==='function')recalcularMiSupervisor();
  // La pantalla decide con perfil_roles y la base con sus propias políticas.
  // Si las dos cosas se desalinean, el síntoma es "envié la solicitud y no
  // aparece en la cola", así que se comprueba y se avisa en pantalla.
  if(typeof comprobarPermisos==='function')comprobarPermisos();
  // Va junto a la otra: si la bitácora no está puesta, es tan importante
  // verlo al entrar como la coherencia de permisos.
  if(typeof comprobarAuditoria==='function')comprobarAuditoria();
  if(typeof comprobarDesvinculacion==='function')comprobarDesvinculacion();
  if(typeof comprobarRelojes==='function')comprobarRelojes();
  if(typeof comprobarContratacion==='function')comprobarContratacion();
  if(typeof revisarPerfilIncompleto==='function')revisarPerfilIncompleto();
}

// Cuando alguien entra por primera vez con una invitación, su perfil
// existe pero está sin datos y sin teléfono. No se le bloquea la app:
// entra, pero se le recuerda arriba qué le falta.
//
// Va en su propio aviso y no en el de permisos: una persona con los
// permisos bien asignados (el caso normal de una invitación) no tiene
// aviso de permisos, y si se colgaran de él este nunca aparecería,
// justo cuando más hace falta.
function revisarPerfilIncompleto(){
  quitarAvisoPerfilIncompleto();
  if(!miPerfil)return;
  if(miPerfil.perfil_completo!==false)return;
  const faltaNombre=!String(miPerfil.nombre||'').trim();
  if(!faltaNombre&&miPerfil.telefono)return;
  const div=document.createElement('div');
  div.id='perfilIncompletoAviso';
  div.style.cssText='background:#e08b1a;color:#fff;padding:8px 16px;font-size:.82rem;font-weight:600;text-align:center;position:sticky;top:0;z-index:19';
  div.innerHTML='👤 Te falta '+(faltaNombre?'tu nombre':'tu teléfono')+'. '
    +'<a href="#" id="perfilIncompletoLink">Completa tus datos aquí</a>';
  const header=document.querySelector('header');
  const avisoPermisos=document.getElementById('permisosAviso');
  if(avisoPermisos)avisoPermisos.insertAdjacentElement('afterend',div);
  else if(header)header.insertAdjacentElement('afterend',div);
  else document.body.insertBefore(div,document.body.firstChild);
  // listener en vez de onclick: dentro del HTML de la app el
  // escapado de comillas se vuelve un lio y rompe el script.
  const link=document.getElementById('perfilIncompletoLink');
  if(link)link.addEventListener('click',e=>{e.preventDefault();showView('mi-perfil');});
}
function quitarAvisoPerfilIncompleto(){
  const viejo=document.getElementById('perfilIncompletoAviso');
  if(viejo)viejo.remove();
}
function mostrarAvisoPermisos(texto){
  quitarAvisoPermisos();
  const div=document.createElement('div');
  div.id='permisosAviso';
  div.style.cssText='background:var(--danger-solid);color:#fff;padding:8px 16px;font-size:.82rem;font-weight:600;text-align:center;position:sticky;top:0;z-index:20';
  div.textContent=texto;
  const header=document.querySelector('header');
  if(header)header.insertAdjacentElement('afterend',div);
  else document.body.insertBefore(div,document.body.firstChild);
}
function quitarAvisoPermisos(){
  const el=document.getElementById('permisosAviso');
  if(el)el.remove();
}
function aplicarPermisos(){
  // 1) ocultar grupos del menú principal sin ningún permiso
  document.querySelectorAll('#mainNav button').forEach(b=>{
    const grupo=b.dataset.group;
    const reqs=GRUPOS_POR_PERMISOS[grupo];
    const visible=!reqs||reqs.some(p=>puede(p));
    b.style.display=visible?'':'none';
  });
  // 2) ocultar vistas sin permiso y sacarlas del submenú
  Object.entries(VISTAS_POR_PERMISO).forEach(([vista,permiso])=>{
    const el=document.getElementById(vista);
    if(!el)return;
    const visible=puede(permiso);
    el.dataset.sinPermiso=visible?'':'1';
    if(!visible)el.classList.remove('active');
  });
  document.querySelectorAll('#subNav button[data-v]').forEach(b=>{
    // Un botón que apunta a una vista inexistente se esconde y avisa. Sin
    // esto, el clic reventaba con un error de JavaScript y dejaba la app a
    // medio cambiar, con el menú marcado en una pantalla que no se veía.
    // Es un error de código, no de quien hace clic, así que se avisa por
    // consola con el nombre exacto que hay que corregir.
    if(!document.getElementById('v-'+b.dataset.v)){
      console.error('El botón "'+b.textContent.trim()+'" apunta a la vista "v-'+b.dataset.v+
        '", que no existe. O se crea la sección, o se saca el botón del menú.');
      b.style.display='none';
      return;
    }
  });
  // El submenú se filtra en UNA sola función. Estaba escrito acá y también
  // en ocultarSubNavSinPermiso(), y por eso este arreglo se aplicaba solo a
  // veces: showGroup() reconstruye el menú y llama a la otra, mientras que
  // aplicarPermisos() llamaba a esta de su cuenta. Dos copias de la misma
  // regla divergen apenas una de las dos se toca.
  ocultarSubNavSinPermiso();
  ocultarSubNavSinPermiso();
  // 3) si la vista activa quedó sin permiso, moverse a una visible
  const activa=document.querySelector('section.view.active');
  if(activa&&activa.dataset.sinPermiso==='1'){
    const primero=[...document.querySelectorAll('section.view')].find(s=>s.dataset.sinPermiso!=='1');
    if(primero)primero.classList.add('active');
  }
  marcarTarjaSoloLectura();
}
// En la tarja, si no hay permiso de edición las celdas no son editables.
function marcarTarjaSoloLectura(){
  const directa=puedeEditarTarjaDirectamente();
  const puedePedir=puede('tarja.solicitar_cambio');
  const soloLectura=!directa&&!puedePedir;
  document.querySelectorAll('#matrixArea .attendance-cell').forEach(c=>{
    c.style.cursor=soloLectura?'default':'pointer';
    c.title=soloLectura?'Solo lectura: no tienes permiso para modificar la tarja'
      :directa?(c.dataset.auto==='true'?'X en feriado: día compensado':'Clic para editar el estado')
      :'Clic para solicitar un cambio de estado (lo aprueba RRHH)';
  });
  const hint=document.getElementById('tarjaPermisoHint');
  if(!hint)return;
  if(soloLectura)hint.textContent='Estás viendo la tarja en solo lectura (sin permiso para modificarla).';
  else if(!directa&&puedePedir)hint.textContent='Puedes pedir cambios de estado, pero no aplicarlos: quedan pendientes hasta que RRHH los apruebe.';
  else hint.textContent='';
}
// Aviso cuando alguien intenta una acción sin permiso.
function exigirPermiso(permiso,mensaje){
  if(puede(permiso))return true;
  alert(mensaje||('No tienes permiso para esta acción ('+permiso+'). Pídele a un administrador que te lo habilite.'));
  return false;
}

// ============================================================
// COMPROBACIÓN DE COHERENCIA DE PERMISOS
// La pantalla decide qué botones mostrar usando perfil_roles; la base
// de datos decide qué permite usando sus políticas RLS. Si no coinciden,
// la persona ve un botón que la base le va a rechazar, o le esconde uno
// que sí podría usar. Se consulta a la propia base para detectarlo.

// ============================================================
async function comprobarPermisos(){
  try{
    const {data,error}=await window.supabaseClient.rpc('diagnostico_permisos');
    if(error){
      // La función es de la migración 016. Si no está, no es un problema:
      // solo se pierde esta advertencia.
      console.info('Sin diagnostico_permisos (falta la migración 016):',error.message);
      return;
    }
    const d=Array.isArray(data)?data[0]:data;
    if(!d)return;
    if(!d.usuario_activo){
      mostrarAvisoPermisos('⚠️ Tu usuario figura como inactivo. No vas a poder guardar nada hasta que un administrador lo active en Soporte → Usuarios.');
      return;
    }
    // La app cree que puede enviar o aprobar, pero la base lo desmiente.
    if(d.puede_solicitar&&!puede('tarja.solicitar_cambio')){
      mostrarAvisoPermisos('⚠️ Desalineación de permisos: la base cree que puedes solicitar cambios de estado pero la pantalla no. Ejecuta la migración 016_permisos_coherentes.sql.');
    }
    if(!d.puede_aprobar&&puede('tarja.aprobar_cambio')){
      mostrarAvisoPermisos('⚠️ Desalineación de permisos: ves el botón de aprobar pero la base no te lo va a permitir. Ejecuta la migración 016_permisos_coherentes.sql.');
    }
    // Sin ningún rol: se ve el sistema pero no se puede hacer nada.
    if(!misRoles.length){
      mostrarAvisoPermisos('⚠️ Tu usuario no tiene ningún rol asignado, así que no puedes hacer nada. Pídele a un administrador que te asigne uno en Soporte → Usuarios.');
    }
  }catch(error){
    console.info('No se pudo comprobar la coherencia de permisos:',error.message);
  }
}

// ===================================================================
// RELOJES: CENTROS DE COSTO, CONFIGURACIÓN Y PANTALLA DE MARCAJE
