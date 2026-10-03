# El motor del `.docx`: hecho y probado, y un defecto sin explicar
# ==============================================================

## Lo que hay

`views/administracion/docx.js`, 367 renglones. Abre un `.docx`, reemplaza las variables,
y lo vuelve a armar. **Funciona**, y está probado en el navegador real por
`tools/pruebas/docx-ida-y-vuelve.html`, que carga **este** archivo con un `<script>` —no una
copia— y le hace nueve preguntas.

```
1) el método ingenuo no encuentra la variable partida      ok   (es la trampa, medida)
2) abrir, rellenar, volver a armar                        ok
3) el ZIP vuelve a abrirse, con las mismas 5 partes        ok
4) el texto es exactamente el esperado                    ok
5) no queda ningún delimitador "{{" "}}" "[[" "]]"        ok
6) los 14 runs se conservan, 5 vacíos con xml:space       ok
7) los estilos idénticos byte por byte, página carta       ok
8) un dato que falta queda "[falta]"                       ok
9) una variable partida entre párrafos NO se cruza          ok
```

## Por qué NO hay servidor

Se evaluaron las dos opciones y se descartaron por medición:

| | |
|---|---|
| Deno en esta máquina | **no está** |
| Bun | **no está** |
| `node_modules` | no existe |
| `requirements.txt` | no existe |
| Cómo se publica | estático, GitHub Pages |
| Único runtime de servidor | 5 Edge Functions, que no se pueden probar antes de subirlas |

Escribir un motor en el servidor sería código que no se puede ejecutar ni probar antes de
subirlo. La vía del navegador usa `fflate` —32 KB, de CDN—, que es el mismo camino que ya
usan las otras seis librerías del proyecto, y **se prueba en el navegador**.

## El problema que hace falta resolver

La suposición natural es que dentro del `.docx` está escrito:

```xml
<w:t>{{nombre}}</w:t>
```

**Y no está.** Word parte la frase en muchos pedazos, por las marcas de revisión y por dónde
estaba el corrector:

```xml
<w:r><w:t>{{nombre_completo</w:t></w:r>
<w:r><w:t>}}</w:t></w:r>
```

Y buscar `{{nombre_completo}}` en el XML crudo **no lo encuentra**. Sin error: el documento
sale con las llaves adentro y con un campo en blanco.

La solución son tres pasos: pegar los `<w:t>` del párrafo, buscar en el texto pegado, y
volver a escribir dejando el valor en el primer `<w:t>`. Y los `<w:t>` que quedan vacíos **no
se borran**, porque Word los necesita.

Y el reemplazo va **de atrás para adelante**: con los índices justos, la mitad de las variables
no salen.

---

## EL DEFECTO ABIERTO: la función no existe en ejecución

**`descargarDocxConDatos()` está en el archivo y no está en la página.**

Está en `views/administracion/documentos.js`, y `app.html` la referencia en el botón.
El botón está en el DOM, `fflate` carga, `DOCX_PLANTILLA` carga con sus 8 funciones —y la
función no existe ni como propiedad de `window` ni como nombre suelto.

Lo que se comprobó, y lo que NO se comprobó:

| Comprobación | Resultado |
|---|---|
| ¿Está en el archivo? | **sí**, y el `fetch` desde el navegador la encuentra |
| ¿El archivo entero parsea? | **sí**, `new Function(src)` no tira |
| ¿El bloque suelto parsea? | **sí** |
| ¿Hay un error en la consola? | **no**, ninguno |
| ¿La profundidad de llaves cierra en cero? | **sí**, con el medidor que salta comentarios, cadenas y expresiones regulares |
| ¿`descargarPlantillaModelo`, que está después, es global? | **sí** |
| ¿`descargarDocxConDatos` es global? | **NO** |

O sea que todo lo comprobable dice que debería funcionar, y no funciona. **Y no se sabe por
qué.**

Y hay dos pistas que no se resolvieron:

1. **La profundidad de llaves dice que está anidada.** El medidor probado la marca en
   `prof=1`. Pero `descargarPlantillaModelo`, **también** en `prof=1`, sí es global — y eso no
   puede ser en el mismo archivo. O el medidor miente a partir de cierto punto, o la
   estructura real es otra.

2. **La cuenta de llaves ingenua y la del medidor no coinciden.** La ingenua dice 2 sin
   cerrar al final; la del medidor dice 0. La ingenua cuenta llaves de comentarios y cadenas.

### Cómo seguir

El primer paso es **ver la estructura real**, no seguir contando:

1. Buscar en `documentos.js` qué llave se abre antes de la línea 1466 y no se cierra. Con el
   medidor, no con `grep`.
2. Comparar el texto que el navegador tiene cargado **contra** el del disco, renglón por
   renglón, y no contra el `fetch`. Porque el `fetch` lo sirven bien y el `<script>` no, y esa
   diferencia es justamente lo que falta mirar.
3. Ojo al **service worker**: `sw.js` cachea, y una URL con `?v=` nueva debería fallar la
   caché — pero eso hay que confirmarlo, no suponerlo.

### Y mientras tanto

El botón **no hace nada**, porque la función que llama no existe. No tira error: no pasa
nada. Eso es el peor síntoma posible, y por eso queda anotado acá y no en un comentario de
una línea.

**Para dejar el botón quieto hasta que se resuelva**, alcanza con sacar el `onclick` del
`app.html`. El motor y la arnés se pueden usar igual desde
`tools/pruebas/docx-ida-y-vuelve.html`.