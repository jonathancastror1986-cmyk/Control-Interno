# 03 — Riesgos legales y técnicos

Entregable 7 de la Fase 1. Fecha de corte: **28 de septiembre de 2026**.

Clasificación de severidad: **CRÍTICO** = puede impedir la autorización o
producir sanción · **ALTO** = costoso de corregir tarde · **MEDIO** = hay que
vigilarlo.

---

## 4. Riesgos legales

### L-01 — Vender antes de la autorización · **CRÍTICO**

**Qué pasa.** F1 art. 58 b) tipifica como infracción "utilizar un sistema
electrónico no autorizado por la Dirección del Trabajo". F1 art. 72 dice que la
autorización es lo que permite **comercializar**. Un proveedor que vende sin
autorizar está poniendo a su cliente en una infracción tipificada, y la sanción
del Código del Trabajo es una multa, no un aviso.

**Por qué es grave.** F1 art. 49 dice que, si en una fiscalización se detecta que
la plataforma no está autorizada, **igual se toma en cuenta la información
entregada por el sistema** "a fin de evitar indefensión de los trabajadores". O
sea: la DT no invalida la planilla del cliente, pero sí sanciona. El cliente no
tiene defensa y vuelve al proveedor.

**Mitigación.**
- Antes de la autorización solo se vende a **clientes internos o de prueba**, y
  el contrato dice explícitamente que el sistema no está autorizado.
- La plataforma muestra un aviso permanente en el panel mientras
  `plataformas.vigente = false`.
- El primer ingreso de cualquier cliente nuevo muestra el estado de autorización.

**Riesgo residual:** bajo, si se respeta. Alto si se vende "para instalar más
adelá".

---

### L-02 — La entidad certificadora no existe todavía · **CRÍTICO**

**Qué pasa.** F1 art. 65 a) exige que la certificación la haga una persona
jurídica **independiente** de la empresa: "no podrá ser matriz, filial, empresa
coligada, relacionada, ni tener interés directo o indirecto, participación o
vínculo societario de ningún tipo". F1 art. 64 exige que la solicitud esté
**precedida** por el certificado.

**El problema.** Somos nosotros. No podemos certificarnos. Hay que contratar a
alguien, y ese alguien cobra por un informe que tiene que tener "en la primera
página el certificado de cumplimiento, fechado y suscrito por el responsable
del proceso" (art. 66.2 a) i)).

**Mitigación.** Es la primera tarea, no técnica.
1. Identificar tres o cuatro entidades certificadoras independientes.
2. Pedir cotización **antes** de escribir la plataforma, porque el precio
   depende de cuántas entrevistas y de qué tan lejos esté el diseño de la norma.
3. Comprar un **preinforme**: que revisen el diseño de esta documentación y
   digan qué falta. Es mucho más barato que descubrirlo en el rechazo.

**Riesgo residual:** el tiempo de certificación es incerta y no depende de
nosotros. **Es el riesgo que manda sobre el calendario del proyecto.**

---

### L-03 — Un solo incumplimiento y se cae la autorización · **ALTO**

**Qué pasa.** F1 art. 60 tiene un régimen progresivo:

| Incumplimiento | Consecuencia |
|---|---|
| 1.º | Reconvención escrita |
| 2.º dentro de 30 días | Baja temporal **15 días** del registro de prestadores |
| 3.º dentro de 30 días | Baja temporal **30 días** |
| 4.º dentro de 60 días | **Cancelación** de la autorización |

Al ser baja en el registro público, el efecto es comercial: los empleadores
venen que el prestador no está autorizado.

**Y F1 art. 59 c) dice que es responsabilidad del prestador "realizar
modificaciones a las plataformas una vez que han sido autorizadas".** Es decir:
**cada vez que despleguamos una versión nueva, estamos modificando la plataforma
autorizada.** No hay excepción.

**Mitigación.**
- Control de cambios: **toda** versión que cambie algo observable (reportes,
  portal, hash, alertas) pasa por revisión antes de producción.
- Un registro de versiones con fecha y qué cambió, que se pueda entregar a un
  inspector.
- F1 art. 65 f) dice que **no se requiere nueva certificación** si los cambios se
  limitan a nuevas versiones de software, capa gráfica, etc. Es el margen: si el
  cambio altera la lógica de un reporte normado, **no** es una actualización
  cosmética.
- Mientras no haya certificación, un panel con **diferimiento de 15 días** para
  cambios que alteren requisitos. Es incómodo y es lo que cuesta el
  cumplimiento.

---

### L-04 — La Ley 21.719 entra en vigor el 1 de diciembre de 2026 · **ALTO**

**Qué pasa.** En dos meses. Reescribe el régimen de datos personales, crea la
Agencia de Protección de Datos Personales con facultad sancionatoria, y
categoriza los datos biométricos como categoría especial. F1 art. 57 está
escrito contra la Ley 19.628, con plazos de destrucción de 90 a 120 días y
"finalidad" como único límite.

**Por qué es un riesgo y no solo un cambio.** La capa de datos personales del
sistema actual es casi inexistente: un campo `fecha_termino` y un
`motivo_desvinculacion`. Bajo la 21.719 hay que poder responder quién consintió
qué, para qué finalidad, con qué base, cuándo se destruyó y quién accede.

**Mitigación, y es la más grande de todas:**
- Tratarlo como **refactor antes de diciembre**, no como parche.
- La Ley 21.719 ya está publicada: sus reglamentos "deberán dictarse dentro de
  los seis meses siguientes a la publicación", es decir, antes de diciembre. Hay
  que leerlos cuando se publiquen.
- Al menos: tabla de `consentimientos` con `finalidad`, `base_legal`,
  `fecha`, `version_documento`, `origen` (contrato/anexo/RIOS), y
  `destruido_at`.
- Mientras tanto, el sistema **no recolecta** nada que la 21.719 pueda tratar
  como sensible. Eso es exactamente por qué la versión 1 no lleva biometría ni
  geolocalización.

**Riesgo residual:** medio. Se mitiga con disciplina de no recolectar, que es la
forma más barata de cumplimiento que existe.

---

### L-05 — La plataforma de entrega mensual no existe en la norma · **ALTO**

**Qué pasa.** F1 art. 26 obliga a los prestadores autorizados a cargar
mensualmente, dentro de los primeros 5 días corridos, la lista de clientes en
"la plataforma digital de este Servicio". **Vigente desde el 26 de septiembre de
2025.** La resolución no dice cuál es la plataforma, ni el formato, ni el
procedimiento.

**Mitigación.** Llamar a la DT antes de la certificación y preguntarlo por
escrito. Es una de las preguntas que hay que llevar a la primera reunión con la
entidad certificadora.

**Riesgo residual:** no se puedemitigar con código. Es un bloqueo de
dependencia externa.

---

### L-06 — El reloj Android TV Box puede no cumplir el art. 20 c) · **ALTO**

**Qué pasa.** F1 art. 20 c) exige versiones de los productos que componen la
plataforma con **menos de 3 años de antigüedad y vigencia no inferior a 5 años**.
Un Android TV Box económico de 2019 está fuera, y su WebView también.

**Mitigación.** Política de rotación a 36 meses, declarada en la declaración
jurada, financiada en el contrato como un costo del servicio. Ver documento 02,
sección 6.5.

**Riesgo residual:** alto si se compra hardware barato y se vende como producto
de por vida. **Es el punto donde "lo más barato" y "lo legal" se separan.**

---

### L-07 — Correos que llegan a spam · **ALTO**

**Qué pasa.** F1 art. 12 obliga a enviar **un comprobante por cada marcación**
al correo personal del trabajador, y art. 34.2 f) pone en el prestador la
responsabilidad de que los correos **no sean bloqueados o calificados como
correo basura**. Un cliente con 200 trabajadores genera 800 correos diarios.

**Por qué es difícil.** Los correos automáticos de un sistema de asistencia tienen
tasa de entrega mala por naturaleza: muchos trabajadores no abren su correo
durante el turno, y los filtros grandes de los proveedores de correo personal
marcan como spam el volumen alto desde una IP de servidor.

**Mitigación.**
- Dominio propio con **DKIM, SPF y DMARC** antes del primer correo.
- Un envío por marcación, sí, pero **consolidado por trabajador y por ventana**:
  en vez de 4 correos al día, uno cada 30 minutos con todas las marcas del
  período. **Cuidado:** esto es una interpretación, y la norma dice "de cada
  operación". Hay que preguntarlo. La lectura literal es un correo por
  operación.
- Correo de sistema **no nominativo** (art. 12 d)) desde un subdominio dedicado
  (`marcaciones@`), separado del correo corporativo, para que un bloqueo de uno
  no tumbe al otro.
- Un tablero de reputación de envío en el panel, con la tasa de entrega por
  trabajador visible.

**Riesgo residual:** medio, y **es un costo de infraestructura recurrente** que
hay que poner en el modelo de precios.

---

### L-08 — Usar geolocalización activa la prueba de certificación más cara · **MEDIO**

**Qué pasa.** F1 art. 65 e): si la plataforma usa geolocalización, la entidad
certificadora debe verificar que en **3 minutos** la aplicación logra una
ubicación con error **menor a 30 m de radio en el 95 %** de las marcaciones, y
que las pruebas **no se hacen en recintos cerrados**. En una obra eso significa
salir al terreno.

**Mitigación.** **No usar geolocalización en la versión 1.** Ya está decidido. Eso
elimina F1 art. 53, art. 45.4, art. 13.1 f) y la prueba de campo.

**Riesgo residual:** bajo, si se respeta la decisión. **El riesgo es de
especificación**: que en el futuro alguien agregue geolocalización "porque es
un valor agregado" y rompa la certificación vigente.

---

### L-09 — Un solo proveedor por empleador (art. 48 b) · **MEDIO**

**Qué pasa.** El empleador **tiene que** usar el mismo producto comercial en
todas sus instalaciones y en el teletrabajo. Si el cliente tiene dos obras y le
ofrece un solo producto, bien. Si el cliente quiere dos marcas distintas, el
sistema no lo soporta.

**Mitigación.** Ninguna, del lado técnico. Es una restricción comercial que hay
que conocer antes de vender: **no se puede competir porfaena contra otro
proveedor dentro del mismo cliente.**

**Riesgo residual:** comercial, no técnico. Pero es una limitación de mercado
real y conviene saberla.

---

### L-10 — Declarar "fiscalizable" a un cliente sin estar autorizado · **CRÍTICO**

Es la versión comercial de L-01. Un cliente que usa el sistema para construir su
planilla, paga su planilla y asume el riesgo. La DT puede multarlo a él (art. 58 b).

**Mitigación.** El contrato con el cliente debe decir, en palabras claras, que el
uso de un sistema no autorizado es infracción del art. 58 b) y que la
responsabilidad es del empleador. Y el sistema, en su primer ingreso, debe
recordarlo.

**Riesgo residual:** depende de la redacción contractual y de la buena fe del
cliente. **Es el riesgo legal más grande del proyecto y el que másesta
discutiendo con un abogado antes de vender nada.**

---

## 5. Riesgos técnicos

### T-01 — La arquitectura actual no puede certificarse tal como está · **CRÍTICO**

Falta, de lo exigido por F1:

| Falta | Artículo |
|---|---|
| Checksum por marcación | art. 8 |
| Pantalla web pública de verificación por hash | art. 8 |
| Hash encadenado | (BP, pero reforça) |
| Los seis reportes normados, con columnas exactas | art. 27 |
| Arial 8, Excel/PDF/Word, "No hay trabajadores que coincidan" | art. 28 |
| Portal de fiscalización con dominio propio, 7×24 | art. 17 |
| Login @dt.gob.cl con clave de 5 días | art. 23 |
| Correo al empleador notificando el inicio de la revisión, con el texto literal | art. 24 b) |
| Rol de funcionario DT, solo lectura, multi-tenant | art. 24 e) |
| Procedimiento de corrección con 48 h de oposición | art. 40 |
| Comprobantes automáticos de marcación | art. 12 |
| Registro de incidentes técnicos | art. 27 f) |
| Alertas de los 30 minutos | art. 45.1) |
| Reporte diario automático | art. 27 e) |
| Registro de conexiones de funcionarios (IP) | art. 22.5) |
| Tabla de consentimientos y destrucción de datos | art. 57 |

**Mitigación:** es el trabajo de las Fases 2 a 9. Está ordenando por la matriz
del documento 04.

---

### T-02 — La validación en el cliente se puede saltar · **ALTO**

**Qué pasa.** La app actual valida permisos, tarjetas y reglas de negocio en
JavaScript. Cualquiera con un token de Supabase puede saltárselo llamando a
PostgREST directamente. Eso no es teórico: es un `PATCH` a una tabla.

**Mitigación.** Todas las reglas de integridad van a la base: RLS por tenant,
triggers, y funciones `security definer` para lo que necesita escribir. Es lo
que ya se hizo con la auditoría en la migración 028 y funciona.

**Por qué importa para la certificación:** F1 art. 14 a) exige que las bases de
datos "impidan el acceso a personal no autorizado, y prevengan la adulteración de
la información post-registro". Una validación en el cliente no cumple eso, porque
el acceso no autorizado no está bloqueado: es invisible.

---

### T-03 — El hash se puede calcular mal y no se nota · **ALTO**

**Qué pasa.** F1 art. 8 dice "no se ajustarán al estándar exigido los códigos
generados de forma manual, o concatenando atributos sin aplicar estas funciones
nativas". O sea: calcular el hash en JavaScript con una librería, o armarlo a
mano, es **rechazo expreso**.

**Mitigación.**
- El checksum lo calcula **una función de la base** que usa `digest()` de
  pgcrypto. No hay código que lo calcule en otro lenguaje.
- Un test que recalcula el hash de las 10.000 marcaciones más antiguas y falla
  si no coincide. Un hash mal calculado en una migración pasada se detecta a
  tiempo, no cuando viene el inspector.
- Un endpoint público que verifica, y que devuelve **el mismo cuerpo y el mismo
  tiempo** tanto si el hash existe como si no. Un verificador que dice "no
  existe" confirma que alguien probó un hash.

---

### T-04 — Correos a 800 por día · **ALTO**

Ver L-07. El riesgo técnico es que el envío bloquee la transacción de la
marcación. **Nunca se envía correo dentro de la transacción que inserta la
marcación.** Va a una cola, con reintentos y límites.

---

### T-05 — El reloj pierde la hora · **ALTO**

Un Android TV Box sin batería de reloj, después de un corte de luz, vuelve con
la hora de la última señal que Broadcasting haya.update, que puede ser de hace
semanas.

**Mitigación.**
- Token de tiempo firmado por el servidor, como se describió en el documento 02.
- `desfase_segundos` siempre registrado.
- **Un reloj con desviación mayor al umbral no marca.** Muestra "SIN SEÑAL". Es
  preferible no tener marcación a tener una marcación con la hora equivocada:
  F1 art. 41 b) dice que la corrección no puede perjudicar al trabajador, y una
  hora errada siempre lo perjudica.
- UPS. De 30 minutos de autonomía se pasa a "el corte de luz dejó de importar".

---

### T-06 — La cola offline se corrompe · **MEDIO**

`localStorage` es sincrónico y se pierde con un corte abrupto. `IndexedDB` es
transaccional y no.

**Mitigación:** IndexedDB, con escritura confirmada antes de mostrar el mensaje
de "MARCADOR REGISTRADO" en la pantalla del reloj. Si la escritura no está
confirmada, el reloj **no dice que registró**. La pantalla no puede mentir aunque
el sistema esté mal.

---

### T-07 — Un dispositivo duplica la fila al sincronizar · **MEDIO**

**Mitigación:** `request_id` con índice único y `ON CONFLICT DO NOTHING`. La
idempotencia la garantiza la base, no el reloj. Y el checksum es único también, así
que hay dos barreras.

---

### T-08 — El panel se cae con 5 años de datos · **ALTO**

F1 art. 22.1 y 25.1 d) exigen consultar 5 años hacia atrás. Con 200 trabajadores
y 4 marcaciones diarias son 1,5 millones de filas en 5 años. Multiplicado por
empresas, la tabla crece rápido.

**Mitigación.**
- Índices compuestospensando en la consulta más frecuente, no en la escritura.
- **Particionado por mes** en `marcaciones`. Con 5 años y 1,5 M de filas no es
  necesario, pero con 5.000 trabajadores sí lo es, y una partición no se agrega
  después sin reescribir la tabla.
- Vistas materializadas para los agregados del panel, refrescadas por debajo del
  costo de una consulta.
- **Redis no.** Ver documento 03, sección 3.3.

---

### T-09 — El verificador de hash público se convierte en oráculo · **MEDIO**

Un endpoint público que responde sí/no sobre un hash es un dictionary attack
contra el espacio de hashes. Con SHA-256 sobre datos conocidos, es inviable
espacialmente, pero conviene no Helpful.

**Mitigación.** Respuesta constante en contenido y tiempo, y sin mensaje de error
diferente. Igual que en el login.

---

### T-10 — El certificado SSL del dominio propio · **MEDIO**

F1 art. 17 b) exige certificado de **entidad certificadora acreditada** y
**no acepta certificados caducados**. Una renovación automática fallida deja el
portal caído y es infracción de art. 22.4.

**Mitigación:** renovación automática con aviso a un canal que alguien mire, y
un segundo dominio de respaldo con el mismo certificado. Monitoreo externo del
certificado, no interno.

---

## 6. Mapa de dependencias

```
L-02  Entidad certificadora  ──────────────────────────────┐
  │                                                        │ define el alcance
  ├──► L-06  Reloj vs art. 20 c)                          │ de la certificación
  ├──► L-08  Prueba de geolocalización (si se usa)         │
  └──► T-10  SSL acreditado                                 │
                                                           ▼
L-05  Plataforma DT del art. 26  ──────────────────► bloqueo externo
                                                          │
L-04  Ley 21.719 (01.12.2026) ─────► T-01  Refactor ──────┤
  │                                                        │
  └── 2 meses ──────────────► DEADLINE                    ▼
                                                    Fecha de certificación
                                                    (no la controlamos)
```

**El camino crítico no es técnico, es de terceros.** La fecha de certificación
depende de tres cosas fuera de nuestro control: la entidad certificadora, la DT
y la vigencia del registro. El diseño técnico puede estar listo en tres meses; la
autorización no depende de nosotros.

---

## 7. Qué hacer en los próximos 30 días

| # | Acción | Por qué es primera |
|---|---|---|
| 1 | **Contactar 3 entidades certificadoras y pedir cotización** | Es el camino crítico. Todo lo demás se puede hacer en paralelo; esto no |
| 2 | **Escribir a la DT** preguntando por la plataforma del art. 26 y por el art. 508 vigente | Dos bloqueos de dependencia externa |
| 3 | **Revisar este documento con un abogado laboral** | L-04, L-10 y las dudas 2, 3, 7 y 8 del documento 01 |
| 4 | **Decidir la política de hardware del reloj** (rotación a 36 meses) | Compra de stock; si se compra antes de decidir, se compra el equivocado |
| 5 | **Leer la Ley 21.719 y sus reglamentos** cuando se publiquen | Entra en vigor en 2 meses |
| 6 | **Configurar DKIM/SPF/DMARC del dominio propio** | Tarde, y después hay que esperar |

---

**Siguiente documento:** [`04-matriz-cumplimiento.md`](04-matriz-cumplimiento.md)
