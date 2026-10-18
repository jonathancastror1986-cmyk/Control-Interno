// ===================================================================
// LOS DOS REGISTROS DE PERMISOS
// ===================================================================
// Un archivo nuevo, y no dos pantallas metidas en "administracion.js" ni en
// "documentos.js", por una razón concreta: los dos registros son tablas de
// consulta, no pantallas de trabajo. No editan nada, no guardan nada, y no
// necesitan la mitad de lo que hace un archivo de tres mil líneas.
//
// ---------------------------------------------------------------------
// LAS DOS PANTALLAS Y POR QUÉ SON DOS Y NO UNA
// ---------------------------------------------------------------------
//
// Porque son dos datos que no viven en el mismo lugar, y esa es la diferencia
// de fondo, no de forma:
//
//   · el permiso DIARIO no tiene tabla propia: es una fila de "asistencia" con
//     estado 'P', 'PP', 'L', 'A', 'V' o 'LL'. Es un hecho del día completo.
//
//   · el permiso POR HORA vive en "permiso_horario" (migración 086). Es un
//     intervalo dentro de un día, con su motivo, su solicitante y su resolución.
//
// Meterlos en una pantalla con dos pestañas obligaría a explicar en cada
// pestaña de qué tabla sale lo que se está mirando. En dos pantallas, cada
// título dice de dónde sale.
//
// ---------------------------------------------------------------------
// Y POR QUÉ EN "APROBACIONES Y ESTADOS" Y NO EN "ASISTENCIA MENSUAL"
// ---------------------------------------------------------------------
//
// Porque estas dos no cambian nada: son el papel que respalda las decisiones que
// se toman en otro lado. Quien va a cambiar un estado va a "Solicitar cambio de
// estado"; quien va a revisar uno va a "Aprobar solicitudes". Estas dos son para
// el que después quiere ver el registro y contarlo. Va al lado de las otras dos
// porque es del mismo trabajo, no del trabajo de la planilla.
//
// ---------------------------------------------------------------------
// Y NINGUNA DE LAS DOS EDITA
// ---------------------------------------------------------------------
//
// Como la bitácora: un permiso ya registrado no se corrige desde acá, se deja
// otro. Por eso no hay botones de escribir en este archivo. La escritura vive
// en "resolver_permiso_horario" y en los RPC de estado de la asistencia.

// ---------------------------------------------------------------------
// LO QUE SE CONSULTA
// ---------------------------------------------------------------------

// La jornada de la empresa que se está mirando, para el cálculo de horas del
// permiso con hora.
//
// Por qué el global y no un parámetro: esta función SÍ lee de la pantalla, es
// la que junta el dato con la empresa activa. La regla que hace el cálculo está
// en "horasDePermiso", que es pura y no sabe de pantallas.
function jornadaParaPermisos(empresaId){
  const lista=Array.isArray(empresas)?empresas:[];
  // Y SI NO SE SABE LA EMPRESA, SE DEVUELVE NADA, Y NO "LA PRIMERA"
  //
  // Porque la primera empresa de la lista puede ser de otra persona. Un cálculo
  // de horas hecho con la colación de otra empresa es un número inventado, que
  // es peor que no tener el número.
  const e=lista.find(x=>mismoId(x.id,empresaId))||null;
  if(!e)return {colacion_inicio:null,colacion_duracion_min:null};
  return {
    colacion_inicio:e.colacion_inicio||null,
    colacion_duracion_min:(e.colacion_duracion_min!=null)?Number(e.colacion_duracion_min):null
  };
}

// ===================================================================
// LAS HORAS DE UN PERMISO CON HORA
// ===================================================================
// UNA SOLA FUNCIÓN, Y ES PURA
// ---------------------------------------------------------------------
// POR QUÉ ESTÁ SUELTA Y CON LOS DATOS POR PARÁMETRO
// ---------------------------------------------------------------------
//
// Porque es la parte de esta pantalla que se puede equivocar sin que nadie lo
// note: un número un poco bajo no se ve malo, se ve raro, y alguien lo corrige
// "a ojo". Con los datos por parámetro se puede probar con Node, que es lo que
// hace "tools/prueba-horas-permiso.js", con los cinco casos que salen mal en la
// vida real: el permiso que pasa de medianoche, el que no llega a la colación,
// el que sí, la empresa sin colación cargada y el rango que daría negativo.
//
// ---------------------------------------------------------------------
// Y POR QUÉ LA COLACIÓN SE RESTA SÓLO SI EL PERMISO LA CUBRE
// ---------------------------------------------------------------------
//
// Porque la colación es una hora acordada de la jornada, no una pausa que se
// descuenta porque sí. Si el permiso es de 09:00 a 12:00 y la empresa almuerza
// a las 13:00, esa persona estuvo las tres horas en la obra: no se fue a
// colación, y descontarle 30 minutos lo que shrinking. Al revés: si el permiso
// es de 12:00 a 16:00 y la colación es a las 13:00, estaba comiendo, y las
// horas de permiso son dos horas y media, no tres.
//
// ---------------------------------------------------------------------
// Y POR QUÉ EL CRUCE DE MEDIANOCHE SE RESUELVE ANTES DE RESTAR
// ---------------------------------------------------------------------
//
// Porque "hora_fin < hora_inicio" en un permiso de 22:00 a 02:00 no es un
// rango al revés: es un rango que pasó la medianoche. Restando sin más, da
// menos 1.200 minutos, y un permiso de seis horas aparece como de veinte horas
// menos en una tabla de planilla. Por eso a "hora_fin" se le suman 24 horas
// ANTES de restar, y recién después se ve si la colación cae dentro.
function horasDePermiso(pHoraInicio, pHoraFin, pColacion){
  const ini=typeof minutosDe==='function'?minutosDe(pHoraInicio):null;
  const fin=typeof minutosDe==='function'?minutosDe(pHoraFin):null;
  // Sin horas legibles no hay nada que calcular. Se devuelve cero con la nota,
  // nunca un "NaN" pintado en la tabla.
  if(ini==null||fin==null){
    return {minutos:0,horas:'0 h',cruza_medianoche:false,resta_colacion:0,inconsistente:true,nota:'La franja no tiene horas legibles.'};
  }
  // Y EL +1440 DE MEDIANOCHE, ANTES DE RESTAR
  let f=fin;
  let cruza=false;
  if(f<ini){f+=1440;cruza=true;}
  const crudos=f-ini;
  // Y LA COLACIÓN, SÓLO SI ESTÁ CARGADA
  //
  // "colacion_inicio" y "colacion_duracion_min" vienen de "empresas" y pueden
  // venir vacíos: una empresa que todavía no acordó su jornada no tiene colación
  // que descontar. Si falta cualquiera de los dos, no se resta nada y no se
  // inventa un valor.
  const colIni=pColacion&&pColacion.colacion_inicio
    ?(typeof minutosDe==='function'?minutosDe(pColacion.colacion_inicio):null)
    :null;
  const colMin=pColacion&&pColacion.colacion_duracion_min!=null
    ?Number(pColacion.colacion_duracion_min):null;
  let resta=0;
  let cubre=false;
  if(colIni!=null&&isFinite(colMin)&&colMin>0){
    // Y "CUBRE" SE PREGUNTA SOBRE LA FRANJA YA EXTENDIDA
    //
    // Con cruce de medianoche la franja va de "ini" hasta "f-1440" del día
    // siguiente, así que la colación está dentro si cae después del inicio O
    // antes del final del tramo del día siguiente. Sin cruce, tiene que caer
    // entre las dos horas y nada más.
    cubre=cruza
      ?(colIni>=ini||colIni<=(f-1440))
      :(colIni>=ini&&colIni<=f);
    if(cubre)resta=colMin;
  }
  const neto=crudos-resta;
  // Y EL PISO EN CERO, CON LA NOTA AL LADO
  //
  // El único caso que llega acá es un permiso muy corto que igual alcanza a
  // cubrir la colación entera. La tabla de planilla no admite horas negativas:
  // se muestra 0 y se dice que el rango está raro, para que alguien lo revise
  // en vez de sumar un "-0:30" a un total.
  if(neto<0){
    return {minutos:0,horas:'0 h',cruza_medianoche:cruza,resta_colacion:resta,inconsistente:true,
      nota:'El rango es inconsistente: la colación que cubre es más larga que el permiso. Se muestra 0.'};
  }
  let nota='';
  if(cruza)nota='Pasa de la medianoche: se contaron '+Math.floor(crudos/60)+' h de reloj.';
  else if(!cubre&&resta===0&&colIni!=null&&isFinite(colMin)&&colMin>0){
    nota='No cubre la colación de la empresa, así que no se descontó.';
  }
  return {
    minutos:neto,
    horas:textoDuracion(neto)||'0 h',
    cruza_medianoche:cruza,
    resta_colacion:resta,
    inconsistente:false,
    nota:nota
  };
}

// Y EL TEXTO CORTO DE LA COLUMNA "HORAS"
//
// Sin decimales y con la coma decimal chilena: 2,5 h. Un permiso se cuenta en
// medias horas, no en minutos, y "2,5" se lee de una glance en una tabla ancha.
function horasLegiblesPermiso(minutos){
  const n=Number(minutos);
  if(!isFinite(n)||n<=0)return '0';
  return String(Math.round((n/60)*100)/100).replace('.',',');
}

// ===================================================================
// EL REGISTRO DE PERMISOS POR HORA
// ===================================================================

let rpHoraFilas=[];
let rpHoraCargada=false;
let rpHoraError='';
// El tope de filas de la consulta. Un sitio con dos años de permisos por hora
// pasa de cien mil filas, y eso no es una tabla: es colgar la pantalla. Con
// 2.000 el filtro por fecha sigue siendo útil, y el aviso dice que puede haber
// más, para que nadie cuente sobre una muestra sin saberlo.
const RP_HORA_TOPE=2000;

function rpTexto(v){return escHtml(v==null?'':v);}

function rpAvisoError(mensaje){
  // Y EL MENSAJE DICE QUÉ HACER, NO SÓLO QUÉ PASÓ
  //
  // Un "error de red" sin más no dice si hay que recargar, cambiar el rango o
  // llamar a alguien. Y si la base no se cargó, lo dice con el mensaje que ya
  // arma "supabase.client.js", porque en ese caso recargar no arregla nada.
  if(window.supabaseFallo){
    return rpTexto(window.supabaseFallo.mensaje||'No se pudo cargar la configuración de la base. Revisá el archivo config/supabase.config.js y recargá la página.');
  }
  return rpTexto(mensaje);
}

function rpRellenos(){
  const d=document.getElementById('rpHoraDesde');
  const h=document.getElementById('rpHoraHasta');
  if(!d||!h)return;
  // Treinta días para atrás por omisión: es donde está el trabajo del mes, y un
  // rango abierto desde hace dos años solo muestra ruido viejo.
  if(!d.value)d.value=(function(){
    const f=new Date();f.setDate(f.getDate()-30);
    return isoLocal(f);
  })();
  if(!h.value)h.value=hoyLocal();
}

// Y EL FILTRO DE EMPRESA
//
// Se arma acá y no en el HTML porque depende de lo que se cargó, y porque tiene
// que traer SÓLO las empresas permitidas: ofrecer una empresa ajena y que no
// salga nada es peor que no ofrecerla.
function rpLlenarFiltros(){
  const sel=document.getElementById('rpHoraEmpresa');
  if(sel){
    const previo=sel.value;
    const permitidas=(Array.isArray(empresas)?empresas:[])
      .filter(function(e){return veTodasLasEmpresas()||misEmpresas.includes(e.id);});
    sel.innerHTML='<option value="">Todas las empresas</option>'
      +permitidas.map(function(e){return '<option value="'+e.id+'">'+rpTexto(e.nombre)+'</option>';}).join('');
    if([...sel.options].some(function(o){return o.value===previo;}))sel.value=previo;
  }
  const st=document.getElementById('rpHoraEstado');
  if(st&&!st.options.length){
    st.innerHTML='<option value="">Todos los estados</option>'
      +'<option value="pendiente">Pendiente</option>'
      +'<option value="confirmado">Confirmado</option>'
      +'<option value="anulado">Anulado</option>';
  }
}

function rpFiltroEmpresaAId(){
  const v=(document.getElementById('rpHoraEmpresa')||{}).value||'';
  return v?Number(v):null;
}

// Y NO SE USA "empresaData" PARA ESTO
//
// "empresaData" devuelve la PRIMERA empresa cuando el trabajador no tiene una
// asignada, porque en una tarjeta conviene mostrar algo antes que nada. Acá eso
// es un error: el cálculo de horas y el nombre de la empresa en la tabla tienen
// que salir de la empresa real de esa persona, o de ninguna.
function rpEmpresaDe(w){
  if(!w)return null;
  const lista=Array.isArray(empresas)?empresas:[];
  return lista.find(function(e){return mismoId(e.id,w.empresa_id);})||null;
}

// Y LOS CÓDIGOS QUE SE PUEDEN VER
//
// "workers" ya viene recortado por la empresa activa: "aplicarEmpresa" saca a
// los de otras empresas antes de que esta pantalla los vea. Sobre esa lista se
// acota por la empresa del filtro y por el texto de la búsqueda. Así el filtro
// no es solo de pintado: entra en la consulta, y no se puede traer a alguien
// que no debería estar acá.
function rpCodigosVisibles(texto){
  const empId=rpFiltroEmpresaAId();
  const t=String(texto||'').trim().toLowerCase();
  const lista=(Array.isArray(workers)?workers:[]).filter(function(w){
    if(empId&&!mismoId(w.empresa_id,empId))return false;
    if(!t)return true;
    return rpNombreCoincide(w,t);
  });
  return lista.map(function(w){return w.code;});
}

// Y POR QUÉ EXISTE UNA FUNCIÓN PARA ESO
//
// Porque el texto se usa en DOS lugares y tiene que decir lo mismo en los dos:
// dentro de la consulta (para traer menos filas) y en el pintado (cuando se
// escribe letra por letra y no se va a la base). Si cada uno tuviera su regla,
// escribir "Pérez" con o sin tilde encontraría gente en la consulta y no en la
// tabla, o al revés.
function rpNombreCoincide(w,texto){
  const t=String(texto||'').trim().toLowerCase();
  if(!t)return true;
  return (String(w&&w.name||'').toLowerCase().indexOf(t)>=0)
    ||(String(w&&w.code||'').toLowerCase().indexOf(t)>=0)
    ||(String(codigoMostrar(w&&w.code)||'').toLowerCase().indexOf(t)>=0);
}

async function initRegistroPermisosHora(){
  rpRellenos();
  rpLlenarFiltros();
  await cargarRegistroPermisosHora();
}

async function cargarRegistroPermisosHora(){
  const lista=document.getElementById('rpHoraLista');
  const aviso=document.getElementById('rpHoraAviso');
  if(!lista)return;
  const empresaId=rpFiltroEmpresaAId();
  const codigos=rpCodigosVisibles((document.getElementById('rpHoraBuscar')||{}).value);
  rpHoraError='';
  rpHoraCargada=false;
  if(window.supabaseFallo){
    rpHoraError=window.supabaseFallo.mensaje||'No se pudo configurar la conexión con la base.';
    rpHoraFilas=[];
    rpHoraCargada=true;
    renderRegistroPermisosHora();
    return;
  }
  lista.innerHTML='<small>Cargando permisos por hora…</small>';
  // Y "let", NUNCA "const"
  //
  // Con filtros opcionales hay que ir agrandando la consulta, y "const" no se
  // puede reasignar: se rompe la pantalla al cambiar el primer filtro. Ver
  // "docs/el-error-de-const.md".
  let q=window.supabaseClient.from('permiso_horario')
    .select('id,code,fecha,hora_inicio,hora_fin,motivo,estado,pedido_por_nombre,pedido_por_rol,confirmado_por_nombre,confirmado_at,comentario,creado_en');
  const desde=(document.getElementById('rpHoraDesde')||{}).value;
  const hasta=(document.getElementById('rpHoraHasta')||{}).value;
  if(desde)q=q.gte('fecha',desde);
  if(hasta)q=q.lte('fecha',hasta);
  const estado=(document.getElementById('rpHoraEstado')||{}).value;
  if(estado)q=q.eq('estado',estado);
  // Y SI EL FILTRO DEJA CERO PERSONAS VISIBLES, NO SE CONSULTA NADA
  //
  // Sin este recorte, una empresa sin trabajadores visibles haría la consulta
  // entera y traería las filas que el RLS deja pasar: un listado con datos de
  // otra empresa y un filtro que dice "no hay". Pasa en pantalla antes que en la
  // base, que es lo que hace confuso el filtro de empresa.
  if(!codigos.length&&empresaId){
    rpHoraFilas=[];
    rpHoraCargada=true;
    lista.innerHTML='<div style="padding:20px;color:var(--muted)">No hay trabajadores visibles en esa empresa.</div>';
    return;
  }
  if(codigos.length)q=q.in('code',codigos);
  // Y EL ORDEN ANTES DEL TOPE
  //
  // Al revés el tope corta en cualquier orden y trae una muestra al azar. Con
  // el orden primero trae los más recientes, que es lo que se está mirando.
  const res=await q.order('fecha',{ascending:false}).order('hora_inicio').limit(RP_HORA_TOPE);
  if(res.error){
    rpHoraError=String(res.error.message||res.error);
    rpHoraFilas=[];
    rpHoraCargada=true;
    renderRegistroPermisosHora();
    return;
  }
  rpHoraFilas=res.data||[];
  rpHoraCargada=true;
  renderRegistroPermisosHora();
  if(aviso&&!rpHoraError)aviso.innerHTML='';
}

function rpEstadoTexto(estado){
  const e=estadoPermisoHorario(estado);
  return e?e.texto:'Sin estado';
}

function rpClaseEstado(estado){
  const e=estadoPermisoHorario(estado);
  return e?e.clase:'';
}

function rpHoraDe(valor){
  return rpTexto(String(valor||'').slice(0,5));
}

function renderRegistroPermisosHora(){
  const lista=document.getElementById('rpHoraLista');
  const resumen=document.getElementById('rpHoraResumen');
  const aviso=document.getElementById('rpHoraAviso');
  if(!lista)return;
  if(resumen)resumen.innerHTML='';
  if(aviso)aviso.innerHTML='';
  if(rpHoraError){
    if(aviso)aviso.innerHTML='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px">'
      +'<b>No se pudieron leer los permisos por hora.</b> Probá con un rango de fechas más corto, o revisá la conexión.<br>'
      +'<small>'+rpAvisoError(rpHoraError)+'</small></div>';
    lista.innerHTML='';
    return;
  }
  if(!rpHoraCargada){lista.innerHTML='<small>Cargando…</small>';return;}
  // Y EL TEXTO DEL BUSCADOR SE APLICA AQUÍ TAMBIÉN, NO SÓLO EN LA CONSULTA
  //
  // Porque escribir una letra repinta desde la memoria, sin volver a la base.
  // Si el filtro no estuviera en este punto, el buscador se vería funcionando y
  // no filtraría nada: el peor fallo posible en un filtro, porque no da error.
  const texto=String((document.getElementById('rpHoraBuscar')||{}).value||'').trim().toLowerCase();
  const vista=rpHoraFilas.filter(function(p){
    if(!texto)return true;
    const w=workers.find(function(x){return x.code===p.code;});
    return rpNombreCoincide(w,texto)||rpNombreCoincide({name:'',code:p.code},texto);
  });
  // Y EL RESUMEN ANTES DE LA TABLA
  //
  // Cuántos hay y cuántas horas suman. Sin el total, el que mira la tabla cuenta
  // a mano, y cuenta distinto cada vez. Y cuenta lo que SE VE, no lo que se
  // cargó: un total que suma filas que el filtro escondió no sirve para nada.
  let minutos=0;
  const porEstado={pendiente:0,confirmado:0,anulado:0};
  vista.forEach(function(p){
    const w=workers.find(function(x){return x.code===p.code;});
    const j=jornadaParaPermisos(w?w.empresa_id:rpFiltroEmpresaAId());
    minutos+=horasDePermiso(p.hora_inicio,p.hora_fin,j).minutos;
    if(porEstado[p.estado]!=null)porEstado[p.estado]++;
  });
  if(resumen)resumen.innerHTML='<b>'+vista.length+'</b> permiso(s) por hora'
    +' <small>de '+rpHoraFilas.length+' cargados</small>'
    +' · <b>'+rpTexto(horasLegiblesPermiso(minutos))+'</b> h en total'
    +' <small>· pendientes '+porEstado.pendiente+' · confirmados '+porEstado.confirmado+' · anulados '+porEstado.anulado+'</small>';
  if(!vista.length){
    lista.innerHTML='<div style="padding:20px;color:var(--muted)">'
      +(rpHoraFilas.length?'Ninguno de los '+rpHoraFilas.length+' permisos coincide con la búsqueda.'
                          :'No hay permisos por hora en este rango de fechas. Probá con "Todos los estados".')+'</div>';
    return;
  }
  const filas=vista.map(function(p){
    const w=workers.find(function(x){return x.code===p.code;});
    const emp=rpEmpresaDe(w);
    const j=jornadaParaPermisos(w?w.empresa_id:rpFiltroEmpresaAId());
    const h=horasDePermiso(p.hora_inicio,p.hora_fin,j);
    const notaH=h.inconsistente
      ?'<small style="color:var(--danger)">'+rpTexto(h.nota)+'</small>'
      :(h.nota?'<small style="color:var(--muted)">'+rpTexto(h.nota)+'</small>':'');
    const creado=rpTexto(fechaLegible(p.creado_en,true));
    const resuelto=rpTexto(fechaLegible(p.confirmado_at,true));
    return '<tr>'
      +'<td><b>'+rpTexto(codigoMostrar(p.code))+'</b></td>'
      +'<td>'+rpTexto(w?w.name:p.code)+'<small style="color:var(--muted)">'+rpTexto(emp?emp.nombre:'—')+'</small></td>'
      +'<td><small>'+rpTexto(fechaCorta(p.fecha))+'</small></td>'
      +'<td><small>'+rpHoraDe(p.hora_inicio)+'</small></td>'
      +'<td><small>'+rpHoraDe(p.hora_fin)+'</small></td>'
      +'<td><b>'+rpTexto(horasLegiblesPermiso(h.minutos))+' h</b>'+notaH+'</td>'
      +'<td><span class="permisoHorarioEstado '+rpTexto(rpClaseEstado(p.estado))+'">'+rpTexto(rpEstadoTexto(p.estado))+'</span></td>'
      +'<td><small>'+rpTexto(p.motivo||'')+'</small></td>'
      +'<td><small>'+rpTexto(p.pedido_por_nombre||'—')+(p.pedido_por_rol?' ('+rpTexto(p.pedido_por_rol)+')':'')+'</small>'
        +(creado?'<small style="color:var(--muted)">'+creado+'</small>':'')+'</td>'
      +'<td><small>'+rpTexto(p.confirmado_por_nombre||'—')+'</small>'
        +(resuelto?'<small style="color:var(--muted)">'+resuelto+'</small>':'')
        +(p.comentario?'<small style="color:var(--muted)">'+rpTexto(p.comentario)+'</small>':'')+'</td>'
      +'</tr>';
  }).join('');
  lista.innerHTML='<div style="overflow:auto"><table class="tabla" style="width:100%;min-width:900px">'
    +'<thead><tr>'
    +'<th>Código</th><th>Nombre</th><th>Fecha</th><th>Desde</th><th>Hasta</th>'
    +'<th>Horas</th><th>Estado</th><th>Motivo</th><th>Lo pidió</th><th>Lo confirmó</th>'
    +'</tr></thead><tbody>'+filas+'</tbody></table></div>';
  if(rpHoraFilas.length>=RP_HORA_TOPE){
    lista.innerHTML='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:8px 12px;border-radius:8px;margin-bottom:10px">'
      +'<b>Se trajo el máximo de '+RP_HORA_TOPE+' permisos.</b> Puede haber más en este rango: acotá las fechas.</div>'+lista.innerHTML;
  }
}

// Y EL BUSCADOR NO VA A LA BASE EN CADA TECLA
//
// Un texto libre no se puede mandar al servidor sin traer todo lo posible, y lo
// que ya está en memoria son dos mil filas. Los demás filtros SÍ van a la
// consulta, porque esos se pueden resolver en la base.
function filtrarRegistroPermisosHora(){
  const texto=String((document.getElementById('rpHoraBuscar')||{}).value||'').trim();
  if(texto){renderRegistroPermisosHora();return;}
  cargarRegistroPermisosHora().catch(function(){});
}

// ===================================================================
// EL REGISTRO DE PERMISOS DIARIOS
// ===================================================================

let rpDiaFilas=[];
let rpDiaCargada=false;
let rpDiaError='';
const RP_DIA_TOPE=2000;

// Los estados que cuentan como "no estuvo en la obra". "X" NO va: presente es lo
// contrario de permiso, y meterlo acá haría que el registro mostrara todos los
// días trabajados de todo el mundo.
const RP_ESTADOS_PERMISO=['P','PP','L','A','V','LL'];

function initRegistroPermisosDiarios(){
  const d=document.getElementById('rpDiaDesde');
  const h=document.getElementById('rpDiaHasta');
  if(d&&!d.value){
    const f=new Date();f.setDate(f.getDate()-30);
    d.value=isoLocal(f);
  }
  if(h&&!h.value)h.value=hoyLocal();
  rpLlenarFiltrosDiarios();
  cargarRegistroPermisosDiarios().catch(function(){});
}

function rpLlenarFiltrosDiarios(){
  const sel=document.getElementById('rpDiaEmpresa');
  if(sel){
    const previo=sel.value;
    const permitidas=(Array.isArray(empresas)?empresas:[])
      .filter(function(e){return veTodasLasEmpresas()||misEmpresas.includes(e.id);});
    sel.innerHTML='<option value="">Todas las empresas</option>'
      +permitidas.map(function(e){return '<option value="'+e.id+'">'+rpTexto(e.nombre)+'</option>';}).join('');
    if([...sel.options].some(function(o){return o.value===previo;}))sel.value=previo;
  }
  const st=document.getElementById('rpDiaEstado');
  if(st){
    const previo=st.value;
    // Y EL TEXTO COMPLETO DEL ESTADO, NUNCA LA LETRA SOLA
    //
    // "P" por sí solo no dice nada. La letra es para escribirla en la planilla;
    // para leerla, la gente necesita "Permiso".
    st.innerHTML='<option value="">Todos los estados</option>'
      +RP_ESTADOS_PERMISO.map(function(x){
          return '<option value="'+x+'">'+rpTexto(estadoTexto(x))+'</option>';
        }).join('');
    if([...st.options].some(function(o){return o.value===previo;}))st.value=previo;
  }
  const sp=document.getElementById('rpDiaSupervisor');
  if(sp){
    const previo=sp.value;
    const lista=typeof supervisoresActivos==='function'?supervisoresActivos():[];
    sp.innerHTML='<option value="">Todos los supervisores</option>'
      +lista.map(function(s){return '<option value="'+rpTexto(s.code)+'">'+rpTexto(s.name||s.code)+'</option>';}).join('');
    if([...sp.options].some(function(o){return o.value===previo;}))sp.value=previo;
  }
}

function rpCodigosDiarios(texto){
  const empVal=(document.getElementById('rpDiaEmpresa')||{}).value||'';
  const supVal=(document.getElementById('rpDiaSupervisor')||{}).value||'';
  const t=String(texto||'').trim().toLowerCase();
  return (Array.isArray(workers)?workers:[]).filter(function(w){
    if(empVal&&!mismoId(w.empresa_id,empVal))return false;
    if(supVal&&String(w.supervisor_code||'')!==String(supVal))return false;
    if(!t)return true;
    return rpNombreCoincide(w,t);
  }).map(function(w){return w.code;});
}

async function cargarRegistroPermisosDiarios(){
  const lista=document.getElementById('rpDiaLista');
  if(!lista)return;
  const codigos=rpCodigosDiarios((document.getElementById('rpDiaBuscar')||{}).value);
  rpDiaError='';
  rpDiaCargada=false;
  if(window.supabaseFallo){
    rpDiaError=window.supabaseFallo.mensaje||'No se pudo configurar la conexión con la base.';
    rpDiaFilas=[];
    rpDiaCargada=true;
    renderRegistroPermisosDiarios();
    return;
  }
  lista.innerHTML='<small>Cargando permisos diarios…</small>';
  let q=window.supabaseClient.from('asistencia')
    .select('id,code,fecha,estado,hora_llegada,nota,origen')
    .in('estado',RP_ESTADOS_PERMISO);
  const desde=(document.getElementById('rpDiaDesde')||{}).value;
  const hasta=(document.getElementById('rpDiaHasta')||{}).value;
  if(desde)q=q.gte('fecha',desde);
  if(hasta)q=q.lte('fecha',hasta);
  const estado=(document.getElementById('rpDiaEstado')||{}).value;
  if(estado)q=q.eq('estado',estado);
  if(codigos.length)q=q.in('code',codigos);
  const res=await q.order('fecha',{ascending:false}).order('code').limit(RP_DIA_TOPE);
  if(res.error){
    rpDiaError=String(res.error.message||res.error);
    rpDiaFilas=[];
    rpDiaCargada=true;
    renderRegistroPermisosDiarios();
    return;
  }
  rpDiaFilas=res.data||[];
  rpDiaCargada=true;
  renderRegistroPermisosDiarios();
}

function filtrarRegistroPermisosDiarios(){
  const texto=String((document.getElementById('rpDiaBuscar')||{}).value||'').trim();
  if(texto){renderRegistroPermisosDiarios();return;}
  cargarRegistroPermisosDiarios().catch(function(){});
}

function renderRegistroPermisosDiarios(){
  const lista=document.getElementById('rpDiaLista');
  const resumen=document.getElementById('rpDiaResumen');
  const aviso=document.getElementById('rpDiaAviso');
  if(!lista)return;
  if(resumen)resumen.innerHTML='';
  if(aviso)aviso.innerHTML='';
  if(rpDiaError){
    if(aviso)aviso.innerHTML='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px">'
      +'<b>No se pudieron leer los permisos diarios.</b> Probá con un rango de fechas más corto, o revisá la conexión.<br>'
      +'<small>'+rpAvisoError(rpDiaError)+'</small></div>';
    lista.innerHTML='';
    return;
  }
  if(!rpDiaCargada){lista.innerHTML='<small>Cargando…</small>';return;}

  // Y EL BUSCADOR TAMBIÉN SE APLICA AQUÍ, POR LA MISMA RAZÓN QUE EN EL REGISTRO
  // POR HORA: escribir una letra repinta desde la memoria, y sin este filtro el
  // buscador se vería funcionando sin filtrar nada.
  const texto=String((document.getElementById('rpDiaBuscar')||{}).value||'').trim().toLowerCase();
  const vista=rpDiaFilas.filter(function(f){
    if(!texto)return true;
    const w=workers.find(function(x){return x.code===f.code;});
    return rpNombreCoincide(w,texto);
  });

  // Y EL RESUMEN POR ESTADO, CON EL TEXTO Y NO CON LA LETRA
  //
  // "4 P · 1 L" obliga a ir a mirar qué es P. "4 Permiso · 1 Licencia" se lee
  // de una, que es para lo que sirve el resumen. Y cuenta lo que SE VE, no lo
  // que se cargó: un resumen que suma filas que el filtro escondió no sirve.
  const cuenta={};
  vista.forEach(function(f){
    cuenta[f.estado]=(cuenta[f.estado]||0)+1;
  });
  const partes=Object.keys(cuenta).sort().map(function(k){
    return cuenta[k]+' '+estadoTexto(k);
  });
  if(resumen)resumen.innerHTML='<b>'+vista.length+'</b> día(s) con permiso o ausencia'
    +(vista.length!==rpDiaFilas.length?' <small>de '+rpDiaFilas.length+' cargados</small>':'')
    +(partes.length?' <small>· '+rpTexto(partes.join(' · '))+'</small>':'');

  if(!vista.length){
    lista.innerHTML='<div style="padding:20px;color:var(--muted)">'
      +(rpDiaFilas.length?'Ninguno de los '+rpDiaFilas.length+' días coincide con la búsqueda.'
                          :'No hay permisos diarios en este rango de fechas. Probá con "Todos los estados".')+'</div>';
    return;
  }
  const filas=vista.map(function(f){
    const w=workers.find(function(x){return x.code===f.code;});
    const sup=w&&w.supervisor_code?workers.find(function(x){return x.code===w.supervisor_code;}):null;
    const emp=rpEmpresaDe(w);
    return '<tr>'
      +'<td><b>'+rpTexto(codigoMostrar(f.code))+'</b></td>'
      +'<td>'+rpTexto(w?w.name:f.code)
        +'<small style="color:var(--muted)">'+rpTexto(emp?emp.nombre:'—')+(sup?' · '+rpTexto(sup.name):'')+'</small></td>'
      +'<td><small>'+rpTexto(fechaCorta(f.fecha))+'</small></td>'
      +'<td><b>'+rpTexto(estadoTexto(f.estado))+'</b></td>'
      +'<td><small>'+rpTexto(f.hora_llegada?String(f.hora_llegada).slice(0,5):'—')+'</small></td>'
      +'<td><small>'+rpTexto(f.nota||'')+'</small></td>'
      +'<td><small style="color:var(--muted)">'+rpTexto(f.origen||'')+'</small></td>'
      +'</tr>';
  }).join('');
  lista.innerHTML='<div style="overflow:auto"><table class="tabla" style="width:100%;min-width:760px">'
    +'<thead><tr>'
    +'<th>Código</th><th>Nombre</th><th>Fecha</th><th>Estado</th><th>Hora de llegada</th><th>Nota</th><th>Origen</th>'
    +'</tr></thead><tbody>'+filas+'</tbody></table></div>';
  if(rpDiaFilas.length>=RP_DIA_TOPE){
    lista.innerHTML='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:8px 12px;border-radius:8px;margin-bottom:10px">'
      +'<b>Se trajo el máximo de '+RP_DIA_TOPE+' días.</b> Puede haber más en este rango: acotá las fechas.</div>'+lista.innerHTML;
  }
}