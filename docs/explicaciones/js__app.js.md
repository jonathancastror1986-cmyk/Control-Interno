# js/app.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ===================================================================
// Un supervisor encuentra a alguien nuevo y anota lo que tiene delante. RRHH le
// pone el código. Nadie más puede hacerlo, y esa separación es el punto: el
// código es la llave de tarjetas, asistencia, EPP y herramientas.
//
// NADA SE ESCRIBE DIRECTO EN UNA TABLA
// -----------------------------------
// Todo pasa por las funciones de la 046, que son security definer. Desde el
// navegador no se inserta ni se lee nada de ingresos_pendientes.
//
// No es un capricho: la 046 enciende el RLS y NO define ninguna política, así
// que la tabla no se puede leer ni escribir sin pasar por la puerta. Si desde
// acá se hiciera un insert directo, fallaría con "new row violates row-level
// security", y con razón.
//
// LAS FUNCIONES QUE YA EXISTÍAN, Y QUE NO SE DECLARAN DE NUEVO
// --------------------------------------------------------------
//   normalizarRut   ya existe: quita todo lo que no sea dígito y la K
//   empresaDelIngreso   ya existe: lee el selector de empresa
//
// No se vuelven a declarar. La regla es una sola: si el archivo ya tiene un
// "function NOMBRE", no se declara otro. Es lo que rompió el intento anterior,
// y la comprobación que lo agarró ya existía y no se había corrido antes de
// escribir.
```


## undefined

```js
// ===================================================================
// LOS DOS DESPLEGABLES ANIDADOS: GRUPO Y CARGO
// ===================================================================
//
// Son dos porque son dos preguntas. La primera es "de qué ÁREA es", que tiene
// pocas respuestas; la segunda es "de qué CARGO es", que tiene muchas y
// además dependen de la primera: los cargos de OBRA no son los de OFICINA.
//
// -------------------------------------------------------------------
// QUÉ SE GUARDA, Y NO ES LO MISMO EN LOS DOS LUGARES
// ----------------------------------------------------
//
// En el TRABAJADOR se guarda solo el cargo. El grupo se deduce de él.
//
// Guardar los dos sería guardar el mismo dato dos veces, y el día que
// alguien moviera un cargo de grupo sin actualizar a la gente que lo tenía,
// el trabajador quedaría en un grupo con un cargo que no es de ese grupo.
// Eso no se ve hasta que la persona recibe el EPP de otra área.
//
// En las CHARLAS y los DOCUMENTOS se guardan los dos, porque ahí la pregunta
// es al revés: "esta charla es para todos los de OBRA" es un papel distinto
// de "esta charla es para los MAESTROS", y las dos cosas tienen que poder
// existir a la vez.
//
// -------------------------------------------------------------------
// LO QUE SE GUARDA ES LA CLAVE, NUNCA EL NOMBRE
// ---------------------------------------------
// El nombre se puede cambiar ("Maestro" a "Jefe de obra") y la clave no. Si
// se guardara el nombre, un cambio de nombre dejaría sin cargo a medio
// mundo sin que nadie lo note.
//
// Y si la 051 no está aplicada, esto no se rompe: la lista queda vacía y el
// ingreso se envía igual, sin cargo. Es la misma degraded que había antes,
// no un error nuevo.
```


## undefined

```js
// LA VERSIÓN, QUE SE VE EN PANTRALA
//
// Y POR QUÉ SE MUESTRA
//
// Porque hace varios turnos que el síntoma es siempre el mismo y no se sabe de qué
// es: "no carga". Y la respuesta siempre era "recargá", que no es una respuesta: no
// dice cómo se sabe que la recarga sirvió.
//
// Con el número en pantalla, se ve. Si dice 123, el código es el nuevo. Si dice
// 120, el navegador tiene lo viejo y hay que recargar de verdad. Y si dice 123 y
// algo igual no funciona, entonces el problema NO es la caché, y se busca en otro
// lado con la cabeza tranquila.
//
// Y VA ABAJO A LA IZQUIERDA, CHIQUITO Y TENUE
//
// Porque es información para cuando algo falla, no parte de la pantalla. Si se
// colgara arriba, molestaría en el uso normal para servir en el anormal.
// Y QUE EL ESTILO NO SEA VIEJO, QUE ES LO QUE MÁS HA PASADO
//
// Y POR QUÉ HAY QUE COMPARAR EL NÚMERO DEL CSS CON EL DEL JAVASCRIPT
//
// Porque "sube-la-version.js" sube el número de los enlaces del HTML y lo escribe
// en "js/versiones.js". Y el CSS, que es un archivo más, lo sube también. Y hay
// un momento en que el navegador tiene el Javascript nuevo y el CSS viejo, porque
// cada archivo se guarda por separado y recargar no siempre los cambia a todos.
//
// Y qué pasa cuando eso ocurre: el Javascript nuevo trae reglas que el CSS viejo no
// tiene, y la pantalla queda a medio camino. No con un error: sin error, que es
// peor. Una barra de pestañas que vuelve a la forma anterior, un botón que
// desaparece del medio, un color que no cuadra. Y no hay forma de saber si es que
// el arreglo no sirvió o que el navegador tiene el archivo de ayer.
//
// Y POR QUÉ EL CSS DICE SU NÚMERO
//
// Porque un archivo de CSS no se puede preguntar por su versión. Con una variable
// "--version-app" escrita en ":root", el Javascript la lee con
// "getComputedStyle" y la compara con el número que él trae. Si no coinciden, el
// estilo es viejo, y eso se dice en pantalla, en grande, y no se adivina.
//
// Y EL NÚMERO LO ESCRIBE "sube-la-version.js", Y LO COMPARA
// "comprueba-la-version.js". Los tres sitios —el HTML, el Javascript y el CSS—
// tienen que decir lo mismo, o el guardián avisa.
```


## undefined

```js
  // Y ESTA ES LA SEGUNDA PUERTA, Y ES LA QUE DE VERDAD IMPIDE ABRIR
  //
  // Porque el filtro del menú es lo que la persona VE, y el menú se puede armar a
  // mano: un botón con "data-v" escrito en la consola, o una vista abierta antes de
  // que terminara de cargar la base. Ocultar el botón no impide abrir la pantalla.
  //
  // Y POR QUÉ VA DESPUÉS DE LA DE PERMISOS, Y NO ANTES
  //
  // Porque si la empresa no tiene el módulo, el permiso que le falta no es el
  // problema y no se debe ir a pedir a un administrador un permiso que no va a
  // servir. Primero se dice que el módulo está apagado para esta empresa.
  // Y ESTA VISTA ES LA ÚNICA QUE SE FILTRA POR ROL Y NO POR MÓDULO
  //
  // "empresa-modulos" prende y apaga módulos, y la política de "empresa_modulos" es
  // "es_admin()": no hay permiso que la abra. El menú la esconde para los demás, y
  // acá se cierra el otro camino, que es llegar con el nombre de la vista escrito
  // a mano.
  //
  // Y POR QUÉ NO SE USA "data-sin-permiso", COMO LAS OTRAS
  //
  // Porque esa marca se resuelve con "VISTAS_POR_PERMISO", que son permisos de rol.
  // Esta pantalla no tiene permiso: depende de ser administradora del sistema. Si se
  // pusiera en esa lista, habría que inventar un permiso "sistema.modulos", meterlo
  // en la base y repartirse, y quedaría una cuarta respuesta a "¿quién puede?" junto
  // a "es_admin()", el permiso y la política. Con tres, alguna se contradice.
```


## undefined

```js
// EL TITULO DEL ENCABEZADO, QUE DICE PARA QUE SIRVE CADA SECCION
//
// Antes decia siempre "Control de Asistencia y Portería", que es el
// nombre del proyecto, no el de la sección que se está mirando. Con
// siete secciones en la barra, un título que no cambia no dice nada.
//
// EL NOMBRE Y LA FUNCIÓN VAN SEPARADOS
// --------------------------------------
// El nombre en negrita y la función en un tono más bajo. Sin esa
// diferencia, "Portería" y "Registro de ingresos y salidas de la obra"
// se leen como una sola frase, y no queda claro cuál de las dos partes
// es el nombre de la sección.
//
// LA FUNCIÓN ES CORTA A PROPÓSITO
// ---------------------------------
// Va en el encabezado, al lado de la empresa y del botón de cerrar
// sesión. Un texto largo ahí empuja el resto y en pantallas angostas
// el botón de cerrar sesión es lo primero que se sale. Lo que hace la
// sección se dice en cuatro o cinco palabras, no en una frase.
//
// Y si algún día se agrega una sección sin descripción, el título
// queda solo con el nombre. No queda en blanco: un hueco vacío en la
// esquina de arriba se lee como que la aplicación se rompió.
```


## undefined

```js
  // Y LOS MÓDULOS, QUE SON UNA PUERTA MÁS, Y NO LA MISMA QUE LOS PERMISOS
  //
  // El permiso dice QUIÉN puede ver la vista. El módulo dice SI ESA EMPRESA tiene
  // esa cosa. Son dos preguntas distintas y se necesitan las dos: si el Reloj/Tótem
  // está apagado para la empresa, que nadie tenga su permiso no alcanza, porque la
  // fila de permisos sigue ahí y basta con que alguien se la dé.
  //
  // Y SE FILTRA LA LISTA QUE SE DIBUJA, NO EL DOM DESPUÉS
  //
  // Porque la línea siguiente hace "sub.innerHTML = ...", que rearma el submenú
  // entero cada vez que se cambia de grupo. Lo que se borrara del DOM volvía en el
  // siguiente clic. Y borrar del DOM tampoco es seguridad: la fila de la base
  // sigue ahí, y el permiso sigue dado.
```


## undefined

```js
  // Cuántas pestañas hay, para saber si toca repartirlas.
  //
  // El reparto solo se hace con más de ocho. Con ocho o menos las pestañas no
  // se pisan y sobra aire a la derecha: repartirlas ahí las estiraría a todas
  // por igual, y una de "Avisos del día" quedaría tan ancha como una de
  // "Relojes". Mucho hueco adentro y nada que leer.
  //
  // Y el ancho de cada una es el de la fila dividido en OCHO, no dividido entre
  // las que hay: así el ancho no cambia cuando se agrega o se saca una pestaña,
  // y lo que cambia es que la fila de abajo tiene una más. Si se dividiera entre
  // las que hay, cada vez que el menú cambiara todas las pestañas cambiarían de
  // ancho, y el menú bailaría al cambiar de sección.
  //
  // Se cuentan los hijos DIRECTOS, que son las pestañas de primer nivel. Los
  // desplegables también cuentan: cada uno es una pestaña con su flecha.
  // Y el conteo de pestañas, que es lo que decide si la fila se marca con "muchas"
  // (más de ocho, y entonces el tope de cada una es la octava parte). Acá no hace
  // falta: las cuatro pestañas de la tarja están escritas en el archivo y no cambian
  // según quién entre. Por eso NO hay un guion que las cuente, y por eso la clase
  // "muchas" no se la pone nunca a esta fila. Queda escrita igual, por si algún día
  // las pestañas pasan a armarse con los permisos de la persona, que es cuando sí
  // harían falta.
```


## undefined

```js
// El submenú se reconstruye en cada showGroup, así que el filtrado por
// permiso hay que reaplicarlo aquí (y no solo en aplicarPermisos).
//
// LO QUE ESTE CÓDIGO HACÍA Y POR QUÉ ESTABA MAL
//
// Ocultaba el botón entero con display:none. Cuando a un supervisor le
// faltaba un permiso, "Asistencia diaria" desaparecía del menú y no había
// forma de saber por qué: podía ser que la vista no existiera, que estuviera
// rota, o que le faltara el permiso. La persona se quedaba con la
// impresión de que la aplicación no tenía esa sección.
//
// Ahora el botón se muestra bloqueado, con candado, y el título dice qué
// permiso falta y quién lo puede dar. Se puede informar. Un menú que se
// calla es peor que uno que muestra un candado.
```


## undefined

```js
// Los supervisores que se pueden ASIGNAR.
//
// Se filtra por estado activo. Antes no se filtraba, y un supervisor
// desvinculado seguía apareciendo en el desplegable: se le podía asignar
// gente a alguien que ya no trabaja acá, y el error no se veía hasta que
// el equipo no cargaba.
//
// El código va en la etiqueta porque hay nombres repetidos: en la base hay
// fichas distintas con el mismo nombre, y sin el código no se sabe cuál
// se está eligiendo. No se "arregla" deduplicando la lista, porque eso
// escondería que hay dos fichas; el aviso va en el listado de
// trabajadores, que es donde se ve la duplicidad.
```


## undefined

```js
// Hay fichas con el MISMO nombre y códigos distintos. No es un error de
// esta pantalla: son dos fichas en la base, y por eso las opciones llevan
// el código, para poder distinguirlas.
//
// LO QUE ESTA MAL ERA AVISAR SIEMPRE
//
// Antes contaba los nombres repetidos sin mirar el estado de las fichas, y
// decía "hay que desvincular la que sobra". Cuando la otra ya estaba
// desvinculada, no había NADA que desvincular: la advertencia era una
// orden imposible de cumplir, y la persona se quedaba buscando cuál era
// la que había que cerrar.
//
// Ahora solo alerta cuando hay DOS fichas ACTIVAS con el mismo nombre, que
// es el único caso donde de verdad hay un problema: dos fichas vivas de la
// misma persona, cada una con su propia asistencia.
//
// Cuando la repetida ya está desvinculada, se dice en una línea que no hay
// nada que hacer, y se nombra cuál es la vieja. Eso también es información
// útil: si la vieja tiene la asistencia del año pasado y la nueva está
// vacía, hay que traspasarla antes de borrar nada.
```


## undefined

```js
  // Y SOLO el caso que es un problema: dos fichas VIVAS del mismo nombre.
  //
  // Antes se avisaba también cuando la repetida ya estaba cerrada, y esa caja se quitó.
  // Decía "Ficha activa: 0045 / Cerrada: 1", y tenía tres cosas malas:
  //
  //   · decía "Cerrada", y no existe ese estado. Los estados son "activo" y
  //     "desvinculado" —"nucleo.js" lee la columna "status" tal cual—. La 029 separó
  //     esas dos cosas a propósito: "fecha_termino" es el dato laboral y
  //     "fecha_desvinculacion" es cuándo se apretó el botón.
  //
  //   · el número no contaba lo que decía contar: "yaResueltos" son los grupos con
  //     exactamente una ficha activa, que son casi todos los nombres repetidos.
  //
  //   · no miraba "fecha_termino", que es lo único que faltaba.
  //
  // Y lo que más pesa: una caja que aparece para decir que todo está bien entrena a
  // la gente a ignorar los avisos, y el que de verdad importa se ignora con ella.
```


## undefined

```js
// ------------------------------------------------------------------
// DESVINCULAR: CON FECHA DE TERMINO Y ARTICULO
// ------------------------------------------------------------------
// Antes era un confirm() y nada mas: ponia la fecha de HOY y se acababa.
// Eso esta bien para el caso facil, y esta mal para el que mas se da al
// ordenar un plano: una persona que se fue hace meses y quedo con la ficha
// abierta. Al cerrarla hoy, la app pasa a decir que termino hoy, y la
// planilla de los meses en que todavia trabajaba queda con la baja en la
// fecha equivocada. Eso no se corrige despues, porque la asistencia ya se
// cargo.
//
// Por eso son DOS fechas y no una:
//  - fecha de termino: cuando termino el contrato. Va en la planilla.
//  - fecha en que se hizo clic: cuando alguien la cerro en la app. Es un
//    dato del sistema, sirve para saber si el dato se puso tarde.
//
// Y el articulo: el del Codigo del Trabajo que se aplico. Lo elige una
// persona y la app NO lo valida. Es un dato que se anota, no que la
// aplicacion pueda calcular, y no se fuerza un valor para que el formulario
// se complete: un articulo inventado es peor que ninguno.
//
// La lista es una ayuda y el campo es de texto libre. Hay casos reales (un
// finiquito, un acuerdo) que no son un numero de articulo y tienen que
// poder anotarse igual.
//
// OJO CON LA LISTA: estos son los articulos que la gente cites de memoria,
// y la lista es una AYUDA, no una lista oficial. Si el caso no esta, se
// escribe. La app no valida nada de esto: colocar un articulo equivocado es
// responsabilidad de quien lo escribe, y por eso el campo acepta texto
// libre en vez de una lista cerrada.
```


## undefined

```js
// ------------------------------------------------------------------
// ¿QUÉ VERSIÓN DE LA APP ESTÁ CORRIENDO?
// ------------------------------------------------------------------
// Existe por un problema concreto: un cambio se subió a GitHub, el
// navegador siguió con la copia vieja en caché, y el error que se veía en
// pantalla era el de la versión ANTERIOR. Se pierde tiempo arreglando algo
// que ya estaba arreglado.
//
// Con este dato se responde en un segundo: si el número de versión del
// navegador es distinto del de la última publicada, hay que recargar con
// Ctrl+F5. La versión se lee del propio archivo (una constante) y la
// publicada, de la etiqueta del último commit.
```


## undefined

```js
// ------------------------------------------------------------------
// EL SUELDO BASE, Y QUIÉN LO VE
// ------------------------------------------------------------------
//
// Y el campo se ESCONDE con "puede('rem.ver')", y se GUARDA con un permiso distinto.
//
// Y no es lo mismo. Ver es para jefatura, que necesita saber lo que gana su gente para
// trabajar. Cargar es de recursos humanos. Si los dos fueran el mismo permiso, la mitad de
// los usuarios del sistema podrían cambiar el sueldo de cualquiera.
//
// Y el guardado NO confía en que el campo esté oculto. Un campo oculto es una cuestión
// de pantalla: el "upsert" se arma en JavaScript y se manda entero, así que reaches "sueldo_base"
// sin que nadie lo haya escrito. Por eso "leerSueldoParaGuardar" devuelve null cuando no
// hay permiso, y no el valor que esté en el campo. Ver [rem-01].
// Y ESTA ES LA DIFERENCIA ENTRE OCULTAR Y GUARDAR
//
// Y hay dos criterios, y NO son el mismo a propósito.
//
// Para OCULTAR un campo: "no sé todavía" se trata como "sí se puede". Porque mientras
// cargan los permisos no se quiere tapar nada al usuario, que ve aparecer campos y
// desaparecerlos. Eso es lo que hace "puede()", y está bien como está.
//
// Para GUARDAR un dato: "no sé todavía" se trata como "NO". Porque un permiso que no se
// conoce es un permiso que no se tiene, y escribir un sueldo sin saber si se puede es
// escribir un sueldo sin permiso.
//
// Y el caso que lo demuestra: sin sesión, "puede" devuelve true para todo —porque
// "misPermisosCargados" es falso y la función lo trata como "no bloquees nada"—, y con
// el criterio de "puede" el guardado pasaba sin permiso.
//
// Y el caso inverso, que también es real: si "soporte.js" todavía no se cargó, "puede" no
// está definida, y compararla contra "undefined" no es lo mismo que preguntar si el
// permiso está. Por eso acá se pregunta por la DEFINICIÓN primero, y por el permiso
// después. Ver [rem-01].
```


## undefined

```js
// ------------------------------------------------------------------
// LOS CENTROS DE COSTO DEL TRABAJADOR
// ------------------------------------------------------------------
//
// Se llenan POR EMPRESA, porque "centros_costo" tiene empresa_id y los centros de una
// empresa no son los de otra. Ver la migración 030.
//
// Y "activo": un centro dado de baja no se ofrece, pero el trabajador que lo tenía lo
// conserva guardado y se sigue mostrando en la ficha. Es la diferencia entre "no lo
// ofrezco para elegir" y "no existe", que es lo mismo que se hizo con los cargos.
//
// Y el que ya venía se vuelve a poner al final, porque al recargar la lista se pierde
// la selección, y sin esto editar a alguien lo deja sin centro y "guardar" se lo borra.
// El "upsert" manda todas las columnas: lo que no está llega como null.
//
// ------------------------------------------------------------------
// QUE LA LISTA DE CENTROS ESTÉ CARGADA, CUANDO SE NECESITA
// ------------------------------------------------------------------
//
// Y una bandera aparte, y no la longitud del arreglo. La longitud no sirve: con una
// empresa que no tiene centros, la lista vacía es CORRECTA y volver a preguntar cada vez
// sería una consulta por cada apertura del formulario. Ver [centro-05].
//
// Y devuelve la promesa, para que quien la llame pueda esperar. Y no lanza: si falla, el
// error queda en el aviso del panel de relojes, que es donde se viene viendo.
//
```


## undefined

```js
        // El sueldo base, con permiso propio. Va antes que el resto porque es el único
        // campo que puede salir en null aunque el usuario lo haya escrito: sin
        // "rem.editar" no se manda. Ver [rem-01].
        //
        // Y SE PASA "existing", NO "worker". Estaba "worker", y eso nunca funcionó:
        // "worker" es el objeto que se está construyendo en esta misma línea, así que
        // todavía está en su zona muerta, y la línea tiraba
        //
        //     ReferenceError: Cannot access 'worker' before initialization
        //
        // antes de que se guardara nada. Todo guardado desde este formulario fallaba.
        // Lo que la función necesita es "el sueldo que ya tenía", que es "existing".
```


## undefined

```js
// ------------------------------------------------------------------
// FECHAS QUE VIENEN DE EXCEL
// ------------------------------------------------------------------
// El problema que se estaba arreglando: un CSV con "2026-01-09" es un
// archivo correcto, pero al leerlo SheetJS lo tomaba como fecha, lo
// corría por la zona horaria del navegador y lo devolvía formateado
// como "1/8/26" (mes/día/año, año de dos dígitos). Ese texto ya no era
// el que había escrito nadie, así que la validación lo rechazaba y
// decía "usar AAAA-MM-DD" justo cuando el usuario SÍ lo había puesto
// bien. El archivo estaba bien; el que leía, mal.
//
// La corrección de raíz está en la lectura (raw:true al abrir el
// archivo), que deja la fecha como texto tal cual. Acá queda lo que
// falta: que la carga no dependa de que el archivo se haya generado de
// cierta manera.
//
// Se aceptan:
//   · AAAA-MM-DD            (el de la plantilla; sin ambigüedad)
//   · DD/MM/AAAA            (como se escribe en Chile: 09/01/2026)
//   · el número de serie de Excel (46031 = 2026-01-09; es lo que trae
//     una celda de tipo fecha de un .xlsx, y no tiene ambigüedad)
//   · un objeto Date
//
// Nota sobre "5/3/2026": se lee como 5 de marzo, por ser la convención
// chilena y la que dice la plantilla. Si algún día llegara un archivo
// exportado con formato inglés, esa fecha se leería al revés. Cuando
// el día es mayor que 12 no hay problema: "25/03/2026" solo puede ser
// 25 de marzo.
```


## undefined

```js
// ------------------------------------------------------------------
// LEER UN SUELDO ESCRITO DE CUALQUIER FORMA
// ------------------------------------------------------------------
//
// Y "Number()" no sirve. Un sueldo llega escrito de por lo menos cuatro maneras, y todas
// valen lo mismo:
//
//     500000        número pelado
//     500.000       con punto de miles, que es como lo escribe la gente
//     $500.000      con el signo de pesos adelante
//     "500 000"     con espacio, que es lo que sale al pegar de una tabla
//
// "Number('500.000')" da NaN. Y un NaN en el "upsert" es peor que un error: PostgreSQL
// lo acepta en una columna numérica como si fuera cero, y el sueldo de alguien se vuelve
// cero sin que nadie lo note. Ver [rem-02].
//
// Y lo que NO se acepta: un número negativo. Un sueldo negativo es un error de tipeo, y la
// migración 069 tiene un "check" que lo rechaza —pero el mensaje que llega es de Postgres
// y no dice qué hacer. Acá se dice antes.
```


## undefined

```js
// ------------------------------------------------------------------
// QUÉ LE FALTA A ESTA PERSONA
// ------------------------------------------------------------------
//
// Y no es una lista escrita a mano de "requisitos": cada renglón mira un campo que se
// sabe si está, y devuelve solo los que están vacíos. Si mañana se agrega un campo
// nuevo, esta función no lo sabe y no lo avisa — que es lo correcto, porque inventar un
// requisito que nadie pidió es peor que no avisar.
//
// Y NADA de esto es legal. Ver el comentario de arriba. Lo que sí es legal vive en
// "firma_autorizaciones".
//
```


## undefined

```js
// ---------- supervisores ----------
// ============================================================
// ASISTENCIA DIARIA DEL SUPERVISOR
// Lista de su gente para un día. Cada uno pasa su tarjeta y queda
// presente con la hora real de entrada. Si al fichar hay algo que
// resolver (llegó tarde, la asistente social lo busca, prevención
// tiene algo que decirle) se abre una ventana con el detalle y a qué
// tiene que ir.
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
```


## undefined

```js
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
```


## undefined

```js
// ============================================================
// CONCILIACIÓN: LA PLANILLA CONTRA EL RELOJ
// ============================================================
// El caso: un trabajador no fichó, pero el supervisor lo vio entrar y lo
// marca. Eso está bien hecho, pero la planilla queda diciendo "presente"
// sin que quede dicho QUIÉN decidió eso ni POR QUÉ. Después nadie puede
// responder por una marcación que se hizo de palabra.
//
// Así que al marcar sin marcaje del reloj, la app no solo marca: escribe
// un aviso que Administración tiene que CONFIRMAR. La confirmación es lo
// que lo convierte en un registro y no en un dato suelto.
//
// El aviso NO lo confirma quien lo mandó. La política de la base lo
// impide: confirmar usa el permiso de "aprobar cambio", no el de marcar.
// Un supervisor no puede darse por buena su propia indicación.
```


## undefined

```js
// La bandeja de Administración. Acá es donde el aviso deja de ser "alguien
// dijo que sí" y pasa a ser un registro confirmado: quién lo mandó, por
// qué, quién lo confirmó y qué respondió.
// ============================================================
// BITÁCORA DE ACCESO
// ============================================================
// Se lee acá y no en un informe aparte porque la pregunta "quién estuvo
// en el sistema el martes" la hace quien está mirando aprobaciones.
//
// Las sesiones que se cerraron solas (pestaña cerrada, red caída) NO
// tienen registro de salida: el navegador no avisa. Se deducen por el
// hueco. Marcarlo como "cierre" sin más sería mentir sobre lo que pasó,
// así que se muestra la hora en que empezó la siguiente.
```


## undefined

```js
// Marcar desde la conciliación. Es distinto de "Marcar y avisar" a
// propósito: acá el reloj YA tiene la marcación y lo que falta es
// reflejarla en la planilla. No hay nada que confirmar, porque la fuente es
// el reloj y no la palabra de una persona.
//
// QUE HAGA ALGO DE VERDAD, QUE NO HACÍA ANTES
//
// El caso "falta marcar" es, por definición, uno en que el marcaje YA
// existe: el reloj lo vio y la planilla no lo tiene. Llamar a
// registrarMarcaje() ahí no servía de nada, porque esa función sale
// temprano cuando el marcaje ya está, y la planilla seguía igual. El
// botón no hacía nada y no se veía por qué.
//
// Por eso el orden es: primero se asegura el marcaje (si falta) y
// después se escribe la planilla SIEMPRE. Que la planilla se actualice es
// el punto de este botón.
```


## undefined

```js
// -------------------------------------------------------------------
// FILTRAR LAS ESPECIALIDADES CON LO QUE SE ESCRIBE ARRIBA
// -------------------------------------------------------------------
//
// Y el campo "Nombre de la especialidad" filtra la lista de abajo mientras se escribe.
//
// Y está en el campo de ARRIBA y no en un buscador aparte, porque el campo ya está ahí
// con el botón "Crear especialidad" al lado. Un buscador aparte obliga a escribir el mismo
// nombre dos veces: una para buscar y otra para crear. Y la segunda daba el aviso de
// "ya existe".
//
// Y el filtro es sobre el NOMBRE y no sobre la clave, porque el que escribe es una
// persona que ve "Albanil" y no "albanil".
//
// Y EL FILTRO ES UNA VARIABLE, no un atributo del "<div>", porque
// "renderEspecialidades()" repinta el "<div>" entero. En un atributo, el repintado lo
// borraría y la lista volvería a mostrar todo sin avisar —que es el peor resultado: el
// filtro parecería roto y en realidad se habría deshecho solo—.
```


## undefined

```js
// ============================================================
// MULTI-EMPRESA
// Hay varias empresas en el sistema. Cada trabajador pertenece a
// una, y cada usuario del sistema solo ve los trabajadores de las
// empresas a las que tiene acceso (por eso "workers" se filtra al
// cargar: así todo lo demás —tarja, EPP, tarjetas— queda acotado).
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
```


## undefined

```js
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
```


## undefined

```js
// La lista de variables, siempre a la vista mientras se pega.
// ===================================================================
// BAJAR LA PLANTILLA EN WORD
// ============================================================
//
// LA PANTALLA DEL ANDROID TV BOX
// ------------------------------
// El reloj se deja ahí, en la portería, plugged in, con la pantalla siempre
// encendida. Eso obliga a que la pantalla esté bloqueada: si el trabajador
// puede tocar la barra del navegador o cerrar la pestaña, el reloj deja de
// marcar y nadie se entera hasta que se revisa la asistencia del día.
//
// CÓMO SE SALE
// ------------
// Con el botón no. Con CINCO pulsaciones seguidas en una esquina, y después
// una clave de seis dígitos.
//
// Las cinco pulsaciones no son un adorno: son para que el que está en la
// portería no saque el kiosco sin querer. Un dedo apoyado durante un segundo
// en un kiosco genera cinco eventos de toque.
//
// Y las cinco van en una ESQUINA, no en toda la pantalla. En una obra con
// paso de gente, cinco toques consecutivos en cualquier parte pasan todos los
// días; en la esquina superior izquierda, casi nunca. La esquina es invisible:
// si se le pone un ícono, es un botón de salida, y entonces el bloqueo no
// protege de nada.
//
// POR QUÉ LA CLAVE SE VERIFICA EN EL SERVIDOR Y NO EN EL NAVEGADOR
// ---------------------------------------------------------------
// La clave viaja al servidor, se hashea ahí y se compara con el hash. En el
// navegador nunca hay una clave, y leer el código no sirve para desarmar el
// kiosco. Es lo mismo que se hizo con el token del reloj en la migración 030,
// y por el mismo motivo: un secreto que está en el cliente no es un secreto.
//
// EL BLOQUEO REAL
// ---------------
// `modo-kiosco` oculta la barra del tótem y el botón de salir, quita el
// cursor y bloquea el scroll. NO bloquea el campo de texto, porque el lector
// QR USB escribe por teclado: si el campo no acepta foco, el reloj no marca.
//
// Y no es un candado de verdad contra alguien que sabe lo que hace: con
// DevTools abierto se puede quitar la clase del body. Contra eso está la
// clave del servidor, no el CSS. Lo que el CSS evita es el accidente, que es
// lo que de verdad pasa.
// ============================================================
```


## undefined

```js
// ============================================================
// GENERAR Y ROTAR LA CLAVE DESDE LA PANTALLA DE RELOJES
// ===================================================================
//
// Lo que se le entrega a una persona el primer día: la inducción, la
// declaración de salud, los elementos de protección, el acta de
// recepción. En papel, firmado, con el timbre de la empresa.
//
// TRES PIEZAS Y POR QUÉ NO SE MEZCLAN
//
//  1. La PLANTILLA. La escribe Prevención y se puede cambiar.
//  2. La ENTREGA. El papel firmado por una persona en una fecha. Esa no
//     se toca más: si se borra, se borra la prueba de que la persona fue
//     inducida. Se anula, que es distinto, y queda el rastro.
//  3. El TIMBRE. Sale de la tabla `empresa`, que ya tiene nombre y RUT. No
//     se duplican acá: si el timbre tuviera su propio nombre, algún día los
//     dos dicen cosas distintas y el que vale es el del papel.
//
// POR QUÉ EL PDF SE GENERA RENDERIZANDO, NO ESCRIBIENDO TEXTO
//
// Escribir el PDF a mano con una librería obliga a elegir una fuente
// Metrics, y la fuente que traen esas librerías no tiene ñ, ni á, ni é. Con
// texto español sale "A\ufff1ez" o directamente nada. Hay que subir una
// fuente completa embebida, que son varios cientos de kilobytes.
//
// Renderizando el HTML con html2canvas y metiéndolo en el PDF se usa la
// fuente que está mirando la persona, con sus tildes, y además el timbre y
// la firma salen exactamente como se ven en pantalla. El costo es que el
// texto del PDF no es seleccionable. Para un papel firmado eso no es una
// pérdida: nadie busca texto adentro de un acta firmada.
//
// LA ESPECIALIDAD DEL TRABAJADOR
//
// La decide una persona desde la ficha. NO se adivina del texto libre del
// cargo: adivinar significa que el primero que quede mal recibe la charla
// del oficio equivocado, que es peor que no recibir ninguna.
// ============================================================
```


## undefined

```js
// ===================================================================
// EL ENCABEZADO SE ENCOGE AL BAJAR
// ===================================================================
//
// Tres bloques y un diálogo. Todo se apoya en la 050 y la 051, que ya están
// aplicadas: esto no agrega migraciones, es la pantalla que faltaba.
//
// -------------------------------------------------------------------
// LA LISTA VIENE DE LA BASE, NO DE AQUÍ
// -------------------------------------------------------------------
// jerarquia_cargos() ya trae el filtro por empresa de la 050. Si esta pantalla
// cruzara los datos por su cuenta estaría haciendo en el navegador lo que la
// base ya hace, y un día las dos cosas no coinciden y no se sabe cuál manda.
//
// Y el filtro es lo que importa: una empresa que no maneja gasfitería no debe
// ofrecerla, porque alguien la elige y recibe un kit que ahí no existe.
// -------------------------------------------------------------------
```


## undefined

```js
// -------------------------------------------------------------------
// LOS GRUPOS
// -------------------------------------------------------------------
// Salen de la misma jerarquía, sin pedir nada extra. Un grupo que no aparece es
// que no hay ningún cargo en él, y eso se ve distinto de "el grupo no existe".
// -------------------------------------------------------------------
// LE TOCA A: TODOS, UN GRUPO, O UN CARGO
// -------------------------------------------------------------------
// El texto de la lista. Dice a QUIÉN le toca y con qué palabras, porque "obra"
// y "maestro" son cosas distintas y una lista que solo muestra la clave obliga
// a saber la clave de memoria.
//
// Y las tres respuestas se distinguen a propósito: "A todo el mundo" no es lo
// mismo que "al grupo obra", y confundirlas es como se terminaba mandando la
// charla de una obra al personal de oficina.
```


## undefined

```js
// -------------------------------------------------------------------
// UN SOLO ESCUCHADOR PARA TODAS LAS CASILLAS
// -------------------------------------------------------------------
// Las casillas se pintan y se borran cada vez que se elige otra empresa, así que
// el escuchador va en la CAJA y no en cada casilla. Uno solo, para todas, y no
// se acumula ninguno.
//
// Y la clave sale del data-cargo del label, no del onclick. Por eso aquí no hay
// ninguna comilla que escapar.
// -------------------------------------------------------------------
// LAS VENTANITAS DE AYUDA
// -------------------------------------------------------------------
// Tres cosas que un <details> no trae solo:
//
//   1. Cerrar con Escape. Una ventana que no se cierra con Escape hay que
//      cerrarla volviendo a apretar el ícono a ciegas.
//   2. Cerrar las demás al abrir una. Si quedan dos abiertas, la pantalla se
//      llena de cajas y ya no se sabe cuál es cuál.
//   3. Cerrar al hacer clic afuera, que es lo que uno espera sin pensarlo.
//
// Y solo se escucha una vez en todo el documento. Si se pusiera un
// escuchador por ayuda, abrir y cerrar la pantalla los acumularía.
//
// Se usa el evento "toggle" y no el clic, porque el clic no se dispara
// cuando el <details> se abre con el teclado.
// -------------------------------------------------------------------
// EL LOGO LLEVA A LA PANTALLA PRINCIPAL
// -------------------------------------------------------------------
// Es un <a> con href, y no un <div> con un onclick. La diferencia no es de
// estilo: es que con un <a> el logo se puede abrir en una pestaña nueva, se
// puede copiar el enlace y se puede llegar con el teclado. Con un <div> no.
//
// El preventDefault lo deja dentro de la aplicación: si no, el navegador
// saltaría al ancla y recargaría la página, que en una aplicación de una
// sola pantalla pierde todo lo que estaba cargado.
//
// Y sube al tope, porque si la persona estaba media página abajo, cambiar de
// vista sin volver arriba la deja mirando la parte de en medio de la
// pantalla nueva, que está en blanco.
```


## undefined

```js
// -------------------------------------------------------------------
// EL MENÚ DEL MÓVIL
// -------------------------------------------------------------------
// Un botón abre y cierra las dos barras. En la pantalla grande no existe:
// ahí las barras están siempre a la vista y el botón estorbaría.
//
// Se usa una clase en el body y no un estilo directo, porque el estado tiene
// que poder leer el CSS: el botón cambia de ícono y las barras cambian de
// alto, y las dos cosas salen del mismo lado.
//
// Y aria-expanded es lo que le dice a un lector de pantalla si el menú está
// abierto. Sin eso, el botón dice lo mismo abierto que cerrado.
```


## undefined

```js
  // ----------------------------------------------------------------
  // LO PRIMERO: ¿SE PUDO HABLAR CON LA BASE?
  // ----------------------------------------------------------------
  // Antes de cualquier otra cosa. Si la librería de la CDN no cargó, o
  // falta la configuración, window.supabaseClient no existe y el primer uso
  // revienta.
  //
  // Como el arranque es una lista de awaits, el primero que falla corta
  // todos los que vienen después: la pantalla queda con el encabezado y la
  // barra de secciones vacía, sin decir por qué. Y el síntoma se reporta
  // como "no se ven los submenús", que no dice nada de la causa: la causa
  // no es el menú, es que no hay conexión con la base.
```
