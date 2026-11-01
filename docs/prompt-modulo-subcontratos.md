# Módulo de empresas subcontratistas y documentos de obra

Proyecto: control de asistencia (JavaScript vanilla + Supabase, sin build, sin
`node_modules`). Archivos CRLF. Se sirve en `127.0.0.1:5502` con
`node tools/sirve.js`. La versión actual es la **v152**.

## Reglas que no se negocian

1. **No toques la base sin migración.** Las migraciones las aplica el usuario desde el
   panel SQL. Ya hay migraciones hasta la 103 (en disco, sin commitear): no
   renumerar ni sobrescribir. La siguiente libre es la **104**.
2. **Guardianes en verde antes de cada push.** Son **39**. Corre
   `node tools/corre-los-guardianes.js`; sale con código 1 si algo falla.
3. **El archivo que tocas sube de versión con el guion:**
   `node tools/sube-la-version.js <N>` — HTML, JS y CSS a la vez.
4. **Los errores EN PANTALLA, nunca en `console.warn`.**
5. **Las pruebas van en botones**, en `tools/pruebas/app-sin-login.html`.
6. **Medí antes de cambiar:** quién lee lo que tocás y quién lo escribe.
7. **Comentarios que explican POR QUÉ**, no qué.
8. **No dejes archivos a medias**, una cosa por turno.

## Lo que YA EXISTE (medido, no lo rehagas)

### Empresas
- Tabla `empresa` (001, 014, 053): `id`, `nombre`, `logo_url`, `rut`, `giro`,
  `direccion`, `telefono`, `email`, `sitio_web`, `hora_entrada`, `hora_salida`,
  `colacion_inicio`, `colacion_duracion_min`, `tolerancia_minutos`, `activa`.
- **No hay columna `tipo` ni `empresa_padre_id`**. La distinción principal/externa
  se hace por el `tipo_trabajador` de los trabajadores, no por la empresa.
- `empresa` ya tiene RLS por empresa (014:229-236) y `perfil_empresas` para el
  aislamiento.
- `views/administracion/administracion.js` carga empresas en `empresas[]` y
  `empresaActual` (0 = todas).

### Trabajadores
- `trabajadores` tiene `tipo_trabajador` ('interno' / 'externo', antes 'subcontrato',
  renombrado en 094).
- `trabajadores` tiene `empresa_id`, `centro_costo_id`, `supervisor_code`,
  `especialidad_clave`, `status` ('activo'/'desvinculado').
- La app ya distingue "Interno Empresa" / "Subcontrato" en la tarjeta y en la
  credencial (`app.js:1909`, `app.js:2366`).

### Documentos y firmas
- `entregas_contratacion` (031) con `firma_trabajador`, `firma_supervisor`,
  `firmado_trabajador_at`, `firmado_supervisor_at`, y `estado` ('incompleto',
  'completa', 'anulada'). Ya tiene el patrón de firmas y estados.
- `firmas_documento` (079) con `firma_imagen`, `firmante_nombre`, `firmante_rut`,
  `firmado_en`, `firmado_por`, `contenido_hash`, `hash_algoritmo`. Hash de
  integridad.
- `configuracion_timbre` (031:313) — el timbre de la empresa, que gira.
- `imprimirPapelEnVentana()` (js/impresion-papel.js) — el motor de papel que ya
  usan Bodega y la ficha del archivador.

### Motor de aprobación (migración 103, sin commitear)
- Tablas: `tipos_aprobables`, `empresa_flujos`, `empresa_flujo_pasos`,
  `aprobaciones_documento`, `aprobaciones_decisiones`.
- Views: `views/soporte/aprobadores.js` (380 líneas) — configura por empresa qué
  trámites necesitan aprobación y quién aprueba cada paso.
- Los trámites ya iniciados guardan una **copia congelada** de los pasos, así que
  cambiar un flujo nunca los toca.
- Los nombres llevan el prefijo `apb`.
- **Integrar el flujo de documentos del subcontrato con este motor, no duplicarlo.**

### Permisos
- `permisos` y `roles_permisos` (013, 031).
- Roles actuales: `admin, oficina, porteria, bodega, prevencion, rrhh,
  supervisores, tecnica, solicitante, aprobador`.
- `prevencion.subcontrato` (renombrado a `prevencion.externo` en 094) — prevención
  puede ingresar personal de subcontrato.
- `contratacion.*` — kit de contratación.
- `tarja.*` — asistencia.

### Centros de costo
- `centros_costo` (030): `{id, code, nombre, empresa_id, activo}`.
- `perfil_centros_costo` (090): `{user_id, centro_costo_id}` — quién ve qué centro.
- `trabajadores.centro_costo_id` (064).

### Pantallas existentes relevantes
- "Nuevo trabajador" (`pages/app.html` ~L138): alta de trabajador, con `tipo_trabajador` ('interno'/'externo').
- "Listado de trabajadores": filtro por empresa, supervisor, estado.
- "Aprobaciones y estados" (supervisores): solicitar cambio, aprobar solicitudes.
- "Contratación y plantillas" (kit): papeles del trabajador, plantillas, firmados, campos, timbre.
- "Empresas: cargos y permisos" (soporte): empresas, centros de costo, módulos.

## Lo que se quiere (descripción del usuario)

1. **Un módulo para el "Administrador de Obra o Técnica"** que pueda:
   - Agregar empresas subcontratistas (empresas externas que trabajan en la obra).
   - Agregar los usuarios de esas empresas (un supervisor y un administrativo).
   - Asignar a cada empresa subcontratista a qué centros de costo (obras) va a
     trabajar: puede ser uno o más.
2. **Cuando entra un trabajador externo** (subcontrato), el administrativo de la
   empresa subcontratista pide el **contrato o anexo de traslado a la obra** (no
   el contrato de la empresa principal).
3. **El administrativo subcontratista puede cargar documentos**: iniciales,
   mensuales y de cierre.
4. **El área técnica, prevención y RRHH** (de la empresa principal) pueden
   **solicitar documentación** al subcontratista — por ejemplo, RRHH pide las
   cotizaciones previsionales del trabajador al subcontratista, que es quien las
   firma y las envía.
5. **Un PDF** por cada documento, con las firmas correspondientes.

## Decisiones ya tomadas (no las cuestiones)

- Las empresas subcontratistas viven en la **misma tabla `empresa`**, con un campo
  `tipo` ('principal' / 'externa') y `empresa_padre_id`. NO se crea una tabla nueva.
- Los documentos reusan **`entregas_contratacion`** (que ya tiene firma de trabajador
  y supervisor, estados, timbre), agregando el concepto de etapa (inicial, mensual,
  cierre). NO se crea una tabla nueva.
- El flujo de aprobación se integra con el **motor de aprobación de la migración
  103** (`aprobaciones_documento`, `aprobaciones_decisiones`), no se duplica.

## Lo que falta diseñar (las decisiones que Copilot debe tomar y justificar)

### A. El campo `tipo` en `empresa`

- Agregar `tipo text not null default 'principal' check (tipo in ('principal','externa'))`
  y `empresa_padre_id int references empresa(id)`.
- Las empresas `externas` tienen `empresa_padre_id` apuntando a la principal.
- ¿Qué pasa si una externa se convierte en principal (una obra que se independiza)?
  Proponer: `empresa_padre_id` nullable, y un campo `activa` para desactivar.
- RLS: una externa solo ve a sus propios trabajadores. La principal ve a los
  externos vinculados.

### B. Los usuarios del subcontratista

- Roles nuevos: `admin_externo` y `supervisor_externo` (o reusar `supervisores` con
  un flag `es_externo`). Proponer y justificar.
- Un `admin_externo` solo ve su propia empresa y los centros que se le asignan.
- Un `supervisor_externo` solo ve a los trabajadores de su empresa.

### C. Los centros de costo por subcontratista

- La tabla `perfil_centros_costo` (090) ya vincula usuario↔centro. Reusarla.
- Pero además: la **empresa externa** debe estar vinculada a los centros en los
  que trabaja. ¿Nueva tabla `empresa_centros_costo`? ¿O se deriva de los usuarios?
  Proponer.

### D. El flujo de documentos

- Cuando un trabajador externo ingresa, se pide el **contrato/anexo de traslado**.
  Esto es una nueva plantilla en `entregas_contratacion` con `etapa = 'inicial'`.
- Los documentos mensuales: `etapa = 'mensual'`, uno por mes.
- Los de cierre: `etapa = 'cierre'`, al terminar el contrato.
- La tabla `entregas_contratacion` necesita una columna `etapa text` y
  `empresa_id` (para saber qué empresa subcontratista lo firmó).
- El área técnica, prevención y RRHH **solicitan** documentos: ¿se usa el motor
  de aprobación (103) con un tipo "documento_solicitado"? ¿O es una tabla nueva?
  Proponer integración con 103.

### E. La solicitud de documentación de RRHH

- RRHH pide las cotizaciones previsionales del trabajador al subcontratista.
- El subcontratista las carga (adjunta el archivo) y RRHH las revisa.
- Esto es un flujo de **solicitud → carga → revisión → aprobación/rechazo**.
  Integrar con `aprobaciones_documento` de la 103.

## Lo que se mide antes de cambiar

Antes de escribir código, Copilot debe:

1. Leer `migrations/094_renombrar_subcontrato_a_externo.sql` para entender cómo se
   renombró el concepto.
2. Leer `migrations/103_motor_aprobacion.sql` para entender el motor existente.
3. Leer `views/soporte/aprobadores.js` para entender la configuración de flujos.
4. Leer `js/nucleo.js` alrededor de `pintarGrupoCargo` y `seleccionarGrupoYCargo`
   para entender cómo se asignan cargos.
5. Leer `views/administracion/administracion.js` alrededor de `empresas` y
   `dbToEmpresa` para entender la estructura de empresa.

## Lo que NO se puede hacer

- No cambiar el RPC `registrar_guia` ni la estructura de `guia_lineas`.
- No cambiar la validación de duplicados ni de "llegó más de lo pedido".
- No crear una tabla nueva si ya existe una con el mismo propósito.
- No inventar permisos: si hace falta uno nuevo, proponerlo y esperar confirmación.
- No cambiar `entregas_contratacion` sin migración.

## Antes de editar

Muéstrame el plan en pocas líneas: qué migración nueva (104), qué columnas nuevas
en `empresa` y `entregas_contratacion`, qué roles nuevos, y cómo se integra con
el motor de aprobación de la 103.

## Al final

`node tools/corre-los-guardianes.js` y reporta el resultado. Si algún guardián
nuevo hace falta, agrégalo. No hagas commit ni push.