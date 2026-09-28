// Recuperar la contraseña
# Cambiar la contraseña

## Por qué antes no funcionaba

Supabase manda el correo de recuperación con un enlace que vuelve a su
**Site URL**. Si ese ajuste sigue en `localhost` (es lo que viene por
defecto), la persona recibe algo así:

```
localhost:3000/#access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

y al abrirlo ve *ERR_CONNECTION_REFUSED*. Nunca alcanza la pantalla donde
se pone la contraseña nueva.

Con la app, el correo lo manda la Edge Function `recuperar`, que le pasa
a Supabase la dirección correcta (`redirectTo`). Al abrir el enlace, la
persona escribe su contraseña y **no pasa por ninguna otra página**: se
guarda y se le dice que ya puede entrar.

## Puesta en marcha

```bash
supabase functions deploy recuperar
```

No necesita configuración: usa las variables que Supabase inyecta
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

## Igual hay que arreglar el Site URL

Aunque la app ya no dependa de él, **cambia el ajuste igual** en
**Supabase → Authentication → URL Configuration → Site URL**, poniendo la
dirección real de la app. Cualquier otro correo que Supabase mande (por
ejemplo el de invitación, si alguien lo hace desde el panel) depende de
ese ajuste, y mientras diga `localhost` esos enlaces no abren.

Agrega también en **Redirect URLs** la dirección real +
`/pages/reset-password.html`.

## Cómo se usa

1. En la pantalla de inicio, **Olvidé mi contraseña**.
2. Se escribe el correo y se manda.
3. Llega un enlace. Se abre, se escribe la contraseña nueva dos veces y
   se guarda. Listo.

## Privacidad

La función `recuperar` no pide permiso de administrar usuarios: cualquiera
con una cuenta perdida tiene que poder recuperarla. Aun así, la
respuesta es **siempre la misma**, exista o no el correo. Decir "ese
correo no está registrado" serviría para averiguar qué correos hay
trabajando en la obra.

## Si el enlace no abre

| Síntoma | Qué revisar |
|---|---|
| El enlace abre en `localhost` | Site URL sin cambiar, y la función `recuperar` sin desplegar. |
| "El enlace ya no sirve" | Los enlaces se usan una sola vez y tienen fecha de vencimiento. Pide uno nuevo. |
| "No se envió" | Revisa la carpeta de correo no deseado. |
| "La función no está desplegada" | `supabase functions deploy recuperar`. |

## Por qué una Edge Function y no un botón

El correo de recuperación lo manda Supabase, y para decidir a qué
dirección vuelve el enlace hace falta la API de administración
(`auth.admin`), que exige la **service_role**. Esa clave no puede estar
en el navegador: quien la tuviera podría leer y modificar toda la base
de datos. En la función queda en el servidor, que es donde corresponde.
