# Conciliar el reloj con la planilla, avisos de ingreso y bitácora

Migraciones **023** y **024**. Se aplican en orden, en el SQL Editor de
Supabase.

---

## 1. Conciliación: el reloj contra la planilla

**Supervisores → Asistencia diaria → Conciliar el reloj con la planilla.**

Son dos registros distintos de lo mismo, y se contradicen:

- `asistencia` es la **planilla**: quién está presente y desde qué hora. La
  edita una persona.
- `marcajes` es lo que registró el **reloj de la obra**.

El caso que más pasa es uno: **el reloj tiene la marcación y la planilla
no**. Ese trabajador fichó y en el sistema nadie lo marqué. Ese sale
arriba del todo, con la hora del reloj al lado.

## Las cuatro situaciones

| Situación | Qué significa | Qué hacer |
|---|---|---|
| **Falta marcar en la planilla** | El reloj lo tiene, la planilla no | Marcar entrada, con la hora del reloj |
| **Presente en la planilla, sin marcaje del reloj** | Al revés: quedó presente sin que el reloj registrara nada | Revisar si corresponde |
| **La hora no coincide** | Está en los dos, a horas distintas | Verificar cuál es la buena |
| **Coincide** | Los dos dicen presente y la hora es razonable | Nada |
| **Sin registro en ninguno** | No fichó y no está en la planilla | Marcar y avisar |

**La tolerancia son 10 minutos.** Es lo habitual entre un reloj y una
anotación hecha por una persona: cinco minutos de diferencia es redondeo,
no una discrepancia. Se puede cambiar en el código, no en pantalla.

## Los dos botones, y por qué son distintos

- **Marcar entrada** — lleva la hora del reloj a la planilla. **No deja
  aviso**, porque la fuente es el reloj y no la palabra de nadie.
- **Marcar y avisar** — sí deja aviso, y ese aviso lo tiene que confirmar
  Administración.

En la lista diaria, "Marcar y avisar" aparece en los que **no tienen
ningún marcaje**. En la conciliación aparece en las discrepancias, porque
cualquiera de ellas se puede tener que justificar.

---

## 2. Avisos de ingreso: marcar a quien no fichó

### El problema que resuelve

Un supervisor marca a un trabajador que no fichó. Está bien hecho, pero la
planilla queda diciendo "presente" sin que quede escrito **quién decidió
eso ni por qué**. Después nadie puede responder por una marcación que se
hizo de palabra.

### El recorrido

1. El supervisor marca y escribe la indicación. Queda **enviado**.
2. Administración (o RRHH) lo ve en una bandeja y lo **confirma**. Queda
   registrado quién y cuándo, más lo que respondió.
3. El supervisor ve la confirmación en su pantalla.

**Por qué el paso 2 no es opcional:** si no, "lo confirmó" y "nadie lo leyó"
son la misma cosa, y un aviso sin confirmar es un aviso que se perdió.

**Quién puede confirmar:** cualquiera con `tarja.aprobar_cambio`, que no es
el mismo permiso que el de marcar. La base lo impide: un supervisor no
puede darse por buena su propia marcación. Eso no es un detalle de la
pantalla, está en la política.

### Dónde está

- El supervisor: **Asistencia diaria → Mis avisos de ingreso**.
- Administración: **Aprobar solicitudes → Avisos de ingreso por confirmar**.

### Si no hay nadie con el permiso

Si al confirmar aparece *"La base no dejó confirmar"*, casi siempre es
que tu cuenta no tiene `tarja.aprobar_cambio`. Es un rol aparte del
Administración completo.

---

## 3. Bitácora de acceso al sistema

**Aprobar solicitudes → Bitácora de acceso al sistema.**

Quién abrió la aplicación, cuándo y cuánto tiempo estuvo. Los últimos
250 accesos, de todos los usuarios.

**Esto no es la asistencia del trabajador.** Es el uso del sistema por
parte de quien lo opera. Se mezcla con la asistencia y después nadie sabe
si un "09:12" fue que fichó o que un supervisor abrió el sistema a mirar.

### Qué registra

| Campo | Para qué |
|---|---|
| `evento` | `entrada`, `salida` (cerró con el botón) o `cierre` |
| `sesion_id` | Agrupa los registros de una misma sesión |
| `duracion_segundos` | Solo en las salidas |
| `dispositivo` | Navegador y sistema, del user-agent |

### Lo que NO registra, y por qué

**La dirección IP.** El navegador no la puede leer, y obtenerla obligaría
a pasar por una Edge Function. Es además un dato personal más, y para lo
que se necesita —saber quién estuvo y cuánto— no aporta nada. Si alguna
vez hace falta, se agrega junto con la función que sí la puede leer, en
vez de meterla en la base sin que nadie la pidiera.

### Dos cosas que confunden

**Un F5 no es una sesión nueva.** El identificador de sesión vive en
`sessionStorage`, que sobrevive a una recarga. Si no se comprobara,
quedaría una "entrada" por cada recarga, y un supervisor que refresca
mientras trabaja tendría diez entradas y ni una salida.

**"Sesión cortada"** es una que se terminó sin pasar por "Cerrar sesión":
pestaña cerrada, red caída, token vencido. El navegador no avisa en esos
casos, así que **no hay hora de salida registrada**. No es lo mismo que
salir y cerrar el navegador, y la diferencia importa cuando se revisa.

La bitácora no se edita ni se borra, ni siquiera por un administrador. Un
registro de "quién estuvo en el sistema" que se puede reescribir no sirve
para nada.

---

## Diagnóstico

```sql
select * from diagnostico_registro_y_avisos();
```

Devuelve `accesos_ok`, `avisos_ok` y `politicas_ok`. Si la migración no
está aplicada, la app lo dice en pantalla con el nombre del archivo, en
las tres vistas donde se usan.

---

## Lo que se verificó

- 27 pruebas de la 023 con un rol que **no** es superusuario. RLS filtra
  en silencio: un `UPDATE` prohibido devuelve 0 filas y **ningún error**,
  así que las aserciones son sobre el conteo, no sobre si hubo excepción.
- El circuito completo del aviso: el supervisor marca y deja la
  indicación, Administración confirma, el supervisor ve la confirmación.
- La bitácora: una entrada por sesión, con F5 no se duplica, la salida
  lleva la duración, y cerrar sesión limpia el identificador.
