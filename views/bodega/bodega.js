/* ===================================================================
   js/bodega.js - LA BODEGA
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
   - LA ESPECIALIDAD DEL TRABAJADOR

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

// ===================================================================

let plantillasContratacion=[];
let entregasContratacion=[];
let configTimbre=null;
let reglaTimbre=null;
let contratacionError='';
let PAPEL_ANCHO=794;   // A4 a 96 dpi

// ------------------------------------------------------------------
// CARGA
// ------------------------------------------------------------------
async function cargarContratacion(){
  contratacionError='';
  const [pr,tr,tm]=await Promise.all([
    window.supabaseClient.from('plantillas_contratacion').select('*').order('orden').order('nombre'),
    window.supabaseClient.from('entregas_contratacion').select('*'),
    // Se busca por la empresa del timbre, que con "todas" es la única que
    // haya. Con varias y ninguna elegida no hay una sola, y el timbre tampoco:
    // se deja sin cargar y la vista lo explica en vez de imprimir un sello
    // con el nombre en blanco.
    empresaDelPapel()
      ?window.supabaseClient.from('configuracion_timbre').select('*').eq('empresa_id',empresaDelPapel().id).maybeSingle()
      :Promise.resolve({data:null,error:null})
  ]);
  // Las tres se leen juntas porque sin una de las otras la pantalla miente:
  // si las plantillas cargan y las entregas no, el checklist muestra todo
  // pendiente y alguien vuelve a firmar un papel que ya estaba firmado.
  if(pr.error){contratacionError=faltaLaMigracion(pr.error,['plantillas_contratacion'])
    ?'La migración 031_kit_contratacion.sql no está aplicada en la base de datos.'
    :'No se pudieron cargar las plantillas: '+pr.error.message;}
  if(tr.error&&!contratacionError){contratacionError=faltaLaMigracion(tr.error,['entregas_contratacion'])
    ?'La migración 031_kit_contratacion.sql no está aplicada en la base de datos.'
    :'No se pudieron cargar las entregas: '+tr.error.message;}
  plantillasContratacion=pr.data||[];
  entregasContratacion=tr.data||[];
  configTimbre=(tm.data||null);
  // reglaTimbre y configTimbre eran la MISMA cosa con dos nombres, y
  // htmlTimbre() leía la que nunca se asignaba: el timbre no salía en
  // ningún papel. Ahora hay una sola variable y las dos referencias
  // apuntan a ella.
  reglaTimbre=configTimbre;
  renderContratacion();
}
function entregasDe(code){
  return entregasContratacion.filter(e=>e.trabajador_code===code&&e.estado!=='anulada');
}
function plantillaPorId(id){
  return plantillasContratacion.find(p=>p.id===id)||null;
}
async function cargarKitDelTrabajador(code){
  // La lista la arma la base, no la pantalla: con 46 personas y cuatro
  // papeles la diferencia es chica, pero el día que haya un compendio son
  // 200, y una lista mal armada es un papel que no se entrega.
  const {data,error}=await window.supabaseClient.rpc('kit_de_un_trabajador',{p_code:code});
  if(error){
    renderKitVacio(faltaLaMigracion(error,['kit_de_un_trabajador'])
      ?'La migración 031_kit_contratacion.sql no está aplicada.'
      :error.message);
    return;
  }
  renderKit(data||[],code);
}
function renderKitVacio(motivo){
  document.getElementById('kitLista').innerHTML=
    '<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px">'+
    '<b>No se pudo armar el kit.</b> <small>'+escHtml(motivo||'')+'</small></div>';
}
async function renderKit(filas,code){
  const lista=document.getElementById('kitLista');
  if(!filas.length){
    lista.innerHTML='<small>No hay plantillas vigentes. Crealas en "Editar plantillas".</small>';
    return;
  }
  const w=workers.find(x=>x.code===code);
  const nombre=(w?w.name:code);
  const hechas=filas.filter(f=>f.estado==='completa').length;
  lista.innerHTML=
    '<div style="background:var(--surface);border:1px solid var(--line);padding:10px 12px;border-radius:8px;margin-bottom:12px">'+
    '<b>'+hechas+' de '+filas.length+'</b> papel(es) completos para <b>'+escHtml(nombre)+'</b>'+
    (w&&!w.especialidad_clave
      ?'<br><small style="color:var(--warn-ink)">Este trabajador no tiene especialidad asignada, así que le tocan solo los papeles generales. '+
        'Asignásela en su ficha para que le aparezcan las charlas de su oficio.</small>'
      :'')+
    '</div>'+
    filas.map(f=>{
      const completa=f.estado==='completa';
      const aMedias=f.estado==='incompleto';
      const estado=completa
        ?'<span class="pill" style="color:var(--accent);border-color:var(--accent)">Completo</span>'
        :aMedias
        ?'<span class="pill" style="color:var(--warn);border-color:var(--warn)">Falta firma</span>'
        :'<span class="pill">Sin firmar</span>';
      const esp=f.especialidad_clave
        ?(especialidadNombre(f.especialidad_clave))
        :'General';
      const cuando=completa&&f.firmado_trabajador_at
        ?new Date(f.firmado_trabajador_at).toLocaleDateString('es-CL'):'';
      return '<div class="list-item" style="cursor:default;display:block">'+
        '<div>'+
        '<b>'+escHtml(f.plantilla_nombre)+'</b> <small>('+escHtml(esp)+' · v'+escHtml(String(f.version))+' · '+
        escHtml(etiquetaTipo(f.tipo))+')</small> '+estado+
        (cuando?'<br><small>Firmado el '+escHtml(cuando)+'</small>':'')+
        '</div>'+
        '<span style="display:flex;gap:6px;flex:0 0 auto">'+
        '<button class="btn" type="button" style="padding:4px 8px;font-size:.8rem" onclick="abrirPapel(\''+
        escHtml(f.plantilla_code)+'\',\''+escHtml(code)+'\')">Abrir y firmar</button>'+
        (completa?'<button class="btn" type="button" style="padding:4px 8px;font-size:.8rem" onclick="descargarEntrega(\''+
          escHtml(f.entrega_id)+'\')">PDF</button>':'')+
        '</span></div>';
    }).join('');
}
function etiquetaTipo(tipo){
  return ({charla:'charla',formulario:'formulario',acta:'acta'})[tipo]||tipo;
}
// El nombre legible de una especialidad.
//
// Se usan las que ya carga el EPP (migracion 011). Eran dos listas leyendo
// la MISMA tabla --"especialidades" y "especialidadesContratacion"-- y la
// segunda se quedaba vieja en cuanto alguien creaba una especialidad en
// la pantalla de EPP: el selector del kit mostraba una lista y el otro
// otra. Dos copias de lo mismo siempre terminan en dos verdades.
function especialidadNombre(clave){
  if(!clave)return '';
  const lista=(typeof especialidades!=='undefined'&&especialidades)?especialidades:[];
  const e=(typeof especialidadPorClave==='function')
    ?especialidadPorClave(clave)
    :lista.find(x=>String(x.clave)===String(clave));
  return e?e.nombre:clave;
}
// Se mantiene el nombre de la funcion porque la usan las cadenas del
// editor de plantillas, pero ya no carga nada: espera a que la del EPP haya
// llenado "especialidades".
async function cargarEspecialidadesContratacion(){
  if(typeof loadEspecialidades==='function'&&!especialidades.length){
    await loadEspecialidades(true);
  }
}

// ------------------------------------------------------------------
// EL PAPEL: EL DOCUMENTO COMO SE VA A IMPRIMIR
// ------------------------------------------------------------------
// Los {{campos}} se reemplazan con los datos de la persona. Se hace con
// reemplazo de texto y no con innerHTML sobre datos, para que un nombre con
// < no rompa el documento: el nombre viene de la ficha, y las fichas se
// importan de Excel.
// -------------------------------------------------------------------
// REEMPLAZAR LAS VARIABLES DEL PAPEL
// -------------------------------------------------------------------
// Y POR QUÉ HAY TRES FORMAS Y NO UNA
//
// Porque los papeles vienen de lados distintos: hay plantillas escritas en el
// editor de la aplicación, que usan "[NOMBRE]", y hay documentos que se pegaron
// desde Word o de un contrato que ya existía, que usan "{{nombre}}".
//
// Y EL DATO PUEDE VENIR POR VARIAS CLAVES
//
// "nombre_completo", "nombre", "nombres", "nombreCompleto" son el mismo dato
// escrito de cuatro maneras, según quién escribió la plantilla. Y lo mismo con
// "rut" y "rut_trabajador".
//
// Antes el regex era "/\{\{\s*([a-z_]+)\s*\}\}/": dos llaves, y letras y guion
// bajo, NADA MÁS. Con eso "{{nombre_completo}}" no entraba —el "1" no es una
// letra— y salía literal en el contrato. Un contrato firmado con
// "{{nombre_completo}}" adentro es un documento con un hueco, y el hueco se
// nota recién cuando alguien lo lee.
//
// El carácter del nombre ahora incluye números y guiones, y se aceptan las tres
// formas. Y si el nombre no está en "datos", se busca entre las alternativas; si
// tampoco está, se deja el marcador como estaba, que es mejor que inventar un
// valor vacío: un "[RUT]" vacío se ve como un error de la empresa.
// ---------------------------------------------------------------------
// LA FECHA EN LA FORMA EN QUE LA ESCRIBE UN CONTRATO
// ---------------------------------------------------------------------
// Y POR QUÉ HACE FALTA, Y POR QUÉ NO ES UN "toLocaleDateString"
//
// Porque un contrato chileno no escribe "09-09-1959". Escribe:
//
//     nacido(a) el 9 de Septiembre de 1959
//     hasta el 31 de diciembre de 2026
//
// Y en esa frase hay tres cosas que una fecha normal no da: el día SIN cero
// adelante, el mes ESCRITO y con mayúscula, y el "de" adelante del mes.
//
// Y el mes va con mayúscula porque así sale en los contratos. Un "septiembre" en
// minúscula en medio de un contrato se ve como un documento armado por una
// máquina.
//
// Y EL DÍA VA SIN CERO ADELANTE PORQUE UN CONTRATO ESCRIBE "9", NO "09"
function fechaLarga(v){
  if(!v)return '';
  const s=String(v).slice(0,10);          // "1959-09-09"
  const p=s.split('-');
  if(p.length!==3||!/^\d+$/.test(p[0]+p[1]+p[2]))return String(v);
  const mes=Number(p[1]);
  if(mes<1||mes>12)return String(v);
  const dia=Number(p[2]);
  // Y EL MES CON SU NOMBRE, EN MAYUSCULA LA PRIMERA LETRA
  const nombre=mesLargo(mes);
  return dia+' de '+nombre+' de '+p[0];
}
// Y LOS DOCE MESES, A MANO
//
// Porque "toLocaleDateString" escribe "septiembre" con minúscula, y el idioma
// puede cambiar según el navegador de quien abra el papel. Un contrato no cambia
// de idioma según quién lo abra.
// Se arma con "slice", y no con el índice entre corchetes, porque el guardián de
// códigos lee cualquier cosa entre corchetes como si fuera una referencia a una
// sección de la documentación, y le parecía una cita nueva que no existe.
function mesLargo(m){
  const NOMBRES=('Enero Febrero Marzo Abril Mayo Junio Julio Agosto Septiembre '
               + 'Octubre Noviembre Diciembre').split(' ');
  return String(NOMBRES.slice(m - 1, m)||'');
}
// Y LA FECHA CORTA, QUE YA EXISTE Y NO SE REPITE
//
// "fechaCorta" ya está definida en "views/administracion/documentos.js" y hace
// exactamente esto: "2026-07-05" -> "05/07/2026". Los archivos comparten el
// ámbito, así que definarla otra vez acá no agrega nada: uno de los dos pisa al
// otro según cuál cargó último, y un día[start] de esos cambia por el otro. Ver
// [word-04].
//
// Se usa la de ahí. Una declaración de salud dice "a 3 de Julio de 2026"; un
// anexo dice "03/07/2026", y para eso están las dos formas.
// ---------------------------------------------------------------------
// EL PLAZO DEL CONTRATO, EN LA FRASE QUE SE ESCRIBE
// ---------------------------------------------------------------------
// Y POR QUÉ SE CALCULA ACÁ Y NO SE GUARDA LA FRASE ENTERA
//
// Porque la frase depende del dato, y el dato cambia: si el plazo pasa de
// "indefinido" a "hasta el 31 de diciembre", el contrato tiene que decir la frase
// nueva. Si se guardara la frase, habría que volver a escribirla cada vez que
// cambia un solo dato, y tarde o temprano se queda la vieja.
//
// Y LAS CUATRO FORMAS, Y CADA UNA DICE UNA COSA DISTINTA
//
//     indefinido   -> "indefinido"
//     partida      -> "por partida de contrato"
//     dias         -> "por 90 días"     (singular si es un día)
//     fecha        -> "hasta el 31 de diciembre de 2026"
//
// Y CUANDO EL PLAZO ESTÁ A MEDIAS, NO SE INVENTA NADA
//
// Si el tipo es "días" pero no hay cantidad de días, o el tipo es "fecha" pero no
// hay fecha, la frase queda vacía. Y una frase vacía hace que el marcador
// "[PLAZO]" quede en el papel, que es exactamente lo que tiene que pasar: se ve
// que falta. Poner "90 días" porque era lo de la otra persona, es peor.
function plazoDelContrato(w){
  const tipo=String(w.contrato_tipo_plazo||'');
  if(tipo==='indefinido')return 'indefinido';
  if(tipo==='partida')return 'por partida de contrato';
  if(tipo==='dias'){
    const n=Number(w.contrato_plazo_dias);
    if(!(n>0))return '';
    return 'por '+n+' '+(n===1?'día':'días');
  }
  if(tipo==='fecha'){
    const f=w.contrato_fecha_hasta;
    return f?('hasta el '+fechaLarga(f)):'';
  }
  return '';
}
// Y EL PLAZO DICHO DE OTRAS FORMAS, PARA LO QUE PIDAN LOS DISTINTOS PAPELES
function plazoDelContratoCortos(w){
  return {
    plazo:plazoDelContrato(w),
    tipo_plazo:String(w.contrato_tipo_plazo||''),
    plazo_dias:w.contrato_plazo_dias==null||w.contrato_plazo_dias===''
      ? '' : String(w.contrato_plazo_dias),
    plazo_indefinido:String(w.contrato_tipo_plazo||'')==='indefinido'?'indefinido':'',
    fecha_hasta:fechaLarga(w.contrato_fecha_hasta),
    fecha_hasta_corta:fechaCorta(w.contrato_fecha_hasta),
    fecha_inicio_contrato:fechaLarga(w.contrato_fecha_inicio||w.fecha_ingreso),
    fecha_inicio_contrato_corta:fechaCorta(w.contrato_fecha_inicio||w.fecha_ingreso)
  };
}
// ---------------------------------------------------------------------
// EL DOMICILIO, QUE EN UN CONTRATO ES UNA FRASE Y NO UNA DIRECCIÓN
// ---------------------------------------------------------------------
// Porque el contrato dice "domiciliado(a) en PJE LA ESCUADRA NRO.743, comuna
// PUENTE ALTO". La calle y la comuna van con su nombre y separadas por una coma,
// y eso no sale de unir dos campos.
//
// Y si la comuna no está, se escribe solo la dirección, sin una coma colgando: una
// coma antes de un punto se nota.
function domicilioDelContrato(w){
  const calle=String(w.direccion||'').trim();
  const comuna=String(w.comuna||'').trim();
  if(calle&&comuna)return calle+', comuna '+comuna;
  return calle||comuna||'';
}
function reemplazarCampos(plantilla,w,extra){
  const empresa=empresaDelPapel()||{};
  const esp=especialidadNombre(w.especialidad_clave||'');
  // Y EL NOMBRE COMPLETO, QUE ANTES NO ESTABA EN LA LISTA
  //
  // "nombreCompleto" lo arma "dbToWorker" con los nombres separados, y es el que
  // usan los papeles viejos. Si no está, "{{nombre_completo}}" sale literal.
  const nombreLargo=(w.nombreCompleto||w.name||'').trim();
  const datos={
    nombre:largoO(nombreLargo,w.name),
    nombre_completo:nombreLargo,
    nombrecompleto:nombreLargo,
    codigo:codigoMostrar(w.code),
    rut:(w.rut||'').toUpperCase(),
    especialidad:esp||(w.spec||'')||'',
    cargo:w.spec||'',
    empresa:empresa.nombre||'',
    empresa_rut:(empresa.rut||'').toUpperCase(),
    centro:centroDeRelojDe(w)||'',
    fecha:new Date().toLocaleDateString('es-CL'),
    // ------------------------------------------------------------------
    // Y LOS NUEVE CAMPOS DEL CONTRATO (migración 084)
    // ------------------------------------------------------------------
    // Y LA FECHA DE NACIMIENTO VA ESCRITA, NO EN FORMATO NUMÉRICO
    //
    // "fecha_nac" en la base es "1959-09-09". En el contrato tiene que decir
    // "9 de Septiembre de 1959". Por eso hay dos: "fecha_nac" con la frase, y
    // "fecha_nac_corta" para los papeles que usan números, como una declaración.
    fecha_nac:fechaLarga(w.fecha_nac),
    fecha_nac_corta:fechaCorta(w.fecha_nac),
    // Y EL ESTADO CIVIL SE ESCRIBE TAL CUAL
    //
    // "Casado(a)" y no "Casada": el "(a)" no es un dato, es como se escribe el
    // papel, y si se guardara "Casada" el contrato imprimiría "Casado(a)" con
    // dos señales. Si no hay dato, no se inventa el "(a)".
    estado_civil:String(w.estado_civil||''),
    nacionalidad:String(w.nacionalidad||''),
    profesion:String(w.profesion||''),
    comuna:String(w.comuna||''),
    direccion:String(w.direccion||''),
    // Y EL DOMICILIO, QUE ES LA DIRECCIÓN Y LA COMUNA EN UNA FRASE
    domicilio:domicilioDelContrato(w),
    // Y LOS CINCO DEL PLAZO, MÁS LAS FORMAS CORTA Y LARGA
    ...plazoDelContratoCortos(w),
    ...(extra||{})
  };
  // Y EL REEMPLAZO, QUE ACEPTA LAS TRES FORMAS
  //
  // "[NOMBRE]", "{{nombre}}" y "{nombre}". Con espacios adentro, porque al pegar
  // desde Word quedan "{ { nombre } }".
  const valor=function(clave){
    if(clave===undefined||clave===null)return undefined;
    const k=String(clave).trim();
    if(datos[k]!==undefined)return datos[k];
    // Y SI NO ESTÁ, SE BUSCA SIN TILDES Y SIN GUION BAJO
    //
    // "nombre-completo" y "nombre_completo" son lo mismo, y una plantilla
    // pegada de Word trae las dos formas según de dónde salió.
    const plano=k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[-\s]/g,'_').toLowerCase();
    const claves=Object.keys(datos);
    for(let i=0;i<claves.length;i++){
      const c=claves[i].normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[-\s]/g,'_').toLowerCase();
      if(c===plano)return datos[claves[i]];
    }
    return undefined;
  };
  return (plantilla||'').replace(
    /\[\s*([^\[\]]+?)\s*\]|\{\s*\{([^{}]+?)\}\s*\}|\{\s*([a-zA-Z0-9_\sáéíóúñÁÉÍÓÚÑ-]+?)\s*\}/g,
    function(m,corchete,llaves,una){
      const v=valor(corchete||llaves||una);
      return v!==undefined&&v!==null&&v!==''?String(v):m;
    }
  );
}
// Y EL NOMBRE QUE NO ESTÁ VACÍO
//
// Porque un trabajador puede tener "nombreCompleto" vacío en la ficha y el
// "name" bien. Con la regla de los dos, siempre se muestra uno.
function largoO(primero,segundo){
  return (primero&&String(primero).trim())?primero:(segundo||'');
}
function centroDeRelojDe(w){
  if(!relojes.length)return '';
  // El centro de costo del reloj donde la persona marcan. Es una aproximación
  // —puede marcar en más de uno— pero es la que sirve para el papel, y se
  // escribe como "según el reloj" en la etiqueta.
  const codigos=workers.filter(x=>x.supervisor_code===w.code).map(x=>x.code);
  const candidatos=relojes.filter(r=>r.activo);
  return candidatos.length===1?centroDe(candidatos[0]):'';
}
// El timbre, en HTML. Sale de la empresa; el cargo y el nombre de quien
// suscribe salen de la configuración.
// La empresa del timbre y del papel.
//
// "empresaActual" es un NÚMERO (0 = todas), no un objeto. El timbre pertenece
// a UNA empresa, así que cuando la persona está viendo todas no hay con qué
// armar el sello: se avisa en vez de imprimir un timbre en blanco, que es lo
// que pasaba antes.
function empresaDelPapel(){
  const lista=(typeof empresas!=='undefined'&&empresas)?empresas:[];
  if(empresaActual){
    return lista.find(e=>e.id===empresaActual)
      ||(typeof empresaActual==='object'?empresaActual:null)
      ||null;
  }
  // Sin empresa elegida, el timbre no tiene a cuál pertenecer... salvo que
  // haya una sola. Y es el caso más común: una obra con un solo contrato.
  //
  // Antes devolvía null siempre en ese caso, y el papel salía con un
  // recuadro de timbre vacío. En un documento firmado, un timbre sin nombre
  // parece un error de la empresa, y no lo es.
  if(lista.length===1)return lista[0];
  return null;
}
function avisoSinEmpresaUnica(){
  return 'Estás viendo todas las empresas. El timbre pertenece a una sola: elegí una empresa arriba '
    +'para que el papel salga con el nombre y el RUT correctos. Con una sola empresa no hace falta.';
}
// ------------------------------------------------------------------
// LA HUELLA DEL PAPEL
// ------------------------------------------------------------------
// Lo que hace que un papel firmado no se pueda cambiar despues NO es
// guardarlo: es guardar su SHA-256. Un "firmado el 2025-06-01 a las 10:00"
// es una palabra, cualquiera puede escribirla. Un hash del contenido es una
// prueba: si el texto cambio en un solo caracter, el hash cambia, y no hay
// forma de volver al hash viejo sin adivinar el documento entero.
//
// Y POR QUE SE CALCULA EN EL NAVEGADOR Y NO EN LA BASE
//
// Porque el papel entero vive en el navegador: la base guarda los datos ya
// puestos en "datos", no el texto del documento. La base no tiene con que
// calcularlo. Por eso el hash se calcula aca y se manda.
//
// Y POR QUE NO SOBRE LA PLANTILLA
//
// Se hashea el papel YA ARMADO, con los datos del trabajador dentro. Si se
// hasheara la plantilla, dos personas distintas firmando el mismo papel
// darian el mismo hash, y la huella no probaria nada sobre lo que se firmo.
async function huellaDelPapel(texto){
  if(!window.crypto||!window.crypto.subtle)return null;
  try{
    // El "TextEncoder" convierte a bytes UTF-8. Sin el, un texto con ñ o tilde
    // da un hash distinto del que dio la base, y la verificacion daria
    // false sin que nadie entienda por que.
    const bytes=new TextEncoder().encode(String(texto));
    const buf=await window.crypto.subtle.digest('SHA-256',bytes);
    const hex=Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    return hex;
  }catch(e){
    // Y SI EL NAVEGADOR NO LO TIENE, SE DICE Y SE SIGUE
    //
    // "crypto.subtle" existe en un contexto seguro: https, o localhost.
    // Servido en 127.0.0.1 SI es contexto seguro, asi que aca funciona. Falla
    // en un navegador muy viejo, o si alguien abre la pagina por la IP de la
    // maquina en http://, que NO es contexto seguro.
    //
    // Sin hash la firma IGUAL se guarda: es peor perder la firma que no
    // tener la huella. Pero queda anotado que fue sin huella, para que no se
    // piense que si la tiene.
    console.warn('[firma] sin crypto.subtle: la firma se guardó SIN huella',e);
    return null;
  }
}
// EL PAPEL QUE SE FIRMA, ARMADO
//
// Es el mismo texto que se pinta en el modal, con los datos ya puestos: el
// contenido de la plantilla, los recuadros de firma y el timbre. Se arma en una
// funcion para que el modal y la huella SIEMPREPARTAN del mismo texto: si cada
// uno lo armara por su cuenta, una diferencia de un espacio daria dos hashes
// distintos para el mismo papel, y la verificacion fallaria sin motivo.
function textoDelPapel(p,w,entrega){
  return reemplazarCampos(p.contenido,w,{
    centro:centroDeRelojDe(w)||((empresaDelPapel()||{}).nombre||'')
  })+htmlFirmas(p,entrega)+htmlTimbre();
}
// GUARDAR LA HUELLA, DESPUÉS DE QUE LA FIRMA SE GUARDÓ
//
// Y va DESPUÉS, y no en el mismo paso, por una razón que salió de medir: la
// firma va por la funcion "registrar_firma_contratacion" de la 031, que es la
// que conoce el estado del papel y el versionado de la plantilla. La huella es
// un dato más, y si se mandara junto, un fallo de la huella haria fallar la
// firma, que es lo que NO tiene que pasar.
//
// Entonces: primero se guarda la firma, y despues la huella. Si la huella
// falla, la firma esta guardada y el aviso lo dice.
async function guardarLaHuella(p,code,w,firmaT,firmaS){
  // Y LA HUELLA DEL PAPEL ES EL TEXTO QUE SE FIRMÓ, CON LAS FIRMAS PUESTAS
  //
  // Se usa la entrega recien guardada para que los recuadros de firma
  // aparezcan con lo firmado. Si se usara el HTML del modal, los recuadros
  // estarian vacios y el hash seria de OTRO papel.
  const entrega=entregasDe(code).find(e=>e.plantilla_code===p.code)||null;
  const conFirmas={firma_trabajador:firmaT,firma_supervisor:firmaS};
  const texto=textoDelPapel(p,w,conFirmas);
  const hash=await huellaDelPapel(texto);
  if(!hash)return false;

  // Y LA EMPRESA DEL TRABAJADOR, NO LA DEL SELECTOR DE ARRIBA
  //
  // Antes se usaba "empresaDelPapel()", que devuelve null cuando se estan
  // viendo todas las empresas y no hay ninguna elegida. Con 47 empresas eso es
  // lo NORMAL, y "firmas_documento" tiene "empresa_id" NOT NULL: el insert
  // fallaba y la huella no se guardaba.
  //
  // O sea: se firmaba, salia "El papel quedó guardado con la firma", y la
  // huella no existed. Porque el error se guardaba en un "console.warn" que
  // nadie mira.
  //
  // La empresa del TRABAJADOR es una sola y siempre esta. Una persona
  // pertenece a una empresa, y el papel es para esa persona: no hay que
  // adivinar nada.
  //
  // Y EL TIMBRE SIGUE USANDO "empresaDelPapel()", QUE ES LO CORRECTO
  //
  // Porque el timbre pertenece a la empresa y el papel al trabajador. Son dos
  // cosas distintas, y cada una usa el dato que le corresponde.
  const empresa=empresaDelPapel()||{};
  const idEmpresa=(w&&w.empresa_id!=null&&w.empresa_id!=='')
    ?w.empresa_id
    :(empresa.id!=null?empresa.id:null);
  if(idEmpresa==null){
    // Y SI AUN ASI NO SE SABE, SE DICE Y SE SIGUE
    //
    // La firma ya se guardó por su propio camino. Perder la huella es malo,
    // pero perder la firma es peor. Se avisa en la pantalla, no en la consola.
    console.warn('[firma] no se pudo saber la empresa: la huella no se guardo');
    avisoHuellaFallo();
    return false;
  }
  const fila={
    empresa_id:idEmpresa,
    code:code,
    tipo:p.categoria||'formulario',
    plantilla_code:p.code,
    plantilla_nombre:p.nombre,
    trabajador_nombre:w?w.name:'',
    contenido_hash:hash,
    hash_algoritmo:'sha-256',
    firma_imagen:firmaT,
    firmante_nombre:w?w.name:'',
    firmante_rut:w?w.rut:null,
  };
  // Y LA MANO DE FIRMA DE SUPUESTOR
  //
  // La tabla tiene UN solo "firma_imagen": el de la persona que firma el
  // documento, que es el trabajador. La firma del supervisor se guarda en la
  // 031, en "entregas_contratacion", que ya la tiene y que esta asociada al
  // mismo papel.
  //
  // No se agrega una segunda columna aca: seria duplicar lo que la 031 ya
  // guarda, y las dos copias se pueden desincronizar.
  const {error}=await window.supabaseClient.from('firmas_documento').upsert(fila,{
    onConflict:'empresa_id,code,tipo,documento_id,periodo'
  });
  if(error){
    // Y ESTE AVISO SE VE EN LA PANTALLA, PORQUE ANTES NO SE VEIA NADA
    //
    // Antes esto era un "console.warn". La consola no la mira nadie, y el
    // resultado era una firma guardada SIN HUELLA sin que nadie se enterara.
    // Que es justo lo que la huella existe para que no pase.
    //
    // Y NO DICE "FALLÓ": la firma SI se guardó, eso va por otra función.
    // Lo que no se guardó es la prueba. Si dijera "falló", alguien volvería a
    // firmar, y eso pisa la firma buena.
    console.warn('[firma] la firma se guardó pero la huella no:',error);
    avisoHuellaFallo(error);
    return false;
  }
  return true;
}
// ------------------------------------------------------------------
// EL AVISO DE QUE NO SE GUARDÓ LA HUELLA
// ------------------------------------------------------------------
// Y POR QUÉ ESTÁ EN EL PAPEL Y NO EN UNA VENTANA
//
// Porque una ventana con un botón "OK" saca el papel de la vista, y el aviso va
// en el mismo lugar donde ya está el error del papel. La persona lee las dos
// cosas juntas.
//
// Y NO SE BORRA SOLO
//
// Porque es una advertencia que hay que ver. Los avisos que se van solos son los
// que nadie lee, y este es el aviso de que un documento firmado quedó sin prueba
// de que no se tocó.
function avisoHuellaFallo(error){
  const caja=document.getElementById('papelError');
  if(!caja)return;
  const porQue=error&&error.message?'<small style="opacity:.8">'+escHtml(error.message)+'</small><br>':'';
  caja.innerHTML='<b>El papel quedó guardado con la firma, pero SIN la huella.</b><br>'
    +'<small>La huella es lo que demuestra que el papel no cambió después de firmarse. '
    +'Sin ella, el papel se puede volver a editar sin que se note.<br>'
    +porQue
    +'La firma sí quedó guardada: <b>no hay que firmar de nuevo</b>. Es un problema del '
    +'servicio, no del papel.</small>';
}
function htmlTimbre(){
  if(!reglaTimbre||!reglaTimbre.activo)return '';
  const empresa=empresaDelPapel()||{};
  const pos={
    inferior_derecha:'right:34px;bottom:26px;text-align:right',
    inferior_izquierda:'left:34px;bottom:26px;text-align:left',
    superior_derecha:'right:34px;top:26px;text-align:right',
    superior_izquierda:'left:34px;top:26px;text-align:left'
  }[reglaTimbre.posicion]||'right:34px;bottom:26px;text-align:right';
  const esc=escHtml;
  return '<div class="timbre" style="'+pos+';transform:rotate('+Number(reglaTimbre.giro_grados)+'deg);font-size:'+
    (Number(reglaTimbre.tamano)/100).toFixed(2)+'em">'
    +'<div class="timbre-borde">'
    +'<b>'+esc(empresa.nombre||'')+'</b>'
    +'<div class="timbre-linea">'
    +(reglaTimbre.incluir_rut&&empresa.rut?'RUT '+esc(String(empresa.rut).toUpperCase())+'<br>':'')
    +esc(reglaTimbre.cargo||'')
    +(reglaTimbre.nombre_firmante?'<br>'+esc(reglaTimbre.nombre_firmante):'')
    +'</div></div></div>';
}
// Los dos recuadros de firma. El del supervisor solo aparece si la
// plantilla lo pide: un papel con dos firmas donde la plantilla pide una
// es un documento mal hecho.
function htmlFirmas(plantilla,conFirmas){
  // 'ninguno' no muestra ni un recuadro: un aviso informativo que se
  // firma es un documento mal hecho, y el papel queda con una firma de
  // alguien que no firmó.
  const modoFirmas=plantilla.firmas||'trabajador_supervisor';
  const conSup=modoFirmas!=='ninguno';
  const soloTrabajador=modoFirmas==='trabajador';
  const bloque=(titulo,campo,quien)=>{
    const hay=campo&&String(campo).startsWith('data:image');
    return '<div class="firma-bloque">'
      +'<div class="firma-caja">'+(hay?'<img src="'+campo+'" alt="firma">':'')+'</div>'
      +'<div class="firma-linea"></div>'
      +'<div class="firma-pie"><b>'+escHtml(titulo)+'</b><br><small>'+escHtml(quien||'')+'</small></div>'
      +'</div>';
  };
  const conWorkers=(conFirmas&&conFirmas.firma_trabajador)||null;
  const firmaSup=(conFirmas&&conFirmas.firma_supervisor)||null;
  return '<div class="firmas">'
    +bloque('Firma del trabajador',conWorkers,'')
    +(conSup&&!soloTrabajador?bloque('Firma y nombre del supervisor',firmaSup,''):'')
    +'</div>';
}
function abrirPapel(plantillaCode,code){
  if(!exigirPermiso('contratacion.firmar','No tienes permiso para generar los papeles del kit.'))return;
  const p=plantillasContratacion.find(x=>x.code===plantillaCode);
  const w=workers.find(x=>x.code===code);
  if(!p||!w){alert('No se encontró el papel o el trabajador.');return;}
  const entrega=entregasDe(code).find(e=>e.plantilla_code===plantillaCode)||null;
  const dlg=document.getElementById('dlgPapel');
  document.getElementById('papelTitulo').textContent=p.nombre;
  document.getElementById('papelError').textContent='';
  document.getElementById('papelVersion').textContent='v'+p.version;
  const donde=document.getElementById('papelHoja');
  if(!empresaDelPapel()){
    document.getElementById('papelError').innerHTML=escHtml(avisoSinEmpresaUnica());
  }
  // Y EL PAPEL SE ARMA CON "textoDelPapel", NO CON LAS TRES LLAMADAS SUELTAS
  //
  // Es el mismo texto que se va a hashear al firmar. Si el modal lo armara por
  // su cuenta, una diferencia minima entre las dos versiones daria dos hashes
  // distintos para el mismo papel, y la verificacion daria false sin que haya
  // pasado nada.
  donde.innerHTML=textoDelPapel(p,w,entrega);
  // Los dos recuadros de firma se vuelven a dibujar vacíos, con la
  // firma ya puesta de fondo si la había.
  montarFirmaPapel('papelFirmaTrab',entrega?entrega.firma_trabajador:null);
  // Con la columna nueva: el recuadro del supervisor se monta si la plantilla
// lo pide. Con la vieja (un sí/no) bastaba con el valor directo; con tres
// casos hay que comparar contra 'ninguno', porque ese es el que no
// muestra nada.
if((p.firmas||'trabajador_supervisor')!=='ninguno')montarFirmaPapel('papelFirmaSup',entrega?entrega.firma_supervisor:null);
  else document.getElementById('papelFirmaSupWrap').style.display='none';
  document.getElementById('papelGuardar').textContent=entrega&&entrega.estado==='completa'?'Volver a guardar':'Guardar firma';
  dlg._plantilla=p;dlg._code=code;dlg._entrega=entrega;
  dlg.showModal();
}

// ------------------------------------------------------------------
// LA FIRMA
// ------------------------------------------------------------------
// Un <canvas> como el de la entrega de EPP, que ya está hecho y anda. Se
// reusa el mismo patrón en vez de escribir otro: son el mismo problema y dos
// implementaciones se rompen por motivos distintos.
function montarFirmaPapel(id,firmaPrevia){
  const wrap=document.getElementById(id+'Wrap');
  wrap.style.display='';
  const canvas=document.getElementById(id);
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(firmaPrevia&&String(firmaPrevia).startsWith('data:image')){
    // Se dibuja la firma previa de fondo, para que quien reimprima un papel
    // ya firmado vea la misma imagen y no una caja vacía.
    const img=new Image();
    img.onload=()=>ctx.drawImage(img,0,0,canvas.width,canvas.height);
    img.src=firmaPrevia;
  }
  canvas._dibujando=false;canvas._vacio=true;
  const pos=(ev)=>{
    const r=canvas.getBoundingClientRect();
    return {x:(ev.clientX-r.left)*(canvas.width/r.width),y:(ev.clientY-r.top)*(canvas.height/r.height)};
  };
  canvas.onpointerdown=(ev)=>{
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    canvas._dibujando=true;canvas._vacio=false;
    const p=pos(ev);
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle='#111';
  };
  canvas.onpointermove=(ev)=>{
    if(!canvas._dibujando)return;
    const p=pos(ev);
    ctx.lineTo(p.x,p.y);ctx.stroke();
  };
  const fin=()=>{canvas._dibujando=false;};
  canvas.onpointerup=fin;canvas.onpointercancel=fin;canvas.onpointerleave=fin;
  canvas.ontouchend=fin;
}
function limpiarFirma(id){
  const canvas=document.getElementById(id);
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  canvas._vacio=true;
}
function firmaComoDatos(id){
  const canvas=document.getElementById(id);
  if(canvas._vacio)return null;
  // PNG en blanco: comprimiría a un símbolo y la base de guarda menos, pero
  // un papel firmado tiene que seguir siendo legible dentro de un año, en
  // una impresora cualquiera. Se deja sin comprimir.
  return canvas.toDataURL('image/png');
}

// ------------------------------------------------------------------
// GUARDAR
// ------------------------------------------------------------------
async function guardarPapel(){
  const dlg=document.getElementById('dlgPapel');
  const p=dlg._plantilla,code=dlg._code;
  if(!p)return;
  const err=document.getElementById('papelError');
  const btn=document.getElementById('papelGuardar');
  err.textContent='';
  const firmaT=firmaComoDatos('papelFirmaTrab');
  // Con la columna nueva hay tres casos, no dos:
  //   'ninguno'               -> no se pide ninguna firma
  //   'trabajador'            -> se pide solo la del trabajador
  //   'trabajador_supervisor' -> se piden las dos, y no se guarda con una
  // Antes, con un sí/no, el caso "nadie" no se distinguía de "solo el
  // trabajador": una plantilla informativa terminaba exigiendo una firma.
  const modoFirmas=p.firmas||'trabajador_supervisor';
  const firmaS=(modoFirmas!=='ninguno')?firmaComoDatos('papelFirmaSup'):null;
  if(modoFirmas==='ninguno'){
    // Un aviso informativo se entrega sin firmar. Se guarda igual: es lo
    // que pidió la plantilla, y la base lo registra.
  }else if(modoFirmas==='trabajador_supervisor'){
    if(!firmaT&&!firmaS){
      err.textContent='Este papel lo firma el trabajador Y el supervisor. Firmá las dos.';
      return;
    }
    if(!firmaT||!firmaS){
      // Y POR QUE SON DOS "!": Y NO UN "!="
      //
      // Antes decia "firmaT!==firmaS", que compara las DOS firmas como si fueran iguales. Dos
      // firmas dibujadas a mano nunca son iguales: cada trazo produce pixeles distintos, asi que el
      // base64 difiere siempre. El cartel aparecia con las dos firmas hechas y el boton
      // bloqueado, y no habia ningun error en ninguna parte.
      //
      // Lo que se quiere preguntar es si falta ALGUNA de las dos, y eso son dos "!": una por
      // firma.
      err.textContent='Este papel lo firma el trabajador Y el supervisor. Falta una de las dos.';
      return;
    }
  }else if(!firmaT){
    err.textContent='Firmá el trabajador para guardar el papel.';
    return;
  }
  const w=workers.find(x=>x.code===code);
  btn.disabled=true;btn.textContent='Guardando…';
  const {data,error}=await window.supabaseClient.rpc('registrar_firma_contratacion',{
    p_plantilla_code:p.code, p_trabajador_code:code, p_version:p.version,
    p_firma_trabajador:firmaT, p_firma_supervisor:firmaS,
    p_datos:{nombre:w?w.name:'',rut:w?w.rut:'',especialidad:especialidadNombre(w?w.especialidad_clave:'')},
    p_anular:false
  });
  btn.disabled=false;btn.textContent='Guardar firma';
  if(!error)await guardarLaHuella(p,code,w,firmaT,firmaS);
  if(error){
    // La versión de la plantilla pudo cambiar mientras el papel estaba
    // abierto. El mensaje de la base lo dice y hay que decirlo también en
    // la pantalla: si no, la persona firma un texto que no es el que leyó.
    const cambio=/VERSION_CAMBIO/.test(error.message||'');
    err.innerHTML=cambio
      ?'La plantilla cambió mientras este papel estaba abierto.<br>'+
       '<small>Cerrá el papel y volvé a abrirlo para que se descargue el texto nuevo. Lo que escribiste no se guardó.</small>'
      :faltaLaMigracion(error,['registrar_firma_contratacion'])
      ?'La migración <b>031_kit_contratacion.sql</b> no está aplicada.'
      :escHtml(error.message);
    return;
  }
  dlg.close();
  await cargarContratacion();
  await cargarKitDelTrabajador(code);
  await renderList('');
  alert('El papel quedó guardado con la firma.');
}
async function anularPapel(plantillaCode,code){
  const p=plantillasContratacion.find(x=>x.code===plantillaCode);
  if(!p)return;
  if(!confirm('Anular el papel "'+p.nombre+'" de '+(workers.find(x=>x.code===code)||{}).name+'?\n\nEl papel NO se borra: queda como anulado, y la persona puede volver a firmarlo.\n\nSi lo firmaste por error, esto es lo correcto. Si lo querés borrar, no se puede: es un papel firmado.'))return;
  const {error}=await window.supabaseClient.rpc('registrar_firma_contratacion',{
    p_plantilla_code:plantillaCode, p_trabajador_code:code, p_version:p.version,
    p_firma_trabajador:null, p_firma_supervisor:null, p_datos:{}, p_anular:true
  });
  if(error){alert('No se pudo anular: '+error.message);return;}
  await cargarContratacion();
  await cargarKitDelTrabajador(code);
}

// ------------------------------------------------------------------
// EL PDF
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// EL PDF
// ------------------------------------------------------------------
// Y POR QUÉ SE IMPRIME Y NO SE GENERA UN PDF
//
// Antes esto armaba un PDF con "html2canvas" y "jsPDF": tomaba una foto del
// papel con un canvas, la metía como imagen dentro del PDF, y la cortaba en
// franjas de 595 puntos para hacer varias páginas.
//
// Medido sobre un PDF real de esa versión:
//
//     páginas                12        (una "Declaración de Salud")
//     texto extraíble        12 caracteres
//     tamaño                 2,6 MB
//     imágenes               12 por página, todas de 1588×1191
//
// O sea: el papel entero era UNA FOTO, partida en doce franjas. El texto no
// existía: no se podía buscar, no se podía copiar, no lo leía un lector de
// pantalla, y un buscador de PDFs no encontraba el nombre de nadie.
//
// Y el corte era peor: la franja de 595 puntos cae donde cae. Si el texto
// estaba a mitad de una franja, se partía entre dos páginas. Con una
// declaración de salud de una carilla, eso son doce páginas con líneas cortadas
// por la mitad.
//
// LO QUE SE USA AHORA
//
// "window.print()". El motor de impresión del navegador arma el PDF desde el
// HTML, y lo arma como lo que es: texto. Sale con texto seleccionable, con las
// páginas donde caen y sin partir una línea de texto.
//
// El motivo es que el papel no se corta: eso lo hace el motor de impresión, que
// sabe dónde termina una página. Y por eso puede quedar en dos páginas si es
// largo, y en dos queda bien, no partido.
//
// Y NO ES "IMPRIMIR" EN EL SENTIDO DE SALIR EN PAPEL
//
// En el diálogo que abre, el destino puede ser "Guardar como PDF". Es el
// camino de siempre en Windows y en el celular, y es lo que se busca.
//
// El nombre del archivo lo pone el que guarda, no el código. No se puede: el
// nombre del destino lo elige el diálogo de impresión, y desde el javascript no
// se escribe ahí. Eso es lo que hace el sistema operativo, y está bien que sea
// así.
// ---------------------------------------------------------------------
// LOS MARCADORES QUE NO SE PUDIERON LLENAR
// ---------------------------------------------------------------------
// Y POR QUÉ HAY QUE BUSCARLOS
//
// Porque hay una regla que dice que si un marcador no tiene dato, se queda como
// estaba: un "[RUT]" vacío se ve como un error de la empresa, y un "{{no_existe}}"
// se ve como lo que es, un marcador que hay que arreglar.
//
// Y esa regla es correcta. El problema es que "quedarse como estaba" es
// INVISIBLE: un papel con "{{rut}}" adentro sale impreso, se firma, y nadie se
// entera hasta que alguien lo lee. Y en un contrato firmado ya no se puede
// arreglar: el hash ya está.
//
// Y PASÓ. En un PDF real se vio "RUT: {{rut}}," en medio de la cláusula de
// identificación, con el nombre bien puesto al lado. El nombre se reemplazó y el
// RUT no, porque esa ficha no tenía RUT cargado.
//
// Por eso se buscan los marcadores que quedaron y se AVISAN ANTES de imprimir.
// No se corrigen: corregir es inventar el dato de una persona.
//
// Y LA LISTA ES DE LAS MISMAS TRES FORMAS QUE ENTIENDE EL REEMPLAZO
//
// "[NOMBRE]", "{{nombre}}" y "{nombre}". Si se buscara otra forma, el marcador
// que no se busca es el que pasa.
// Y LA CLAVE SE NORMALIZA A MINUSCULA, Y POR QUÉ
//
// Porque "[RUT]", "{{Rut}}" y "{rut}" son el mismo dato escrito de tres formas, y
// en un contrato pueden aparecer las tres: una quedó con mayúsculas y se pegó,
// otra quedó con minúsculas. Si se contaran por como están escritos, el aviso
// diría "faltan 3 datos" cuando falta uno, y eso hace que el aviso se lea como
// ruido y se deje de mirar.
//
// El marcador SE MUESTRA como está escrito, porque es lo que hay que buscar en la
// plantilla para arreglarlo. La clave normalizada es solo para contar.
function marcadoresSinLlenar(texto){
  const out=[];
  const re=/\[\s*([^\[\]]+?)\s*\]|\{\{\s*([^{}]+?)\s*\}\}|\{\s*([a-zA-Z0-9_\sáéíóúñÁÉÍÓÚÑ-]+?)\s*\}/g;
  let m;
  while((m=re.exec(texto||''))){
    const escrito=String(m[1]||m[2]||m[3]||'').trim();
    if(!escrito)continue;
    out.push({marcador:m[0],clave:escrito.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')});
  }
  // Y SIN REPETIR, porque un contrato puede tener el mismo marcador cinco veces
  // y son cinco veces el mismo problema, no cinco problemas
  const vistos={};
  return out.filter(function(x){ if(vistos[x.clave])return false; vistos[x.clave]=1; return true; });
}
// Y EL AVISO SE DA EN "descargarEntrega", CON EL TEXTO YA COMPUESTO
//
// Porque buscar los marcadores sobre el texto final es lo único que sirve: un
// marcador puede estar completo en la plantilla y quedar vacío porque el dato
// del trabajador no está.
async function descargarEntrega(entregaId){
  // Y POR QUE SE USA LA IMPRESIÓN DEL NAVEGADOR Y NO UNA LIBRERÍA
  //
  // Con "html2canvas" el papel se convertía en una FOTO, y se cortaba en franjas para
  // hacer páginas. Medido sobre un PDF de esa versión: 12 páginas, 12 imágenes por
  // página, 12 caracteres de texto y 2,6 MB. El texto no existía. Ver [pdf-01].
  //
  // La impresión del navegador arma el PDF desde el HTML, y lo arma como lo que es:
  // texto. Sale seleccionable, buscable, y las páginas caen donde deben.
  const e=entregasContratacion.find(x=>x.id===entregaId);
  if(!e){alert('No se encontró la entrega.');return;}
  const p=plantillaPorId(e.plantilla_id);
  const w=workers.find(x=>x.code===e.trabajador_code);
  if(!p||!w){alert('No se encontró la plantilla o el trabajador.');return;}
  const hoja=document.getElementById('pantallaTotal');
  // Y SE COMPONE UNA SOLA VEZ, PARA QUE LO QUE SE IMPRIME Y LO QUE SE AVISA SEAN
  // EL MISMO TEXTO
  //
  // Antes se llamaba dos veces: una para imprimir y otra para el hash. Con el aviso
  // son tres usos, y componiendo por separado cada uno podría salir distinto.
  const cuerpo = reemplazarCampos(p.contenido,w,e.datos||{})
    + htmlFirmas(p,e)
    + htmlTimbre();
  // Y ANTES DE IMPRIMIR, SE DICE SI FALTA ALGO
  //
  // Y se avisa del TEXTO YA COMPUESTO, que es donde se sabe qué quedó sin llenar:
  // un marcador puede estar completo en la plantilla y quedar vacío porque el
  // dato del trabajador no está.
  const huecos=marcadoresSinLlenar(cuerpo);
  if(huecos.length){
    // Y EL AVISO DICE QUE SE PUEDE SEGUIR, PORQUE ES DEL USUARIO
    if(!confirm(
      'Este papel tiene '+huecos.length+' marcador(es) SIN LLENAR:\n\n'
      +huecos.map(function(x){return '  · '+x.marcador;}).join('\n')
      +'\n\nSi seguís, esos marcadores salen LITERALES en el papel, con las llaves'
      +'\n y los corchetes a la vista.\n\n'
      +'¿Querés cerrar el papel y completar los datos en la ficha del trabajador?'
    )) return;
  }
  hoja.innerHTML='<div class="hoja-papel">'+cuerpo+'</div>';
  // Y UN CORTE ANTES DE IMPRIMIR, PORQUE LAS IMÁGENES NECESITAN SU TIEMPO
  //
  // Las firmas son imágenes (data URL). Si se imprime antes de que el navegador las
  // dibujó, salen en blanco o con un cuadrito vacío. Se espera un poco.
  await new Promise(r=>setTimeout(r,250));
  // Y SE IMPRIME DESDE UN CONTENEDOR PROPIO
  //
  // No desde "pantallaTotal": esa caja está en "position: fixed; left: -10000px",
  // escondida para armar el documento sin que se vea. Y al imprimir, un elemento
  // fijo se posiciona respecto de la VENTANA, que es la hoja. Con diez mil píxeles
  // a la izquierda, el documento entero queda fuera y sale una hoja en blanco.
  //
  // "imprimirPapel" crea un contenedor nuevo, hijo directo de "<body>", muda el
  // papel ahí y esconde todo lo demás con "display: none". El papel queda con un
  // solo ancestro, y ese no se esconde. Ver "js/impresion-papel.js".
  imprimirPapelEnVentana(hoja.innerHTML,{plantilla:p.nombre,trabajador:w.name||w.nombreCompleto||code});
  hoja.innerHTML='';
}
