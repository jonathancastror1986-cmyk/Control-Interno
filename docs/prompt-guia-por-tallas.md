# Ingreso de guía: cantidad por talla y total automático

Proyecto: control de asistencia (JavaScript vanilla + Supabase, sin build, sin
`node_modules`). Archivos CRLF. Se sirve en `127.0.0.1:5502` con `node tools/sirve.js`.
La versión actual es la **v152**.

## Reglas que no se negocian

1. **No toques la base.** Las migraciones las aplica el usuario desde el panel SQL
   de Supabase. No hay Postgres local. El RPC que guarda la guía es
   `registrar_guia(p_bodega, p_proveedor, p_numero, p_tipo, p_fecha, p_lineas,
   p_archivo, p_pedido, p_guia_id)` y ya está en la base. No lo cambies ni
   agregues parámetros.
2. **Guardianes en verde antes de cada push.** Son **39**. Corre
   `node tools/corre-los-guardianes.js` al final; sale con código 1 si algo falla.
3. **El archivo que tocas sube de versión con el guion:**
   `node tools/sube-la-version.js <N>`, que actualiza `js/versiones.js`, `css/styles.css`,
   `pages/app.html` y `tools/pruebas/app-sin-login.html` a la vez.
4. **Los errores EN PANTALLA, nunca en `console.warn`.**
5. **Las pruebas van en botones**, en `tools/pruebas/app-sin-login.html`.
6. **Medí antes de cambiar:** quién lee lo que tocás y quién lo escribe.
7. **Comentarios que explican POR QUÉ**, no qué. El repo los protege con
   `comprueba-codigo-sql.js`.
8. **No dejes archivos a medias**, una cosa por turno.

## Medición previa (ya hecha, no la repitas)

El archivo es `views/bodega/guias-ingreso.js` (26.634 bytes). La estructura relevante:

- `giLineas` — arreglo de líneas, cada una `{codigo, talla, cantidad, costo, justificacion}`.
- `giCatalogo` — catálogo de artículos: `{codigo, nombre, requiere_talla, tipo_talla, activo}`.
- `giTallas` — tallas disponibles: `{talla, tipo, orden}`.
- `giPorCodigo(c)` — busca un artículo por código.
- `giTallasDe(art)` — devuelve las tallas para ese artículo (filtradas por `tipo_talla`, o todas si no hay tipo).
- `giPintarLineas()` — dibuja cada línea como una fila con cinco inputs: artículo, talla, cantidad, costo, quitar. Si el artículo `requiere_talla`, la talla es un `<select>`; si no, un input deshabilitado que dice "No lleva".
- `giValidar()` — valida que cada línea tenga artículo, talla (si requiere), cantidad entera > 0, sin duplicados de `codigo|talla`, y justificación si superó el pendiente.
- `giRevisar()` — muestra el resumen: `giLineas.length` líneas · `unidades` unidades (suma de todas las cantidades).
- `giGuardar()` — arma `lineas = giLineas.map(l => ({epp_codigo, talla, cantidad, costo_unitario, justificacion}))` y llama al RPC `registrar_guia` con `p_lineas`.

## El problema

Cuando se agrega un artículo que requiere talla (por ejemplo **Zapato**, código `ZAP-001`, `requiere_talla = true`, `tipo_talla = 'calzado'`), cada talla (37, 38, 39, 40, 41, 42) ocupa **una línea separada**. Para ingresar 5 zapatos talla 38, 3 de talla 39 y 2 de talla 40 hay que:

1. Apertar "+ Agregar línea" tres veces.
2. Elegir "Zapato" en las tres.
3. Elegir la talla en cada una.
4. Poner la cantidad en cada una.
5. Asegurarse de que no se repita la combinación `ZAP-001|38`.

Eso es tedioso y propenso a error: se puede elegir dos veces la misma talla (el validador lo detecta, pero después de haber escrito todo), y la suma total se calcula después de revisar, no mientras se escribe.

Lo que se quiere: **cuando se elige un artículo con talla, ingresar la cantidad de cada talla en un solo bloque, y que el total de la guía se calcule automáticamente como la suma.**

## Lo que NO se puede cambiar

- La estructura de `giLineas`: cada línea es `{codigo, talla, cantidad, costo, justificacion}`. El RPC `registrar_guia` espera un arreglo de objetos con esa forma. **No cambies el formato de salida.**
- La validación de duplicados `codigo|talla`. Sigue valiendo: no se pueden repetir.
- La validación de "llegó más de lo pedido" (`pendiente` y `justificacion`). Sigue valiendo.
- La tabla `guia_lineas` en la base tiene una fila por `guia_id, epp_codigo, talla`. No cambia.

## Lo que SÍ se puede cambiar

- La forma en que se **pintan** las líneas en pantalla.
- La forma en que se **agrega** un artículo con talla.
- La forma en que se **calcula el total** (ya se calcula bien; solo hay que mostrarlo en vivo).

## Lo que se mide antes de cambiar (ya medido)

- `giLineas.reduce((s,l)=>s+Number(l.cantidad),0)` ya suma todas las cantidades. El total ya funciona.
- `giValidar()` ya rechaza duplicados y tallas faltantes.
- `giPintarLineas()` dibuja una fila por elemento de `giLineas`, y para artículos con talla muestra un `<select>` de tallas.

## La propuesta (dos opciones, elegir una)

### Opción A — Bloque de tallas (recomendada)

Cuando se elige un artículo que `requiere_talla`, en vez de una sola línea con un `<select>` de talla, se muestra **un bloque** con una fila por cada talla disponible del tipo del artículo, cada una con su input de cantidad (inicialmente 0). El usuario llena las cantidades que llegaron y deja en 0 las que no.

- Las líneas con cantidad 0 **no se guardan** (no se mandan al RPC).
- El total se calcula en vivo y se muestra arriba del bloque.
- El costo unitario se comparte entre todas las tallas del bloque (un solo input).
- La justificación de "llegó más de lo pedido" se pide por talla, no por bloque.

**Ventaja:** se ven todas las tallas de un vistazo, se llena rápido, y no hay duplicados posibles.

**Costo:** hay que cambiar `giPintarLineas()` para que, cuando el artículo requiere talla, renderice un bloque en vez de una fila. Y hay que cambiar `giAgregarLinea()` para que, al elegir un artículo con talla, cree el bloque.

### Opción B — Una línea por talla, pero con "agregar talla" rápido

Mantener la estructura actual de una fila por línea, pero al elegir un artículo con talla, crear automáticamente **una fila por cada talla disponible** del tipo, con cantidad 0. El usuario borra las que no llegaron o las deja en 0.

**Ventaja:** no cambia mucho el código.

**Costo:** si un artículo tiene 10 tallas y solo llegaron 2, hay 8 filas con 0 que hay que borrar. Y el validador tiene que ignorar las de cantidad 0, o el usuario las tiene que quitar a mano.

## Lo que se pide (criterios de aceptación)

1. **Agregar un artículo con talla** crea un bloque con una fila por cada talla disponible de ese tipo (o todas las tallas si el artículo no tiene `tipo_talla`). Cada fila tiene su input de cantidad, inicialmente vacío o 0.
2. **El total se muestra en vivo** arriba del bloque, y se actualiza al cambiar cualquier cantidad.
3. **Las filas con cantidad 0 o vacía no se guardan** al registrar la guía.
4. **No se pueden repetir** artículo + talla (ya validado).
5. **El total de la guía** es la suma de todas las cantidades de todos los artículos (con y sin talla).
6. **Costo unitario** opcional, compartido por todas las tallas del bloque (un solo input por artículo).
7. **Justificación** por talla, solo cuando esa talla superó el pendiente.
8. **Quitar** un artículo con talla quita el bloque entero.
9. **Editar** una guía ya cargada muestra los bloques con las cantidades rellenadas.
10. **Validar** que no se pueda registrar una guía con todas las cantidades en 0.

## Lo que NO se puede hacer

- No cambiar el RPC `registrar_guia` ni la estructura de `guia_lineas`.
- No cambiar la validación de duplicados ni de "llegó más de lo pedido".
- No cambiar `giValidar`, `giGuardar`, `giRevisar` más allá de lo necesario para el total.
- No agregar migraciones ni tocar la base.

## Antes de editar

Muéstrame el plan en pocas líneas: qué función cambia, cómo se pinta el bloque, y cómo se calcula el total.

## Al final

`node tools/corre-los-guardianes.js` y reporta el resultado. Si algún guardián nuevo hace falta, agrégalo. No hagas commit ni push.