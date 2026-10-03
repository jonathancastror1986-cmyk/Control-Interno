# El módulo de contratos y documentos YA EXISTE
# ================================================

Un encargo pide construir gestión de plantillas `.docx`, motor de reemplazo de variables,
conversión a PDF y estados de firma, con backend en Node.js o Python.

Antes de construirlo, se buscó qué hay. Está casi todo. Este documento es la medición, para
decidir qué falta y qué no.

Todo lo de acá está medido sobre los **167 archivos que Git publica**, con
`tools/existe-modulo-contratos.js`. Los números no son estimaciones.

---

## Lo que ya está

| Lo que pide el encargo | Dónde está | Tamaño |
|---|---|---|
| Tabla de plantillas | `plantillas_contratacion` — migración **031** | 17 columnas |
| Campos propios por empresa | `plantilla_campos` + `trabajador_campo_valor` — **059** | 9 columnas |
| **Registros de contrato** | `entregas_contratacion` — **031** | 15 columnas |
| **Estados** | columna `estado` de `entregas_contratacion` | ver abajo |
| Firma: autorización del trabajador | `firma_autorizaciones` — **063** | 10 columnas |
| Subir plantilla de Word | `subirPlantillaArchivo` | 36 renglones |
| Leer lo que salió de Word | `htmlDesdeArchivoDeWord` | 23 renglones |
| **Reemplazar variables** | `completarPlantilla` | 44 renglones |
| **Generar el PDF** | `descargarPlantillaConDatos` (jsPDF + html2canvas) | 77 renglones |
| Plantilla en blanco para editar | `descargarPlantillaModelo` | 29 renglones |
| Pintar la vista previa con datos | `pintarVariablesConDatos` | 67 renglones |
| Modo de firma (a mano / digital / mixto) | `modo_firma` — migración **062** | `check` de 3 valores |
| Lienzo de firma | se guarda en `firma_trabajador` y `firma_supervisor` | base64 PNG |

---

## Los estados ya existen, y son mejores que los del encargo

El encargo propone `Borrador` → `Pendiente de Firma` → `Firmado`. Lo que hay es:

```sql
estado text not null default 'incompleto'
  check (estado in ('incompleto','completa','anulada'))
```

Y no son menos: son **tres** estados, y el tercero es el que hace falta para responder una
pregunta que con el vocabulario del encargo no se puede contestar.

**Un papel se rehace.** Un contrato mal generado se vuelve a hacer. Con
`Borrador / Pendiente / Firmado` no hay dónde dejar el papel viejo, y la pregunta *"¿cuántas
veces se firmó esto y por qué se rehízo"* no tiene respuesta.

Lo que hay es un **índice único parcial**:

```sql
create unique index if not exists entregas_unica_viva_idx
  on public.entregas_contratacion(trabajador_code, plantilla_id)
  where estado <> 'anulada';
```

Un papel vivo por persona y por plantilla. Cuando se rehace, el viejo queda `anulada` y el
nuevo aparte. Es el mismo criterio de un documento firmado.

Y hay **dos columnas de fecha distintas**: `generado_at` y `firmado_trabajador_at`, porque el
PDF se genera un día y se escanea otro. Con un solo "estado" y un solo "firmado_at", eso no se
puede registrar.

---

## OJO CON LA SINTAXIS DE LAS VARIABLES —esto es lo que más caro sale

El encargo dice `{{nombre_empleado}}`, `{{rut}}`, `{{sueldo}}`. **Esa forma no llena nada.**

Hay **dos idiomas** en el mismo documento:

| Quién | Forma | Para qué |
|---|---|---|
| `campos_de_plantilla` (la base) | `{{nombre}}` | **revisar** qué campos necesita |
| `completarPlantilla` (el navegador) | `[NOMBRE]` | **llenar** el documento |

Y la migración **060** existe exactamente por esto. Está escrito en el propio archivo:

> Una plantilla escrita con `{{nombre}}` —que es lo que el comentario de la tabla, el texto de
> ayuda de la pantalla y el ejemplo de la 058 le dicen que escriba— pasa revisión y nunca se
> completa. El documento sale con las llaves adentro y sin ningún error.
>
> **Y ESO SE VIO**: una plantilla con `{{nombre_completo}}` en el encabezado, en el cuerpo y en
> firma, que el editor decía reconocer y que nunca iba a llenar nadie.

O sea: el documento tiene que estar **en los dos idiomas**, porque uno lo revisa y el otro lo
llena. Con `{{}}` solamente, la plantilla pasa la revisión y sale vacía **sin ningún error**.

Y si a un campo le falta un dato, `completarPlantilla` no lo deja en blanco: pone `[falta]`,
que es lo que permite verlo en la vista previa antes de descargar.

---

## Y NO HAY BACKEND DE NODE NI DE PYTHON

Esto es lo que decide la arquitectura, y conviene que esté claro antes de escribir código.

| | |
|---|---|
| `package.json` | existe, **cero dependencias**, sin build |
| `node_modules` | **no existe** |
| `requirements.txt` / `pyproject.toml` | **no existen** |
| Cómo se publica | GitHub Pages, estático |
| Único runtime de servidor | **Supabase Edge Functions, en Deno** — 5 en producción |

Hoy el PDF se genera **en el navegador del usuario**, con jsPDF y html2canvas. El `.docx` se
lee **en el navegador**. No hay servidor que haga nada de esto.

Meter `docxtemplater` o `python-docx-template` significa:

- un runtime que no existe en el proyecto,
- una despliegue nueva (o una Edge Function en Deno),
- y un camino de mantenimiento más, para algo que ya funciona.

---

## EL HUECO REAL, Y ES UNO SOLO

El flujo actual es:

```
plantilla.doc  →  Word  →  se edita  →  se sube  →  HTML + CSS en la base
                                                        ↓
                                              completarPlantilla("[NOMBRE]" → dato)
                                                        ↓
                                       jsPDF + html2canvas  →  PDF
```

Y el `.docx` entra **convertido a HTML**: `htmlDesdeArchivoDeWord` saca el `<body>` y los
estilos `<style>` y tira lo demás —las etiquetas `<o:p>`, los comentarios condicionales, los
`\r`.

Eso significa que **el archivo de Word no vuelve**. El PDF se parece al documento, pero no es
el documento: las tablas de Word que se parten entre páginas, los encabezados que se repiten, la
orientación del papel, los márgenes exactos, no sobreviven a un viaje por HTML.

**Si lo que se necesita es que el `.docx` vuelva con su formato intacto, eso sí falta, y
necesita un motor en el servidor.** Con eso, las opciones son dos:

| Opción | Qué es | Qué cuesta |
|---|---|---|
| **A. Edge Function en Deno** | JS con la misma librería de plantillas OOXML | El runtime que ya existe. Sin despliegue nuevo. |
| **B. Servicio en Node o Python** | `docxtemplater` o `python-docx-template` | Runtime nuevo, despliegue nuevo, y duplica lo que ya se hace en el navegador. |

La **A** es la que encaja con este proyecto. Pero cambia qué se descarga: hoy es PDF, y con
`.docx` realaría un `.docx` firmado —que es mejor, porque el `.docx` firmado es el documento
nativo y el PDF es una foto.

Esto es una **decisión de producto**, y por eso no se tomó sola: si el flujo debe devolver
`.docx` nativo o basta con el PDF, todo lo demás es igual.

---

## Lo que NO se hace, y por qué

- **No se escribe un módulo en Python.** Duplicaría código que funciona y agregaría un runtime
  que el proyecto no tiene.
- **No se cambian los estados.** Los que hay responden una pregunta que los del encargo no.
- **No se cambia la sintaxis de las variables.** Es de Word a Word: uno revisa con `{{}}` y el
  otro llena con `[NOMBRE]`. Cambiarlo rompe las plantillas que ya están escritas.

---

## Y hay tres mecanismos de plantillas, que sí convendría revisar

| Tabla | Qué es |
|---|---|
| `plantillas_contratacion` | el kit de ingreso: charla, formularios, actas |
| `plantillas` (migración 058) | plantillas con su propia sintaxis |
| `documentos_catalogo` + `expedientes` (049) | expedientes y documentos sueltos |

Tres caminos para guardar texto con variables. No es un error —cada uno tiene su pantalla— pero
es lo que hace que la respuesta a *"¿dónde está la función que genera el contrato?"* necesite
buscar en tres lugares.