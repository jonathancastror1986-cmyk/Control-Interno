# DT-COMPLIANCE

Documentación de cumplimiento normativo para el sistema de registro y control de
asistencia. **Fase 1: investigación normativa y arquitectura.**

> **Estado: propuesta en revisión.** Nada de este documento está aprobado todavía.
> No se ha escrito una línea de código de la nueva plataforma.

---

## Índice

| Documento | Contenido |
|---|---|
| [`01-normativa-vigente.md`](01-normativa-vigente.md) | Fuentes oficiales, análisis de la normativa, requisitos obligatorios clasificados |
| [`02-arquitectura.md`](02-arquitectura.md) | Arquitectura, modelo de datos, flujo de una marcación, arquitectura del reloj |
| [`03-riesgos.md`](03-riesgos.md) | Riesgos legales y técnicos, con mitigación |
| [`04-matriz-cumplimiento.md`](04-matriz-cumplimiento.md) | Matriz requisito → fuente → implementación → estado |

---

## Fuentes consultadas

Todas leídas directamente desde el sitio oficial, no desde blogs ni notas de
despachos. La fecha de corte es **28 de septiembre de 2026**.

| # | Norma | Identificador oficial | URL |
|---|---|---|---|
| F1 | **Resolución Exenta N.º 38 de 26.04.2024** — requisitos y procedimiento de autorización para los sistemas electrónicos de registro y control de asistencia | `idNorma=1203415` | [nuevo.leychile.cl](https://nuevo.leychile.cl/servicios/Consulta/Normas/Navegar?idNorma=1203415) |
| F2 | **Código del Trabajo** (DFL 1/2003, texto consolidado) | `idNorma=207436` | [nuevo.leychile.cl](https://nuevo.leychile.cl/servicios/Consulta/Normas/Navegar?idNorma=207436) |
| F3 | **Registro público de sistemas autorizados** (art. 73 F1) | — | [dt.gob.cl](https://www.dt.gob.cl/portal/1626/w3-article-124477.html) |
| F4 | Documentos relacionados con F1 (140 ordinarios y dictámenes) | — | [dt.gob.cl](https://dt.gob.cl/legislacion/1624/w3-propertyvalue-190071.html) |
| F5 | **Ley N.º 21.719** — modifica la Ley 19.628 sobre protección de datos personales | `idNorma=1209272` | [nuevo.leychile.cl](https://nuevo.leychile.cl/servicios/Consulta/Normas/Navegar?idNorma=1209272) |

### Normas citadas por la propia F1 y que no se transcribieron aquí

Se mencionan porque la F1 las invoca, pero **su texto no se revisó**. Quedan
como pendiente de verificación.

- **Reglamento N.º 969 de 1933**, artículo 20 — invocado por F1 art. 29
  (reportes semanales firmados).
- **DFL N.º 2 de 1967** (Ley Orgánica de la Dirección del Trabajo), artículo 25 —
  invocado por F1 art. 22.4.
- **Ley N.º 19.628** sobre protección de la vida privada — vigente; se analiza el
  régimen transitorio en el documento 01.
- **DFL N.º 1 de 2009** y **art. 154 ter del Código del Trabajo** + **DS N.º 44 de 2023**
  — mecanismos tecnológicos de prevención de riesgos. Aplican a otros fines, pero
  fijan un criterio de la DT sobre tratamiento de datos y sobre el límite entre
  control y vigilancia, que se cita como precedente. **No se revisó el texto

---

## Cómo leer los requisitos

Cada línea de la matriz y de los documentos está clasificada en una de cuatro
categorías. **Esta distinción es el objetivo del documento**: presentar una buena
práctica como obligación legal es el error que hace perder tiempo y dinero.

| Marca | Categoría | Significado |
|---|---|---|
| **LEGAL** | Requisito legal | Obligación de una ley o del Código del Trabajo |
| **DT** | Requisito de la Dirección del Trabajo | Obligación de la Resolución Exenta 38/2024 o de un ordinario |
| **BP** | Buena práctica técnica | Recomendación nuestra. No exigida por la norma |
| **OPC** | Funcionalidad opcional | La norma la deja expressly opcional, o es decisión de producto |

> Cuando no se pudo determinar algo con seguridad, se escribe
> **`REVISIÓN LEGAL`** y se explica qué falta. No se rellena con una suposición.

---

## Resumen ejecutivo — las 10 conclusiones que cambian el proyecto

1. **La autorización es de la plataforma, no de la empresa.** F1 art. 3 a): la
   autorización "se refiere específicamente al sistema consultado y no a las
   empresas que lo desarrollen o comercialicen". También art. 63 y 72. Los
   empleadores que usen una plataforma autorizada **no necesitan pedir nada**.

2. **Hoy no se puede vender esto a empleadores.** F1 art. 58 b) tipifica como
   infracción "utilizar un sistema electrónico no autorizado por la Dirección del
   Trabajo". Un proveedor que venda un producto sin autorización está adivinando
   si su cliente va a ser sancionado. Es el riesgo comercial número uno.

3. **Falta el checksum por marcación.** F1 art. 8 obliga a generar
   automáticamente un Checksum/Hash SHA-2 de cada marcación, con funciones
   nativas, y a publicarlos en una pantalla web donde se puedan verificar. El
   proyecto actual **no lo tiene**. Es el requisito técnico más específico de toda
   la resolución y el más fácil de incumplir por inadvertencia.

4. **Hacen falta dos formas de identificación, siempre.** F1 art. 7 g) obliga a
   tener al menos dos alternativas, y **al menos una no puede usar biometría ni
   datos personales**. QR con token opaco + PIN cumple; QR solo, no.

5. **Las correcciones tienen un procedimiento legal, no técnico.** F1 arts. 40 y
   41: correo al trabajador, **48 horas para oponerse**, consolidación automática
   después, y **no se pueden hacer pasado el día hábil siguiente**. El módulo de
   "corregir una marcación" del proyecto actual no lo cumple.

6. **Los reportes son normados campo por campo.** F1 art. 27 define seis reportes
   con nombre, orden y columnas exactas; art. 28 exige **Arial N.º 8 como máximo**,
   exportación a **Excel, PDF y Word**, y una frase literal cuando no hay
   resultados. No es "un reporte de asistencia": es un documento con forma fija.

7. **La retención es de 5 años y hay que poder retroceder 5 años en los
   filtros.** F1 art. 22.1 (el trabajador consulta 5 años), art. 25.1 d)
   (los filtros permiten 5 años), art. 58 l) (infracción no tener 5 años
   disponibles) y art. 53 f) (geolocalización, 5 años).

8. **El reloj Android TV Box tiene un problema de ciclo de vida, no de
  rendimiento.** F1 art. 20 c) exige que las versiones de los productos que componen la
   plataforma no tengan **más de 3 años de antigüedad y una vigencia no inferior
   a 5 años**. Un Android TV Box económico no cumple eso solo. Hay que diseñar
   un esquema de reposición del hardware o justificarlo en la certificación.

9. **La Ley 21.719 entra en vigor el 1 de diciembre de 2026**, es decir, en dos
   meses. Reescribe la Ley 19.628, crea la Agencia de Protección de Datos
   Personales y cambia el régimen de datos personales, consentimiento,
   finalidad y Agency. Diseñar contra la 19.628 solamente sería designing sobre
   una base que cae en dos meses.

10. **El tipo de plataforma es amplo a propósito.** F1 art. 3 n) incluye "toda
    plataforma, dispositivo o aplicación que, directa o indirectamente, se
    utilice o sirva para obtener información sobre la asistencia [...] aunque esa
    no sea su finalidad primaria". Un sistema de Slack, WhatsApp o una app de
    inventario que registre entradas queda dentro. No hay atajo por la vía
    informacional.

---

## Lo que este documento NO resuelve

- **Cuánto cuesta y cuánto tarda la certificación.** Depende de cotizaciones de
  entidades certificadoras independentes (F1 art. 65 a)). No se puede estimar sin
  mercado real.
- **Qué entidad certificadora contratar.** Hay que buscar una que no tenga
  vínculo societario, directo ni indirecto, con la empresa solicitante (F1 art. 65 a).
- **La plataforma de entrega periódica de información.** F1 art. 26 obliga a los
  prestadores a cargar mensualmente la lista de clientes en "la plataforma
  digital de este Servicio", con vigencia desde el **26 de septiembre de 2025**.
  **La resolución no indica la URL, el formato ni el procedimiento.** Hay que
  pedirlo a la DT. Está marcado `REVISIÓN LEGAL`.
- **La discrepancia 12 vs 24 meses** en los domingos y festivos: el art. 25.1 c)
  dice 12 meses y el art. 27 c) dice 24 meses. Se implementan 24 (más
  permisivo) y se registra la inconsistencia.
- **El número de artículo del Código del Trabajo que sanciona.** F1 art. 58 dice
  "artículo 508", pero ese artículo hoy trata de notificaciones (Ley 21.327
  renumeró el Título Final). El artículo sancionador vigente debe confirmarse con
  un abogado laboral antes de citarlo en un documento oficial.

---

## Cómo se sigue

1. Revisar y corregir estos documentos. En particular el alcance de la
   certificación y quién la paga.
2. Decidir la arquitectura objetivo (documento 02) — en particular si se continúa
   sobre el proyecto Supabase existente o se reconstruye.
3. Recién entonces, Fase 2: modelo de datos definitivo y migraciones.
