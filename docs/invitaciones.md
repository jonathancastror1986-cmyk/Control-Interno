# Invitar usuarios (migración 019)

## Qué resuelve

Antes, para dar de alta a alguien había que ir al panel de Supabase
(Authentication → Users → Invite user). Ese envío produce un enlace que
vuelve a la **Site URL** configurada en el proyecto, que suele ser
`localhost`. La persona recibe algo así:

```
localhost/#access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

y al abrirlo ve *ERR_CONNECTION_REFUSED*, como en la captura. Peor
todavía, la persona invitada no tiene cómo completar sus datos: hay que
buscarla a mano en Soporte → Usuarios para poder asignarle un rol.

Ahora el alta se decide **dentro de la app** y la persona solo pone su
contraseña.

---

## Puesta en marcha

### 1. La migración

En el **SQL Editor** de Supabase, ejecuta `migrations/019_invitaciones_perfiles.sql`.

Es re-ejecutable: aplicarla dos veces no rompe nada.

### 2. La dirección de la app (importante)

En **Authentication → URL Configuration**:

| Campo | Valor |
|---|---|
| Site URL | la dirección real de tu app, p. ej. `https://app.miempresa.cl` |
| Redirect URLs | esa misma dirección + `/pages/registro.html` |

Mientras el Site URL sea `localhost`, cualquier enlace que Supabase
mande va a apuntar a tu computador y no a la app.

### 3. El envío por correo (opcional)

Para que Soporte mande la invitación con un clic hace falta una Edge
Function. Con la CLI de Supabase:

```bash
supabase functions deploy invitar
```

La función **no necesita configuración**: usa las variables que Supabase
inyecta solas (`SUPABASE_URL`, `SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY`).

Sobre el SMTP: Supabase trae un servicio de correo para pruebas, con un
límite de pocos correos por hora. Para producción conviene configurar uno
propio en **Authentication → Email → SMTP**.

**Si no quieres usar la Edge Function, no pasa nada.** El botón "Ver
enlace" genera el enlace y lo copias a mano; la persona lo abre, se
registra y entra con sus permisos ya asignados. El correo es una
comodidad, no un requisito.

---

## Cómo se usa

1. **Soporte → Invitar usuario** (submenú de Soporte).
2. Escribes el correo, marcas los permisos, y opcionalmente la ficha del
   trabajador y la empresa.
3. Le das a **Generar invitación**. Te aparece el enlace, ya con el
   correo y el nombre escritos.
4. Se lo mandas por el medio que quieras, o le das a
   **✉ Enviar invitación por correo** si desplegaste la función.
5. La persona abre el enlace, pone su contraseña y entra.

No hay que activar nada a mano después: al registrarse, un trigger de la
base le asigna los roles, la empresa y la ficha que elegiste.

## Cualquier trabajador puede tener su cuenta

El selector de ficha offeringeba **solo supervisores**. Ahora ofrece
todos los trabajadores, marcando a los supervisores con "(supervisor)".

- Con ficha de **supervisor**: en Supervisores solo ve su propio equipo.
- Con ficha de **cualquier otro**: la app puede mostrarle su propia
  asistencia y su ficha.

## La persona completa sus datos

Al entrar por primera vez ve una banda naranja arriba que dice qué le
falta, y un enlace a **Soporte → Mis datos** para corregir su nombre y su
teléfono. El teléfono se anota también en su ficha de trabajador.

Puede hacerlo ella misma: no necesita pedirle permiso a nadie. Lo que
**no** puede hacer es cambiarse sus propios permisos; eso sigue siendo
decisión de un administrador.

---

## Por qué hay una función en vez de un botón

Enviar la invitación exige la **service_role** de Supabase. Si esa clave
estuviera en el navegador, cualquiera que abriera la app podría hacer
cualquier cosa con la base de datos: leer todos los datos, borrar
tablas, darse permisos de administrador.

Por eso la llamada pasa por la Edge Function, que corre en el servidor de
Supabase y sí puede usar esa clave. El navegador solo le dice a la función
qué correo enviar; la función comprueba que quien llama sea un usuario
activo con el permiso `sistema.usuarios` antes de enviar nada.

---

## Si algo sale mal

| Síntoma | Qué revisar |
|---|---|
| "Falta la migración 019" | No se ejecutó el SQL. |
| "La función de envío no está desplegada" | `supabase functions deploy invitar`. |
| "Supabase no pudo enviar el correo" | Authentication → Email, falta configurar el SMTP. |
| "Ese correo ya tiene una cuenta" | Ya existe un usuario con ese correo. Cámbale los permisos en Soporte → Usuarios. |
| "Esa invitación ya venció" | Pasa su fecha de vencimiento. Vuelve a generarla con "Volver a invitar". |
| La persona recibe un enlace a `localhost` | Authentication → URL Configuration → Site URL. |
| La persona no recibe correo | Carpeta de correo no deseado, y que el SMTP esté configurado. |
