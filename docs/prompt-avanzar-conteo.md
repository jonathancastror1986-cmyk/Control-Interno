# El conteo dio cero en todo. Eso no es un resultado: es que no había datos

Mostraste esta tabla:

    workers.length = 0
    attendance.length = 0
    y los seis conteos en 0

**Esa tabla no mide nada.** Es el resultado correcto de una lista vacía, y una
tabla llena de ceros tiene exactamente el mismo aspecto que un conteo que
funciona y encontró que no hay nadie. Son indistinguibles.

Y el riesgo no es que las cifras sean cero: es que si te lo creés, la tarea 3 la
construís sobre un número falso y queda terminada para siempre con esa base.

## Por qué la página de pruebas no tiene datos

`tools/pruebas/app-sin-login.html` es la página **sin sesión**. Sin sesión no hay
`workers`, no hay `attendance`, no hay `marcajes`. Eso no es un defecto: esa
página existe justamente para poder probar sin meterse con la base de producción.

Por eso el conteo tiene que hacerse con **datos inventados a propósito**, no con
los que haya.

## Lo que hay que hacer: un armador de datos de prueba

Un botón en la página de pruebas que arme **exactamente** esto, y después corra el
conteo y muestre el reparto:

    3 con entrada y salida, sin nada raro       -> Presente, marcó        (verde)
    2 con entrada tarde                          -> Presente, tarde        (amarillo)
    2 avisados a RRHH, sin resolver              -> Presente, pendiente marca
    2 con entrada de hoy y días abiertos de antes-> Marcó y no se ha presentado
    2 sin entrada de ningún tipo                  -> Sin marcar            (rojo)

**Son 11, a propósito.** Cada número es impar o distinto, y eso sirve: si el
conteo devuelve "Presente, tickedó: 3" y vos esperabas 3, hay coincidencia. Si
devuelve 11, algo está contando filas y no situaciones. Con números redondos el
error se esconde.

Después del conteo, **mostralo en pantalla y pasámelo**. Tiene que decir
`3 / 2 / 2 / 2 / 2`. Si algo no cuadra, el error está en la clasificación, y es
ahí donde hay que verlo.

**Los datos inventados se limpian solos** al recargar. No los guardes en
`localStorage` ni los mandes a la base: son para mirar, no para persistir.

## Y aparte: el conteo real

El número que importa —cuántas filas abiertas desde el 28-09 hay hoy en la obra
real— **no se puede sacar de la página de pruebas**. Sale de la aplicación con
sesión, y no lo podés ver.

Lo que sí tenés que dejar es que **el conteo exista en la aplicación real**, y se
pueda ver. Agregá un botón "Medir la asistencia de hoy" que, en la asistencia
diaria, con la sesión del usuario, imprima en pantalla:

    cuántas filas hay de cada una de las cinco situaciones
    cuántas filas tienen días abiertos
    desde qué fecha está abierto el más viejo
    cuántos días abiertos tiene, en promedio, cada persona

**Los números reales los ve el usuario.** Vos dejás la forma; él aprieta y mira. Si
en esa pantalla no dice nada o dice un error, eso ya es un arreglo tuyo.

⚠️ Y ese botón tiene que distinguir dos cosas, como en el resto del proyecto:

    todo leído y cero pendientes   ->  "Nadie tiene nada pendiente hoy"
    la carga falló                 ->  "No se pudo leer la asistencia"

Nunca una tabla vacía sin decir cuál de las dos es.

## Con eso recién, seguí

Orden, y no lo saltees:

    1. El armador de datos y el conteo, con el reparto en pantalla.
    2. El botón "Medir la asistencia de hoy", en la aplicación real.
    3. Tarea 3: los cinco textos con su color.
    4. Tarea 2: el aviso de "no marcó en el reloj".
    5. Tarea 4: el filtro con varias opciones.

El filtro va al final porque depende de una clasificación que, hasta ahora, nadie
midió sobre datos reales.

## Y antes de cerrar, dos cosas

**La medición de las pestañas.** Mediste el ancho de los botones y el ancho total
de la barra, y con eso no se sabe si las dos barras se ven iguales. Se ven iguales
si coinciden el `font-size`, el `letter-spacing`, el `text-transform`, el `padding`
de los cuatro lados, el `border-bottom-width` y el `color`. **El ancho solo mide
el reparto horizontal**, que es justo lo que ya se veía bien.

Agregá esas seis al botón, para las dos barras, y pasame las dos tablas.

**No subas nada todavía.** Hay trabajo sin commitear. Antes:

    node tools/sube-la-version.js <N>
    los 32 guardianes en verde, con permiso-estricto en la lista

Y acordate de `node tools/copia-al-editor.js` si tocaste la página de pruebas,
después de tocarla, no antes.

## Y el servidor cambió

Ya no uses `127.0.0.1:5500`. Ese puerto lo tiene Visual Studio Code y no resuelve
las direcciones sin `.html`, por eso salía "Cannot GET /pages/app".

El servidor del proyecto está en:

    node tools/sirve.js

    http://127.0.0.1:5502/

Con ese servidor, `/pages/app` y `/pages/app.html` funcionan los dos, y manda
`no-store`, así que recargar trae de verdad el archivo nuevo. Si al correrlo te
dice que el 5502 está ocupado, tomá el que te muestre.

Si una dirección te da **404**, el 404 de ese servidor **te dice qué buscó**:

> No está: /pages/app
> El archivo existe como "app.html". Fijate si va con .html.

Esa pista es nueva y es tuya. Antes un 404 no decía nada.
