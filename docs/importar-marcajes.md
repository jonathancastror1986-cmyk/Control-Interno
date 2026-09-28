# Importar marcajes desde Excel

Para cuando el reloj de la obra manda el reporte y no se puede pasar
tarjeta por tarjeta.

## Cómo se usa

**Supervisores → Asistencia diaria** → *Importar marcajes desde Excel*.

1. **Revisar archivo** — lee el Excel y muestra un resumen: cuántas
   filas vienen con datos, cuántas se van a guardar, y cuántas quedaron
   afuera y por qué. **No se guarda nada todavía.**
2. **Guardar N marcaje(s)** — solo aparece si hay algo válido que
   guardar.
3. Abajo, **Ver detalle** muestra la lista fila por fila y el motivo de
   cada rechazo.

El importador es de dos pasos a propósito: si el archivo viene mal, no
se toca la base. Con un reporte de un mes son cientos de filas y un
error a mitad de camino sería un desastre de datos.

## Qué columnas lee

El archivo de ejemplo es el reporte de un reloj de control de acceso:
`Asistencia modelo.xlsx`.

| Columna | Para qué | Ejemplo |
|---|---|---|
| **Tipo** | Decide entrada o salida | `Entrada`, `Salida` |
| **Evento** | Respaldo si no hay Tipo | `Inicio Jornada`, `Fin Jornada` |
| **Fecha** | El día del marcaje | `45744` (número de Excel) |
| **Hora** | La hora exacta | `0,31883` (fracción del día) |
| **Rut** | Para saber de quién es | `13199887-2` |
| **Colaborador** | Respaldo si no hay RUT | `ADASME VERDUGO JAIME PATRICIO` |

El resto de columnas (`Área`, `Centro de Costo`, `Cargo`, `Ubicación`,
`Empresa`, `Nº Contrato`, `Dispositivo`) se ignoran.

Se aceptan los nombres con o sin tilde, en mayúsculas o minúsculas.

### Fechas y horas en cualquier formato

Un reloj puede exportar de varias maneras y el importador las acepta
todas:

- **Fecha:** `2026-09-28`, `28/09/2026`, `28-09-2026`, o el número de
  serie de Excel (`45744`).
- **Hora:** `07:45`, `7.45`, `07-45`, `7` (se asume `:00`), la fracción
  del día (`0,31883` = 07:39), o el número de hora de Excel (`21` =
  21:00).

> La fecha de Excel se convierte con el desfase correcto (25569). El
> error típico —tratarla como milisegundos desde 1970— daría 2095 en
> vez de 2025.

### Qué se hace con cada fila

- `Tipo: Entrada` o `Evento: Inicio Jornada` → marcaje de **entrada**.
- `Tipo: Salida` o `Evento: Fin Jornada` → marcaje de **salida**.
- `Entrada Horas Extra` cuenta como **entrada**.

La **entrada** además se refleja como `X` en la tarja del día, que es
lo que verá el supervisor el mes que viene. La salida no va a la tarja:
la asistencia diaria ya se ve con el campo de hora.

## A quién se le importa

Cada fila se empareja con un trabajador por **RUT** (el dato que no
cambia nunca) y, si no hay RUT cargado, por **nombre**. El emparejamiento
por nombre ignora mayúsculas, tildes y el orden de las palabras, así que
`ALVAREZ CORDERO MARIA TERESA` en el reporte es la misma persona que
`María Teresa Álvarez Cordero` en la app.

La pantalla muestra **cómo** se emparejó cada fila (`RUT`, `nombre`,
`nombre (orden distinto)`), para que un emparejamiento raro se note
antes de guardar.

## Cargar el RUT de los trabajadores

**Administración → Trabajadores → Nuevo trabajador** (o editar uno) tiene
un campo **RUT**. Con los RUT cargados la importación es exacta.

Sin RUT también funciona, por nombre. El riesgo es que dos personas se
llamen igual, o que un nombre esté tipeado distinto en cada reporte; en
ese caso la fila queda en "sin trabajador que coincida" y el detalle dice
cuál fue.

El RUT se guarda solo con números y K, sin puntos ni guiones:
`13.199.887-2` y `131998872` son el mismo. Y es único: si dos
trabajadores tienen el mismo RUT, la app lo dice con el nombre de quien
ya lo tenía.

## Reimportar el mismo archivo

Se puede volver a subir el mismo reporte sin miedo:

- Un marcaje que ya existe **se corrige** si la hora cambió.
- Uno que ya existe con la misma hora **no se toca**.
- Nunca se duplica: hay un índice único por trabajador, día y tipo.

Después de importar, la pantalla dice cuántos fueron nuevos y cuántos
corregidos de verdad, no cuántos se reescribieron.

## Auditoría

Cada importación queda registrada en la tabla `marcajes_importaciones`:
qué archivo, cuántas filas traía, cuántas se guardaron, cuántas
coincidieron con alguien y cuántas no. Cada marcaje guardado además
lleva en su `nota` el nombre del archivo de donde salió.

## Permiso

Hace falta `tarja.excel` (el mismo que para cargar la asistencia).

## Si algo sale mal

| Síntoma | Qué revisar |
|---|---|
| "Falta la migración 020" | Ejecuta `migrations/020_rut_importacion_marcajes.sql`. |
| "No se pudieron leer los marcajes" | Falta la 017. |
| Casi todas las filas quedan sin coincidencia | Faltan los RUT en los trabajadores. |
| La fecha sale un día corrida | Se recargó la app con el archivo viejo: `Ctrl+F5`. |
| No aparece nada en la asistencia diaria | La fecha del reporte es anterior a la ventana cargada: usa el selector de fecha. |
| "66 corregidos" sin haber cambiado nada | Ya está corregido en esta versión: ahora solo cuenta los que de verdad cambiaron. |
