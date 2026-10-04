/* ===================================================================
   js/relojes.js - LOS RELOJES
   ===================================================================

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
//
// QUÉ ES "UN RELOJ" ACÁ
//
// Es el dispositivo: el Android TV Box con HDMI, o el equipo al que se le
// enchufa un lector QR USB. De él cuelgan tres cosas que se configuran
// juntas, y por eso viven en la misma pantalla:
//
//   dónde está    -> centro de costo (y un texto de ubicación)
//   cómo lee      -> cámara, o lector que se comporta como teclado
//   qué marca      -> entrada, salida, o los dos semiciclos de colación
//
// EL LECTOR USB Y POR QUÉ ES "MODO TECLADO"
//
// Esos lectores no son cámaras. Se enumeran en el sistema como teclado y
// escriben el código, muy rápido, y mandan Enter al final. De ahí salen
// las dos cosas que hay que hacer y que no son detalles:
//
//   - autofocus permanente en un campo de texto, porque en un tótem nadie
//     va a tocar la pantalla;
//   - ignorarlo todo lo que se escriba mientras ya hay un código en el
//     campo, porque el lector a veces manda el código dos veces seguidas.
//
// LA VENTANA ANTIRREBOTE NO ESTÁ ACÁ
//
// La aplica la base (marcar_por_reloj), no esta pantalla. Si la aplicara
// el navegador, un tótem con la hora desfasada o alguien que recarga la
// página se saltaría el control. Ver la migración 030.

// ===================================================================

const ESTADOS_TOTEM={
  ok:          {t:'Marcaje registrado',    c:'var(--accent)'},
  ya_marcado:  {t:'Ya lo habías marcado',  c:'var(--warn)'},
  duplicado:   {t:'Marcaje ya registrado', c:'var(--warn)'},
  error:       {t:'No se pudo marcar',     c:'var(--danger)'}
};
// Lo que se le dice a la persona, en la pantalla grande del tótem. Cada
// caso dice qué hacer, no solo qué pasó: una pantalla que dice "ERROR" y
// nada más hace que la persona pruebe con otra tarjeta y empeore.
const MENSAJES_TOTEM={
  CODIGO_VACIO:['No se leyó nada','Acerca la tarjeta otra vez.'],
  CODIGO_DESCONOCIDO:['Tarjeta desconocida','Esa credencial no está en el sistema. Avisa a portería.'],
  TARJETA_BLOQUEADA:['Tarjeta bloqueada','Esta tarjeta no sirve para marcar. Pídela en portería.'],
  TARJETA_ANULADA:['Tarjeta anulada','Esta tarjeta fue anulada. Pide la nueva en portería.'],
  TRABAJADOR_NO_ACTIVO:['Ya no trabajas aquí','Tu ficha está cerrada. Habla con administración.'],
  OTRA_EMPRESA:['Tarjeta de otra empresa','Esta tarjeta es de otra empresa. No se puede marcar acá.'],
  TIPO_INVALIDO:['Tipo de marca inválido','El reloj está mal configurado. Avisa a administración.'],
  RELOJ_INACTIVO:['Reloj desactivado','Este reloj no está en uso.'],
  // El texto NO dice "el reloj no está registrado": con token puesto, lo
  // que se rechaza es el token, no el reloj. Ver registrarDesdeTotem, que
  // distingue los dos casos antes de llamar.
  TOKEN_INVALIDO:['El token no sirve','El token de este aparato no es el del reloj. Avisa a administración.']
};

let relojes=[];
let centrosCosto=[];
let relojCargado=false;
let relojError='';
let totemActual=null;

// -------------------------------------------------------------------
// POR QUÉ HAY TRES, Y POR QUÉ UNA ES UNA BANDERA
// -------------------------------------------------------------------
// "totemMarcajesCargados" separa "todavía no se preguntó" de "se preguntó y no hay
// nada". Sin esa bandera, "—" puede querer decir dos cosas muy distintas —que la
// consulta no ha vuelto, o que en la portería no ha marcado nadie— y la persona que
// mira la pantalla no puede distinguirlas.
//
// Y con la bandera, "se preguntó y no hay nada" se puede pintar como 0, que sí es un
// hecho. Sin ella no: 0 sobre un "no sé" es una cifra falsa, y en una pantalla de
// asistencia una cifra falsa se cree.
let totemMarcajesHoy=[];
let totemMarcajesCargados=false;
let totemMarcajesError='';
let totemTipo='entrada';
let totemTimer=null;
let totemEscaner=null;
let totemTimerFoco=null;

async function cargarRelojes(){
  relojError='';
  const {data:cc,error:e1}=await window.supabaseClient.from('centros_costo').select('*').order('nombre');
  if(e1){
    relojError='No se pudieron cargar los centros de costo. Aplicá la migración 030_relojes_totem.sql. Detalle: '+e1.message;
    centrosCosto=[];relojes=[];relojCargado=true;renderRelojes();return;
  }
  centrosCosto=cc||[];
  const {data:rj,error:e2}=await window.supabaseClient.from('relojes').select('*').order('nombre');
  if(e2){
    relojError='No se pudieron cargar los relojes: '+e2.message;
    relojes=[];relojCargado=true;renderRelojes();return;
  }
  relojes=rj||[];
  relojCargado=true;
  renderRelojes();
}
function relojPorCodigo(code){
  return relojes.find(r=>normalizarCodigo(r.code)===normalizarCodigo(code))||null;
}
function centroDe(reloj){
  if(!reloj)return '';
  if(reloj.centro_costo_id)return (centrosCosto.find(c=>c.id===reloj.centro_costo_id)||{}).nombre||'';
  return '';
}
function renderRelojes(){
  const lista=document.getElementById('relojLista');
  const aviso=document.getElementById('relojAviso');
  if(!lista)return;
  aviso.innerHTML=relojError
    ?'<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px;margin-bottom:12px">'+
     '<b>Falta la migración 030_relojes_totem.sql.</b> <small>'+escHtml(relojError)+'</small></div>'
    :'';
  if(!relojes.length){
    lista.innerHTML='<small>No hay relojes todavía. Creá el primero con "Agregar reloj".</small>';
    renderSelectorRelojes();
    renderCentrosCosto();
    return;
  }
  lista.innerHTML=relojes.map(r=>{
    const sinToken=!r.token_hash;
    const sinCentro=!r.centro_costo_id;
    // Un reloj sin clave de kiosco no esta roto, pero es un reloj que se
    // puede sacar de la pantalla con cinco toques. Se avisa en la lista en
    // vez de dejarlo pasar: es el aviso que lleva a la pantalla correcta.
    const sinClave=!r.hash_pin;
    const alertas=[];
    if(sinCentro)alertas.push('sin centro de costo');
    if(sinToken)alertas.push('sin token');
    if(sinClave)alertas.push('sin clave de kiosco');
    if(r.kiosco_activo===false)alertas.push('kiosco desactivado');
    if(!r.activo)alertas.push('desactivado');
    const ultima=r.ultima_lectura_at
      ?'Última lectura: '+escHtml(new Date(r.ultima_lectura_at).toLocaleString('es-CL'))
      :'Nunca leyó nada';
    // El token no se puede ver (en la base solo está su huella), pero sí se
    // puede saber si ESTE navegador lo tiene instalado, porque al instalar
    // queda guardado acá. Es el dato que decide si hace falta rotarlo: si
    // ya está instalado en el equipo del tótem, rotarlo deja ese aparato
    // sin marcar hasta que se reinstale.
    const instaladoAqui=!!totemTokenDe(r.code);
    const estadoToken=!r.token_hash
      ?'<small style="color:var(--danger)">sin token: hay que generarlo</small>'
      :(instaladoAqui
        ?'<small style="color:var(--accent)">token instalado en este equipo</small>'
        :'<small style="color:var(--warn-ink)">token no está en este equipo: rotalo e instalalo en el tótem</small>');
    return `<div class="list-item" style="cursor:default;display:block">
      <div>
        <b>${escHtml(r.code)}</b> — ${escHtml(r.nombre)}
        <span class="pill" style="margin-left:6px">${r.tipo_lector==='camara'?'Cámara':'Lector USB'}</span>
        ${r.activo?'':'<span class="pill" style="color:var(--danger);border-color:var(--danger)">Desactivado</span>'}
        <br><small>
          ${escHtml(centroDe(r)||'Sin centro de costo')}${r.ubicacion?' · '+escHtml(r.ubicacion):''}
          · antirrebote ${escHtml(String(r.segundos_antirrebote))} s
          · kiosco ${r.kiosco_activo===false?'desactivado':escHtml(String(r.kiosco_pulsaciones||5))+' pulsaciones'}
          · ${ultima}
          · ${estadoToken}
        </small>
        ${alertas.length?'<br><small style="color:var(--warn-ink)">Ojo: '+escHtml(alertas.join(', '))+'</small>':''}
      </div>
      <span style="display:flex;gap:6px;flex:0 0 auto">
        <button class="btn" type="button" style="padding:4px 8px;font-size:.8rem" onclick="editarReloj('${escHtml(r.code)}')">Configurar</button>
        <button class="btn" type="button" style="padding:4px 8px;font-size:.8rem"
                onclick="rotarTokenReloj('${escHtml(r.code)}')">${sinToken?'Generar token':'Rotar token'}</button>
        <button class="btn" type="button" style="padding:4px 8px;font-size:.8rem"
                onclick="${sinClave?'generarClaveReloj':'mostrarClaveExistente'}('${escHtml(r.code)}')">
          ${sinClave?'Generar clave':'Cambiar clave'}</button>
        <button class="btn primary" type="button" style="padding:4px 8px;font-size:.8rem"
                onclick="abrirFormularioToken('${escHtml(r.code)}')">Instalar token</button>
        <button class="btn" type="button" style="padding:4px 8px;font-size:.8rem"
                onclick="asignarRelojAUsuario('${escHtml(r.code)}')">Asignar a cuenta</button>
        <button class="btn" type="button" style="padding:4px 8px;font-size:.8rem"
                onclick="abrirTotem('${escHtml(r.code)}')">Abrir pantalla</button>
      </span>
    </div>`;
  }).join('');
  renderSelectorRelojes();
  renderCentrosCosto();
}
function renderSelectorRelojes(){
  const sel=document.getElementById('totemReloj');
  if(!sel)return;
  const anterior=sel.value;
  sel.innerHTML='<option value="">Elegí un reloj…</option>'+
    relojes.filter(r=>r.activo).sort((a,b)=>a.nombre.localeCompare(b.nombre))
      .map(r=>`<option value="${escHtml(r.code)}">${escHtml(r.code+' — '+r.nombre)}</option>`).join('');
  if([...sel.options].some(o=>o.value===anterior))sel.value=anterior;
}
function abrirFormularioReloj(code){
  const r=code?relojPorCodigo(code):null;
  const dlg=document.getElementById('dlgReloj');
  document.getElementById('relojTitulo').textContent=r?('Configurar '+r.nombre):'Agregar reloj';
  document.getElementById('relojError').textContent='';
  document.getElementById('relojGuardar').textContent=r?'Guardar cambios':'Crear reloj';
  document.getElementById('relojCode').value=r?r.code:'';
  document.getElementById('relojCode').readOnly=!!r;
  document.getElementById('relojNombre').value=r?r.nombre:'';
  document.getElementById('relojUbicacion').value=r?(r.ubicacion||''):'';
  document.getElementById('relojAntirrebote').value=r?r.segundos_antirrebote:45;
  document.getElementById('relojActivo').checked=r?!!r.activo:true;
  const sel=document.getElementById('relojCentro');
  sel.innerHTML='<option value="">— sin centro de costo —</option>'+
    centrosCosto.map(c=>`<option value="${c.id}">${escHtml(c.code+' — '+c.nombre)}</option>`).join('');
  sel.value=r&&r.centro_costo_id?String(r.centro_costo_id):'';
  const tl=document.getElementById('relojTipoLector');
  tl.value=r?r.tipo_lector:'teclado';
  document.getElementById('relojCamaraWrap').style.display=tl.value==='camara'?'':'none';
  document.getElementById('relojCamara').value=r?r.camara:'trasera';
  document.getElementById('relojTokenWrap').innerHTML=r
    ?'<small>El token ya existe. Rotarlo deja de servir el anterior: hay que reinstallar la app del tótem.</small>'
    :'<small>Se genera solo al crear el reloj, y se muestra una vez sola: si se llenara más, se perdería la elección.</small>';
  explicarTipoLector();
  dlg.showModal();
  document.getElementById(r?'relojNombre':'relojCode').focus();
}
// Muestra la ayuda de los dos tipos de lector. No es decoración: la
// diferencia entre cámara y teclado no se ve hasta que alguien enchufa
// el aparato equivocado y nadie marca.
function explicarTipoLector(){
  const esCamara=document.getElementById('relojTipoLector').value==='camara';
  document.getElementById('relojCamaraWrap').style.display=esCamara?'':'none';
  const caja=document.getElementById('relojLectorAyuda');
  caja.innerHTML=esCamara
    ?'<b>Cámara.</b> El tótem abre la cámara y lee el código QR de la credencial. '+
      'Sirve para un lector de códigos QR conectado, o para la cámara del mismo aparato. '+
      'La cámara de un Android TV Box está fija, así que conviene apuntarla un poco hacia abajo.'
    :'<b>Lector QR USB (modo teclado).</b> Es el más común en la obra: se enchufa y el equipo lo ve como un teclado. '+
      'Al pasar la tarjeta escribe el código y manda Enter. No hay que tocar nada, pero el lector tiene que estar '+
      'configurado para enviar Enter al final (casi todos lo vienen así). '+
      'Si el lector trae el prefijo "ENTER" o "TAB" configurado, hay que ponerlo en Enter o none.';
}
async function guardarReloj(){
  const dlg=document.getElementById('dlgReloj');
  const err=document.getElementById('relojError');
  const code=document.getElementById('relojCode').value.trim().toUpperCase();
  const nombre=document.getElementById('relojNombre').value.trim();
  const btn=document.getElementById('relojGuardar');
  err.textContent='';
  if(!code){err.textContent='Falta el código del reloj. Es el que va en la URL de la pantalla.';return;}
  if(!/^[A-Z0-9][A-Z0-9._-]{0,29}$/.test(code)){
    err.textContent='El código solo puede tener letras, números, punto, guion y guion bajo. Máximo 30 caracteres.';
    return;
  }
  if(!nombre){err.textContent='Falta el nombre del reloj.';return;}
  btn.disabled=true;btn.textContent='Guardando…';
  const empresa=empresaActual||null;   // empresaActual ya ES el id
  const {data:existente}=await window.supabaseClient.from('relojes').select('id').eq('code',code).maybeSingle();
  let error=null;
  const cuerpo={
    code,nombre,
    ubicacion:document.getElementById('relojUbicacion').value.trim()||null,
    centro_costo_id:document.getElementById('relojCentro').value?Number(document.getElementById('relojCentro').value):null,
    empresa_id:empresa,
    tipo_lector:document.getElementById('relojTipoLector').value,
    camara:document.getElementById('relojCamara').value,
    activo:document.getElementById('relojActivo').checked,
    segundos_antirrebote:Number(document.getElementById('relojAntirrebote').value)||45
  };
  if(existente){
    const r=await window.supabaseClient.from('relojes').update(cuerpo).eq('code',code);
    error=r.error;
  }else{
    const r=await window.supabaseClient.from('relojes').insert(cuerpo).select().single();
    error=r.error;
    if(!error){
      // El token se genera acá y se muestra UNA vez. La base guarda solo el
      // hash, así que si se pierde hay que rotarlo, no recuperarlo.
      const {data:rotado,error:e2}=await window.supabaseClient.rpc('rotar_token_reloj',{p_code:code});
      if(e2){
        err.innerHTML='El reloj se creó, pero no se pudo generar el token: '+escHtml(e2.message)+
          '<br>La migración 030 tiene que estar aplicada. Podés generar el token desde la lista con "Rotar token".';
        btn.disabled=false;btn.textContent='Crear reloj';
        await cargarRelojes();
        return;
      }
      dlg.close();
      await cargarRelojes();
      mostrarToken(rotado.rotar_token_reloj||rotado);
      return;
    }
  }
  btn.disabled=false;btn.textContent='Guardar cambios';
  if(error){
    err.textContent=/duplicate|unique/i.test(error.message)
      ?'Ya existe un reloj con el código "'+code+'". Los códigos tienen que ser distintos.'
      :'No se pudo guardar: '+error.message;
    return;
  }
  dlg.close();
  await cargarRelojes();
}
let relojEnTurno='';
async function rotarTokenReloj(code){
  relojEnTurno=code;
  const r=relojPorCodigo(code);
  if(!r){alert('No se encontró el reloj.');return;}
  if(!confirm('Rotar el token de '+r.nombre+'?\n\nEl token anterior deja de servir al instante. Si el tótem ya está instalado, hay que volver a instalar la app con el token nuevo, o el reloj deja de marcar.\n\n¿Continuar?'))return;
  const {data,error}=await window.supabaseClient.rpc('rotar_token_reloj',{p_code:code});
  if(error){alert('No se pudo rotar el token: '+error.message);return;}
  await cargarRelojes();
  mostrarToken(data.rotar_token_reloj||data);
}
// El token se muestra una vez, con el texto ya seleccionado para copiarlo.
// Decir "anotálo" y cerrarlo es la forma de que se pierda y quede un reloj
// que no marca sin que nadie sepa por qué.
function mostrarToken(token){
  const dlg=document.getElementById('dlgToken');
  const inp=document.getElementById('tokenValor');
  inp.value=token;
  document.getElementById('tokenInstalarCampo').value=token;
  document.getElementById('tokenRelojCodigo').value=relojEnTurno||'';
  pintarEstadoToken(relojEnTurno||'',true);
  dlg.showModal();
  setTimeout(()=>{inp.focus();inp.select();},60);
}

// ------------------------------------------------------------------
// EL CAMPO DE TOKEN DEL TÓTEM
// ------------------------------------------------------------------
// Aparece SOLO cuando hace falta, y se esconde después de guardar bien.
//
// Va en la pantalla del reloj y no en la de Relojes a propósito. El reloj
// está colgado en la portería y la pantalla de Relojes en el computador de
// la oficina: mandar a alguien a buscar el token, volver a la obra con un
// papel, y pegarlo es un viaje. El token se pega donde el reloj está.
//
// Y solo aparece cuando hace falta. Un campo de texto en una pantalla que
// la gente toca con cualquier dedo, en medio del marcaje, es un problema
// esperando: un dedo lo tapa y no se marca.
function mostrarCampoTokenTotem(){
  const caja=document.getElementById('totemTokenCaja');
  if(!caja)return;
  document.getElementById('totemTokenCampo').value='';
  caja.style.display='';
  setTimeout(()=>document.getElementById('totemTokenCampo').focus(),80);
}
function ocultarCampoTokenTotem(){
  const caja=document.getElementById('totemTokenCaja');
  if(caja)caja.style.display='none';
}

// Se guarda y se reintenta la marcación.
//
// La marcación se reintenta sola: la persona ya presentó la tarjeta, y el
// problema era del aparato, no de ella. Pedirle que vuelva a pasar la
// credencial después de que le dijimos "el token no es de este reloj" es
// una molestia que no tiene sentido.
//
// El token se COMPRUEBA contra la base antes de decir que quedó bien. Un
// token pegado con un carácter de más, o con un espacio al final, se
// guardaría igual y la persona creería que quedó instalado: el error
// volvería en la siguiente marcación, y ya no sabría de dónde salió.
async function guardarTokenDesdeTotem(){
  const campo=document.getElementById('totemTokenCampo');
  const valor=String(campo.value||'').trim();
  if(!valor){
    mostrarTotem('error','Falta el token',
      'Copiá el token del reloj y pegalo en el campo de abajo.');
    return;
  }
  if(!totemActual){
    mostrarTotem('error','No hay reloj',
      'Este error no debería aparecer. Recargá la pantalla.');
    return;
  }
  try{
    localStorage.setItem('totemToken_'+totemActual.code,valor);
  }catch(error){
    mostrarTotem('error','No se pudo guardar',
      'Este navegador está en modo privado y no guarda nada. El token hay que '
      +'pegarlo cada vez. Sacá la incógnito o usá otro navegador en el aparato.');
    return;
  }
  // La comprobación manda un código vacío a propósito: es la forma de
  // preguntar "¿este token sirve?" sin registrar ninguna marcación. La base
  // responde CODIGO_VACIO cuando el token es correcto, y TOKEN_INVALIDO
  // cuando no.
  let error=null;
  try{
    const r=await window.supabaseClient.rpc('marcar_por_reloj',{
      p_token:valor,
      p_codigo:'',
      p_tipo:document.getElementById('totemTipo').value
    });
    error=r.error;
  }catch(e){
    error=e;
  }
  const msg=String((error&&error.message)||'');

  // ------------------------------------------------------------------
  // EL TOKEN ES CORRECTO
  // ------------------------------------------------------------------
  // CODIGO_VACIO es la respuesta que da la base cuando el token sirve y lo
  // que se mandó para preguntar era un código vacío. Es la forma de
  // preguntar "¿este token sirve?" sin registrar ninguna marcación.
  if(/CODIGO_VACIO/.test(msg)){
    ocultarCampoTokenTotem();
    mostrarTotem('ok','Listo, este reloj ya marca',
      'Pasá la tarjeta otra vez.');
    const leido=document.getElementById('totemCodigoLeido').textContent.trim();
    if(leido){
      registrarDesdeTotem.ultima=0;   // se anula el freno de 1,5 s
      await registrarDesdeTotem(leido);
    }
    return;
  }

  // ------------------------------------------------------------------
  // LA FUNCIÓN NO ESTÁ EN LA BASE
  // ------------------------------------------------------------------
  // La migración 030 crea la tabla de los relojes, la del marcaje y la
  // función que los une. Si se aplicó a medias —que es lo que pasa cuando
  // una migración falla a mitad, y falla a mitad seguido— la tabla existe
  // y la función no.
  //
  // Es el caso más probable y el más difícil de ver: el reloj está creado,
  // aparece en la lista, y al marcar dice que el token está malo. El
  // token no tiene nada que ver.
  if(/does not exist|Could not find the function|marcar_por_reloj/i.test(msg)){
    try{localStorage.removeItem('totemToken_'+totemActual.code);}catch(e){}
    mostrarTotem('error','Falta instalar la base de los relojes',
      'El token está bien, pero el sistema no tiene la función que registra el marcaje.\n\n'
      +'Hay que aplicar la migración 030_relojes_totem.sql completa, no a medias: '
      +'la tabla del reloj quedó creada y la función no.\n\n'
      +'Esto lo hace una persona con acceso al panel de la base, no desde este reloj.');
    return;
  }

  // ------------------------------------------------------------------
  // EL TOKEN ES DE OTRO RELOJ
  // ------------------------------------------------------------------
  if(/TOKEN_INVALIDO/.test(msg)){
    // Se saca. Un token que la base rechaza no sirve para nada, y dejarlo
    // guardado hace que el próximo intento falle sin explicación.
    try{localStorage.removeItem('totemToken_'+totemActual.code);}catch(e){}
    mostrarTotem('error','Ese token no es de este reloj',
      'Está bien escrito, pero no es el del reloj '+String(totemActual.code)+'. '
      +'Si se rotó el token de este reloj después de instalar, hay que pegar el nuevo.');
    return;
  }

  // ------------------------------------------------------------------
  // CUALQUIER OTRA COSA
  // ------------------------------------------------------------------
  // Se saca el token solo si el error es de autenticación o de la base. Con
  // lo demás no se toca lo que hay, porque puede ser un problema de red: si
  // se borrara el token por un error de conexión, el reloj se quedaría sin
  // token hasta que volviera la señal, y eso sí es una pérdida real.
  if(/JWT|auth|permission|row-level|42501|PGRST/i.test(msg)){
    try{localStorage.removeItem('totemToken_'+totemActual.code);}catch(e){}
    mostrarTotem('error','No se pudo comprobar el token',
      'Revisá que la sesión siga abierta. El detalle es: '+msg.slice(0,120));
    return;
  }

  // Se deja el token como estaba. Puede que sea un corte de conexión, y en
  // ese caso el token probablemente esté bien.
  mostrarTotem('error','No se pudo comprobar el token',
    'Puede ser que este reloj no tenga conexión con la base ahora mismo. '
    +'El token quedó como estaba: probá de nuevo en un rato.\n\n'
    +'Detalle: '+msg.slice(0,140));
}

// -------------------------------------------------------------------
// Y SUMAR UN MARCAJE SIN VOLVER A CONSULTAR
// -------------------------------------------------------------------
// El contador sube en la memoria y se repinta: una consulta por cada marcaje es
// justo lo que hace lento un aparato viejo, y aquí no hace falta porque ya sabemos
// lo que pasó.
function sumarMarcajeAlTotem(d){
  if(!d)return;
  totemMarcajesHoy.push({
    code:d.code,
    fecha:String(d.fecha||fechaLocalISO(new Date())).slice(0,10),
    estado:d.estado||'',
    justificacion_id:d.justificacion_id!=null?d.justificacion_id:null,
    centro_costo_id:d.centro_costo_id!=null?d.centro_costo_id:null
  });
  // Y se marca como cargados: si el contador ya venía de la base, sigue siendo
  // cierto que lo que hay en memoria es lo que hay en la base, más este.
  totemMarcajesCargados=true;
  pintarTotemContadores();
}

function pintarTotemContadores(){
  const cR=document.getElementById('totemCifraRealizados');
  const cA=document.getElementById('totemCifraAusencias');
  const cP=document.getElementById('totemCifraPendientes');
  if(!cR||!cA||!cP)return;

  const sinDato=(el)=>{el.textContent='—';el.classList.add('sin-dato');};
  // -------------------------------------------------------------------
  // Y POR QUÉ ESTA LÍNEA, Y POR QUÉ SE USÓ ANTES DE EXISTIR
  // -------------------------------------------------------------------
  // Porque "se preguntó y no hay nada" NO es lo mismo que "no se preguntó". Con la
  // lista cargada y vacía, la respuesta honesta es 0: no ha marcado nadie, y eso es
  // un hecho sobre la portería.
  //
  // Antes esta rama era un "return" que dejaba el "—" ahí, y ese "—" decía "no se
  // consultó" cuando sí se había consultado. Es el mismo error del que avisa el
  // comentario de más arriba, en otro sitio.
  //
  // Y sale un 0 DE VERDAD: sin la clase "sin-dato", que es la que pinta en el color
  // de los datos que no se saben. Un 0 que no se sabe y un 0 que es cero se ven
  // distintos a propósito: el que no se sabe es un dato que falta, no una cifra.
  //
  // -------------------------------------------------------------------
  // Y POR QUÉ SE USÓ ANTES DE EXISTIR
  // ---------------------------------
  // Porque en la primera pasada se escribió el "if(!lista.length){ ponerCero(cR);
  // ponerCero(cA); }" y se pasó a la otra cosa sin mirar de dónde salía el nombre.
  //
  // Y no lo detectó casi nada. Una función llamada y no definida es sintaxis
  // VÁLIDA, así que la comprobación de sintaxis del guion entero pasaba; y las
  // comprobaciones de contenido preguntan "¿existe la llamada?", que sí existía.
  //
  // En el navegador botaba en la primera línea de esa rama, y esa rama es
  // justamente la PRIMERA de la mañana: el reloj abre antes que la obra. O sea que
  // el arreglo, en el caso para el que se hizo, no arreglaba nada.
  const ponerCero=(el)=>{el.textContent='0';el.classList.remove('sin-dato');};
  sinDato(cR);sinDato(cA);sinDato(cP);

  // Y ahora se cuenta sobre "totemMarcajesHoy", y NO sobre la "marcajes" de la
  // planilla. Antes se contaba sobre esa, que solo se llena al abrir la pestaña de
  // la planilla del día: en la portería nunca se abre, y por eso los tres números
  // estaban en "—".
  const lista=totemMarcajesCargados?totemMarcajesHoy:null;
  if(!lista||!totemActual)return;
  // Con el dato cargado y CERO filas, se pone 0: no ha marcado nadie, y eso es un
  // hecho. Antes el "return" de la lista vacía dejaba el "—" ahí, que era
  // mentir sin querer: "—" dice "no se consultó", y sí se consultó.
  if(!lista.length){
    ponerCero(cR);ponerCero(cA);
    return;
  }

  // El día de hoy, en el mismo formato con que vienen los marcajes. Se
  // comparan los primeros diez caracteres porque algunos vienen con la hora
  // pegada y otros solo con la fecha.
  const hoy=new Date();
  const hoyTxt=hoy.getFullYear()+'-'
    +String(hoy.getMonth()+1).padStart(2,'0')+'-'
    +String(hoy.getDate()).padStart(2,'0');
  const centro=totemActual.centro_costo_id!=null?String(totemActual.centro_costo_id):'';

  const delDia=lista.filter(m=>{
    const f=String(m.fecha||'').slice(0,10);
    if(f!==hoyTxt)return false;
    // Sin centro en el reloj se cuentan todos; con centro, solo los de ese.
    if(!centro)return true;
    if(m.centro_costo_id==null)return false;
    return String(m.centro_costo_id)===centro;
  });
  if(!delDia.length)return;

  // REALIZADOS: los que entraron de verdad, sin los que quedaron anulados o
  // rechazados. Un marcaje rechazado cuenta como marcaje: alguien lo pasó.
  const realizados=delDia.filter(m=>m.estado!=='anulado'&&m.estado!=='rechazado').length;

  // AUSENCIAS JUSTIFICADAS: las que tienen justification puesta. Se cuenta
  // por trabajador, no por fila: una persona con tres marcas justificadas es
  // una ausencia, no tres. Sin eso, el número crece con las veces que la
  // gente pasa por el reloj y no dice nada.
  const conJustificacion={};
  delDia.forEach(m=>{
    const est=String(m.estado||'');
    if(est==='justificado'||est==='licencia'||est==='ausencia_justificada'
       ||(m.justificacion_id!=null)){
      conJustificacion[String(m.code)]=1;
    }
  });
  const ausencias=Object.keys(conJustificacion).length;

  // PENDIENTES: los que el reloj registró y la base todavía no tiene. Cuando
  // el reloj está sin conexión esto es justamente lo que se exporta después.
  //
  // -------------------------------------------------------------------
  // Y POR QUÉ ESTE SIGUE EN "—", Y POR QUÉ NO SE LE PONE UN CERO
  // -------------------------------------------------------------------
  // Porque es la COLA LOCAL DEL RELOJ: los marcajes que el aparato registró y la
  // base todavía no tiene. Esa cola todavía no existe, y el código lo reconoce con un
  // "typeof totemPendientesLocales !== 'undefined'", que SIEMPRE da falso.
  //
  // Poner 0 ahí sería MENTIR en la portería. El 0 significa "no hay nada pendiente",
  // que es un hecho sobre la obra; y en una pantalla donde se está viendo la
  // asistencia, un 0 falso se cree: alguien ve que no hay pendientes y cierra el
  // tema.
  //
  // Con "—" lo que dice es "esto no se sabe", que es lo cierto. Y el día que exista
  // la cola, este número aparece solo, sin tocar nada de acá: la lista ya se está
  // contando.
  //
  // Y aquí NO se pone 0 cuando no se sabe. Todavía no existe la cola local
  // del reloj (es lo que falta hacer), así que este número queda en "—" en
  // vez de mentir con un cero. Un cero en este campo significa "no hay nada
  // pendiente", y en una portería eso se cree.
  const cola=typeof totemPendientesLocales!=='undefined'&&Array.isArray(totemPendientesLocales)
    ?totemPendientesLocales.filter(m=>String(m.fecha||'').slice(0,10)===hoyTxt).length
    :null;

  const poner=(el,n)=>{el.textContent=String(n);el.classList.remove('sin-dato');};
  poner(cR,realizados);
  poner(cA,ausencias);
  const cajaP=document.getElementById('totemCajaPendientes');
  if(cola==null){
    sinDato(cP);
    if(cajaP)cajaP.classList.remove('sin-pendientes');
  }else{
    poner(cP,cola);
    if(cajaP)cajaP.classList.toggle('sin-pendientes',cola===0);
  }
}

function mostrarTotem(clase,titulo,detalle){
  const caja=document.getElementById('totemMensaje');
  caja.className='totem-'+clase;
  caja.innerHTML='<div class="totem-icono">'
    +(clase==='ok'?'✓':clase==='error'?'✕':'!')
    +'</div><div class="totem-texto"><b>'+escHtml(titulo)+'</b><br><span>'+detalle+'</span></div>';
  const leido=document.getElementById('totemCodigoLeido');
  leido.textContent=clase==='ok'?'Marcaje OK':(clase==='error'?'Sin registro':'Ya registrado');
  leido.className='totem-pill totem-pill-'+clase;
  // Se vuelve sola al estado de reposo. El tiempo depende de cuánto tarda
  // la persona en levantar la tarjeta: 2,2 s es suficiente para leer el
  // nombre sin quedarse mirando la pantalla.
  if(totemTimer)clearTimeout(totemTimer);
  totemTimer=setTimeout(()=>{
    if(!totemActual)return;
    pintarTotemInicial();
    document.getElementById('totemCampo').value='';
    document.getElementById('totemCampo').focus();
  },2200);
}
function cerrarTotem(){
  // Si está bloqueado, salir pasa por la clave. El botón está oculto en
  // el kiosco, pero la función sigue siendo alcanzable desde el historial
  // del navegador o desde un atajo: la guarda va acá, no en el botón.
  if(kioscoActivo){abrirClaveKiosco();return;}
  pararHoraTotem();
  pararComprobacionConexion();
  desactivarKiosco();
  if(totemTimer)clearTimeout(totemTimer);
  if(totemTimerFoco){clearInterval(totemTimerFoco);totemTimerFoco=null;}
  detenerCamaraTotem();
  totemActual=null;
  document.body.classList.remove('modoTotem');
  document.getElementById('pantallaTotem').classList.remove('abierta');
}
// La cámara del tótem. Es la MISMA librería que usa el escaneo normal de la
// app, a propósito: son el mismo problema y duplicar el lector de QR sería
// tener dos cosas que se rompen por motivos distintos.
async function arrancarCamaraTotem(){
  const area=document.getElementById('totemCamara');
  if(totemEscaner)return;
  if(typeof Html5Qrcode==='undefined'){
    mostrarTotem('error','La cámara no cargó','Revisa la conexión a internet de este equipo y recarga.');
    return;
  }
  try{
    const camara=document.getElementById('relojCamara')?document.getElementById('relojCamara').value:(totemActual.camara||'trasera');
    const faceMode=camara==='frontal'||camara==='auto';
    totemEscaner=new Html5Qrcode('totemCamara',{verbose:false,formatsToSupport:qrSupportedFormats()});
    await totemEscaner.start(
      {facingMode:faceMode?'user':'environment'},
      {fps:10,qrbox:{width:320,height:320}},
      (texto)=>{
        // Se detiene y se reinicia porque la librería sigue disparando
        // detectando el mismo código: sin esto seShot miles de veces por
        // segundo.
        try{totemEscaner.stop();}catch(error){}
        totemEscaner=null;
        registrarDesdeTotem(texto);
        setTimeout(()=>{if(totemActual&&totemActual.tipo_lector==='camara')arrancarCamaraTotem();},2300);
      },
      ()=>{}
    );
    document.getElementById('totemZonaCamara').style.display='';
  }catch(error){
    totemEscaner=null;
    mostrarTotem('error','No se pudo abrir la cámara',String(error.message||error).slice(0,80));
  }
}
function detenerCamaraTotem(){
  if(!totemEscaner)return;
  try{totemEscaner.stop();}catch(error){}
  try{totemEscaner.clear();}catch(error){}
  totemEscaner=null;
  if(document.getElementById('totemZonaCamara'))document.getElementById('totemZonaCamara').style.display='none';
}
function cambiarTipoTotem(){totemTipo=document.getElementById('totemTipo').value;pintarTotemInicial();}
// La entrada del lector QR USB. Un input normal con autofocus: el lector
// escribe los caracteres y manda Enter, y eso es todo.
document.addEventListener('DOMContentLoaded',()=>{
  const campo=document.getElementById('totemCampo');
  if(campo){
    campo.addEventListener('keydown',(ev)=>{
      if(ev.key!=='Enter')return;
      ev.preventDefault();
      registrarDesdeTotem(campo.value);
    });
    // El foco NO se recupera con un listener de "blur".
    //
    // Se probó y no sirve: cuando el campo tiene algo escrito y alguien
    // está a medio pasar la tarjeta, el blur lo devuelve igual y le roba el
    // foco de debajo de la mano. Con dos mecanismos (blur e intervalo)
    // uno le gana al otro y el resultado depende de cuál dispara primero.
    //
    // Queda solo el intervalo de `abrirTotem`, que tiene una sola regla
    // clara: si el campo está vacío, vuelve a él. Si hay algo escrito, la
    // persona está usándolo y no se lo toca.
  }
  abrirTotemPorURL();
});
function abrirTotemPorURL(){
  // /totem/RELOJ-01 abre directo. Es la dirección que se le pone al
  // Android TV Box: no hay que buscar nada en un menú a pantalla completa.
  const m=location.pathname.match(/\/totem\/([^/?#]+)/);
  if(!m)return;
  const code=decodeURIComponent(m[1]);
  (async()=>{
    if(!relojCargado)await cargarRelojes();
    if(!relojPorCodigo(code)){
      document.body.innerHTML='<div style="padding:40px;font-family:system-ui">'+
        '<h1>Reloj no encontrado</h1><p>No hay ningún reloj con el código <b>'+
        escHtml(code)+'</b>.</p><p>Revisá el código en Administración → Relojes, o pedile a alguien que lo registre.</p></div>';
      return;
    }
    // El rol `reloj` tiene `relojes.marcaje`, no `relojes.totem`: son
    // permisos distintos y el aparato no necesita el segundo. Se aceptan
    // los dos para que un supervisor con el permiso viejo siga entrando.
    if(!puede('relojes.marcaje')&&!puede('relojes.totem')){
      document.body.innerHTML='<div style="padding:40px;font-family:system-ui">'+
        '<h1>Sin permiso</h1><p>Tu usuario no puede marcar asistencia: no tiene el permiso '
        +'<b>relojes.marcaje</b> ni el <b>relojes.totem</b>.</p>'+
        '<p>Un administrador lo habilita en Soporte → Permisos por rol, o le crea una '
        +'cuenta con el rol <b>Reloj</b>.</p></div>';
      return;
    }
    // Un usuario que es solo un reloj no ve el panel: entra directo.
    if(soyUsuarioReloj())esconderTodoParaReloj();
    abrirTotem(code);
  })();
}
async function comprobarRelojes(){
  try{
    const {data,error}=await window.supabaseClient.rpc('diagnostico_relojes');
    if(error)return;
    const d=Array.isArray(data)?data[0]:data;
    if(!d)return;
    const problemas=[];
    if(!d.colacion_ok)problemas.push('la colación no está habilitada');
    if(!d.col_reloj_ok)problemas.push('no se guarda de qué reloj vino la marca');
    if(!d.marca_fn)problemas.push('no existe la función de marcaje');
    if(problemas.length){
      mostrarAvisoPermisos('La parte de relojes está incompleta ('+problemas.join(', ')+'). Vuelve a aplicar la migración 030_relojes_totem.sql.');
    }
  }catch(error){
    console.info('No se pudo comprobar los relojes:',error.message);
  }
}

// ------------------------------------------------------------------
// LA VISTA DEL KIT
// ------------------------------------------------------------------
// El selector de especialidad del formulario del trabajador.
//
// Se llena aunque la lista esté vacía: el campo tiene que estar, porque
// guardar() lo lee siempre. Si no estuviera, cualquier guardado de una
// ficha lanzaría un TypeError en null.
function llenarSelectoresEspecialidad(){
  pintarGrupoCargo(document.getElementById('w-grupo'),document.getElementById('w-cargo'),null);
}
function cambiarGrupoTrabajador(){
  const sg=document.getElementById('w-grupo');
  const sc=document.getElementById('w-cargo');
  if(!sg||!sc)return;
  pintarOpcionesCargo(sc,sg.value);
}

