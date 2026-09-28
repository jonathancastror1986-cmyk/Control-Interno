# 02 — Arquitectura propuesta

Entregables 3, 4, 5 y 6 de la Fase 1.

---

# 3. Arquitectura

## 3.1 La decisión de fondo

El proyecto actual (`control-asistencia-web`) es una aplicación de una sola
página, sin build, sobre **Supabase** (PostgreSQL + Edge Functions + Auth +
Storage). El enunciado pedía React/Next.js, NestJS, PostgreSQL, Redis y Docker.

**Recomendación: no reconstruir. Extender Supabase, con tres cambios de fondo.**

Razones, en orden de peso:

1. **El código ya es un sistema de asistencia real**, con 31 migraciones, tabla
   de asistencia, auditoría inalterable con trigger de base (migración 028),
   roles y permisos, tótem con reloj físico (migración 030), kit de contratación
   (031), importación de Excel,.tarja mensual y bitácora. Eso son meses de
   trabajo ya hecho y validado contra PGlite.
2. **F1 art. 20 b) y c)** exige sistemas operativos en versiones vigentes con
   soporte, con antigüedad de versión ≤ 3 años y vigencia ≥ 5 años. PostgreSQL
   administrado cumple; una pila NestJS autogestionada que hay que mantener
   durante 5 años es un riesgo diretso para ese mismo requisito.
3. **F1 art. 20 d) y e)** exige base de datos y aplicación distribuidas en más
   de un servidor, con réplica y respaldo externo. Supabase Pro lo da; un VPS
   propio no, y hacerlo mal es el camino corto al rechazo en art. 68 b).

**Pero con tres condiciones, sin las cuales esto no es una plataforma vendible:**

| # | Condición | Por qué |
|---|---|---|
| A | **Dominio propio y portal de fiscalización independiente** | F1 art. 17 b) exige `https://www.nombredelsitio.cl` visible en la portada. Hoy la app vive en `jonathancastror1986-cmyk.github.io`, que **no cumple**. |
| B | **Backend propio con dominio propio** | Hoy `*.supabase.co`. El art. 65 a) pide que el solicitador sea una persona jurídica con domicilio en Chile, y el 17 exige SSL de entidad acreditada. Se puede tener el portal en el dominio propio reenviando a Supabase, pero el **API del reloj** (`marcar`) debe quedar bajo dominio propio. |
| C | **Servicio de correo transaccional con dominio propio y reputado** | F1 arts. 12 y 45 exigen correo automático a cada marcación. Los correos desde `*.supabase.co` o desde una cuenta gratuita van a spam y el art. 34.2 f) pone esa responsabilidad en el prestador. |

## 3.2 Diagrama de arquitectura

Este es el documento que F1 art. 66.2 b) exige acompañar a la solicitud. Se
incluye aquí en forma preliminar.

```
┌───────────────────────────── OBRA / CENTRO DE TRABAJO ─────────────────────────────┐
│                                                                                    │
│   ┌──────────────────┐        ┌──────────────────────┐        ┌──────────────────┐  │
│   │  Reloj 1         │        │  Reloj 2             │        │  Reloj N         │  │
│   │  Android TV Box  │        │  Android TV Box      │        │  Android TV Box  │  │
│   │                  │        │                      │        │                  │  │
│   │  Kiosk PWA       │        │  Kiosk PWA           │        │  Kiosk PWA       │  │
│   │  cámara/lector   │        │  cámara/lector       │        │  cámara/lector   │  │
│   │  reloj físico ───┼── UPS  │  reloj físico ───────┼── UPS  │  reloj físico    │  │
│   │  cola local      │        │  cola local          │        │  cola local      │  │
│   └───┬──────────────┘        └──────┬───────────────┘        └────────┬─────────┘  │
└───────┼─────────────────────────────┼─────────────────────────────────┼────────────┘
        │          HTTPS / TLS 1.2+   │                                 │
        └──────────────┬──────────────┴─────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────────────┐
        │   Edge: API de reloj  (dominio propio)      │   F1 art. 9
        │   POST /api/v1/dispositivos/marcaciones     │   idempotente
        │   POST /api/v1/dispositivos/heartbeat       │
        │   GET  /api/v1/dispositivos/configuracion   │
        │   POST /api/v1/dispositivos/sincronizacion  │   F1 art. 10
        │   GET  /marcaciones/verificar?hash=…         │   F1 art. 8  ← PÚBLICO
        └───────────────────┬──────────────────────────┘
                            │
        ┌───────────────────▼──────────────────────────┐
        │   API de aplicación (dominio propio)        │
        │   auth · RBAC · multiempresa                │
        │   cola de correo  ─────────────────►  [SMTP transaccional]
        │                                            F1 art. 12 d)
        └───────────────────┬──────────────────────────┘
                            │
        ┌───────────────────▼──────────────────────────┐
        │   PostgreSQL  (RDS con réplica + PITR)       │
        │   RLS por tenant · triggers de auditoría     │
        │   cadena de hash  previous_hash               │
        └───────────────────┬──────────────────────────┘
                            │
        ┌───────────────────▼──────────────────────────┐
        │   PORTAL DE FISCALIZACIÓN  7×24              │   F1 art. 17
        │   https://www.nombredelsitio.cl/fiscalizacion │   un solo enlace,
        │   nombre del prestador + versión del software │   todos los clientes
        │   login @dt.gob.cl → clave 5 días            │   F1 art. 23
        │   perfil solo lectura, sin modificar          │   F1 art. 24 e)
        └──────────────────────────────────────────────┘
```

**Lo que este diagrama resuelve a propósito:** el camino de escritura de una
marcación tiene **un solo dueño** (la base de datos). La API no valida reglas de
asistencia: prepara el registro y lo inserta; un trigger y una función
`security definer` resuelven hash, auditoría y validación. Es el mismo criterio
con el que ya se resolvió la auditoría en la migración 028: una validación que
vive en el navegador puede ser evadida por el siguiente que escriba código; una
que vive en un trigger no.

## 3.3 Por qué Supabase y no NestJS

| Requisito F1 | Supabase | NestJS + RDS autogestionado | Ganador |
|---|---|---|---|
| art. 20 b) SO en versiones vigentes con soporte | Gestionado por el proveedor | El equipo tiene que actualizar PostgreSQL, Node y el OS cada 3 años | **Supabase** |
| art. 20 d) más de un servidor o datacenter | Incluido | Hay que construirlo | **Supabase** |
| art. 20 e) réplica y respaldo externo | Incluido | RDS con PITR, igual | Empate |
| art. 20 c) vigencia ≥ 5 años |Contrato del proveedor | Compromiso propio de mantener 5 años | **Supabase** |
| art. 17 d) 7×24 | SLS 99,9 % | Un dev guardia una noche | **Supabase** |
| art. 65 a) certificado de una entidad independiente | Irrelevante | Irrelevante | Empate |
| Aislamiento de tenant | RLS por `company_id` | Hay que construirlo o usar `pg` + RLS igual | Empate |
| Latencia del API de reloj | Regional | Regional | Empate |
| Costo a escala | Por filas | Por servidor | NestJS a partir de ~50 k empleados |

**Conclusión:** Supabase es objetivamente más barato y más seguro para el
cumplimiento normativo. Lo que hay que construir a mano es lo que la resolución
exige y Supabase no da: el portal de fiscalización, el verificador de hash
público, los seis reportes normados y la capa de correo.

**Redis:** no se necesita. Las consultas del panel son agregados sobre Postgres
con índices adecuados. Meter Redis introduce un segundo almacén que hay que
respaldar y que nadie va a poder auditar. Si aparece una necesidad real de
caché, es caché de lectura y se puede hacer con `pgbouncer` y vistas
materializadas.

**Docker:** se usa en el entorno de pruebas y en la máquina de certificación, no
en producción. En producción manda el proveedor, y el `docker-compose` propio es
justo lo contrario de art. 20 d).

---

# 4. Modelo de datos

Diseñado para que **cada campo normativo sea una columna**, no un JSON que
alguien tendrá que desarmar en el momento de la certificación. El principio es
el del documento 01: si un inspector pide el hash de una marcación, tiene que
salir de una columna.

## 4.1 Nombres de tabla propuestos

Las que ya existen se conservan. Las nuevas llevan prefijo para no chocar.

```
plataformas            (nueva)  — datos del prestador
tenants                (nueva)  — = empresas, ya existe como tabla `empresa`
sucursales             (nueva)  — ya existe como `centros_costo`
dispositivos           (nueva)  — ya existe como `relojes`
```

> **Decisión a confirmar:** el proyecto actual llama `empresa` a la entidad
> tenant y `centros_costo` al lugar. Renombrar a `tenants` y `locations` mejora
> la lectura pero mezcla inglés con el resto del esquema, que está en castellano.
> **Propongo quedarse con castellano** y llamar a las nuevas `sucursales` y
> `dispositivos`, aceptando que `centros_costo` y `relojes` ya están
> renombrados. Mezclar idiomas en un esquema que va a ver un inspector es peor
> que la duplicación.

## 4.2 Tablas nuevas

### `plataformas`
```sql
create table plataformas (
  id                  uuid primary key default gen_random_uuid(),
  nombre_tecnico      text not null,          -- F1 art. 66.1 h)
  nombre_comercial    text not null,
  version             text not null,          -- F1 art. 17 c) se muestra en pantalla
  razon_social        text,
  rut                  text,
  domicilio_chile     text,                   -- F1 art. 66.1 e) obligatorio
  email_no_nominativo text not null,          -- F1 art. 66.1 f)
  sitio_web           text not null,          -- F1 art. 17 b)
  fecha_autorizacion  date,
  numero_ordinario    text,                   -- F1 art. 69
  fecha_vencimiento   date,
  entidad_certificadora text,
  vigente             boolean not null default false
);
```

> `nombre_tecnico` y `nombre_comercial` están separados a propósito: F1 art. 63
> dice que cambiar el nombre comercial **obliga a nueva autorización**, y art. 66.1
> exige declarar ambos. Que sean dos columnas y no una evita la tentación de
> renombrar.

### `sucursales` (el lugar de prestación de servicios)
```sql
create table sucursales (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      int not null references empresa(id),
  nombre          text not null,
  -- F1 art. 13.2 c): calle, número, piso, oficina, comuna, ciudad, región.
  -- Se guardan por separado porque el comprobante los exige todos.
  calle           text,
  numero          text,
  piso            text,
  oficina         text,
  comuna           text,
  ciudad          text,
  region          text,
  -- F1 art. 25.1 g) agrupa por unidad geográfica y expande por región
  region_geo      text,
  activa          boolean not null default true
);
```

### `dispositivos` (evoluciona `relojes`)
```sql
create table dispositivos (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             int not null references empresa(id),
  sucursal_id            uuid references sucursales(id),
  nombre                 text not null,   -- se muestra en la pantalla del reloj
  serial_number          text,
  estado                 text not null default 'activo'
                         check (estado in ('activo','inactivo','bloqueado','retirado')),
  hash_token             text,            -- sha256; el plano se muestra una vez
  fecha_ultimo_vinculo   timestamptz,
  ultima_conexion        timestamptz,     -- heartbeat
  version_app            text,            -- F1 art. 17 c)
  version_os             text,            -- F1 art. 20 c) hay que poder demostrarlo
  version_configuracion  int not null default 1,
  zona_horaria           text not null default 'America/Santiago',
  desplazamiento_detectado_seg  int not null default 0,  -- BP, ver H-06
  ultimo_desplazamiento  interval,
  creado_en              timestamptz not null default now()
);
```

> `desplazamiento_detectado_seg` es de **buena práctica**, no legal. Existe
> porque un reloj desviado es un problema probatorio y porque la entidad
> certificadora va a mirar el reloj. Va con etiqueta de BP explícita en el código.

## 4.3 La tabla central: `marcaciones`

El proyecto actual tiene `asistencia` y `marcajes`. `marcajes` es la que registra
el evento del reloj. Se rediseña.

```sql
create table marcaciones (
  id                      bigint generated always as identity primary key,

  -- ── tenant y relación ──────────────────────────────────────
  empresa_id              int  not null references empresa(id),
  trabajador_code         text not null references trabajadores(code),
  dispositivo_id          uuid not null references dispositivos(id),
  sucursal_id             uuid not null references sucursales(id),

  -- ── evento ──────────────────────────────────────────────────
  tipo_marcacion          text not null
    check (tipo_marcacion in (
      'entrada','salida',
      'colacion_entrada','colacion_salida',
      'jornada_pasiva_entrada','jornada_pasiva_salida',
      'otra')),
  -- F1 art. 35: también son marcaciones las de descansos y otras actividades.
  -- F1 art. 27 b.9) columna "Otras marcaciones".

  -- ── tiempo ──────────────────────────────────────────────────
  -- F1 art. 11: la marca de tiempo es la del momento de la marcación.
  -- Se guardan las dos porque offline hay una hora del dispositivo y otra del
  -- servidor, y la diferencia ES la información.
  marca_de_tiempo         timestamptz not null,   -- del dispositivo, sellada
  hora_servidor           timestamptz not null default now(),
  zona_horaria            text not null default 'America/Santiago',
  -- Verificación de coherencia horaria (BP, pero indispensable en la práctica)
  desfase_segundos        int not null default 0,

  -- ── origen y trazabilidad ───────────────────────────────────
  origen                  text not null default 'dispositivo'
    check (origen in ('dispositivo','web','importado','automatico')),
  -- F1 art. 40 d) y 36 d): el origen distingue lo automático de lo manual.
  secuencia_dispositivo   bigint,                 -- BP
  request_id              uuid not null,          -- idempotencia (BP)

  -- ── geolocalización, OPCIONAL (F1 art. 6 e), 13.1 f), 53) ──
  geopunto                geography(point, 4326), -- null en la versión 1
  radio_error_m           numeric,

  -- ── integridad ──────────────────────────────────────────────
  -- F1 art. 8: obligatorio. SHA-2. Este es EL campo de la resolución.
  checksum                text not null,
  -- BP: encadenado, para que borrar una fila del medio rompa la cadena.
  hash_anterior           text,

  -- ── estado del registro ──────────────────────────────────────
  estado                  text not null default 'vigente'
    check (estado in ('vigente','modificado','anulado')),
  -- F1 art. 58 e): alterar la información es infracción.

  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now()
);
```

### Índices que la resolución obliga a que sean rápidos

```sql
-- F1 art. 22.1 y 25.1 d): el trabajador y el inspector consultan 5 años.
create index marcaciones_trabajador_fecha_idx
  on marcaciones (empresa_id, trabajador_code, marca_de_tiempo desc);

-- F1 art. 8: verificación pública por hash.
create unique index marcaciones_checksum_idx on marcaciones (checksum);

-- F1 art. 25.1 j): buscar marcaciones por hash.
create index marcaciones_hash_idx on marcaciones (checksum);

-- F1 art. 9: sincronización del dispositivo.
create index marcaciones_dispositivo_seq_idx
  on marcaciones (dispositivo_id, request_id);

-- F1 art. 27 e): reporte diario por empresa y fecha.
create index marcaciones_empresa_dia_idx
  on marcaciones (empresa_id, marca_de_tiempo);
```

> `checksum` es **único**. Eso obliga a que el hash incluya lo que lo hace único
> —`request_id` del dispositivo— y por eso la sincronización de un mismo evento
> dos veces no puede insertar dos filas: la segunda choca con el índice. Es la
> idempotencia resuelta por la base, no por la aplicación. Es el mismo criterio
> que se usó en la migración 028 para que la auditoría no dependa de que alguien
> se acuerde de llamarla.

## 4.4 Cómo se calcula el checksum

F1 art. 8 es específico: función **nativa**, SHA-2 recomendado, nada de hash
"a mano" ni concatenación sin función.

```sql
create or replace function calcular_checksum_marcacion(
  p_empresa_id     int,
  p_trabajador    text,
  p_tipo          text,
  p_dispositivo   uuid,
  p_marca_tiempo  timestamptz,
  p_request_id    uuid
) returns text
language sql
immutable
as $$
  select encode(
    digest(
      p_empresa_id::text        || '|' ||
      p_trabajador              || '|' ||
      p_tipo                    || '|' ||
      p_dispositivo::text       || '|' ||
      to_char(p_marca_tiempo at time zone 'America/Santiago',
              'YYYY-MM-DD HH24:MI:SS') || '|' ||
      p_request_id::text,
      'sha256'
    ),
    'hex'
  );
$$;
```

> `digest()` es de **pgcrypto**. En el entorno de pruebas con PGlite hay que
> habilitar la extensión; en Supabase viene disponible. Si la entidad
> certificadora objetara que la función vive en el motor, la alternativa es
> calcularlo en el backend con `crypto` de Node y que el trigger solo verifique
> que el valor enviado coincida con el recalculado. **Es una decisión que se
> puedeymn cambiar**, y por eso el cálculo se encapsula en una función y no se
> escribe en línea en 8 lugares.

### Hash encadenado (buena práctica)

```sql
create or replace function encadenar_marcacion() returns trigger
language plpgsql as $$
declare
  v_previo text;
begin
  select checksum into v_previo
    from marcaciones
   where empresa_id = new.empresa_id
   order by id desc
   limit 1;

  new.hash_anterior := v_previo;
  -- El checksum sigue siendo el del evento (F1 art. 8), la cadena es aparte.
  return new;
end $$;
```

**Por qué aparte y no dentro del checksum:** si el `previous_hash` entrara en el
`checksum` que se muestra en el comprobante, un trabajador vería una cadena de
cifras de 64 caracteres en cada correo. El comprobante tiene que mostrar el
hash del evento (F1 art. 13.1 g)); la cadena vive en otra columna, que es la que
un inspector pide para demostrar que no se borró nada del medio.

## 4.5 Tabla de auditoría de marcaciones

Es la que más se parece a la que ya existe (`asistencia_auditoria`, migración
028) y la que hay que extender. F1 art. 41 a) exige que **toda alteración sea
visible en pantalla**; F1 art. 40 exige el procedimiento de 48 horas.

```sql
create table marcaciones_auditoria (
  id                  bigint generated always as identity primary key,
  marcacion_id        bigint not null,
  empresa_id          int not null,
  -- F1 art. 40 b): fecha y hora exacta de la marca ORIGINAL y de la nueva
  marca_original      timestamptz not null,
  marca_nueva         timestamptz not null,
  tipo_marcacion      text not null,
  trabajador_code     text not null,

  -- F1 art. 40 b) "una breve explicación del cambio, por ejemplo, elimina atraso"
  motivo              text not null,

  -- F1 art. 40 c) a f): el ciclo de 48 horas
  estado              text not null default 'enviado_notificado'
    check (estado in ('enviado_notificado','opuesto','consolidado','rechazado')),
  notificado_at       timestamptz not null default now(),
  expiracion_oposicion timestamptz not null,  -- notificado_at + 48 horas
  opuesto_at           timestamptz,
  consolidado_at       timestamptz,

  -- Quién lo hizo
  usuario_id          uuid references perfiles(id),
  usuario_nombre      text,
  -- F1 art. 41 c): nada puede corregirse pasado el día hábil siguiente
  dentro_de_plazo     boolean not null,

  created_at          timestamptz not null default now()
);
```

### La parte que casi nadie implementa: el trigger que **rechaza**

```sql
create or replace function marcaciones_solo_via_rpc() returns trigger
language plpgsql as $$
begin
  -- F1 art. 48 c): los datos solo pueden provenir de un sistema autorizado.
  -- F1 art. 58 e): alterar la información del sistema es infracción.
  raise exception 'MODIFICACION_DIRECTA_NO_PERMITIDA: las marcaciones solo se '
    || 'alteran por registrar_marcacion_corregida(), que deja rastro y notifica '
    || 'al trabajador. Ver Resolución Exenta 38/2024 arts. 39, 40 y 41.'
    using errcode = 'raise_exception';
end $$;

create trigger trg_marcaciones_no_update
  before update or delete on marcaciones
  for each row execute function marcaciones_solo_via_rpc();
```

Este trigger es la pieza que sostiene el resto:

- Un `UPDATE` directo desde el panel, desde PostgREST o desde un script de
  alguien revienta con un error que **dice la norma**.
- La única vía es la función `security definer`, que escribe la auditoría, manda
  el correo, y calcula `dentro_de_plazo`.
- El mismo patrón ya está en `asistencia_auditoria` desde la migración 028, y
  funcionó: nadie ha podido saltárselo.

> **Nota de diseño importante:** con un trigger que rechaza todo `UPDATE` y todo
> `DELETE`, incluso la función de corrección tiene que pasar por el camino
> permitido. Se hace con un token de sesión: la función acepta el cambio solo si
> existe una fila en `marcaciones_auditoria` en estado `'enviado_notificado'` o
> `'consolidado'` para esa marcación, dentro de plazo. Sin fila de auditoría, no
> hay cambio. La auditoría es la llave, no un registro accesorio.

## 4.6 Lo que hay que cambiar en el modelo actual

| Tabla actual | Problema | Acción |
|---|---|---|
| `asistencia` | Es la planilla (día, planificado, real). No tiene checksum. | Queda como planilla. La verdad es `marcaciones`. |
| `marcajes` | Es el evento del reloj pero sin checksum, sin `request_id`, sin cadena. | **Migrar a `marcaciones`** o agregar las columnas. Decidir en Fase 2. |
| `trabajadores.especialidad_clave` | Correcto (migración 031). | Mantener. |
| `relojes` | No tiene `sucursal_id`, ni estado `bloqueado`/`retirado`, ni `version_os`. | Migrar a `dispositivos` o agregar columnas. |
| `empresa` | Es el tenant. Se llama distinto. | Mantener el nombre. |
| `centros_costo` | Es el lugar. Se llama distinto. | Mantener. |
| — | No existe `sucursales` con los campos de dirección que pide el art. 13.2 c). | Crear. |
| — | No existe registro de incidentes técnicos (art. 27 f). | Crear. |
| — | No existe `plataformas`. | Crear. |
| — | No hay tabla de **correos enviados** (para probar C-01 y auditar). | Crear. |

---

# 5. Flujo completo de una marcación

## 5.1 Camino normal (con internet)

```
Trabajador                Reloj (Kiosk)          API reloj            PostgreSQL
    │                          │                     │                    │
    │                          │ 1. lee QR           │                    │
    │  acerca el QR ──────────►│                     │                    │
    │                          │ 2. token opaco      │                    │
    │                          │    "7f3a…c81e"      │                    │
    │                          │                     │                    │
    │                          │ 3. POST /marcaciones                    │
    │                          │────────────────────►│                    │
    │                          │                     │ 4. auth token      │
    │                          │                     │    dispositivo     │
    │                          │                     │────►               │
    │                          │                     │ 5. resolver token  │
    │                          │                     │    → trabajador    │
    │                          │                     │    ¿activo? ¿tarjeta│
    │                          │                     │    no bloqueada?    │
    │                          │                     │────►               │
    │                          │                     │ 6. INSERT marcaciones
    │                          │                     │    · checksum  ← TRIGGER
    │                          │                     │    · hash_anterior ← TRIGGER
    │                          │                     │    · valida tarjeta ─ TRIGGER
    │                          │◄──── 201 Created ───│                    │
    │                          │    {checksum, tipo, │                    │
    │                          │     hora_servidor}  │                    │
    │                          │                     │                    │
    │                          │ 7. muestra:         │                    │
    │                          │    "JUAN PÉREZ      │                    │
    │                          │     ENTRADA         │                    │
    │                          │     08:42:37"       │                    │
    │◄── vuelve a la pantalla ─│                     │                    │
    │    de escaneo en 3 s     │                     │                    │
    │                          │                     │                    │
    │                          │                     │ 9. cola envía       │
    │                          │                     │    comprobante ────►│ SMTP  (F1 art. 12)
    │                          │                     │                    │
    │                          │                     │ 10. a los 30 min,   │
    │                          │                     │     alerta si falta │
    │                          │                     │    (F1 art. 45.1)   │
```

**Punto clave del paso 6:** la validación de que el trabajador esté habilitado y
su tarjeta no esté bloqueada ocurre en un **trigger** de la base, no en la API. Si
está en la API, el siguiente que escriba código se la salta. Es el mismo criterio
de la migración 028.

**Punto clave del paso 8 (no dibujado):** el hash es verificable por cualquiera
en `GET /marcaciones/verificar?checksum=…`. No requiere sesión. Esa es la
función del art. 8.

## 5.2 Camino sin conexión (F1 art. 10)

Esto es lo que pediste explícitamente, y es donde se concentra el riesgo.

```
   1. El reloj no puede llamar a /heartbeat. Calcula:
        desviación = |hora_reloj − ultima_hora_servidor|
      Si supera el umbral (configurable, por defecto 5 s):
        → NO marca. Muestra "SIN SEÑAL. LA HORA NO ES FIABLE."
        F1 art. 10 es una excepción justificada, no un modo de operar.

   2. Con desviación aceptable, marca igual y guarda en cola local:

        cola[{
          request_id:        uuid v4 generado en el dispositivo,
          token:             "7f3a…c81e",
          tipo:              'entrada',
          marca_de_tiempo:   ISO-8601 con offset -04:00,
          reloj_desfasado_s: 3,
          intentos:          0
        }]

      La cola vive en IndexedDB, no en localStorage: localStorage es
      sincrónica y se corrompe con facilidad al corte abrupto de luz, que es
      exactamente el escenario en que se pierde.

   3. Al recuperar señal, envía en lotes de hasta 100:

        POST /api/v1/dispositivos/sincronizacion
        { dispositivo_id, eventos: [ … ] }

   4. La base procesa uno por uno y responde por CADA evento:

        INSERT marcaciones (request_id, …)
          ON CONFLICT (request_id) DO NOTHING
          RETURNING checksum, estado

        Si el mismo `request_id` ya existe → 200 con el checksum original.
        Es idempotencia por índice único, no por lógica de aplicación.

   5. El reloj borra de la cola SOLO los `request_id` que el servidor
      confirmó con su checksum. Un evento que vuelve con error de validación
      (por ejemplo, el trabajador fue desvinculado en el medio) NO se borra:
      pasa a una cola de "rechazados" y se muestra en el panel, porque si se
      perdiera no habría forma de saber que hubo una marcación.
```

**Lo que la resolución dice y no dice de esto.** F1 art. 10 permite capturar y
almacenar sin conexión y enviar después, automáticamente. Pero lo circunscribe
a "situaciones excepcionales... en casos particulares debidamente justificados".
Esto significa dos cosas concretas:

1. **No se puede vender el modo offline como característica comercial.** Es una
   excepción que se Documenta, con la justificación, en el informe de certificación.
2. **El informe de certificación tiene que explicar por qué existe.** Un reloj
   en una faena sin cobertura es el caso honesto. "porque se cayó el internet"
   sin más, no.

**El sello de tiempo en modo offline es un problema real y hay que resolverlo
explícitamente.** F1 art. 11 exige marca de tiempo; art. 8 exige hash. Si la
marcación se genera con la hora del dispositivo y el hash se calcula en el
servidor, la hora y el hash no son del mismo instante. Las opciones:

| Opción | Cómo | Ventaja | Problema |
|---|---|---|---|
| **A. Reloj firmado** | El dispositivo guarda un par de claves y firma cada evento con la hora declarada. El servidor verifica la firma. | La hora es demostrablemente del dispositivo y no alterada | Requiere gestionar claves en el reloj; un reloj barato no tiene TPM |
| **B. Sello de tiempo del dispositivo** | El reloj pide un token de tiempo firmado al servidor en cada ventana de conexión y lo usa en lote | Firma del servidor, sin claves en el reloj | Un token de 5 minutos permite falsear hasta 5 minutos |
| **C. Registrar la diferencia y aceptarla** | Se marca con la hora del reloj y se guarda `desfase_segundos`; la auditoría ve la diferencia | Simple | El dato es del dispositivo, y eso es lo que se quería evitar |

**Propuesta: B con respaldo de C.** Token de tiempo firmado válido 5 minutos,
renovado en cada heartbeat, y `desfase_segundos` siempre registrado. Si el
certificador exige A, se agrega A después. La decisión se toma con la entidad
certificadora, no antes.

---

# 6. Arquitectura del reloj Android TV Box

## 6.1 Las cuatro opciones

| | **A. Chrome kiosk** | **B. WebView en app** | **C. App Android nativa** | **D. PWA instalable** |
|---|---|---|---|---|
| Acceso a cámara |(getUserMedia) funciona | hereda del permiso | `CameraX`, control total | funciona, con permiso |
| Pantalla completa | sí, con `--kiosk` | sí | sí, immersive | sí |
| Aislamiento (salir de la app) | **fácil** de escapar | bueno | **el mejor** | medio |
| Actualización | automática al recargar | automática | **Play Store o MDM** | automática |
| Reinicio tras caída | manual, o con kiosk launcher | buono con `BOOT_COMPLETED` | bueno | bueno |
| Superficie de ataque | **el navegador completo** | WebView | la app | el navegador |
| Tamaño del APK | 0 | ~5 MB | ~8–15 MB | 0 |
| Complejidad de certificación | baja | media | **alta** | baja |
| F1 art. 20 c) versión ≤ 3 años | dépend du Chrome | del APK | del APK | du navegador |

## 6.2 Recomendación: **B. WebView en una app Android mínima**

**Por qué no A (Chrome puro):** es la opción más simple pero es la peor para la
certificación. El reloj corre con el navegador completo, con barra de direcciones
a un toque de distancia, con el historial y con el motor de búsqueda. Un
inspector que abra el reloj ve un navegador, no un sistema de asistencia. Y desde
el punto de vista de F1 art. 56 —no vulnerar derechos fundamentales, no exceder
la intensidad del control necesario—, un navegador abierto al que el trabajador
puede salir es difícil de defender.

**Por qué no D (PWA):** técnicamente es A con Genomic improvements, pero
conserva el mismo problema: el contenido se sirve desde un navegador, no desde
un contexto controlado. Además la instalación de PWA depende de la versión de
Android, y en Android TV Box hay variability. Sirve para el **portal web**, no
para el reloj.

**Por qué no C (nativa pura):** Kotlin + CameraX es la opción técnicamente
superior —mejor control de cámara, de pantalla y de energía— pero el costo de
certificación sube: hay que entregar el APK firmado, explicar el proceso de
build, y sostener un ciclo de publicación. **Es el camino correcto si la
certificación se consigue y el negocio crece; no es el camino para el primer
intento.**

**Por qué sí B:** una app Android mínima, de una sola actividad, sin barra de
estado ni de navegación, que abre la WebView en kiosk y no tiene ningún otro
propósito:

```
MainActivity
  ├─ WebView a pantalla completa, sin barras
  ├─ no carga URLs externas (allowlist de un solo origen)
  ├─ sin permisos de red distintos de HTTPS al dominio propio
  ├─ sin almacenamiento persistente de sesión
  ├─ se reinicia sola si el proceso de la WebView muere
  ├─ arranca con BOOT_COMPLETED
  └─ muestra un código de aparecer si falla la conexión
```

El APK es de unos pocos megabytes, se firma una vez y no cambia nunca. La
lógica de negocio —toda— vive en el servidor. La app no valida nada.

**Ventaja decisive:** el hash, la validación de la tarjeta, el cálculo de
atrasos y la auditoría viven en PostgreSQL. Un APK chico que no cambia es un
documento de arquitectura estable para la entidad certificadora, y después de
la certificación solo hay que auditar el **código del servidor**, que es donde de
verdad está la lógica.

## 6.3 Hardware económico

```
┌────────────────────────────────────────────────────────────────┐
│                    ARMADA DEL RELOJ (por reloj)               │
│                                                                │
│  ┌──────────────┐   ┌─────────────┐   ┌──────────────────┐    │
│  │ Pantalla     │   │ Android     │   │ Fuente 5V 2A     │    │
│  │ HDMI 10–15"  ├──►│ TV Box      ├──►│ (conmutable)     │    │
│  │ 1920x1080    │   │ 2 GB RAM    │   └──────────────────┘    │
│  └──────────────┘   │ Ethernet    │                          │
│                     │ + Wi-Fi     │   ┌──────────────────┐    │
│  ┌──────────────┐   │             │   │ UPS / batería    │    │
│  │ Cámara USB   ├──►│  USB host   │   │ 30 min autonomy  │    │
│  │ 1080p, foco  │   │             │   │ (opcional pero   │    │
│  │ fijo, IR     │   └──────┬──────┘   │  recomendado)    │    │
│  └──────────────┘          │          └──────────────────┘    │
│                     ┌──────┴──────┐                            │
│                     │ Lector QR   │  (opcional: mejor que      │
│                     │ USB acting  │   cámara para velocidad)  │
│                     │ como teclado│                            │
│                     └─────────────┘                            │
│                                                                │
│  ALIMENTACIÓN: el reloj se apaga si se corta la luz.          │
│  Con UPS sigue marcando 30 min más, que es lo que salva la    │
│  evidencia cuando hay un corte en la faena.                   │
└────────────────────────────────────────────────────────────────┘

Red:  cableado Ethernet siempre que se pueda. El Wi-Fi de un
       Android TV Box barato es la fuente más común de pérdida de señal,
       y una marcación perdida es una marcación que para el empleador no existe.
```

**El lector QR USB como teclado es la decisión de hardware más rentable.** Actúa
como teclado y emite el texto seguido de Enter. Además del touchscreen, que es
lo que permite F1 art. 33 (inclusión) y lo que el usuario pidió.

## 6.4 La pantalla

```
┌──────────────────────────────────────────────────────────────┐
│  URBANIZA CONSTRUCTORA S.A.          OBRA: EDIFICIO CENTRAL  │  ← F1 art. 17 c)
│                                                              │
│                  CONTROL DE ASISTENCIA                      │
│                                                              │
│                      08:42:31                               │  ← 64 px
│              LUNES 28 DE SEPTIEMBRE 2026                     │
│                                                              │
│                    ┌───────────────┐                         │
│                    │  [ cámara ]   │                         │
│                    └───────────────┘                         │
│                                                              │
│                   « ACERQUE SU QR »                          │  ← 36 px
│                                                              │
│  ● CONECTADO                                        RECEPCIÓN  │
└──────────────────────────────────────────────────────────────┘
```

Tras el escaneo:

```
                      08:42:31
              LUNES 28 DE SEPTIEMBRE 2026

                   ✓ MARCA REGISTRADA
                      JUAN PÉREZ
                    ENTRADA · 08:42:37
                 7f3a2c81…e4d5                ← el hash, comprobable
```

Vuelve al estado inicial a los 3 segundos. El hash visible en la pantalla es una
decisión de diseño, no un requisito: **le da al trabajador el comprobante en el
momento**, y le quita la excusa a quien diga que no sabía. Cuesta tres segundos
de pantalla.

Cuando la conexión está caída, la banda inferior cambia a:
`● SIN SEÑAL — MARCANDO SIN CONEXIÓN` en ámbar. Nunca en rojo: en rojo parece
error, y el trabajador no puede hacer nada con un error.

## 6.5 El problema de ciclo de vida (F1 art. 20 c))

Este es el punto donde el diseño económico choca con la norma, y hay que decirlo
antes de comprar hardware.

> F1 art. 20 c): *"Las versiones de los productos que conforman la aplicación
> (software de base de datos, sistemas operativos, dispositivos de marcaje,
> etc.), no deberán tener una antigüedad superior a 3 años, con una vigencia no
> inferior a 5 años."*

Un Android TV Box de 2019 con Android 9 y un chip que no recibe más parches ya
está fuera del plazo. Y su **navegador/WebView** también caduca: si la
certificación se apoyó en una versión de WebView que después deja de recibir
actualizaciones, el cumplimiento de art. 20 c) se cae solo.

**Tres salidas, y hay que elegir una antes de la certificación:**

| Opción | Cómo | Coste | Riesgo |
|---|---|---|---|
| **1. Tablet de rango medio con 3 años de actualizaciones garantizadas** | Google/goog Play commitments de 3 años para Android Enterprise | Más alto | Bajo |
| **2. Un dispositivo por reloj cada 3 años** | Rotación programada, financiada en el contrato | CAPEX recurrente | Bajo, y es un costo conocido |
| **3. Justificar ante la entidad certificadora** | El reloj es un **periférico**, y la parte con 5 años de vigencia es el sistema | Cero | **Alto**: no está escrito en la norma |

**Propuesta: opción 2, con un leasing de 36 meses.** Es defendible, es un costo
conocido y se puede mostrar en la declaración jurada como política de la
empresa. La opción 3 se presenta en la consulta inicial a la entidad certificadora
—es una pregunta de una hora— pero no se cuenta con ella.

> **Este es un costo que no estaba en el presupuesto original.** Un reloj
> Android TV Box de 40 dólares con rotación a 3 años, y el portal web aparte, es
> el costo completo. Que la plataforma venda barato un reloj de 40 dólares y cobre
> una suscripción con la reposición incluida es un modelo de negocio defendible:
> el costo del cumplimiento va incluido.

## 6.6 El QR: análisis de las alternativas

| Alternativa | QR duplicado | QR falsificado | Marcación de terceros | Replay | Foto del QR | Veredicto |
|---|---|---|---|---|---|---|
| **Estático con código del trabajador** (`0001`) | no | trivial: se imprime el mismo | trivial | posible | trivial | **Descartada** |
| **Estático con RUT** | no | trivial | trivial | posible | trivial | Descartada, además expone dato personal |
| **Estático con token opaco de 128 bits** | posible (el.token es fijo) | muy difícil | **posible: el token se presta** | posible si hay ventana | posible | **Base, con mitigaciones** |
| **Estático con token opaco + firma del servidor** | posible | difícil | posible | posible | posible | Igual que el anterior; la firma no aporta en un QR fijo |
| **Dinámico rotativo (TOTP 30 s)** | improbable | difícil | posible mientras sea válido | **imposible pasado 30 s** | inútil | La mejor, pero **requiere pantalla o batería** |
| **QR + PIN** | posible | difícil | posible: hay que saber el PIN | posible | posible | **La practical** |
| **QR + biometría** | difícil | difícil | difícil | difícil | difícil | Exige consentimiento escrito (art. 57) y convierte el dato en biométrico |

**Respuesta: QR estático con token opaco de 128 bits + PIN**, que es lo que pide
F1 art. 7 g) — dos alternativas, al menos una sin biometría y sin datos
personales. El PIN es exactamente eso: no es un dato personal en el sentido del
art. 10 CT, es una clave que el trabajador elige, y F1 art. 7 f) obliga a
permitirle cambiarla cuando quiera.

**Por qué no QR rotativo:** funciona mejor, pero obliga a que cada trabajador
lleve un teléfono con la app o una tarjeta con pantalla y batería. En una faena,
eso significa duplicar y perder tarjetas. Es mejor como **opción para clientes
que lo pidan** (una pantalla propia en el teléfono del trabajador), no como base.

**Las seis mitigaciones del token estático, y cómo implementa cada una:**

| Amenaza | Mitigación | Dónde se implementa |
|---|---|---|
| **Marcación de terceros** (A marca con el QR de B) | 1. PIN. 2. Detección: el mismo token marcado en **dos dispositivos distintos en menos de 90 s** → los dos registros quedan marcados para revisión. 3. La marcación de A tiene que ser la que el empleado espera | Panel de incidencias + query sobre `marcaciones` |
| **QR duplicado** | El token es único por trabajador con restricción `unique`. Un segundo QR con el mismo token no se puede emitir | `trabajadores.token_qr` con índice único |
| **QR falsificado** | 128 bits de entropía: adivinar es 2¹²⁸ intentos. No es seguridad por secreto, es que no hay atajo | Generación con `gen_random_bytes(16)` |
| **Reutilización del mismo QR** | Ventana antirrebote: 90 s por (trabajador, dispositivo, tipo). F1 art. 36 c) ya obliga a que el sistema **elimine automáticamente las marcas repetidas y conserve la primera**, así que la ventana no es invención nuestra | Trigger en la base |
| **Captura de pantalla del QR** | El token no se puede reusar fuera de la obra por el PIN y por la ventana. Además, si la foto se usa en otro reloj de la misma empresa, la detección de dos dispositivos lo marca | Igual que arriba |
| **Petición directa a la API** | El token no vale nada sin el `Authorization` del dispositivo, que es un secreto por reloj. Un atacante necesita el token **y** el secreto de un reloj. Y la respuesta de la API nunca revela si un token existe (mismo tiempo y cuerpo para "no existe" y "error") | Función de reloj, sin usuario |

**Lo que este diseño NO resuelve, y hay que decirlo:**

- **Un supervisor puede pedirle a alguien que marque por él.** Ningún sistema de
  QR lo impide sin biometría. La norma tampoco lo exige: F1 art. 36 a) exige que
  la marcación sea un acto voluntario, y la fiscalización del fraude es
  pesquis de la DT, no del sistema.
- **Un trabajador puede transferir su tarjeta a otro** durante un turno. Es
  detectado por el análisis de dos dispositivos, pero no bloqueado.
- **La marcación simultánea en dos faenas** se detecta y se marca; no se
  bloquea, porque F1 art. 53 c) prohíbe bloquear por ubicación, y por la misma
  razón no se bloquea por coherencia de dispositivo.

---

**Siguiente documento:** [`03-riesgos.md`](03-riesgos.md)
