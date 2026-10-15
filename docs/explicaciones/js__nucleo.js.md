# js/nucleo.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
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
```


## undefined

```js
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
```


## undefined

```js
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
```


## undefined

```js
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
```


## undefined

```js
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
```


## undefined

```js
    // Y POR QUÉ ESTÁ SEPARADO DE "EMPRESAS: CARGOS Y PERMISOS", Y NO ADENTRO
    //
    // Porque "cargos y permisos" es una pantalla de RRHH: qué oficios maneja la
    // empresa y qué puede ver su gente. Y esta es de administración del sistema:
    // qué productos contrató la empresa. Son preguntas distintas, de gente distinta,
    // y mezclarlas haría que un encargado de RRHH viera botones que no puede
    // usar.
    //
    // Y además esta pantalla solo la ve el administrador del sistema. Está anotado
    // en "filtrarNavItemsNoAdmin", que la saca del menú para todos los demás, y la
    // base la impide igual: la política de escritura de "empresa_modulos" es
    // "es_admin()" y no hay permiso que la abra.
```


## undefined

```js
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
```


## undefined

```js
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
```


## undefined

```js
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
```


## undefined

```js
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
```
