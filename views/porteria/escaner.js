/* ref: escaner-01 - El escáner de códigos. Lo usan diez pantallas, no una */
function qrSupportedFormats(){
  return [
    Html5QrcodeSupportedFormats.QR_CODE,Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.CODE_39
  ];
}
function qrFormatsAvailable(){
  return typeof Html5Qrcode!=='undefined'&&typeof Html5QrcodeSupportedFormats!=='undefined';
}
// Resuelve un código leído (QR o barra) al destino correspondiente al contexto de escaneo.
function handleScannedCode(rawCode,purpose){
  const code=String(rawCode||'').trim();
  if(!code)return;
  if(purpose==='attendance-worker'||purpose==='attendance-supervisor')return applyAttendanceQr(code,purpose);
  if(purpose==='sup-diaria')return marcarPorEscaneo(code);
  if(purpose==='marcaje-manual')return buscarParaMarcajeManual(code);
  if(purpose==='epp-worker')return selectEppWorkerByScan(code);
  if(purpose==='kit-worker')return selectKitWorkerByScan(code);
  if(purpose==='epp-historial')return filtrarHistorialPorScan(code);
  if(purpose==='tool-owner')return lookupQrOwner(code);
  // Elemento, herramienta o kit. El numero es la fila a la que va.
  //
  // "nueva" no es un numero: es el botón único que está al lado del título, y no
  // sabe de antemano en qué fila va el código. Eso se resuelve acá, con la lista
  // ya a la vista, que es el momento en que se puede saber.
  if(purpose==='epp-item:nueva')return escanearEppEnLaFilaVacia(code);
  if(purpose.indexOf('epp-item:')===0)return escanearEppItem(+purpose.slice(9),code);
  if(purpose.indexOf('kit-item:')===0)return escanearKitItem(+purpose.slice(9),code);
  const input=document.getElementById('scanCode');
  if(input)input.value=code;
  return doScan();
}
// Resuelve lo que se escaneó a un trabajador validando la TARJETA.
//
// El QR de la tarjeta codifica el id de la tarjeta, no el código del
// trabajador: así se puede anular una tarjeta perdida y emitir otra sin
// que la vieja siga sirviendo. Al escanear se lee la tarjeta y con ella
// se sabe de quién es, si sigue vigente y si el trabajador continúa
// trabajando acá.
//
// Acepta también el código del trabajador a mano, por si alguien teclea
// el número en vez de pasar la tarjeta, pero avisa que no es lo mismo.
function resolverCodigoTrabajador(scanned,opciones){
  opciones=opciones||{};
  const leido=String(scanned||'').trim();
  if(!leido)return null;
  // Se compara con normalizarCodigo y no con "==". El resto del programa
  // lo hace asi, y con "==" una tarjeta guardada en minuscula no se
  // encontraba si el lector la mandaba en mayuscula. Fallaba solo en este
  // camino, sin que hubiera ninguna razon visible para eso.
  const clave=normalizarCodigo(leido);
  const card=tarjetas.find(t=>normalizarCodigo(t.id)===clave);
  if(card){
    if(card.estado==='anulada'){
      alert('⚠️ TARJETA ANULADA\nEsta tarjeta ya no es válida'+(card.motivo_anulacion?' ('+card.motivo_anulacion+')':'')+'. Pide la tarjeta vigente.');
      return null;
    }
    if(card.estado==='bloqueada'){
      alert('⛔ TARJETA BLOQUEADA\nEsta tarjeta no sirve para pasar asistencia.'+
        (card.motivo_bloqueo?'\nMotivo: '+card.motivo_bloqueo:'')+
        '\n\nDebe pasar por Administración para regularizar su situación.');
      return null;
    }
    // trabajadorEnAlcance mira solo la empresa que se esta viendo, y
    // trabajadorEnCualquierEmpresa mira todas. La diferencia importa: si el
    // trabajador es de otra empresa, decir "no esta en la lista" hace que
    // el supervisor pida de mas.
    const w=trabajadorEnAlcance(card.code)||trabajadorEnCualquierEmpresa(card.code);
    if(!w){
      alert('La tarjeta pertenece al codigo '+card.code+', que no esta en la lista de trabajadores.'
        +(opciones.sinAvisoEnFallo?'':'\n\nPuede ser que el codigo este mal escrito en la tarjeta,'
          +' o que el trabajador se haya dado de baja. Revisalo en Administracion.'));
      return null;
    }
    if(w.status==='desvinculado'&&!opciones.permitirDesvinculado){
      alert('⛔ TRABAJADOR DESVINCULADO\n'+w.name+' ya no está activo en la empresa, por lo que su tarjeta no habilita el marcaje.'+
        '\n\nDebe pasar por Administración.');
      return null;
    }
    return w;
  }
  // No es una tarjeta emitida: se acepta el código del trabajador, pero
  // informed, porque el control de tarjeta es justamente lo que importa.
  // Con normalizarCodigo, y mirando tambien las otras empresas. Un
  // supervisor que tiene varias podria escanear la tarjeta de alguien de
  // la otra y recibir un "no encontrado" en vez de un "es de otra".
  const w=trabajadorEnAlcance(leido)||trabajadorEnCualquierEmpresa(leido);
  if(!w){
    if(!opciones.sinAvisoEnFallo)avisoCodigoNoEncontrado(leido);
    return null;
  }
  if(w.status==='desvinculado'&&!opciones.permitirDesvinculado){
    alert('⛔ TRABAJADOR DESVINCULADO\n'+w.name+' ya no está activo en la empresa.'+'\n\nDebe pasar por Administración.');
    return null;
  }
  if(!opciones.sinAviso){
    alert('Se leyó el código del trabajador ('+w.code+'), no el de una tarjeta.'+
      '\n\nLa tarjeta permite comprobar que no esté bloqueada ni anulada. Pasa la tarjeta.');
  }
  return w;
}

// resolverCodigoTrabajador no puede preguntar en la base porque no es
function avisoCodigoNoEncontrado(leido){
  const id=String(leido).trim();
  const cantidad=tarjetas.length;
  let texto;
  if(!cantidad){
    texto='No se encontro nada con el codigo '+id+'.\n\n'
      +'Ademas, la lista de tarjetas de este equipo esta VACIA: la pantalla no '
      +'cargo ninguna. Eso casi nunca es culpa de la tarjeta.\n'
      +'Recarga esta pantalla y pasa la tarjeta de nuevo.';
  }else{
    texto='La tarjeta con el codigo '+id+' no esta en la lista.\n\n'
      +'Esta pantalla tiene '+cantidad+' tarjeta(s) cargadas, y ninguna con ese codigo.\n'
      +'Lo mas probable es que la tarjeta se haya emitido despues de abrir esta '
      +'pantalla: recarga y pasa la tarjeta de nuevo.\n'
      +'Si sigue igual, la tarjeta no esta emitida.';
  }
  texto+='\n\nSi es un codigo escrito a mano, revisa que no le falte un digito. '
    +'Si es de verdad una tarjeta nueva, pedile a Administracion que la emita.';
  alert(texto);
}

async function resolverCodigoTrabajadorCompleto(scanned,opciones){
  opciones=opciones||{};
  const directo=resolverCodigoTrabajador(scanned,Object.assign({},opciones,{sinAvisoEnFallo:true}));
  if(directo)return directo;
  const leido=String(scanned||'').trim();
  if(!leido)return null;
  const card=await tarjetaRegistrada(leido);
  if(!card){
    if(!opciones.sinAvisoEnFallo)avisoCodigoNoEncontrado(leido);
    return null;
  }
  // Ahora la tarjeta si se conoce: se reaplican los mismos filtros del
  // camino rapido, con el id de la tarjeta y no con el codigo.
  return resolverCodigoTrabajador(card.id,opciones);
}
function selectEppWorkerByScan(scanned){
  const w=resolverCodigoTrabajador(scanned);
  if(!w)return;
  const sel=document.getElementById('epp-worker');
  sel.value=w.code;
  updateEppWorkerHint();
  if(navigator.vibrate){try{navigator.vibrate(120);}catch(error){}}
  if(typeof showView==='function')showView('bodega-epp');
  const hint=document.getElementById('eppWorkerHint');
  if(hint)hint.innerHTML=`<small style="color:var(--accent)">✓ ${w.name} — agrega los elementos y pide la firma.</small>`;
}
// En la entrega de kit el QR elige al trabajador y propone su especialidad.
// (la implementación vive en el módulo de kits: seleccionarKitWorkerByScan)
function selectKitWorkerByScan(scanned){
  seleccionarKitWorkerByScan(scanned);
}
// En el historial el QR solo filtra por trabajador.
async function filtrarHistorialPorScan(scanned){
  // Tambien async, asi que tambien puede esperar a la base.
  const w=await resolverCodigoTrabajadorCompleto(scanned);
  if(!w)return;
  limpiarFiltrosEpp();
  if(typeof showView==='function')showView('bodega-historial');
  const filtro=document.getElementById('epp-filter');
  if(filtro)filtro.value=w.code;
  // Se abre la fila de una vez: si escaneó la tarjeta es para ver las
  // entregas de esa persona, no solo su nombre en un filtro.
  eppFilaAbierta=w.code;
  await loadEppDeliveries();
  if(navigator.vibrate){try{navigator.vibrate(120);}catch(error){}}
  const total=entregasFiltradasDe(w.code).length;
  const cont=document.getElementById('eppHistory');
  if(!cont)return;
  let aviso=document.getElementById('eppHistScan');
  if(!aviso){
    aviso=document.createElement('div');
    aviso.id='eppHistScan';
    aviso.className='eppVacio';
    aviso.style.textAlign='left';
    cont.parentNode.insertBefore(aviso,cont);
  }
  aviso.textContent=total
    ?`Mostrando a ${w.name} (${w.code}): ${total} entrega(s).`
    :`${w.name} (${w.code}) no tiene entregas de EPP registradas.`;
  aviso.style.color=total?'var(--accent)':'var(--muted)';
}
// Monta (una sola vez) la ventana del lector en vivo.
function camModal(){
  let modal=document.getElementById('camModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='camModal';
  modal.innerHTML=`<div class="camModalBox" role="dialog" aria-modal="true" aria-label="Escanear código de tarjeta">
    <h3>Escanear código</h3>
    <small>Encuadra el QR o el código de barras de la tarjeta dentro del marco. La búsqueda se hace sola al detectarlo.</small>
    <div class="camStage">
      <div id="camScanArea"></div>
      <div class="camReticle"></div>
    </div>
    <div class="camStatus" id="camStatus" role="status" aria-live="polite"></div>
    <div id="camConfirmar" style="display:none"></div>
    <div class="camActions">
      <button class="btn secondary" type="button" id="camStopBtn">Cerrar</button>
      <label class="camUpload">📁 Subir foto
        <input type="file" id="camShotInput" accept="image/*" capture="environment" style="display:none">
      </label>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',event=>{if(event.target===modal)stopLiveScan();});
  modal.querySelector('#camStopBtn').addEventListener('click',()=>stopLiveScan());
  modal.querySelector('#camShotInput').addEventListener('change',event=>{
    const file=event.target.files&&event.target.files[0];
    stopLiveScan();
    if(file)scanQrImage(file,modal.dataset.purpose||'porteria');
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&modal.classList.contains('open'))stopLiveScan();
  });
  return modal;
}
// El retículo vive FUERA de #camScanArea porque la librería vacía ese elemento al iniciar la cámara.
function camScanArea(){
  const area=document.getElementById('camScanArea');
  if(!area)return null;
  area.innerHTML='';
  return area;
}
function camStatus(text,isError){
  const status=document.getElementById('camStatus');
  if(!status)return;
  status.textContent='';
  const line=document.createElement('div');
  if(isError)line.className='err';
  line.textContent=text;
  status.appendChild(line);
}
function mostrarResultadoEnCamara(text,purpose,detalle){
  const panel=document.getElementById('camConfirmar');
  if(!panel)return;
  if(panel.innerHTML.trim())return;
  const consulta=purpose==='porteria'&&document.getElementById('scanResult');
  const cuerpo=detalle||(consulta&&consulta.innerHTML)||
    '<p>Se leyó el código <b>'+escHtml(text)+'</b>. El resultado se aplicó al campo correspondiente de esta pantalla.</p>';
  panel.style.display='';
  panel.innerHTML='<div class="camResultado">'+cuerpo+'</div>'+
    '<button class="btn secondary" type="button" id="camRescanBtn">Escanear otra tarjeta</button>';
  panel.querySelector('#camRescanBtn').addEventListener('click',()=>openQrCamera(purpose));
}
function chooseRearCamera(cameras){
  const rear=/back|rear|trasera|trase|environment/i;
  return cameras.find(c=>rear.test(c.label||''))||cameras[0];
}
// Antes, el lector tomaba el PRIMER código que lograba decodificar en
const LECTURAS_PARA_CONFIRMAR=5;
let lecturaEstable={texto:'',veces:0};
function reiniciarLecturaEstable(){
  lecturaEstable={texto:'',veces:0};
  const barra=document.getElementById('camConfirmar');
  if(barra)barra.style.display='none';
}
function onLiveScanSuccess(decodedText){
  if(liveScanLock)return;
  const text=String(decodedText||'').trim();
  if(!text)return;

  // El mismo código, un fotograma más.
  if(text===lecturaEstable.texto){
    lecturaEstable.veces++;
  }else{
    lecturaEstable={texto:text,veces:1};
    camStatus('Código detectado, comprobando…');
    return;
  }
  if(lecturaEstable.veces<LECTURAS_PARA_CONFIRMAR){
    camStatus('Código detectado, comprobando… ('+lecturaEstable.veces+'/'+LECTURAS_PARA_CONFIRMAR+')');
    return;
  }
  if(lecturaEstable.veces===LECTURAS_PARA_CONFIRMAR&&navigator.vibrate){
    try{navigator.vibrate(120);}catch(error){}
  }

  const purpose=qrScanPurpose;
  // Marcar asistencia es lo único que no tiene vuelta atrás: se pide
  // confirmar a quién se le está marcando. Consultar una ficha no lo
  // necesita, porque ver el dato de otra persona no cambia nada.
  if(purpose==='sup-diaria'){
    pedirConfirmacionMarcaje(text,purpose);
    return;
  }
  liveScanLock=true;
  camStatus('✓ Código detectado: '+text+' — buscando…');
  setTimeout(async()=>{
    await pararCamaraDejandoModal();
    try{
      await handleScannedCode(text,purpose);
      mostrarResultadoEnCamara(text,purpose);
    }catch(error){
      mostrarResultadoEnCamara(text,purpose,'<p class="gpsWarn">No se pudo procesar el código: '+escHtml(error&&error.message||error)+'</p>');
    }
  },350);
}

// Muestra a quién se encontró y pide un OK antes de registrar. Un marcaje
// equivocado obliga a corregir la asistencia después; un clic de más no.
async function pedirConfirmacionMarcaje(text,purpose){
  const panel=document.getElementById('camConfirmar');
  if(!panel)return;
  await pararCamaraDejandoModal();
  const w=buscarTrabajadorPorCodigo(text);
  if(!w){
    await handleScannedCode(text,purpose);
    mostrarResultadoEnCamara(text,purpose);
    return;
  }
  liveScanLock=true;
  const entrada=marcajeDe(w.code,'entrada');
  const salida=marcajeDe(w.code,'salida');
  const yaCompleto=entrada&&salida;
  const accion=yaCompleto?'Ya tiene entrada y salida':(entrada?'Registrar SALIDA':'Registrar ENTRADA');
  const foto=w.casual?`<img src="${escHtml(w.casual)}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">`:'';
  panel.style.display='';
  panel.innerHTML=`<div style="border:2px solid var(--accent);border-radius:10px;padding:12px;background:var(--panel);margin-top:10px">
    <div style="display:flex;gap:12px;align-items:center">
      ${foto}
      <div style="flex:1">
        <div style="font-size:1rem;font-weight:700">${escHtml(w.name)}</div>
        <div><small>${escHtml(codigoMostrar(w.code))} · ${escHtml(w.spec||'Sin cargo')}</small></div>
        ${yaCompleto?`<div><small class="eppBadge firmado">Marcaje completo</small></div>`
          :`<div><small>${entrada?'Entrada: '+escHtml(entrada.hora):'Todavía no marca entrada'}</small></div>`}
      </div>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn" type="button" id="camOk">${accion}</button>
      <button class="btn secondary" type="button" id="camNo">No es esta persona</button>
    </div>
    <small style="display:block;color:var(--muted);margin-top:6px">Se escaneó la tarjeta <b>${escHtml(text)}</b>. Revisa el nombre antes de confirmar.</small>
  </div>`;
  document.getElementById('camOk').addEventListener('click',async()=>{
    // Y POR QUÉ NO SE BORRA EL PANEL ANTES DE REGISTRAR
    //
    // Antes se vaciaba y después se registraba. Si el registro fallaba, el panel ya
    // estaba en blanco y el error se perdía: la pantalla quedaba con un cuadro
    // vacío y sin una palabra, y el marcaje no estaba. Ahora el panel se borra solo
    // si el registro salió bien.
    const boton=document.getElementById('camOk');
    const otro=document.getElementById('camNo');
    if(boton){boton.disabled=true;boton.textContent='Registrando…';}
    if(otro)otro.disabled=true;
    try{
      await handleScannedCode(text,purpose);
      // Y SI SALIÓ BIEN, EL CUADRO SE VAYA
      //
      // Es lo que se pidió: al terminar de marcar, el lector se cierra y el turno
      // sigue. La persona ya vio el nombre antes de apretar, así que no se pierde
      // el control: se pierde la pantalla que queda tapando la lista de asistencia
      // mientras llega la fila siguiente.
      stopLiveScan();
    }catch(error){
      const mensaje=(error&&error.message)||error;
      panel.style.display='';
      panel.innerHTML='<div class="camResultado"><p class="gpsWarn">No se pudo registrar: '
        +escHtml(mensaje)+'</p>'
        +'<button class="btn secondary" type="button" id="camReintentar">Intentar de nuevo</button>'
        +'</div>';
      if(boton){boton.disabled=false;boton.textContent=accion;}
      if(otro)otro.disabled=false;
      const reintentar=document.getElementById('camReintentar');
      if(reintentar)reintentar.addEventListener('click',()=>{
        panel.innerHTML='';
        panel.style.display='none';
        openQrCamera(purpose);
      });
    }
  });
  document.getElementById('camNo').addEventListener('click',()=>{
    openQrCamera(purpose);
  });
  if(navigator.vibrate){try{navigator.vibrate([40,60,40]);}catch(error){}}
}

// Lo que llega del lector hay que compararlo por una forma única.
//
// El lector USB se comporta como teclado: manda el texto y un retorno de
// carro. Según el modelo el ID sale en mayúsculas o en minúsculas, y
// algunos meten espacios. Comparar con "===" sobre el texto crudo hacía que
// la misma tarjeta se encontrara desde la cámara y no desde el lector, sin
// que hubiera ninguna razón visible para eso.
function normalizarCodigo(txt){
  return String(txt==null?'':txt)
    .replace(/[\s\u0000-\u001f]+/g,'')
    .toUpperCase();
}

// "7" y "0021" ordenan distinto: como texto, 12 va antes que 7, y en una
const CODIGO_DIGITOS=4;
function esCodigoNumerico(code){
  const s=String(code==null?'':code).trim();
  return s!==''&&/^\d+$/.test(s);
}
// Buscar un trabajador por un código escrito con otro relleno.
function trabajadorPorCodigoTolerante(texto,lista){
  const t=normalizarCodigo(texto);
  if(!t)return null;
  const base=(lista&&lista.length?lista:workers);
  if(esCodigoNumerico(t)){
    const n=Number(t);
    const hit=base.find(w=>esCodigoNumerico(w.code)&&Number(w.code)===n);
    if(hit)return hit;
  }
  return base.find(w=>normalizarCodigo(w.code)===t)||null;
}
function codigoMostrar(code){
  const s=String(code==null?'':code).trim();
  if(!esCodigoNumerico(s))return s;
  return s.padStart(CODIGO_DIGITOS,'0');
}
// Rellenar con ceros puede hacer que dos fichas DISTINTAS se vean iguales:
// el código "1" y el "001" los dos a 4 dígitos dan "0001". En un desplegable
// donde se elige a quién asignarle el turno, dos etiquetas iguales son peor
// que no tener código: no se sabe a cuál se está eligiendo.
//
// Se calculan los dígitos necesarios para que no haya choque dentro de la
// lista que se está mostrando, y solo los que chocan se ven sin rellenar.
// Los que no chocan siguen con 4 dígitos, que es lo que se pidió.
function codigosVisibles(lista){
  const out=new Map();
  const conteo=new Map();
  (lista||[]).forEach(w=>{
    const v=codigoMostrar(w.code);
    conteo.set(v,(conteo.get(v)||0)+1);
  });
  (lista||[]).forEach(w=>{
    const v=codigoMostrar(w.code);
    out.set(w.code,conteo.get(v)>1?String(w.code).trim():v);
  });
  return out;
}
// Ordena por código como número cuando los dos son numéricos, y como texto
// en cualquier otro caso. Comparar "7" con "0021" como texto los pone en el
// orden equivocado, que es justo lo que se vino a arreglar.
function compararPorCodigo(a,b){
  const ca=a==null?'':String(a).trim();
  const cb=b==null?'':String(b).trim();
  if(esCodigoNumerico(ca)&&esCodigoNumerico(cb)){
    const na=Number(ca), nb=Number(cb);
    if(na!==nb)return na-nb;
    // Mismo número con distinta cantidad de ceros: van juntos, y después
    // por el texto para que el orden sea estable.
    return ca.length-cb.length||ca.localeCompare(cb);
  }
  return ca.localeCompare(cb);
}
// Para las opciones <select> del código y el nombre: el código se muestra
// con 4 dígitos pero el value sigue siendo el código real, porque es lo que
// se usa para buscar en la base.
function opcionTrabajador(w){
  return '<option value="'+escHtml(w.code)+'">'+escHtml(codigoMostrar(w.code))+' — '+escHtml(w.name)+'</option>';
}
function opcionesTrabajadores(lista){
  return (lista||workers).map(opcionTrabajador).join('');
}

// La lista de tarjetas en memoria es una CACHÉ, no la fuente.
//
// Antes la búsqueda solo miraba ese arreglo, así que una tarjeta que sí
// estaba en la base pero no había cargado — porque la carga falló, porque
// una política la filtró, o porque se emitió con la pantalla ya abierta —
// salía como "Código no encontrado", que no dice ni qué pasó ni qué hacer.
//
// Ahora: primero la caché (rápido), y si no está, se pregunta a la base.
// La base manda.
let tarjetasAvisoCarga='';   // por qué quedó la lista vacía, si fue el caso
async function tarjetaRegistrada(leido){
  const clave=normalizarCodigo(leido);
  if(!clave)return null;
  const enMemoria=tarjetas.find(t=>normalizarCodigo(t.id)===clave);
  if(enMemoria)return enMemoria;

  // Consulta exacta primero. Se usa el arreglo (no .maybeSingle) a
  // propósito: maybeSingle devuelve un ERROR cuando no hay filas, y
  // "no existe esta tarjeta" no es un error, es la respuesta.
  const bruto=String(leido).trim();
  let r=await window.supabaseClient.from('tarjetas').select('*').eq('id',bruto).limit(1);
  if(!r.error&&r.data&&r.data.length)return guardarTarjetaEnCache(r.data[0]);

  // El ID en la base puede diferir del que manda el lector solo en la caja.
  // Un ID de tarjeta no lleva % ni _, así que ilike es seguro aquí.
  r=await window.supabaseClient.from('tarjetas').select('*').ilike('id',clave).limit(1);
  if(!r.error&&r.data&&r.data.length)return guardarTarjetaEnCache(r.data[0]);
  return null;
}
// Lo que se encuentra en la base se guarda en la caché, para que el
// siguiente escaneo de la misma tarjeta no vuelva a viajar.
function guardarTarjetaEnCache(card){
  tarjetas.push(card);
  return card;
}
// Un trabajador puede estar en "todosWorkers" y no en "workers" cuando
// pertenece a otra empresa. Preguntar solo por "workers" convertía un
// "es de otra empresa" en un "no existe", que son cosas muy distintas.
function trabajadorEnAlcance(code){
  return workers.find(x=>normalizarCodigo(x.code)===normalizarCodigo(code))||null;
}
function trabajadorEnCualquierEmpresa(code){
  return todosWorkers.find(x=>normalizarCodigo(x.code)===normalizarCodigo(code))||null;
}
// Búsqueda por nombre, para cuando no se tiene ni la tarjeta ni el código.
// Se busca sobre el nombre ya sin tildes ni mayúsculas, porque nadie
// escribe "Verdugo" y espera que el sistema lo entienda como "verdugo".
function sinTildes(txt){
  return String(txt==null?'':txt)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function trabajadorPorNombre(texto, alcance){
  const clave=sinTildes(texto).trim();
  if(!clave)return null;
  const lista=(alcance==='todos')?todosWorkers:workers;
  // Primero que empiece con lo tecleado, después que lo contenga: buscar
  // "san" debe elegir a "Sánchez" sobre "Constanza".
  const contiene=lista.filter(w=>sinTildes(w.name).includes(clave));
  if(!contiene.length)return null;
  const empieza=contiene.filter(w=>sinTildes(w.name).startsWith(clave));
  return (empieza[0]||contiene[0]);
}

// Variante SINCRÓNICA, para los caminos que no pueden esperar un viaje a la
// base: confirmar un escaneo con la cámara. Solo mira la caché; si no está,
// no encuentra, y el llamador avisa y sigue. Para la búsqueda de portería se
// usa resolverConsulta(), que sí consulta la base.
function buscarTrabajadorPorCodigo(text){
  const clave=normalizarCodigo(text);
  if(!clave)return null;
  const card=tarjetas.find(t=>normalizarCodigo(t.id)===clave);
  if(card){
    if(card.estado!=='activa')return null;
    return trabajadorEnAlcance(card.code);
  }
  return trabajadorPorNombre(text)||trabajadorEnAlcance(text);
}
async function openQrCamera(purpose='porteria'){
  qrScanPurpose=purpose;
  if(!qrFormatsAvailable()){
    alert('No se pudo cargar el lector de cámara. Revisa tu conexión e inténtalo de nuevo.');
    return;
  }
  const modal=camModal();
  if(liveScanner)await pararCamaraDejandoModal();
  liveScanLock=false;
  modal.dataset.purpose=purpose;
  modal.classList.add('open');
  reiniciarLecturaEstable();
  const panel=document.getElementById('camConfirmar');
  if(panel){panel.innerHTML='';panel.style.display='none';}
  camScanArea();
  document.getElementById('camShotInput').value='';
  camStatus('Encendiendo cámara…');
  let cameras;
  try{
    cameras=await Html5Qrcode.getCameras();
  }catch(error){
    camStatus('No se pudo acceder a la cámara. Revisa el permiso del navegador o usa "Subir foto".',true);
    return;
  }
  if(!cameras||!cameras.length){
    camStatus('No se encontró ninguna cámara en este dispositivo. Usa "Subir foto".',true);
    return;
  }
  const camera=chooseRearCamera(cameras);
  camStatus('Apunta al código de la tarjeta…');
  const scanner=new Html5Qrcode('camScanArea',{verbose:false,formatsToSupport:qrSupportedFormats()});
  liveScanner=scanner;
  try{
    await scanner.start(
      camera.id,
      {
        fps:15,
        // fotograma completo: la librería aplica getShadedRegionBounds y un recorte
        // (p.ej. 72%) cortaba las esquinas del código y hacia imposible decodificarlo
        qrbox:(viewW,viewH)=>({width:viewW,height:viewH})
      },
      onLiveScanSuccess,
      ()=>{} // se decodifica en casi cada frame: ignoramos para no llenar la consola de errores
    );
  }catch(error){
    liveScanner=null;
    camStatus('No se pudo iniciar la cámara: '+(error&&error.message||error),true);
  }
}
async function pararCamaraDejandoModal(){
  const scanner=liveScanner;
  liveScanner=null;
  liveScanLock=true;
  if(!scanner)return;
  try{if(scanner.isScanning)await scanner.stop();}catch(error){}
  try{scanner.clear();}catch(error){}
}
function stopLiveScan(){
  const scanner=liveScanner;
  liveScanner=null;
  liveScanLock=false;
  reiniciarLecturaEstable();
  const panel=document.getElementById('camConfirmar');
  if(panel){panel.style.display='none';panel.innerHTML='';}
  const modal=document.getElementById('camModal');
  if(modal){
    modal.classList.remove('open');
    const input=document.getElementById('camShotInput');
    if(input)input.value='';
  }
  if(scanner)Promise.resolve()
    .then(()=>scanner.isScanning?scanner.stop():null)
    .catch(()=>{})
    .then(()=>{try{scanner.clear();}catch(error){}})
    .catch(()=>{});
}
async function scanQrImage(file,purpose='porteria'){
  if(!file)return;
  if(!qrFormatsAvailable()){
    alert('No se pudo cargar el lector. Revisa tu conexión e inténtalo de nuevo.');
    return;
  }
  const modal=camModal();
  modal.dataset.purpose=purpose;
  modal.classList.add('open');
  const area=camScanArea();
  area.innerHTML='<div id="qrImageScanArea"></div>';
  camStatus('Analizando imagen…');
  let scanner=null;
  try{
    scanner=new Html5Qrcode('qrImageScanArea',{verbose:false,formatsToSupport:qrSupportedFormats()});
    const code=await scanner.scanFile(file,false);
    if(scanner){try{scanner.clear();}catch(error){}}
    await handleScannedCode(code,purpose);
    mostrarResultadoEnCamara(code,purpose);
  }catch(error){
    if(scanner){try{scanner.clear();}catch(error){}}
    liveScanner=null;
    liveScanLock=false;
    // la ventana se mantiene abierta para que el usuario pueda reintentar con otra foto
    camStatus('No se detectó un código en la imagen. Intenta otra foto con el código enfocado o vuelve a la cámara.',true);
  }finally{
    const input=document.getElementById('camShotInput');
    if(input)input.value='';
  }
}

// Resuelve lo escaneado para CONSULTAR (no marca nada). A diferencia de
// resolverCodigoTrabajador, que marca, aquí no interesa bloquear: lo que
// importa es devolver el motivo exacto por el que no se encontró, para que
// quien está en portería sepa si es una tarjeta sin registrar, una anulada
// o un trabajador de otra empresa. Antes todo eso era el mismo texto.
async function resolverConsulta(leido){
  const clave=normalizarCodigo(leido);
  if(!clave)return {error:'Vacio'};

  // 1) ¿Es el ID de una tarjeta emitida?
  const card=await tarjetaRegistrada(leido);
  if(card){
    if(card.estado==='anulada')return {tarjeta:card,error:'Anulada',motivo:card.motivo_anulacion||'fue reemplazada por una más reciente'};
    if(card.estado==='bloqueada')return {tarjeta:card,error:'Bloqueada',motivo:card.motivo_bloqueo||''};
    const w=trabajadorEnAlcance(card.code);
    if(w)return {trabajador:w,tarjeta:card};
    // La tarjeta existe pero su código no está en el alcance actual. Puede
    // ser de otra empresa, o un dato roto. Decir cuál.
    const fuera=trabajadorEnCualquierEmpresa(card.code);
    if(fuera)return {tarjeta:card,error:'OtraEmpresa',nombre:fuera.name,code:fuera.code};
    return {tarjeta:card,error:'SinTrabajador',code:card.code};
  }

  // 2) No es una tarjeta: se acepta el código del trabajador, tecleado a mano.
  const w=trabajadorPorNombre(leido)||trabajadorEnAlcance(leido);
  if(w)return {trabajador:w,aviso:'No es una tarjeta, es el código o nombre escrito a mano'};
  const porNombre=trabajadorPorNombre(leido);
  if(porNombre)return {trabajador:porNombre,aviso:'No es una tarjeta, es el código o nombre escrito a mano'};

  // 3) Tampoco. Se reporta el ID limpio y el motivo probable, no un "no".
  return {error:'NoEncontrado',id:String(leido).trim(),listaVacia:!tarjetas.length};
}
async function doScan(){
  const scanned=document.getElementById('scanCode').value.trim();
  const res=document.getElementById('scanResult');
  if(!scanned){res.innerHTML='<p style="color:var(--danger)">Escaneá una tarjeta o escribí un código.</p>';return;}

  const r=await resolverConsulta(scanned);
  if(r.error){
    let html='';
    if(r.error==='Anulada'){
      html=`<p style="background:var(--danger-solid);color:#fff;padding:10px;border-radius:6px;font-size:1.05rem"><b>⚠️ TARJETA ANULADA</b><br>Esta tarjeta ya no es válida (${r.motivo}). Solicita la tarjeta vigente antes de dar acceso.</p>`;
    }else if(r.error==='Bloqueada'){
      html=`<p style="background:var(--danger-solid);color:#fff;padding:10px;border-radius:6px;font-size:1.05rem"><b>⛔ TARJETA BLOQUEADA</b><br>Esta tarjeta no sirve para pasar asistencia.${r.motivo?('<br>Motivo: '+r.motivo):''}<br>Debe pasar por Administración para regularizar su situación.</p>`;
    }else if(r.error==='OtraEmpresa'){
      html=`<p style="background:var(--accent);color:#1c1206;padding:10px;border-radius:6px"><b>La tarjeta es de ${escHtml(r.nombre)} (código ${escHtml(r.code)}), que pertenece a otra empresa.</b><br>No se puede consultar desde esta empresa. Cambia de empresa en Soporte, o pídele a Administración que lo revise.</p>`;
    }else if(r.error==='SinTrabajador'){
      html=`<p style="background:var(--danger-solid);color:#fff;padding:10px;border-radius:6px"><b>La tarjeta apunta al código ${escHtml(r.code)}, que no está en la lista de trabajadores.</b><br>Datos inconsistentes: Administración tiene que emitir la tarjeta de nuevo.</p>`;
    }else if(r.error==='Vacio'){
      html='<p style="color:var(--danger)">Escaneá una tarjeta o escribí un código.</p>';
    }else{
      // El caso que el usuario está viendo: un ID que no está en ninguna
      // tarjeta. Se dice el ID exacto y por dónde se arregla, en vez de un
      // "no encontrado" que deja a portería sin saber qué hacer.
      html=`<p style="color:var(--danger)"><b>No hay ninguna tarjeta registrada con el ID "${escHtml(r.id)}".</b></p>`
        +`<p><small>Eso no significa que la persona no exista. Puede ser:</small></p>`
        +`<ul style="font-size:.9rem">`
        +(r.listaVacia?'<li>La lista de tarjetas no cargó al entrar a la app. Recargá la página con <b>Ctrl+F5</b>.</li>':'')
        +`<li>La tarjeta se imprimió antes de que existiera el registro de tarjetas: hay que <b>emitirla de nuevo</b> en Administración → Imprimir tarjetas.</li>`
        +`<li>El lector manda el ID con un formato distinto al impreso: probá la cámara.</li>`
        +`<li>No es una tarjeta: entonces puede ser el <b>código del trabajador</b> (por ejemplo 021) o su <b>nombre</b>, y también se buscan aquí.</li>`
        +`</ul>`
        +`<p><small>Si la persona es <code>${escHtml(r.id)}</code> y su tarjeta debería existir, Administración lo ve en Soporte → Diagnóstico.</small></p>`;
    }
    res.innerHTML=`<div class="card" style="border-color:var(--danger)">${html}</div>`;
    document.getElementById('scanCode').value='';
    return;
  }
  if(r.aviso){
    res.innerHTML=`<div class="card" style="border-color:var(--accent)"><p style="background:var(--accent);color:#1c1206;padding:10px;border-radius:6px"><b>⚠️ ${escHtml(r.aviso)}</b><br>La tarjeta permite comprobar que no esté anulada ni bloqueada. Pasa la tarjeta.</p></div>`;
  }
  const w=r.trabajador;
  const code=w.code;
  const card=r.tarjeta;
  const hoy=hoyLocal();
  const hoyRec=attendance.find(a=>a.code===code&&a.date===hoy);
  const nombresEstado={X:'Presente',F:'Falla',P:'Permiso',L:'Licencia',A:'Accidente Mutual',PP:'Permiso Pagado',V:'Vacaciones',LL:'Día lluvia'};
  let bannerHoy='';
  if(w.status==='desvinculado'){
    bannerHoy+=`<p style="background:var(--danger-solid);color:#fff;padding:6px 10px;border-radius:6px"><b>⚠️ Trabajador desvinculado</b> (${w.fecha_desvinculacion||''})</p>`;
  }else if(hoyRec && hoyRec.estado!=='X'){
    bannerHoy+=`<p style="background:var(--accent);color:#1c1206;padding:6px 10px;border-radius:6px"><b>Hoy tiene ${nombresEstado[hoyRec.estado]||hoyRec.estado}</b>${hoyRec.nota?(': '+hoyRec.nota):''} — no debería venir a marcar.</p>`;
  }else{
    bannerHoy+=`<p style="background:var(--accent2);color:#fff;padding:6px 10px;border-radius:6px">Sin permiso/licencia registrado para hoy — viene a marcar normalmente.</p>`;
  }
  if(w.alerta_social) bannerHoy+=`<p style="background:#7a3fa0;color:#fff;padding:6px 10px;border-radius:6px"><b>🗣️ Asistente social quiere hablar con él/ella</b>${w.alerta_social_nota?(': '+w.alerta_social_nota):''}</p>`;
  if(w.alerta_prevencion) bannerHoy+=`<p style="background:#c0392b;color:#fff;padding:6px 10px;border-radius:6px"><b>🦺 Prevencionista quiere hablar con él/ella</b>${w.alerta_prevencion_nota?(': '+w.alerta_prevencion_nota):''}</p>`;
  const recs=attendance.filter(a=>a.code===code).sort((a,b)=>a.date<b.date?1:-1).slice(0,10);
  res.innerHTML=`
    <div class="card">
      <div class="photoRow"><img src="${w.safety||w.casual||''}" style="width:90px;height:90px;object-fit:cover;border-radius:6px"><div><h3>${w.name}</h3><small>${w.spec||''} — Código ${w.code}</small></div></div>
      ${bannerHoy}
      <p><b>Emergencia:</b> ${w.emerg_name||'—'} (${w.emerg_rel||'—'}) — ${w.emerg_phone||'—'}</p>
      <p><b>Prevención:</b> ${w.salud||'—'} ${w.medicamentos?(' | Medicamentos: '+w.medicamentos):''} ${w.precauciones?(' | Precauciones: '+w.precauciones):''}</p>
      <h3>Últimos registros</h3>
      <table><tr><th>Fecha</th><th>Estado</th><th>Hora llegada</th><th>Nota</th></tr>
      ${recs.map(r=>`<tr><td>${r.date}</td><td>${nombresEstado[r.estado]||r.estado||'-'}</td><td>${r.hora_llegada||'-'}</td><td>${r.nota||'-'}</td></tr>`).join('')||'<tr><td colspan="4">Sin registros</td></tr>'}
      </table>
    </div>`;
  document.getElementById('scanCode').value='';
}
