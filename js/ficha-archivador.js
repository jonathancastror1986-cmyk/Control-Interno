// ===================================================================
// js/ficha-archivador.js
// ===================================================================
// LA FICHA DEL TRABAJADOR, PARA EL ARCHIVADOR DE PAPEL
// ===================================================================
//
// ---------------------------------------------------------------------
// DÓNDE ENTRA ESTO
// ---------------------------------------------------------------------
//
// Se dibuja con "imprimirPapelEnVentana()", que ya usa Bodega para las entregas.
// No se hace una segunda ruta de impresión: son dos salidas de papel con el mismo
// motor, y hacer una segunda es el comienzo de que un día el botón de un papel
// funcione y el del otro no.
//
// ---------------------------------------------------------------------
// Y POR QUÉ EL CSS VA ADENTRO DEL PAPEL Y NO EN UN ARCHIVO
// ---------------------------------------------------------------------
//
// Porque "imprimirPapelEnVentana()" abre una ventana NUEVA y escribe un documento
// con "document.write", que no tiene ni la hoja de estilos de la aplicación ni
// los scripts. Todo lo que esté en "css/" se queda afuera.
//
// Eso ya pasó: la primera versión de la ficha usaba clases de "css/checklist.css"
// —el marco de la foto, el color de las secciones— y en el papel no se veía nada
// de eso. La foto salía sin tamaño, al tamaño natural, y el diseño era una hoja de
// texto pelada.
//
// La lección general: lo que va en un papel escrito con "document.write" tiene que
// traer su estilo en el mismo papel. Por eso "estilosDelPapel()" va adelante de todo
// el HTML.
//
// ---------------------------------------------------------------------
// EL ORDEN DE LAS SECCIONES
// ---------------------------------------------------------------------
//
// Es el de la ficha de papel que ya usan, que es el que llega a la carpeta:
//
//     la tarjeta del trabajador   ·  foto, nombre, cargo, estado
//     los datos que más se miran  ·  supervisor, ingreso, grupo del cargo
//     A) datos personales
//     B) datos del contrato
//     C) datos de contratación
//     D) precauciones
//     E) checklist de ingreso y término
//
// Y ese orden tiene una razón que conviene no perder: primero lo que identifica a
// la persona, después lo que la ubica en la empresa, y al final lo que hay que
// hacer. Un archivador saca la ficha cuando busca a alguien, y lo primero que
// necesita es encontrarlo.
//
// ---------------------------------------------------------------------
// Y POR QUÉ HAY COLOR EN UN PAPEL QUE SE ARCHIVA
// ---------------------------------------------------------------------
//
// Porque el papel va a una carpeta, y en la carpeta hay que encontrar la ficha de
// entre otras. Un color por sección ayuda a eso más que un borde negro.
//
// Y EL COLOR SIEMPRE CLARO, CON LA ETIQUETA EN NEGRO
//
// Porque una impresora en blanco y negro no tiene que perder el sentido del
// documento. Con los fondos claros y el texto negro, el papel sigue siendo legible
// en cualquier impresora: el color está de adorno y la estructura la llevan las
// líneas, las MAYÚSCULAS y los pesos. Si el papel dependiera del color para
// distinguir una fila de otra, en el archivo se perdía.

'use strict';

// ---------------------------------------------------------------------
// EL ESTILO DEL PAPEL
// ---------------------------------------------------------------------
//
// Va en un "<style>" del propio papel. Ver arriba por qué no puede estar en un
// archivo de la aplicación.
//
// Y POR QUÉ UNA FUNCIÓN Y NO UNA CONSTANTE CON EL TEXTO
//
// Porque se arma una vez por impresión y no hace falta que viva en memoria todo el
// tiempo. Y el día que haya que cambiar un color se cambia en un solo lugar.
function estilosDelPapel(){
  return '<style>'
    // ---- LO GENERAL ----
    +'*{box-sizing:border-box;}'
    +'.ficha{font-family:"Montserrat","Segoe UI",Arial,sans-serif;color:#1f2430;'
    +'font-size:9.5pt;line-height:1.4;}'
    +'.fichaVacio{color:#9aa0ad;}'

    // ---- LA TARJETA DE ARRIBA, LA QUE DICE DE QUIÉN ES ESTA FICHA ----
    // Se lee de reojo, y por eso lleva fondo y va con sombra.
    +'.fichaTarjeta{display:flex;gap:7mm;align-items:center;padding:5mm;'
    +'background:linear-gradient(135deg,#eef1ff 0%,#f7f2ff 55%,#fff 100%);'
    +'border:1px solid #dcd9f5;border-radius:5mm;}'
    +'.fichaQuien{flex:1 1 auto;min-width:0;}'
    // Y EL NOMBRE, QUE ES LO MÁS GRANDE DE TODA LA FICHA
    // Porque es lo que se busca cuando se abre la carpeta.
    +'.fichaNombre{font-size:19pt;font-weight:800;line-height:1.12;color:#1b1f3b;'
    +'margin:0 0 1mm;}'
    +'.fichaCargo{font-size:10pt;color:#4b5163;margin:0 0 1.5mm;}'
    +'.fichaInsenias{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}'
    +'.fichaInsenia{display:inline-block;padding:1mm 3mm;border-radius:6mm;'
    +'font-size:8pt;font-weight:700;letter-spacing:.02em;}'
    // Y EL ESTADO, QUE VA CON COLOR SEGUN SEA
    // Verde si está trabajando, rojo si ya no. Es el dato que más se mira de la
    // tarjeta, y por color se lee sin leer.
    +'.fichaInsenia-activo{background:#dcf5e4;color:#136c33;border:1px solid #a8e0bd;}'
    +'.fichaInsenia-desvinculado{background:#fde3e3;color:#9c1c1c;border:1px solid #f2b8b8;}'
    +'.fichaInsenia-neutra{background:#e8eaf6;color:#3b3f8f;border:1px solid #c9ccec;}'

    // ---- LA FOTO ----
    // Con marco y sombra, porque es el elemento que más hace que una ficha se vea
    // como una ficha y no como una hoja de texto con un hueco.
    +'.fichaFoto img{width:26mm;height:32mm;object-fit:cover;border-radius:3mm;'
    +'border:2.5px solid #fff;box-shadow:0 1px 4px rgba(31,36,48,.28);display:block;}'
    +'.fichaFoto small{display:block;text-align:center;font-size:7pt;color:#6b7280;'
    +'margin-top:1.5mm;}'
    +'.fichaFotoVacia{width:26mm;height:32mm;border:1.5px dashed #b9bdd0;border-radius:3mm;'
    +'background:#f4f4f8;display:flex;align-items:center;justify-content:center;'
    +'flex-direction:column;gap:1mm;font-size:8pt;color:#8a8fa3;text-align:center;padding:2mm;}'

    // ---- LOS DATOS DESTACADOS ----
    // Los cuatro que más se miran, con el valor sobre un fondo de color.
    +'.fichaClaves{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:4mm;}'
    +'.fichaClave{background:#f7f8fc;border:1px solid #e5e7f2;border-radius:3mm;'
    +'padding:2.5mm 3mm;display:flex;justify-content:space-between;gap:3mm;'
    +'align-items:center;}'
    +'.fichaClave span{font-size:8pt;color:#5d6377;white-space:nowrap;}'
    +'.fichaClave b{font-size:9.5pt;color:#1b1f3b;text-align:right;word-break:break-word;}'

    // ---- LOS RÓTULOS DE SECCIÓN ----
    +'.fichaSeccion{display:flex;align-items:center;gap:2.5mm;margin:5mm 0 2mm;'
    +'font-size:8.5pt;font-weight:800;color:#3b3f8f;text-transform:uppercase;'
    +'letter-spacing:.06em;border-bottom:1px solid #dcd9f5;padding-bottom:1.5mm;}'
    +'.fichaSeccion b{background:#3b3f8f;color:#fff;border-radius:2mm;padding:.5mm 2mm;'
    +'font-size:8.5pt;}'
    // Y CADA SECCIÓN CON SU TONO
    // Porque el color de la letra dice en qué sección se está sin tener que leer el
    // título entero, y el fondo del rótulo es el mismo en todas.
    +'.fichaSeccion-a b{background:#4f46e5;}'
    +'.fichaSeccion-b b{background:#0e7490;}'
    +'.fichaSeccion-c b{background:#047857;}'
    +'.fichaSeccion-d b{background:#b45309;}'
    +'.fichaSeccion-e b{background:#9d174d;}'

    // ---- LAS TABLAS DE DATOS ----
    +'.fichaTabla{width:100%;border-collapse:separate;border-spacing:0;margin-bottom:1mm;}'
    // Y POR QUÉ CADA CELDA TIENE SU FONDO Y SU ALINEACIÓN, PALESADAS
    //
    // Porque este papel a veces se escribe dentro de la página de la aplicación —en
    // las pruebas— y ahí el tema oscuro de la aplicación pone fondo negro y centra
    // el texto en todas las celdas. MEDIDO en la pantalla: la etiqueta quedaba con
    // fondo claro y el VALOR con fondo negro, con la letra negra encima. Se veía
    // una columna de rectángulos negros.
    //
    // En la ventana de impresión no pasa, porque ahí no hay tema. Pero una ficha que
    // se ve bien en un lado y mal en el otro es una ficha que depende de dónde se
    // abra, y eso no se puede dejar así.
    //
    // La solución es que cada celda diga de qué color es, y no confiar en que no haya
    // nada detrás.
    +'.fichaTabla td,.fichaCheck td{background:#fff;color:#1f2430;text-align:left;}'
    +'.fichaEtiqueta{width:32%;background:#f3f4fa;border:1px solid #e2e5f0;'
    +'border-right:0;padding:2mm 2.5mm;font-size:8pt;font-weight:700;color:#4b5163;'
    +'text-align:left;vertical-align:top;}'
    +'.fichaValor{border:1px solid #e2e5f0;padding:2mm 2.5mm;font-size:9pt;color:#1f2430;'
    +'background:#fff;text-align:left;vertical-align:top;}'
    // Y EL VALOR DESTACADO, QUE ES EL QUE SE LEE DE VERAS
    // Fondo claro y letra pesada. Con esto, un nombre o un cargo se distingue de
    // una fecha sin tener que leer la fila entera.
    +'.fichaDestacado{font-weight:800;color:#1b1f3b;background:#eef1ff;}'

    // ---- EL CHECKLIST EN EL PAPEL ----
    +'.fichaCheck{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:2mm;'
    +'background:#fff;}'
    +'.fichaCheck td{border-bottom:1px solid #e7e9f2;padding:1.6mm 1mm;vertical-align:middle;'
    +'background:#fff;text-align:left;}'
    +'.fichaCheck td:first-child{text-align:center;width:7mm;}'
    +'.fichaCheckCaja{display:inline-block;width:3.4mm;height:3.4mm;border:1.2px solid #6b7280;'
    +'border-radius:1mm;vertical-align:middle;text-align:center;line-height:3.2mm;'
    +'font-size:9pt;font-weight:800;color:#136c33;background:#fff;}'
    // Y EL TÍTULO DE CADA ETAPA DEL CHECKLIST
    // Con fondo y alineación propios, por lo mismo que las celdas: el tema oscuro
    // los centra y les cambia el fondo.
    +'.ficha h4{background:transparent;text-align:left;color:#3b3f8f;'
    +'font-size:8.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.05em;}'
    +'.fichaCheck td:nth-child(2){width:62%;}'

    // ---- LO QUE NO SE PUDO LEER ----
    +'.fichaAviso{border:1.5px solid #e0a800;background:#fff8e1;color:#7a5c00;'
    +'padding:2.5mm 3mm;font-size:8.5pt;border-radius:2mm;margin-bottom:3mm;}'
    +'.fichaPie{margin-top:4mm;padding-top:2mm;border-top:1px solid #e2e5f0;'
    +'font-size:7.5pt;color:#6b7280;text-align:center;}'

    // ---- EL ENCABEZADO ----
    // A la izquierda, quién emitió la ficha. A la derecha, qué es la ficha. Las dos
    // cosas hacen falta: una hoja suelta en una carpeta tiene que decir de quién es
    // y qué es, porque sola no se sabe.
    +'.fichaEncabezado{display:flex;justify-content:space-between;align-items:flex-end;'
    +'gap:5mm;border-bottom:1.5px solid #dcd9f5;padding-bottom:2mm;margin-bottom:3mm;}'
    +'.fichaMarca{display:flex;align-items:center;gap:3mm;min-width:0;}'
    +'.fichaMarcaLogo{max-width:34mm;max-height:11mm;object-fit:contain;'
    +'border:1px solid #e2e5f0;border-radius:2mm;padding:1mm;background:#fff;}'
    +'.fichaMarca b{display:block;font-size:12pt;color:#3b3f8f;line-height:1.2;}'
    +'.fichaMarca small{display:block;font-size:8pt;color:#6b7280;margin-top:.5mm;}'
    +'.fichaTituloPapel{text-align:right;}'
    +'.fichaTituloPapel b{display:block;font-size:11pt;font-weight:800;color:#1b1f3b;'
    +'letter-spacing:.06em;}'
    +'.fichaTituloPapel small{display:block;font-size:8pt;color:#6b7280;margin-top:.5mm;}'

    // ---- EL SELLO DE AGUA ----
    //
    // El logo de la empresa, tendido detrás del pie, casi transparente.
    //
    // Va detrás del texto porque por eso es un sello y no una imagen: tiene que estar
    // sin estorbar. Va girado y repetido porque un sello que se lee entero se puede
    // cortar, y una hoja sellada se reconoce por la marca aunque se corte.
    //
    // Y LA OPACIDAD ES DE UNO A CATORCE POR CIENTO
    // Porque a más opaco tapa el texto, y el texto del pie es lo que dice de qué
    // sistema salió la hoja. El sello se ve; el texto se lee.
    //
    // La primera versión iba en un nueve por ciento y con la captura se veía que
    // era casi nada: una hoja con un sello que no se nota no está sellada.
    +'.fichaSelloArea{position:relative;margin-top:4mm;padding-top:2mm;'
    +'border-top:1px solid #e2e5f0;overflow:hidden;}'
    +'.fichaSello{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) '
    +'rotate(-22deg);width:92mm;opacity:.14;pointer-events:none;z-index:0;'
    +'filter:grayscale(100%);}'
    +'.fichaSello img{width:100%;display:block;object-fit:contain;}'
    +'.fichaPieTxt{position:relative;z-index:1;text-align:center;font-size:7.5pt;'
    +'color:#6b7280;}'
    // Y CUANDO NO HAY LOGO, EL PIE QUEDA IGUAL
    // Porque sin logo no hay sello, y el texto del pie tiene que estar igual. Un pie
    // que se mueve según la empresa es un pie que hay que releer.
    +'.fichaPie{margin-top:4mm;padding-top:2mm;border-top:1px solid #e2e5f0;'
    +'font-size:7.5pt;color:#6b7280;text-align:center;}'
    +'</style>';
}

// ---------------------------------------------------------------------
// EL LOGO DE LA EMPRESA
// ---------------------------------------------------------------------
//
// Y DE DÓNDE SE SACA
//
// De "empresas.logo_url", que la aplicación ya trae en el objeto de la empresa como
// "logo". No se agrega una columna ni se busca en otro lado: es el mismo logo que se
// ve en la tarjeta y en el reloj.
//
// Y SI NO HAY LOGO, NO SE DEJA UN HUECO
//
// Porque el nombre de la empresa está al lado de todos modos, y un recuadro vacío
// con un borde se lee como "falta algo" cuando lo que pasa es que esa empresa no
// tiene logo cargado. Que salga el nombre solo es la verdad.
function logoDeEmpresa(w){
  const empresaActual=(typeof obtenerEmpresaActual==='function')?obtenerEmpresaActual():null;
  const emp=(empresaActual||[]).find(function(e){
    return e&&e.id==(w&&w.empresa_id);
  });
  return (emp&&(emp.logo||emp.logo_url))||'';
}

// Y EL "onerror" DE TODAS LAS IMÁGENES DEL PAPEL
//
// El papel se escribe con "document.write", que no corre scripts, así que no hay
// forma de dejar un manejador en el Javascript. El atributo en línea sí funciona,
// porque es HTML.
//
// Y QUÉ HACE: esconde la imagen y deja que se vea el nombre de al lado. Una foto de
// empresa que no carga sale como el cuadrito roto del navegador, que en una ficha
// archivada parece una marca dañada.
function imagenDelPapel(url){
  return '<img src="'+escHtml(url)+'" alt=""'
    +' onerror="this.style.display=\'none\'">';
}

// ---------------------------------------------------------------------
// LOS DATOS DE LA EMPRESA, PARA EL ENCABEZADO
// ---------------------------------------------------------------------
//
// Y POR QUÉ SE CALCULA UNA VEZ Y NO EN CADA Renglón
//
// Porque el nombre de la empresa y el centro de costo están arriba, en la tarjeta, y
// repetirlos en cada fila que los mentione hace una hoja más larga sin agregar nada.
// Se calcula una vez y se pasa a la plantilla.
function datosDeCabecera(w){
  const empresaActual=(typeof obtenerEmpresaActual==='function')?obtenerEmpresaActual():null;
  const emp=(empresaActual||[]).find(function(e){
    return e&&e.id==(w&&w.empresa_id);
  });
  return {
    empresa:(emp&&(emp.nombre||emp.razon_social))||'Empresa',
    centro:(w&&w.centro_costo)||(emp&&(emp.centro_costo))||'—',
    // Y EL LOGO, PARA EL ENCABEZADO Y PARA EL SELLO DE AGUA
    logo:logoDeEmpresa(w),
    // Y EL NÚMERO DE LA FICHA
    //
    // Porque el papel archivado tiene que poder numerarse sin depender de una
    // aplicación: si va a un archivador, en tres años tiene que decir qué es. Y si
    // no hay número, un archivador le pone el suyo a mano y ese no tiene que ver con
    // el del sistema.
    numero:(w&&w.code)||'—',
    fecha:new Date().toLocaleDateString('es-CL')
  };
}

// ---------------------------------------------------------------------
// UNA FILA DE DATO
// ---------------------------------------------------------------------
//
// Y POR QUÉ UNA FUNCIÓN Y NO ESCRIBIR LOS CAMPOS A MANO
//
// Porque un campo que se escribe a mano se escribe una vez bien y las otras de
// cualquier manera. Con la función, todos salen con el mismo ancho, con el mismo
// guion de los que no hay, y con el mismo escape.
//
// Y EL GUION EN LOS VACÍOS
//
// Porque un espacio en blanco en una ficha archivada no dice que el dato falta:
// dice que alguien no lo escribió, o que no se ve. El guion lo dice.
//
// Y CUANDO EL DATO SE DESTACA
//
// Para los nombres y los cargos. Un nombre de persona y un nombre de cargo son las
// dos cosas que más se buscan en la ficha, y van con fondo y con letra pesada para
// que se lean de reojo.
function fila(etiqueta, valor, destacado){
  const hay=valor!==null&&valor!==undefined&&String(valor).trim()!=='';
  const clase=hay&&destacado?' class="fichaValor fichaDestacado"':' class="fichaValor"';
  return '<tr>'
    +'<td class="fichaEtiqueta">'+escHtml(etiqueta)+'</td>'
    +'<td'+clase+'>'+(hay?escHtml(String(valor)):'<span class="fichaVacio">—</span>')+'</td>'
    +'</tr>';
}
function filaLarga(etiqueta, valor){
  const hay=valor!==null&&valor!==undefined&&String(valor).trim()!=='';
  return '<tr><td class="fichaEtiqueta" colspan="2">'+escHtml(etiqueta)+'</td></tr>'
    +'<tr><td class="fichaValor" colspan="2">'
    +(hay?escHtml(String(valor)):'<span class="fichaVacio">—</span>')+'</td></tr>';
}

function tabla(filas){
  return '<table class="fichaTabla">'+filas.join('')+'</table>';
}

function seccion(letra,titulo,contenido){
  return '<h3 class="fichaSeccion fichaSeccion-'+letra.toLowerCase()+'"><b>'+letra+'</b> '+escHtml(titulo)+'</h3>'+contenido;
}

// ---------------------------------------------------------------------
// LA FOTO
// ---------------------------------------------------------------------
//
// Y POR QUÉ LA DE SEGURIDAD Y, SI NO HAY, LA CASUAL
//
// Porque las dos existen en la base: "foto_seguridad_url" y "foto_casual_url". La
// de seguridad es la que corresponde a la ficha de archivador, y la casual sirve
// cuando no hay.
//
// Y POR QUÉ SI NO HAY NINGUNA SALE UN RECUADRO QUE LO DICE
//
// Porque un hueco en blanco en una ficha archivada parece un dato que se perdió
// después. Un recuadro que dice "Sin foto" dice la verdad: que nunca se tomó.
//
// Y POR QUÉ EL "onerror"
//
// Porque hay fotos que están guardadas pero que ya no se pueden bajar: el STUDIO se
// borró, el archivo cambió de nombre, el enlace venció. Sin esto sale el cuadrito
// roto del navegador, que parece una foto dañada. Con esto, el papel muestra el
// mismo recuadro que dice que no hay foto, y se sabe que hay que ir a buscarla.
function bloqueFoto(w){
  const f=typeof fotoDe==='function'?fotoDe(w):{url:'',falta:true};
  if(f.falta){
    return '<div class="fichaFotoVacia">Sin foto</div>';
  }
  return '<div class="fichaFoto">'
    +'<img src="'+escHtml(f.url)+'" alt="Fotografía del trabajador"'
    // Y EL "onerror" VA EN EL PAPEL PORQUE NO HAY SCRIPT EN LA VENTANA
    // El "document.write" no ejecuta scripts, así que no hay forma de acordarse de
    // otra cosa. El atributo en línea sí funciona, porque es HTML.
    +' onerror="this.style.display=\'none\';'
    +'this.parentNode.innerHTML=\'<div class=\\\'fichaFotoVacia\\\'>No se pudo cargar la foto</div>\'">'
    +'<small>'+(f.deSeguridad?'Foto de seguridad':'Foto casual')+'</small></div>';
}

// ---------------------------------------------------------------------
// LA TARJETA DE ARRIBA: FOTO, NOMBRE, CARGO Y ESTADO
// ---------------------------------------------------------------------
//
// Y POR QUÉ ES UNA TARJETA Y NO UNA TABLA MÁS
//
// Porque es la respuesta a la primera pregunta que se hace al abrir una carpeta:
// ¿de quién es esta ficha? Eso se tiene que ver de reojo, y una tabla de etiquetas y
// valores no se ve de reojo.
//
// Y POR QUÉ EL ESTADO ES UNA INSIGNIA CON COLOR
//
// Porque activo o desvinculado es lo primero que se necesita saber. Con color se
// lee antes de leer: verde es que trabaja acá, rojo es que ya no.
function tarjetaDelTrabajador(w){
  const cab=datosDeCabecera(w);
  const desvinculado=w.status==='desvinculado';
  const estado=desvinculado
    ? 'Desvinculado'+(w.fecha_desvinculacion?(' el '+w.fecha_desvinculacion):'')
    : 'Activo';
  const claseEstado=desvinculado?'fichaInsenia-desvinculado':'fichaInsenia-activo';

  // Y LAS INSIGNIAS DE LA TARJETA
  const insenias=['<span class="fichaInsenia '+claseEstado+'">'+escHtml(estado)+'</span>'];
  // Y EL CÓDIGO, QUE ES LO QUE SE ESCRIBE EN EL OTRO SISTEMA
  insenias.push('<span class="fichaInsenia fichaInsenia-neutra">'
    +'Código '+escHtml(cab.numero)+'</span>');

  return '<div class="fichaTarjeta">'
    +bloqueFoto(w)
    +'<div class="fichaQuien">'
    +'<p class="fichaNombre">'+escHtml(w.name||w.code||'')+'</p>'
    +'<p class="fichaCargo">'+escHtml(w.cargo||'Sin cargo cargado')+'</p>'
    +'<div class="fichaInsenias">'+insenias.join('')+'</div>'
    +'</div>'
    +'</div>';
}

// ---------------------------------------------------------------------
// LOS CUATRO DATOS QUE MÁS SE MIRAN
// ---------------------------------------------------------------------
//
// Y POR QUÉ ESTOS CUATRO Y NO OTROS
//
// Porque son los que contestan "¿este trabajador está trabajando acá y en qué?".
// Cualquier otro dato está a una sección de distancia, y estos no.
//
// Y POR QUÉ EL VALOR CON COLOR Y LA ETIQUETA SIN
//
// Porque la etiqueta es la misma siempre y no necesita destaque; el valor es lo que
// cambia de una persona a otra, y es lo que hay que ver rápido.
function datosClave(w){
  const supervisor=(function(){
    if(!w.supervisor_code)return '';
    const s=(typeof workers!=='undefined')?workers.find(function(x){return x.code===w.supervisor_code;}):null;
    return s?s.name:w.supervisor_code;
  })();
  // Y LA FECHA CON EL MISMO FORMATO QUE EN LAS SECCIONES
  //
  // Porque la fecha de ingreso sale dos veces en el papel, y si una sale como
  // "2026-08-01" y la otra como "1-de-agosto-2026", el lector tiene que darse
  // cuenta de que son la misma fecha. MEDIDO en la pantalla: era lo que pasaba.
  const fecha=w.fecha_ingreso&&(typeof fechaLarga==='function')?fechaLarga(w.fecha_ingreso):w.fecha_ingreso;
  const claves=[
    ['Supervisor',supervisor],
    ['Fecha de ingreso',fecha],
    ['Grupo del cargo',w.grupo_cargo],
    ['Centro de costo',w.centro_costo]
  ];
  return '<div class="fichaClaves">'+claves.map(function(k){
    const hay=k[1]!==null&&k[1]!==undefined&&String(k[1]).trim()!=='';
    return '<div class="fichaClave"><span>'+escHtml(k[0])+'</span>'
      +'<b>'+(hay?escHtml(String(k[1])):'<span class="fichaVacio">—</span>')+'</b></div>';
  }).join('')+'</div>';
}

// ---------------------------------------------------------------------
// LA FICHA ENTERA
// ---------------------------------------------------------------------
function imprimirFichaTrabajador(){
  const w=(typeof fichaEnPantalla!=='undefined')?fichaEnPantalla:null;
  if(!w){
    alert('No hay ninguna ficha abierta. Abrí la ficha de un trabajador primero.');
    return;
  }
  // Y SI NO SE LEYERON LAS TAREAS, EL PAPEL LO DICE
  //
  // Porque una ficha de archivador con el checklist en blanco parece "no se hizo
  // nada", cuando lo que pasó es que no se pudo consultar. Y esa copia se archiva,
  // y dentro de seis meses alguien la usa como prueba.
  let avisoTareas='';
  if(typeof tareasEstadoError!=='undefined'&&tareasEstadoError){
    avisoTareas='<div class="fichaAviso">Las tareas NO se pudieron leer al imprimir: '
      +escHtml(tareasEstadoError)+' Las casillas de abajo salen vacías porque no se sab&iacute;a cu&aacute;les estaban hechas.</div>';
  }

  const cab=datosDeCabecera(w);
  const advertencias=typeof advertenciasDe==='function'?advertenciasDe(w):[];
  const checklist=typeof checklistParaElPapel==='function'?checklistParaElPapel(w):'';

  // Y LOS DATOS DEL CONTRATO, QUE SON LOS NUEVE QUE SE PIDIERON
  //
  // Y EL PLAZO, QUE SE ESCRIBE ENTERO Y NO COMO NÚMERO
  //
  // Porque "contrato_tipo_plazo" y "contrato_plazo_dias" son dos columnas y una
  // persona. En el papel va junto: "Plazo fijo, 90 días", no "fijo" en una celda y
  // "90" en otra, que es lo que sale si se imprimen por separado.
  const plazo=(w.contrato_tipo_plazo||'')
    +(w.contrato_plazo_dias!=null&&String(w.contrato_plazo_dias).trim()!==''
      ?((w.contrato_tipo_plazo?', ':'')+w.contrato_plazo_dias+' días')
      :((w.contrato_tipo_plazo?'':'Sin elegir')));

  // Y EL ENCABEZADO: EL LOGO DE LA EMPRESA, SU NOMBRE, Y QUÉ ES LA FICHA
  //
  // Las tres cosas, y las tres hacen falta. Una hoja suelta en una carpeta tiene que
  // decir de quién es y qué es: sola no se sabe. Y el título va arriba y en
  // mayúsculas porque es lo que se lee cuando la hoja está doblada en el archivador.
  const empresa='<div class="fichaEncabezado">'
    +'<div class="fichaMarca">'
    +(cab.logo?'<img class="fichaMarcaLogo" src="'+escHtml(cab.logo)+'" alt=""'
      +' onerror="this.style.display=\'none\'">':'')
    +'<div><b>'+escHtml(cab.empresa)+'</b>'
    +'<small>Centro de costo: '+escHtml(cab.centro)+'</small></div>'
    +'</div>'
    +'<div class="fichaTituloPapel"><b>FICHA DEL TRABAJADOR</b>'
    +'<small>Emitida el '+escHtml(cab.fecha)+'</small></div>'
    +'</div>';

  // Y EL SELLO DE AGUA AL PIE
  //
  // El mismo logo de la empresa, tendido detrás del texto del pie. Se ve que la hoja
  // es de esta empresa aunque el pie se corte o el papel se raye.
  const pie='<div class="fichaSelloArea">'
    +(cab.logo?'<div class="fichaSello"><img src="'+escHtml(cab.logo)+'" alt=""></div>':'')
    +'<p class="fichaPieTxt">Emitida por el sistema de asistencia el '+escHtml(cab.fecha)
    +'. Las casillas del checklist se pueden completar a mano después de imprimir.</p>'
    +'</div>';

  const html=estilosDelPapel()
    +'<div class="ficha">'
    +empresa
    +tarjetaDelTrabajador(w)
    +datosClave(w)

    +seccion('A','Datos personales',tabla([
      fila('RUT',w.rut),
      fila('Fecha de nacimiento',w.fecha_nac&&fechaLarga?fechaLarga(w.fecha_nac):w.fecha_nac),
      fila('Nacionalidad',w.nacionalidad),
      fila('Estado civil',w.estado_civil),
      fila('Profesión u oficio',w.profesion),
      fila('Comuna',w.comuna),
      fila('Teléfono',w.phone),
      fila('Correo',w.email)
    ]))

    +seccion('B','Datos del contrato',tabla([
      fila('Inicio del contrato',w.contrato_fecha_inicio&&fechaLarga?fechaLarga(w.contrato_fecha_inicio):w.contrato_fecha_inicio),
      fila('Plazo',plazo,true),
      fila('Hasta',w.contrato_fecha_hasta&&fechaLarga?fechaLarga(w.contrato_fecha_hasta):w.contrato_fecha_hasta)
    ]))

    +seccion('C','Datos de contratación',tabla([
      fila('Empresa',cab.empresa),
      fila('Centro de costo',cab.centro),
      fila('Fecha de ingreso',w.fecha_ingreso&&fechaLarga?fechaLarga(w.fecha_ingreso):w.fecha_ingreso),
      fila('Grupo del cargo',w.grupo_cargo),
      fila('AFP',[w.afp_nombre,w.afp_rut].filter(Boolean).join(' · ')),
      fila('Tipo de trabajador',w.tipo_trabajador),
      fila('Cargo planillas',w.cargo_planillas)
    ]))

    // Y LAS PRECAUCIONES, QUE SI NO HAY DICEN QUE NO HAY
    +seccion('D','Precauciones y datos de salud',
      avisoTareas
      +(advertencias.length
        ?tabla(advertencias.map(function(a){return filaLarga(a.etiqueta,a.valor);}))
        :'<p class="fichaVacio">Sin advertencias registradas para este trabajador.</p>'))

    +seccion('E','Checklist de ingreso y término', checklist)

    +pie
    +'</div>';

  imprimirPapelEnVentana(html,{
    plantilla:'Ficha del trabajador',
    trabajador:w.name||w.code
  });
}