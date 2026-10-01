/* ===================================================================
   js/supervisores.js - LOS SUPERVISORES
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
   - JUSTIFICACIÓN DIARIA: QUIÉN TIENE QUE EXPLICAR SU ASISTENCIA
   - CONCILIACIÓN: LA PLANILLA CONTRA EL RELOJ

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
// Son dos registros distintos de lo mismo, y por eso se contradicen:
//   · "asistencia" es la PLANILLA: quién está presente, y a qué hora
//     quedó. La edita una persona.
//   · "marcajes"  es lo que registró el reloj de la obra.
//
// El caso que importa es uno: el reloj tiene la marcación y la planilla
// no. Ese trabajador fichó, y en el sistema nadie lo marcó. O al revés:
// quedó presente en la planilla sin que el reloj registre nada, que es
// justo lo que hay que poder detectar.
//
// Se agrupan en cuatro, y son excluyentes: cada trabajador cae en una
// sola categoría para una fecha dada.
function conciliarDia(supCode){
  const equipo=equipoDe(supCode);
  const planillaPorCode=new Map(asistenciaDia.map(a=>[a.code,a]));
  // Tolerancia para considerar que dos horas "coinciden". Un minuto de
  // diferencia entre lo que escribió el supervisor y lo que vio el reloj
  // es redondeo, no una discrepancia. Se agranda a 10 minutos, que es lo
  // habitual entre un reloj y una anotación.
  const TOLERANCIA_MIN=10;
  const filas=[];
  equipo.forEach(w=>{
    const ent=marcajeDe(w.code,'entrada');
    const sal=marcajeDe(w.code,'salida');
    const reloj=ent||sal;
    const planilla=planillaPorCode.get(w.code)||null;
    const presenteEnPlanilla=!!planilla&&planilla.estado==='X';
    const marcajeReloj=!!ent;

    let situacion;
    if(marcajeReloj&&!presenteEnPlanilla){
      // ESTE es el caso que se pidió: fichó en el reloj, no está en la
      // planilla. Falta marcar.
      situacion='falta_marcar';
    }else if(!marcajeReloj&&presenteEnPlanilla){
      // Al revés: quedó presente sin que el reloj registre nada.
      situacion='sin_marcaje';
    }else if(marcajeReloj&&presenteEnPlanilla){
      // Los dos dicen que presente. Ahora: ¿coincide la hora?
      const minReloj=minutosDe(reloj.hora);
      const minPlanilla=planilla&&planilla.hora_llegada?minutosDe(String(planilla.hora_llegada).slice(0,5)):null;
      const dif=(minReloj!=null&&minPlanilla!=null)?Math.abs(minReloj-minPlanilla):null;
      situacion=(dif!=null&&dif>TOLERANCIA_MIN)?'diferencia_hora':'al_day';
    }else{
      situacion='ninguno';
    }
    const difMin=(()=>{
      if(!reloj||!planilla||!planilla.hora_llegada)return null;
      const a=minutosDe(reloj.hora);
      const b=minutosDe(String(planilla.hora_llegada).slice(0,5));
      return (a!=null&&b!=null)?a-b:null;
    })();
    filas.push({w,ent,sal,reloj,planilla,presenteEnPlanilla,marcajeReloj,situacion,difMin});
  });
  return filas;
}
// LAS PESTANAS DE LA PANTALLA DEL SUPERVISOR
//
// Mismo comportamiento que las pestañas de asistencia mensual, con
// otros atributos: data-sup-tab y data-sup-panel. No se reutiliza la
// función de aquellas porque busca por atributo, y una que sirve para
// dos pares de atributos distintos se vuelve una función con dos
// outperformedores.
//
// Y la pestaña elegida se guarda, para que al volver a la pantalla siga
// en la que estaba la persona y no vuelva a la primera. Perder la
// posición al cambiar de pantalla es de las cosas que más se notan.
function cambiarPestanaSup(clave){
  document.querySelectorAll('[data-sup-tab]').forEach(b=>{
    const on=b.dataset.supTab===clave;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  document.querySelectorAll('[data-sup-panel]').forEach(p=>{
    p.classList.toggle('active',p.dataset.supPanel===clave);
  });
  pestanaSupActual=clave;
  try{localStorage.setItem('pestanaSup',clave);}catch(error){}
}
let pestanaSupActual='diaria';
function initPestanasSup(){
  // La de la ultima vez, si es una de las que existen. Se comprueba contra
  // los botones: si el nombre guardado no esta, se cae a la primera.
  let elegida='diaria';
  try{
    const g=localStorage.getItem('pestanaSup');
    if(g&&document.querySelector('[data-sup-tab="'+g+'"]'))elegida=g;
  }catch(error){}
  document.querySelectorAll('[data-sup-tab]').forEach(b=>{
    b.addEventListener('click',()=>cambiarPestanaSup(b.dataset.supTab));
  });
  cambiarPestanaSup(elegida);
  ponerIconosEnPestanas();
}

function renderConciliacion(){
  const box=document.getElementById('conciliacionBox');
  if(!box)return;
  const selSup=document.getElementById('supDiariaSup');
  const supCode=selSup?selSup.value:miCodigoSupervisor;
  if(asistenciaDiaError){
    box.innerHTML='<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">'
      +'<b>No se pudo leer la planilla del día.</b> <small>'+escHtml(asistenciaDiaError)+'</small></div>';
    return;
  }
  if(!supCode||!equipoDe(supCode).length){
    box.innerHTML='<small>Selecciona un supervisor con equipo asignado.</small>';
    return;
  }
  const filas=conciliarDia(supCode);
  const cuenta=k=>filas.filter(f=>f.situacion===k).length;
  const falta=cuenta('falta_marcar');
  const sinMarca=cuenta('sin_marcaje');
  const dif=cuenta('diferencia_hora');
  const alertas=filas.filter(f=>f.situacion!=='al_day'&&f.situacion!=='ninguno');
  const etiqueta={
    falta_marcar:{t:'Falta marcar en la planilla',b:'faltaMarcar',c:'var(--danger)'},
    // --accent2 es un gris de superficie: en modo oscuro es #404040 sobre
    // #1e1e1e, que es invisible. Para TEXTO va --secondary-text.
    sin_marcaje:{t:'Presente en la planilla, sin marcaje del reloj',b:'sinMarcaje',c:'var(--secondary-text)'},
    diferencia_hora:{t:'La hora no coincide',b:'difHora',c:'var(--warn)'},
    al_day:{t:'Coincide',b:'ok',c:'var(--accent)'},
    ninguno:{t:'Sin registro en ninguno de los dos',b:'ninguno',c:'var(--muted)'}
  };

  // LA LISTA, EN TABLA
  //
  // Una celda por dato: quien, que dijo el reloj, que dijo la planilla, en
  // que se contradicen, y que se puede hacer.
  //
  // El cálculo viene de conciliarDia() y no se toca. Cambiar el cálculo y el
  // formato en el mismo paso esconde un error de cálculo detrás de un cambio
  // de estilo, que es la peor forma de que pase.
  //
  // EL BORDE DE COLOR
  // -----------------
  // Antes era un borde en el recuadro entero, a la izquierda. Una fila de
  // tabla no lleva borde, así que va en la primera celda. Se ve igual: el
  // color sigue a la izquierda de cada persona.
  const filasTabla=alertas.map(f=>{
    const v=etiqueta[f.situacion];
    const difMin=f.difMin!=null?` · ${f.difMin>0?'+':''}${f.difMin} min de diferencia`:'';
    const cod=escHtml(f.w.code);
    const nom=escHtml(f.w.name);
    const esp=escHtml(f.w.spec||'');
    const reloj=f.reloj?escHtml(f.reloj.hora):'—';
    const relojPie=f.reloj?escHtml(f.reloj.tipo+' (reloj)'):'no marcó';
    const planilla=f.planilla?escHtml(f.planilla.estado):'sin registro';
    const planillaPie=f.planilla&&f.planilla.hora_llegada
      ?'a las '+escHtml(String(f.planilla.hora_llegada).slice(0,5))
      :'—';
    return `<tr>
      <td class="conCelda conCeldaNombre conCeldaSituacion" style="border-left-color:${v.c}">
        <b>${cod}</b> ${nom}
        <small>${esp}</small>
      </td>
      <td class="conCelda conCeldaMarca">${reloj}<small>${relojPie}</small></td>
      <td class="conCelda conCeldaMarca">${planilla}<small>${planillaPie}</small></td>
      <td class="conCelda conCeldaEstado">
        <span class="conPill" style="border-color:${v.c};color:${v.c}">${escHtml(v.t)}</span>
        <small>${difMin||'—'}</small>
      </td>
      <td class="conCelda conCeldaAcciones">
        <button class="btnIcono" type="button" data-dato="Marcar entrada"
          title="Marcar entrada" aria-label="Marcar entrada a ${nom}"
          onclick="conciliarMarcar('${cod}','entrada')">@ICONO_ENTRADA@</button>
        <button class="btnIcono" type="button" data-dato="Marcar y avisar"
          title="Marcar y avisar" aria-label="Marcar y avisar a ${nom}"
          onclick="marcarYAvisar('${cod}','entrada')">@ICONO_AVISAR@</button>
      </td>
    </tr>`;
  }).join('');

  // El texto de los botones va en data-dato y el CSS lo dibuja al pasar el
  // puntero. El icono lleva aria-label y title con el MISMO texto: el
  // aria-label lo lee el lector de pantalla y el title es el respaldo si el
  // CSS no carga.
  //
  // Y el texto NO va dentro del botón: el lector de pantalla lo diría dos
  // veces, y la fila se alargaría con un hueco entre botón y botón.
  let tabla='<div class="conTablaCaja"><table class="conTabla">'
    +'<thead><tr><th>Trabajador</th><th>Reloj</th><th>Planilla</th><th>Situación</th><th></th></tr></thead>'
    +'<tbody>'+filasTabla+'</tbody></table></div>';
  // Los dos marcadores se cambian por el SVG de la tabla de iconos, para que
  // el dibujo no quede pegado en el texto de la fila.
  tabla=tabla.split('@ICONO_ENTRADA@').join(iconoMenu('marcar-entrada'));
  tabla=tabla.split('@ICONO_AVISAR@').join(iconoMenu('marcar-avisar'));

  const resumen='<div class="row" style="margin-bottom:10px">'
    +Object.entries(etiqueta).map(([k,v])=>{
      const n=cuenta(k);
      return `<span class="conPill" style="border-color:${v.c};color:${v.c}">${escHtml(v.t)}: <b>${n}</b></span>`;
    }).join('')+'</div>';

  // La explicación de la tolerancia va DEBAJO de la tabla, no arriba. Arriba
  // empujaba las filas hacia abajo y había que bajar para leerla.
  const pie='<p><small style="color:var(--muted)">Se considera coincidente cuando la diferencia de hora es de hasta 10 minutos,'
    +' que es lo habitual entre lo que registró el reloj y lo que anotó una persona.</small></p>';

  box.innerHTML=resumen
    +(alertas.length?tabla:'<small>El reloj y la planilla coinciden en todo el equipo.</small>')
    +pie;
}

// ============================================================
// MARCAR Y AVISAR
