// ===================================================================
// LOS MÓDULOS QUE TIENE CADA EMPRESA
// ===================================================================
//
// ---------------------------------------------------------------------
// ESTE ARCHIVO CONTESTA UNA PREGUNTA, Y ES DISTINTA DE LA DE LOS PERMISOS
// ---------------------------------------------------------------------
//
//     ¿QUÉ PUEDO HACER?          lo contesta "tiene_permiso()"
//     ¿QUÉ EXISTE AQUÍ?          lo contesta este archivo
//
// Un permiso no puede contestar la segunda. Si el Reloj/Tótem se apaga quitándole
// el permiso a todos, la fila de permisos queda exactamente como estaba, y alcanza
// con que alguien se la dé para que el reloj vuelva. Y al revés: si el módulo se
// apaga borrando permisos, se pierde la información de QUIÉN podía ver la tarja.
//
// Las dos puertas se miran juntas. Si falta una de las dos, no se abre. Ver
// "mostrarVista" y "showView".
//
// ---------------------------------------------------------------------
// Y LA TABLA QUE RESPONDE ESTO
// ---------------------------------------------------------------------
//
// "empresa_modulos", de la migración 085. Y la regla que la define:
//
//     SIN FILA = APAGADO
//
// No es la regla habitual, y es a propósito. Lo habitual es que un sistema venga
// con todo prendido y uno apague lo que no quiera; acá una empresa sin fila no
// tiene NINGÚN módulo. El motivo es que la fase actual es "Control Interno" y el
// Tótem no está certificado: con "prendido por defecto", un módulo nuevo aparece
// solo en todas las empresas y el único trabajo hecho es el de apagarlo.
//
// ---------------------------------------------------------------------
// Y LA LISTA DE MÓDULOS TIENE QUE COINCIDIR CON EL "CHECK" DEL SQL
// ---------------------------------------------------------------------
//
// La tabla 085 tiene un "check" con los mismos doce nombres. Si un módulo está acá
// y no en el SQL, el "upsert" del panel falla con un error de "check" y se ve
// enseguida. Y al revés: un módulo en el SQL que no esté acá, la aplicación no lo
// conoce y no lo usa. Un módulo que ninguno de los dos lados conoce no hace nada,
// que es la forma más tranquila de tener un módulo roto.
//
// El guardián "comprueba-modulos.js" compara las dos listas en cada corrida.

// ---------------------------------------------------------------------
// LA LISTA
// ---------------------------------------------------------------------
// Y CON ESTA FORMA, UNA PALABRA POR RENGLÓN, PARA PODER COMPARARLA CON EL SQL
const MODULOS_CONOCIDOS = [
  'porteria',
  'trabajadores',
  'asistencia',
  'carga_masiva',
  'empresas',
  'contratos',
  'expedientes',
  'solicitar_ingreso',
  'epp',
  'remuneraciones',
  'relojes',
  'marcajes',
];

// Y EL MÓDULO DE CADA VISTA
//
// Y TODAS LAS VISTAS TIENEN QUE ESTAR ACA
//
// Se comparan contra "VISTAS_POR_PERMISO", que es la lista de vistas con permiso
// (en "views/soporte/soporte.js"). Una vista que está en esa lista y no está en
// esta no tiene módulo: el guardián lo avisa.
//
// Y POR QUÉ "RELOJES" Y "MARC AJES" ESTÁN SEPARADOS, QUE ES LO MÁS IMPORTANTE
//
// Porque son cosas distintas y confundirlas fue el primer error:
//
//     reloj      el APARATO. Tótem, kiosco, reloj en la obra. No certificado.
//     marcajes   los DATOS. Subir las marcas del sistema de asistencia y cruzarlas.
//
// Los datos no necesitan el aparato. Y son justamente los que hacen falta ahora
// para poder verificar el Tótem después.
const MODULO_POR_VISTA = {
  'v-porteria': 'porteria',
  'v-nuevo-trabajador': 'trabajadores',
  'v-listado-trabajadores': 'trabajadores',
  'v-asignar-supervisor': 'trabajadores',
  'v-carga-csv-trabajadores': 'carga_masiva',
  'v-buscar-tarjeta': 'trabajadores',
  'v-imprimir-tarjetas': 'trabajadores',
  'v-asistencia': 'asistencia',
  'v-exportar': 'remuneraciones',
  'v-alertas-sociales': 'asistencia',
  'v-indicaciones-sociales': 'asistencia',
  'v-alertas-prevencion': 'asistencia',
  'v-indicaciones-prevencion': 'asistencia',
  'v-bodega-epp': 'epp',
  'v-bodega-historial': 'epp',
  'v-bodega-epp-catalogo': 'epp',
  'v-bodega-kits': 'epp',
  'v-bodega-kits-admin': 'epp',
  'v-bodega-catalogo': 'epp',
  'v-bodega-asignar': 'epp',
  'v-bodega-qr': 'epp',
  'v-solicitar-cambio': 'asistencia',
  'v-solicitar-ingreso': 'solicitar_ingreso',
  'v-ingresos-cola': 'solicitar_ingreso',
  'v-supervisores': 'asistencia',
  'v-sup-diaria': 'asistencia',
  'v-just-diaria': 'asistencia',
  'v-auditoria': 'asistencia',
  'v-relojes': 'relojes',
  'v-marcajes': 'marcajes',
  'v-kit': 'contratos',
  'v-plantillas-kit': 'contratos',
  'v-aprobar-cambio': 'asistencia',
  'v-usuarios': 'empresas',
  'v-invitar-usuario': 'empresas',
  'v-permisos': 'empresas',
  'v-empresa': 'empresas',
  'v-empresa-modulos': 'empresas',
  'v-expedientes': 'expedientes',
};

// ---------------------------------------------------------------------
// ¿ESTA PERSONA ES ADMINISTRADORA DEL SISTEMA?
// ---------------------------------------------------------------------
// Y "soyAdmin()" YA EXISTE, Y NO SE REPITE
//
// Está en "views/soporte/soporte.js", al lado de "puede()", y hace lo mismo: mira
// si "misRoles" tiene "admin". Los archivos comparten el ámbito, así que definirla
// otra vez acá no agrega nada: una de las dos pisa a la otra según cuál cargó
// último, y las dos son iguales ahora, hasta que alguien cambie una. Ver
// [word-04].
//
// Y LA BASE TIENE "es_admin()", QUE ES LA QUE MANDA
//
// Porque es la que revisan las políticas de RLS, y con la 073 el administrador ya
// no tiene acceso total por la puerta de atrás. Si el Javascript dijera "sí" y la
// base dijera "no", se vería un botón que no funciona.
//
// Y NO SE USA UN PERMISO NUEVO, Y POR QUÉ
//
// Un permiso como "sistema.modulos" tendría que existir en la tabla "permisos",
// en "roles_permisos", y repartirse. Eso es una migración más que hay que correr
// desde el panel, y para una pantalla que solo ve el administrador del sistema.
//
// "es_admin()" ya responde la pregunta, y la base la usa igual. Con eso, la
// pantalla y la política están de acuerdo por construcción, y no hay una tercera
// respuesta que pueda contradecir a las otras dos.
//
// Y EL "ADMIN_SIEMPRE_TODO" DE ARRIBA USA ESTA MISMA FUNCIÓN
//
// Y SE DEJA TAMBIÉN EN "window", PORQUE EL FILTRO DE ARRIBA LO USABA
//
// Y se sincroniza cada vez que cambian los roles, que es lo que pasa al promover a
// alguien en Soporte. Sin esto, un administrador nuevo tenía que recargar la
// página para que le apareciera la pantalla.
function sincronizarAdmin(){
  window.esAdminDelSistema=(typeof soyAdmin==='function')?soyAdmin():false;
  return window.esAdminDelSistema;
}

// ---------------------------------------------------------------------
// EL ESTADO, Y POR QUÉ NO SE CALCULA EN EL MOMENTO DE USARLO
// ---------------------------------------------------------------------
// Y SE GUARDA UNA VEZ, NO SE PREGUNTA CADA VEZ
//
// Porque "moduloActivo" se llama en cada botón del menú, en cada cambio de vista y
// en cada clic. Si cada llamada hiciera un "select" a la base, el menú se volvería
// a dibujar tan lento que se va a notar, y en un teléfono se nota mucho.
//
// Y ADEMÁS: LA CONSULTA NO PUEDE HACERSE EN CADA USO POR UNA RAÓN DE SEGURIDAD
//
// El RLS de "empresa_modulos" deja ver solo las empresas del usuario. Si la
// consulta se hiciera cada vez y el ámbito cambiara, se leería distinto según el
// momento. Leyéndola una vez, con el ámbito ya resuelto, lo que se ve es una foto
// fija de lo que esa persona tenía al entrar.
//
// Y EL CAMBIO DE ÁMBITO, QUE ES LO QUE SÍ SE RECARGA
//
// Si la persona cambia de empresa en el selector de arriba, hay que volver a leer.
// Ver "recargarModulos".
let modulosPorEmpresa = {};      // { '1': Set{'trabajadores', ...}, '2': Set{} }
let modulosCargados = false;
let errorAlCargarModulos = '';

// Y EL ADMINISTRADOR DEL SISTEMA
//
// Y POR QUÉ LO ADMINISTRADOR ENTRA A TODO, SIENDO QUE EL MÓDULO ESTÁ APAGADO
//
// Porque el administrador es quien CERTIFICA el Tôtem. Si no puede abrirlo nunca,
// no hay manera de probarlo: habría que prender el módulo para todas las empresas
// cada vez que se quiere hacer una prueba, y después acordarse de apagarlo.
//
// Con esto, el módulo apagado esconde la pantalla a los usuarios de empresa —que
// es lo que importa— y le deja la puerta abierta al que tiene que probarla.
//
// Y SI ESTA DECISIÓN SE QUIERE CAMBIAR, ES ESTA LÍNEA, Y NADA MÁS
const ADMIN_SIEMPRE_TODO = true;

// ---------------------------------------------------------------------
// LEER
// ---------------------------------------------------------------------
// Y POR QUÉ SE PREGUNTA POR LAS EMPRESAS DEL USUARIO Y NO POR TODAS
//
// Porque el RLS ya lo acota: "empresa_modulos" solo deja leer las empresas del
// usuario. Preguntar por todas no amplía nada y, en una empresa grande, trae
// Modules de empresas que no son suyas para que el filtro los descarte después.
async function cargarModulos(){
  modulosPorEmpresa = {};
  filasLeidas = 0;
  errorAlCargarModulos = '';
  try{
    const {data,error} = await window.supabaseClient
      .from('empresa_modulos')
      .select('empresa_id,modulo_nombre,activo')
      .eq('activo', true);
    if(error) throw new Error(error.message);
    (data||[]).forEach(function(fila){
      const id=String(fila.empresa_id);
      if(!modulosPorEmpresa[id]) modulosPorEmpresa[id]=new Set();
      if(fila.activo) modulosPorEmpresa[id].add(fila.modulo_nombre);
    });
    filasLeidas=(data||[]).length;
    modulosCargados = true;
  }catch(error){
    // Y SI FALLA, SE DICE EN PANTALLA, Y SE MUESTRA TODO
    //
    // Y no al revés: si la tabla no existe todavía, y se bloqueara todo, la
    // aplicación quedaría inservible y no habría por dónde empezar. Que se vea
    // todo y se avise es lo recuperable; que no se vea nada, no.
    modulosCargados = false;
    errorAlCargarModulos = error.message||String(error);
    mostrarAvisoModulos(
      '⚠️ No se pudieron leer los módulos de la empresa ('+errorAlCargarModulos+').\n\n'
      +'Se muestra todo sin restricciones. Aplícale la migración 085 y el guion\n'
      +'encender-modulos-085.sql del panel de la base.'
    );
    console.warn('No se pudieron cargar los módulos:', errorAlCargarModulos);
  }
  aplicarModulos();
}

// Y LA LISTA DE EMPRESAS QUE SE ESTÁ MIRANDO AHORA
//
// Y DEVUELVE "null" CUANDO TODAVÍA NO SE SABE, QUE ES DISTINTO DE "NO HAY NINGUNA"
//
// Y esa diferencia es todo el fallo que se corrigió
//
// "loadPermisosUsuario()" —que es donde se leen los módulos— corre ANTES que
// "loadEmpresas()". Está en ese orden en "js/app.js", y es el correcto: los
// permisos no dependen de la lista de empresas y la lista sí se necesita para
// otras cosas.
//
// El problema es qué se hace mientras la lista está vacía. Antes, una lista vacía
// se leía como "esta persona no tiene ninguna empresa", y de ahí salía "no hay
// módulos". Resultado: al abrir la aplicación, con los once módulos
// correctamente prendidos en la base, todo salía bloqueado:
//
//     La empresa no tiene este módulo contratado. La pantalla "porteria" es del
//     módulo "porteria", que está apagado para las empresas a las que tenés acceso.
//
// Y el mensaje era VERDADERO Y ESTABA MAL A LA VEZ: la empresa sí tenía el módulo;
// lo que no se sabía era todavía cuál era su ámbito.
//
// Por eso devuelve "null" mientras no se sepa, y "moduloActivo" deja pasar. Es la
// misma regla que con "modulosCargados": mientras no se sabe, no se cierra nada.
// Y después, "aplicarModulos()" vuelve a pintar cuando la lista llega.
function empresasDelAmbito(){
  // Y SI LA LISTA DE EMPRESAS AÚN NO TERMINÓ DE CARGAR, NO SE OPINA
  if(typeof empresasCargadas!=='undefined' && !empresasCargadas) return null;
  const lista = (typeof empresas !== 'undefined' && Array.isArray(empresas)) ? empresas : [];
  const propias = (typeof misEmpresas !== 'undefined' && Array.isArray(misEmpresas) && misEmpresas.length)
    ? misEmpresas
    : lista.map(function(e){ return e.id; });
  // Y CUANDO EL ÁMBITO ES UNA EMPRESA CONCRETA, SOLO ESA
  if(typeof empresaActual === 'number' && empresaActual){
    return [empresaActual];
  }
  if(empresaActual && typeof empresaActual === 'object' && empresaActual.id){
    return [empresaActual.id];
  }
  return propias;
}

// ---------------------------------------------------------------------
// LA PREGUNTA
// ---------------------------------------------------------------------
// Y CUATRO CASOS, Y CADA UNO TIENE SU MOTIVO
//
//  1. Si no hay vista o no tiene módulo, se deja pasar. No inventar un módulo para
//     una vista que no está en la lista: bloquear una vista por un dato que no se
//     tiene es peor que no bloquearla.
//
//  2. Si todavía no se leyó la base, se deja pasar. Mientras carga, bloquear todo
//     dejaría la aplicación vacía un instante en cada arranque, y un fallo de red
//     dejaría la aplicación inservible. El aviso dice que no se pudo leer.
//
//  3. El administrador entra a todo. Ver arriba.
//
//  4. Con la base leída: tiene que estar el módulo en TODAS las empresas del
//     ámbito. "Sin fila = apagado" es lo que hace el resto.
function moduloActivo(vista){
  if(!vista) return true;
  const modulo = MODULO_POR_VISTA[vista];
  if(!modulo) return true;
  if(typeof window !== 'undefined' && window.esAdminDelSistema && ADMIN_SIEMPRE_TODO) return true;
  if(!modulosCargados) return true;
  const empresas = empresasDelAmbito();
  // Y "null" ES "TODAVÍA NO SE SABE", Y NO ES "NO TIENE EMPRESAS"
  if(empresas===null) return true;
  // Y CERO FILAS LEÍDAS TAMBIÉN ES "NO SE SABE". Ver "noSeSabeElModulo()".
  if (filasLeidas === 0) return true;
  if(!empresas.length) return false;
  return empresas.every(function(id){
    const deEsta = modulosPorEmpresa[String(id)];
    // Y SIN FILA ES APAGADO. Esta línea es la regla entera.
    return !!(deEsta && deEsta.has(modulo));
  });
}

// Y CERO FILAS LEÍDAS NO ES "TODO APAGADO": ES "NO SE SABE"
//
// Y ESTA ES LA REGLA QUE FALTABA, Y LA QUE ESTABA ROMPIENDO LA APLICACIÓN
//
// La consulta a "empresa_modulos" puede devolver CERO filas sin que haya un solo
// módulo apagado en el sistema. Pasa cuando el RLS no deja ver nada a esta persona,
// y entonces "sin fila = apagado" —que es la regla correcta para una empresa— se
// convierte en "todo el mundo tiene todo apagado", que es un conclusión que
// nobody drew.
//
// Y es un error que se ve fatal: la aplicación entera queda bloqueada, y el aviso
// dice "la empresa no tiene este módulo contratado", que es VERDAD Y ESTÁ MAL A LA
// VEZ. La empresa sí lo tenía; lo que no se pudo ver fue la fila.
//
// Y POR QUÉ CERO FILAS ES "NO SE SABE" Y NO "NADA CONTRATADO"
//
// Porque una instalación real SIEMPRE tiene filas: el guion de encendido creó once
// por empresa. Si alguien llega a cero, o no se aplicó el guion, o el RLS ocultó
// todo, o se está mirando otra base. En los tres casos, tapar la pantalla entera no
// ayuda a nadie: deja la aplicación sin usar y sin explicación.
//
// Y LA DIFERENCIA CON "ESTA EMPRESA NO TIENE EL MÓDULO"
//
// Eso sí se ve, y se sigue respetando: si hay filas y esta empresa no tiene la
// suya, el módulo está apagado y se avisa. Lo que no se hace es confundir "no hay
// datos" con "todo está apagado".
let filasLeidas = 0;

function noSeSabeElModulo() {
  return modulosCargados && filasLeidas === 0;
}

// Y EL AVISO DEL BLOQUEO, QUE DICE LOS DATOS Y NO SÓLO EL VEREDICTO
//
// Y por qué: un aviso que dice "no lo tenés" cuando el problema puede ser otro hace
// que se vaya a buscar el problema en el lugar equivocado. Con los datos adentro,
// el que lo lee sabe si es un problema de empresa, de permisos o de instalación.
//
// Y lo que se muestra es lo que hay, no una interpretación: el ámbito que se está
// mirando, cuántas filas se leyeron, y si esta persona es administradora.
function avisoDeModuloBloqueado(vista) {
  const modulo=(typeof MODULO_POR_VISTA!=='undefined')?(MODULO_POR_VISTA['v-'+vista]||'?'):'?';
  if (noSeSabeElModulo()) {
    return 'No se pudo saber qué módulos tiene esta empresa.\n\n'
      +'La pantalla "'+vista+'" es del módulo "'+modulo+'", pero la consulta a la base\n'
      +'no devolvió NINGUNA fila de módulos.\n\n'
      +'Eso NO quiere decir que la empresa no lo tenga. Quiere decir que las filas\n'
      +'no se pudieron ver, y por eso no se tapa la pantalla a ciegas: se muestra\n'
      +'todo y se avisa.\n\n'
      +'Cosas para revisar, en este orden:\n'
      +'  1. Que se haya corrido migrations/scripts/encender-modulos-085.sql.\n'
      +'  2. Que tu usuario tenga empresas asignadas en Soporte → Empresas: cargos\n'
      +'     y permisos. Sin empresas asignadas, el RLS no deja ver nada.\n'
      +'  3. Que la consulta haya muerto por la red: recargá con Ctrl+F5.\n\n'
      +diagnosticoDeModulos();
  }
  const empresas=empresasDelAmbito();
  return 'La empresa no tiene este módulo contratado.\n\n'
    +'La pantalla "'+vista+'" es del módulo "'+modulo+'", que está apagado para las\n'
    +'empresas a las que tenés acceso.\n\n'
    +diagnosticoDeModulos();
}

// Y LOS DATOS, PARA PEGARLOS Y QUE NO HAYA QUE ADIVINAR
function diagnosticoDeModulos() {
  const empresas=empresasDelAmbito();
  const alcance=Array.isArray(empresas)
    ? ('empresa(s) en el ámbito: '+empresas.join(', '))
    : ('ámbito: sin determinar todavía');
  let leidas=0;
  Object.keys(modulosPorEmpresa).forEach(function(id){
    if(modulosPorEmpresa[id]&&modulosPorEmpresa[id].size)leidas++;
  });
  return 'Lo que la pantalla está mirando ahora mismo:\n'
    +'  · ' + alcance + '\n'
    +'  · filas de módulos leídas: ' + filasLeidas
      + (filasLeidas===0 ? '   <-- por eso no se puede saber' : '') + '\n'
    +'  · empresas con módulos visibles: ' + leidas + '\n'
    +'  · módulos cargados: ' + (modulosCargados?'sí':'NO, todavía o falló')
      + (errorAlCargarModulos?(' ('+errorAlCargarModulos+')'):'') + '\n'
    +'  · administradora del sistema: ' + (typeof soyAdmin==='function'&&soyAdmin()?'sí':'no');
}
  // Y SI UN MÓDULO ENTERO ESTÁ APAGADO
function moduloEncendido(modulo){
  if(!modulo) return true;
  if(typeof window !== 'undefined' && window.esAdminDelSistema && ADMIN_SIEMPRE_TODO) return true;
  if(!modulosCargados) return true;
  const empresas = empresasDelAmbito();
  if(empresas===null) return true;
  // Y SI NO SE LEYÓ NINGUNA FILA, NO SE SABE
  if (filasLeidas === 0) return true;
  if(!empresas.length) return false;
  return empresas.every(function(id){
    const deEsta = modulosPorEmpresa[String(id)];
    return !!(deEsta && deEsta.has(modulo));
  });
}

// Y EL CAMBIO DE ÁMBITO
//
// Porque cambiar de empresa en el selector de arriba cambia qué módulos hay, y si
// no se relee, el menú sigue mostrando los de la empresa anterior. Es la misma
// clase de fallo que el que tenía "supervisor_code" y el equipo del usuario: un
// ámbito que no se recalcula al cambiar deja datos del anterior.
async function recargarModulos(){
  await cargarModulos();
  const abierto=document.querySelector('#subNav button.active');
  const vistaAbierta=abierto?abierto.dataset.v:null;
  if(typeof showGroup === 'function'){
    const grupo=(document.querySelector('#mainNav button.active')||{}).dataset;
    if(grupo&&grupo.group) showGroup(grupo.group);
  }
  if(vistaAbierta&&typeof showView==='function') showView(vistaAbierta);
}

// ---------------------------------------------------------------------
// APLICARLO A LA PANTALLA
// ---------------------------------------------------------------------
// Y SE MARCA CON "data-sin-modulo", LO MISMO QUE "data-sin-permiso"
//
// Con el mismo motivo y por la misma razón: el menú se rearma entero en cada
// cambio de grupo ("sub.innerHTML = items.map(...)", en "showGroup"). Borrar los
// nodos del DOM no sirve de nada, porque el próximo clic los vuelve a escribir.
// Lo que hay que cambiar es la lista que se dibuja, y para las vistas ya
// construidas basta con marcar el atributo, que es lo que "showView" mira.
function aplicarModulos(){
  document.querySelectorAll('.view').forEach(function(seccion){
    const vista='v-'+seccion.id.replace(/^v-/,'');
    if(!(vista in MODULO_POR_VISTA)) return;
    if(moduloActivo(vista)) seccion.removeAttribute('data-sin-modulo');
    else seccion.setAttribute('data-sin-modulo', '1');
  });
  // Y EL AVISO, SOLO SI HAY ALGO QUE AVISAR
  if(errorAlCargarModulos) mostrarAvisoModulos(
    '⚠️ No se pudieron leer los módulos de la empresa ('+errorAlCargarModulos+').\n\n'
    +'Se muestra todo sin restricciones. Aplícale la migración 085 y el guion\n'
    +'encender-modulos-085.sql del panel de la base.'
  );
  else quitarAvisoModulos();
}

// Y EL AVISO, EN PANTALLA, NUNCA EN LA CONSOLA
//
// Porque la consola no la ve nadie. Y esta es una de las pocas cosas que hay que
// decir en voz alta: que la aplicación se está mostrando sin restringir.
let avisoModuloEnPantalla=false;
function mostrarAvisoModulos(texto){
  if(avisoModuloEnPantalla) return;
  avisoModuloEnPantalla=true;
  let caja=document.getElementById('avisoModulos');
  if(!caja){
    caja=document.createElement('div');
    caja.id='avisoModulos';
    // Y CON ESTILO PROPIO, PORQUE ES UNA ADVERTENCIA Y TIENE QUE SE VISTA COMO
    // UNA ADVERTENCIA, NO COMO UN MENSAJE CORRIENTE
    caja.style.cssText='position:fixed;left:12px;right:12px;top:12px;z-index:9999;'
      +'padding:12px 14px;border-radius:10px;font:13px/1.5 sans-serif;'
      +'background:#FFF4E5;border:2px solid #B45309;color:#7C2D12;white-space:pre-line;'
      +'box-shadow:0 6px 20px rgba(0,0,0,.18)';
    document.body.appendChild(caja);
  }
  caja.textContent=texto;
}
function quitarAvisoModulos(){
  avisoModuloEnPantalla=false;
  const caja=document.getElementById('avisoModulos');
  if(caja&&caja.parentNode)caja.parentNode.removeChild(caja);
}

// ---------------------------------------------------------------------
// LA PANTALLA QUE PRENDE Y APAGA
// ---------------------------------------------------------------------
// Y POR QUÉ ESCRIBE "empresa_modulos" Y NO OTRA TABLA
//
// Porque "empresa_modulos" es exactamente la tabla que hace falta para esto, y ya
// tiene lo que se le pidió: qué módulos tiene cada empresa y si están prendidos.
// Agregar una pantalla y una tabla nueva para lo mismo sería la segunda fuente de
// verdad, que es donde empiezan los datos que no coinciden entre sí.
//
// Y LO QUE NO ESTÁ, DICHO DE ANTEMANO
//
// No queda registrado QUIÉN apagó un módulo ni CUÁNDO. Sólo queda la fecha de la
// fila. Para auditarlo hace falta una columna más y una pantalla de historial, y
// no se hizo.
//
// Lo que sí queda es la fila con "activo = false": el módulo está apagado, pero se
// ve que existe y que alguien lo apagó a propósito. Eso es lo que permite
// distinguir "lo apagó alguien" de "nunca se prendió", que con sólo las filas
// prendidas no se distinctions.
async function pintarModulos(){
  const lista=document.getElementById('modList');
  const sel=document.getElementById('modEmpresa');
  if(!lista||!sel)return;

  // Y SI NO ES ADMINISTRADOR, NO SE PINTA NADA
  //
  // Y no es un aviso: no se abre. La política de "empresa_modulos" es "es_admin()"
  // para escribir y deja leer a la empresa, así que un usuario normal podría ver
  // la pantalla vacía sin error. Lo que tiene que hacer la pantalla es no existir.
  if(!soyAdmin()){
    lista.innerHTML='<p style="opacity:.8">Esta pantalla es solo para el administrador del sistema.</p>';
    return;
  }
  const emps=(typeof empresas!=='undefined'&&Array.isArray(empresas))?empresas:[];
  const elegida=sel.value||(emps[0]&&emps[0].id)||'';
  sel.innerHTML=emps.map(function(e){
    return '<option value="'+e.id+'">'+escHtml(e.nombre)+' (id '+e.id+')</option>';
  }).join('');
  if(elegida)sel.value=elegida;
  const id=parseInt(sel.value,10);

  const {data,error}=await window.supabaseClient.from('empresa_modulos')
    .select('modulo_nombre,activo').eq('empresa_id',id);
  const aviso=document.getElementById('modAviso');
  if(error){
    // Y SI FALLA LA LECTURA, SE DICE EN PANTALLA Y NO SE PINTA UNA LISTA VACÍA
    //
    // Porque una lista vacía con "no tenés nada" es distinta de "no se pudo leer",
    // y la diferencia es si el problema es tuyo o del sistema.
    if(aviso)aviso.innerHTML='<div style="background:var(--danger-surface);border:1px solid var(--danger);'
      +'color:var(--danger);padding:10px 12px;border-radius:8px">'
      +'No se pudieron leer los módulos de esta empresa: '+escHtml(error.message)
      +'<br><small>Si la migración 085 no está aplicada, aplicala.</small></div>';
    lista.innerHTML='';
    return;
  }
  if(aviso)aviso.innerHTML='';
  const deEsta={};
  (data||[]).forEach(function(f){ deEsta[f.modulo_nombre]=!!f.activo; });

  lista.innerHTML=
    '<p style="margin:0 0 10px;opacity:.8">Una empresa sin módulos no ve nada. '
    +'Con <b>relojes</b> apagado sigue viendo <b>marcajes</b>: son cosas distintas, '
    +'las marcas se cargan a mano y el aparato es el que no está certificado.</p>'
    +MODULOS_CONOCIDOS.map(function(m){
      const marcado=deEsta[m]?' checked':'';
      const titulo=TITULOS_DE_MODULO[m]||m;
      return '<label style="display:flex;gap:9px;align-items:flex-start;padding:7px 0;'
        +'border-bottom:1px solid var(--borde,#eee);cursor:pointer">'
        +'<input type="checkbox" data-modulo="'+m+'"'+marcado+' style="margin-top:2px">'
        +'<span><b>'+escHtml(titulo)+'</b><br>'
        +'<small style="opacity:.7"><code>'+escHtml(m)+'</code></small></span></label>';
    }).join('');
}
// Y LOS TÍTULOS LEGIBLES, QUE EL CÓDIGO ES PARA MÍ
const TITULOS_DE_MODULO={
  porteria:'Registro de ingresos y salidas',
  trabajadores:'Fichas y listado de trabajadores',
  asistencia:'Tarja mensual, justificación diaria y bitácora',
  carga_masiva:'Carga masiva de trabajadores',
  empresas:'Usuarios, permisos y datos de empresa',
  contratos:'Contratación: kit, plantillas y papeles firmados',
  expedientes:'Expedientes de documentos',
  solicitar_ingreso:'Solicitud de ingreso del supervisor',
  epp:'Bodega: EPP, kits y herramientas',
  remuneraciones:'Remuneraciones',
  relojes:'Relojes y centros de costo (el aparato; sin certificar)',
  marcajes:'Marcajes del sistema de asistencia',
};

function modMarcarTodas(valor){
  document.querySelectorAll('#modList input[data-modulo]').forEach(function(c){ c.checked=!!valor; });
}
async function guardarModulos(){
  if(!soyAdmin()){
    alert('Solo el administrador del sistema puede prender y apagar módulos.');
    return;
  }
  const sel=document.getElementById('modEmpresa');
  const id=parseInt(sel.value,10);
  const empresasDeEsta=[];
  const apagados=[];
  document.querySelectorAll('#modList input[data-modulo]').forEach(function(c){
    empresasDeEsta.push({modulo_nombre:c.dataset.modulo, activo:!!c.checked});
    if(!c.checked)apagados.push(c.dataset.modulo);
  });
  if(apagados.length&&apagados.indexOf('relojes')>=0){
    const ok=confirm('Se va a apagar "relojes" (el Tótem y el reloj).\n\n'
      +'Esa empresa va a dejar de ver esas pantallas. Las marcas ya cargadas se '
      +'quedan guardadas y "marcajes" sigue disponible.\n\n¿Seguir?');
    if(!ok)return;
  }
  // Y SE BORRA Y SE VUELVE A ESCRIBIR, EN VEZ DE UN "UPSERT" POR CADA UNO
  //
  // Porque "upsert" no puede apagar una fila que existe: sólo la crea o la
  // actualiza. Para dejar un módulo en falso hay que escribir la fila, y para
  // quitarlo del todo hay que borrarla. Con la fila en "activo = false" el módulo
  // está apagado y se ve que alguien lo apagó a propósito, que es información.
  const nombres=empresasDeEsta.map(function(m){ return m.modulo_nombre; });
  const {error:borrar}=await window.supabaseClient.from('empresa_modulos')
    .delete().eq('empresa_id',id).in('modulo_nombre',nombres);
  if(borrar){
    alert('No se pudieron cambiar los módulos: '+borrar.message);
    return;
  }
  const {error:poner}=await window.supabaseClient.from('empresa_modulos')
    .insert(empresasDeEsta.map(function(m){
      return {empresa_id:id, modulo_nombre:m.modulo_nombre, activo:m.activo};
    }));
  if(poner){
    alert('No se pudieron guardar los módulos: '+poner.message+'\n\n'
      +'Puede que no seas el administrador del sistema: la base sólo deja escribir '
      +'a "es_admin()".');
    return;
  }
  await cargarModulos();
  await pintarModulos();
  // Y EL AVISO AL TERMINAR DICE QUÉ SE PRENDIÓ Y QUÉ SE APAGÓ, Y NO SÓLO "LISTO"
  //
  // Y no es por prolijidad. En una lista de once casillas, una que se olvidó de
  // destrabar cambia lo que la empresa ve sin que nadie se entere, y un "guardado"
  // a secas no dice cuál fue.
  //
  // Y el mensaje dice que el cambio es SÓLO de esta empresa, porque el nombre del
  // campo de arriba puede hacer creer que se guardó para todas.
  const prendidos=empresasDeEsta.filter(function(m){ return m.activo; })
    .map(function(m){ return m.modulo_nombre; });
  alert('Guardado para la empresa '+id+'.\n\n'
    +(prendidos.length?('Encendidos: '+prendidos.join(', ')+'\n\n'):'')
    +(apagados.length?('Apagados: '+apagados.join(', ')+'\n\n'):'')
    +'Esto vale solo para esta empresa. Las otras no se mueven.');
}

// ---------------------------------------------------------------------
// FILTRAR EL MENÚ
// ---------------------------------------------------------------------
// Y SE FILTRA LA LISTA QUE SE DIBUJA, NO EL DOM
//
// Esta es la parte que el pedido llamaba "borrar con remove()", y por qué no:
// "showGroup" hace "sub.innerHTML = items.map(...)" cada vez que se cambia de
// grupo. Lo que se borre vuelve en el siguiente clic. Además, borrar del DOM no es
// seguridad: la fila de la base sigue ahí y el permiso sigue dado.
//
// Lo que hace falta son dos cosas, y las dos están: esta función, que no dibuja
// lo que no corresponde, y "aplicarModulos", que impide abrir la vista aunque se
// llegue a ella por otro camino.
//
// Y DEVUELVE UNA COPIA, SIN TOCAR "navGroups"
//
// Porque "navGroups" es una constante compartida por todos los usuarios que se
// abren en la misma pestaña: si se filtrara en el sitio, el cambioduraría para los
// demás y al cambiar de empresa no se podría volver a pintar todo.
function filtrarNavItems(items){
  if(!Array.isArray(items)) return [];
  return items.filter(function(it){
    // Y LA PANTALLA DE MÓDULOS SOLO PARA EL ADMINISTRADOR
    //
    // Sin esto, un encargado de RRHH vería "Empresas: módulos" en el menú, entraría,
    // y la base le rechazaría cada escritura con un error de RLS que en pantalla es
    // un "new row violates row-level security policy" que no significa nada para
    // quien lo lee.
    //
    // Es la única vista que se filtra por rol y no por módulo, y por eso está
    // explícita acá y no en una lista más. La base sigue siendo la que manda.
    // Y CON "typeof" PORQUE "soyAdmin" ESTÁ EN OTRO ARCHIVO
//
// "soyAdmin" vive en "views/soporte/soporte.js", que se carga DESPUÉS que este
// archivo. While está definido cuando se llega a usar —que es después de iniciar
// sesión—, si ese archivo llegara a fallar, acá la llamada saltaría y con ella el
// menú entero. Con "typeof" no salta: la pantalla no se muestra y el resto sigue.
if(it.v==='empresa-modulos'&&!(typeof soyAdmin==='function'&&soyAdmin())) return false;
    // Y SI EL PADRE TIENE VISTA PROPIA, SU MÓDULO TAMBIÉN CUENTA
    //
    // Porque un padre con "v" es una vista: se le pide permiso, y se le tiene que
    // pedir el módulo también. Sin esta línea, un desplegable que se llama
    // "Relojes y centros de costo" sobrevive porque tiene un hijo vivo, y el nombre
    // del módulo apagado queda arriba del todo. Se separaron los grupos para que no
    // pase, pero el filtro tiene que estar bien por sí mismo: mañana alguien agrupa
    // dos vistas y el mismo problema vuelve, y sin aviso.
    if(it.v && !(moduloActivo('v-'+it.v))) return false;
    if(it.options){
      // Y UN GRUPO SIN NADA ADENTRO SE SACA ENTERO
      //
      // Porque un desplegable que se abre y está vacío es peor que no verlo: la
      // persona abre el menú, no hay nada, y no sabe si está roto o si no tiene
      // permiso.
      const dentro=filtrarNavItems(it.options);
      return dentro.length>0;
    }
    if(it.children){
      const dentro=filtrarNavItems(it.children);
      if(!dentro.length) return false;
      return Object.assign({}, it, {children:dentro});
    }
    // Y EL CASO NORMAL: UNA VISTA CON SU MÓDULO
    if(it.v&&!(moduloActivo('v-'+it.v))) return false;
    return true;
  });
}