# js/modulos.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ===================================================================
// LOS MÓDULOS QUE TIENE CADA EMPRESA
// ===================================================================
//
// ---------------------------------------------------------------------
// ESTE ARCHIVO CONTESTA UNA PREGUNTA, Y ES DISTINTA DE LA DE LOS PERMISOS
// ---------------------------------------------------------------------
//
//     ¿QUÉ PUEDO HACER?          lo contesta "tiene_permiso()"
//     ¿QUÉ EXISTE AQUÍ?          lo contesta este archivo
//
// Un permiso no puede contestar la segunda. Si el Reloj/Tótem se apaga quitándole
// el permiso a todos, la fila de permisos queda exactamente como estaba, y alcanza
// con que alguien se la dé para que el reloj vuelva. Y al revés: si el módulo se
// apaga borrando permisos, se pierde la información de QUIÉN podía ver la tarja.
//
// Las dos puertas se miran juntas. Si falta una de las dos, no se abre. Ver
// "mostrarVista" y "showView".
//
// ---------------------------------------------------------------------
// Y LA TABLA QUE RESPONDE ESTO
// ---------------------------------------------------------------------
//
// "empresa_modulos", de la migración 085. Y la regla que la define:
//
//     SIN FILA = APAGADO
//
// No es la regla habitual, y es a propósito. Lo habitual es que un sistema venga
// con todo prendido y uno apague lo que no quiera; acá una empresa sin fila no
// tiene NINGÚN módulo. El motivo es que la fase actual es "Control Interno" y el
// Tótem no está certificado: con "prendido por defecto", un módulo nuevo aparece
// solo en todas las empresas y el único trabajo hecho es el de apagarlo.
//
// ---------------------------------------------------------------------
// Y LA LISTA DE MÓDULOS TIENE QUE COINCIDIR CON EL "CHECK" DEL SQL
// ---------------------------------------------------------------------
//
// La tabla 085 tiene un "check" con los mismos doce nombres. Si un módulo está acá
// y no en el SQL, el "upsert" del panel falla con un error de "check" y se ve
// enseguida. Y al revés: un módulo en el SQL que no esté acá, la aplicación no lo
// conoce y no lo usa. Un módulo que ninguno de los dos lados conoce no hace nada,
// que es la forma más tranquila de tener un módulo roto.
//
// El guardián "comprueba-modulos.js" compara las dos listas en cada corrida.
// ---------------------------------------------------------------------
// LA LISTA
// ---------------------------------------------------------------------
// Y CON ESTA FORMA, UNA PALABRA POR RENGLÓN, PARA PODER COMPARARLA CON EL SQL
```


## undefined

```js
// Y EL MÓDULO DE CADA VISTA
//
// Y TODAS LAS VISTAS TIENEN QUE ESTAR ACA
//
// Se comparan contra "VISTAS_POR_PERMISO", que es la lista de vistas con permiso
// (en "views/soporte/soporte.js"). Una vista que está en esa lista y no está en
// esta no tiene módulo: el guardián lo avisa.
//
// Y POR QUÉ "RELOJES" Y "MARC AJES" ESTÁN SEPARADOS, QUE ES LO MÁS IMPORTANTE
//
// Porque son cosas distintas y confundirlas fue el primer error:
//
//     reloj      el APARATO. Tótem, kiosco, reloj en la obra. No certificado.
//     marcajes   los DATOS. Subir las marcas del sistema de asistencia y cruzarlas.
//
// Los datos no necesitan el aparato. Y son justamente los que hacen falta ahora
// para poder verificar el Tótem después.
```


## undefined

```js
// ---------------------------------------------------------------------
// ¿ESTA PERSONA ES ADMINISTRADORA DEL SISTEMA?
// ---------------------------------------------------------------------
// Y "soyAdmin()" YA EXISTE, Y NO SE REPITE
//
// Está en "views/soporte/soporte.js", al lado de "puede()", y hace lo mismo: mira
// si "misRoles" tiene "admin". Los archivos comparten el ámbito, así que definirla
// otra vez acá no agrega nada: una de las dos pisa a la otra según cuál cargó
// último, y las dos son iguales ahora, hasta que alguien cambie una. Ver
// [word-04].
//
// Y LA BASE TIENE "es_admin()", QUE ES LA QUE MANDA
//
// Porque es la que revisan las políticas de RLS, y con la 073 el administrador ya
// no tiene acceso total por la puerta de atrás. Si el Javascript dijera "sí" y la
// base dijera "no", se vería un botón que no funciona.
//
// Y NO SE USA UN PERMISO NUEVO, Y POR QUÉ
//
// Un permiso como "sistema.modulos" tendría que existir en la tabla "permisos",
// en "roles_permisos", y repartirse. Eso es una migración más que hay que correr
// desde el panel, y para una pantalla que solo ve el administrador del sistema.
//
// "es_admin()" ya responde la pregunta, y la base la usa igual. Con eso, la
// pantalla y la política están de acuerdo por construcción, y no hay una tercera
// respuesta que pueda contradecir a las otras dos.
//
// Y EL "ADMIN_SIEMPRE_TODO" DE ARRIBA USA ESTA MISMA FUNCIÓN
//
// Y SE DEJA TAMBIÉN EN "window", PORQUE EL FILTRO DE ARRIBA LO USABA
//
// Y se sincroniza cada vez que cambian los roles, que es lo que pasa al promover a
// alguien en Soporte. Sin esto, un administrador nuevo tenía que recargar la
// página para que le apareciera la pantalla.
```


## undefined

```js
// ---------------------------------------------------------------------
// ¿EL ADMINISTRADOR PASA TODO?
// ---------------------------------------------------------------------
// Y ESTO SE PREGUNTA EN CADA USO, Y NO SE LEE DE "window"
//
// Y POR QUÉ, CUANDO HABÍA UNA VARIABLE PARA ESO
//
// Porque "window.esAdminDelSistema" es una COPIA que se sacaba una sola vez, cuando
// se cargaban los roles. Si esa copia quedó en "false" —porque se preguntó antes de
// que llegaran los roles, o porque el archivo que la escribe no cargó— el
// administrador quedaba tapado como cualquier otro, sin ningún aviso.
//
// Y eso es lo que pasó: el bypass existía, comparaba bien, y no se activaba. Un
// administrador que no ve un módulo es la peor forma de falla un bypass: parece que
// el módulo está apagado, y no lo está.
//
// Y LA RAZÓN DE QUE SIGA HABIENDO LA VARIABLE
//
// Porque hay código que la lee, y sacarla sería romperlo. Lo que se deja es que se
// calcule sola, y que esta función sea la que decide.
```


## undefined

```js
// ---------------------------------------------------------------------
// EL ESTADO, Y POR QUÉ NO SE CALCULA EN EL MOMENTO DE USARLO
// ---------------------------------------------------------------------
// Y SE GUARDA UNA VEZ, NO SE PREGUNTA CADA VEZ
//
// Porque "moduloActivo" se llama en cada botón del menú, en cada cambio de vista y
// en cada clic. Si cada llamada hiciera un "select" a la base, el menú se volvería
// a dibujar tan lento que se va a notar, y en un teléfono se nota mucho.
//
// Y ADEMÁS: LA CONSULTA NO PUEDE HACERSE EN CADA USO POR UNA RAÓN DE SEGURIDAD
//
// El RLS de "empresa_modulos" deja ver solo las empresas del usuario. Si la
// consulta se hiciera cada vez y el ámbito cambiara, se leería distinto según el
// momento. Leyéndola una vez, con el ámbito ya resuelto, lo que se ve es una foto
// fija de lo que esa persona tenía al entrar.
//
// Y EL CAMBIO DE ÁMBITO, QUE ES LO QUE SÍ SE RECARGA
//
// Si la persona cambia de empresa en el selector de arriba, hay que volver a leer.
// Ver "recargarModulos".
```


## undefined

```js
// Y EL ADMINISTRADOR DEL SISTEMA
//
// Y POR QUÉ LO ADMINISTRADOR ENTRA A TODO, SIENDO QUE EL MÓDULO ESTÁ APAGADO
//
// Porque el administrador es quien CERTIFICA el Tôtem. Si no puede abrirlo nunca,
// no hay manera de probarlo: habría que prender el módulo para todas las empresas
// cada vez que se quiere hacer una prueba, y después acordarse de apagarlo.
//
// Con esto, el módulo apagado esconde la pantalla a los usuarios de empresa —que
// es lo que importa— y le deja la puerta abierta al que tiene que probarla.
//
// Y SI ESTA DECISIÓN SE QUIERE CAMBIAR, ES ESTA LÍNEA, Y NADA MÁS
```


## undefined

```js
// Y LA LISTA DE EMPRESAS QUE SE ESTÁ MIRANDO AHORA
//
// Y DEVUELVE "null" CUANDO TODAVÍA NO SE SABE, QUE ES DISTINTO DE "NO HAY NINGUNA"
//
// Y esa diferencia es todo el fallo que se corrigió
//
// "loadPermisosUsuario()" —que es donde se leen los módulos— corre ANTES que
// "loadEmpresas()". Está en ese orden en "js/app.js", y es el correcto: los
// permisos no dependen de la lista de empresas y la lista sí se necesita para
// otras cosas.
//
// El problema es qué se hace mientras la lista está vacía. Antes, una lista vacía
// se leía como "esta persona no tiene ninguna empresa", y de ahí salía "no hay
// módulos". Resultado: al abrir la aplicación, con los once módulos
// correctamente prendidos en la base, todo salía bloqueado:
//
//     La empresa no tiene este módulo contratado. La pantalla "porteria" es del
//     módulo "porteria", que está apagado para las empresas a las que tenés acceso.
//
// Y el mensaje era VERDADERO Y ESTABA MAL A LA VEZ: la empresa sí tenía el módulo;
// lo que no se sabía era todavía cuál era su ámbito.
//
// Por eso devuelve "null" mientras no se sepa, y "moduloActivo" deja pasar. Es la
// misma regla que con "modulosCargados": mientras no se sabe, no se cierra nada.
// Y después, "aplicarModulos()" vuelve a pintar cuando la lista llega.
```


## undefined

```js
// ---------------------------------------------------------------------
// LA PREGUNTA
// ---------------------------------------------------------------------
// Y CUATRO CASOS, Y CADA UNO TIENE SU MOTIVO
//
//  1. Si no hay vista o no tiene módulo, se deja pasar. No inventar un módulo para
//     una vista que no está en la lista: bloquear una vista por un dato que no se
//     tiene es peor que no bloquearla.
//
//  2. Si todavía no se leyó la base, se deja pasar. Mientras carga, bloquear todo
//     dejaría la aplicación vacía un instante en cada arranque, y un fallo de red
//     dejaría la aplicación inservible. El aviso dice que no se pudo leer.
//
//  3. El administrador entra a todo. Ver arriba.
//
//  4. Con la base leída: tiene que estar el módulo en TODAS las empresas del
//     ámbito. "Sin fila = apagado" es lo que hace el resto.
```


## undefined

```js
// Y CERO FILAS LEÍDAS NO ES "TODO APAGADO": ES "NO SE SABE"
//
// Y ESTA ES LA REGLA QUE FALTABA, Y LA QUE ESTABA ROMPIENDO LA APLICACIÓN
//
// La consulta a "empresa_modulos" puede devolver CERO filas sin que haya un solo
// módulo apagado en el sistema. Pasa cuando el RLS no deja ver nada a esta persona,
// y entonces "sin fila = apagado" —que es la regla correcta para una empresa— se
// convierte en "todo el mundo tiene todo apagado", que es un conclusión que
// nobody drew.
//
// Y es un error que se ve fatal: la aplicación entera queda bloqueada, y el aviso
// dice "la empresa no tiene este módulo contratado", que es VERDAD Y ESTÁ MAL A LA
// VEZ. La empresa sí lo tenía; lo que no se pudo ver fue la fila.
//
// Y POR QUÉ CERO FILAS ES "NO SE SABE" Y NO "NADA CONTRATADO"
//
// Porque una instalación real SIEMPRE tiene filas: el guion de encendido creó once
// por empresa. Si alguien llega a cero, o no se aplicó el guion, o el RLS ocultó
// todo, o se está mirando otra base. En los tres casos, tapar la pantalla entera no
// ayuda a nadie: deja la aplicación sin usar y sin explicación.
//
// Y LA DIFERENCIA CON "ESTA EMPRESA NO TIENE EL MÓDULO"
//
// Eso sí se ve, y se sigue respetando: si hay filas y esta empresa no tiene la
// suya, el módulo está apagado y se avisa. Lo que no se hace es confundir "no hay
// datos" con "todo está apagado".
```


## undefined

```js
// ---------------------------------------------------------------------
// LA PANTALLA QUE PRENDE Y APAGA
// ---------------------------------------------------------------------
// Y POR QUÉ ESCRIBE "empresa_modulos" Y NO OTRA TABLA
//
// Porque "empresa_modulos" es exactamente la tabla que hace falta para esto, y ya
// tiene lo que se le pidió: qué módulos tiene cada empresa y si están prendidos.
// Agregar una pantalla y una tabla nueva para lo mismo sería la segunda fuente de
// verdad, que es donde empiezan los datos que no coinciden entre sí.
//
// Y LO QUE NO ESTÁ, DICHO DE ANTEMANO
//
// No queda registrado QUIÉN apagó un módulo ni CUÁNDO. Sólo queda la fecha de la
// fila. Para auditarlo hace falta una columna más y una pantalla de historial, y
// no se hizo.
//
// Lo que sí queda es la fila con "activo = false": el módulo está apagado, pero se
// ve que existe y que alguien lo apagó a propósito. Eso es lo que permite
// distinguir "lo apagó alguien" de "nunca se prendió", que con sólo las filas
// prendidas no se distinctions.
```


## undefined

```js
// ---------------------------------------------------------------------
// FILTRAR EL MENÚ
// ---------------------------------------------------------------------
// Y SE FILTRA LA LISTA QUE SE DIBUJA, NO EL DOM
//
// Esta es la parte que el pedido llamaba "borrar con remove()", y por qué no:
// "showGroup" hace "sub.innerHTML = items.map(...)" cada vez que se cambia de
// grupo. Lo que se borre vuelve en el siguiente clic. Además, borrar del DOM no es
// seguridad: la fila de la base sigue ahí y el permiso sigue dado.
//
// Lo que hace falta son dos cosas, y las dos están: esta función, que no dibuja
// lo que no corresponde, y "aplicarModulos", que impide abrir la vista aunque se
// llegue a ella por otro camino.
//
// Y DEVUELVE UNA COPIA, SIN TOCAR "navGroups"
//
// Porque "navGroups" es una constante compartida por todos los usuarios que se
// abren en la misma pestaña: si se filtrara en el sitio, el cambioduraría para los
// demás y al cambiar de empresa no se podría volver a pintar todo.
```


## undefined

```js
    // Y LA PANTALLA DE MÓDULOS SOLO PARA EL ADMINISTRADOR
    //
    // Sin esto, un encargado de RRHH vería "Empresas: módulos" en el menú, entraría,
    // y la base le rechazaría cada escritura con un error de RLS que en pantalla es
    // un "new row violates row-level security policy" que no significa nada para
    // quien lo lee.
    //
    // Es la única vista que se filtra por rol y no por módulo, y por eso está
    // explícita acá y no en una lista más. La base sigue siendo la que manda.
    // Y CON "typeof" PORQUE "soyAdmin" ESTÁ EN OTRO ARCHIVO
//
// "soyAdmin" vive en "views/soporte/soporte.js", que se carga DESPUÉS que este
// archivo. While está definido cuando se llega a usar —que es después de iniciar
// sesión—, si ese archivo llegara a fallar, acá la llamada saltaría y con ella el
// menú entero. Con "typeof" no salta: la pantalla no se muestra y el resto sigue.
```
