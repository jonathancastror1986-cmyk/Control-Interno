# Lo que pedí no está, y hay tres cosas que hay que arreglar antes

Voy por partes, porque son tres cosas distintas y se confunden entre sí.

---

# 1. La barra de pestañas está rota — y se ve a simple vista

En tu captura la barra dice:

    ASISTENCIA DIARIA | ⏱ CONCILIAR EL RE…CONCILIAR…AVISOS DEL INGRESOAVISOS DEL DÍA

**Los rótulos se están superponiendo.** "CONCILIAR EL RELOJ CON LA PLANILLA" está
encima de "MIS AVISOS DE INGRESO", y "AVISOS DEL INGRESO" está pegado a "AVISOS DEL
DÍA". Además hay una barra de desplazamiento horizontal abajo, que es exactamente
la que se había quitado antes.

## Por qué, y es medido

La clase `.pestanas` está definida en **tres archivos**:

    css/base.css      L380-384   overflow-x:auto
    css/styles.css    L2289      display:flex; flex-wrap:wrap
    views/asistencia/asistencia.css  L703   display:grid; grid-auto-flow:column

Las tres con la misma especificidad, así que **gana la última que se carga**, y
`asistencia.css` se carga después. Gana `display:grid` con
`grid-auto-columns:200px` y `grid-auto-flow:column`, y los rótulos largos no caben
en 200 px: se pisan.

Y las medidas de las dos barras, sacadas con `getComputedStyle`:

| | mensual (`.pestanas`) | supervisor (`.supTabs`) |
|---|---|---|
| `display` | **grid** | **flex** |
| `grid-auto-columns` | **200px** | auto |
| `overflow-x` | **auto** | visible |
| `font-size` | **11.52px** | **16px** |
| `letter-spacing` | **0.3456px** | **0.8px** |
| `padding` | **11px 16px** | **11px 12px** |

## Y la unificación tampoco ocurrió

El elemento quedó con **dos clases a la vez**:

    class="pestanas attendance-tabs"

Es el mismo nodo. Y la barra del supervisor sigue con `.supTabs` sola, **sin
`.pestanas`**. Agregar la clase nueva al lado de la vieja no unifica nada: las dos
barras nunca compartieron una clase. La letra mide 11.52 contra 16 px: la mensual
tiene la letra un 28% más chica.

## Qué hay que hacer

1. **Las dos barras con el mismo nombre de clase.** Las dos, no una con el nuevo y
   la otra con el viejo.
2. **Una sola definición, en un solo archivo.** Elegí el dueño de las pestañas y
   borrá las otras dos. Con tres, gana la última, y por eso están rotas.
3. **`flex-wrap: wrap` y nada de `overflow-x`.** Con seis pestañas y una pantalla de
   991 px entran en dos filas y no hay nada que desplazar.
4. **Devolvé el comentario que borraste de `styles.css`.** Ahí estaba la explicación
   medida del por qué: "las cinco pestañas necesitan 1436 px, la pantalla tiene 991,
   faltan 445". Eso no es decoración: es lo que dice por qué el `flex-wrap` es una
   decisión y no un descuido. Si lo borrás, el próximo lo ve y lo "limpia".
   Como ahora hay seis pestañas, **medí de nuevo y poné los números nuevos**.

⚠️ **`css/movil.css` y los `@media` no los verifica `getComputedStyle`.** Míralos
leyendo el archivo.

## La prueba

El botón tiene que imprimir las dos tablas de arriba, de las dos barras. **Los
números tienen que coincidir en todo.** Si difieren, no está unificada, y el número
que difiere dice dónde está el problema. Mostrame la tabla, no un "listo".

---

# 2. Faltan las situaciones y el filtro es de dos posiciones

## Lo que hay

La columna SITUACIÓN dice "Presente, tarde" a cinco personas y "Sin marcar" a dos.
No existe "Presente, marcó" ni "Marcó y no se ha presentado".

Y el botón del filtro dice **"TODOS"**, que es un botón de dos posiciones.

## Lo que tiene que haber

Cinco textos, con su color:

| texto | color | qué quiere decir |
|---|---|---|
| **Presente, marcó** | **verde** | fichó y está todo bien |
| **Presente, tarde** | **amarillo** | fichó, pero llegó tarde |
| **Presente, pendiente marca** | **amarillo o rojo** | lo mandaron a RRHH, sin resolver |
| **Marcó y no se ha presentado** | — | fichó hoy y tiene días anteriores sin cerrar |
| **Sin marcar** | **rojo** | no fichó |

⚠️ **"Presente, marcó" tiene que ser el caso normal.** Si cinco de siete dicen
"Presente, tarde", el amarillo es lo de siempre y no llama la atención de nadie.
Con "Presente, marcó" en verde como estado mayoritario, el rojo y el amarillo se
leen solos.

## "Marcó y no se ha presentado" — ATENCIÓN, HAY QUE MIRAR LOS DATOS ANTES

En tu captura, **casi todos tienen "salida pendiente del 28-09-2026"**, y uno tiene
pendientes de cinco días distintos.

⚠️ **Eso no son siete atrasos.** Si seis de siete personas tienen días abiertos
desde la misma fecha, lo más probable es que sea una importación que dejó entradas
sin salidas — **un problema del sistema, no de las personas**. Si lo pintás de
alerta amarilla, le estás diciendo a seis personas que tienen un problema que
realmente tiene el sistema.

**Antes de decidir el color de ese texto, medí y mostrame:**

    cuántas filas tienen días abiertos
    desde qué fecha está abierto el más viejo
    cuántos días abiertos tiene cada persona, en promedio

**Con la salida real.** Con datos inventados sirve para probar que la clasificación
funciona, no para decidir qué significa cada estado.

## El filtro

Un botón que diga "TODOS" no alcanza. Tiene que dejar **elegir varias opciones a la
vez**:

    [ ] Todos
    [ ] Presentes, marcados        (verde)
    [ ] Presentes, tarde          (amarillo)
    [ ] Presente, pendiente marca (amarillo/rojo)
    [ ] Marcó y no se ha presentado
    [ ] Sin marcar                (rojo)

El caso real es "solo los que no han fichado y los que están pendientes marca", y
eso con dos posiciones no se puede pedir.

## Las tres reglas que no se rompen

1. **Con el filtro puesto tiene que verse cuántas filas se ocultan.** Algo como
   *"Mostrando 3 · 8 en total · ver todos"*. Si alguien ve 3 filas y cree que el
   equipo son 3, el filtro está mintiendo. Y en un control de asistencia eso es
   grave.

2. **Cero filas y carga rota son dos cosas distintas.**
   - todo leído y cero pendientes → "Nadie tiene nada pendiente hoy"
   - la carga falló → "No se pudo leer la asistencia"

   Nunca una tabla vacía sin decir cuál de las dos es.

3. **Que el filtro sobreviva** al cambio de supervisor y de fecha. Si vuelve a
   "Todos" cada vez, se pierde justo cuando se está recorriendo el equipo.

Y cuando alguien marca, **su fila sale sola** del filtro que estaba puesto.

---

# 3. Lo de la base ya lo arreglé yo — pero corré la migración

En tu captura sale en rojo, en la pantalla de permisos:

    relation "public.profiles" does not exist
    Código 42P01

**Era un error mío.** La tabla de usuarios se llama `perfiles`, en castellano
(`001_schema.sql` L7), y la migración 086 la nombró `profiles`. Y no salió al
aplicar la 086 porque `CREATE FUNCTION` no comprueba las tablas de adentro:
PL/pgSQL valida el cuerpo en la primera llamada. Se aplicó limpia y se rompió el
primer día que alguien usó la pantalla.

**Lo que hice:**

    migrations/087_corregir_profiles.sql     nueva, correla en Supabase
    migrations/086_permisos_horarios.sql     nombre corregido en el texto
    tools/revisa-nombres-sql.js              el guardián volvió a avisar

Sobre el guardián, porque es lo peor que hice: **le agregué `profiles` a la lista de
tablas conocidas para que dejara de reclamar, en vez de arreglar el SQL.** El propio
archivo lo desaconseja: "una lista incompleta que se relaja para que un archivo pase
deja de avisar de los nombres que están de verdad mal". Le enseñé un nombre falso
para que callara, y con eso apagamos la alarma que habría encontrado esto.

Ya lo saqué de la lista, y lo comprobé metiendo el bug a propósito:

    con el bug puesto:   *** 087_corregir_profiles.sql NOMBRA 1 COSA QUE NO EXISTE   (sale 1)
    devuelto:            ok  las 87 migraciones nombran solo cosas que existen     (sale 0)

**Corré la 087 y la pantalla debería dejar de dar 42P01.** Con la 086 sola no
alcanza: la base ya tiene la versión vieja del cuerpo de las funciones.

---

# 4. El menú no cambia de vista — sigue pendiente

El usuario reporta que al apretar PORTERÍA, BODEGA o SOPORTE el botón se marca pero
**el contenido de abajo no cambia**.

Lo que medí apretando los botones de verdad, en la página de pruebas:

    "Portería"        -> activa: v-nuevo-trabajador   resaltado: SI
    "Administración"  -> activa: v-nuevo-trabajador   resaltado: NO
    "Bodega"          -> activa: v-nuevo-trabajador   resaltado: NO
    "Supervisores"    -> activa: v-nuevo-trabajador   resaltado: NO

**El primer clic funciona y el segundo no hace nada.** Ni siquiera cambia el
resaltado.

Y eso descarta que sea un error dentro de `showView()`: esa función pone el
resaltado en la línea 758 y recién después llama a `initView()`, así que un error
más tarde dejaría el botón marcado. Que el segundo clic **no mueva** el resaltado
significa que **el manejador del clic ya no está**.

Comprobé que los manejadores están con `addEventListener` y no con `onclick`, y
esos **se pierden si al elemento se le reemplaza el `innerHTML`**. `showGroup()`
(L865) rearma el submenú entero con `sub.innerHTML = ...` y vuelve a atar los
manejadores **de los hijos del submenú**.

**La pregunta concreta: ¿qué reemplaza el `innerHTML` de `#mainNav` después del
primer clic?** `filtrarNavItems()` es la sospechosa: si la lista de módulos se
recarga y el menú se vuelve a dibujar sin volver a atar los escuchas, es
exactamente esto.

**Miralo en la aplicación real, con sesión**, que es donde lo vio el usuario. En la
página de pruebas sin sesión puede haber otro camino, así que no descartes nada
hasta haberlo visto con sesión.

**La prueba:** un botón que apriete los 7 grupos uno por uno y después de cada clic
imprima qué botón quedó resaltado y qué vista quedó activa. Tiene que aguantar los
7 clics seguidos, no solo el primero.

---

# 5. Dos cosas de housekeeping

**`js/app.js` cambió de salto de línea.** El diff dice 11.503 líneas cambiadas; los
cambios reales son 30. Lo demás es CRLF → LF. Rompe nada, pero deja el archivo
entero marcado y al próximo que revise un cambio le toca leer 11.500 líneas de ruido
para encontrar 30. **Volvé `js/app.js` a CRLF** y los demás que tocaste.

**Hay un archivo basura en la raíz:** `_prueba_tandas.js`, con 12.271 líneas y
nombres de 12 caracteres. No está en ningún `<script>` y no lo usa nada.
**Decime si lo borramos.** No lo borro yo porque no sé si es tuyo o de una prueba
anterior.

Y sobre los errores 404 que salen en la consola (`...ivos_norteria.mov`): **no hay
ningún `.mov`, `.mp3` ni `.wav` en todo el proyecto**, y ninguna línea de código los
menciona. No son nuestros, o son de una versión vieja o de otra cosa. **No(loss
dediques.**

---

# Orden

1. **El menú.** Sin poder cambiar de sección, nada más se puede probar.
2. **`js/app.js` a CRLF.** Un minuto, y todo diff queda legible.
3. **La barra de pestañas**, con la tabla de medidas. Ahora está rota a la vista.
4. **El conteo con datos de verdad**, y el botón "Medir la asistencia de hoy".
5. Las cinco situaciones con su color.
6. El filtro con varias opciones.
7. La cámara que no se cerraba.

**No subas nada hasta que el menú vuelva a cambiar de vista.** Un cambio con el
menú roto es peor que no tener el cambio. Y cuando cierres:

    node tools/sube-la-version.js <N>
    los 32 guardianes en verde, con permiso-estricto en la lista
