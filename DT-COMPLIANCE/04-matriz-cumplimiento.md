# 04 — Matriz de cumplimiento

Entregable 8 de la Fase 1. Fecha de corte: **28 de septiembre de 2026**.

## Cómo leer la matriz

| Columna | Significado |
|---|---|
| **ID** | Identificador del requisito, el mismo del documento 01 |
| **Fuente** | `F1 art. N` = Resolución Exenta 38/2024 · `CT art. N` = Código del Trabajo |
| **Tipo** | **LEGAL** ley · **DT** resolución · **BP** buena práctica · **OPC** opcional |
| **Implementación** | Dónde se resuelve. `—` = no resuelto |
| **Prueba** | Cómo se demuestra en la certificación (F1 art. 65 g) exige "las razones técnicas por las que se considera que cumple cada condición") |
| **Estado** | **COMPLETO** · **PENDIENTE** · **NO APLICA** · **REVISIÓN LEGAL** |
| **Fase** | En qué fase se resuelve |

**Convención de estado:** casi nada es COMPLETO. El sistema actual es un control
de asistencia que funciona, pero no tiene nada de lo que la resolución exige en
materia de integridad, portal ni reportes. Decir COMPLETO a algo que no lo está
es exactamente el error que esta matriz existe para evitar.

---

## Resumen

| Tipo | Total | COMPLETO | PENDIENTE | NO APLICA | REVISIÓN LEGAL |
|---|---|---|---|---|---|
| **LEGAL** (Código del Trabajo) | 15 | 2 | 10 | 1 | 2 |
| **DT** (Resolución Exenta 38/2024) | 186 | 10 | 154 | 17 | 5 |
| **BP** (buena práctica) | 12 | 1 | 11 | 0 | 0 |
| **OPC** (opcional por decisión) | 1 | 1 | 0 | 0 | 0 |
| **Total** | **214** | **14** | **175** | **18** | **7** |

Se cuentan también los 2 requisitos que están COMPLETO **por omisión**: la
geolocalización y la biometría no se implementan, así que lo que la resolución
exige de ellas se cumple sin hacer nada. Es un COMPLETO real y hay que
registrarlo como tal, porque si alguien los agrega después sin darse cuenta,
rompe la certificación.

**Leyenda de los COMPLETOS:** son 10 requisitos DT y 2 legales ya resueltos en
el proyecto actual. Ninguno es de los difíciles. Los difíciles —checksum por
marcación, portal de fiscalización, los seis reportes, el procedimiento de
corrección de 48 horas— están todos PENDIENTE.

**174 requisitos pendientes no son 174 meses.** Varios se resuelven juntos:
construir el verificador de hash arrastra el hash, arrastra la tabla de
marcaciones, arrastra la retención. El número de trabajo real está en los 10
grupos de la sección siguiente, no en las 174 filas.

---

## Bloque 1 — Obligaciones del empleador (art. 58)

Son las infracciones que la DT puede sancionar. **Ninguna puede quedar PENDIENTE
en producción**, aunque sea antes de la certificación, porque aplican a cualquier
empleador que use el sistema, autorizado o no.

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| E-01 | No usar un sistema de registro y control de asistencia | F1 art. 58 a) | DT | El sistema obliga a configurar jornada | Manual de uso | COMPLETO | — |
| E-02 | No usar un sistema electrónico **no autorizado** | F1 art. 58 b) | DT | `plataformas.vigente` + aviso en panel | Banner en pantalla + contrato | **REVISIÓN LEGAL** | 12 |
| E-03 | Sin fallas que entorpecen el proceso inspectivo | F1 art. 58 c) | DT | Portal 7×24 | Historical de disponibilidad | PENDIENTE | 3 |
| E-04 | Dar todas las facilidades en fiscalización presencial | F1 art. 58 d) | DT | Documento de procedimiento | Manual de administrador | PENDIENTE | 11 |
| E-05 | **No alterar la información del sistema** | F1 art. 58 e) | DT | Trigger `marcaciones_no_update` | Intentar un `UPDATE` y ver el error | PENDIENTE | 2 |
| E-06 | **Contar con los reportes diarios** | F1 art. 58 f) | DT | Job programado | Correo recibido | PENDIENTE | 9 |
| E-07 | Actualizar la información de trabajadores periódicamente | F1 art. 58 g) | DT | `trabajadores.activo` | Reporte de inactivos | COMPLETO | — |
| E-08 | No restringir el cambio de claves o correos | F1 art. 58 h) | DT | Formulario de cambio por el trabajador | Test del flujo | PENDIENTE | 4 |
| E-09 | Respetar las normas de recolección, tratamiento y destrucción de datos | F1 art. 58 i) | DT | Tabla de consentimientos | Script de destrucción | PENDIENTE | 8 |
| E-10 | **Capacitar a los trabajadores** | F1 art. 58 j) | DT | Registro de capacitaciones | Acta firmada | PENDIENTE | 9 |
| E-11 | **No bloquear la posibilidad de marcar** | F1 art. 58 k) | DT | Sin bloqueo por ubicación, permiso ni feriado | Test de los tres casos | PENDIENTE | 7 |
| E-12 | **5 años de información disponible en formato electrónico** | F1 art. 58 l) | DT | Retención + filtros | Consulta a 5 años | PENDIENTE | 2 |

---

## Bloque 2 — Integridad de registros

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| R-01 | Hash/checksum por marcación | F1 art. 8 | DT | `marcaciones.checksum` + trigger | `select checksum` | PENDIENTE | 2 |
| R-02 | Función **nativa**, no concatenación | F1 art. 8 | DT | `calcular_checksum_marcacion()` con `digest()` | Revisión de código | PENDIENTE | 2 |
| R-03 | SHA-2 | F1 art. 8 (recom.) | DT | `digest(..., 'sha256')` | — | PENDIENTE | 2 |
| R-04 | **Pantalla web pública de verificación por hash** | F1 art. 8 | DT | `GET /marcaciones/verificar` | Verificar un hash real | PENDIENTE | 3 |
| R-05 | BDpreviene acceso no autorizado | F1 art. 14 a) | DT | RLS por `empresa_id` | `set role authenticated` y probar | **COMPLETO** | — |
| R-06 | BDpreviene adulteración posterior al registro | F1 art. 14 a) | DT | Trigger que rechaza `UPDATE`/`DELETE` | El `UPDATE` falla con el mensaje | PENDIENTE | 2 |
| R-07 | Respaldos con hash o firma; alterations indicadas en pantalla y reportes | F1 art. 14 b) | DT | Marca visual de registro alterado | Reporte con registro modificado | PENDIENTE | 9 |
| R-08 | **Toda alteración visible** en pantalla | F1 art. 41 a) | DT | Indicador en planilla y detalle | Ver una corrección | PENDIENTE | 4 |
| R-09 | Auditoría automática de perfiles, solo admins | F1 art. 15 | DT | `accesos_sistema` | Listado de accesos | **COMPLETO** | — |
| R-10 | Auditoría de conexiones DT con IP | F1 art. 22.5) | DT | Tabla `conexiones_fiscalizacion` | Un acceso desde @dt.gob.cl | PENDIENTE | 3 |
| R-11 | Hash encadenado | — | BP | `marcaciones.hash_anterior` | Borrar una fila del medio y ver que rompe | PENDIENTE | 2 |
| R-12 | Registro *append-only* de auditoría | F1 art. 15 | DT | Sin políticas de `UPDATE`/`DELETE` | `update` falla | **COMPLETO** | — |
| R-13 | Correlativo monótono sin huecos | — | BP | `bigint identity` | `setval` manual falla | **COMPLETO** | — |

---

## Bloque 3 — Identificación

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| I-01 | Enrolamiento con cualquier hardware diferenciador | F1 art. 7 a) | DT | Token QR + PIN | Enrolamiento real | PENDIENTE | 6 |
| I-02 | Hardware de enrolamiento ≠ medio de marcación (puede coincidir) | F1 art. 7 b) | DT | Token enrolado, QR marca | — | **NO APLICA** (coinciden) | — |
| I-03 | **Dos alternativas de identificación** | F1 art. 7 g) | DT | QR + PIN | Marcar con el PIN solo | PENDIENTE | 6 |
| I-04 | **Al menos una sin biometría y sin datos personales** | F1 art. 7 g) | DT | PIN | Inspección del diagrama | PENDIENTE | 6 |
| I-05 | Primary y secundaria definidas en contrato o RIOS | F1 art. 7 g) | DT | Texto en el RIOS | Documento | PENDIENTE | 11 |
| I-06 | El trabajador puede cambiar su clave cuando quiera | F1 art. 7 f) | DT | Formulario + correo de confirmación | Flujo completo | PENDIENTE | 4 |
| I-07 | Tarjeta magnética: Cédula asociada e impresa | F1 art. 7 e) | DT | — | — | **NO APLICA** (no se usan) | — |
| I-08 | No vulnerar derechos fundamentales | F1 art. 56 | DT | Sin biometría, sin vigilancia | Análisis de la solicitud | PENDIENTE | 11 |
| I-09 | Sin discriminación por inclusión | F1 art. 33 | DT | Touchscreen + lector USB | Foto del reloj | PENDIENTE | 5 |
| I-10 | Consentimiento escrito para datos fuera del art. 10 CT | F1 art. 57.1) | DT | Anexo de consentimiento | Documento firmado | PENDIENTE | 8 |
| I-11 | Nombres técnico y comercial declarados | F1 art. 66.1 h) | DT | Tabla `plataformas` | Carta conductora | PENDIENTE | 12 |
| I-12 | Token QR no es dato personal | — | BP | 128 bits aleatorios, sin RUT ni código | Análisis de la solicitud | PENDIENTE | 6 |

---

## Bloque 4 — Tiempo

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| H-01 | Marca de tiempo electrónica | F1 art. 11 | DT | `marca_de_tiempo timestamptz` | Registro | PENDIENTE | 2 |
| H-02 | Formatos `dd/mm/aa` y `hh:mm:ss` | F1 art. 13, 27 | DT | Formateo en los reportes | Ver reporte | PENDIENTE | 9 |
| H-03 | Cálculo al segundo, sin aproximación | F1 art. 44 | DT | `interval` nativo | Caso con 37 segundos | PENDIENTE | 9 |
| H-04 | Zona horaria `America/Santiago` | — | BP | `SET TIME ZONE` y columna | Un cambio de horario | PENDIENTE | 2 |
| H-05 | Sincronización NTP | — | BP | NTP del sistema + token firmado | Desviación medida | PENDIENTE | 5 |
| H-06 | Detección de desviación horaria | — | BP | `desfase_segundos` vs reloj | Reloj con 2 min de desvío | PENDIENTE | 5 |
| H-07 | El reloj no marca con desviación excesiva | — | BP | Umbral + mensaje en pantalla | Captura de pantalla | PENDIENTE | 5 |
| H-08 | Manejo del cambio de horario oficial | — | **REVISIÓN LEGAL** | Pendiente | — | **REVISIÓN LEGAL** | 5 |

> **H-08:** Chile cambió la hora oficial varias veces. No encontré en F1 ninguna
> exigencia sobre cómo tratar el cambio. **Hay que preguntarlo.** Mientras tanto,
> la regla técnica sensata es guardar todo en UTC y convertir en
> `America/Santiago` al mostrar, con la tabla de cambios de zona horaria
> versionada en el sistema, porque una planilla de marzo y otra de agosto no
> pueden usar la misma regla sin registrarla.

---

## Bloque 5 — Correcciones

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| M-01 | Modificar solo en los casos del art. 39 | F1 art. 39 | DT | RPC con validación de motivo | Modificación no permitida | PENDIENTE | 4 |
| M-02 | Tolerancias voluntarias automatizables | F1 art. 39 a) | DT | Config por empresa | Atraso dentro del rango | PENDIENTE | 9 |
| M-03 | Agregar marcaciones faltantes | F1 art. 39 b) | DT | RPC `agregar_marcacion` | Alta manual | PENDIENTE | 4 |
| M-04 | **Correo con fecha y hora original y nueva** | F1 art. 40 b) | DT | Plantilla de correo | Correo recibido | PENDIENTE | 3 |
| M-05 | **48 h para oponerse por correo** | F1 art. 40 c) | DT | `expiracion_oposicion` | Oposición a las 47 h | PENDIENTE | 4 |
| M-06 | Sin oposición, se consolida | F1 art. 40 d) | DT | Job a las 48 h | Estado tras 49 h | PENDIENTE | 4 |
| M-07 | Con oposición, queda el original | F1 art. 40 e) | DT | Job que revierte | Oposición | PENDIENTE | 4 |
| M-08 | Relleno automático al día siguiente | F1 art. 40 f) | DT | Job nocturno | Marca faltante | PENDIENTE | 4 |
| M-09 | **Solo hasta el día hábil siguiente** | F1 art. 41 c) | DT | `dentro_de_plazo` en la RPC | Corrección a 3 días | PENDIENTE | 4 |
| M-10 | **No automatizar inicio/fin de jornada** | F1 art. 41 d) | DT | Los tipos no se automatizan | Intento por API | PENDIENTE | 4 |
| M-11 | **No aceptar comprobantes en papel** | F1 art. 41 e) | DT | No hay carga de adjuntos | Intento de carga | PENDIENTE | 4 |
| M-12 | La corrección no puede perjudicar al trabajador | F1 art. 41 b) | DT | Validación en la RPC | Corrección que reduce jornada | PENDIENTE | 4 |
| M-13 | Sin descuentos automáticos diarios | F1 art. 42 | DT | Cálculo semanal | Reporte | PENDIENTE | 9 |
| M-14 | Historial completo de quién, cuándo, por qué | — | BP | `marcaciones_auditoria` | Consulta | PENDIENTE | 2 |

---

## Bloque 6 — Comprobantes y correo

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| C-01 | **Comprobante automático por cada operación** | F1 art. 12 a) | DT | Cola de correo | Correo por marcación | PENDIENTE | 3 |
| C-02 | Al correo **personal** registrado | F1 art. 12 b) | DT | `trabajadores.correo` | Destinatario | PENDIENTE | 4 |
| C-03 | Formato imprimible | F1 art. 12 c) | DT | HTML con CSS de impresión | Imprimir | PENDIENTE | 3 |
| C-04 | Cuenta **no nominativa** | F1 art. 12 d) | DT | `marcaciones@dominio` | Header del correo | PENDIENTE | 3 |
| C-05 | Sin correos duplicados entre trabajadores | F1 art. 12 e) | DT | Restricción `unique` | Carga con duplicado | PENDIENTE | 2 |
| C-06 | Segundo correo a la EST | F1 art. 12 f) | DT | — | — | **NO APLICA** (v1 sin EST) | — |
| C-07 | Contenido mínimo del comprobante | F1 art. 13.1 | DT | Plantilla con los 7 campos | Correo recibido | PENDIENTE | 3 |
| C-08 | Datos del empleador y ubicación completa | F1 art. 13.2 | DT | `sucursales` con calle/número/piso/comuna/ciudad/región | Comprobante | PENDIENTE | 2 |
| C-09 | Domicilio = lugar de prestación efectiva | F1 art. 13.3 | DT | `sucursal_id` en la marcación | Comprobante | PENDIENTE | 2 |
| C-10 | **Cada trabajador con correo registrado** | F1 art. 34 | DT | Campo obligatorio al enrolar | Alta sin correo | PENDIENTE | 4 |
| C-11 | Crear cuenta gratuita si el trabajador no quiere | F1 art. 34.1 b) | DT | Sugerencia en el alta | Flujo | PENDIENTE | 4 |
| C-12 | Entrega de credenciales por escrito | F1 art. 34.1 b) | DT | Anexo | Documento | PENDIENTE | 11 |
| C-13 | Cambio de correo sin trabas | F1 art. 34.2 b), d) | DT | Formulario | Flujo | PENDIENTE | 4 |
| C-14 | Aceptar correos de terceros | F1 art. 34.2 c) | DT | Sin validación de dominio | Alta con correo de familiar | PENDIENTE | 4 |
| C-15 | El prestador evita spam y bloqueos | F1 art. 34.2 f) | DT | DKIM/SPF/DMARC + dominio propio | Prueba de entrega | PENDIENTE | 3 |
| C-16 | Verificación en línea del comprobante por hash | F1 art. 8 | DT | Endpoint público | Ver un hash | PENDIENTE | 3 |
| C-17 | Alerta a los 30 min de marcación omitida | F1 art. 45.1) | DT | Job cada 5 min | Alerta recibida | PENDIENTE | 9 |
| C-18 | Correos privados se eliminan según art. 57 | F1 art. 34.2 g) | DT | Script de destrucción | Registro de baja | PENDIENTE | 8 |

---

## Bloque 7 — Reportes

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| P-01 | **Seis reportes, mismo orden y nomenclatura** | F1 art. 27 | DT | Módulo de reportes | Menú del portal | PENDIENTE | 9 |
| P-02 | a) Reporte de asistencia, 4 columnas | F1 art. 27 a) | DT | — | — | PENDIENTE | 9 |
| P-03 | b) Reporte de jornada diaria, **11 columnas** | F1 art. 27 b) | DT | — | — | PENDIENTE | 9 |
| P-04 | c) Domingos y festivos, hasta 24 meses | F1 art. 27 c) | DT | — | — | **REVISIÓN LEGAL** (12 vs 24) | 9 |
| P-05 | d) Modificaciones de turnos, **11 columnas** | F1 art. 27 d) | DT | — | — | PENDIENTE | 9 |
| P-06 | e) **Reporte diario automático al cliente** | F1 art. 27 e) | DT | Cron 06:00 | Correo | PENDIENTE | 9 |
| P-07 | f) Registro de incidentes técnicos | F1 art. 27 f) | DT | Tabla + export | Un incidente | PENDIENTE | 9 |
| P-08 | 10 filtros de búsqueda | F1 art. 25.1 | DT | Constructor de reportes | Cada filtro | PENDIENTE | 9 |
| P-09 | Rango de fechas **hasta 5 años** | F1 art. 25.1 d) | DT | Selector de fechas | Rango de 5 años | PENDIENTE | 9 |
| P-10 | Turnos por **extensión**, no por nombre | F1 art. 25.1 f) | DT | "Lunes a jueves, 10:00 a 18:00" | Ver filtro | PENDIENTE | 9 |
| P-11 | Cargos coincidentes con el RIOS | F1 art. 25.1 h) | DT | — | Comparar con el RIOS | PENDIENTE | 9 |
| P-12 | Filtros en cualquier orden, todos visibles | F1 art. 25.2 | DT | — | Filtro en orden invertido | PENDIENTE | 9 |
| P-13 | Descarga idéntica a lo previsualizado | F1 art. 28 a) | DT | — | Comparar | PENDIENTE | 9 |
| P-14 | Exportación a **Excel, PDF y Word** | F1 art. 28 b) | DT | — | Los tres archivos | PENDIENTE | 9 |
| P-15 | Visible en una sola pantalla | F1 art. 28 c) | DT | Tabla densa | Sin scroll | PENDIENTE | 9 |
| P-16 | Imprimible en una hoja | F1 art. 28 d) | DT | CSS de impresión | Imprimir | PENDIENTE | 9 |
| P-17 | **Arial N.º 8 como máximo** | F1 art. 28 e) | DT | CSS de reportes | Medir | PENDIENTE | 9 |
| P-18 | Mensaje literal sin resultados | F1 art. 28 f) | DT | — | Búsqueda sin match | PENDIENTE | 9 |
| P-19 | 14 siglas obligatorias | F1 art. 28 g) | DT | — | Reporte con atrasos | PENDIENTE | 9 |
| P-20 | Ordenado por dependiente, con totales | F1 art. 28 h) | DT | — | 3 trabajadores | PENDIENTE | 9 |
| P-21 | Totales semanales con signo y `hh:mm:ss` | F1 art. 27 b.12) | DT | — | Semana con HE | PENDIENTE | 9 |
| P-22 | **Exención** de reportes semanales firmados | F1 art. 29 | DT | Documentación | — | **NO APLICA** (es exención) | — |
| P-23 | Total semanal resta la colación pactada | F1 art. 27 b.12) | DT | Cálculo | Semana con colación | PENDIENTE | 9 |
| P-24 | Reporte de asistencia tiene todos los días | F1 art. 27 a.2) | DT | Eje temporal completo | Semana con permiso | PENDIENTE | 9 |

---

## Bloque 8 — Portal de fiscalización

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| F-01 | **Un solo enlace** con todos los clientes | F1 art. 17 a) | DT | `/fiscalizacion` | El enlace | PENDIENTE | 4 |
| F-02 | Dominio propio `https://www….cl` en la portada | F1 art. 17 b) | DT | DNS + portada | Visitar el sitio | PENDIENTE | 3 |
| F-03 | TLS 1.2 o superior | F1 art. 17 b) | DT | Configuración TLS | `sslyze` | PENDIENTE | 3 |
| F-04 | **Certificado de entidad acreditada, vigente** | F1 art. 17 b) | DT | SSL de pago, no autofirmado | `openssl s_client` | PENDIENTE | 3 |
| F-05 | Nombre del prestador y **versión del software** | F1 art. 17 c) | DT | Header del portal | Captura | PENDIENTE | 4 |
| F-06 | **7 × 24** | F1 art. 17 d) | DT | SLA | Monitoreo | PENDIENTE | 3 |
| F-07 | Mantención avisada con 2 días hábiles | F1 art. 17 e) | DT | Calendario de mantenciones | Un aviso | PENDIENTE | 3 |
| F-08 | Obtener todos los informes y datos | F1 art. 17 f) | DT | Mismo módulo de reportes | Descargar todo | PENDIENTE | 9 |
| F-09 | **Sin plugins** | F1 art. 17 g) | DT | HTML plano | Navegador sin plugins | PENDIENTE | 4 |
| F-10 | Responsive en Windows, Android e iOS | F1 art. 17 h) | DT | CSS responsivo | Tres dispositivos | PENDIENTE | 4 |
| F-11 | Login con correo **@dt.gob.cl** y botón "solicitar clave" | F1 art. 23 a), b), c) | DT | Flujo de clave | Login real | PENDIENTE | 3 |
| F-12 | Clave caduca a los **5 días** | F1 art. 23 c) | DT | `expira_en` | Clave de 6 días | PENDIENTE | 3 |
| F-13 | Solo dos ventanas tras identificarse | F1 art. 24 a) | DT | Buscar empleador + listado alfabético | Captura | PENDIENTE | 4 |
| F-14 | **Correo al empleador con texto legal literal** | F1 art. 24 b) | DT | Plantilla exacta | Correo recibido | PENDIENTE | 4 |
| F-15 | Siguiente pantalla: solo el menú de reportes | F1 art. 24 c) | DT | — | Captura | PENDIENTE | 4 |
| F-16 | Perfil DT: consultar y descargar, **sin modificar** | F1 art. 24 e) | DT | Rol `fiscalizador` sin `UPDATE` | Intento de modificar | PENDIENTE | 3 |
| F-17 | Reportes a-d abren los filtros | F1 art. 24 d) | DT | — | Navegar | PENDIENTE | 9 |
| F-18 | Nada puede entorpecer el acceso | F1 art. 22.4 | DT | SLA + monitoreo | Test de carga | PENDIENTE | 3 |
| F-19 | Acceso presencial con equipos y espacios | F1 art. 22.4 a) | DT | Manual | Documento | PENDIENTE | 11 |
| F-20 | Acceso remoto de funcionarios | F1 art. 22.4 b) | DT | Portal web | Acceso remoto | PENDIENTE | 3 |
| F-21 | Acceso multi-tenant del funcionario, solo lectura | F1 art. 24 e) | DT | Rol con RLS permisiva de lectura | Ver 2 empresas | PENDIENTE | 3 |

---

## Bloque 9 — Seguridad e infraestructura

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| S-01 | HTTPS obligatorio | F1 art. 17 b) | DT | HSTS | `curl -I` | PENDIENTE | 3 |
| S-02 | Cifrado de confidencial y acceso restringido | F1 art. 14 c) | DT | RLS + cifrado | Revisión | PENDIENTE | 8 |
| S-03 | Autenticación y autorización por perfil | F1 art. 14 d) | DT | RBAC de 13 permisos | Cada rol | **COMPLETO** | — |
| S-04 | Perfiles coherentes con la función | F1 art. 15 | DT | `tiene_permiso()` | Revisión | **COMPLETO** | — |
| S-05 | Comprobantes consistentes con la BD | F1 art. 20 a) | DT | Generados desde la misma fila | Comparar | PENDIENTE | 3 |
| S-06 | SO en versiones vigentes con soporte | F1 art. 20 b) | DT | Gestionado | Documento del proveedor | PENDIENTE | 12 |
| S-07 | **Antigüedad ≤ 3 años, vigencia ≥ 5 años** | F1 art. 20 c) | DT | Política de rotación a 36 meses | **Declaración jurada** | **REVISIÓN LEGAL** | 12 |
| S-08 | Base y aplicación en **más de un servidor** | F1 art. 20 d) | DT | Proveedor gestionado | Documento | PENDIENTE | 12 |
| S-09 | Réplica y respaldo externo | F1 art. 20 e) | DT | PITR del proveedor | Restaurar un backup | PENDIENTE | 8 |
| S-10 | Alta disponibilidad y monitorización | F1 art. 16 | DT | Monitoreo externo | Alerta | PENDIENTE | 3 |
| S-11 | On premise solo con sistema autorizado | F1 art. 19 | DT | — | — | **NO APLICA** (solo cloud) | — |
| S-12 | MFA para administradores | — | BP | TOTP | Login | PENDIENTE | 8 |
| S-13 | Rate limiting, CSRF, XSS, validación | — | BP | Middleware + CSP | Test de seguridad | PENDIENTE | 8 |
| S-14 | Rotación de credenciales y secretos fuera del código | — | BP | Gestor de secretos | Auditoría | PENDIENTE | 8 |
| S-15 | Cifrado en reposo de las marcaciones | — | BP | Cifrado de volumen | — | PENDIENTE | 8 |
| S-16 | Informe de vulnerabilidades con herramienta de terceros | F1 art. 66.2 c) | DT | Informe de la entidad certificadora | PDF adjunto | PENDIENTE | 12 |

---

## Bloque 10 — Trabajadores

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| T-01 | **Capacitación previa** de todos | F1 art. 31 | DT | Registro de capacitaciones | Registro | PENDIENTE | 9 |
| T-02 | Normas en el **RIOS** | F1 art. 32 | DT | Texto para el RIOS | Documento | PENDIENTE | 11 |
| T-03 | **Sin sanción** por uso incorrecto no comunicado | F1 art. 32 | DT | RIOS publicado | Revisión | PENDIENTE | 11 |
| T-04 | Marcación es acto **voluntario y consciente** | F1 art. 35, 36 a) | DT | Texto en pantalla y capacitación | Revisión | PENDIENTE | 5 |
| T-05 | **Marcaciones repetidas: se conserva la primera** | F1 art. 36 c) | DT | Trigger que elimina las siguientes | 3 marcas seguidas | PENDIENTE | 2 |
| T-06 | Automatización permitida de la marca siguiente | F1 art. 37 | DT | Config por empresa | Caso configurado | PENDIENTE | 9 |
| T-07 | **No bloquear el equipo** del reloj | F1 art. 38 a) | DT | Kiosk sin bloqueo de pantalla | Reloj en uso | PENDIENTE | 5 |
| T-08 | No bloquear la app en marcación remota | F1 art. 38 b) | DT | Sin bloqueo | Prueba | PENDIENTE | 4 |
| T-09 | **No bloquear** por feriado, licencia o permiso | F1 art. 38 c) | DT | Sin bloqueo por estado | Trabajador en permiso marca | PENDIENTE | 7 |
| T-10 | **No bloquear por ubicación** | F1 art. 53 c) | DT | Sin bloqueo por geolocalización | Marcar fuera de la obra | PENDIENTE | 7 |
| T-11 | No exigir cámara ni micrófono en teletrabajo | F1 art. 55 a) | DT | Sin permisos | Permisos de la app | PENDIENTE | 4 |
| T-12 | Login remoto permitido | F1 art. 7 c) | DT | Portal web del trabajador | Marcar desde el celular | PENDIENTE | 4 |
| T-13 | Aceptar correos de terceros | F1 art. 34.2 c) | DT | — | — | PENDIENTE | 4 |
| T-14 | Derecho de supresión de sus datos | F1 art. 57.3) | DT | Botón de solicitud | Solicitud | PENDIENTE | 8 |
| T-15 | Portador del equipo propio con costos del empleador | F1 art. 52.2 | DT | — | — | **NO APLICA** (relojes, no celulares) | — |
| T-16 | Flexibilidad horaria; banda del art. 27 CT | F1 art. 46 | DT | — | — | PENDIENTE | 9 |
| T-17 | Documentos electrónicos con firma simple | F1 art. 47 | DT | Módulo de documentos | Un anexo | PENDIENTE | 9 |

---

## Bloque 11 — Geolocalización y mensajería

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| G-01 | Herramienta **opcional** | F1 art. 6 e) | DT | No implementada | — | **NO APLICA** (decisión de producto) | — |
| G-02 | Geolocalización solo durante la marcación | F1 art. 53 e) | DT | — | — | **NO APLICA** | — |
| G-03 | No puede bloquear la marcación | F1 art. 53 c) | DT | — | — | **NO APLICA** | — |
| G-04 | Registros conservados 5 años | F1 art. 53 f) | DT | — | — | **NO APLICA** | — |
| G-05 | Prueba de certificación en terreno | F1 art. 65 e) | DT | — | — | **NO APLICA** (evitada) | — |
| G-06 | Intensidad limitada, no vigilancia | ORD 554 | DT | Sin geolocalización | — | **COMPLETO** (por omisión) | — |
| G-07 | Intensidad limitada para no convertir el sistema en vigilancia | ORD 554 | DT | Sin geolocalización | — | **COMPLETO** (por omisión) | — |
| W-01 | Apps de mensajería **dentro** del sistema y certificadas | F1 art. 54 a) | DT | No se usa | — | **NO APLICA** | — |
| W-02 | No pueden usarse para marcar | F1 art. 54 b) | DT | — | — | **NO APLICA** | — |
| W-03 | No reemplazan el correo | F1 art. 54 c) | DT | — | — | **NO APLICA** | — |
| W-04 | El acuerdo entre partes para mensajería con otros fines no se ve afectado | F1 art. 54 c) | DT | — | — | **NO APLICA** | — |

---

## Bloque 12 — Datos personales

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| D-01 | Consentimiento escrito | F1 art. 57.1) | DT | Anexo tipo | Documento | PENDIENTE | 8 |
| D-02 | Finalidad expresa | F1 art. 57.2) | DT | Texto del consentimiento | Revisión | PENDIENTE | 8 |
| D-03 | Prohibición de transferir a terceros | F1 art. 57.2) | DT | Cláusula | Documento | PENDIENTE | 8 |
| D-04 | Prestador no transfiere ni reutiliza | F1 art. 57.2) | DT | Cláusula contractual | Documento | PENDIENTE | 8 |
| D-05 | Derecho de supresión | F1 art. 57.3) | DT | Solicitud | Flujo | PENDIENTE | 8 |
| D-06 | **Destrucción a 90–120 días** | F1 art. 57.4 a) | DT | Script + registro | Ejecución | PENDIENTE | 8 |
| D-07 | Prestador destruye al desvincularse | F1 art. 57.4 b) | DT | Script | Ejecución | PENDIENTE | 8 |
| D-08 | Solo datos fuera del art. 10 CT | F1 art. 57.4 d) | DT | Lista de campos | Auditoría | **REVISIÓN LEGAL** | 8 |
| D-09 | **Sin biometría en la versión 1** | Decisión | OPC | No implementada | — | **COMPLETO** (por omisión) | — |
| D-10 | Datos biométricos = categoría especial | Ley 21.719 | **LEGAL** | No se recolectan | — | PENDIENTE | 8 |
| D-11 | Agencia con facultad sancionatoria | Ley 21.719 | **LEGAL** | — | — | PENDIENTE | 8 |
| D-12 | Derecho de acceso del titular | Ley 21.719 | **LEGAL** | Portal del trabajador | Solicitud | PENDIENTE | 4 |

> **D-08 es la duda más importante de esta matriz.** F1 art. 57.4 obliga a
> destruir los datos personales a los 90–120 días, y F1 art. 22.1 obliga a
> guardar 5 años. Si la marcación fuera "dato personal" en el sentido del art. 57,
> el sistema sería ilegal. La salida probable es que el registro de asistencia
> es un **registro laboral**, no un dato personal sujeto a supresión, y que lo que
> se destruye son los datos biométricos, el teléfono y el correo privado. **Eso
> hay que confirmarlo con un abogado antes de escribir el script de destrucción.**

---

## Bloque 13 — Certificación y autorización

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| X-01 | **Certificación por entidad independiente** | F1 art. 65 a) | DT | Contrato con la entidad | Certificado | PENDIENTE | 12 |
| X-02 | Certificación de software **y hardware** | F1 art. 65 b) | DT | Informe del reloj | Capítulo del informe | PENDIENTE | 12 |
| X-03 | Análisis de vulnerabilidades | F1 art. 65 c) | DT | Informe con herramienta de terceros | PDF | PENDIENTE | 12 |
| X-04 | **Se repite cada 24 meses** | F1 art. 65 d) | DT | Calendario | Alerta en el panel | PENDIENTE | 12 |
| X-05 | Informe con pruebas y razones por condición | F1 art. 65 g) | DT | Este documento como base | Informe | PENDIENTE | 12 |
| X-06 | **Domicilio comercial en Chile** | F1 art. 66.1 e) | DT | Empresa constituida | Documento | PENDIENTE | 12 |
| X-07 | Correo no nominativo de notificación | F1 art. 66.1 f) | DT | `notificaciones@` | Carta | PENDIENTE | 12 |
| X-08 | Solicitud al Departamento Jurídico | F1 art. 66.1 a) | DT | Carta conductora | Carta | PENDIENTE | 12 |
| X-09 | Informe con 3 páginas previas obligatorias | F1 art. 66.2 a) i-iv) | DT | Plantilla del informe | Documento | PENDIENTE | 11 |
| X-10 | **Evidencias visibles y legibles** | F1 art. 66.2 a) v) | DT | Capturas y diagramas | Revisión | PENDIENTE | 11 |
| X-11 | **Sin reutilizar material de solicitudes anteriores** | F1 art. 66.2 a) vi) | DT | Todas las evidencias nuevas | Evidencia de < 6 meses | PENDIENTE | 12 |
| X-12 | **Evidencias de menos de 6 meses** | F1 art. 66.2 a) viii) | DT | Generarlas cerca del envío | Fecha de cada evidencia | PENDIENTE | 12 |
| X-13 | **Diagrama de arquitectura** | F1 art. 66.2 b) | DT | `02-arquitectura.md` §3.2 | Documento | **COMPLETO** (borrador) | 11 |
| X-14 | **Informe de vulnerabilidades** con herramienta de terceros | F1 art. 66.2 c) | DT | Nmap, Nikto o similar | Reporte | PENDIENTE | 12 |
| X-15 | **Declaración jurada** de veracidad | F1 art. 66.2 d) | DT | Documento firmado | Documento | PENDIENTE | 12 |
| X-16 | Envío por pendrive o URL con permisos permanentes | F1 art. 67 | DT | Carpeta en la nube | Link probado | PENDIENTE | 12 |
| X-17 | En papel, **solo la carta conductora** | F1 art. 67.3) | DT | — | — | PENDIENTE | 12 |
| X-18 | Revisión en **3 etapas** superadas | F1 art. 68 | DT | Preparación para cada una | Ordinario | PENDIENTE | 12 |
| X-19 | Empresa de prueba con datos reales | F1 art. 68 c) | DT | Base de demostración | Capturas | PENDIENTE | 12 |
| X-20 | **Autorización de 2 años** | F1 art. 69 | DT | — | Ordinario | PENDIENTE | 12 |
| X-21 | Reingreso tras rechazo con certification de ajustes | F1 art. 70 | DT | — | — | **NO APLICA** (hasta que rechacen) | — |
| X-22 | **No modificar la plataforma autorizada** | F1 art. 59 c) | DT | Control de cambios | Registro de versiones | PENDIENTE | 12 |
| X-23 | **Entrega mensual a la DT** | F1 art. 26 | DT | — | — | **REVISIÓN LEGAL** (no se sabe dónde) | 12 |
| X-24 | Registro público de prestadores | F1 art. 73 | DT | — | — | **NO APLICA** (lo hace la DT) | — |
| X-25 | Obligación de informar al cliente que se entregará toda la información a la DT, sin restricción | F1 art. 62 | DT | Cláusula contractual + aviso en el alta | Documento | PENDIENTE | 12 |

---

## Bloque 14 — Legal (Código del Trabajo)

| ID | Requisito | Fuente | Tipo | Implementación | Prueba | Estado | Fase |
|---|---|---|---|---|---|---|---|
| L-01 | **Controlar asistencia y determinar horas** | CT art. 33 inc. 1 | **LEGAL** | Todo el sistema | — | COMPLETO | — |
| L-02 | Sistema con una resolución que fije los requisitos | CT art. 33 inc. 2 | **LEGAL** | F1 | — | COMPLETO | — |
| L-03 | Los datos de una plataforma no autorizada igual son válidos para efectos laborales | F1 art. 49 | **LEGAL** | — | — | **NO APLICA** (es una salvaguarda a favor del trabajador) | — |
| L-04 | Jornada ordinaria **42 h/semana** (etapa 3 de la reducción gradual) | CT art. 22 nota 1 | **LEGAL** | Alerta de jornada excesiva | Carga de 43 h | PENDIENTE | 9 |
| L-05 | Máximo 10 h diarias, entre 5 y 6 días | CT art. 28 | **LEGAL** | Validación | Carga de 11 h | PENDIENTE | 9 |
| L-06 | Ordinaria + extraordinaria ≤ 52 h/semana | CT art. 31 | **LEGAL** | Validación | Carga de 53 h | PENDIENTE | 9 |
| L-07 | HE con recargo del 50 % o compensación 1,5:1 | CT art. 32 | **LEGAL** | Cálculo de HE | Cálculo | PENDIENTE | 9 |
| L-08 | Colación de al menos 30 min, no imputable | CT art. 34 | **LEGAL** | Columna de colación | Reporte | PENDIENTE | 9 |
| L-09 | Dirección de correo electrónico en el contrato | CT art. 10.2 | **LEGAL** | Campo de correo | Contrato | PENDIENTE | 4 |
| L-10 | Sanciones por estas infracciones | CT art. 508 (a verificar) | **LEGAL** | — | — | **REVISIÓN LEGAL** | 12 |
| L-11 | Reducción gradual 44→42→40 h | CT art. 22 nota 1 | **LEGAL** | Tabla de vigencias con fecha | Cambio de año | PENDIENTE | 9 |

> **L-11 es un requisito con fecha.** El número de horas cambia solo. Un sistema
> con el límite fijo en el código queda mal en 2028. Se implementa como tabla
> `limites_jornada (vigente_desde, max_semanal, max_diaria, max_semanal_con_he)`
> con vigencia por fecha.

---

## Los 174 pendientes, agrupados en 10 paquetes de trabajo

Contados por lo que se construye, no por fila de la matriz. Varios requisitos se
resuelven con el mismo código.

| # | Paquete | Requisitos que resuelve | Fases | Esfuerzo relativo |
|---|---|---|---|---|
| **1** | **Tabla de marcaciones y checksum** | R-01, R-02, R-03, R-06, R-11, H-01, H-04, C-05, C-09, T-05, M-14, E-05, E-12 | 2 | **Grande** — es la base de todo |
| **2** | **API del reloj y sincronización** | R-01, I-03, I-04, T-04, T-07, H-05, H-06, H-07 | 3, 5, 7 | Grande |
| **3** | **Portal de fiscalización** | F-01 a F-21, R-10, X-07 | 3, 4 | **Grande** — es un producto aparte |
| **4** | **Los seis reportes normados** | P-01 a P-24, E-06, E-07, F-08, F-17 | 9 | **Muy grande** — 146 columnas normadas en total |
| **5** | **Correo y comprobantes** | C-01 a C-04, C-07, C-15, C-16, C-17, L-09 | 3, 4 | Medio |
| **6** | **Procedimiento de corrección** | M-01 a M-13, R-07, R-08, E-08 | 4, 9 | Medio |
| **7** | **Alertas y cálculo de jornada** | C-17, C-18, M-13, T-16, L-04 a L-08, L-11 | 9 | Grande — el motor de cálculo |
| **8** | **Datos personales y consentimientos** | D-01 a D-12, I-10, C-18, E-09, T-14 | 8 | Medio — pero con fecha límite |
| **9** | **Identificación y QR** | I-01, I-03, I-04, I-06, I-09, I-12 | 6 | Medio |
| **10** | **Documentación de certificación** | X-01 a X-20, S-06, S-07, S-08, S-16, E-04, E-10, T-01, T-02, T-03, I-05, I-08, F-19, X-13 | 11, 12 | **Medio, y es el que se puede paralizar** |

**El camino crítico es el paquete 10.** No por dificultad, sino porque depende
de una entidad externa (X-01) y porque las **evidencias no pueden tener más de 6
meses** (X-12). Es decir: el paquete 10 no se puede empezar hasta que el resto
esté terminado, y tampoco se puede dejar para el final, porque las capturas de
pantalla de hoy dejan de servir como evidencia a los seis meses.
**Orden recomendado:** 1 → 2 → 9 → 5 → 6 → 7 → 4 → 3 → 8 → 10. El portal de
fiscalización (3) va después de los reportes (4) porque el art. 24 c) exige que
la pantalla siguiente solo muestre el menú de reportes.

---

## Los 6 bloqueos que no son de código

| # | Bloqueo | Quién lo resuelve |
|---|---|---|
| 1 | Entidad certificadora independiente | Cotizaciones |
| 2 | Plataforma del art. 26 | Dirección del Trabajo |
| 3 | Artículo sancionador vigente | Abogado laboral |
| 4 | Alcance del art. 57 frente a la retención de 5 años | Abogado laboral |
| 5 | Discrepancia 12 vs 24 meses (art. 25.1 c) vs 27 c)) | Entidad certificadora |
| 6 | Si el reloj Android TV Box cumple el art. 20 c) | Entidad certificadora |

---

**Volver a:** [`README.md`](README.md) · [`01-normativa-vigente.md`](01-normativa-vigente.md) · [`02-arquitectura.md`](02-arquitectura.md) · [`03-riesgos.md`](03-riesgos.md)
