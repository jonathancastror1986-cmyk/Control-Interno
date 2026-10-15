// ¿QUÉ PUEDO HACER?          lo contesta "tiene_permiso()"
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

// Se comparan contra "VISTAS_POR_PERMISO", que es la lista de vistas con permiso
const MODULO_POR_VISTA = {
  'v-porteria': 'porteria',
  'v-nuevo-trabajador': 'trabajadores',
  'v-listado-trabajadores': 'trabajadores',
'v-ficha-trabajador': 'trabajadores',
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

// [word-04]  Y "soyAdmin()" YA EXISTE, Y NO SE REPITE
function sincronizarAdmin(){
  window.esAdminDelSistema=(typeof soyAdmin==='function')?soyAdmin():false;
  return window.esAdminDelSistema;
}

// Y ESTO SE PREGUNTA EN CADA USO, Y NO SE LEE DE "window"
function adminPassaTodo(){
  // Y CON EL VALOR DE LA VARIABLE COMO PLAN B, PARA EL CASO DE QUE "soyAdmin" NO
  // ESTÉ DEFINIDA
  if(typeof soyAdmin==='function')return soyAdmin();
  return !!window.esAdminDelSistema;
}

// Porque "moduloActivo" se llama en cada botón del menú, en cada cambio de vista y
let modulosPorEmpresa = {};      // { '1': Set{'trabajadores', ...}, '2': Set{} }
let modulosCargados = false;
let errorAlCargarModulos = '';

// Porque el administrador es quien CERTIFICA el Tôtem.
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

// Y DEVUELVE "null" CUANDO TODAVÍA NO SE SABE, QUE ES DISTINTO DE "NO HAY NINGUNA"
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

// 1. Si no hay vista o no tiene módulo, se deja pasar. No inventar un módulo para
function moduloActivo(vista){
  if(!vista) return true;
  const modulo = MODULO_POR_VISTA[vista];
  if(!modulo) return true;
  if(ADMIN_SIEMPRE_TODO && adminPassaTodo()) return true;
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

// La consulta a "empresa_modulos" puede devolver CERO filas sin que haya un solo
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
  if(ADMIN_SIEMPRE_TODO && adminPassaTodo()) return true;
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

// Y POR QUÉ ESCRIBE "empresa_modulos" Y NO OTRA TABLA
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

// Esta es la parte que el pedido llamaba "borrar con remove()", y por qué no:
function filtrarNavItems(items){
  if(!Array.isArray(items)) return [];
  return items.filter(function(it){
// Sin esto, un encargado de RRHH vería "Empresas: módulos" en el menú, entraría,
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