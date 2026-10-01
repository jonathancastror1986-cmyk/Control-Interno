// ===================================================================
// Un supervisor encuentra a alguien nuevo y anota lo que tiene delante. RRHH le
// pone el código. Nadie más puede hacerlo, y esa separación es el punto: el
// código es la llave de tarjetas, asistencia, EPP y herramientas.
//
// NADA SE ESCRIBE DIRECTO EN UNA TABLA
// -----------------------------------
// Todo pasa por las funciones de la 046, que son security definer. Desde el
// navegador no se inserta ni se lee nada de ingresos_pendientes.
//
// No es un capricho: la 046 enciende el RLS y NO define ninguna política, así
// que la tabla no se puede leer ni escribir sin pasar por la puerta. Si desde
// acá se hiciera un insert directo, fallaría con "new row violates row-level
// security", y con razón.
//
// LAS FUNCIONES QUE YA EXISTÍAN, Y QUE NO SE DECLARAN DE NUEVO
// --------------------------------------------------------------
//   normalizarRut   ya existe: quita todo lo que no sea dígito y la K
//   empresaDelIngreso   ya existe: lee el selector de empresa
//
// No se vuelven a declarar. La regla es una sola: si el archivo ya tiene un
// "function NOMBRE", no se declara otro. Es lo que rompió el intento anterior,
// y la comprobación que lo agarró ya existía y no se había corrido antes de
// escribir.

let ingresosCache=[];              // la cola, para que el diálogo sepa de quién es
let ingresoAprobando=null;         // el pedido abierto en el diálogo

// -- los mensajes de error, en un solo sitio -------------------------------
// Eran tres alert() iguales en tres funciones, y con eso había que cambiar el
// texto tres veces. Uno solo, que se lee en todas partes.
function erroIngreso(destino,mensaje){
  const caja=document.getElementById(destino);
  if(caja){caja.textContent=mensaje;caja.style.color='var(--danger)';}
}
function limpiarErroIngreso(destino){
  const caja=document.getElementById(destino);
  if(caja){caja.textContent='';caja.style.color='';}
}
function avisoIngreso(mensaje){
  const caja=document.getElementById('ingAviso');
  if(!caja)return;
  caja.textContent=mensaje;
  caja.style.color=/enviad/i.test(mensaje)?'var(--accent)':'var(--danger)';
}

// -- el formulario del supervisor ---------------------------------------
function limpiarFormularioIngreso(){
  ['ingRut','ingNombre','ingTelefono','ingGrupo','ingCargo','ingFecha','ingNota']
    .forEach(id=>{const c=document.getElementById(id);if(c)c.value='';});
  avisoIngreso('');
  const b=document.getElementById('ingEnviar');
  if(b){b.disabled=false;b.textContent='Enviar a RRHH';}
  const r=document.getElementById('ingRut');
  if(r)r.focus();
}

async function enviarSolicitudIngreso(){
  if(!exigirPermiso('ingresos.pedir','No tienes permiso para solicitar ingresos.'))return;
  // El RUT se pasa normalizado, sin puntos ni guiones, porque la base compara
  // con esa forma. Si cada quien lo escribiera como quiso, la base no vería el
  // duplicado y alguien entraría dos veces.
  const rut=normalizarRut(document.getElementById('ingRut').value);
  const nombre=document.getElementById('ingNombre').value.trim();
  if(!rut){
    avisoIngreso('Falta el RUT. Sin RUT no se puede saber si la persona ya está en la lista.');
    document.getElementById('ingRut').focus();
    return;
  }
  if(!nombre){avisoIngreso('Falta el nombre.');document.getElementById('ingNombre').focus();return;}

  const b=document.getElementById('ingEnviar');
  b.disabled=true;b.textContent='Enviando…';
  try{
    const {error}=await window.supabaseClient.rpc('pedir_ingreso',{
      p_nombre:nombre,
      p_rut:rut,
      p_telefono:document.getElementById('ingTelefono').value.trim()||null,
      p_especialidad:document.getElementById('ingCargo').value.trim()||null,
      p_empresa_id:empresaDelIngreso(),
      p_fecha_ingreso:document.getElementById('ingFecha').value||null,
      p_nota:document.getElementById('ingNota').value.trim()||null
    });
    if(error){
      // Los mensajes de la función están escritos para quien los lee, no para
      // el técnico. Se muestran tal cual: "ya hay un ingreso pendiente con
      // ese RUT" es más útil que un "código 22023".
      avisoIngreso(error.message);
      b.disabled=false;b.textContent='Enviar a RRHH';
      return;
    }
    limpiarFormularioIngreso();
    avisoIngreso('Enviado a RRHH. Ellos le asignan el código y completan los datos.');
    renderMisIngresos();
  }catch(e){
    avisoIngreso('No se pudo enviar: '+e.message);
    b.disabled=false;b.textContent='Enviar a RRHH';
  }
}

// -- la empresa donde se está mirando ---------------------------------------
// Lee el MISMO selector que usa el resto del programa, no uno nuevo. Si se
// inventa otro, el de arriba deja de ser la fuente y quedan dos verdades sobre
// en qué empresa se está trabajando.
//
// Y el caso "Todas las empresas" (valor 0) devuelve null a propósito: un
// ingreso no es de todas las empresas a la vez. Si se mandara el 0, la base lo
// aceptaría y la ficha quedaría colgada de un id que no existe.
function empresaDelIngreso(){
  const sel=document.getElementById('empresaSel');
  const v=sel&&sel.value?parseInt(sel.value,10):0;
  return v>0?v:null;
}

// -- lo que el supervisor ve de lo suyo ----------------------------------
async function renderMisIngresos(){
  const caja=document.getElementById('ingMisPendientes');
  if(!caja)return;
  if(!exigirPermiso('ingresos.pedir','')){caja.innerHTML='';return;}
  const {data,error}=await window.supabaseClient.rpc('ver_ingresos_pendientes');
  if(error){
    caja.innerHTML='<small>No se pudieron leer tus pedidos: '+escHtml(error.message)+'</small>';
    return;
  }
  const mios=(data||[]).filter(f=>f.estado==='pendiente');
  if(!mios.length){
    caja.innerHTML='<small class="muted">No has enviado ningún ingreso pendiente.</small>';
    return;
  }
  caja.innerHTML='<div class="list-item" style="flex-direction:column;align-items:stretch">'
    +mios.map(f=>'<div style="padding:8px 0;border-bottom:1px solid var(--line)">'
      +'<b>'+escHtml(f.nombre)+'</b> <small>'+escHtml(f.rut)+'</small><br>'
      +'<small>Enviado el '+escHtml((f.pedido_at||'').slice(0,10))
      +' · esperando que RRHH le asigne el código</small></div>').join('')+'</div>';
}

// -- la cola, para quien aprueba ------------------------------------------
async function cargarIngresosPendientes(){
  const caja=document.getElementById('ingCola');
  if(!caja)return;
  if(!exigirPermiso('ingresos.aprobar','')){
    caja.innerHTML='<div class="kitResumen"><b>No tienes permiso para ver esta cola.</b><br>'
      +'<small>Lo necesitan quienes pueden asignar el código del trabajador.</small></div>';
    return;
  }
  caja.innerHTML='<small>Cargando…</small>';
  const filtro=document.getElementById('ingFiltroEstado');
  const estado=filtro?filtro.value:'pendiente';
  const {data,error}=await window.supabaseClient.rpc('ver_ingresos_pendientes');
  if(error){
    caja.innerHTML='<div class="kitResumen" style="border-color:var(--danger)">'
      +'<b>No se pudo leer la cola.</b><br><small>'+escHtml(error.message)+'</small>'
      +'<br><small>Si dice que falta una tabla, es que no está aplicada la migración 046.</small></div>';
    return;
  }
  ingresosCache=data||[];
  let filas=ingresosCache;
  if(estado)filas=filas.filter(f=>f.estado===estado);

  if(!filas.length){
    caja.innerHTML='<div class="kitResumen"><b>No hay ingresos '+escHtml(filtroTexto(estado))
      +'.</b><br><small>Cuando un supervisor envíe uno, aparece acá.</small></div>';
    return;
  }
  caja.innerHTML=filas.map(f=>filaIngreso(f)).join('');
}
function filtroTexto(estado){
  if(estado==='pendiente')return 'pendientes';
  if(estado==='aprobado')return 'aprobados';
  if(estado==='rechazado')return 'rechazados';
  return 'que mostrar';
}
function filaIngreso(f){
  const activo=f.estado==='pendiente';
  const id=String(f.id).replace(/'/g,'');
  return '<div class="card" style="margin:0 0 10px;padding:12px">'
    +'<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">'
    +  '<div style="flex:2;min-width:220px"><b>'+escHtml(f.nombre)+'</b><br>'
    +    '<small>'+escHtml(f.rut)+(f.telefono?' · '+escHtml(f.telefono):'')+'</small><br>'
    +    '<small>'+escHtml(f.especialidad||'sin especialidad')+' · '
    +    escHtml(empresaDelNombre(f.empresa_id))+' · ingreso '
    +    escHtml(f.fecha_ingreso||'sin fecha')+'</small></div>'
    +  '<div style="flex:1;min-width:190px"><small>Pedido por <b>'
    +    escHtml(f.pedido_por_nombre||'sin nombre')+'</b> · '
    +    escHtml((f.pedido_at||'').slice(0,10))+'</small>'
    +    (f.nota?'<div style="margin-top:4px"><small>'+escHtml(f.nota)+'</small></div>':'')
    +    (f.estado==='rechazado'?'<div style="margin-top:4px"><small style="color:var(--danger)">'
    +      'Rechazado: '+escHtml(f.motivo_rechazo||'sin motivo')+'</small></div>':'')
    +    (f.estado==='aprobado'?'<div style="margin-top:4px"><small style="color:var(--accent)">'
    +      'Aprobado'+(f.trabajador_code?' como '+escHtml(f.trabajador_code):'')+'</small></div>':'')
    +  '</div>'
    +  (activo?'<div style="display:flex;gap:6px">'
    +      '<button class="btn" type="button" onclick="abrirAprobarIngreso(\''+id+'\')">Aprobar y poner el código</button>'
    +      '<button class="btn secondary" type="button" onclick="abrirRechazarIngreso(\''+id+'\')">Rechazar</button>'
    +    '</div>':'')
    +'</div></div>';
}
function empresaDelNombre(id){
  if(!id)return 'sin empresa';
  if(typeof empresas==='undefined'||!empresas)return 'empresa '+id;
  const e=empresas.find(x=>String(x.id)===String(id));
  return e?e.nombre:'empresa '+id;
}

// -- el diálogo de aprobar -------------------------------------------------
function abrirAprobarIngreso(id){
  if(!exigirPermiso('ingresos.aprobar','Solo quien puede asignar el código.'))return;
  const f=ingresosCache.find(x=>String(x.id)===String(id));
  ingresoAprobando=id;
  limpiarErroIngreso('ingDlgError');
  document.getElementById('ingDlgInfo').innerHTML=f
    ? '<b>'+escHtml(f.nombre)+'</b> · '+escHtml(f.rut)+'<br>'
      +escHtml(f.especialidad||'sin especialidad')+' · ingreso '
      +escHtml(f.fecha_ingreso||'sin fecha')+(f.nota?'<br>'+escHtml(f.nota):'')
    : '';
  document.getElementById('ingDlgCodigo').value='';
  document.getElementById('ingDlgCargo').value=f&&f.especialidad?f.especialidad:'';
  document.getElementById('ingDlgFecha').value=f&&f.fecha_ingreso?f.fecha_ingreso:'';
  document.getElementById('dlgAprobarIngreso').classList.add('open');
  setTimeout(()=>document.getElementById('ingDlgCodigo').focus(),60);
}
function abrirRechazarIngreso(id){
  if(!exigirPermiso('ingresos.aprobar','Solo quien puede resolver ingresos.'))return;
  const f=ingresosCache.find(x=>String(x.id)===String(id));
  ingresoAprobando=id;
  limpiarErroIngreso('ingDlgRechError');
  document.getElementById('ingDlgRechInfo').innerHTML=f
    ? '<b>'+escHtml(f.nombre)+'</b> · '+escHtml(f.rut)
    : '';
  document.getElementById('ingDlgMotivo').value='';
  document.getElementById('dlgRechazarIngreso').classList.add('open');
  setTimeout(()=>document.getElementById('ingDlgMotivo').focus(),60);
}
function cerrarDialogoIngreso(){
  document.getElementById('dlgAprobarIngreso').classList.remove('open');
  document.getElementById('dlgRechazarIngreso').classList.remove('open');
  ingresoAprobando=null;
}

async function aprobarIngresoPendiente(){
  if(!ingresoAprobando)return;
  const codigo=document.getElementById('ingDlgCodigo').value.trim();
  if(!codigo){
    erroIngreso('ingDlgError','Falta el código del trabajador. Sin código no se puede crear la ficha.');
    document.getElementById('ingDlgCodigo').focus();
    return;
  }
  const b=document.getElementById('ingDlgAprobar');
  b.disabled=true;b.textContent='Creando…';
  const {error}=await window.supabaseClient.rpc('aprobar_ingreso_pendiente',{
    p_ingreso_id:ingresoAprobando,
    p_codigo:codigo,
    p_cargo:document.getElementById('ingDlgCargo').value.trim()||null,
    p_fecha_ingreso:document.getElementById('ingDlgFecha').value||null
  });
  b.disabled=false;b.textContent='Aprobar y crear el trabajador';
  if(error){
    // La base rechaza el código repetido y el RUT que ya es trabajador, con
    // mensajes escritos para leerse. Se muestran tal cual.
    erroIngreso('ingDlgError',error.message);
    return;
  }
  cerrarDialogoIngreso();
  // El trabajador nuevo tiene que aparecer en la lista sin recargar la página
  await loadWorkers();
  renderList('');
  await cargarIngresosPendientes();
  renderMisIngresos();
}

async function rechazarIngresoPendiente(){
  if(!ingresoAprobando)return;
  const motivo=document.getElementById('ingDlgMotivo').value.trim();
  if(!motivo){
    erroIngreso('ingDlgRechError','El motivo es obligatorio: el supervisor necesita saber qué corregir.');
    return;
  }
  const {error}=await window.supabaseClient.rpc('rechazar_ingreso_pendiente',{
    p_ingreso_id:ingresoAprobando,
    p_motivo:motivo
  });
  if(error){erroIngreso('ingDlgRechError',error.message);return;}
  cerrarDialogoIngreso();
  await cargarIngresosPendientes();
  renderMisIngresos();
}
// ===================================================================
// LOS DOS DESPLEGABLES ANIDADOS: GRUPO Y CARGO
// ===================================================================
//
// Son dos porque son dos preguntas. La primera es "de qué ÁREA es", que tiene
// pocas respuestas; la segunda es "de qué CARGO es", que tiene muchas y
// además dependen de la primera: los cargos de OBRA no son los de OFICINA.
//
// -------------------------------------------------------------------
// QUÉ SE GUARDA, Y NO ES LO MISMO EN LOS DOS LUGARES
// ----------------------------------------------------
//
// En el TRABAJADOR se guarda solo el cargo. El grupo se deduce de él.
//
// Guardar los dos sería guardar el mismo dato dos veces, y el día que
// alguien moviera un cargo de grupo sin actualizar a la gente que lo tenía,
// el trabajador quedaría en un grupo con un cargo que no es de ese grupo.
// Eso no se ve hasta que la persona recibe el EPP de otra área.
//
// En las CHARLAS y los DOCUMENTOS se guardan los dos, porque ahí la pregunta
// es al revés: "esta charla es para todos los de OBRA" es un papel distinto
// de "esta charla es para los MAESTROS", y las dos cosas tienen que poder
// existir a la vez.
//
// -------------------------------------------------------------------
// LO QUE SE GUARDA ES LA CLAVE, NUNCA EL NOMBRE
// ---------------------------------------------
// El nombre se puede cambiar ("Maestro" a "Jefe de obra") y la clave no. Si
// se guardara el nombre, un cambio de nombre dejaría sin cargo a medio
// mundo sin que nadie lo note.
//
// Y si la 051 no está aplicada, esto no se rompe: la lista queda vacía y el
// ingreso se envía igual, sin cargo. Es la misma degraded que había antes,
// no un error nuevo.
let jerarquiaCargos=[];
let jerarquiaCargada=false;

async function cargarJerarquiaCargos(forzar){
  if(jerarquiaCargada&&!forzar)return jerarquiaCargos;
  jerarquiaCargada=true;   // antes de esperar, para no disparar dos veces
  try{
    const {data,error}=await window.supabaseClient.rpc('jerarquia_cargos',{
      p_empresa_id:empresaDelIngreso(),
      p_solo_activos:true
    });
    if(error){jerarquiaCargos=[];return jerarquiaCargos;}
    jerarquiaCargos=(data||[]).map(r=>({
      grupo:r.grupo_clave,
      grupoNombre:r.grupo_nombre,
      grupoOrden:Number(r.grupo_orden)||0,
      cargo:r.cargo_clave,
      cargoNombre:r.cargo_nombre
    }));
  }catch(e){jerarquiaCargos=[];}
  return jerarquiaCargos;
}

// Los grupos, sin repetir, en el orden en que los manda la base.
function gruposQueExisten(){
  const vistos={},out=[];
  jerarquiaCargos.forEach(f=>{
    if(!f.grupo||vistos[f.grupo])return;
    vistos[f.grupo]=1;out.push(f);
  });
  return out;
}
function cargosDeGrupo(g){
  return jerarquiaCargos.filter(f=>f.grupo===g);
}
function grupoDeCargo(c){
  const f=jerarquiaCargos.find(x=>x.cargo===c);
  return f?f.grupo:'';
}
function nombreDeGrupo(g){
  const f=jerarquiaCargos.find(x=>x.grupo===g);
  return f?(f.grupoNombre||g):g;
}

// El segundo desplegable, ya con el grupo elegido.
function pintarOpcionesCargo(sel,g){
  if(!sel)return;
  if(!g){
    sel.innerHTML='<option value="">Sin asignar (solo los papeles generales)</option>';
    return;
  }
  const lista=cargosDeGrupo(g);
  sel.innerHTML='<option value="">— elige el cargo —</option>'
    +lista.map(f=>'<option value="'+escHtml(f.cargo)+'">'+escHtml(f.cargoNombre||f.cargo)+'</option>').join('');
}

// Los dos, desde cero.
function pintarGrupoCargo(selGrupo,selCargo,cargoPrevio){
  if(!selGrupo||!selCargo)return;
  selGrupo.innerHTML='<option value="">Sin asignar</option>'
    +gruposQueExisten().map(f=>'<option value="'+escHtml(f.grupo)+'">'+escHtml(f.grupoNombre||f.grupo)+'</option>').join('');
  // Si ya había un cargo, se abre SU grupo. Si no, se deja en "sin asignar":
  // elegir el grupo de la persona a ciegas es peor que no elegirlo.
  const g=cargoPrevio?grupoDeCargo(cargoPrevio):'';
  selGrupo.value=g;
  pintarOpcionesCargo(selCargo,g);
  if(cargoPrevio&&[...selCargo.options].some(o=>o.value===cargoPrevio))selCargo.value=cargoPrevio;
}

// Al abrir una ficha con un cargo ya guardado: se arma el grupo solo.
function seleccionarGrupoYCargo(selGrupo,selCargo,cargo){
  if(!selGrupo||!selCargo)return;
  if(!selGrupo.options.length||selGrupo.options.length===1){
    selGrupo.innerHTML='<option value="">Sin asignar</option>'
      +gruposQueExisten().map(f=>'<option value="'+escHtml(f.grupo)+'">'+escHtml(f.grupoNombre||f.grupo)+'</option>').join('');
  }
  const g=cargo?grupoDeCargo(cargo):'';
  selGrupo.value=g;
  pintarOpcionesCargo(selCargo,g);
  if(cargo&&[...selCargo.options].some(o=>o.value===cargo))selCargo.value=cargo;
}

// El texto "Obra › Maestro" que se muestra al lado, para que se vea que se
// eligió un cargo y no una palabra suelta.
function textoGrupoYCargo(cargo){
  if(!cargo)return 'Sin asignar (solo los papeles generales)';
  const g=grupoDeCargo(cargo);
  const f=jerarquiaCargos.find(x=>x.cargo===cargo);
  return (g?nombreDeGrupo(g)+' › ':'')+(f?(f.cargoNombre||cargo):cargo);
}

// -- los dos del ingreso -------------------------------------------------
async function llenarEspecialidadIngreso(){
  await cargarJerarquiaCargos();
  pintarGrupoCargo(document.getElementById('ingGrupo'),document.getElementById('ingCargo'),null);
}
function cambiarGrupoIngreso(){
  const sg=document.getElementById('ingGrupo');
  const sc=document.getElementById('ingCargo');
  if(!sg||!sc)return;
  pintarOpcionesCargo(sc,sg.value);
  avisoIngreso('');
}

function initView(v){
  if(typeof stopLiveScan==='function')stopLiveScan(); // no dejar la cámara corriendo al cambiar de vista
  if(v==='solicitar-cambio'){initSolicitarCambio();initVistaSolicitar();}
  if(v==='solicitar-ingreso'){llenarEspecialidadIngreso();limpiarFormularioIngreso();renderMisIngresos();}
  if(v==='ingresos-cola'){cargarIngresosPendientes();}
  if(v==='aprobar-cambio'){
    renderSolicitudes();renderMisSolicitudes();renderAvisoSolicitudes();
    // La bandeja de avisos de ingreso y la bitácora se cargan al abrir la
    // vista, no al arrancar: son de Administración y casi nadie las mira.
    loadBandejaAvisos();
    loadBitacora();
  }
  if(v==='permisos'){renderPermisos();}
  if(v==='empresas-cargos'){cargarEmpresasCargos();}
  if(v==='buscar-tarjeta'){fillCardSelect();renderCard();}
  if(v==='imprimir-tarjetas'){fillPdfChecks();}
  if(v==='empresa'){loadEmpresaForm();revisarMigraciones();}
  if(v==='nuevo-trabajador'){fillWorkerEmpresaSelect();}
  if(v==='usuarios'){loadPerfiles();}
  if(v==='invitar-usuario'){initInvitarUsuario();}
  if(v==='mi-perfil'){initMiPerfil();}
  if(v==='alertas-sociales'){renderWorkerAlerts('social');}
  if(v==='alertas-prevencion'){renderWorkerAlerts('prevencion');}
  if(v==='indicaciones-sociales'){initWorkerInstructions('social');}
  if(v==='indicaciones-prevencion'){initWorkerInstructions('prevencion');}
  if(v==='listado-trabajadores'){fillWorkerSupervisorFilter();renderList();}
  if(v==='asignar-supervisor'){initAsignarSupervisor();}
  if(v==='carga-csv-trabajadores')document.getElementById('workersCsvMsg').textContent='';
  if(v==='bodega-epp'||v==='bodega-historial'||v==='bodega-catalogo'||v==='bodega-asignar'){initBodega();}
  if(v==='bodega-epp'){initSignaturePad('');}
  if(v==='bodega-kits'){initKitsView();initSignaturePad('Kit');}
  if(v==='bodega-kits-admin'){loadEspecialidades(true).then(renderEspecialidades);}
  if(v==='bodega-epp-catalogo'){renderEppCatalog();}
  if(v==='bodega-historial'){fillEppItemFilter();renderEppHistory();}
  if(v==='bodega-qr'){initQrView();}
  if(v==='supervisores'){initSupervisores();}
  if(v==='sup-diaria'){initDiaria();}
  if(v==='just-diaria'){initJustificacionDiaria();}
  if(v==='auditoria'){initAuditoria();}
  if(v==='relojes'){cargarRelojes();}
  if(v==='marcajes'){
    // Encadenado, no con await: initView no es async. Los filtros por reloj
    // necesitan la lista de relojes, y cargarMarcajes la necesita para saber
    // de qué reloj son los marcajes que trae.
    (relojCargado?Promise.resolve():cargarRelojes())
      .then(()=>cargarMarcajes())
      .then(llenarFiltroRelojesMarcajes)
      // El centro de costo va después de los relojes porque depende de la
      // misma lista de centros que se acaba de cargar.
      .then(llenarFiltroCentrosMarcajes)
  }
  // Un usuario reloj no navega vistas: se queda en la pantalla de marcaje.
  if(soyUsuarioReloj()){abrirTotemPorRelojDelUsuario();return;}
  if(v==='kit'){cargarContratacion().then(cargarEspecialidadesContratacion).then(()=>initKitView());}
  if(v==='plantillas-kit'){cargarContratacion().then(cargarEspecialidadesContratacion).then(()=>{renderPlantillas();renderEditorTimbre();});}
  if(v==='asistencia'){
    showAttendancePanel('tarja');
    const yearInput=document.getElementById('matYear');
    if(!yearInput.value){
      const today=new Date();
      yearInput.value=today.getFullYear();
      document.getElementById('matMonth').value=String(today.getMonth()+1);
    }
    fillAttendanceFilters();
    const opts=opcionesTrabajadores();
    document.getElementById('just-worker').innerHTML=opts;
    document.getElementById('man-worker').innerHTML=opts;
    showJustSupervisor();
    renderMatrix();
  }
}
function fillAttendanceFilters(){
  const supervisorSelect=document.getElementById('matSupervisorFilter');
  const selectedSupervisor=supervisorSelect.value;
  const supervisors=supervisoresActivos();
  const visMat=codigosVisibles(supervisors);
  supervisorSelect.innerHTML='<option value="">Todos los supervisores</option>'+supervisors.map(worker=>`<option value="${escHtml(worker.code)}">${escHtml(etiquetaSupervisor(worker,visMat))}</option>`).join('');
  if(supervisors.some(worker=>worker.code===selectedSupervisor))supervisorSelect.value=selectedSupervisor;
  updateAttendanceWorkerOptions();
}
function updateAttendanceWorkerOptions(preferredWorkerCode=''){
  const supervisorCode=document.getElementById('matSupervisorFilter').value;
  const workerSelect=document.getElementById('matWorkerFilter');
  const selectedWorker=preferredWorkerCode||workerSelect.value;
  const filteredWorkers=workers.filter(worker=>!supervisorCode||worker.supervisor_code===supervisorCode);
  // El value es el código real (es lo que se usa para consultar) y lo que se
  // ve lleva los 4 dígitos, que es lo que se va a usar para comparar con la
  // tarjeta o con el papel.
  workerSelect.innerHTML='<option value="">Todos los trabajadores</option>'+filteredWorkers.map(opcionTrabajador).join('');
  workerSelect.value=filteredWorkers.some(worker=>worker.code===selectedWorker)?selectedWorker:'';
}
function updateAttendanceWorkerFilter(){
  updateAttendanceWorkerOptions();
  renderMatrix();
}
function applyAttendanceQr(code,purpose){
  const worker=workers.find(item=>item.code===code);
  if(!worker){alert('No se encontró un trabajador con ese código QR.');return;}
  // "supervisor-team": escanear la tarjeta de alguien para saltar a su fila
  // en la tarja del supervisor. Solo se acepta si es del equipo propio.
  if(purpose==='supervisor-team'){
    if(miCodigoSupervisor&&worker.supervisor_code!==miCodigoSupervisor){
      alert(worker.name+' no está a tu cargo. Solo puedes consultar a tu equipo.');
      return;
    }
    const sups=supervisoresActivos();
    if(!miCodigoSupervisor){
      // quien no es supervisor: se ubica el equipo al que pertenece el
      // escaneado (su supervisor, no el supervisor de su supervisor)
      const dueno=workers.find(w=>w.code===worker.supervisor_code&&w.is_supervisor);
      if(!dueno){
        alert(worker.supervisor_code
          ? worker.name+' no tiene un supervisor válido asignado.'
          : worker.name+' no aparece en la tarja de ningún supervisor.');
        return;
      }
      document.getElementById('sup-view').value=dueno.code;
    }else{
      document.getElementById('sup-view').value=miCodigoSupervisor;
    }
    const y=parseInt(document.getElementById('supYear').value);
    const m=parseInt(document.getElementById('supMonth').value);
    const iso=isoLocal(new Date());
    const dia=parseInt(iso.slice(8),10);
    if(y!==parseInt(iso.slice(0,4))||m!==parseInt(iso.slice(5,7))){
      document.getElementById('supYear').value=iso.slice(0,4);
      document.getElementById('supMonth').value=String(parseInt(iso.slice(5,7)));
    }
    renderSupervisorMatrix();
    // resalta su fila y abre el día de hoy
    setTimeout(()=>{
      const fila=[...document.querySelectorAll('#supMatrixArea tr')]
        .find(tr=>tr.querySelector('.attendance-code-column')?.textContent.trim()===worker.code);
      if(fila){
        fila.style.outline='3px solid var(--accent)';
        const celda=fila.querySelectorAll('td.attendance-cell')[dia-1];
        if(celda&&celda.textContent.trim()!=='.')celda.scrollIntoView({block:'center',inline:'center'});
        setTimeout(()=>{fila.style.outline='';},4000);
      }
    },120);
    return;
  }
  const supervisorSelect=document.getElementById('matSupervisorFilter');
  if(purpose==='attendance-supervisor'){
    if(!worker.is_supervisor){alert('El código QR corresponde a un trabajador que no está marcado como supervisor.');return;}
    supervisorSelect.value=worker.code;
    updateAttendanceWorkerOptions();
    document.getElementById('matWorkerFilter').value='';
  }else{
    const supervisor=workers.find(item=>item.code===worker.supervisor_code&&item.is_supervisor);
    supervisorSelect.value=supervisor?supervisor.code:'';
    updateAttendanceWorkerOptions(worker.code);
  }
  renderMatrix();
}
function showAttendancePanel(name){
  document.querySelectorAll('[data-attendance-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.attendancePanel===name));
  document.querySelectorAll('[data-attendance-tab]').forEach(tab=>{
    const active=tab.dataset.attendanceTab===name;
    tab.classList.toggle('active',active);
    tab.setAttribute('aria-selected',String(active));
  });
  // La hora del marcaje manual tiene que ser la de ahora, no la que quedó
  // de la última vez que se abrió la pestaña.
  if(name==='marcaje'&&typeof prepararMarcajeManual==='function')prepararMarcajeManual();
}
function showView(v){
  // El menú del móvil se cierra al elegir algo. Si quedara abierto taparía la
  // vista que se acaba de abrir, y sería peor que no haberlo abierto.
  if(typeof cerrarMenuMovil==='function')cerrarMenuMovil();
  if(typeof stopLiveScan==='function')stopLiveScan(); // no dejar la cámara corriendo al cambiar de vista
  // no abrir una vista para la que no hay permiso
  const seccion=document.getElementById('v-'+v);
  if(seccion&&seccion.dataset.sinPermiso==='1'&&typeof puede==='function'&&!puede(VISTAS_POR_PERMISO['v-'+v])){
    // Se avisa por qué y a quién pedirlo. Antes solo se saltaba a otra
    // vista, sin decir nada: la persona hacía clic, la pantalla cambiaba a
    // otra cosa, y no entendía nada.
    const falta=VISTAS_POR_PERMISO['v-'+v]||'(sin permiso asociado)';
    alert('No podés ver "'+v+'".\n\nTe falta el permiso "'+falta+'".\n'+
      'Un administrador te lo puede habilitar en Soporte → Permisos por rol.');
    abrirPrimeraVistaPermitida();
    return;
  }
  // Si la vista no existe, NO se sigue como si nada: antes esto reventaba
  // con "Cannot read properties of null (reading 'classList')" y dejaba la
  // app a medio cambiar, con el menú marcado en una vista que no se veía.
  // Pasa cuando un botón del menú apunta a algo que nunca se construyó, y
  // es un error de código, no de la persona que hace clic.
  if(!seccion){
    console.error('showView: no existe la vista "v-'+v+'". Revisar el menú y las secciones.');
    abrirPrimeraVistaPermitida();
    return;
  }
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  seccion.classList.add('active');
  document.querySelectorAll('#subNav button').forEach(x=>x.classList.toggle('active',x.dataset.v===v));
  // El desplegable se CIERRA al elegir, y no se vuelve a abrir. Antes se
  // cerraban todos y enseguida se reabría el del botón que quedó activo,
  // que es justo el que el usuario acababa de cerrar: por eso había que
  // apretar dos veces el título del grupo para que se ocultara.
  //
  // La opción elegida sigue marcada en la barra (con el estilo "active"),
  // así que no hace falta dejarla a la vista.
  cerrarDesplegablesSubNav();
  initView(v);
}
// Cierra todos los desplegables del submenú, incluidos los anidados.
function cerrarDesplegablesSubNav(){
  document.querySelectorAll('#subNav details').forEach(d=>{d.open=false;});
}
// EL TITULO DEL ENCABEZADO, QUE DICE PARA QUE SIRVE CADA SECCION
//
// Antes decia siempre "Control de Asistencia y Portería", que es el
// nombre del proyecto, no el de la sección que se está mirando. Con
// siete secciones en la barra, un título que no cambia no dice nada.
//
// EL NOMBRE Y LA FUNCIÓN VAN SEPARADOS
// --------------------------------------
// El nombre en negrita y la función en un tono más bajo. Sin esa
// diferencia, "Portería" y "Registro de ingresos y salidas de la obra"
// se leen como una sola frase, y no queda claro cuál de las dos partes
// es el nombre de la sección.
//
// LA FUNCIÓN ES CORTA A PROPÓSITO
// ---------------------------------
// Va en el encabezado, al lado de la empresa y del botón de cerrar
// sesión. Un texto largo ahí empuja el resto y en pantallas angostas
// el botón de cerrar sesión es lo primero que se sale. Lo que hace la
// sección se dice en cuatro o cinco palabras, no en una frase.
//
// Y si algún día se agrega una sección sin descripción, el título
// queda solo con el nombre. No queda en blanco: un hueco vacío en la
// esquina de arriba se lee como que la aplicación se rompió.
const SECCIONES_TITULO = {
  'porteria': ['Portería','Registro de ingresos y salidas de la obra'],
  'administracion': ['Administración','Trabajadores, asistencia, aprobaciones y relojes'],
  'bodega': ['Bodega','Entrega de EPP y kits de contratación'],
  'supervisores': ['Supervisores','Equipos, asistencia diaria y avisos'],
  'soporte': ['Soporte','Usuarios, permisos y configuración'],
  'asistente-social': ['Asistente Social','Alertas e indicaciones sociales'],
  'prevencion': ['Prevención','Riesgos, EPP e indicaciones de prevención'],
};

const TITULO_POR_DEFECTO = 'Control de asistencia y portería';

function tituloDeLaSeccion(group){
  const el=document.getElementById('tituloSeccion');
  // El encabezado recibe el MISMO data-group que el boton de arriba y el
  // submenu, para sacar el color de las mismas reglas y no de una tercera
  // lista que un dia se quedaria vieja.
  el.dataset.group=group;
  // El <body> recibe el mismo data-group, para que --fondo-seccion exista en
  // toda la pagina y el encabezado y el menu la.hereden. Con el atributo solo
  // en el h1, el encabezado no la recibe: la variable no existe arriba, y se
  // queda con el color de respaldo.
  document.body.dataset.group=group;
  if(!el)return;
  const s=SECCIONES_TITULO[group];
  if(!s){
    el.textContent=TITULO_POR_DEFECTO;
    return;
  }
  el.innerHTML='<b>'+escHtml(s[0])+'</b>'+'<span class="tituloQue">'+escHtml(s[1])+'</span>';
}

// Se escribe una vez al arrancar. Si no, el encabezado seguiría diciendo
// el nombre del proyecto hasta que la persona tocara otro grupo, que no
// es lo mismo que tener el titulo.
tituloDeLaSeccion((document.querySelector('#mainNav button.active')||{}).dataset?.group);


function showGroup(group){
  document.querySelectorAll('#mainNav button').forEach(x=>x.classList.toggle('active',x.dataset.group===group));
  // El título del encabezado va con el grupo: el nombre de la sección y
  // lo que hace, para que arriba se sepa dónde se está.
  tituloDeLaSeccion(group);
  const sub=document.getElementById('subNav');
  // El submenu recibe el mismo data-group que el boton de arriba. Con eso
  // toma el color de la seccion por la misma regla, en vez de tener su
  // propia lista de colores, que un dia se quedaria vieja.
  sub.dataset.group=group;
  const items=navGroups[group];
  // si el grupo no tiene ningún permiso, se avisa y se abre el primero visible
  if(typeof puede==='function'&&misPermisosCargados){
    const reqs=GRUPOS_POR_PERMISOS[group];
    if(reqs&&!reqs.some(p=>puede(p))){
      alert('No tienes ningún permiso en "'+group+'". Pídele a un administrador que te lo habilite.');
    }
  }
  sub.innerHTML=items.map(it=>it.options
    ? `<details class="nav-dropdown"><summary class="nav-dropdown-trigger">${iconoMenu(it.v)}${it.label}</summary><div class="nav-dropdown-menu">${it.options.map(option=>option.children
      ? `<details class="nav-dropdown-nested"><summary>${option.label}</summary><div class="nav-dropdown-children">${option.children.map(child=>`<button type="button" data-v="${child.v}">${child.label}</button>`).join('')}</div></details>`
      : `<button type="button" data-v="${option.v}">${iconoMenu(option.v)}${option.label}</button>`
    ).join('')}</div></details>`
    : `<button data-v="${it.v}">${iconoMenu(it.v)}${it.label}</button>`
  ).join('');
  sub.querySelectorAll('button[data-v]').forEach(b=>b.addEventListener('click',()=>{
    // Un ítem bloqueado se puede hacer clic a propósito: contesta por qué
    // no abre. Si no hiciera nada, la persona pensaría que el botón se
    // rompió, que es una conclusión equivocada y difícil de corregir.
    if(b.hasAttribute('data-sin-permiso')){
      alert('No podés ver "'+b.textContent.trim()+'".\n\n'+
        'Te falta el permiso "'+b.getAttribute('data-sin-permiso')+'".\n'+
        'Un administrador te lo puede habilitar en Soporte → Permisos por rol.');
      return;
    }
    showView(b.dataset.v);
    // El desplegable se cierra al elegir. Sin esto queda abierto encima de
    // la vista que se acaba de abrir, tapándola, y hay que apretar en otra
    // parte de la pantalla para deshacerse. Con los submenús nuevos, que
    // tienen más cosas adentro, se nota todavía más.
    b.closest('details.nav-dropdown')?.removeAttribute('open');
  }));
  // Solo un desplegable abierto a la vez. Sin esto, en Bodega se podían
  // dejar EPP, KITS y HERRAMIENTAS abiertos al mismo tiempo, uno encima
  // del otro, tapando lo que había detrás.
  //
  // Se usa el evento "toggle" y no el "click" del summary porque "details"
  // es un elemento nativo: con el click hay que adivinar si se abría o se
  // cerraba, y con un clic rápido queda en el estado equivocado.
  sub.querySelectorAll('details.nav-dropdown').forEach(d=>{
    d.addEventListener('toggle',()=>{
      // En un teléfono la fila del submenú se desplaza de lado, y un contenedor
      // que se desplaza en horizontal recorta también en vertical: el menú del
      // desplegable se cortaría a la mitad. La clase "desplegado" le dice al
      // estilo que vuelva a envolver mientras haya alguno abierto, para que el
      // menú baje entero. Se lee el estado del propio "details" y no un
      // contador: un contador se desfasaría al cerrar dos de un clic.
      sub.classList.toggle('desplegado',!!sub.querySelector('details.nav-dropdown[open]'));
      if(!d.open)return;
      // Se cierra el hermano del mismo nivel. Se comparan los dos
      // desplegables de primer nivel, no todos: los anidados viven dentro
      // de su padre y se cierran con él.
      sub.querySelectorAll('details.nav-dropdown').forEach(otro=>{
        if(otro!==d)otro.open=false;
      });
    });
  });
  // Cuántas pestañas hay, para saber si toca repartirlas.
  //
  // El reparto solo se hace con más de ocho. Con ocho o menos las pestañas no
  // se pisan y sobra aire a la derecha: repartirlas ahí las estiraría a todas
  // por igual, y una de "Avisos del día" quedaría tan ancha como una de
  // "Relojes". Mucho hueco adentro y nada que leer.
  //
  // Y el ancho de cada una es el de la fila dividido en OCHO, no dividido entre
  // las que hay: así el ancho no cambia cuando se agrega o se saca una pestaña,
  // y lo que cambia es que la fila de abajo tiene una más. Si se dividiera entre
  // las que hay, cada vez que el menú cambiara todas las pestañas cambiarían de
  // ancho, y el menú bailaría al cambiar de sección.
  //
  // Se cuentan los hijos DIRECTOS, que son las pestañas de primer nivel. Los
  // desplegables también cuentan: cada uno es una pestaña con su flecha.
  // Y el conteo de pestañas, que es lo que decide si la fila se marca con "muchas"
  // (más de ocho, y entonces el tope de cada una es la octava parte). Acá no hace
  // falta: las cuatro pestañas de la tarja están escritas en el archivo y no cambian
  // según quién entre. Por eso NO hay un guion que las cuente, y por eso la clase
  // "muchas" no se la pone nunca a esta fila. Queda escrita igual, por si algún día
  // las pestañas pasan a armarse con los permisos de la persona, que es cuando sí
  // harían falta.

  ocultarSubNavSinPermiso();
  // abrir la primera vista que la persona sí pueda ver
  const primero=[...sub.querySelectorAll('button[data-v]')].find(b=>b.style.display!=='none');
  showView(primero?primero.dataset.v:items[0].v);
}
// El submenú se reconstruye en cada showGroup, así que el filtrado por
// permiso hay que reaplicarlo aquí (y no solo en aplicarPermisos).
//
// LO QUE ESTE CÓDIGO HACÍA Y POR QUÉ ESTABA MAL
//
// Ocultaba el botón entero con display:none. Cuando a un supervisor le
// faltaba un permiso, "Asistencia diaria" desaparecía del menú y no había
// forma de saber por qué: podía ser que la vista no existiera, que estuviera
// rota, o que le faltara el permiso. La persona se quedaba con la
// impresión de que la aplicación no tenía esa sección.
//
// Ahora el botón se muestra bloqueado, con candado, y el título dice qué
// permiso falta y quién lo puede dar. Se puede informar. Un menú que se
// calla es peor que uno que muestra un candado.
function ocultarSubNavSinPermiso(){
  if(typeof puede!=='function'||!misPermisosCargados)return;
  document.querySelectorAll('#subNav button[data-v]').forEach(b=>{
    const permiso=VISTAS_POR_PERMISO['v-'+b.dataset.v];
    if(puede(permiso)){
      b.removeAttribute('data-sin-permiso');
      b.removeAttribute('aria-disabled');
      b.classList.remove('bloqueado');
      b.title='';
      b.style.display='';
      return;
    }
    // Sin permiso, no se muestra. Se deja el atributo puesto igual, porque
    // abrirPrimeraVistaPermitida() lo usa para saber qué secciones existen
    // aunque estén ocultas: si se borrara el atributo, esa función no
    // tendría cómo distinguir "no tenés permiso" de "esta vista ya no
    // existe".
    b.setAttribute('data-sin-permiso',permiso||'(sin permiso asociado)');
    b.setAttribute('aria-hidden','true');
    b.setAttribute('tabindex','-1');
    b.style.display='none';
  });
  // Un desplegable se oculta solo si TODOS sus hijos están bloqueados, y
  // además avisa de que hay algo que falta adentro.
  document.querySelectorAll('#subNav details.nav-dropdown, #subNav details.nav-dropdown-nested').forEach(d=>{
    // Un padre se oculta solo si NO le queda ningún hijo visible. El
    // criterio mira el estilo, no el atributo, porque los hijos sin permiso
    // ahora tienen el atributo y están ocultos: contar atributos daría
    // "nunca visible" y escondería un desplegable que sí tiene cosas
    // permitidas.
    const hijos=[...d.querySelectorAll('button[data-v]')];
    const visibles=hijos.filter(b=>b.style.display!=='none').length;
    d.style.display=visibles?'':'none';
    d.classList.toggle('parcial',visibles>0&&visibles<hijos.length);
  });

  // Y el GRUPO del menú principal, si se quedó sin nada. Un grupo vacío es
  // un botón arriba que abre una barra en blanco.
  document.querySelectorAll('#mainNav button').forEach(g=>{
    // El booleano de "ya cargué mis permisos" se llama misPermisosCargados.
    // Escribir "misPermisos" referenciaba una variable que no existe, y eso
    // lanza ReferenceError y corta el filtrado de los grupos.
    if(typeof misPermisosCargados==='undefined'||!misPermisosCargados)return;
    const reqs=GRUPOS_POR_PERMISOS[g.dataset.group];
    if(!reqs)return;
    const tieneAlgo=reqs.some(p=>puede(p));
    g.style.display=tieneAlgo?'':'none';
  });
}
// Cuando no hay permiso para una vista, se abre la primera que sí tenga
// la persona: primero del submenú actual, y si no, la primera visible.
function abrirPrimeraVistaPermitida(){
  // Se busca entre los botones que están A LA VISTA. La versión anterior
  // miraba "data-sin-permiso" en el botón, que ahora lo tienen todos los
  // ocultos: con ese criterio no encuentra ninguna y caería al
  // cualquier vista, que es justo lo que se quería evitar.
  const delGrupo=[...document.querySelectorAll('#subNav button[data-v]')]
    .find(b=>b.style.display!=='none'&&!b.hasAttribute('data-sin-permiso'));
  if(delGrupo){showView(delGrupo.dataset.v);return;}
  const cualquiera=[...document.querySelectorAll('section.view')].find(s=>s.dataset.sinPermiso!=='1');
  if(!cualquiera)return;
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  cualquiera.classList.add('active');
  const corto=cualquiera.id.slice(2);
  document.querySelectorAll('#subNav button').forEach(x=>x.classList.toggle('active',x.dataset.v===corto));
  initView(corto);
}
document.querySelectorAll('#mainNav button').forEach(b=>b.addEventListener('click',()=>showGroup(b.dataset.group)));
// Un clic fuera del submenú lo cierra. Sin esto, el desplegable se queda
// abierto tapando el contenido, y hay que acertarle al título para
// cerrarlo. Escape también, que es lo que se prueba por costumbre.
document.addEventListener('click',event=>{
  if(!event.target.closest('#subNav'))cerrarDesplegablesSubNav();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')cerrarDesplegablesSubNav();
});
document.querySelectorAll('[data-attendance-tab]').forEach(tab=>tab.addEventListener('click',()=>showAttendancePanel(tab.dataset.attendanceTab)));
document.getElementById('epp-worker').addEventListener('change',updateEppWorkerHint);
document.getElementById('assign-fecha').value=hoyLocal();
// Los supervisores que se pueden ASIGNAR.
//
// Se filtra por estado activo. Antes no se filtraba, y un supervisor
// desvinculado seguía apareciendo en el desplegable: se le podía asignar
// gente a alguien que ya no trabaja acá, y el error no se veía hasta que
// el equipo no cargaba.
//
// El código va en la etiqueta porque hay nombres repetidos: en la base hay
// fichas distintas con el mismo nombre, y sin el código no se sabe cuál
// se está eligiendo. No se "arregla" deduplicando la lista, porque eso
// escondería que hay dos fichas; el aviso va en el listado de
// trabajadores, que es donde se ve la duplicidad.
function supervisoresActivos(excludeCode){
  return workers.filter(w=>w.is_supervisor&&w.status==='activo'&&w.code!==excludeCode)
    .sort((a,b)=>compararPorCodigo(a.code,b.code)||a.name.localeCompare(b.name));
}
// La etiqueta lleva el código de la lista a la que pertenece, para que dos
// fichas con el mismo nombre y códigos parecidos no queden indistinguibles.
function etiquetaSupervisor(s,visibles){
  const v=(visibles&&visibles.get(s.code))||codigoMostrar(s.code);
  return v+' — '+s.name;
}
function fillSupervisorSelect(id,excludeCode){
  const sups=supervisoresActivos(excludeCode);
  const vis=codigosVisibles(sups);
  document.getElementById(id).innerHTML='<option value="">Sin asignar</option>'+
    sups.map(s=>`<option value="${escHtml(s.code)}">${escHtml(etiquetaSupervisor(s,vis))}</option>`).join('');
}
function fillWorkerSupervisorFilter(){
  const select=document.getElementById('workerSupervisorFilter');
  const selected=select.value;
  const visSup=codigosVisibles(supervisoresActivos());
  const options=supervisoresActivos().map(s=>`<option value="${escHtml(s.code)}">${escHtml(etiquetaSupervisor(s,visSup))}</option>`).join('');
  select.innerHTML='<option value="">Todos</option><option value="__none__">Sin asignar</option>'+options;
  if([...select.options].some(option=>option.value===selected))select.value=selected;
  avisarNombresRepetidos();
}
// Hay fichas con el MISMO nombre y códigos distintos. No es un error de
// esta pantalla: son dos fichas en la base, y por eso las opciones llevan
// el código, para poder distinguirlas.
//
// LO QUE ESTA MAL ERA AVISAR SIEMPRE
//
// Antes contaba los nombres repetidos sin mirar el estado de las fichas, y
// decía "hay que desvincular la que sobra". Cuando la otra ya estaba
// desvinculada, no había NADA que desvincular: la advertencia era una
// orden imposible de cumplir, y la persona se quedaba buscando cuál era
// la que había que cerrar.
//
// Ahora solo alerta cuando hay DOS fichas ACTIVAS con el mismo nombre, que
// es el único caso donde de verdad hay un problema: dos fichas vivas de la
// misma persona, cada una con su propia asistencia.
//
// Cuando la repetida ya está desvinculada, se dice en una línea que no hay
// nada que hacer, y se nombra cuál es la vieja. Eso también es información
// útil: si la vieja tiene la asistencia del año pasado y la nueva está
// vacía, hay que traspasarla antes de borrar nada.
const DUP_ACTIVOS='activos';
function agruparPorNombre(lista){
  const porNombre=new Map();
  (lista||[]).forEach(w=>{
    const k=sinTildes(w.name).trim().replace(/\s+/g,' ').toUpperCase();
    if(!k)return;
    if(!porNombre.has(k))porNombre.set(k,[]);
    porNombre.get(k).push(w);
  });
  return porNombre;
}
function avisarNombresRepetidos(){
  const cont=document.getElementById('dupNamesWarn');
  if(!cont)return;
  // Se usa codigosVisibles y no codigoMostrar: con dos fichas de código
  // "1" y "001", el aviso salía como "0001 = 0001", que es exactamente
  // inútil. El aviso tiene que decir CÓMO distinguirlas.
  const vis=codigosVisibles(workers);
  const etiqueta=w=>(vis.get(w.code)||codigoMostrar(w.code))+' ('+w.name+')';
  const grupos=[...agruparPorNombre(workers).values()].filter(l=>l.length>1);
  // El caso que hay que resolver: dos fichas VIVAS del mismo nombre.
  const conflictos=grupos.filter(l=>l.filter(w=>w.status==='activo').length>1);
  // El caso que NO es un problema: la vieja ya se cerró. Se avisa igual,
  // pero como información, para que quede claro cuál es la antigua.
  const yaResueltos=grupos.filter(l=>l.filter(w=>w.status==='activo').length===1);

  let html='';
  if(conflictos.length){
    html+='<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px;margin-bottom:10px">'+
      '<b>'+conflictos.length+' nombre(s) tienen DOS fichas activas a la vez.</b><br>'+
      '<small>Si es la misma persona cargada dos veces, cada ficha tiene su propia asistencia y la de una no aparece en la otra. '+
      'Hay que cerrar una con su fecha de término real y su artículo.</small>'+
      '<ul style="margin:6px 0 0;padding-left:18px">'+
      conflictos.slice(0,8).map(l=>{
        const activas=l.filter(w=>w.status==='activo');
        return '<li>'+escHtml(activas.map(etiqueta).join('  =  '))+
          '<br><button class="btn" style="margin-top:4px;font-size:.8rem;padding:3px 8px" type="button" onclick="elegirFichaParaCerrar(\''+
          escHtml(activas[0].code)+'\',\''+escHtml(activas[1].code)+'\')">Cerrar una de las dos</button></li>';
      }).join('')+
      (conflictos.length>8?'<li>… y '+(conflictos.length-8)+' más</li>':'')+
      '</ul></div>';
  }
  if(yaResueltos.length){
    const linea=l=>{
      const activa=l.find(w=>w.status==='activo');
      const viejas=l.filter(w=>w.status!=='activo');
      const termino=w=>w.fecha_termino?' (término '+w.fecha_termino+')':' (sin fecha de término)';
      return '<li>'+escHtml('Ficha activa: '+(vis.get(activa.code)||codigoMostrar(activa.code)))+
        '<br><small>Cerrada: '+escHtml(viejas.map(v=>(vis.get(v.code)||codigoMostrar(v.code))+termino(v)).join(', '))+'</small></li>';
    };
    html+='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px;margin-bottom:10px">'+
      '<b>'+yaResueltos.length+' nombre(s) tienen una ficha vieja ya desvinculada.</b> '+
      '<small>No hay nada que hacer acá: no son dos personas activas. Se avisa para que sepas cuál es la antigua, '+
      'y para que borres la vieja solo cuando estés seguro de que su asistencia ya no se necesita.</small>'+
      '<ul style="margin:6px 0 0;padding-left:18px">'+
      yaResueltos.slice(0,8).map(linea).join('')+
      (yaResueltos.length>8?'<li>… y '+(yaResueltos.length-8)+' más</li>':'')+
      '</ul></div>';
  }
  // Las fichas desvinculadas sin fecha de término no se pueden ordenar bien
  // en la planilla, así que se avisa en la misma caja.
  const sinFecha=workers.filter(w=>w.status!=='activo'&&!w.fecha_termino);
  if(sinFecha.length){
    html+='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px;margin-bottom:10px">'+
      '<b>'+sinFecha.length+' ficha(s) desvinculadas sin fecha de término.</b> '+
      '<small>En la planilla de los meses en que encore trabajaba, la baja queda en la fecha en que se hizo clic en el botón, que puede no ser la real.</small>'+
      '<ul style="margin:6px 0 0;padding-left:18px">'+
      sinFecha.slice(0,8).map(w=>'<li>'+escHtml(etiqueta(w))+
        ' <small>(se desvinculó '+(w.fecha_desvinculacion?escHtml(String(w.fecha_desvinculacion).slice(0,10)):'sin fecha')+')</small>'+
        '<button class="btn" style="margin-left:6px;font-size:.8rem;padding:3px 8px" type="button" onclick="abrirDesvinculacion(\''+
        escHtml(w.code)+'\')">Completar fecha y artículo</button></li>').join('')+
      (sinFecha.length>8?'<li>… y '+(sinFecha.length-8)+' más</li>':'')+
      '</ul></div>';
  }
  cont.innerHTML=html;
}
// Abre el cuadro de desvinculación para las dos fichas, para que la persona
// elija cuál cerrar sin tener que acordarse de los códigos.
function elegirFichaParaCerrar(codeA,codeB){
  const a=workers.find(w=>w.code===codeA);
  const b=workers.find(w=>w.code===codeB);
  if(!a||!b)return;
  const vis=codigosVisibles(workers);
  const linea=w=>{
    const abiertas=attendance.filter(r=>r.code===w.code).length;
    return escHtml(codigoMostrar(w.code))+' — '+escHtml(w.name)+
      '<br><small>'+abiertas+' día(s) de asistencia · '+
      (w.fecha_ingreso?'ingresó '+escHtml(String(w.fecha_ingreso).slice(0,10)):'sin fecha de ingreso')+
      (w.supervisor_code?' · supervisor '+escHtml((vis.get(w.supervisor_code)||codigoMostrar(w.supervisor_code))):'')+'</small>';
  };
  const botones=`<div class="row" style="margin-top:12px">
      <div style="flex:1"><small><b>Ficha A</b></small><p>${linea(a)}</p>
        <button class="btn primary" type="button" onclick="cerrarDialogo();abrirDesvinculacion('${escHtml(a.code)}')">Cerrar A</button></div>
      <div style="flex:1"><small><b>Ficha B</b></small><p>${linea(b)}</p>
        <button class="btn primary" type="button" onclick="cerrarDialogo();abrirDesvinculacion('${escHtml(b.code)}')">Cerrar B</button></div>
    </div>
    <p style="margin-top:12px"><small>Se muestra cuántos días tiene cada ficha para que elijas con los datos a la vista. `+
    `Cerrar una no borra la otra ni su asistencia.</small></p>`;
  abrirDialogoSimple('¿Cuál de las dos fichas se cierra?',
    '<p>Las dos están activas y se llaman igual. Elegí la que sobra: '+
    '<b>no se elimina nada</b>, la ficha se marca como desvinculada con su fecha de término y su artículo, y queda en la bitácora.</p>'+
    botones);
}
// ------------------------------------------------------------------
// DESVINCULAR: CON FECHA DE TERMINO Y ARTICULO
// ------------------------------------------------------------------
// Antes era un confirm() y nada mas: ponia la fecha de HOY y se acababa.
// Eso esta bien para el caso facil, y esta mal para el que mas se da al
// ordenar un plano: una persona que se fue hace meses y quedo con la ficha
// abierta. Al cerrarla hoy, la app pasa a decir que termino hoy, y la
// planilla de los meses en que todavia trabajaba queda con la baja en la
// fecha equivocada. Eso no se corrige despues, porque la asistencia ya se
// cargo.
//
// Por eso son DOS fechas y no una:
//  - fecha de termino: cuando termino el contrato. Va en la planilla.
//  - fecha en que se hizo clic: cuando alguien la cerro en la app. Es un
//    dato del sistema, sirve para saber si el dato se puso tarde.
//
// Y el articulo: el del Codigo del Trabajo que se aplico. Lo elige una
// persona y la app NO lo valida. Es un dato que se anota, no que la
// aplicacion pueda calcular, y no se fuerza un valor para que el formulario
// se complete: un articulo inventado es peor que ninguno.
//
// La lista es una ayuda y el campo es de texto libre. Hay casos reales (un
// finiquito, un acuerdo) que no son un numero de articulo y tienen que
// poder anotarse igual.
//
// OJO CON LA LISTA: estos son los articulos que la gente cites de memoria,
// y la lista es una AYUDA, no una lista oficial. Si el caso no esta, se
// escribe. La app no valida nada de esto: colocar un articulo equivocado es
// responsabilidad de quien lo escribe, y por eso el campo acepta texto
// libre en vez de una lista cerrada.
const ARTICULOS_TERMINO=[
  {v:'',t:'— sin especificar —'},
  {v:'158',t:'158 — Terminacion del contrato por tiempo'},
  {v:'159',t:'159 — Desahucio'},
  {v:'161',t:'161 — Mutuo acuerdo'},
  {v:'161 N°3',t:'161 N°3 — Despido por justa causa'},
  {v:'162',t:'162 — Renuncia del trabajador'},
  {v:'163',t:'163 — Terminacion por justa causa'},
  {v:'164',t:'164 — Por conducta del trabajador'},
  {v:'165',t:'165 — Cambio de funciones o de lugar'},
  {v:'168',t:'168 — Terminacion por necessidade de la empresa'},
  {v:'177',t:'177 — Despido con indemnizacion'},
  {v:'182',t:'182 — Finiquito'},
  {v:'otro',t:'Otro (escribirlo abajo)'}
];
function abrirDesvinculacion(code){
  const w=workers.find(x=>x.code===code);
  if(!w){alert('No se encontro al trabajador.');return;}
  if(!exigirPermiso('trabajadores.editar','No tienes permiso para modificar fichas de trabajadores.'))return;
  const dlg=document.getElementById('dlgDesvincula');
  document.getElementById('desvTitulo').textContent='Desvincular a '+w.name;
  document.getElementById('desvCodigo').value=w.code;
  // Si ya estaba desvinculada, se propone la fecha y el artículo que tiene:
  // la persona viene a corregirlos, no a volver a escribirlos de cero.
  const yaEsta=w.status!=='activo';
  document.getElementById('desvInfo').innerHTML=
    '<b>'+escHtml(codigoMostrar(w.code))+' — '+escHtml(w.name)+'</b>'+
    (yaEsta
      ?'<br><span style="color:var(--warn)">Esta ficha ya esta desvinculada'+
        (w.fecha_termino?' (termino '+escHtml(String(w.fecha_termino).slice(0,10))+')':'')+
        '. Si venis a corregir la fecha o el articulo, pone los valores correctos.</span>'
      :'<br><small>Va a quedar desvinculada. No se borra ni su asistencia.</small>');
  const sel=document.getElementById('desvArticulo');
  sel.innerHTML=ARTICULOS_TERMINO.map(a=>`<option value="${escHtml(a.v)}">${escHtml(a.t)}</option>`).join('');
  sel.value=(w.articulo_termino&&ARTICULOS_TERMINO.some(a=>a.v===w.articulo_termino))
    ?w.articulo_termino
    :(w.articulo_termino?'otro':'');
  document.getElementById('desvArticuloTexto').value=sel.value==='otro'?(w.articulo_termino||''):'';
  document.getElementById('desvArticuloTexto').style.display=sel.value==='otro'?'':'none';
  // Por omision se propone la fecha que ya se conoce y, si no hay ninguna,
  // hoy. Nunca una fecha vieja que nadie eligio: proponerla seria repetir
  // el error que se quiere evitar.
  document.getElementById('desvFecha').value=w.fecha_termino||hoyLocal();
  document.getElementById('desvMotivo').value=w.motivo_desvinculacion||'';
  document.getElementById('desvError').textContent='';
  document.getElementById('desvGuardar').textContent=yaEsta?'Guardar la correccion':'Desvincular';
  dlg.showModal();
  document.getElementById('desvFecha').focus();
}
async function ejecutarDesvinculacion(){
  const code=document.getElementById('desvCodigo').value;
  const fecha=document.getElementById('desvFecha').value;
  const selArt=document.getElementById('desvArticulo');
  const articulo=(selArt.value==='otro'
    ?document.getElementById('desvArticuloTexto').value.trim()
    :selArt.value).trim();
  const motivo=document.getElementById('desvMotivo').value.trim();
  const err=document.getElementById('desvError');
  err.textContent='';
  if(!fecha){err.textContent='Falta la fecha de término. Sin ella la baja queda con la fecha de hoy.';return;}
  if(fecha>hoyLocal()){err.textContent='La fecha de término no puede ser futura.';return;}
  if(motivo.length<5){err.textContent='Escribe el motivo (al menos 5 caracteres). Queda registrado en la bitácora.';return;}
  const btn=document.getElementById('desvGuardar');
  btn.disabled=true;btn.textContent='Guardando…';
  const {error}=await window.supabaseClient.rpc('desvincular_trabajador',{
    p_code:code, p_fecha_termino:fecha, p_articulo:articulo||null,
    p_motivo:motivo, p_revivir:false
  });
  btn.disabled=false;
  btn.textContent='Desvincular';
  if(error){
    if(errorEsDesvinculacionSinMigrar(error)){
      err.innerHTML='La migración <b>029_desvinculacion_articulo.sql</b> no está aplicada, y por eso no se pudo guardar. '
        +'Abrila en el SQL Editor de Supabase y volvé a intentar.<br>'
        +'<small style="opacity:.65">'+escHtml(error.message||'')+'</small>';
      return;
    }
    err.innerHTML=escHtml(error.message);
    return;
  }
  document.getElementById('dlgDesvincula').close();
  await loadWorkers();
  await loadTarjetas();
  renderList('');
  fillWorkerSupervisorFilter();
  const bloqueadas=tarjetas.filter(t=>t.code===code&&t.estado==='bloqueada');
  const w=workers.find(x=>x.code===code);
  alert((w?w.name:'El trabajador')+' quedo desvinculado con termino el '+fecha+
    (articulo?' (articulo '+articulo+')':'')+'.'+
    (bloqueadas.length?'\n\nSe bloquearon '+bloqueadas.length+' tarjeta(s).':''));
}
async function revivirWorker(code){
  const w=workers.find(x=>x.code===code);
  if(!w)return;
  if(!exigirPermiso('trabajadores.editar','No tienes permiso para modificar fichas de trabajadores.'))return;
  if(!confirm('Revivir a '+w.name+'?\n\nLa ficha vuelve a estar activa. La fecha de termino y el articulo se borran, porque la persona no dejo de trabajar.\n\nQueda anotado en la bitacora quien lo hizo.'))return;
  const {error}=await window.supabaseClient.rpc('desvincular_trabajador',{
    p_code:code, p_fecha_termino:null, p_articulo:null,
    p_motivo:'Se revivio la ficha: estaba cerrada por error', p_revivir:true
  });
  if(error){alert('No se pudo revivir: '+error.message);return;}
  await loadWorkers();await loadTarjetas();
  renderList('');
  fillWorkerSupervisorFilter();
  alert(w.name+' quedo activo de nuevo.');
}
// Aviso al entrar: si la 029 no esta, se avisa. Sin esto el problema
// aparece en el momento de desvincular, que es cuando alguien esta haciendo
// un tramite de verdad y no puede quedarse esperando.
async function comprobarDesvinculacion(){
  try{
    const {data,error}=await window.supabaseClient.rpc('diagnostico_desvinculacion');
    if(error){
      mostrarAvisoPermisos('La desvinculación con fecha de término y artículo NO está puesta: falta aplicar la migración 029_desvinculacion_articulo.sql. '+
        'Hasta entonces, desvincular pone la fecha de HOY, que puede ser incorrecta.');
      return;
    }
    const d=Array.isArray(data)?data[0]:data;
    if(!d)return;
    const problemas=[];
    if(!d.columnas_puestas)problemas.push('faltan columnas');
    if(!d.bitacora_existe)problemas.push('falta la bitácora');
    if(!d.funcion_existe)problemas.push('falta la función');
    if(problemas.length){
      mostrarAvisoPermisos('La desvinculación está incompleta ('+problemas.join(', ')+'). Vuelve a aplicar la migración 029_desvinculacion_articulo.sql.');
    }else if(Number(d.desvinculados_sin_fecha)>0){
      mostrarAvisoPermisos('Hay '+d.desvinculados_sin_fecha+' ficha(s) desvinculadas sin fecha de término. Se ven en Listado de trabajadores, con un botón para completarlas.');
    }
  }catch(error){
    console.info('No se pudo comprobar la desvinculación:',error.message);
  }
}
function updateSupervisorAssignment(){
  const code=document.getElementById('trans-worker').value;
  fillSupervisorSelect('trans-supervisor',code);
  const worker=workers.find(w=>w.code===code);
  document.getElementById('trans-supervisor').value=worker?.supervisor_code||'';
}
function initAsignarSupervisor(){
  const select=document.getElementById('trans-worker');
  const selected=select.value;
  select.innerHTML=opcionesTrabajadores();
  if(workers.some(w=>w.code===selected))select.value=selected;
  updateSupervisorAssignment();
}

async function checkSupportConnection(){
  const status=document.getElementById('supportStatus');
  status.textContent='Comprobando conexión…';
  try{
    const {error}=await window.supabaseClient.from('trabajadores').select('code').limit(1);
    status.textContent=error?`No se pudo conectar: ${error.message}`:'Conexión con Supabase activa.';
  }catch(error){
    status.textContent=`No se pudo conectar: ${error.message}`;
  }
}
// ------------------------------------------------------------------
// ¿QUÉ VERSIÓN DE LA APP ESTÁ CORRIENDO?
// ------------------------------------------------------------------
// Existe por un problema concreto: un cambio se subió a GitHub, el
// navegador siguió con la copia vieja en caché, y el error que se veía en
// pantalla era el de la versión ANTERIOR. Se pierde tiempo arreglando algo
// que ya estaba arreglado.
//
// Con este dato se responde en un segundo: si el número de versión del
// navegador es distinto del de la última publicada, hay que recargar con
// Ctrl+F5. La versión se lee del propio archivo (una constante) y la
// publicada, de la etiqueta del último commit.
const APP_VERSION = '2026-09-29-o';
async function mostrarVersionDeLaApp(){
  const el=document.getElementById('soporteVersion');
  if(!el)return;
  el.textContent='Versión en pantalla: '+APP_VERSION+' — comprobando la publicada…';
  const remota=await versionEnGithub();
  if(!remota){
    el.innerHTML='En pantalla: <b>'+escHtml(APP_VERSION)+'</b><br>'+
      '<small>No se pudo leer la versión publicada (se necesita internet para eso). '+
      'Si crees que estás viendo una copia vieja, recarga con Ctrl+F5.</small>';
    return;
  }
  if(remota===APP_VERSION){
    el.innerHTML='En pantalla: <b>'+escHtml(APP_VERSION)+'</b> — al día con lo publicado.';
    return;
  }
  el.innerHTML='<span class="gpsWarn">Estás viendo una copia vieja de la app.</span><br>'+
    '<small>En pantalla: <b>'+escHtml(APP_VERSION)+'</b> · publicada: <b>'+escHtml(remota)+'</b><br>'+
    'Recarga con <b>Ctrl+F5</b> (o Ctrl+Shift+R). Si después sigue igual, el cambio no se subió.</small>';
}
// La versión publicada va en la etiqueta [v...] del mensaje del commit, que
// es la que se escribe al desplegar.
async function versionEnGithub(){
  try{
    const r=await fetch('https://api.github.com/repos/jonathancastror1986-cmyk/Control-Interno/commits/main',{cache:'no-store'});
    if(!r.ok)return null;
    const j=await r.json();
    return String((j.commit&&j.commit.message)||'').match(/\[v([^\]]+)\]/)?.[1]||null;
  }catch(error){return null;}
}
function renderWorkerAlerts(type){
  const social=type==='social';
  const container=document.getElementById(social?'socialAlertsList':'preventionAlertsList');
  const flagField=social?'alerta_social':'alerta_prevencion';
  const noteField=social?'alerta_social_nota':'alerta_prevencion_nota';
  container.replaceChildren();
  if(!workers.length){container.textContent='No hay trabajadores registrados.';return;}
  workers.forEach(worker=>{
    const row=document.createElement('div');
    row.className='support-worker-row';
    const identity=document.createElement('div');
    identity.innerHTML=`<b>${worker.code}</b> — ${worker.name}<br><small>${worker.spec||'—'}</small>`;
    const alertLabel=document.createElement('label');
    alertLabel.className='support-alert-toggle';
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';
    checkbox.checked=!!worker[flagField];
    const alertText=document.createElement('span');
    alertText.textContent='Avisar en portería';
    alertLabel.append(checkbox,alertText);
    const note=document.createElement('input');
    note.value=worker[noteField]||'';
    note.placeholder='Nota para portería (opcional)';
    const saveButton=document.createElement('button');
    saveButton.type='button';
    saveButton.className='btn secondary';
    saveButton.textContent='Guardar';
    saveButton.addEventListener('click',()=>saveWorkerAlert(worker,type,checkbox.checked,note.value,saveButton));
    row.append(identity,alertLabel,note,saveButton);
    container.append(row);
  });
}
async function saveWorkerAlert(worker,type,active,note,button){
  const social=type==='social';
  const flagField=social?'alerta_social':'alerta_prevencion';
  const noteField=social?'alerta_social_nota':'alerta_prevencion_nota';
  button.disabled=true;
  const {error}=await window.supabaseClient.from('trabajadores').update({[flagField]:active,[noteField]:note.trim()||null}).eq('code',worker.code);
  button.disabled=false;
  if(error){alert('No se pudo guardar la alerta: '+error.message);return;}
  worker[flagField]=active;
  worker[noteField]=note.trim()||null;
  button.textContent='Guardado';
}
function instructionFields(type){
  return type==='social'
    ? {select:'socialInstructionWorker',text:'socialInstructionText',message:'socialInstructionStatus',field:'indicaciones_sociales'}
    : {select:'preventionInstructionWorker',text:'preventionInstructionText',message:'preventionInstructionStatus',field:'indicaciones_prevencion'};
}
function initWorkerInstructions(type){
  const fields=instructionFields(type);
  const select=document.getElementById(fields.select);
  const selected=select.value;
  select.innerHTML=workers.map(worker=>`<option value="${worker.code}">${worker.code} - ${worker.name}</option>`).join('');
  if(workers.some(worker=>worker.code===selected))select.value=selected;
  loadWorkerInstructions(type);
}
function loadWorkerInstructions(type){
  const fields=instructionFields(type);
  const worker=workers.find(item=>item.code===document.getElementById(fields.select).value);
  document.getElementById(fields.text).value=worker?.[fields.field]||'';
  document.getElementById(fields.message).textContent='';
}
async function saveWorkerInstructions(type){
  const fields=instructionFields(type);
  const code=document.getElementById(fields.select).value;
  const worker=workers.find(item=>item.code===code);
  const value=document.getElementById(fields.text).value.trim();
  const message=document.getElementById(fields.message);
  if(!worker){message.textContent='Selecciona un trabajador.';return;}
  const {error}=await window.supabaseClient.from('trabajadores').update({[fields.field]:value||null}).eq('code',code);
  if(error){message.textContent=`No se pudo guardar: ${error.message}`;return;}
  worker[fields.field]=value||null;
  message.textContent='Indicaciones guardadas.';
}
function wirephoto(inputId,imgId,which){
  const input=document.getElementById(inputId);
  input.addEventListener('change',function(){
    const hint=document.getElementById('photoHint');
    hint.textContent='';
    const file=this.files && this.files[0];
    if(!file){return;}
    if(!file.type.startsWith('image/')){hint.textContent='El archivo elegido no es una imagen.';hint.style.color='var(--danger)';return;}
    const reader=new FileReader();
    reader.onerror=function(){hint.textContent='No se pudo leer la imagen. Prueba con otra foto.';hint.style.color='var(--danger)';};
    reader.onload=function(ev){
      document.getElementById(imgId).src=ev.target.result;
      if(which==='casual') tempCasual=ev.target.result; else tempSafety=ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
wirephoto('w-casual','pre-casual','casual');
wirephoto('w-safety','pre-safety','safety');

function clearForm(){
  ['w-code','w-name','w-spec','w-phone','w-rut','w-fecha-ingreso','w-emerg-name','w-emerg-phone','w-emerg-rel','w-salud','w-medicamentos','w-precauciones'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('w-is-supervisor').checked=false;
  llenarSelectoresEspecialidad();
  if(document.getElementById('w-cargo')){
    document.getElementById('w-cargo').value='';
    pintarOpcionesCargo(document.getElementById('w-cargo'),'');
  }
  if(document.getElementById('w-grupo'))document.getElementById('w-grupo').value='';
  document.getElementById('w-tipo-trabajador').value='interno';
  fillWorkerEmpresaSelect();
  document.getElementById('pre-casual').src='';
  document.getElementById('pre-safety').src='';
  tempCasual=null;tempSafety=null;
}
// Al crear un trabajador se ofrece solo las empresas que puede ver quien
// lo está registrando; si no hay ninguna, la primera del sistema.
function fillWorkerEmpresaSelect(){
  const sel=document.getElementById('w-empresa');
  if(!sel)return;
  const previo=sel.value;
  const permitidas=empresas.filter(e=>veTodasLasEmpresas()||misEmpresas.includes(e.id));
  sel.innerHTML=permitidas.length
    ?permitidas.map(e=>`<option value="${e.id}">${escHtml(e.nombre)}</option>`).join('')
    :'<option value="">Sin empresa asignada</option>';
  if(empresaActual&&permitidas.some(e=>e.id===empresaActual))sel.value=String(empresaActual);
  else if(permitidas.some(e=>String(e.id)===previo))sel.value=previo;
}

async function saveWorker(){
  const code=document.getElementById('w-code').value.trim();
  const name=document.getElementById('w-name').value.trim();
  const spec=document.getElementById('w-spec').value.trim();
  const espClave=document.getElementById('w-cargo')
    ?document.getElementById('w-cargo').value:'';
  if(!code||!name){alert('Código y nombre son obligatorios');return;}
  const existing=workers.find(w=>w.code===code)||todosWorkers.find(w=>w.code===code);
  const empSel=document.getElementById('w-empresa');
  const worker={
    code,name,spec,
    empresa_id: (empSel&&empSel.value)?parseInt(empSel.value):(existing?existing.empresa_id:null),
    phone: document.getElementById('w-phone').value.trim(),
    rut: document.getElementById('w-rut').value.trim() || (existing?existing.rut:''),
    is_supervisor: document.getElementById('w-is-supervisor').checked,
    fecha_ingreso: document.getElementById('w-fecha-ingreso').value || (existing?existing.fecha_ingreso:null),
    tipo_trabajador: document.getElementById('w-tipo-trabajador').value || 'interno',
    casual: tempCasual || (existing?existing.casual:null),
    safety: tempSafety || (existing?existing.safety:null),
    emerg_name: document.getElementById('w-emerg-name').value.trim(),
    emerg_phone: document.getElementById('w-emerg-phone').value.trim(),
    emerg_rel: document.getElementById('w-emerg-rel').value.trim(),
    salud: document.getElementById('w-salud').value.trim(),
    medicamentos: document.getElementById('w-medicamentos').value.trim(),
    precauciones: document.getElementById('w-precauciones').value.trim(),
    alerta_social: existing?existing.alerta_social:false,
    alerta_social_nota: existing?existing.alerta_social_nota:null,
    alerta_prevencion: existing?existing.alerta_prevencion:false,
    alerta_prevencion_nota: existing?existing.alerta_prevencion_nota:null,
    indicaciones_sociales: existing?existing.indicaciones_sociales:null,
    indicaciones_prevencion: existing?existing.indicaciones_prevencion:null,
    supervisor_code: existing?existing.supervisor_code:null,
    status: existing?existing.status:'activo',
    fecha_desvinculacion: existing?existing.fecha_desvinculacion:null
  };
  worker.especialidad_clave=espClave||null;
  const {error}=await window.supabaseClient.from('trabajadores').upsert(workerToDb(worker),{onConflict:'code'});
  if(error){
    // El índice único de "rut" salta si dos trabajadores tienen el mismo.
    // Decirlo en palabras ayuda más que soltar el error de Postgres.
    if(/trabajadores_rut_unico|duplicate key/i.test(error.message)&&normalizarRut(worker.rut)){
      const choque=(workers.concat(todosWorkers)).find(w=>w.code!==code&&normalizarRut(w.rut)===normalizarRut(worker.rut));
      alert('El RUT '+worker.rut+' ya está cargado en '+(choque?choque.code+' - '+choque.name:'otro trabajador')+'.\n\n'+
        'Un RUT identifica a una sola persona, así que no puede repetirse. Corrige el RUT o bórralo si no lo tienes.');
      return;
    }
    const archivo=migracionQueFalta(error);
    alert(archivo
      ? errorDeGuardar('No se pudo guardar el trabajador',error)
      : 'No se pudo guardar en la base de datos: '+error.message);
    return;
  }
  await loadWorkers();
  clearForm();
  showView('listado-trabajadores');
  alert('Trabajador guardado');
}

// Un error que no es de columna, traducido a lo que hay que hacer.
//
// El caso importante es el 409 de PostgREST, que aparece en la consola
// como "409 (Conflict)" sin decir nada. PostgREST devuelve ese mismo
// código para DOS cosas muy distintas: que se repite un valor único
// (23505) y que una clave foránea no existe (23503). Un "409" a secas no
// permite saber cuál, y son arreglos completamente distintos.
function errorDeImportarTrabajadores(error){
  const msg=String((error&&error.message)||error||'');
  const codigo=String((error&&error.code)||'');
  // Las dos se comprueban por texto, porque PostgREST no distingue los
  // dos casos en el código de la respuesta.
  if(/foreign key|violates foreign key|23503/i.test(msg)){
    return '<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">'+
      '<b>Alguna fila apunta a un trabajador que no existe.</b><br>'+
      '<small>El código del supervisor no está en la base. La revisión previa debería haberlo detectado: '+
      'si te apareció, es que el supervisor se está creando en la misma carga, en una fila posterior.</small>'+
      '<br><small style="opacity:.75">Lo que respondió la base: '+escHtml(msg)+'</small></div>';
  }
  if(/duplicate key|unique|23505/i.test(msg)){
    return '<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">'+
      '<b>Se repite un dato que tiene que ser único.</b><br>'+
      '<small>Lo más probable es el <b>RUT</b>: identifica a una persona, no a un puesto, así que no puede '+
      'repetirse. La revisión previa lo avisa antes de guardar, pero si te aparece acá es que dos fichas lo tienen.</small>'+
      '<br><small style="opacity:.75">Lo que respondió la base: '+escHtml(msg)+'</small></div>';
  }
  if(codigo==='409'||/conflict/i.test(msg)){
    return '<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">'+
      '<b>La base rechazó el guardado sin explicar por qué (409).</b><br>'+
      '<small>Revisa que el <code>codigo_supervisor</code> exista y que los RUT no se repitan. '+
      'Si sigue igual, el detalle está abajo.</small>'+
      '<br><small style="opacity:.75">Lo que respondió la base: '+escHtml(msg)+'</small></div>';
  }
  return '<span class="gpsWarn">No se pudo importar: '+escHtml(msg)+'</span>';
}

function normalizeCsvHeader(value){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function detectCsvDelimiter(text){
  const line=String(text).split(/\r?\n/).find(value=>value.trim())||'';
  const counts={',':0,';':0,'\t':0};
  let quoted=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){
      if(quoted&&line[i+1]==='"'){i++;continue;}
      quoted=!quoted;
    }else if(!quoted&&Object.prototype.hasOwnProperty.call(counts,line[i]))counts[line[i]]++;
  }
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][1]>0?Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]:',';
}
// ------------------------------------------------------------------
// FECHAS QUE VIENEN DE EXCEL
// ------------------------------------------------------------------
// El problema que se estaba arreglando: un CSV con "2026-01-09" es un
// archivo correcto, pero al leerlo SheetJS lo tomaba como fecha, lo
// corría por la zona horaria del navegador y lo devolvía formateado
// como "1/8/26" (mes/día/año, año de dos dígitos). Ese texto ya no era
// el que había escrito nadie, así que la validación lo rechazaba y
// decía "usar AAAA-MM-DD" justo cuando el usuario SÍ lo había puesto
// bien. El archivo estaba bien; el que leía, mal.
//
// La corrección de raíz está en la lectura (raw:true al abrir el
// archivo), que deja la fecha como texto tal cual. Acá queda lo que
// falta: que la carga no dependa de que el archivo se haya generado de
// cierta manera.
//
// Se aceptan:
//   · AAAA-MM-DD            (el de la plantilla; sin ambigüedad)
//   · DD/MM/AAAA            (como se escribe en Chile: 09/01/2026)
//   · el número de serie de Excel (46031 = 2026-01-09; es lo que trae
//     una celda de tipo fecha de un .xlsx, y no tiene ambigüedad)
//   · un objeto Date
//
// Nota sobre "5/3/2026": se lee como 5 de marzo, por ser la convención
// chilena y la que dice la plantilla. Si algún día llegara un archivo
// exportado con formato inglés, esa fecha se leería al revés. Cuando
// el día es mayor que 12 no hay problema: "25/03/2026" solo puede ser
// 25 de marzo.
function fechaDesdeNumeroExcel(numero){
  if(!isFinite(numero))return null;
  // Entre 1 y 60000 es un número de serie de Excel (1900-01-01 en adelante).
  if(numero<1||numero>60000)return null;
  // 25569 es 1970-01-01: el desfase estándar entre ambos calendarios.
  // Se toma la parte entera y no el redondeo: 46030,99999 es el día 46030
  // (el final de ese día), no el día siguiente, y redondeando saltaba.
  const dias=Math.floor(numero);
  const d=new Date((dias-25569)*86400*1000);
  if(isNaN(d.getTime()))return null;
  return d.toISOString().slice(0,10);
}
function parseCsvDate(value){
  if(value==null||value==='')return {value:null,error:false};

  // 1) Si ya vino como Date (cuando el navegador lo parseó solo).
  if(value instanceof Date){
    if(isNaN(value.getTime()))return {value:null,error:true};
    return {value:isoLocal(value),error:false};
  }

  // 2) Número de serie de Excel. Va antes del parseo de texto porque
  //    46030 también matchearía un patrón de texto y saldría mal.
  if(typeof value==='number'){
    const desdeExcel=fechaDesdeNumeroExcel(value);
    if(desdeExcel)return {value:desdeExcel,error:false};
    return {value:null,error:true};
  }

  const raw=String(value).trim();
  if(!raw)return {value:null,error:true};

  let year,month,day,match;
  if((match=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))){
    // AAAA-MM-DD, el de la plantilla.
    [,year,month,day]=match;
  }else if((match=raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/))){
    // DD/MM/AAAA: día primero, que es como se escribe en Chile.
    [,day,month,year]=match;
    if(year.length===2)year=Number(year)+(Number(year)<50?2000:1900);
  }else if((match=raw.match(/^(\d{4})(\d{2})(\d{2})$/))){
    // AAAA-MM-DD sin separadores, como lo da algunos sistemas.
    [,year,month,day]=match;
  }else{
    return {value:null,error:true};
  }

  year=Number(year);month=Number(month);day=Number(day);
  if(month<1||month>12||day<1||day>31)return {value:null,error:true};
  // Se comprueba que la fecha exista de verdad: 31/02 se reporta, no se
  // convierte solo al 3 de marzo como haría new Date().
  const date=new Date(year,month-1,day);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day){
    return {value:null,error:true,imposible:year+'-'+month+'-'+day};
  }
  return {value:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,error:false};
}
function parseCsvBoolean(value,fallback){
  const normalized=String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(!normalized)return fallback;
  if(['1','true','si','yes','x'].includes(normalized))return true;
  if(['0','false','no'].includes(normalized))return false;
  return null;
}
function downloadWorkersCsvTemplate(){
  const headers=['codigo','nombre','cargo','telefono','fecha_ingreso','tipo_trabajador','es_supervisor','codigo_supervisor','nombre_contacto_emergencia','telefono_emergencia','relacion_emergencia','salud','medicamentos','precauciones','alerta_social','nota_alerta_social','alerta_prevencion','nota_alerta_prevencion','indicaciones_sociales','indicaciones_prevencion','status','fecha_termino','articulo_termino','motivo_desvinculacion'];
  const blob=new Blob(['\ufeff'+headers.join(';')+'\r\n'],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='plantilla_trabajadores.csv';
  link.click();
  URL.revokeObjectURL(url);
}
async function importWorkersCsv(){
  const file=document.getElementById('workersCsvFile').files[0];
  const message=document.getElementById('workersCsvMsg');
  if(!file){message.textContent='Selecciona un archivo CSV.';return;}
  message.textContent='Validando archivo…';
  try{
    const csvText=await file.text();
    // raw:true en la LECTURA es lo importante, y no es un detalle: sin
    // esto SheetJS decide que "2026-01-09" es una fecha, la corree por la
    // zona horaria del navegador y la devuelve formateada como "1/8/26".
    // O sea, el texto que escribió el usuario se perdía en la lectura y
    // después la validación acusaba al usuario de tener mal el formato.
    // Con raw:true llega tal cual y lo interpreta parseCsvDate().
    //
    // El caso del archivo .xlsx con celdas de tipo fecha sigue cubierto:
    // ahí el valor sí es el número de serie de Excel, y parseCsvDate()
    // lo reconoce.
    const workbook=XLSX.read(csvText,{type:'string',FS:detectCsvDelimiter(csvText),raw:true});
    const sheet=workbook.Sheets[workbook.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
    if(!rows.length){message.textContent='El CSV no contiene filas para importar.';return;}
    // normalizeCsvHeader() ya se come el BOM: elimina todo lo que no sea
    // letra o número, y el BOM (que Excel pone al guardar) no lo es.
    // Por eso "﻿codigo" se lee igual que "codigo". No hace falta
    // quitarlo aparte.
    const normalizedRows=rows.map(row=>Object.fromEntries(
      Object.entries(row).map(([key,value])=>[normalizeCsvHeader(key),String(value??'').trim()])
    ));
    const currentByCode=new Map(workers.map(worker=>[worker.code,worker]));
    const seenCodes=new Set();
    // El RUT también es único, y en un archivo de carga masiva es fácil que
    // se repita: alguien copia la fila de arriba. Se lleva aparte del
    // código porque el motivo del rechazo es otro.
    const seenRuts=new Set();
    // Todos los códigos del archivo, incluidos los que vienen después:
    // un supervisor puede estar en la fila 15 y el trabajador que lo
    // referencia en la 2. Con este Map se acepta en cualquier orden.
    const todosWorkers=new Set(normalizedRows.map(r=>String(r[normalizeCsvHeader('codigo')]||'').trim()).filter(Boolean));
    const imported=[];
    const issues=[];
    normalizedRows.forEach((row,index)=>{
      const read=(...headers)=>{
        for(const header of headers){
          const key=normalizeCsvHeader(header);
          if(Object.prototype.hasOwnProperty.call(row,key))return row[key];
        }
        return '';
      };
      const code=read('codigo','code').trim();
      const name=read('nombre','name').trim();
      if(!code||!name){issues.push(`Fila ${index+2}: faltan codigo o nombre.`);return;}
      if(seenCodes.has(code)){issues.push(`Fila ${index+2}: el código ${code} está duplicado en el CSV.`);return;}
      seenCodes.add(code);
      const existing=currentByCode.get(code);
      const incomingDate=read('fecha_ingreso','fecha ingreso','hire_date');
      const parsedDate=incomingDate?parseCsvDate(incomingDate):{value:existing?.fecha_ingreso||null,error:false};
      if(parsedDate.error){
        // Se dice QUÉ se recibió, no solo la regla. Antes el mensaje
        // pedía "usar AAAA-MM-DD" cuando el archivo ya venía en
        // AAAA-MM-DD y el problema era que el lector lo había
        // reformateado: el usuario no tenía forma de saber qué hacer.
        const recibido=incomingDate instanceof Date
          ? 'una fecha'
          : JSON.stringify(String(incomingDate));
        issues.push(
          `Fila ${index+2}: fecha_ingreso recibió ${recibido}`+
          (parsedDate.imposible?`, que no es una fecha real (¿quiso decir ${parsedDate.imposible}?).`
            :'. Se acepta AAAA-MM-DD, DD/MM/AAAA o la fecha que trae Excel.')
        );
        return;
      }
      const supervisorValue=read('es_supervisor','is_supervisor');
      const isSupervisor=parseCsvBoolean(supervisorValue,existing?.is_supervisor||false);
      const socialValue=read('alerta_social','alerta social');
      const preventionValue=read('alerta_prevencion','alerta prevencion');
      const alertSocial=parseCsvBoolean(socialValue,existing?.alerta_social||false);
      const alertPrevention=parseCsvBoolean(preventionValue,existing?.alerta_prevencion||false);
      if(isSupervisor===null||alertSocial===null||alertPrevention===null){issues.push(`Fila ${index+2}: usa sí/no, true/false o 1/0 en las columnas de casillas.`);return;}
      const readOrCurrent=(aliases,key,fallback='')=>read(...aliases)||existing?.[key]||fallback;
      // El status se acepta con o sin tilde y con o sin mayúscula:
      // "Activo", "ACTIVO" y "activo" son lo mismo. normalizar() ya
      // pasa a minúsculas y quita los acentos. Antes un CSV hecho en
      // Excel, que escribe "Activo", se rechazaba entero.
      let status=normalizar(read('status','estado'))||existing?.status||'activo';
      if(['desvinculado','desvincula','desvinculacion','baja','bajas'].includes(status))status='desvinculado';
      if(['activo','activa','alta','altas'].includes(status))status='activo';
      if(!['activo','desvinculado'].includes(status)){
        issues.push(`Fila ${index+2}: status recibió "${read('status','estado')}". Escribe activo o desvinculado.`);
        return;
      }
      const tipoTrabajadorValue=read('tipo_trabajador','tipo de trabajador').toLowerCase();
      const tipoTrabajador=['interno','subcontrato'].includes(tipoTrabajadorValue)?tipoTrabajadorValue:(existing?.tipo_trabajador||'interno');
      // "trabajadores.supervisor_code" tiene clave foránea a
      // "trabajadores.code". Si el CSV dice un supervisor que no existe,
      // Postgres lo rechaza con una violación de clave foránea, y
      // PostgREST devuelve 409 Conflict —un código que no dice nada— en
      // vez de una explicación. Se comprueba acá, con los códigos que
      // traen el archivo más los que ya están cargados, que es la única
      // forma de que el error llegue con nombre y apellido.
      const supervisorCsv=readOrCurrent(['codigo_supervisor','supervisor_codigo','supervisor_code'],'supervisor_code',null);
      if(supervisorCsv){
        const existeSupervisor=currentByCode.has(supervisorCsv)
          ||todosWorkers.has(supervisorCsv)
          ||normalizedRows.some(r=>String(r[normalizeCsvHeader('codigo')]||'').trim()===supervisorCsv);
        if(!existeSupervisor){
          issues.push(`Fila ${index+2}: el codigo_supervisor "${supervisorCsv}" no existe como trabajador. `+
            'Crea a ese supervisor primero, o deja la columna vacía y asígnalo después desde "Asignar supervisor".');
          return;
        }
      }
      // El RUT es único entre trabajadores. Dos filas con el mismo RUT
      // revientan el guardado entero; mejor decírlo antes.
      const rutCsv=normalizarRut(read('rut','r_u_t'));
      if(rutCsv){
        if(seenRuts.has(rutCsv)){
          issues.push(`Fila ${index+2}: el RUT ${rutCsv} está repetido en el archivo. El RUT identifica a una persona, no a un puesto.`);
          return;
        }
        const rutDeOtro=workers.find(w=>w.code!==code&&normalizarRut(w.rut)===rutCsv);
        if(rutDeOtro){
          issues.push(`Fila ${index+2}: el RUT ${rutCsv} ya lo tiene el trabajador ${rutDeOtro.code} — ${rutDeOtro.name}. No puede repetirse.`);
          return;
        }
        seenRuts.add(rutCsv);
      }
      imported.push(workerToDb({
        code,name,
        spec:readOrCurrent(['cargo','especialidad','spec'],'spec'),
        phone:readOrCurrent(['telefono','phone'],'phone'),
        fecha_ingreso:parsedDate.value,
        tipo_trabajador:tipoTrabajador,
        is_supervisor:isSupervisor,
        supervisor_code:supervisorCsv,
        // El RUT se lee del archivo si viene. Antes la carga masiva lo
        // ignoraba, y el RUT es justo lo que permite que después las
        // importaciones de marcajes del reloj sean exactas.
        rut:rutCsv||existing?.rut||null,
        casual:existing?.casual||null,
        safety:existing?.safety||null,
        emerg_name:readOrCurrent(['nombre_contacto_emergencia','emerg_nombre','emerg_name'],'emerg_name'),
        emerg_phone:readOrCurrent(['telefono_emergencia','emerg_telefono','emerg_phone'],'emerg_phone'),
        emerg_rel:readOrCurrent(['relacion_emergencia','emerg_relacion','emerg_rel'],'emerg_rel'),
        salud:readOrCurrent(['salud','salud_notas'],'salud'),
        medicamentos:readOrCurrent(['medicamentos'],'medicamentos'),
        precauciones:readOrCurrent(['precauciones'],'precauciones'),
        alerta_social:alertSocial,
        alerta_social_nota:readOrCurrent(['nota_alerta_social','alerta_social_nota'],'alerta_social_nota'),
        alerta_prevencion:alertPrevention,
        alerta_prevencion_nota:readOrCurrent(['nota_alerta_prevencion','alerta_prevencion_nota'],'alerta_prevencion_nota'),
        indicaciones_sociales:readOrCurrent(['indicaciones_sociales','indicaciones sociales'],'indicaciones_sociales'),
        indicaciones_prevencion:readOrCurrent(['indicaciones_prevencion','indicaciones prevencion'],'indicaciones_prevencion'),
        status,
        fecha_desvinculacion:existing?.fecha_desvinculacion||null,
        // Los datos de la desvinculación (migración 029) se leen del archivo
        // si vienen, y si no se CONSERVAN los que ya estaban.
        //
        // Esto no es un detalle: la carga masiva hace un upsert con el objeto
        // completo, así que omitir estos campos los ponía en null y se
        // perdía la fecha de término de todas las fichas desvinculadas cada
        // vez que se recargaba el CSV. Y no se nota: el trabajador sigue
        // desvinculado, solo que la planilla vuelve a mostrar la baja en la
        // fecha en que se corrió el CSV.
        fecha_termino:parseCsvDate(read('fecha_termino','fecha de termino','termino')).value
          ||existing?.fecha_termino||null,
        articulo_termino:readOrCurrent(['articulo_termino','articulo','articulo de termino'],'articulo_termino')
          ||existing?.articulo_termino||null,
        motivo_desvinculacion:readOrCurrent(['motivo_desvinculacion','motivo de desvinculacion'],'motivo_desvinculacion')
          ||existing?.motivo_desvinculacion||null
      }));
    });
    if(issues.length){message.innerHTML=`<span class="gpsWarn">No se importó nada. ${escHtml(issues.slice(0,5).join(' '))}${issues.length>5?` Hay ${issues.length-5} errores más.`:''}</span>`;return;}
    if(!imported.length){message.textContent='No se encontraron trabajadores válidos.';return;}
    const {error}=await window.supabaseClient.from('trabajadores').upsert(imported,{onConflict:'code'});
    if(error){
      // Este error salía crudo: "Could not find the 'rut' column of
      // 'trabajadores' in the schema cache". Dice qué falta en la
      // pantalla, pero no qué hacer, y hay DOS causas con arreglos
      // distintos (ver columnaDeLaImportacionFalta). Por eso se espera:
      // la respuesta se arma después de preguntar a la base.
      message.innerHTML=await columnaDeLaImportacionFalta(error)
        ||errorDeImportarTrabajadores(error);
      return;
    }
    await loadWorkers();
    message.textContent=`Importación completada: ${imported.length} trabajador(es) procesado(s).`;
  }catch(error){
    message.textContent=`No se pudo leer el CSV: ${error.message}`;
  }
}

function renderList(filter){
  const el=document.getElementById('workerList');
  const searchValue=filter===undefined?document.getElementById('workerSearch').value:filter;
  const f=(searchValue||'').trim().toLowerCase();
  const statusFilter=document.getElementById('workerStatusFilter').value;
  const supervisorFilter=document.getElementById('workerSupervisorFilter').value;
  const orden=((document.getElementById('workerSort')||{}).value)||'nombre';
  const filteredWorkers=workers.filter(w=>{
    // La búsqueda acepta el código con y sin ceros: si la pantalla muestra
    // 0021, buscar "21" tiene que encontrarlo, y al revés.
    const cod=String(w.code||'');
    const codLlenado=codigoMostrar(cod);
    const matchesSearch=!f||cod.toLowerCase().includes(f)||codLlenado.toLowerCase().includes(f)||w.name.toLowerCase().includes(f);
    const matchesStatus=!statusFilter||w.status===statusFilter;
    const matchesSupervisor=!supervisorFilter||(supervisorFilter==='__none__'?!w.supervisor_code:w.supervisor_code===supervisorFilter);
    return matchesSearch&&matchesStatus&&matchesSupervisor;
  });
  // Por nombre se ordena con acentos y todo, como estaba. Por código se
  // ordena NUMÉRICAMENTE, que es el motivo de este cambio: "7" tiene que
  // ir antes que "12".
  filteredWorkers.sort(orden==='codigo'
    ?(a,b)=>compararPorCodigo(a.code,b.code)||a.name.localeCompare(b.name)
    :(a,b)=>a.name.localeCompare(b.name));
  el.innerHTML='';
  if(!filteredWorkers.length){el.innerHTML='<small>No hay trabajadores que coincidan con estos filtros.</small>';return;}
  filteredWorkers.forEach(w=>{
    const d=document.createElement('div');
    d.className='list-item';
    // La fecha de término va a la vista cuando existe: es lo que ordena el
    // plano de obra. Si no existe, se dice, porque "desvinculado" a secas no
    // dice cuándo se fue y en la planilla queda con la fecha en que alguien
    // apretó el botón.
    const desvinculado=w.status==='desvinculado';
    const termino=w.fecha_termino?'<small> · término '+escHtml(String(w.fecha_termino).slice(0,10))+'</small>':'';
    const sinFecha=desvinculado&&!w.fecha_termino
      ?' <span class="pill" style="color:var(--warn-ink);border-color:var(--warn)" title="Sin fecha de término: la baja queda en la fecha en que se cerró la ficha">sin fecha de término</span>'
      :'';
    const estado=desvinculado
      ?' <span class="pill" style="color:var(--danger);border-color:var(--danger)">Desvinculado</span>'+termino+sinFecha
      :'';
    d.innerHTML=`<span><b>${escHtml(codigoMostrar(w.code))}</b> — ${escHtml(w.name)} <small>(${escHtml(w.spec||'—')})</small>${estado}</span>`+
      `<span class="lista-iconos">${desvinculado?'<span title="Revivir" style="cursor:pointer">♻️</span><span title="Completar fecha y artículo" style="cursor:pointer">📅</span>':''}<span title="${desvinculado?'Corregir desvinculación':'Desvincular'}" style="cursor:pointer">🚪</span><span title="Eliminar" style="cursor:pointer">🗑️</span></span>`;
    d.onclick=()=>editWorker(w.code);
    // Se busca por clase y no con "span:last-child": ese selector también
    // matchea el último ícono interno, y el código terminaba conectando los
    // manejadores al ícono de la papelera en vez de al contenedor. Revivir
    // o completar la fecha no hacían nada.
    const icons=d.querySelector('.lista-iconos');
    const botones=[...icons.children];
    if(desvinculado){
      // Revivir. Va primero: la ficha desvinculada por error es el caso más
      // común y el más caro de dejar así, porque la persona no aparece en
      // ninguna planilla.
      botones[0].onclick=(ev)=>{ev.stopPropagation();revivirWorker(w.code);};
      botones[1].onclick=(ev)=>{ev.stopPropagation();abrirDesvinculacion(w.code);};
    }
    botones[botones.length-2].onclick=(ev)=>{ev.stopPropagation();desvincularWorker(w.code);};
    botones[botones.length-1].onclick=(ev)=>{ev.stopPropagation();eliminarWorker(w);};
    // ------------------------------------------------------------------
    // EL BOTON DE LA FICHA
    // ------------------------------------------------------------------
    // Va como hermano DESPUES de lista-iconos, y no dentro. Los botones de
    // la fila se conectan por posicion (botones[0], botones[length-2], y
    // asi), asi que agregar uno DENTRO corre los indices una posicion y
    // "desvincular" pasa a disparar la ficha.
    //
    // No sale ningun error cuando eso pasa: las dos funciones existen y
    // reciben un codigo valido, solo que hacen otra cosa. Y un trabajador
    // desvinculado por un clic equivocado se va de la planilla sin que
    // nadie lo note hasta que alguien lo reclama.
    const btnFicha=document.createElement('button');
    btnFicha.type='button';
    btnFicha.className='btn secondary';
    btnFicha.style.cssText='flex:0 0 auto;min-height:40px;padding:6px 12px;font-size:.82rem';
    btnFicha.textContent='Ficha';
    btnFicha.title='Ver la ficha completa, con boton de copiar en cada campo';
    btnFicha.onclick=(ev)=>{ev.stopPropagation();abrirFichaTrabajador(w.code);};
    d.appendChild(btnFicha);
    el.appendChild(d);
  });
}
// Eliminar es distinto de desvincular, y por eso pregunta distinto.
//
// Desvincular deja la ficha y toda su asistencia. Eliminar borra la ficha, y
// asistencia tiene llave foránea con "on delete cascade": se va la
// asistencia del año pasado con ella. Eso no se puede deshacer.
//
// Por eso el aviso dice qué se va a perder y cuántas filas son, y pide
// escribir BORRAR. Una tarjeta de plástico no vale para una confirmación que borra
// un año de asistencia: el ok de un alert() se aprieta sin leer.
async function eliminarWorker(w){
  const dias=attendance.filter(r=>r.code===w.code).length;
  const marcajes=marcajes.filter(m=>m.code===w.code).length;
  const herramientas=herramientasAsignacionesFijas(w.code);
  let resumen='';
  if(dias)resumen+='\n• '+dias+' día(s) de asistencia';
  if(marcajes)resumen+='\n• '+marcajes+' marcaje(s) de reloj';
  if(herramientas)resumen+='\n• '+herramientas.length+' entrega(s) de herramientas';
  if(!resumen)resumen='\n• (no tiene datos de asistencia, pero igual se borra la ficha)';
  const escrito=prompt(
    `Eliminar a ${w.name} (${codigoMostrar(w.code)})?\n\n`+
    'Esto NO es desvincular. Se borra la ficha y TODO lo que tiene colgando:'+
    resumen+'\n\nNo se puede deshacer. Para cerrar una ficha sin perder la asistencia, '+
    'desvínculala en vez de eliminarla.\n\nEscribí BORRAR para confirmar:',
    ''
  );
  if(escrito===null)return;
  if(String(escrito).trim().toUpperCase()!=='BORRAR'){
    alert('No se eliminó nada. Para eliminar hay que escribir BORRAR.');
    return;
  }
  const {error}=await window.supabaseClient.from('trabajadores').delete().eq('code',w.code);
  if(error){alert('No se pudo eliminar: '+error.message);return;}
  await loadWorkers();
  fillWorkerSupervisorFilter();
  renderList();
  alert(w.name+' quedó eliminado, junto con su asistencia.');
}
function herramientasAsignacionesFijas(code){
  return (typeof herramientasAsignadas!=='undefined'&&Array.isArray(herramientasAsignadas))
    ?herramientasAsignadas.filter(a=>a.code===code)
    :[];
}
function editWorker(code){
  const w=workers.find(x=>x.code===code);
  if(!w)return;
  showView('nuevo-trabajador');
  document.getElementById('w-code').value=w.code;
  document.getElementById('w-name').value=w.name;
  document.getElementById('w-spec').value=w.spec||'';
  llenarSelectoresEspecialidad();
  seleccionarGrupoYCargo(document.getElementById('w-grupo'),document.getElementById('w-cargo'),w.especialidad_clave||'');
  document.getElementById('w-phone').value=w.phone||'';
  document.getElementById('w-rut').value=w.rut||'';
  document.getElementById('w-is-supervisor').checked=!!w.is_supervisor;
  document.getElementById('w-fecha-ingreso').value=w.fecha_ingreso||'';
  document.getElementById('w-tipo-trabajador').value=w.tipo_trabajador||'interno';
  document.getElementById('pre-casual').src=w.casual||'';
  document.getElementById('pre-safety').src=w.safety||'';
  tempCasual=null;tempSafety=null;
  document.getElementById('w-emerg-name').value=w.emerg_name||'';
  document.getElementById('w-emerg-phone').value=w.emerg_phone||'';
  document.getElementById('w-emerg-rel').value=w.emerg_rel||'';
  document.getElementById('w-salud').value=w.salud||'';
  document.getElementById('w-medicamentos').value=w.medicamentos||'';
  document.getElementById('w-precauciones').value=w.precauciones||'';
  window.scrollTo({top:0,behavior:'smooth'});
}

// La empresa de un trabajador; si no tiene asignada, la primera visible.
function empresaData(w){
  if(w&&w.empresa_id){
    const e=empresas.find(x=>mismoId(x.id,w.empresa_id));
    if(e)return e;
  }
  return empresas[0]||{};
}
function cardFrontHtml(w,idSuffix,temporal){
  const emp=empresaData(w);
  const foto=temporal?(w.casual||''):(w.safety||w.casual||'');
  return `
    <div class="idcard-face idcard-front${temporal?' temp-card-front':' final-card-front'}">
      ${emp.logo?`<img src="${emp.logo}" style="position:absolute;top:1mm;right:1mm;height:6mm;object-fit:contain">`:''}
      <img class="idcard-photo" src="${foto}" alt="foto">
      <div class="idcard-info">
        <div>
          ${emp.nombre?`<div class="${temporal?'temp-company':''}" style="font-size:5.5pt;text-transform:uppercase">${emp.nombre}</div>`:''}
          <div class="idcard-name">${w.name}</div>
          <div class="idcard-cargo">${w.spec||''}</div>
          ${temporal?'<span class="temp-card-badge">Temporal</span>':`<span class="final-card-badge">Definitiva</span><span class="worker-type-badge ${w.tipo_trabajador==='subcontrato'?'subcontrato':'interno'}">${w.tipo_trabajador==='subcontrato'?'Subcontrato':'Interno Empresa'}</span>`}
        </div>
        <div>
          <div class="idcard-code">Código: <b>${escHtml(codigoMostrar(w.code))}</b></div>
          <div class="idcard-codes">
            <svg id="barcode${idSuffix}"></svg>
          </div>
        </div>
      </div>
    </div>`;
}
function cardBackHtml(w,idSuffix='',temporal=false){
  if(temporal){
    const emp=empresaData(w);
    return `
      <div class="idcard-face idcard-back temp-card-back">
        <div class="temp-back-brand">
          ${emp.logo?`<img src="${emp.logo}" alt="">`:''}
          <div><strong>${emp.nombre||'Identificación del trabajador'}</strong><small>Información del empleado</small></div>
        </div>
        <div class="temp-back-details">
          <div class="temp-back-name">${w.name}</div>
          <div><b>Código:</b> ${w.code}</div>
          <div><b>Cargo:</b> ${w.spec||'—'}</div>
          <div class="temp-back-emergency"><b>Emergencia:</b> ${w.emerg_name||'—'}${w.emerg_rel?` (${w.emerg_rel})`:''} · ${w.emerg_phone||'—'}</div>
        </div>
        <div class="idcard-codes temp-back-codes">
          <div id="qrbox${idSuffix}"></div>
          <svg id="barcode${idSuffix}"></svg>
        </div>
      </div>`;
  }
  const emp=empresaData(w);
  return `
    <div class="idcard-face idcard-back final-card-back">
      <div class="final-back-brand">
        ${emp.logo?`<img src="${emp.logo}" alt="">`:''}
        <div><strong>${emp.nombre||'Identificación del trabajador'}</strong><small>Información del empleado</small></div>
      </div>
      <div class="final-card-details">
        <div class="final-card-name">${w.name}</div>
        <div><b>Código:</b> ${w.code}</div>
        <div><b>Cargo:</b> ${w.spec||'—'}</div>
        <div><b>Fecha de ingreso:</b> ${formatCardDate(w.fecha_ingreso)}</div>
        <div><b>Tipo:</b> ${w.tipo_trabajador==='subcontrato'?'Subcontrato':'Interno Empresa'}</div>
        <div><b>Estado:</b> ${w.status==='desvinculado'?'Desvinculado':'Activo'}</div>
        <div class="final-card-emergency"><b>Emergencia:</b> ${w.emerg_name||'—'}${w.emerg_rel?` (${w.emerg_rel})`:''} · ${w.emerg_phone||'—'}</div>
        <div class="final-card-health"><b>Prevención:</b> ${w.salud||'—'}${w.medicamentos?` · Medicamentos: ${w.medicamentos}`:''}${w.precauciones?` · Precauciones: ${w.precauciones}`:''}</div>
      </div>
      <div class="idcard-codes final-card-codes">
        <div id="qrbox${idSuffix}"></div>
        <svg id="barcode${idSuffix}"></svg>
      </div>
    </div>`;
}
function formatCardDate(value){
  if(!value)return 'No registrada';
  const [year,month,day]=value.split('-');
  return `${day}/${month}/${year}`;
}
function drawCardCodes(value,idSuffix,options={}){
  const qrbox=document.getElementById('qrbox'+idSuffix);
  if(qrbox){
    qrbox.innerHTML='';
    const size=options.qrSize||44;
    new QRCode(qrbox,{text:value,width:size,height:size});
  }
  const barcode=document.getElementById('barcode'+idSuffix);
  if(barcode){
    JsBarcode(barcode,value,{height:options.barcodeHeight||20,width:options.barcodeWidth||1,fontSize:options.fontSize||7,margin:options.margin??0});
  }
}
function fillCardSelect(){
  const sel=document.getElementById('cardSelect');
  sel.innerHTML=opcionesTrabajadores();
}
async function renderCard(){
  const code=document.getElementById('cardSelect').value;
  const w=workers.find(x=>x.code===code);
  const area=document.getElementById('cardArea');
  if(!w){area.innerHTML='<small>No hay trabajadores registrados.</small>';return;}
  area.innerHTML=`
    <div class="idcard" id="idcard">
      <div class="idcard-inner">
        ${cardFrontHtml(w,'',false)}
        ${cardBackHtml(w,'-back')}
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn secondary" onclick="document.getElementById('idcard').classList.toggle('flipped')">Girar tarjeta</button>
      <button class="btn secondary" onclick="window.print()">Imprimir</button>
      <button class="btn secondary" onclick="reemitirDefinitiva('${w.code}')">Emitir tarjeta nueva (anula la anterior)</button>
    </div>
  `;
  const cardId=await getOrIssueCard(w.code,'definitiva');
  drawCardCodes(cardId,'',{barcodeHeight:26,barcodeWidth:2,fontSize:7,margin:10});
  drawCardCodes(cardId,'-back',{qrSize:220,barcodeHeight:24,barcodeWidth:2,fontSize:7,margin:10});
}
async function reemitirDefinitiva(code){
  if(!confirm('Esto anula cualquier tarjeta activa de este trabajador (temporal o definitiva) y emite una nueva. ¿Continuar?'))return;
  await issueCard(code,'definitiva');
  renderCard();
}

// ---------- lectura QR desde la cámara o una imagen ----------
let qrScanPurpose='porteria';
let liveScanner=null;
let liveScanLock=false;


function addHoliday(){
  const v=document.getElementById('addHoliday').value;
  if(!v)return;
  if(!extraHolidays.includes(v))extraHolidays.push(v);
  save();
  renderMatrix();
}
// ---------- supervisores ----------
// ============================================================
// ASISTENCIA DIARIA DEL SUPERVISOR
// Lista de su gente para un día. Cada uno pasa su tarjeta y queda
// presente con la hora real de entrada. Si al fichar hay algo que
// resolver (llegó tarde, la asistente social lo busca, prevención
// tiene algo que decirle) se abre una ventana con el detalle y a qué
// tiene que ir.
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
// El caso: un trabajador no fichó, pero el supervisor lo vio entrar y lo
// marca. Eso está bien hecho, pero la planilla queda diciendo "presente"
// sin que quede dicho QUIÉN decidió eso ni POR QUÉ. Después nadie puede
// responder por una marcación que se hizo de palabra.
//
// Así que al marcar sin marcaje del reloj, la app no solo marca: escribe
// un aviso que Administración tiene que CONFIRMAR. La confirmación es lo
// que lo convierte en un registro y no en un dato suelto.
//
// El aviso NO lo confirma quien lo mandó. La política de la base lo
// impide: confirmar usa el permiso de "aprobar cambio", no el de marcar.
// Un supervisor no puede darse por buena su propia indicación.
async function marcarYAvisar(code,tipo){
  const w=workers.find(x=>x.code===code);
  if(!w){alert('No se encontró al trabajador.');return;}
  const reloj=marcajeDe(code,tipo);
  const entradaEsp=horaEntradaDe(miCodigoSupervisor);
  const tolerancia=toleranciaDe(miCodigoSupervisor);
  const minEsp=minutosDe(entradaEsp);
  const minMarcaje=reloj?minutosDe(reloj.hora):null;
  const tarde=minMarcaje!=null&&minEsp!=null&&minMarcaje>minEsp+tolerancia;

  const indicacion=prompt(
    'Marcando a '+w.code+' — '+w.name+' sin marcaje del reloj.\n\n'+
    (reloj?('El reloj registró '+reloj.tipo+' a las '+reloj.hora+'.')
          :'El reloj no registró nada de esta persona hoy.')+
    (tarde?'\n\nVa fuera de la hora de entrada ('+entradaEsp+').':'')+
    '\n\nEscribe por qué lo marcas. Esto lo va a leer y confirmar Administración, '+
    'así que escribe lo que se le dirías a RRHH:\n\n(obligatorio)'
  ,'');
  if(indicacion==null)return;   // canceló
  if(!indicacion.trim()){
    alert('La indicación es obligatoria: sin ella el aviso no dice nada y no sirve para confirmar nada.');
    return;
  }
  const tipoAviso=!reloj?'no_marco':(tarde?'entrada_tarde':'otra');
  const {error}=await window.supabaseClient.from('avisos_ingreso').insert({
    code,fecha:fechaDiaria,tipo:tipoAviso,
    indicacion:indicacion.trim(),
    hora_reloj:reloj?reloj.hora:null,
    // "origen_registro" es una columna libre de texto: acá va de dónde
    // salió la hora, no el origen del marcaje (que va en "marcajes" y solo
    // admite qr, manual, excel, porteria, app y reloj).
    origen_registro:reloj?(reloj.origen||'reloj'):'sin_marcaje',
    enviado_por:miPerfil?miPerfil.id:null,
    enviado_por_nombre:miNombrePerfil()
  });
  if(error){
    const archivo=migracionQueFalta(error);
    alert(archivo
      ? 'Falta la migración '+archivo+'. Sin ella no se puede dejar el aviso. Ábrela en el SQL Editor de Supabase y vuelve a intentar.'
      : 'No se pudo dejar el aviso: '+error.message);
    return;
  }
  // Se marca DESPUÉS de dejar el aviso, no antes. Al revés, si el aviso
  // fallara, quedaría la marcación sin explicación de por qué.
  // El origen va "manual": el reloj no registró nada de esta persona, lo
  // está anotando una persona. La indicación va en la nota del marcaje
  // para que se entienda al ver la fila, no solo en la bandeja de avisos.
  const marcado=await registrarMarcaje(code,tipo,'manual','Marcado por supervisor: '+indicacion.trim());
  if(!marcado){
    alert('Se dejó el aviso, pero la marcación no se pudo guardar. Revisa la asistencia antes de que termine el turno.');
  }
  await Promise.all([loadMarcajesDia(),loadAsistenciaDelDia(),loadAvisosIngresoDia()]);
  renderAvisosIngresoEnviados();
}

// Mis avisos: los que mandé yo, con su estado. Para que el supervisor vea
// si Administración ya lo confirmó o si sigue en la bandeja.
// RLS filtra en silencio: un UPDATE prohibido devuelve 0 filas y NO lanza
// error. Estos casos son los que llegan sin excepción, y son los que más
// confunden ("guardó bien y no pasó nada"). Se detectan mirando si la fila
// volvió.
const RLS_RECHAZO=/row-level security|not authorized|violates row|new row violates|permission denied/i;

async function loadAvisosIngresoDia(){
  const {data,error}=await window.supabaseClient.from('avisos_ingreso')
    .select('*').eq('fecha',fechaDiaria).order('created_at',{ascending:false});
  if(error){
    avisosIngresoError=error.message;
    avisosIngresoDia=[];
    return;
  }
  avisosIngresoError=null;
  avisosIngresoDia=data||[];
}
function renderAvisosIngresoEnviados(){
  const box=document.getElementById('avisosIngresoMios');
  if(!box)return;
  if(avisosIngresoError){
    const archivo=migracionQueFalta({message:avisosIngresoError});
    box.innerHTML=archivo
      ?`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
        <b>Falta la migración ${escHtml(archivo)}.</b> <small>Sin ella no se pueden dejar avisos de ingreso.</small></div>`
      :`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
        <b>No se pudieron leer tus avisos.</b> <small>${escHtml(avisosIngresoError)}</small></div>`;
    return;
  }
  const mios=miPerfil?avisosIngresoDia.filter(a=>a.enviado_por===miPerfil.id):[];
  if(!mios.length){
    box.innerHTML='<small>No has dejado ningún aviso hoy. Cuando marques a alguien que no fichó, aparece aquí.</small>';
    return;
  }
  const estado=(a)=>{
    if(a.estado==='confirmado'){
      return `<span class="eppBadge firmado">Confirmado por ${escHtml(a.confirmado_por_nombre||'Administración')}${a.confirmado_at?' · '+escHtml(fechaLegible(a.confirmado_at,true)):''}</span>`+
        (a.comentario?`<small>${escHtml(a.comentario)}</small>`:'');
    }
    if(a.estado==='rechazado'){
      return `<span class="eppBadge sinFirma">Rechazado</span><small>${escHtml(a.comentario||'Sin comentario')}</small>`;
    }
    return '<span class="eppBadge" style="color:#e08b1a;border-color:#e08b1a">Esperando confirmación</span>';
  };
  box.innerHTML=mios.map(a=>{
    const w=workers.find(x=>x.code===a.code);
    return `<div style="border:1px solid var(--line);border-radius:8px;padding:9px 10px;margin-bottom:7px">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1">
          <b>${escHtml(a.code)}</b> ${escHtml(w?w.name:a.code)}
          <small> · ${escHtml(a.hora_reloj?'el reloj marcó '+a.hora_reloj:'sin marcaje del reloj')}</small>
          <div><small style="color:var(--muted)">Dijiste:</small> ${escHtml(a.indicacion)}</div>
        </div>
        <div>${estado(a)}</div>
      </div>
    </div>`;
  }).join('');
}

// La bandeja de Administración. Acá es donde el aviso deja de ser "alguien
// dijo que sí" y pasa a ser un registro confirmado: quién lo mandó, por
// qué, quién lo confirmó y qué respondió.
// ============================================================
// BITÁCORA DE ACCESO
// ============================================================
// Se lee acá y no en un informe aparte porque la pregunta "quién estuvo
// en el sistema el martes" la hace quien está mirando aprobaciones.
//
// Las sesiones que se cerraron solas (pestaña cerrada, red caída) NO
// tienen registro de salida: el navegador no avisa. Se deducen por el
// hueco. Marcarlo como "cierre" sin más sería mentir sobre lo que pasó,
// así que se muestra la hora en que empezó la siguiente.
async function loadBitacora(){
  const box=document.getElementById('bitacoraList');
  if(!box)return;
  const {data,error}=await window.supabaseClient.from('accesos_sistema')
    .select('*').order('created_at',{ascending:false}).limit(250);
  if(error){
    const archivo=migracionQueFalta(error);
    box.innerHTML=archivo
      ?`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
        <b>Falta la migración ${escHtml(archivo)}.</b> <small>Sin ella no se puede llevar la bitácora de acceso.</small></div>`
      :`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
        <b>No se pudo leer la bitácora.</b> <small>${escHtml(error.message)}</small></div>`;
    return;
  }
  const filas=data||[];
  if(!filas.length){
    box.innerHTML='<small>Todavía no hay accesos registrados. aparecerán desde la próxima vez que alguien entre al sistema.</small>';
    return;
  }
  // Duración legible: "12 min" o "1 h 04 min". Los segundos pelados no
  // dicen nada.
  const duracion=(s)=>{
    if(s==null)return '—';
    const m=Math.round(s/60);
    if(m<1)return 'menos de 1 min';
    if(m<60)return m+' min';
    return Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min';
  };
  const evento={
    entrada:['<span class="eppBadge firmado">Entró</span>','ok'],
    salida:['<span class="eppBadge">Salió</span>','ok'],
    cierre:['<span class="eppBadge sinFirma">Sesión cortada</span>','warn']
  };
  box.innerHTML=`<table><thead><tr>
      <th class="izq">Quién</th><th>Qué pasó</th><th>Cuándo</th><th>Duración</th><th>Desde</th>
    </tr></thead><tbody>${filas.map(a=>{
      const e=evento[a.evento]||evento.entrada;
      return `<tr>
        <td class="izq"><b>${escHtml(a.nombre||a.correo||'—')}</b><br><small>${escHtml(a.correo||'')}</small></td>
        <td>${e[0]}</td>
        <td><small>${escHtml(fechaLegible(a.created_at,true))}</small></td>
        <td><small>${escHtml(duracion(a.duracion_segundos))}</small></td>
        <td><small>${escHtml(a.dispositivo||'—')}</small></td>
      </tr>`;
    }).join('')}</tbody></table>
    <p><small>Una <b>sesión cortada</b> es una que se terminó sin pasar por "Cerrar sesión": pestaña
      cerrada, red caída o el token vencido. El navegador no avisa en esos casos, así que no hay hora
      de salida registrada. Los últimos 250 accesos, de todos los usuarios.</small></p>`;
}

async function loadBandejaAvisos(){
  const box=document.getElementById('avisosIngresoBandeja');
  if(!box)return;
  if(!exigirPermiso('tarja.aprobar_cambio','Solo Administración puede confirmar estos avisos.')){
    box.innerHTML='<small>Sin permiso para confirmar avisos.</small>';
    return;
  }
  const {data,error}=await window.supabaseClient.from('avisos_ingreso')
    .select('*').order('created_at',{ascending:false}).limit(200);
  if(error){
    const archivo=migracionQueFalta(error);
    box.innerHTML=archivo
      ?`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
        <b>Falta la migración ${escHtml(archivo)}.</b> <small>Sin ella no hay bandeja de avisos de ingreso.</small></div>`
      :`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
        <b>No se pudo leer la bandeja.</b> <small>${escHtml(error.message)}</small></div>`;
    return;
  }
  const filas=data||[];
  const pendientes=filas.filter(a=>a.estado==='enviado');
  const resueltos=filas.filter(a=>a.estado!=='enviado').slice(0,60);

  const fila=(a,conAccion)=>{
    const w=workers.find(x=>x.code===a.code);
    const estado=a.estado==='confirmado'
      ?`<span class="eppBadge firmado">Confirmado · ${escHtml(a.confirmado_por_nombre||'')} ${a.confirmado_at?escHtml(fechaLegible(a.confirmado_at,true)):''}</span>`
      :a.estado==='rechazado'
        ?`<span class="eppBadge sinFirma">Rechazado · ${escHtml(a.confirmado_por_nombre||'')}</span>`
        :'<span class="eppBadge" style="color:#e08b1a;border-color:#e08b1a">Sin confirmar</span>';
    const tipo={no_marco:'No fichó',entrada_tarde:'Entró tarde',salida_temprana:'Salió temprano',otra:'Otro'}[a.tipo]||a.tipo;
    return `<tr>
      <td class="izq">${escHtml(a.fecha)}</td>
      <td class="izq"><b>${escHtml(a.code)}</b> ${escHtml(w?w.name:'')}<br><small>${escHtml(tipo)}${a.hora_reloj?' · reloj '+escHtml(a.hora_reloj):''}</small></td>
      <td class="izq"><small>${escHtml(a.indicacion)}</small></td>
      <td class="izq"><small>${escHtml(a.enviado_por_nombre||'')}<br>${escHtml(fechaLegible(a.created_at,true))}</small></td>
      <td>${estado}${a.comentario?'<br><small>'+escHtml(a.comentario)+'</small>':''}</td>
      <td>${conAccion?`
        <button class="btn" type="button" style="margin:0;padding:5px 9px;font-size:.7rem" onclick="confirmarAvisoIngreso('${a.id}','confirmado')">Confirmar</button>
        <button class="btn secondary" type="button" style="margin:0;padding:5px 9px;font-size:.7rem" onclick="confirmarAvisoIngreso('${a.id}','rechazado')">Rechazar</button>
      `:'<small>—</small>'}</td>
    </tr>`;
  };

  box.innerHTML=`
    <h3 style="font-size:.95rem;margin:0 0 4px">Avisos sin confirmar</h3>
    <small style="color:var(--muted)">Un supervisor marcó a alguien que no había fichado y dejó escrita la indicación.
      Confirmar deja constancia de que alguien lo revisó. El supervisor ve la confirmación en su pantalla.</small>
    ${pendientes.length
      ?`<table style="margin-top:8px"><thead><tr>
          <th class="izq">Fecha</th><th class="izq">Trabajador</th><th class="izq">Indicación</th>
          <th class="izq">Mandado por</th><th>Estado</th><th></th>
        </tr></thead><tbody>${pendientes.map(a=>fila(a,true)).join('')}</tbody></table>`
      :'<div style="margin-top:8px"><small>Nada pendiente. Los avisos confirmados quedan más abajo.</small></div>'}
    <h3 style="font-size:.95rem;margin:18px 0 4px">Ya resueltos</h3>
    ${resueltos.length
      ?`<table><thead><tr>
          <th class="izq">Fecha</th><th class="izq">Trabajador</th><th class="izq">Indicación</th>
          <th class="izq">Mandado por</th><th>Estado</th><th></th>
        </tr></thead><tbody>${resueltos.map(a=>fila(a,false)).join('')}</tbody></table>`
      :'<div><small>Todavía no se resolvió ningún aviso.</small></div>'}`;
}
async function confirmarAvisoIngreso(id,estado){
  if(!exigirPermiso('tarja.aprobar_cambio'))return;
  const comentario=prompt(
    estado==='confirmado'
      ? 'Vas a confirmar que la marcación correspondía. Escribe una línea para el registro (opcional):'
      : 'Vas a rechazar la marcación. Escribe POR QUÉ, que el supervisor lo va a leer:'
  ,'');
  if(comentario===null)return;
  if(estado==='rechazado'&&!comentario.trim()){
    alert('El rechazo necesita un motivo: el supervisor tiene que entender qué corregir.');
    return;
  }
  // El .select() al final es lo que hace que esto se pueda verificar: sin
  // él, un UPDATE que la política de la base bloquea devuelve 0 filas y
  // NINGÚN error, y la pantalla mostraría "confirmado" sin que se haya
  // guardado nada. Con el select se ve si la fila volvió.
  const {data,error}=await window.supabaseClient.from('avisos_ingreso').update({
    estado,
    confirmado_por:miPerfil?miPerfil.id:null,
    confirmado_por_nombre:miNombrePerfil(),
    confirmado_at:new Date().toISOString(),
    comentario:comentario.trim()||null
  }).eq('id',id).select('id');
  if(error){
    alert('No se pudo confirmar: '+error.message+
      (RLS_RECHAZO.test(error.message)
        ?'\n\nLa base no lo permitió. Confirmar requiere el permiso "tarja.aprobar_cambio", que es distinto del permiso para marcar.'
        :''));
    return;
  }
  if(!data||!data.length){
    alert('La base no dejó confirmar este aviso.\n\n'+
      'Casi siempre es el permiso: confirmar exige "tarja.aprobar_cambio", que no es el mismo que el de marcar asistencia. '+
      'Pídeselo a un administrador.');
    return;
  }
  await loadBandejaAvisos();
}

// Marcar desde la conciliación. Es distinto de "Marcar y avisar" a
// propósito: acá el reloj YA tiene la marcación y lo que falta es
// reflejarla en la planilla. No hay nada que confirmar, porque la fuente es
// el reloj y no la palabra de una persona.
//
// QUE HAGA ALGO DE VERDAD, QUE NO HACÍA ANTES
//
// El caso "falta marcar" es, por definición, uno en que el marcaje YA
// existe: el reloj lo vio y la planilla no lo tiene. Llamar a
// registrarMarcaje() ahí no servía de nada, porque esa función sale
// temprano cuando el marcaje ya está, y la planilla seguía igual. El
// botón no hacía nada y no se veía por qué.
//
// Por eso el orden es: primero se asegura el marcaje (si falta) y
// después se escribe la planilla SIEMPRE. Que la planilla se actualice es
// el punto de este botón.
async function conciliarMarcar(code,tipo){
  const w=workers.find(x=>x.code===code);
  if(!w){alert('No se encontró al trabajador.');return;}
  const reloj=marcajeDe(code,tipo);
  const ok=confirm(
    'Se va a llevar a la planilla la marcación del reloj de '+w.code+' — '+w.name+':\n\n'+
    '   '+tipo+' a las '+(reloj?reloj.hora:'sin hora')+'\n\n'+
    'No deja aviso a confirmar: la fuente es el reloj, no una anotación.\n\n¿Seguir?'
  );
  if(!ok)return;

  // 1) El marcaje, por si tampoco existe (caso "presente en la planilla
  //    sin marcaje": acá es al revés y sí hay que crearlo).
  if(!reloj){
    const creado=await registrarMarcaje(code,tipo,'app','Marcado desde la conciliación.');
    if(!creado){
      alert('No se pudo registrar el marcaje. Revisa la asistencia antes de que termine el turno.');
      return;
    }
  }

  // 2) La planilla, SIEMPRE. Es lo que faltaba.
  const hora=reloj?reloj.hora:hhmmActual();
  const guardado=await saveAttendanceState(code,fechaDiaria,'X',hora,{
    motivo:motivoDeMarcaje(reloj?'Conciliado con el marcaje del reloj':'Marcaje manual sin marcaje del reloj',{
      'tipo':tipo,'hora':hora,'reloj':reloj?reloj.tipo+' '+reloj.hora:'no registró'
    })
  });
  if(guardado===false){
    alert('El marcaje quedó, pero la planilla no se pudo actualizar. '+
      'Revísala a mano antes de que termine el turno.');
  }else{
    // El objeto local también, para que la pantalla no muestre algo viejo
    // hasta el próximo "Actualizar".
    const local=attendance.find(a=>a.code===code&&a.date===fechaDiaria);
    if(local)local.hora_llegada=hora;
  }
  await Promise.all([loadMarcajesDia(),loadAsistenciaDelDia()]);
}

async function cambiarFechaDiaria(){
  fechaDiaria=(document.getElementById('diariaFecha')||{}).value||hoyLocal();
  loadMarcajesDia().then(loadAvisosDia).then(renderDiaria);
}

// ============================================================
// IMPORTAR MARCAJES DESDE EXCEL
// ============================================================
// El reloj de la obra manda un reporte con una fila por marcaje. Se
// leen las columnas del reporte y se guarda en la tabla "marcajes", que
// es la misma que alimenta la asistencia diaria: el supervisor no ve
// una lista aparte, ve exactamente los mismos marcajes.
//
// Nombres de columna que se aceptan, porque el reporte puede venir
// con o sin tildes y en minúsculas o mayúsculas:
//
//   Tipo      Entrada | Salida | Entrada Horas Extra
//   Evento    Inicio Jornada | Fin Jornada | Nuevo Ingreso
//   Fecha     28-09-2026 | 45744 (número de Excel)
//   Hora      07:45 | 0,3188 (fracción del día) | 21 (hora de Excel)
//   Rut       13199887-2
//   Colaborador  ADASME VERDUGO JAIME PATRICIO
//
// La pareja (Rut, Colaborador) se usa para saber de quién es cada
// fila. El RUT manda porque no cambia; el nombre es el respaldo para
// los trabajadores que todavía no lo tienen informado.
let marcajesPendientesDeImportar=null;

// Compara nombres sin tildes, sin mayúsculas y sin importar el orden
// de las palabras: "ALVAREZ CORDERO MARIA TERESA" en el reporte es la
// misma persona que "María Teresa Álvarez Cordero" en la app.
function nombreComparable(t){
  return normalizar(t).replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
function nombresCoinciden(a,b){
  const na=nombreComparable(a), nb=nombreComparable(b);
  if(!na||!nb)return false;
  if(na===nb)return true;
  // Se comparan también las palabras ordenadas, por si el reporte
  // invierte el orden (apellidos primero vs. nombre primero).
  const pa=na.split(' ').sort().join(' ');
  const pb=nb.split(' ').sort().join(' ');
  return pa===pb;
}
function rutComparable(t){
  return String(t==null?'':t).replace(/[^0-9kK]/g,'').toLowerCase();
}

// La hora del reporte puede venir como texto ("07:45"), como fracción
// del día (0,3188) o como número de Excel (21 = 21:00). Se aceptan
// las tres porque cada reloj exporta distinto.
function horaDesdeValor(valor,fechaValor){
  if(valor instanceof Date){
    // SheetJS lo dejó como Date si venía con formato de fecha.
    return hhmmDe(valor.getHours(),valor.getMinutes());
  }
  if(valor==null||valor==='')return '';
  if(typeof valor==='number'&&isFinite(valor)){
    // Entre 0 y 1: fracción del día. Mayor que 1: hora de Excel
    // (el reloj guarda 21 = 21:00, no 21/24).
    if(valor>=0&&valor<1)return hhmmDe(Math.floor(valor*24),Math.round((valor*24%1)*60));
    if(valor>=1&&valor<24)return hhmmDe(Math.floor(valor),Math.round((valor%1)*60));
    return '';
  }
  const s=String(valor).trim();
  const m=s.match(/^(\d{1,2})[:.\-](\d{1,2})/);   // 07:45, 7.45, 07-45
  if(m)return String(m[1]).padStart(2,'0')+':'+String(m[2]).padStart(2,'0');
  if(/^\d{1,2}$/.test(s))return s.padStart(2,'0')+':00';
  return '';
}
function hhmmDe(h,m){
  h=((h%24)+24)%24; m=((m%60)+60)%60;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}

// La fecha puede venir como texto, como Date o como número de Excel.
// El número de Excel cuenta días desde 1899-12-30 (con el bug del año
// bisiesto de 1900, que ya viene corregido en ese número).
function fechaDesdeValor(valor){
  if(valor instanceof Date){
    if(isNaN(valor.getTime()))return '';
    // OJO CON ESTO, que es un error de un día.
    //
    // SheetJS convierte una celda que SOLO tiene fecha a la medianoche UTC.
    // En Chile (UTC-3) esa medianoche son las 21:00 del día ANTERIOR, así
    // que leer la fecha con getDate() devuelve el 27 cuando la celda dice
    // 28. Se cargaba la asistencia entera corrida un día, y no se notaba:
    // 28 de septiembre parece un día tan bueno como cualquier otro.
    //
    // La diferencia se nota comparando la medianoche UTC con la local. Si
    // coinciden, la celda no tiene hora: se lee en UTC, que es como la
    // escribió el reloj. Si no coinciden, es una fecha con hora de verdad y
    // se lee en hora local, que es lo que quiere decir.
    const esMedianocheUtc=valor.getUTCHours()===0&&valor.getUTCMinutes()===0
      &&valor.getUTCSeconds()===0&&valor.getUTCMilliseconds()===0;
    if(esMedianocheUtc){
      return String(valor.getUTCFullYear())+'-'
        +String(valor.getUTCMonth()+1).padStart(2,'0')+'-'
        +String(valor.getUTCDate()).padStart(2,'0');
    }
    return isoLocal(valor);
  }
  if(valor==null||valor==='')return '';
  if(typeof valor==='number'&&isFinite(valor)){
    if(valor>20000&&valor<60000){
      const d=new Date(Math.round((valor-25569)*86400*1000));
      return isNaN(d.getTime())?'':d.toISOString().slice(0,10);
    }
    if(valor>1&&valor<31)return isoLocal(new Date(2026,0,Math.floor(valor)));  // día del mes suelto
  }
  const s=String(valor).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  // 28/09/2026 o 28-09-2026
  const d=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(d){
    let anio=Number(d[3]);
    if(anio<100)anio+=anio<50?2000:1900;
    return anio+'-'+String(Number(d[2])).padStart(2,'0')+'-'+String(Number(d[1])).padStart(2,'0');
  }
  return '';
}

// El tipo del marcaje sale de "Tipo" o de "Evento". Se mira "Tipo"
// primero porque en el reporte es el que distingue entrada de salida;
// "Evento" es el respaldo.
function tipoMarcajeDesde(r){
  const bruto=(r.Tipo!=null&&r.Tipo!==''?r.Tipo:r.Evento);
  const t=normalizar(bruto);
  if(!t)return '';
  if(/salida|fin|out|egreso|termina/.test(t))return 'salida';
  if(/entrada|inicio|in|ingreso|entrar/.test(t))return 'entrada';
  return '';
}

// Busca un encabezado sin importar tildes, mayúsculas ni espacios.
function valorDeColumna(fila,nombres){
  for(const clave of Object.keys(fila)){
    const k=normalizar(clave);
    if(nombres.some(n=>k===n||k===normalizar(n)))return fila[clave];
  }
  return undefined;
}

// ÚNICA fila de cada trabajador y día, para no insertar 300 veces lo
// mismo. El índice único de la tabla lo rechazaría igual, pero es
// mejor saberlo antes de tocar la base.
function reducirMarcajes(filas){
  const vistos=new Map();
  const duplicados=[];
  filas.forEach(f=>{
    const clave=f.code+'|'+f.fecha+'|'+f.tipo;
    if(vistos.has(clave)){duplicados.push(f);return;}
    vistos.set(clave,f);
  });
  return {unicas:Array.from(vistos.values()),duplicados};
}

// ---------- paso 1: leer y mostrar el resumen, sin guardar nada
async function analizarMarcajesExcel(){
  const msg=document.getElementById('marcajesExcelMsg');
  const prev=document.getElementById('marcajesExcelPreview');
  const archivo=document.getElementById('marcajesFile').files[0];
  msg.innerHTML='';prev.innerHTML='';
  document.getElementById('btnImportarMarcajes').disabled=true;
  marcajesPendientesDeImportar=null;
  if(!archivo){msg.innerHTML='<small class="gpsWarn">Selecciona el archivo del reloj.</small>';return;}

  msg.innerHTML='<small>Leyendo el archivo…</small>';
  let filas;
  try{
    filas=await leerFilasDeMarcajes(archivo);
  }catch(error){
    msg.innerHTML='<small class="gpsWarn">No se pudo leer el archivo: '+escHtml(error.message)+'</small>';
    return;
  }
  if(!filas.length){
    msg.innerHTML='<small class="gpsWarn">El archivo no tiene filas.</small>';
    return;
  }
  // ¿Se eligió la pestaña equivocada? Es el mismo error al revés: una
  // planilla no tiene filas que se puedan leer como fichajes, y sin esto
  // el mensaje sería "0 marcajes listos" sin explicar por qué.
  const formato=detectarFormatoExcel(filas);
  if(formato==='planilla'){
    archivoExcelParaMarcajes=archivo;
    avisoFormatoEquivocado(msg,formato,archivo.name);
    return;
  }

  const analisis=analizarFilasDeMarcajes(filas);
  marcajesPendientesDeImportar=analisis;
  const btn=document.getElementById('btnImportarMarcajes');
  btn.disabled=!analisis.paraGuardar.length;

  const problemas=analisis.sinCoincidencia.length+analisis.sinFechaHora.length+analisis.tipoDesconocido.length;
  const conDatos=filas.length-analisis.filasVacias;
  msg.innerHTML=`<div style="border:1px solid ${problemas?'#e08b1a':'var(--accent)'};border-radius:8px;padding:10px 12px;background:${problemas?'rgba(224,139,26,.07)':'rgba(46,125,50,.07)'}">
    <b>${conDatos}</b> fila(s) con datos${analisis.filasVacias?` de ${filas.length} (se ignoraron ${analisis.filasVacias} vacías)`:''}.
    <ul style="margin:6px 0 0;padding-left:18px;font-size:.85rem">
      <li><b>${analisis.paraGuardar.length}</b> marcaje(s) listos para guardar</li>
      ${analisis.duplicados.length?`<li><b>${analisis.duplicados.length}</b> repetidas en el mismo archivo (se toma la primera)</li>`:''}
      ${analisis.sinCoincidencia.length?`<li style="color:var(--danger)"><b>${analisis.sinCoincidencia.length}</b> sin trabajador que coincida</li>`:''}
      ${analisis.sinFechaHora.length?`<li style="color:var(--danger)"><b>${analisis.sinFechaHora.length}</b> sin fecha u hora legible</li>`:''}
      ${analisis.tipoDesconocido.length?`<li style="color:var(--danger)"><b>${analisis.tipoDesconocido.length}</b> con un tipo que no es entrada ni salida</li>`:''}
    </ul>
    ${analisis.paraGuardar.length?'<div style="margin-top:8px"><button class="btn" type="button" onclick="importarMarcajesExcel()">Guardar '+analisis.paraGuardar.length+' marcaje(s)</button></div>':''}
  </div>`;
  prev.innerHTML=renderResumenMarcajes(analisis);
}

function leerFilasDeMarcajes(archivo){
  return leerPrimeraHoja(archivo);
}

// Revisa cada fila y decide a qué trabajador pertenece. NO escribe nada.
function analizarFilasDeMarcajes(filas){
  const sinCoincidencia=[];const sinFechaHora=[];const tipoDesconocido=[];
  const validas=[];
  const porRut=new Map();
  const porNombre=new Map();
  workers.forEach(w=>{
    const r=rutComparable(w.rut);
    if(r)porRut.set(r,w);
    const n=nombreComparable(w.name);
    if(n)porNombre.set(n,w);
  });

  let filasVacias=0;
  filas.forEach((fila,indice)=>{
    const numeroFila=indice+2;   // +2 porque la 1 es el encabezado
    const tipo=tipoMarcajeDesde(fila);
    const fecha=fechaDesdeValor(valorDeColumna(fila,['Fecha','fecha']));
    const hora=horaDesdeValor(valorDeColumna(fila,['Hora','hora']),fecha);
    const rut=rutComparable(valorDeColumna(fila,['Rut','RUT','rut']));
    const nombre=String(valorDeColumna(fila,['Colaborador','colaborador','Nombre','Trabajador'])||'').trim();

    // El reporte del reloj viene con cientos de filas vacías al final
    // (heredan el formato pero no tienen datos). Contarlas como
    // "problema" taparía los problemas de verdad con 600 avisos de
    // "tipo no reconocido" que no le dicen nada a nadie.
    if(!tipo&&!fecha&&!hora&&!rut&&!nombre){filasVacias++;return;}

    if(!tipo){tipoDesconocido.push({fila:numeroFila,detalle:'Tipo "'+(fila.Tipo||fila.Evento||'')+'" no se reconoce como entrada ni salida'});return;}
    if(!fecha||!hora){sinFechaHora.push({fila:numeroFila,detalle:'Fecha "'+(fila.Fecha||'')+'" u hora "'+(fila.Hora||'')+'" no se pudo leer'});return;}

    let w=rut?porRut.get(rut):null;
    let como='RUT';
    if(!w&&nombre){
      w=porNombre.get(nombreComparable(nombre));
      como='nombre';
      if(!w){
        // Segundo intento: el nombre del reporte y el de la app pueden
        // diferir en el orden de las palabras.
        w=workers.find(x=>nombresCoinciden(nombre,x.name));
        if(w)como='nombre (orden distinto)';
      }
    }
    if(!w){
      sinCoincidencia.push({fila:numeroFila,detalle:'No hay ningún trabajador con RUT '+(rut||'(vacío)')+' ni con el nombre "'+nombre+'"'});
      return;
    }
    validas.push({code:w.code,fecha,hora,tipo,rut,nombre,como,numeroFila});
  });

  const reducir=reducirMarcajes(validas);
  return {
    archivo:document.getElementById('marcajesFile').files[0],
    filasTotales:filas.length,
    filasVacias,
    validas:reducir.unicas,
    duplicados:reducir.duplicados,
    sinCoincidencia,sinFechaHora,tipoDesconocido,
    paraGuardar:reducir.unicas
  };
}

function renderResumenMarcajes(a){
  const porTipo=(tipo)=>a.validas.filter(v=>v.tipo===tipo);
  const entradas=porTipo('entrada'),salidas=porTipo('salida');
  const fechas=[...new Set(a.validas.map(v=>v.fecha))].sort();
  const dias=fechas.length;
  let html='<details><summary style="cursor:pointer"><b>Ver detalle</b> de lo que se va a guardar</summary>';
  html+=`<div style="margin-top:8px;font-size:.85rem">
    <div><b>${a.validas.length}</b> marcaje(s) · ${entradas.length} entrada(s) y ${salidas.length} salida(s) · ${dias} día(s)${dias?` (${fechas[0]} a ${fechas[fechas.length-1]})`:''}</div>`;
  if(a.validas.length){
    html+='<div class="overflow" style="margin-top:8px"><table><thead><tr>'+
      '<th>Fecha</th><th>Tipo</th><th>Hora</th><th class="izq">Trabajador</th><th>Cómo se emparejó</th>'+
      '</tr></thead><tbody>'+
      a.validas.slice(0,300).map(v=>`<tr><td>${escHtml(v.fecha)}</td><td>${v.tipo}</td><td>${escHtml(v.hora)}</td>`+
        `<td class="izq"><b>${escHtml(codigoMostrar(v.code))}</b> ${escHtml(workers.find(w=>w.code===v.code)?workers.find(w=>w.code===v.code).name:'')}</td>`+
        `<td><small>${escHtml(v.como)}${v.rut?'':' · sin RUT'}</small></td></tr>`).join('')+
      '</tbody></table></div>';
    if(a.validas.length>300)html+=`<small>Se muestran los primeros 300 de ${a.validas.length}.</small>`;
  }
  const listar=(titulo,items)=>{
    if(!items.length)return '';
    return `<div style="margin-top:10px"><b>${titulo}</b><ul style="margin:4px 0 0;padding-left:18px">`+
      items.slice(0,50).map(x=>`<li>Fila ${x.fila}: ${escHtml(x.detalle)}</li>`).join('')+
      (items.length>50?`<li>… y ${items.length-50} más.</li>`:'')+'</ul></div>';
  };
  html+=listar('Sin trabajador que coincida',a.sinCoincidencia);
  html+=listar('Sin fecha u hora legible',a.sinFechaHora);
  html+=listar('Tipo no reconocido',a.tipoDesconocido);
  if(a.duplicados.length){
    html+=`<div style="margin-top:10px"><b>Repetidas en el mismo archivo</b>: ${a.duplicados.length}. Se guarda la primera de cada una.</div>`;
  }
  html+='</div></details>';
  return html;
}

// ---------- paso 2: guardar, solo si se pulsó Importar
async function importarMarcajesExcel(){
  const msg=document.getElementById('marcajesExcelMsg');
  const prev=document.getElementById('marcajesExcelPreview');
  const btn=document.getElementById('btnImportarMarcajes');
  const a=marcajesPendientesDeImportar;
  if(!a||!a.validas.length){
    msg.innerHTML='<small class="gpsWarn">Primero revisa el archivo con "Revisar archivo".</small>';
    return;
  }
  if(!exigirPermiso('tarja.excel','No tienes permiso para cargar marcajes desde Excel.'))return;

  // Se va por lotes: un reporte de un mes con reloj son miles de filas,
  // y mandarlas de una sola vez se cae o se queda sin memoria.
  const LOTE=200;
  let guardadas=0,actualizadas=0;
  const {data:previos}=await window.supabaseClient.from('marcajes')
    .select('code,fecha,tipo,hora').gte('fecha',a.validas[0].fecha).lte('fecha',a.validas[a.validas.length-1].fecha);
  // Se guarda la hora que YA tiene cada marcaje, no solo que existe.
  // Si no, volver a subir el mismo archivo informaría "66 corregidos"
  // aunque no haya cambiado nada, y el aviso deja de servir.
  const yaHay=new Map();
  (previos||[]).forEach(m=>yaHay.set(m.code+'|'+m.fecha+'|'+m.tipo,m.hora));

  for(let i=0;i<a.validas.length;i+=LOTE){
    const trozo=a.validas.slice(i,i+LOTE);
    const {data:sesion}=await window.supabaseClient.auth.getSession();
    const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
    const filas=trozo.map(v=>{
      return{
        code:v.code,fecha:v.fecha,hora:v.hora,tipo:v.tipo,
        origen:'excel',
        nota:'Excel '+(a.archivo?a.archivo.name:'')+' ('+v.como+')',
        registrado_por:miId,
        registrado_por_nombre:miNombrePerfil()
      };
    });
    const {error}=await window.supabaseClient.from('marcajes').upsert(filas,{onConflict:'code,fecha,tipo'});
    if(error){
      btn.disabled=false;
      const archivo=migracionQueFalta(error);
      msg.innerHTML=archivo
        ?'<div class="gpsWarn">Falta la migración '+archivo+'. Ejecútala en el SQL Editor de Supabase y vuelve a intentar. Se guardaron '+guardadas+' de '+a.validas.length+' antes de cortar.</div>'
        :'<div class="gpsWarn">No se pudo guardar: '+escHtml(error.message)+'. Se guardaron '+guardadas+' de '+a.validas.length+'.</div>';
      await loadMarcajesDia();
      renderDiaria();
      return;
    }
    // Se separa lo nuevo de lo que de verdad cambia: un marcaje que ya
    // existe con la MISMA hora no es una corrección, y contarlo como tal
    // haría que reimportar el mismo archivo siempre anunciara cambios.
    const nuevos=filas.filter(f=>!yaHay.has(f.code+'|'+f.fecha+'|'+f.tipo)).length;
    const corregidos=filas.filter(f=>{
      const clave=f.code+'|'+f.fecha+'|'+f.tipo;
      const previa=yaHay.get(clave);
      return previa!==undefined&&previa!==f.hora;
    }).length;
    guardadas+=nuevos;
    actualizadas+=corregidos;
    // Se anotan las horas guardadas: si el mismo archivo trae la misma
    // fila dos veces, el conteo no la suma dos veces.
    filas.forEach(f=>yaHay.set(f.code+'|'+f.fecha+'|'+f.tipo,f.hora));
    msg.innerHTML='<small>Guardando… '+Math.min(i+LOTE,a.validas.length)+' de '+a.validas.length+'</small>';
  }

  // La entrada también se refleja como X en la tarja del día, que es lo
  // que verá el supervisor el mes que viene.
  const entradasPorDia=new Map();
  a.validas.filter(v=>v.tipo==='entrada').forEach(v=>{
    if(!entradasPorDia.has(v.fecha))entradasPorDia.set(v.fecha,[]);
    entradasPorDia.get(v.fecha).push(v);
  });
  let enTarja=0;
  for(const [fecha,items] of entradasPorDia){
    const filas=items.map(v=>({code:v.code,date:fecha,estado:'X',hora_llegada:v.hora,nota:'Marcaje importado del reloj',origen:'importado'}));
    const {error}=await window.supabaseClient.from('asistencia').upsert(filas.map(attToDb),{onConflict:'code,fecha'});
    if(!error)enTarja+=filas.length;
  }

  // Queda registro de qué se cargó, para poder auditarlo después.
  await window.supabaseClient.from('marcajes_importaciones').insert({
    archivo_nombre:a.archivo?a.archivo.name:'',
    total_filas:totalDeFilas(a),
    guardadas,actualizadas,
    sin_coincidencia:a.sinCoincidencia.length,
    descartadas:a.sinFechaHora.length+a.tipoDesconocido.length,
    sin_fecha_o_hora:a.sinFechaHora.length,
    observaciones:'Sin coincidencia: '+a.sinCoincidencia.length+
      '; sin fecha/hora: '+a.sinFechaHora.length+
      '; tipo no reconocido: '+a.tipoDesconocido.length,
    importado_por_nombre:miNombrePerfil(),
    detalle:JSON.stringify({
      sin_coincidencia:a.sinCoincidencia.slice(0,200),
      sin_fecha_o_hora:a.sinFechaHora.slice(0,200),
      tipo_desconocido:a.tipoDesconocido.slice(0,200)
    })
  });

  btn.disabled=true;
  marcajesPendientesDeImportar=null;
  prev.innerHTML='';
  msg.innerHTML=`<div style="border:1px solid var(--accent);border-radius:8px;padding:10px 12px;background:rgba(46,125,50,.07)">
    <b>Listo.</b> ${guardadas} marcaje(s) nuevos${actualizadas?` y ${actualizadas} corregido(s)`:''}.
    ${!guardadas&&!actualizadas?'<br><small>No había nada nuevo: todo ya estaba igual.</small>':''}
    <br><small>La entrada se reflejó como <b>X</b> en la tarja de ${enTarja} día(s).
    ${a.sinCoincidencia.length?`Quedaron ${a.sinCoincidencia.length} fila(s) sin coincidencia (mira el detalle de arriba).`:''}</small></div>`;
  await Promise.all([loadMarcajesDia(),loadAttendanceFromDB()]);
  renderDiaria();
  renderMatrix();
}
function totalDeFilas(a){
  return a.validas.length+a.sinCoincidencia.length+a.sinFechaHora.length+a.tipoDesconocido.length;
}


async function initDiaria(){
  const sel=document.getElementById('supDiariaSup');
  if(sel){
    const sups=supervisoresActivos();
    if(miCodigoSupervisor){
      sel.innerHTML=`<option value="${escHtml(miCodigoSupervisor)}">${escHtml((workers.find(w=>w.code===miCodigoSupervisor)||{}).name||'')}</option>`;
      sel.value=miCodigoSupervisor;
      sel.disabled=true;
    }else{
      sel.disabled=false;
      const visSel=codigosVisibles(sups);
  sel.innerHTML=sups.map(s=>`<option value="${escHtml(s.code)}">${escHtml(etiquetaSupervisor(s,visSel))}</option>`).join('');
      if(sups[0])sel.value=sups[0].code;
    }
  }
  const f=document.getElementById('diariaFecha');
  if(f&&!f.value)f.value=fechaDiaria;
  await loadMarcajesDia();          // ya dispara loadAsistenciaDelDia
  await loadAvisosDia();
  await loadAvisosIngresoDia();
  renderDiaria();
  renderConciliacion();
  renderAvisosIngresoEnviados();
  // Las pestañas se inician acá y no en un arranque aparte: si la lista cambia
  // al cambiar de supervisor o de fecha, tienen que seguir andando, y eso ya
  // pasa porque se vuelve a llamar.
  initPestanasSup();
}
async function verAvisosDelTrabajador(code){
  const w=workers.find(x=>x.code===code);
  if(!w)return;
  const ent=marcajeDe(code,'entrada');
  const sal=marcajeDe(code,'salida');
  const propios=avisosMarcaje.filter(a=>a.code===code);
  if(!ent&&!sal){
    const hora=prompt(`¿A qué hora fichó ${w.name}?`,hhmmActual());
    if(hora===null)return;
    if(!/^\d{1,2}:\d{2}$/.test(hora.trim())){alert('Escribe la hora como HH:MM.');return;}
    const m=await registrarMarcaje(code,'entrada','manual',null,hora.trim());
    if(!m)return;
    const avisos=revisarAlertas(w,hora.trim());
    await guardarAvisos(code,m,avisos);
    await loadAvisosDia();
    renderDiaria();
    abrirAvisoMarcaje(w,{tipo:'entrada',hora:hora.trim(),marcaje:m,avisos});
    return;
  }
  const suyas=propios.map(a=>({
    icono:a.tipo_alerta==='atraso'?'⏰':a.tipo_alerta==='social'?'💬':'🦺',
    titulo:a.mensaje.split(':')[0]||'Aviso',
    texto:escHtml(a.mensaje.split(':').slice(1).join(':').trim()),
    donde:a.tipo_alerta==='atraso'?'Administración':a.tipo_alerta==='social'?'Asistente Social':'Prevención'
  }));
  abrirAvisoMarcaje(w,{entrada:ent,salida:sal,yaCompleto:!!(ent&&sal)});
  if(suyas.length){
    document.getElementById('marcajeLista').innerHTML+=suyas.map(a=>
      `<div class="mkAviso"><div class="mkAvisoIcono">${a.icono}</div><div><b>${escHtml(a.titulo)}</b><div>${a.texto}</div>
       <div class="mkAvisoDonde">Debe pasar por <b>${escHtml(a.donde)}</b></div></div></div>`).join('');
  }
}
async function marcarAvisosAtendidos(code){
  const sinVer=avisosMarcaje.filter(a=>a.code===code&&!a.visto);
  if(!sinVer.length)return;
  const {data:sesion}=await window.supabaseClient.auth.getSession();
  const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
  const {error}=await window.supabaseClient.from('avisos_marcaje')
    .update({visto:true,visto_por:miId,visto_at:new Date().toISOString()})
    .eq('code',code).eq('fecha',fechaDiaria).eq('visto',false);
  if(error){console.warn('No se pudieron marcar los avisos como atendidos:',error.message);return;}
  sinVer.forEach(a=>{a.visto=true;});
}
function cerrarAvisoMarcaje(){
  document.getElementById('marcajeModal').classList.remove('open');
  const code=modalCtx?modalCtx.code:'';
  modalCtx=null;
  marcarAvisosAtendidos(code).then(()=>renderDiaria());
}

// ============================================================
// TARJA DE SUPERVISORES
// Un supervisor ve solo a la gente que tiene a cargo. Para saber
// cuál es su equipo hace falta vincular su usuario del sistema con su
// ficha: perfiles.trabajador_code (migración 015).
// Quien no esté vinculado (RRHH, administración) sigue viendo todos los
// equipos, porque para eso tiene el permiso de edición.
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
  const equipo=equipoDe(supCode);
  if(!equipo.length){area.innerHTML='<small>Este supervisor no tiene trabajadores asignados.</small>';return;}
  // modo "supervisores": al hacer clic en un día se abre el modal de solicitud
  area.innerHTML=buildMatrixHtml(y,m,equipo,'supervisores');
  if(typeof marcarTarjaSoloLectura==='function')marcarTarjaSoloLectura();
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
function buildMatrixHtml(y,m,lista,modo){
  modo=modo||'normal';
  const nd=daysInMonth(y,m);
  const workedWeeks=buildWorkedWeeks();
  const recordsByDay=new Map(attendance.map(record=>[`${record.code}|${record.date}`,record]));
  let html='<table><tr><th>Código</th><th>Trabajador</th>';
  for(let d=1;d<=nd;d++)html+=`<th>${d}</th>`;
  html+='<th>Días trab. (base 30)</th><th>Días efectivos</th><th>Días lluvia (LL)</th><th>Días reales trabajados</th><th>Lic./Acc. (L,A)</th><th>Inasist. (F,P)</th></tr>';
  html+='<tr><td></td><td><i>Día</i></td>';
  for(let d=1;d<=nd;d++){
    const dow=new Date(y,m-1,d).getDay();
    const fer=isFeriado(y,m,d);
    const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html+=`<td class="${fer?'day-feriado day-label-holiday':'day-lab'}" style="cursor:pointer" onclick="toggleDay('${iso}')" title="Click para alternar laborable/feriado"><small>${diaSemanaLetra[dow]}</small></td>`;
  }
  html+='<td colspan="6"></td></tr>';
  lista.forEach(w=>{
    html+=`<tr><td class="attendance-code-column">${escHtml(codigoMostrar(w.code))}</td><td>${escHtml(w.name)}</td>`;
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
      const cellClass=['attendance-cell',holiday?'day-feriado':'day-lab',est?`state-${est.toLowerCase()}`:'',autoHoliday?'day-auto-attendance':'',holiday&&est==='X'?'day-compensatory-x':''].filter(Boolean).join(' ');
      const encodedCode=encodeURIComponent(w.code).replace(/'/g,'%27');
      // modo "supervisores" abre el modal de solicitud; el resto, el editor directo
      const abrir=modo==='supervisores'?'abrirModalSolicitud':'editAttendanceCell';
      const tip=modo==='supervisores'
        ? (holiday&&est==='X'?'X en feriado (día compensado) — clic para solicitar un cambio':'Clic para solicitar un cambio de estado')
        : (holiday&&est==='X'?'X en feriado: día compensado':'Clic para editar el estado');
      html+=`<td class="${cellClass}" data-code="${encodedCode}" data-date="${iso}" data-state="${rec?rec.estado:''}" data-auto="${autoHoliday}" onclick="${abrir}(this)" title="${tip}">${est}</td>`;
    }
    const diasReales=cX;
    const diasEfectivos=cX+cHolidayX+cV+cPP+cLL;
    const diasTrabajadosCrudo=cX+cHolidayX+cV+cPP+cLL;
    const diasTrabajadosBase30=Math.round(diasTrabajadosCrudo/nd*30);
    html+=`<td>${diasTrabajadosBase30}</td><td>${diasEfectivos}</td><td>${cLL}</td><td>${diasReales}</td><td>${cL+cA}</td><td>${cF+cP}</td></tr>`;
  });
  html+='</table>';
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
  const base=workers.filter(worker=>(!supervisorCode||worker.supervisor_code===supervisorCode)&&(!workerCode||worker.code===workerCode));

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
// ===================================================================
//
// POR QUÉ ANTES NO SE CONSERVABA EL FORMATO
//
// La versión anterior leía el portapapeles con clipboard.readText(), que
// devuelve el texto PLANO. El texto plano de un documento de Word no
// tiene fuente, ni color, ni bordes de tabla, ni sangrías: solo las
// palabras. Por eso el papel salía como una lista de líneas.
//
// Para conservar el formato hay que leer el otro formato del
// portapapeles: text/html. Cuando se copia de Word, el portapapeles
// lleva las DOS cosas — el texto plano y el HTML con el formato — y el
// HTML es el que tiene la fuente, el color y las tablas.
//
// El HTML de Word es sucio: estilos en línea, clases que no existen, y
// a veces <o:p> de Word con atributos raros. Se limpia, pero se conserva
// lo que se ve.
//
// QUÉ SE CONSERVA Y QUÉ NO
//
//   Se conserva: fuente, tamaño, negrita, cursiva, subrayado, color del
//                texto y del fondo, alineación, sangría, bordes de tabla,
//                ancho de columnas, imágenes.
//   No se conserva: el tamaño de página, los márgenes, la orientación, los
//                números de página. Esos son del documento, no del
//                contenido, y el papel se imprime con el tamaño que el
//                sistema usa para todos.
//
// LA RAZÓN DE SER DE TODO ESTO
//
// La alternativa es editar la plantilla en la pantalla. Funciona, pero es
// escribir un documento de inducción de tres páginas dentro de un cuadro
// de texto. La persona que tiene que hacerlo conoce Word, y no el editor
// de una aplicación web.
//
// El camino que corresponde es: bajar la plantilla, abrirla en Word,
// editarla, subirla. Por eso está también la descarga.

// ------------------------------------------------------------------
// LO QUE SE PUEDE PEGAR
// ------------------------------------------------------------------
// Se permite lo que aparece en un papel, y nada que ejecute. La lista es
// cerrada por lo mismo de siempre: el texto viene de un archivo externo,
// se guarda en la base y lo abre cualquiera con la plantilla.
//
// Se nota el cambio con esta versión: ahora se CONSERVAN los estilos en
// línea, y con ellos el color y el fondo. Por eso la lista tiene que
// revisar los atributos: un <span style="..."> es legítimo si el estilo
// solo dice "color" o "negrita", y es un problema si dice
// "position:fixed" o trae un "onclick".
const ETIQUETAS_DE_PAPEL = new Set([
  'p', 'div', 'br', 'hr', 'span', 'b', 'strong', 'i', 'em', 'u', 's',
  'sup', 'sub', 'small', 'big', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'blockquote', 'pre', 'center', 'section', 'article', 'figure',
  'figcaption', 'img', 'a', 'col', 'colgroup', 'mark', 'abbr', 'cite', 'q'
]);

// De los atributos de estilo, solo estos. Los demás se quitan.
//
// La lista NO lleva position, float, z-index, ni nada que mueva la caja:
// en un papel impreso, un texto con position:absolute cae fuera de la
// página y desaparece. Word genera eso en sus encabezados, y el resultado
// sería un papel con la mitad del texto en la basura del sistema.
const ESTILOS_QUE_SE_QUEDAN = [
  'color', 'background-color', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-decoration', 'text-align', 'text-indent',
  'vertical-align', 'line-height', 'letter-spacing', 'width', 'height',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-collapse', 'border-spacing', 'padding', 'padding-top',
  'padding-right', 'padding-bottom', 'padding-left', 'margin-top',
  'margin-bottom', 'white-space'
];

// ------------------------------------------------------------------
// LA LIMPIEZA DEL HTML DE WORD
// ------------------------------------------------------------------
// Se recorre el DOM del HTML pegado y se rehace, dejando solo lo que se
// puede imprimir. No se hace con expresiones regulares sobre una cadena:
// el HTML de Word tiene anidamientos y atributos que un patrón no
// entiende, y un regexp mal hecho deja una etiqueta abierta que se come
// el resto del documento.
function limpiarHtmlDeWord(raiz){
  const salida=document.createElement('div');
  limpiarNodoDeWord(raiz,salida);
  return salida;
}

function limpiarNodoDeWord(origen,destino){
  // Un nodo de texto: se copia su contenido, con el salto de línea que
  // trae. Sin eso, dos renglones del Word se pegan en uno solo.
  if(origen.nodeType===3){
    const texto=origen.nodeValue||'';
    if(!texto.trim()&&!texto.includes('\n'))return;
    destino.appendChild(document.createTextNode(texto));
    return;
  }
  if(origen.nodeType!==1)return;

  const etiqueta=origen.tagName.toLowerCase();

  // El salto de línea de Word: un <br> de Office, o un div vacío que
  // existe solo para separar párrafos.
  if(etiqueta==='br'||(etiqueta==='p'&&!origen.textContent.trim()&&!origen.querySelector('br'))){
    destino.appendChild(document.createElement('br'));
    return;
  }

  // Lo que Word mete y no significa nada: marcas de párrafo, anclas de
  // comentario, xml, y los "shape" de los cuadros de texto.
  if(etiqueta==='o:p'||etiqueta==='xml'||etiqueta.startsWith('o:')
     ||etiqueta==='w:bookmarkstart'||etiqueta==='w:bookmarkend'
     ||etiqueta==='w:sdt'||etiqueta==='w:sdtcontent'||etiqueta==='w:proofErr'
     ||etiqueta==='m:math'||etiqueta==='w:pict'||etiqueta==='v:shape'){
    // Un cuadro de texto de Word tiene el texto adentro: se copia igual,
    // en vez de perderlo.
    for(const hijo of Array.from(origen.childNodes))limpiarNodoDeWord(hijo,destino);
    return;
  }

  // Las imágenes se conservan, pero solo como data URL. Un <img> que
  // apunte a otro sitio no carga en el papel, y deja el ícono de la
  // imagen rota que se ve en la captura que mandó el usuario.
  if(etiqueta==='img'){
    const origen2=origen.getAttribute('src')||'';
    if(!/^data:image\//i.test(origen2))return;
    const nueva=document.createElement('img');
    nueva.setAttribute('src',origen2);
    const alto=origen.getAttribute('height');
    if(alto&&/^\d+$/.test(alto))nueva.setAttribute('height',alto);
    // El ancho en porcentaje de Word no significa lo mismo aquí: se pasa
    // a un máximo, o el logo se estira a toda la página.
    destino.appendChild(nueva);
    return;
  }

  if(!ETIQUETAS_DE_PAPEL.has(etiqueta)){
    // Una etiqueta que no se conoce: se pasa su contenido, que es lo que
    // importa, y se descarta la etiqueta.
    for(const hijo of Array.from(origen.childNodes))limpiarNodoDeWord(hijo,destino);
    return;
  }

  const nueva=document.createElement(etiqueta);
  for(const atributo of Array.from(origen.attributes||[])){
    const nombre=atributo.name.toLowerCase();
    const valor=atributo.value;
    // Los manejadores de eventos: nunca. Un onclick en un papel es un
    // programa corriendo en la máquina de quien lo abre.
    if(nombre.startsWith('on'))continue;
    if(nombre==='style'){
      const estilo=dejarEstiloSeguro(valor);
      if(estilo)nueva.setAttribute('style',estilo);
      continue;
    }
    if(nombre==='href'&&etiqueta==='a'){
      if(/^https?:\/\//i.test(valor))nueva.setAttribute('href',valor);
      continue;
    }
    if(nombre==='src')continue;   // ya se treatable arriba
    // Los nombres de clase de Word ("MsoNormal") no significan nada
    // acá y se ven raros en el papel. Se quitan.
    if(nombre==='class'||nombre==='lang'||nombre==='mso-')continue;
    if(/^xmlns/.test(nombre))continue;
    nueva.setAttribute(nombre,valor);
  }
  for(const hijo of Array.from(origen.childNodes))limpiarNodoDeWord(hijo,nueva);
  destino.appendChild(nueva);
}

// Deja solo las propiedades de estilo que se pueden imprimir.
function dejarEstiloSeguro(css){
  const permitidas=new Set(ESTILOS_QUE_SE_QUEDAN);
  const partes=[];
  for(const trozo of String(css).split(';')){
    const dos=trozo.indexOf(':');
    if(dos<0)continue;
    const propiedad=trozo.slice(0,dos).trim().toLowerCase();
    const valor=trozo.slice(dos+1).trim();
    if(!permitidas.has(propiedad))continue;
    // Se descarta lo que puede sacar el texto de la caja o taparlo.
    if(/expression\s*\(|url\s*\(|javascript:/i.test(valor))continue;
    if(/position\s*:/.test(valor))continue;
    partes.push(propiedad+': '+valor);
  }
  return partes.join('; ');
}

// ------------------------------------------------------------------
// LEER EL PORTAPAPELES, CON FORMATO
// ------------------------------------------------------------------
// Se pide el text/html primero. Si el navegador no lo da, se cae al
// text/plain y se avisa, porque el resultado sin formato es medio
// inutilizable para un documento.
async function leerPortapapelesConFormato(){
  if(!navigator.clipboard||!navigator.clipboard.read){
    return leerPortapapelesComoTexto();
  }
  try{
    const items=await navigator.clipboard.read();
    for(const item of items){
      if(item.types.indexOf('text/html')>=0){
        const blob=await item.getType('text/html');
        const html=await blob.text();
        if(html&&html.trim()){
          return {html,conFormato:true};
        }
      }
    }
    // Estaba el texto plano y nada más: se usa, y se avisa.
    for(const item of items){
      if(item.types.indexOf('text/plain')>=0){
        const blob=await item.getType('text/plain');
        return {html:null,texto:await blob.text(),conFormato:false};
      }
    }
  }catch(error){
    // Sin permiso, o en un contexto que no lo da (http, iframe).
    return leerPortapapelesComoTexto();
  }
  return leerPortapapelesComoTexto();
}

async function leerPortapapelesComoTexto(){
  if(!navigator.clipboard||!navigator.clipboard.readText){
    return {sinAcceso:true};
  }
  try{
    return {html:null,texto:await navigator.clipboard.readText(),conFormato:false};
  }catch(error){
    return {sinAcceso:true};
  }
}

// ------------------------------------------------------------------
// EL BOTÓN
// ------------------------------------------------------------------
// Se lee el portapapeles, se limpia, y se cuentan las variables. Se
// avisa qué pasó con el formato, porque "no se ve igual que en Word" es
// la pregunta que va a salir de todas maneras.
async function importarPlantillaDesdeWord(){
  if(!lecturaPegadaLista){
    alert('Este navegador todavía no dejó leer el portapapeles.\n\n'
      +'Chrome y Edge lo piden la primera vez. Si no aparece la pregunta, '
      +'el navegador lo está bloqueando: recargá la página y apretá de nuevo.');
    return;
  }
  const leido=await leerPortapapelesConFormato();
  if(leido.sinAcceso){
    alert('No se pudo leer el portapapeles.\n\n'
      +'Chrome lo permite solo en páginas seguras. Si estás en http, no deja: '
      +'abrí la app por https, o pegá con Ctrl+V directo en el editor.');
    return;
  }
  if(leido.conFormato){
    aplicarHtmlPegado(leido.html,true);
    return;
  }
  if(!String(leido.texto||'').trim()){
    alert('El portapapeles está vacío.\n\nCopiá primero el contenido del documento de Word.');
    return;
  }
  // Sin formato. Se avisa ANTES, porque el resultado va a ser feo y
  // conviene que la persona lo sepa ahora y no después de escribir.
  const sigue=confirm(
    'Del portapapeles solo se pudo leer el TEXTO, no el formato.\n\n'
    +'Eso pasa cuando el documento se copió de una página web, o cuando el '
    +'navegador no deja leer el formato. El papel va a salir sin fuente, '
    +'sin color y sin bordes de tabla.\n\n'
    +'Para conservar el formato: abrí el archivo en Word de verdad, '
    +'seleccioná todo con Ctrl+A y copiá con Ctrl+C.\n\n'
    +'¿Pegar igual así?');
  if(!sigue)return;
  aplicarTextoPegado(leido.texto);
}

// El camino con formato.
function aplicarHtmlPegado(html,aviso){
  // Se arma un documento aparte para poder recorrerlo sin que el navegador
  // lo pinte en pantalla mientras se limpia.
  const contenedor=document.createElement('div');
  contenedor.innerHTML=String(html);

  // Lo que Word pone de adorno al principio: el "Comments", los estilos
  // ocultos, el encabezado del archivo. Se limpian por nombre, no a
  // ciegas, porque algunos se llaman "head" y contienen texto real.
  for(const basura of contenedor.querySelectorAll('meta,link,style,script,title')){
    basura.remove();
  }

  const limpio=limpiarHtmlDeWord(contenedor);
  // Se le da la clase de la hoja, para que las tablas tengan bordes y
  // el papel se imprima con márgenes.
  const cuerpo=document.createElement('div');
  cuerpo.className='docx-importado';
  cuerpo.innerHTML=limpio.innerHTML;

  const conversion=convertirVariablesDePlantilla(cuerpo.innerHTML);
  const editor=document.getElementById('plantillaEditor');
  if(!editor){
    alert('No se encontró el editor de la plantilla. Cerrá esta ventana y abrí la plantilla de nuevo.');
    return;
  }
  editor.innerHTML=conversion.html;
  avisarImportacion(conversion,aviso!==false,true);
  avisarVariablesEnPlantilla(conversion);
  try{marcarContenidoCambiado();}catch(error){}
}

// ------------------------------------------------------------------
// LOS AVISOS
// ------------------------------------------------------------------
function avisarImportacion(conversion,conFormato,contar){
  const caja=document.getElementById('plantillaAvisoWord');
  if(!caja)return;
  let n=0;
  if(contar){
    const editor=document.getElementById('plantillaEditor');
    n=editor?(editor.querySelectorAll('p,li,td,th,h1,h2,h3').length||String(conversion.html).split('<').length):0;
  }
  const tablas=(String(conversion.html).match(/<table/gi)||[]).length;
  caja.innerHTML='<div class="aviso-fila" style="margin:6px 0 0">'
    +'<b>Contenido pegado'
    +(conFormato?' con el formato de Word.':'.')
    +'</b> '
    +(contar?n+' párrafo'+(n===1?'':'s')+' ':'')
    +(tablas?tablas+' tabla'+(tablas===1?'':'s')+' ':'')
    +'· <b>'+conversion.encontradas.length+' variable'
      +(conversion.encontradas.length===1?'':'s')+'</b> reconocida'
      +(conversion.encontradas.length===1?'':'s')+'.'
    +(conFormato
      ?'<br><small>Se conservaron la fuente, el color, la alineación y las tablas. '
       +'El tamaño de página y los márgenes no: el papel se imprime con los del sistema.</small>'
      :'<br><small style="color:var(--warn-ink)">Pega con Ctrl+C desde el Word de verdad para '
       +'conservar el formato.</small>')
    +'</div>';
}

// ------------------------------------------------------------------
// RECONOCER LAS VARIABLES
// ------------------------------------------------------------------

const VARIABLES_PLANTILLA = [
  {clave:'nombre',           etiqueta:'Nombre del trabajador',      de:'trabajadores.name'},
  {clave:'nombre_completo',  etiqueta:'Nombre y apellido',           de:'trabajadores.name'},
  {clave:'rut',              etiqueta:'RUT',                          de:'trabajadores.rut'},
  {clave:'codigo',           etiqueta:'Código del trabajador',        de:'trabajadores.code'},
  {clave:'especialidad',     etiqueta:'Oficio o especialidad',        de:'trabajadores.especialidad_clave'},
  {clave:'empresa',          etiqueta:'Nombre de la empresa',         de:'empresa.nombre'},
  {clave:'empresa_rut',      etiqueta:'RUT de la empresa',            de:'empresa.rut'},
  {clave:'centro',           etiqueta:'Centro de costo',              de:'centros_costo.nombre'},
  {clave:'obra',             etiqueta:'Nombre de la obra',            de:'centros_costo.nombre'},
  {clave:'fecha',            etiqueta:'Fecha de hoy',                 de:'la del sistema'},
  {clave:'fecha_ingreso',    etiqueta:'Fecha de ingreso',             de:'trabajadores.fecha_ingreso'},
  {clave:'supervisor',       etiqueta:'Nombre del supervisor',        de:'el que firma'},
  {clave:'spec',            etiqueta:'Cargo',                        de:'trabajadores.cargo'}
];

// ------------------------------------------------------------------
// RECONOCER LAS VARIABLES
// ------------------------------------------------------------------
//
// Se arman tres patrones. Con tres en vez de uno con dos alternativas, el
// código es más legible y cada forma se puede probar sola.
//
// El nombre se normaliza antes de comparar: minúsculas, sin acentos, con
// los guiones bajos convertidos en espacio. Así [NOMBRE], [Nombre] y
// [nombre ] son la misma variable, que es como las escribe la gente.
function normalizarNombreVariable(s){
  return String(s||'')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')   // saca los acentos
    .replace(/[\s-]+/g,' ')            // guiones y espacios son lo mismo
    .trim();
}

// El mapa de nombres aceptados, armado una sola vez. Sin esto, cada
// variable se compararía con 40 cadenas en cada búsqueda.
const aliasVariables=(()=>{
  const m=new Map();
  for(const v of VARIABLES_PLANTILLA){
    const base=normalizarNombreVariable(v.clave);
    m.set(base,v.clave);
    m.set(normalizarNombreVariable(v.etiqueta),v.clave);
    // [nombre_completo] y [nombre completo] tienen que ser lo mismo.
    m.set(base.replace(/_/g,' '),v.clave);
    // "trabajador" a secas, que es como lo escribe la gente.
    if(base==='nombre')m.set('trabajador',v.clave);
    if(base==='nombre_completo'){m.set('nombre y apellido',v.clave);m.set('nombre y apellidos',v.clave);}
  }
  return m;
})();

const PATRONES_VARIABLE=[
  // {{nombre}}, con llaves dobles
  /\{\{\s*([^}]{1,60}?)\s*\}\}/g,
  // [NOMBRE], con corchetes
  /\[\s*([A-Za-zÁÉÍÓÚÑáéíóúñ_ ]{2,60}?)\s*\]/g,
  // {nombre}, con una sola llave
  /\{\s*([A-Za-zÁÉÍÓÚÑáéíóúñ_ ]{2,60}?)\s*\}/g
];

// ------------------------------------------------------------------
// CONVERTIR LAS VARIABLES
// ------------------------------------------------------------------
//
// Se buscan tres formas, que son las que la gente escribe:
//
//     {{nombre}}      con llaves dobles
//     [NOMBRE]        con corchetes y en mayúsculas
//     {nombre}        con una sola llave
//
// Y en las tres, el nombre puede ir con guion bajo o con espacio:
// [NOMBRE_TRABAJADOR] y [NOMBRE TRABAJADOR] son la misma variable.
//
// LO QUE NO SE RECONOCE, Y POR QUÉ NO SE REEMPLAZA IGUAL
//
// Un texto entre corchetes que no sea una variable conocida, como [FIRMA]
// o [SELLO], se deja escrito y se avisa.
//
// Si se reemplazara a ciegas, "el valor es [precio] y el plazo
// [dias]" se convertiría en un hueco invisible en un documento que firma
// un trabajador. Eso es peor que dejarlo escrito: se ve, se corrige, y no
// hay forma de que pase inadvertido.
// Devuelve el HTML con las variables ya en la forma interna, y la lista
// de lo que se reconoció y lo que no, para poder avisar.
function convertirVariablesDePlantilla(texto){
  const html=[];
  const encontradas=[];
  const desconocidas=[];
  let i=0;
  while(i<texto.length){
    // Se busca en los tres patrones por turno sobre el texto entero, y
    // se toma el que empieza antes. Si se hicieran por separado, un
    // {{nombre}} dentro de un tramo con corchetes se pisarían.
    let mejor=null;
    for(const re of PATRONES_VARIABLE){
      re.lastIndex=i;
      const m=re.exec(texto);
      if(m&&(!mejor||m.index<mejor.m.index))mejor={m};
    }
    if(!mejor){
      html.push(escaparParaHTML(texto.slice(i)));
      break;
    }
    if(mejor.m.index>i)html.push(escaparParaHTML(texto.slice(i,mejor.m.index)));
    const crudo=mejor.m[1];
    const clave=aliasVariables.get(normalizarNombreVariable(crudo));
    if(clave){
      html.push('{{'+clave+'}}');
      if(!encontradas.includes(clave))encontradas.push(clave);
    }else{
      html.push(escaparParaHTML(mejor.m[0]));
      if(!desconocidas.includes(crudo))desconocidas.push(crudo);
    }
    i=mejor.m.index+mejor.m[0].length;
  }
  return {html:html.join(''),encontradas,desconocidas};
}

// ------------------------------------------------------------------
// EL TEXTO A HTML
// ------------------------------------------------------------------
//
// Cuando el portapapeles solo trae el texto plano, es decir sin formato.
// Se arma el HTML a mano: párrafos, viñetas y tablas, que es lo que trae
// un documento de Word cuando se copia como texto.
function escaparParaHTML(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function textoAHtml(texto){
  const lineas=String(texto).replace(/\r\n?/g,'\n').split('\n');
  const out=[];
  let enLista=false;
  let enTabla=false;
  let celdaAbierta=false;
  const cerrarLista=()=>{if(enLista){out.push('</ul>');enLista=false;}};
  const cerrarCelda=()=>{if(celdaAbierta){out.push('</td>');celdaAbierta=false;}};
  const cerrarTabla=()=>{cerrarCelda();if(enTabla){out.push('</tbody></table>');enTabla=false;}};

  for(const cruda of lineas){
    const linea=cruda.replace(/\s+$/,'');
    const sinEspacios=linea.trim();
    if(linea.indexOf('\t')>=0&&sinEspacios){
      if(!enTabla){out.push('<table class="docx-tabla"><tbody>');enTabla=true;}
      for(const celda of linea.split('\t')){
        if(celda.trim()==='')continue;
        cerrarCelda();
        const limpia=escaparParaHTML(celda.trim())
          .replace(/^<(?:p|span|div)\b[^>]*>/i,'')
          .replace(/<\/(?:p|span|div)>$/i,'');
        out.push('<td>'+limpia+'</td>');
        celdaAbierta=true;
      }
      continue;
    }
    cerrarTabla();
    if(!sinEspacios){cerrarLista();continue;}
    if(/^<\/?(ul|ol|li)\b/i.test(sinEspacios)){
      if(/^<li/i.test(sinEspacios)){
        if(!enLista){out.push('<ul>');enLista=true;}
        out.push('<li>'+escaparParaHTML(sinEspacios.replace(/^<\/?li[^>]*>/i,'').replace(/<\/li>$/i,''))+'</li>');
        continue;
      }
      cerrarLista();
      out.push(sinEspacios);
      continue;
    }
    const vineta=sinEspacios.match(/^(?:[-\u2022*]\s+|\d+[.)]\s+)/);
    if(vineta){
      if(!enLista){out.push('<ul>');enLista=true;}
      out.push('<li>'+escaparParaHTML(sinEspacios.slice(vineta[0].length))+'</li>');
      continue;
    }
    if(TAG_PERMITIDA.test(sinEspacios)){cerrarLista();out.push(sinEspacios);continue;}
    const conHtml=lineaConHtmlDeWord(sinEspacios);
    if(conHtml!==escaparParaHTML(sinEspacios)){cerrarLista();out.push(conHtml);continue;}
    cerrarLista();
    out.push('<p>'+escaparParaHTML(sinEspacios)+'</p>');
  }
  cerrarLista();
  cerrarTabla();
  return out.join('\n');
}

// El texto pegado a mano, cuando no vino con formato.
function aplicarTextoPegado(texto){
  const html=textoAHtml(String(texto).replace(/\r\n?/g,'\n'));
  const conversion=convertirVariablesDePlantilla(html);
  const editor=document.getElementById('plantillaEditor');
  if(!editor){
    alert('No se encontró el editor de la plantilla. Cerrá esta ventana y abrí la plantilla de nuevo.');
    return;
  }
  editor.innerHTML=conversion.html;
  avisarImportacion(conversion,false,true);
  avisarVariablesEnPlantilla(conversion);
  try{marcarContenidoCambiado();}catch(error){}
}

// ------------------------------------------------------------------
// LOS AVISOS
// ------------------------------------------------------------------
function avisarVariablesEnPlantilla(conversion){
  const caja=document.getElementById('plantillaAvisoVariables');
  if(!caja)return;
  const partes=[];
  if(conversion.encontradas.length){
    partes.push('Reconocidas: '+conversion.encontradas.map((c)=>'{{'+c+'}}').join(', '));
  }else{
    partes.push('<b>No se encontró ninguna variable.</b> Si el documento tiene campos '
      +'para llenar, escríbelos entre corchetes con mayúsculas, como [NOMBRE] o [RUT], '
      +'y volvé a pegar.');
  }
  if(conversion.desconocidas.length){
    partes.push('<b>Sin reconocer (se dejaron tal cual):</b> '
      +conversion.desconocidas.map((c)=>'['+c+']').join(', ')
      +'. Si alguno era un campo para llenar, mirá la lista de variables de abajo.');
  }
  caja.innerHTML='<div class="aviso-fila" style="margin:6px 0 0">'+partes.join('<br>')+'</div>';
}

// La lista de variables, siempre a la vista mientras se pega.
// ===================================================================
// BAJAR LA PLANTILLA EN WORD
// ===================================================================
//
// EL CAMINO QUE CORRESPONDE
//
// La plantilla se escribe en Word, no en esta pantalla. El técnico de
// Prevención tiene el documento que le pasó la mutual, con su formato, sus
// tablas y su logo. Si hay que copiar eso a un cuadro de texto, se pierde
// el formato y se pierde el tiempo.
//
// El camino es al revés: bajar el documento, abrirlo en Word, editarlo,
// subirlo. Esto arma un .doc que Word abre y conserva el formato.
//
// POR QUÉ UN .doc Y NO UN .DOCX
//
// Un .docx es un ZIP con el documento adentro, con un formato binario
// interno que no se puede escribir a mano. Un .doc, en cambio, es HTML con
// la extensión cambiada, y Word lo abre sin preguntar nada. Se escribe en
// un segundo, con lo que ya hay, y abre igual.
//
// La diferencia se nota si después se guarda como .docx desde Word, que es
// lo normal: ahí el archivo ya es un Word de verdad.
//
// LO QUE CONTIENE
//
//   - El contenido de la plantilla, con el formato que tiene ahora.
//   - La lista de variables con su significado, arriba, para que la
//     persona sepa qué puede escribir.
//   - El pie con la explicación de cómo se reimporta.
//
// LO QUE NO HACE
//
// No baja el documento con los datos de un trabajador. Se baja vacío: la
// plantilla es la que se edita. Los datos se ponen al generar el papel.

function descargarPlantillaWord(){
  const editor=document.getElementById('plantillaEditor');
  if(!editor)return;
  const nombre=document.getElementById('plantillaNombre').value.trim()||'plantilla';
  const codigo=document.getElementById('plantillaCode').value.trim()||'SIN-CODIGO';
  const tipo=document.getElementById('plantillaTipo').value||'charla';
  const firmas=document.getElementById('plantillaFirmas').value||'trabajador_supervisor';

  // El contenido va primero, con su formato.
  let cuerpo=editor.innerHTML;
  if(!htmlTieneTexto(cuerpo)){
    alert('La plantilla está vacía. No hay nada que bajar.\n\n'
      +'Podés pegar el contenido de un documento de Word y después bajarlo acá.');
    return;
  }

  // La lista de variables, arriba, en una tabla. Es lo que la persona
  // necesita para saber qué escribir y no inventarse los nombres.
  const filas=VARIABLES_PLANTILLA.map((v)=>
      '<tr>'
    + '<td><b>{{'+escHtml(v.clave)+'}}</b></td>'
    + '<td>'+escHtml(v.etiqueta)+'</td>'
    + '<td><small>'+escHtml(v.de)+'</small></td>'
    + '</tr>').join('');

  // Y las tres formas de escribir, que es donde la gente se enreda.
  const ayuda =
      '<h2 style="color:#b54852;font-size:15pt">Cómo escribir los datos del trabajador</h2>'
    + '<p>Donde vaya un dato del trabajador, poné el nombre de la variable. '
    +'Sirve cualquiera de estas tres formas, y no importa si va en mayúsculas, '
    +'minúsculas, con guion bajo o con espacio:</p>'
    + '<ul>'
    + '<li><b>{{nombre}}</b> — con dos llaves</li>'
    + '<li><b>[NOMBRE]</b> — con corchetes, en mayúsculas (la más fácil de leer)</li>'
    + '<li><b>{nombre}</b> — con una sola llave</li>'
    + '</ul>'
    + '<p>Si ponés algo entre corchetes que NO está en la lista, se deja escrito '
    +'tal cual y te aviso cuál fue, para que puedas corregirlo. No se reemplaza a '
    +'ciegas, porque en un papel que firma un trabajador un hueco invisible es '
    +'peor que un texto.</p>';

  const tablas =
      '<h2 style="font-size:15pt">Variables disponibles</h2>'
    + '<table border="1" cellspacing="0" cellpadding="4" width="100%">'
    + '<tr style="background:#eee"><th>Se escribe</th><th>Qué es</th>'
    + '<th>De dónde sale</th></tr>'
    + filas
    + '</table>';

  const pie =
      '<hr>'
    + '<p><small>Este documento se edita en Word, con todo el formato a mano. '
    +'Cuando termines: seleccioná todo (Ctrl+A), copiá (Ctrl+C), y en la '
    +'aplicación abrí esta misma plantilla y apretá <b>Pegar desde Word</b>. '
    +'Se conserva el formato.</small></p>';

  const completo =
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
    + '<title>'+escHtml(nombre)+'</title>'
    // El estilo de página va aquí, no en el cuerpo: es lo que Word lee
    // para armar el .doc. Sin esto abre en el tamaño por omisión, que no
    // es el de una carta.
    + '<style>'
    + 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:2cm}'
    + 'table{border-collapse:collapse}'
    + 'h1{font-size:18pt}h2{font-size:15pt}'
    + '</style>'
    + '</head><body>'
    + '<p><small>Plantilla: <b>'+escHtml(codigo)+'</b> · '+escHtml(tipo)
    + ' · firma: '+escHtml(firmas)+'</small></p>'
    + '<hr>'
    + '<h1>'+escHtml(nombre)+'</h1>'
    + '<p><small>Acá va el contenido del documento. Reemplazalo por el del '
    +'formulario real y borra esta línea, la de la ayuda y la tabla de '
    +'variables antes de importarlo.</small></p>'
    + cuerpo
    + '<h1>--- LO SIGUIENTE ES AYUDA, BORRALO ---</h1>'
    + ayuda
    + tablas
    + pie
    // ----------------------------------------------------------------
    // POR QUÉ ESTAS DOS LÍNEAS ESTÁN PARTIDAS EN DOS
    // ----------------------------------------------------------------
    // Aquí se cierra el documento de Word. Se vería más limpio escribir la
    // etiqueta de cierre del cuerpo y la del documento enteras, una sola
    // línea. Y así estaba.
    //
    // Rompía la aplicación completa, y solo en algunos equipos, que es lo
    // que lo hace especialmente bueno para volver a pasar.
    //
    // El navegador, adentro de un script, busca el cierre del script. La
    // etiqueta de cierre del cuerpo, escrita dentro de una cadena, no le
    // hace nada: la ve como texto y sigue. Por eso el archivo funcionaba
    // cuando se abría del disco o lo servía cualquier otro servidor.
    //
    // Live Server —el que recarga la página al guardar, y el que sirve el
    // archivo en el 127.0.0.1:5500— no funciona así. Ese lee el archivo
    // como texto plano, busca el PRIMER cierre de cuerpo que encuentra, y
    // mete ahí su propio script de recarga. El primero no era el del
    // documento: era este, que estaba escrito en JavaScript.
    //
    // Entonces le cayó código en medio del script. El comentario HTML que
    // inyecta es legal en JavaScript, así que pasó en silencio; el script
    // que le seguía no es nada válido, y ahí reventó con:
    //
    //     Uncaught SyntaxError: Invalid or unexpected token
    //
    // Un error de sintaxis tumba el script ENTERO. Por eso no había menú,
    // ni reloj, ni nada: todo había dejado de correr.
    //
    // La forma de evitarlo es no tener nunca el cierre de cuerpo escrito
    // entero en el archivo. Se arma pegando dos partes: una con el signo
    // menor y otra con el nombre de la etiqueta. Ninguna de las dos tiene
    // el cierre completo, así que Live Server no encuentra nada que
    // inyectarle. El .doc que se descarga queda idéntico: Word lo abre igual.
    + '<'+'/body>'
    + '<'+'/html>';

  // Se arma un Blob con tipo MIME de Word. El nombre lleva el código,
  // que es lo que después se reconoce al reimportarlo.
  const blob=new Blob(['\ufeff'+completo],{type:'application/msword;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=codigo+'.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // La URL se libera después de un instante: si se suelta de inmediato,
  // en algunos navegadores la descarga arranca antes de que el archivo
  // se haya leído, y baja vacío.
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}

// ------------------------------------------------------------------
// IR A CREAR UNA ESPECIALIDAD
// ------------------------------------------------------------------
// El selector de especialidad del trabajador salía vacío y no había forma
// de agregar una desde ahí. La sección que las crea existe, pero está en
// Bodega → KITS → "Administrar kits por especialidad", y quien está
// cargando trabajadores no la va a buscar ahí: va a mirar el campo de
// especialidad del trabajador, que es donde la necesita.
//
// El enlace abre esa sección y deja el cursor en el campo del nombre. Así
// la persona no tiene que saber dónde está: sólo tipear lo que falta.
function irACrearEspecialidad(event){
  if(event)event.preventDefault();
  if(!exigirPermiso('bodega.kits','No tienes permiso para crear especialidades.'))return;
  const nombre=document.getElementById('w-name');
  const cargo=document.getElementById('w-spec');
  const yaDice=String((nombre&&nombre.value)||(cargo&&cargo.value)||'').trim();
  // Se lleva el texto como sugerencia, no como nombre. El cargo es
  // "Maestro Albañil" y la especialidad es "Albañil": con el cargo entero
  // se crea una especialidad que después nadie usa, porque ningún otro
  // trabajador se llama igual.
  const palabras=yaDice.split(/\s+/).filter((x)=>x.length>2);
  const sugerido=palabras.length?palabras[palabras.length-1]:'';
  showGroup('bodega');
  showView('bodega-kits-admin');
  // Se espera: la vista carga sus datos antes de que exista el campo donde
  // escribir. Sin la espera, el foco se pierde y el cursor queda en
  // cualquier parte, que es lo que hace que parezca que no funciona.
  setTimeout(()=>{
    const campo=document.getElementById('esp-nombre');
    if(!campo)return;
    if(sugerido&&!campo.value.trim()){
      campo.value=sugerido.charAt(0).toUpperCase()+sugerido.slice(1);
    }
    campo.focus();
    alert('Escribí el nombre de la especialidad y apretá "Crear".\n\n'
      +'La especialidad es de toda la empresa: le va a tocar a todos los '
      +'trabajadores de ese oficio, ahora y después.\n\n'
      +'Para volver al formulario del trabajador, apretá "Trabajadores" en el menú.');
  },500);
}

function pintarListaVariables(){
  const caja=document.getElementById('plantillaListaVariables');
  if(!caja)return;
  const abierta=caja.style.display!=='none';
  caja.style.display=abierta?'none':'';
  if(abierta)return;
  caja.innerHTML='<table><thead><tr><th>Se escribe</th><th>Qué es</th>'
    +'<th>De dónde sale</th></tr></thead><tbody>'
    +VARIABLES_PLANTILLA.map((v)=>'<tr>'
      +'<td><code title="Apretá para ponerla en el texto">{{'+escHtml(v.clave)+'}}</code></td>'
      +'<td>'+escHtml(v.etiqueta)+'</td>'
      +'<td><small>'+escHtml(v.de)+'</small></td></tr>').join('')
    +'</tbody></table>'
    +'<small>También sirve escribirlo entre corchetes con mayúsculas, [NOMBRE], '
    +'o con una sola llave, {nombre}.</small>';
  // El código de cada variable va con clic para insertarlo en el texto,
  // para quien no quiere acordarse de los nombres.
  caja.querySelectorAll('code').forEach((c)=>{
    c.style.cursor='pointer';
    c.addEventListener('click',()=>{
      insertarVariableEnPlantilla(c.textContent.replace(/[{}]/g,''));
    });
  });
}

// Poner una variable en el cursor, con un clic. Para quien no quiere
// acordarse de los nombres.
function insertarVariableEnPlantilla(clave){
  const editor=document.getElementById('plantillaEditor');
  if(!editor)return;
  const texto='{{'+clave+'}}';
  // execCommand está obsoleto y sigue siendo la única forma de insertar
  // en el punto del cursor sin reescribir el contenido entero y perder el
  // cursor. Se usa dentro de un try: si el navegador ya no lo soporta, se
  // avisa en vez de fallar en silencio.
  try{
    editor.focus();
    if(!document.execCommand('insertText',false,texto)){
      throw new Error('no');
    }
  }catch(error){
    alert('Este navegador no deja escribir en el cursor.\n\nPegá la variable a mano: {{'+clave+'}}');
  }
  try{marcarContenidoCambiado();}catch(e){}
}

// Si el navegador no deja leer el portapapeles, el botón lo dice al
// apretarlo en vez de no hacer nada. Se consulta una vez al cargar.
let lecturaPegadaLista=false;
function comprobarLecturaPegada(){
  if(!navigator.clipboard||!navigator.clipboard.readText){
    lecturaPegadaLista=false;
    return;
  }
  // No se puede preguntar permiso sin preguntar: pedirlo al cargar asusta
  // con un cartel que nadie entiende. Se marca disponible y se pregunta
  // recién cuando la persona aprieta el botón.
  lecturaPegadaLista=true;
}

// ============================================================
// ROLES Y PERMISOS
// Un usuario puede tener varios roles; cada rol tiene un conjunto
// de permisos editables. La interfaz se arma según lo que la
// persona tenga permitido, y las acciones sensibles se bloquean.
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
// LOS MARCAJES DE HOY, PARA EL TÓTEM
// -------------------------------------------------------------------
// Aparte de la variable "marcajes" de la planilla, y POR PROPOSITO, no por
// descuido:
//
// La "marcajes" la llena "loadMarcajesDia()", que es la que corre al abrir la
// PESTAÑA de la planilla del día, y pide 60 días. El tótem no puede pedir 60 días
// en una portería para pintar un número que es de HOY. Y si compartieran variable,
// abrir la planilla pisaría lo del tótem con 60 días y abrir el tótem la dejaría
// con un día: cada pantalla con lo suyo.
//
// -------------------------------------------------------------------
// Y POR QUÉ ANTES NO SALÍAN, Y POR QUÉ NO SE PREGUNTABA NADA
// -------------------------------------------------------------------
// Antes los tres números se contaban sobre "marcajes", que solo se llena al abrir
// la pestaña de la planilla. El tótem es otra pantalla: se abre con "abrirTotem()",
// y esa función no cargaba marcajes.
//
// O sea que los números salían solo si alguien, ANTES de ir a la portería, había
// abierto la planilla del día. En un aparato de la portería eso no pasa nunca.
//
// El código viejo lo decía sin ver la consecuencia: "se cuentan sobre lo que YA
// está cargado en la memoria, y no con una consulta nueva. La razón no es ahorrar:
// es que la pantalla del reloj se abre en la portería, muchas veces al mismo
// tiempo, y una consulta por cada marcaje y por cada reloj abierto es exactamente
// lo que hace que un aparato viejo se ponga lento."
//
// Lo que dice es cierto: una consulta POR MARCAJE es Mala idea en un aparato viejo.
// Lo que no decía es que "lo que ya está cargado" en la portería es NADA. De ahí
// salía el "—". La diferencia ahora es que hay UNA consulta al abrir, y ninguna
// por marcaje.
//
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
    :'<small>Se genera solo al crear el reloj, y se muestra una sola vez.</small>';
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
// CENTROS DE COSTO
// ------------------------------------------------------------------
// Se dan de alta acá y no por el CSV de trabajadores, porque no son
// trabajadores: son los centros de costo de la obra, y los importa el
// sistema de planillas, no esta app.
async function guardarCentroCosto(){
  const code=document.getElementById('ccCode').value.trim().toUpperCase();
  const nombre=document.getElementById('ccNombre').value.trim();
  const err=document.getElementById('ccError');
  err.textContent='';
  if(!code){err.textContent='Falta el código.';return;}
  if(!nombre){err.textContent='Falta el nombre.';return;}
  const empresa=empresaActual||null;   // empresaActual ya ES el id
  const {error}=await window.supabaseClient.from('centros_costo').insert({code,nombre,empresa_id:empresa});
  if(error){
    err.textContent=/duplicate|unique/i.test(error.message)
      ?'Ya existe un centro de costo con el código "'+code+'" en esta empresa.'
      :'No se pudo guardar: '+error.message;
    return;
  }
  document.getElementById('ccCode').value='';
  document.getElementById('ccNombre').value='';
  await cargarRelojes();
}
function renderCentrosCosto(){
  const box=document.getElementById('ccLista');
  if(!box)return;
  if(!centrosCosto.length){box.innerHTML='<small>No hay centros de costo todavía.</small>';return;}
  box.innerHTML=centrosCosto.map(c=>{
    const usados=relojes.filter(r=>r.centro_costo_id===c.id).length;
    return '<div class="list-item" style="cursor:default">'
      +'<span><b>'+escHtml(c.code)+'</b> — '+escHtml(c.nombre)
      +'<small> · '+(usados?usados+' reloj(es)':'sin relojes')+'</small></span>'
      +'<span>'+(c.activo?'':'<small style="color:var(--warn-ink)">inactivo</small>')+'</span></div>';
  }).join('');
}
function editarReloj(code){
  if(!exigirPermiso('relojes.editar','No tienes permiso para configurar relojes.'))return;
  abrirFormularioReloj(code);
}
// ------------------------------------------------------------------
// EL ESTADO DEL TOKEN, DICHO ANTES DE PREGUNTAR
// ------------------------------------------------------------------
// La pregunta "no encuentro el token del reloj" viene de abrir el formulario
// y ver un campo vacío. Un campo vacío no dice si hay que pegar algo, si ya
// está instalado, o si hay que rotarlo. Con las tres respuestas posibles
// escritas, la persona sabe qué hacer sin preguntar.
// El campo de pegar el token, y el boton de olvidarlo.
//
// ------------------------------------------------------------------
// POR QUE EL CAMPO NO SE RELLENA CON LO QUE HAY GUARDADO
// ------------------------------------------------------------------
// Antes, al abrir esta pantalla el campo de pegar venia con el token que
// ya estaba en el navegador, y el cartel decia "este reloj ya está instalado en
// este navegador".
//
// El problema es que las dos cosas son verdad y las dos enganan. Lo que
// habia ahi podia ser cualquier cosa: en una instalacion de antes de que
// existiera la comprobacion, se guardaba lo que se pegara sin mirar. Quedo
// un id de usuario guardado como si fuera un token de un reloj.
//
// Entonces la persona veia "ya está instalado", apretaba Instalar, y la base
// contestaba "el token es válido pero no es el de este reloj". Sin forma de
// limpiar lo guardado, tampoco habia salida desde la pantalla.
//
// Ahora el campo arranca VACíO, con el ejemplo en el texto de ayuda. Si hay
// algo guardado, el cartel lo dice pero aclarando que no se sabe si es el
// bueno, y hay un boton para borrarlo.
//
// Vacío y no con el ejemplo puesto como valor: un valor de ejemplo es un token
// que no existe, y alguien lo va a instalar sin querer. Como texto de ayuda
// no se puede instalar por accidente.
function pintarEstadoToken(code,instalado){
  const caja=document.getElementById('tokenEstado');
  if(!caja)return;
  const deQuien=document.getElementById('tokenDeQueReloj');
  if(deQuien)deQuien.textContent=code||'(sin elegir)';
  if(instalado){
    caja.innerHTML='<div class="aviso-fila" style="margin:0">'
      +'<b>Hay un token guardado en ESTE navegador para este reloj.</b><br>'
      +'No se sabe si es el correcto: eso solo se comprueba contra la base, y no se '
      +'comprueba solo. Si el reloj marca, no toques nada. Si no marca, o si acabás de '
      +'rotar el token, apretá <b>Olvidar el token guardado</b> y pegá el nuevo.</div>';
    return;
  }
  caja.innerHTML='<div class="aviso-fila" style="margin:0">'
    +'<b>Este reloj NO está instalado en este navegador.</b><br>'
    +'El token no se puede recuperar: en la base queda solo su huella, por '
    +'diseño. Para marcar desde acá hay dos caminos:<br>'
    +'· Si tenés el token anotado, pegalo arriba y presioná <b>Instalar</b>.<br>'
    +'· Si no lo tenés, cerrá esto y presioná <b>Rotar token</b> en la lista de '
    +'relojes. Se muestra una sola vez: copialo antes de cerrar.</div>';
}

// ------------------------------------------------------------------
// OLVIDAR LO GUARDADO
// ------------------------------------------------------------------
// Lo que hay guardado en el navegador no se puede recuperar desde la base,
// y no hay forma de cambiarlo salvo rotando el token. Así que borrarlo desde acá tiene
// que ser fácil: es la salida cuando lo que hay guardado no sirve.
//
// Con la ruta de la portería, que es donde se usa, un token equivocado guardado es un
// reloj que no marca y sin forma de arreglarlo sin ir a la oficina. Por eso
// el boton está al lado del campo y no escondido en un menú. Si estuviera escondido, la
// persona no lo encuentra justo cuando lo necesita.
function olvidarTokenReloj(){
  const code=document.getElementById('tokenRelojCodigo').value;
  if(!code){
    alert('No hay ningún reloj elegido.');
    return;
  }
  if(!totemTokenDe(code)){
    alert('No hay ningún token guardado para el reloj '+code+' en este navegador.');
    return;
  }
  if(!confirm('Borrar el token guardado del reloj '+code+' en ESTE navegador?É\n\n'
    +'Si ese token era el bueno, el reloj deja de marcar desde acá y hay que volver a '
    +'pegarlo. El tótem del aparato no se toca: esto solo es lo que tiene guardado '
    +'este navegador.'))return;
  try{
    localStorage.removeItem('totemToken_'+code);
  }catch(error){
    alert('No se pudo borrar: '+error.message
      +'\n\nSi el navegador está en modo privado, no guarda nada y por lo tanto tampoco hay '
      +'nada que borrar.');
    return;
  }
  const campo=document.getElementById('tokenInstalarCampo');
  if(campo)campo.value='';
  pintarEstadoToken(code,false);
  alert('Listo: se borró lo que tenía guardado el reloj '+code+' en este navegador.\n\n'
    +'Ahora pegá el token bueno y apretá Instalar.');
}

// COPIAR EL TOKEN
// ------------------------------------------------------------------
// El token hay que llevarlo al Android TV Box, que está en otra obra. A mano
// se pierde un carácter, y un token equivocado responde TOKEN_INVALIDO, que
// no dice "te equivocaste al copiar": dice que el reloj no existe, y se
// pierde tiempo buscando el problema en el lugar equivocado.
function copiarTokenReloj(){
  // Primero lo que está pegado, después lo que se mostró. Al revés pasaba lo
  // contrario: quien abría la pantalla, pegaba un token y aprieta Copiar se
  // llevaba el token viejo, que era justo el que ya no servía.
  const v=document.getElementById('tokenInstalarCampo').value.trim()
    ||document.getElementById('tokenValor').value.trim();
  if(!v){
    alert('No hay un token en pantalla para copiar.\n\n'
      +'Si lo perdiste, cerrá esto y presioná "Rotar token" en la lista de relojes.');
    return;
  }
  // La API del portapapeles no funciona sin HTTPS, y esta app se sirve por
  // HTTP en la red de la obra. Se avisa igual, pero se deja el texto
  // seleccionado para que se copie a mano: si no, la persona pierde el token
  // por un requisito del navegador.
  if(!navigator.clipboard||!navigator.clipboard.writeText){
    seleccionarTokenParaCopiar();
    return;
  }
  navigator.clipboard.writeText(v).then(
    ()=>alert('Token copiado.\n\nPegalo en el apartado "Pegar el token" del equipo donde vaya a marcar.'),
    ()=>{
      seleccionarTokenParaCopiar();
      alert('El navegador no dejó copiar solo.\n\nEl token quedó seleccionado: copialo con Ctrl+C.');
    }
  );
}
function seleccionarTokenParaCopiar(){
  const i=document.getElementById('tokenValor');
  i.focus();i.select();
  try{document.execCommand('copy');}catch(error){}
}

function abrirFormularioToken(codePedido){
  // El código que se pasa gana sobre el del selector. Sin esto, apretar
  // "Instalar token" en RELOJ-002 abría el formulario con el RELOJ-001 que
  // estuviera de primero en la lista, y el token se guardaba en el reloj
  // equivocado: el nuevo no marcaba y el viejo sí, que es peor.
  const code=codePedido
    ||document.getElementById('totemReloj').value
    ||(relojes.filter(r=>r.activo)[0]||{}).code;
  if(!code){
    alert('Primero creá un reloj. El token es de un reloj, no de la app.');
    return;
  }
  document.getElementById('tokenRelojCodigo').value=code;
  // El selector queda en ese reloj, para que el texto de abajo no hable de
  // otro mientras se pega el token de este.
  const sel=document.getElementById('totemReloj');
  if(sel&&[...sel.options].some(o=>o.value===code))sel.value=code;
  // Y se muestra el token que YA está instalado en este equipo, para que
  // quien rota vea el estado real en vez de un campo vacío.
  const instalado=totemTokenDe(code);
  // El campo arranca VACIO a proposito.
  //
  // Antes se rellenaba con lo que habia guardado, que es justo el problema:
  // lo guardado puede ser cualquier cosa. Quedo un id de usuario guardado
  // como si fuera el token de un reloj, de una instalacion de antes de que
  // existiera la comprobacion. Entonces la persona veia el campo lleno,
  // apretaba Instalar, y la base decia que no era de este reloj.
  //
  // Vacio, y no con el ejemplo puesto como valor: un valor de ejemplo es un
  // token que no existe, y alguien lo va a instalar sin querer. Como texto
  // de ayuda del campo no se puede instalar por accidente.
  document.getElementById('tokenInstalarCampo').value='';
  pintarEstadoToken(code,!!instalado);
  document.getElementById('dlgToken').showModal();
}
function totemTokenDe(code){
  try{return localStorage.getItem('totemToken_'+code)||'';}
  catch(error){return '';}
}

// ------------------------------------------------------------------
// LA PANTALLA DEL TÓTEM
// ------------------------------------------------------------------
// Se abre aparte del resto de la app, sin el menú de arriba: en un cartel
// fijo de la portería no tiene sentido que se vea la navegación, y un
// botón a medio apretar podría cambiar de vista y dejar el reloj sin
// marcar. Es una pantalla completa con su propio botón de salir.
function abrirTotem(code){
  const r=relojPorCodigo(code);
  if(!r){
    alert('No se encontró el reloj "'+code+'".\n\nRevisá la lista de relojes: el código es el que pusiste al crearlo.');
    return;
  }
  if(!exigirPermiso('relojes.totem','No tienes permiso para usar la pantalla de marcaje.'))return;
  totemActual=r;
  document.body.classList.add('modoTotem');
  document.getElementById('pantallaTotem').classList.add('abierta');
  arrancarHoraTotem();
  arrancarComprobacionConexion();
  const sel=document.getElementById('totemTipo');
  sel.innerHTML=ESTADOS_TARJA_TOTEM.map(t=>`<option value="${t.v}">${escHtml(t.t)}</option>`).join('');
  sel.value=totemTipo;
  ocultarCampoTokenTotem();
  pintarTotemInicial();
  // Y los tres números se piden UNA vez al abrir. Sin "await": el reloj tiene que
  // quedar bloqueado de una vez, y el número puede aparecer un instante después. Si
  // se esperara, la pantalla se quedaría en blanco hasta que la base respondiera, y
  // en una portería con mala conexión eso es una pantalla muerta.
  //
  // Y no se vuelve a preguntar por cada marcaje: cuando marca, el número sube en la
  // memoria. Esa era la razón por la que antes no se consultaba nada, y sigue
  // siendo la razón: lo que cambia es que ahora hay UNA consulta al abrir, y antes
  // no había ninguna.
  cargarMarcajesTotem();
  if(r.tipo_lector==='camara')arrancarCamaraTotem();
  else detenerCamaraTotem();
  // El kiosco se arma acá y no antes: si la cámara no arrancó, el reloj igual
  // tiene que poder bloquearse. Un kiosco que depende de que la cámara
  // funcione es un kiosco que no bloquea en la mitad de los casos.
  activarKiosco();
  // El foco va al campo apenas se abre. Sin esto el lector USB marca la
  // primera vez y las siguientes no: nadie lo va a tocar.
  setTimeout(()=>document.getElementById('totemCampo').focus(),120);
  // Y un vigilante que lo devuelve cada 1,5 s mientras el tótem esté
  // abierto.
  //
  // Un solo listener de "blur" no alcanza, y el síntoma es el peor posible:
  // si el foco se va a un diálogo del navegador, a la barra de direcciones
  // o al autocompletado, NO VUELVE, el lector sigue escribiendo en un campo
  // que no tiene el foco, y el reloj deja de marcar sin que nadie lo note
  // hasta que alguien revisa la asistencia del día.
  //
  // La condición `!campo.value` está a propósito: si la persona está a
  // medio escribir, no se le roba el foco de debajo de la mano.
  if(totemTimerFoco)clearInterval(totemTimerFoco);
  totemTimerFoco=setInterval(()=>{
    if(!totemActual)return;
    const campo=document.getElementById('totemCampo');
    if(campo&&!campo.value&&document.activeElement!==campo)campo.focus();
  },1500);
}
// Los tipos que un tótem registra. "entrada" y "salida" están; la
// colación son los dos semiciclos, porque con un solo tipo el segundo
// fichaje rebotaría contra el índice único de la base.
const ESTADOS_TARJA_TOTEM=[
  {v:'entrada',t:'Entrada'},
  {v:'salida',t:'Salida'},
  {v:'colacion_entrada',t:'Salida a colación'},
  {v:'colacion_salida',t:'Vuelta de colación'}
];
// ------------------------------------------------------------------
// LA HORA, AL CENTRO Y GRANDE
// ------------------------------------------------------------------
// Estaba en la esquina superior derecha, chica. En un cartel de portería,
// colgado a la altura de la cabeza, a dos metros: la hora es lo primero
// que la gente mira para decidir si su marcación fue correcta, y si hay
// que acercarse a leerla, no sirve.
//
// Va centrada y con el segundero parado cuando la lectura es correcta. Es
// el mismo número que se acaba de guardar, y no el del reloj del aparato:
// si los dos difieren, hay que ver los dos, y verlos juntos muestra de
// una dónde está el desfase (casi siempre, en el reloj del aparato).
function pintarHoraTotem(){
  const d=new Date();
  const h=document.getElementById('totemHoraActual');
  if(h)h.textContent=String(d.getHours()).padStart(2,'0')
    +':'+String(d.getMinutes()).padStart(2,'0')
    +':'+String(d.getSeconds()).padStart(2,'0');
  const f=document.getElementById('totemFechaActual');
  if(f)f.textContent=d.toLocaleDateString('es-CL',{weekday:'long',day:'2-digit',month:'long'});
}

// ------------------------------------------------------------------
// LA CONEXIÓN
// ------------------------------------------------------------------
// Tres estados, y se distinguen a propósito:
//
//   CON CONEXIÓN   se puede marcar. Es lo normal.
//   SIN CONEXIÓN   el reloj sigue funcionando: guarda la marcación en el
//                  aparato y la sube cuando vuelve (art. 10 de la
//                  Resolución Exenta 38/2024). La gente tiene que saber
//                  esto, o se va a repetir la marcación cinco veces
//                  pensando que no entró.
//   COMPROBANDO    al abrir, antes de saber. Se muestra un instante.
//
// El icono es un punto de color, no un dibujo: a dos metros y con luz de
// obra, un punto de 14 px se ve y un glifo no. Y lleva texto al lado,
// porque el color solo no sirve para quien no distingue rojo de verde.
let relojConexionTimer=null;
let relojConexionEstado='comprobando';

async function comprobarConexionTotem(){
  marcarConexionTotem('comprobando');
  try{
    // Una consulta mínima. No se usa la de los trabajadores: trae cientos
    // de filas y en una faena sin señal se queda colgada esperando, que es
    // lo que hay que evitar: el reloj tiene que responder igual.
    const {error}=await Promise.race([
      window.supabaseClient.from('marcajes').select('id',{count:'exact',head:true}).limit(1),
      // Si en 4 segundos no responde, es que no hay camino a la base.
      new Promise((r)=>setTimeout(()=>r({error:{message:'timeout'}}),4000))
    ]);
    marcarConexionTotem(error?'sin':'con');
  }catch(e){
    marcarConexionTotem('sin');
  }
}

function marcarConexionTotem(estado){
  relojConexionEstado=estado;
  const caja=document.getElementById('totemConexion');
  if(!caja)return;
  const textos={
    comprobando:['comprobando','var(--muted)'],
    con:['con conexión','var(--accent)'],
    sin:['sin conexión: se guarda y sube después','var(--warn)']
  };
  const par=textos[estado]||textos.comprobando;
  caja.innerHTML='<span class="totem-conexion-punto" style="background:'+par[1]+'"></span>'
    +'<span class="totem-conexion-texto" style="color:'+par[1]+'">'+par[0]+'</span>';
  // Con la señal perdida, el punto late: es la diferencia entre "está ahí"
  // y "está funcionando". Sin parpadeo parece un adorno.
  caja.classList.toggle('latiendo',estado==='sin');
  caja.title=estado==='sin'
    ?'Este reloj no está llegando a la base. La marcación se guarda en el aparato y se sube sola cuando vuelva la señal. No hace falta repetirla.'
    :(estado==='con'?'Conectado con la base.':'');
}

function arrancarComprobacionConexion(){
  comprobarConexionTotem();
  if(relojConexionTimer)clearInterval(relojConexionTimer);
  // Cada 30 segundos. Más seguido es gasto de datos en un aparato que
  // puede estar con plan limitado; más espaciado tarda demasiado en
  // avisar que se fue la señal.
  relojConexionTimer=setInterval(comprobarConexionTotem,30000);
}
function pararComprobacionConexion(){
  if(relojConexionTimer){clearInterval(relojConexionTimer);relojConexionTimer=null;}
}

// ------------------------------------------------------------------
// LA HORA QUE SE ACABA DE GUARDAR
// ------------------------------------------------------------------
// Cuando la marcación es correcta, la pantalla muestra la hora guardada y
// no la del reloj del aparato. Es lo que la persona necesita ver: la hora
// que le va a figurar en la planilla.
//
// Si las dos no coinciden, se dicen las dos. Un desfase de reloj es un
// problema real y hay que verlo, no taparlo: si el reloj del aparato va
// 5 minutos atrasado, TODAS las marcaciones de esa obra van 5 minutos
// atrasadas, y eso se impugna después.
function marcarHoraDeLaMarcaja(horaGuardada){
  const caja=document.getElementById('totemHoraMarcada');
  if(!caja)return;
  const d=new Date();
  const ahora=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  const guardado=String(horaGuardada||'').slice(0,5);
  if(!guardado){caja.textContent='';return;}
  if(guardado===ahora){
    caja.textContent='Marcaje registrado a las '+guardado;
    caja.className='totem-marcaje-ok';
    return;
  }
  caja.textContent='Marcaje registrado a las '+guardado
    +' (el reloj del aparato marca '+ahora+')';
  caja.className='totem-marcaje-desfasado';
}

let relojTotemTimer=null;
function arrancarHoraTotem(){
  pintarHoraTotem();
  // Un solo intervalo. Si se llama dos veces sin parar el anterior, quedan
  // dos timers y la hora avanza al doble: se ve en el segundero.
  if(relojTotemTimer)clearInterval(relojTotemTimer);
  relojTotemTimer=setInterval(pintarHoraTotem,1000);
}
function pararHoraTotem(){
  if(relojTotemTimer){clearInterval(relojTotemTimer);relojTotemTimer=null;}
}

// LA EMPRESA, EN LA PANTALLA DEL RELOJ
//
// El logo se sube en Configurar y queda en la empresa como un data-URL
// (columna "logo"). Esto lo trae a la pantalla del reloj.
//
// Va debajo de la camara, no arriba del todo, porque arriba esta la hora
// y la hora es lo que la persona viene a ver. La empresa va con la
// camara porque son las dos cosas que confirman que la persona esta
// donde debe: la camara es donde apunta la cara, y la empresa es de
// quien es el reloj.
//
// Si no hay logo, no se dibuja nada: queda solo el nombre. Un rectangulo
// vacio con un borde seria peor, porque parece que falta algo.
// EL PLACEHOLDER DEL CAMPO, SEGUN COMO LEE EL RELOJ
//
// El mensaje grande de arriba ya decia lo correcto: "frente a la camara" con
// camara, y "o pasala por el lector" con lector USB. Lo que decia mal era el
// placeholder del campo, que siempre mencionaba la camara.
//
// Ahora el placeholder se pone segun el lector, y no al reves. Un texto que
// dice una cosa y la pantalla dice otra es peor que un texto generico: la
// persona se queda con la instruccion que ve mas grande.
//
// Con camara: el campo es el respaldo, para cuando el QR no se lee. Se dice
// eso, y no "presenta la tarjeta", porque la camara ya se encarga.
//
// Con lector USB: la tarjeta se pasa por ahi y el campo queda solo para
// escribir el numero a mano. Que es lo unico que sirve hacer en el.
function ponerPlaceholderTotem(){
  const campo=document.getElementById('totemCampo');
  if(!campo)return;
  const conCamara=totemActual&&totemActual.tipo_lector==='camara';
  campo.placeholder=conCamara
    ? 'Si la cámara no lee, escribe el código y presiona Enter'
    : 'O escribe el código a mano y presiona Enter';
}

function pintarEmpresaEnTotem(){
  const cajaNombre=document.getElementById('totemEmpresaNombre');
  if(!cajaNombre)return;
  // ------------------------------------------------------------------
  // LA EMPRESA DEL RELOJ, NO LA DEL DESPLEGABLE
  // ------------------------------------------------------------------
  // Antes usaba empresaDelPapel(), que devuelve la empresa seleccionada arriba.
  // En la portería eso no sirve: en la portería nadie selecciona nada, y el
  // reloj es de una empresa sola. Con el desplegable en "todas las empresas" o
  // en otra, el tótem mostraba el nombre y el logo de la empresa equivocada.
  //
  // Y no es un detalle: el logo es lo que dice de quién es el papel que se está
  // firmando ahí. Con dos empresas en el sistema se firmaba con el logo de la
  // otra.
  //
  // Si la empresa del reloj no está en la lista que esta persona puede ver, se
  // deja el nombre en el número de id: es mejor un código que un nombre
  // equivocado.
  const lista=(typeof empresas!=='undefined'&&empresas)?empresas:[];
  let empresa=null;
  const idDelReloj=totemActual?totemActual.empresa_id:null;
  if(idDelReloj!=null)empresa=lista.find(e=>mismoId(e.id,idDelReloj))||null;
  if(!empresa)empresa=empresaDelPapel();

  cajaNombre.textContent=empresa
    ?(empresa.nombre||('#'+idDelReloj))
    :(idDelReloj!=null?('#'+idDelReloj):'');

  const centro=document.getElementById('totemEmpresaCentro');
  if(centro)centro.textContent=totemActual?centroDe(totemActual):'';

  const logo=document.getElementById('totemLogo');
  if(!logo)return;
  const url=empresa&&empresa.logo?String(empresa.logo):'';
  if(url){
    logo.src=url;
    logo.classList.add('visible');
  }else{
    // Se saca el src y no solo la classe: un logo que se oculto por CSS
    // sigue cargado, y en un reloj con poca memoria sobra tener en la
    // memoria una imagen que no se ve.
    logo.removeAttribute('src');
    logo.classList.remove('visible');
  }
}
function pintarTotemInicial(){
  // Se borra la hora del marcaje anterior. Si queda, alguien que pasa
  // después ve la hora del compañero y cree que ya marcó.
  const cajaMarcada=document.getElementById('totemHoraMarcada');
  if(cajaMarcada){cajaMarcada.textContent='';cajaMarcada.className='totem-marcaje';}
  const t=document.getElementById('totemMensaje');
  // Se devuelve el recuadro al estado de reposo, CON SU CLASE. Antes no
  // hacia falta porque el reposo era lo unico que habia; ahora hay un
  // estado mas, el amarillo del aviso, y sin esto el "presenta tu
  // tarjeta" se queda pintado encima del amarillo de un aviso ya
  // cerrado, que se lee como una contradiccion.
  t.className='totem-idle';
  t.innerHTML='<div class="totem-idle">'
    +'<div class="totem-idle-icono">▮</div>'
    +'<div class="totem-idle-texto">'
    +'<b>'+escHtml(totemActual?totemActual.nombre:'')+'</b>'
    +(totemActual&&centroDe(totemActual)?'<br><span>'+escHtml(centroDe(totemActual))+'</span>':'')
    +'<br>Presenta tu tarjeta'
    +(totemActual&&totemActual.tipo_lector==='camara'
      ?' frente a la cámara'
      :' o pásala por el lector')
    +'</div></div>';
  // El boton de avisos se limpia al entrar. Si quedara el de la persona
  // anterior, en la porteria se veria "1 aviso" y no seria de nadie: el
  // aviso de uno no es del que marco despues.
  const botonAviso=document.getElementById('totemVerAviso');
  if(botonAviso){botonAviso.classList.remove('visible');botonAviso.textContent='';}
  avisosDelReloj=[];
  const caja=document.getElementById('totemCodigoLeido');
  caja.textContent='';
  pintarEmpresaEnTotem();
  // El placeholder se pone al abrir, no al escribir el codigo: si se
  // pusiera en el handler, al recargar la pagina quedaria el texto viejo.
  ponerPlaceholderTotem();
  const barraCentro=document.getElementById('totemCentroActual');
  if(barraCentro)barraCentro.textContent=totemActual?centroDe(totemActual):'';
  pintarTotemContadores();
  document.getElementById('totemRelojActual').textContent=
    (totemActual?totemActual.code+' · ':'')+(totemActual?centroDe(totemActual):'');
}
// ------------------------------------------------------------------
// LLAMAR AL MARCAJE, Y VOLVER ATRÁS SI LA 052 NO ESTÁ
// ------------------------------------------------------------------
// La 052 mete marcar_por_reloj_controlado(), que es la de siempre con el
// horario del reloj revisado antes. Si esa función no existe, se vuelve a la
// vieja y NO se vuelve a intentar: un reloj que va a la portería tiene que
// poder marcar aunque alguien no haya subido una migración.
//
// Y se avisa por consola, no por pantalla. Un cartel de "falta la 052" cada
// vez que alguien pasa la tarjeta en la portería es peor que no avisar: la
// gente cree que su marcaje falló.
async function llamarMarcaje(nombre,args){
  let r=await window.supabaseClient.rpc(nombre,args);
  if(!r.error)return r;

  if(nombre==='marcar_por_reloj_controlado'
     && /does not exist|Could not find the function|PGRST202|marcar_por_reloj_controlado/i.test(String(r.error.message||''))){
    marcarPorRelojConHorario=false;
    console.warn('La 052 no está aplicada: el reloj marcará sin revisar el horario. '
      +'Aplícala para que el horario de marcaje funcione.');
    return await window.supabaseClient.rpc('marcar_por_reloj',args);
  }
  return r;
}

// ------------------------------------------------------------------
// LLAMAR AL MARCAJE, Y VOLVER ATRÁS SI LA 052 NO ESTÁ
async function registrarDesdeTotem(codigo){
  if(!totemActual)return;
  const leido=String(codigo||'').trim();
  if(!leido){
    mostrarTotem('error','No se leyó nada','Acerca la tarjeta otra vez.');
    return;
  }
  // Un lector USB manda la misma lectura varias veces seguidas. Sin esta
  // fila, la primera gana y las otras llenan la pantalla de "ya lo
  // habías marcado" mientras la persona todavía no levantó la tarjeta.
  if(Date.now()-(registrarDesdeTotem.ultima||0)<1500)return;
  registrarDesdeTotem.ultima=Date.now();

  // ------------------------------------------------------------------
  // SIN TOKEN EN ESTE APARATO
  // ------------------------------------------------------------------
  // Se comprueba acá y no después de la respuesta. La base responde
  // TOKEN_INVALIDO tanto si el token no está como si es de otro reloj, y
  // el mensaje que salía ("El reloj no está registrado en el sistema")
  // mandaba a revisar un reloj que sí existe y está sano. El problema, en
  // este caso, es de ESTE aparato.
  //
  // Se dice antes de llamar, porque la llamada no puede saber la
  // diferencia y porque un marcaje que va a fallar no se manda.
  const token=totemTokenActual();
  if(!token){
    mostrarTotem('error','Este aparato no tiene el token',
      'El reloj '+String(totemActual&&totemActual.code||'')+' es correcto, pero en este equipo no se instaló su token.'
      +'\n\nSe arregla desde la pantalla de Relojes: presioná "Rotar token" y copialo,'
      +' después volvé a abrir la pantalla de marcaje y presioná "Pegar el token" con ese valor.'
      +'\n\nSe hace una sola vez por reloj y por aparato.');
    return;
  }

  // ------------------------------------------------------------------
  // MARCAR CON HORARIO, Y SIN ROMPER NADA SI LA 052 NO ESTÁ
  // ------------------------------------------------------------------
  // Se llama a marcar_por_reloj_controlado, que es la de la 052: revisa el
  // horario del reloj y, si deja pasar, delega a la función de siempre.
  //
  // null = todavía no se sabe. undefined sería lo mismo, pero se escribe null
// a propósito: la diferencia entre "no se probó" y "probó y no estaba"
// importa cuando se está leyendo el código a las dos de la mañana.
let marcarPorRelojConHorario=null;

// null = todavía no se sabe. undefined sería lo mismo, pero se escribe null
// a propósito: la diferencia entre "no se probó" y "probó y no estaba"
// importa cuando se está leyendo el código a las dos de la mañana.


// Y si la 052 no está aplicada, se vuelve a la de siempre sin decir nada.
  // No es una degradada de verdad: es lo que evita que un reloj quede sin poder
  // marcar porque alguien no subió una migración. La primera vez que se llama
  // y falla se marca, y después no se vuelve a intentar, porque una pantalla
  // que reintenta en cada marcaje envejece al reloj.
  let rpcMarcaje='marcar_por_reloj_controlado';
  if(marcarPorRelojConHorario===false)rpcMarcaje='marcar_por_reloj';
  let resp=await llamarMarcaje(rpcMarcaje,{
    // El token lo tiene que mandar el tótem, no la pantalla. Si no hay
    // ninguno cargado, se avisa en vez de mandar un marcaje que va a
    // rebotar sin explicación.
    p_token:token,
    p_codigo:leido,
    p_tipo:document.getElementById('totemTipo').value
  });
  if(error){
    // Una migración faltante no es un marcaje malo: es que la base no está
    // lista. Se distingue ANTES de buscar un código de error, porque el
    // texto de PostgREST no trae ninguno y la pantalla terminaba
    // mostrando una línea de inglés técnico en un cartel de 50 letras.
    if(errorEsRelojesSinMigrar(error)){
      mostrarTotem('error','Reloj sin configurar',
        'La migración 030_relojes_totem.sql no está aplicada en la base de datos. Avisa a administración.');
      return;
    }
    const msg=String(error.message||'');
    const codigoError=(msg.match(/[A-Z_]{6,}/)||[''])[0];
    // Con token puesto y rechazo, el caso normal es que el token sea de
    // otro reloj: alguien instaló el equivocado, o se rotó el token y
    // este aparato quedó con el viejo. Se dice eso, y no "el reloj no
    // existe", que lleva a revisar un reloj sano.
      if(codigoError==='TOKEN_INVALIDO'){
      // El token puesto no es el de este reloj. Pasa cuando se instaló el
      // de otro, o cuando se rotó el de este y el aparato quedó con el
      // anterior. Es el caso más común después de una alta de reloj.
      //
      // Se muestra el campo para pegarlo acá, y no se manda a la pantalla
      // de Relojes: esa está en el computador de la oficina y el reloj
      // está en la portería. Ir a buscar el token, volver, y pegarlo es un
      // viaje que alguien tiene que hacer en la obra.
      mostrarTotem('error','El token no es de este reloj',
        'Este equipo tiene un token, pero no es el del reloj '
        +String(totemActual&&totemActual.code||'')
        +'. Pegalo abajo y se arregla acá mismo.');
      mostrarCampoTokenTotem();
      return;
    }
    const par=MENSAJES_TOTEM[codigoError]||['No se pudo marcar',msg||'Intenta de nuevo.'];
    mostrarTotem('error',par[0],par[1]);
    return;
  }
  const d=Array.isArray(data)?data[0]:data;
  if(!d){mostrarTotem('error','No se pudo marcar','Intenta de nuevo.');return;}
  // La hora que se acaba de guardar, aparte del cartel.
  //
  // El cartel dice "Entrada registrada". Eso no es lo que la gente necesita
  // ver: necesita ver LA HORA, porque es lo que va a figurar en la planilla y
  // lo que va a impugnar si le parece mal. Y necesita ver la hora del reloj
  // del aparato al lado, para poder notar un desfase.
  if(d.marca_hora)marcarHoraDeLaMarcaja(d.marca_hora);
  if(d.resultado==='ok'){
    mostrarTotem('ok',d.trabajador_nombre,
      (d.marca_tipo==='entrada'?'Entrada':d.marca_tipo==='salida'?'Salida'
        :d.marca_tipo==='colacion_entrada'?'Salida a colación':'Vuelta de colación')
      +' registrada a las '+escHtml(d.marca_hora));
    // Y el contador de "Marcajes Realizados" sube EN LA MEMORIA, sin volver a
    // preguntar. Solo en el camino de exito: si se sumara en "duplicado" o en
    // "ya_marcado", el numero subiria sin que haya una marca nueva, que es peor que
    // mostrarlo atrasado.
    sumarMarcajeAlTotem(d);
  }else if(d.resultado==='fuera_de_horario'){
    // ------------------------------------------------------------------
    // EL REYLO ESTÁ CERRADO
    // ------------------------------------------------------------------
    // Es un caso aparte y no un error más, porque lo que la persona tiene que
    // hacer es otra cosa: no reintentar. El reloj tiene un horario y ahora no
    // está dentro, y la respuesta a eso no es provar otra vez con la tarjeta en
    // la mano.
    //
    // Y se dice a dónde ir. Un "no se pudo marcar" sin más en un aparato de la
    // portería es un callejón sin salida: la persona no tiene teléfono, no
    // tiene usuario y no puede hacer nada. Por eso el texto nombra a quién y
    // en qué pantalla.
    mostrarTotem('error','Fuera del horario de marcaje',
      'Intentaste marcar a las <b>'+escHtml(d.marca_hora||'')+'</b> y este reloj ya no está en horario. '
      +'Pide en <b>Administración</b> que registren tu marcaje a mano, o márcalo mañana a la hora de entrada.',
      12000);
  }else if(d.resultado==='ya_marcado'){
    mostrarTotem('ya_marcado',d.trabajador_nombre,
      'Ya tenías esta marca de hoy, a las '+escHtml(d.marca_hora)+'.');
  }else{
    mostrarTotem('duplicado',d.trabajador_nombre,
      'Ya quedó registrada a las '+escHtml(d.marca_hora)+'.');
  }
  // ------------------------------------------------------------------
  // LOS AVISOS, DESPUES DE MARCAR
  // ------------------------------------------------------------------
  // Va despues del if/else a proposito. Si se dejara antes, un marcaje
  // que fallo igual abriria la ventana de avisos, y la persona leeria
  // un aviso sobre una marca que no existe: es peor que no avisar.
  //
  // Tampoco se espera: la marca ya esta guardada y la pantalla tiene que
  // mostrar el "entrada registrada" ya. La revision del aviso viene
  // atras y pisa el color del recuadro, no el mensaje.
  revisarAvisosDelTrabajador(d.trabajador_code);
}
// El token se guarda en el navegador del tótem, no en el HTML. Por eso la
// pantalla puede vivir en un archivo solo y el token se configura una vez
// en el aparato. En un equipo compartido es un riesgo, y se dice: por eso
// el tótem tiene que ser un aparato dedicado, no un navegador de escritorio.
function totemTokenActual(){
  try{return localStorage.getItem('totemToken_'+totemActual.code)||'';}
  catch(error){return '';}
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

// ------------------------------------------------------------------
// EL GUARDAR EL TOKEN DESDE LA PANTALLA DE RELOJES
// ------------------------------------------------------------------
// Tres cosas estaban mal, y las tres terminan con un reloj que no marca y
// sin que nadie sepa por qué.
//
// 1) NO COMPROBABA EL TOKEN ANTES DE GUARDARLO.
//
//    El reloj, en su pantalla, comprueba el token antes de usarlo. Esta
//    pantalla no: guardaba lo que se le pegara. Se podía instalar el
//    token de otro reloj, o cortado al pegar, y la pantalla decía
//    "guardado". El error aparecía recién en el primer marcaje, en la
//    portería, con la gente esperando.
//
//    Y hay una razón de fondo para que sea grave: guardar un token
//    equivocado es una de las pocas acciones que deja al sistema sin
//    registrar, y sin que en la planilla se note que falta nada.
//
// 2) NO ACTUALIZABA EL ESTADO DE LA PANTALLA.
//
//    El texto de arriba decía "este reloj NO está instalado en este
//    navegador". Después de apretar Instalar, seguía diciendo exactamente
//    eso, con el token recién guardado. La pantalla le mintió a la
//    persona justo después de hacer lo que le pedía.
//
// 3) NO DISTINGUÍA "NO PUDO COMPROBAR" DE "NO SIRVE".
//
//    Un corte de conexión de un segundo y un token equivocado dan el
//    mismo error de la base. No pueden llevar la misma respuesta: con el
//    primero no se toca nada y se reintenta; con el segundo no se guarda
//    y hay que rotar el token.
//
// Lo que sigue: el token se comprueba contra la base antes de guardarlo,
// el estado se repinta después, y el diálogo se cierra para que la
// persona pueda ir a probarlo.

function guardarTotemToken(code){
  code=code||document.getElementById('tokenRelojCodigo').value;
  const inp=document.getElementById('tokenInstalarCampo');
  const t=inp.value.trim();
  if(!t){alert('Pegá el token.');return;}
  const reloj=relojPorCodigo(code);
  if(!reloj){alert('Ese código de reloj no existe.');return;}

  // Que no se pueda apretar Instalar dos veces: la comprobación va a la
  // base y puede tardar, y dos llamadas a la vez guardarían la segunda.
  const btn=document.querySelector('#dlgToken button[onclick^="guardarTotemToken"]');
  const textoBtn=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Comprobando...';}

  // Un reloj, para que el boton no se quede en "Comprobando..." para
  // siempre si la llamada se cuelga. Una red que no corta sino que se
  // queda colgada es distinta de una que no hay, y sin esto no hay manera
  // de volver a apretar.
  //
  // Se llama "espera" y no "reloj" porque en esta misma función ya hay una
  // variable "reloj", que es el reloj de la lista. Declararla dos veces es
  // un error de sintaxis, y tumba el script entero.
  const espera=setTimeout(()=>{
    if(btn){btn.disabled=false;btn.textContent=textoBtn||'Instalar';}
    alert('La base no contesto en 20 segundos.\n\n'
      +'Puede ser que no haya senal en la obra. No se guardo nada, para no dejar '
      +'el reloj con un token que no se comprobo. Proba de nuevo en un rato.');
  },20000);
  comprobarTokenEnLaBase(code,t).then(r=>{
    clearTimeout(espera);
    if(btn){btn.disabled=false;btn.textContent=textoBtn||'Instalar';}

    // ----------------------------------------------------------------
    // NO SE PUDO COMPROBAR: NO SE TOCA NADA
    // ----------------------------------------------------------------
    // Puede ser que la obra se haya quedado sin internet un segundo. Si
    // el token que ya está instalado es el mismo que se está por
    // guardar, se deja todo como está: puede estar perfectamente bien, y
    // borrarle el token a alguien que sí marcaba es el peor resultado
    // posible.
    if(r.sinRed){
      if(totemTokenDe(code)===t){
        pintarEstadoToken(code,true);
        alert('No se pudo comprobar con la base, pero el token de este reloj\n'
          +'ya estaba instalado en este equipo. Se dejó como estaba.\n\n'
          +'Si marcaba y ahora no marca, el problema no es el token.');
        return;
      }
      alert('No se pudo comprobar el token: la base no respondió.\n\n'
        +'No se guardó nada, para no dejar el reloj sin token. '
        +'Probá de nuevo cuando haya conexión.');
      return;
    }

    // ----------------------------------------------------------------
    // EL TOKEN NO SIRVE: NO SE GUARDA, Y SE DICE POR QUÉ
    // ----------------------------------------------------------------
    if(!r.ok){
      alert('Ese token no sirve para el reloj '+code+'.\n\n'
        +r.motivo
        +'\n\nNo se guardó nada.');
      return;
    }

    // ----------------------------------------------------------------
    // SIRVE: AHORA SÍ SE GUARDA
    // ----------------------------------------------------------------
    try{
      localStorage.setItem('totemToken_'+code,t);
    }catch(error){
      alert('No se pudo guardar: '+error.message
        +'\n\nSi el navegador está en modo privado, no guarda nada y el token '
        +'hay que ponerlo cada vez.');
      return;
    }
    // El estado se repinta con la verdad, y el diálogo se cierra para ir a
    // probarlo. Dejarlo abierto con el texto viejo diciendo que no está
    // instalado era la peor de las dos opciones.
    pintarEstadoToken(code,true);
    document.getElementById('dlgToken').close();
    alert('Token de '+reloj.nombre+' guardado en este equipo.\n\n'
      +'Para probarlo, abrí la pantalla de marcaje de ese reloj con "Abrir pantalla".');
  });
}

// ------------------------------------------------------------------
// COMPROBAR EL TOKEN CONTRA LA BASE
// ------------------------------------------------------------------
// La migración 036. Devuelve tres cosas y no un sí o un no, porque son
// tres casos que la persona tiene que distinguir:
//
//   - sinRed: la base no respondió. NO se toca lo que hay instalado.
//   - ok:     el token sirve para este reloj.
//   - motivo: por qué no sirve, en palabras.
//
// Un token puede estar mal por cinco razones, y cada una se arregla con
// una acción distinta. Que la base diga cuál es, y que esta función solo
// la traduzca, es lo que hace que el mensaje sirva de algo.

function comprobarTokenEnLaBase(code,token){
  // Se anota desde cuándo se está comprobando. Si la llamada se cuelga, el
  // reloj de 20 segundos avisa, pero con esto también se puede ver en la
  // consola cuánto tardó, que es el dato que hace falta para distinguir
  // "la base está lenta" de "la base no responde".
  const desde=Date.now();
  return window.supabaseClient.rpc('comprobar_token_reloj',{p_code:code,p_token:token})
    .then(({data,error})=>{
      // ----------------------------------------------------------------
      // QUÉ CONTESTÓ LA BASE, EN LA CONSOLA
      // ----------------------------------------------------------------
      // Se imprime siempre. Antes no se imprimía nada, y eso fue lo que
      // hizo que esta falla costara tres vueltas: el mensaje en pantalla
      // decía una cosa y no había forma de ver qué había contestado de
      // verdad la base.
      //
      // Con esto, si algo vuelve a fallar, la consola dice exactamente
      // qué llegó, y no hay que deducirlo. Se escribe "respuesta de la
      // base" para que se encuentre con un solo filtro.
      console.log('[token] comprobando el de '+code+' ('+Date.now()-desde+' ms)');
      if(error){
        console.warn('[token] la base lo rechazó:',error.message||error);
      }else{
        console.log('[token] respuesta de la base:',JSON.stringify(data));
      }
      // La función es de la migración 036. Si todavía no está, el error
      // lo dice con nombre, y el mensaje dice qué aplicar.
      if(error&&/42883|does not exist|no existe/i.test(error.message)){
        return {ok:false,motivo:'La base todavía no tiene esta comprobación. '
          +'Falta aplicar la migración 036_comprobar_token_reloj.sql.'};
      }
      if(error){
        if(/fetch|network|failed|conex/i.test(error.message))return {sinRed:true};
        // Un 42501 es de permiso: no es que el token esté malo.
        if(/42501|SIN_PERMISO/i.test(error.message)){
          return {ok:false,motivo:'Tu usuario no tiene permiso para comprobar tokens. '
            +'Pídele a un administrador que te habilite reloj.ver.'};
        }
        return {ok:false,motivo:'La base lo rechazó: '+error.message};
      }
      // ----------------------------------------------------------------
      // LEER LA RESPUESTA, QUE VIENE EN ARRAY
      // ----------------------------------------------------------------
      // Esto era el bug que impedía instalar un token que estaba bien.
      //
      // comprobar_token_reloj devuelve "table (ok boolean, motivo text)",
      // y PostgREST responde a una función que devuelve tabla con un
      // ARRAY: [{ok:true, motivo:'OK'}].
      //
      // El código leía data.comprobar_token_reloj, que no existe en un
      // array, y se quedaba con el array entero. Entonces r.ok era
      // undefined, que es distinto de false, así que caía en la rama del
      // error y anunciaba "el token no es de este reloj".
      //
      // O sea: la base decía QUE SÍ, y la pantalla decía QUE NO. El
      // token estaba bien, el hash estaba bien, y no se podía instalar.
      //
      // En el resto de la aplicación el patrón correcto ya estaba usado:
      // "Array.isArray(data) ? data[0] : data". Acá no se usó, y por eso
      // el fallo era invisible: la respuesta era válida, solo que mal
      // leída.
      const r=leerFilaDeTabla(data,'comprobar_token_reloj');

      // Y si la fila se pudo leer, se dice cuál de los dos casos es, con el
      // motivo que devolvió la base. Así no hay que cruzarlo con la base a
      // mano para saber qué pasó.
      if(r)console.log('[token] leído:',r.ok?'sirve':'no sirve, motivo '+(r.motivo||'sin motivo'));

      // Y si no se pudo leer, NO se acusa al token. Un problema de lectura
      // y un token malo tienen que decir cosas distintas: con el primero
      // se reintenta, con el segundo hay que rotar.
      if(!r||typeof r.ok!=='boolean'){
        return {ok:false,motivo:'La base contestó algo que esta versión no entiende, '
          +'así que no se puede decir si el token sirve. Probá de nuevo. '
          +'Detalle: '+JSON.stringify(data).slice(0,140)};
      }
      if(r.ok)return {ok:true};
      return {ok:false,motivo:explicarTokenInvalido(String(r.motivo||'TOKEN_INVALIDO'),code)};
    })
    .catch(error=>{
      // La llamada ni siquiera llegó: eso es red, no un token malo.
      return {sinRed:true,motivo:String(error&&error.message)};
    });
}

// ------------------------------------------------------------------
// LEER LA FILA DE UNA FUNCIÓN QUE DEVUELVE TABLA
// ------------------------------------------------------------------
// PostgREST responde distinto según lo que devuelva la función:
//
//   returns table  ->  un ARRAY de filas:  [{ok:true}]
//   returns json   ->  {ok:true}
//   returns text   ->  el valor solo:     "algo"
//
// Y según la versión y el esquema, la fila puede venir envuelta con el
// nombre de la función. Por eso se prueban las tres formas y se devuelve
// la primera que tenga la forma de una fila.
//
// Es una función chiquita, pero es la que decide si el token se instala o
// no. Cuando la respuesta se leyó mal, el síntoma fue "el token no sirve"
// para un token que sí servía: un error de lectura disfrazado de error de
// la base, que es la forma más difícil de pillar que hay.
function leerFilaDeTabla(data,nombreDeLaFuncion){
  if(data==null)return null;
  // Un array: la forma de "returns table", que es lo normal acá.
  if(Array.isArray(data))return data.length?data[0]:null;
  // Un objeto: puede ser la fila, o la fila envuelta con el nombre.
  if(typeof data==='object'){
    if(nombreDeLaFuncion&&data[nombreDeLaFuncion]!=null){
      const envuelto=data[nombreDeLaFuncion];
      return Array.isArray(envuelto)?(envuelto.length?envuelto[0]:null):envuelto;
    }
    if(typeof data.ok==='boolean'||typeof data.motivo==='string')return data;
    return null;
  }
  return null;
}

// Cada motivo de la base, traducido a lo que la persona puede hacer. Un
// "no sirve" a secas no dice si hay que volver a copiar, activar el reloj
// o rotar el token, y con eso no se puede hacer nada.
function explicarTokenInvalido(motivo,code){
  switch(motivo){
    case 'RELOJ_INEXISTENTE':
      return 'No hay ningún reloj con el código "'+code+'" en esta empresa.';
    case 'RELOJ_INACTIVO':
      return 'El reloj está marcado como inactivo. Activalo con "Configurar" antes de instalar el token.';
    case 'TOKEN_VACIO':
      return 'No pegaste ningún token.';
    case 'TOKEN_MAL_CORRIDO':
      // El token es un UUID: 36 caracteres, con guiones, en hexadecimal.
      // Lo decide rotar_token_reloj(), que genera gen_random_uuid().
      return 'El texto pegado no tiene forma de token. Son 36 caracteres, '
        +'con guiones, como 3f2504e0-4f89-11d3-9a0c-0305e82c3301. '
        +'Si está cortado al copiar, vuelve a copiarlo entero.';
    case 'TOKEN_INVALIDO':
      return 'El token es válido pero no es el de este reloj. Cada reloj tiene el suyo: '
        +'cerrá esto y apretá "Rotar token" en la lista, y instalá el nuevo.';
    default:
      return 'El token no corresponde a este reloj.';
  }
}
// ------------------------------------------------------------------
// LOS AVISOS EN LA PANTALLA DEL RELOJ
// ------------------------------------------------------------------
// Un aviso es una indicacion que le dejo alguien a una persona: que se
// presente en Prevencion, que falta un documento, que la manden a la hora.
//
// Lo que ya existe y se usa aca: la tabla avisos_ingreso, de la 023. Trae
// lo que hace falta y no hay que inventar nada:
//
//   indicacion         que dice
//   enviado_por_nombre quien lo dejo
//   estado             enviado | confirmado | rechazado
//
//
// LOS TRES ESTADOS DEL RECUADRO
// -----------------------------
//   verde     marco y no tiene nada pendiente
//   amarillo  marco y TIENE un aviso sin confirmar
//   rojo      no se pudo marcar
//
// El amarillo va en el FONDO, no solo en el color de la letra, porque a
// dos metros de la porteria no se lee la diferencia entre dos textos
// oscuros. El fondo se ve igual.
//
//
// LO QUE NO SE DICE, Y POR QUE
// ---------------------------
// La ventana del aviso no dice "se envio a su correo" a secas. No hay
// proveedor de correo configurado, asi que el aviso esta REGISTRADO pero
// no esta ENVIADO, y si la pantalla le dice a la persona que lo tiene en
// el correo, la persona no lo va a buscar y el aviso se pierde.
//
// El texto se arma con el estado real: si nadie lo confirmo, dice que
// esta pendiente; si ya lo confirmo, dice cuando. Cuando haya proveedor,
// el mismo texto dira que si esta en el correo, y no habria que tocarlo.
//
//
// CUANDO SE ABRE LA VENTANA, Y CUANDO NO
// --------------------------------------
// En el momento del marcaje, si. La persona esta parada ahi, es el mejor
// momento posible para que se entere, y si no se le dice ahora, no se le
// dice nunca: se va a trabajar y se olvida.
//
// Despues, no. A las nueve de la noche no se le abre una ventana a
// nadie encima: se le deja un boton con la cantidad, y lo abre cuando
// quiera. Por eso el boton esta siempre ahi mientras haya algo pendiente.
let avisosDelReloj=[];

async function revisarAvisosDelTrabajador(code){
  if(!code)return;
  try{
    const {data,error}=await supabaseClient
      .from('avisos_ingreso')
      .select('id,code,fecha,tipo,indicacion,hora_reloj,origen_registro,enviado_por_nombre,estado,confirmado_por_nombre,confirmado_at,comentario,created_at')
      .eq('code',code)
      .eq('estado','enviado')
      .order('created_at',{ascending:false})
      .limit(10);
    if(error)return;
    avisosDelReloj=Array.isArray(data)?data:[];
  }catch(error){
    // Si no se pueden leer los avisos, el marcaje ya se guardo. No se
    // interrumpe la pantalla por un aviso que no se pudo mostrar: lo
    // que no se puede ver es molesto, pero romper el marcaje es peor,
    // porque la persona se va a casa sin que conste que estuvo.
    avisosDelReloj=[];
  }
  pintarAvisosEnTotem(true);
}

function pintarAvisosEnTotem(enElMarcaje){
  const banda=document.getElementById('totemMensaje');
  const boton=document.getElementById('totemVerAviso');
  if(!banda||!boton)return;
  const hay=avisosDelReloj.length>0;

  // El boton: solo si hay algo, y con la cantidad. En la porteria tiene
  // que verse que hay algo pendiente sin abrir nada.
  if(hay){
    boton.classList.add('visible');
    boton.innerHTML='Aviso'+(hay>1?'s':'')+' por leer<span class="cuenta">'+hay+'</span>';
  }else{
    boton.classList.remove('visible');
    boton.textContent='';
  }

  if(!hay){
    // Sin avisos, el recuadro vuelve a su color. Solo si esta en estado
    // de aviso: si se acaba de marcar bien, el verde no se toca.
    if(banda.classList.contains('totem-aviso'))pintarTotemInicial();
    return;
  }

  // Con avisos, el fondo pasa a amarillo. El texto se arma aparte para
  // que el nombre del trabajador no se pierda.
  const a=avisosDelReloj[0];
  const quien=a.enviado_por_nombre?escHtml(a.enviado_por_nombre):'Alguien del equipo';
  const extra=hay>1?(' y '+(hay-1)+' aviso'+(hay>2?'s':'')+' más'):'';
  banda.className='totem-aviso';
  banda.innerHTML='<div class="totem-icono">!</div><div class="totem-texto">'
    +'<b>Tienes '+hay+' aviso'+(hay>1?'s':'')+'</b>'
    +'<span>'+quien+' te dejó una indicación'+extra+'. Léela antes de irte.</span></div>';

  // La ventana solo en el momento del marcaje. Despues queda el boton.
  if(enElMarcaje)abrirAvisoTotem();
}

function abrirAvisoTotem(){
  const d=document.getElementById('dlgAviso');
  if(!d||!avisosDelReloj.length)return;
  const a=avisosDelReloj[0];
  const extra=avisosDelReloj.length>1
    ?'<p style="margin:12px 0 0;color:var(--muted)">Hay '+avisosDelReloj.length
     +' avisos. Este es el primero; los demas salen al cerrar.</p>'
    :'';
  document.getElementById('dlgAvisoTitulo').textContent=hayTituloDeAviso(a);
  document.getElementById('dlgAvisoQuien').textContent='Lo dejó '
    +(a.enviado_por_nombre||'alguien del equipo')+' · '+quienPusoElAviso(a);
  document.getElementById('dlgAvisoTexto').textContent=a.indicacion||'(sin texto)';
  document.getElementById('dlgAvisoEnviado').textContent=estadoDeEnvioDe(a)+extra;
  if(d.showModal)d.showModal();
}

// Que el titulo diga de que es el aviso. "Aviso" a secas no sirve para
// decidir si es urgente: "te falta un documento" y "presentate al
// examen" se atienden distinto, y el titulo es lo primero que se lee.
function hayTituloDeAviso(a){
  if(!a)return'Aviso';
  if(a.tipo==='no_marco')return'No marcaste el turno anterior';
  if(a.tipo==='entrada_tarde')return'Entraste tarde';
  if(a.tipo==='salida_temprana')return'Saliste antes de la hora';
  return'Aviso';
}

// Quien lo puso, en palabras de la porteria. La hora del reloj, que es la
// que el trabajador vio al marcar, y no la del servidor, que puede
// estar corrida.
function quienPusoElAviso(a){
  const f=a.fecha?fechaLegible(a.fecha):'';
  const h=a.hora_reloj?(' a las '+('' + a.hora_reloj).slice(0,5)):'';
  return (f+h)||'sin fecha';
}

// EL ESTADO REAL DEL AVISO, DICHO COMO ES
//
// Esto es lo mas importante de la ventana. Alguien tiene que poder leer
// aqui, sin adivinar, si esto ya se mando o no.
//
//   con correo configurado  "Tambien esta en tu correo."
//   sin correo configurado  "Queda registrado en el sistema, pero todavia
//                            NO se mando a ningun correo. Si no lo acatas
//                            aqui, avisale a tu supervisor."
//
// Decirle a la persona que esta en su correo cuando no esta hace que no
// lo busque, y el aviso se pierde sin que nadie se entere.
function estadoDeEnvioDe(a){
  if(a.estado==='confirmado'){
    const quien=a.confirmado_por_nombre?(' por '+a.confirmado_por_nombre):'';
    const cuando=a.confirmado_at?(' el '+fechaLegible(a.confirmado_at)):'';
    return 'Ya lo confirmaste'+quien+cuando
      +(a.comentario?('. Dijiste: "'+a.comentario+'"'):'.')
      +' Si creés que ya no corresponde, pedile a tu supervisor que lo borre.';
  }
  // El estado "enviado" en esta tabla quiere decir "el aviso existe y
  // nadie lo ha confirmado todavia". No quiere decir que esta en el
  // correo del trabajador, y por eso no se escribe que si.
  return 'Esto quedo registrado y nadie lo ha confirmado todavia. '
    +'NO esta en ningun correo todavia: no hay correo configurado en el sistema. '
    +'Si no lo podes resolver aca, decile a tu supervisor antes de irte.';
}

function cerrarAvisoTotem(){
  const d=document.getElementById('dlgAviso');
  if(d&&d.open)d.close();
  // Si quedaban avisos, se pasa al siguiente. Uno por uno: si abrirlos
  // todos juntos, el ultimo no se lee.
  if(avisosDelReloj.length){
    avisosDelReloj.shift();
    setTimeout(()=>{
      pintarAvisosEnTotem(false);
      if(avisosDelReloj.length)abrirAvisoTotem();
    },200);
  }
}

// LA BOLETA IMPRIMIDA
// -------------------
// Un aviso pegado en una pantalla y borrado a los dos minutos no sirve de
// nada al dia siguiente, cuando la persona se acuerda de que le dejaron
// algo. Con la boleta queda en un papel: en la boletera, en el casillero,
// o en la mano.
//
// Se imprime SOLO esa parte. La pantalla del reloj no: a medio metro de
// una impresora de ticket queda ilegible.
function imprimirAvisoTotem(){
  const a=avisosDelReloj[0];
  if(!a)return;
  const reloj=totemActual?totemActual.nombre:'';
  const caja=document.getElementById('boletaAviso');
  caja.innerHTML='<h1>AVISO</h1>'
    +'<p><strong>'+escHtml(hayTituloDeAviso(a))+'</strong></p>'
    +'<p>'+escHtml(a.indicacion||'')+'</p>'
    +'<hr>'
    +'<p>Dejo el aviso: '+escHtml(a.enviado_por_nombre||'alguien del equipo')+'<br>'
    +'Cuando: '+escHtml(quienPusoElAviso(a))+'<br>'
    +'Reloj: '+escHtml(reloj)+'<br>'
    +'Estado: '+escHtml(a.estado==='confirmado'?'confirmado por la persona':'pendiente, sin confirmar')+'</p>'
    +'<p style="font-size:9pt">Impreso el '+escHtml(new Date().toLocaleString('es-CL'))+'.</p>';
  // La clase va ANTES de imprimir. En un @media print no se puede cambiar
  // el estilo desde aqui: el motor de impresion ya tomo la decision, y
  // ponerla despues no hace nada.
  document.body.classList.add('imprimiendo-boleta');
  const quitar=()=>document.body.classList.remove('imprimiendo-boleta');
  // "afterprint" es el aviso de que termino. El setTimeout es el plan B:
  // si el navegador no lo dispara, la clase se saca igual y, con esto, la
  // siguiente impresion de la app no sale en blanco.
  window.addEventListener('afterprint',quitar,{once:true});
  setTimeout(quitar,1500);
  window.print();
  caja.innerHTML='';
}

// ------------------------------------------------------------------
// LA FICHA PERSONAL, Y EL FORMATO
// ------------------------------------------------------------------
// QUE RESUELVE
// ------------
// Que se pueda llevar los datos de un trabajador a otro sistema. Y hay dos
// maneras, porque no todos los sistemas de remuneraciones dejan importar:
//
//   a) el que TIENE importacion: se le da el archivo
//   b) el que NO tiene: se copia campo por campo y se pega a mano
//
// Para el caso (b) no sirve de nada un boton de copiar por campo si el
// campo no esta, o si el boton no dice si se copio o no. Por eso el
// boton cambia un instante y lo dice.
//
//
// EL FORMATO ESTA DEFINIDO ACA, Y EN UN SOLO LADO
// -----------------------------------------------
// CAMPOS_FICHA es la unica lista. La pantalla la usa para pintar las
// filas, y la descarga la usa para escribir el archivo. No hay dos listas.
//
// Cuando hay dos listas, la primera se actualiza y la segunda no, y el
// resultado es una pantalla con un campo que el archivo no tiene, o al
// reves. Eso es peor que no tener formato: es un formato que miente.
//
// Con una sola lista no puede pasar: si el campo esta en la pantalla, esta
// en el archivo, porque salen del mismo lugar.
//
//
// QUE SIGNIFICA CADA COSA DE LA LISTA
// ----------------------------------
//   clave     el nombre del campo, como esta en la base. Cambia si cambia
//             la base, y eso hay que saberlo.
//   etiqueta  lo que se ve escrito. Es lo que el usuario lee para saber
//             que campo esta copiando.
//   grupo     para que la ficha no sea una lista de 25 renglones sueltos.
//   formato   como se convierte el valor al archivo. Un RUT se escribe
//             con guiones, un telefono sin ellos, y una fecha como AAAA-MM-DD.
//             Si no se dice, cada quien lo escribe como quiere y el
//             archivo entra igual en el sistema equivocado.
//
// LA VERSION DEL FORMATO
// ----------------------
// El archivo lleva su version en la primera linea. Si un dia se agrega un
// campo, la version pasa a 2, y el que recibe el archivo sabe que no es el
// mismo que recibio la vez pasada. Sin eso, un archivo viejo y uno nuevo se
// ven iguales y nadie sabe cual es cual.
//
// La version va PRIMERA y sola en su linea, con un # adelante para que
// ningun sistema la tome como un dato de un trabajador. Si el sistema
// receptor no la entiende, la ignora como un comentario: es preferible
// que ignore una linea a que tome la version como si fuera el nombre de
// un trabajador.
const CAMPOS_FICHA=[
  {grupo:'Identificacion',clave:'code',etiqueta:'Codigo',formato:'texto'},
  {grupo:'Identificacion',clave:'name',etiqueta:'Nombre completo',formato:'texto'},
  {grupo:'Identificacion',clave:'rut',etiqueta:'RUT',formato:'rut'},
  {grupo:'Trabajo',clave:'spec',etiqueta:'Cargo o especialidad',formato:'texto'},
  {grupo:'Trabajo',clave:'especialidad_clave',etiqueta:'Especialidad del kit',formato:'texto'},
  {grupo:'Trabajo',clave:'fecha_ingreso',etiqueta:'Fecha de ingreso',formato:'fecha'},
  {grupo:'Trabajo',clave:'tipo_trabajador',etiqueta:'Tipo de trabajador',formato:'texto'},
  {grupo:'Trabajo',clave:'empresa_id',etiqueta:'Empresa',formato:'texto'},
  {grupo:'Trabajo',clave:'supervisor_code',etiqueta:'Codigo del supervisor',formato:'texto'},
  {grupo:'Trabajo',clave:'status',etiqueta:'Situacion',formato:'texto'},
  {grupo:'Contacto',clave:'phone',etiqueta:'Telefono',formato:'telefono'},
  {grupo:'Contacto',clave:'emerg_name',etiqueta:'Contacto de emergencia',formato:'texto'},
  {grupo:'Contacto',clave:'emerg_rel',etiqueta:'Parentesco del contacto',formato:'texto'},
  {grupo:'Contacto',clave:'emerg_phone',etiqueta:'Telefono de emergencia',formato:'telefono'},
  {grupo:'Salud',clave:'salud',etiqueta:'Salud',formato:'texto'},
  {grupo:'Salud',clave:'medicamentos',etiqueta:'Medicamentos',formato:'texto'},
  {grupo:'Salud',clave:'precauciones',etiqueta:'Precauciones',formato:'texto'},
  {grupo:'Alertas',clave:'alerta_social',etiqueta:'Alerta social',formato:'texto'},
  {grupo:'Alerta',clave:'alerta_social_nota',etiqueta:'Detalle de la alerta social',formato:'texto'},
  {grupo:'Alertas',clave:'alerta_prevencion',etiqueta:'Alerta de prevencion',formato:'texto'},
  {grupo:'Alertas',clave:'alerta_prevencion_nota',etiqueta:'Detalle de la alerta de prevencion',formato:'texto'},
  {grupo:'Indicaciones',clave:'indicaciones_sociales',etiqueta:'Indicacion del asistente social',formato:'texto'},
  {grupo:'Indicaciones',clave:'indicaciones_prevencion',etiqueta:'Indicacion de prevencion',formato:'texto'},
  {grupo:'Desvinculacion',clave:'fecha_termino',etiqueta:'Fecha de termino',formato:'fecha'},
  {grupo:'Desvinculacion',clave:'articulo_termino',etiqueta:'Articulo de termino',formato:'texto'},
  {grupo:'Desvinculacion',clave:'motivo_desvinculacion',etiqueta:'Motivo de la desvinculacion',formato:'texto'},
];
const VERSION_FORMATO_FICHA='1';

// CUANTOS HAY QUE AVISAR
// -----------------------
// Un campo vacio en una ficha es normal: no todos los de tinta tienen grupo
// sanguíneo, no todos tienen alkifer. Pero hay una diferencia entre "no
// lo tiene" y "no lorellenaron y deberian".
//
// Por eso se avisara cuantos campos estan vacios al abrir, y no se
// bloquea nada. Un campo vacio se puede copiar igual: copiar un vacio no
// rompe nada, y molesta que se avise de un campo que la persona si
// tiene.
function fichaVacia(w){
  if(!w)return 0;
  return CAMPOS_FICHA.filter(c=>!valorDeCampo(w,c)).length;
}


// ------------------------------------------------------------------
// LEER UN CAMPO
// ------------------------------------------------------------------
// El valor crudo, tal como esta en el objeto. Devuelve '' en vez de
// undefined, porque un undefined pegado en un archivo pone la palabra
// "undefined" y eso ya no se sabe de donde salio.
function valorDeCampo(w,campo){
  if(!w)return '';
  const v=w[campo.clave];
  return v==null?'':String(v);
}

// CADA CAMPO EN EL FORMATO DEL ARCHIVO
// -------------------------------------
// Un RUT con guiones y un telefono con guiones NO se escriben igual. Un
// sistema de remuneraciones que espera el RUT con guiones rechaza el que
// viene sin ellos, y uno que espera el telefono con guiones al reves.
//
// Por eso el formato se declara campo por campo. Si no se dice, cada
// quien lo escribe como quiere y el archivo no entra en ningun lado.
function valorParaArchivo(w,campo){
  const crudo=valorDeCampo(w,campo);
  if(!crudo)return '';
  switch(campo.formato){
    case 'rut':{
      // "13.199.887-2" se deja con guiones, que es como lo escribe la
      // gente y como lo muestra casi todo. Un RUT sin puntos se lee como
      // un numero y se confunde con el codigo del trabajador.
      const solo=crudo.replace(/[^0-9kK]/g,'').toUpperCase();
      if(solo.length<2)return crudo;
      const cuerpo=solo.slice(0,-1);
      const dv=solo.slice(-1);
      const puntos=cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
      return puntos+'-'+dv;
    }
    case 'telefono':{
      // Sin guiones ni espacios: el telefono se usa para hacer un
      // contacto, no para leerlo. Un espacio en el medio rompe el envio
      // de un mensaje.
      return crudo.replace(/[^\d+]/g,'');
    }
    case 'fecha':{
      // AAAA-MM-DD. Es el unico formato que no se malinterpreta: el
      // 03/04/2026 es el 3 de abril en Chile y el 4 de marzo en
      // Estados Unidos, y en un archivo que viaja entre dos países eso
      // termina en el fecha de ingreso equivocada de un trabajador.
      const d=new Date(crudo);
      if(isNaN(d.getTime()))return crudo;
      const mes=String(d.getMonth()+1).padStart(2,'0');
      const dia=String(d.getDate()).padStart(2,'0');
      return d.getFullYear()+'-'+mes+'-'+dia;
    }
    default:
      // Los textos pueden traer saltos de linea y comas. En un archivo
      // separado por comas, un salto de linea parte el dato en dos y la
      // fila se corrige. Se aplanan.
      return crudo.replace(/\s+/g,' ').trim();
  }
}

// ------------------------------------------------------------------
// COPIAR
// ------------------------------------------------------------------
// Por que no se usa el portapapeles a secas: cuando la pagina no esta
// en https, o cuando el navegador lo niegue, navigator.clipboard no
// existe o falla, y la excepcion se come el error. En una obra, con la
// aplicacion instalada en un equipo viejo o abierta como archivo, eso
// pasa seguido.
//
// Por eso hay un camino de reserva con un textarea invisible, que es lo
// que funcione siempre. Y en los dos caminos el boton dice que copio:
// copiar en silencio deja a la persona creyendo que quedo en el
// portapapeles cuando no quedo, y eso es peor que no copiar.
function copiarTextoFicha(texto,boton){
  const original=boton?boton.textContent:'';
  const bien=()=>{marcarBotonFicha(boton,'Copiado',true);};
  const mal=()=>{
    marcarBotonFicha(boton,'No se pudo copiar',false);
    if(original)setTimeout(()=>marcarBotonFicha(boton,original,false),1600);
  };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(bien).catch(()=>copiarPorReserva(texto,bien,mal));
    return;
  }
  copiarPorReserva(texto,bien,mal);
}

// El camino de reserva: un textarea invisible, se selecciona, y el
// comando de copiar. Es de 1995 y funciona en todas partes.
function copiarPorReserva(texto,bien,mal){
  try{
    const caja=document.createElement('textarea');
    caja.value=texto;
    caja.setAttribute('readonly','');
    caja.style.position='fixed';
    caja.style.left='-9999px';
    caja.style.opacity='0';
    document.body.appendChild(caja);
    caja.select();
    caja.setSelectionRange(0,caja.value.length);
    const ok=document.execCommand&&document.execCommand('copy');
    document.body.removeChild(caja);
    ok?bien():mal();
  }catch(error){mal();}
}

// El boton que dice si copio. El cambio dura un instante y se vuelve
// solo: si el texto se queda puesto, la pantalla queda llena de
// "Copiado" y no se ve mas nada.
function marcarBotonFicha(boton,texto,bueno){
  if(!boton)return;
  boton.textContent=texto;
  boton.classList.add(bueno?'copiado':'copiadoNo');
  setTimeout(()=>{
    boton.classList.remove('copiado','copiadoNo');
    if(bueno)boton.textContent='Copiar';
  },1200);
}
function copiarCampoFicha(campo,boton){
  const w=fichaEnPantalla;
  const valor=valorParaArchivo(w,campo);
  if(!valor){
    marcarBotonFicha(boton,'Vacio',false);
    return;
  }
  copiarTextoFicha(valor,boton);
}

// ------------------------------------------------------------------
// COPIAR LA FICHA ENTERA
// ------------------------------------------------------------------
// Separado por tabuladores, NO por comas.
//
// El tabulador es el separador que Excel y Google Sheets reconocen al
// pegar, y es el unico que no se rompe con un punto y coma dentro de un
// texto. Un nombre de empresa con coma, o una observacion de salud con
// punto y coma, partirian la fila en dos y la mitad de los datos
// quedaria en la columna equivocada.
//
// Ademas lleva el nombre del campo arriba, con la misma lista. Pegado en
// una hoja queda con encabezado, y la persona ve que columna es cada
// cosa sin preguntar.
function textoFichaParaPegar(){
  const w=fichaEnPantalla;
  if(!w)return '';
  const lineas=[];
  lineas.push('ficha\tversion\t'+VERSION_FORMATO_FICHA);
  lineas.push(CAMPOS_FICHA.map(c=>c.etiqueta).join('\t'));
  lineas.push(CAMPOS_FICHA.map(c=>valorParaArchivo(w,c)).join('\t'));
  return lineas.join('\n');
}
function copiarFichaCompleta(boton){
  if(!fichaEnPantalla){marcarBotonFicha(boton,'No hay nadie',false);return;}
  copiarTextoFicha(textoFichaParaPegar(),boton);
}


// ------------------------------------------------------------------
// DESCARGAR LA FICHA, CON SU FORMATO
// ------------------------------------------------------------------
// Un CSV, no un Excel. El motivo es concreto: el archivo va a un sistema
// de remuneraciones que lo lee por columnas, y un .xlsx tiene
// hojas, formatos y una estructura interna que hay que entender. Un CSV
// es texto plano: se abre en cualquier lado y se ve.
//
// Separa por punto y coma, que es lo que aceptan casi todos los sistemas
// de remuneraciones en la region. Y lo pone en la configuracion:
// si el sistema de destino usa coma, se cambia UNA constante y el archivo
// entero cambia con ella.
const SEPARADOR_FICHA=';';

// La cabecera va con el nombre del campo, porque un archivo de veinte
// columnas sin nombre no se puede revisar: si un dato sale mal, no hay
// forma de saber de que campo era.
function descargarFichaFormato(){
  const w=fichaEnPantalla;
  if(!w)return;
  const cabecera=CAMPOS_FICHA.map(c=>c.clave).join(SEPARADOR_FICHA);
  const valores=CAMPOS_FICHA.map(c=>protegerParaCsv(valorParaArchivo(w,c))).join(SEPARADOR_FICHA);
  // La version va sola y con un # adelante, para que un sistema que no la
  // conozca la tome por un comentario y no por el nombre de un
  // trabajador. Es preferible que ignore una linea a que guarde un
  // "#version" como si fuera una persona.
  const contenido=[
    '#ficha-version '+VERSION_FORMATO_FICHA,
    '#generado '+new Date().toISOString(),
    cabecera,
    valores,
  ].join('\n');

  const blob=new Blob(['\uFEFF'+contenido],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='ficha-'+(w.code||'trabajador')+'.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Se libera despues, no antes: si se libera en el mismo instante, a
  // veces el navegador todavia no alcanzo a leer el archivo y la
  // descarga sale vacia.
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  avisarFicha('Ficha descargada. Es el formato '+VERSION_FORMATO_FICHA
    +', separado por "'+SEPARADOR_FICHA+'". Si el sistema de destino usa otro separador, se cambia una sola constante.');
}

// Un valor puede traer el separador adentro: una observacion de salud que
// dice "diabetes; hipertension" partiría la fila en dos y los datos
// quedarían corridos. El separador y los saltos de linea van entre
// comillas, que es lo que el formato CSV define para eso.
function protegerParaCsv(valor){
  const v=String(valor==null?'':valor);
  if(v.indexOf(SEPARADOR_FICHA)<0 && v.indexOf('"')<0 && !/[\r\n]/.test(v))return v;
  return '"'+v.replace(/"/g,'""')+'"';
}
function avisarFicha(texto){
  const caja=document.getElementById('fichaAviso');
  if(!caja)return;
  caja.textContent=texto;
  caja.classList.add('visible');
  setTimeout(()=>{caja.classList.remove('visible');caja.textContent='';},7000);
}

// ------------------------------------------------------------------
// LA PANTALLA
// ------------------------------------------------------------------
let fichaEnPantalla=null;

function abrirFichaTrabajador(code){
  const w=trabajadorEnCualquierEmpresa(code)||trabajadorEnAlcance(code);
  if(!w){alert('No se encontro al trabajador '+code+'.');return;}
  fichaEnPantalla=w;
  pintarFicha(w);
  if(typeof showView==='function')showView('ficha-trabajador');
}

// La lista para elegir a quien se le ve la ficha. Se usan todos los
// trabajadores, no solo los de la empresa que se esta viendo: la ficha es
// el lugar donde se revisa una persona, y muchas veces se revisa a alguien
// que esta en otra empresa o que ya se desvinculo y ya no aparece en la
// lista de la empresa.
//
// Se ordena por codigo y no por nombre, porque en una obra hay varias
// personas con el mismo nombre y el mismo apellido. El codigo es lo unico
// que las distingue, y es lo que se copia al sistema de remuneraciones.
function llenarSelectorFicha(){
  const sel=document.getElementById('fichaSelector');
  if(!sel)return;
  const todos=(workers||[]).concat(todosWorkers||[]);
  const lista=[...new Map(todos.filter(w=>w&&w.code).map(w=>[w.code,w])).values()]
    .sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  sel.innerHTML='<option value="">Elige un trabajador</option>'
    +lista.map(w=>'<option value="'+escHtml(w.code)+'">'+escHtml(codigoMostrar(w.code))+' — '+escHtml(w.name||'')+'</option>').join('');
}

function pintarFicha(w){
  // El selector se llena solo, una sola vez. Sin esto, la primera vez que
  // se abre la ficha aparece vacio y hay que entrar por la lista cada vez;
  // la segunda ya esta lleno porque abrirFichaTrabajador lo setea.
  const selTrab=document.getElementById('fichaSelector');
  if(selTrab&&!selTrab.options.length)llenarSelectorFicha();
  const caja=document.getElementById('fichaCuerpo');
  const titulo=document.getElementById('fichaTitulo');
  if(titulo)titulo.textContent=(w.code||'')+' — '+(w.name||'');
  if(!caja)return;

  // Los grupos en el orden en que salen de la lista, sin repetir.
  const grupos=[];
  CAMPOS_FICHA.forEach(c=>{ if(grupos.indexOf(c.grupo)<0)grupos.push(c.grupo); });

  let html='';
  grupos.forEach(grupo=>{
    const delGrupo=CAMPOS_FICHA.filter(c=>c.grupo===grupo);
    const vacios=delGrupo.filter(c=>!valorDeCampo(w,c)).length;
    html+='<section class="fichaGrupo"><h3>'+escHtml(grupo)+'</h3><div class="fichaFilas">';
    delGrupo.forEach(c=>{
      const valor=valorParaArchivo(w,c);
      const vacio=!valor;
      html+='<div class="fichaFila'+(vacio?' vacio':'')+'">'
        +'<div class="fichaDato"><span class="fichaEtiqueta">'+escHtml(c.etiqueta)+'</span>'
        +'<span class="fichaValor">'+(vacio?'<em>sin dato</em>':escHtml(valor))+'</span></div>'
        +'<button type="button" class="btn fichaCopiar" '
        +'onclick="copiarCampoFicha(CAMPOS_FICHA['+CAMPOS_FICHA.indexOf(c)+'],this)" '
        +'title="Copiar el valor de '+escHtml(c.etiqueta)+'">Copiar</button>'
        +'</div>';
    });
    html+='</div>'
      +'<p class="fichaGrupoAviso">'+(vacios?vacios+' sin dato en este grupo':'')+'</p>'
      +'</section>';
  });
  caja.innerHTML=html;

  // Cuantos hay en total. Se avisa, no se bloquea: un campo vacio es
  // normal, y frenar la ficha por eso haria que la gente no la use.
  const faltan=fichaVacia(w);
  const aviso=document.getElementById('fichaResumen');
  if(aviso){
    aviso.textContent=faltan
      ?'Faltan '+faltan+' de '+CAMPOS_FICHA.length+' campos. Se pueden copiar igual: un campo sin dato se copia vacio.'
      :'Esta la ficha completa: '+CAMPOS_FICHA.length+' campos.';
  }
  const sel=document.getElementById('fichaSelector');
  if(sel)sel.value=w.code;
}


// ===================================================================
// LOS TRES NÚMEROS DE LA BARRA
// ===================================================================
//
// Se cuentan sobre lo que YA está cargado en la memoria, y no con una
// consulta nueva. La razón no es ahorrar: es que la pantalla del reloj se
// abre en la portería, muchas veces al mismo tiempo, y una consulta por cada
// marcaje y por cada reloj abierto es exactamente lo que hace que un aparato
// viejo se ponga lento.
//
// CUANDO NO SE SABE, SE ESCRIBE "—"
// ---------------------------------
// Si el rango de marcajes que se tiene cargado no incluye el día de hoy, los
// tres números se quedan en "—". Poner 0 sería peor que no poner nada: 0 dice
// "no marcó nadie", que es un hecho sobre la obra, y en una portería un 0
// falso se cree.
//
// Y no se inventa el dato yendo a buscarlo: en la portería, esperar una
// consulta es peor que no tener el número. Se muestra lo que se sabe.
// -------------------------------------------------------------------
// CARGAR LOS MARCAJES DE HOY, UNA VEZ AL ABRIR EL TÓTEM
// -------------------------------------------------------------------
// Y UNA SOLA VEZ, no una por marcaje. Esa era la razón por la que el código viejo
// no consultaba nada: la pantalla se abre en la portería, muchas veces al mismo
// tiempo, y un aparato viejo se pone lento si cada marcaje va a la base.
//
// La diferencia es que antes no se consultaba NUNCA, y "nunca" en la portería es
// "nunca": no hay nadie abriendo la planilla del día en un aparato de la portería.
// Una consulta al abrir, y después el número vive en la memoria.
//
// Y si falla, se guarda el motivo y se sigue: el reloj tiene que poder MARCAR
// aunque los contadores no se pinten. Un contador que bloquea el marcaje es peor que
// un contador en "—".
async function cargarMarcajesTotem(){
  if(!window.supabaseClient)return;
  totemMarcajesError='';
  try{
    const r=await window.supabaseClient
      .from('marcajes')
      .select('code,fecha,estado,justificacion_id,centro_costo_id')
      .eq('fecha',fechaLocalISO(new Date()))
      .limit(5000);
    if(r.error){
      totemMarcajesCargados=false;
      totemMarcajesError=r.error.message||'sin detalle';
      pintarTotemContadores();
      return;
    }
    // Y SOLO se acepta si el reloj sigue abierto: si alguien cerró el tótem
    // mientras cargaba, el resultado ya no le sirve a nadie y pintar un número en
    // una pantalla cerrada es trabajo perdido.
    if(!totemActual)return;
    totemMarcajesHoy=r.data||[];
    totemMarcajesCargados=true;
    pintarTotemContadores();
  }catch(e){
    totemMarcajesCargados=false;
    totemMarcajesError=(e&&e.message)||'sin detalle';
    pintarTotemContadores();
  }
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
// EL EDITOR DE PLANTILLAS
// ------------------------------------------------------------------
// Un <div contenteditable> con barra de formato, no un <textarea>.
//
// El textarea obliga a guardar texto plano y a reinterpretar los saltos al
// imprimir. El resultado cambia entre navegadores: el mismo papel se ve bien
// en un computador y mal en otro, y eso se descubre cuando ya se firmano
// veinte. Con HTML guardado, lo que se ve en el editor es lo que sale en el
// papel.
//
// execCommand está "obsoleto" según el estándar pero es lo único que da
// formato enriquecido sin instalar una librería de editor entera. Para un
// acta (negrita, cursiva, listas, tamaño) alcanza y sobra.
const CAMPOS_PLANTILLA=[
  ['{{nombre}}','Nombre del trabajador'],
  ['{{codigo}}','Código de 4 dígitos'],
  ['{{rut}}','RUT'],
  ['{{especialidad}}','Especialidad (la de la ficha)'],
  ['{{cargo}}','Cargo'],
  ['{{empresa}}','Nombre de la empresa'],
  ['{{empresa_rut}}','RUT de la empresa'],
  ['{{centro}}','Centro de costo o nombre de la obra'],
  ['{{fecha}}','Fecha de hoy']
];
function renderContratacion(){
  const aviso=document.getElementById('contratacionAvisoGeneral');
  renderPlantillas();
  renderEditorTimbre();
}
// ¿El contenido tiene texto de verdad?
//
// NO se hace con una expresión regular sobre el HTML. El problema concreto:
// una hoja cuyo único contenido es un espacio duro devuelve innerHTML === "&nbsp;",
// que son seis caracteres y no está vacía. Se guardaba una plantilla que en el
// papel es una hoja en blanco, y un papel en blanco firmado no es un error
// visible: es un documento falso.
//
// Se pasa por el DOM y se lee textContent, que es lo que se va a imprimir.
function htmlTieneTexto(html){
  if(!html)return false;
  const div=document.createElement('div');
  div.innerHTML=String(html);
  if(div.querySelector('img,svg,canvas,video'))return true;
  return (div.textContent||'').replace(/\u00a0/g,' ').trim().length>0;
}
function renderPlantillas(){
  const lista=document.getElementById('plantillasLista');
  const aviso=document.getElementById('plantillasAviso');
  if(!lista)return;
  aviso.innerHTML=contratacionError
    ?'<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px;margin-bottom:12px">'+
     '<b>Falta la migración 031_kit_contratacion.sql.</b> <small>'+escHtml(contratacionError)+'</small></div>'
    :(!plantillasContratacion.length
      ?'<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px;margin-bottom:12px">'+
       '<b>No hay ninguna plantilla todavía.</b> <small>Sin plantillas no hay kit. Agregá la primera con "Agregar plantilla".</small></div>'
      :'');
  if(!plantillasContratacion.length){lista.innerHTML='';return;}
  lista.innerHTML=plantillasContratacion.map(p=>{
    const vacio=!htmlTieneTexto(p.contenido);
    const hechas=entregasContratacion.filter(e=>e.plantilla_id===p.id&&e.estado==='completa').length;
    return '<div class="list-item" style="cursor:default;display:block">'+
      '<div><b>'+escHtml(p.nombre)+'</b> <small>'+escHtml(p.code)+' · v'+escHtml(String(p.version))+' · '+
      escHtml(etiquetaTipo(p.tipo))+'</small>'+
      (p.vigente?'':' <span class="pill" style="color:var(--danger);border-color:var(--danger)">No vigente</span>')+
      (vacio?' <span class="pill" style="color:var(--warn);border-color:var(--warn)">Sin contenido</span>':'')+
      '<br><small>'+escHtml(textoDestinoPlantilla(p))+
      (p.firmas==='ninguno'?'':' · firma'+(p.firmas==='trabajador_supervisor'?' del trabajador y del supervisor':' del trabajador'))+
      (hechas?' · '+hechas+' firmada(s)':'')+'</small></div>'+
      '<span style="display:flex;gap:6px;flex:0 0 auto">'+
      '<button class="btn" style="padding:4px 8px;font-size:.8rem" type="button" onclick="abrirEditorPlantilla(\''+escHtml(p.code)+'\')">Editar</button>'+
      (p.vigente
        ?'<button class="btn" style="padding:4px 8px;font-size:.8rem" type="button" onclick="retirarPlantilla(\''+escHtml(p.code)+'\')">Retirar</button>'
        :'<button class="btn" style="padding:4px 8px;font-size:.8rem" type="button" onclick="vigentarPlantilla(\''+escHtml(p.code)+'\')">Volver a usar</button>')+
      '</span></div>';
  }).join('');
}
function actualizarAyudaPlantilla(){
  // ------------------------------------------------------------------
  // EL DESTINO NUEVO, EN LAS TRES FORMAS
  // ------------------------------------------------------------------
  // Antes leía #plantillaEspecialidad, que ya no existe. Con ?.value no rompe,
  // pero la ayuda quedaba siempre con el texto de "a todos", que es lo
  // contrario de lo que la persona eligió. Un aviso que miente es peor que
  // ningún aviso.
  const destino=document.getElementById('plantillaDestino');
  const modo=destino?destino.value:'';
  const grupo=document.getElementById('plantillaGrupo');
  const cargo=document.getElementById('plantillaCargo');
  const gTxt=grupo&&grupo.value?nombreDeGrupo(grupo.value):'';
  const cTxt=cargo&&cargo.value
    ?((jerarquiaCargos.find(f=>f.cargo===cargo.value)||{}).cargoNombre||cargo.value)
    :'';

  const conSup=document.getElementById('plantillaFirmas').value!=='ninguno';
  const esCharla=document.getElementById('plantillaTipo').value==='charla';
  document.getElementById('plantillaAyuda').innerHTML=
    (modo==='grupo'
      ?'Le toca a <b>todo el grupo '+(gTxt?escHtml(gTxt):'(sin elegir)')+'</b>, sea del cargo que sea dentro de él. '
       +'A los demás no les llega, aunque tengan otro cargo de la misma empresa.'
      :modo==='cargo'
        ?'Le toca <b>solo a '+(cTxt?escHtml(cTxt):'(sin elegir)')+'</b>. Para que también la reciban los demás del mismo '
         +'oficio, hacé otra plantilla igual pero apuntando al grupo.'
        :'Le toca a <b>todos</b> los trabajadores, tengan el cargo que tengan. Es para seguridad general.')+
    (esCharla
      ?'<br>Una charla es para explicarla: texto corrido, y los {{campos}} donde vaya el nombre.'
      :'')+
    (document.getElementById('plantillaFirmas').value==='ninguno'
      ?'<br>No se firma nadie. Se usa para los avisos informativos, que se entregan pero no se firman.'
      :(document.getElementById('plantillaFirmas').value==='trabajador'
        ?'<br>Se firma solo el trabajador. Para las actas que llevan una sola firma.'
        :'<br>Se firma el trabajador <b>y</b> el supervisor: si falta una de las dos, no se guarda.'));
}
async function abrirEditorPlantilla(code){
  if(!exigirPermiso('contratacion.editar','No tienes permiso para escribir las plantillas.'))return;
  // Si este navegador no deja leer el portapapeles, el botón de Word lo
  // tiene que decir al apretarlo. Se comprueba al abrir, sin pedir
  // permiso: preguntar al cargar asusta con un cartel que nadie
  // entiende y casi siempre se responde que no.
  comprobarLecturaPegada();
  const p=code?plantillasContratacion.find(x=>x.code===code):null;
  const dlg=document.getElementById('dlgPlantilla');
  document.getElementById('plantillaTitulo').textContent=p?('Editar '+p.nombre):'Agregar plantilla';
  document.getElementById('plantillaError').textContent='';
  document.getElementById('plantillaCode').value=p?p.code:'';
  document.getElementById('plantillaCode').readOnly=!!p;
  document.getElementById('plantillaNombre').value=p?p.nombre:'';
  document.getElementById('plantillaTipo').value=p?p.tipo:'charla';
  document.getElementById('plantillaOrden').value=p?p.orden:100;
  // Antes era una caja de sí/no. Con la columna nueva hay tres casos, y
  // una caja de dos no alcanza: el caso "nadie firma" se confundía con
  // "solo el trabajador".
  document.getElementById('plantillaFirmas').value=
    p?(p.firmas||'trabajador_supervisor'):'trabajador_supervisor';
  llenarDestinoPlantilla(p);
  document.getElementById('plantillaEditor').innerHTML=p?(p.contenido||''):
    '<h2>Inducción</h2><p>Bienvenido a la obra. Tu supervisor es {{nombre}}.</p>';
  actualizarAyudaPlantilla();
  dlg.showModal();
  if(!p)document.getElementById('plantillaNombre').focus();
}
async function guardarPlantilla(){
  const dlg=document.getElementById('dlgPlantilla');
  const err=document.getElementById('plantillaError');
  const btn=document.getElementById('plantillaGuardar');
  const code=document.getElementById('plantillaCode').value.trim().toUpperCase();
  const nombre=document.getElementById('plantillaNombre').value.trim();
  const contenido=document.getElementById('plantillaEditor').innerHTML.trim();
  err.textContent='';
  if(!code){err.textContent='Falta el código. Es el que identifica la plantilla.';return;}
  if(!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(code)){
    err.textContent='El código solo puede tener letras, números, punto y guion. Sin espacios.';
    return;
  }
  if(!nombre){err.textContent='Falta el nombre.';return;}
  if(!htmlTieneTexto(contenido)){
    err.textContent='La plantilla está vacía. Un papel sin texto no se puede firmar.';
    return;
  }
  const cuerpo={
    nombre,
    tipo:document.getElementById('plantillaTipo').value,
    // Las DOS columnas del destino, y solo una puede venir puesta. Es lo que
    // dice la frase "le toca a": o todo el mundo, o un grupo, o un cargo. Las
    // dos puestas no significan nada, y hay un CHECK en la base que lo rechaza
    // por si acaso.
    grupo_clave:document.getElementById('plantillaDestino').value==='grupo'
      ?(document.getElementById('plantillaGrupo').value||null):null,
    especialidad_clave:document.getElementById('plantillaDestino').value==='cargo'
      ?(document.getElementById('plantillaCargo').value||null):null,
    orden:Number(document.getElementById('plantillaOrden').value)||100,
    firmas:document.getElementById('plantillaFirmas').value||'trabajador_supervisor',
    contenido
  };
  btn.disabled=true;btn.textContent='Guardando…';
  let error=null;
  const existente=plantillasContratacion.find(x=>x.code===code);
  if(existente){
    // La versión sube SOLO si el texto cambió. Guardar sin tocar el texto
    // también subiría la versión, y eso dejaría inválidos todos los papeles
    // que se firmaron de esa plantilla y que nadie iba a volver a hacer.
    const textoCambiado=(existente.contenido||'').trim()!==contenido;
    const r=await window.supabaseClient.from('plantillas_contratacion')
      .update({...cuerpo,version:existente.version+(textoCambiado?1:0),updated_at:new Date().toISOString()})
      .eq('code',code);
    error=r.error;
  }else{
    const r=await window.supabaseClient.from('plantillas_contratacion')
      .insert({code,...cuerpo,vigente:true,version:1}).select().single();
    error=r.error;
  }
  btn.disabled=false;btn.textContent='Guardar';
  if(error){
    err.textContent=/duplicate|unique/i.test(error.message)
      ?'Ya existe una plantilla con el código "'+code+'".'
      :(faltaLaMigracion(error,['plantillas_contratacion'])
        ?'La migración 031_kit_contratacion.sql no está aplicada.'
        :'No se pudo guardar: '+error.message);
    return;
  }
  dlg.close();
  await cargarContratacion();
}
async function retirarPlantilla(code){
  const p=plantillasContratacion.find(x=>x.code===code);
  if(!p)return;
  const hechas=entregasContratacion.filter(e=>e.plantilla_id===p.id&&e.estado==='completa').length;
  if(!confirm('Retirar "'+p.nombre+'" del kit?\n\nDeja de aparecer en los kits nuevos. Los papeles ya firmados ('+hechas+') se conservan.\n\nNo se borra la plantilla: queda como "no vigente", para poder volver a usarla.'))return;
  const {error}=await window.supabaseClient.from('plantillas_contratacion').update({vigente:false,updated_at:new Date().toISOString()}).eq('code',code);
  if(error){alert('No se pudo retirar: '+error.message);return;}
  await cargarContratacion();
}
async function vigentesPlantilla(code){
  const {error}=await window.supabaseClient.from('plantillas_contratacion').update({vigente:true,updated_at:new Date().toISOString()}).eq('code',code);
  if(error){alert('No se pudo volver a usar: '+error.message);return;}
  await cargarContratacion();
}
// ------------------------------------------------------------------
// EL TIMBRE
// ------------------------------------------------------------------
function renderEditorTimbre(){
  const box=document.getElementById('timbreEditor');
  if(!box)return;
  if(!configTimbre){
    box.innerHTML='<small>No hay configuración de timbre para esta empresa. Se crea al aplicar la migración 031.</small>';
    return;
  }
  // El timbre pertenece a UNA empresa. Con "todas las empresas" arriba no hay
  // cuál, y antes se imprimía un sello con el nombre en blanco: en un papel
  // firmado, un timbre mudo es peor que ninguno, porque parece que la
  // configuración se olvidó.
  if(!empresaDelPapel()){
    box.innerHTML='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);'
      +'padding:10px 12px;border-radius:8px"><b>Elegí una empresa.</b> <small>'
      +escHtml(avisoSinEmpresaUnica())+'</small></div>';
    return;
  }
  const empresa=empresaDelPapel();
  box.innerHTML=
    '<div class="row">'+
    '<div style="flex:1"><label>Cargo de quien suscribe</label>'+
    '<input id="timbreCargo" value="'+escHtml(configTimbre.cargo||'')+'" onchange="guardarTimbre()"></div>'+
    '<div><label>Giro (grados)</label><input type="number" id="timbreGiro" min="-45" max="45" value="'+escHtml(String(configTimbre.giro_grados))+'" onchange="guardarTimbre()"></div>'+
    '<div><label>Tamaño (%)</label><input type="number" id="timbreTamano" min="50" max="200" step="5" value="'+escHtml(String(configTimbre.tamano))+'" onchange="guardarTimbre()"></div>'+
    '</div>'+
    '<div class="row" style="margin-top:8px">'+
    '<div style="flex:1"><label>Posición</label><select id="timbrePosicion" onchange="guardarTimbre()">'+
    [['inferior_derecha','Abajo a la derecha'],['inferior_izquierda','Abajo a la izquierda'],
     ['superior_derecha','Arriba a la derecha'],['superior_izquierda','Arriba a la izquierda']]
      .map(([v,t])=>`<option value="${v}"${configTimbre.posicion===v?' selected':''}>${t}</option>`).join('')+
    '</select></div>'+
    '<div style="align-self:flex-end;display:flex;gap:14px;flex-wrap:wrap">'+
    '<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="timbreRut"'+
    (configTimbre.incluir_rut?' checked':'')+' onchange="guardarTimbre()"> Mostrar el RUT</label>'+
    '<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="timbreNombreSi"'+
    (configTimbre.nombre_firmante?' checked':'')+' onchange="guardarTimbre()"> Nombre de la persona</label>'+
    '</div></div>'+
    '<label style="display:block;margin-top:8px">Nombre de quien firma (opcional)</label>'+
    '<input id="timbreNombre" value="'+escHtml(configTimbre.nombre_firmante||'')+'" onchange="guardarTimbre()">'+
    '<div class="timbre-prueba" style="margin-top:12px">'+htmlTimbre()+'</div>'+
    '<small style="display:block;margin-top:4px">Así se va a ver en el papel. El nombre de la empresa sale de la pantalla de '+
    'Configuración y no de acá: si el timbre tuviera su propio nombre, algún día los dos dirían cosas distintas '+
    'y en el papel mandaría el que está escrito en el timbre.</small>';
}
async function guardarTimbre(){
  if(!configTimbre)return;
  const cargo=document.getElementById('timbreCargo').value.trim();
  const giro=Number(document.getElementById('timbreGiro').value);
  const tamano=Number(document.getElementById('timbreTamano').value);
  const posicion=document.getElementById('timbrePosicion').value;
  const incluirRut=document.getElementById('timbreRut').checked;
  const nombre=document.getElementById('timbreNombreSi').checked
    ?document.getElementById('timbreNombre').value.trim():null;
  if(!cargo){alert('Falta el cargo de quien suscribe el timbre.');renderEditorTimbre();return;}
  if(!(giro>=-45&&giro<=45)){alert('El giro va entre -45 y 45 grados.');renderEditorTimbre();return;}
  if(!(tamano>=50&&tamano<=200)){alert('El tamaño va entre 50 y 200.');renderEditorTimbre();return;}
  const {error}=await window.supabaseClient.from('configuracion_timbre').update({
    cargo,giro_grados:giro,tamano,posicion,incluir_rut:incluirRut,
    nombre_firmante:nombre,updated_at:new Date().toISOString()
  }).eq('empresa_id',configTimbre.empresa_id);
  if(error){
    // Los rangos los controla la base, y el mensaje de Postgres no dice qué
    // campo era. Se nombra.
    alert(/giro|tamano|posicion|check/i.test(error.message)
      ?'Revisá el giro (−45 a 45), el tamaño (50 a 200) y la posición.\n\nDetalle: '+error.message
      :'No se pudo guardar el timbre: '+error.message);
    renderEditorTimbre();
    return;
  }
  await cargarContratacion();
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
function initKitView(){
  const sel=document.getElementById('kitWorker');
  const anterior=sel.value;
  const vis=codigosVisibles(workers);
  sel.innerHTML='<option value="">Elegí un trabajador…</option>'+
    workers.slice().sort((a,b)=>compararPorCodigo(a.code,b.code)||a.name.localeCompare(b.name))
      .map(w=>`<option value="${escHtml(w.code)}">${escHtml((vis.get(w.code)||codigoMostrar(w.code))+' — '+w.name)}</option>`).join('');
  if([...sel.options].some(o=>o.value===anterior))sel.value=anterior;
  if(sel.value)cargarKitDelTrabajador(sel.value);
  else document.getElementById('kitLista').innerHTML='<small>Elegí un trabajador para ver sus papeles.</small>';
}
async function comprobarContratacion(){
  try{
    const {data,error}=await window.supabaseClient.rpc('diagnostico_contratacion');
    if(error){
      if(faltaLaMigracion(error,['diagnostico_contratacion'])){
        mostrarAvisoPermisos('El kit de contratación NO está puesto: falta aplicar la migración 031_kit_contratacion.sql. '+
          'Sin ella no se pueden generar los papeles firmados.');
      }
      return;
    }
    const d=Array.isArray(data)?data[0]:data;
    if(!d)return;
    const problemas=[];
    if(!d.tabla_plantillas)problemas.push('faltan las plantillas');
    if(!d.tabla_entregas)problemas.push('faltan las entregas');
    if(!d.tabla_timbre)problemas.push('falta el timbre');
    if(!d.fn_kit)problemas.push('falta la función del kit');
    if(!d.fn_firma)problemas.push('falta la función de firma');
    if(problemas.length){
      mostrarAvisoPermisos('El kit de contratación está incompleto ('+problemas.join(', ')+'). Vuelve a aplicar la migración 031_kit_contratacion.sql.');
    }else if(Number(d.sin_contenido)>0){
      mostrarAvisoPermisos('Hay '+d.sin_contenido+' plantilla(s) sin contenido. Un papel vacío no se puede firmar. Se ven en Administración → Editar plantillas y timbre.');
    }
  }catch(error){
    console.info('No se pudo comprobar el kit de contratación:',error.message);
  }
}

// ===================================================================
// ============================================================
// ============================================================
// ============================================================
// EL KIOSCO DEL RELOJ
// ============================================================
//
// LA PANTALLA DEL ANDROID TV BOX
// ------------------------------
// El reloj se deja ahí, en la portería, plugged in, con la pantalla siempre
// encendida. Eso obliga a que la pantalla esté bloqueada: si el trabajador
// puede tocar la barra del navegador o cerrar la pestaña, el reloj deja de
// marcar y nadie se entera hasta que se revisa la asistencia del día.
//
// CÓMO SE SALE
// ------------
// Con el botón no. Con CINCO pulsaciones seguidas en una esquina, y después
// una clave de seis dígitos.
//
// Las cinco pulsaciones no son un adorno: son para que el que está en la
// portería no saque el kiosco sin querer. Un dedo apoyado durante un segundo
// en un kiosco genera cinco eventos de toque.
//
// Y las cinco van en una ESQUINA, no en toda la pantalla. En una obra con
// paso de gente, cinco toques consecutivos en cualquier parte pasan todos los
// días; en la esquina superior izquierda, casi nunca. La esquina es invisible:
// si se le pone un ícono, es un botón de salida, y entonces el bloqueo no
// protege de nada.
//
// POR QUÉ LA CLAVE SE VERIFICA EN EL SERVIDOR Y NO EN EL NAVEGADOR
// ---------------------------------------------------------------
// La clave viaja al servidor, se hashea ahí y se compara con el hash. En el
// navegador nunca hay una clave, y leer el código no sirve para desarmar el
// kiosco. Es lo mismo que se hizo con el token del reloj en la migración 030,
// y por el mismo motivo: un secreto que está en el cliente no es un secreto.
//
// EL BLOQUEO REAL
// ---------------
// `modo-kiosco` oculta la barra del tótem y el botón de salir, quita el
// cursor y bloquea el scroll. NO bloquea el campo de texto, porque el lector
// QR USB escribe por teclado: si el campo no acepta foco, el reloj no marca.
//
// Y no es un candado de verdad contra alguien que sabe lo que hace: con
// DevTools abierto se puede quitar la clase del body. Contra eso está la
// clave del servidor, no el CSS. Lo que el CSS evita es el accidente, que es
// lo que de verdad pasa.
// ============================================================

let kioscoActivo = false;        // ¿está bloqueada la pantalla?
let kioscoPulsas = 0;            // cuántas lleva de las pedidas
let kioscoTemporizador = null;   // reinicia el contador si se corta la racha
let kioscoUltimoToque = 0;
let kioscoPideClave = false;     // la ventana de clave está abierta

const KIOSCO_PULSAS_MAX = 1500;   // ms entre pulsaciones: si pasa más, cuenta desde 1
const KIOSCO_CLAVE_INTENTOS = 5;  // intentos antes de frenar
const KIOSCO_CLAVE_ESPERA = 60000; // ms de freno tras agotar los intentos

// ¿Este reloj debe bloquearse? Un reloj nuevo sí. En el escritorio, para
// probar, se puede apagar desde la pantalla de relojes.
function kioscoDebeBloquear(){
  if(!totemActual)return false;
  return totemActual.kiosco_activo !== false;
}
// Cuántas pulsaciones pide este reloj. La migración lo deja en 5.
function kioscoPulsacionesPedidas(){
  const n=Number(totemActual&&totemActual.kiosco_pulsaciones);
  return (n>=3&&n<=10)?n:5;
}
function armarKiosco(){
  const zona=document.getElementById('totemZonaKiosco');
  if(!zona)return;
  zona.style.display=kioscoDebeBloquear()?'block':'none';
  limpiarZonaKiosco();
}
function limpiarZonaKiosco(){
  kioscoPulsas=0;
  if(kioscoTemporizador){clearTimeout(kioscoTemporizador);kioscoTemporizador=null;}
  const pista=document.getElementById('totemPistaKiosco');
  if(pista)pista.textContent='';
  const zona=document.getElementById('totemZonaKiosco');
  if(zona)zona.style.outline='';
}
// Una pulsación en la esquina.
function pulsacionKiosco(){
  if(!kioscoActivo)return;
  const ahora=Date.now();
  // Una racha se corta si pasa mucho rato entre toques: son cinco followed,
  // no cinco en la vida del reloj.
  if(ahora-kioscoUltimoToque>KIOSCO_PULSAS_MAX)kioscoPulsas=0;
  kioscoUltimoToque=ahora;
  kioscoPulsas++;
  const pedidas=kioscoPulsacionesPedidas();
  // La pista aparece recién en la tercera. Antes sería un contador que le
  // recuerda a cualquiera mirando que hay algo que tocar cinco veces.
  const pista=document.getElementById('totemPistaKiosco');
  if(pista)pista.textContent=kioscoPulsas>=3?('·'.repeat(kioscoPulsas-2)+'·'.repeat(pedidas-kioscoPulsas)):'';
  const zona=document.getElementById('totemZonaKiosco');
  if(zona)zona.style.outline=kioscoPulsas>=3?'1px solid rgba(255,255,255,.14)':'';
  if(kioscoTemporizador)clearTimeout(kioscoTemporizador);
  kioscoTemporizador=setTimeout(()=>{
    if(kioscoPulsas<pedidas)limpiarZonaKiosco();
  },KIOSCO_PULSAS_MAX+400);
  if(kioscoPulsas>=pedidas){
    limpiarZonaKiosco();
    abrirClaveKiosco();
  }
}
function activarKiosco(){
  if(!kioscoDebeBloquear()){kioscoActivo=false;desactivarKiosco();return;}
  kioscoActivo=true;
  document.body.classList.add('modo-kiosco');
  armarKiosco();
  pedirPantallaCompleta();
}
function desactivarKiosco(){
  kioscoActivo=false;
  document.body.classList.remove('modo-kiosco');
  const zona=document.getElementById('totemZonaKiosco');
  if(zona)zona.style.display='none';
  limpiarZonaKiosco();
  document.exitFullscreen&&document.exitFullscreen().catch(()=>{});
}
// El navegador pide pantalla completa solo desde un clic, no desde un
// temporizador. Si se pierde, se avisa una vez y no se insiste: pedirla en
// bucle es la forma de que Chrome la termine bloqueando para siempre.
let avisoPantallaCompleta=false;
function pedirPantallaCompleta(){
  const el=document.documentElement;
  const pedir=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;
  if(!pedir)return;
  if(document.fullscreenElement||document.webkitFullscreenElement)return;
  try{
    const p=pedir.call(el);
    if(p&&p.catch)p.catch(()=>{
      if(!avisoPantallaCompleta){
        mostrarTotem('info','Sin pantalla completa','Podés apretar F11, o tocar dos veces la barra, para salir del modo ventana.');
        avisoPantallaCompleta=true;
      }
    });
  }catch(e){ /* el navegador no lo permite: se sigue igual */ }
}
// ------------------------------------------------------------------
// LA CLAVE
// ------------------------------------------------------------------
// El freno por intentos es lo que hace que una clave de 6 dígitos sea una
// clave. Sin él, un millón de intentos es una tarde de trabajo.
// El contador vive en la sesión, no en el reloj: reiniciar la pantalla
// reinicia el freno, y eso es aceptable porque el que reinicia tiene las
// manos en el aparato.
let intentosClave=0;
let frenoClaveHasta=0;
function abrirClaveKiosco(){
  if(kioscoPideClave)return;
  const ahora=Date.now();
  if(ahora<frenoClaveHasta){
    const seg=Math.ceil((frenoClaveHasta-ahora)/1000);
    mostrarTotem('error','Demasiados intentos',`Quedan ${seg} segundos. Probá con la clave correcta.`);
    return;
  }
  kioscoPideClave=true;
  intentosClave=0;
  const dlg=document.getElementById('dlgClaveKiosco');
  document.getElementById('claveError').textContent='';
  document.getElementById('claveCampo').value='';
  dlg.showModal();
  setTimeout(()=>document.getElementById('claveCampo').focus(),80);
}
async function verificarClaveKiosco(){
  const pin=document.getElementById('claveCampo').value.trim();
  const err=document.getElementById('claveError');
  if(!pin){err.textContent='Escribí la clave.';return;}
  if(!totemActual){err.textContent='No hay un reloj abierto.';return;}
  const {data,error}=await window.supabaseClient.rpc('verificar_pin_reloj',{
    p_code:totemActual.code,p_pin:pin
  });
  if(error){
    // Si la función no existe todavía, es la 033 sin aplicar. Se dice con el
    // nombre del archivo y no con el error crudo de Postgres.
    if(faltaLaMigracion(error,['verificar_pin_reloj'])){
      err.innerHTML='Falta aplicar la migración <b>033_reloj_kiosco.sql</b>.';
    }else{
      err.textContent=escHtml(error.message);
    }
    return;
  }
  if(data===true){
    intentosClave=0;frenoClaveHasta=0;
    kioscoPideClave=false;
    document.getElementById('dlgClaveKiosco').close();
    desactivarKiosco();
    mostrarTotem('ok','Kiosco abierto','Ahora se puede salir de la pantalla de marcaje.');
    return;
  }
  intentosClave++;
  if(intentosClave>=KIOSCO_CLAVE_INTENTOS){
    frenoClaveHasta=Date.now()+KIOSCO_CLAVE_ESPERA;
    intentosClave=0;
    const seg=Math.ceil(KIOSCO_CLAVE_ESPERA/1000);
    err.textContent='Demasiados intentos. Esperá '+seg+' segundos.';
    document.getElementById('dlgClaveKiosco').close();
    mostrarTotem('error','Bloqueado por un momento','La clave queda frenada '+seg+' segundos.');
    return;
  }
  err.textContent='Clave incorrecta. ('+intentosClave+' de '+KIOSCO_CLAVE_INTENTOS+')';
  document.getElementById('claveCampo').value='';
  document.getElementById('claveCampo').focus();
}
function cancelarClaveKiosco(){
  kioscoPideClave=false;
  document.getElementById('dlgClaveKiosco').close();
  document.getElementById('totemCampo').focus();
}

// ============================================================
// GENERAR Y ROTAR LA CLAVE DESDE LA PANTALLA DE RELOJES
// ============================================================
// La clave se ve UNA vez, como el token. Después queda solo el hash. Si se
// pierde, se rota: no hay forma de recuperarla, y no debería haberla.
async function generarClaveReloj(code){
  if(!code)return;
  if(!confirm('Se genera una clave nueva para el reloj '+code+'.\n\nLa clave anterior deja de servir. Se muestra una sola vez: anótala antes de cerrar esta pantalla.\n\n¿Seguir?'))return;
  const {data,error}=await window.supabaseClient.rpc('generar_pin_reloj',{p_code:code});
  if(error){
    if(faltaLaMigracion(error,['generar_pin_reloj'])){
      alert('Falta aplicar la migración 033_reloj_kiosco.sql. Sin ella los relojes no tienen clave de kiosco.');
    }else{
      alert('No se pudo generar la clave: '+error.message);
    }
    return;
  }
  mostrarClaveReloj(String(data),code);
}
function mostrarClaveReloj(clave,code){
  document.getElementById('claveRelojTexto').textContent=clave;
  document.getElementById('claveRelojQuien').textContent=code;
  document.getElementById('dlgClaveReloj').showModal();
}
// ============================================================
// ¿ES UN USUARIO RELOJ?
// ============================================================
//
// Un usuario con SOLO el rol `reloj` no es una persona: es un aparato. No
// tiene panel, no tiene planilla, no tiene nombre de otro trabajador. Lo
// único que hace es marcar.
//
// Por eso la app no le muestra nada más. Si se le dejara el panel, el rol
// serviría para mirar quién sale a qué hora, que es justo lo que no se
// quiere que un reloj vea.
const PERMISOS_DE_MARCAR=['relojes.marcaje','relojes.totem'];
function soyUsuarioReloj(){
  // ANTES DE QUE CARGUEN LOS PERMISOS, ESTA FUNCION DEVUELVE FALSE.
  //
  // Sin esta guarda, el recorrido del catalogo no encuentra nada (todavia
  // esta vacio), no encuentra ningun permiso ajeno, y concluye que esta
  // persona es un aparato. Con eso, el ADMINISTRADOR entra a la app, ve
  // la pantalla de "Cuenta de reloj" y no ve NADA del panel. Es lo que
  // pasó: con el catalogo vacio, "no tiene ningún otro permiso" es
  // cierto de mentira.
  if(typeof misPermisosCargados!=='undefined'&&!misPermisosCargados)return false;
  const catalogo=(typeof catalogoPermisos!=='undefined')?catalogoPermisos:null;
  if(!catalogo||!catalogo.length)return false;
  if(!PERMISOS_DE_MARCAR.some(k=>puede(k)))return false;
  // Que tenga el permiso de marcar NO la convierte en aparato. Lo que la
  // define es no tener NADA mas.
  //
  // Un jefe de turno puede tener el rol reloj y el de supervisor, y a ese
  // no se le esconde el panel: esconderselo seria dejar sin acceso a una
  // persona que si lo necesita, por un permiso que no le hace falta para
  // marcar.
  //
  // Se recorre el catalogo REAL, asi que un permiso que se agregue mas
  // adelante no queda adelante por olvido.
  for(const fila of catalogo){
    const clave=fila&&fila.clave?fila.clave:fila;
    if(PERMISOS_DE_MARCAR.includes(clave))continue;
    if(puede(clave))return false;
  }
  return true;
}
// ------------------------------------------------------------------
// LOS DOS SECRETOS DEL RELOJ, Y POR QUE SON DOS
// ------------------------------------------------------------------
// El TOKEN deja marcar. La CLAVE deja desarmar el kiosco. Son permisos
// distintos, asi que son secretos distintos: que alguien tenga el token de
// un reloj no le da el derecho a desarmar el kiosco de otro.
//
// En la base no hay ninguno de los dos en claro. Solo sus hashes.
// ------------------------------------------------------------------
function mostrarClaveExistente(boton,code){
  // La clave no se puede mostrar: no existe en ningun lado del sistema.
  // Lo que se puede es decir eso, y ofrecer generar una nueva.
  if(confirm('La clave del reloj '+code+' no se puede ver: en la base solo queda su hash.\n\nEs a proposito: si se pudiera leer, alguien con acceso a la base abriria kioscos.\n\nSi la perdió, genero una nueva. La anterior deja de servir.\n\n¿Generar una nueva?')){
    generarClaveReloj(code);
  }
}
// Asignarle un reloj a una cuenta de usuario.
//
// La asignacion va al navegador del usuario reloj, no a la base: es una
// relacion entre una persona y un aparato que esta en una obra, y no un dato
// que otro tenga que ver. Ademas, si estuviera en la base, cada vez que el
// aparato cambiara habria que volver a elegirlo desde el panel.
//
// El codigo del reloj NO es un secreto: va en la URL (/totem/RELOJ-01) y lo
// lee cualquiera que mire la direccion. Lo que protege de verdad es el token,
// que va en el cuerpo de la peticion y no aparece por ningun lado visible.
function asignarRelojAUsuario(code){
  const actual=localStorage.getItem('relojAsignado')||'';
  if(actual===code){localStorage.removeItem('relojAsignado');alert('Se desasigno el reloj '+code+' de esta cuenta.');return;}
  localStorage.setItem('relojAsignado',code);
  alert('Esta cuenta quedo asignada al reloj '+code+'.\n\nPara que sirva, la cuenta tiene que tener el rol Reloj. Con solo ese rol, al entrar va directo a la pantalla de marcaje y no ve el panel.');
}
function abrirTotemPorRelojDelUsuario(){
  // Que reloj tiene asignado este usuario-reloj?
  //
  // La asignacion vive en localStorage y NO en la base, a proposito. Es una
  // relacion entre una persona y un aparato que esta en una obra: si se
  // guardara en la tabla, un administrador tendria que elegir el reloj cada
  // vez que elEquipo cambia de aparato en la obra, que es todos los meses.
  //
  // Y la clave del reloj, que es lo que de verdad protege, si esta en la base.
  const code=localStorage.getItem('relojAsignado')||'';
  if(!code){
    document.body.innerHTML=pantallaDeEsperaReloj();
    return;
  }
  abrirTotem(code);
}
function esconderTodoParaReloj(){
  // Se oculta la navegación y el contenido. La pantalla del tótem es lo
  // único que queda.
  const nav=document.querySelector('nav,#nav,#subNav,.nav,#header,#appHeader');
  if(nav)nav.style.display='none';
  document.body.classList.add('solo-reloj');
}
function pantallaDeEsperaReloj(){
  // Lo que se ve antes de que haya un reloj asignado: explica qué hacer en
  // vez de mostrar un panel vacío con error.
  return '<div style="position:fixed;inset:0;display:flex;align-items:center;'
    +'justify-content:center;background:#0b0f0c;color:#e8f0ea;font-family:system-ui;'
    +'text-align:center;padding:30px">'
    +'<div><h1 style="font-size:26px;margin:0 0 14px">Cuenta de reloj</h1>'
    +'<p style="max-width:460px;line-height:1.5;color:#9fb3a6">Este usuario marca asistencia y no ve nada más.\n\n'
    +'Para usar un reloj, pedile a alguien de soporte que te asigne uno. Después '
    +'entrás con <b>/totem/RELOJ-01</b> y no tenés que hacer nada más.</p></div></div>';
}

// ============================================================
// LOS MARCAJES
// ============================================================
//
// QUÉ ES ESTA PANTALLA
// --------------------
// La tabla `marcajes` es lo que el reloj escribe cada vez que alguien pasa
// su credencial. La planilla (vista `asistencia`) es un RESUMEN de esto: día
// por día, con entrada, salida y horas. Los marcajes son el dato crudo.
//
// POR QUÉ FALTA SI LA PLANILLA YA ESTÁ
// -------------------------------------
// Porque cuando un trabajador dice "yo marqué y no me entró", la pregunta no
// es qué dice la planilla sino qué hay en el marcaje: qué reloj, a qué hora
// exacta, de qué tipo, con qué origen. La planilla ya pasó por el motor de
// cálculo y puede no coincidir con lo que el reloj vio.
//
// Y hay un segundo motivo, que es el importante: el reloj puede estar
// marcado y la planilla vacía. Cuando eso pasa, la causa suele ser que el
// reloj se cayó, que la persona no estaba en la jornada del día, o que la
// marcación quedó en un reloj desactivado. Sin ver los marcajes uno por uno,
// eso no se distingue de "no-worked".
//
// Y TERCERO, que es el que pesa: mientras estos datos se puedan ver y leer
// sin la planilla de por medio, sirve para comparar. Con esto a la vista,
// comparando la lista de marcajes contra el turno del vigilante, la
// diferencia entre lo que dice el reloj y lo que dice la planilla salta a
// la vista sin tener que hacer nada.
//
// LO QUE NO HACE
// --------------
// Esta pantalla NO edita marcajes. Un marcaje es un hecho: pasó o no pasó.
// Editarlo es otra cosa, y esa otra cosa es la vista de asistencia, con su
// motivo y su firma de quien lo hizo.
//
// Los marcajes se muestran y se filtran. Nada más.
// ============================================================

let marcajesCargados=false;
let marcajesDatos=[];
// Antes: {reloj, fecha, tipo, buscar}. Se agrega el centro de costo y el
// rango como par, porque una fecha suelta no puede decir "del lunes al
// viernes", que es la pregunta que se hace cuando alguien denuncia que
// le faltan días.
let filtroMarcajes={reloj:'',centro:'',tipo:'',buscar:'',desde:'',hasta:''};

async function cargarMarcajes(){
  marcajesCargados=false;
  const lista=document.getElementById('marcajesLista');
  const aviso=document.getElementById('marcajesAviso');
  if(!lista)return;
  lista.innerHTML='<small>Cargando…</small>';
  const hoy=new Date();
  // Por defecto los ultimos 7 dias. Es el rango que se mira el 95% de las
  // veces, y son los que caben en pantalla sin paginar de mas.
  const desde=hoy.getTime()-7*24*60*60*1000;
  const {data,error}=await window.supabaseClient
    .from('marcajes')
    .select('*')
    .gte('fecha',new Date(desde).toISOString().slice(0,10))
    .order('fecha',{ascending:false})
    .limit(1000);
  if(error){
    aviso.innerHTML=faltaLaMigracion(error,['marcajes'])
      ?'<div class="aviso-fila">Falta aplicar la migración 017_marcajes_diarios.sql.</div>'
      :'<div class="aviso-fila">No se pudieron cargar los marcajes: '+escHtml(error.message)+'</div>';
    lista.innerHTML='';
    return;
  }
  marcajesDatos=data||[];
  marcajesCargados=true;
  // Se pone el rango que se trajo. Si ya había fechas puestas (se vuelve
  // desde otra vista), no se pisan: el filtro de la persona manda.
  const cajaDesde=document.getElementById('marcajesFiltroDesde');
  const cajaHasta=document.getElementById('marcajesFiltroHasta');
  if(cajaDesde&&cajaHasta&&!cajaDesde.value&&!cajaHasta.value){
    const hoy=new Date();
    cajaDesde.value=fechaLocalISO(new Date(hoy.getTime()-7*24*60*60*1000));
    cajaHasta.value=fechaLocalISO(hoy);
  }
  marcarAtajoMarcajes();
  filtrarMarcajes();
}
function renderMarcajes(){
  const lista=document.getElementById('marcajesLista');
  if(!lista)return;
  if(!marcajesDatos.length){
    lista.innerHTML='<div class="vacio">No hay marcajes cargados. Si esperabas ver marcas,\n      es que la migración 017 no está aplicada, o el reloj no está enviando: el token del\n      aparato no se instaló, o el reloj quedó sin señal.</div>';
    return;
  }
  // El filtro se aplica en memoria. Son 1000 filas, no 100 mil: filtrar en
  // el servidor en cada tecla seria un viaje por la red en cada tecla escrita.
  const f=filtroMarcajes;
  let datos=marcajesDatos;
  if(f.reloj)datos=datos.filter(m=>String(m.reloj_id)===String(f.reloj));
  if(f.tipo)datos=datos.filter(m=>m.tipo===f.tipo);
  // El rango va primero porque es el que más descarta. Comparar fechas
  // como texto funciona porque el formato es AAAA-MM-DD, que ordena
  // lexicográficamente igual que por fecha. Con otro formato, como
  // DD-MM-AAAA que es como lo escribe la gente, esto daríaonsense.
  if(f.desde)datos=datos.filter(m=>String(m.fecha||'')>=f.desde);
  if(f.hasta)datos=datos.filter(m=>String(m.fecha||'')<=f.hasta);
  // El centro de costo se resuelve por el reloj: el marcaje guarda el
  // reloj, y el reloj tiene el centro. No se desnormaliza en el marcaje
  // una columna más para no tener que mirar dos tablas, porque entonces
  // hay que actualizarla cada vez que se mueve un reloj de centro, y ese
  // es un forget que a la larga siempre deja alguna fila vieja.
  if(f.centro){
    // String() en los dos lados, y no === estricto. El <select> entrega
    // texto: sin esto, 1 === '1' es falso y el filtro deja pasar cero
    // marcajes, sin decir nada.
    const enEste=new Set(
      relojes
        .filter(x=>String(x.centro_costo_id)===String(f.centro))
        .map(x=>String(x.id))
    );
    datos=datos.filter(m=>enEste.has(String(m.reloj_id)));
  }
  if(f.buscar){
    const q=f.buscar.toLowerCase();
    datos=datos.filter(m=>{
      const w=workers.find(x=>x.code===m.code);
      const nombre=w?w.name.toLowerCase():'';
      return m.code.toLowerCase().includes(q)||nombre.includes(q)
        ||codigoMostrar(m.code).includes(q);
    });
  }
  // Los mas recientes primero, y dentro del dia el mas reciente arriba.
  datos=datos.slice().sort((a,b)=>{
    if(a.fecha!==b.fecha)return a.fecha<b.fecha?1:-1;
    return (b.hora||'')<(a.hora||'')?-1:1;
  });
  const relojDe=(id)=>{
    const r=relojes.find(x=>x.id===id);
    return r?r.nombre:(id?'(reloj dado de baja)':'(sin reloj)');
  };
  // El centro se saca del reloj, que es donde está guardado. Un marcaje sin
  // reloj (cargado a mano por RRHH) no tiene centro, y se dice: dejarlo en
  // blanco haría creer que se olvidó.
  const centroDeReloj=(id)=>{
    // String() en el id del reloj: el id viene de la fila del marcaje, y
    // se compara contra el id del reloj, que viene de otra consulta. Que
    // los dos sean el mismo tipo no es algo que se pueda dar por hecho.
    const r=relojes.find(x=>String(x.id)===String(id));
    const c=r?centrosCosto.find(x=>String(x.id)===String(r.centro_costo_id)):null;
    return c?(c.code+' · '+c.nombre):(id?'(sin centro)':'(sin reloj)');
  };
  const origenTexto=(o)=>({qr:'QR',excel:'Excel',manual:'A mano',porteria:'Portería',app:'App',reloj:'Reloj',sistema:'Sistema',offline_csv:'CSV sin conexión'})[o]||o;
  lista.innerHTML=
    '<div class="marcajes-tabla">'+
    '<div class="marcajes-cabecera">'+
      '<span class="m1">Fecha</span><span class="m2">Hora</span>'+
      '<span class="m3">Trabajador</span><span class="m4">Marca</span>'+
      '<span class="m5">Origen</span><span class="m6">Reloj</span>'+
      '<span class="m7">Centro de costo</span>'+
    '</div>'+
    datos.map(m=>{
      const w=workers.find(x=>x.code===m.code);
      return '<div class="marcajes-fila">'+
        '<span class="m1">'+escHtml(m.fecha||'')+'</span>'+
        '<span class="m2"><b>'+escHtml((m.hora||'').slice(0,5))+'</b></span>'+
        '<span class="m3">'+escHtml(codigoMostrar(m.code))+' · '+escHtml(w?w.name:m.code)+
          (m.registrado_por_nombre?'<small> por '+escHtml(m.registrado_por_nombre)+'</small>':'')+'</span>'+
        '<span class="m4">'+(m.tipo==='entrada'?'Entrada':m.tipo==='salida'?'Salida':escHtml(m.tipo))+'</span>'+
        '<span class="m5">'+escHtml(origenTexto(m.origen))+'</span>'+
        '<span class="m6">'+escHtml(relojDe(m.reloj_id))+'</span>'+
      '<span class="m7">'+escHtml(centroDeReloj(m.reloj_id))+'</span>'+
      '</div>';
    }).join('')+
    '</div>'+
    '<div style="margin-top:8px;font-size:.85rem;color:var(--muted)">Mostrando '+
      datos.length+' de '+marcajesDatos.length+' marcajes cargados.'+
      descripcionFiltroMarcajes()+'</div>';
}
function filtrarMarcajes(){
  const rango=leerRangoMarcajes();
  filtroMarcajes={
    reloj:document.getElementById('marcajesFiltroReloj')?.value||'',
    centro:document.getElementById('marcajesFiltroCentro')?.value||'',
    tipo:document.getElementById('marcajesFiltroTipo')?.value||'',
    buscar:document.getElementById('marcajesBuscar')?.value.trim()||'',
    desde:rango.desde,
    hasta:rango.hasta
  };
  renderMarcajes();
}
function llenarFiltroRelojesMarcajes(){
  const sel=document.getElementById('marcajesFiltroReloj');
  if(!sel)return;
  const actual=sel.value;
  sel.innerHTML='<option value="">Todos los relojes</option>'+
    relojes.map(r=>'<option value="'+escHtml(r.id)+'">'+escHtml(r.nombre)+'</option>').join('');
  if([...sel.options].some(o=>o.value===actual))sel.value=actual;
}

// ------------------------------------------------------------------
// EL CENTRO DE COSTO
// ------------------------------------------------------------------
// El filtro por reloj no contesta "¿quién trabajó en la obra Norte?". El
// reloj es el aparato; el centro de costo es contra qué se paga, y es lo que
// necesita la planilla. Son dos cosas distintas y se piden las dos.
function llenarFiltroCentrosMarcajes(){
  const sel=document.getElementById('marcajesFiltroCentro');
  if(!sel)return;
  const actual=sel.value;
  sel.innerHTML='<option value="">Todos los centros</option>'+
    centrosCosto.map(c=>'<option value="'+escHtml(c.id)+'">'+escHtml(c.code)+' — '+escHtml(c.nombre)+'</option>').join('');
  if([...sel.options].some(o=>o.value===actual))sel.value=actual;
}

// ------------------------------------------------------------------
// EL RANGO
// ------------------------------------------------------------------
function leerRangoMarcajes(){
  return {
    desde:document.getElementById('marcajesFiltroDesde')?.value||'',
    hasta:document.getElementById('marcajesFiltroHasta')?.value||''
  };
}

// La fecha local, en AAAA-MM-DD.
//
// toISOString() NO sirve: convierte a UTC, y Chile está cuatro horas atrás.
// Entre las 20:00 y las 24:00 devuelve el día SIGUIENTE. Un filtro de "hoy"
// que a las 21:00 muestra las marcas de mañana no es un detalle de formato:
// hace creer que alguien@Api marcó antes de existir.
function fechaLocalISO(d){
  return d.getFullYear()+'-'
    +String(d.getMonth()+1).padStart(2,'0')+'-'
    +String(d.getDate()).padStart(2,'0');
}

// ------------------------------------------------------------------
// LOS ATAJOS
// ------------------------------------------------------------------
// Escriben las fechas y llaman al filtrado, que es el mismo camino que el
// resto del filtro. No hay atajos con lógica aparte: si la hubiera, el atajo
// y el filtro se desincronizan sin que nadie lo note hasta que las cifras no
// cuadran con la planilla.
function atajoMarcajes(cual){
  const hoy=new Date();
  if(cual==='hoy'){return ponerRangoMarcajes(fechaLocalISO(hoy),fechaLocalISO(hoy));}
  if(cual==='ayer'){
    const a=new Date(hoy);a.setDate(a.getDate()-1);
    return ponerRangoMarcajes(fechaLocalISO(a),fechaLocalISO(a));
  }
  if(cual==='semana'){
    // Últimos 7 días, el mismo rango que trae la carga. No es "la semana
    // laboral": es "la semana pasada", que es lo que se pregunta cuando
    // alguien denuncia que le faltan días.
    const d=new Date(hoy);d.setDate(d.getDate()-7);
    return ponerRangoMarcajes(fechaLocalISO(d),fechaLocalISO(hoy));
  }
  if(cual==='todo')return ponerRangoMarcajes('','');
}
function ponerRangoMarcajes(desde,hasta){
  const a=document.getElementById('marcajesFiltroDesde');
  const b=document.getElementById('marcajesFiltroHasta');
  if(a)a.value=desde;
  if(b)b.value=hasta;
  marcarAtajoMarcajes();
  filtrarMarcajes();
}
function marcarAtajoMarcajes(){
  const hoy=fechaLocalISO(new Date());
  const a=document.getElementById('marcajesFiltroDesde')?.value||'';
  const b=document.getElementById('marcajesFiltroHasta')?.value||'';
  document.querySelectorAll('[data-marcajes-atajo]').forEach(x=>{
    const c=x.dataset.marcajesAtajo;
    let activo=false;
    if(c==='hoy')activo=(a===hoy&&b===hoy);
    if(c==='todo')activo=(!a&&!b);
    if(c==='ayer'||c==='semana')activo=false;
    x.classList.toggle('activo',activo);
  });
}

// ------------------------------------------------------------------
// QUÉ SE ESTÁ VIENDO
// ------------------------------------------------------------------
// El pie decía siempre "de los últimos 7 días", estén o no los filtros
// puestos. Con un filtro activo, ese texto pasa por cierto: la persona ve
// 6 marcajes y un rótulo que dice que hay 100. Se escribe lo que hay.
function descripcionFiltroMarcajes(){
  const f=filtroMarcajes;
  const partes=[];
  if(f.buscar)partes.push('trabajador "'+f.buscar+'"');
  if(f.centro){
    const c=centrosCosto.find(x=>String(x.id)===String(f.centro));
    partes.push('centro '+(c?c.code:'(desconocido)'));
  }
  if(f.reloj){
    const r=relojes.find(x=>String(x.id)===String(f.reloj));
    partes.push('reloj '+(r?r.nombre:'(desconocido)'));
  }
  if(f.tipo)partes.push('tipo '+(f.tipo==='entrada'?'entrada':f.tipo==='salida'?'salida':f.tipo.replace('colacion_','colación ')));
  if(f.desde||f.hasta){
    partes.push(f.desde&&f.hasta?(f.desde===f.hasta?('el '+f.desde):('del '+f.desde+' al '+f.hasta))
      :(f.desde?('desde el '+f.desde):('hasta el '+f.hasta)));
  }
  if(!partes.length)return' Sin filtros: todo lo cargado.';
  return' Filtros: '+partes.join(', ')+'.';
}

// KIT DE CONTRATACIÓN
// ============================================================
async function cargarCatalogosPermisos(){
  const [r1,r2,r3]=await Promise.all([
    window.supabaseClient.from('roles_sistema').select('*').order('orden'),
    window.supabaseClient.from('permisos').select('*').order('categoria').order('orden'),
    window.supabaseClient.from('roles_permisos').select('rol,permiso')
  ]);
  catalogoRoles=(r1.data||[]);
  catalogoPermisos=(r2.data||[]);
  const filas=(r3.data||[]);
  const asignados=new Set(filas.map(x=>x.rol+'|'+x.permiso));
  // permiso -> lista de roles que lo tienen. Se usa para avisar cuando un
  // permiso no lo tiene nadie fuera de Administración.
  const porPermiso=new Map();
  filas.forEach(x=>{
    if(!porPermiso.has(x.permiso))porPermiso.set(x.permiso,[]);
    porPermiso.get(x.permiso).push(x.rol);
  });
  return {asignados,porPermiso};
}
async function renderPermisos(){
  const host=document.getElementById('permisosGrid');
  if(!host)return;
  if(!exigirPermiso('sistema.permisos','Solo un administrador puede configurar los permisos.'))return;
  const {asignados,porPermiso}=await cargarCatalogosPermisos();
  if(!catalogoPermisos.length){
    host.innerHTML='<small>No hay catálogo de permisos. Ejecuta la migración 013.</small>';
    return;
  }
  const categorias=[...new Set(catalogoPermisos.map(p=>p.categoria))];
  // Aviso arriba de todo cuando hay vistas que nadie puede abrir. Estas
  // vistas se ven en el menú bloqueadas con candado, pero desde la lista de
  // permisos no se nota que a nadie le falten, que es el otro lado del
  // mismo problema: acá se ven las casillas vacías sin que nadie sepa que
  // la consecuencia es que la sección no abre para nadie.
  const sinNadie=[...porPermiso.entries()]
    .filter(([,roles])=>!roles.some(r=>r!=='admin'))
    .map(([permiso])=>permiso);
  // A qué sección abre cada permiso. La casilla parece abstracta si no se
  // dice qué se deshabilita al desmarcarla, y alguien la desmarca sin
  // querer; después el usuario dice "no veo la sección" y no hay forma de
  // llegar a esta pantalla.
  const vistasDe=(permiso)=>Object.entries(VISTAS_POR_PERMISO)
    .filter(([,p])=>p===permiso)
    .map(([v])=>v.replace(/^v-/,''));
  const aviso=sinNadie.length
    ? `<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px;margin-bottom:12px">
        <b>Hay ${sinNadie.length} permiso(s) que solo tiene Administración:</b> ${sinNadie.map(x=>escHtml(x)).join(', ')}.<br>
        <small>Las secciones que dependen de esos permisos se ven en el menú con un candado, y no abren para nadie más que Administración. Marcá la casilla en el rol que las debería usar.</small>
       </div>`
    : '';
  host.innerHTML=aviso+categorias.map(cat=>{
    const perms=catalogoPermisos.filter(p=>p.categoria===cat);
    return `<div style="margin-bottom:16px">
      <h3 style="margin:0 0 6px;font-size:.95rem">${cat}</h3>
      <div class="overflow"><table>
        <thead><tr><th>Permiso</th>${catalogoRoles.map(r=>`<th title="${r.descripcion||''}">${r.nombre}</th>`).join('')}</tr></thead>
        <tbody>${perms.map(p=>{
          const vs=vistasDe(p.clave);
          return `<tr>
          <td style="text-align:left"><b>${escHtml(p.clave)}</b><br><small>${escHtml(p.descripcion)}</small>${
            vs.length?`<br><small style="opacity:.8">Abre: ${vs.map(escHtml).join(', ')}</small>`:''}</td>
          ${catalogoRoles.map(r=>`<td style="text-align:center"><input type="checkbox" data-rol="${r.rol}" data-permiso="${escHtml(p.clave)}" ${asignados.has(r.rol+'|'+p.clave)?'checked':''} onchange="guardarPermiso(this)"></td>`).join('')}
        </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
  }).join('');
}
async function guardarPermiso(checkbox){
  if(!exigirPermiso('sistema.permisos')){checkbox.checked=!checkbox.checked;return;}
  const rol=checkbox.dataset.rol;
  const permiso=checkbox.dataset.permiso;
  if(rol==='admin'&&!checkbox.checked){
    alert('El rol admin siempre tiene todos los permisos: no se pueden quitar.');
    checkbox.checked=true;
    return;
  }
  const {error}=checkbox.checked
    ?await window.supabaseClient.from('roles_permisos').insert({rol,permiso})
    :await window.supabaseClient.from('roles_permisos').delete().eq('rol',rol).eq('permiso',permiso);
  if(error){
    alert('No se pudo guardar el permiso: '+error.message);
    checkbox.checked=!checkbox.checked;
  }
}

// ---------- desvinculación ----------
// Desvincular ahora es `abrirDesvinculacion`, que pide la fecha de término
// y el artículo (migración 029). Esta función quedó solo como el aviso de
// herramientas sin devolver, que tiene que salir ANTES del cuadro: si se
// descubre al confirmar, el descuento del finiquito ya se anotó en la
// cabeza de la persona.
async function desvincularWorker(code){
  const w=workers.find(x=>x.code===code);
  if(!w)return;
  const pendientes=toolAssignments.filter(a=>a.code===code&&!a.devuelta);
  if(pendientes.length){
    const total=pendientes.reduce((s,a)=>s+Number(a.precio||0),0);
    const detalle=pendientes.map(a=>`- ${a.herramienta_nombre||'herramienta'}: $${Number(a.precio||0).toLocaleString('es-CL')}`).join('\n');
    alert(`⚠️ ${w.name} tiene herramientas sin devolver:\n${detalle}\n\nTotal a descontar del finiquito: $${total.toLocaleString('es-CL')}`);
  }
  // Las tarjetas se avisan acá y no después de guardar, porque después de
  // guardar ya no hay vuelta atrás. El aviso va primero a propósito: es
  // información que la persona necesita antes de confirmar, no después.
  const suyas=tarjetas.filter(t=>t.code===code&&t.estado==='activa');
  if(suyas.length){
    alert(`Esta ficha tiene ${suyas.length} tarjeta(s) en estado activo. `+
      'Se bloquean solas al desvincular, así que la tarjeta deja de servir para pasar asistencia.');
  }
  abrirDesvinculacion(code);
}

function exportPayroll(){
  const y=parseInt(document.getElementById('expYear').value);
  const m=parseInt(document.getElementById('expMonth').value);
  const nd=daysInMonth(y,m);
  const rows=[];
  workers.forEach(w=>{
    for(let d=1;d<=nd;d++){
      const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const rec=attendance.find(a=>a.code===w.code&&a.date===iso);
      if(rec && ['F','P','L','A','PP','V'].includes(rec.estado)){
        rows.push({codigo:w.code,nombre:w.name,fecha:iso,estado:rec.estado,nota:rec.nota||'',codigo_inasistencia:''});
      }
    }
  });
  if(rows.length===0){alert('No hay permisos/licencias/inasistencias registradas en ese mes.');return;}
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Carga');
  XLSX.writeFile(wb,`carga_remuneraciones_${y}-${String(m).padStart(2,'0')}.xlsx`);
}

// ===================================================================
// EL ENCABEZADO SE ENCOGE AL BAJAR
// ===================================================================
//
// Tres bloques y un diálogo. Todo se apoya en la 050 y la 051, que ya están
// aplicadas: esto no agrega migraciones, es la pantalla que faltaba.
//
// -------------------------------------------------------------------
// LA LISTA VIENE DE LA BASE, NO DE AQUÍ
// -------------------------------------------------------------------
// jerarquia_cargos() ya trae el filtro por empresa de la 050. Si esta pantalla
// cruzara los datos por su cuenta estaría haciendo en el navegador lo que la
// base ya hace, y un día las dos cosas no coinciden y no se sabe cuál manda.
//
// Y el filtro es lo que importa: una empresa que no maneja gasfitería no debe
// ofrecerla, porque alguien la elige y recibe un kit que ahí no existe.
// -------------------------------------------------------------------
let ecEmpresaId=null;

function empresaDeCargos(){
  const sel=document.getElementById('ecEmpresa');
  if(sel&&sel.value)return parseInt(sel.value,10);
  return ecEmpresaId;
}
function nombreDeEmpresaCargos(id){
  const lista=(typeof empresas!=='undefined'&&empresas)?empresas:[];
  const e=lista.find(x=>mismoId(x.id,id));
  return e?e.nombre:'';
}

async function cargarEmpresasCargos(){
  const sel=document.getElementById('ecEmpresa');
  const aviso=document.getElementById('ecAviso');
  if(!sel)return;
  const lista=(typeof empresas!=='undefined'&&empresas)?empresas:[];

  if(!sel.options.length&&lista.length){
    const antes=sel.value;
    sel.innerHTML='<option value="">Todas las empresas</option>'
      +lista.map(e=>'<option value="'+escHtml(String(e.id))+'">'+escHtml(e.nombre||'')+'</option>').join('');
    if(antes&&[...sel.options].some(o=>o.value===antes))sel.value=antes;
  }
  ecEmpresaId=empresaDeCargos();
  await cargarJerarquiaCargos(true);
  renderEmpresasCargos();
  if(!aviso)return;
  aviso.textContent=ecEmpresaId
    ?'Editando: '+(nombreDeEmpresaCargos(ecEmpresaId)||('empresa #'+ecEmpresaId))
    :'Estás viendo todas las empresas. Las casillas de abajo no se pueden marcar sin elegir una: '
     +'activar un cargo es activarle a UNA empresa, no a todas.';
}

function renderEmpresasCargos(){
  renderGruposCargos();
  renderCargosDeEmpresa();
}

// -------------------------------------------------------------------
// LOS GRUPOS
// -------------------------------------------------------------------
// Salen de la misma jerarquía, sin pedir nada extra. Un grupo que no aparece es
// que no hay ningún cargo en él, y eso se ve distinto de "el grupo no existe".
// -------------------------------------------------------------------
// LE TOCA A: TODOS, UN GRUPO, O UN CARGO
// -------------------------------------------------------------------
// El texto de la lista. Dice a QUIÉN le toca y con qué palabras, porque "obra"
// y "maestro" son cosas distintas y una lista que solo muestra la clave obliga
// a saber la clave de memoria.
//
// Y las tres respuestas se distinguen a propósito: "A todo el mundo" no es lo
// mismo que "al grupo obra", y confundirlas es como se terminaba mandando la
// charla de una obra al personal de oficina.
function textoDestinoPlantilla(p){
  if(p&&p.grupo_clave){
    const g=jerarquiaCargos.find(f=>f.grupo===p.grupo_clave);
    return 'A todo el grupo '+(g?(g.grupoNombre||p.grupo_clave):p.grupo_clave);
  }
  if(p&&p.especialidad_clave)return 'Solo a '+(especialidadNombre(p.especialidad_clave)||p.especialidad_clave);
  return 'A todo el mundo';
}

function renderGruposCargos(){
  const caja=document.getElementById('ecGrupos');
  if(!caja)return;
  const vistos={};
  const filas=[];
  jerarquiaCargos.forEach(f=>{
    if(!f.grupo||vistos[f.grupo])return;
    vistos[f.grupo]=1;
    const n=jerarquiaCargos.filter(x=>x.grupo===f.grupo).length;
    filas.push('<div class="ecFila">'
      +'<div><b>'+escHtml(f.grupoNombre||f.grupo)+'</b> <small style="color:var(--muted)">'
      +n+' cargo'+(n===1?'':'s')+'</small></div>'
      +'<div><small style="color:var(--muted)">clave: '+escHtml(f.grupo)+'</small></div>'
      +'</div>');
  });
  caja.innerHTML=filas.length?filas.join('')
    :'<small style="color:var(--muted)">Todavía no hay grupos. Crea el primero: sin un grupo, los cargos no se pueden ordenar en el desplegable anidado del ingreso.</small>';
}

async function crearGrupoDesdePantalla(){
  const inp=document.getElementById('ecGrupoNombre');
  const aviso=document.getElementById('ecAviso');
  if(!inp)return;
  const nombre=inp.value.trim();
  if(!nombre){if(aviso)aviso.textContent='Escribe el nombre del grupo.';return;}
  const {data,error}=await window.supabaseClient.rpc('gestionar_grupo',{
    p_clave:null,p_nombre:nombre,p_orden:900,p_activo:true
  });
  if(error){
    if(aviso)aviso.textContent='No se pudo crear el grupo: '+error.message;
    return;
  }
  inp.value='';
  // La función "gestionar_grupo" devuelve TEXT: lo que vuelve es la clave, no
  // una tabla. Pedir una propiedad llamada "gestionar_grupo" sobre un texto
  // devuelve "undefined", y el "|| ''" no lo frenaba porque un valor indefinido
  // es verdadero y el operador cortaba ahí. El mensaje terminaba diciendo
  // 'Grupo creado con la clave "undefined"', con el grupo creado de verdad.
  const clave=typeof data==='string'?data.trim():'';
  if(!clave){
    // Si no hay clave legible, NO se inventa una. Un grupo existe o no existe:
    // conviene volver a mirarlo antes de decir que se creó.
    await cargarJerarquiaCargos(true);
    renderEmpresasCargos();
    if(aviso)aviso.textContent='El grupo se guardó, pero no se pudo leer la clave con la que quedó. Vuelve a mirarlo en la lista.';
    return;
  }
  if(aviso)aviso.textContent='Grupo creado con la clave "'+clave+'".';
  await cargarJerarquiaCargos(true);
  renderEmpresasCargos();
}

// -------------------------------------------------------------------
// LOS CARGOS DE ESTA EMPRESA
// -------------------------------------------------------------------
// La casilla manda un pedido a la base y, si la base dice que no, vuelve atrás.
// Un checkbox que se queda marcado cuando el pedido falló está mintiendo, y
// peor: hace creer que el sistema anda raro cuando lo que falla es el permiso.
//
// Y sin empresa elegida las casillas van apagadas: activar un cargo es
// activarle a UNA empresa. No hay "activar a todas" que signifique algo.
function renderCargosDeEmpresa(){
  const caja=document.getElementById('ecCargos');
  if(!caja)return;
  if(!jerarquiaCargos.length){
    caja.innerHTML='<small style="color:var(--muted)">No hay cargos. Carga la lista con el botón de arriba.</small>';
    return;
  }
  const emp=empresaDeCargos();
  const porGrupo={};
  jerarquiaCargos.forEach(f=>{
    const g=f.grupo||'general';
    if(!porGrupo[g])porGrupo[g]={nombre:f.grupoNombre||g,cargos:[]};
    porGrupo[g].cargos.push(f);
  });
  const grupos=Object.keys(porGrupo)
    .sort((a,b)=>String(porGrupo[a].nombre).localeCompare(String(porGrupo[b].nombre)));

  caja.innerHTML=grupos.map(g=>{
    const b=porGrupo[g];
    return '<div class="ecGrupo"><div class="ecGrupoNombre">'+escHtml(b.nombre)+'</div>'
      +b.cargos.map(f=>
        // La clave va en un data-cargo, NO dentro del onclick. Con el onclick
        // había que meter la clave entre comillas simples, dentro de un
        // atributo que ya estaba entre comillas dobles, dentro de una cadena de
        // JavaScript: tres niveles y un escapado. Se escribía mal y el parser
        // señalaba el error dos líneas más arriba de donde estaba el problema.
        //
        // Con el atributo no hay nada que escapar, y el escuchador de más abajo
        // lee la clave de ahí. La clave va también en el title, porque quien
        // configura necesita el nombre y la clave importa para el sistema.
        '<label class="ecCargo'+(emp!=null?'':' apagado')+'" data-cargo="'+escHtml(f.cargo)+'"'+escHtml('')
          +' title="clave: '+escHtml(f.cargo)+'">'+escHtml('')
          +'<input type="checkbox"'+(emp!=null?' checked':'')+'>'+escHtml('')
          +'<span>'+escHtml(f.cargoNombre||f.cargo)+'</span>'
          +'</label>'
      ).join('')
      +'</div>';
  }).join('')
  conectarCajasDeCargos(caja);
  +'Desactivar un cargo lo saca del desplegable del ingreso, pero no borra a nadie: los trabajadores que lo '
  +'tienen lo conservan, y el EPP y las charlas ya entregadas siguen en el historial.</small>';
}

async function activarCargoDeEmpresa(cargo,activo,casilla){
  const aviso=document.getElementById('ecAviso');
  const espId=especialidadIdDeClave(cargo);
  if(!espId){
    if(casilla)casilla.checked=!activo;
    if(aviso)aviso.textContent='Ese cargo no está en el catálogo.';
    return;
  }
  const {error}=await window.supabaseClient.rpc('activar_especialidad_empresa',{
    p_empresa_id:empresaDeCargos(),p_especialidad_id:espId,p_activa:activo
  });
  if(error){
    if(casilla)casilla.checked=!activo;
    if(aviso)aviso.textContent='No se pudo cambiar: '+error.message;
    return;
  }
  if(aviso)aviso.textContent=(activo?'Activado: ':'Desactivado: ')+cargo;
  await cargarJerarquiaCargos(true);
  renderEmpresasCargos();
}

// -------------------------------------------------------------------
// UN SOLO ESCUCHADOR PARA TODAS LAS CASILLAS
// -------------------------------------------------------------------
// Las casillas se pintan y se borran cada vez que se elige otra empresa, así que
// el escuchador va en la CAJA y no en cada casilla. Uno solo, para todas, y no
// se acumula ninguno.
//
// Y la clave sale del data-cargo del label, no del onclick. Por eso aquí no hay
// ninguna comilla que escapar.
// -------------------------------------------------------------------
// LAS VENTANITAS DE AYUDA
// -------------------------------------------------------------------
// Tres cosas que un <details> no trae solo:
//
//   1. Cerrar con Escape. Una ventana que no se cierra con Escape hay que
//      cerrarla volviendo a apretar el ícono a ciegas.
//   2. Cerrar las demás al abrir una. Si quedan dos abiertas, la pantalla se
//      llena de cajas y ya no se sabe cuál es cuál.
//   3. Cerrar al hacer clic afuera, que es lo que uno espera sin pensarlo.
//
// Y solo se escucha una vez en todo el documento. Si se pusiera un
// escuchador por ayuda, abrir y cerrar la pantalla los acumularía.
//
// Se usa el evento "toggle" y no el clic, porque el clic no se dispara
// cuando el <details> se abre con el teclado.
// -------------------------------------------------------------------
// EL LOGO LLEVA A LA PANTALLA PRINCIPAL
// -------------------------------------------------------------------
// Es un <a> con href, y no un <div> con un onclick. La diferencia no es de
// estilo: es que con un <a> el logo se puede abrir en una pestaña nueva, se
// puede copiar el enlace y se puede llegar con el teclado. Con un <div> no.
//
// El preventDefault lo deja dentro de la aplicación: si no, el navegador
// saltaría al ancla y recargaría la página, que en una aplicación de una
// sola pantalla pierde todo lo que estaba cargado.
//
// Y sube al tope, porque si la persona estaba media página abajo, cambiar de
// vista sin volver arriba la deja mirando la parte de en medio de la
// pantalla nueva, que está en blanco.
function irAlInicio(ev){
  if(ev&&ev.preventDefault)ev.preventDefault();
  if(typeof showView==='function')showView('nuevo-trabajador');
  window.scrollTo(0,0);
}

// -------------------------------------------------------------------
// EL MENÚ DEL MÓVIL
// -------------------------------------------------------------------
// Un botón abre y cierra las dos barras. En la pantalla grande no existe:
// ahí las barras están siempre a la vista y el botón estorbaría.
//
// Se usa una clase en el body y no un estilo directo, porque el estado tiene
// que poder leer el CSS: el botón cambia de ícono y las barras cambian de
// alto, y las dos cosas salen del mismo lado.
//
// Y aria-expanded es lo que le dice a un lector de pantalla si el menú está
// abierto. Sin eso, el botón dice lo mismo abierto que cerrado.
function alternarMenuMovil(){
  const abierto=document.body.classList.toggle('menu-movil-abierto');
  const b=document.getElementById('btnMenuMovil');
  if(b){
    b.setAttribute('aria-expanded',abierto?'true':'false');
    b.setAttribute('aria-label',abierto?'Cerrar el menú':'Abrir el menú');
  }
}

// Para cerrar sin pasar por el botón: cambiar de vista, o apretar Escape.
function cerrarMenuMovil(){
  if(!document.body.classList.contains('menu-movil-abierto'))return;
  document.body.classList.remove('menu-movil-abierto');
  const b=document.getElementById('btnMenuMovil');
  if(b){
    b.setAttribute('aria-expanded','false');
    b.setAttribute('aria-label','Abrir el menú');
  }
}

// Escape cierra el menú, como cierra cualquier ventana abierta.
addEventListener('keydown',function(ev){
  if(ev.key!=='Escape')return;
  cerrarMenuMovil();
});

function conectarAyudas(){
  if(conectarAyudas.hecho)return;
  conectarAyudas.hecho=true;

  addEventListener('keydown',(ev)=>{
    if(ev.key!=='Escape')return;
    const abiertas=document.querySelectorAll('.ayuda[open]');
    if(!abiertas.length)return;
    abiertas.forEach(d=>d.removeAttribute('open'));
  });

  addEventListener('toggle',(ev)=>{
    const d=ev.target;
    if(!d||!d.classList||!d.classList.contains('ayuda')||!d.open)return;
    document.querySelectorAll('.ayuda[open]').forEach(otro=>{
      if(otro!==d)otro.removeAttribute('open');
    });
  },true);

  addEventListener('click',(ev)=>{
    if(ev.target.closest&&ev.target.closest('.ayuda'))return;
    document.querySelectorAll('.ayuda[open]').forEach(d=>d.removeAttribute('open'));
  });
}
function conectarCajasDeCargos(caja){
  if(!caja||caja.conCargos)return;
  caja.conCargos=true;
  caja.addEventListener('change',(ev)=>{
    const input=ev.target;
    if(!input||input.type!=='checkbox')return;
    const label=input.closest('label[data-cargo]');
    if(!label)return;
    activarCargoDeEmpresa(label.getAttribute('data-cargo'),input.checked,input);
  });
}

function especialidadIdDeClave(clave){
  const lista=(typeof especialidades!=='undefined'&&especialidades)?especialidades:[];
  const e=lista.find(x=>x.clave===clave);
  return e?e.id:null;
}

// -------------------------------------------------------------------
// EL DIÁLOGO DE CARGA
// -------------------------------------------------------------------
// Un textarea y no un botón de archivo, porque la lista casi siempre viene de
// una columna de un Excel que ya está pegado en un correo, y porque desde un
// teléfono no se puede elegir un archivo.
function abrirImportarCargos(){
  const dlg=document.getElementById('dlgCargos');
  const txt=document.getElementById('cargosTexto');
  const av=document.getElementById('cargosAviso');
  if(av){av.textContent='';av.style.color='';}
  if(txt)txt.value='';
  // Sin esta línea el diálogo no aparece: el "display:none" del CSS es lo
  // único que lo tiene oculto.
  if(dlg)dlg.classList.add('open');
  if(txt)setTimeout(()=>txt.focus(),60);
}
function cerrarDialogoCargos(){
  const dlg=document.getElementById('dlgCargos');
  if(dlg)dlg.classList.remove('open');
}
async function importarCargosDesdePantalla(){
  const txt=document.getElementById('cargosTexto');
  const av=document.getElementById('cargosAviso');
  const btn=document.getElementById('cargosGuardar');
  const texto=txt?txt.value.trim():'';
  if(!texto){
    if(av){av.textContent='La lista llegó vacía.';av.style.color='var(--danger)';}
    return;
  }
  if(btn){btn.disabled=true;btn.textContent='Cargando…';}
  const {data,error}=await window.supabaseClient.rpc('importar_especialidades',{
    p_empresa_id:empresaDeCargos(),p_texto:texto,p_archivo_nombre:'carga manual'
  });
  if(btn){btn.disabled=false;btn.textContent='Cargar';}
  if(error){
    if(av){av.textContent=error.message;av.style.color='var(--danger)';}
    return;
  }
  const f=(data&&data[0])?data[0]:{};
  if(av){
    av.style.color='';
    av.textContent='Leídas '+f.total+' · agregadas '+f.agregadas
      +' · ya estaban '+f.ya_existian+' · claves nuevas '+f.nuevas_claves;
  }
  await cargarJerarquiaCargos(true);
  renderEmpresasCargos();
  cerrarDialogoCargos();
}


function conectarNavCompacto(){
  if(conectarNavCompacto.hecho)return;
  conectarNavCompacto.hecho=true;
  let pendiente=false;
  addEventListener('scroll',()=>{
    if(pendiente)return;
    pendiente=true;
    requestAnimationFrame(()=>{pendiente=false;marcarNavCompacto();});
  },{passive:true});
}

async function boot(){
  // ----------------------------------------------------------------
  // LO PRIMERO: ¿SE PUDO HABLAR CON LA BASE?
  // ----------------------------------------------------------------
  // Antes de cualquier otra cosa. Si la librería de la CDN no cargó, o
  // falta la configuración, window.supabaseClient no existe y el primer uso
  // revienta.
  //
  // Como el arranque es una lista de awaits, el primero que falla corta
  // todos los que vienen después: la pantalla queda con el encabezado y la
  // barra de secciones vacía, sin decir por qué. Y el síntoma se reporta
  // como "no se ven los submenús", que no dice nada de la causa: la causa
  // no es el menú, es que no hay conexión con la base.
  if(window.supabaseFallo){
    mostrarAvisoFalloBase(window.supabaseFallo);
    return;
  }
  conectarNavCompacto();
  conectarAyudas();

  try{
    const session = await requireAuth('login.html');
    if(!session) return; // requireAuth ya redirigió a login.html
    // La entrada a la bitácora va después de requireAuth (que ya sabemos que
    // hay sesión) y antes de todo lo demás, para que quede registrada aunque
    // algo de la carga falle después. Es en segundo plano: si la tabla no
    // existe, la app arranca igual.
    registrarAcceso('entrada');
    await loadPermisosUsuario();          // qué menús y acciones ve esta persona
    await loadEmpresas();                 // antes de los trabajadores: define su ámbito
    fillWorkerEmpresaSelect();
    // La jerarquía de grupos y cargos va temprano y en segundo plano, porque la
    // usan el ingreso y la ficha del trabajador. Si la 051 no está, devuelve
    // vacío y todo sigue funcionando: el cargo se deja sin asignar.
    cargarJerarquiaCargos();
    await Promise.all([loadWorkers(), loadAttendanceFromDB(), loadTarjetas()]);
    recalcularMiSupervisor();   // ya con los trabajadores cargados
    renderSelectorEmpresas();   // recién ahora "workers" tiene el total real
    renderList('');
    renderMatrix();
    showGroup('porteria');
    marcarTarjaSoloLectura();
    loadSolicitudes(true).then(()=>{renderSolicitudes();renderMisSolicitudes();});
    loadBodega(true); // en segundo plano: avisa en consola si falta alguna migración
  }catch(error){
    // Un fallo en cualquier paso deja la app a medio cargar, que es peor
    // que no cargarla: la persona ve botones que no hacen nada y no sabe si
    // apretó mal o si la aplicación está mala.
    console.error('[boot] la aplicación no pudo arrancar:',error);
    mostrarAvisoFalloBase({
      motivo:'error-de-arranque',
      mensaje:'La aplicación no pudo cargar.\n\n'
        +(error&&error.message?error.message:'Error sin detalle.')
    });
  }
}

// ------------------------------------------------------------------
// EL AVISO DE QUE NO SE PUDO HABLAR CON LA BASE
// ------------------------------------------------------------------
//
// Va arriba y grande, porque es la única cosa que la persona necesita ver:
// sin base no hay sistema, y no hay nada que hacer hasta que se solucione.
//
// El texto dice qué pasó y qué se puede hacer. Un "error de red" sin más no
// ayuda: no se sabe si hay que reiniciar el router, esperar, o llamar a
// alguien. Y no usa alert(), que bloquearía la pantalla: con varios
// problemas serían varios "Aceptar" antes de poder hacer nada.
function mostrarAvisoFalloBase(fallo){
  let caja=document.getElementById('falloBase');
  if(!caja){
    caja=document.createElement('div');
    caja.id='falloBase';
    document.body.insertBefore(caja,document.body.firstChild);
  }
  caja.className='fallo-base';
  caja.innerHTML='<h2>No se pudo conectar con la base</h2>'
    +'<pre>'+escHtml(fallo.mensaje)+'</pre>'
    +'<small>Si esto pasa en todos los equipos, es un problema del servicio. '
    +'Si es en uno solo, es de ese equipo.</small>';
}
boot();
