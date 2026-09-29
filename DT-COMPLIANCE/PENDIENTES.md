# Todo lo pendiente, en orden

**Fecha:** 29 de septiembre de 2026
**Último commit:** `12fcd75` — *sin publicar*
**Regla de trabajo desde ahora:** una migración o una pantalla por turno, con las nueve suites en verde antes de commitear. Nada a medias.

---

## Cómo usar esta lista

Cada bloque dice **qué falta**, **qué hay que decidir antes**, y **cómo se sabe que está**. Las decisiones van marcadas, porque son lo que me ha frenado varias veces.

Para marcar algo, cambia `[ ]` por `[x]`. Para agregar algo nuevo, agrégalo arriba de la lista, no al final: lo que está al principio es lo que desbloquea.

---

# 0. Lo primero: dos tareas de cinco minutos

- [ ] **`git push origin main`** — hay 1 commit sin publicar (`12fcd75`, las pantallas del ingreso)
- [ ] **Probar las dos pantallas del ingreso**, que te entregué sin que las hayas visto:
  - *Supervisores → Solicitar ingreso* — escribe un RUT y un nombre, envía
  - *Administración → Ingresos pendientes* — aparece el pedido, apruébalo con un código
  - Los permisos están todos en `true` (verificado), así que deberían verse
  - **Si algo falla, pásame el mensaje tal cual.** Es la única forma de saber dónde está

---

# 1. DECISIONES QUE ESTÁN FRENANDO EL TRABAJO

Ninguna se puede contestar solo mirando el código. Las necesito de ti.

### 1.1 ¿El papel original se archiva?
**Frena:** qué se guarda del documento firmado.

El hash del escaneo no sirve de nada si el papel se pierde: lo que prueba es que el escaneo no cambió, no que el escaneo sea fiel al papel. En construcción casi seguro que el original se archiva, pero necesito que lo confirmes.

### 1.2 ¿Una empresa con varias obras, o varias empresas?
**Frena:** la tabla del expediente.

Si es una empresa con varias obras, el expediente lleva **centro de costo**. Si son varias empresas, lleva **empresa**. Es una columna y un filtro, pero no se puede cambiar después sin mover datos.

### 1.3 La comisión por trámites, ¿se le cobra a la empresa o al trabajador?
**Frena:** la tabla del cobro.

A una empresa (un subcontratista) es una cláusula de contrato: libre. A un trabajador es un **descuento de renta**, y eso está **regulado por el Código del Trabajo**: hay límites, hay que notificar, y el trabajador puede oponerse por escrito.

`REVISIÓN LEGAL` — fuente oficial: **Código del Trabajo en LeyChile (BCN)**. Hay que confirmar qué descuentos están permitidos, cuáles requieren autorización escrita, y qué pasa con los que no se autorizan. No lo doy de memoria porque en esto sí o sí hay que leer el texto.

### 1.4 ¿Cuántas firmas por mes, más o menos?
**Frena:** la decisión del servicio de firma.

El precio es **por firma**, no por contrato. Y un contrato son **dos firmas como mínimo** (empresa y trabajador o subcontratista), más las de los anexos. Una obra grande con veinte subcontratos puede ser ochenta firmas.

Precios de referencia, de sitios comerciales — hay que confirmarlos:

| | precio |
|---|---|
| Firma electrónica **simple** | $650 – $1.400 + IVA **por firma** |
| Certificado digital / FEA | $11.790 – $18.000 + IVA, de 1 a 3 años |
| Firma avanzada (certificado anual) | $30.000 – $60.000 por año |
| Plataforma | desde $9.990/mes, hay planes con firmas ilimitadas |

---

# 2. BASE DE DATOS

## 2.1 Migraciones aplicadas — falta verificar
- [ ] **`046` — ingresos pendientes.** Aplicada, pero sus funciones **nunca se ejecutaron en la base real**. Solo se comprobó que la migración se aplica limpia. Hay que probar el flujo: pedir un ingreso, duplicar el RUT, aprobar con código ocupado, aprobar bien.
- [ ] **`047` — amonestaciones.** Aplicada. Funciones sin probar en la base real.
- [ ] **`048` — permisos.** Aplicada y **verificada**: las 13 asignaciones están en `true`.

## 2.2 Migraciones escritas — falta aplicar
- [ ] **`044` — recepción de guías.** Corregida en `80c1e50` (usaba la columna `modulo` en vez de `categoria`, que no existe). **043 y 044 nunca se aplicaron completas.** Aplicar 043 primero, después 044, una por una, mirando qué dice el editor.
- [ ] **`039` — rol reloj en el catálogo.** Solo si necesitas el rol `reloj`. Tu diagnóstico lo marca en rojo: las funciones de la 033 están, el rol no llegó al catálogo.

## 2.3 Migración 049 — la que está frenando todo
**No existe.** Es la base del expediente y de los documentos.

Lo que lleva, según lo que quedamos:

- [ ] **Expediente por trabajador**, en **tabla** con filtros: por centro de costo, por trabajador, por anexos
- [ ] **PDF de lo filtrado** — el reporte de lo que se está viendo, no de todo
- [ ] **Documentos** con sus campos, de relleno **automático y manual**
- [ ] **El documento imprime con espacio en blanco** para firmar a mano, **dos copias**: una al archivo (con la ficha) y una al trabajador
- [ ] La hoja de archivo guarda: **quién recibió, cuándo y dónde**
- [ ] **Subir el escaneo firmado** después, con su huella, como respaldo
- [ ] **Huella (hash) del archivo**, con la ruta que incluye el hash, para que un archivo nunca se sobrescriba
- [ ] **Retirar sin borrar**: queda a la vista con su motivo, y **se puede volver a pedir**
- [ ] **Contador de firmas** por documento y acumulado, si se va a cobrar por trámite
- [ ] **Permisos**: pedir / aprobar / retirar. **Técnica aprueba y hace la contratación**; el supervisor pide; el supervisor ve **solo sus solicitudes aprobadas**
- [ ] **Paleta** por documento, con una general de respaldo si el usuario no elige
- [ ] **Timbre por plantilla**, no por empresa — hoy es una configuración por empresa

**Cómo se sabe que está:** la migración se aplica limpia dos veces seguidas, y probada en un Postgres de verdad con datos.

## 2.4 Modo de cobro
- [ ] **Tabla de movimientos**, no un campo: cuánto, a quién, concepto, quién lo cargó, respaldo
- [ ] **Separar lo que se cobró de lo que costó** — sin las dos cosas no hay margen
- [ ] **Comprobante para el trabajador**, si se le descuenta algo

---

# 3. PANTALLAS

## 3.1 Amonestaciones — la 047 existe, la pantalla no
- [ ] **La casilla en la ficha del trabajador**, en Administración
  - La casilla **se calcula**, no se guarda: sale marcada si hay al menos un amonestado **activo**
  - Con el conteo y el límite al lado: "2 de 5"
  - **Se desmarca sola** cuando el amonestado se archiva
- [ ] **Formulario de registro**, para prevención y RRHH
- [ ] **El detalle con el historial** y el botón de archivar con motivo
- [ ] **Dónde se cambia el límite por empresa** (arranca en 5)

## 3.2 Plantillas y documentos
- [ ] **El editor de plantillas** — lo crean soporte y RRHH
  - Los campos automáticos salen del perfil del supervisor y de la configuración de la empresa
  - El nombre del timbre es **el del perfil del supervisor**, y se **copia** al documento al firmar, no se lee al imprimir
- [ ] **La solicitud de contratación** — se pide solo la información del trabajador y las de los formularios; supervisor y empresa se llenan solos
- [ ] **La tabla de expedientes** con los filtros y el PDF
- [ ] **La cola de técnicos que aprueba** y hace la contratación

## 3.3 Recepción de guías
- [ ] **La pantalla de recepción**: leer el QR, cargar proveedor, entrar ítems con código interno y de proveedor, y la lista de lo que quedó sin identificar
- (las migraciones 043 y 044 están escritas, pero la 044 nunca se aplicó)

---

# 4. EL LÁPIZ EN TABLET

Dos cosas, y las dos son pérdida de firmas:

- [ ] **Si el lápiz sale del recuadro mientras dibuja, el trazo se corta.** No usa `setPointerCapture`. Firmando pasa todo el rato. Se arregla con una línea.
- [ ] **Al girar la pantalla o abrir el teclado, el `resize` puede borrar la firma a medio firmar.** La persona firma, mira la pantalla, y cuando vuelve ya no está. Es el peor de los dos.
- [ ] **Filtrar la palma** (opcional). Si apoyas la mano y el tablet lo reporta como toque, dibuja. Se puede arreglar sin romper a quien firma con el dedo.

Lo que ya está bien: usa Pointer Events y `touch-action:none`, que es lo que hace que el lápiz funcione.

---

# 5. ORGANIZACIÓN DEL CÓDIGO

- [ ] **Separar `migrations/`** en subcarpetas — las consultas de verificación están mezcladas con las 48 migraciones
  - Sin renumerar nada: el orden es el número, y cambiarlo rompe la secuencia de aplicación
- [ ] **Agrupar los archivos de consulta** en una carpeta propia
- [ ] **`DT-COMPLIANCE/plan-refactor-vistas.md`** está escrito: clases de vistas, CSS a clases, paleta calculada
  - Va en la rama `test`, no en `main`
  - Al final, no ahora: extraer clases de un archivo que sigue creciendo es trabajo repetido

---

# 6. LO QUE ME EQUIVOQUÉ, PARA QUE NO SE PIERDA

Ninguno de estos costó datos. Uno costó código, y lo revertí.

| | |
|---|---|
| **`empresas` en vez de `empresa`** | Escribí el nombre de memoria en la 046. La tabla es singular. |
| **`modulo` en vez de `categoria`** | La 044, la 046 y la 047 usaban una columna que no existe. **La 044 nunca se aplicó.** |
| **Nombres de columna de memoria** | Tres migraciones seguidas. Los nombres se leen del esquema antes de escribir. |
| **Declaré funciones que ya existían** | `normalizarRut` y `empresaActual`. El duplicado salió con la expresión regular rota. |
| **El HTML dentro del `<script>`** | El ancla era una función de JavaScript. Un `<section>` ahí no compila. |
| **Multiplicué `app.html` por cuatro** | Índices de búsqueda aplicdos sobre un texto que ya cambiaba. 905 KB a 3,6 MB. Se recuperó con `git checkout`. |
| **Un test que reproducía el error del código** | El armazón de PGlite usaba `create table empresas`, igual que la migración. Confirmaba el error en vez de encontrarlo. |
| **Creí que era un defecto de PGlite** | Lo era en parte, pero también había un error mío. Lo dije con demasiada seguridad. |
| **Dije "probadas en PGlite"** | No eran prueba de que funcionaran en la base real. Retirado. |
| **La ley: dije 19.845** | Es la **19.799**. No sé de dónde saqué ese número. |

**La regla que sale de todo esto, y que es lo que más cuesta aprender:** *las nueve suites se corren ANTES del commit, y los nombres de tabla y columna se leen del esquema ANTES de escribir la migración.*

---

# 7. LO QUE YA ESTÁ HECHO

Para que no se repita:

- **Las dos pantallas del ingreso pendiente** (`12fcd75`): *Solicitar ingreso* en Supervisores, *Ingresos pendientes* en Administración
- **Escaneo de elementos y herramientas por QR**, con carga manual si no están en el catálogo
- **Ubicación de la entrega**: pasillo, sector y nivel, opcionales (045)
- **Las tres barras con tres escalones medidos**, y dos tonos por sección: uno para tema claro y otro para oscuro
- **El candado del submenú**, que se veía como el texto `\1F512`
- **El recuadro de la firma legible** en tema oscuro
- **La localhost**, que estaba colgada desde hacía dos días
- **`046`, `047` y `048`** aplicadas, con los permisos verificados

---

# 8. LO QUE SIGUE INMEDIATAMENTE

En este orden, porque cada cosa desbloquea la siguiente:

1. **`git push`** y **probar las dos pantallas** ← cinco minutos
2. **Migración 049**, con el alcance de la sección 2.3 ← necesita las respuestas 1.1 y 1.2
3. **Probar el flujo de la 046** en la base real, que nunca se ejecutó
4. **Las pantallas de amonestaciones**, que es lo más avanzado que falta
5. **El editor de plantillas** y **la tabla de expedientes**
6. Los arreglos del lápiz en tablet
7. Separar `migrations/`
8. Las clases de vistas y CSS, en la rama `test`, al final

Y cuando sepas el volumen de firmas: la decisión del prestador, y la integración con la Ley 19.799.
