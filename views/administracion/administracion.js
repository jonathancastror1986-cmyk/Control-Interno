/* ===================================================================
   js/administracion.js - ADMINISTRACI
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
   - ASISTENCIA DIARIA DEL SUPERVISOR
   - TARJA DE SUPERVISORES
   - MULTI-EMPRESA

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
let marcajes=[];        // marcajes del día que se está viendo
let avisosMarcaje=[];   // alertas generadas

// La conciliación necesita DOS registros del mismo día:
//   · "asistenciaDia" es la planilla (quién está presente y desde qué hora)
//   · "marcajes" ya lo tinha: lo que registró el reloj
// Se guardan aparte porque se consultan de tablas distintas y la pantalla
// diaria tiene que pintar igual si alguna falla.
let asistenciaDia=[];
let asistenciaDiaError=null;
let avisosIngresoDia=[];
let avisosIngresoError=null;
let fechaDiaria=hoyLocal();
// Se declara AQUÍ y no más abajo, junto a recalcularMiSupervisor. La leen
// empresaDeEquipo() y horaEntradaDe(), que se pueden llamar antes de que
// la línea de abajo se haya ejecutado: con "let" eso es una ReferenceError
// ("Cannot access before initialization"), no un undefined silencioso.
// Pasó al llamar a horaEntradaDe('') desde la vista de justificación
// diaria, y el error apuntaba a una línea 500 más abajo, muy lejos de la
// causa.
let miCodigoSupervisor='';      // código del trabajador supervisor que eres

function empresaDeEquipo(supCode){
  // Un codigo vacio NO es un supervisor: significaria 'sin jefe', y buscar
  // un trabajador con code === '' podria dar cualquier cosa. Se trata
  // explicitamente en vez de dejarlo pasar al find().
  const buscar=supCode||miCodigoSupervisor;
  if(!buscar)return empresas[0];
  const jefe=workers.find(w=>w.code===buscar);
  return jefe?(empresas.find(e=>mismoId(e.id,jefe.empresa_id))||empresas[0]):empresas[0];
}
function horaEntradaDe(supCode){
  const emp=empresaDeEquipo(supCode);
  return (emp&&emp.hora_entrada)||'08:00';
}
function toleranciaDe(supCode){
  const emp=empresaDeEquipo(supCode);
  return (emp&&emp.tolerancia_minutos!=null)?Number(emp.tolerancia_minutos):10;
}
// "1 h 20 min", "20 min", o "" si no hay nada. Se usaba escrito al revés
// en dos lugares distintos y en cada uno distinto; el de la conciliación
// mostraba "llegó 480", que son minutos desde medianoche y no dicen nada
// para quien lo lee.
function textoDuracion(minutos){
  const n=Number(minutos);
  if(!isFinite(n)||n<=0)return '';
  const h=Math.floor(n/60), m=n%60;
  return [h?(h+' h'):'', m?(m+' min'):''].filter(Boolean).join(' ');
}
function hhmmActual(){
  const d=new Date();
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function minutosDe(hhmm){
  const p=String(hhmm||'').split(':');
  if(p.length<2)return null;
  const h=parseInt(p[0],10), m=parseInt(p[1],10);
  if(isNaN(h)||isNaN(m))return null;
  return h*60+m;
}

// Se cargan los marcajes de hoy Y de los últimos días: hace falta el
// historial para detectar los días que quedaron con entrada pero sin
// salida (el reloj abierto), que son los que hay que mandar a RRHH.
//
// Además se carga SIEMPRE el día que se está mirando, aunque caiga
// fuera de esa ventana: el reporte del reloj puede ser de hace meses
// (por ejemplo, una obra que se está regularizando) y al supervisory
// le tiene que salir vacío, no en blanco.
const DIAS_HISTORIA_MARCAJES=60;
async function loadMarcajesDia(){
  const desde=(()=>{
    const d=new Date();
    d.setDate(d.getDate()-DIAS_HISTORIA_MARCAJES);
    return isoLocal(d);
  })();
  const fueraDeVentana=fechaDiaria&&fechaDiaria<desde;
  const {data,error}=await window.supabaseClient.from('marcajes')
    .select('*')
    // "o" de PostgREST: los últimos 60 días O el día que se está mirando.
    .or(fueraDeVentana?('fecha.gte.'+desde+',fecha.eq.'+fechaDiaria):('fecha.gte.'+desde))
    .order('fecha',{ascending:false});
  if(error){
    const box=document.getElementById('diariaAviso');
    if(box){
      box.style.display='';
      // El error de Postgres no dice qué hacer. Se traduce con la misma
      // tabla que usa el resto de la app, para que salga el archivo
      // exacto y no un "column not found" incomprensible.
      const archivo=migracionQueFalta(error);
      box.innerHTML=archivo
        ?`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:12px;border-radius:8px">
          <b>Falta la migración ${escHtml(archivo)}.</b> Sin ella no hay tabla de marcajes y esta pantalla no puede mostrar nada.<br>
          <small>Ejecútala en el <b>SQL Editor</b> de Supabase. Si ya la habías ejecutado, la API puede tenerla
          cacheada: corre <code>NOTIFY pgrst, 'reload schema';</code>. Después recarga con <b>Ctrl+F5</b>.</small>
          <br><small style="opacity:.75">Lo que respondió la base: ${escHtml(error.message)}</small></div>`
        :`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
          <b>No se pudieron leer los marcajes.</b> <small>${escHtml(error.message)}</small></div>`;
    }
    marcajes=[];
    renderDiaria();
    return;
  }
  const box=document.getElementById('diariaAviso');
  if(box)box.style.display='none';
  marcajes=data||[];
  // La planilla del día va aparte, en segundo plano: sin ella no se puede
  // conciliar, pero la pantalla tiene que pintar igual. Por eso el error
  // se guarda y se muestra en la pestaña de conciliación, no acá.
  loadAsistenciaDelDia();
  renderDiaria();
}
async function loadAsistenciaDelDia(){
  const {data,error}=await window.supabaseClient.from('asistencia')
    .select('*').eq('fecha',fechaDiaria);
  asistenciaDiaError=error?error.message:null;
  asistenciaDia=data||[];
  renderDiaria();
  renderConciliacion();
}
async function loadAvisosDia(){
  const {data}=await window.supabaseClient.from('avisos_marcaje')
    .select('*').eq('fecha',fechaDiaria).order('created_at',{ascending:false});
  avisosMarcaje=data||[];
}
// El marcaje de HOY. Se filtra por fecha a propósito: la lista trae
// varios días y, sin este filtro, el marcaje de ayer se tomaría por el
// de hoy (y al escanear se registraría una salida en vez de una entrada).
function marcajeDe(code,tipo,fecha){
  const f=fecha||fechaDiaria;
  return marcajes.find(m=>m.code===code&&m.tipo===tipo&&m.fecha===f)||null;
}

// Las alertas de un trabajador: social, prevención y atraso.
function revisarAlertas(w,horaMarcaje){
  const avisos=[];
  const entradaEsp=horaEntradaDe(miCodigoSupervisor);
  const tolerancia=toleranciaDe(miCodigoSupervisor);
  const minMarcaje=minutosDe(horaMarcaje);
  const minEntrada=minutosDe(entradaEsp);
  if(minMarcaje!=null&&minEntrada!=null&&minMarcaje>minEntrada+tolerancia){
    const atraso=minMarcaje-(minEntrada+tolerancia);
    const texto=textoDuracion(atraso)||'unos minutos';
    avisos.push({
      tipo:'atraso',
      titulo:'Marcaje fuera de hora',
      texto:`Marcaste a las <b>${horaMarcaje}</b> y la hora de entrada es <b>${entradaEsp}</b> (tolerancia de ${tolerancia} min). Llevas ${texto} de atraso.`,
      donde:'Administración',
      icono:'⏰'
    });
  }
  if(w.alerta_social){
    avisos.push({
      tipo:'social',
      titulo:'La asistente social quiere hablar contigo',
      texto:w.alerta_social_nota?escHtml(w.alerta_social_nota):'Tienes una anotación de la asistente social pendiente de revisar.',
      donde:'Asistente Social',
      icono:'💬'
    });
  }
  if(w.alerta_prevencion){
    avisos.push({
      tipo:'prevencion',
      titulo:'Prevención tiene algo que indicarte',
      texto:w.alerta_prevencion_nota?escHtml(w.alerta_prevencion_nota):'Tienes una anotación de prevención pendiente de revisar.',
      donde:'Prevención',
      icono:'🦺'
    });
  }
  return avisos;
}

// Cuando ya fichó la entrada pero no la salida, el marcaje del día queda
// abierto. Se avisa al supervisor para que lo regularice en RRHH en vez
// de dejarlo colgado para siempre.
//
// El día de hoy NO cuenta: es normal entrar y salir más tarde. Y las
// salidas se juntan en un Set para no recorrer todos los marcajes una vez
// por cada día (esto corre por cada trabajador en cada render).
function diasSinSalida(code){
  const hoy=hoyLocal();
  const salidas=new Set();
  marcajes.forEach(m=>{if(m.code===code&&m.tipo==='salida')salidas.add(m.fecha);});
  return marcajes.filter(m=>m.code===code&&m.tipo==='entrada'&&m.fecha<hoy&&!salidas.has(m.fecha));
}

async function registrarMarcaje(code,tipo,origen,nota,horaPedida){
  const w=workers.find(x=>x.code===code);
  if(!w)return null;
  const yaExiste=marcajeDe(code,tipo);
  if(yaExiste)return yaExiste;
  // si el supervisor escribió una hora, esa es la que manda; si no, la de ahora
  const hora=horaPedida||hhmmActual();
  const {data:sesion}=await window.supabaseClient.auth.getSession();
  const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
  const {data,error}=await window.supabaseClient.from('marcajes').insert({
    code,fecha:fechaDiaria,hora,tipo,
    origen:origen||'qr',
    nota:nota||null,
    registrado_por:miId,
    registrado_por_nombre:miNombrePerfil()
  }).select().single();
  if(error){
    const archivoMarcaje=migracionQueFalta(error);
    alert(archivoMarcaje
      ? errorDeGuardar('No se pudo guardar el marcaje',error)
      : 'No se pudo guardar el marcaje: '+error.message);
    return null;
  }
  marcajes.push(data);
  // La entrada deja la asistencia en X con la hora, para que la tarja lo
  // vea al tiro sin tener que sincronizar nada más.
  if(tipo==='entrada'){
    await saveAttendanceState(code,fechaDiaria,'X',hora,{
      motivo:motivoDeMarcaje('Marcaje de entrada',{'tipo':tipo,'origen':origen||'qr','hora':hora})
    });
    const rec=attendance.find(a=>a.code===code&&a.date===fechaDiaria);
    if(rec)rec.hora_llegada=hora;
  }
  return data;
}
async function guardarAvisos(code,marcaje,avisos){
  if(!avisos.length)return;
  const filas=avisos.map(a=>({
    marcaje_id:marcaje?marcaje.id:null,
    code,fecha:fechaDiaria,
    tipo_alerta:a.tipo,
    mensaje:`${a.titulo}: ${a.texto.replace(/<[^>]*>/g,'')}`,
    visto:false
  }));
  const {error}=await window.supabaseClient.from('avisos_marcaje').insert(filas);
  if(error)console.warn('No se pudieron guardar los avisos:',error.message);
  else avisosMarcaje.unshift(...filas);
}

// Días con entrada pero sin salida: el reloj quedó abierto. Se avisa al
// escanear para que RRHH lo regularice en vez de dejarlo colgado.
function avisosSinSalida(w){
  const abiertas=diasSinSalida(w.code);
  if(!abiertas.length)return [];
  const dias=abiertas.map(m=>fechaLegible(m.fecha)||m.fecha).join(', ');
  return [{
    tipo:'sin_salida',
    icono:'⏳',
    titulo:'Marcaje de salida pendiente',
    texto:`Hay una entrada registrada el ${dias} pero no la salida. El día quedó abierto en el reloj.`,
    donde:'RRHH',
    aviso:'Marcaje sin salida'
  }];
}

// Escaneo de tarjeta en la asistencia diaria.
async function marcarPorEscaneo(scanned){
  // Con el envoltorio, que ademas pregunta en la base. Antes usaba el
  // resolutor rapido, que solo mira el arreglo en memoria: por eso una
  // tarjeta emitida despues de abrir la pantalla salia "no encontrada".
  const w=await resolverCodigoTrabajadorCompleto(scanned);
  if(!w)return;
  // Solo su equipo. Si es RRHH o administración, se avisa y no se marca.
  if(miCodigoSupervisor&&w.supervisor_code!==miCodigoSupervisor){
    alert(w.name+' no está a tu cargo. Solo puedes registrar el marcaje de tu equipo.');
    return;
  }
  if(!miCodigoSupervisor&&!soyAdmin()){
    alert('Tu usuario no está vinculado a un supervisor, así que no hay equipo al que registrarle el marcaje. Un administrador lo vincula en Soporte → Usuarios.');
    return;
  }
  const entrada=marcajeDe(w.code,'entrada');
  const salida=marcajeDe(w.code,'salida');
  const hora=hhmmActual();
  if(navigator.vibrate){try{navigator.vibrate(120);}catch(error){}}
  // Ya fichó entrada y salida: solo se informa.
  if(entrada&&salida){
    renderDiaria();
    abrirAvisoMarcaje(w,{yaCompleto:true,entrada,salida,avisos:avisosSinSalida(w)});
    return;
  }
  // Todavía no sale: el siguiente escaneo es la salida.
  const tipo=entrada?'salida':'entrada';
  const m=await registrarMarcaje(w.code,tipo,'qr');
  if(!m)return;
  const avisos=(tipo==='entrada'?revisarAlertas(w,hora):[]).concat(avisosSinSalida(w));
  await guardarAvisos(w.code,m,avisos);
  await loadAvisosDia();
  renderDiaria();
  abrirAvisoMarcaje(w,{tipo,hora,marcaje:m,avisos});
}

// Ajustar manualmente (se le olvidó la tarjeta, se le olvidó el reloj).
async function marcarManual(code,tipo){
  const w=workers.find(x=>x.code===code);
  if(!w)return;
  const hora=prompt(`¿A qué hora fichó ${w.name}?`,hhmmActual());
  if(hora===null)return;
  if(!/^\d{1,2}:\d{2}$/.test(hora.trim())){alert('Escribe la hora como HH:MM.');return;}
  if(marcajeDe(code,tipo)){alert('Ya tiene ese marcaje registrado hoy.');return;}
  const m=await registrarMarcaje(code,tipo,'manual',null,hora.trim());
  if(!m)return;
  const avisos=(tipo==='entrada'?revisarAlertas(w,hora.trim()):[]).concat(avisosSinSalida(w));
  await guardarAvisos(code,m,avisos);
  await loadAvisosDia();
  renderDiaria();
  // La misma ventana que al escanear: si hay algo que el trabajador tenga
  // que hacer en otra oficina, se le avisa igual. El ajuste manual es
  // justo el caso en que más le sirve ver el aviso.
  abrirAvisoMarcaje(w,{tipo,hora:hora.trim(),marcaje:m,avisos});
}

// La ventana que ve el supervisor (y que se le puede mostrar al worker).
function abrirAvisoMarcaje(w,info){
  const {tipo,hora,avisos,entrada,salida,yaCompleto}=info;
  // se guarda el código para poder marcar los avisos como atendidos al cerrar
  modalCtx={code:w.code,fecha:fechaDiaria,estadoActual:null};
  // Aunque el día de hoy ya esté completo igual se muestran los avisos
  // pendientes: si escanea de nuevo porque tiene un día abierto de antes,
  // es justo ese aviso el que le sirve ver.
  const lista=yaCompleto
    ?[{icono:'✅',titulo:'Marcaje completo',texto:`Entrada a las <b>${entrada.hora}</b> y salida a las <b>${salida.hora}</b>.`,donde:null}]
      .concat(avisos||[])
    :[{icono:'✅',titulo:tipo==='entrada'?'Presente registrado':'Salida registrada',
        texto:tipo==='entrada'
          ? `Tu marcaje quedó guardado a las <b>${hora}</b>.`
          : `Se registró tu salida a las <b>${hora}</b>.`,
        donde:null}
      ].concat(avisos||[]);
  document.getElementById('marcajeQuien').innerHTML=
    `<b>${escHtml(w.name)}</b> · código ${escHtml(codigoMostrar(w.code))} · ${escHtml(fechaDiaria)}`;
  document.getElementById('marcajeLista').innerHTML=lista.map(a=>
    `<div class="mkAviso">
      <div class="mkAvisoIcono">${a.icono}</div>
      <div>
        <b>${escHtml(a.titulo)}</b>
        <div>${a.texto}</div>
        ${a.donde?`<div class="mkAvisoDonde">Debe pasar por <b>${escHtml(a.donde)}</b></div>`:''}
      </div>
    </div>`).join('');
  document.getElementById('marcajeModal').classList.add('open');
}

// Formatea una fecha sin arriesgarse a mostrar "Invalid Date" si el dato
// viene vacío o con un formato inesperado.
//
// Ojo con las fechas de Postgres: una columna "date" llega como
// "2026-09-20", y new Date() la interpreta como MEDIANOCHE UTC. En Chile
// eso es el 19 a las 21:00, así que el día se mostría corrido en uno. Por
// eso las fechas "YYYY-MM-DD" se arman a mano en hora local.
function fechaLegible(valor,conHora){
  if(!valor)return '';
  const soloFecha=typeof valor==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(valor);
  const d=soloFecha
    ?new Date(+valor.slice(0,4),+valor.slice(5,7)-1,+valor.slice(8,10))
    :new Date(valor);
  if(isNaN(d.getTime()))return '';
  try{
    return conHora
      ? d.toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
      : d.toLocaleDateString('es-CL');
  }catch(error){return '';}
}
function renderAvisosDia(){
  const el=document.getElementById('diariaAvisosLista');
  if(!el)return;
  if(!avisosMarcaje.length){el.innerHTML='<small>Nada anotado todavia.</small>';return;}
  el.innerHTML=avisosMarcaje.map(a=>{
    const w=workers.find(x=>x.code===a.code);
    const icono=a.tipo_alerta==='atraso'?'⏰':a.tipo_alerta==='social'?'💬':a.tipo_alerta==='prevencion'?'🦺':a.tipo_alerta==='sin_salida'?'⏳':'ℹ️';
    const donde=a.tipo_alerta==='atraso'?'Administración':a.tipo_alerta==='social'?'Asistente Social':a.tipo_alerta==='prevencion'?'Prevención':a.tipo_alerta==='sin_salida'?'RRHH':'';
    return `<div class="mkAviso" style="${a.visto?'opacity:.6':''}">
      <div class="mkAvisoIcono">${icono}</div>
      <div><b>${escHtml(a.code)} ${w?escHtml(w.name):''}</b>${fechaLegible(a.created_at,true)?` <small>${fechaLegible(a.created_at,true)}</small>`:''}${a.visto?' <small>(atendido)</small>':''}
        <div>${escHtml(a.mensaje)}</div>
        ${donde?`<div class="mkAvisoDonde">Debe pasar por <b>${escHtml(donde)}</b></div>`:''}
      </div>
    </div>`;
  }).join('');
}
// LA SITUACION, Y SU COLOR
//
// Todo el color sale de aca, en un solo lugar. Si se decidiera en cada
// parte de la pantalla, cada parte tendria su propia idea de que es
// "tarde", y el mismo trabajador saldria de dos colores segun donde se mire.
//
// Los cuatro primeros no dependen de ninguna migracion: salen de los
// marcajes del dia. Los del medio vienen del motivo del registro de la
// porteria, que es la 041, y si esa no esta, nunca entran.
//
//   sin marcar                rojo      no hay marcaje de entrada
//   accidente o licencia      azul      hay que avisar a donde corresponda
//   permiso                   amarillo  la porteria dijo que tiene permiso
//   tarde                     amarillo  entro despues de la hora
//   sin salida                amarillo  entro y todavia no salio
//   presente o completo       verde     esta bien
//
// EL ORDEN IMPORTA
// ---------------
// La falta le gana a todo. Si no entro, el color verde o amarillo seria
// mentira: no se puede estar "presente" sin haber entrado.
//
// Y el motivo de la porteria le gana a "tarde" y a "sin salida", porque es
// una explicacion mejor: si el portero dijo que es un accidente, "tarde"
// es una forma de tapar lo que really paso.
// El motivo de la portería de HOY para cada persona. La fila lo usa, pero no
// existía: sin esto, la columna de la situación se pinta siempre con los dos
// colores viejos.
//
// No se rompe si la 041 no está aplicada. La consulta falla, el catch la
// traga, y el mapa queda vacío. Es la diferencia entre degradar y romper: si
// la pantalla no abriera porque falta una tabla, el supervisor no podría
// marcar asistencia, y el peor lugar para descubrirlo es en la portería, con
// gente esperando.
let motivosPuerta={};
async function motivosDePuerta(){
  const mapa={};
  try{
    const r=await window.supabaseClient.rpc('motivos_porteria_hoy');
    const filas=Array.isArray(r.data)?r.data:(r.data||[]);
    filas.forEach(f=>{ if(f&&f.code)mapa[f.code]=f.motivo; });
  }catch(error){
    // Sin registro de portería todavía. No es un error.
  }
  return mapa;
}

function situacionDiaria(ent, sal, tarde, abierto, motivoPuerta){
  if(!ent) return {clase:'dia-rojo', texto:'Sin marcar'};
  if(motivoPuerta==='accidente'||motivoPuerta==='licencia')
    return {clase:'dia-azul', texto: motivoPuerta==='accidente'?'Accidente':'Licencia'};
  if(motivoPuerta==='permiso') return {clase:'dia-amarillo', texto:'Permiso'};
  if(tarde) return {clase:'dia-amarillo', texto:'Presente, tarde'};
  if(abierto) return {clase:'dia-amarillo', texto:'Presente, sin salida'};
  return {clase:'dia-verde', texto: sal?'Completo':'Presente'};
}


async function renderDiaria(){
  // Los motivos de la portería se piden antes de pintar. Se espera por ellos
  // porque si no, la primera vez que se abre la tabla sale sin los colores
  // de permiso, accidente y licencia, y alguien puede leer que ese no tiene
  // permiso cuando sí lo tiene.
  motivosPuerta=await motivosDePuerta();
  const list=document.getElementById('diariaLista');
  if(!list)return;
  const selSup=document.getElementById('supDiariaSup');
  const supCode=selSup?selSup.value:miCodigoSupervisor;
  if(!supCode){list.innerHTML='<small>Selecciona un supervisor.</small>';return;}
  const equipo=equipoDe(supCode);
  if(!equipo.length){list.innerHTML='<small>Este supervisor no tiene trabajadores asignados.</small>';return;}

  const entradaEsp=horaEntradaDe(supCode);
  const tolerancia=toleranciaDe(supCode);
  const filas=equipo.map(w=>{
    const ent=marcajeDe(w.code,'entrada');
    const sal=marcajeDe(w.code,'salida');
    const minEnt=ent?minutosDe(ent.hora):null;
    const minEsp=minutosDe(entradaEsp);
    const tarde=minEnt!=null&&minEsp!=null&&minEnt>minEsp+tolerancia;
    const pendientes=avisosMarcaje.filter(a=>a.code===w.code&&!a.visto);
    const abiertas=diasSinSalida(w.code);
    const social=w.alerta_social?'social ':'';
    const prev=w.alerta_prevencion?'prevencion ':'';
// Las etiquetas de social y de prevención, calculadas antes del template.
//
// Adentro del HTML quedaban tres niveles de comillas pegados, y eso no se
// puede mantener: en la primera corrección hay que volver a contar las
// comillas de a mano, y es donde se rompe.
let etiquetasTags='';
if(social||prev){
  etiquetasTags='<span class="mkTags">'
    +(social?'<em class="tagSocial">Asist. social</em> ':'')
    +(prev?'<em class="tagPrev">Prevención</em>':'')
    +'</span>';
}

    const sit=situacionDiaria(ent, sal, tarde, abiertas.length>0, motivoPuerta);
    return `<tr class="diaFila" data-code="${escHtml(w.code)}">
      <td class="diaCelda diaCeldaNombre">
        <b>${escHtml(codigoMostrar(w.code))}</b> ${escHtml(w.name)}
        <small>${escHtml(w.spec||'')}</small>
        ${etiquetasTags}
      </td>
      <td class="diaCelda diaCeldaHora">${ent?escHtml(ent.hora):''}</td>
      <td class="diaCelda diaCeldaHora">${sal?escHtml(sal.hora):(ent?'<span class="diaVacia">&mdash;</span>':'')}</td>
      <td class="diaCelda diaCeldaSit">
        <span class="diaPill ${sit.clase}">${escHtml(sit.texto)}</span>
        ${abiertas.length?'<small class="diaVacia">salida pendiente del '+escHtml(abiertas.map(m=>fechaLegible(m.fecha)||m.fecha).join(', '))+'</small>':''}
      </td>
      <td class="diaCelda diaCeldaAvisos">
        ${pendientes.length?'<span class="mkPill warn">'+pendientes.length+' aviso'+(pendientes.length>1?'s':'')+'</span>':''}
      </td>
      <td class="diaCelda diaCeldaAcciones">
        <button class="btn secondary" type="button" style="margin:0;padding:4px 8px;font-size:.7rem;white-space:nowrap"
          onclick="marcarManual('${escHtml(w.code)}','${ent?'salida':'entrada'}')">${ent?'Marcar salida':'Marcar entrada'}</button>
        ${ent?'':'<button class="btn" type="button" style="margin:0 0 0 4px;padding:4px 8px;font-size:.7rem;white-space:nowrap" onclick="marcarYAvisar(\''+escHtml(w.code)+'\',\'entrada\')" title="Marca y deja la indicación para que Administración la confirme">Marcar y avisar</button>'}
      </td>
    </tr>`;

  }).join('');

  const presentes=equipo.filter(w=>marcajeDe(w.code,'entrada')).length;
  const completos=equipo.filter(w=>marcajeDe(w.code,'entrada')&&marcajeDe(w.code,'salida')).length;
  const conAviso=avisosMarcaje.filter(a=>!a.visto).length;
  // La tabla: con encabezado pegado, y una celda por campo. El encabezado
  // va con "sticky" para que los titulos se queden arriba al bajar, que con
  // cuarenta personas es la diferencia entre saber que columna es cual y
  // tener que subir a recordarlo.
  list.innerHTML='<div class="diaTablaCaja"><table class="diaTabla">'
    +'<thead><tr><th>Trabajador</th><th class="diaThHora">Entrada</th>'
    +'<th class="diaThHora">Salida</th><th>Situación</th>'
    +'<th class="diaThAvisos">Avisos</th>'
    +'<th class="diaThAcciones">Acciones</th></tr></thead>'
    +'<tbody>'+filas+'</tbody></table></div>';
  renderAvisosDia();
  const resumen=document.getElementById('diariaResumen');
  if(resumen){
    resumen.innerHTML=`<b>${presentes}</b> de <b>${equipo.length}</b> presentes · <b>${completos}</b> con salida registrada`+
      (conAviso?` · <b style="color:var(--accent2)">${conAviso}</b> aviso(s) por atender`:'');
  }
}

// ============================================================
// JUSTIFICACIÓN DIARIA: QUIÉN TIENE QUE EXPLICAR SU ASISTENCIA

// ============================================================
// miCodigoSupervisor se declara arriba, con el resto del estado, porque
// empresaDeEquipo() lo lee y esa función se puede llamar antes de llegar
// hasta acá.
function recalcularMiSupervisor(){
  const code=(miPerfil&&miPerfil.trabajador_code)||'';
  const ficha=workers.find(w=>w.code===code);
  // solo cuenta si esa ficha está marcada como supervisor
  miCodigoSupervisor=(ficha&&ficha.is_supervisor)?code:'';
  return miCodigoSupervisor;
}
function soySupervisorDeEsteEquipo(supCode){
  if(!miCodigoSupervisor)return true;          // RRHH/admin: todos los equipos
  return supCode===miCodigoSupervisor;
}
function equipoDe(supCode){
  return workers.filter(w=>w.supervisor_code===supCode);
}
// El periodo de la tarja arranca en el mes actual, pero SOLO la primera
// vez. Si se pusiera en cada apertura, cambiar a otro mes no serviría de
// nada: al volver a la vista saltaría de vuelta al actual.
//
// Antes solo se ajustaba al escanear un QR, así que al abrir la vista la
// tarja salía en enero (lo que traía el HTML) y seemed que no hubiera
// fecha de hoy.
let periodoTarjaPuesto=false;
function ponerPeriodoActualEnTarja(){
  if(periodoTarjaPuesto)return;
  const y=document.getElementById('supYear');
  const m=document.getElementById('supMonth');
  if(!y||!m)return;
  const hoy=new Date();
  y.value=String(hoy.getFullYear());
  m.value=String(hoy.getMonth()+1);
  periodoTarjaPuesto=true;
}
function initSupervisores(){
  recalcularMiSupervisor();
  ponerPeriodoActualEnTarja();
  const sel=document.getElementById('sup-view');
  const sups=supervisoresActivos();
  const propio=miCodigoSupervisor;
  // El mapa se calcula una vez, antes de las dos ramas: las dos arman el
  // desplegable y se necesita en las dos. Declarado adentro de una rama,
  // la otra lo usaba sin existir y reventaba.
  const visSel=codigosVisibles(sups);

  if(propio){
    // solo su equipo: se oculta el listado de supervisores y el selector
    document.getElementById('supIntroCard').style.display='none';
    document.getElementById('supScopeCard').style.display='';
    document.getElementById('supScopeHint').innerHTML=
      `Estás viendo únicamente a <b>${escHtml(workers.find(w=>w.code===propio).name)}</b> y su gente. `+
      `Si te equivocaste de equipo, un administrador puede corregir el vínculo en Soporte → Usuarios.`;
    document.getElementById('supSelWrap').style.display='none';
    const equipo=equipoDe(propio);
    document.getElementById('supSoloEqWrap').style.display='';
    // Con 40 personas esta lista ocupa media pantalla y empuja la tarja
    // para abajo. Va plegada por defecto y el resumen dice cuántas son,
    // así se puede abrir solo cuando hace falta. Es un <details> nativo:
    // no necesita JavaScript para guardar el estado, y se puede abrir con
    // el teclado.
    const ordenados=equipo.slice().sort((a,b)=>compararPorCodigo(a.code,b.code));
    document.getElementById('supSoloEqWrap').innerHTML=
      `<details class="supEquipo"><summary>`+
        `<b>${equipo.length}</b> trabajador${equipo.length===1?'':'es'} a cargo`+
        `<span class="supEquipoHint"> — tocá para ver la lista</span>`+
      `</summary>`+
      (equipo.length
        ?`<p style="margin:8px 0 0">`+ordenados
            .map(w=>`<b>${escHtml(codigoMostrar(w.code))}</b> ${escHtml(w.name)}`).join(' · ')+`</p>`
        :'<p style="margin:8px 0 0"><small>Todavía no tienes gente asignada. Pídele a administración que te asigne un equipo.</small></p>')+
      `</details>`;
    sel.innerHTML=`<option value="${propio}">${escHtml(workers.find(w=>w.code===propio).name)}</option>`;
  }else{
    document.getElementById('supIntroCard').style.display='';
    document.getElementById('supScopeCard').style.display='none';
    document.getElementById('supSelWrap').style.display='';
    document.getElementById('supSoloEqWrap').style.display='none';
    renderSupervisorList();
    sel.innerHTML=sups.map(s=>`<option value="${escHtml(s.code)}">${escHtml(etiquetaSupervisor(s,visSel))}</option>`).join('')
      ||'<option value="">Sin supervisores</option>';
  }
  sel.value=propio||(sups[0]?sups[0].code:'');
  renderSupervisorMatrix();
}
function renderSupervisorList(){
  // Activos solamente. Un supervisor desvinculado con gente todavía asignada
  // es un caso que hay que ver, no para esconderlo: por eso la lista dice
  // cuántos quedaron afuera y por qué.
  const sups=supervisoresActivos();
  const visLista=codigosVisibles(sups);
  const ocultos=workers.filter(w=>w.is_supervisor&&w.status!=='activo');
  const conGente=ocultos.filter(w=>equipoDe(w.code).length>0);
  const visOcultos=codigosVisibles(ocultos);
  document.getElementById('supervisorList').innerHTML = (sups.map(s=>{
    const n=equipoDe(s.code).length;
    return `<div class="list-item" style="cursor:default"><span><b>${escHtml(visLista.get(s.code)||codigoMostrar(s.code))} ${escHtml(s.name)}</b> — ${escHtml(s.phone||'sin teléfono')} <small>(${n} trabajador${n===1?'':'es'} a cargo)</small></span></div>`;
  }).join('') || '<small>No hay trabajadores activos marcados como supervisor todavía. Marca la casilla "Este trabajador es supervisor" en su ficha.</small>')+
  (conGente.length?'<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:8px 10px;border-radius:8px;margin-top:8px">'+
    '<b>Ojo: '+conGente.length+' supervisor(es) que ya no trabajan acá todavía tienen gente asignada.</b> '+
    conGente.map(w=>escHtml((visOcultos.get(w.code)||codigoMostrar(w.code))+' '+w.name)).join(', ')+
    '. Reasigná su equipo en Asignar supervisor, o el filtro de la tarja no los va a mostrar.</div>':'');
}
async function trasladarTrabajador(){
  const code=document.getElementById('trans-worker').value;
  const supCode=document.getElementById('trans-supervisor').value;
  const w=workers.find(x=>x.code===code);
  if(!w){alert('Selecciona un trabajador.');return;}
  const {error}=await window.supabaseClient.from('trabajadores').update({supervisor_code:supCode||null}).eq('code',code);
  if(error){alert('No se pudo guardar en la base de datos: '+error.message);return;}
  await loadWorkers();
  initAsignarSupervisor();
  renderSupervisorList();
  alert('Trabajador reasignado.');
}
// ---------- LA LETRA DE UNA CELDA ----------
//
// Y devuelve SIEMPRE el código, nunca el texto. Tres casos:
//
//   ''                la celda no tiene estado: vacía. Que es lo que tiene que verse.
//   'X'               ya es un código: sale tal cual.
//   'Permiso Pagado'  llega el texto entero: se busca el código que empieza con esas letras y se
//                     devuelve ESE. Si no hay ninguno, se devuelve ''.
//
// Y por qué vacío en vez de lo que vino: una celda con un texto largo rompe el ancho de la columna
// y empuja toda la grilla. Una vacía se nota en un segundo. Ver [tarja-08].
function letraDeEstado(valor){
  const s=String(valor==null?'':valor).trim();
  if(!s)return '';
  const mayus=s.toUpperCase();

  // UNO: el código exacto, tal cual viene de la base. Es el caso normal.
  const exacto=ESTADOS_TARJA.find(e=>e.v===s||e.v===mayus);
  if(exacto)return exacto.v;

  // DOS Y TRES: por la DESCRIPCIÓN.
  //
  // Y "ESTADOS_TARJA" guarda el texto como '"X — Presente"': el CÓDIGO, un guion largo, y la
  // descripción. La descripción va DESPUÉS del guion, no antes —que es lo que se lee mirando la
  // lista, pero no es lo que se le ocurre escribir—, y por eso la primera versión buscaba antes
  // del guion y no encontraba nada: "Falta" volvía vacío.
  //
  // Y el que más diferencia DENTRO del texto gana, porque "Permiso" está dentro de "Permiso
  // Pagado". Si gana el primero, un permiso pagado se cuenta como un permiso, y eso suma en dos
  // columnas distintas del resumen.
  const descripcionDe=e=>(e.t||'').split('—').slice(1).join('—').trim().toUpperCase();
  const exacta=ESTADOS_TARJA.find(e=>descripcionDe(e)===mayus&&descripcionDe(e).length>=2);
  if(exacta)return exacta.v;

  const dentro=ESTADOS_TARJA.filter(e=>descripcionDe(e).length>=2
    && mayus.indexOf(descripcionDe(e))>=0)
    .sort((a,b)=>descripcionDe(b).length-descripcionDe(a).length);
  if(dentro.length)return dentro[0].v;

  // CUATRO: no se reconoce. Celda vacía, que se ve al tiro y no descuadra el conteo.
  return '';
}

function renderSupervisorMatrix(){
  const supCode=document.getElementById('sup-view').value;
  const y=parseInt(document.getElementById('supYear').value);
  const m=parseInt(document.getElementById('supMonth').value);
  const area=document.getElementById('supMatrixArea');
  if(!supCode){area.innerHTML='<small>Selecciona un supervisor.</small>';return;}
  if(!soySupervisorDeEsteEquipo(supCode)){
    area.innerHTML='<small>Ese equipo no es el tuyo.</small>';
    return;
  }
  // EL FILTRO DE ACTIVOS E INACTIVOS. "activos" por defecto.
  //
  // Y sale del select porque se pidio asi: un Desvinculado no tiene nada que marcar en el mes, y
  // mixinglo con los que si lo tienen hace que el conteo de arriba no cierre con lo que uno ve.
  //
  // Y el valor vacio es "los dos", que no es lo mismo que "ninguno": es para cuando uno esta
  // revisando un mes viejo y quiere ver a quien estaba y a quien no.
  const filtroEstado=(document.getElementById('supEstadoEquipo')||{}).value;
  let equipo=equipoDe(supCode);
  if(filtroEstado)equipo=equipo.filter(w=>String(w.status||'activo')===filtroEstado);
  if(!equipo.length){
    area.innerHTML='<small>'+(filtroEstado==='desvinculado'
      ?'Este supervisor no tiene trabajadores desvinculados.'
      :'Este supervisor no tiene trabajadores activos.')+'</small>';
    return;
  }
  // modo "supervisores": al hacer clic en un día se abre el modal de solicitud
  area.innerHTML=buildMatrixHtml(y,m,equipo,'supervisores');
  if(typeof marcarTarjaSoloLectura==='function')marcarTarjaSoloLectura();
}

// ---------- LA LEYENDA DE LAS LETRAS ----------
//
// Y se ARMA con "ESTADOS_TARJA", que es la lista real. No escrita a mano.
//
// Porque una leyenda escrita a mano se desactualiza en silencio: se agrega un estado a la lista y
// el cartel sigue diciendo ocho. Y el que lo lee Cree que ese estado no existe.
//
// Y las dos filas de abajo no son estados: son combinaciones y fondos, que no están en
// "ESTADOS_TARJA" porque no se eligen a mano.
// Y EL CARTEL ES EL MISMO EN LAS DOS TARJAS, Y POR QUÉ
//
// Las dos pantallas -- la del supervisor y la mensual -- arman la grilla con la misma función, "buildMatrixHtml", y por eso muestran las mismas letras con el mismo significado. Si cada una tuviera su cartel, uno se actualiza y el otro no, y quedan dos verdades.
//
// Así que el cartel se arma una vez, en un función aparte, y las dos pantallas la llaman. Lo único que cambia es el identificador de la caja donde se muestra, y eso va como argumento en vez de estar escrito adentro: si estuviera escrito, la segunda pantalla no encontraría su caja y no se vería nada.
//
// Y un botón que no abre nada no falla en la consola: no se ve. Es el peor de los errores de JavaScript, porque la pantalla está bien y no hay nada en el log que mirar.
function armarLeyendaTarja(){
  const letra=e=>'<b>'+escHtml(e.v)+'</b> '+escHtml((e.t||'').split('—').pop().trim());
  return '<b>Códigos de estado</b><div class="tarjaLeyendaGrid">'
    +ESTADOS_TARJA.map(letra).join('')+'</div>'
    +'<b>Combinaciones</b><div class="tarjaLeyendaGrid">'
    +'<span><b>X+V+PP+LL</b> y X en feriados: día efectivo</span>'
    +'<span><b>PP</b> permiso pagado · <b>LL</b> día lluvia</span>'
    +'</div>'
    +'<b>Fondos</b><div class="tarjaLeyendaGrid">'
    +'<span>Celda con fondo de color: feriado — hacé clic en el día para alternar laborable/feriado.</span>'
    +'<span>Celda en negro: anterior a la fecha de ingreso o posterior a la de desvinculación. No se puede editar.</span>'
    +'</div>'
    // Y LAS SEIS COLUMNAS DEL RESUMEN, DE LA MISMA LISTA QUE LOS ENCABEZADOS
    //
    // Si los dos textos estuvieran escritos por separado, el encabezado y el cartel serían dos
    // verdades. Con "COLUMNAS_TARJA" salen de los mismos seis objetos: no pueden separarse.
    +'<b>Columnas del resumen</b><div class="tarjaLeyendaGrid">'
    +COLUMNAS_TARJA.map(c=>'<span><b>'+escHtml(c.v)+'</b> '+escHtml(c.t)+'</span>').join('')
    +'</div>';
}

// ---------- EL CARTEL FLOTANTE DE LAS COLUMNAS ----------
//
// Y NO SE REUSA EL "<details class=ayuda>" QUE YA HAY EN EL PROYECTO
//
// Porque ése es un bloque normal con el cartel absoluto adentro, y acá el cartel va dentro de la
// tabla. Y la tabla vive adentro de un ".overflow", que tiene "overflow-x:auto" -- y en CSS, si un
// eje no es "visible", el otro deja de serlo también. O sea que el ".overflow" recorta en los dos
// ejes, y un cartel absoluto dentro de él se cortaría al llegar al borde de la tabla.
//
// Eso no es teórico: la tabla tiene 31 columnas de días más las seis del resumen, y el ancho
// siempre va a pasar del de la tarjeta. El cartel se abriría y se vería cortado por la derecha.
//
// Por eso el cartel se cuelga de "<body>" con "position:fixed", y se coloca con las medidas del
// botón. "fixed" no lo recorta ningún ancestro, porque no depende de ninguno: se posiciona contra
// la pantalla.
//
// Y se reutiliza la APARIENCIA de ".ayuda-caja" --mismo ancho, mismo borde, misma sombra--, que es
// lo que hace que se vea igual que las otras ayudas del sistema y no como un invento nuevo.
function alternarAyudaColumnas(boton){
  armarAyudaColumnas();
  let caja=document.getElementById('ayudaColumnas');
  if(caja&&caja.dataset.boton===String(boton.dataset.col||'')){
    caja.remove();
    boton.setAttribute('aria-expanded','false');
    return;
  }
  if(caja)caja.remove();
  caja=document.createElement('div');
  caja.id='ayudaColumnas';
  caja.className='ayuda-suelta';
  caja.setAttribute('role','tooltip');
  caja.dataset.boton=String(boton.dataset.col||'');
  caja.innerHTML=armarLeyendaTarja();
  document.body.appendChild(caja);
  boton.setAttribute('aria-expanded','true');

  // Y SE COLOCA DEL LADO QUE HAY LUGAR, Y CON EL ALTO QUE SE PIDE
  //
  // El alto se mide DESPUÉS de estar en el DOM, porque antes no tiene: un elemento que no está en
  // la página no tiene caja, y un "getBoundingClientRect" de eso da ceros.
  //
  // Y el cartel mide 728px, que es más que media pantalla. Así que hay dos cosas que decidir: de qué
  // lado abrir, y hasta qué alto. Abrir siempre hacia abajo lo saca de la pantalla cuando el botón
  // está a media altura, que es donde está la tabla en una pantalla normal.
  //
  // Se comparan los dos lados y se elige el más grande. Y si ninguno alcanza, el alto se recorta al
  // del lado elegido y el cartel scrollea adentro: es mejor un cartel con scroll que uno cortado
  // por el borde, porque lo que se perdió es justo la parte de abajo, que es donde están las
  // columnas del resumen.
  const b=boton.getBoundingClientRect();
  const margen=12;
  const arriba=b.top-margen*2;
  const abajo=window.innerHeight-b.bottom-margen*2;
  const Arriba=arriba>=abajo;
  const alto=Math.max(160,Math.min(728, Arriba?arriba:abajo));
  caja.style.maxHeight=Math.round(alto)+'px';

  // Y el ancho primero, porque si queda pegado a la derecha de la pantalla se corrige con el
  // ancho que ya se sabe, y no con un "!important" después de verlo mal.
  caja.style.left=Math.round(b.left)+'px';
  const w=caja.offsetWidth;
  if(b.left+w>window.innerWidth-margen)caja.style.left=Math.max(margen,window.innerWidth-margen-w)+'px';
  caja.style.top=(Arriba
    ? Math.round(Math.max(margen,b.top-alto-margen))
    : Math.round(Math.min(window.innerHeight-alto-margen,b.bottom+margen)))+'px';
}

// Y SE CIERRA SOLO, CON UN CLIC AFUERA O CON LA TECLA DE ESCAPE
//
// Porque un cartel que no se cierra solo se queda pegado en la pantalla y tapa la grilla, que es
// justo lo que se fue a buscar la persona. Y Escape es lo que espera cualquiera que abra algo y
// quiera cerrarlo sin mover el mouse.
function cerrarAyudaColumnas(){
  const caja=document.getElementById('ayudaColumnas');
  if(!caja)return;
  document.querySelectorAll('.tarjaColRes .ayuda-ico[aria-expanded="true"]').forEach(function(b){
    b.setAttribute('aria-expanded','false');
  });
  caja.remove();
}

// Y SE ARMA UNA SOLA VEZ EL ESCUCHADOR DEL CIERRE, NO UNO POR CARTEL
//
// Porque si se agrega un escuchador cada vez que se abre el cartel, y se abre veinte veces en una
// tarde, quedan veinte escuchadores que hacen lo mismo veinte veces cada vez que se hace clic en
// cualquier parte. La pantalla se pone pesada sin que nada falle: no hay error, no hay aviso, sólo
// va más lenta.
//
// El guardián es "¿ya está armado?". Y tiene que estar en la función que ARMA el cartel, no en la
// que lo cierra, porque si estuviera en la que cierra nunca se llega a armar.
let ayudaColumnasEscuchada=false;

function armarAyudaColumnas(){
  if(ayudaColumnasEscuchada)return;
  ayudaColumnasEscuchada=true;
  document.addEventListener('click', function(ev){
    const caja=document.getElementById('ayudaColumnas');
    if(!caja)return;
    // Y si el clic fue DENTRO del cartel, no se cierra. Sin esta pregunta, cualquier clic para
    // leer el texto lo cerraba, y no se podía seleccionar una palabra de la explicación.
    if(caja.contains(ev.target))return;
    if(ev.target.closest && ev.target.closest('.tarjaColRes .ayuda-ico'))return;
    cerrarAyudaColumnas();
  });
  document.addEventListener('keydown', function(ev){
    if(ev.key==='Escape')cerrarAyudaColumnas();
  });
}

function alternarLeyendaTarja(boton, idCaja){
  const caja=document.getElementById(idCaja||'supLeyendaCeldas');
  if(!caja)return;
  if(!caja.dataset.armada){
    caja.innerHTML=armarLeyendaTarja();
    caja.dataset.armada='1';
  }
  const abierto=caja.hidden;
  caja.hidden=!abierto;
  if(boton)boton.setAttribute('aria-expanded',abierto?'true':'false');
}

// ---------- marcaje manual ----------
// Pone la fecha de hoy y la hora que sea en este momento.
//
// Se recalcula cada vez que se abre la pestaña, no solo al arrancar la app:
// una pantalla abierta toda la mañana con la hora de las 8 registraría de más
// las entradas de las 15. El reloj va, la fecha no.
function prepararMarcajeManual(){
  const f=document.getElementById('man-fecha');
  const h=document.getElementById('man-hora');
  if(f)f.value=hoyLocal();
  if(h)h.value=hhmmActual();
  const msg=document.getElementById('man-buscar-msg');
  if(msg)msg.innerHTML='';
  const inp=document.getElementById('man-buscar');
  if(inp)inp.value='';
}
// Elige al trabajador en el desplegable. Se separa de la búsqueda para que
// ambas entradas (escanear y escribir) lleguen al mismo lugar.
function elegirParaMarcajeManual(w,aviso){
  const sel=document.getElementById('man-worker');
  if(sel)sel.value=w.code;
  prepararMarcajeManual();
  const msg=document.getElementById('man-buscar-msg');
  if(!msg)return;
  // El aviso va PRIMERO, porque prepararMarcajeManual() limpia el mensaje y
  // si se escribiera después, quedaría tapado. Antes se perdía solo.
  if(aviso)msg.innerHTML+=`<p style="background:var(--accent);color:#1c1206;padding:8px 10px;border-radius:6px;margin-bottom:6px"><b>${escHtml(aviso)}.</b> Se eligió igual, pero conviene pasar la tarjeta.</p>`;
  msg.innerHTML+=`<p style="background:var(--accent2);color:#fff;padding:8px 10px;border-radius:6px">Elegido: <b>${escHtml(w.name)}</b> (código ${escHtml(codigoMostrar(w.code))}). Fecha ${escHtml(hoyLocal())}, hora ${escHtml(hhmmActual())}. Si es otra, cámbiala y dale <b>Registrar marcaje</b>.</p>`;
}
// Busca por tarjeta, por código o por nombre, y deja al trabajador elegido.
//
// Acepta las tres cosas porque en portería pasa cualquiera de las tres: se
// pasa la tarjeta, se teclea el código, o no está el código a la vista y se
// busca por nombre. Antes esto solo aceptaba elegir del desplegable.
async function buscarParaMarcajeManual(texto){
  const inp=document.getElementById('man-buscar');
  const msg=document.getElementById('man-buscar-msg');
  const leido=String(texto!=null?texto:(inp?inp.value:'')).trim();
  if(!leido){if(msg)msg.innerHTML='<p style="color:var(--danger)">Escaneá una tarjeta o escribí un código o un nombre.</p>';return;}
  if(msg)msg.innerHTML='<p><small>Buscando…</small></p>';

  const r=await resolverConsulta(leido);
  if(r.trabajador){
    elegirParaMarcajeManual(r.trabajador,r.aviso);
    if(inp)inp.value='';
    return;
  }
  if(msg){
    if(r.error==='Anulada')msg.innerHTML=`<p style="background:var(--danger-solid);color:#fff;padding:8px 10px;border-radius:6px"><b>⚠️ TARJETA ANULADA</b><br>${escHtml(r.motivo||'')}. No se puede registrar con una tarjeta anulada.</p>`;
    else if(r.error==='Bloqueada')msg.innerHTML=`<p style="background:var(--danger-solid);color:#fff;padding:8px 10px;border-radius:6px"><b>⛔ TARJETA BLOQUEADA</b><br>${escHtml(r.motivo?('Motivo: '+r.motivo):'')} Debe pasar por Administración.</p>`;
    else if(r.error==='OtraEmpresa')msg.innerHTML=`<p style="color:var(--danger)">La tarjeta es de <b>${escHtml(r.nombre)}</b>, que pertenece a otra empresa.</p>`;
    else if(r.error==='SinTrabajador')msg.innerHTML=`<p style="color:var(--danger)">La tarjeta apunta al código <b>${escHtml(r.code)}</b>, que no está en la lista de trabajadores.</p>`;
    else msg.innerHTML=`<p style="color:var(--danger)">No encontré a nadie con <b>${escHtml(leido)}</b>.<br><small>Prueba con la tarjeta, con el código (por ejemplo 021) o con parte del nombre.</small></p>`;
  }
}
async function marcajeManual(){
  if(!exigirPermiso('tarja.marcaje','No tienes permiso para registrar marcajes.'))return;
  const sel=document.getElementById('man-worker');
  const code=sel?sel.value:'';
  const fecha=document.getElementById('man-fecha').value;
  // Si la fecha es hoy y no se escribió una hora, se usa la de ahora. Antes
  // esto era un error y obligaba a teclear la hora a mano siempre.
  const hora=(document.getElementById('man-hora').value||'').trim()||(fecha===hoyLocal()?hhmmActual():'');
  if(!code){alert('Elige o escanea un trabajador.');return;}
  if(!fecha){alert('Pon la fecha.');return;}
  if(!hora){alert('Pon la hora, o deja la fecha en hoy para que se ponga sola.');return;}
  const w=workers.find(x=>x.code===code);
  const {error}=await window.supabaseClient.from('asistencia').upsert(
    attToDb({code,date:fecha,estado:'X',hora_llegada:hora,nota:'',origen:'manual'}),
    {onConflict:'code,fecha'}
  );
  if(error){alert('No se pudo guardar en la base de datos: '+error.message);return;}
  await loadAttendanceFromDB();
  renderMatrix();
  // El mensaje dice a quién y a qué hora, para que un marcaje manual sea
  // rastreable después. Un "Marcaje registrado." a secas no dice de quién.
  alert('Marcaje registrado.\n\n'+(w?w.name+' ('+w.code+')':'Código '+code)+'\nFecha: '+fecha+'   Hora: '+hora);
  prepararMarcajeManual();
}

function showJustSupervisor(){
  const code=document.getElementById('just-worker').value;
  const w=workers.find(x=>x.code===code);
  const el=document.getElementById('just-supervisor-info');
  if(!w||!w.supervisor_code){el.innerHTML='<small>Sin supervisor asignado — no hay a quién consultar.</small>';return;}
  const sup=workers.find(s=>s.code===w.supervisor_code);
  el.innerHTML = sup ? `<small>Supervisor a cargo: <b>${sup.name}</b>${sup.phone?(' — '+sup.phone):''}. Consultar con él/ella qué pasa con el trabajador.</small>` : '<small>Sin supervisor asignado.</small>';
}

async function justificar(){
  if(!exigirPermiso('tarja.justificar','No tienes permiso para justificar inasistencias. Puedes solicitar el cambio desde "Solicitar cambio de estado".'))return;
  const code=document.getElementById('just-worker').value;
  const estado=document.getElementById('just-estado').value;
  const desde=document.getElementById('just-desde').value;
  const hasta=document.getElementById('just-hasta').value || desde;
  const nota=document.getElementById('just-nota').value.trim();
  if(!code||!desde){alert('Selecciona trabajador y al menos la fecha "Desde".');return;}
  let d=new Date(desde+'T00:00:00'), fin=new Date(hasta+'T00:00:00');
  const rows=[];
  while(d<=fin){
    rows.push(attToDb({code,date:isoLocal(d),estado,nota,hora_llegada:'',origen:'justificacion'}));
    d.setDate(d.getDate()+1);
  }
  const {error}=await window.supabaseClient.from('asistencia').upsert(rows,{onConflict:'code,fecha'});
  if(error){alert('No se pudo guardar en la base de datos: '+error.message);return;}
  await loadAttendanceFromDB();
  renderMatrix();
  document.getElementById('just-nota').value='';
  alert(`${rows.length} día(s) justificado(s) como ${estado}.`);
}

function daysInMonth(y,m){return new Date(y,m,0).getDate();}
const diaSemanaLetra=['D','L','M','M','J','V','S']; // getDay(): 0=domingo
function weekStartIso(iso){
  const date=new Date(iso+'T00:00:00');
  date.setDate(date.getDate()-((date.getDay()+6)%7));
  return isoLocal(date);
}
function buildWorkedWeeks(){
  const weeks=new Set();
  attendance.forEach(record=>{
    if(record.estado!=='X')return;
    const [year,month,day]=record.date.split('-').map(Number);
    if(!isFeriado(year,month,day))weeks.add(`${record.code}|${weekStartIso(record.date)}`);
  });
  return weeks;
}
// ---------- LAS SEIS COLUMNAS DE RESUMEN, CON SU LETRA ----------
//
// Y ES UNA LISTA, Y NO SEIS TEXTOS SUELTOS EN EL ENCABEZADO
//
// Porque el rótulo corto y el significado largo tienen que salir del mismo lugar. Si el
// encabezado dice "LL" escrito a mano y el cartel dice "días de lluvia" escrito a mano, son dos
// verdades: el día que uno cambie, el otro queda diciendo la cosa vieja. Y el que lee la grilla
// ve "LL" y no tiene de dónde saber qué es.
//
// Con la lista, el encabezado y el cartel salen de los mismos seis objetos. No pueden
// separarse.
//
// Y las letras NO SON INVENTADAS: tres ya estaban en el rótulo viejo --"Días lluvia (LL)",
// "Lic./Acc. (L,A)", "Inasist. (F,P)"-- y lo que se hizo fue dejar la letra yllevar la
// palabras al "title" y al cartel. Las otras tres no tenían letra, y se les puso una que se
// lea: "30" es la base, "EF" son efectivos, "RT" son reales. Ver [tarja-18].
const COLUMNAS_TARJA=[
  {v:'30', t:'Días trabajados, contados sobre una base de 30 días'},
  {v:'EF', t:'Días efectivos: los que suman asistencia'},
  {v:'LL', t:'Días de lluvia'},
  {v:'RT', t:'Días realmente trabajados'},
  {v:'LA', t:'Licencias y accidentes'},
  {v:'FP', t:'Faltas y permisos'}
];

function buildMatrixHtml(y,m,lista,modo){
  modo=modo||'normal';
  const nd=daysInMonth(y,m);
  const workedWeeks=buildWorkedWeeks();
  const recordsByDay=new Map(attendance.map(record=>[`${record.code}|${record.date}`,record]));
  // Y el ".overflow" va ACÁ, alrededor de la tabla sola, y no en el HTML afuera.
  //
  // Porque "buildMatrixHtml" devuelve la tabla Y las tres leyendas, y si el scroll
  // horizontal envuelve todo, las leyendas se desplazan con la tabla: para leer el texto
  // de abajo hay que volver a arrastrar a la izquierda, y eso esconde la grilla. La
  // leyenda es de la persona, no de la tabla. Ver [tarja-07].
  // Y EL "COLGROUP", QUE ES DONDE VAN LOS ANCHOS DE LAS COLUMNAS FIJAS
  //
  // La tabla va con "table-layout:fixed" para que las columnas de día sean iguales. Con "fixed" el
  // ancho sale de la PRIMERA FILA, y se puede poner en la celda... salvo en la primera.
  //
  // MEDIDO: la columna del código quedaba en 227 píxeles en vez de los 86 que pedía su regla, y el
  // nombre sí tomaba los 220 de la suya. La única diferencia entre las dos es que la del código
  // tiene "position:sticky", y una celda sticky no la mide el reparto de columnas: la mide el sticky.
  //
  // Y por eso los anchos van en un "colgroup": es el mecanismo que existe justamente para esto, y
  // no le importa si la celda está pegada o no.
  let html='<div class="overflow"><table>'
    +'<colgroup><col style="width:86px"><col style="width:220px">'
    +Array.from({length:nd},()=>'<col style="width:13px">').join('')
    +'<col span="7" style="width:29px"></colgroup>'
    +'<tr><th>Código</th><th class="attendance-name-column">Trabajador</th>';
  // Y LAS CELDAS DE DÍA LLEVAN CLASE, PORQUE SU ANCHO NO SE PUEDE DEJAR AL AZAR
    //
    // MEDIDO sin ella: los días 1 al 9 salían de 18 a 27 píxeles y los del 20 al 30 de 27 a 30. El
    // motivo es que "table-layout:auto" sin un ancho da a cada columna lo que pide su contenido, y
    // un "1" pide menos que un "28". Con 18 píxeles y 2 de relleno por lado, la letra del día de la
    // semana no entra. Ver [tarja-21].
    for(let d=1;d<=nd;d++)html+=`<th class="tarjaDia">${d}</th>`;
  // Y LAS SEIS COLUMNAS DEL RESUMEN, CON LA LETRA Y NO CON LA FRASE
  //
  // Antes cada encabezado decía la frase entera --"Días lluvia (LL)"-- y la columna quedaba
  // ancha por la frase, no por el número que lleva adentro. Con dos dígitos dentro, una columna
  // de 140px es un desperdicio, y seis columnas así se comen la grilla.
  //
  // Y el "title" queda en cada una, que es lo que se ve al pasar el puntero por encima: el
  // nombre entero sigue ahí para quien lo necesite, sin estar escrito en la celda todo el día.
  //
  // Y la última celda es el botón de información. Va AQUÍ, al final de la fila de las columnas, y
  // no en la barra de controles de arriba: el que no entiende "LL" tiene el botón al lado de la
  // "LL", que es donde está la pregunta. Puesto arriba, entre el año y el mes, queda a tres
  // campos de distancia de lo que no entiende.
  html+='<th class="tarjaColRes"><span class="tarjaLetra" title="Días trabajados, contados sobre una base de 30 días">30</span></th>'
    +'<th class="tarjaColRes"><span class="tarjaLetra" title="Días efectivos: los que suman asistencia">EF</span></th>'
    +'<th class="tarjaColRes"><span class="tarjaLetra" title="Días de lluvia">LL</span></th>'
    +'<th class="tarjaColRes"><span class="tarjaLetra" title="Días realmente trabajados">RT</span></th>'
    +'<th class="tarjaColRes"><span class="tarjaLetra" title="Licencias y accidentes">LA</span></th>'
    +'<th class="tarjaColRes"><span class="tarjaLetra" title="Faltas y permisos">FP</span></th>'
    +'<th class="tarjaColRes"><button class="btn-info ayuda-ico" type="button" data-col="resumen"'
    +' onclick="alternarAyudaColumnas(this)"'
    +' title="Qué significa cada letra y cada columna"'
    +' aria-label="Qué significa cada letra y cada columna" aria-expanded="false">i</button></th>'
    +'</tr>';
  html+='<tr><td></td><td><i>Día</i></td>';
  for(let d=1;d<=nd;d++){
    const dow=new Date(y,m-1,d).getDay();
    const fer=isFeriado(y,m,d);
    const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html+=`<td class="tarjaDia ${fer?'day-feriado day-label-holiday':'day-lab'}" style="cursor:pointer" onclick="toggleDay('${iso}')" title="Click para alternar laborable/feriado"><small>${diaSemanaLetra[dow]}</small></td>`;
  }
  html+='<td colspan="6"></td></tr>';
  lista.forEach(w=>{
    html+=`<tr><td class="attendance-code-column">${escHtml(codigoMostrar(w.code))}</td><td class="attendance-name-column">${escHtml(w.name)}</td>`;
    let cX=0,cHolidayX=0,cF=0,cP=0,cL=0,cA=0,cPP=0,cV=0,cLL=0;
    for(let d=1;d<=nd;d++){
      const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const beforeStart=w.fecha_ingreso&&iso<w.fecha_ingreso;
      const afterEnd=w.status==='desvinculado'&&w.fecha_desvinculacion&&iso>w.fecha_desvinculacion;
      if(beforeStart||afterEnd){
        const motivo=beforeStart?'Antes de la fecha de ingreso':'Después de la desvinculación';
        html+=`<td class="day-blocked" title="${motivo}">·</td>`;
        continue;
      }
      const rec=recordsByDay.get(`${w.code}|${iso}`);
      const holiday=isFeriado(y,m,d);
      const autoHoliday=!rec&&holiday&&workedWeeks.has(`${w.code}|${weekStartIso(iso)}`);
      const est=rec?rec.estado:(autoHoliday?'X':'');
      if(est==='X'){if(holiday)cHolidayX++;else cX++;}
      else if(est==='F')cF++;else if(est==='P')cP++;else if(est==='L')cL++;else if(est==='A')cA++;else if(est==='PP')cPP++;else if(est==='V')cV++;else if(est==='LL')cLL++;
      const cellClass=['tarjaDia','attendance-cell',holiday?'day-feriado':'day-lab',est?`state-${est.toLowerCase()}`:'',autoHoliday?'day-auto-attendance':'',holiday&&est==='X'?'day-compensatory-x':''].filter(Boolean).join(' ');
      const encodedCode=encodeURIComponent(w.code).replace(/'/g,'%27');
      // modo "supervisores" abre el modal de solicitud; el resto, el editor directo
      const abrir=modo==='supervisores'?'abrirModalSolicitud':'editAttendanceCell';
      const tip=modo==='supervisores'
        ? (holiday&&est==='X'?'X en feriado (día compensado) — clic para solicitar un cambio':'Clic para solicitar un cambio de estado')
        : (holiday&&est==='X'?'X en feriado: día compensado':'Clic para editar el estado');
      // Y LA CELDA MUESTRA SOLO LA LETRA, SIEMPRE.
      //
      // Antes se ponía "est" a pelo, que es el código que viene de la base. Si algún día un estado
      // llega con el texto entero en vez del código —"Permiso Pagado" en vez de "PP"— la celda
      // muestra un párrafo entero, la grilla se rompe de una sola fila, y el conteo de arriba
      // sigue diciendo lo mismo porque cuenta por código.
      //
      // "letraDeEstado" no hace eso. Devuelve siempre el código, y si no lo reconoce devuelve una
      // celda VACÍA en vez de texto: una celda en blanco se ve al tiro y no descuadra nada; un
      // párrafo en una celda no se ve hasta que la tabla ya está toda mal.
      html+=`<td class="${cellClass}" data-code="${encodedCode}" data-date="${iso}" data-state="${rec?rec.estado:''}" data-auto="${autoHoliday}" onclick="${abrir}(this)" title="${tip}">${letraDeEstado(est)}</td>`;
    }
    const diasReales=cX;
    const diasEfectivos=cX+cHolidayX+cV+cPP+cLL;
    const diasTrabajadosCrudo=cX+cHolidayX+cV+cPP+cLL;
    const diasTrabajadosBase30=Math.round(diasTrabajadosCrudo/nd*30);
    html+=`<td>${diasTrabajadosBase30}</td><td>${diasEfectivos}</td><td>${cLL}</td><td>${diasReales}</td><td>${cL+cA}</td><td>${cF+cP}</td></tr>`;
  });
  html+='</table></div>';
  let textoCelda;
  if(modo==='supervisores'){
    textoCelda='Haz clic en cualquier día para <b>solicitar</b> un cambio de estado: se abre una ventana para elegir el estado nuevo y escribir el detalle. Queda pendiente hasta que RRHH lo apruebe.';
  }else if(!puedeEditarTarjaDirectamente()&&puede('tarja.solicitar_cambio')){
    textoCelda='Haz clic en cualquier día para <b>solicitar</b> un cambio de estado: se abre una ventana para elegir el estado nuevo y escribir el detalle. Queda pendiente hasta que RRHH lo apruebe.';
  }else{
    textoCelda='Haz clic en cualquier celda para cambiar el estado; puedes elegir X, F, P, L, A, PP, V o volver al valor automático.';
  }
  html+=`<p><small>${textoCelda}</small></p>`;
  html+='<p><small>Los días en negro quedan bloqueados: son anteriores a la fecha de ingreso del trabajador o posteriores a su fecha de desvinculación, y no se pueden editar.</small></p>';
  html+='<p style="margin-top:8px"><small><b>Códigos:</b> X Presente · F Falla · P Permiso · L Licencia · A Accidente Mutual · PP Permiso Pagado · V Vacaciones · LL Día lluvia. La fila "Día" muestra L M M J V S D (lunes a domingo); el fondo resaltado indica feriado — haz clic en un día para alternar laborable/feriado. <b>Días efectivos</b> = X+V+PP+LL y X en feriados (para liquidación). <b>Días reales trabajados</b> = X fuera de feriado.</small></p>';
  return html;
}
// Qué tiene cada persona en el mes, para poder filtrar la grilla.
//
// Se calcula sobre la PLANILLA, que es lo que la grilla muestra, y no sobre
// los marcajes del reloj: si se mezclaran, "tiene una falta" significaría
// dos cosas distintas según de dónde se mirara. Los días no laborables se
// excluyen del conteo de vacíos, porque un domingo en blanco no es un
// problema y contarlo hacía que todos los trabajadores aparecieran con huecos.
function resumenDeEstadosDelMes(w,y,m){
  const prefijo=y+'-'+String(m).padStart(2,'0');
  const nd=new Date(y,m,0).getDate();
  // OJO: en memoria el campo se llama "date", no "fecha". La base guarda
  // "fecha" y dbToAtt() la renombra. Con a.fecha.startsWith() salía un
  // TypeError y renderMatrix() se caía entero, con lo cual el filtro no
  // filtraba nada y la tarja quedaba con el render anterior.
  const filas=attendance.filter(a=>a.code===w.code&&String(a.date||'').startsWith(prefijo));
  const estados=new Set(filas.map(a=>a.estado));
  const conF=filas.some(a=>a.estado==='F');
  const conPermiso=filas.some(a=>['P','L','A','PP','V'].includes(a.estado));
  let vacios=0,laborables=0;
  for(let d=1;d<=nd;d++){
    if(isFeriado(y,m,d))continue;
    laborables++;
    const iso=prefijo+'-'+String(d).padStart(2,'0');
    if(!filas.some(a=>a.date===iso))vacios++;
  }
  return {conF,conPermiso,vacios,laborables,estados};
}
function renderMatrix(){
  const y=parseInt(document.getElementById('matYear').value);
  const m=parseInt(document.getElementById('matMonth').value);
  const supervisorCode=document.getElementById('matSupervisorFilter').value;
  const workerCode=document.getElementById('matWorkerFilter').value;
  const estadoFiltro=(document.getElementById('matEstadoFiltro')||{}).value||'';
    // Y EL FILTRO DE ACTIVOS E INACTIVOS, QUE ANTES NO ESTABA EN ESTA TARJA
    //
    // Y sale del select, y el valor vacío es "los dos", que no es lo mismo que "ninguno": es para
    // cuando uno está revisando un mes viejo y quiere ver a quién estaba y a quién no.
    //
    // Y se aplica JUNTO con el de supervisor y el de trabajador, no después y aparte: los tres
    // acotan la misma lista, y si el de equipo se aplicara al final, sobre una lista ya filtrada,
    // el "N de M" del mensaje contaría sobre un M que nadie está mirando.
    const equipoFiltro=(document.getElementById('matEstadoEquipo')||{}).value||'';
    const base=workers.filter(worker=>(!supervisorCode||worker.supervisor_code===supervisorCode)&&
      (!workerCode||worker.code===workerCode)&&
      // Y el que no trae status cuenta como activo: es lo que hace "workerToDb", que le pone
      // "'activo'" cuando no viene nada.
      (!equipoFiltro||String(worker.status||'activo')===equipoFiltro));

  let filteredWorkers=base;
  if(estadoFiltro){
    // Se calcula una vez por persona y se reutiliza para el filtro y para
    // el mensaje: si se calculara dos veces, el mensaje podría contar
    // distinto de lo que se ve.
    const resumen=new Map(base.map(w=>[w.code,resumenDeEstadosDelMes(w,y,m)]));
    filteredWorkers=base.filter(w=>{
      const r=resumen.get(w.code);
      if(estadoFiltro==='F')return r.conF;
      if(estadoFiltro==='P')return r.conPermiso;
      if(estadoFiltro==='vacio')return r.vacios>0;
      if(estadoFiltro==='todoX')return r.laborables>0&&r.vacios===0&&!r.conF&&!r.conPermiso;
      return true;
    });
    const msg=document.getElementById('matEstadoFiltroMsg');
    if(msg){
      msg.textContent=filteredWorkers.length
        ?filteredWorkers.length+' de '+base.length+' persona(s)'
        :'Ninguna persona cumple ese filtro';
    }
  }else{
    const msg=document.getElementById('matEstadoFiltroMsg');
    if(msg)msg.textContent='';
  }

  // La tarja ordena por código, de menor a mayor. Antes salía en el orden
  // en que los trajo la base (por nombre), así que con los códigos ya
  // completados a 4 dígitos la columna se veía prolija pero en un orden
  // que no era ni de código ni de nombre, que es lo más difícil de leer.
  // El nombre queda como segundo criterio para desempatar.
  filteredWorkers.sort((a,b)=>compararPorCodigo(a.code,b.code)||a.name.localeCompare(b.name));
  document.getElementById('matrixArea').innerHTML=buildMatrixHtml(y,m,filteredWorkers);
  if(typeof marcarTarjaSoloLectura==='function')marcarTarjaSoloLectura();
}
function refreshAttendanceMatrix(){
  if(document.getElementById('v-supervisores').classList.contains('active'))renderSupervisorMatrix();
  else renderMatrix();
}
// ------------------------------------------------------------------
// EL MOTIVO DEL CAMBIO
// ------------------------------------------------------------------
// Por qué un cuadro propio y no un prompt(): el motivo queda guardado para
// siempre en la bitácora, así que no es un dato de paso. Con prompt() no se
// ve qué se está cambiando, ni se puede corregir, y el texto se pierde si
// alguien aprieta Cancelar sin querer.
//
// La base de datos es la que exige el motivo (migración 028): si falta,
// rechaza la escritura. Esta función no lo pide "para ser buena", lo pide
// porque la base lo va a rechazar. Por eso `guardarAsistencia` primero
// intenta y, si la base dice "falta el motivo", recién ahí abre el cuadro.
// Un camino nuevo que se olvide del motivo no deja un cambio sin rastro:
// deja un error, que es justo lo que hay que ver.
function motivoEsValido(motivo){
  return String(motivo||'').trim().length>=5;
}
function faltaMotivoEnElError(error){
  const t=String((error&&error.message)||error||'').toLowerCase();
  return t.includes('motivo')&&(t.includes('falta')||t.includes('escribe')||t.includes('minimo'));
}
// ¿El error es "todavía no está aplicada la migración que hace falta"?
//
// ESTO ESTABA MAL Y SE VIO EN PANTALLA AL DESVINCULAR.
//
// Se buscaba "does not exist" en el mensaje, pero PostgREST no escribe eso.
// Escribe:
//
//   Could not find the function public.desvincular_trabajador(...) in the
//   schema cache
//
// Con el patrón anterior el error no se reconocía, se caía al mensaje
// crudo, y la persona veía una línea de inglés técnico sin ninguna pista
// de que lo que le faltaba era abrir el SQL Editor y correr una
// migración. Peor todavía: pasaba en un formulario donde ya había escrito
// la fecha de término y el artículo, así que parecía que esos datos estaban
// mal.
//
// Se busca por las dos formas y por el nombre de la función, que es lo
// único que no cambia entre versiones de PostgREST.
const SIN_MIGRACION=[
  /does not exist/i, /no existe/i, /not exist/i,
  /could not find the function/i,   // <- el que salía en la pantalla
  /undefined function/i, /schema cache/i,
  /42883/,   // undefined_function
  /42P01/,   // undefined_table
  /42703/    // undefined_column: la migración quedó a medias
];
// Con `nombres` el error tiene que mencionar esa función o esa tabla. Sin
// eso, cualquier "no existe" (una tarjeta, un nombre) se tomaría por una
// migración faltante, y un falso positivo en un aviso de migración hace
// que la persona deje de mirar esos avisos.
function faltaLaMigracion(error,nombres){
  const t=String((error&&error.message)||error||'');
  if(!t)return false;
  if(!SIN_MIGRACION.some(re=>re.test(t)))return false;
  if(nombres&&nombres.length)return nombres.some(n=>t.includes(n));
  return true;
}
function errorEsAuditoriaSinMigrar(error){
  return faltaLaMigracion(error,['registrar_asistencia','asistencia_auditoria','auditar_asistencia']);
}
function errorEsRelojesSinMigrar(error){
  return faltaLaMigracion(error,['marcar_por_reloj','relojes','centros_costo','rotar_token_reloj']);
}
function errorEsDesvinculacionSinMigrar(error){
  return faltaLaMigracion(error,['desvincular_trabajador','diagnostico_desvinculacion']);
}
// Devuelve el motivo escrito, o null si la persona se arrepiente.
// No es async: resuelve con callbacks, porque el cuadro es un <dialog>
// nativo y se cierra con close().
function pedirMotivoCambio(opciones){
  const dlg=document.getElementById('dlgMotivo');
  const ta=document.getElementById('motivoTexto');
  const info=document.getElementById('motivoInfo');
  const err=document.getElementById('motivoError');
  document.getElementById('motivoTitulo').textContent=opciones.titulo||'Por qué hacés este cambio';
  info.innerHTML=opciones.detalle||'';
  // El texto de ayuda va como PLACEHOLDER, no escrito en el cuadro.
  //
  // Si estuviera escrito, apretar "Guardar" sin tocar nada guardaría esa
  // frase como motivo, y la bitácora se llenaría de "Jonathan Castro —
  // sin marca → V — Vacaciones:", que repite lo que ya está escrito
  // arriba y no dice POR QUÉ. Un motivo que no explica nada es peor que
  // ningún motivo: en una auditoría parece que alguien lo escribió.
  ta.value='';
  ta.placeholder=opciones.sugerido||'';
  err.textContent='';
  ta.oninput=()=>{err.textContent='';};
  return new Promise(resolve=>{
    // El resultado se guarda en una variable y se resuelve UNA sola vez.
    //
    // Antes se resolvía desde onclose leyendo el cuadro, y eso hacía que
    // apretar ESC guardara lo que hubiera escrito: ESC es cancelar, y con
    // ese comportamiento cerraba el cuadro guardando un motivo que nadie
    // había confirmado. Ahora ESC, el botón Cancelar y el clic afuera dan
    // todos cancelar.
    let resultado=null;
    let yaRespondido=false;
    const responder=valor=>{
      if(yaRespondido)return;
      yaRespondido=true;
      resolve(valor);
    };
    dlg.onclose=()=>responder(resultado);
    document.getElementById('motivoAceptar').onclick=()=>{
      if(!motivoEsValido(ta.value)){
        // No se cierra: se avisa adentro. Cerrar y abrir de nuevo para
        // corregir el texto es la forma más rápida de que alguien escriba
        // cualquier cosa y apriete Aceptar.
        err.textContent='Escribí el motivo: al menos 5 caracteres. Queda guardado en la bitácora.';
        ta.focus();
        return;
      }
      resultado=ta.value.trim();
      dlg.close();
    };
    document.getElementById('motivoCancelar').onclick=()=>{
      resultado=null;
      dlg.close();
    };
    dlg.showModal();
    ta.focus();
  });
}
// El motivo de los cambios que NO son correcciones.
//
// Un marcaje real no es una corrección del registro: es el hecho de que la
// persona estuvo ahí. Pedirle a alguien que explique por qué fichó sería
// absurdo. Pero igual queda trazado, porque ES un cambio de la planilla y
// en un mes de 46 personas no se distingue de los demás.
//
// El texto dice exactamente lo que pasó, con quién y a qué hora. No inventa
// una justificación: si alguien lo revisa dentro de un año, tiene que ser
// verdad. Que el reloj lo confirme después queda anotado, que es lo que
// hace que esta fila sea provisional y no una afirmación.
function motivoDeMarcaje(que,datos){
  const quien=miNombrePerfil();
  const extras=Object.entries(datos||{})
    .filter(([,v])=>v!==null&&v!==undefined&&v!=='')
    .map(([k,v])=>k+': '+v)
    .join(' · ');
  return que+(quien?' por '+quien:'')+(extras?' ('+extras+')':'');
}
// Un texto listo para el motivo, con lo que ya se sabe del cambio. Sirve de
// punto de partida: la persona casi siempre tiene que agregar el detalle que
// importa, y no tiene que volver a tipear el nombre del trabajador.
function motivoSugerido(code,iso,estadoNuevo){
  const w=workers.find(x=>x.code===code);
  const nombre=w?w.name:code;
  const actual=attendance.find(r=>r.code===code&&r.date===iso);
  const antes=actual?ESTADOS_TARJA.find(e=>e.v===actual.estado)?.t||actual.estado:'sin marca';
  const despues=estadoNuevo
    ?(ESTADOS_TARJA.find(e=>e.v===estadoNuevo)?.t||estadoNuevo)
    :'quitar la marca';
  return nombre+' — '+antes+' → '+despues+': ';
}
// Escribe por la función de la base, no con un upsert suelto, para que el
// motivo quede atado a la escritura en la misma transacción. Si se hicieran
// por separado, el motivo se perdería en el camino.
async function guardarAsistencia(code,iso,estado,hora,motivo,nota,origen){
  const {error}=await window.supabaseClient.rpc('registrar_asistencia',{
    p_code:code, p_fecha:iso, p_estado:estado,
    p_hora_llegada:hora||null, p_nota:nota||null,
    p_origen:origen||'manual', p_motivo:motivo
  });
  return error;
}
function avisarFallaAuditoria(error){
  const mensaje=String((error&&error.message)||error);
  alert('No se pudo guardar el cambio en la asistencia.\n\n'+
    mensaje+'\n\nLo que falta es aplicar la migración 028_auditoria_asistencia.sql '+
    '(en el SQL Editor de Supabase). Hasta que exista, los cambios manuales a la '+
    'asistencia NO quedan registrados: por eso no se guardan en vez de guardarlos sin rastro.\n\n'+
    'No se guardó nada: la asistencia sigue como estaba.');
}
// Devuelve true si se guardó. Importante: quien aprueba una solicitud
// necesita saber si el cambio entró de verdad antes de marcarla aprobada.
// "hora" es opcional: si se pasa, se guarda esa; si no, se conserva la que
// hubiera. La conciliación lo necesita, porque lleva la hora del reloj a
// la planilla y sin esto quedaba en blanco, que es justo el dato que
// después se usa para comparar.
//
// "opciones.motivo" es para los caminos que YA saben por qué: la
// justificación que aprobó administración, la conciliación con el reloj.
// Esos no abren el cuadro. Los que no lo traen, lo piden.
async function saveAttendanceState(code,iso,state,hora,opciones){
  opciones=opciones||{};
  const existing=attendance.find(record=>record.code===code&&record.date===iso);
  const origen=opciones.origen||'manual';
  // La carga del Excel va directo y sin motivo: son cientos de miles de
  // filas de una fuente externa, y meterlas en la bitácora taparía las
  // correcciones a mano, que son las que hay que revisar.
  if(opciones.sinAuditoria){
    const nuevaHora=state==='X'?String(hora||existing?.hora_llegada||'').slice(0,5):'';
    const {error}=await window.supabaseClient.from('asistencia').upsert(
      attToDb({code,date:iso,estado:state,hora_llegada:nuevaHora,nota:existing?.nota||'',origen}),
      {onConflict:'code,fecha'}
    );
    if(error){alert('No se pudo actualizar la asistencia: '+error.message);await loadAttendanceFromDB();refreshAttendanceMatrix();return false;}
    await loadAttendanceFromDB();
    refreshAttendanceMatrix();
    return true;
  }
  let motivo=opciones.motivo||'';
  if(!motivoEsValido(motivo)){
    const pedido=await pedirMotivoCambio({
      titulo:opciones.titulo||'Por qué cambiás la asistencia',
      detalle:'<b>'+escHtml((workers.find(x=>x.code===code)||{}).name||code)+'</b> — '+escHtml(iso)+
        (state?'<br>Se va a dejar como <b>'+escHtml((ESTADOS_TARJA.find(e=>e.v===state)||{}).t||state)+'</b>':'<br>Se va a <b>quitar la marca</b>')+
        (hora?' a las <b>'+escHtml(String(hora).slice(0,5))+'</b>':'')+
        '<br><small>Queda registrado con tu nombre y la hora. No se puede borrar después.</small>',
      sugerido:opciones.sugerido||motivoSugerido(code,iso,state)
    });
    if(!pedido)return false;
    motivo=pedido;
  }
  const nuevaHora=state==='X'?String(hora||existing?.hora_llegada||'').slice(0,5):'';
  let error=await guardarAsistencia(code,iso,state,nuevaHora,motivo,
    opciones.nota!==undefined?opciones.nota:(existing?.nota||''),origen);
  if(error){
    // La base no tiene la función, o la 028 no está aplicada. Decirlo
    // claro: si no, el mensaje "function does not exist" no dice que lo
    // que falta es aplicar una migración.
    if(errorEsAuditoriaSinMigrar(error)||faltaMotivoEnElError(error)){
      avisarFallaAuditoria(error);
      await loadAttendanceFromDB();refreshAttendanceMatrix();
      return false;
    }
    alert('No se pudo actualizar la asistencia: '+error.message);
    await loadAttendanceFromDB();refreshAttendanceMatrix();
    return false;
  }
  await loadAttendanceFromDB();
  refreshAttendanceMatrix();
  return true;
}
function editAttendanceCell(cell){
  // Quien puede pedir cambios pero no aprobarlos (supervisores, técnica)
  // nunca modifica la tarja: se abre la ventana de solicitud.
  if(typeof puede==='function'&&!puedeEditarTarjaDirectamente()){
    const code=decodeURIComponent(cell.dataset.code);
    const iso=cell.dataset.date;
    const w=workers.find(x=>x.code===code);
    if(puede('tarja.solicitar_cambio')){
      showView('solicitar-cambio');
      const selW=document.getElementById('sol-worker');
      if(selW)selW.value=code;
      const f=document.getElementById('sol-fecha');
      if(f)f.value=iso;
      if(typeof actualizarEstadoActual==='function')actualizarEstadoActual();
    }else if(confirm(`No tienes permiso para modificar la tarja.\n\n¿Solicitar el cambio de estado de ${w?w.name:code} el ${iso}?`)){
      showView('solicitar-cambio');
      const selW=document.getElementById('sol-worker');
      if(selW)selW.value=code;
      const f=document.getElementById('sol-fecha');
      if(f)f.value=iso;
      if(typeof actualizarEstadoActual==='function')actualizarEstadoActual();
    }
    return;
  }
  const code=decodeURIComponent(cell.dataset.code);
  const iso=cell.dataset.date;
  const existing=attendance.find(record=>record.code===code&&record.date===iso);
  const editor=document.createElement('select');
  editor.className='attendance-cell-editor';
  editor.innerHTML=`<option value="">Auto / vacío</option>${cell.dataset.auto==='true'?'<option value="__auto__">X automática</option>':''}<option value="X">X</option><option value="F">F</option><option value="P">P</option><option value="L">L</option><option value="A">A</option><option value="PP">PP</option><option value="V">V</option><option value="LL">LL — Día lluvia</option>`;
  editor.value=existing?existing.estado:(cell.dataset.auto==='true'?'__auto__':'');
  cell.replaceChildren(editor);
  let changed=false;
  editor.addEventListener('click',event=>event.stopPropagation());
  editor.addEventListener('change',async()=>{
    changed=true;
    editor.disabled=true;
    await saveAttendanceState(code,iso,editor.value);
  });
  editor.addEventListener('blur',()=>{if(!changed)refreshAttendanceMatrix();});
  editor.focus();
  if(typeof editor.showPicker==='function'){
    try{editor.showPicker();}catch(error){}
  }
}
function toggleDay(iso){
  const [y,m,d]=iso.split('-').map(Number);
  const cur = dayOverrides[iso] ? dayOverrides[iso] : (isFeriado(y,m,d)?'fer':'lab');
  dayOverrides[iso] = cur==='fer' ? 'lab' : 'fer';
  save();
  renderMatrix();
}

// ------------------------------------------------------------------
// LOS DOS EXCEL, Y CÓMO SABER CUÁL ES
// ------------------------------------------------------------------
// Hay dos importadores y piden archivos con formas distintas:
//
//  - el del RELOJ (pestaña "Registrar marcaje"): el reporte de RelojControl,
//    con Tipo/Evento, Rut, Colaborador, Fecha y Hora. Cada fila es un
//    fichaje.
//  - el de la PLANILLA (esta pestaña): columnas codigo, fecha, estado,
//    hora_llegada. Cada fila es el resumen del día de un trabajador.
//
// Antes no se distinguían. Si elegías el archivo equivocado, el único
// mensaje era "no se encontraron filas válidas (revisa columnas codigo y
// fecha)", que no dice nada de qué hay que hacer. Ahora se mira el
// encabezado y se dice qué es el archivo y a dónde va.
const FORMATO_EXCEL={
  reloj:['tipo','evento','rut','colaborador','dispositivo'],
  planilla:['codigo','estado','hora_llegada','tipo_permiso']
};
function detectarFormatoExcel(filas){
  if(!filas||!filas.length)return 'desconocido';
  // Se miran los encabezados de las primeras filas con datos, no solo la
  // primera: algunos exportadores dejan una fila de título antes.
  const claves=new Set();
  filas.slice(0,5).forEach(f=>Object.keys(f||{}).forEach(k=>claves.add(normalizar(k))));
  const tiene=n=>[...claves].some(k=>k===n||k.indexOf(n)===0);
  const puntua=formato=>FORMATO_EXCEL[formato].filter(tiene).length;
  const reloj=puntua('reloj');
  const planilla=puntua('planilla');
  if(reloj>=2&&reloj>=planilla)return 'reloj';
  if(planilla>=1)return 'planilla';
  if(reloj>=1)return 'reloj';
  return 'desconocido';
}
function leerPrimeraHoja(archivo){
  return new Promise((resolver,rechazar)=>{
    const lector=new FileReader();
    lector.onerror=()=>rechazar(new Error('No se pudo abrir el archivo.'));
    lector.onload=e=>{
      try{
        // cellDates:true para que las columnas de fecha lleguen como Date.
        // Sin esto llegan como número de serie (46293) y no hay forma
        // saber que es una fecha.
        const libro=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:true});
        const hoja=libro.Sheets[libro.SheetNames[0]];
        if(!hoja)throw new Error('El archivo no tiene hojas.');
        // Y raw NO se pone en false, a propósito: la hora del reloj viene
        // como fracción del día (0,3188 = 07:39) y como número de Excel
        // (21 = 21:00). Con raw:false los dos llegan como texto y
        // `horaDesdeValor` los reconocería solo por el patrón "07:45", que
        // no existe en "0.31883": la hora se leería vacía.
        //
        // Es un error silencioso: el marcaje se guardaría sin hora y nadie
        // vería el problema hasta la conciliación, que es dos días después.
        resolver(XLSX.utils.sheet_to_json(hoja,{defval:''}));
      }catch(error){rechazar(error);}
    };
    lector.readAsArrayBuffer(archivo);
  });
}
function avisoFormatoEquivocado(contenedor,formatoDetectado,nombre){
  if(!contenedor)return;
  if(formatoDetectado==='reloj'){
    contenedor.innerHTML=
      '<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px">'+
      '<b>Este archivo es el reporte del reloj, no una planilla.</b><br>'+
      'Trae columnas <b>Tipo</b>, <b>Evento</b>, <b>Rut</b>, <b>Colaborador</b> y <b>Dispositivo</b>: '+
      'cada fila es un fichaje, no el resumen de un día. Por eso acá no se encontró nada que cargar.<br><br>'+
      '<button class="btn primary" type="button" onclick="llevarArchivoAlMarcajes()">Cargarlo en la pestaña de marcajes</button> '+
      '<small style="display:block;margin-top:6px">O ve a <b>Registrar marcaje → Importar marcajes desde Excel</b> y selecciónalo ahí.</small>'+
      '</div>';
  }else if(formatoDetectado==='planilla'){
    contenedor.innerHTML=
      '<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px">'+
      '<b>Este archivo es una planilla, no el reporte del reloj.</b><br>'+
      'Trae columnas de <b>codigo</b>, <b>fecha</b> y <b>estado</b>: cada fila es el resumen del día de un trabajador.<br><br>'+
      '<button class="btn primary" type="button" onclick="llevarArchivoAlMarcajes()">Ir a la pestaña correcta</button>'+
      '</div>';
  }
}
// Pasa el archivo que ya estaba elegido a la pestaña de marcajes, para que
// no haya que buscarlo otra vez en el disco.
//
// Un input de archivos no se puede rellenar por código: no hay forma de
// asignarle un File. Así que se abre la pestaña correcta, se le pone el
// nombre del archivo arriba y se pide seleccionarlo de nuevo. Decirlo es
// mejor que fingir que se cargó, y mejor que hacerlo buscar en "Recent
// Files" algo que ya tenía abierto.
let archivoExcelParaMarcajes=null;
function llevarArchivoAlMarcajes(){
  if(!archivoExcelParaMarcajes)return;
  showView('asistencia');
  const tab=document.querySelector('[data-attendance-tab="marcaje"]');
  if(tab)tab.click();
  setTimeout(()=>{
    const box=document.getElementById('marcajesExcelMsg');
    if(box)box.innerHTML='<div class="gpsWarn">Estás en la pestaña correcta. Selecciona de nuevo '+
      '<b>'+escHtml(archivoExcelParaMarcajes.name)+'</b> y aprieta <b>Revisar archivo</b>.</div>';
  },150);
}
async function loadAttendance(){
  if(!exigirPermiso('tarja.excel','No tienes permiso para cargar asistencia desde Excel.'))return;
  const f=document.getElementById('attFile').files[0];
  const salida=document.getElementById('loadMsg');
  if(!f){alert('Selecciona un archivo');return;}
  archivoExcelParaMarcajes=f;
  salida.innerHTML='<small>Leyendo el archivo…</small>';
  let filas;
  try{
    filas=await leerPrimeraHoja(f);
  }catch(error){
    salida.innerHTML='<small style="color:var(--danger)">No se pudo leer el archivo: '+escHtml(error.message)+'</small>';
    return;
  }
  if(!filas.length){salida.innerHTML='<small style="color:var(--danger)">El archivo no tiene filas.</small>';return;}

  // ¿Es el archivo equivocado? Se dice antes deyar de revisar, porque el
  // error de más abajo ("no se encontraron filas válidas") no lo aclara.
  const formato=detectarFormatoExcel(filas);
  if(formato!=='planilla'&&formato!=='desconocido'){avisoFormatoEquivocado(salida,formato,f.name);return;}

  const built=[];
  const sinFecha=[];
  const codigoDesconocido=[];
  filas.forEach(r=>{
    const leido=String(valorDeColumna(r,['codigo','cod','code','nro','numero'])??'').trim();
    const fecha=fechaDesdeValor(valorDeColumna(r,['fecha','dia','fec']));
    if(!leido||!fecha){
      if(leido&&!fecha)sinFecha.push(leido);
      return;
    }
    // Se busca al trabajador y se guarda SU código, no el texto del Excel.
    //
    // Es lo que evita dos problemas que serían muy molestos:
    //  - en el Excel alguien escribe 1, 01, 001 o 0001 y los cuatro son el
    //    mismo trabajador;
    //  - asistencia tiene llave foránea a trabajadores.code. Si se
    //    guardara el texto tal cual, "1" no entraría contra un trabajador
    //    guardado como "0001", y el error de la base ("violates foreign
    //    key constraint") no dice qué fila era ni por qué.
    const ficha=trabajadorPorCodigoTolerante(leido,workers)
      ||trabajadorPorCodigoTolerante(leido,todosWorkers);
    if(!ficha){codigoDesconocido.push(leido);return;}
    const code=ficha.code;
    let estado=normalizar(valorDeColumna(r,['estado','estado asistencia','situacion'])).toUpperCase();
    if(!ESTADOS_TARJA.some(e=>e.v===estado)){
      // compatibilidad con formato anterior (tipo_permiso / permiso)
      const tipo=normalizar(valorDeColumna(r,['tipo_permiso','tipo permiso','permiso']));
      const horaLlegada=horaDesdeValor(valorDeColumna(r,['hora_llegada','hora llegada','hora','ingreso']));
      if(estado&&!ESTADOS_TARJA.some(e=>e.v===estado)){
        if(/lluvia/.test(tipo))estado='LL';
        else if(/licencia/.test(tipo))estado='L';
        else if(/accidente/.test(tipo))estado='A';
        else if(/pagado/.test(tipo))estado='PP';
        else if(/vacacion/.test(tipo))estado='V';
        else if(/permiso/.test(tipo))estado='P';
        else if(/falta/.test(tipo))estado='F';
      }
      if(!ESTADOS_TARJA.some(e=>e.v===estado))estado=horaLlegada?'X':'F';
    }
    const hora=horaDesdeValor(valorDeColumna(r,['hora_llegada','hora llegada','hora','ingreso']));
    built.push({code,date:fecha,estado,hora_llegada:hora,
      nota:String(valorDeColumna(r,['nota','observacion','comentario'])||'').trim(),origen:'importado'});
  });

  if(!built.length){
    // Ahora sí se puede decir algo útil: qué se buscó y qué se encontró.
    const encabezado=Object.keys(filas[0]||{}).join(', ');
    salida.innerHTML='<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">'+
      '<b>No se encontró ninguna fila que se pueda cargar.</b><br>'+
      'Se busca un <b>codigo</b> y una <b>fecha</b> en cada fila.<br>'+
      'Columnas del archivo: <small>'+escHtml(encabezado||'(ninguna)')+'</small><br>'+
      (codigoDesconocido.length?'<br>Códigos que no están en la base: '+escHtml([...new Set(codigoDesconocido)].slice(0,12).join(', '))+
        (codigoDesconocido.length>12?' … y '+(codigoDesconocido.length-12)+' más':'')+'<br>':'')+
      (sinFecha.length?'<br>Filas con código pero sin fecha legible: '+escHtml([...new Set(sinFecha)].slice(0,12).join(', '))+'<br>':'')+
      '<br><small>Si el archivo tiene las columnas del reloj (Tipo, Evento, Rut, Colaborador), es el reporte de marcajes y va en la otra pestaña.</small>'+
      '</div>';
    return;
  }
  const problemas=[];
  if(codigoDesconocido.length)problemas.push(codigoDesconocido.length+' fila(s) con un código que no está en la base (se saltaron)');
  if(sinFecha.length)problemas.push(sinFecha.length+' fila(s) sin fecha legible (se saltaron)');
  if(problemas.length){
    salida.innerHTML='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px;margin-bottom:10px">'+
      '<b>Faltan datos en algunas filas:</b><ul style="margin:4px 0 0;padding-left:18px">'+
      problemas.map(p=>'<li>'+escHtml(p)+'</li>').join('')+'</ul>'+
      // Los códigos se nombran uno por uno. Decir "hay 1 que no existe"
      // obliga a abrir el Excel a buscarlo; nombrarlo lo hace evidente que
      // es un código mal escrito y no un trabajador que falta.
      (codigoDesconocido.length?'<p style="margin:6px 0 0">Códigos que no están en la base: <b>'+
        escHtml([...new Set(codigoDesconocido)].slice(0,20).join(', '))+'</b>'+
        (codigoDesconocido.length>20?' … y '+(codigoDesconocido.length-20)+' más':'')+
        '<br><small>Si el trabajador existe, es que el código está mal escrito en el Excel. Si no existe, cárgalo en la ficha de trabajadores primero.</small></p>':'')+
      (sinFecha.length?'<p style="margin:6px 0 0">Filas con código pero sin fecha legible: <b>'+
        escHtml([...new Set(sinFecha)].slice(0,20).join(', '))+'</b></p>':'')+
      '</div>'+
      '<div><b>'+built.length+'</b> registro(s) listos para cargar. '+
      '<button class="btn primary" type="button" onclick="confirmarCargaPlanilla()">Cargar '+built.length+'</button></div>';
    filasPendientesDeCarga=built;
    return;
  }
  filasPendientesDeCarga=built;
  salida.innerHTML='<div><b>'+built.length+'</b> registro(s) listos para cargar. '+
    '<button class="btn primary" type="button" onclick="confirmarCargaPlanilla()">Cargar '+built.length+'</button></div>';
}
// Botón aparte del "Cargar", para que escribir 200 filas en la planilla sea
// una decisión y no el efecto secundario de elegir un archivo.
let filasPendientesDeCarga=null;
async function confirmarCargaPlanilla(){
  const built=filasPendientesDeCarga;
  if(!built||!built.length)return;
  const salida=document.getElementById('loadMsg');
  if(!confirm(`Se van a escribir ${built.length} registros en la tarja.\n\nSi algún día ya tiene estado, se sobrescribe.\n\n¿Continuar?`))return;
  salida.innerHTML='<small>Guardando…</small>';
  // origen 'importado': la carga del Excel no deja traza en la bitácora.
  // Son cientos de miles de filas de una fuente externa y taparían las
  // correcciones a mano, que son las que hay que revisar.
  const {error}=await window.supabaseClient.from('asistencia').upsert(built.map(attToDb),{onConflict:'code,fecha'});
  if(error){salida.innerHTML='<small style="color:var(--danger)">Error guardando en la base de datos: '+escHtml(error.message)+'</small>';return;}
  filasPendientesDeCarga=null;
  await loadAttendanceFromDB();
  salida.innerHTML='<small>'+built.length+' registros cargados.</small>';
  renderMatrix();
}

// ---------- tarjeta temporal (billetera) ----------
function tempCardPairHtml(w,suffix){
  return `<div class="temp-card-pair">${cardFrontHtml(w,`${suffix}-front`,true)}${cardBackHtml(w,`${suffix}-back`,true)}</div>`;
}
async function drawTempCardPairCodes(w,suffix){
  const cardId=await getOrIssueCard(w.code,'temporal');
  drawCardCodes(cardId,`${suffix}-front`,{barcodeHeight:26,barcodeWidth:2,fontSize:7,margin:10});
  drawCardCodes(cardId,`${suffix}-back`,{qrSize:280,barcodeHeight:24,barcodeWidth:2,fontSize:7,margin:10});
}
async function printTemp(){
  const code=document.getElementById('w-code').value.trim();
  const name=document.getElementById('w-name').value.trim();
  const spec=document.getElementById('w-spec').value.trim();
  if(!code||!name){alert('Ingresa al menos código y nombre antes de imprimir la tarjeta temporal.');return;}
  const photo=tempCasual||document.getElementById('pre-casual').src||'';
  const wTemp={
    code,name,spec,casual:photo,safety:null,
    emerg_name:document.getElementById('w-emerg-name').value.trim(),
    emerg_phone:document.getElementById('w-emerg-phone').value.trim(),
    emerg_rel:document.getElementById('w-emerg-rel').value.trim()
  };
  const win=document.getElementById('tempPrintArea')||(()=>{const d=document.createElement('div');d.id='tempPrintArea';d.style.display='none';document.body.appendChild(d);return d;})();
  const suffix=`temp-${Date.now()}`;
  win.innerHTML=tempCardPairHtml(wTemp,suffix);
  document.body.classList.add('printing-temporary');
  document.body.querySelectorAll('.view,#mainNav,#subNav,header,#camModal').forEach(x=>x.style.display='none');
  win.style.display='block';
  await drawTempCardPairCodes(wTemp,suffix);
  setTimeout(()=>{
    try{window.print();}
    finally{
      document.body.classList.remove('printing-temporary');
      document.body.querySelectorAll('.view,#mainNav,#subNav,header,#camModal').forEach(x=>x.style.display='');
      win.style.display='none';
    }
  },300);
}

// ---------- datos de empresa ----------
// Ahora viven en Supabase (tabla empresa), no en el navegador: así el
// logo y los datos son los mismos para todos los que ven la tarjeta.
// La gestión está en el módulo multi-empresa (renderEmpresas/saveEmpresa).
// La función loadEmpresaForm se conserva como alias porque la llama initView.
function loadEmpresaForm(){renderEmpresas();renderPerfilEmpresas();}

// ---------- qué empresas ve cada usuario ----------
async function renderPerfilEmpresas(){
  const el=document.getElementById('perfilEmpresasList');
  if(!el)return;
  if(!exigirPermiso('sistema.usuarios','Solo un administrador puede asignar empresas.')){el.innerHTML='<small>Sin permiso.</small>';return;}
  if(!empresas.length){el.innerHTML='<small>Crea primero una empresa.</small>';return;}
  const [p1,p2,p3]=await Promise.all([
    window.supabaseClient.from('perfiles').select('id,nombre,rol,activo').order('nombre'),
    window.supabaseClient.from('perfil_empresas').select('user_id,empresa_id'),
    window.supabaseClient.from('perfil_roles').select('user_id,rol')
  ]);
  if(p1.error){el.innerHTML=`<small style="color:var(--danger)">No se pudo cargar: ${p1.error.message}</small>`;return;}
  const asignadas={};
  (p2.data||[]).forEach(x=>{(asignadas[x.user_id]=asignadas[x.user_id]||[]).push(x.empresa_id);});
  // el rol se lee de perfil_roles (varios por usuario), no de la columna vieja
  const rolesDe={};
  (p3.data||[]).forEach(x=>{(rolesDe[x.user_id]=rolesDe[x.user_id]||[]).push(x.rol);});
  // carga el catálogo de roles para poder mostrar los nombres y no las claves
  await cargarCatalogosPermisos();
  el.innerHTML=(p1.data||[]).map(p=>{
    const esAdmin=(rolesDe[p.id]||[]).includes('admin')||p.rol==='admin';
    const checks=empresas.map(e=>`<label style="width:auto;display:inline-flex;align-items:center;gap:4px;margin:0 10px 0 0;text-transform:none;font-size:.78rem">
        <input type="checkbox" class="empchk-${p.id}" value="${e.id}" style="width:auto" ${esAdmin||(asignadas[p.id]||[]).includes(e.id)?'checked':''} ${esAdmin?'disabled':''}> ${escHtml(e.nombre)}
      </label>`).join('');
    const roles=(rolesDe[p.id]||[]).map(nombreDeRol).join(', ')||'sin roles';
    return `<div style="border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:8px">
      <div class="list-item" style="cursor:default;border:0;padding:0 0 6px">
        <span style="flex:1"><b>${escHtml(p.nombre||'(sin nombre)')}</b> <small>· ${escHtml(roles)}</small>${p.activo?'':' <small>(inactivo)</small>'}</span>
        <button class="btn secondary" style="margin:0" type="button" onclick="guardarPerfilEmpresas('${p.id}')">Guardar</button>
      </div>
      <div>${esAdmin?'<small style="color:var(--muted)">El rol Administración ve todas las empresas.</small>':checks||'<small>Sin empresas a las que acceder.</small>'}</div>
    </div>`;
  }).join('')||'<small>Todavía no hay usuarios invitados.</small>';
}
async function guardarPerfilEmpresas(id){
  if(!exigirPermiso('sistema.usuarios'))return;
  const elegidas=[...document.querySelectorAll('.empchk-'+id+':checked')].map(c=>parseInt(c.value));
  const {error:e1}=await window.supabaseClient.from('perfil_empresas').delete().eq('user_id',id);
  if(e1){alert('No se pudieron limpiar las empresas: '+e1.message);return;}
  if(elegidas.length){
    const {error:e2}=await window.supabaseClient.from('perfil_empresas').insert(elegidas.map(empresa_id=>({user_id:id,empresa_id})));
    if(e2){alert('No se pudieron guardar las empresas: '+e2.message);return;}
  }
  alert('Empresas actualizadas.');
  if(miPerfil&&miPerfil.id===id)await loadEmpresas();
}

// ---------- usuarios del sistema (tabla perfiles) ----------
// Un usuario puede tener VARIOS roles; sus permisos son la unión.
let rolesDisponibles=[];
async function loadPerfiles(){
  const el=document.getElementById('usuariosList');
  if(!exigirPermiso('sistema.usuarios','Solo un administrador puede gestionar usuarios.')){el.innerHTML='<small>Sin permiso.</small>';return;}
  const [p1,p2,p3]=await Promise.all([
    window.supabaseClient.from('perfiles').select('*').order('nombre'),
    window.supabaseClient.from('perfil_roles').select('user_id,rol'),
    window.supabaseClient.from('roles_sistema').select('*').order('orden')
  ]);
  if(p1.error){el.innerHTML=`<small style="color:var(--danger)">No se pudo cargar: ${p1.error.message}</small>`;return;}
  const perfiles=p1.data||[];
  rolesDisponibles=(p3.data&&p3.data.length)?p3.data
    :['admin','rrhh','oficina','porteria','supervisores','tecnica','bodega','prevencion']
      .map((r,i)=>({rol:r,nombre:r,orden:i+1}));
  const rolesPorUsuario={};
  (p2.data||[]).forEach(x=>{(rolesPorUsuario[x.user_id]=rolesPorUsuario[x.user_id]||[]).push(x.rol);});
  el.innerHTML=perfiles.map(p=>{
    const asignados=rolesPorUsuario[p.id]||(p.rol?[p.rol]:[]);
    const checks=rolesDisponibles.map(r=>
      `<label style="width:auto;display:inline-flex;align-items:center;gap:4px;margin:0 10px 0 0;text-transform:none;font-size:.78rem">
         <input type="checkbox" class="rolchk-${p.id}" value="${r.rol}" style="width:auto" ${asignados.includes(r.rol)?'checked':''}> ${r.nombre}
       </label>`).join('');
    // El vínculo con la ficha se ofrece para CUALQUIER trabajador, no
    // solo los supervisores: un maestro o un bodeguero también puede
    // tener su propia cuenta. Para un supervisor además acota la vista
    // de Supervisores a su equipo.
    const vinculo=`<label style="margin:12px 0 0;font-size:.75rem;color:var(--muted)">Ficha del trabajador
        <select id="ficha-${p.id}" style="width:auto;min-width:240px;margin:4px 0 0">
          <option value="">Sin vincular (ve todos los equipos)</option>
          ${workers.map(s=>`<option value="${s.code}" ${p.trabajador_code===s.code?'selected':''}>${escHtml(s.code+' - '+s.name+(s.is_supervisor?' (supervisor)':''))}</option>`).join('')}
        </select></label>`;
    return `<div style="border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:8px">
      <div class="list-item" style="cursor:default;border:0;padding:0 0 6px">
        <span style="flex:1"><b>${escHtml(p.nombre||'(sin nombre)')}</b><br><small>${p.id}</small></span>
        <label style="width:auto;display:flex;align-items:center;gap:4px;margin:0"><input type="checkbox" id="act-${p.id}" style="width:auto" ${p.activo?'checked':''}> Activo</label>
        <button class="btn secondary" style="margin:0" onclick="guardarPerfil('${p.id}')">Guardar</button>
      </div>
      <div style="margin-top:4px">${checks}${vinculo}</div>
    </div>`;
  }).join('') || '<small>Todavía no hay usuarios invitados.</small>';
}
// Un rol que la base va a rechazar. Se comprueba ANTES de guardar, porque
// el error de Postgres sale recién al final, con un texto que no nombra la
// casilla y dice "23514" en vez de "esa casilla no existe".
//
// El caso real: la casilla se dibuja desde "roles_sistema", y si ahí hay
// un rol que el "check" de la tabla no acepta (por ejemplo "supervisor" en
// vez de "supervisores"), se ve bien y no se puede guardar.
async function rolesQueLaBaseRechaza(){
  try{
    const {data,error}=await window.supabaseClient.rpc('roles_aceptados');
    if(error||!data)return null;         // la 025 no está: no se puede saber
    return Array.isArray(data)?data:[];
  }catch(error){return null;}
}
async function rolesInvalidosEnPantalla(seleccionados){
  const aceptados=await rolesQueLaBaseRechaza();
  if(!aceptados)return [];
  const {data}=await window.supabaseClient.from('roles_sistema').select('rol,nombre');
  const catalogo=data||[];
  return catalogo
    .filter(r=>seleccionados.includes(r.rol)&&!aceptados.includes(r.rol))
    .map(r=>`"${r.rol}"${r.nombre&&r.nombre!==r.rol?' ('+r.nombre+')':''}`);
}

// El error que salía era el de Postgres, tal cual:
//
//   No se pudieron guardar los roles: new row violates row-level security
//   policy for table "perfil_roles"
//
// Que no dice nada útil. La causa es concreta: la política de la base
// decide si quien guarda es mirando la columna vieja "perfiles.rol", que
// tiene un solo valor, mientras que la persona puede tener varios roles.
// Con la columna en 'supervisores' y el admin marcado en la lista, la base
// cree que no sos administrador y bloquea. La app lo detecta por el texto
// y da el camino corto.
function errorDeGuardarRoles(error){
  const msg=String((error&&error.message)||error||'');
  // El 23514 con un rol en el detalle: el catálogo tiene un rol que la
  // base no acepta. Sale con el nombre adentro, que es la parte útil.
  if(/23514|check constraint/i.test(msg)){
    const culpable=msg.match(/contains\s*\(([^)]*)\)/i);
    const campos=culpable?culpable[1].split(','):[];
    // El segundo campo de "perfiles" es el rol.
    const rol=campos[1]?campos[1].trim().replace(/^'|'$/g,''):'';
    return 'La base rechazó un rol que no existe.\n\n'+
      (rol?('El valor guardado fue: "'+rol+'"\n\n'):'')+
      'La lista de roles la tiene la tabla "roles_sistema", y hay una fila\n'+
      'con un rol que la base no acepta. El más común es "supervisor" en vez\n'+
      'de "supervisores": una letra de diferencia, y la casilla se ve igual.\n\n'+
      'QUÉ HACER\n'+
      'En el SQL Editor de Supabase, pega y ejecuta:\n\n'+
      '   migrations/025_roles_invalidos.sql\n\n'+
      'Arregla los datos que ya estaban guardados, saca del catálogo el rol\n'+
      'que sobra y deja el catálogo y la base diciendo lo mismo. Es\n'+
      're-ejecutable.\n\n'+
      'Si quieres ver primero qué rol es el que sobra, pega\n'+
      'sql/revisar-roles.sql: su paso 1 solo lee.\n\n'+
      'Lo que respondió la base: '+msg;
  }
  if(/row-level security|violates row-level|42501|403/i.test(msg)){
    return 'La base no dejó guardar los roles de este usuario.\n\n'+
      'Es un problema de la base, no de los datos que pusiste.\n\n'+
      'LA CAUSA\n'+
      'Hay dos criterios para "¿quién administra?": la tabla de roles, que\n'+
      'acepta varios por persona, y la columna vieja perfiles.rol, que es un\n'+
      'solo texto. Si al que está guardando le quedaste con varios roles\n'+
      'marcados y el primero no es Administración, la base cree que no es\n'+
      'administrador y bloquea el guardado —aunque en la pantalla veas el\n'+
      'menú completo.\n\n'+
      'QUÉ HACER\n'+
      'En el SQL Editor de Supabase, pega y ejecuta:\n\n'+
      '   1) migrations/016_permisos_coherentes.sql   (si no la has aplicado)\n'+
      '   2) migrations/024_permisos_escritura.sql   (deja el criterio bien)\n\n'+
      'O pega sql/desbloquear-roles.sql, que trae el diagnóstico primero y\n'+
      'dice cuál de las dos te falta.\n\n'+
      'Lo que respondió la base: '+msg;
  }
  return 'No se pudieron guardar los roles: '+msg;
}

async function guardarPerfil(id){
  if(!exigirPermiso('sistema.usuarios'))return;
  const activo=document.getElementById('act-'+id).checked;
  const roles=[...document.querySelectorAll('.rolchk-'+id+':checked')].map(c=>c.value);
  if(!roles.length){alert('Elige al menos un rol.');return;}
  // Antes de tocar la base: que ninguno de los roles marcados sea uno que
  // la base va a rechazar. El error de Postgres sale recién al final, con
  // un código (23514) que no dice qué casilla fue, y para entonces la
  // lista de roles de la persona ya quedó a medias.
  const invalidos=await rolesInvalidosEnPantalla(roles);
  if(invalidos.length){
    alert('Estos roles están en el catálogo de la app pero la base no los acepta:\n\n'+
      '   '+invalidos.join('\n   ')+'\n\n'+
      'Se ven como casillas válidas, pero al guardar Postgres los rechaza. El caso\n'+
      'típico es "supervisor" en vez de "supervisores", que se diferencian en una\n'+
      'sola letra.\n\n'+
      'Desmarca esas casillas, o ejecuta en el SQL Editor de Supabase:\n\n'+
      '   migrations/025_roles_invalidos.sql\n\n'+
      'que saca del catálogo lo que sobra y arregla lo que ya estaba guardado.');
    return;
  }
  const {data:sesion}=await window.supabaseClient.auth.getSession();
  const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
  if(miId===id&&!activo){
    alert('No puedes desactivar tu propio usuario, te quedarías sin acceso.');
    document.getElementById('act-'+id).checked=true;
    return;
  }
  if(miId===id&&!roles.includes('admin')&&soyAdmin()){
    alert('No te quites el rol Administración: te quedarías sin acceso al sistema.');
    const chk=document.querySelector('.rolchk-'+id+'[value="admin"]');
    if(chk)chk.checked=true;
    return;
  }
  const fichaSel=document.getElementById('ficha-'+id);
  const ficha=fichaSel&&fichaSel.value?fichaSel.value:null;
  // "perfiles.rol" es un solo valor y ya no es la fuente de la verdad (lo
  // es "perfil_roles"), pero partes antiguas todavía lo leen. Antes se
  // guardaba el PRIMER rol de la lista, y eso rompía cosas: con
  // "Supervisores" marcado antes que "Administración", la columna quedaba
  // en 'supervisores' y las políticas de la base —que la miraban— creían
  // que no eras administrador, aunque la tabla de roles sí tuviera el
  // admin. Se guarda 'admin' cuando lo tiene, que es el rol de más
  // alcance: es lo que un lector de la columna vieja espera encontrar.
  const rolPrincipal=roles.includes('admin')?'admin':roles[0];
  const {error:e1}=await window.supabaseClient.from('perfiles')
    .update({rol:rolPrincipal,activo,trabajador_code:ficha}).eq('id',id);
  if(e1){alert('No se pudo guardar: '+e1.message);return;}

  // ORDEN IMPORTANTE: primero se agregan los roles nuevos, después se
  // borran los que sobran. Al revés (borrar y después insertar) un fallo
  // en el insert dejaba al usuario SIN NINGÚN ROL: era un borrado de datos
  // disfrazado de guardado, y con el error que salía no se entendía que
  // se había perdido todo.
  const {data:previos}=await window.supabaseClient.from('perfil_roles')
    .select('rol').eq('user_id',id);
  const yaEstan=new Set((previos||[]).map(r=>r.rol));
  const faltan=roles.filter(rol=>!yaEstan.has(rol));
  if(faltan.length){
    const {error:e3}=await window.supabaseClient.from('perfil_roles')
      .insert(faltan.map(rol=>({user_id:id,rol})));
    if(e3){alert(errorDeGuardarRoles(e3));return;}
  }
  const sobran=[...yaEstan].filter(rol=>!roles.includes(rol));
  if(sobran.length){
    const {error:e2}=await window.supabaseClient.from('perfil_roles')
      .delete().eq('user_id',id).in('rol',sobran);
    if(e2){alert('Se agregaron los roles nuevos, pero no se pudieron quitar los que quedaron sin marcar: '+e2.message);return;}
  }
  await loadPermisosUsuario();
  if(typeof recalcularMiSupervisor==='function')recalcularMiSupervisor();
  alert('Usuario actualizado: '+roles.map(nombreDeRol).join(', ')+(ficha?' · ficha '+ficha:' · sin ficha vinculada'));
  loadPerfiles();
}

// ============================================================
// INVITAR USUARIO DESDE LA APP

// ============================================================
let empresas=[];            // [{id,nombre,logo_url,rut,giro,direccion,telefono,email,sitio_web,activa}]
let misEmpresas=[];         // ids a las que tiene acceso esta persona
let todosWorkers=[];        // todos los que devuelve la BD, sin filtrar
let empresaActual=0;        // 0 = todas las permitidas
let empresasCargadas=false;

// La app arma el HTML interpolando valores; los datos de empresa son
// texto libre y además se imprimen en tarjetas y PDF.
function escHtml(valor){
  return String(valor==null?'':valor).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function dbToEmpresa(r){
  return {
    id:r.id, nombre:r.nombre, logo:r.logo_url||'',
    rut:r.rut||'', giro:r.giro||'', direccion:r.direccion||'',
    telefono:r.telefono||'', email:r.email||'', sitio_web:r.sitio_web||'',
    hora_entrada:r.hora_entrada||'08:00',
    tolerancia_minutos:(r.tolerancia_minutos!=null)?Number(r.tolerancia_minutos):10,
    // hora_salida y colacion NO llevan un valor por omisión. Se devuelven
    // tal cual, y si están vacías la pantalla muestra vacío. Ponerles un
    // "08:00" o un "30" de relleno acá sería mostrar como acordado un dato que
    // nadie acordó.
    hora_salida:r.hora_salida||null,
    colacion_inicio:r.colacion_inicio||null,
    colacion_duracion_min:(r.colacion_duracion_min!=null)?Number(r.colacion_duracion_min):30,
    activa:r.activa!==false
  };
}
function empresaToDb(e){
  return {
    nombre:e.nombre, logo_url:e.logo||null,
    rut:e.rut||null, giro:e.giro||null, direccion:e.direccion||null,
    telefono:e.telefono||null, email:e.email||null, sitio_web:e.sitio_web||null,
    hora_entrada:e.hora_entrada||null, tolerancia_minutos:(e.tolerancia_minutos!=null)?Number(e.tolerancia_minutos):null,
    hora_salida:e.hora_salida||null,
    colacion_inicio:e.colacion_inicio||null,
    colacion_duracion_min:(e.colacion_duracion_min!=null)?Number(e.colacion_duracion_min):null,
    activa:e.activa!==false
  };
}
function veTodasLasEmpresas(){
  return (typeof puede==='function'&&puede('sistema.empresas'))||(typeof soyAdmin==='function'&&soyAdmin());
}
async function loadEmpresas(){
  empresas=[];misEmpresas=[];empresasCargadas=false;
  try{
    const {data,error}=await window.supabaseClient.from('empresa').select('*').order('nombre');
    if(error)throw new Error(error.message);
    empresas=(data||[]).map(dbToEmpresa);
    // No se confía solo en RLS: se leen explícitamente las empresas
    // asignadas, para que el acotado se cumpla también en la interfaz.
    misEmpresas=empresas.map(e=>e.id);
    if(!veTodasLasEmpresas()){
      const {data:sesion}=await window.supabaseClient.auth.getSession();
      const uid=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
      if(uid){
        const {data:pe}=await window.supabaseClient.from('perfil_empresas').select('empresa_id').eq('user_id',uid);
        misEmpresas=(pe||[]).map(x=>x.empresa_id);
      }else misEmpresas=[];
    }
    empresasCargadas=true;
    // "empresas" queda acotada a lo permitido: si algo la recorre, no ve
    // nombres de empresas a las que esta persona no tiene acceso.
    empresas=empresas.filter(e=>misEmpresas.includes(e.id));
  }catch(error){
    console.warn('No se pudieron cargar las empresas:',error.message);
    // Si es una columna que no existe, casi siempre es la 014 sin
    // aplicar. Se dice el archivo exacto en vez del texto de Postgres.
    const archivo=migracionQueFalta(error);
    mostrarAvisoPermisos(archivo
      ?'⚠️ No se pudieron cargar las empresas: falta migrations/'+archivo+'. Se ven todos los trabajadores sin filtro por empresa. Ejecútala en el SQL Editor, o si ya la ejecutaste: NOTIFY pgrst, \'reload schema\';'
      :'⚠️ No se pudieron cargar las empresas ('+error.message+'). Se ven todos los trabajadores sin filtro. Revisa que tengas empresas asignadas.');
  }
  aplicarFiltroEmpresas();
  renderSelectorEmpresas();
}
// El filtro vive en un solo punto: "workers" es la lista acotada, y las
// 65 referencias que ya existen en la app pasan a respetar la empresa.
function aplicarFiltroEmpresas(){
  if(!empresasCargadas){workers=todosWorkers;return;}   // fail-open antes de cargar
  // si a esta persona le quitaron la empresa que tenía seleccionada, se
  // vuelve a "todas" en vez de dejar la lista vacía
  if(empresaActual&&!empresas.some(e=>e.id===empresaActual))empresaActual=0;
  if(veTodasLasEmpresas()&&!empresaActual){workers=todosWorkers;return;}
  const permitidas=new Set(misEmpresas);
  workers=todosWorkers.filter(w=>{
    if(w.empresa_id&&!permitidas.has(w.empresa_id))return false;
    if(empresaActual&&w.empresa_id!==empresaActual)return false;
    return true;
  });
}
function cambiarEmpresa(id){
  empresaActual=id?parseInt(id):0;
  aplicarFiltroEmpresas();
  renderSelectorEmpresas();
  refreshAllWorkerPickers();
  // la vista abierta se reinicializa: cada una es dueña de sus propios <select>
  const activa=document.querySelector('section.view.active');
  if(activa)initView(activa.id.slice(2));
  renderMatrix();
}
// Los <select> de trabajador que comparten varias vistas se rellenan aquí;
// el resto los rellena initView() de la vista que esté abierta.
function refreshAllWorkerPickers(){
  const rellenos=[['kit-worker',fillKitSelects],['epp-worker',updateEppWorkerHint],
                  ['epp-filter',null],['assign-worker',null],['sup-view',null]];
  rellenos.forEach(([id,fn])=>{
    const sel=document.getElementById(id);
    if(!sel)return;
    const previo=sel.value;
    // en los filtros de bodega "vacío" significa todos
    // en los filtros de bodega "vacío" significa todos
    const base=(id==='epp-filter')?'<option value="">Todos los trabajadores</option>':'';
    const soloSupervisores=id==='sup-view';
    const lista=soloSupervisores?workers.filter(w=>w.is_supervisor):workers;
    sel.innerHTML=base+lista.map(opcionTrabajador).join('');
    if(lista.some(w=>w.code===previo))sel.value=previo;
    if(typeof fn==='function')fn();
  });
}
function renderSelectorEmpresas(){
  const sel=document.getElementById('empresaSel');
  if(!sel)return;
  if(empresas.length<2){
    // con una sola empresa no hay nada que elegir. Se ocultan las opciones
    // viejas igual, para que .value no apunte a una empresa ya perdida.
    sel.parentElement.style.display='none';
    sel.innerHTML=empresas.map(e=>`<option value="${e.id}">${escHtml(e.nombre)}</option>`).join('');
    sel.value=empresas.length?String(empresas[0].id):'';
    return;
  }
  sel.parentElement.style.display='';
  sel.innerHTML=`<option value="0">Todas las empresas (${workers.length})</option>`+
    empresas.filter(e=>misEmpresas.includes(e.id)).map(e=>
      `<option value="${e.id}" ${empresaActual===e.id?'selected':''}>${escHtml(e.nombre)}</option>`).join('');
  sel.value=String(empresaActual);
  // si la empresa seleccionada ya no está entre las permitidas, se suelta
  if(empresaActual&&!empresas.some(e=>e.id===empresaActual)){
    empresaActual=0;
    sel.value='0';
  }
}
// La empresa de un trabajador concreto; si no tiene asignada, la primera
// visible. Se usa en las tarjetas y en el PDF de EPP.
function empresaDe(w){
  if(w&&w.empresa_id){
    const e=empresas.find(x=>mismoId(x.id,w.empresa_id));
    if(e)return e;
  }
  return empresas[0]||{};
}

// ---------- administrar empresas ----------
function renderEmpresas(){
  const list=document.getElementById('empList');
  if(!list)return;
  if(!exigirPermiso('sistema.empresa','No tienes permiso para administrar las empresas.')){list.innerHTML='<small>Sin permiso.</small>';return;}
  // crear una empresa nueva es solo de administración: es lo que permite
  // la base de datos, así que el botón se esconde para el resto
  const wrap=document.getElementById('empNuevaWrap');
  if(wrap)wrap.style.display=soyAdmin()?'':'none';
  list.innerHTML=empresas.map(e=>`
    <div class="kitAsigCard" style="cursor:pointer" onclick="editarEmpresa(${e.id})">
      <div class="headline">
        <span><b>${escHtml(e.nombre)}</b>${e.rut?` <small>· ${escHtml(e.rut)}</small>`:''}</span>
        <span>${e.activa?'':'<span style="color:var(--danger)">inactiva</span>'}</span>
      </div>
      <div style="font-size:.8rem;color:var(--muted)">
        ${[e.giro,e.direccion,e.telefono,e.email].filter(Boolean).map(escHtml).join(' · ')||'Sin datos de contacto'}
      </div>
    </div>`).join('')||'<small>No hay empresas registradas.</small>';
}
function editarEmpresa(id){
  const e=empresas.find(x=>mismoId(x.id,id));
  if(!e)return;
  document.getElementById('emp-id').value=e.id;
  document.getElementById('emp-name').value=e.nombre||'';
  document.getElementById('emp-rut').value=e.rut||'';
  document.getElementById('emp-giro').value=e.giro||'';
  document.getElementById('emp-direccion').value=e.direccion||'';
  document.getElementById('emp-telefono').value=e.telefono||'';
  document.getElementById('emp-email').value=e.email||'';
  document.getElementById('emp-web').value=e.sitio_web||'';
  document.getElementById('emp-hora-entrada').value=e.hora_entrada||'08:00';
  document.getElementById('emp-tolerancia').value=(e.tolerancia_minutos!=null)?e.tolerancia_minutos:10;
  document.getElementById('emp-hora-salida').value=e.hora_salida||'';
  document.getElementById('emp-colacion-inicio').value=e.colacion_inicio||'';
  document.getElementById('emp-colacion-duracion').value=(e.colacion_duracion_min!=null)?e.colacion_duracion_min:30;
  document.getElementById('emp-activa').checked=e.activa;
  document.getElementById('emp-logo-preview').src=e.logo||'';
  const aviso=document.getElementById('emp-logo-aviso');
  if(aviso)aviso.innerHTML='';
  document.getElementById('empFormTitle').textContent='Editando: '+e.nombre;
  document.getElementById('empForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function nuevaEmpresa(){
  if(!soyAdmin()){
    alert('Crear una empresa nueva es tarea de administración. Pídele a un administrador que la registre.');
    return;
  }
  ['emp-id','emp-rut','emp-giro','emp-direccion','emp-telefono','emp-email','emp-web','emp-hora-entrada','emp-hora-salida','emp-colacion-inicio'].forEach(id=>document.getElementById(id).value='');
  // La duración de la colación vuelve a 30 y no a vacío. Vacío se convertiría en
  // 0 al guardar, y una colación de 0 minutos en el reporte es un dato falso,
  // no un dato que falta: la diferencia es que "30" es el valor de la 034.
  document.getElementById('emp-colacion-duracion').value=30;
  document.getElementById('emp-name').value='';
  document.getElementById('emp-activa').checked=true;
  document.getElementById('emp-logo-preview').src='';
  const avisoLogo=document.getElementById('emp-logo-aviso');
  if(avisoLogo)avisoLogo.innerHTML='';
  document.getElementById('empFormTitle').textContent='Nueva empresa';
  document.getElementById('empForm').scrollIntoView({behavior:'smooth',block:'start'});
}
// ============================================================
// QUÉ MIGRACIÓN FALTA
