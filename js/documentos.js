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
   - IMPORTAR WORD CONSERVANDO EL FORMATO, Y DESCARGAR LA PLANTILLA
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
