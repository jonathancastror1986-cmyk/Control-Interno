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
