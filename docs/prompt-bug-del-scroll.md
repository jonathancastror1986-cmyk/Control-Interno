# El bug del scroll, en varias pantallas

Te paso el video en el mensaje. Es un error que aparece **cuando hago scroll y
llego a un sector**, y sale en más de una pantalla.

Antes de mirar el video: ya medí por dónde va el problema, para que no empieces de
cero. Está casi seguro en la clase `nav-compacto`.

---

# 1. Lo que ya sé, y no hay que volver a medir

## El disparador es un número, y es bajísimo

`js/nucleo.js:1555` → `marcarNavCompacto()`:

    const chico = window.scrollY > 40;
    if (chico === navCompactoYa) return;
    navCompactoYa = chico;
    document.body.classList.toggle('nav-compacto', chico);

**Al pasar 40 píxeles de scroll, se le pone una clase al `<body>` entero.** Eso
es "llegar a determinado sector": no depende de qué parte de la pantalla estás
mirando, sino de cuánto scrolleaste. Por eso sale en varias pantallas: la condición
no es de la pantalla, es del scroll.

`app.js:5665` → `conectarNavCompacto()` ata el `addEventListener('scroll')` con un
`requestAnimationFrame`, así que no se ejecuta en cada píxel. Eso está bien y no se
toca.

## La clase mueve 77 reglas de CSS

    css/marca.css     25 reglas
    css/styles.css    52 reglas

Y hay una cosa que se ve raro antes de mirar nada, y que puede ser el bug o puede
ser otra cosa: **varias de esas reglas tienen un `id` repetido en el selector.**

`css/styles.css`, en estos rangos:

    L5063   body.nav-compacto #barrasSuperiores header,
    L5064   body.nav-compacto #barrasSuperiores #mainNav,
    L5065   body.nav-compacto #barrasSuperiores #subNav{ ... }

    L5074   body.nav-compacto #barrasSuperiores #mainNav,
    L5075   body.nav-compacto #barrasSuperiores #subNav{ ... }

    L5107   body.nav-compacto #barrasSuperiores:hover #barrasSuperiores #mainNav button,

Un selector no puede tener dos `id`. El segundo `#barrasSuperiores` hace que la
regla **no matchee nunca**, con lo cual esas reglas no están aplicando lo que
parecen aplicar. Y como el código está escrito como si sí, el que lo lea va a
pensar que el encabezado se encoge cuando en realidad no.

⚠️ **No asumas que esto ES el bug.** Puede serlo, puede ser un error viejo que no
molesta, y puede haber otro. Lo que sí es, es un error. Verificalo antes de
arreglarlo, y si lo arreglás, decime si cambió algo.

## Para encontrar el resto

Revisá las 77 reglas y buscá las que:

- fijen alto, `transform`, `overflow` o `padding` de un elemento que también
  existe en el contenido de la página
- apliquen a algo que no es el encabezado (porque `#mainNav` y `#subNav` están
  dentro del encabezado, pero hay reglas que apuntan a selectores parecidos)
- usen `top:0` en un elemento `sticky` cuando **ya hay otro `sticky` con `top:0`
  arriba**. Está anotado en `views/asistencia/asistencia.css` alrededor de la L179:
  dos pegajosos con el mismo `top` se pisan y el segundo tapa al primero. Es un
  problema conocido de este proyecto y aparece justo cuando scrolleás.

---

# 2. Cómo lo reproducimos, que es lo que hace falta

El bug es de scroll, así que probarlo con `getComputedStyle` **no alcanza**: hay
que scrollear de verdad.

## La forma que sí sirve

En `tools/pruebas/app-sin-login.html`, agregá un botón que:

1. ubique cada pantalla que tiene el problema
2. scrollee a **40 píxeles justos** (el umbral), con `window.scrollTo(0,40)`
3. espere un cuadro con `requestAnimationFrame`
4. mida lo que se rompió y lo muestre **en la página**

Medir a 40 píxeles es lo importante: es exactamente el punto donde la clase se
prende, y es el que nadie prueba.

## Qué medir

Para cada pantalla, con la clase puesta y sin ella:

    alto del encabezado, padding, transform, border-width
    el ancho y el alto de cada barra (#mainNav, #subNav)
    posición del contenido: qué queda tapado
    si algo se salió de la pantalla: scrollWidth > clientWidth
    el número de reglas que matchean: cuántos elementos del encabezado están
    más altos de lo que deberían

Y la comparación tiene que ser **la misma pantalla con y sin la clase**, no dos
pantallas distintas. Si no, cualquier diferencia parece el bug.

⚠️ **`getComputedStyle` no lee `@media print` ni los `@media` de ancho.** Si tocás
reglas de impresión o de teléfono, esas partes se miran leyendo el archivo, no con
la función.

## Y el orden del diagnóstico

1. Reproducir en la pantalla de pruebas, con el botón.
2. Decir **qué se rompe y en cuál de las 77 reglas está la causa.**
3. Recién ahí arreglar.

No al revés. Si arreglás algo sin decir qué regla lo causaba, no se sabe si se
arregló o si solo se tapó.

---

# 3. Lo que hay que revisar primero, por orden

## a) Los selectores con el `id` repetido

`css/styles.css` L5063-5119. Medí si esas reglas matchean algo hoy:

    un botón de prueba que diga cuántas de esas reglas aplican
    y cuáles, por selector

Si salen en cero, el encabezado no se está encogiendo como el código dice. Eso
explicaría el bug de un golpe.

## b) Los dos `sticky` con el mismo `top`

Buscá los `position:sticky` con `top:0` en la pantalla donde aparece. Cuando hay
dos, el que está después en el DOM se pinta encima del primero y **solo se nota
cuando scrolleás**, que es exactamente lo que se está reportando.

El arreglo no es quitar uno: es que el de arriba tenga un `top` que sea el alto
del otro, o que el segundo no sea pegajoso.

## c) La marca del encabezado

`css/marca.css` tiene 25 reglas de `nav-compacto`, y muchas con `:has()`. **El
`:has()` depende del navegador**: si la regla matchea en Chrome pero no en el
motor que está usando el Chromium de la obra, el comportamiento se parte por la
mitad y solo en algunos elementos.

Revisá si alguna de esas 25 reglas está sosteniendo algo que debería existir
siempre, y no solo en compacto. Si es así, esa regla tiene que salir de ahí.

---

# 4. Lo que NO hay que tocar

Esto se acaba de arreglar y funciona. No lo rompas:

- **Las pestañas.** Ahora hay UNA sola regla, en `css/styles.css`, y las tres
  clases —`.pestanas`, `.supTabs`, `.attendance-tabs`— la comparten. Las otras
  copias se borraron. Si agregás una regla de pestañas en otro archivo, vuelve el
  problema de "cada módulo se ve distinto".
- **`marcarNavCompacto()` y `conectarNavCompacto()`**: la lógica del umbral de 40
  y el `requestAnimationFrame` están bien. Se puede cambiar **qué** cambia la clase,
  no **cuándo**.
- **La tabla de asistencia diaria**: las columnas de la entrada del reloj y la del
  supervisor, y el gris del día abierto viejo, se medieron y funcionan.
- **`motivosDePuerta()`**: ya no pide ninguna función a la base, lee
  `asistencia.estado` de memoria.

## Y las reglas de la casa

1. **No toques la base.** No hay Postgres local. Las migraciones las aplica el
   usuario desde el panel SQL.
2. **Los 34 guardianes en verde antes de cada push**, y ahora son 34 con dos más:

       node tools/sube-la-version.js <N>      # sube HTML + JS + CSS a la vez
       node tools/copia-al-editor.js           # después de tocar la página de pruebas

   La lista de los 34 va en el mensaje siguiente.

3. **Los errores EN PANTALLA**, nunca en `console.warn`.
4. **Las pruebas van en botones**, en `tools/pruebas/app-sin-login.html`.
5. **Medí antes de cambiar.** Y cuando midas, **decí qué mediste**: si el arreglo
   se aplica sin decir qué regla era la causa, no se sabe si se arregló o si se
   tapó.
6. **Comentarios que explican POR QUÉ**, no qué.
7. **CRLF.** Los archivos están en fin de línea de Windows. Un archivo que pasa a
   LF aparece entero modificado en el diff: pasar de 30 líneas reales a 11.503 de
   ruido hace que el próximo que revise un cambio no vea nada.
8. **En el `catch`, NO uses `escHtml()`** para armar el mensaje: se probó que el
   aviso se cae junto con la función que estaba rota. Escribí el escapado ahí, con
   cuatro `.replace()`.

## Y el servidor

Ya no uses `127.0.0.1:5500`: ese puerto lo tiene Visual Studio Code y no resuelve
las direcciones sin `.html`, y por eso salía "Cannot GET".

    node tools/sirve.js

Te muestra con qué puerto quedó. Con ese servidor, `/pages/app` y `/pages/app.html`
funcionan las dos, y manda `no-store`, así que recargar trae de verdad el archivo
nuevo.

## Y el guardián nuevo que hay que conocer

`tools/comprueba-rpc-que-existen.js` revisa que toda función que el Javascript pide
por `rpc` exista en alguna migración. Se agregó porque `motivos_porteria_hoy` se
llamaba y **no existía en ninguna migración**: el nombre estaba inventado, el
`catch` se lo tragaba en silencio, y una persona con licencia salía como "Sin
marcar" en rojo.

Si agregás una llamada a una función de la base, ese guardián va a avisar. **No lo
saques de la lista de guardianes.**

---

# 5. Lo que te pido al final

1. **Cuál es la regla que rompe el layout**, con el número de línea y el por qué.
2. **Las medidas antes y después**, de la misma pantalla, en la página.
3. Si tocaste selectores con `id` repetido: **decí si.matchean algo hoy**, antes
   y después de corregirlos.
4. Los 34 guardianes en verde y la versión subida.
5. Si algo de lo que pedí no lo pudiste hacer, **decí cuál y por qué**. No lo
   saltees en silencio: un arreglo a medio hacer que no dice que quedó a medias es
   peor que no arreglar.