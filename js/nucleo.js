/* ===================================================================
   js/nucleo.js - LO QUE USA MÁS DE UN MÓDULO
   ===================================================================

   Este archivo carga PRIMERO. Y no por las funciones: las funciones de nivel
   superior son globales, y da igual en qué orden carguen los módulos.

   Es por las variables. "workers" la usan los ocho módulos, "attendance" cinco, y
   hay 51 de las 151 variables de nivel superior que las usa más de uno.

   Y esas son "const" y "let", que NO se levantan como las "function". Si el módulo
   que las usa carga antes que el que las declara, se cae con "ReferenceError" al
   tocarlas. Por eso el "<script>" de este archivo va el primero.

   -------------------------------------------------------------------
   LO QUE HAY AQUÍ
   -------------------------------------------------------------------
   1. LA CABEZA: el estado de la aplicación y los ayudantes que usan todos.
      "workers", "attendance", "tarjetas", "eppCatalog", "kits",
      "especialidades", "eppGps", "extraHolidays"...

   2. La bitácora, para poder leerla.
   3. Si está puesta la bitácora de auditoría.
   4. El encabezado que se encoge al bajar.

   -------------------------------------------------------------------
   Y CÓMO SE SACÓ, Y POR QUÉ NO ROMPIÓ NADA
   -------------------------------------------------------------------
   Los cuatro trozos no son contiguos: hay 13.700 renglones de otras secciones en
   medio. Y juntarlos cambia el orden en que se declaran las cosas de nivel superior.

   Da igual, por dos razones juntas:

     - Al concatenar se conserva el orden ORIGINAL de los trozos. Si el trozo 1 va
       antes del 4 en el archivo nuevo, también iba antes en el viejo.
     - Y en el archivo viejo no hay ninguna declaración de nivel superior que use
       algo declarado más abajo. Si la hubiera, la aplicación no cargaría.

   Entre módulos tampoco puede haber una referencia de nivel superior hacia adelante,
   por la misma razón. Lo único que hay que cuidar es el ORDEN DE CARGA.

   -------------------------------------------------------------------
   LO QUE NO ESTÁ AQUÍ, Y DÓNDE ESTÁ
   -------------------------------------------------------------------
   Todavía no se partió el resto. "js/app.js" sigue con las 33 secciones de los
   demás módulos, y carga después que este archivo.

   Y "views/porteria/escaner.js" carga en el medio, como antes. No se le toca.

   Ver la entrada [nucleo-01]. */

let workers = [];       // ahora viene de Supabase (tabla trabajadores)
let attendance = [];    // ahora viene de Supabase (tabla asistencia)
let tarjetas = [];      // ahora viene de Supabase (tabla tarjetas: emisión/anulación por ID)
let extraHolidays = JSON.parse(localStorage.getItem('extraHolidays')||'[]');
let dayOverrides = JSON.parse(localStorage.getItem('dayOverrides')||'{}');
// Bodega: EPP y herramientas viven en Supabase (tablas epp_* y herramientas_*).
let eppCatalog = [];      // [{codigo,nombre,detalle,requiere_talla,activo}]
let eppDeliveries = [];   // [{id,code,fecha,detalle,observacion,cargo,es_entrega_inicial,firma_*,pdf_url,items:[...]}]
let eppItemRows = [];     // filas del formulario en edición
let eppTallas = [];       // [{talla,tipo,orden}] tallas chilenas de calzado, ropa y general
let eppKits = [];         // [{cargo,epp_codigo,cantidad,orden,talla_sugerida}] (respaldo 009/011, ya no se usa)
let especialidades = [];  // [{id,clave,nombre,descripcion,activa}]
let kits = [];            // [{id,especialidad_id,nombre,descripcion,orden,activo}] varios por especialidad
let kitItems = [];        // [{kit_id,epp_codigo,cantidad,talla_sugerida,orden}]
let kitAsignaciones = []; // [{id,code,especialidad_id,kit_id,kit_nombre,completado,items:[...]}]
let tools = [];           // [{id,codigo,nombre,precio,activo}]
let toolAssignments = []; // [{id,code,herramienta_id,herramienta_codigo,herramienta_nombre,precio,fecha,devuelta,inventario_qr_id}]
let inventarioQr = [];    // [{id,tipo,herramienta_id,epp_codigo,nombre,precio,estado,motivo_anulacion}]
let tempCasual=null, tempSafety=null;
let eppGps=null;         // {lat,lng,precision} capturado en la firma
let qrSeleccionadas=[];   // ids de etiquetas marcadas para imprimir

function save(){
  // Todo lo de bodega (EPP, catálogo, herramientas) escribe directo en Supabase.
  try{
    localStorage.setItem('extraHolidays',JSON.stringify(extraHolidays));
    localStorage.setItem('dayOverrides',JSON.stringify(dayOverrides));
  }catch(e){alert('No se pudo guardar (posible límite de almacenamiento): '+e.message);}
}

// ---------- puente Supabase <-> objetos en memoria ----------
// El RUT se guarda solo con números y K, sin puntos ni guiones, para que
// "13.199.887-2", "13199887-2" y "131998872" sean el mismo RUT. Vacío
// devuelve '' y no "null": así el índice único no rechaza a los
// trabajadores que todavía no lo tienen informado.
function normalizarRut(valor){
  return String(valor==null?'':valor).replace(/[^0-9kK]/g,'').toUpperCase();
}
// Y el código de la AFP se guarda SIN ESPACIOS y en mayúscula, por lo mismo que el RUT:
// en las importaciones se compara carácter por carácter, y "AFPH" y "AFPH " no son el
// mismo dato. Con un espacio de más, el trabajador deja de emparejar en la planilla y
// nadie sabe por qué: el código se ve igual en las dos pantallas.
function normalizarAfp(valor){
  return String(valor==null?'':valor).replace(/\s+/g,'').toUpperCase();
}
function workerToDb(w){
  // Y esto va PRIMERO, antes de armar el objeto: "rellenarNombres" lee "w.name", que es
  // el nombre entero, y devuelve las tres columnas. Si se hiciera al final, ya se estaría
  // escribiendo el objeto.
  const nombresRellenados = rellenarNombres(w);
  return {
    code:w.code, name: componerNombre(w), cargo:w.spec||null, phone:w.phone||null,
    // Los nombres separados (migración 056). Sin estas cuatro líneas, el "upsert" las
    // pisaría con null en cada guardado: el "upsert" manda todas las columnas del
    // objeto, no solo las que cambiaron.
    //
    // Y van por "rellenarNombres", no directo: hay un solo campo donde se escribe el nombre
    // entero —el del ingreso que pide un supervisor, y el del Excel— y esas columnas
    // quedaban vacías. Y si quedan vacías no se puede ordenar por apellido.
    //
    // Y la función NO pisa lo que alguien ya escribió: solo rellena cuando las tres están
    // vacías. Ver [nombres-01].
    nombres: nombresRellenados.nombres,
    apellido_paterno: nombresRellenados.apellido_paterno,
    apellido_materno: nombresRellenados.apellido_materno,
    direccion: w.direccion||null, correo: w.correo||null,
    // La AFP con código y nombre (migración 057). Los dos, porque las planillas usan el
    // código y las cartas usan el nombre. Con uno solo, la mitad de los documentos sale
    // mal. Ver [afp-01].
    afp_codigo: normalizarAfp(w.afp_codigo)||null,
    afp_nombre: w.afp_nombre||null,
    rut: normalizarRut(w.rut)||null,
    fecha_ingreso:w.fecha_ingreso||null, tipo_trabajador:w.tipo_trabajador||'interno',
    is_supervisor: !!w.is_supervisor, supervisor_code: w.supervisor_code||null,
    foto_casual_url: w.casual||null, foto_seguridad_url: w.safety||null,
    emerg_nombre: w.emerg_name||null, emerg_telefono: w.emerg_phone||null, emerg_relacion: w.emerg_rel||null,
    salud_notas: w.salud||null, medicamentos: w.medicamentos||null, precauciones: w.precauciones||null,
    alerta_social: !!w.alerta_social, alerta_social_nota: w.alerta_social_nota||null,
    alerta_prevencion: !!w.alerta_prevencion, alerta_prevencion_nota: w.alerta_prevencion_nota||null,
    indicaciones_sociales:w.indicaciones_sociales||null, indicaciones_prevencion:w.indicaciones_prevencion||null,
    status: w.status||'activo', fecha_desvinculacion: w.fecha_desvinculacion||null,
    // Los tres de la desvinculación (migración 029). Van en el upsert de
    // todas partes: sin ellos, cualquier guardado que use workerToDb los
    // pondría en null.
    fecha_termino: w.fecha_termino||null,
    articulo_termino: w.articulo_termino||null,
    motivo_desvinculacion: w.motivo_desvinculacion||null,
    // La especialidad por CLAVE (migración 031): decide qué charlas del
    // kit le tocan. Va en el upsert de todas partes porque este
    // workerToDb lo usan TODOS los guardados —incluida la carga del
    // Excel— y sin esta línea cualquiera de ellos la pondría en null.
    especialidad_clave: w.especialidad_clave||null,
    // El sueldo base (migración 069). Va con la MISMA cantidad de cuidado que los datos de
    // la desvinculación, y por el MISMO motivo: el "upsert" manda todas las columnas del
    // objeto, no solo las que cambiaron. Sin esta línea, cualquier guardado —editar un
    // teléfono, un alta, la carga del Excel— pondría el sueldo en null. Y se perdería sin
    // avisar: el trabajador sigue con todos sus datos, solo que el sueldo volvió a vacío.
    //
    // Y se escribe con un "| 0" y no con un "|| null" porque el CERO es un valor: una persona
    // puede tener sueldo cero, y eso es distinto de "no cargado". Ver [rem-01].
    sueldo_base: w.sueldo_base==null||w.sueldo_base===''
      ? (w.sueldo_base_vigente==null?null:w.sueldo_base_vigente)
      : Number(w.sueldo_base),
    empresa_id: w.empresa_id||null,
    // El centro de costo del trabajador (migración 064). Sin esta línea el "upsert"
    // no la manda y el valor se pierde en silencio, sin error. Ver [centro-06].
    centro_costo_id: w.centro_costo_id||null,
    // ------------------------------------------------------------------
    // LOS NUEVE CAMPOS DEL CONTRATO (migración 084)
    // ------------------------------------------------------------------
    // Y ESTAN AQUI, EN EL "UPSERT" DE TODAS PARTES, POR LA MISMA RAZON QUE EL
    // SUELDO Y LA FECHA DE TERMINO: el "upsert" manda todas las columnas del
    // objeto, no solo las que cambiaron. Sin estas nueve líneas, CUALQUIER
    // guardado —editar un teléfono, un alta, la carga del Excel— pondría la
    // fecha de nacimiento, el estado civil y el plazo en null.
    //
    // Y el plazo son cuatro columnas porque son cuatro formas: indefinido, por
    // partida, por días, o hasta una fecha.
    //
    // Y "contrato_plazo_dias" NO pasa por "|| null", porque un número guardado
    // como texto no se puede sumar ni comparar con otro, y el papel lo necesita
    // como número. El cero tampoco es un plazo, y la base lo rechaza.
    fecha_nac: w.fecha_nac||null,
    estado_civil: w.estado_civil||null,
    nacionalidad: w.nacionalidad||null,
    profesion: w.profesion||null,
    comuna: w.comuna||null,
    contrato_tipo_plazo: w.contrato_tipo_plazo||null,
    contrato_plazo_dias: w.contrato_plazo_dias==null||w.contrato_plazo_dias===''
      ? null : Number(w.contrato_plazo_dias),
    contrato_fecha_inicio: w.contrato_fecha_inicio||null,
    contrato_fecha_hasta: w.contrato_fecha_hasta||null
  };
}
// -------------------------------------------------------------------
// EL NOMBRE ENTERO, ARMADO CON LOS TRES CAMPOS
// -------------------------------------------------------------------
// Y es lo ÚNICO que arma "name". Todos los que leen "w.name" —las exportaciones, las
// importaciones desde Excel, las búsquedas, la credencial— siguen recibiendo el mismo
// texto que antes, porque no se cambió de dónde sale.
//
// Y si faltan los nombres, se usa el texto que venga como "w.name". Porque hay
// importaciones que traen el nombre entero y no los tres, y si acá se exigieran los tres,
// esas importaciones dejarían de entrar.
// PARTIR EL NOMBRE ENTERO EN NOMBRES Y APELLIDOS
// =================================================
//
// -------------------------------------------------------------------
// POR QUÉ EXISTE
// --------------
//
// Porque hay un solo campo donde se escribe el nombre entero —el del ingreso, el del Excel— y
// las columnas nuevas de la 056 ("nombres", "apellido_paterno", "apellido_materno") quedan
// vacías. Y si quedan vacías, no se puede ordenar por apellido ni sacar una planilla con
// columnas separadas.
//
// -------------------------------------------------------------------
// Y POR QUÉ ES UNA ADIVINADA, Y QUÉ HACE CUANDO SE FALLA
// -------------------------------------------------------
//
// "Jonathan Castro Rocha" se parte sin problema: dos apellidos al final. "María Teresa Álvarez
// Cordero" también. Y "Pedro Pérez" no tiene segundo apellido, y "Juan de la Fuente" no
// sigue ninguna regla.
//
// O sea que esto NO SABE el nombre de alguien. Adivina, y por eso:
//
//   - SOLO rellena cuando las tres columnas están vacías. Si alguien ya las escribió a mano,
//     no se tocan. Un dato que una persona puso no se pisa con una adivinada.
//   - NUNCA inventa una columna que falta. Si no alcanza para los dos apellidos, el segundo
//     queda vacío, porque un apellido inventado es peor que un apellido faltante.
//   - Y siempre se puede corregir en la ficha, que es donde va la gente de RRHH a revisarlo.
//
// -------------------------------------------------------------------
// LA REGLA, Y POR QUÉ ES ESTA Y NO OTRA
// --------------------------------------
//
// De atrás para adelante: el último apellido es el materno, el que lo precede es el paterno,
// y todo lo demás son los nombres.
//
// Y NO se intenta detectar "de", "del", "de la": en "Juan de la Fuente" hay tres palabras de
// apellido y dos de nombre, y cualquier lista de partículas adivina mal la mitad de los
// casos. Es mejor una regla simple que se pueda explicar en una línea que una lista de
// excepciones que se va llenando sola.
//
// Y el resultado NO SE USA PARA NADA CRÍTICO: la columna "name" sigue siendo la que va en la
// credencial, en las planillas y en las importaciones. Esto es para poder ORDENAR y para
// tener las columnas separadas.
function partirNombre(entero) {
  const limpio = String(entero || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!limpio) return { nombres: '', apellido_paterno: '', apellido_materno: '' };

  const partes = limpio.split(' ');

  // Y una sola palabra no es un nombre con apellidos: es un nombre y nada más. Una entrada
  // con un solo campo es una entrada incompleta, y ponerle un apellido inventado es peor.
  if (partes.length === 1) {
    return { nombres: partes[0], apellido_paterno: '', apellido_materno: '' };
  }

  // Con dos, el segundo es el paterno. No hay materno, y no se inventa.
  if (partes.length === 2) {
    return { nombres: partes[0], apellido_paterno: partes[1], apellido_materno: '' };
  }

  return {
    nombres: partes.slice(0, partes.length - 2).join(' '),
    apellido_paterno: partes[partes.length - 2],
    apellido_materno: partes[partes.length - 1],
  };
}

// -------------------------------------------------------------------
// Y EL RELLENO
// -------------------------------------------------------------------
// Que se usa en "workerToDb". Y el nombre de la función dice lo que hace: "rellena", no
// "parte". "Partir" suena a que siempre pasa; "rellena" dice que solo pasa cuando falta algo.
function rellenarNombres(w) {
  const yaEstan = w.nombres || w.apellido_paterno || w.apellido_materno;
  if (yaEstan) {
    // Y si hay alguno de los tres escrito, NO se completa el resto. Un formulario a medio
    // llenar significa que alguien está en el medio de escribirlo, y completar lo que falta
    // se lo escribe por encima.
    return {
      nombres: w.nombres || null,
      apellido_paterno: w.apellido_paterno || null,
      apellido_materno: w.apellido_materno || null,
    };
  }

  const p = partirNombre(w.name);
  return {
    nombres: p.nombres || null,
    apellido_paterno: p.apellido_paterno || null,
    apellido_materno: p.apellido_materno || null,
  };
}

function componerNombre(w){
  const partes=[String(w.nombres||'').trim(),
                String(w.apellido_paterno||'').trim(),
                String(w.apellido_materno||'').trim()].filter(Boolean);
  if(!partes.length)return String(w.name||'').trim();
  return partes.join(' ');
}

// Y pasa por los tres si están, y si no por el nombre entero.
function dbToWorker(r){
  return {
    code:r.code, name:r.name, spec:r.cargo, phone:r.phone, rut:r.rut, fecha_ingreso:r.fecha_ingreso, tipo_trabajador:r.tipo_trabajador||'interno',
    // Los nombres separados (migración 056). Sin mapearlos, el formulario de edición
    // los muestra vacíos y si alguien guarda la ficha los pisa con null.
    //
    // Y el nombre entero se arma con ellos CUANDO están, porque hay fichas cargadas
    // antes de la 056 que no los tienen y siguen teniendo "name" bueno: sin este
    // "||", esas fichas se mostrarían con el nombre en blanco.
    nombres: r.nombres||null,
    apellido_paterno: r.apellido_paterno||null,
    apellido_materno: r.apellido_materno||null,
    nombreCompleto: componerNombre(r)||r.name||'',
    direccion: r.direccion||null, correo: r.correo||null,
    afp_codigo: r.afp_codigo||null, afp_nombre: r.afp_nombre||null,
    is_supervisor:r.is_supervisor, supervisor_code:r.supervisor_code,
    casual:r.foto_casual_url, safety:r.foto_seguridad_url,
    emerg_name:r.emerg_nombre, emerg_phone:r.emerg_telefono, emerg_rel:r.emerg_relacion,
    salud:r.salud_notas, medicamentos:r.medicamentos, precauciones:r.precauciones,
    alerta_social:r.alerta_social, alerta_social_nota:r.alerta_social_nota,
    alerta_prevencion:r.alerta_prevencion, alerta_prevencion_nota:r.alerta_prevencion_nota,
    indicaciones_sociales:r.indicaciones_sociales, indicaciones_prevencion:r.indicaciones_prevencion,
    status:r.status, fecha_desvinculacion:r.fecha_desvinculacion,
    // Los tres de la desvinculación (migración 029). Sin mapearlos acá, la
    // lista no muestra la fecha de término, el cuadro de desvinculación no
    // propone la que ya tiene, y el aviso de fichas repetidas no puede
    // distinguir la vieja de la nueva. El dato estaba en la base y no
    // llegaba a ninguna parte.
    fecha_termino:r.fecha_termino,
    articulo_termino:r.articulo_termino,
    // La especialidad por CLAVE (migración 031). Sin mapearla, el kit
    // le armaba a todos el papel general y avisaba que no tienen
    // especialidad, aunque la tuvieran puesta en la base.
    especialidad_clave:r.especialidad_clave||null,
    // La especialidad por CLAVE (migración 031). Sin mapearla, el kit
    // le armaba a todos el papel general y avisaba que no tienen
    // especialidad, aunque la tuvieran puesta en la base.
    especialidad_clave:r.especialidad_clave||null,
    motivo_desvinculacion:r.motivo_desvinculacion,
    desvinculado_por_nombre:r.desvinculado_por_nombre,
    // Los nueve campos del contrato (migración 084). Sin mapearlos acá, la ficha
    // los muestra vacíos y, si alguien guarda la ficha, el "upsert" los pisa con
    // null: el dato estaba en la base y no llegaba a ninguna parte.
    fecha_nac:r.fecha_nac||null,
    estado_civil:r.estado_civil||null,
    nacionalidad:r.nacionalidad||null,
    profesion:r.profesion||null,
    comuna:r.comuna||null,
    // Y EL PLAZO, QUE SON CUATRO COLUMNAS PORQUE TIENE CUATRO FORMAS
    contrato_tipo_plazo:r.contrato_tipo_plazo||null,
    contrato_plazo_dias:r.contrato_plazo_dias==null?null:Number(r.contrato_plazo_dias),
    contrato_fecha_inicio:r.contrato_fecha_inicio||null,
    contrato_fecha_hasta:r.contrato_fecha_hasta||null,
    empresa_id:r.empresa_id||null
  };
}
function attToDb(a){
  return {code:a.code, fecha:a.date, estado:a.estado, hora_llegada:a.hora_llegada||null, nota:a.nota||null, origen:a.origen||'manual'};
}
function dbToAtt(r){
  return {code:r.code, date:r.fecha, estado:r.estado, hora_llegada:r.hora_llegada, nota:r.nota, origen:r.origen};
}
async function loadWorkers(){
  const {data,error}=await window.supabaseClient.from('trabajadores').select('*').order('name');
  if(error){alert('No se pudieron cargar los trabajadores desde la base de datos: '+error.message);return;}
  // se guarda todo sin filtrar y se acota "workers" por empresa: así las
  // 65 referencias existentes en la app respetan el ámbito sin tocarlas.
  todosWorkers=(data||[]).map(dbToWorker);
  aplicarFiltroEmpresas();
}
async function loadAttendanceFromDB(){
  const {data,error}=await window.supabaseClient.from('asistencia').select('*');
  if(error){alert('No se pudo cargar la asistencia desde la base de datos: '+error.message);return;}
  attendance=(data||[]).map(dbToAtt);
}
async function loadTarjetas(){
  const {data,error}=await window.supabaseClient.from('tarjetas').select('*');
  if(error){alert('No se pudieron cargar las tarjetas emitidas: '+error.message);return;}
  tarjetas=data||[];
}
// Bodega: los cargadores aceptan "quiet" para no interrumpir el arranque de la app
// cuando la migración 008 todavía no se ha ejecutado en Supabase.
function bodegaError(msg,quiet){
  if(!quiet)alert(msg);
  else console.warn(msg);
}
async function loadEppCatalog(quiet){
  const {data,error}=await window.supabaseClient.from('epp_catalogo').select('*').order('codigo');
  if(error){bodegaError('No se pudo cargar el catálogo de EPP (ejecuta la migración 008): '+error.message,quiet);return;}
  eppCatalog=data||[];
}
async function loadEppDeliveries(quiet){
  // Con una fila por trabajador, truncar el historial haría que un
  // trabajador apareciera incompleto sin avisar. Se piden muchas y, si
  // aun así se llega al tope, se dice en pantalla.
  const {data,error}=await window.supabaseClient.from('epp_entregas').select('*').order('fecha',{ascending:false}).limit(2000);
  if(error){bodegaError('No se pudieron cargar las entregas de EPP: '+error.message,quiet);return;}
  const entregas=data||[];
  if(entregas.length){
    const {data:items}=await window.supabaseClient.from('epp_entrega_items').select('*').in('entrega_id',entregas.map(e=>e.id));
    const byEntrega={};
    (items||[]).forEach(it=>{(byEntrega[it.entrega_id]=byEntrega[it.entrega_id]||[]).push(it);});
    entregas.forEach(e=>{e.items=byEntrega[e.id]||[];});
  }
  eppDeliveries=entregas;
  fillEppItemFilter();
  renderEppHistory();
}
// El selector de "Elemento EPP" se arma con lo que se entregó de verdad,
// no con el catálogo entero: así el filtro nunca ofrece algo que nadie
// tiene y el resultado vacío siempre significa algo.
function fillEppItemFilter(){
  const sel=document.getElementById('epp-filtro-item');
  if(!sel)return;
  const previo=sel.value;
  const usados=new Set();
  eppDeliveries.forEach(e=>(e.items||[]).forEach(i=>{
    if(i.epp_codigo)usados.add(i.epp_codigo+'|'+i.nombre);
    else if(i.nombre)usados.add(''+'|'+i.nombre);
  }));
  const lista=Array.from(usados).map(p=>{const [c,n]=p.split('|');return {c,n};})
    .sort((a,b)=>a.n.localeCompare(b.n,'es'));
  sel.innerHTML='<option value="">Todos los elementos</option>'+
    lista.map(x=>`<option value="${escHtml(x.c)}">${escHtml(x.c?x.c+' · ':'')}${escHtml(x.n)}</option>`).join('');
  if(lista.some(x=>x.c===previo))sel.value=previo;
  else sel.value='';
}
async function loadTools(quiet){
  const {data,error}=await window.supabaseClient.from('herramientas_catalogo').select('*').order('nombre');
  if(error){bodegaError('No se pudo cargar el catálogo de herramientas: '+error.message,quiet);return;}
  tools=data||[];
}
// Por qué la lista puede salir vacía. Antes no se decía nada y la vista
// afirmaba "No hay herramientas asignadas", que es una afirmación que la
// app no puede sostener: si la consulta falló, no es que no haya, es que no
// se pudo leer. Y con la lista vacía no hay ningún botón "Marcar devuelta",
// así que la persona se queda sin salida y sin explicación.
let toolAssignmentsError='';
async function loadToolAssignments(quiet){
  const {data,error}=await window.supabaseClient.from('herramientas_asignaciones').select('*').order('fecha',{ascending:false}).limit(300);
  if(error){
    toolAssignmentsError=error.message||String(error);
    bodegaError('No se pudieron cargar las asignaciones de herramientas: '+error.message,quiet);
    return;
  }
  toolAssignmentsError='';
  toolAssignments=data||[];
}
async function loadEppTallas(quiet){
  const {data,error}=await window.supabaseClient.from('epp_tallas').select('*').order('orden');
  if(error){bodegaError('No se pudieron cargar las tallas (ejecuta la migración 009): '+error.message,quiet);return;}
  eppTallas=data||[];
}
async function loadInventarioQr(quiet){
  const {data,error}=await window.supabaseClient.from('inventario_qr').select('*').order('created_at',{ascending:false}).limit(500);
  if(error){bodegaError('No se pudieron cargar las etiquetas QR (ejecuta la migración 009): '+error.message,quiet);return;}
  inventarioQr=data||[];
}
async function loadBodega(quiet){
  await Promise.all([
    loadEppCatalog(quiet),loadEppDeliveries(quiet),loadEppTallas(quiet),
    loadEspecialidades(quiet),loadKits(quiet),loadKitItems(quiet),loadKitAsignaciones(quiet),
    loadTools(quiet),loadToolAssignments(quiet),loadInventarioQr(quiet)
  ]);
  initBodega();
}
function generateCardId(){
  const alfabeto='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones
  return Array.from({length:8},()=>alfabeto[Math.floor(Math.random()*alfabeto.length)]).join('');
}
async function issueCard(code,tipo){
  const previas=tarjetas.filter(t=>t.code===code&&t.estado==='activa');
  if(previas.length){
    const {error:errAnular}=await window.supabaseClient.from('tarjetas')
      .update({estado:'anulada',motivo_anulacion:`Reemplazada por nueva tarjeta ${tipo}`,motivo_bloqueo:null})
      .in('id',previas.map(p=>p.id));
    if(errAnular){alert('No se pudo anular la tarjeta anterior: '+errAnular.message);}
  }
  const id=generateCardId();
  const {error}=await window.supabaseClient.from('tarjetas').insert({id,code,tipo,estado:'activa'});
  if(error){alert('No se pudo emitir la tarjeta en la base de datos: '+error.message);return code;}
  await loadTarjetas();
  return id;
}
async function getOrIssueCard(code,tipo){
  const existente=tarjetas.find(t=>t.code===code&&t.tipo===tipo&&t.estado==='activa');
  if(existente)return existente.id;
  return await issueCard(code,tipo);
}

function uid(){return Date.now()+'-'+Math.random().toString(36).slice(2,7);}
function isoLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function hoyLocal(){return isoLocal(new Date());}

const feriadosFijos = ['01-01','05-01','05-21','06-29','07-16','08-15','09-18','09-19','10-12','10-31','11-01','12-08','12-25'];
const feriadosMoviles = {2025:['04-18','04-19'],2026:['04-03','04-04']};

function isFeriado(y,m,d){
  const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  if(dayOverrides[iso]) return dayOverrides[iso]==='fer';
  const mmdd = iso.slice(5);
  if(feriadosFijos.includes(mmdd)) return true;
  if((feriadosMoviles[y]||[]).includes(mmdd)) return true;
  if(extraHolidays.includes(iso)) return true;
  const dow = new Date(y,m-1,d).getDay();
  return dow===0 || dow===6;
}

// LOS ICONOS DEL SUBMENU Y DE LAS PESTANAS
//
// El menu principal, la barra de submenu y las pestanas de las vistas
// usan ESTA funcion. Tres listas distintas para los tres niveles
// terminarian con tres iconos para la misma idea, y el primero en
// cambiar seria el que nadie revisa.
//
// LA CLAVE ES EL "v" DEL ITEM, NO SU TEXTO
// -------------------------------------------
// Con el texto como clave, el dia que alguien escriba "Asistencia
// mensual" en vez de "Asistencia Mensual", el icono desaparece. No hay
// error, no hay aviso: el boton queda sin dibujo y la pantalla sigue
// funcionando. Eso se descubre cuando alguien lo ve, no cuando se rompe.
//
// Con el "v" como clave, el icono queda pegado a la vista, que es lo que
// es: un identificador, no una frase que alguien pueda cambiar.
//
// LA LISTA TIENE QUE ESTAR ENTERA
// --------------------------------
// Al principio la regla era "si no hay icono, no se dibuja nada", y es
// buena para un boton suelto. Mal aplicada a una lista: dentro del
// desplegable "Trabajadores" quedaron tres botones con dibujo y dos sin
// el, a cinco lineas de distancia. Eso se lee como que los dos ultimos
// estan rotos, que es la conclusion equivocada.
//
// Un dibujo ausente es una afirmacion: "esto todavia no se ilustro". Con
// parte de la lista ilustrada, la afirmacion es falsa y la persona tiene
// que deducir cual de las dos cosas es.
//
// SI NO HAY ICONO, NO SE DIBUJA NADA
// ---------------------------------
// El respaldo sigue siendo este, para el dia que se agregue una vista
// nueva: sale solo con su texto, sin un hueco raro donde deberia estar
// el dibujo. Pero la lista de arriba esta completa a proposito.

const ICONOS_MENU={
  'nuevo-trabajador':'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'listado-trabajadores':'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'asistencia':'<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  'aprobar-cambio':'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  'relojes':'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'kit':'<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 13h6"/><path d="M9 17h4"/>',
  'porteria':'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><path d="M8 11h6"/><path d="M11 8v6"/>',
  'tarja':'<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h2"/><path d="M14 14h2"/><path d="M8 18h2"/><path d="M14 18h2"/>',
  'marcaje':'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="3" y1="12" x2="6" y2="12"/><polyline points="4 10 3 12 4 14"/>',
  'justificar':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13l-4 4-2 .5.5-2 4-4z"/>',
  'excel':'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'asignar-supervisor':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
  'carga-csv-trabajadores':'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'buscar-tarjeta':'<rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
  'imprimir-tarjetas':'<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  'just-diaria':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>',
  'auditoria':'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/>',
  'exportar':'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  'solicitar-cambio':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>',
  'marcajes':'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  'plantillas-kit':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M17 14l-3 3-1.5.5.5-1.5 3-3z"/>',
  'soporte':'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'invitar-usuario':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
  'mi-perfil':'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'usuarios':'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'permisos':'<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  'empresa':'<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="7" x2="9" y2="7.01"/><line x1="15" y1="7" x2="15" y2="7.01"/><line x1="9" y1="12" x2="9" y2="12.01"/><line x1="15" y1="12" x2="15" y2="12.01"/><line x1="10" y1="22" x2="10" y2="18"/><line x1="14" y1="22" x2="14" y2="18"/>',
  'alertas-sociales':'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  'indicaciones-sociales':'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/><line x1="19" y1="5" x2="19" y2="9"/><line x1="17" y1="7" x2="21" y2="7"/>',
  'alertas-prevencion':'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'indicaciones-prevencion':'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="13" x2="12" y2="9"/><polyline points="9 11 12 8 15 11"/>',
  'bodega-epp':'<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/>',
  'bodega-historial':'<path d="M2 18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1"/><line x1="17" y1="9" x2="21" y2="9"/><line x1="17" y1="13" x2="21" y2="13"/><line x1="17" y1="17" x2="21" y2="17"/>',
  'bodega-epp-catalogo':'<path d="M2 18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1"/><circle cx="16" cy="16" r="4"/><line x1="19" y1="19" x2="21" y2="21"/>',
  'bodega-kits':'<rect x="3" y="7" width="18" height="13" rx="2" ry="2"/><path d="M3 11h18"/><rect x="12" y="3" width="9" height="4" rx="1"/><path d="M12 3v4"/>',
  'bodega-kits-admin':'<rect x="3" y="7" width="18" height="13" rx="2" ry="2"/><path d="M3 11h18"/><rect x="9" y="13" width="6" height="4" rx="1"/><path d="M10 13v-1a2 2 0 0 1 4 0v1"/>',
  'bodega-catalogo':'<rect x="3" y="7" width="18" height="13" rx="2" ry="2"/><path d="M3 11h18"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="8" y1="18" x2="12" y2="18"/>',
  'bodega-asignar':'<rect x="3" y="7" width="18" height="13" rx="2" ry="2"/><path d="M3 11h18"/><polyline points="9 18 12 15 15 18"/><line x1="12" y1="15" x2="12" y2="11"/>',
  'bodega-qr':'<path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/><line x1="6" y1="12" x2="6" y2="12.01"/><line x1="14" y1="12" x2="14" y2="12.01"/>',
  'supervisores':'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'sup-diaria':'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M5 19a4 4 0 0 1 0-8"/>',
  'conciliacion':'<circle cx="9" cy="12" r="8"/><polyline points="9 8 9 12 12 13.5"/><circle cx="17" cy="12" r="8"/><polyline points="17 16 17 12 20 10.5"/>',
  'avisos-mios':'<rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><polyline points="2 7 12 13 22 7"/><circle cx="19" cy="19" r="4"/><polyline points="19 16.5 19 19 21 19.8"/>',
  'avisos-dia':'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  'importar-excel':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 18 12 15 15 18"/><line x1="12" y1="15" x2="12" y2="10"/>',
  'marcar-entrada':'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><polyline points="7 12 5 12 6 10"/>',
  'marcar-avisar':'<circle cx="10" cy="12" r="8"/><polyline points="10 8 10 12 13.5 13.5"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>'
};

// Devuelve el SVG del icono de una clave, o una cadena vacia si no hay.
//
// La cadena vacia es la respuesta correcta para algo sin icono: sale solo
// el texto, sin un hueco raro donde deberia estar el dibujo. Pero la lista
// de arriba esta completa a proposito: dentro de una lista, tres botones
// con dibujo y dos sin el se leen como que los dos ultimos estan rotos.
function iconoMenu(clave){
  const d=ICONOS_MENU[clave];
  if(!d)return '';
  return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+d+'</svg>';
}

// Le pone el icono a las pestanas de las vistas.
//
// POR QUE HAY QUE HACERLO DESDE AQUI Y NO ESCRIBIRLO EN EL HTML
// ------------------------------------------------------------------
// Las pestanas son HTML plano: el texto esta en el archivo, sin una
// plantilla alrededor. Si se escribe "${iconoMenu(...)}" ahi adentro, el
// navegador no lo resuelve: lo pinta tal cual, y en la pantalla sale la
// llamada entera como texto.
//
// En el submenu y en el menu principal si funciona, porque esos se arman
// con plantillas. Mismo codigo, bien de un lado y mal del otro, y la
// unica diferencia es de donde viene el HTML.
//
// SOLO UNA VEZ: si ya hay un svg, no se agrega otro. Esta funcion se
// llama al cambiar de pestana tambien, y sin esa guarda el icono se
// duplicaria a la segunda.
function ponerIconosEnPestanas(){
  document.querySelectorAll('button[data-attendance-tab],button[data-sup-tab]').forEach(b=>{
    if(b.querySelector('svg.ico'))return;
    const svg=iconoMenu(b.dataset.attendanceTab||b.dataset.supTab);
    if(!svg)return;
    b.insertAdjacentHTML('afterbegin',svg);
  });
}

// Se llama de inmediato. El script va despues del HTML en el archivo, asi que
// cuando corre las pestanas ya existen: no hace falta esperar a la base ni
// a que se abra la vista. La funcion es idempotente, por eso tambien se
// puede volver a llamar sin que el icono se duplique.
ponerIconosEnPestanas();






const navGroups = {
  porteria: [{v:'porteria',label:'Consultar trabajador'}],
  administracion: [
    {v:'nuevo-trabajador',label:'Trabajadores',options:[
      {v:'nuevo-trabajador',label:'Agregar trabajador'},
      {v:'listado-trabajadores',label:'Listado de trabajadores'},
      {v:'asignar-supervisor',label:'Asignar supervisor'},
      {v:'carga-csv-trabajadores',label:'Carga masiva CSV'},
      {label:'Tarjeta',children:[
        {v:'buscar-tarjeta',label:'Buscar tarjeta'},
        {v:'imprimir-tarjetas',label:'Imprimir varias tarjetas'}
      ]}
    ]},
    {v:'asistencia',label:'Asistencia mensual',options:[
      {v:'asistencia',label:'Tarja mensual'},
      {v:'just-diaria',label:'Justificación diaria'},
      {v:'auditoria',label:'Bitácora de asistencia'},
      {v:'exportar',label:'Exportar remuneraciones'}
    ]},
    // Aprobaciones y estados: los dos caminos para cambiar un estado de la
    // tarja, juntos. Antes estaban sueltos y en cualquier orden, lo que
    // hacía fácil apretar el que no era: solicitar un cambio que uno mismo
    // puede aprobar, o buscar dónde se aprueban las solicitudes.
    {v:'aprobar-cambio',label:'Aprobaciones y estados',options:[
      {v:'solicitar-cambio',label:'Solicitar cambio de estado'},
      {v:'aprobar-cambio',label:'Aprobar solicitudes'}
    ]},
    // Y POR QUÉ "RELOJES" Y "MARC AJES" SON DOS DESPLEGABLES Y NO UNO
    //
    // Porque estaban juntos dentro de "Relojes y centros de costo", y con el
    // Tótem apagado quedaba un desplegable que se llamaba "Relojes" y adentro solo
    // tenía "Marcajes". Se veía el nombre del módulo apagado en el menú, que es
    // justo lo que se quería que no se viera.
    //
    // Y NO ES SOLO COSA DEL NOMBRE: mientras "marcajes" esté dentro del grupo de
    // "relojes", apagar el Tótem por módulo no alcanza. El desplegable sobrevive
    // porque tiene un hijo vivo, y el nombre del padre —el del aparato— queda
    // arriba. Medido en el navegador.
    //
    // Y QUÉ PASA CON "RELOJES" CUANDO ESTÁ APAGADO
    //
    // El desplegable se cae solo: "filtrarNavItems" saca los grupos que se quedan
    // sin nada adentro. Con el Tótem apagado, no aparece nada en su lugar, y no
    // hace falta poner un cartel diciendo "aquí iría el reloj". Cuando se encienda
    // el módulo, el desplegable vuelve a aparecer solo, sin tocar el código.
    {v:'relojes',label:'Relojes y centros de costo',options:[
      {v:'relojes',label:'Relojes'}
    ]},
    {v:'marcajes',label:'Marcajes',options:[
      {v:'marcajes',label:'Marcajes del sistema'}
    ]},
    // Y POR QUÉ "CONTRATACIÓN Y PLANTILLAS" Y NO "KIT DE CONTRATACIÓN"
//
// Porque "kit" es la palabra interna del código, y la pantalla no muestra
// código. "Contratación y plantillas" dice las dos cosas que hay adentro: los
// papeles que se entregan, y las plantillas con las que se arman.
//
// Y el submenú se parte en tres, no en dos, porque la vista de plantillas ya
// tiene pestañas propias —plantillas, firmados, campos y datos, timbre— y el
// desplegable mostraba solo dos cosas de cuatro.
{v:'kit',label:'Contratación y plantillas',options:[
      {v:'kit',label:'Papeles del trabajador'},
      {v:'plantillas-kit',label:'Plantillas, firmados y campos'}
    ]},
    {v:'porteria',label:'Consultar trabajador'}
  ],
  soporte: [
    {v:'soporte',label:'Centro de soporte'},
    {v:'invitar-usuario',label:'Invitar usuario',options:[
      {v:'invitar-usuario',label:'Invitar usuario'}
    ]},
    // "Mis datos" va suelto, no dentro del desplegable de invitar: si
    // alguien no tiene permiso para invitar, el desplegable quedaría
    // vacío y su título mentiría sobre lo que hay adentro.
    {v:'mi-perfil',label:'Mis datos'},
    {v:'soporte',label:'Configuración',options:[
      {v:'usuarios',label:'Usuarios'},
      {v:'permisos',label:'Permisos por rol'},
      {v:'empresa',label:'Datos de empresa'}
    ]},
    // Empresas: qué oficios maneja cada una, qué grupos de cargos existen, y
    // qué puede ver esta empresa. Va suelto y no dentro de Configuración porque
    // la pregunta que contesta no es "cómo se configura el sistema" sino "qué
    // trabaja esta empresa", que es de RRHH y se pregunta seguido.
    {v:'empresas-cargos',label:'Empresas: cargos y permisos'}
  ],
  'asistente-social': [
    {v:'alertas-sociales',label:'Alertas'},
    {v:'indicaciones-sociales',label:'Agregar indicaciones para trabajadores'}
  ],
  prevencion: [
    {v:'alertas-prevencion',label:'Alertas'},
    {v:'indicaciones-prevencion',label:'Agregar indicaciones para trabajadores'}
  ],
  bodega: [
    {v:'bodega-epp',label:'EPP ▾',options:[
      {v:'bodega-epp',label:'Entrega de EPP / materiales'},
      {v:'bodega-historial',label:'Historial de entregas EPP'},
      {v:'bodega-epp-catalogo',label:'Catálogo de EPP'}
    ]},
    {v:'bodega-kits',label:'Kits ▾',options:[
      {v:'bodega-kits',label:'Asignar y entregar'},
      {v:'bodega-kits-admin',label:'Administrar kits'}
    ]},
    {v:'bodega-catalogo',label:'Herramientas ▾',options:[
      {v:'bodega-catalogo',label:'Catálogo de herramientas'},
      {v:'bodega-asignar',label:'Asignar herramienta a trabajador'},
      {v:'bodega-qr',label:'QR / Etiquetas'}
    ]}
  ],
  supervisores: [{v:'supervisores',label:'Supervisores',options:[
    {v:'supervisores',label:'Equipos y tarja'},
    {v:'sup-diaria',label:'Asistencia diaria'}
  ]},
  {v:'solicitar-ingreso',label:'Solicitar ingreso'}]
};
// ===================================================================
// EL INGRESO PENDIENTE

// ============================================================
// Sin esta pantalla, la bitácora se llenaría y nadie podría revisarla: el
// papel de "guardar el rastro" estaría cumplido y el de "poder comprobarlo" no.
//
// No hay botones para corregir ni borrar nada, a propósito. Si un cambio está
// mal, la forma de arreglarlo es hacer OTRO cambio con su motivo. Es lo que hace
// que la bitácora sirva: si se pudiera editar, "quién cambió qué" dejaría de
// ser una pregunta con respuesta.
//
// Se lee por páginas de 200. Alguien que corrige mucho genera miles de trazas, y
// traerlas todas de una vez hace la app lenta sin agregar nada.
const AUD_PAGINA=200;
let auditoriaTrazas=[];
let auditoriaCargada=false;
let auditoriaTotal=0;
let auditoriaError='';
async function initAuditoria(){
  const hoy=hoyLocal();
  const desde=document.getElementById('audDesde');
  const hasta=document.getElementById('audHasta');
  // Un mes para atrás por omisión: es donde está el trabajo del mes en curso, y un
  // rango enorme solo muestra ruido de hace un año.
  if(!desde.value)desde.value=isoLocal(new Date(new Date(hoy+'T12:00:00').getTime()-30*86400000));
  if(!hasta.value)hasta.value=hoy;
  fillAuditoriaFiltros();
  await loadAuditoria();
}
function fillAuditoriaFiltros(){
  const sel=document.getElementById('audWorker');
  const anterior=sel.value;
  const vis=codigosVisibles(workers);
  sel.innerHTML='<option value="">Todos los trabajadores</option>'+
    workers.slice().sort((a,b)=>compararPorCodigo(a.code,b.code)||a.name.localeCompare(b.name))
      .map(w=>'<option value="'+escHtml(w.code)+'">'+escHtml((vis.get(w.code)||codigoMostrar(w.code))+' — '+w.name)+'</option>').join('');
  if([...sel.options].some(o=>o.value===anterior))sel.value=anterior;
  // El filtro de "quién lo hizo" se arma con lo que hay en las trazas ya leídas, no
  // con los usuarios del sistema: casi todos los administradores no han tocado la
  // asistencia, y ofrecerlos sería ruido.
  const us=document.getElementById('audUsuario');
  const prev=us.value;
  const nombres=[...new Set(auditoriaTrazas.map(t=>t.usuario_nombre||'(sin nombre)'))].sort();
  us.innerHTML='<option value="">Todos</option>'+nombres.map(n=>'<option value="'+escHtml(n)+'">'+escHtml(n)+'</option>').join('');
  if([...us.options].some(o=>o.value===prev))us.value=prev;
}
async function loadAuditoria(){
  const lista=document.getElementById('audLista');
  const aviso=document.getElementById('audAviso');
  lista.innerHTML='<small>Cargando…</small>';
  aviso.innerHTML='';
  auditoriaError='';
  let q=window.supabaseClient.from('asistencia_auditoria').select('*')
    .order('created_at',{ascending:false}).limit(AUD_PAGINA);
  const desde=document.getElementById('audDesde').value;
  const hasta=document.getElementById('audHasta').value;
  if(desde)q=q.gte('fecha',desde);
  if(hasta)q=q.lte('fecha',hasta);
  const {data,error}=await q;
  if(error){
    // Sin la 028 no hay tabla. Decirlo claro, con el nombre de la migración: el
    // error de la base es "relation does not exist", que no le dice a nadie qué
    // hacer.
    const falta=errorEsAuditoriaSinMigrar(error);
    auditoriaError=falta
      ?'La bitácora todavía no existe en la base de datos. Aplicá la migración 028_auditoria_asistencia.sql y volvé a abrir esta pantalla.'
      :error.message;
    lista.innerHTML='';
    aviso.innerHTML='<div style="background:var(--warn-surface);border:1px solid var(--warn);color:var(--warn-ink);padding:10px 12px;border-radius:8px">'+
      '<b>No se pudo leer la bitácora.</b> <small>'+escHtml(auditoriaError)+'</small></div>';
    auditoriaTrazas=[];
    auditoriaCargada=true;
    document.getElementById('audResumen').innerHTML='';
    document.getElementById('audMas').innerHTML='';
    return;
  }
  auditoriaTrazas=data||[];
  auditoriaCargada=true;
  fillAuditoriaFiltros();
  renderAuditoria();
}
// ------------------------------------------------------------------
// LA BITÁCORA COMO TABLA
// ------------------------------------------------------------------
//
// Y "w" puede ser null: una traza de alguien que ya no está en "workers", porque se
// desvinculó o porque la persona que la está viendo no tiene acceso a su empresa. Y en ese
// caso la fila sale igual, con guiones en vez de datos inventados. Ver [bit-03].
//
function filaAuditoriaHtml(t,nombreDe,w){
  const fecha=t.fecha?String(t.fecha).slice(0,10):'—';
  const etiqueta={inserta:'Alta',actualiza:'Cambio',borra:'Borrado'}[t.accion]||t.accion;
  const cambios=[];
  if(String(t.estado_anterior)!==String(t.estado_nuevo)){
    cambios.push('estado <b>'+escHtml(estadoTexto(t.estado_anterior))+'</b> → <b>'+escHtml(estadoTexto(t.estado_nuevo))+'</b>');
  }
  if(String(t.hora_llegada_anterior||'')!==String(t.hora_llegada_nuevo||'')){
    cambios.push('hora '+(t.hora_llegada_anterior?escHtml(String(t.hora_llegada_anterior).slice(0,5)):'—')
      +' → '+(t.hora_llegada_nuevo?escHtml(String(t.hora_llegada_nuevo).slice(0,5)):'—'));
  }
  if(String(t.origen_anterior)!==String(t.origen_nuevo)){
    cambios.push('origen '+escHtml(t.origen_anterior||'—')+' → '+escHtml(t.origen_nuevo||'—'));
  }
  if(!cambios.length)cambios.push('<span class="audSinCambio">se guardó el mismo valor</span>');
  const emp=w?empresaData(w).nombre:null;
  const centro=w?nombreCentroCosto(w.centro_costo_id):null;
  const grupo=w?nombreDeGrupo(grupoDeCargo(w.especialidad_clave||'')):'';
  return '<tr>'+
    '<td class="audFecha">'+escHtml(fecha)+'</td>'+
    '<td class="audCod"><b>'+escHtml(codigoMostrar(t.code))+'</b></td>'+
    '<td class="audNombre">'+escHtml(nombreDe(t.code))+'</td>'+
    '<td class="audEmp">'+escHtml(emp||'—')+'</td>'+
    '<td class="audCentro">'+escHtml(centro||'—')+'</td>'+
    '<td class="audGrupo">'+escHtml(grupo||'—')+'</td>'+
    '<td><span class="audAccion audAccion_'+escHtml(t.accion)+'">'+escHtml(etiqueta)+'</span></td>'+
    '<td class="audCambio">'+cambios.join('<br>')+'</td>'+
    '<td class="audMotivo">'+escHtml(t.motivo)+'</td>'+
    '<td class="audQuien">'+escHtml(t.usuario_nombre||'(sin nombre)')+
      (t.usuario_rol?" <small>("+escHtml(t.usuario_rol)+")</small>":"")+'</td>'+
  '</tr>';
}

// Y el encabezado de la tabla, una vez. Se cuenta y se dice: si el filtro cortó a la mitad,
// saber cuántas hay de las que se ven y cuántas de todas es lo primero que se pregunta.
function audTablaHtml(filas,nombreDe){
  return '<div class="audTablaCaja"><table class="audTabla"><thead><tr>'+
    ['Día','Código','Trabajador','Empresa','Centro de costo','Grupo','Tipo','Qué cambió','Motivo','Quién']
      .map(function(h){return '<th>'+escHtml(h)+'</th>';}).join('')+
    '</tr></thead><tbody>'+
    filas.map(function(t){return filaAuditoriaHtml(t,nombreDe,workers.find(function(x){return x.code===t.code;})||null);}).join('')+
  '</tbody></table></div>';
}

// Y los tres desplegables nuevos de la bitácora. Se llenan acá y no en el HTML porque
// dependen de lo que hay cargado.
function llenarFiltrosAuditoria(){
  const selEmpresas=document.getElementById('audEmpresa');
  if(selEmpresas){
    const previo=selEmpresas.value;
    const permitidas=(Array.isArray(empresas)?empresas:[]).filter(function(e){return veTodasLasEmpresas()||misEmpresas.includes(e.id);});
    selEmpresas.innerHTML='<option value="">Todas</option>'
      +'<option value="__none__">Sin empresa</option>'
      +permitidas.map(function(e){return '<option value="'+e.id+'">'+escHtml(e.nombre)+'</option>';}).join('');
    if([...selEmpresas.options].some(function(o){return o.value===previo;}))selEmpresas.value=previo;
  }
  const centro=document.getElementById('audCentro');
  if(centro){
    const previo=centro.value;
    centro.innerHTML='<option value="">Todos</option>'
      +'<option value="__none__">Sin centro</option>'
      +(Array.isArray(centrosCosto)?centrosCosto:[]).filter(function(c){return c.activo!==false;})
        .map(function(c){return '<option value="'+c.id+'">'+escHtml(c.nombre)+'</option>';}).join('');
    if([...centro.options].some(function(o){return o.value===previo;}))centro.value=previo;
  }
  const grupo=document.getElementById('audGrupo');
  if(grupo){
    const previo=grupo.value;
    const vistos=[];
    (Array.isArray(jerarquiaCargos)?jerarquiaCargos:[]).forEach(function(h){
      if(h.grupo&&vistos.indexOf(h.grupo)<0)vistos.push(h.grupo);
    });
    grupo.innerHTML='<option value="">Todos</option>'
      +vistos.map(function(g){return '<option value="'+escHtml(g)+'">'+escHtml(nombreDeGrupo(g))+'</option>';}).join('');
    if([...grupo.options].some(function(o){return o.value===previo;}))grupo.value=previo;
  }
}

function renderAuditoria(){
  llenarFiltrosAuditoria();
  if(!auditoriaCargada)return;
  const worker=document.getElementById('audWorker').value;
  const usuario=document.getElementById('audUsuario').value;
  const accion=document.getElementById('audAccion').value;
  const vis=codigosVisibles(workers);
  const nombreDe=c=>{
    const w=workers.find(x=>x.code===c);
    return w?((vis.get(c)||codigoMostrar(c))+' — '+w.name):codigoMostrar(c);
  };
  // Y los cuatro nuevos. El código acepta el número con y sin ceros, igual que el listado
  // de trabajadores: si la columna muestra 0021, escribir "21" tiene que encontrarlo.
  const codBusca=((document.getElementById('audCodigo')||{}).value||'').trim().toLowerCase();
  const audEmpresa=(document.getElementById('audEmpresa')||{}).value||'';
  const audCentro=(document.getElementById('audCentro')||{}).value||'';
  const audGrupo=(document.getElementById('audGrupo')||{}).value||'';

  const filas=auditoriaTrazas.filter(function(t){
    if(worker&&t.code!==worker)return false;
    if(usuario&&(t.usuario_nombre||'(sin nombre)')!==usuario)return false;
    if(accion&&t.accion!==accion)return false;
    if(codBusca){
      const c=String(t.code||'').toLowerCase();
      const cl=codigoMostrar(t.code).toLowerCase();
      const w=workers.find(function(x){return x.code===t.code;});
      if(!(c.includes(codBusca)||cl.includes(codBusca)||(w&&String(w.name||'').toLowerCase().includes(codBusca))))return false;
    }
    // Y los tres que salen de la ficha, y por eso el aviso de arriba. Ver [bit-01].
    if(audEmpresa||audCentro||audGrupo){
      const w=workers.find(function(x){return x.code===t.code;});
      if(!w)return false;   // y sin ficha no hay con qué comparar: no entra
      if(audEmpresa){
        if(audEmpresa==='__none__'){if(w.empresa_id)return false;}
        else if(!mismoId(w.empresa_id,audEmpresa))return false;
      }
      if(audCentro){
        if(audCentro==='__none__'){if(w.centro_costo_id)return false;}
        else if(!mismoId(w.centro_costo_id,audCentro))return false;
      }
      if(audGrupo&&grupoDeCargo(w.especialidad_clave||'')!==audGrupo)return false;
    }
    return true;
  });
  auditoriaTotal=filas.length;

  // El resumen cuenta lo que se ve, y el total de lo que se cargó. Sin el
  // total, si filtrás por un trabajador ves "3 cambios" y no sabes si son 3 de 3
  // o 3 de 900.
  document.getElementById('audResumen').innerHTML=
    '<b>'+filas.length+'</b> de '+auditoriaTrazas.length+' traza(s) cargadas'+
    (auditoriaTrazas.length>=AUD_PAGINA?' <small>(se muestran las '+AUD_PAGINA+' más recientes; hay más)</small>':'');

  if(!filas.length){
    document.getElementById('audLista').innerHTML='<small>'+
      (auditoriaError||'No hay cambios con esos filtros')+(auditoriaTrazas.length&&!auditoriaError?'. Probá con "Todos".':'')+'</small>';
    document.getElementById('audMas').innerHTML='';
    return;
  }
  document.getElementById('audLista').innerHTML=audTablaHtml(filas,nombreDe);
  document.getElementById('audMas').innerHTML=auditoriaTrazas.length>=AUD_PAGINA
    ?'<small>Para ver más, acotá el rango de fechas.</small>':'';
}
function estadoTexto(v){
  if(v===null||v===undefined||v==='')return 'sin marca';
  const e=ESTADOS_TARJA.find(x=>x.v===v);
  return e?e.t:v;
}

// ============================================================
// ¿ESTÁ PUESTA LA BITÁCORA DE AUDITORÍA?

// ============================================================
// La 028 pone el motivo obligatorio. Si no está aplicada, la app sigue
// funcionando: `saveAttendanceState` detecta el error y avisa. Pero es
// importante que se diga de entrada, y no la primera vez que alguien
// corrige una asistencia.
//
// El detalle: sin la 028 los cambios NO quedan registrados, y la app
// parece funcionar igual. Ese es el peor caso, porque nadie se entera.
async function comprobarAuditoria(){
  try{
    const {data,error}=await window.supabaseClient.rpc('diagnostico_auditoria');
    if(error){
      mostrarAvisoPermisos('⚠️ La bitácora de auditoría de la asistencia NO está puesta: falta aplicar la migración 028_auditoria_asistencia.sql. '+
        'Mientras tanto, los cambios manuales a la tarja se guardan sin dejar rastro de quién los hizo ni por qué.');
      return;
    }
    const d=Array.isArray(data)?data[0]:data;
    if(!d)return;
    const problemas=[];
    if(!d.existe_bitacora)problemas.push('no existe la tabla');
    if(!d.disparador_puesto)problemas.push('falta el disparador');
    if(!d.motivo_obligatorio)problemas.push('el motivo no es obligatorio');
    if(!d.inalterable)problemas.push('las trazas se podrían modificar o borrar');
    if(problemas.length){
      mostrarAvisoPermisos('⚠️ La bitácora de auditoría está incompleta ('+problemas.join(', ')+'). Vuelve a aplicar la migración 028_auditoria_asistencia.sql.');
    }
  }catch(error){
    console.info('No se pudo comprobar la bitácora:',error.message);
  }
}

// ============================================================
// MODAL DE SOLICITUD DE CAMBIO (vista de supervisores)
// Al hacer clic en un día se abre esta ventana: se elige el estado
// nuevo y se escribe el detalle. Se guarda como solicitud y queda
// pendiente de que RRHH la apruebe; la tarja no cambia todavía.
// ============================================================
let modalCtx=null;   // {code, fecha, estadoActual, modo}

// Quién puede cambiar la tarja sin pasar por una aprobación.
//
// El permiso "tarja.editar" alcanza para que un rol sea editor, pero si
// esa persona además puede SOLICITAR cambios, significa que su trabajo es
// pedir el cambio y que otro lo revise: en ese caso siempre es una
// solicitud, nunca una modificación directa. Ese era el caso del
// supervisor, que además tenía el rol "oficina" y terminaba editando la
// tarja él mismo.
//
// Se aplica solo a quien no tiene "tarja.aprobar_cambio": RRHH y
// administración, que son los que resuelven, sí editan directamente.
function puedeEditarTarjaDirectamente(){
  if(soyAdmin())return true;
  if(puede('tarja.aprobar_cambio'))return true;
  if(!puede('tarja.editar'))return false;
  return !puede('tarja.solicitar_cambio');
}
function abrirModalSolicitud(cell){
  const code=decodeURIComponent(cell.dataset.code);
  const fecha=cell.dataset.date;
  const supCode=document.getElementById('sup-view')?document.getElementById('sup-view').value:'';
  // un supervisor no puede pedir cambios fuera de su gente
  if(miCodigoSupervisor&&workers.find(w=>w.code===code).supervisor_code!==miCodigoSupervisor){
    alert('Ese trabajador no está a tu cargo. Solo puedes pedir cambios para tu equipo.');
    return;
  }
  if(miCodigoSupervisor&&supCode&&!soySupervisorDeEsteEquipo(supCode))return;
  abrirModal(code,fecha,'supervisores');
}

function abrirModalTodosLosDias(){
  const supCode=document.getElementById('sup-view').value;
  if(!supCode){alert('Selecciona un supervisor.');return;}
  if(!soySupervisorDeEsteEquipo(supCode)){alert('Ese equipo no es el tuyo.');return;}
  const equipo=equipoDe(supCode);
  if(!equipo.length){alert('Ese supervisor no tiene trabajadores a cargo.');return;}
  // se pide sobre el primero para elegir la fecha exacta en la ventana
  abrirModal(equipo[0].code,hoyLocal(),'rango');
  const caja=document.getElementById('solModalQuien');
  caja.innerHTML+=` <br><small>Solicitud para un día del equipo. Elige el día en la tarja y haz clic de nuevo.</small>`;
}

function abrirModal(code,fecha,modo){
  const w=workers.find(x=>x.code===code);
  if(!w)return;
  // el ámbito se revalida acá y también al enviar: el modal nunca debe
  // quedar abierto para alguien fuera del equipo, se llegue como se llegue
  if(miCodigoSupervisor&&w.supervisor_code!==miCodigoSupervisor){
    alert(w.name+' no está a tu cargo. Solo puedes pedir cambios para tu equipo.');
    return;
  }
  const est=estadoDe(code,fecha);
  modalCtx={code,fecha,estadoActual:est,modo:modo||'supervisores'};

  document.getElementById('solModalQuien').innerHTML=
    `<b>${escHtml(w.name)}</b> · código ${escHtml(codigoMostrar(w.code))} · <b>${escHtml(fecha)}</b>`;
  document.getElementById('solModalActual').innerHTML=
    `Estado actual: <b>${escHtml(est||'sin registro')}</b>`+
    (est?` <small>${escHtml((ESTADOS_TARJA.find(e=>e.v===est)||{t:''}).t)}</small>`:'');

  // los estados posibles: todos menos el que ya tiene
  document.getElementById('solModalEstados').innerHTML=ESTADOS_TARJA.map(e=>
    `<button type="button" class="solChip" data-estado="${e.v}" onclick="elegirEstadoModal('${e.v}')">
       <span class="sig">${e.v}</span><span class="det">${e.t.split('—')[1]?e.t.split('—')[1].trim():e.t}</span>
     </button>`).join('');

  document.getElementById('solModalMotivo').value='';
  document.getElementById('solModalNota').value='';

  const edita=puedeEditarTarjaDirectamente();
  const puedePedir=puede('tarja.solicitar_cambio');
  const btnDirecto=document.getElementById('solModalEnviar');
  const btnSolicitar=document.getElementById('solModalSolicitar');
  // Quien puede aprobar tiene las dos acciones: aplicar el cambio ahora, o
  // dejarlo pendiente como si lo hubiera pedido otra persona. Antes solo
  // tenía "Guardar cambio", y por eso al probar el flujo como admin la cola
  // de aprobación quedaba siempre vacía.
  // "Guardar cambio" solo para quien puede aplicarlo; "Enviar a RRHH" para
  // quien puede pedirlo. Un supervisor ve únicamente el segundo.
  btnSolicitar.style.display=puedePedir?'':'none';
  btnDirecto.style.display=edita?'':'none';
  btnDirecto.textContent='Guardar cambio';
  document.getElementById('solModalAviso').innerHTML=edita
    ? (puedePedir
        ? '<b>Tienes las dos opciones.</b> "Guardar cambio" lo aplica al tiro. "Enviar a RRHH" lo deja pendiente, como si lo hubiera pedido un supervisor, para probar o para que lo revise otra persona.'
        : 'Tienes permiso de edición: el cambio se aplica de inmediato.')
    : 'Queda <b>pendiente</b> hasta que RRHH lo apruebe. La tarja no cambia por ahora. El motivo es lo primero que verá quien lo revise.';

  document.getElementById('solModal').classList.add('open');
  setTimeout(()=>document.getElementById('solModalMotivo').focus(),60);
}
function elegirEstadoModal(estado){
  modalCtx.estadoNuevo=estado;
  document.querySelectorAll('#solModalEstados .solChip').forEach(c=>
    c.classList.toggle('sel',c.dataset.estado===estado));
}
function cerrarModalSolicitud(){
  document.getElementById('solModal').classList.remove('open');
  modalCtx=null;
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(document.getElementById('solModal').classList.contains('open'))cerrarModalSolicitud();
  }
});
document.getElementById('solModal').addEventListener('click',e=>{
  if(e.target.id==='solModal')cerrarModalSolicitud();
});

// Cuando RRHH o la administración cambian un día a mano y ya había una
// solicitud pedida para ese mismo día, la solicitud se marca como
// resuelta: si se deja abierta, quedaría pidiendo un cambio que ya se hizo.
async function resolverPendienteSuperada(code,fecha,estadoAplicado){
  const abierta=solicitudes.find(s=>s.code===code&&s.fecha===fecha&&s.estado==='pendiente');
  if(!abierta)return;
  const coincide=abierta.estado_solicitado===estadoAplicado;
  const {data:sesion}=await window.supabaseClient.auth.getSession();
  const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
  const {error}=await window.supabaseClient.from('solicitudes_cambio_asistencia').update({
    estado:coincide?'aprobada':'rechazada',
    aplicado:coincide,
    resuelto_por:miId,
    resuelto_por_nombre:miNombrePerfil(),
    comentario_resolucion:coincide
      ? 'Aplicado directamente en la tarja.'
      : 'Se aplicó otro estado directamente en la tarja.',
    resuelto_at:new Date().toISOString()
  }).eq('id',abierta.id);
  if(error)console.warn('No se pudo cerrar la solicitud superada:',error.message);
}
// modo: 'directo' (aplicar el cambio ya) o 'solicitud' (dejarlo pendiente).
// Quien puede hacer las dos cosas elige con el botón que pulsó; el resto
// siempre acaba en 'solicitud'.
async function enviarDesdeModal(modo){
  if(!modalCtx)return;
  const {code,fecha,estadoActual}=modalCtx;
  const nuevo=modalCtx.estadoNuevo;
  const motivo=document.getElementById('solModalMotivo').value.trim();
  const nota=document.getElementById('solModalNota').value.trim();

  if(!nuevo){alert('Elige el estado que quieres solicitar.');return;}
  if(nuevo===estadoActual){alert('El estado elegido es el mismo que ya tiene.');return;}
  const edita=puedeEditarTarjaDirectamente();
  const directa=modo==='directo'&&edita;
  // El motivo es obligatorio cuando alguien más lo va a leer y decidir.
  if(!motivo&&!directa){alert('Escribe el detalle: es lo primero que verá RRHH para aprobar.');return;}
  if(!directa&&!exigirPermiso('tarja.solicitar_cambio','No tienes permiso para solicitar cambios de estado.'))return;
  // última comprobación del equipo, en el momento de escribir: si el modal
  // se abrió antes de que cambiara el equipo, aquí igual se frena
  const ficha=workers.find(x=>x.code===code);
  if(miCodigoSupervisor&&(!ficha||ficha.supervisor_code!==miCodigoSupervisor)){
    alert('Ese trabajador ya no está a tu cargo. La solicitud no se envió.');
    return;
  }

  const w=workers.find(x=>x.code===code);

  if(directa){
    if(!confirm(`Se guardará ${estadoActual||'sin registro'} → ${nuevo} para ${w.name} el ${fecha}.`))return;
    // Si escribió un motivo en el modal, se usa ese y no se pregunta otra
    // vez. Si no lo escribió, el motivo es obligatorio igual (la base lo
    // exige) y se abre el cuadro: preguntar dos veces lo mismo sería la
    // señal de que el primero no servía.
    const ok=await saveAttendanceState(code,fecha,nuevo,null,{
      motivo,
      nota:nota||(modalCtx.notaActual||''),
      titulo:'Por qué cambiás la asistencia'
    });
    if(!ok)return;
    // Si había una solicitud abierta para ese día, esta modificación la
    // deja resuelta: si no, seguiría pidiendo un cambio ya hecho.
    await resolverPendienteSuperada(code,fecha,nuevo);
    cerrarModalSolicitud();
    await loadSolicitudes(true);
    renderSolicitudes();
    renderMisSolicitudes();
    renderMatrix();
    return;
  }

  // Esto ya es una solicitud, así que sí importa que no haya otra abierta
  // para el mismo día: si no, se acumularían pedidos contradictorios.
  const pendiente=solicitudes.find(s=>s.code===code&&s.fecha===fecha&&s.estado==='pendiente');
  if(pendiente){
    alert('Ya hay una solicitud pendiente para ese día ('+(ESTADOS_TARJA.find(e=>e.v===pendiente.estado_solicitado)||{t:''}).t+'). Espera que RRHH la resuelva.');
    return;
  }

  if(!confirm(`Se enviará a RRHH la solicitud de ${estadoActual||'sin registro'} → ${nuevo} para ${w.name} el ${fecha}. La tarja no cambia hasta que la aprueben.`))return;
  const {data:sesion}=await window.supabaseClient.auth.getSession();
  const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
  const {error}=await window.supabaseClient.from('solicitudes_cambio_asistencia').insert({
    code,fecha,
    estado_actual:estadoActual||null,
    estado_solicitado:nuevo,
    motivo, nota:nota||null,
    estado:'pendiente',
    solicitado_por:miId,
    solicitado_por_nombre:miNombrePerfil(),
    solicitado_por_rol:misRoles.join(', ')
  });
  if(error){alert('No se pudo enviar la solicitud: '+error.message);return;}
  cerrarModalSolicitud();
  await loadSolicitudes(true);
  renderSolicitudes();
  renderMisSolicitudes();
  alert('Solicitud enviada a RRHH. La tarja no cambia hasta que la aprueben.');
}

// ============================================================
// SOLICITUDES DE CAMBIO DE ESTADO (F -> P, etc.)
// Supervisores y Técnica piden el cambio; RRHH aprueba o rechaza.
// Solo al aprobar se modifica la asistencia.
// ============================================================
let solicitudes=[];

const ESTADOS_TARJA=[{v:'X',t:'X — Presente'},{v:'F',t:'F — Falla'},{v:'P',t:'P — Permiso'},{v:'L',t:'L — Licencia'},{v:'A',t:'A — Accidente Mutual'},{v:'PP',t:'PP — Permiso Pagado'},{v:'V',t:'V — Vacaciones'},{v:'LL',t:'LL — Día lluvia'}];

let errorSolicitudes='';
async function loadSolicitudes(quiet){
  const {data,error}=await window.supabaseClient.from('solicitudes_cambio_asistencia')
    .select('*').order('created_at',{ascending:false}).limit(300);
  if(error){
    // Antes esto se callaba y la cola aparecía vacía, que es justo lo que
    // hace creer que "la solicitud no llegó". Ahora se muestra el motivo.
    errorSolicitudes=error.message||String(error);
    console.warn('No se pudieron cargar las solicitudes de cambio:',errorSolicitudes);
    renderAvisoSolicitudes();
    return;
  }
  errorSolicitudes='';
  solicitudes=data||[];
  renderAvisoSolicitudes();
}
// Si la tabla no existe o la consulta es rechazada, se dice en la vista
// en vez de dejar una lista vacía sin explicación.
function renderAvisoSolicitudes(){
  const cajas=[document.getElementById('solAviso'),document.getElementById('solAviso2')].filter(Boolean);
  if(!cajas.length)return;
  if(!errorSolicitudes){cajas.forEach(c=>{c.innerHTML='';c.style.display='none';});return;}
  const faltaTabla=/does not exist|schema cache/i.test(errorSolicitudes);
  cajas.forEach(box=>{
    box.style.display='';
    box.innerHTML=`<div style="background:var(--danger-surface);border:1px solid var(--danger);color:var(--danger);padding:10px 12px;border-radius:8px">
      <b>No se pudieron leer las solicitudes de cambio.</b><br>
      <small>${escHtml(errorSolicitudes)}</small><br>
      <small>${faltaTabla
        ? 'Falta la migración 013: ejecuta 013_roles_permisos.sql en el SQL Editor de Supabase.'
        : 'Si acabas de cambiar los roles o las políticas, ejecuta 016_permisos_coherentes.sql y recarga con Ctrl+F5.'}</small>
    </div>`;
  });
}
function estadoDe(code,fecha){
  const rec=attendance.find(a=>a.code===code&&a.date===fecha);
  return rec?rec.estado:'';
}
// Quien puede aprobar ve la cola en la misma vista donde envía, para no
// tener que andar entre dos menús. Y se le aclara qué puede hacer.
function initVistaSolicitar(){
  const puedeAprobar=puede('tarja.aprobar_cambio');
  const wrap=document.getElementById('solAprobarWrap');
  if(wrap)wrap.style.display=puedeAprobar?'':'none';
  const hint=document.getElementById('solPermisoHint');
  if(hint){
    hint.textContent=puedeAprobar
      ? 'Como puedes aprobar, la solicitud que envíes también aparecerá en la cola de aquí mismo para resolverla.'
      : 'Tu envío queda pendiente hasta que alguien con RRHH lo apruebe.';
  }
  renderAvisoSolicitudes();
}
function initSolicitarCambio(){
  const w=document.getElementById('sol-worker');
  if(w){
    const previo=w.value;
    w.innerHTML=workers.map(x=>`<option value="${escHtml(x.code)}">${escHtml(x.code+' - '+x.name)}</option>`).join('');
    if(workers.some(x=>x.code===previo))w.value=previo;
  }
  const f=document.getElementById('sol-fecha');
  if(f&&!f.value)f.value=hoyLocal();
  const sel=document.getElementById('sol-estado');
  if(sel&&!sel.options.length)sel.innerHTML=ESTADOS_TARJA.map(e=>`<option value="${e.v}">${e.t}</option>`).join('');
  actualizarEstadoActual();
}
function actualizarEstadoActual(){
  const code=document.getElementById('sol-worker').value;
  const fecha=document.getElementById('sol-fecha').value;
  const box=document.getElementById('sol-estadoActual');
  if(!box)return;
  const est=estadoDe(code,fecha);
  box.innerHTML=est
    ?`Estado actual: <b>${est}</b> · <small>${(ESTADOS_TARJA.find(e=>e.v===est)||{t:est}).t}</small>`
    :'Estado actual: <b>sin registro</b> (la jornada aparece vacía)';
  // el estado que ya tiene queda preseleccionado para que se vea el cambio
  const sel=document.getElementById('sol-estado');
  if(sel){
    if(!sel.options.length)sel.innerHTML=ESTADOS_TARJA.map(e=>`<option value="${e.v}">${e.t}</option>`).join('');
    if(est)sel.value=est;
  }
}
async function crearSolicitud(){
  if(!exigirPermiso('tarja.solicitar_cambio','No tienes permiso para solicitar cambios de estado.'))return;
  const code=document.getElementById('sol-worker').value;
  const fecha=document.getElementById('sol-fecha').value;
  const nuevo=document.getElementById('sol-estado').value;
  const motivo=document.getElementById('sol-motivo').value.trim();
  const nota=document.getElementById('sol-nota').value.trim();
  if(!code||!fecha||!nuevo){alert('Completa trabajador, fecha y el estado que solicitas.');return;}
  if(!motivo){alert('Escribe el motivo: es lo primero que verá RRHH para aprobar.');return;}
  const actual=estadoDe(code,fecha);
  if(actual===nuevo){alert('El estado solicitado es el mismo que ya tiene.');return;}
  const pendiente=solicitudes.find(s=>s.code===code&&s.fecha===fecha&&s.estado==='pendiente');
  if(pendiente){
    alert('Ya hay una solicitud pendiente para ese trabajador y fecha ('+(ESTADOS_TARJA.find(e=>e.v===pendiente.estado_solicitado)||{t:''}).t+'). Espira que RRHH la resuelva.');
    return;
  }
  const nombre=(workers.find(w=>w.code===code)||{}).name||code;
  if(!confirm(`¿Solicitar el cambio de "${actual||'sin registro'}" a "${nuevo}" para ${nombre} el ${fecha}? Queda pendiente hasta que RRHH lo apruebe.`))return;
  const {data:sesion}=await window.supabaseClient.auth.getSession();
  const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
  const {error}=await window.supabaseClient.from('solicitudes_cambio_asistencia').insert({
    code,fecha,
    estado_actual:actual||null,
    estado_solicitado:nuevo,
    motivo,
    nota:nota||null,
    estado:'pendiente',
    solicitado_por:miId,
    solicitado_por_nombre:miNombrePerfil()||nombre,
    // La columna se llama "solicitado_por_rol". Estaba escrita como
    // "solicitado_rol" y PostgreSQL rechazaba el INSERT entero con
    // "Could not find the 'solicitado_rol' column", así que un supervisor
    // no podía solicitar una justificación: el formulario fallaba al
    // enviar. El mensaje de error hablaba de la columna, no de que la
    // solicitud se había perdido, y por eso era difícil de entender.
    solicitado_por_rol:misRoles.join(', ')
  });
  if(error){alert('No se pudo crear la solicitud: '+error.message);return;}
  await loadSolicitudes(true);
  renderSolicitudes();
  renderMisSolicitudes();
  document.getElementById('sol-motivo').value='';
  document.getElementById('sol-nota').value='';
  alert('Solicitud enviada. RRHH tiene que aprobarla para que la tarja cambie.');
}
function miNombrePerfil(){
  return (miPerfil&&miPerfil.nombre)?miPerfil.nombre:'Usuario del sistema';
}
// Cuando la cola está vacía se explica por qué, porque si pruebas el flujo
// con tu propia cuenta de administración los cambios se aplican al tiro y
// nunca hay nada que aprobar: puede parecer que las solicitudes no llegan.
function sinNadaQueAprobar(){
  const puedeAprobar=puede('tarja.aprobar_cambio');
  return `<div class="kitResumen">
    <b>No hay solicitudes pendientes.</b><br>
    <small>Aquí llegan las peticiones de cambio de estado de los supervisores y técnicos: ellos no modifican la tarja, la piden y tú la apruebas.</small><br>
    <small>${puedeAprobar
      ? 'Si pruebas el flujo con <b>tu propia cuenta</b>, el cambio se aplica directamente y no queda nada en esta cola. Para ver el proceso completo, entra con una cuenta de supervisor, o usa el botón <b>"Enviar a RRHH"</b> del aviso de cambio de estado en vez de "Guardar cambio".'
      : 'Si acabas de pedir un cambio, vuelve a cargar la vista (Ctrl+F5).'}</small>
  </div>`;
}
function renderSolicitudes(){
  // la misma cola se muestra en "Aprobar solicitudes" y, si la persona
  // puede aprobar, tambien en "Solicitar cambio" para hacerlo en un solo lugar
  const cajas=[document.getElementById('solList'),document.getElementById('solList2')].filter(Boolean);
  if(!cajas.length)return;
  const pendientes=solicitudes.filter(s=>s.estado==='pendiente');
  const html=pendientes.length?pendientes.map(s=>{
    const w=workers.find(x=>x.code===s.code);
    return `<div class="kitAsigCard">
      <div class="headline">
        <span><b>${escHtml(s.code)}</b> ${w?escHtml(w.name):''} · ${escHtml(s.fecha)}</span>
        <span>${(ESTADOS_TARJA.find(e=>e.v===s.estado_actual)||{t:s.estado_actual||'sin registro'}).t}
          → <b style="color:var(--accent)">${(ESTADOS_TARJA.find(e=>e.v===s.estado_solicitado)||{t:s.estado_solicitado}).t}</b></span>
      </div>
      <div style="font-size:.82rem"><b>Motivo:</b> ${escHtml(s.motivo)}${s.nota?`<br><small>${escHtml(s.nota)}</small>`:''}</div>
      <div class="eppActions">
        <small>Pedido por ${escHtml(s.solicitado_por_nombre||'—')}${s.solicitado_por_rol?' ('+escHtml(s.solicitado_por_rol)+')':''} · ${new Date(s.created_at).toLocaleString('es-CL')}</small>
        <button class="btn" type="button" onclick="resolverSolicitud('${s.id}','aprobada')">Aprobar y aplicar</button>
        <button class="btn secondary" type="button" onclick="resolverSolicitud('${s.id}','rechazada')">Rechazar</button>
      </div>
    </div>`;
  }).join(''):sinNadaQueAprobar();
  cajas.forEach(el=>{el.innerHTML=html;});
  renderSolResueltas();
}
// El historial de resueltas estaba en el markup pero sin nada que lo
// llenara, por eso la tarjeta salia en blanco.
function renderSolResueltas(){
  const el=document.getElementById('solResueltas');
  if(!el)return;
  const resueltas=solicitudes.filter(s=>s.estado&&s.estado!=='pendiente').slice(0,50);
  if(!resueltas.length){el.innerHTML='<small>Todavia no hay solicitudes resueltas.</small>';return;}
  el.innerHTML=resueltas.map(s=>{
    const w=workers.find(x=>x.code===s.code);
    const ok=s.estado==='aprobada';
    const color=ok?'var(--accent)':'var(--danger)';
    return `<div class="list-item" style="cursor:default;align-items:flex-start;gap:8px">
      <span style="flex:1">
        <b>${ok?'OK':'NO'}</b> ${escHtml(s.fecha)} — <b>${escHtml(s.code)}</b> ${w?escHtml(w.name):''}:
        ${(ESTADOS_TARJA.find(e=>e.v===s.estado_actual)||{t:s.estado_actual||'—'}).t} →
        <b>${(ESTADOS_TARJA.find(e=>e.v===s.estado_solicitado)||{t:s.estado_solicitado}).t}</b>
        <b style="color:${color}"> · ${s.estado.toUpperCase()}</b>${s.aplicado?' <small>(aplicado a la tarja)</small>':''}
        <br><small>Motivo: ${escHtml(s.motivo||'—')}${s.comentario_resolucion?` · Respuesta: ${escHtml(s.comentario_resolucion)}`:''}</small>
        ${s.resuelto_por_nombre?`<br><small>Resuelto por ${escHtml(s.resuelto_por_nombre)} el ${new Date(s.resuelto_at).toLocaleString('es-CL')}</small>`:''}
      </span>
    </div>`;
  }).join('');
}
function renderMisSolicitudes(){
  const el=document.getElementById('misSolList');
  if(!el)return;
  const mias=solicitudes.slice(0,25);
  if(!mias.length){el.innerHTML='<small>Todavía no hay solicitudes.</small>';return;}
  el.innerHTML=mias.map(s=>{
    const w=workers.find(x=>x.code===s.code);
    const color=s.estado==='aprobada'?'var(--accent)':s.estado==='rechazada'?'var(--danger)':'var(--accent2)';
    return `<div class="list-item" style="cursor:default">
      <span>${s.fecha} — <b>${s.code}</b> ${w?w.name:''}:
        ${(ESTADOS_TARJA.find(e=>e.v===s.estado_actual)||{t:s.estado_actual||'—'}).t} →
        <b>${(ESTADOS_TARJA.find(e=>e.v===s.estado_solicitado)||{t:s.estado_solicitado}).t}</b>
        <small style="color:${color};font-weight:700"> · ${s.estado.toUpperCase()}</small>
        ${s.comentario_resolucion?`<br><small>${s.comentario_resolucion}</small>`:''}
      </span>
      <small>${new Date(s.created_at).toLocaleDateString('es-CL')}</small>
    </div>`;
  }).join('');
}
async function resolverSolicitud(id,decision){
  if(!exigirPermiso('tarja.aprobar_cambio','Solo RRHH puede aprobar o rechazar solicitudes.'))return;
  const s=solicitudes.find(x=>mismoId(x.id,id));
  if(!s)return;
  const comentario=(decision==='rechazada')?prompt('¿Por qué se rechaza? (queda registrado)','No cumple con el criterio'):'';
  if(decision==='rechazada'&&comentario===null)return;
  if(decision==='aprobada'){
    const w=workers.find(x=>x.code===s.code);
    if(!confirm(`Se aplicará el cambio a la tarja de ${w?w.name:s.code} el ${s.fecha}. ¿Confirmas?`))return;
  }
  const {data:sesion}=await window.supabaseClient.auth.getSession();
  const miId=sesion&&sesion.session&&sesion.session.user&&sesion.session.user.id;
  if(decision==='aprobada'){
    // Aplicar el cambio real en asistencia. Si falla, la solicitud NO se
    // marca aprobada: quedaría aprobada sin que el cambio estuviera hecho.
    //
    // El motivo ya está escrito: es lo que pidió el supervisor y viene con
    // la solicitud. No se vuelve a preguntar. Si se perdiera, la bitácora
    // tendría un cambio sin explicación al lado de una solicitud que sí la
    // tenía, que es la peor forma de perder el rastro.
    const motivo=(s.motivo||'').trim()
      ||'Solicitud de cambio aprobada por '+miNombrePerfil();
    const aplicado=await saveAttendanceState(s.code,s.fecha,s.estado_solicitado,null,{
      motivo,
      origen:'justificacion',
      nota:s.nota||s.motivo||'',
      titulo:'Por qué aprobás esta solicitud'
    });
    if(!aplicado){
      alert('No se pudo aplicar el cambio en la tarja. La solicitud sigue pendiente.');
      return;
    }
  }
  const {error}=await window.supabaseClient.from('solicitudes_cambio_asistencia').update({
    estado:decision,
    resuelto_por:miId,
    resuelto_por_nombre:miNombrePerfil(),
    comentario_resolucion:comentario||null,
    resuelto_at:new Date().toISOString(),
    aplicado:decision==='aprobada'
  }).eq('id',id);
  if(error){alert('No se pudo resolver la solicitud: '+error.message);return;}
  await loadSolicitudes(true);
  renderSolicitudes();
  renderMisSolicitudes();
  renderMatrix();
}

// ============================================================
// CONFIGURACIÓN DE PERMISOS POR ROL

// ===================================================================
//
// Con el encabezado pegajoso y el submenú por encima, al bajar el submenú le
// cruzaba por encima. El z-index ya está corregido en el CSS; esto es solo la
// parte de encoger.
//
// -------------------------------------------------------
// POR QUÉ UN UMBRAL Y NO "SI ESTOY ABAJO"
// -------------------------------------------------------
// Si se encogiera en cuanto el scroll pasa de 0, la primera línea de la
// página ya lo encogería, y al volver arriba habría que subir hasta el 0
// exacto para que crezca otra vez. Con dos umbrales separados, uno para
// encoger y otro más chico para crecer, hace falta bajar bastante para que
// crezca solo, y no queda pegado en el tamaño chico.
//
// -------------------------------------------------------
// UNA VEZ POR FRAME, NO UNA VEZ POR EVENTO
// -------------------------------------------------------
// El scroll dispara decenas de eventos por segundo. Con un rAF se espera a
// que el navegador termine de pintar y se decide una sola vez, que es lo que
// alcanza: entre un evento y el siguiente no cambió nada visible.
//
// Y solo se llama a classList.toggle cuando el valor cambia de verdad. Con
// toggle siempre, el navegador revisa las transiciones en cada evento, que es
// lo que hace que una barra pegajosa se sienta pesada en un computador viejo.
let navCompactoYa=false;
function marcarNavCompacto(){
  if(totemActual)return;   // con el reloj abierto la pantalla es de él
  const chico=window.scrollY>40;
  if(chico===navCompactoYa)return;
  navCompactoYa=chico;
  document.body.classList.toggle('nav-compacto',chico);
  // Y acá ya no hay nada que recalcular. Las tres barras están dentro de un
  // solo elemento pegajoso, así que cuando el encabezado se encoge el
  // contenedor se achica solo y todo baja junto. Lo único que hay que evitar
  // es que la transición del encabezado tape el contenido de golpe, y eso se
  // resuelve con un pouco de delay abajo.
}
function llenarDestinoPlantilla(p){
  // ------------------------------------------------------------------
  // A QUIÉN LE TOCA: TODOS, UN GRUPO, O UN CARGO
  // ------------------------------------------------------------------
  // Antes era un desplegable de oficios, y vacío significaba "a todos". Con una
  // columna sola no se puede decir "a todos los de OBRA", que es una charla
  // distinta de "a los MAESTROS" y las dos tienen que poder existir.
  //
  // Son dos columnas y no una con tres valores, porque "grupo obra" y "cargo
  // maestro" no son la misma clase de dato: el primero es un área y el segundo
  // es un oficio. Meterlos en un solo desplegable es lo mismo que antes, con
  // dos "General" distintos.
  //
  // Y las dos no pueden estar puestas a la vez. No es una preferencia: hay un
  // CHECK en la base que lo prohíbe, y es la base la que dice "esta charla es
  // del grupo obra Y del cargo maestro", que no significa nada.
  const elDestino=document.getElementById('plantillaDestino');
  if(elDestino){
    // El destino se deduce de lo que ya venía guardado. Una plantilla vieja
    // solo puede tener cargo, porque el grupo no existía.
    if(p&&p.grupo_clave)elDestino.value='grupo';
    else if(p&&p.especialidad_clave)elDestino.value='cargo';
    else elDestino.value='';
  }

  // El grupo, de la jerarquía que ya está cargada. Sin ella no se puede armar
  // la lista, y sin lista el desplegable queda con un solo "--" que no dice nada.
  const selGrupo=document.getElementById('plantillaGrupo');
  if(selGrupo){
    const grupos=[];
    const vistos={};
    jerarquiaCargos.forEach(f=>{
      if(!f.grupo||vistos[f.grupo])return;
      vistos[f.grupo]=1;grupos.push(f);
    });
    selGrupo.innerHTML=grupos.length
      ?grupos.map(f=>'<option value="'+escHtml(f.grupo)+'">'+escHtml(f.grupoNombre||f.grupo)+'</option>').join('')
      :'<option value="">— no hay grupos —</option>';
    selGrupo.value=p&&p.grupo_clave?p.grupo_clave:'';
  }

  // El cargo: TODOS los cargos, sin filtrar por grupo. Y es a propósito: el
  // destino de una charla se elige primero, y filtrar el segundo desplegable
  // por el primero sería obligar a elegir el grupo antes de saber si la charla
  // es de un cargo.
  const selCargo=document.getElementById('plantillaCargo');
  if(selCargo){
    const lista=jerarquiaCargos.slice()
      .sort((a,b)=>String(a.cargoNombre||a.cargo).localeCompare(String(b.cargoNombre||b.cargo)));
    selCargo.innerHTML=lista.length
      ?lista.map(f=>'<option value="'+escHtml(f.cargo)+'">'+escHtml(f.cargoNombre||f.cargo)+'</option>').join('')
      :'<option value="">— no hay cargos —</option>';
    selCargo.value=p&&p.especialidad_clave?p.especialidad_clave:'';
  }
  cambiarDestinoPlantilla();
}

function cambiarDestinoPlantilla(){
  const d=document.getElementById('plantillaDestino');
  const cg=document.getElementById('plantillaGrupoCaja');
  const cc=document.getElementById('plantillaCargoCaja');
  const av=document.getElementById('plantillaDestinoAviso');
  if(!d)return;
  const v=d.value;
  if(cg)cg.style.display=v==='grupo'?'':'none';
  if(cc)cc.style.display=v==='cargo'?'':'none';
  if(!av)return;
  if(v==='grupo')av.textContent='Le toca a todo el mundo del grupo, sea del cargo que sea dentro de él.';
  else if(v==='cargo')av.textContent='Solo a las personas que tienen ese cargo.';
  else av.textContent='Le toca a todo el mundo, sin importar el oficio. Es para seguridad general.';
}

// LA LUPA DE LAS FOTOS
// =====================
//
// -------------------------------------------------------------------
// QUÉ HACE
// --------
// Un clic en cualquier foto de una ".photoBox" la abre grande, y un clic en cualquier
// parte la cierra.
//
// -------------------------------------------------------------------
// POR QUÉ UN SOLO ESCUCHADOR Y NO UNO POR FOTO
// ---------------------------------------------
//
// Porque las fotos cambian de lugar. Hoy son dos en el ingreso del trabajador, y mañana
// hay una en la ficha del EPP y otra en el historial. Si el clic se engancha a cada
// "<img>" por su id, cada foto nueva hay que acordarse de engancharla, y la que se
// olvide no hace nada sin avisar.
//
// Con un escuchador en el documento que pregunta "¿esto es una foto?", toda foto que
// aparezca después funciona sola. Y preguntar por la clase es lo que hace que no
// grewen fotos que no deben crecer: si mañana se pone una foto de un logo o de un
// sello, no se abre, porque no está dentro de una ".photoBox".
//
// -------------------------------------------------------------------
// Y POR QUÉ SE ESCUCHA EN EL DOCUMENTO Y NO EN LAS CAJAS
// ------------------------------------------------------
//
// Las cajas se reemplazan: al guardar un trabajador se vuelve a pintar el formulario y la
// foto que tenía el escuchador deja de estar en la pantalla. El escuchador del documento
// sobrevive a eso.
//
// -------------------------------------------------------------------
// Y LA MANITA
// -----------
// El "cursor" lo pone el estilo, no acá. Si la lupa abre y el puntero sigue siendo una
// flecha, parece que la imagen está rota.
const lupa = {
  caja: null,
  img: null,
};

function prepararLupaFotos() {
  lupa.caja = document.getElementById('lupaFoto');
  lupa.img = document.getElementById('lupaFotoImg');
  if (!lupa.caja || !lupa.img) return false;
  return true;
}

// Y abrir, cerrar y cambiar. Separadas, porque "cambiar" es lo que se usa para el
// carrusel de la ficha y abrir es lo que se usa para el clic.
function abrirFotoGrande(src) {
  if (!prepararLupaFotos() || !src) return;
  lupa.img.src = src;
  lupa.caja.hidden = false;
}

function cerrarFotoGrande() {
  if (prepararLupaFotos()) lupa.caja.hidden = true;
}

function cambiarFotoGrande(src) {
  if (!prepararLupaFotos() || !src) return;
  lupa.img.src = src;
}

// -------------------------------------------------------------------
// EL ESCUCHADOR
// -------------------------------------------------------------------
document.addEventListener('click', (e) => {
  // Y primero la lupa: si está abierta, cualquier clic la cierra, incluso el que fue
  // sobre la foto grande. Y hay que mirar eso ANTES de lo de las fotos chicas, porque si
  // no, un clic sobre la foto grande la cerraría y la volvería a abrir en el mismo clic.
  const cajaAbierta = document.getElementById('lupaFoto');
  if (cajaAbierta && !cajaAbierta.hidden) {
    cerrarFotoGrande();
    return;
  }

  const img = e.target;
  if (!img || img.tagName !== 'IMG') return;

  // Y tiene que estar dentro de una ".photoBox". Sin esto, cualquier "<img>" de la
  // página abriría la lupa: los logos, los iconos dibujados en CSS, lo que sea.
  if (!img.closest('.photoBox')) return;

  // Y con foto cargada. Un "<img>" sin "src" muestra el ícono de imagen rota del
  // navegador, y abrir eso en grande es una pantalla negra que no se cierra sola.
  if (!img.getAttribute('src')) return;

  abrirFotoGrande(img.getAttribute('src'));
});

// Y con el teclado también, porque la lupa es un "<div>", no un botón, y el tabulador no
// la encuentra. Escape es lo que uno prueba sin que le digan.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const c = document.getElementById('lupaFoto');
  if (c && !c.hidden) cerrarFotoGrande();
});
