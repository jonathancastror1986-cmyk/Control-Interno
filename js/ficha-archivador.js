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
    // ---- LA PÁGINA ----
    //
    // Y POR QUÉ LA FICHA DECLARA SU PROPIA PÁGINA
    //
    // Porque el motor de impresión compartido pone su "@page" DENTRO de un
    // "@media print", y esa forma no la respetan todos los navegadores: si no se
    // aplica, la hoja sale con el ancho que el diálogo de impresión decida, y el
    // resultado es un papel de medio metro de ancho con todo diminuto. MEDIDO en el
    // PDF que salió de la app: la tabla llegaba al borde de una hoja larguísima.
    //
    // Y POR QUÉ ADEMÁS SE FIJA EL ANCHO DEL CONTENIDO
    //
    // Porque aunque la página salga bien, si el contenido no tiene un ancho fijo se
    // estira hasta el borde y las letras quedan diminutas. Con "190mm" el papel se
    // ve igual en cualquier impresora, y si alguien usa un papel más grande, queda
    // centrado con los dos lados en blanco.
    //
    // Los 190 son el ancho del A4 menos los dos márgenes de 10: 210 menos 20.
    +'@page{size:A4 portrait;margin:10mm;}'
    +'.ficha{font-family:"Montserrat","Segoe UI",Arial,sans-serif;color:#1f2430;'
    +'font-size:11pt;line-height:1.42;width:190mm;max-width:100%;margin:0 auto;}'
    +'.fichaVacio{color:#9aa0ad;}'

    // ---- LA TARJETA DE ARRIBA, LA QUE DICE DE QUIÉN ES ESTA FICHA ----
    // Se lee de reojo, y por eso lleva fondo y va con sombra.
    +'.fichaTarjeta{display:flex;gap:7mm;align-items:center;padding:5mm;'
    +'background:linear-gradient(135deg,#eef1ff 0%,#f7f2ff 55%,#fff 100%);'
    +'border:1px solid #dcd9f5;border-radius:5mm;}'
    +'.fichaQuien{flex:1 1 auto;min-width:0;}'
    // Y EL NOMBRE, QUE ES LO MÁS GRANDE DE TODA LA FICHA
    // Porque es lo que se busca cuando se abre la carpeta.
    +'.fichaNombre{font-size:22pt;font-weight:800;line-height:1.1;color:#1b1f3b;'
    +'margin:0 0 1mm;}'
    +'.fichaCargo{font-size:11.5pt;color:#4b5163;margin:0 0 1.5mm;}'
    +'.fichaInsenias{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}'
    +'.fichaInsenia{display:inline-block;padding:1mm 3mm;border-radius:6mm;'
    +'font-size:9.5pt;font-weight:700;letter-spacing:.02em;}'
    // Y EL ESTADO, QUE VA CON COLOR SEGUN SEA
    // Verde si está trabajando, rojo si ya no. Es el dato que más se mira de la
    // tarjeta, y por color se lee sin leer.
    +'.fichaInsenia-activo{background:#dcf5e4;color:#136c33;border:1px solid #a8e0bd;}'
    +'.fichaInsenia-desvinculado{background:#fde3e3;color:#9c1c1c;border:1px solid #f2b8b8;}'
    +'.fichaInsenia-neutra{background:#e8eaf6;color:#3b3f8f;border:1px solid #c9ccec;}'

    // ---- LA FOTO ----
    // Con marco y sombra, porque es el elemento que más hace que una ficha se vea
    // como una ficha y no como una hoja de texto con un hueco.
    +'.fichaFoto img{width:30mm;height:37mm;object-fit:cover;border-radius:3mm;'
    +'border:2.5px solid #fff;box-shadow:0 1px 4px rgba(31,36,48,.28);display:block;}'
    +'.fichaFoto small{display:block;text-align:center;font-size:7pt;color:#6b7280;'
    +'margin-top:1.5mm;}'
    +'.fichaFotoVacia{width:30mm;height:37mm;border:1.5px dashed #b9bdd0;border-radius:3mm;'
    +'background:#f4f4f8;display:flex;align-items:center;justify-content:center;'
    +'flex-direction:column;gap:1mm;font-size:9.5pt;color:#8a8fa3;text-align:center;padding:2mm;}'

    // ---- LOS DATOS DESTACADOS ----
    // Los cuatro que más se miran, con el valor sobre un fondo de color.
    +'.fichaClaves{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:4mm;}'
    +'.fichaClave{background:#f7f8fc;border:1px solid #e5e7f2;border-radius:3mm;'
    +'padding:2.5mm 3mm;display:flex;justify-content:space-between;gap:3mm;'
    +'align-items:center;}'
    +'.fichaClave span{font-size:9.5pt;color:#5d6377;white-space:nowrap;}'
    +'.fichaClave b{font-size:11pt;color:#1b1f3b;text-align:right;word-break:break-word;}'

    // ---- LOS RÓTULOS DE SECCIÓN ----
    +'.fichaSeccion{display:flex;align-items:center;gap:2.5mm;margin:5mm 0 2mm;'
    +'font-size:10.5pt;font-weight:800;color:#3b3f8f;text-transform:uppercase;'
    +'letter-spacing:.06em;border-bottom:1px solid #dcd9f5;padding-bottom:1.5mm;}'
    +'.fichaSeccion b{background:#3b3f8f;color:#fff;border-radius:2mm;padding:.5mm 2.5mm;'
    +'font-size:10.5pt;}'
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
    +'.fichaEtiqueta{width:17%;background:#f3f4fa;border:1px solid #e2e5f0;'
    +'border-right:0;padding:2mm 2.5mm;font-size:9.5pt;font-weight:700;color:#4b5163;'
    +'text-align:left;vertical-align:top;}'
    +'.fichaValor{border:1px solid #e2e5f0;padding:2mm 2.5mm;font-size:10.5pt;color:#1f2430;'
    +'background:#fff;text-align:left;vertical-align:top;}'
    // Y EL VALOR DESTACADO, QUE ES EL QUE SE LEE DE VERAS
    // Fondo claro y letra pesada. Con esto, un nombre o un cargo se distingue de
    // una fecha sin tener que leer la fila entera.
    +'.fichaDestacado{font-weight:800;color:#1b1f3b;background:#eef1ff;}'

    // ---- EL CHECKLIST EN EL PAPEL ----
    +'.fichaCheck{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:2mm;'
    +'background:#fff;}'
    +'.fichaCheck td{border-bottom:1px solid #e7e9f2;padding:1.6mm 1mm;vertical-align:middle;'
    +'background:#fff;text-align:left;}'
    +'.fichaCheck td:first-child{text-align:center;width:7mm;}'
    +'.fichaCheckCaja{display:inline-block;width:4.2mm;height:4.2mm;border:1.2px solid #6b7280;'
    +'border-radius:1mm;vertical-align:middle;text-align:center;line-height:4mm;'
    +'font-size:10pt;font-weight:800;color:#136c33;background:#fff;}'
    // Y EL TÍTULO DE CADA ETAPA DEL CHECKLIST
    // Con fondo y alineación propios, por lo mismo que las celdas: el tema oscuro
    // los centra y les cambia el fondo.
    +'.ficha h4{background:transparent;text-align:left;color:#3b3f8f;'
    +'font-size:10.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.05em;}'
    +'.fichaCheck td:nth-child(2){width:62%;}'

    // ---- LO QUE NO SE PUDO LEER ----
    +'.fichaAviso{border:1.5px solid #e0a800;background:#fff8e1;color:#7a5c00;'
    +'padding:2.5mm 3mm;font-size:10pt;border-radius:2mm;margin-bottom:3mm;}'
    +'.fichaPie{margin-top:4mm;padding-top:2mm;border-top:1px solid #e2e5f0;'
    +'font-size:9pt;color:#6b7280;text-align:center;}'

    // ---- EL ENCABEZADO ----
    // A la izquierda, quién emitió la ficha. A la derecha, qué es la ficha. Las dos
    // cosas hacen falta: una hoja suelta en una carpeta tiene que decir de quién es
    // y qué es, porque sola no se sabe.
    +'.fichaEncabezado{display:flex;justify-content:space-between;align-items:flex-end;'
    +'gap:5mm;border-bottom:1.5px solid #dcd9f5;padding-bottom:2mm;margin-bottom:3mm;}'
    +'.fichaMarca{display:flex;align-items:center;gap:3mm;min-width:0;}'
    +'.fichaMarcaLogo{max-width:38mm;max-height:13mm;object-fit:contain;'
    +'border:1px solid #e2e5f0;border-radius:2mm;padding:1mm;background:#fff;}'
    +'.fichaMarca b{display:block;font-size:13.5pt;color:#3b3f8f;line-height:1.2;}'
    +'.fichaMarca small{display:block;font-size:9.5pt;color:#6b7280;margin-top:.5mm;}'
    +'.fichaTituloPapel{text-align:right;}'
    +'.fichaTituloPapel b{display:block;font-size:13pt;font-weight:800;color:#1b1f3b;'
    +'letter-spacing:.06em;}'
    +'.fichaTituloPapel small{display:block;font-size:9.5pt;color:#6b7280;margin-top:.5mm;}'

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
    +'rotate(-22deg);width:105mm;opacity:.14;pointer-events:none;z-index:0;'
    +'filter:grayscale(100%);}'
    +'.fichaSello img{width:100%;display:block;object-fit:contain;}'
    +'.fichaPieTxt{position:relative;z-index:1;text-align:center;font-size:9pt;'
    +'color:#6b7280;}'
    // Y CUANDO NO HAY LOGO, EL PIE QUEDA IGUAL
    // Porque sin logo no hay sello, y el texto del pie tiene que estar igual. Un pie
    // que se mueve según la empresa es un pie que hay que releer.
    +'.fichaPie{margin-top:4mm;padding-top:2mm;border-top:1px solid #e2e5f0;'
    +'font-size:9pt;color:#6b7280;text-align:center;}'

    // ==================================================================
    // LO QUE SE ROMPE AL IMPRIMIR
    // ==================================================================
    //
    // MEDIDO con las alturas que declara este mismo CSS (el papel lleno mide
    // unos 504 mm y el vacío unos 380, contra 277 mm imprimibles de un A4):
    // el caso lleno necesita DOS HOJAS y el corte cae en medio de la sección D;
    // el vacío, en medio de la E. O sea: el corte de página no es una
    // casualidad, es la norma, y sin reglas de salto lo parte donde cae.
    //
    // Y POR QUÉ ESTO VA AL FINAL Y NO EN SU LUGAR
    //
    // Porque son reglas que ganan contra las de arriba por ir después y por ser
    // de impresión. Si cada bloque las trajera, la mitad se olvidaría.

    // ---- NADA QUE SE PARTA A LA MITAD ----
    //
    // Porque sin esto el navegador parte donde le da: una fila partida deja el
    // rótulo de un campo en el borde de arriba y su valor en el de abajo —con
    // "—" y todo—, que en una ficha archivada parece que el dato no existe; y
    // el rótulo de sección se puede quedar solo, de título sin contenido.
    // Con "avoid" el bloque entero pasa a la hoja siguiente y el corte cae entre
    // bloques, que es lo único que se puede cortar sin perder sentido.
    //
    // El "page-break-inside" va al lado porque es la propiedad vieja: hay
    // impresoras y previsores (y el motor de PDF de algunas versiones de
    // Chrome) que todavía la miran y no la moderna.
    +'.fichaEncabezado,.fichaTarjeta,.fichaClaves,.fichaTabla,.fichaCheck,'
    +'.fichaAviso,.fichaSelloArea{break-inside:avoid;page-break-inside:avoid;}'

    // ---- Y QUE EL RÓTULO SE VAYA CON LO QUE ANUNCIA ----
    //
    // El "break-inside" de arriba no alcanza solo: el rótulo de sección y la
    // tabla que anuncia son DOS elementos hermanos, y el corte puede caer en el
    // medio. Con "break-after" el rótulo no queda huérfano arriba de una hoja.
    // Lo mismo con el encabezado y la tarjeta, que son la respuesta a "¿de quién
    // es esta ficha?": una hoja que empieza con el nombre y sigue con los datos
    // de otro es peor que una hoja partida.
    +'.fichaSeccion,.ficha h4,.fichaEncabezado,.fichaTarjeta,.fichaClaves,'
    +'.fichaTabla,.fichaCheck{break-after:avoid;page-break-after:avoid;}'

    // ---- QUE NINGUNA TABLA SE SALGA DEL ANCHO DE LA HOJA ----
    //
    // ".ficha" mide 190 mm y una tabla con "width:100%" debería medir lo mismo,
    // pero con el reparto automático de columnas NO ES GARANTIZADO: si una
    // palabra es más ancha que su columna, el navegador ensancha la celda y la
    // tabla se sale de la hoja y el papel sale recortado por la derecha. En la
    // sección E el detalle de cada tarea se escribe junto en la celda de quién la
    // hizo, y eso es justo el caso: nombres largos más fecha más hora no entran en
    // 31% de 190 mm.
    //
    // Con "table-layout:fixed" el ancho lo mandan las columnas declaradas, no el
    // texto: la tabla se queda en 190 mm pase lo que pase, y lo que no entre se
    // parte en dos líneas, que es lo que hay que hacer con un dato.
    //
    // Y POR QUÉ SÓLO EN EL CHECKLIST Y NO EN TODAS
    //
    // Porque "fichaTabla" tiene filas de DOS y de CUATRO celdas, y hay filas
    // con "colspan=2" —la etiqueta de cada advertencia de la sección D—. Con
    // ancho fijo, esa celda repartida reparte su 17% entre las dos columnas que
    // cubre y la columna de las etiquetas queda en la mitad de angosta. Se
    // arregla con "overflow-wrap": una palabra larga se parte dentro de la celda
    // en vez de estirar la columna.
    +'.fichaCheck{table-layout:fixed;max-width:100%;}'
    +'.fichaTabla td,.fichaCheck td{overflow-wrap:anywhere;}'

    // ---- LA FOTO NO SE ACHICA NI SE SALE DEL MARCO ----
    //
    // La tarjeta es un "flex", y un "flex" reparte el ancho que sobra apretando
    // a los hijos. La foto tiene 30 mm fijos, pero su envoltorio no: con un nombre
    // muy largo el envoltorio se encoge, la imagen se sale de él y queda pegada
    // encima del texto. "flex:0 0 auto" le dice que no se toque el tamaño.
    +'.fichaTarjeta>.fichaFoto,.fichaTarjeta>.fichaFotoVacia{flex:0 0 auto;}'

    // ---- EL PISO DE LA LETRA ----
    //
    // El rótulo chico de la foto ("Foto de seguridad", "Foto casual") estaba en
    // 7 puntos, que es menos de lo que sacan bien las impresoras de depósito, que
    // son las que hay en la oficina de portería. A 8 puntos entra igual de bien.
    +'.fichaFoto small{font-size:8pt;}'
    // Y AQUÍ SÍ VA "!important", Y ESTE ES EL MOTIVO
    //
    // Porque esas dos celdas y ese título traen el tamaño en un atributo
    // "style" de la línea, escrito en "checklist-trabajador.js", y un atributo
    // en línea gana a cualquier hoja de estilo. El papel no puede tocar ese
    // archivo (es el que arma el checklist y no es CSS), así que la única forma
    // de levantar el piso de letra del papel es ganarle al atributo.
    +'.fichaCheck td:last-child{font-size:8pt !important;}'
    +'.ficha h4{font-size:9pt !important;}'
    +'</style>';
}

// ---------------------------------------------------------------------
// LA EMPRESA DEL TRABAJADOR
// ---------------------------------------------------------------------
//
// Y DE DÓNDE SE SACA, Y POR QUÉ NO SE INVENTA UNA FUNCIÓN
//
// La aplicación tiene un arreglo global "empresas" —declarado en
// "views/administracion/administracion.js"— con la forma
//
//     [{id, nombre, logo_url, rut, giro, direccion, telefono, email, sitio_web}]
//
// y además "empresaActual", que NO es una lista: es un NÚMERO, el id de la empresa
// que se está mirando, o cero cuando se están viendo todas.
//
// Y la función "obtenerEmpresaActual()" que usaba la primera versión de esta ficha
// no existe en ninguna parte de la aplicación. En la pantalla de pruebas, donde esa
// función estaba falseada con una lista, se veía el nombre y el logo. En el papel
// real no había ninguno de los dos: salía la palabra "Empresa" y ni logo ni sello.
//
// MEDIDO en el PDF que salió de la app. Por eso la empresa se busca en el arreglo
// que existe, y no en una función que uno se acaba de inventar.
//
// Y SI NO ESTÁ EN LA LISTA
//
// Porque puede pasar: la persona es de una empresa a la que esta sesión no tiene
// acceso, o la empresa se borró. Se cae al nombre que trae el trabajador, y si no
// trae ninguno, se dice que no se encontró. Un papel sin nombre de empresa es un
// papel que no se puede archivar donde va, y hay que enterarse al verlo, no después.
// ---------------------------------------------------------------------
// LOS DATOS DEL TRABAJADOR, TRADUCIDOS A LOS NOMBRES QUE USA ESTA FICHA
// ---------------------------------------------------------------------
//
// Y POR QUÉ EXISTE ESTE PASO
//
// Porque la ficha se inventó los nombres de los campos, y en la aplicación varios de
// esos campos no existen con ese nombre. MEDIDO en el PDF que salió de la app:
//
//     la ficha pedía        lo que hay de verdad
//     ──────────────────────────────────────────────────────────
//     w.cargo               w.spec        el cargo no salía: decía "Sin cargo cargado"
//     w.email               w.correo
//     w.centro_costo        w.centro_costo_id   NUNCA existió: salía "—"
//     w.afp_rut             w.afp_codigo
//     w.salud_notas         w.salud
//     w.emerg_nombre        w.emerg_name
//     w.emerg_telefono      w.emerg_phone
//     w.emerg_relacion      w.emerg_rel
//
// Un "undefined" en una celda sale como guion, y un guion en una ficha archivada
// parece un dato que el trabajador no tiene. No lo tiene: está guardado.
//
// Y POR QUÉ "spec" ES EL CARGO
//
// Porque "spec" es el texto que sale impreso en la credencial y en las planillas. En
// la base la columna se llama "cargo", que es lo que hizo el lío: el nombre de la
// columna y el del campo en memoria son distintos, y los dos ciertos. El formulario
// lo llama "Cargo para las planillas", que es más honesto.
//
// Y EL CENTRO DE COSTO SE RESUELVE POR ID
//
// Porque en la base está el número, y el nombre lo sabe "nombreCentroCosto()". Si la
// ficha guardara el nombre aparte, habría dos copias del mismo dato y algún día no
// coincidirían.
//
// Y SI LA FUNCIÓN NO ESTÁ, QUEDA VACÍO
//
// Porque la ficha se puede imprimir desde donde no esté cargada la lista de centros
// de costo. Sale el guion de siempre y el papel entero, en vez de un error que lo
// parte por la mitad.
function datosDeLaFicha(w){
  if(!w)return null;
  const f=Object.assign({},w);
  f.cargo=w.spec||'';
  f.email=w.correo||'';
  f.afp_rut=w.afp_codigo||'';
  f.salud_notas=w.salud||'';
  f.emerg_nombre=w.emerg_name||'';
  f.emerg_telefono=w.emerg_phone||'';
  f.emerg_relacion=w.emerg_rel||'';
  f.centro_costo=(w.centro_costo_id!=null&&typeof nombreCentroCosto==='function')
    ? (nombreCentroCosto(w.centro_costo_id)||'')
    : '';
  return f;
}

// ---------------------------------------------------------------------
// LA EMPRESA DEL TRABAJADOR
// ---------------------------------------------------------------------
function empresaDelTrabajador(w){
  const lista=(typeof empresas!=='undefined'&&Array.isArray(empresas))?empresas:[];
  const id=w&&w.empresa_id;
  const emp=(id!=null)
    ? lista.find(function(e){return e&&String(e.id)===String(id);})
    : null;
  return emp||null;
}

function datosDeCabecera(w){
  const emp=empresaDelTrabajador(w);
  // Y EL LOGO, PARA EL ENCABEZADO Y PARA EL SELLO DE AGUA
  //
  // La columna se llama "logo_url". Se acepta también "logo" porque hay un par de
  // lugares de la aplicación que le ponen el nombre corto al leer.
  const logo=(emp&&(emp.logo_url||emp.logo))||'';
  const nombreEmpresa=(emp&&emp.nombre)
    || (w&&w.empresa_nombre)
    || (emp?null:'Empresa no encontrada');
  return {
    empresa:nombreEmpresa,
    centro:(w&&w.centro_costo)||'—',
    logo:logo,
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

// ---------------------------------------------------------------------
// LOS DATOS DE A DOS POR LÍNEA
// ---------------------------------------------------------------------
//
// Y POR QUÉ DOS Y NO UNO
//
// Porque en el papel que salió de la app, los datos personales ocupaban ocho renglones
// para ocho campos, con una etiqueta a la izquierda y el valor en una celda que
// llegaba hasta el otro borde de una hoja enorme. Dos tercios del papel eran vacío.
//
// Con dos pares por renglón, la misma información entra en la mitad del alto, y el
// valor queda pegado a su etiqueta y no perdido al otro lado de la hoja. Eso es lo
// que hace una ficha de papel de verdad: se lee de arriba abajo, no saltando de un
// borde al otro.
//
// Y QUÉ PASA SI EL VALOR ES LARGO
//
// Se acorta la fila, no el texto. El valor no se parte a la mitad ni se le corta con
// puntos suspensivos: un número de teléfono o un correo no se pueden recortar. Si
// ocupa más, ocupa el renglón entero de abajo y la fila queda más alta. Perder un
// renglón de alto no es un problema; perder parte de un dato sí.
//
// Y UN CAMPO QUE NECESITA LA LÍNEA ENTERA
//
// El plazo del contrato y el resto de los destacados, porque son los que llevan el
// fondo de color y tienen que verse de una vez. Se marcan con "completo".
function celdaDeCampo(campo){
  const valor=campo.valor;
  const hay=valor!==null&&valor!==undefined&&String(valor).trim()!=='';
  const clase=(hay&&campo.destacado)?' class="fichaValor fichaDestacado"':' class="fichaValor"';
  // Y LA CELDA DE RELLENO
  //
  // Porque una fila con un solo campo y la otra celda vacía queda con un hueco feo al
  // lado. Se escriben los dos rótulos y los dos valores, y el que no hay queda con el
  // guion de siempre: es lo que se ve en la ficha y es lo que hay que leer.
  const etiq=campo.vacio?'':escHtml(campo.etiqueta);
  return '<td class="fichaEtiqueta">'+etiq+'</td>'
    +'<td'+clase+'>'+(hay?escHtml(String(valor)):'<span class="fichaVacio">—</span>')+'</td>';
}
function tablaPares(campos){
  const salida=[];
  let i=0;
  while(i<campos.length){
    const uno=campos[i];
    // Y EL QUE NECESITA LA LÍNEA ENTERA, EN SU PROPIO RENGLÓN
    if(uno.completo){
      salida.push('<tr>'+celdaDeCampo(uno)+'</tr>');
      i++;
      continue;
    }
    const dos=campos[i+1];
    if(!dos||dos.completo){
      // Y SI EL SIGUIENTE TAMBIÉN ES ENTERO, ESTE SE QUEDA CON SU PAR DE AL LADO
      salida.push('<tr>'+celdaDeCampo(uno)+celdaDeCampo({etiqueta:'',valor:'',vacio:true})+'</tr>');
      i++;
      continue;
    }
    salida.push('<tr>'+celdaDeCampo(uno)+celdaDeCampo(dos)+'</tr>');
    i+=2;
  }
  return '<table class="fichaTabla">'+salida.join('')+'</table>';
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
  // Y LA FECHA DE DESVINCULACIÓN CON EL MISMO FORMATO QUE LAS OTRAS
  //
  // Porque sin esto la insignia decía "Desvinculado el 2026-09-30" a dos renglones
  // de "Fecha de ingreso: 1 de Agosto de 2026". Dos formas de escribir una fecha en
  // la misma hoja, y la que se descuadra es la de arriba, que es la que más se lee.
  // MEDIDO en la vista previa, que para eso está.
  const fechaBaja=w.fecha_desvinculacion&&(typeof fechaLarga==='function')
    ? fechaLarga(w.fecha_desvinculacion):w.fecha_desvinculacion;
  const estado=desvinculado
    ? 'Desvinculado'+(fechaBaja?(' el '+fechaBaja):'')
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
    // Y NO EL GRUPO DEL CARGO, QUE NO EXISTE
    //
    // Estaba acá y salía siempre vacío, y eso es peor que no estar: en una ficha
    // archivada un guion dice "este trabajador no tiene grupo", y lo que pasa es que
    // el grupo no se guarda en ninguna parte.
    //
    // El formulario tiene un desplegable de grupo, pero solo sirve para FILTRAR la
    // lista de cargos: no se manda a la base. El cargo es el único que se guarda
    // ("spec"), y de él se deduce el grupo. Poner una fila que nunca puede llenarse es
    // prometer un dato que el sistema no tiene.
    //
    // Si algún día el grupo se guarda de verdad, la fila vuelve acá y se agrega la
    // columna al "upsert" del trabajador, que es lo que hay que tocar primero.
    ['Cargo para las planillas',w.cargo],
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
function imprimirFichaTrabajador(trabajador,opciones){
  // Y EL TRABAJADOR PUEDE VENIR DADO EN ARGUMENTO
  //
  // Porque la pantalla de la ficha es la forma normal de imprimirla: uno elige a
  // alguien del desplegable y se imprime esa. Pero el botón "Guardar e imprimir
  // ficha" de "Nuevo trabajador" recién acaba de crear a alguien y todavía no está en
  // ninguna pantalla abierta, y no lo pone: se pondría solo al listado.
  //
  // Sin este parámetro esa ficha saldría sin nombre o, peor, con el de la persona
  // que estuviera abierta de antes. Con él, la misma función imprime la de quien se
  // le pase.
  //
  // Y CUANDO NO VIENE, ES LA DE LA PANTALLA, COMO SIEMPRE
  //
  // Porque el botón de la pantalla llama a "imprimirFichaTrabajador()" sin
  // argumentos: sin este parámetro devuelve el mismo papel que antes.
  const crudo=trabajador||((typeof fichaEnPantalla!=='undefined')?fichaEnPantalla:null);
  // Y DE AHÍ SALEN LOS DATOS YA TRADUCIDOS A LOS NOMBRES DE ESTA FICHA
  //
  // Porque la ficha se inventó los nombres de varios campos y en la aplicación no
  // existen con esos nombres. MEDIDO en el PDF que salió de la app: el cargo decía
  // "Sin cargo cargado" y el centro de costo decía "—", y los dos están guardados.
  // El detalle de cada campo está en "datosDeLaFicha()".
  const w=datosDeLaFicha(crudo);
  if(!w){
    // Y CON TRABAJADOR NO SE LLEGA AQUÍ: si se pasó uno, hay una ficha.
    //
    // Y CUÁNDO NO SE DICE "NO HAY NINGUNA FICHA ABIERTA" A SECAS
    //
    // Porque este botón se puede apretar sin haber abierto ninguna ficha, y el aviso
    // tiene que decir las dos cosas que se pueden hacer: abrir una ficha de las que
    // ya hay, o guardar un trabajador nuevo con el botón de al lado. Decir solo
    // "no hay ficha abierta" deja a la persona pensando que tocó algo mal.
    alert('No hay ninguna ficha abierta. Para imprimirla, elige un trabajador en la pantalla de ficha, o usa aquí el botón "Guardar e imprimir ficha" al guardar uno nuevo.');
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

    +seccion('A','Datos personales',tablaPares([
      {etiqueta:'RUT',valor:w.rut},
      {etiqueta:'Fecha de nacimiento',valor:w.fecha_nac&&fechaLarga?fechaLarga(w.fecha_nac):w.fecha_nac},
      {etiqueta:'Nacionalidad',valor:w.nacionalidad},
      {etiqueta:'Estado civil',valor:w.estado_civil},
      {etiqueta:'Profesión u oficio',valor:w.profesion},
      {etiqueta:'Comuna',valor:w.comuna},
      {etiqueta:'Teléfono',valor:w.phone},
      {etiqueta:'Correo',valor:w.email}
    ]))

    +seccion('B','Datos del contrato',tablaPares([
      {etiqueta:'Inicio del contrato',valor:w.contrato_fecha_inicio&&fechaLarga?fechaLarga(w.contrato_fecha_inicio):w.contrato_fecha_inicio},
      {etiqueta:'Hasta',valor:w.contrato_fecha_hasta&&fechaLarga?fechaLarga(w.contrato_fecha_hasta):w.contrato_fecha_hasta},
      // Y EL PLAZO CON LA LÍNEA ENTERA
      //
      // Porque es el único dato del contrato que va con fondo de color, y un
      // destacado partido en dos mitades se ve como dos destacados cortados.
      {etiqueta:'Plazo',valor:plazo,destacado:true,completo:true}
    ]))

    +seccion('C','Datos de contratación',tablaPares([
      {etiqueta:'Empresa',valor:cab.empresa},
      {etiqueta:'Centro de costo',valor:cab.centro},
      {etiqueta:'Fecha de ingreso',valor:w.fecha_ingreso&&fechaLarga?fechaLarga(w.fecha_ingreso):w.fecha_ingreso},
      // Y NO EL GRUPO DEL CARGO, POR LO MISMO QUE EN LOS DESTACADOS
      // Ver "datosClave()": el grupo del cargo no se guarda en ninguna parte.
      {etiqueta:'AFP',valor:[w.afp_nombre,w.afp_rut].filter(Boolean).join(' · ')},
      {etiqueta:'Tipo de trabajador',valor:w.tipo_trabajador},
      {etiqueta:'Cargo para las planillas',valor:w.cargo}
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

  // Y LAS OPCIONES DEL LLAMADOR SE SUMAN, NO LO CAMBIAN
  //
  // Porque lo que se le pasa es la ventana ya abierta, que es lo que evita el
  // bloqueo de emergente. Si no viene nada, el motor abre la suya como siempre.
  imprimirPapelEnVentana(html,Object.assign({
    plantilla:'Ficha del trabajador',
    trabajador:w.name||w.code
  },opciones||{}));
}