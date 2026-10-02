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
  // Y los cinco de la 056 van en la lista. Si no, quedan con lo de la ficha anterior y
  // el siguiente trabajador nace con el apellido del otro: es el peor lugar para que un
  // campo se quede pegado, porque no se nota hasta que se imprimió la planilla.
  ['w-code','w-name','w-nombres','w-apellido-paterno','w-apellido-materno','w-direccion','w-correo','w-afp-codigo','w-afp-nombre','w-spec','w-phone','w-rut','w-fecha-ingreso','w-emerg-name','w-emerg-phone','w-emerg-rel','w-salud','w-medicamentos','w-precauciones'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
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
  const spec=document.getElementById('w-spec').value.trim();
  const espClave=document.getElementById('w-cargo')
    ?document.getElementById('w-cargo').value:'';

  // Y los nombres se leen de los tres campos, y el entero se arma con ellos.
  //
  // Antes se leía de "w-name", que ahora está oculto. Leer el campo oculto sin armarlo
  // primero guardaría siempre un nombre vacío, porque nadie escribe en un campo oculto.
  const nombres=document.getElementById('w-nombres').value.trim();
  const apellidoPaterno=document.getElementById('w-apellido-paterno').value.trim();
  const apellidoMaterno=document.getElementById('w-apellido-materno').value.trim();

  // Y si no hay nombres, se avisa acá y no en la base. La base no avisa "falta el
  // apellido paterno": guarda lo que le manden, y el nombre queda a medias.
  if(!code){alert('El código es obligatorio');return;}
  if(!nombres||!apellidoPaterno){
    alert('Nombres y apellido paterno son obligatorios. El apellido materno es opcional.');
    return;
  }

  const existing=workers.find(w=>w.code===code)||todosWorkers.find(w=>w.code===code);
  const empSel=document.getElementById('w-empresa');

  const worker={
    code,
    nombres,apellido_paterno:apellidoPaterno,apellido_materno:apellidoMaterno,
    name:componerNombre({nombres,apellido_paterno:apellidoPaterno,apellido_materno:apellidoMaterno}),
    direccion:document.getElementById('w-direccion').value.trim(),
    correo:document.getElementById('w-correo').value.trim(),
    afp_codigo:document.getElementById('w-afp-codigo').value.trim(),
    afp_nombre:document.getElementById('w-afp-nombre').value.trim(),
    spec,
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
  // Y los nombres van a los tres campos. "w-name" queda oculto y no se escribe, porque
  // "saveWorker" lo arma con esos tres y no lo lee.
  document.getElementById('w-nombres').value=w.nombres||'';
  document.getElementById('w-apellido-paterno').value=w.apellido_paterno||'';
  document.getElementById('w-apellido-materno').value=w.apellido_materno||'';
  document.getElementById('w-direccion').value=w.direccion||'';
  document.getElementById('w-correo').value=w.correo||'';
  // Y la AFP. Si faltan acá, editar una ficha BORRA la AFP: el "upsert" manda todas las
  // columnas del objeto, y lo que no está llega como null.
  document.getElementById('w-afp-codigo').value=w.afp_codigo||'';
  document.getElementById('w-afp-nombre').value=w.afp_nombre||'';
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
// Para Administración y RRHH. No es lo mismo que "Asistencia diaria" del
// supervisor: ahí se mira el equipo propio mientras se está en la obra,
// acá se revisa el día entero, después, para dejar resuelto lo que quedó.
//
// QUÉ ES "PENDIENTE" Y POR QUÉ NO ES SOLO "NO MARCÓ"
//
// Un listado de "los que no marcaron" mezcla dos cosas muy distintas: la
// persona que no apareció y la persona que tenía permiso. Para RRHH lo
// segundo no es un problema: ya está justificado. Por eso la lista separa
// cada situación y las cuenta por separado, y "lo que hay que explicar"
// excluye lo que ya tiene justificación.
//
// SE CALCULA CON LO QUE YA ESTÁ CARGADO, SIN IR A LA BASE
//
// Todo lo que hace falta ya está en memoria: asistencia, marcajes, avisos y
// solicitudes. Se usa lo que hay en pantalla y no una consulta nueva, para
// que cambiar la fecha no haga un viaje por cada tecla y para que abrir la
// vista sea instantáneo. Si faltan las solicitudes pendientes se avisa, en
// vez de mostrar una lista que parece completa y no lo está.
function initJustificacionDiaria(){
  const f=document.getElementById('justDiaFecha');
  if(f&&!f.value)f.value=hoyLocal();
  const sup=document.getElementById('justDiaSup');
  if(sup){
    const anterior=sup.value;
    sup.innerHTML='<option value="">Todos los supervisores</option>'+
      supervisoresActivos()
        .map(opcionTrabajador).join('');
    if(anterior)sup.value=anterior;
  }
  renderJustificacionDiaria();
}
function renderJustificacionDiaria(){
  const lista=document.getElementById('justDiaLista');
  if(!lista)return;
  const f=document.getElementById('justDiaFecha');
  const fecha=f&&f.value?f.value:hoyLocal();
  const supCode=(document.getElementById('justDiaSup')||{}).value||'';
  const filtro=((document.getElementById('justDiaFiltro')||{}).value)||'pendientes';

  const partes=fecha.split('-');
  if(partes.length!==3){
    lista.innerHTML='<small class="gpsWarn">Elige una fecha.</small>';
    return;
  }
  const y=+partes[0],m=+partes[1],d=+partes[2];
  const festivo=isFeriado(y,m,d);

  // Un día no laborable no se "explica": se avisa y se termina. Antes esto
  // salía como una lista de 40 personas sin marcar, todas un domingo.
  if(festivo){
    document.getElementById('justDiaResumen').innerHTML='';
    document.getElementById('justDiaAviso').innerHTML=
      '<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px">'+
      '<b>El '+escHtml(fechaLegible(fecha))+' no es día laborable.</b> No hay nada que justificar: el fin de semana y los feriados no se cuentan como inasistencia.</div>';
    lista.innerHTML='';
    return;
  }
  document.getElementById('justDiaAviso').innerHTML='';

  const marcajesDelDia=marcajes.filter(m=>m.fecha===fecha);
  const entradaDe={},salidaDe={};
  marcajesDelDia.forEach(m=>{ if(m.tipo==='entrada'&&!entradaDe[m.code])entradaDe[m.code]=m; if(m.tipo==='salida'&&!salidaDe[m.code])salidaDe[m.code]=m; });
  const attDe={};
  attendance.filter(a=>a.date===fecha).forEach(a=>{attDe[a.code]=a;});

  const esJustificado=(e)=>['P','L','V','A','PP'].includes(e);
  const nombresEstado={X:'Presente',F:'Falta',P:'Permiso',L:'Licencia',A:'Accidente Mutual',PP:'Permiso Pagado',V:'Vacaciones',LL:'Día lluvia'};

  // El equipo depende de la fecha: alguien que ingresó ayer no tiene nada
  // que explicar hoy, y alguien desvinculado la semana pasada tampoco. Sin
  // este filtro salían como "sin marcar" y seemed una falla del sistema.
  const candidatos=workers.filter(w=>{
    if(w.status==='desvinculado'&&w.fecha_desvinculacion&&fecha>w.fecha_desvinculacion)return false;
    if(w.fecha_ingreso&&fecha<w.fecha_ingreso)return false;
    if(supCode&&w.supervisor_code!==supCode&&w.code!==supCode)return false;
    return true;
  });

  const filas=candidatos.map(w=>{
    const ent=entradaDe[w.code],sal=salidaDe[w.code],att=attDe[w.code];
    const estado=att?att.estado:'';
    const justificante=esJustificado(estado);
    const entradaEsp=horaEntradaDe(w.supervisor_code||supCode||'');
    const tolerancia=toleranciaDe(w.supervisor_code||supCode||'');
    const minEnt=ent?minutosDe(ent.hora):null;
    const minEsp=minutosDe(entradaEsp);
    const tarde=minEnt!=null&&minEsp!=null&&minEnt>minEsp+tolerancia;

    // Un solo "motivo" por persona, en orden de urgencia. Si alguien no
    // marcó Y tiene una F puesta, lo importante es la F: la planilla ya
    // lo dijo. Y así la lista no tiene la misma persona en dos grupos.
    let motivo='',detalle='';
    // El atraso se anota aparte y se suma al texto, en vez de competir con
    // "sin salida" por ser la situación principal. A media mañana casi
    // todo el mundo entró y todavía no salió, así que "sin salida" es lo
    // normal y taparía el atraso; al revés, un atraso se puede resolver
    // en RRHH sin esperar al final del día.
    const atrasoMin=minEnt!=null&&minEsp!=null?minEnt-minEsp-tolerancia:0;
    const atrasoTxt=tarde?(' · entró '+textoDuracion(atrasoMin)+' tarde (la hora de entrada es '+entradaEsp+', tolerancia '+tolerancia+' min)'):'';
    // ORDEN POR URGENCIA, no por el orden en que se detectan.
    //
    // La planilla dice F y el reloj dice que entró: eso es una contradicción
    // entre dos fuentes, y es lo primero que hay que mirar. Si el atraso
    // ganara, la fila salía como "Atraso" y el F con marcaje quedaba en 0
    // en el resumen, con lo cual la contradicción desaparecía de la vista
    // justo cuando más importaba.
    if(!ent&&estado==='F'){motivo='falta';detalle='La planilla lo tiene como F y no hay marcaje del reloj.';}
    else if(ent&&estado==='F'){motivo='falta_con_marca';detalle='La planilla lo tiene como F pero hay marcaje de entrada a las '+ent.hora+'. Los dos datos no pueden ser ciertos a la vez.'+atrasoTxt;}
    else if(!ent&&estado==='X'){motivo='sin_marcaje';detalle='Está en la planilla como presente, pero no hay marcaje del reloj de este día. La hora se completa cuando llegue el reporte.';}
    else if(!ent&&!justificante){motivo='sin_marcar';detalle='No hay ningún marcaje de entrada de este día.';}
    else if(ent&&!sal){motivo='sin_salida';detalle='Marcó entrada a las '+ent.hora+' y no hay salida registrada.'+atrasoTxt;}
    else if(ent&&tarde){motivo='tarde';detalle='Entró a las '+ent.hora+' y la hora de entrada es '+entradaEsp+' (tolerancia '+tolerancia+' min).';}
    else if(justificante){motivo='justificado';detalle=(nombresEstado[estado]||estado)+(att&&att.nota?(' · '+att.nota):'');}
    else{ motivo='ok';detalle=sal?('Marcó entrada '+ent.hora+' y salió '+sal.hora+'.'):('Marcó entrada a las '+ent.hora+'.');}

    return {w,ent,sal,att,estado,motivo,detalle,tarde,horas:ent&&sal?(minutosDe(sal.hora)-minutosDe(ent.hora)):null};
  });

  const cuenta=(m)=>filas.filter(x=>x.motivo===m).length;
  const pendientes=filas.filter(x=>x.motivo!=='ok'&&x.motivo!=='justificado');
  const aMostrar=filtro==='pendientes'?pendientes:filas;

  // Aviso honesto sobre lo que esta vista NO sabe. Las solicitudes
  // pendientes viven en otra tabla; si esa consulta falló, la lista se ve
  // completa y no lo está, que es el peor caso. Se usa el mismo aviso que
  // ya lleva loadSolicitudes(), en vez de inventar otra forma de saber si
  // los datos están.
  const cargadas=!errorSolicitudes;
  const conSolicitud=cargadas
    ?new Set(solicitudes.filter(s=>s.estado==='pendiente'&&s.fecha===fecha).map(s=>s.code))
    :new Set();
  let aviso='';
  if(!cargadas){
    aviso='<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px;margin-bottom:10px">'+
      '<b>No se pudieron leer las solicitudes de cambio pendientes.</b> Por eso esta lista no las está contando, y puede no reflejar lo que alguien ya pidió.<br><small>'+escHtml(errorSolicitudes)+'</small></div>';
  }else if(conSolicitud.size){
    aviso='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px;margin-bottom:10px">'+
      '<b>'+conSolicitud.size+' persona(s) tienen una solicitud de cambio de estado pendiente</b> para este día. Aprobala o rechazala en Administración → Aprobar solicitudes; hasta entonces la planilla puede no reflejar lo que pidieron.</div>';
  }

  // El atraso se cuenta por separado, no por "motivo principal": alguien
  // que llegó tarde y todavía no salió cuenta como atraso, aunque su
  // motivo sea "sin salida". Si no, el resumen decía "0 con atraso" con
  // gente claramente tarde, que es un número que miente.
  const conAtraso=filas.filter(x=>x.tarde).length;
  document.getElementById('justDiaResumen').innerHTML=
    '<b>'+filas.length+'</b> persona(s) con jornada el '+escHtml(fechaLegible(fecha))+': '+
    '<span class="mkPill no">'+cuenta('sin_marcar')+' sin marcar</span> '+
    '<span class="mkPill no">'+cuenta('falta')+' F sin marcaje</span> '+
    '<span class="mkPill warn">'+cuenta('falta_con_marca')+' F con marcaje</span> '+
    '<span class="mkPill warn">'+cuenta('sin_salida')+' sin salida</span> '+
    '<span class="mkPill warn">'+conAtraso+' con atraso</span> '+
    '<span class="mkPill ok">'+cuenta('justificado')+' justificadas</span>';
  document.getElementById('justDiaAviso').innerHTML=aviso;

  if(!aMostrar.length){
    lista.innerHTML='<div class="eppVacio">Nada que explicar el '+escHtml(fechaLegible(fecha))+'. Todo el mundo tiene marcaje o justificación.</div>';
    return;
  }

  const etiqueta={
    sin_marcar:{t:'Sin marcar',c:'var(--danger)'},
    sin_marcaje:{t:'Presente sin reloj',c:'var(--warn)'},
    falta:{t:'F sin marcaje',c:'var(--danger)'},
    falta_con_marca:{t:'F con marcaje',c:'var(--warn)'},
    sin_salida:{t:'Sin salida',c:'var(--warn)'},
    tarde:{t:'Atraso',c:'var(--warn)'},
    justificado:{t:'Justificado',c:'var(--secondary-text)'},
    ok:{t:'Completo',c:'var(--accent)'}
  };
  // Ordenados por lo que urge: primero los que no aparecen, después los
  // que tienen una inconsistencia, y al final lo que está bien. Es el
  // orden en que se puede trabajar la lista.
  const orden=['sin_marcar','falta','falta_con_marca','sin_marcaje','sin_salida','tarde','justificado','ok'];
  const cuerpo=aMostrar
    .slice()
    .sort((a,b)=>orden.indexOf(a.motivo)-orden.indexOf(b.motivo)||compararPorCodigo(a.w.code,b.w.code))
    .map(x=>{
      const et=etiqueta[x.motivo];
      const sup=x.w.supervisor_code?workers.find(s=>s.code===x.w.supervisor_code):null;      return `<tr class="justFila" data-code="${escHtml(x.w.code)}">        <td class="justCelda justCeldaNombre">          <b>${escHtml(codigoMostrar(x.w.code))}</b> ${escHtml(x.w.name)}          <small>${escHtml(x.w.spec||'')}${sup?(' · Supervisor: '+escHtml(sup.name)):''}</small>        </td>        <td class="justCelda">          <span class="mkPill" style="border-color:${et.c};color:${et.c}">${escHtml(et.t)}</span>        </td>        <td class="justCelda justCeldaDetalle">${escHtml(x.detalle)}</td>        <td class="justCelda justCeldaAcciones">          ${x.motivo==='ok'||x.motivo==='justificado'?'':            `<button class="btn" type="button" style="margin:0;padding:4px 8px;font-size:.7rem;white-space:nowrap"              onclick="abrirJustificarCon('${escHtml(x.w.code)}','${escHtml(fecha)}')"              title="Abre el formulario de justificación con el trabajador y el día ya puestos">Justificar</button>`}          <button class="btn secondary" type="button" style="margin:0;padding:4px 8px;font-size:.7rem;white-space:nowrap"            onclick="marcarRelojConHoraAhora('${escHtml(x.w.code)}','${escHtml(fecha)}')"            title="Registra que marcó el reloj AHORA, con la hora actual. Al día siguiente, cuando se cargue el Excel del reloj, esa hora se corrige con la que diga el reporte.">Marcó reloj</button>          <button class="btn secondary" type="button" style="margin:0;padding:4px 8px;font-size:.7rem;white-space:nowrap"            onclick="abrirTarjaDe('${escHtml(x.w.code)}')">Tarja</button>        </td>      </tr>`;
    }).join('');
  lista.innerHTML='<div class="justTablaCaja">'    +'<table class="justTabla">'    +'<thead><tr><th>Trabajador</th><th>Situación</th>'    +'<th class="justThDetalle">Detalle</th>'    +'<th class="justThAcciones">Acciones</th></tr></thead>'    +'<tbody>'+cuerpo+'</tbody></table></div>';
}
// Abre el formulario de justificación con el trabajador y el día ya puestos.
// Se reusa el que ya existe en la pestaña "Justificar" de Asistencia
// mensual, en vez de hacer un formulario paralelo: dos formularios para lo
// mismo divergen en la primera corrección.
function abrirJustificarCon(code,fecha){
  showView('asistencia');
  showAttendancePanel('justificar');
  const sel=document.getElementById('just-worker');
  if(sel){
    if(![...sel.options].some(o=>o.value===code)){
      // Puede que no esté en la lista filtrada: se agrega para que quede
      // elegido y no se pierda el trabajo hecho.
      const w=workers.find(x=>x.code===code);
      if(w)sel.insertAdjacentHTML('beforeend','<option value="'+escHtml(code)+'">'+escHtml(code)+' - '+escHtml(w.name)+'</option>');
    }
    sel.value=code;
    if(typeof updateEstadoActual==='function')updateEstadoActual();
  }
  ['just-desde','just-hasta'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=fecha;});
  if(typeof showJustSupervisor==='function')showJustSupervisor();
  const nota=document.getElementById('just-nota');
  if(nota){nota.focus();window.scrollTo({top:0,behavior:'smooth'});}
  const ms=document.getElementById('justMsg');
  if(ms)ms.innerHTML='<small>Trabajador y fecha ya puestos. Revisá el estado y escribí el detalle.</small>';
}
// Registra que la persona marcó el reloj AHORA, con la hora de este
// momento, y deja la planilla en presente con esa hora.
//
// POR QUÉ HAY QUE TENER CUIDADO CON ESTO
//
// El reporte del reloj llega AL DÍA SIGUIENTE. Entonces hoy esta hora es
// provisional, y mañana el Excel va a decir la real. Por eso:
//   · se guarda con origen 'reloj' y no 'manual', para que después se vea
//     de dónde salió;
//   · NO se pisa un marcaje que ya venga del reloj. Si la fila ya tiene
//     origen 'excel' o 'reloj', la hora real ya está y sobrescribirla con
//     la de ahora sería perder el dato bueno por uno worse;
//   · la planilla también se actualiza, que es lo que la persona espera
//     ver en la tarja al instante.
async function marcarRelojConHoraAhora(code,fecha){
  if(!exigirPermiso('tarja.marcaje','No tienes permiso para registrar marcajes.'))return;
  const w=workers.find(x=>x.code===code);
  if(!w){alert('No se encontró al trabajador '+code+'.');return;}
  const dia=fecha||hoyLocal();
  const hora=hhmmActual();
  const previo=(typeof marcajes!=='undefined'?marcajes:[]).find(m=>m.code===code&&m.fecha===dia&&m.tipo==='entrada');
  if(previo&&(previo.origen==='excel'||previo.origen==='reloj')){
    const cambiar=confirm(w.name+' ya tiene un marcaje del RELOJ el '+dia+' a las '+
      hhmmDe(0,0).slice(0,0)+previo.hora+'.\n\n'+
      'Si apretás de nuevo, se reemplaza por la hora de ahora ('+hora+') y esa se pierde.\n\n'+
      '¿Seguir igual?');
    if(!cambiar)return;
  }else if(!confirm('¿Registrar que '+w.name+' marcó el reloj el '+dia+' a las '+hora+'?'))return;

  const {data:sesion}=await window.supabaseClient.auth.getSession();
  const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
  const {error}=await window.supabaseClient.from('marcajes').upsert([{
    code,fecha:dia,hora,tipo:'entrada',
    origen:'reloj',
    nota:'Marcado a mano con la hora actual; el reporte del reloj lo confirmará',
    registrado_por:miId,
    registrado_por_nombre:miNombrePerfil()
  }],{onConflict:'code,fecha,tipo'});
  if(error){
    const falta=migracionQueFalta(error);
    alert(falta
      ?('No se pudo guardar. Falta la migración '+falta+'. Córrela en el SQL Editor de Supabase y vuelve a intentar.')
      :('No se pudo guardar el marcaje: '+error.message));
    return;
  }
  await loadMarcajesDia();
  const guardado=await saveAttendanceState(code,dia,'X',hora,{
    // Hora provisional: la de ahora, no la real del reloj. Queda dicho en
    // la bitácora para que dentro de un mes no se confunda con una hora
    // confirmada por el reloj.
    motivo:motivoDeMarcaje('Marcó reloj desde la app; hora provisional',{
      'día':dia,'hora anotada':hora,'reloj':'sin confirmar, lo corrige el Excel de mañana'
    })
  });
  renderJustificacionDiaria();
  if(!guardado)alert('Se registró el marcaje, pero la planilla no se pudo actualizar. Revisá Soporte → Diagnóstico.');
  else alert('Marcaje registrado a las '+hora+'.\n\nLa hora es la de ahora. Cuando cargues el Excel del reloj, se corrige con la real.');
}
// Lleva a la tarja mensual con ese trabajador filtrado, para ver el
// contexto del mes antes de decidir.
function abrirTarjaDe(code){
  showView('asistencia');
  showAttendancePanel('tarja');
  const f=document.getElementById('matWorkerFilter');
  if(f){
    if(![...f.options].some(o=>o.value===code)){
      const w=workers.find(x=>x.code===code);
      if(w)f.insertAdjacentHTML('beforeend','<option value="'+escHtml(code)+'">'+escHtml(w.name)+'</option>');
    }
    f.value=code;
  }
  renderMatrix();
}
// ============================================================
// CONCILIACIÓN: LA PLANILLA CONTRA EL RELOJ
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
let especialidadSeleccionada='';
let kitAdminSeleccionado='';   // id de epp_kits en el administrador

// ---------- carga ----------
async function loadEspecialidades(quiet){
  const {data,error}=await window.supabaseClient.from('epp_especialidades').select('*').order('nombre');
  if(error){bodegaError('No se pudieron cargar las especialidades (ejecuta la migración 011): '+error.message,quiet);return;}
  especialidades=(data||[]).filter(e=>e.activa!==false);
  if(!especialidades.some(e=>e.clave===especialidadSeleccionada))
    especialidadSeleccionada=especialidades.length?especialidades[0].clave:'';
}
async function loadKits(quiet){
  const {data,error}=await window.supabaseClient.from('epp_kits').select('*').order('nombre');
  if(error){bodegaError('No se pudieron cargar los kits (ejecuta la migración 012): '+error.message,quiet);return;}
  kits=(data||[]).filter(k=>k.activo!==false);
}
async function loadKitItems(quiet){
  const {data,error}=await window.supabaseClient.from('epp_kit_items').select('*').order('orden');
  if(error){bodegaError('No se pudieron cargar los elementos de los kits: '+error.message,quiet);return;}
  kitItems=data||[];
}
async function loadKitAsignaciones(quiet){
  const {data,error}=await window.supabaseClient.from('epp_kit_asignaciones').select('*').order('created_at',{ascending:false});
  if(error){bodegaError('No se pudieron cargar las asignaciones de kit: '+error.message,quiet);return;}
  const filas=data||[];
  if(filas.length){
    const {data:items}=await window.supabaseClient.from('epp_kit_asignacion_items').select('*').in('asignacion_id',filas.map(a=>a.id));
    const porAsig={};
    (items||[]).forEach(it=>{(porAsig[it.asignacion_id]=porAsig[it.asignacion_id]||[]).push(it);});
    filas.forEach(a=>{a.items=porAsig[a.id]||[];});
  }
  kitAsignaciones=filas;
}

// ---------- helpers ----------
// Los <select> devuelven SIEMPRE string, mientras que el id del modelo
// puede venir como uuid (string) o número según la fuente. Comparar con
// mismoId() evita que un filtro de la UI deje de encontrar su registro.
function mismoId(a,b){
  if(a==null||b==null)return false;
  return String(a)===String(b);
}
function especialidadPorClave(clave){return especialidades.find(e=>mismoId(e.clave,clave))||null;}
function especialidadPorId(id){return especialidades.find(e=>mismoId(e.id,id))||null;}
function kitsDeEspecialidad(espId){
  return kits.filter(k=>mismoId(k.especialidad_id,espId)).sort((a,b)=>(a.orden||0)-(b.orden||0)||a.nombre.localeCompare(b.nombre));
}
function itemsDeKit(kitId){
  return kitItems.filter(i=>mismoId(i.kit_id,kitId)).sort((a,b)=>(a.orden||0)-(b.orden||0));
}
// normalizarCargo() está definida en el módulo de EPP.
function especialidadDelTrabajador(code){
  const cargo=normalizarCargo(cargoDelTrabajador(code));
  if(!cargo)return null;
  return especialidades.find(e=>e.clave===cargo)
      || especialidades.find(e=>cargo.includes(e.clave))
      || null;
}
function progresoAsignacion(a){
  const total=(a.items||[]).length;
  const hechos=(a.items||[]).filter(i=>i.estado==='entregado').length;
  return {total,hechos,pendientes:total-hechos,pct:total?Math.round(hechos/total*100):0,completo:total>0&&hechos===total};
}

// ---------- 1) asignación ----------
function fillKitSelects(){
  const selEsp=document.getElementById('kit-esp');
  const selKit=document.getElementById('kit-select');
  if(!selEsp||!selKit)return;
  const espId=selEsp.value;
  const lista=kitsDeEspecialidad(espId);
  selKit.innerHTML=lista.length
    ?lista.map(k=>`<option value="${k.id}">${k.nombre} (${itemsDeKit(k.id).length} elem.)</option>`).join('')
    :'<option value="">— esa especialidad no tiene kits —</option>';
  renderKitPreview();
}
function renderKitPreview(){
  const box=document.getElementById('kitPreview');
  if(!box)return;
  const kitId=document.getElementById('kit-select').value;
  const items=itemsDeKit(kitId);
  if(!kitId||!items.length){box.innerHTML='<small class="gpsWarn">Ese kit no tiene elementos. Créalo en la sección 4.</small>';return;}
  const unidades=items.reduce((s,i)=>s+(i.cantidad||1),0);
  box.innerHTML=`<div class="kitResumen">Este kit tiene <b>${items.length}</b> tipo(s) de elemento, <b>${unidades}</b> unidad(es). Al asignarlo quedan todos <b>pendientes</b> y los vas marcando al entregar.</div>`;
}
async function asignarKit(){
  const code=document.getElementById('kit-worker').value;
  const espId=document.getElementById('kit-esp').value;
  const kitId=document.getElementById('kit-select').value;
  const fecha=document.getElementById('kit-fecha').value||hoyLocal();
  const kit=kits.find(k=>mismoId(k.id,kitId));
  const esp=especialidadPorId(espId);
  if(!code){alert('Selecciona o escanea al trabajador.');return;}
  if(!kit){alert('Elige un kit.');return;}
  const items=itemsDeKit(kitId);
  if(!items.length){alert('Ese kit no tiene elementos. Agrégalos primero en la sección 4.');return;}
  const nombre=(workers.find(w=>w.code===code)||{}).name||code;
  const abierta=kitAsignaciones.find(a=>a.code===code&&!a.completado);  if(abierta&&!confirm(`${nombre} ya tiene el kit "${abierta.kit_nombre}" abierto con ${progresoAsignacion(abierta).pendientes} pendiente(s). ¿Asignar otro kit aparte?`))return;
  if(!confirm(`¿Asignar el kit "${kit.nombre}" a ${nombre}? Quedarán ${items.length} elemento(s) pendientes.`))return;
  const {data,error}=await window.supabaseClient.from('epp_kit_asignaciones').insert({
    code,
    especialidad_id:espId,
    kit_id:kitId,
    especialidad_nombre:esp?esp.nombre:null,
    kit_nombre:kit.nombre,
    fecha,
    completado:false
  }).select().single();
  if(error){alert('No se pudo asignar el kit: '+error.message);return;}
  const filas=items.map(i=>{
    const cat=eppCatalog.find(c=>c.codigo===i.epp_codigo);
    const talla=i.talla_sugerida&&tallasDeTipo(cat&&cat.tipo_talla).includes(i.talla_sugerida)?i.talla_sugerida:'';
    return {
      asignacion_id:data.id,      epp_codigo:i.epp_codigo,
      nombre:cat?cat.nombre:i.epp_codigo,
      detalle:cat?cat.detalle:null,
      talla,
      cantidad:i.cantidad||1,
      tipo_talla:cat?cat.tipo_talla:null,
      estado:'pendiente'
    };
  });
  const {error:errItems}=await window.supabaseClient.from('epp_kit_asignacion_items').insert(filas);
  if(errItems){alert('Kit asignado pero fallaron sus elementos: '+errItems.message);return;}
  await loadKitAsignaciones(true);
  renderKitAsigList();
  fillKitAsigSelect();
  document.getElementById('kitAsigSel').value=data.id;
  renderKitEntrega();
  alert(`Kit "${kit.nombre}" asignado a ${nombre}: ${items.length} elemento(s) pendientes.`);
}

// ---------- 2) entrega parcial ----------
function fillKitAsigSelect(){
  const sel=document.getElementById('kitAsigSel');
  if(!sel)return;
  const abiertas=kitAsignaciones.filter(a=>!a.completado);
  sel.innerHTML=abiertas.length
    ?abiertas.map(a=>{
        const p=progresoAsignacion(a);
        const w=workers.find(x=>x.code===a.code);
        return `<option value="${a.id}">${a.code} ${w?w.name:''} · ${a.kit_nombre||'kit'} · ${p.hechos}/${p.total}</option>`;
      }).join('')
    :'<option value="">— no hay kits pendientes —</option>';
  renderKitEntrega();
}
function renderKitEntrega(){
  const sel=document.getElementById('kitAsigSel');
  const host=document.getElementById('kitEntregaRows');
  const prog=document.getElementById('kitProgreso');
  if(!sel||!host)return;
  const a=asignacionActual();
  if(!a){
    host.innerHTML='<div class="kitVacio">Selecciona una asignación para entregar elementos.</div>';
    if(prog)prog.innerHTML='';
    return;
  }
  const p=progresoAsignacion(a);
  if(prog){
    prog.innerHTML=`<div class="kitResumen">
      <span><b>${a.code}</b> · ${a.kit_nombre||'kit'} — ${p.hechos} de ${p.total} entregados (${p.pendientes} pendiente(s))</span>
      <span class="kitBar ${p.completo?'completo':''}" style="flex:1;min-width:140px"><i style="width:${p.pct}%"></i></span>
    </div>`;
  }
  const pendientes=(a.items||[]).filter(i=>i.estado==='pendiente');
  if(!pendientes.length){
    host.innerHTML=`<div class="kitVacio" style="color:var(--accent)">Kit completo: todos los elementos están entregados. ✓</div>`;
    return;
  }
  host.innerHTML=pendientes.map((it,idx)=>`
    <div class="kitFila" data-id="${it.id}">
      <div><input type="checkbox" id="kc-${idx}" checked onchange="kitItemSeleccionado('${it.id}',this.checked)"></div>
      <div><b>${it.epp_codigo||''}</b> ${it.nombre}<br><small>${it.detalle||''}</small><button class="btn secondary" type="button" data-dato="Escanear el código de este elemento del kit" style="padding:3px 7px;font-size:.62rem;margin-top:4px" onclick="openQrCamera('kit-item:${idx}')">📷 Escanear</button></div>
      <div><select onchange="kitItemTalla('${it.id}',this.value)">${tallaOptions(it.tipo_talla,it.talla)}</select></div>
      <div><input type="number" min="1" step="1" value="${it.cantidad}" onchange="kitItemCantidad('${it.id}',this.value)"></div>
      <div style="text-align:center"><b>${it.cantidad}</b></div>
      <div><span class="kitEstado pendiente">Pendiente</span></div>
    </div>`).join('');
}
function escanearKitItem(indice,codigo){
  const limpia=String(codigo||'').trim();
  if(!limpia)return;
  const fila=kitFilaActual(indice);
  if(!fila)return;
  const cat=eppCatalog.find(c=>normalizarCodigo(c.codigo)===normalizarCodigo(limpia));
  const sought=cat?cat.codigo:limpia;
  const enElKit=fila.items&&fila.items.find(i=>normalizarCodigo(i.epp_codigo||'')===normalizarCodigo(sought));
  const caja=document.getElementById('kitScanAviso');
  if(enElKit){
    const cb=document.getElementById('kc-'+indice);
    if(cb)cb.checked=true;
    if(caja)caja.innerHTML='<small style="color:var(--accent)"><b>'+escHtml(sought)+'</b> está en el kit. Queda marcado para entregar.</small>';
  }else{
    if(caja)caja.innerHTML='<small style="color:var(--warn-ink)"><b>'+escHtml(sought)+'</b>'
      +' no está en este kit. No se agregó: los elementos de un kit son los que trae la asignación, no los que se escanean.</small>';
  }
}
function kitItemSeleccionado(id,checked){
  const a=asignacionActual();
  const it=a&&(a.items||[]).find(x=>mismoId(x.id,id));
  if(it)it.seleccionado=checked;
}
function kitItemTalla(id,valor){
  const a=asignacionActual();
  const it=a&&(a.items||[]).find(x=>mismoId(x.id,id));
  if(it)it.talla=valor;
}
function kitItemCantidad(id,valor){
  const a=asignacionActual();
  const it=a&&(a.items||[]).find(x=>mismoId(x.id,id));
  if(it)it.cantidad=parseInt(valor,10)||1;
}
function asignacionActual(){
  const sel=document.getElementById('kitAsigSel');
  if(!sel)return null;
  return kitAsignaciones.find(x=>mismoId(x.id,sel.value))||null;
}
function marcarTodosPendientes(valor){
  const a=asignacionActual();
  if(!a)return;
  (a.items||[]).filter(i=>i.estado==='pendiente').forEach(i=>{i.seleccionado=!!valor;});
  document.querySelectorAll('#kitEntregaRows input[type=checkbox]').forEach(c=>{c.checked=!!valor;});
}async function entregarKitItems(){
  const btn=document.getElementById('kitSaveBtn');
  const msg=document.getElementById('kitSaveMsg');
  const a=asignacionActual();
  if(!a){alert('Selecciona una asignación de kit.');return;}
  const seleccionados=(a.items||[]).filter(i=>i.estado==='pendiente'&&i.seleccionado!==false);
  if(!seleccionados.length){alert('Marca al menos un elemento pendiente para entregar.');return;}
  const firma=signatureDataUrl('Kit');
  if(!firma&&!confirm('No hay firma en el recuadro. ¿Guardar la entrega igual?'))return;
  const unidades=seleccionados.reduce((s,i)=>s+(i.cantidad||1),0);
  const nombre=(workers.find(w=>w.code===a.code)||{}).name||a.code;
  if(!confirm(`¿Entregar ${seleccionados.length} elemento(s) (${unidades} unidad(es)) del kit "${a.kit_nombre||''}" a ${nombre}?`))return;

  btn.disabled=true;
  msg.textContent='Generando PDF…';
  msg.style.color='var(--muted)';
  try{
    const items=seleccionados.map(i=>({
      epp_codigo:i.epp_codigo,
      nombre:i.nombre,
      detalle:i.detalle,
      talla:i.talla||null,
      cantidad:i.cantidad||1
    }));
    const {data,error}=await window.supabaseClient.from('epp_entregas').insert({
      code:a.code,
      fecha:hoyLocal(),
      detalle:eppDetalleResumen(items),
      observacion:document.getElementById('kit-obs').value.trim()||null,
      pasillo:document.getElementById('kit-pasillo').value.trim()||null,
      sector:document.getElementById('kit-sector').value.trim()||null,
      nivel:document.getElementById('kit-nivel').value.trim()||null,
      es_entrega_inicial:true,
      cargo:a.especialidad_nombre||null,
      firma_url:null,
      firma_at:firma?new Date().toISOString():null,
      firma_metodo:firma?'canvas':null,
      firma_lat:eppGps?eppGps.lat:null,
      firma_lng:eppGps?eppGps.lng:null,
      firma_precision_m:eppGps?eppGps.precision:null,
      pdf_url:null
    }).select().single();
    if(error)throw new Error(error.message);
    const entrega=data;

    const {error:errItems}=await window.supabaseClient.from('epp_entrega_items')
      .insert(items.map(it=>({entrega_id:entrega.id,...it})));
    if(errItems)throw new Error(errItems.message);

    // marcar los elementos como entregados y ligarlos a esta entrega
    for(const it of seleccionados){
      const {error:errUp}=await window.supabaseClient.from('epp_kit_asignacion_items')
        .update({estado:'entregado',entrega_id:entrega.id,entregado_at:new Date().toISOString()})
        .eq('id',it.id);
      if(errUp)throw new Error(errUp.message);
    }

    msg.textContent='Subiendo firma y PDF…';
    const carpeta=`${entrega.code}/${entrega.id}`;
    if(firma){
      const firmaBlob=await (await fetch(firma)).blob();
      const firmaPath=`${carpeta}/firma.png`;
      await uploadToBucket(firmaPath,firmaBlob,'image/png');
      const {error:errF}=await window.supabaseClient.from('epp_entregas').update({firma_url:firmaPath}).eq('id',entrega.id);
      if(errF)throw new Error(errF.message);
    }
    const pdfPath=`${carpeta}/entrega_${entrega.fecha}.pdf`;
    await uploadToBucket(pdfPath,buildEppPdf(entrega,items,firma),'application/pdf');
    const {error:errP}=await window.supabaseClient.from('epp_entregas').update({pdf_url:pdfPath}).eq('id',entrega.id);
    if(errP)throw new Error(errP.message);

    // ¿quedó completo el kit?
    const restantes=(a.items||[]).filter(i=>i.estado==='pendiente'&&!seleccionados.some(s=>mismoId(s.id,i.id))).length;
    if(restantes===0){
      await window.supabaseClient.from('epp_kit_asignaciones')
        .update({completado:true,completado_at:new Date().toISOString()}).eq('id',a.id);
    }
    await Promise.all([loadEppDeliveries(true),loadKitAsignaciones(true)]);
    clearSignature('Kit');
    limpiarGps('Kit');
    document.getElementById('kit-obs').value='';
    fillKitAsigSelect();
    renderKitAsigList();
    const finTxt=restantes===0?' Kit completo ✓':` Quedan ${restantes} pendiente(s).`;
    msg.textContent=`Entregados ${seleccionados.length} elemento(s).${finTxt}`;
    msg.style.color='var(--accent)';
  }catch(error){
    msg.textContent='No se pudo guardar: '+error.message;
    msg.style.color='var(--danger)';
    alert('No se pudo entregar: '+error.message);
  }finally{
    btn.disabled=false;
  }
}

// ---------- 3) listado de asignaciones ----------
function renderKitAsigList(){
  const el=document.getElementById('kitAsigList');
  if(!el)return;
  if(!kitAsignaciones.length){el.innerHTML='<small>Nadie tiene un kit asignado todavía.</small>';return;}
  el.innerHTML=kitAsignaciones.map(a=>{
    const w=workers.find(x=>x.code===a.code);
    const p=progresoAsignacion(a);
    const pills=(a.items||[]).map(i=>`<span class="kitItemPill ${i.estado==='entregado'?'ok':'no'}">${i.epp_codigo||i.nombre}${i.talla?' '+i.talla:''} ×${i.cantidad}</span>`).join('');
    return `<div class="kitAsigCard">
      <div class="headline">
        <span><b>${a.code}</b> ${w?w.name:''} · ${a.especialidad_nombre||''} · kit <b>${a.kit_nombre||''}</b> · ${a.fecha}</span>
        <span>${p.completo
          ?'<span class="kitEstado entregado">Completo</span>'
          :`<span class="kitEstado pendiente">${p.hechos}/${p.total} entregados</span>`}</span>
      </div>
      <div class="kitBar ${p.completo?'completo':''}"><i style="width:${p.pct}%"></i></div>
      <div>${pills}</div>
    </div>`;
  }).join('');
}

// ---------- 4) administración ----------
async function addEspecialidad(){
  const nombre=document.getElementById('esp-nombre').value.trim();
  const descripcion=document.getElementById('esp-desc').value.trim();
  if(!nombre){alert('Escribe el nombre de la especialidad.');return;}
  const clave=normalizarCargo(nombre);
  if(especialidades.some(e=>e.clave===clave)){alert('Ya existe la especialidad "'+nombre+'".');return;}
  const {error}=await window.supabaseClient.from('epp_especialidades').insert({clave,nombre,descripcion:descripcion||null});
  if(error){alert('No se pudo crear la especialidad: '+error.message);return;}
  document.getElementById('esp-nombre').value='';
  document.getElementById('esp-desc').value='';
  await loadEspecialidades(true);
  especialidadSeleccionada=clave;
  renderEspecialidades();
  fillEspecialidadSelect();
}
function renderEspecialidades(){
  const el=document.getElementById('espList');
  if(!el)return;
  if(!especialidades.length){el.innerHTML='<small>No hay especialidades creadas.</small>';return;}
  el.innerHTML=especialidades.map(e=>{
    const nKits=kitsDeEspecialidad(e.id).length;
    return `<div class="espItem ${e.clave===especialidadSeleccionada?'sel':''}" onclick="seleccionarEspecialidad('${e.clave}')">
      <span style="flex:1;min-width:0">
        <span class="n">${e.nombre}</span><br>
        <span class="d">${nKits} kit(s)</span>
      </span>
      <span style="display:flex;gap:4px;align-items:center">
        <span class="ct" onclick="event.stopPropagation();eliminarEspecialidad('${e.clave}')" style="cursor:pointer" title="Eliminar">✕</span>
      </span>
    </div>`;
  }).join('');
}
function seleccionarEspecialidad(clave){
  especialidadSeleccionada=clave;
  const esp=especialidadPorClave(clave);
  const lista=kitsDeEspecialidad(esp?esp.id:'');
  kitAdminSeleccionado=lista.length?lista[0].id:'';
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  fillEspecialidadSelect();
}
function renderKitAdminList(){
  const el=document.getElementById('kitAdminList');
  if(!el)return;
  const esp=especialidadPorClave(especialidadSeleccionada);
  const lista=esp?kitsDeEspecialidad(esp.id):[];
  if(!lista.length){el.innerHTML='<small>Sin kits. Crea el primero (Pintor A, Pintor B…).</small>';return;}
  el.innerHTML=lista.map(k=>{
    const n=itemsDeKit(k.id).length;
    return `<div class="espItem ${mismoId(k.id,kitAdminSeleccionado)?'sel':''}" onclick="seleccionarKitAdmin('${k.id}')">
      <span style="flex:1;min-width:0"><span class="n">${k.nombre}</span><br><span class="d">${n} elemento(s)</span></span>
      <span class="ct" onclick="event.stopPropagation();eliminarKit('${k.id}')" style="cursor:pointer" title="Eliminar">✕</span>
    </div>`;
  }).join('');
}
function seleccionarKitAdmin(id){
  kitAdminSeleccionado=id;
  renderKitAdminList();
  renderKitDetalleAdmin();
}
async function addKitAdmin(){
  const esp=especialidadPorClave(especialidadSeleccionada);
  const nombre=document.getElementById('kitNombre').value.trim();
  if(!esp){alert('Selecciona una especialidad.');return;}
  if(!nombre){alert('Escribe el nombre del kit (ej. "Pintor A").');return;}
  if(kitsDeEspecialidad(esp.id).some(k=>k.nombre.toLowerCase()===nombre.toLowerCase())){
    alert('Esa especialidad ya tiene un kit llamado "'+nombre+'".');return;
  }
  const {data,error}=await window.supabaseClient.from('epp_kits')
    .insert({especialidad_id:esp.id,nombre,orden:kitsDeEspecialidad(esp.id).length})
    .select().single();
  if(error){alert('No se pudo crear el kit: '+error.message);return;}
  document.getElementById('kitNombre').value='';
  await loadKits(true);
  kitAdminSeleccionado=data.id;
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  fillEspecialidadSelect();
}
async function eliminarKit(id){
  const k=kits.find(x=>mismoId(x.id,id));
  if(!k)return;
  if(!confirm(`Se eliminará el kit "${k.nombre}" con sus ${itemsDeKit(id).length} elemento(s). ¿Continuar?`))return;
  const {error}=await window.supabaseClient.from('epp_kits').delete().eq('id',id);
  if(error){alert('No se pudo eliminar: '+error.message);return;}
  await loadKits(true);
  kitAdminSeleccionado='';
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  fillEspecialidadSelect();
}
async function eliminarEspecialidad(clave){
  const esp=especialidadPorClave(clave);
  if(!esp)return;
  const nKits=kitsDeEspecialidad(esp.id).length;
  if(!confirm(`Se eliminará "${esp.nombre}" y sus ${nKits} kit(s). ¿Continuar?`))return;
  const {error}=await window.supabaseClient.from('epp_especialidades').delete().eq('id',esp.id);
  if(error){alert('No se pudo eliminar: '+error.message);return;}
  await Promise.all([loadEspecialidades(true),loadKits(true)]);
  especialidadSeleccionada='';
  kitAdminSeleccionado='';
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  fillEspecialidadSelect();
}
function renderKitDetalleAdmin(){
  const el=document.getElementById('kitDetalleAdmin');
  if(!el)return;
  const kit=kits.find(k=>mismoId(k.id,kitAdminSeleccionado));
  if(!kit){el.innerHTML='<small>Selecciona un kit para ver sus elementos.</small>';return;}
  const items=itemsDeKit(kit.id);
  const filas=items.map(i=>{
    const cat=eppCatalog.find(c=>c.codigo===i.epp_codigo);
    return `<div class="kitFila">
      <div></div>
      <div><b>${i.epp_codigo}</b> ${cat?cat.nombre:i.epp_codigo}${cat&&cat.activo===false?' <small style="color:var(--danger)">(dado de baja)</small>':''}</div>
      <div><select onchange="setKitItemField('${kit.id}','${i.epp_codigo}','talla_sugerida',this.value)">${tallaOptions(cat&&cat.tipo_talla,i.talla_sugerida||'')}</select></div>
      <div><input type="number" min="1" step="1" value="${i.cantidad}" onchange="setKitItemField('${kit.id}','${i.epp_codigo}','cantidad',this.value)"></div>
      <div style="text-align:center">×${i.cantidad}</div>
      <div><button class="btn secondary" type="button" onclick="quitarKitItem('${kit.id}','${i.epp_codigo}')">Quitar</button></div>
    </div>`;
  }).join('');
  el.innerHTML=`
    <label>Elementos de ${kit.nombre}</label>
    <div class="eppItems" style="margin-top:6px">${filas||'<div class="kitVacio">Este kit está vacío.</div>'}</div>
    <div class="row" style="margin-top:8px">
      <div><label>Agregar elemento</label><select id="kitAddItem">${eppCatalog.filter(c=>c.activo!==false).map(c=>`<option value="${c.codigo}">${c.codigo} — ${c.nombre}</option>`).join('')}</select></div>
      <div style="display:flex;align-items:flex-end"><button class="btn" type="button" onclick="agregarItemAlKit('${kit.id}')">Agregar al kit</button></div>
    </div>`;
}
async function setKitItemField(kitId,codigo,campo,valor){
  const patch={};
  patch[campo]=campo==='cantidad'?(parseInt(valor,10)||1):valor;
  const {error}=await window.supabaseClient.from('epp_kit_items').update(patch).eq('kit_id',kitId).eq('epp_codigo',codigo);
  if(error){alert('No se pudo actualizar: '+error.message);return;}
  await loadKitItems(true);
  renderKitDetalleAdmin();
  renderKitAdminList();
}
async function agregarItemAlKit(kitId){
  const codigo=document.getElementById('kitAddItem').value;
  if(!codigo){alert('Elige un elemento del catálogo.');return;}
  if(itemsDeKit(kitId).some(i=>i.epp_codigo===codigo)){alert('Ese elemento ya está en el kit.');return;}
  const {error}=await window.supabaseClient.from('epp_kit_items')
    .insert({kit_id:kitId,epp_codigo:codigo,cantidad:1,orden:itemsDeKit(kitId).length+1});
  if(error){alert('No se pudo agregar al kit: '+error.message);return;}
  await loadKitItems(true);
  renderKitDetalleAdmin();
  renderKitAdminList();
  renderEspecialidades();
  fillEspecialidadSelect();
  renderKitPreview();
}
async function quitarKitItem(kitId,codigo){
  if(!confirm('¿Quitar '+codigo+' del kit?'))return;
  const {error}=await window.supabaseClient.from('epp_kit_items').delete().eq('kit_id',kitId).eq('epp_codigo',codigo);
  if(error){alert('No se pudo quitar: '+error.message);return;}
  await loadKitItems(true);
  renderKitDetalleAdmin();
  renderKitAdminList();
  renderEspecialidades();
  fillEspecialidadSelect();
  renderKitPreview();
}

// ---------- entrada a la vista ----------
// El selector de la sección de kits. El del trabajador lo llena
// llenarSelectoresEspecialidad(), que existe desde antes y hace lo mismo
// para los dos: guarda la clave, ordena por nombre y conserva lo que había.
//
// Se !"usa" la misma función en los dos lugares y no dos parecidas: con dos,
  // Se usa la misma función en los dos lugares y no dos parecidas: con dos,
// de con la clave. La clave es lo que compara kit_de_un_trabajador() en la
// base, así que con el id el trabajador deja de recibir su charla de oficio.
function fillEspecialidadSelect(){
  llenarSelectoresEspecialidad();
  const sel=document.getElementById('kit-esp');
  if(!sel)return;
  const previo=sel.value;
  sel.innerHTML=especialidades.length
    ?especialidades.map(e=>`<option value="${e.id}">${escHtml(e.nombre||e.clave)}</option>`).join('')
    :'<option value="">— crea primero una especialidad —</option>';
  if(previo&&especialidades.some(e=>mismoId(e.id,previo)))sel.value=previo;
}
function initKitsView(){
  const selW=document.getElementById('kit-worker');
  if(selW){
    const previo=selW.value;
    selW.innerHTML=opcionesTrabajadores();
    if(workers.some(w=>w.code===previo))selW.value=previo;
  }
  const fecha=document.getElementById('kit-fecha');
  if(fecha&&!fecha.value)fecha.value=hoyLocal();
  if(!especialidadSeleccionada){
    const esp=especialidadDelTrabajador(selW?selW.value:'');
    if(esp)especialidadSeleccionada=esp.clave;
  }
  fillEspecialidadSelect();
  if(selW&&selW.value){
    const esp=especialidadDelTrabajador(selW.value);
    if(esp)document.getElementById('kit-esp').value=esp.id;
  }
  fillKitSelects();
  fillKitAsigSelect();
  renderKitAsigList();
  renderEspecialidades();
  renderKitAdminList();
  renderKitDetalleAdmin();
  actualizarKitWorkerHint();
}
function actualizarKitWorkerHint(){
  const selW=document.getElementById('kit-worker');
  const el=document.getElementById('kitWorkerHint');
  if(!selW||!el)return;
  const w=workers.find(x=>x.code===selW.value);
  if(!w){el.innerHTML='';return;}
  const esp=especialidadDelTrabajador(w.code);
  const yaTiene=kitAsignaciones.find(a=>a.code===w.code&&!a.completado);
  el.innerHTML=`<small>Seleccionado: <b>${w.name}</b>${w.spec?' — '+w.spec:''}${esp?` · especialidad: <b>${esp.nombre}</b>`:''}${yaTiene?` · <span style="color:var(--danger)">ya tiene pendiente el kit "${yaTiene.kit_nombre}" (${progresoAsignacion(yaTiene).pendientes} elemento(s))</span>`:''}</small>`;
  if(esp)document.getElementById('kit-esp').value=esp.id;
  fillKitSelects();
  const stamp=document.getElementById('sigStampKit');
  if(stamp)stamp.textContent='Firma de '+w.name;
}
function seleccionarKitWorkerByScan(scanned){
  const w=resolverCodigoTrabajador(scanned);
  if(!w)return;
  if(typeof showView==='function')showView('bodega-kits');
  const sel=document.getElementById('kit-worker');
  if(sel)sel.value=w.code;
  actualizarKitWorkerHint();
  if(navigator.vibrate){try{navigator.vibrate(120);}catch(error){}}
  const esp=especialidadDelTrabajador(w.code);
  const hint=document.getElementById('kitWorkerHint');
  if(hint)hint.innerHTML=`<small style="color:var(--accent)">✓ ${w.name}${esp?` — kit de <b>${esp.nombre}</b>`:''}. Asigna el kit y luego marca lo que entregues.</small>`;
}

// ============================================================
// MULTI-EMPRESA
// Hay varias empresas en el sistema. Cada trabajador pertenece a
// una, y cada usuario del sistema solo ve los trabajadores de las
// empresas a las que tiene acceso (por eso "workers" se filtra al
// cargar: así todo lo demás —tarja, EPP, tarjetas— queda acotado).
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
// ===================================================================
//
// Lo que se le entrega a una persona el primer día: la inducción, la
// declaración de salud, los elementos de protección, el acta de
// recepción. En papel, firmado, con el timbre de la empresa.
//
// TRES PIEZAS Y POR QUÉ NO SE MEZCLAN
//
//  1. La PLANTILLA. La escribe Prevención y se puede cambiar.
//  2. La ENTREGA. El papel firmado por una persona en una fecha. Esa no
//     se toca más: si se borra, se borra la prueba de que la persona fue
//     inducida. Se anula, que es distinto, y queda el rastro.
//  3. El TIMBRE. Sale de la tabla `empresa`, que ya tiene nombre y RUT. No
//     se duplican acá: si el timbre tuviera su propio nombre, algún día los
//     dos dicen cosas distintas y el que vale es el del papel.
//
// POR QUÉ EL PDF SE GENERA RENDERIZANDO, NO ESCRIBIENDO TEXTO
//
// Escribir el PDF a mano con una librería obliga a elegir una fuente
// Metrics, y la fuente que traen esas librerías no tiene ñ, ni á, ni é. Con
// texto español sale "A\ufff1ez" o directamente nada. Hay que subir una
// fuente completa embebida, que son varios cientos de kilobytes.
//
// Renderizando el HTML con html2canvas y metiéndolo en el PDF se usa la
// fuente que está mirando la persona, con sus tildes, y además el timbre y
// la firma salen exactamente como se ven en pantalla. El costo es que el
// texto del PDF no es seleccionable. Para un papel firmado eso no es una
// pérdida: nadie busca texto adentro de un acta firmada.
//
// LA ESPECIALIDAD DEL TRABAJADOR
//
// La decide una persona desde la ficha. NO se adivina del texto libre del
// cargo: adivinar significa que el primero que quede mal recibe la charla
// del oficio equivocado, que es peor que no recibir ninguna.
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
  // Y el desplegable del cargo nuevo, porque si no queda con la lista de antes y uno
  // elige un grupo que ya no existe.
  poblarGrupoDelCargoNuevo();
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
// CREAR UN CARGO DESDE ESTA PANTALLA
// -------------------------------------------------------------------
// Los grupos salían de la misma jerarquía, así que el desplegable también. Y un grupo que
// no aparece es que no tiene ningún cargo: como destino de un cargo nuevo no sirve de nada.
function gruposParaCargoNuevo(){
  const vistos={};
  const out=[];
  jerarquiaCargos.forEach(f=>{
    if(!f.grupo||vistos[f.grupo])return;
    vistos[f.grupo]=1;
    out.push({clave:f.grupo,nombre:f.grupoNombre||f.grupo});
  });
  // Y "general" igual, porque existe siempre y es donde cae lo que no es de un grupo
  // definido. Si no hay ningún cargo en él, la jerarquía no lo trae, y sin él no se
  // podría crear un cargo "soltado", que es el caso más común de los que no son de obra.
  if(!vistos.general)out.push({clave:'general',nombre:'General'});
  return out.sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));
}

function poblarGrupoDelCargoNuevo(){
  const sel=document.getElementById('ecCargoGrupo');
  if(!sel)return;
  const antes=sel.value;
  sel.innerHTML=gruposParaCargoNuevo()
    .map(g=>'<option value="'+escHtml(g.clave)+'">'+escHtml(g.nombre)+'</option>')
    .concat('<option value="__nuevo__">Crear un grupo nuevo…</option>').join('');
  // Y se conserva lo que estaba elegido, si es que sigue estando.
  if(antes&&[...sel.options].some(o=>o.value===antes))sel.value=antes;
  alCambiarGrupoDelCargoNuevo();
}

// Y el campo del grupo nuevo aparece solo cuando se pide, en vez de estar siempre ahí
// molestando: si está siempre visible, alguien lo llena sin querer pensando que es el
// nombre del cargo, y el cargo se crea donde no es.
function alCambiarGrupoDelCargoNuevo(){
  const sel=document.getElementById('ecCargoGrupo');
  const caja=document.getElementById('ecGrupoNuevoCaja');
  if(sel&&caja)caja.style.display=sel.value==='__nuevo__'?'':'none';
}

async function crearCargoDesdePantalla(){
  const sel=document.getElementById('ecCargoGrupo');
  const inp=document.getElementById('ecCargoNombre');
  const nuevo=document.getElementById('ecGrupoNuevo');
  const aviso=document.getElementById('ecAviso');
  if(!sel||!inp)return;

  const nombre=inp.value.trim();
  if(!nombre){
    if(aviso)aviso.textContent='Escribe el nombre del cargo.';
    inp.focus();
    return;
  }

  let grupo=sel.value;

  // -----------------------------------------------------------------
  // EL GRUPO NUEVO, SI SE PIDIÓ
  // -----------------------------------------------------------------
  // Con la función que ya existe para el grupo de arriba, porque es la misma tarea y
  // tener dos caminos para lo mismo hace que uno de los dos se quede viejo.
  if(grupo==='__nuevo__'){
    const g=nuevo?(nuevo.value||'').trim():'';
    if(!g){
      if(aviso)aviso.textContent='Escribe el nombre del grupo nuevo.';
      if(nuevo)nuevo.focus();
      return;
    }
    const r=await window.supabaseClient.rpc('gestionar_grupo',{
      p_clave:null,p_nombre:g,p_orden:900,p_activo:true
    });
    if(r.error){
      if(aviso)aviso.textContent='No se pudo crear el grupo: '+r.error.message;
      return;
    }
    // Y vuelve un TEXT con la clave, no una tabla. Pedir una propiedad llamada
    // "gestionar_grupo" sobre un texto devuelve "undefined", y el grupo queda creado
    // con el mensaje diciendo que no se pudo leer la clave.
    grupo=typeof r.data==='string'?r.data.trim():'';
    if(!grupo){
      await cargarJerarquiaCargos(true);
      renderEmpresasCargos();
      if(aviso)aviso.textContent='El grupo se guardó, pero no se pudo leer su clave. Elígelo de la lista y vuelve a crear el cargo.';
      return;
    }
  }

  const {data,error}=await window.supabaseClient.rpc('gestionar_cargo',{
    p_clave:null,p_nombre:nombre,p_grupo_clave:grupo,p_activo:true
  });
  if(error){
    if(aviso)aviso.textContent='No se pudo crear el cargo: '+error.message;
    return;
  }

  // Y por lo mismo: la clave es lo que vuelve, y si no se puede leer no se inventa.
  const clave=typeof data==='string'?data.trim():'';
  if(!clave){
    await cargarJerarquiaCargos(true);
    renderEmpresasCargos();
    if(aviso)aviso.textContent='El cargo se guardó, pero no se pudo leer la clave con la que quedó. Vuelve a mirarlo en la lista.';
    return;
  }

  inp.value='';
  if(nuevo)nuevo.value='';
  await cargarJerarquiaCargos(true);
  poblarGrupoDelCargoNuevo();
  renderEmpresasCargos();
  // Y el mensaje no dice "creado", porque la función devuelve la clave tanto si lo creó
  // como si ya existía escrito de otra forma. Decir "creado" cuando no se creó nada
  // hace dudar de la lista que se ve debajo.
  if(aviso)aviso.textContent='"'+nombre+'" quedó con la clave "'+clave+'". Ya aparece en el desplegable del ingreso.';
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
