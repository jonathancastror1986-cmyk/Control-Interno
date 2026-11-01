// Personas por día y grupo: grilla mensual con la misma apariencia que la tarja, pero con una
// fila por grupo (Internos, cada empresa de externos, totales) en vez de una por trabajador.
// Una persona cuenta en un día si cuentaComoDiaReal() lo dice: es la MISMA función que usa
// "Días reales trabajados (X)" del resumen mensual (administracion.js). Mismos filtros
// (trabajadoresDelReportePorEmpresa y trabajadorActivoEnFechaDelReporte). No hace consultas:
// lee lo que la tarja ya tiene en memoria.
const PPD_SIN_EMPRESA='Sin empresa';
const PPD_ANCHO_MOVIL=860;
let ppdDatos=null;
let ppdPanel=null;

// ÚNICO criterio de agrupación de los externos. Cuando pase a "contratista", se cambia solo aquí.
function ppdGrupoDeExterno(w){
  if(!w||!w.empresa_id)return PPD_SIN_EMPRESA;
  const e=empresaData(w);
  return (e&&e.nombre)||PPD_SIN_EMPRESA;
}
function ppdCalcular(y,m,esperado){
  const nd=daysInMonth(y,m);
  const prefijo=y+'-'+String(m).padStart(2,'0');
  const workedWeeks=buildWorkedWeeks();
  const registros=new Map(attendance.map(a=>[`${a.code}|${a.date}`,a]));
  const vacias=()=>Array.from({length:nd},()=>[]);
  const interno={nombre:'Internos',clase:'',dotacion:0,celdas:vacias()};
  const externos=new Map();
  trabajadoresDelReportePorEmpresa().forEach(w=>{
    const esExterno=w.tipo_trabajador==='externo';
    let fila=null;
    for(let d=1;d<=nd;d++){
      const iso=prefijo+'-'+String(d).padStart(2,'0');
      if(!trabajadorActivoEnFechaDelReporte(w,iso))continue;
      if(!fila){
        if(esExterno){
          const g=ppdGrupoDeExterno(w);
          if(!externos.has(g))externos.set(g,{nombre:g,clase:'',dotacion:0,celdas:vacias()});
          fila=externos.get(g);
        }else fila=interno;
        fila.dotacion++;
      }
      const r=estadoDiaParaResumen(w,iso,y,m,d,registros,workedWeeks);
      if(cuentaComoDiaReal(r.estado,r.feriado))fila.celdas[d - 1].push(w.name);
    }
  });
  const lista=[...externos.values()].sort((a,b)=>{
    if(a.nombre===PPD_SIN_EMPRESA)return 1;
    if(b.nombre===PPD_SIN_EMPRESA)return -1;
    return a.nombre.localeCompare(b.nombre,'es');
  });
  const sumar=(nombre,clase,filas)=>({nombre,clase,
    dotacion:filas.reduce((s,f)=>s+f.dotacion,0),
    celdas:Array.from({length:nd},(x,i)=>filas.reduce((acc,f)=>acc.concat(f.celdas[i]),[]))});
  const filas=[interno,...lista];
  if(lista.length>=2)filas.push(sumar('Total externos','ppd-sub',lista));
  const general=sumar('Total general','ppd-total',[interno,...lista]);
  filas.push(general);
  const total=general.celdas.reduce((s,c)=>s+c.length,0);
  const dias=[];
  for(let d=1;d<=nd;d++)dias.push({d,letra:diaSemanaLetra[new Date(y,m-1,d).getDay()],feriado:isFeriado(y,m,d)});
  return {y,m,nd,dias,filas,total,esperado,coincide:esperado===undefined||esperado===total};
}
function ppdTituloMes(datos){
  return 'Personas por día — '+String(datos.m).padStart(2,'0')+'/'+datos.y;
}
function ppdMatriz(datos){
  const cab=['Grupo','Dotación',...datos.dias.map(x=>x.d+' '+x.letra),'Total días-persona'];
  return [cab,...datos.filas.map(f=>[f.nombre,f.dotacion,...f.celdas.map(c=>c.length||''),f.celdas.reduce((s,c)=>s+c.length,0)])];
}
// La MISMA función dibuja la grilla en la página y en el panel flotante.
function ppdGrillaHtml(datos){
  let h=datos.coincide
    ?'<p class="ppd-control">Control: el total general ('+datos.total+') coincide con los días reales trabajados (X) del resumen de abajo.</p>'
    :'<p class="ppd-aviso" role="alert">Control: el total general ('+datos.total+') NO coincide con los días reales trabajados (X) del resumen ('+datos.esperado+'). No uses estas cifras hasta revisar.</p>';
  h+='<div class="overflow"><table class="ppd-grilla"><colgroup><col style="width:150px"><col style="width:64px">'
    +datos.dias.map(()=>'<col style="width:28px">').join('')+'<col style="width:92px"></colgroup>'
    +'<tr><th>Grupo</th><th>Dotación</th>'+datos.dias.map(x=>'<th class="tarjaDia">'+x.d+'</th>').join('')+'<th>Total días-persona</th></tr>'
    +'<tr><td></td><td><i>Día</i></td>'
    +datos.dias.map(x=>'<td class="tarjaDia '+(x.feriado?'day-feriado day-label-holiday':'day-lab')+'"><small>'+x.letra+'</small></td>').join('')+'<td></td></tr>';
  datos.filas.forEach((f,i)=>{
    h+='<tr'+(f.clase?' class="'+f.clase+'"':'')+'><td>'+escHtml(f.nombre)+'</td><td>'+f.dotacion+'</td>';
    f.celdas.forEach((c,j)=>{
      const cl='tarjaDia '+(datos.dias[j].feriado?'day-feriado':'day-lab');
      h+=c.length
        ?'<td class="'+cl+'"><button type="button" class="ppd-n" data-f="'+i+'" data-d="'+(j+1)+'" aria-label="'+escHtml(f.nombre)+', día '+(j+1)+': '+c.length+' persona(s). Ver nombres">'+c.length+'</button></td>'
        :'<td class="'+cl+' ppd-vacio"></td>';
    });
    h+='<td>'+f.celdas.reduce((s,c)=>s+c.length,0)+'</td></tr>';
  });
  return h+'</table></div><div class="ppd-lista" role="status" aria-live="polite" hidden></div>';
}
function ppdMostrarNombres(boton){
  const host=boton.closest('.ppd-host');
  const caja=host&&host.querySelector('.ppd-lista');
  if(!caja||!ppdDatos)return;
  const f=ppdDatos.filas[Number(boton.dataset.f)];
  const d=Number(boton.dataset.d);
  const nombres=f?f.celdas[d - 1]:[];
  caja.hidden=false;
  caja.innerHTML='<b>'+escHtml(f?f.nombre:'')+' · día '+d+' ('+nombres.length+'):</b> '+nombres.map(escHtml).join(', ');
}
function ppdEncabezadoHtml(){
  return '<div class="ppd-titulo"><h3>'+escHtml(ppdTituloMes(ppdDatos))+'</h3><span class="ppd-acciones">'
    +'<button type="button" class="btn secondary btn-compacto" data-ppd="flotante">Abrir flotante</button>'
    +'<button type="button" class="btn secondary btn-compacto" data-ppd="exportar">Exportar</button></span></div>';
}
function renderGrillaGrupos(y,m,esperado){
  const box=document.getElementById('grillaGruposMensual');
  if(!box)return;
  try{
    ppdDatos=ppdCalcular(y,m,esperado);
    box.innerHTML='<div class="ppd-host">'+ppdEncabezadoHtml()+ppdGrillaHtml(ppdDatos)+'</div>';
    ppdRefrescarFlotante();
  }catch(e){
    ppdDatos=null;
    box.innerHTML='<p class="ppd-aviso" role="alert">No se pudo calcular la grilla por grupo: '+escHtml(e.message||String(e))+'</p>';
  }
}
function ppdExportar(){
  if(!ppdDatos)return;
  const csv=ppdMatriz(ppdDatos).map(f=>f.map(c=>{
    const s=String(c);
    return /[";\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  }).join(';')).join('\r\n');
  try{
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;
    a.download='personas_por_dia_'+ppdDatos.y+'-'+String(ppdDatos.m).padStart(2,'0')+'.csv';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){
    alert('No se pudo exportar: '+(e.message||e));
  }
}
function ppdCrearPanel(){
  const p=document.createElement('div');
  p.id='ppdPanel';
  p.className='ppd-panel';
  p.setAttribute('role','dialog');
  p.setAttribute('aria-modal','false');
  p.setAttribute('aria-label','Personas por día');
  p.hidden=true;
  p.innerHTML='<div class="ppd-barra" id="ppdBarra"><strong id="ppdTituloPanel">Personas por día</strong>'
    +'<span class="ppd-acciones"><button type="button" class="btn secondary btn-compacto" data-ppd="exportar">Exportar</button>'
    +'<button type="button" class="btn secondary btn-compacto" data-ppd="cerrar" aria-label="Cerrar" title="Cerrar (Esc)">✕</button></span></div>'
    +'<div class="ppd-cuerpo" id="ppdCuerpo"></div>';
  document.body.appendChild(p);
  const barra=p.querySelector('#ppdBarra');
  barra.addEventListener('pointerdown',e=>{
    if(window.innerWidth<PPD_ANCHO_MOVIL||e.target.closest('button'))return;
    const r=p.getBoundingClientRect();
    const dx=e.clientX-r.left,dy=e.clientY-r.top;
    barra.setPointerCapture(e.pointerId);
    const mover=ev=>{
      p.style.right='auto';
      p.style.left=Math.min(Math.max(0,ev.clientX-dx),Math.max(0,window.innerWidth-p.offsetWidth))+'px';
      p.style.top=Math.min(Math.max(0,ev.clientY-dy),Math.max(0,window.innerHeight-barra.offsetHeight))+'px';
    };
    const soltar=ev=>{
      barra.removeEventListener('pointermove',mover);
      barra.removeEventListener('pointerup',soltar);
      barra.removeEventListener('pointercancel',soltar);
      try{barra.releasePointerCapture(ev.pointerId);}catch(err){}
    };
    barra.addEventListener('pointermove',mover);
    barra.addEventListener('pointerup',soltar);
    barra.addEventListener('pointercancel',soltar);
  });
  return p;
}
function ppdRefrescarFlotante(){
  if(!ppdPanel||ppdPanel.hidden)return;
  const cuerpo=document.getElementById('ppdCuerpo');
  if(!cuerpo)return;
  if(!ppdDatos){cuerpo.innerHTML='<p class="ppd-msg">Genera primero el resumen mensual.</p>';return;}
  document.getElementById('ppdTituloPanel').textContent=ppdTituloMes(ppdDatos);
  cuerpo.innerHTML='<div class="ppd-host">'+ppdGrillaHtml(ppdDatos)+'</div>';
}
function abrirPersonasPorDia(){
  if(!ppdPanel)ppdPanel=ppdCrearPanel();
  ppdPanel.hidden=false;
  ppdRefrescarFlotante();
}
function ppdCerrar(){
  if(ppdPanel)ppdPanel.hidden=true;
}
document.addEventListener('click',e=>{
  const n=e.target.closest('button.ppd-n');
  if(n){ppdMostrarNombres(n);return;}
  const b=e.target.closest('button[data-ppd]');
  if(!b)return;
  if(b.dataset.ppd==='flotante')abrirPersonasPorDia();
  else if(b.dataset.ppd==='exportar')ppdExportar();
  else if(b.dataset.ppd==='cerrar')ppdCerrar();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&ppdPanel&&!ppdPanel.hidden)ppdCerrar();
});
