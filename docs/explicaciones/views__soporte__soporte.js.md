# views/soporte/soporte.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ============================================================
// El alta se decide acá y no en el panel de Supabase por dos razones:
//
//  1. El envío de invitaciones de Supabase manda un enlace a la "Site
//     URL" configurada en el proyecto, que suele ser localhost: la
//     persona recibe un link que no abre. Con este flujo no hay correo
//     ni redirección: la app le da el enlace directo a registro.html.
//
//  2. Al registrarse, el trigger handle_new_user (migración 019) le
//     aplica los roles, la empresa y la ficha que se eligen acá. No
//     hay que buscarla después a mano para "activarla".
//
// La app NO envía correos: eso lo hace el administrador, por el medio
// que prefiera (WhatsApp, correo, en persona). Lo que hace la app es
// dejarle el enlace listo para copiar.
```


## undefined

```js
// ====================================================================
// ENVIAR LA INVITACIÓN POR CORREO
// ====================================================================
// El correo lo manda Supabase, no la app. Llamar a la API que envía
// invitaciones exige la service_role, y esa clave no puede estar en el
// navegador: quien la tuviera podría hacer cualquier cosa con la base.
// Por eso la llamada pasa por la Edge Function "invitar", que sí la
// puede usar porque corre en el servidor de Supabase.
//
// Si la función no está desplegada, o el proyecto no tiene SMTP
// configurado, se avisa con el mensaje real y el flujo de copiar el
// enlace sigue igual: la persona recibe el enlace por el medio que sea.
```


## undefined

```js
// ============================================================
// DAR DE ALTA SIN CORREO
// ============================================================
// La invitación por correo depende de que Supabase pueda mandar correos,
// y el plan gratuito tiene un límite por hora. Al pasarse responde
// "email rate limit exceeded": la cuenta queda creada pero NO verificada,
// y quien la tenía no puede entrar. Estos tres botones escriben
// directo en la cuenta y no mandan nada, así que el límite deja de
// importar.
//
// El costo se dice en la pantalla, no acá: verificar un correo sin que
// nadie lo compruebe significa que la clave se entrega en persona. Es
// lo que corresponde en una obra y no lo que corresponde en un sistema
// abierto; la pantalla lo dice para que la decisión sea de quien
// pulse el botón.
// Una clave que se pueda decir de oído, sin 0/O ni 1/I, y que no sea
// adivinable. Se muestra en pantalla a propósito: hay que poder leerla
// y anotarla para dársela a la persona.
```


## undefined

```js
// ------------------------------------------------------------------
// ¿ESTÁN DESPLEGADAS LAS EDGE FUNCTIONS?
// ------------------------------------------------------------------
// Es la pregunta que más se repite y cuya respuesta cuesta un error en
// pantalla. Se responde al abrir la tarjeta, antes de que nadie pulse
// nada.
//
// La prueba es la propia función, con una petición que ella misma
// rechaza: un correo vacío. Si está desplegada contesta 400 con un JSON
// que dice "escribe un correo válido". Si no lo está, la URL devuelve la
// página de error del panel, el cliente no puede parsearla y reporta
// "Failed to send a request to the Edge Function".
//
// No se inventó una función "ping" para comprobarlo: eso sería obligar
// a desplegar una cuarta función solo para poder preguntar. Esta
// comprobación no necesita desplegar nada, y en la función el correo se
// valida antes que el permiso, así que no pide nada ni deja rastro.
//
// No bloquea nada: si la prueba falla por red o por lo que sea, la
// tarjeta se deja como está y el error se sigue viendo al pulsar.
```


## undefined

```js
// ---------- EPP: geolocalización y hora de la firma ----------
// sufijo "" = Entrega de EPP, "Kit" = Kits por especialidad
//
// POR QUÉ SE TOMA SOLA AL FIRMAR
//
// Antes había un botón "Capturar ubicación" aparte. El resultado era que
// casi ninguna entrega lo tenía: la persona firmaba, leía "Guardar
// entrega" y listo. Y una entrega sin coordenadas no sirve para verificar
// nada, que es justo para lo que se pide la firma.
//
// Así que la ubicación y la hora se toman en el instante en que el
// trabajador empieza a firmar, que es el momento que importa, y no cuando se
// apretó Guardar, que puede ser un rato después.
//
// SE PIDE UNA SOLA VEZ POR FIRMA. El navegador va incluida la última
// posición conocida si elapsed <maximumAge>, así que la ubicación es la de
// ese momento; y pedirla en cada trazo abriría el permiso una y otra vez,
// hasta que el navegador empieza a ignorarlo del todo.
```


## undefined

```js
// ------------------------------------------------------------------
// FALTA UNA COLUMNA AL IMPORTAR
// ------------------------------------------------------------------
// "Could not find the 'rut' column of 'trabajadores' in the schema
// cache" no dice por qué, y hay dos causas con arreglos distintos:
//
//   1. La migración no está aplicada. El RUT no existe en la base.
//   2. La migración SÍ está aplicada, pero PostgREST tiene el esquema
//      viejo en memoria. La columna existe; lo que no la ve es la API.
//
// Es la misma diferencia entre "no lo hice" y "lo hice y no se enteró",
// y el arreglo es otro: en el primer caso hay que ejecutar un archivo,
// en el segundo hay que recargar la caché.
//
// Por eso se comprueba en vez de adivinar: se pregunta a la base por la
// columna. Si responde que existe, el problema es la caché. Si no
// responde, es la migración.
//
// Se nota que PostgREST solo conoce lo que tiene cacheado, así que
// cuando dice "no encuentro la columna" no se puede concluir que la
// columna no exista: por eso la pregunta va por otra vía (un RPC que
// mira information_schema, que es la base real).
```


## undefined

```js
// ------------------------------------------------------------------
// ERRORES AL INVOCAR UNA EDGE FUNCTION
// ------------------------------------------------------------------
// supabase-js devuelve dos cosas muy distintas y hay que separarlas:
//
//   · "FunctionsHttpError" con 404 -> la función no está desplegada.
//   · "Failed to send a request to the Edge Function" -> lo MISMO, en
//     la práctica. Cuando la función no existe, la URL devuelve la
//     página de error del panel en vez de JSON, el cliente no puede
//     parsearla y reporta ese texto genérico.
//
// Antes solo se miraba el primero, así que el segundo salía tal cual en
// pantalla: "Failed to send a request to the Edge Function". Eso no le
// dice nada a quien lo lee, y lo que necesita es el comando.
//
// "Invalid JWT" y "401" son otra cosa: la sesión caducó. Se distingue
// porque la solución es reentrar, no desplegar nada.
```


## undefined

```js
// ============================================================
// KITS INICIALES POR ESPECIALIDAD
// Una especialidad puede tener varios kits (Pintor A, Pintor B).
// Al ingresar un trabajador se le asigna un kit: queda una lista de
// control con el estado de cada elemento, para poder entregar de a
// uno, de varios o de todos. Cada entrega genera su PDF con firma.
// ============================================================
// Cuando una migración no está aplicada, Postgres responde
//   Could not find the 'activa' column of 'empresa' in the schema cache
// Ese mensaje no dice qué hacer: parece un error de la app cuando en
// realidad falta ejecutar un archivo. Acá se traduce "no existe esta
// columna" → "ejecuta la migración 014", que es lo que la persona
// necesita saber.
//
// La lista se arma sola: cada migración declara qué tabla y qué columna
// la delatan. Agregar una migración nueva es agregar una línea.
```


## undefined

```js
// ------------------------------------------------------------------
// EL LOGO, LEÍDO Y ACHICADO
// ------------------------------------------------------------------
// Se lee el archivo que eligió la persona y se devuelve un data URL de como
// mucho 600 px de ancho.
//
// POR QUÉ 600: la credencial se imprime a 86 mm de ancho. A 300 dpi eso
// son unos 1000 px, pero el logo nunca ocupa toda la tarjeta, así que 600
// alcanza de sobra y pesa una fracción. Un logo de 600 px pesa entre 20 y
// 60 KB; el mismo archivo sin achicar, con fotos incrustadas, pesa 400 KB o
// más, y la diferencia se nota en cada consulta de la lista de empresas.
//
// POR QUÉ EN EL NAVEGADOR: porque pedir un archivo más chico a la persona
// casi nunca rinde. Nadie tiene el logo optimizado, y la respuesta a "te
//_ERROR_LOGO_GRANDE_" va a ser "no sé cómo".
```
