# El corte de `views/asistencia/relojes.js`, medido
# ==================================================

Este archivo se llama `relojes.js`. Contiene **seis módulos distintos**, en **diez bloques
alternados**, y no en uno solo.

No se movió nada todavía. Esto es el mapa que hace falta para moverlo sin romperlo, y está
medido con `tools/traza-modulos.js`, que se corre sobre el archivo y no sobre una opinión.

---

## Lo que hay

| | |
|---|---|
| Funciones de nivel superior | **137** |
| Líneas | **4.453** |
| Tablas y funciones de base que toca | **17** |
| Funciones que **sí** hablan con la base | **11** |
| Funciones que no la tocan | **126** |

Las 126 que no tocan la base son pintado, formato y mensajes. Es lo esperable, y es la
razón por la que **contar `.from(...)` no alcanza**: el archivo habla con la base en once
lugares y tiene casi cuatro mil líneas.

Y ese es el motivo por el que el plan anterior —"juntar las referencias de la entidad"—
fallaba: la entidad no está en el nombre de las funciones. Ver [arq-07].

---

## Los diez bloques, y a qué módulo van

Contiguos, sin huecos. Es lo que hay que partir, en orden.

| Líneas | Qué hay | Va a |
|---|---|---|
| 1–165 | encabezado y comentarios | — |
| 166–610 | `cargarRelojes` … `abrirFormularioToken` | **relojes** |
| 611–1601 | `totemTokenDe` … `explicarTokenInvalido` | **totem** |
| 1602–1868 | `revisarAvisosDelTrabajador` … `imprimirAvisoTotem` | **totem** |
| 1869–2214 | `fichaVacia` … `pintarFicha` | **totem** (es la ficha del trabajador en el totem) |
| 2215–2264 | `cargarMarcajesTotem`, `sumarMarcajeAlTotem` | **totem** |
| 2265–2566 | `pintarTotemContadores` … `abrirTotemPorURL` | **totem** |
| 2567–2960 | `renderContratacion` … `comprobarContratacion` | **documentos** |
| 2961–3137 | `generarClaveReloj` … `pantallaDeEsperaReloj` | **relojes** |
| 3138–3443 | `cargarMarcajes` … `descripcionFiltroMarcajes` | **asistencia** |
| 3444–4601 | `etiquetaTipoCampo` … `empresaDeLosDatos` | **documentos** |

O sea que el archivo alterna **cuatro veces**: relojes → totem → documentos → relojes →
asistencia → documentos.

**No se puede partir con dos cortes.** Con dos cortes solo, el bloque de relojes del medio
(L2961–3137) queda mezclado con documentos y con asistencia.

---

## El dato que decide si el corte es posible

**Tres funciones tocan más de una tabla. Ninguna cruza dos módulos.**

| Función | Tablas | ¿Mismo módulo? |
|---|---|---|
| `cargarRelojes` (L166) | `centros_costo`, `relojes` | sí, los dos son de relojes |
| `guardarReloj` (L317) | `relojes`, `rpc:rotar_token_reloj` | sí |
| `descargarPlantillaConDatos` (L3851) | `rpc:campos_faltantes`, `rpc:datos_para_plantilla`, `rpc:listar_plantillas` | sí, los tres son de documentos |

Si alguna hubiera cruzado, el plan pararía ahí: habría que partir esa función en dos o
dejarla shared. **No hay ninguna.**

Y eso se mide, no se supone: `traza-modulos.js` saca las tablas de cada función y cuenta las
que tienen más de una.

---

## Las tablas, agrupadas por módulo

De las 17 que toca el archivo:

```
RELOJES     relojes · centros_costo
            rpc:rotar_token_reloj · rpc:diagnostico_relojes · rpc:generar_pin_reloj
            rpc:comprobar_token_reloj · rpc:marcar_por_reloj

ASISTENCIA  marcajes
            avisos_ingreso

DOCUMENTOS  plantillas_contratacion · configuracion_timbre
            rpc:listar_plantillas · rpc:datos_para_plantilla · rpc:variables_de_plantilla
            rpc:gestionar_campo · rpc:campos_faltantes · rpc:diagnostico_contratacion
```

Cada grupo se queda en su archivo, y **`views/administracion/documentos.js` ya existe y
tiene 754 líneas** de Excel de marcajes y avisos. Los dos archivos de documentos quedan
juntos después del corte.

---

## El orden de los `<script>`

`app.html` los carga en este orden:

```
js/nucleo.js
views/asistencia/asistencia.css        ← es CSS, va aparte
js/app.js
views/asistencia/relojes.js
views/administracion/documentos.js
…
```

**Y aquí hay la trampa.** Los archivos son `<script>` clásicos, así que las funciones son
globales y el orden **no importa para definirlas**. Pero **sí importa para el código de nivel
superior**, que se ejecuta en el orden en que aparece.

O sea: mover una función es seguro; mover una línea de código que corre al cargar puede
cambiar el comportamiento.

---

## Cómo se hace, y cómo se comprueba

1. **Un bloque por turno.** Diez bloques son diez turnos, y cada uno termina commiteado.
2. Se corta con el rango de líneas **medido**, no escrito a mano. `traza-modulos.js` los
   imprime; el guion de corte los lee de ahí.
3. Se actualiza el `<script src>` de `app.html` **en el mismo commit**, y se sube la versión.
4. Se comprueba, en este orden:
   - `node tools/compila-juntos.js` — que el número de declaraciones no bajó
   - abrir `pages/app.html` y que no haya errores en la consola
   - entrar a cada una de las seis pantallas: relojes, totem, ficha, contratación,
     plantillas y marcajes
5. Si algo falla, `git checkout .` vuelve atrás, porque está todo commiteado.

---

## Lo que NO se hace

- **No se mueve nada sin el bloque entero.** Medio bloque es peor que nada: el archivo queda
  sin la función que le hace falta, y el síntoma aparece en otra pantalla.
- **No se parte `views/administracion/documentos.js` todavía.** Es otro corte, y este ya
  son diez.
- **No se toca `js/app.js` ni `js/nucleo.js`.** Son el núcleo. Se quedan.
- **No se usa `:is()` para agrupar los selectores.** Ver [panel-13].