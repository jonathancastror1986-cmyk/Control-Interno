/* ===================================================================
   js/documentos.js - LOS DOCUMENTOS
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
   - IMPORTAR MARCAJES DESDE EXCEL
   - BAJAR LA PLANTILLA EN WORD

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


// ===================================================================
//
// LOS CAMPOS PROPIOS DE LA EMPRESA, Y LA GENERACIÓN DE DOCUMENTOS
//
// ===================================================================
//
// -------------------------------------------------------------------
// DÓNDE ESTE TROZO ESTABA, Y POR QUÉ SE MUDÓ
// -------------------------------------------------------------------
//
// Estaba dentro de "views/asistencia/relojes.js", a partir de la línea 3396.
//
// Y ese archivo se llama "relojes.js" porque la primera mudanza partió los trozos por
// donde ya estaban, no por de qué son. Y este trozo no es de relojes: es el editor de
// plantillas, la generación del PDF y la importación desde Word. Tres cosas que no
// tienen nada que ver con un reloj.
//
// -------------------------------------------------------------------
// POR QUÉ AHORA Y NO ANTES
// -------------------------------------------------------------------
//
// En el lugar de donde salió había un comentario que lo decía, y decía esto:
//
//     POR QUÉ UN ARCHIVO NUEVO Y NO EN "relojes.js"
//
//     Porque el editor de plantillas está en "relojes.js" desde hace años, y esas son
//     74 menciones de "plantilla" que ya funcionan. Tocar ese archivo hoy, con lo que
//     hemos tocado, es mezclar dos cosas: lo que andaba y lo nuevo.
//
//     Y en un archivo aparte, el que llega después sabe dónde está lo nuevo. Si el
//     editor viejo se rompe, se deshace este archivo y no se toca lo otro.
//
// Eran razones buenas, y la segunda era la importante: durante una mudanza parcial, un
// archivo a medio mover es peor que uno entero sin mover, porque el síntoma aparece en
// una pantalla y se busca en el lugar equivocado.
//
// LO QUE CAMBIÓ es que la mudanza ya no es parcial. Este archivo es el ÚNICO bloque que
// se puede quitar entero sin dejar nada detrás: está al final, no tiene llamadas de
// nivel superior, sus tres declaraciones no colisionan con ninguna de las de este
// archivo, y este archivo se carga DESPUÉS en "app.html".
//
// Y la premisa "74 menciones que ya funcionan" era una conjetura sobre un número de
// menciones. Las funciones están medidas: son 49, y ninguna comparte nombre con otra.
// Ver "docs/plan-corte-relojes.md".
//
// -------------------------------------------------------------------
// LAS TRES DECLARACIONES DE NIVEL SUPERIOR QUE VIENEN ADELANTO
// -------------------------------------------------------------------
//
// Y viajan con el bloque, y eso es lo que lo hace posible.
//
// Un "let" o un "const" en el nivel superior NO se levanta antes de su línea: está en
// la zona muerta temporal hasta que se ejecuta. Leerlo antes es un ReferenceError con
// un mensaje que dice "no está definido", cuando sí está definido y solo falta
// ejecutarse.
//
// Por eso lo que se mueve son bloques COMPLETOS, con sus declaraciones. Y por eso este
// archivo tiene que cargarse después de "relojes.js": así, lo que quedó declarado allá
// ya existe cuando estas funciones corren. Ver "tools/pruebas/let-entre-scripts.html".
//

// ===================================================================

// KIT DE CONTRATACIÓN

// LOS CAMPOS PROPIOS DE LA EMPRESA
// ==================================
//
// -------------------------------------------------------------------
// QUÉ HACE
// --------
// El editor de plantillas que YA existía solo puede poner datos que ya están en
// "trabajadores". Acá van los que la empresa define: licencia, talla, centro de costo.
//
// Y son POR EMPRESA, porque "código de hazard" en una constructora y "código de patio" en
// un depot no son la misma cosa.
//
// -------------------------------------------------------------------
// POR QUÉ UN ARCHIVO NUEVO Y NO EN "relojes.js"
// ---------------------------------------------
//
// Porque el editor de plantillas está en "relojes.js" desde hace años, y esas son 74
// menciones de "plantilla" que ya funcionan. Tocar ese archivo hoy, con lo que hemos
// tocado, es mezclar dos cosas: lo que andaba y lo nuevo.
//
// Y en un archivo aparte, el que llega después sabe dónde está lo nuevo. Si el editor
// viejo se rompe, se deshace este archivo y no se toca lo otro.
//
// -------------------------------------------------------------------
// Y POR QUÉ UNA CLASE PROPIA EN EL CSS
// ------------------------------------
//
// Mismo motivo: "css/componentes/plantillas.css" con ".plantillaEditor". Dos columnas, un
// panel pegajoso y una lista de campos: eso es una pantalla, no un estilo suelto.
//
// -------------------------------------------------------------------
// LOS SIETE TIPOS, Y POR QUÉ NO SON MÁS
// --------------------------------------
//
// texto, numero, fecha, lista, casillas, imagen y firma. Los mismos siete que el "check" de
// la tabla. Si se agrega un tipo, se agrega en los dos lados: en el "check" de la tabla y en
// el "<select>" de esta pantalla.
//
// Y en el "SELECT" está escrito a mano a propósito, porque un tipo que la base acepta y la
// pantalla no ofrece es un campo que se puede crear de otra forma y no se puede editar acá.
const TIPOS_CAMPO = ['texto', 'numero', 'fecha', 'lista', 'casillas', 'imagen', 'firma'];

// Y los que necesitan opciones. Para los demás, mandarlas es dato muerto: se guarda y no
// se ve nunca.
const TIPOS_CON_OPCIONES = ['lista', 'casillas'];

function etiquetaTipoCampo(t) {
  return ({
    texto: 'texto',
    numero: 'número',
    fecha: 'fecha',
    lista: 'lista',
    casillas: 'casillas',
    imagen: 'imagen',
    firma: 'firma',
  })[t] || t;
}

// -------------------------------------------------------------------
// EL AVISO
// -------------------------------------------------------------------
// Y es el mismo del editor que ya existe, uno solo para los dos. Dos cajas de aviso en la
// misma pantalla se contradicen, y el que se leyó último gana.
function avisoCamposPropios(texto) {
  const a = document.getElementById('cpAviso');
  if (a) a.textContent = texto || '';
}

// -------------------------------------------------------------------
// LA VISTA PREVIA DE LA CLAVE
// -------------------------------------------------------------------
// Muestra cómo va a quedar la clave DENTRO del documento mientras se escribe.
//
// Y SIN el "empresa_id" adelante, que es lo que cambió: la forma se unificó a "[CLAVE]" y ya
// no hay prefijo. Ver [nombres-02].
//
// Y el guion lo de acá: se muestra la clave sola, sin corchetes, porque los corchetes ya están
// escritos alrededor en el HTML y ponerlos dos veces se ve como un error.
function verClaveCampo() {
  const caja = document.getElementById('cpVistaClaveCompleta');
  if (!caja) return;
  const inp = document.getElementById('cpClave');
  const cruda = (inp && inp.value ? inp.value : '').trim();

  if (!cruda) { caja.textContent = '[CLAVE]'; return; }

  // Y la normalización es la misma que la de la base: minúsculas, sin tildes, todo lo que
  // no sea letra o número a guion. Si acá se ve distinto de lo que guarda la base, el
  // usuario copia una clave que no existe.
  const clave = cruda
    .toLowerCase()
    .replace(/áéíóúü/g, 'aeiouu')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  caja.textContent = '[' + clave.toUpperCase() + ']';
}

// -------------------------------------------------------------------
// ¿EL SELECTOR TIENE ALGO REAL?
// -------------------------------------------------------------------
// Y contando las opciones con código, no el total. El total incluye la de arranque, que
// está desde el HTML, así que "!options.length" nunca es cierto y el selector queda con
// la única opción que trae. Es el bug: una guarda que dice "no hay nada que hacer"
// cuando sí lo hay. Ver [campos-05].
//
// Y "value !== ''" y no "value" a secas: un código puede ser el número 0, que es
// falsy, y se perdería.
function selectorTieneDatos(sel) {
  if (!sel) return false;
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value !== '') return true;
  }
  return false;
}

// -------------------------------------------------------------------
// LOS DOS SELECTORES DE LA DESCARGA
// -------------------------------------------------------------------
// Y el de los trabajadores y el de las plantillas.
//
// El de los trabajadores se llena con "todosWorkers", que ya está cargado: son las mismas
// personas que muestra la lista de asistencia. Y NO se vuelve a pedir a la base, porque son
// las mismas, y pedir otra vez es esperar lo mismo dos veces.
//
// Y el nombre se arma con "nombreCompleto" y no con "name", porque una ficha vieja que solo
// tiene el texto completo en "name" mostraría el nombre partido vacío. Ver [nombres-01].
async function llenarSelectoresDescarga() {
  const selW = document.getElementById('descargaTrabajador');
  const selP = document.getElementById('descargaPlantilla');

  if (selW && !selectorTieneDatos(selW)) {
    const lista = (typeof todosWorkers !== 'undefined' && todosWorkers) ? todosWorkers : [];
    selW.innerHTML = '<option value="">— trabajador —</option>' +
      lista
        .filter(w => String(w.status || 'activo') !== 'desvinculado')
        .sort((a, b) => String(a.nombreCompleto || a.name || '').localeCompare(String(b.nombreCompleto || b.name || '')))
        .map(w => '<option value="' + escHtml(String(w.code)) + '">' +
          escHtml(w.nombreCompleto || w.name || w.code) + '</option>')
        .join('');
  }

  if (selP && !selectorTieneDatos(selP)) {
    const lista = (typeof plantillasContratacion !== 'undefined' ? plantillasContratacion : [])
      .filter(p => p.vigente);
    selP.innerHTML = '<option value="">— plantilla —</option>' +
      lista.map(p => '<option value="' + escHtml(String(p.code)) + '">' +
        escHtml(p.nombre || '') + '</option>').join('');
  }

  // Y con los dos listos, se pinta la lista de variables con los datos.
  await cargarVariablesConDatos();
}

// -------------------------------------------------------------------
// EL TIPO, Y EL CAMPO DE OPCIONES
// -------------------------------------------------------------------
function cambiarTipoCampo() {
  const t = document.getElementById('cpTipo');
  const caja = document.getElementById('cpOpcionesCaja');
  if (!t || !caja) return;
  caja.style.display = TIPOS_CON_OPCIONES.indexOf(t.value) >= 0 ? '' : 'none';
}

// -------------------------------------------------------------------
// ESPERAR A QUE LLEGUEN LAS EMPRESAS
// -------------------------------------------------------------------
// Y con techo, porque "empresasCargadas" se deja en falso cuando la carga falla. Sin techo
// esta promesa nunca se resuelve, el panel queda "Cargando." para siempre, y el que lo ve
// no tiene forma de saber si está cargando o si se rompió. Ver [campos-03].
//
// Y no se llama a "loadEmpresas()" para forzar la carga: la app la llama antes que los
// trabajadores, y llamarla de nuevo desde acá sería la misma consulta dos veces y un
// "empresas" que se pisa a sí mismo mientras la otra sigue yendo.
function esperarEmpresas() {
  const yaEsta = () => (typeof empresasCargadas !== 'undefined' && empresasCargadas) ||
    (typeof empresas !== 'undefined' && empresas && empresas.length);
  if (yaEsta()) return Promise.resolve(true);

  return new Promise(function (res) {
    let intentos = 0;
    const reloj = setInterval(function () {
      intentos++;
      // Y tres segundos: es lo que tarda la consulta en un celular con datos. Pasado eso no
      // va a llegar nunca, y seguir esperando solo retrasa el mensaje que explica el problema.
      if (yaEsta() || intentos >= 30) { clearInterval(reloj); res(yaEsta()); }
    }, 100);
  });
}

// -------------------------------------------------------------------
// CARGAR LOS CAMPOS DE LA EMPRESA
// -------------------------------------------------------------------
async function cargarCamposPropios() {
  const lista = document.getElementById('camposPropiosLista');
  const emp = document.getElementById('camposPropiosEmpresa');
  if (!lista) return;

  verClaveCampo();

  // Y el selector de empresa. Se llena una sola vez, con la lista de empresas que ya se
  // carga para otros usos: no se pide otra vez a la base.
  if (emp && !emp.options.length) {
    // Y se espera a que la lista llegue. Antes se leia de una: si todavia no habia
    // llegado, el selector quedaba vacio y no habia quien lo llenara. Ver [campos-02].
    await esperarEmpresas();
    const listaEmpresas = (typeof empresas !== 'undefined' && empresas) ? empresas : [];
    emp.innerHTML = listaEmpresas
      .map(e => '<option value="' + escHtml(String(e.id)) + '">' + escHtml(e.nombre || '') + '</option>')
      .join('');
    // Y sin empresa no hay nada que mostrar, porque los campos son de una.
    if (!emp.options.length) {
      lista.innerHTML = '<small style="color:var(--muted)">No hay empresas cargadas.</small>';
      return;
    }
  }

  if (!emp || !emp.value) {
    lista.innerHTML = '<small style="color:var(--muted)">Elegí una empresa.</small>';
    return;
  }

  const empresaId = parseInt(emp.value, 10);
  const { data, error } = await window.supabaseClient.rpc('variables_de_plantilla', { p_empresa_id: empresaId });

  if (error) {
    lista.innerHTML = '<small style="color:var(--danger)">No se pudieron leer los campos: ' + escHtml(error.message) + '</small>';
    return;
  }

  const propios = (data || []).filter(v => v.es_propio);

  if (!propios.length) {
    lista.innerHTML = '<small style="color:var(--muted)">Todavía no hay campos propios. Agregá el primero con el formulario de abajo.</small>';
  } else {
    lista.innerHTML = propios.map(v => {
      // Y el nombre de la variable sale de la fila, que ya trae "[CAMPO:7-licencia]".
      // Se lo saca de adentro para mostrar solo la clave: la llave completa va en otro
      // lado, y mostrarla acá dos veces es ruido.
      const clave = String(v.variable || '').replace(/^\[CAMPO:/, '').replace(/\]$/, '');
      return '<div class="campoPropio">' +
        '<span class="cod">' + escHtml(clave) + '</span>' +
        '<span class="et">' + escHtml(v.etiqueta || '') + '</span>' +
        '<span class="ti">' + escHtml(etiquetaTipoCampo(v.tipo)) + '</span>' +
        '</div>';
    }).join('');
  }

  // Y las variables fijas aparte, porque son muchas y no tienen nada que ver con los
  // campos propios: mezclarlas en la misma lista hace que el que quiere ver "licencia"
  // tenga que pasar por veinte renglones que no le sirven.
  const fijas = (data || []).filter(v => !v.es_propio);
  const cajaVar = document.getElementById('plantillaVariables');
  if (cajaVar && !fijas.length) {
    cajaVar.innerHTML = '<small style="color:var(--muted)">Elegí un trabajador para ver los datos.</small>';
  }

  // Y los dos selectores de la descarga, que es donde se elige a quién.
  await llenarSelectoresDescarga();
}

// -------------------------------------------------------------------
// CREAR UN CAMPO
// -------------------------------------------------------------------
async function crearCampoPropio() {
  const emp = document.getElementById('camposPropiosEmpresa');
  const clave = document.getElementById('cpClave');
  const etiqueta = document.getElementById('cpEtiqueta');
  const tipo = document.getElementById('cpTipo');
  const opciones = document.getElementById('cpOpciones');
  const requerido = document.getElementById('cpRequerido');

  if (!emp || !emp.value) { avisoCamposPropios('Elegí una empresa.'); return; }

  const cruda = (clave.value || '').trim();
  if (!cruda) { avisoCamposPropios('Escribí cómo se llama el campo.'); clave.focus(); return; }

  const t = tipo.value;
  if (TIPOS_CAMPO.indexOf(t) < 0) { avisoCamposPropios('Ese tipo no existe.'); return; }

  // Y si el tipo necesita opciones, se avisa ANTES de mandar nada. La base también lo
  // avisa, pero con un error que llega con un código y hay que descifrarlo; acá es un
  // mensaje que dice qué hacer.
  const listaOpciones = (opciones.value || '').trim();
  if (TIPOS_CON_OPCIONES.indexOf(t) >= 0 && !listaOpciones) {
    avisoCamposPropios('Una lista necesita sus opciones, separadas por "|".');
    opciones.focus();
    return;
  }

  const { data, error } = await window.supabaseClient.rpc('gestionar_campo', {
    p_empresa_id: parseInt(emp.value, 10),
    p_clave: cruda,
    p_etiqueta: (etiqueta.value || '').trim() || null,
    p_tipo: t,
    p_opciones: TIPOS_CON_OPCIONES.indexOf(t) >= 0 ? listaOpciones : null,
    p_ayuda: null,
    p_orden: 100,
    p_requerido: !!requerido.checked,
    p_activo: true,
  });

  if (error) {
    avisoCamposPropios('No se pudo crear: ' + error.message);
    return;
  }

  // Y el mensaje dice la clave FINAL, que es la que va a ir en el documento. Si el usuario
  // escribió "Licencia de Conducir" y quedó "7-licencia-de-conducir", tiene que saberlo
  // ahora, no cuando lo busque dentro del documento.
  // Y el mensaje dice la variable TAL COMO SE ESCRIBE, que es "[LICENCIA]" y no la clave
  // sola. Porque si el mensaje dice "licencia" el usuario lo escribe sin corchetes, y el
  // documento le sale con la palabra "licencia" suelta adentro en vez de con el dato.
  //
  // Y en MAYÚSCULAS, que es como la reemplaza el completador: la base guarda la clave en
  // minúsculas, pero el completador la compara en mayúsculas, y si el mensaje dice una cosa
  // y el completador busca otra, el campo queda con "[licencia]" escrito en el documento.
  avisoCamposPropios('Creado. Se usa como [' + String(data || '').toUpperCase() + '].');
  clave.value = '';
  etiqueta.value = '';
  opciones.value = '';
  requerido.checked = false;

  await cargarCamposPropios();
}

// BAJAR UNA PLANTILLA CON LOS DATOS DE UN TRABAJADOR
// =====================================================
//
// -------------------------------------------------------------------
// EL ORDEN DE LAS CUATRO COSAS, Y POR QUÉ NO ES EL DE UNO
// -------------------------------------------------------------------
//
//   1. traer los datos        "datos_para_plantilla"
//   2. ver qué falta          "campos_faltantes"
//   3. recién ahí, completar  los "[CAMPO]" y los "[NOMBRE]"
//   4. y recién ahí, bajar
//
// El paso 2 antes del 3 es lo importante. Si se completara primero y se bajara, el
// documento saldría con un "[CAMPO:7-licencia]" literal adentro, que es peor que un hueco:
// un hueco se ve, y un texto entre corchetes se archiva como si estuviera completo.
//
// Y el error dice QUÉ falta y de QUÉ tipo, no "faltan datos". El que tiene que ir a buscar
// el dato es el usuario, y si el mensaje no dice cuál, vuelve a mirar la pantalla y no
// encuentra nada.
//
// -------------------------------------------------------------------
// POR QUÉ NO SE COMPLETA EN EL SERVIDOR
// -------------------------------------------------------------------
//
// Porque el contenido de la plantilla es HTML libre que edita el usuario, y meterle
// "replace" en el servidor significa escribir HTML con concatenación de cadenas, que es
// justo donde aparecen los problemas de comillas que el editor viejo ya sufrió una vez.
//
// Y porque los datos ya vienen en un jsonb con los nombres puestos: la base ya hizo el
// trabajo difícil. Acá solo se reemplazan "[NOMBRE]" y "[CAMPO:algo]", que es una operación
// de texto, no de HTML.
//
// -------------------------------------------------------------------
// Y LA VARIABLE QUE FALTA SE MARCA, NO SE BORRA
// -------------------------------------------------
//
// Una variable que no existe en el documento queda como está, en vez de desaparecer. Un
// "[NOMBRE]" que se queda es una pista de que falta algo. Un hueco en blanco no dice nada.
function completarPlantilla(html, datos, faltantes) {
  const nuevos = Object.assign({}, datos);

  // Y las que faltan se ponen con una marca, para que se vean en la vista previa antes
  // de bajar. Con "[falta]" el que abre el Word entiende al toque.
  const nombresFaltantes = new Set((faltantes || []).map(f => f.clave));
  const propiosFaltantes = Array.from(nombresFaltantes)
    .filter(c => !Object.prototype.hasOwnProperty.call(nuevos, c))
    .map(c => c.toUpperCase());

  propiosFaltantes.forEach(c => { nuevos[c] = '[falta]'; });

  let salida = html;

  // -------------------------------------------------------------------
  // LAS DOS FORMAS, Y POR QUÉ LAS DOS
  // -------------------------------------------------------------------
  // "[NOMBRE]" es la forma que ya usan los documentos que existen. Y "[CAMPO:7-licencia]" la
  // que se inventó después, con prefijo, para que un campo propio no se confundiera con una
  // variable fija.
  //
  // Se aceptan LAS DOS, y no es porcompatibilidad con uno mismo: hay documentos armorados con
  // la forma vieja, y un documento que deja de completarse a mitad es peor que un documento
  // con una sintaxis de más. Cambiar la forma es para los documentos NUEVOS.
  //
  // Y el orden importa: los "[CAMPO:...]" se reemplazan PRIMERO, porque si se buscara "[...]"
  // primero, "[CAMPO:7-licencia]" se partiría en "[7-licencia]" y "CAMPO:7-licencia]" queda
  // colgado adentro del documento.
  const reemplazar = (marcador, valor) => { salida = salida.split(marcador).join(valor); };

  Object.keys(nuevos).forEach(k => {
    const valor = nuevos[k] == null ? '' : String(nuevos[k]);
    const alta = k.toUpperCase();
    reemplazar('[CAMPO:' + k + ']', valor);
    reemplazar('[CAMPO:' + alta + ']', valor);
  });

  // Y después, todo lo demás con corchetes solos: "[NOMBRE]", "[LICENCIA]".
  Object.keys(nuevos).forEach(k => {
    const valor = nuevos[k] == null ? '' : String(nuevos[k]);
    reemplazar('[' + k.toUpperCase() + ']', valor);
  });

  return salida;
}

// -------------------------------------------------------------------
// LA VISTA PREVIA
// -------------------------------------------------------------------
// Y muestra el texto ya completado, con los huecos marcados. Porque el que va a firmar tiene
// que ver el documento antes de bajarlo, y ver que dice "[falta]" es mejor que descubrirlo
// después de imprimirlo.
function vistaPreviaPlantilla(html, datos, faltantes, css) {
  const caja = document.getElementById('plantillaPrevia');
  if (!caja) return;

  const texto = completarPlantilla(html, datos, faltantes);
  const quedan = (texto.match(/\[[A-Z_0-9:.\-]+\]/g) || []);
  const unicas = [...new Set(quedan)];

  // Y el aviso de qué falta, que se queda: es lo más útil de la vista previa, porque avisa
  // ANTES de bajar el papel y no después.
  const aviso = '<div class="docAviso">' +
    (unicas.length
      ? '<span class="pill" style="color:var(--warn);border-color:var(--warn)">Faltan: ' +
        unicas.slice(0, 8).map((v) => escHtml(v)).join(', ') +
        (unicas.length > 8 ? ' y ' + (unicas.length - 8) + ' más' : '') + '</span>'
      : '<span class="pill" style="color:var(--accent);border-color:var(--accent)">Completo</span>') +
    '</div>';

  // Y el aviso primero, y el documento después. Y NO juntos en un "innerHTML": el "srcdoc"
  // va en un atributo del marco, y se pone con "setAttribute" cuando el marco ya existe.
  const marco = document.createElement('div');
  verDocumentoEnHoja(marco, texto, css, 1120);

  caja.innerHTML = aviso;
  caja.appendChild(marco);
}


// -------------------------------------------------------------------
// BAJAR EL ARCHIVO
// -------------------------------------------------------------------
// Y es un "Blob" con tipo "application/msword": Word lo abre, se edita normal, y el usuario
// le hace "Guardar como .docx" cuando quiere.
//
// Y NO es un ".docx" de verdad. Un ".docx" es un ZIP con archivos XML adentro, y si Word no
// lo abre bien no hay ningún aviso: el usuario lo abre, ve que no sirve, y pierde el
// trabajo. Un HTML que Word abre no tiene ese problema.
async function descargarPlantillaConDatos() {
  const code = document.getElementById('descargaTrabajador');
  const sel = document.getElementById('descargaPlantilla');
  const aviso = document.getElementById('descargaAviso');
  const emp = document.getElementById('camposPropiosEmpresa');

  const worker = code && code.value;
  const pl = sel && sel.value;

  if (!worker) { if (aviso) aviso.textContent = 'Elegí un trabajador.'; return; }
  if (!pl) { if (aviso) aviso.textContent = 'Elegí una plantilla.'; return; }

  const empresaId = emp && emp.value ? parseInt(emp.value, 10) : null;

  // 1. Los datos.
  const d = await window.supabaseClient.rpc('datos_para_plantilla', {
    p_trabajador_code: worker,
    p_empresa_id: empresaId,
  });
  if (d.error) { if (aviso) aviso.textContent = 'No se pudieron leer los datos: ' + d.error.message; return; }

  const datos = d.data || {};

  // 2. Qué falta. Y SOLO los requeridos: un campo opcional vacío no es un problema.
  const f = await window.supabaseClient.rpc('campos_faltantes', {
    p_trabajador_code: worker,
    p_empresa_id: empresaId,
  });
  const faltantes = f.error ? [] : (f.data || []);

  // 3. El contenido de la plantilla. La del editor viejo trae "contenido"; la nueva de la
  // 058 trae "html". Se leen los dos porque un día hay plantillas de un origen y del otro.
  const p = await window.supabaseClient.rpc('listar_plantillas', { p_empresa_id: empresaId });
  let html = '';
  if (!p.error && p.data) {
    const fila = p.data.find(x => String(x.id) === String(pl));
    if (fila) html = fila.html || '';
  }
  if (!html) {
    const enMemoria = (typeof plantillasContratacion !== 'undefined' ? plantillasContratacion : [])
      .find(x => String(x.code) === String(pl) || String(x.id) === String(pl));
    if (enMemoria) html = enMemoria.contenido || '';
  }
  if (!html) {
    if (aviso) aviso.textContent = 'Esa plantilla no tiene contenido todavía.';
    return;
  }

  // 4. Y recién ahora, bajar. Con los campos requeridos faltantes, NO.
  if (faltantes.length) {
    if (aviso) aviso.textContent = 'Faltan datos requeridos: ' +
      faltantes.map(x => x.etiqueta || x.clave).join(', ') + '. No se baja con huecos.';
    vistaPreviaPlantilla(html, datos, faltantes);
    return;
  }

  const texto = completarPlantilla(html, datos, faltantes);

  // Y el archivo lleva un rótulo con el nombre del trabajador, porque "Contrato.doc" en la
  // carpeta de descargas de veinte personas es un documento que no se encuentra.
  const nombre = (typeof workers !== 'undefined' ? workers : []).find(w => w.code === worker);
  const quien = nombre ? nombre.nombreCompleto || nombre.name : worker;
  const archivo = String(quien).replace(/[\\/:*?"<>|]+/g, '-').trim() + '.doc';

  const completo = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    '<title>Documento</title></head><body>' + texto + '</body></html>';

  const url = URL.createObjectURL(new Blob([completo], { type: 'application/msword' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (aviso) aviso.textContent = 'Descargado: ' + archivo;

}
// ====================================================================
// BAJAR EL .DOCX DE VERDAD, CON SU FORMATO
// ====================================================================
//
// Y esto NO existía, y la razón por la que no existía está escrita más arriba, en el
// formulario, y decía:
//
//     Y el ".docx" NO se acepta, porque es un archivo comprimido y desde el navegador no se
//     puede abrir sin una librería de ZIP que este proyecto no tiene.
//
// Y la razón era buena, y YA NO SE TIENE. "fflate" son 32 KB y se bajan de CDN, que es
// exactamente el mismo camino que ya usan jsPDF, html2canvas, JsBarcode, el lector de QR y
// las otras cinco librerías del proyecto.
//
// O sea que la frase "este proyecto no tiene una librería de ZIP" era cierta el día que se
// escribió, y es falsa hoy. Y una razón que se pone vieja hay que cambiarla, no esquivarla:
// la próxima que lea el comentario va a concluir que no se puede. Ver [word-06].
//
// -------------------------------------------------------------------
// Y POR QUÉ BAJAR EL .DOCX Y NO EL .DOC
// ---------------------------------------
//
// Porque el ".doc" que se baja hoy es un HTML con otra extensión, y el ".docx" es un ZIP con
// XML adentro, y tiene el formato.
//
// Y la diferencia se ve en las cosas que SOLO Word sabe hacer: las tablas que se parten entre
// páginas, los encabezados que se repiten al cambiar de hoja, la orientación del papel, los
// márgenes exactos. Con el ".doc" eso se pierde, porque pasa por HTML.
//
// Con el ".docx" no se pierde nada, porque solo se toca el "<w:t>" donde está el dato y el
// resto del archivo se copia byte por byte.
//
// -------------------------------------------------------------------
// Y POR QUÉ EL USUARIO ELIGE EL ARCHIVO, Y NO ESTÁ GUARDADO
// ----------------------------------------------------------
//
// Porque guardar el ".docx" necesita una columna nueva y un archivo en el almacen, y eso es
// una migración que se aplica aparte. Y esta función no depende de eso.
//
// O sea que esto no reemplaza al flujo guardado: lo complementa. El que tiene el papel guardado
// en la base sigue bajando el ".doc"; el que tiene el ".docx" en su computador lo elige y se
// lo lleva lleno. Y cuando el guardado esté, esta función es la misma con el archivo tomado
// de la base en vez de del disco.
//
// -------------------------------------------------------------------
// Y NUNCA SE BAJA UN PAPEL CON UN HUECO ADENTRO
// -----------------------------------------------
//
// Y esto es lo importante de toda la función.
//
// El motor deja "[falta]" donde no encuentra un dato. Y un "[falta]" en un archivo es un
// papel con un hueco adentro, y un papel con un hueco SE IMPRIME Y SE FIRMA IGUAL. El que lo
// descarga puede no mirar.
//
// Y por eso la función NO baja y avisa. Y avisa también de las llaves sin cerrar, que es el
// otro hueco posible: una variable partida entre dos párrafos queda sin reemplazar, y eso no
// lo ve ni el que la escribió.
//
// La regla: un papel con algo sin resolver no baja. Se avisa, se corrige la plantilla, y
// después baja.
function descargarDocxConDatos() {
  const entrada = document.getElementById('docxPlantillaArchivo');
  const code = document.getElementById('descargaTrabajador');
  const aviso = document.getElementById('descargaAviso');

  const worker = code && code.value;
  if (!worker) { if (aviso) aviso.textContent = 'Elegí un trabajador.'; return; }
  if (!entrada || !entrada.files || !entrada.files[0]) {
    if (aviso) aviso.textContent = 'Elegí el archivo .docx de la plantilla.';
    return;
  }
  if (!window.fflate || !window.DOCX_PLANTILLA) {
    if (aviso) aviso.textContent = 'Falta la librería que abre el archivo. Recargá la página.';
    return;
  }

  const reader = new FileReader();

  reader.onload = async function () {
    const bytes = new Uint8Array(reader.result);

    // 1) ¿Es un .docx de verdad? Y el signo es "PK": un ZIP empieza así, y un .docx es un
    // ZIP. Un ".doc" viejo, o un PDF, no.
    //
    // Y esto va PRIMERO, porque abrir un archivo que no es un ZIP revienta con un mensaje de
    // números que no dice nada de qué está mal.
    if (!window.DOCX_PLANTILLA.esDocx(bytes)) {
      if (aviso) aviso.textContent = 'Ese archivo no es un .docx. Un .docx es un ZIP, y los '
        + 'archivos de Word viejos (.doc) no lo son.';
      return;
    }

    // 2) Los datos. La MISMA consulta que usa el ".doc", para que los dos archivos digan
    // exactamente lo mismo.
    //
    // Y por qué la misma y no una parecida: si difieren, el papel que se imprime y el que se
    // firma no son el mismo, y eso no se detecta mirando ninguno de los dos.
    const emp = document.getElementById('camposPropiosEmpresa');
    const empresaId = emp && emp.value ? parseInt(emp.value, 10) : null;

    const d = await window.supabaseClient.rpc('datos_para_plantilla', {
      p_trabajador_code: worker,
      p_empresa_id: empresaId,
    });
    if (d.error) {
      if (aviso) aviso.textContent = 'No se pudieron leer los datos: ' + d.error.message;
      return;
    }
    const datos = d.data || {};

    // 3) Rellenar.
    let r;
    try {
      r = window.DOCX_PLANTILLA.completar(bytes, datos);
    } catch (e) {
      if (aviso) aviso.textContent = 'No se pudo leer el archivo: ' + e.message;
      return;
    }

    // 4) Los datos que faltaban.
    if (r.faltan.length) {
      if (aviso) aviso.textContent = 'Faltan datos del trabajador: ' + r.faltan.join(', ')
        + '. No se baja con huecos.';
      return;
    }

    // 5) Y las llaves sueltas, que son el otro hueco posible.
    //
    // Y se mira el resultado ARMADO, no el original: una variable partida entre dos párrafos
    // se queda sin reemplazar y no aparece en "faltan", porque no se buscó.
    const partes = window.fflate.unzipSync(r.bytes);
    const texto = window.DOCX_PLANTILLA.planoDe(window.fflate.strFromU8(partes['word/document.xml']));
    const sueltas = texto.match(/\{\{|\}\}|\[\[|\]\]/g);
    if (sueltas && sueltas.length) {
      if (aviso) aviso.textContent = 'A la plantilla le quedaron ' + sueltas.length
        + ' llave(s) sin cerrar. Suele ser una variable partida entre dos párrafos. No se baja.';
      return;
    }

    // 6) Bajar. Y el nombre lleva al trabajador, como el otro, porque veinte "Contrato.docx"
    // en una carpeta de descargas no se distinguen.
    const nombre = (typeof workers !== 'undefined' ? workers : []).find(w => w.code === worker);
    const quien = nombre ? (nombre.nombreCompleto || nombre.name) : worker;
    const salida = String(quien).replace(/[\\/:*?"<>|]+/g, '-').trim() + '.docx';

    const url = URL.createObjectURL(new Blob([r.bytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = salida;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (aviso) aviso.textContent = 'Descargado: ' + salida + '  ·  ' + r.tocadas + ' dato(s) puestos.';
  };

  reader.onerror = function () {
    if (aviso) aviso.textContent = 'No se pudo leer el archivo del disco.';
  };

  reader.readAsArrayBuffer(entrada.files[0]);
}



// BAJAR LA PLANTILLA EN BLANCO
// ====================================================================
//
// Un ".doc" de Word es un HTML con otra extensión. Por eso se puede generar desde el navegador
// sin ninguna librería, que es lo único que hay acá.
//
// Y el manual viaja DENTRO del archivo. Un manual que está solo en la pantalla sirve mientras se
// está en la pantalla; el que va en el archivo sirve cuando alguien se lo pasa a otro.
// Ver [word-01].
//
// Y la lista de variables queda arriba para que nadie tenga que acordarse de cómo se llaman, y se
// borra con la línea que dice "FIN DE LAS INSTRUCCIONES". Ver [word-03].

// -------------------------------------------------------------------
// EL ESQUELETO DEL DOCUMENTO
// -------------------------------------------------------------------
// Va en una constante y no adentro de la función, porque es una constante: no cambia nunca. Y
// afuera se puede leer sin ejecutar nada, que es lo que hace la comprobación.
//
// Y con estilos dentro, porque Word los respeta. Sin estilo el documento sale como texto pelado
// y la persona tiene que armarlo entero, que es al revés de lo que se pidió.
const ESQUELETO_PLANTILLA = [
  '<h1 style="text-align:center;font-size:16pt;font-family:Calibri,Arial,sans-serif">[NOMBRE]</h1>',
  '<p style="text-align:center;font-size:11pt;font-family:Calibri,Arial,sans-serif">[CARGO] &mdash; [EMPRESA]</p>',

  '<h2 style="font-size:13pt;margin-top:24pt;font-family:Calibri,Arial,sans-serif">1. IDENTIFICACIÓN</h2>',
  '<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt">El trabajador <b>[NOMBRE]</b>, cédula de identidad [RUT],',
  'con domicilio en [DIRECCION], teléfono [TELEFONO], correo [CORREO], presta servicios a',
  '<b>[EMPRESA]</b>, RUT [RUT_EMPRESA], con domicilio en [DIRECCION_EMPRESA].</p>',
  '<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt">Su cargo es [CARGO], y corresponde al grupo',
  '[ESPECIALIDAD]. Ingresó el [FECHA_INGRESO], en el centro de costo [CENTRO].</p>',
  '<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt">Se encuentra afiliado a [AFP_NOMBRE],',
  'código [AFP_CODIGO]. Es trabajador de tipo [TIPO_TRABAJADOR].</p>',

  '<h2 style="font-size:13pt;margin-top:24pt;font-family:Calibri,Arial,sans-serif">2. DECLARACIÓN</h2>',
  '<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt">El trabajador declara que los datos anteriores son ciertos,',
  'y que cualquier cambio de ellos será oportunamente comunicado a [EMPRESA]. Declara además',
  'haber leído y aceptado el reglamento interno de la empresa.</p>',

  '<h2 style="font-size:13pt;margin-top:24pt;font-family:Calibri,Arial,sans-serif">3. FIRMA</h2>',
  '<p style="margin-top:44pt;font-family:Calibri,Arial,sans-serif;font-size:11pt">_______________________________<br>',
  '[CODIGO] &mdash; [NOMBRE]<br>[EMPRESA], [FECHA]</p>',
].join('');

// -------------------------------------------------------------------
// LAS VARIABLES QUE PUEDEN PONERSE
// -------------------------------------------------------------------
// Y es la lista completa, con lo que se eligió que existe: nombre entero [NOMBRE] y no
// [NOMBRE_COMPLETO]. Ver [nombres-01].
const VARIABLES_DEL_MODELO = [
  ['[CODIGO]', 'Código de 4 dígitos'],
  ['[RUT]', 'RUT del trabajador'],
  ['[NOMBRES]', 'Nombres'],
  ['[APELLIDO_PATERNO]', 'Apellido paterno'],
  ['[APELLIDO_MATERNO]', 'Apellido materno'],
  ['[NOMBRE]', 'El nombre entero, armado con los cuatro de arriba'],
  ['[DIRECCION]', 'Dirección'],
  ['[TELEFONO]', 'Teléfono'],
  ['[CORREO]', 'Correo'],
  ['[EMPRESA]', 'Nombre de la empresa'],
  ['[RUT_EMPRESA]', 'RUT de la empresa'],
  ['[DIRECCION_EMPRESA]', 'Dirección de la empresa'],
  ['[TELEFONO_EMPRESA]', 'Teléfono de la empresa'],
  ['[CORREO_EMPRESA]', 'Correo de la empresa'],
  ['[GIRO_EMPRESA]', 'A qué se dedica la empresa'],
  ['[CARGO]', 'Cargo'],
  ['[ESPECIALIDAD]', 'Cargo del kit'],
  ['[CENTRO]', 'Centro de costo o nombre de la obra'],
  ['[FECHA_INGRESO]', 'Fecha de ingreso'],
  ['[TIPO_TRABAJADOR]', 'Interno o subcontrato'],
  ['[AFP_CODIGO]', 'Código de la AFP'],
  ['[AFP_NOMBRE]', 'Nombre de la AFP'],
  ['[FECHA]', 'Fecha de hoy'],
];

// -------------------------------------------------------------------
// EL MANUAL, QUE VIAJA EN EL ARCHIVO
// -------------------------------------------------------------------
const MANUAL_PLANTILLA = [
  '<!--',
  'COMO SE USA ESTA PLANTILLA',
  '==========================',
  '',
  '1. BORRAR TODO DESDE ACÁ HASTA LA LÍNEA "FIN DE LAS INSTRUCCIONES". Incluye este bloque y',
  '   la lista de variables de más abajo. Se borra porque si queda, sale impreso en cada',
  '   documento que se arme con esta plantilla.',
  '',
  '2. ARMAR EL DOCUMENTO COMO UN DOCUMENTO NORMAL.',
  '',
  '3. DONDE VA UN DATO DEL TRABAJADOR, ESCRIBIR EL NOMBRE DEL CAMPO ENTRE CORCHETES Y EN',
  '   MAYÚSCULAS. Por ejemplo:',
  '',
  '       Sr. [APELLIDO_PATERNO] [APELLIDO_MATERNO], RUT [RUT]',
  '',
  '   Y NO con llaves. Antes se usaba {{nombre}} y ya no: la base reconocía esa forma y el',
  '   navegador no la reemplazaba, así que el documento salía con las llaves escritas y sin',
  '   ningún dato.',
  '',
  '4. GUARDAR COMO "Word 97-2003 (.doc)". NO como ".docx": un ".docx" es un archivo comprimido',
  '   y desde el sistema no se puede abrir.',
  '',
  '5. VOLVER, ABRIR LA PLANTILLA, ELEGIR EL ARCHIVO, Y GUARDAR.',
  '',
  'CUIDADO CON TRES COSAS DE WORD',
  '------------------------------',
  '',
  'a) LA CORRECCIÓN AUTOMÁTICA. Word cambia los corchetes y las mayúsculas mientras se escribe,',
  '   y "[NOMBRE]" se vuelve "[Nombre]" y deja de reconocerse. Si pasa: escribirlo en otro',
  '   lado, copiarlo, y pegarlo donde va.',
  '',
  'b) NO PARTIR UNA VARIABLE EN DOS. Si "[APELLIDO_PATERNO]" queda cortado entre dos párrafos,',
  '   el corchete de cierre cae en otro lado y no se reconoce. Va entera, en un solo pedazo.',
  '',
  'c) SIN ESPACIOS ADENTRO. "[ NOMBRE ]" no sirve. "[NOMBRE]" sí.',
  '',
  'FIN DE LAS INSTRUCCIONES',
  '-->',
  '',
].join('\n');

function descargarPlantillaModelo() {
  const lista = VARIABLES_DEL_MODELO.map(function (v) {
    return '  <tr><td style="width:34%;font-family:Consolas,monospace">' + v[0] +
           '</td><td>' + v[1] + '</td></tr>';
  }).join('\n');

  const documento = MANUAL_PLANTILLA +
    '<h2 style="font-family:Calibri,Arial,sans-serif;font-size:13pt">Variables disponibles: borrar antes de usar la plantilla</h2>\n' +
    '<table style="width:100%;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt">\n' +
    lista + '\n</table>\n' +
    '<p style="font-family:Calibri,Arial,sans-serif;font-weight:bold">FIN DE LAS INSTRUCCIONES</p>\n' +
    '<hr>\n' +
    ESQUELETO_PLANTILLA;

  const completo = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    '<title>Plantilla</title></head><body style="font-family:Calibri,Arial,sans-serif">' +
    documento + '</body></html>';

  const url = URL.createObjectURL(new Blob([completo], { type: 'application/msword' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const aviso = document.getElementById('plantillaError');
  if (aviso) aviso.textContent = 'Descargada plantilla.doc. Ábrela en Word, edítala y vuelve a subirla.';
}

// -------------------------------------------------------------------
// LEER UN ARCHIVO QUE SALIÓ DE WORD
// -------------------------------------------------------------------
// Word guarda un documento dentro de un HTML entero: con su "<head>", con sus estilos "mso-" y
// con su "<body>" lleno de atributos larguísimos. Si eso entra tal cual en el editor, el editor
// muestra la cabeza del documento en lugar del documento.
//
// Y hay basura que Word agrega y que no significa nada: las etiquetas del espacio de nombres de
// Office, que son "<o:p>" con dos puntos y sin cierre, y los comentarios condicionales. Las dos
// cosas se quitan antes, porque se ven en pantalla y no le hacen nada al formato.
function htmlDesdeArchivoDeWord(texto) {
  let t = String(texto || '');

  // Y la cabeza: los estilos se guardan aparte, y al editor entra solo el cuerpo.
  let estilos = '';
  t = t.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, function (_, css) { estilos += css; return ''; });
  t = t.replace(/<link[^>]*>/gi, '').replace(/<meta[^>]*>/gi, '');

  // Y el cuerpo, si viene envuelto.
  const cuerpo = t.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (cuerpo) t = cuerpo[1];

  // Y los comentarios condicionales de Word, primero: a veces traen "<style>" adentro que el
  // paso anterior no vio, y al quitarlos se van.
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<\/?[a-z]+:[^>]*>/gi, '');
  t = t.replace(/<o:p\s*\/?>/gi, '');

  // Y los "\r" sueltos: en Windows Word los mete entre "<p>" y "</p>", y en el editor salen
  // como un renglón en blanco de más.
  t = t.replace(/\r/g, '');

  return { html: t.trim(), css: estilos.trim() };
}

function subirPlantillaArchivo() {
  const archivo = document.getElementById('plantillaArchivo');
  const editor = document.getElementById('plantillaEditor');
  const aviso = document.getElementById('plantillaError');
  if (!archivo || !archivo.files || !archivo.files[0]) {
    if (aviso) aviso.textContent = 'Elegí primero un archivo.';
    return;
  }
  const f = archivo.files[0];

  // Y el ".docx" se dice que no, en vez de aceptarlo y no poder leerlo.
  if (/\.docx$/i.test(f.name)) {
    aviso.textContent = 'Un ".docx" no se puede abrir desde acá. En Word: Archivo, Guardar como, ' +
      '"Word 97-2003 (.doc)". Es el mismo documento pero se puede leer.';
    archivo.value = '';
    return;
  }

  const lector = new FileReader();
  lector.onload = function () {
    const salida = htmlDesdeArchivoDeWord(lector.result);
    if (!salida.html) {
      aviso.textContent = 'El archivo está vacío, o no tiene contenido dentro.';
      return;
    }
    editor.innerHTML = salida.html;
    const conEstilo = salida.css ? ' con su estilo.' : ' SIN estilo: si se ve feo, ' +
      'faltó guardar el bloque de estilos en el archivo.';
    aviso.textContent = 'Cargado: ' + f.name + conEstilo +
      ' Revisá cómo quedó, y después apretá Guardar.';
    archivo.value = '';
  };
  lector.onerror = function () {
    aviso.textContent = 'No se pudo leer el archivo.';
  };
  lector.readAsText(f);
}

// -------------------------------------------------------------------
// Y CUÁNTAS VARIABLES QUEDARON ESCRITAS
// -------------------------------------------------------------------
// Y al subir, avisar cuántas hay. Un archivo que sube con una variable mal escrita se guarda sin
// que nadie se entere, y el día que se baja el documento aparecen los corchetes en el papel.
function contarVariablesDelEditor() {
  const editor = document.getElementById('plantillaEditor');
  if (!editor) return 0;
  const encontradas = editor.innerHTML.match(/\[(?:CAMPO:)?[A-Za-z0-9_-]+\]/g) || [];
  return [...new Set(encontradas)].length;
}


// -------------------------------------------------------------------
// EL CSS DEL DOCUMENTO, PARA QUE SE VEA COMO EN WORD
// -------------------------------------------------------------------
// Y se limpian las reglas que no cambian nada en pantalla. El que Word guarda trae reglas "mso-*",
// "@page WordSection*", y clases vacías que solo le sirven a él.
//
// Y no se puede intentar entenderlas: no hay un analizador de CSS en el proyecto. Lo que se puede
// es mirar el nombre de cada regla y decidir por lo que dice. Ver [ver-02].
//
// Y se quedan solo las propiedades que se ven: familia, tamaño, alto de línea, márgenes, texto,
// tablas y bordes.
function cssDeDocumentoParaPantalla(css) {
  let t = String(css || '');

  // Y primero, las reglas que enteras no sirven.
  t = t.replace(/@page[^{}]*\{[\s\S]*?\}/gi, '');
  t = t.replace(/@(font-face|import|charset)[^;{]*;?/gi, '');

  const reglas = [];

  // Y después, regla por regla.
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const sel = m[1].trim();
    if (!sel) continue;

    // Y las que son del propio Word, por el nombre.
    if (/\bmso[-:]/i.test(sel) || /WordSection/i.test(sel) || sel.indexOf('Mso') === 0) continue;

    const SE_VEN = /^(?:font-family|font-size|font-weight|font-style|line-height|letter-spacing|color|background-color|margin|padding|text-align|text-indent|text-decoration|vertical-align|white-space|width|border|border-collapse|border-spacing|page-break|list-style|text-transform|clear|display)\s*:/i;

    const props = m[2].split(';')
      .map((x) => x.trim())
      .filter((x) => x && SE_VEN.test(x))
      // Y se descarta el "mso-" que se cuela en una propiedad buena:
      // "border:solid 1.0pt mso-..." no es una propiedad válida.
      .filter((x) => !/\bmso-/i.test(x));

    if (props.length) reglas.push(sel + ' {' + props.join(';') + '}');
  }

  return reglas.join('\n');
}

// -------------------------------------------------------------------
// ARMAR EL DOCUMENTO COMPLETO
// -------------------------------------------------------------------
// Y es lo mismo que baja el ".doc": una página entera, con su "<head>" y su "<style>". Por eso
// lo que se ve en la vista previa y lo que sale en Word son la misma cosa. Ver [ver-01].
//
// Y la medida sale de la "@page" del archivo de Word, si la trae. Un documento que se armó para
// carta no se muestra en A4, ni al revés.
function documentoCompletoDesdeHtml(html, css) {
  const estilos = cssDeDocumentoParaPantalla(css);
  const pagina = String(css || '').match(/@page[^{]*\{[\s\S]*?size\s*:\s*([^;}]+)/i);
  const medida = pagina ? pagina[1].trim() : '21cm 29.7cm';

  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    '<title>Documento</title>' +
    '<style>@page{size:' + medida + ';margin:2.5cm 2cm;}' + estilos + '</style>' +
    '</head><body>' + String(html || '').trim() + '</body></html>';
}

// -------------------------------------------------------------------
// LEER UN ARCHIVO QUE SALIÓ DE WORD, Y QUE VUELVA ENTERO
// -------------------------------------------------------------------
// Y ahora devuelve el "<style>", que antes se guardaba en una variable que no se guardaba en
// ningún lado: el estilo se perdía entre leer el archivo y guardar la plantilla. Y es el estilo
// lo que hace que el documento se vea como se ve en Word.
//
// Y se sigue sacando lo que Word mete y no sirve: la "<head>" con sus "<meta>", los "<link>", las
// etiquetas del espacio de nombres de Office y los comentarios condicionales.
function documentoDesdeArchivoDeWord(texto) {
  let t = String(texto || '');
  const css = (t.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';

  // Y el "<style>" se queda donde está, y la "<head>" se le saca alrededor.
  t = t.replace(/<head[^>]*>/gi, '').replace(/<\/head>/gi, '');
  t = t.replace(/<link[^>]*>/gi, '').replace(/<meta[^>]*>/gi, '');

  // Y el cuerpo.
  const cuerpo = t.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (cuerpo) t = cuerpo[1];

  // Y la basura de Office.
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<\/?[a-z]+:[^>]*>/gi, '');
  t = t.replace(/<o:p\s*\/?>/gi, '');
  t = t.replace(/\r/g, '');

  return { html: t.trim(), css: css.trim() };
}

// -------------------------------------------------------------------
// LA VISTA PREVIA, EN UN "iframe"
// -------------------------------------------------------------------
// Y en un "iframe", no en un "<div>". Porque los estilos del documento se meterían en la página
// de la aplicación: un "body{margin:0}" del documento borra los márgenes de la página, y un "h1"
// del documento se vuelve el "h1" de la aplicación.
//
// En un marco el documento es un documento aparte. Es literalmente lo mismo que baja el ".doc":
// la misma cosa que Word abre es la que se ve acá. Y no puede tocar la aplicación, porque no
// comparte nada con ella. Ver [ver-01].
//
// Y con "sandbox" sin scripts y sin formularios, porque el contenido viene de un archivo que sube
// una persona. Y con "allow-same-origin" para poder leer el alto, que es lo que hace que la hoja
// tenga el alto del papel y no el de la pantalla.
function verDocumentoEnHoja(caja, html, css, alto) {
  if (!caja) return;
  const doc = documentoCompletoDesdeHtml(html, css);

  caja.innerHTML =
    '<iframe class="docHoja" title="Vista previa del documento" ' +
      'sandbox="allow-same-origin" style="height:' + (alto || 1120) + 'px"></iframe>';

  // Y el "srcdoc" se pone DESPUÉS, con "setAttribute", y no en el "innerHTML" de arriba. En el
  // "innerHTML" el documento entero tendría que ir escapado como atributo, con las comillas
  // dobles cambiadas, y es fácil que una se escape mal y cierre el atributo antes de tiempo.
  const marco = caja.querySelector('iframe');
  if (marco) marco.setAttribute('srcdoc', doc);
}


// LAS SEIS FUENTES DE LAS PLANTILLAS
// =====================================
//
// -------------------------------------------------------------------
// POR QUÉ ESTA LISTA VIVE ACÁ Y NO EN EL HTML
// -----------------------------------------
//
// El desplegable del editor se arma con esta lista. Y si la lista estuviera escrita en el
// HTML, habría dos lugares donde cambiar las fuentes: el desplegable y la plantilla
// general. Y algún día se cambiaría en uno y no en el otro, y el editor ofrecería una
// fuente que la plantilla no tiene.
//
// O sea que la lista tiene que estar en UN solo lugar, y el que se lee desde los dos
// lados es el JavaScript.
//
// -------------------------------------------------------------------
// POR QUÉ SEIS Y NO UN CATÁLOGO
// ----------------------------
//
// Porque "elegante" sin criterio es un catálogo entero, y con veinte fuentes disponibles
// cada documento sale con una distinta y la empresa deja de verse como empresa.
//
// Con seis hay una regla que se puede decir de una vez: una serif para el texto que se lee
// seguido, y una sans para lo que se escanea. Y si un día hay que agregar una, se agrega
// acá y en la plantilla, y son dos lugares.
//
// -------------------------------------------------------------------
// Y LA RAZÓN TÉCNICA, QUE ES LA IMPORTANTE
// ----------------------------------------
//
// WORD NO DESCARGA FUENTES DE GOOGLE. La fuente viaja con el archivo solo si va EMBEBIDA, y
// Word no la embebe desde un HTML.
//
// O sea que el documento descargado lleva la fuente pedida, pero la que Word va a mostrar
// es la primera de la lista que ese computador tenga instalada. Y por eso cada fuente trae
// una del sistema con el mismo carácter como segunda: si no está Lora, se ve Georgia, que
// es una serif de lectura parecida.
//
// Y esa segunda es la que hace que el documento NO se vea roto en la máquina de quien lo
// abre. Sin ella, en un computador sin la fuente, el texto cae en una tipografía de sistema
// que no se parece en nada, y el documento pierde toda la apariencia.
//
// -------------------------------------------------------------------
// Y POR QUÉ ESTAS SEIS
// --------------------
//
// Con serif para el cuerpo del texto, que es lo que se lee seguido en un contrato de
// veinte artículos:
//
//     Lora              la más cómoda de las tres para texto largo
//     Playfair Display  contraste alto, para títulos
//     Crimson Text      serif de lectura rápida, la mejor para artículos densos
//
// Con sans para títulos y rótulos, que es lo que se escanea:
//
//     Montserrat        la que ya usa este proyecto en sus menús
//     Source Sans 3     limpia, para rótulos largos
//     Inter             la más neutra, para datos
const FUENTES_PLANTILLA = [
  { valor: 'Lora', respaldo: 'Georgia,serif' },
  { valor: 'Playfair Display', respaldo: 'Georgia,serif' },
  { valor: 'Crimson Text', respaldo: 'Georgia,serif' },
  { valor: 'Montserrat', respaldo: 'Arial,sans-serif' },
  { valor: 'Source Sans 3', respaldo: 'Arial,sans-serif' },
  { valor: 'Inter', respaldo: 'Arial,sans-serif' },
];

// -------------------------------------------------------------------
// EL DESPLEGABLE
// -------------------------------------------------------------------
// Y se arma por código, no en el HTML, para que la lista de arriba sea la única.
function llenarFuentesPlantilla() {
  const sel = document.getElementById('plantillaFuente');
  if (!sel) return;

  // Y si ya está armado no se rehace: "abrirEditorPlantilla" se llama cada vez que se edita
  // una plantilla y rehacer el desplegable cada vez pierde la fuente que el usuario tenía
  // elegida a medio cambiar.
  if (sel.dataset.lleno === '1') return;

  sel.innerHTML = '<option value="">Fuente</option>' +
    FUENTES_PLANTILLA
      .map(f => '<option value="' + escHtml(f.valor) + '">' + escHtml(f.valor) + '</option>')
      .join('');

  sel.dataset.lleno = '1';
}

// -------------------------------------------------------------------
// APLICARLA
// -------------------------------------------------------------------
// Y con "styleWithCSS" en falso ANTES de aplicar la fuente, y no después.
//
// La diferencia se ve: con estilos en falso sale UN "<font face=...>" por la selección, y con
// estilos entrue sale un "<span style=...>" por renglón. Y el "<span>" es el problema: se
// multiplica con cada cambio de fuente y con cada pegada de Word, y a la tercera ya hay
// veinte capas anidadas y el documento pesa el doble sin que se vea.
//
// Y el ORDEN importa. Ponerlo después no deshace lo que ya hizo el comando anterior: cada
// "execCommand" usa el valor que había cuando empezó. Así que puesto después no sirve de
// nada, y seemed que sí.
//
// Medido en el navegador, con el diálogo abierto:
//
//     estilo en falso   <p><font face="Lora">texto</font></p>
//     estilo en true    <p><span style="font-family: Montserrat;">texto</span></p>
function aplicarFuentePlantilla(valor) {
  if (!valor) return;
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('fontName', false, valor);
}

// -------------------------------------------------------------------
// Y PARA EL DOCUMENTO DESCARGADO
// -------------------------------
// Que es donde las seis son una restriction real y no una preferencia: el archivo que se
// baja lleva, al lado de cada fuente, su respaldo del sistema. Si el documento se arma sin
// eso, el que lo abre en un computador sin las fuentes ve una tipografía cualquiera.
//
// Y por eso la función está acá y no en el CSS de la plantilla: la necesita el generador
// del archivo, que es JavaScript.
function reglaFuentesDocumento(regla) {
  FUENTES_PLANTILLA.forEach(f => {
    regla += (regla && !/^\s*$/.test(regla)) ? '\n' : '';
    regla += f.valor + ', ' + f.respaldo;
  });
  return regla;
}

// LAS VARIABLES CON EL DATO PUESTO
// ====================================
//
// -------------------------------------------------------------------
// QUÉ CAMBIA
// ---------
//
// Antes la lista decía NOMBRE, RUT, CARGO... y nada más. Con eso hay que ir a buscar el dato
// a la ficha del trabajador, copiarlo, y pegarlo en el documento. Y si se pega mal, o se pega
// el de otra persona, el documento sale con el dato de otro.
//
// Ahora cada variable muestra SU valor, para el trabajador que esté elegido. Y es un clic
// para insertarla en la plantilla.
//
// -------------------------------------------------------------------
// Y LA LISTA TIENE QUE SEGUIR SIENDO UNA SOLA
// --------------------------------------------
//
// Hay tres fuentes y van en el mismo bloque, en este orden:
//
//   1. LA EMPRESA     nombre, RUT, dirección, teléfono, giro
//   2. EL TRABAJADOR  del "datos_para_plantilla": nombre, RUT, cargo, fecha...
//   3. LOS CAMPOS PROPIOS, de la empresa
//
// Y en UN bloque y no en tres, porque el que escribe la plantilla no puede estar adivinando
// de qué sección salió la variable. Y la empresa va arriba porque es lo primero que se llena.
//
// -------------------------------------------------------------------
// Y POR QUÉ UN "title" CON EL VALOR
// ---------------------------------
//
// Porque el valor completo puede ser largo —una dirección, un correo— y si se muestra entero
// la lista deja de ser una lista y pasa a ser un muro. Y el "title" lo tiene entero al pasar
// el mouse, sin sacar el valor de la vista.
//
// -------------------------------------------------------------------
// Y POR QUÉ EL VALOR VACÍO SE MARCA
// ---------------------------------
//
// Un "[NOMBRE]" con nada al lado y un "[NOMBRE]" con un dato se ven distinto al pasar el
// mouse, pero iguales de lejos. Y el que se escribe en mayúsculas con un guion al lado es un
// "[RUT]" que todavía no tiene nada.
//
// Y NO se esconde: se muestra. Un campo vacío que no se ve es un campo que se llena a mano.
function textoSiVacio(v) {
  const s = (v == null ? '' : String(v)).trim();
  return s ? s : '— sin dato —';
}

// Y el "title" de una variable: el nombre del campo arriba, el dato abajo. Y arriba en
// monoespaciada, porque eso es lo que va a ir en el documento.
// Y DEVUELVE UN OBJETO, Y NO UN TEXTO
// --------------------------------
// Porque el filtro necesita tres cosas de cada variable: el texto para mostrar, la clave para saber
// cuál es, y el valor para poder ponerla en la vista previa. Con un solo texto hay que volver a
// desarmarlo después, y eso es adivinar dónde termina cada parte.
function filaVariable(clave, valor, etiqueta) {
  const v = valor == null ? '' : String(valor);
  return {
    clave: clave,
    valor: v,
    // Y el texto de búsqueda lleva el nombre Y el valor, porque uno busca "rut" y a veces escribe
    // el dato de otra persona para acordarse de cuál era.
    buscar: (clave + ' ' + etiqueta + ' ' + v).toLowerCase(),
    html: '<div class="campoPropio varConDato" title="' + escHtml(etiqueta + ': ' + textoSiVacio(valor)) + '"' +
      ' data-var="' + escHtml(clave) + '" role="button" tabindex="0">' +
      '<span class="cod">' + escHtml('[' + clave + ']') + '</span>' +
      '<span class="et">' + escHtml(textoSiVacio(valor)) + '</span>' +
      (!String(valor || '').trim() ? '<span class="sinDato">vacío</span>' : '') +
    '</div>',
  };
}

// -------------------------------------------------------------------
// ARMAR LA LISTA
// -------------------------------------------------------------------
function pintarVariablesConDatos(datos, empresa) {
  const caja = document.getElementById('plantillaVariables');
  if (!caja) return;

  const filas = [];

  // -----------------------------------------------------------------
  // 1. LA EMPRESA
  // -----------------------------------------------------------------
  // Y sale de "empresas", que ya está en memoria con nombre, RUT, giro, dirección, teléfono
  // y correo. No hace falta ninguna consulta extra: la página ya la hizo para otros menús.
  //
  // Y con el prefijo "EMPRESA_", que es el que la plantilla de contrato ya usaba. O sea que
  // los documentos que están armados con esos nombres siguen funcionando sin tocarlos.
  const e = empresa || {};
  [
    ['EMPRESA', e.nombre],
    ['RUT_EMPRESA', e.rut],
    ['DIRECCION_EMPRESA', e.direccion],
    ['TELEFONO_EMPRESA', e.telefono],
    ['CORREO_EMPRESA', e.email],
    ['GIRO_EMPRESA', e.giro],
  ].forEach((x) => filas.push(filaVariable(x[0], x[1], x[0].replace(/_/g, ' ').toLowerCase())));

  // -----------------------------------------------------------------
  // 2. EL TRABAJADOR
  // -----------------------------------------------------------------
  // Y en el orden en que se leen los datos de una persona: nombre, RUT, teléfono, cargo.
  // Que sea el orden natural y no el alfabético, porque así se busca lo que uno está
  // escribiendo.
  const d = datos || {};
  [
    ['NOMBRE', d.NOMBRE],
    ['NOMBRES', d.NOMBRES],
    ['APELLIDO_PATERNO', d.APELLIDO_PATERNO],
    ['APELLIDO_MATERNO', d.APELLIDO_MATERNO],
    ['CODIGO', d.CODIGO],
    ['RUT', d.RUT],
    ['TELEFONO', d.TELEFONO],
    ['CORREO', d.CORREO],
    ['DIRECCION', d.DIRECCION],
    ['CARGO', d.CARGO],
    ['ESPECIALIDAD', d.ESPECIALIDAD],
    ['FECHA_INGRESO', d.FECHA_INGRESO],
    ['AFP_CODIGO', d.AFP_CODIGO],
    ['AFP_NOMBRE', d.AFP_NOMBRE],
  ].forEach((x) => filas.push(filaVariable(x[0], x[1], 'del trabajador')));

  // -----------------------------------------------------------------
  // 3. LOS CAMPOS PROPIOS DE LA EMPRESA
  // -----------------------------------------------------------------
  // Y acá está el detalle que hace que la lista no tenga que pedirle nada a la base: la clave
  // que trae "datos_para_plantilla" para los campos propios es la clave CRUDA, sin el prefijo
  // de empresa. Porque con la forma unificada "[LICENCIA]" el prefijo ya no se usa.
  Object.keys(d).forEach((k) => {
    if (['NOMBRE','NOMBRES','APELLIDO_PATERNO','APELLIDO_MATERNO','CODIGO','RUT','TELEFONO',
         'CORREO','DIRECCION','CARGO','ESPECIALIDAD','FECHA_INGRESO','AFP_CODIGO','AFP_NOMBRE',
         'FOTO_CASUAL','FOTO_SEGURIDAD','FIRMA'].indexOf(k) >= 0) return;
    const clave = k.replace(/^\d+-/, '');
    filas.push(filaVariable(clave, d[k], 'campo propio'));
  });

  // Y LA LISTA ARMADA QUEDA GUARDADA, PARA QUE EL FILTRO NO LE PREGUNTE NADA A LA BASE
  //
  // Si el filtro tuviera que armar la lista de nuevo, cada tecla consultaría la base otra vez. Con la
  // lista guardada, el filtro es sólo recorrer un arreglo.
  filasPlantillaListas = filas;
  pintarVariablesFiltradas();
}

// Y LA LISTA YA ARMADA. Es lo único que necesita el filtro, y lo único que se guarda.
let filasPlantillaListas = [];

function pintarVariablesFiltradas() {
  const caja = document.getElementById('plantillaVariables');
  if (!caja) return;
  const entrada = document.getElementById('plantillaVariablesFiltro');
  const q = entrada ? String(entrada.value || '').trim() : '';

  if (!filasPlantillaListas.length) {
    caja.innerHTML = '<small style="color:var(--muted)">Elegí un trabajador para ver los datos.</small>';
    return;
  }

  // Y BUSCA EN EL NOMBRE Y EN EL VALOR, SIN TILDES Y SIN IMPORTAR LAS MAYÚSCULAS
  //
  // Por las dos cosas: porque uno busca "RUT" y lo escribe en minúscula la mitad de las veces, y
  // porque busca "dirección" y lo escribe sin tilde las otras.
  const sinTilde = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const qq = sinTilde(q);
  const pasan = qq ? filasPlantillaListas.filter((f) => sinTilde(f.buscar).indexOf(qq) >= 0)
                   : filasPlantillaListas;

  if (!pasan.length) {
    caja.innerHTML = '<small style="color:var(--muted)">Ninguna variable tiene "' + escHtml(q) + '".</small>';
    return;
  }

  // Y EL RECUENTO ABAJO, PORQUE CON treinta variables no se sabe si el filtro cortó o si no hay más.
  const pie = pasan.length < filasPlantillaListas.length
    ? '<small style="color:var(--muted);display:block;margin-top:6px">' + pasan.length + ' de '
      + filasPlantillaListas.length + ' variables</small>'
    : '';
  caja.innerHTML = pasan.map((f) => f.html).join('') + pie;
}

// Y LA VISTA PREVIA DEL DOCUMENTO
// ================================
//
// Muestra el texto de la plantilla con cada variable YA cambiada por su dato, que es lo que uno
// necesita ver antes de guardar. Y no es la lista de variables del lado: es el documento.
//
// Y se arma con el texto plano, con las etiquetas convertidas en saltos de línea. Un editor
// enriquecido dentro de una caja chica se ve como código, y lo que se revisa ahí es el texto y los
// huecos, que es lo que importa.
function pintarVistaPreviaPlantilla() {
  const caja = document.getElementById('plantillaPreview');
  if (!caja) return;
  const ed = document.getElementById('plantillaEditor');
  const bruto = ed ? String(ed.value || ed.innerHTML || '') : '';

  if (!bruto.trim()) {
    caja.innerHTML = '<small style="color:var(--muted)">La vista previa aparece cuando hay texto.</small>';
    return;
  }

  let salida = bruto
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Y CADA VARIABLE CON SU DATO. Las que NO tienen dato quedan marcadas, porque un hueco en un
  // documento es peor que no tener documento: alguien lo archiva igual y el problema aparece meses
  // después, cuando ya no se sabe de quién era.
  salida = salida.replace(/\[([A-Z0-9_]+)\]/g, function (todo, clave) {
    const f = filasPlantillaListas.find((x) => x.clave === clave);
    if (!f) {
      return '<mark class="prevDesconocida" title="Esta variable no está en la lista">' + escHtml(todo) + '</mark>';
    }
    const vacio = !String(f.valor || '').trim();
    return '<mark class="prevVar' + (vacio ? ' prevVacia' : '') + '" title="' + escHtml(todo) + '">'
      + escHtml(textoSiVacio(f.valor)) + '</mark>';
  });

  caja.innerHTML = '<pre class="prevTexto">' + salida + '</pre>';
}

// -------------------------------------------------------------------
// INSERTAR LA VARIABLE EN LA PLANTILLA
// -------------------------------------------------------------------
// Y con "execCommand" y no con el contenido del editor: reemplazar todo el contenido por el
// texto con la variable pegada BORRARÍA lo que el usuario ya escribió.
function insertarVariableEnPlantilla(clave) {
  const ed = document.getElementById('plantillaEditor');
  if (!ed) return;
  const texto = '[' + clave + ']';
  // Y en un "try": si el navegador ya no lo soporta, se avisa en vez de fallar en silencio.
  try {
    ed.focus();
    if (!document.execCommand('insertText', false, texto)) throw new Error('no');
  } catch (e) {
    alert('Este navegador no deja escribir en el cursor.\n\nPegá la variable a mano: ' + texto);
  }
  try { marcarContenidoCambiado(); } catch (e) {}
}

// -------------------------------------------------------------------
// Y QUE SE LLAME AL CAMBIAR DE TRABAJADOR
// -------------------------------------------------------------------
async function cargarVariablesConDatos() {
  const selW = document.getElementById('descargaTrabajador');
  const selE = document.getElementById('camposPropiosEmpresa');
  if (!selW) return;

  const code = selW.value;
  const empresaId = selE && selE.value ? parseInt(selE.value, 10) : null;

  if (!code) {
    pintarVariablesConDatos(null, empresaDeLosDatos());
    return;
  }

  const { data, error } = await window.supabaseClient.rpc('datos_para_plantilla', {
    p_trabajador_code: code,
    p_empresa_id: empresaId,
  });
  if (error) {
    const caja = document.getElementById('plantillaVariables');
    if (caja) caja.innerHTML = '<small style="color:var(--danger)">' + escHtml(error.message) + '</small>';
    return;
  }
  pintarVistaPreviaPlantilla();
  pintarVariablesConDatos(data || {}, empresaDeLosDatos());
}

// Y la empresa que hay que mirar es la del selector de campos propios, que es la misma que
// está elegida arriba. Y si ese selector no está, la primera de la lista.
function empresaDeLosDatos() {
  const sel = document.getElementById('camposPropiosEmpresa');
  const id = sel && sel.value ? sel.value : null;
  const lista = (typeof empresas !== 'undefined' && empresas) ? empresas : [];
  return lista.find(x => String(x.id) === String(id)) || lista[0] || null;
}

// -------------------------------------------------------------------
// Y EL CLIC
// -------------------------------------------------------------------
// Y con delegación en el contenedor, no un escuchador por fila: las filas se repintan cada
// vez que se cambia de trabajador, y un escuchador por fila apunta a filas que ya no existen.
document.addEventListener('click', (e) => {
  const fila = e.target && e.target.closest ? e.target.closest('.varConDato') : null;
  if (!fila) return;
  insertarVariableEnPlantilla(fila.getAttribute('data-var') || '');
});

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
  // Y los campos propios de la empresa, al entrar a la vista. Antes solo se cargaban al
  // apretar EDITAR, así que el panel se veía escrito y vacío. Ver [campos-04].
  //
  // Y sin "await" a propósito: esta función la llama el que cambia de vista y no espera
  // promises. Con el "catch" porque una promesa que se rechaza sola no la ve nadie.
  cargarCamposPropios().catch(function(){});
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
      (p.requiere_aprobacion ? ' · requiere aprobación' : '')+
      (p.modo_firma && p.modo_firma!=='manuscrita' ? ' · firma '+p.modo_firma : '')+
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
  // Y el desplegable de fuentes se arma acá, y no en el HTML, para que la lista de las seis
  // tenga un solo lugar. Ver [fuentes-01].
  llenarFuentesPlantilla();
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
    const cajaAprueba=document.getElementById('plantillaAprueba');
  // Y con "!!(p&&...)": una plantilla vieja sin la columna, o una nueva que no tiene la fila
  // todavía, da falso. Que es lo correcto: no estar marcado no es "requiere aprobación".
  if(cajaAprueba)cajaAprueba.checked=!!(p&&p.requiere_aprobacion);
  // Y el modo de firma con el mismo cuidado: si la plantilla es vieja y no tiene la columna,
  // queda en el valor por defecto, que es el camino que ya anda.
  (function(){
    const sel=document.getElementById('plantillaModoFirma');
    if(!sel)return;
    const v=p?p.modo_firma:'manuscrita';
    sel.value=['manuscrita','digital','mixto'].indexOf(v)>=0?v:'manuscrita';
  })();

document.getElementById('plantillaFirmas').value=
    p?(p.firmas||'trabajador_supervisor'):'trabajador_supervisor';
  llenarDestinoPlantilla(p);
  document.getElementById('plantillaEditor').innerHTML=p?(p.contenido||''):
    '<h2>Inducción</h2><p>Bienvenido a la obra. Tu supervisor es {{nombre}}.</p>';
  actualizarAyudaPlantilla();
  dlg.showModal();
  if(!p)document.getElementById('plantillaNombre').focus();

  // Y SE PINTA LA VISTA PREVIA AL ABRIR, QUE ANTES NO PASABA
  //
  // "pintarVistaPreviaPlantilla" existia desde que se armo el panel de dos columnas, y no la
  // llamaba nadie. La caja salia vacia siempre, y un panel vacio se lee como que la pantalla esta
  // rota. Es el mismo sintoma que una consulta que devuelve cero filas y no dice nada.
  pintarVistaPreviaPlantilla();
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
  // Y "¿requiere aprobación?" es un booleano de verdad, no un texto: se manda el checkbox
  // leido, y el "!!" porque un checkbox unchecked devuelve false y checked devuelve true,
  // que es justo lo que se quiere guardar.
  requiere_aprobacion:!!(document.getElementById('plantillaAprueba')||{}).checked,
  // Y el modo de firma, con la lista de los tres valores. Si el select no está, o tiene
  // algo raro, se manda el valor por defecto: es preferible que se guarde "manuscrita" a que
  // vaya un undefined y la base lo rechace con un error de CHECK.
  modo_firma:(function(){
    const sel=document.getElementById('plantillaModoFirma');
    const v=sel?sel.value:'';
    return ['manuscrita','digital','mixto'].indexOf(v)>=0?v:'manuscrita';
  })(),
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
// EL ESTADO DEL TOKEN, DICHO ANTES DE PREGUNTAR
// ------------------------------------------------------------------
// La pregunta "no encuentro el token del reloj" viene de abrir el formulario
// y ver un campo vacío. Un campo vacío no dice si hay que pegar algo, si ya
// está instalado, o si hay que rotarlo. Con las tres respuestas posibles
// escritas, la persona sabe qué hacer sin preguntar.
// El campo de pegar el token, y el boton de olvidarlo.
//


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


// ------------------------------------------------------------------
// LA FICHA PERSONAL, Y EL FORMATO


// ============================================================
// LOS MARCAJES



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



// ============================================================
// EL KIOSCO DEL RELOJ

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


// -------------------------------------------------------------------
// EL CARGO SE ESCRIBE UNA SOLA VEZ
// -------------------------------------------------------------------
// Al elegir el cargo, "Cargo para las planillas" se completa con el nombre de ese cargo. Es
// el texto que sale impreso en las planillas y en la credencial, y antes había que
// escribirlo a mano, igual que ya estaba elegido en el desplegable.
//
// Tres reglas, y las tres importan:
//
//   1. SOLO SI EL CAMPO ESTÁ VACÍO. Si alguien ya escribió algo —"Maestro de obra, sector
//      norte"— no se pisa. Ese texto a mano es información que el desplegable no tiene.
//   2. AL VACIAR EL DESPLEGABLE TAMPOCO SE BORRA. "Sin asignar" no significa "el texto
//      está mal": el cargo puede no estar en el catálogo y el texto igual ser el correcto.
//   3. NO ESCRIBE SI NO HAY CARGO ELEGIDO. Por lo mismo del punto 2.
function completarCargoEnElTexto(){
  const sc=document.getElementById('w-cargo');
  const st=document.getElementById('w-spec');
  if(!sc||!st)return;
  if(!sc.value)return;
  if(st.value.trim())return;
  const nombre=sc.options[sc.selectedIndex] ? (sc.options[sc.selectedIndex].textContent||'').trim() : '';
  if(!nombre)return;
  // Y solo si el texto que muestra el desplegable es el nombre del cargo y no algo como
  // "Gastos Generales / Administrativo": el texto de las planillas es el del cargo.
  st.value=nombre.split(' / ').pop().trim();
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
    :'<small>Se genera solo al crear el reloj, y se muestra una vez sola: si se llenara más, se perdería la elección.</small>';
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


