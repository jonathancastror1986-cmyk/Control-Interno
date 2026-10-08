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
  'v-expedientes': 'expedientes',
};

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
// Y "TODAS LAS EMPRESAS" CUANDO EL ÁMBITO ES 0
//
// Y EN "TODAS", UN MÓDULO ESTÁ DISPONIBLE SOLO SI ESTÁ EN TODAS LAS EMPRESAS
//
// Y por qué la más restrictiva y no la más generosa: el selector de arriba puede
// estar en "Todas las empresas". Si el módulo está prendido en la empresa 1 y
// apagado en la 2, y se mostrara por estar en alguna, al abrir la vista se vería
// un módulo que no existe para la mitad de lo que hay en pantalla. Con la regla
// estricta, el módulo no aparece, que es la respuesta que no confunde.
//
// Y una excepción: si el usuario NO tiene ninguna empresa en el ámbito, no hay nada
// que cruce y no se muestra nada. Es lo mismo que no tener módulos.
function empresasDelAmbito(){
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
  if(!empresas.length) return false;
  return empresas.every(function(id){
    const deEsta = modulosPorEmpresa[String(id)];
    // Y SIN FILA ES APAGADO. Esta línea es la regla entera.
    return !!(deEsta && deEsta.has(modulo));
  });
}

// Y SI UN MÓDULO ENTERO ESTÁ APAGADO
function moduloEncendido(modulo){
  if(!modulo) return true;
  if(typeof window !== 'undefined' && window.esAdminDelSistema && ADMIN_SIEMPRE_TODO) return true;
  if(!modulosCargados) return true;
  const empresas = empresasDelAmbito();
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