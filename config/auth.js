// Utilidades de autenticación compartidas por login.html y app.html.
// loginPath: ruta relativa a pages/login.html desde donde se llama.
async function requireAuth(loginPath){
  const { data:{ session } } = await window.supabaseClient.auth.getSession();
  if(!session){
    window.location.href = loginPath || 'login.html';
    return null;
  }
  return session;
}

// ============================================================
// BITÁCORA DE ACCESO AL SISTEMA
// ============================================================
// Esto NO es la asistencia del trabajador: es quién abrió la aplicación,
// cuándo y cuánto tiempo estuvo. Se mezcla con la asistencia y después
// nadie sabe si un "09:12" fue que fichó o que un supervisor abrió el
// sistema a mirar.
//
// Lo que se registra y por qué:
//   · evento  — entrada, salida (cerró con el botón) o "cierre" (se cortó
//               sola: pestaña cerrada, red caída, cierre del navegador).
//   · duracion_segundos — solo en las salidas, para saber cuánto estuvo.
//
// LO QUE NO SE REGISTRA, Y POR QUÉ
//
// La dirección IP. El navegador no la puede leer, y obtenerla obligaría a
// pasar por una Edge Function. Es además un dato personal más, y para lo
// que se necesita (saber quién estuvo y cuánto) no aporta nada. Si
// alguna vez hace falta, se agrega junto con la función que sí la puede
// leer, en vez de meterla en la base sin que nadie lo pidiera.
//
// El identificador de sesión agrupa los registros de una misma sesión. Sin
// él no hay forma de saber cuándo terminó una que se cerró sola, porque el
// navegador no avisa en ese caso: se deduce comparando con el siguiente
// acceso de la misma persona.
//
// La escritura falla sin romper nada: la bitácora es un registro, no una
// condición para usar el sistema. Si la tabla no existe (falta la
// migración 023) o no hay red, la app sigue igual.
const BITACORA_SESION_KEY='bitacora_sesion_id';
// Si en esta carga de página ya se registró la entrada, no se vuelve a
// registrar. Tres motivos:
//
//   · La comprobación contra la base no alcanza por sí sola: dos llamadas
//     seguidas se cruzan, y la segunda todavía no ve la fila de la
//     primera. Con un F5 de verdad no se cruzan, porque la primera
//     inserción ya terminó antes de recargar; pero con boot() llamado dos
//     veces en la misma página, sí.
//   · Evita una consulta a la base en el arranque normal, que es lo que
//     pasa casi siempre.
//   · Es lo que hace que "un F5 no es una sesión nueva" funcione también
//     sin red: si no se pudo consultar, tampoco se registra dos veces.
let entradaYaRegistrada=false;

function idDeSesionActiva(){
  try{
    let id=sessionStorage.getItem(BITACORA_SESION_KEY);
    if(!id){
      id=(crypto.randomUUID?crypto.randomUUID()
        :'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
          const r=Math.random()*16|0;
          return (c==='x'?r:(r&0x3|0x8)).toString(16);
        }));
      sessionStorage.setItem(BITACORA_SESION_KEY,id);
    }
    return id;
  }catch(error){
    // Sin sessionStorage (modo privado muy restrictivo) se usa uno en
    // memoria: el registro se pierde al recargar, que es preferible a que
    // la app no funcione.
    if(!window.__sesionSinGuardar)window.__sesionSinGuardar='mem-'+Math.random().toString(36).slice(2);
    return window.__sesionSinGuardar;
  }
}
function instanteDeInicioDeSesion(){
  try{
    let t=sessionStorage.getItem('bitacora_inicio');
    if(!t){
      t=String(Date.now());
      sessionStorage.setItem('bitacora_inicio',t);
    }
    return Number(t);
  }catch(error){return Date.now();}
}
function resumenDeDispositivo(){
  const ua=navigator.userAgent||'';
  const navegador=/Edg\//.test(ua)?'Edge'
    :/OPR\//.test(ua)?'Opera'
    :/Firefox\//.test(ua)?'Firefox'
    :/Chrome\//.test(ua)?'Chrome'
    :/Safari\//.test(ua)?'Safari':'otro';
  const sistema=/Windows/.test(ua)?'Windows'
    :/Android/.test(ua)?'Android'
    :/(iPhone|iPad)/.test(ua)?'iOS'
    :/Mac OS/.test(ua)?'macOS'
    :/Linux/.test(ua)?'Linux':'otro';
  const movil=/Mobi|Android|iPhone|iPad/.test(ua)?' · móvil':'';
  return navegador+' en '+sistema+movil;
}
async function registrarAcceso(evento){
  try{
    const {data:{session}}=await window.supabaseClient.auth.getSession();
    if(!session)return;
    const sesionId=idDeSesionActiva();

    // RECARGAR LA PÁGINA NO ES UNA SESIÓN NUEVA.
    // El identificador de sesión vive en sessionStorage, que sobrevive a
    // una recarga. Sin esta comprobación, con F5 quedaría registrada una
    // "entrada" por cada recarga, y un supervisor que refresca mientras
    // trabaja tendría diez entradas y ni una salida. Es un registro de
    // acceso, no un contador de recargas.
    if(evento==='entrada'){
      if(entradaYaRegistrada)return;
      const {data:yaHubo}=await window.supabaseClient.from('accesos_sistema')
        .select('id').eq('sesion_id',sesionId).eq('evento','entrada').limit(1);
      if(yaHubo&&yaHubo.length)return;
      entradaYaRegistrada=true;
    }

    const inicio=instanteDeInicioDeSesion();
    const payload={
      user_id:session.user.id,
      correo:session.user.email||null,
      evento,
      sesion_id:sesionId,
      dispositivo:resumenDeDispositivo()
    };
    if(evento!=='entrada'){
      payload.duracion_segundos=Math.max(0,Math.round((Date.now()-inicio)/1000));
    }
    await window.supabaseClient.from('accesos_sistema').insert(payload);
  }catch(error){
    // Silencioso a propósito: si la bitácora falla, la app tiene que
    // seguir funcionando. Para diagnosticar está el aviso en Soporte, que
    // consulta la tabla y dice si existe.
  }
}
function cerrarBitacoraDeSalida(){
  try{ sessionStorage.removeItem('bitacora_inicio'); }catch(error){}
  try{ sessionStorage.removeItem(BITACORA_SESION_KEY); }catch(error){}
  entradaYaRegistrada=false;
}

async function logout(loginPath){
  // Se registra la salida ANTES de cerrar la sesión: después de signOut()
  // ya no hay sesión, y sin sesión la política de la base no deja
  // escribir. Por eso el insert va primero, aunque haya que esperar.
  await registrarAcceso('salida');
  cerrarBitacoraDeSalida();
  await window.supabaseClient.auth.signOut();
  window.location.href = loginPath || 'login.html';
}

window.supabaseClient.auth.onAuthStateChange((event)=>{
  if(event==='SIGNED_OUT' && !location.pathname.endsWith('login.html')){
    // Al cerrarse la sesión por el botón ya se registró arriba. Este caso
    // es cuando la sesión se cae sola (venció el token, se cerró en otra
    // pestaña): también queda en la bitácora, como "cierre".
    registrarAcceso('cierre');
    window.location.href = 'login.html';
  }
});
