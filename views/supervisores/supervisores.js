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
  // Y LA DECISIÓN NO SE TOMA AQUÍ
  //
  // Se toma en "js/conciliacion.js", que es donde vive "situacionDe()". Aquí sólo
  // se junta lo que hay de cada persona y se le pregunta.
  //
  // Antes se decidía en estas líneas, y se decidía MAL, y se puede ver por qué
  // mirando lo que se comparaba: "presenteEnPlanilla" era "el estado es X". Con
  // sólo mirar X:
  //
  //   - la planilla decía "F" y el reloj tenía marcaje -> salía "falta marcar en la
  //     planilla", con el botón de MARCAR ENTRADA. O sea,.invoke a pisar una falta
  //     que alguien había puesto, cuando lo que había era una contradicción entre
  //     dos fuentes que no se resuelve con un clic.
  //
  //   - la planilla decía "L", "P", "V", "A", "PP" o "LL" y no había marcaje ->
  //     salía "sin registro en ninguno de los dos". Seis de los ocho estados que
  //     acepta la base, y ninguno es una discrepancia: es lo que tiene que pasar.
  //
  // Y ahora la tolerancia sale de la lista compartida en vez de estar escrita acá,
  // para que las dos pantallas usen la misma. Diez minutos.
  const filas=[];
  equipo.forEach(w=>{
    const ent=marcajeDe(w.code,'entrada');
    const sal=marcajeDe(w.code,'salida');
    const reloj=ent||sal;
    const planilla=planillaPorCode.get(w.code)||null;
    // Y LA DIFERENCIA DE MINUTOS, TAMBIÉN DE AHÍ
    //
    // Y es "null" cuando no se puede comparar, que es distinto de cero: cero
    // significa que las dos horas dicen lo mismo.
    const difMin=(typeof diferenciaDeMinutos==='function')?diferenciaDeMinutos(reloj,planilla):null;
    // Y EL NOMBRE DE LA SITUACIÓN
    const situacion=(typeof situacionDe==='function')
      ? situacionDe(planilla,reloj)
      // Y EL PLAN B, PARA CUANDO EL ARCHIVO NUEVO NO ESTÉ CARGADO
      //
      // Antes se decidía acá, y por eso el plan b es la decisión mala. Si el
      // archivo no cargó, el cálculo queda como estaba y no se rompe la pantalla.
      : (reloj?'falta_marcar':'ninguno');
    filas.push({w,ent,sal,reloj,planilla,presenteEnPlanilla:!!(planilla&&planilla.estado==='X'),
                marcajeReloj:!!reloj,situacion:situacion,difMin:difMin});
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
  // Y LAS ALERTAS VIENEN DE LA LISTA ÚNICA
  //
  // Antes era "todo lo que no es 'al_day' ni 'ninguno'", o sea una lista de
  // excepciones: si mañana se agrega una situación, queda como alerta por no estar
  // en la lista de las que no son. Y "F con marcaje" era una alerta con el botón
  // de marcar, que es lo que hacía peligroso al bug.
  const alertas=(typeof estaEnAlerta==='function')
    ? filas.filter(f=>estaEnAlerta(f.situacion))
    : filas.filter(f=>f.situacion!=='al_day'&&f.situacion!=='ninguno');
  // Y LOS BOTONES, SEGÚN QUÉ SE PUEDE HACER EN CADA SITUACIÓN
  //
  // Y NO TODAS TIENEN "MARCAR". La contradicción —la planilla dice F y el reloj
  // dice que entró— NO ofrece marcar: las dos fuentes pueden estar bien, el reloj
  // puede estar marcando de más, y la respuesta la tiene la persona. Con el botón
  // ahí, un clic y la falta quedaba pisada sin que nadie hubiera resuelto nada.
  const puedeMarcar=(function(k){
    if(typeof SITUACIONES!=='undefined'&&SITUACIONES[k])return SITUACIONES[k].acciones.indexOf('marcar')>=0;
    return true;
  });
  const puedeAvisar=(function(k){
    if(typeof SITUACIONES!=='undefined'&&SITUACIONES[k])return SITUACIONES[k].acciones.indexOf('avisar')>=0;
    return true;
  });
  // Y LA ETIQUETA VIENE DE LA TABLA COMPARTIDA
  //
  // Y el texto largo se muestra abajo de la fila, porque "La planilla dice F y el
  // reloj tiene marcaje" no entra en una etiqueta de tres palabras.
  const etiqueta=(typeof SITUACIONES!=='undefined')?SITUACIONES:{
    falta_en_planilla:{corto:'Falta marcar en la planilla',color:'var(--danger)',texto:'El reloj tiene marcaje y la planilla no lo tiene'},
    contradictorio:{corto:'F con marcaje',color:'var(--danger)',texto:'La planilla dice F y el reloj tiene marcaje'},
    sin_marcaje:{corto:'Presente sin reloj',color:'var(--secondary-text)',texto:'Está en la planilla como presente y el reloj no registró nada'},
    diferencia_hora:{corto:'La hora no coincide',color:'var(--warn)',texto:'Está en los dos, a horas distintas'},
    coincide:{corto:'Coincide',color:'var(--accent)',texto:'Los dos dicen presente y la hora es razonable'},
    justificado:{corto:'Justificado',color:'var(--accent)',texto:'Tiene permiso o licencia y no hay marcaje'},
    ausente_coherente:{corto:'Ausente',color:'var(--muted)',texto:'La planilla dice F y el reloj tampoco registró nada'},
    ninguno:{corto:'Sin registro',color:'var(--muted)',texto:'No hay registro en ninguno de los dos'}
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
    const v=etiqueta[f.situacion]||etiqueta.ninguno;
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
    // Y LOS BOTONES, SOLO LOS QUE CORRESPONDEN A ESTA SITUACIÓN
    //
    // Antes los dos botones estaban en todas las filas. Con eso, una fila de "F con
    // marcaje" —la planilla dice que faltó y el reloj dice que entró— tenía el
    // botón de MARCAR ENTRADA, y un clic pisaba la falta.
    const botones=
      (puedeMarcar(f.situacion)
        ? '<button class="btnIcono" type="button" data-dato="Marcar entrada"'
          +' title="Marcar entrada" aria-label="Marcar entrada a '+nom+'"'
          +' onclick="conciliarMarcar(\''+cod+'\',\'entrada\')">@ICONO_ENTRADA@</button>'
        : '')
      + (puedeAvisar(f.situacion)
        ? '<button class="btnIcono" type="button" data-dato="Marcar y avisar"'
          +' title="Marcar y avisar" aria-label="Marcar y avisar a '+nom+'"'
          +' onclick="marcarYAvisar(\''+cod+'\',\'entrada\')">@ICONO_AVISAR@</button>'
        : '');
    // Y CUANDO NO QUEDA NINGÚN BOTÓN, SE DICE QUÉ HACER EN VEZ DE DEJAR LA
    // CELDA VACÍA
    //
    // Una celda de acciones vacía parece un error de la pantalla. Y aquí la
    // respuesta existe: hay que hablar con la persona.
    const sinNada=botones?'':'<small style="opacity:.8">'+(v.queSePuedeHacer?'Ver con la persona':'Nada')+'</small>';
    return `<tr>
      <td class="conCelda conCeldaNombre conCeldaSituacion" style="border-left-color:${v.color}">
        <b>${cod}</b> ${nom}
        <small>${esp}</small>
      </td>
      <td class="conCelda conCeldaMarca">${reloj}<small>${relojPie}</small></td>
      <td class="conCelda conCeldaMarca">${planilla}<small>${planillaPie}</small></td>
      <td class="conCelda conCeldaEstado">
        <span class="conPill" style="border-color:${v.color};color:${v.color}">${escHtml(v.corto)}</span>
        <small>${escHtml(v.texto||'')}</small>
        <small>${difMin}</small>
      </td>
      <td class="conCelda conCeldaAcciones">${botones||sinNada}</td>
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

  // Y EL RESUMEN, EN EL ORDEN DE URGENCIA Y NO EN EL ORDEN DEL ARCHIVO
  const resumen='<div class="row" style="margin-bottom:10px">'
    +((typeof ORDEN_SITUACIONES!=='undefined')?ORDEN_SITUACIONES:Object.keys(etiqueta)).map((k)=>{
      const v=etiqueta[k];
      if(!v)return '';
      const n=cuenta(k);
      return `<span class="conPill" style="border-color:${v.color};color:${v.color}">${escHtml(v.corto)}: <b>${n}</b></span>`;
    }).join('')+'</div>';

  // La explicación de la tolerancia va DEBAJO de la tabla, no arriba. Arriba
  // empujaba las filas hacia abajo y había que bajar para leerla.
  // Y LA TOLERANCIA SALE DE LA LISTA COMPARTIDA, Y NO DE UN NÚMERO ESCRITO AQUÍ
  //
  // Antes decía "hasta 10 minutos" en el texto, y el 10 estaba en otra línea, en
  // "conciliarDia". Si cambiaba uno y no el otro, el pie de la pantalla explicaba
  // una regla que el cálculo no usaba. Ahora los dos salen del mismo número.
  const tolMin=(typeof TOLERANCIA_MIN!=='undefined')?TOLERANCIA_MIN:10;
  const pie='<p><small style="color:var(--muted)">Se considera coincidente cuando la diferencia de hora es de hasta '
    +tolMin+' minutos, que es lo habitual entre lo que registró el reloj y lo que anotó una persona.'
    +' Si la planilla no tiene hora, no se pueden comparar y no se cuenta como diferencia.</small></p>';

  box.innerHTML=resumen
    +(alertas.length?tabla:'<small>Ninguna discrepancia: el reloj y la planilla dicen lo mismo en todo el equipo.</small>')
    +pie;
}
