# 01 — Normativa chilena vigente y requisitos obligatorios

Entregables 1 y 2 de la Fase 1. Fecha de corte: **28 de septiembre de 2026**.

---

# 1. Análisis de la normativa vigente

## 1.1 La cadena normativa

```
Código del Trabajo, art. 33 inc. 2
  (incorporado por Ley N.º 21.561, D.O. 26.04.2023)
        │
        │  "Una resolución del Director del Trabajo... establecerá y regulará
        │   las condiciones y requisitos que deberán cumplir los sistemas
        │   electrónicos de registro y control de asistencia"
        ▼
Resolución Exenta N.º 38 de 26.04.2024  (F1)
  publicada en el Diario Oficial el 09.05.2024
  vigente desde esa publicación
        │
        ├── arts. 1–29 ....... componentes, seguridad, portal, reportes
        ├── arts. 30–62 ...... obligaciones para empleadores y trabajadores
        └── arts. 63–73 ...... certificación, autorización y registro público
        ▼
Ordinario del Departamento Jurídico  (F3, F4)
  autoriza o rechaza la plataforma → vigencia 2 años (art. 69)
```

**Texto del art. 33 del Código del Trabajo (verificado en el texto consolidado):**

> Art. 33. El empleador tiene el deber de controlar la asistencia y determinar
> las horas de trabajo, sean ordinarias o extraordinarias. Estará obligado a llevar
> un libro de asistencia del personal, un reloj control con tarjetas de registro o
> un sistema electrónico de registro.
>
> Una resolución del Director del Trabajo, que se publicará en el Diario Oficial,
> establecerá y regulará las condiciones y requisitos que deberán cumplir los
> sistemas electrónicos de registro y control de asistencia y horas de trabajo
> correspondientes al servicio prestado, el que será uniforme para una misma
> actividad.
>
> La Dirección del Trabajo, a petición de parte, se pronunciará respecto de si un
> determinado sistema electrónico se ajusta a las condiciones establecidas en la
> referida resolución, lo que habilitará su utilización.

Tres consecuencias que estructuran todo el proyecto:

1. **El deber es del empleador, no del trabajador.** El artículo 33 no dice nada
   de que el trabajador pueda negarse a marcar. F1 art. 51 confirma: los
   dependientes "deberán usar los sistemas" siempre que se ajusten a la
   resolución.
2. **La plataforma es uniforme para una misma actividad.** El proyectar software
   de asistencia para distintos oficios no habilita reglamentos distintos.
3. **"A petición de parte".** Nadie va a venir a fiscalizar de oficio el sistema
   que usaste, pero si hay un reclamo, el primero que mira es si estaba
   autorizado.

## 1.2 La Resolución Exenta 38/2024 en detalle

**73 artículos, 5 títulos.** Fecha: 26.04.2024. Publicación: 09.05.2024.
Suspendida por el artículo primero transitorio del DFL 1/2009 (Bienes Nacionales,
que es la norma de la JUNAFI, sin relación con la asistencia) — esto es lo que
dice literalmente el encabezado de F2, y es un **error de catálogo de la fuente**,
no una suspensión real. La resolución está vigente.

### Títulos

| Título | Contenido | Artículos |
|---|---|---|
| **I** | Marco normativo | 1–2 |
| **II** | Consideraciones generales | 3–6 |
| **III** | Consideraciones técnicas | 7–20 |
| **IV** | Consideraciones jurídicas | 21–62 |
| **V** | Certificación y autorización de uso | 63–73 |

### Artículos que exigen algo y no son obvios

Los 73 artículos se resumen en la matriz (documento 04). Estos son los que
confunden a todo el mundo:

- **Art. 3 n)** — el ámbito esxoextremely amplio: *"toda plataforma, dispositivo
  o aplicación que, directa o indirectamente, se utilice o sirva para obtener
  información sobre la asistencia [...] aunque esa no sea su finalidad primaria"*.
  El art. 3 da el ejemplo de una app de mensajería instantánea usada para
  confirmar entradas: queda dentro de la resolución. Y agregka que no se cumple
  el art. 33 cuando se usan "sistemas de excepción" que miden ausentismo y no
  asistencia.
- **Art. 6** — la lista de componentes mínimos es taxativa: hardware de
  enrolamiento/captura, medio de identificación, **portal de fiscalización**,
  base de datos, y geolocalización (esta última explícitamente **opcional**).
  Art. 6 párrafo final prohíbe componentes en versiones *desarrollo, pruebas,
  express, trial, light o similares*, por lack de soporte del fabricante.
- **Art. 7 g)** — dos mecanismos de identificación siempre, y **al menos uno sin
  biometría y sin datos personales**. Ejemplos que da la norma: claves, patrones
  o tarjetas de aproximación.
- **Art. 8** — hash/checksum por marcación, **obligatorio**, con funciones
  nativas, SHA-2 recomendado, y **una pantalla web pública para verificar el
  comprobante por su hash**. La norma rechaza explícitamente el hash "a mano" o
  por concatenación de atributos.
- **Art. 9 y 10** — transmisión en línea obligatoria; el modo sin conexión es
  una **excepción** que solo se puede invocar "en casos particulares debidamente
  justificados".
- **Art. 13** — contenido mínimo del comprobante de marcación, con formato
  `dd/mm/aa` y `hh:mm:ss`, RUT con puntos, guiones y dígito verificador, y el
  hash.
- **Art. 20 c)** — versiones de todos los productos con **menos de 3 años de
  antigüedad y soporte no inferior a 5 años**. Es la exigencia que más cuesta
  en un reloj Android TV Box.
- **Art. 22.1** — el trabajador accede a todos sus datos, desde cualquier lugar y
  a cualquier hora, con un **histórico mínimo de 5 años**.
- **Art. 25.1 c) y d)** — los filtros del reporte ofrecen período predeterminado
  (semana, quincena, mes) y rango de fechas **hasta 5 años**.
- **Art. 27** — seis reportes obligatorios con columnas, orden y nomenclatura
  **exactos**.
- **Art. 28 e)** — los reportes usan **Arial N.º 8 como máximo**.
- **Art. 28 b)** — exportación a **Excel, PDF y Word**.
- **Art. 28 f)** — frase literal obligatoria: *"No hay trabajadores que
  coincidan con la selección"*.
- **Art. 40** — el procedimiento de corrección de marcaciones: correo
  automático, **48 horas para oponerse por correo**, consolidación automática.
- **Art. 41 c)** — las correcciones solo pueden hacerse **hasta el día hábil
  siguiente**; **d)** las marcaciones de inicio y fin de jornada **no pueden
  automatizarse**; **e)** no se aceptan comprobantes en papel.
- **Art. 45** — cuatro alertas obligatorias (falta de marcación a los 30 minutos,
  jornada excesiva, compensación de descanso cada 30 días, desconexión del
  teletrabajo).
- **Art. 48** — un solo tipo de sistema (papel o electrónico), **un solo
  proveedor**, y los datos solo pueden venir de un sistema autorizado.
- **Art. 53 c)** — **no se puede bloquear la marcación** aunque la geolocalización
  detecte que el trabajador está fuera del lugar. **e)** no se puede exigir
  geolocalización encendida toda la jornada. **f)** los registros de
  posicionamiento se guardan 5 años.
- **Art. 57** — consentimiento escrito, finalidad expresa, prohibición de
  transferir a terceros (salvo el prestador), y **destrucción de los datos
  personales entre 90 y 120 días** desde el término de la relación laboral.
- **Art. 58** — lista de 12 infracciones del empleador, sancionadas por el
  artículo 508 que corresponda. Incluye "alterar la información del sistema" y
  "no mantener disponible [...] de hasta 5 años".
- **Art. 60** — régimen de pérdida de la autorización: 1.ª vez reconvención
  escrita; 2.ª vez dentro de 30 días, baja 15 días; 3.ª, baja 30 días; 4.ª dentro
  de 60 días, cancelación.

## 1.3 Vigencia y plazos de la resolución

De los artículos transitorios (verificados en F1):

| Disposición | Contenido |
|---|---|
| Primero | La resolución entra en vigor el día de su publicación en el Diario Oficial (**09.05.2024**). |
| Segundo | — |
| Tercero | Las autorizaciones de **sistemas especiales** de control de asistencia (Ley 21.561, art. 4.º transitorio) se mantienen vigentes mientras cumplan la resolución. |
| Cuarto | Las autorizaciones de **sistemas generales** emitidas bajo el antiguo art. 33 inciso 2 **se mantienen hasta el 26.04.2025**. Es decir: **ya no sirven**. |
| Quinto | Las solicitudes presentadas antes de la vigencia siguen su curso, pero su vigencia sería hasta el 26.04.2025. |
| **Sexto** | **La entrega de información periódica del art. 26 entra en vigor el 26 de septiembre de 2025.** Ya está vigente. |

> El artículo segundo del encabezado aparece en blanco en el texto publicado.
> Se deja constancia; no se le atribuyó contenido.

## 1.4 La Ley 21.719 entra en vigor en dos meses

**Verificado en F5 (Ley 21.719, artículo primero transitorio):**

> Las modificaciones a las leyes N.º 19.628, sobre protección de la vida
> privada; N.º 20.285, sobre acceso a la información pública, y N.º 19.496 [...]
> **entrarán en vigencia el día primero del mes vigésimo cuarto posterior a la
> publicación de esta ley en el Diario Oficial.**

Metadato oficial de vigencia: `1209272.2026-12-01.0.0` → **1 de diciembre de 2026**.

Qué cambia, según el propio texto de la ley (F5):

- La Ley 19.628 **pasa a denominarse "ley sobre Protección de los Datos
  Personales"** y su objeto se amplía.
- Define **categorías especiales de datos**, entre las que incluye
  **"los datos biométricos"**.
- Define **fuentes de acceso público**.
- **Crea la Agencia de Protección de Datos Personales**, con Consejo Directivo
  (nombre designaciones en la Ley 21.806) y facultades fiscalizadoras y
  sancionatorias.
- Reconoce derechos de los titulares: acceso, rectificación, supresión,
  portabilidad, entre otros.

**Consecuencia de diseño:** el sistema tiene que funcionar con la 19.628 hoy y
con la 21.719 desde el 1 de diciembre. Como la 21.719 introduce obligaciones
nuevas y una autoridad nueva, la arquitectura de datos personales (consentimientos,
finalidades, plazos de destrucción, registro de transferencias) no puede quedar
como un anexo: tiene que ser una capa de primera clase desde el día uno.

> `REVISIÓN LEGAL` — El texto completo de la Ley 21.719 y de sus reglamentos no
> se revisó en esta fase. Los reglamentos "deberán dictarse dentro de los seis
> meses siguientes a la publicación" y el del art. 26 "dentro de los seis meses
> desde la entrada en vigencia". Antes del 1 de diciembre de 2026 hay que leer
> esos reglamentos: es probable queון ordenen de forma concreta el registro de
> consentimientos y el plazo de destrucción de datos, que hoy fija el art. 57 de
> F1 en 90–120 días.

## 1.5 La jornada: el número que cambia solo

El art. 22 inciso primero del Código del Trabajo (F2) fija la jornada ordinaria
máxima y trae una NOTA con la reducción gradual de la Ley 21.561:

> La modificación [...] se implementará de forma gradual, reduciéndose de
> **cuarenta y cinco horas semanales a cuarenta y cuatro horas al primer año;
> cuarenta y dos horas al tercer año y cuarenta horas al quinto año**, contados
> desde la publicación de la ley en el Diario Oficial.

Contando desde el **26.04.2023**:

| Vigencia desde | Jornada ordinaria máxima semanal |
|---|---|
| 26.04.2023 | 45 h |
| 26.04.2024 | 44 h |
| **26.04.2026** | **42 h** ← **vigente hoy** |
| 26.04.2028 | 40 h |

Otros límites verificados:

- **Art. 28** — el máximo semanal no se puede distribuir en más de 6 ni en menos
  de 5 días. La jornada ordinaria **no puede exceder 10 horas diarias**.
- **Art. 31** — con la modalidad del art. 22 bis, la suma de jornada ordinaria y
  extraordinaria **no puede superar 52 horas semanales**. Horas extraordinarias
  en faenas: hasta 2 por día.
- **Art. 22 bis** — distribución en promedio semanal de 40 horas en ciclos de
  hasta 4 semanas.
- **Art. 32** — horas extraordinarias: recargo del 50%; o compensación en
  días de descanso, hasta 5 días hábiles al año, dentro de los 6 meses
  siguientes al ciclo, con 48 h de aviso; **1 hora extra = 1,5 hora de descanso**.
- **Art. 34** — colación: la jornada se divide en dos partes con **al menos
  media hora** entre ellas, y ese período **no se computa como trabajado**.
  Excepción para trabajos de proceso continuo, que resuelve la DT por resolución
  reclamable ante el Juzgado de Letras del Trabajo (art. 31).
- **Art. 34 bis** — restaurantes, hoteles y clubes con atención al público pueden
  pactar interrupción de hasta 4 horas; el exceso sobre media hora se remunera.

> **Esto importa para el diseño:** F1 art. 45.2 obliga a una alerta cuando la
> jornada cargada excede los límites legales diarios o semanales. La alerta tiene
> que usar los límites **vigentes**, no los de cuando se escribió el código. Con
> fecha de vigencia, no con un número fijo.

## 1.6 La DT ya está aplicando la resolución: qué se ve en los ordinarios

De los 140 documentos de F4 se extraen señales que acotan la interpretación:

| Ordinario | Fecha | Contenido relevante |
|---|---|---|
| **ORD 408** | 11.09.2025 | "La Resolución Exenta Nº38 no prohíbe la geolocalización. Permite determinar la ubicación en que se realiza cada marcación, **pero impide que esa información sea utilizada para bloquear el registro** cuando el trabajador se encuentre fuera del lugar convenido." |
| **ORD 554** | 18.08.2025 | La geolocalización está autorizada, "pero estableciendo **límites a su uso e intensidad para evitar que ella torne en un sistema de vigilancia**". |
| **ORD 638** | 12.09.2025 | Las fotos de rostros son **dato biométrico**; **no se ajusta a derecho** usar un sistema de asistencia paraernel constatar el uso de vestuario institucional. |
| **ORD 91** | 19.02.2025 | Los sistemas autorizados antes del Dictamen 2927/58 mantienen vigencia **hasta el 26.04.2024**. Desde la entrada en vigor de F1, el uso de parámetros biométricos **requiere consentimiento expreso** del dependiente. |
| **ORD 313** | 25.06.2026 | Absuelve consultas sobre el uso de **WhatsApp** como sistema de asistencia. |
| **ORD 130** | 12.02.2026 | El sistema "NEOS AI" se autoriza para documentación laboral electrónica, pero **no** como sistema de asistencia por no acreditar los requisitos técnicos. |
| **ORD 259** | 29.04.2026 | Un sistema de horas de conducción (Sitrack) **no requiere ser reautorizado** en cada empresa: el análisis técnico ya fue verificado. |
| **ORD 614 / 709** | 10.2025 / 21.10.2025 | Resulta **improcedente aplicar a los pronunciamientos de la DT las normas de la Ley N.º 19.880** de procedimiento administrativo. La DT no es un servicio público sujeto a esa ley en sus decisiones de certificación. |
| **ORD 418** | 15.09.2026 | Para personal embarcado, "las modalidades operacionales y las exigencias de disponibilidad **no pueden desconocer el descanso mínimo legal ni justificar registros que no reflejen la realidad** de las jornadas efectivamente desarrolladas." |

**Lectura conjunta:** la DT está aplicando la resolución con criterio funcional
—manda la realidad de la jornada— y ha descartado explícitamente el procedure
administrativo formal. Eso no es buena noticia para quien pretenda argumentar
papeleo.

### Estado del registro público (F3, art. 73)

A la fecha de este documento hay **29 plataformas autorizadas** en la lista
pública, con su ordinario, fecha de autorización, fecha de vencimiento y
**entidad certificadora**. Verificado: las autorizaciones duran 2 años y hay
vencidas entre las que se listan por paginación, lo que confirma el mecanismo.

---

# 2. Requisitos obligatorios

Clasificación: **LEGAL** = ley o Código del Trabajo · **DT** = F1 · **BP** =
buena práctica · **OPC** = opcional por la norma o por decisión de producto.

## 2.1 Identificación del trabajador

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| I-01 | Enrolamiento con cualquier hardware que permita diferenciar a una persona de otra (lector biométrico, teclado, cámara, tarjeta, cédula, token) | F1 art. 7 a) | DT |
| I-02 | Hardware de enrolamiento y medio de marcación pueden ser el mismo o distintos | F1 art. 7 b) | DT |
| I-03 | **Al menos dos alternativas de identificación**, y **al menos una sin biometría y sin datos personales** | F1 art. 7 g) | DT |
| I-04 | El empleador debe definir en contrato o RIOS cuál es la forma primaria y cuál la secundaria | F1 art. 7 g) | DT |
| I-05 | Si usa claves, el trabajador puede cambiarlas cuando quiera, y recibe correo automático con fecha y hora del cambio | F1 art. 7 f) | DT |
| I-06 | Tarjetas con banda magnética: asociar permanentemente el número de cédula, impreso junto al nombre | F1 art. 7 e) | DT |
| I-07 | El mecanismo no puede vulnerar derechos fundamentales; la intensidad del control debe guardar relación con la finalidad | F1 art. 56 | DT |
| I-08 | Sin discriminación por inclusión: considerar la ubicación física del hardware | F1 art. 33 | DT |
| I-09 | Datos personales no contemplados en el art. 10 CT requieren **consentimiento escrito** en contrato o anexo | F1 art. 57.1) | DT |
| I-10 | Nombres técnico y comercial del sistema, y si ya está autorizado | F1 art. 66.1 h), i) | DT |

> **I-10 parece menor y no lo es:** la autorización es nominativa (F1 art. 63).
> Cambiar el nombre comercial obliga a reautorizar.

## 2.2 Fecha, hora y minutos

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| H-01 | Marca de tiempo electrónica: asignación de fecha y hora en que se efectúa la marcación | F1 art. 11 | DT |
| H-02 | Formato `dd/mm/aa` para la fecha y `hh:mm:ss` para la hora en comprobantes y reportes | F1 art. 13.1 a), b); art. 27 | DT |
| H-03 | Cálculo de atrasos y sobretiempo con **precisión de hora, minuto y segundo, sin aproximación** | F1 art. 44 | DT |
| H-04 | Zona horaria `America/Santiago` en todo el sistema | — | **BP** |
| H-05 | Sincronización NTP del reloj con fuente de tiempo confiable | — | **BP** |
| H-06 | Detección y registro de desviación horaria del dispositivo | — | **BP** |
| H-07 | El reloj NO puede marcar si su desviación horaria supera un umbral | — | **BP** |

> **H-04 a H-07 son buena práctica, y es importante decirlo.**
> F1 **no menciona NTP, ni sincronización, ni desviación horaria, ni secuencia,
> ni idempotencia**. Revisado el texto completo de los 73 artículos. La única
> exigencia de tiempo es el "sello de tiempo" del art. 11.
>
> Aun así, un reloj cuya hora se desvía 20 minutos produce una planilla que
> contradice la realidad, y el art. 41 b) exige que las correcciones "no cause
> perjuicio a los trabajadores". En una fiscalización, un reloj desviado es un
> problema probatorio. Se implementa igual, pero clasificado como BP y no como
> obligación legal.

## 2.3 Registros, integridad y auditoría

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| R-01 | **Hash o checksum generado automáticamente en cada marcación** | F1 art. 8 | DT |
| R-02 | Funciones **nativas** del motor o lenguaje; **no** hash manual ni concatenación de atributos | F1 art. 8 | DT |
| R-03 | SHA-2 recomendado | F1 art. 8 | DT (recomendación expresa) |
| R-04 | **Pantalla web que permita verificar el comprobante en línea por su hash** | F1 art. 8 | DT |
| R-05 | Bases de datos con seguridad que impida acceso no autorizado y prevenga adulteración posterior al registro | F1 art. 14 a) | DT |
| R-06 | Respaldos con hash o firma electrónica; si hubo alteración, **indicarla de forma destacada en pantalla y en los reportes** | F1 art. 14 b) | DT |
| R-07 | Toda alteración debe quedar **visible en pantalla** con signo, símbolo o color | F1 art. 41 a) | DT |
| R-08 | Definición de perfiles y asignación de personas debe quedar en **auditoría automática**, accesible solo por administración | F1 art. 15 | DT |
| R-09 | Auditoría de conexiones de funcionarios de la DT: fecha, hora, correo institucional, RUT consultado, **IP de origen** | F1 art. 22.5) | DT |
| R-10 | Hash encadenado (`previous_hash`) sobre la secuencia de marcaciones | — | **BP** |
| R-11 | Firma digital del registro | — | **BP** |
| R-12 | Almacenamiento WORM de los logs de auditoría | — | **BP** |

> **R-10 a R-12 no están en la resolución.** Son defenses in depth. R-10 en
> particular es muy barato en Postgres y sube mucho el valor probatorio ante un
> inspector. Se recomienda, pero no se puede citar como exigencia.

## 2.4 Modificaciones y correcciones

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| M-01 | El empleador puede modificar, reemplazar, corregir o agregar marcaciones **solo** en los casos del art. 39 | F1 art. 39 | DT |
| M-02 | Puede automatizar la eliminación de atrasos o salidas anticipadas con tolerancias **voluntarias** del empleador | F1 art. 39 a) | DT |
| M-03 | Puede agregar marcaciones faltantes individuales o colectivas | F1 art. 39 b) | DT |
| M-04 | **Correo automático al trabajador** con la fecha y hora exacta de la marca original y de la nueva, y una explicación del cambio | F1 art. 40 b) | DT |
| M-05 | **48 horas** desde el envío del correo para oponerse, respondiendo por correo | F1 art. 40 c) | DT |
| M-06 | Sin oposición en 48 h, la modificación **se consolida** | F1 art. 40 d) | DT |
| M-07 | Con oposición, la marca **permanece en su estado original** | F1 art. 40 e) | DT |
| M-08 | El mismo procedimiento para completar automáticamente marcaciones faltantes al día siguiente | F1 art. 40 f) | DT |
| M-09 | Solo hasta el **día hábil siguiente** al de la situación que se corrige | F1 art. 41 c) | DT |
| M-10 | **No se pueden automatizar** las marcaciones de inicio y fin de jornada | F1 art. 41 d) | DT |
| M-11 | **No se aceptan comprobantes en papel** para complementar o explicar | F1 art. 41 e) | DT |
| M-12 | La corrección no puede perjudicar al trabajador | F1 art. 41 b) | DT |
| M-13 | Descuentos automáticos diarios están prohibidos, salvo jornada liquidable en el período | F1 art. 42 | DT |
| M-14 | Historial completo de quién hizo qué, cuándo y por qué | — | **BP** |

## 2.5 Correo, comprobantes y comunicación

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| C-01 | **Cada operación genera comprobante automático** al trabajador | F1 art. 12 a) | DT |
| C-02 | Enviado al **correo electrónico personal** registrado en el sistema | F1 art. 12 b) | DT |
| C-03 | Formato **imprimible** | F1 art. 12 c) | DT |
| C-04 | Cuenta de remitente **no nominativa** ("de sistema") | F1 art. 12 d) | DT |
| C-05 | No puede haber dos trabajadores con el mismo correo | F1 art. 12 e) | DT |
| C-06 | Trabajador de servicios transitorios: **segundo correo a la EST** | F1 art. 12 f) | DT |
| C-07 | Contenido mínimo del comprobante: fecha, hora, nombre, RUT con puntos y dv, hash, y en su caso datos de distribución excepcional de jornada | F1 art. 13.1 | DT |
| C-08 | Datos del empleador: razón social, RUT, ubicación completa (calle, número, piso, oficina, comuna, ciudad, región) | F1 art. 13.2 | DT |
| C-09 | Domicilio = lugar de prestación efectiva del servicios | F1 art. 13.3 | DT |
| C-10 | **Cada trabajador debe tener correo electrónico registrado**; SMS u otros canales no cumplen | F1 art. 34 | DT |
| C-11 | Primera opción: correo privado que entrega el trabajador. Segunda: el sistema crea una cuenta en plataforma gratuita y abierta (Gmail, Yahoo) | F1 art. 34.1 | DT |
| C-12 | La entrega de la cuenta y las credenciales consta **por escrito**; el empleador debe instruir cambiar la clave | F1 art. 34.1 b) | DT |
| C-13 | El trabajador puede cambiar su correo cuando quiera, sin trabas | F1 art. 34.2 b), d) | DT |
| C-14 | El empleador y el prestador deben evitar que los correos sean bloqueados o marcados como spam | F1 art. 34.2 f) | DT |
| C-15 | Correos privados de trabajadores: eliminar según art. 57 | F1 art. 34.2 g) | DT |
| C-16 | El comprobante de marcación es verificable en línea con el hash | F1 art. 8 | DT |
| C-17 | Alertas automáticas a los 30 minutos de la marcación omitida, con copia al empleador | F1 art. 45.1) | DT |
| C-18 | Alerta de desconexión 30 minutos antes del inicio, para teletrabajadores | F1 art. 45.4) | DT |

> **C-01 es la exigencia más subestimada de toda la resolución.** Cada
> marcación genera un correo. Con 200 trabajadores y 4 marcaciones diarias son
> 800 correos por día. Eso define la arquitectura de correo (colas, reintentos,
> reputación de dominio) mucho antes de definir la de la base de datos.

## 2.6 Reportes

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| P-01 | **Seis reportes obligatorios**, con el mismo nombre y en el mismo orden | F1 art. 27 | DT |
| P-02 | a) Reporte de asistencia (fecha / Asistencia sí-no / Ausencia justificada-injustificada / Observaciones) | F1 art. 27 a) | DT |
| P-03 | b) Reporte de jornada diaria, con **11 columnas** de nombre exacto | F1 art. 27 b) | DT |
| P-04 | c) Reporte de domingos y/o días festivos, hasta **24 meses** | F1 art. 27 c) | DT |
| P-05 | d) Reporte de modificaciones y/o alteraciones de turnos, con **11 columnas** | F1 art. 27 d) | DT |
| P-06 | e) **Reporte diario automático** con las marcaciones del día, enviado a cada cliente | F1 art. 27 e) | DT |
| P-07 | f) Registro electrónico de **incidentes técnicos** con inicio, término y descripción, exportable | F1 art. 27 f) | DT |
| P-08 | Filtros: búsqueda individual, grupal, período predeterminado, rango de fechas, jornada, turno, local, cargo, EST, **hash** | F1 art. 25.1 | DT |
| P-09 | Rango de fechas **hasta 5 años** para trabajadores con esa antigüedad | F1 art. 25.1 d) | DT |
| P-10 | Turnos informados por **extensión**, no por el nombre que les da el empleador | F1 art. 25.1 f) | DT |
| P-11 | Listado de cargos **coincidente con el RIOS** | F1 art. 25.1 h) | DT |
| P-12 | Todos los filtros visibles al mismo tiempo y usables en cualquier orden | F1 art. 25.2 | DT |
| P-13 | Previsualización en pantalla con opción de descarga o impresión; **el descargado es idéntico a lo visto** | F1 art. 28 a) | DT |
| P-14 | Exportación a **Excel, PDF y Word** | F1 art. 28 b) | DT |
| P-15 | Visible en **una sola pantalla**, sin barra espaciadora | F1 art. 28 c) | DT |
| P-16 | Imprimible, adaptándose solo a la página | F1 art. 28 d) | DT |
| P-17 | **Arial N.º 8 como máximo** | F1 art. 28 e) | DT |
| P-18 | Mensaje literal "No hay trabajadores que coincidan con la selección" | F1 art. 28 f) | DT |
| P-19 | Siglas obligatorias: A.I., A.J, AT, C.T., D.E.J., H.E., J.O., L.M., P.G.R, PREN., P.S.G.R., POSTN, S.A, VAC | F1 art. 28 g) | DT |
| P-20 | Con varios trabajadores, la información se ordena **por cada dependiente**, con su período y total | F1 art. 28 h) | DT |
| P-21 | Totales semanales automáticos con signo + o − y formato `hh:mm:ss` | F1 art. 27 b.12) | DT |
| P-22 | El empleador con plataforma digital **no** está obligado a generar los reportes semanales firmados del Reglamento 969 | F1 art. 29 | DT (exención) |
| P-23 | Totalizadores semanales que restan la colación pactada, salvo que sea imputable a la jornada | F1 art. 27 b.12) | DT |

## 2.7 Portal de fiscalización

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| F-01 | **Un solo enlace de fiscalización** con todos los clientes del prestador | F1 art. 17 a) | DT |
| F-02 | URL con nombre de dominio propio `https://www.nombredelsitio.cl`, visible en la página inicial | F1 art. 17 b) | DT |
| F-03 | HTTPS con **TLS 1.2 o superior**, sin habilitar estándares inferiores | F1 art. 17 b) | DT |
| F-04 | **Certificado SSL vigente** de entidad certificadora acreditada; no se aceptan caducados | F1 art. 17 b) | DT |
| F-05 | Nombre del prestador y **versión del software** indicados de forma destacada | F1 art. 17 c) | DT |
| F-06 | **7 × 24** de disponibilidad | F1 art. 17 d) | DT |
| F-07 | Mantenciones avisadas con **2 días hábiles** de anticipación, sin impedir marcaciones | F1 art. 17 e) | DT |
| F-08 | Debe permitir obtener **todos los informes y datos** de la resolución | F1 art. 17 f) | DT |
| F-09 | **Sin plugins** ni visualizadores especiales | F1 art. 17 g) | DT |
| F-10 | Responsive en **Windows, Android e iOS**, con al menos un navegador gratuito por sistema operativo | F1 art. 17 h) | DT |
| F-11 | Login del funcionario: **correo institucional @dt.gob.cl** → botón "solicitar clave" → clave automática | F1 art. 23 a), b), c) | DT |
| F-12 | La clave caduca a los **5 días corridos** | F1 art. 23 c) | DT |
| F-13 | Tras identificarse, solo **dos ventanas**: buscar empleador por nombre o RUT, y listado alfabético | F1 art. 24 a) | DT |
| F-14 | **Correo automático no nominativo al empleador** informar el inicio de la revisión, con el **texto legal literal** | F1 art. 24 b) | DT |
| F-15 | La siguiente pantalla **solo** muestra el menú de reportes | F1 art. 24 c) | DT |
| F-16 | Perfil del funcionario: consultar y descargar, **sin atribución de modificación, complemento ni eliminación** | F1 art. 24 e) | DT |
| F-17 | Reportes a), b), c) y d) abren la pantalla de filtros | F1 art. 24 d) | DT |
| F-18 | Cualquier situación que entorpezca, dilate o impida el ingreso, revisión o descarga es infracción al art. 25 del DFL N.º 2/1967 | F1 art. 22.4 | DT |
| F-19 | Acceso presencial: el empleador debe poner a disposición equipos y espacios | F1 art. 22.4 a) | DT |
| F-20 | Acceso remoto de los funcionarios | F1 art. 22.4 b) | DT |
| F-21 | Reporte con todas las columnas siempre; "No aplica" solo en la columna de colación cuando el empleador no la exige | F1 art. 27 b) | DT |

## 2.8 Seguridad, base de datos e infraestructura

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| S-01 | HTTPS obligatorio en el portal | F1 art. 17 b) | DT |
| S-02 | Cifrado de información confidencial y control de acceso restringido | F1 art. 14 c) | DT |
| S-03 | Control de acceso que asegure autenticación y autorización correcta **por perfil** | F1 art. 14 d) | DT |
| S-04 | Perfiles coherentes con la función (empleador, trabajador, funcionario DT) | F1 art. 15 | DT |
| S-05 | Comprobantes consistentes con la base de datos | F1 art. 20 a) | DT |
| S-06 | Infraestructura con sistemas operativos **en versiones vigentes con soporte** | F1 art. 20 b) | DT |
| S-07 | **Antigüedad de versiones ≤ 3 años, con vigencia no inferior a 5 años** | F1 art. 20 c) | DT |
| S-08 | Base de datos y servicio de aplicaciones distribuidos en **más de un servidor o datacenter** | F1 art. 20 d) | DT |
| S-09 | Base de datos **replicada y respaldada en almacenamiento externo** | F1 art. 20 e) | DT |
| S-10 | Alta disponibilidad, redundancia o clusterización, monitorización, auditoría de componentes, respaldo de recursos críticos | F1 art. 16 | DT |
| S-11 | Implementación *on premise* permitida solo si el sistema está autorizado y la instala el desarrollador o comercializador | F1 art. 19 | DT |
| S-12 | MFA para administradores | — | **BP** |
| S-13 | Rate limiting, anti-CSRF, anti-XSS, validación de entrada, rotación de credenciales | — | **BP** |
| S-14 | Hash **encadenado** y registro *append-only* | — | **BP** |
| S-15 | Cifrado en reposo de la información de marcaciones | — | **BP** |

> **S-07 es el que mata la opción "Android TV Box barato"** si no se diseña con
> esto en mente. Ver documento 02, sección "El reloj".

## 2.9 Obligaciones hacia los trabajadores

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| T-01 | **Capacitación previa** de todos los trabajadores en el uso del sistema | F1 art. 31 | DT |
| T-02 | Reglas y procedimientos incorporados al **RIOS**, o al contrato si no hay RIOS | F1 art. 32 | DT |
| T-03 | **Ningún trabajador puede ser sancionado** por uso incorrecto si eso no estaba en la normativa interna y comunicado | F1 art. 32 | DT |
| T-04 | La marcación es **acto voluntario y consciente**; el trabajador debe saber con antelación cuándo su acción genera una marcación | F1 art. 35, 36 a) | DT |
| T-05 | Marcaciones repetidas seguidas del mismo tipo: **el sistema conserva la primera y elimina las siguientes** automáticamente | F1 art. 36 c) | DT |
| T-06 | Permiso de automatización de la marca siguiente al terminar un descanso | F1 art. 37 | DT |
| T-07 | No bloquear el equipo donde se marca | F1 art. 38 a) | DT |
| T-08 | No bloquear la aplicación para PC o smartphone en marcaciones remotas | F1 art. 38 b) | DT |
| T-09 | No bloquear temporalmente la marcación por feriado, licencia o permiso | F1 art. 38 c) | DT |
| T-10 | **No bloquear la marcación** aunque la geolocalización detecte que está fuera del lugar | F1 art. 53 c) | DT |
| T-11 | No exigir cámara ni micrófono encendidos en teletrabajo | F1 art. 55 a) | DT |
| T-12 | Los trabajadores pueden elegir login remoto, no solo presencial | F1 art. 7 c) | DT |
| T-13 | Cuentas de correo de terceros (de familiares) se aceptan | F1 art. 34.2 c) | DT |
| T-14 | El trabajador puede **eliminar sus datos personales** en cualquier momento, salvo los exigidos por norma | F1 art. 57.3) | DT |
| T-15 | El trabajador marca en el **equipo que la empresa le entrega**, con cobertura de costos por el empleador | F1 art. 52.1) | DT |
| T-16 | Flexibilidad horaria permitida; banda horaria del art. 27 CT es derecho irrenunciable | F1 art. 46 | DT |
| T-17 | Documentos electrónicos: anexos, pactos, notificaciones y solicitudes, con firma electrónica simple | F1 art. 47 | DT |

## 2.10 Geolocalización

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| G-01 | Herramienta **opcional** | F1 art. 6 e) | DT (opcional) |
| G-02 | Solo durante la marcación, salvo los dos casos del art. 53 e) | F1 art. 53 e) | DT |
| G-03 | No puede ser usada para bloquear la marcación | F1 art. 53 c) | DT |
| G-04 | Registros conservados **5 años** | F1 art. 53 f) | DT |
| G-05 | La DT puede bloquear otras apps **solo durante la marcación** | F1 art. 53 d) | DT |
| G-06 | Prueba de certificación: ubicación en **3 minutos** con error **< 30 m de radio en el 95%** de las marcaciones; no se prueba en recintos cerrados | F1 art. 65 e) | DT (condicional) |
| G-07 | Intensidad limitada para no convertir el sistema en vigilancia | ORD 554, 11.09.2025 | DT (doctrina) |

> **G-06 solo aplica si se usa geolocalización.** Es un requisito de
> certificación muy caro de cumplir y deITA. La recomendación es **no usar
> geolocalización en la versión 1** (el usuario ya lo pidió: "No implementar
> biometría en la primera versión"; la geolocalización es análoga). Eso elimina
> de un plumazo el art. 53, el art. 45.4, la carga de prueba del art. 65 e) y el
> reporte de geolocalización del art. 13.1 f).

## 2.11 Mensajería instantánea

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| W-01 | Debe formar parte integral del sistema y estar **certificada** junto con él | F1 art. 54 a) | DT |
| W-02 | **No puede usarse para marcar** inicio o término | F1 art. 54 b) | DT |
| W-03 | No reemplaza el correo del trabajador | F1 art. 54 c) | DT |
| W-04 | El acuerdo entre partes para usar mensajería con otros fines no se ve afectado | F1 art. 54 c) | DT |

## 2.12 Datos personales

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| D-01 | Consentimiento escrito si el dato no está en el art. 10 CT | F1 art. 57.1) | DT |
| D-02 | Finalidad expresada en el documento de consentimiento | F1 art. 57.2) | DT |
| D-03 | **Prohibición expresa de transferir a terceros** salvo el prestador | F1 art. 57.2) | DT |
| D-04 | El prestador no puede transferir a terceros ni usar los datos para otra finalidad | F1 art. 57.2) | DT |
| D-05 | Derecho de supresión del trabajador en cualquier momento | F1 art. 57.3) | DT |
| D-06 | **Destrucción entre 90 y 120 días** desde renuncia o despido | F1 art. 57.4 a) | DT |
| D-07 | El prestador destruye al desvincularse de un cliente | F1 art. 57.4 b) | DT |
| D-08 | Solo se destruyen los datos **no contemplados en el art. 10 CT** | F1 art. 57.4 d) | DT |
| D-09 | No recopilar biometría en la versión 1 | Decisión de producto | **OPC** |
| D-10 | Datos personales sensibles y biométricos: categoría especial bajo la Ley 21.719 | Ley 21.719 | **LEGAL** (desde 01.12.2026) |
| D-11 | Agencia de Protección de Datos Personales con facultad sancionatoria | Ley 21.719 | **LEGAL** (desde 01.12.2026) |

## 2.13 Obligaciones del prestador (nosotros)

| ID | Requisito | Fuente | Tipo |
|---|---|---|---|
| X-01 | **Certificación previa por entidad independiente** (no matriz, filial, coligada ni con vínculo societario de ningún tipo) | F1 art. 65 a) | DT |
| X-02 | La certificación cubre software **y hardware**, en todos los aspectos jurídicos, técnicos, funcionales, de seguridad e inviolabilidad | F1 art. 65 b) | DT |
| X-03 | Incluye **análisis de vulnerabilidades** | F1 art. 65 c) | DT |
| X-04 | **Se repite cada 24 meses** | F1 art. 65 d) | DT |
| X-05 | Informe final con las pruebas a que fue sometido el sistema y las razones técnicas de cumplimiento de **cada** condición | F1 art. 65 g) | DT |
| X-06 | **Domicilio comercial en Chile** (puede coincidir con el de la certificadora) | F1 art. 66.1 e) | DT |
| X-07 | Correo **no nominativo** declarado como medio hábil de notificación | F1 art. 66.1 f) | DT |
| X-08 | Solicitud dirigida al **Departamento Jurídico** de la DT | F1 art. 66.1 a) | DT |
| X-09 | Informe de certificación: certificado en la primera página, datos de la carta en la segunda, índice en la tercera, cuerpo **en el orden de la resolución** | F1 art. 66.2 a) | DT |
| X-10 | **Evidencias claramente visibles y legibles**; las que no se aprecia, no se presentan | F1 art. 66.2 a) v) | DT |
| X-11 | **No se puede reutilizar material fotográfico de solicitudes anteriores**, ni del mismo sistema | F1 art. 66.2 a) vi) | DT |
| X-12 | **Evidencias de no más de 6 meses** | F1 art. 66.2 a) viii) | DT |
| X-13 | **Diagrama de arquitectura** del software | F1 art. 66.2 b) | DT |
| X-14 | **Informe de vulnerabilidades** con herramienta de terceros: puertos TCP abiertos, vulnerabilidades, productos instalados, pruebas de penetración | F1 art. 66.2 c) | DT |
| X-15 | **Declaración jurada** de veracidad | F1 art. 66.2 d) | DT |
| X-16 | Envío por pendrive o **URL en la nube con permisos permanentes** | F1 art. 67 | DT |
| X-17 | En papel, **solo la carta conductora**; el resto no se presenta | F1 art. 67.3) | DT |
| X-18 | Revisión en **3 etapas**: admisibilidad, informáticos, jurídicos | F1 art. 68 | DT |
| X-19 | Para sistemas nuevos, se permite una empresa de prueba con trabajadores y datos reales | F1 art. 68 c) | DT |
| X-20 | **Autorización por 2 años** desde el oficio de respuesta | F1 art. 69 | DT |
| X-21 | Reingreso tras rechazo: los ajustes deben ser **avalados por una entidad certificadora**; si pasan más de 6 meses, se reemplazan las evidencias | F1 art. 70 | DT |
| X-22 | **Modificar la plataforma una vez autorizada es responsabilidad del prestador** | F1 art. 59 c) | DT |
| X-23 | **Entrega de información mensual** a la plataforma digital de la DT dentro de los primeros 5 días corridos: razón social, nombre de fantasía, domicilio casa matriz, RUT, tipo cloud/onpremise, URL de fiscalización, vigencia del contrato; más un listado de clientes dados de baja | F1 art. 26 | DT (`REVISIÓN LEGAL`: no se especifica URL ni formato) |
| X-24 | Sin modificar la plataforma autorizada | F1 art. 59 c) | DT |
| X-25 | Registro público de prestadores autorizados, actualizado mensualmente | F1 art. 73 | DT |

> **X-23 tiene una fecha que ya pasó.** Entró en vigor el **26 de septiembre de
> 2025**. Hoy ya es obligación vigente y **no sabemos dónde se entrega**.
> Hay que llamar a la DT. Marcado `REVISIÓN LEGAL` en la matriz.

## 2.14 Autenticación y roles

F1 no define un catálogo de roles. Lo que fija son **capacidades**:

| Perfil | Puede | No puede | Fuente |
|---|---|---|---|
| **Trabajador** | Consultar todos sus datos, 5 años, desde cualquier lugar y hora | No puede modificar nada | F1 art. 22.1, 24 e) por analogía |
| **Supervisor / empleador** | Ver todos los datos, usar herramientas de modificación de marcaciones | — | F1 art. 22.2 |
| **Funcionario DT** | Consultar y descargar **toda** la información de los sistemas | **No** modificar, complementar ni eliminar | F1 art. 24 e) |
| **Mandante (subcontratación)** | Ver y descargar reportes de los trabajadores de sus contratistas | No modificar la forma de prestación | F1 art. 22.3 a) ii) |
| **Empresa de servicios transitorios** | Ver sus propios trabajadores en cualquier empresa usuaria; **perfil de solo lectura** | No modificar ni corregir | F1 art. 22.3 b) |
| **Administración de la plataforma** | Acceder a la auditoría de perfiles | — | F1 art. 15 |

**RBAC detallado (nuestro, `BP`):** el modelo de permisos del proyecto actual
(13 permisos × roles) es razonable, pero para el portal de fiscalización hay que
incorporar el rol `funcionario_dt` con la restricción explícita de solo lectura
sobre todo el tenant, y acceso cruzado a todos los tenants. Ese rol es el más
delicado del sistema.

---

# 3. Lo que la resolución **no** exige

Lista explícita, porque son cosas que se piden y que no están:

| No exige | Verificado en |
|---|---|
| NTP / sincronización horaria | No aparece en los 73 artículos |
| Número de secuencia por dispositivo | No aparece |
| Idempotencia de la API | No aparece |
| Hash encadenado (`previous_hash`) | No aparece; solo hash por marcación (art. 8) |
| Firma digital del registro | No aparece; art. 14 b) la menciona solo para respaldos |
| MFA para administradores | No aparece |
| Reconocimiento facial o biometría | Explícitamente **evitada**; al menos una alternativa debe ser sin biometría (art. 7 g) |
| WORM | No aparece |
| Contenedores / Docker | No aparece |
| Redis / caché | No aparece |
| Un framework de desarrollo en particular | No aparece |

**Esto no significa que no hacerlo sea una idea.** Significa que si lo hacemos,
no podemos decir que lo hacemos "porque la ley lo exige", y en una instancia de
certificación, presentar como legales requisitos propios grieve en contra: la
entidad certificadora evalúa el cumplimiento de la resolución, no nuestras
buenas prácticas, y las buenas prácticas que no se pueden respaldar con evidencia
se ven como relleno.

---

# 4. Vacíos y dudas que deben resolverse antes de la Fase 2

| # | Duda | Por qué importa | Quién responde |
|---|---|---|---|
| 1 | ¿Dónde y cómo se entrega la información mensual del art. 26? | Obligación vigente desde el 26.09.2025 | Dirección del Trabajo |
| 2 | ¿Cuál es el artículo sancionador vigente del Código del Trabajo? | F1 art. 58 cita el 508, que hoy trata de notificaciones | Abogado laboral |
| 3 | ¿Existe un reglamento específico de colaciones además del art. 34 CT? | El art. 27 b) exige columna de colación con hora pactada | Abogado laboral / DT |
| 4 | ¿Qué pasa si el reloj físico es anterior a 3 años (F1 art. 20 c))? | Puede Happens ser causal de rechazo | Entidad certificadora |
| 5 | ¿Se acepta un APK de Android firmado y versionado como evidencia de hardware? | Es el documento que hay que adjuntar al diagrama de arquitectura | Entidad certificadora |
| 6 | ¿Los 24 meses de geolocalización (art. 27 c) prevalecen sobre los 12 (art. 25.1 c))? | Alcance del filtro de domingos y festivos | Entidad certificadora |
| 7 | ¿Cuál es el régimen de conservación de los **hash** y los **correos de comprobantes**? | La resolución fija 5 años para datos de asistencia y geolocalización, no para el correo | Abogado laboral |
| 8 | ¿La destrucción del art. 57.4 (90–120 días) choca con la retención de 5 años de los datos de asistencia? | **Sí parece chocar**: las marcaciones se conservan 5 años, pero los datos personales no contemplados en el art. 10 se destruyen a los 90–120 días. La salida es que la marcación no es "dato personal" en el sentido del art. 57, sino registro laboral. **Confirmar.** | Abogado laboral |
| 9 | ¿Qué contenido debe tener exactamente el registro de incidentes técnicos (art. 27 f))? | Poca especificación | Entidad certificadora |
| 10 | ¿Los reglamentos de la Ley 21.719 están dictados? | Cambian el régimen de datos desde el 01.12.2026 | Prepararse antes de diciembre |

---

**Siguiente documento:** [`02-arquitectura.md`](02-arquitectura.md)
