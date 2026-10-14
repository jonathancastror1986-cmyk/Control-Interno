# Son CUATRO tareas. La 1 sola ya sirve y es la más fácil de verificar.

Proyecto: control de asistencia. JavaScript vanilla + Supabase, sin build, sin
`node_modules`, 86 migraciones aplicadas. Archivos CRLF. Se sirve en
`127.0.0.1:5500`.

## Reglas que no se negocian

1. **No toques la base.** La 086 ya está aplicada y verificada. Las migraciones las
   aplica el usuario desde el panel SQL.
2. **Guardianes en verde antes de cada push.** Ya son **32**: sumale
   `permiso-estricto` a la lista del punto 6.
3. **El archivo que tocas sube de versión con el guion:**
   `node tools/sube-la-version.js <N>` — HTML, JS y CSS a la vez.
4. **Los errores EN PANTALLA, nunca en `console.warn`.**
5. **Las pruebas van en botones** en `tools/pruebas/app-sin-login.html`.
6. **Medí antes de cambiar:** quién lee lo que tocás y quién lo escribe.
7. **Comentarios que explican POR QUÉ**, no qué.
8. **En el `catch`, NO uses `escHtml()`** para el mensaje: se probó que el aviso se
   cae junto con la función que estaba rota. Escribí el escapado con cuatro
   `.replace()` ahí mismo.
9. **`asistencia` no se escribe desde acá.** El día de una persona que estuvo
   queda en `'X'`, y sigue así aunque se la mande a RRHH.

---

# TAREA 1 — Una sola clase de pestañas

## El problema, medido

Hoy hay **dos sistemas de pestañas vivos** y tres clases distintas:

    .attendance-tabs   asistencia mensual (excel / justificar / marcaje / tarja)
    .supTabs           supervisor (diaria / conciliacion / avisos / importar / permisos)
    .tabs              reglas huérfanas, sin tablist que las use

Y `.attendance-tabs` está definida en **cuatro archivos**:

    css/base.css              L380-382   overflow-x:auto
    css/movil.css             L422-428
    css/styles.css            L2103      mayúsculas
    css/styles.css            L5244-5426 display:grid, la que gana
    views/asistencia/asistencia.css  L703 / L730 / L738

**Por qué se ven distintas según el módulo: no es que cada módulo tenga su estilo,
es que cada módulo usa una clase distinta, y encima la misma clase tiene cuatro
definiciones y gana la última.** Una de esas es `display:grid` con
`repeat(auto-fit,minmax(190px,1fr))` y las otras son `flex`. Por eso una barra se
reparte en columnas iguales y la otra se ajusta al rótulo.

## Lo que hay que hacer

**Una sola clase, `.pestanas`, usada por las dos barras.** Las pestañas del
supervisor y las de la asistencia mensual tienen que verse **exactamente iguales**
—mismo alto, mismo borde, mismo tipo de letra, mismo color de la activa— y cambiar
de módulo no puede cambiar la forma de la barra.

Los atributos `data-attendance-tab` y `data-sup-tab` **se quedan como están**: son
dos juegos de datos distintos y las funciones que los leen son distintas a
propósito. Unificar el estilo no es unificar el mecanismo. `cambiarPestanaSup()` e
`initPestanasSup()` no se tocan.

## Qué reglas conservar (están medidas, no las tires)

De la barra del supervisor, que ya se corrigió y probó:

- **`flex-wrap: wrap`** y **sin `overflow-x`**. Con cinco pestañas y una pantalla
  de 991 px hacen falta 1436 px: entran en dos filas y no hay nada que
  desplazar. Antes salía una rayita de desplazamiento abajo y la quinta quedaba
  cortada. **Que no vuelva a aparecer la barra.**
- **`.pest-txt` en dos líneas, sin `ellipsis`.** Un rótulo cortado con puntos
  suspensivos no dice qué hace la pestaña.
- **Los rótulos NO se acortan para que quepan.** El más largo, "Conciliar el reloj
  con la planilla", mide 402 px. Acortar palabras es la forma más común de que un
  rótulo termine diciendo menos de lo que hace.
- **Mayúsculas y `letter-spacing`.**
- La activa se distingue por más que el color: el borde de abajo. El color solo no
  alcanza para quien no distingue bien el verde.

## Lo que hay que borrar

**Las reglas duplicadas.** Una clase con cuatro definiciones en tres archivos es
la causa del problema, no un incendio sin relación. Dejá **una** fuente de verdad.
Decidí vos cuál de los cuatro archivos es la buena y borrá las otras tres
definiciones — pero **no borres nada sin mirar**: `views/asistencia/asistencia.css`
puede tener reglas de las pestañas dentro de un `@media` o de un `@media print`.

⚠️ **`getComputedStyle` no lee `@media print`.** Ya se midió mal dos veces por
eso. Si tocás reglas de impresión, no las verifiques con esa función.

Y dos cosas más:

- **El ícono.** `ponerIconosEnPestanas()` mete un `<svg class="ico">` dentro del
  botón con `insertAdjacentHTML('afterbegin', …)`. El estilo del ícono tiene que
  valer para las dos barras, hoy hay reglas separadas.
- **`comprueba-color-sobre-fondo`** lee el contraste de los colores. Si agregás
  cualquier color, ese guardián lo mira.

## Cómo se verifica

Un botón de prueba en `tools/pruebas/app-sin-login.html` que imprima, **en la
página**, las medidas de las dos barras: alto de un botón, `font-size`,
`letter-spacing`, `text-transform`, `padding`, `border-bottom-width` y si la
barra tiene barra de desplazamiento. **Las dos filas tienen que dar igual.** Si
difieren en un solo número, no está unificada.

Y con la barra de asistencia mensual **abierta y con su `display` anterior**, para
ver que no se rompió el reparto en columnas si alguien lo tenía customization.

---

# TAREA 2 — "No marcó en el reloj", que vaya a RRHH

## Qué pasa hoy

En la asistencia diaria, `marcarPorEscaneo()`
(`views/administracion/administracion.js:302`) marca el marcaje del reloj y abre
`abrirAvisoMarcaje()`. **No avisa si esa persona no tiene marcación en el reloj de
la obra**, que es un problema distinto y muy común: la persona está en la obra, el
reloj no la leyó, y el supervisor tiene que avisarle a ella para que vaya a
regularizarlo.

## La ventana

Cuando se escanea a alguien y **no hay marcación de ese día en el reloj**, tiene
que salir un aviso claro:

> **No marcó asistencia en el reloj.**
> {nombre} no tiene marcación registrada en el reloj del {día}.
> Pasale aRRHH para que lo regularicen.

⚠️ **La parte importante es lo que NO tenés que hacer: no lo digas si no lo sabés.**

**Si los datos del reloj no cargaron, no podés decir que "no marcó".** Podés decir
que no se pudo consultar. La diferencia es la diferencia entre "esta persona tiene
un problema" y "no sabemos si lo tiene", y en el medio hay una persona a la que se
le está atribuyendo una falta que capaz no tuvo.

La regla del proyecto es: **cero filas leídas no es lo mismo que no tener filas.**
Si la consulta falló, el aviso tiene que decir *"No se pudo consultar el reloj"*,
no *"no marcó"*.

## De dónde sale el dato

**No recalcules.** `js/conciliacion.js` ya sabe comparar el reloj con la planilla:
`contaSituaciones()`, `situacionDe()`, `ORDEN_SITUACIONES`, `clasificarConciliacion()`.
Usá eso. La pantalla de conciliación y la asistencia diaria tienen que decir lo
mismo, y si cada una calcula por su cuenta, un día van a discrepar y nadie va a
saber cuál tiene razón.

Y **la fila tiene que verse en las dos pantallas**: si en conciliación dice "el reloj
tiene la marcación y la planilla no", en la asistencia diaria tiene que decir lo
mismo para la misma persona el mismo día.

## Y el aviso tiene que quedar en la lista

Cuando se manda a RRHH, **el trabajador queda "presente, pendiente marca"**. No se
resuelve solo. El día sigue en `'X'` —porque estuvo— y la alerta **sigue
amarilla o roja** hasta que alguien la cierre.

Esto es deliberado y es lo más importante de la tarea: **mandar a RRHH no es
resolver.** Si la alerta se pone verde al avisar, la fila desaparece del trabajo
del supervisor y el problema queda sin dueño.

---

# TAREA 3 — Los textos de "Situación"

Hoy `situacionDiaria()` (`views/administracion/administracion.js` ~473) tiene cinco
salidas. El usuario pide separar dos cosas que hoy están mezcladas:

| texto | qué significa |
|---|---|
| **"Presente, marcó"** | fichó y está todo bien. **VERDE.** |
| **"Presente, tarde"** | fichó, pero llegó tarde. **AMARILLO.** |
| **"Presente, pendiente marca"** | lo mandaron a RRHH, todavía no se resolvió. **AMARILLO o ROJO.** |
| **"Marcó y no se ha presentado"** | fichó hoy, pero tiene días anteriores sin cerrar. |
| **"Sin marcar"** | no fichó. **ROJO.** |

**"Presente, marcó" tiene que ser el caso normal, no un caso raro.** Si la mayoría
de la fila dice "Presente, marcó" en verde, el amarillo y el rojo se leen solos.
Hoy el texto común es "Presente, tarde", que es una excepción, y como es lo que
sale siempre, no llama la atención de nadie.

## ⚠️ Una definición que hay que confirmar antes de escribir código

**"Marcó y no se haphet presentación" no está claro, y adivinarlo hace que toda la
tabla mienta.**

La lectura más probable: *fichó hoy, pero tiene días anteriores en los que
entró y nunca salió*, que es justo lo que hoy muestra el texto "salida pendiente
del 28-09-2026" en la columna Situación.

⚠️ **Y eso hay que medirlo antes de resolverlo, porque en la captura casi todos lo
tienen.** Si de 7 personas, 6 tienen "salida pendiente del 28-09-2026", eso no
son seis atrasos: eso parece un problema de datos — una importación que dejó
entradas sin salidas — y no una situación de las personas. **Si lo pintás como
alerta, le estás diciendo a seis personas que tienen un problema que en realidad
tiene el sistema.**

Así que primero: **contá cuántas filas tienen días abiertos y desde qué fecha.**
Después se decide si eso es una alerta amarilla o un dato que hay que limpiar. No
lo pintes de amarillo sin mirar.

## Los colores

| color | para qué |
|---|---|
| **verde** | "Presente, marcó". Nada que hacer. |
| **amarillo** | "Presente, tarde" y "Presente, pendiente marca". |
| **rojo** | "Sin marcar". |

Rojo solo para lo que el supervisor tiene que hacer **hoy**. Si hay seis filas
rojas, no hay ninguna que destaque, y una fila roja tiene que significar una cosa:
*faltó y hay que ir a buscarla*.

**No agregues un color nuevo sin que `comprueba-color-sobre-fondo` lo revise.**

## Y las alertas que ya existen no se tocan

Las de `Asist. social` y `Prevención` (las etiquetas morada y rosada de la
columna del nombre) y los `avisos` en amarillo **siguen igual**. Lo que cambia es
el texto de la columna Situación, no las alertas.

---

# TAREA 4 — El filtro con varias opciones

## La idea

Por defecto la tabla tiene que mostrar **solo los que necesitan justificación**:
rojos y amarillos. Los que están "Presente, marcó" van en verde y **no tienen por
qué estar delante de nadie**.

Después, un filtro que deje elegir:

    [ ] Todos
    [ ] Presentes, marcados        (verde)
    [ ] Presentes, tarde          (amarillo)
    [ ] Presente, pendiente marca (amarillo/rojo)
    [ ] Marcó y no se ha presentado
    [ ] Sin marcar                (rojo)

**Varias opciones a la vez**, no un botón que alterna. El caso real es "solo los
que no han fichado y los que están pendientes marca", y con un botón de dos
posiciones eso no se puede pedir.

## Las tres reglas que no se pueden romper

**1. Con el filtro puesto, tiene que estar visible cuántas filas se están
ocultando.** Algo como *"Mostrando 3 · 8 en total · ver todos"*. Si alguien ve 3
filas y cree que el equipo son 3, el filtro está mintiendo, y en un control de
asistencia eso es grave.

**2. Cero filas con el filtro puesto NO es lo mismo que "no se pudo leer".** Si la
carga falló, no puede salir un filtro puesto y vacío: eso dice "nadie tiene nada
que explicar" cuando en realidad no se sabe. Con cero filas y todo leído, el
mensaje es "Nadie tiene nada pendiente hoy". Con la carga fallada, es "No se pudo
leer la asistencia".

**3. Que nunca se presente como "no hay datos".** Con el filtro de "Sin marcar"
puesto y cero filas, el mensaje es *"Nadie sin marcar"*, no una tabla vacía.

## Que sobreviva al cambio

Al cambiar de supervisor o de fecha, **el filtro se mantiene**. Si vuelve a
"Todos" cada vez, se pierde justo cuando se está recorriendo el equipo, que es
cuando más importa.

Y cuando alguien marca, **su fila sale sola** del filtro que estaba puesto, sin
recargar y sin tocar nada.

## ⚠️ Midelo antes de construirlo

El filtro depende de la clasificación de la tarea 3, y esa clasificación hoy tiene
un problema de datos sin resolver (el punto 3, los días abiertos del 28-09).

**Hacé primero el conteo** — cuántas filas hay de cada tipo con los datos reales—,
mostralo en pantalla, y recién después armá el filtro. Si la mayoría cae en
"marcó y no se ha presentado", el filtro no sirve: estás por filtrar una condición
que en la práctica es todos.

---

# 5. Cómo se prueba

Los guardianes **no ejecutan código**: miran existencia, unicidad, paréntesis,
columnas SQL, HTML↔JS. Ninguno prueba tu pantalla. Eso lo hacés vos, con botones
en `tools/pruebas/app-sin-login.html`, **mostrando el resultado en la página**.

    TAREA 1
    1. Botón que imprima las medidas de las dos barras de pestañas. Los números
       tienen que coincidir.
    2. Con cinco pestañas y la ventana angosta: dos filas, SIN barra de
       desplazamiento, y la quinta se ve entera.
    3. Ningún rótulo con puntos suspensivos.

    TAREA 2
    4. Escanear a alguien SIN marcación en el reloj -> sale el aviso y dice RRHH.
    5. Escanear a alguien CON marcación -> NO sale ese aviso.
    6. Romper la carga del reloj a propósito -> dice "no se pudo consultar", y en
       ningún caso dice "no marcó".
    7. Después de avisar, la fila queda "Presente, pendiente marca" y en
       amarillo. NO se pone verde.
    8. La fila se ve igual en Conciliar y en Asistencia diaria.

    TAREA 3
    9. Los cinco textos salen en su color, con "Presente, marcó" en verde como
       caso normal.
   10. Conteo de filas por tipo, en pantalla, ANTES de construir el filtro.

    TAREA 4
   11. Filtro con dos o más opciones a la vez.
   12. Con filtro puesto se ve cuántas filas hay ocultas.
   13. Cero filas -> "Nadie tiene nada pendiente hoy". Carga rota -> "No se pudo
       leer". Los dos mensajes distintos.
   14. El filtro sobrevive al cambio de supervisor y de fecha.
   15. Al marcar alguien con el filtro puesto, la fila desaparece sola.

⚠️ **Metele el bug a propósito** y confirmá que el error se ve en pantalla. Un
guardián que no puede fallar no es un guardián, y una pantalla que no se dibujó es
indistinguible de una pantalla sin datos. Ya pasó dos veces esta semana: un
`ReferenceError` tumbó la tabla entera y looked como "no hay datos".

---

# 6. Comandos

    # los 32 guardianes, antes de cada push
    $g = @('compila-javascript','prueba-compila-javascript','compila-juntos','revisa-nombres-sql','prueba-revisa-nombres-sql','parea-finales','prueba-campos','prueba-movil','comprueba-ids-unicos','comprueba-rutas','comprueba-codigos','comprueba-060','comprueba-mojibake','prueba-comprueba-065','prueba-ids-unicos','prueba-comprueba-codigos','prueba-sube-versiones','prueba-archivo-seguro','comprueba-color-sobre-fondo','prueba-comprueba-color-sobre-fondo','comprueba-codigo-sql','prueba-rut-normalizado','comprueba-migracion-corta','comprueba-columnas','comprueba-la-vista','prueba-campos-contrato','comprueba-modulos','comprueba-parentesis','prueba-conciliacion','comprueba-la-version','prueba-hora-excel','permiso-estricto')
    $m = 0
    foreach ($x in $g) { node "tools\$x.js" > $null 2>&1; if ($LASTEXITCODE -ne 0) { $m++; "*** en rojo: $x" } }
    if ($m -eq 0) { "ok los $($g.Count) guardianes en verde" } else { "*** $m en rojo: NO SE SUBE" }

    node tools/sube-la-version.js <N>    # sube HTML + JS + CSS a la vez
    node tools/copia-al-editor.js         # copia lo que falte a la página de pruebas

`node tools/sube-la-version.js` **sin argumento no escribe nada**: solo mira.

---

# Orden

**La 1 sola primero.** Es chica, es puramente CSS, y es la única que se verifica
con números en vez de criterio. Después la 3, pero **con el conteo de la tarea 3
hecho antes**, porque el filtro de la 4 depende de una clasificación que puede
estarmir sobre datos rotos.

Y **preguntá antes de inventar**: la definición de "marcó y no se ha presentado" y
el problema de los días abiertos del 28-09 son cosas que decidilas con quien las
va a usar, no con los datos de hoy.
