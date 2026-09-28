# Desplegar las funciones del servidor (sin línea de comandos)

La app usa tres funciones que corren en el servidor de Supabase, no en el
navegador:

| Función | Para qué |
|---|---|
| `verificar-cuenta` | Verificar, crear y cambiar la clave de una cuenta sin mandar correo. |
| `invitar` | Mandar la invitación por correo con el enlace correcto. |
| `recuperar` | Mandar el correo de "olvidé mi contraseña". |

Si no están desplegadas, la app lo avisa en pantalla con el comando
exacto. Ese aviso aparece **al abrir la tarjeta**, antes de que pulses
nada.

## La forma más corta: desde el panel

No hace falta instalar nada ni abrir una terminal. Sirve igual para
Windows, Mac o Linux, y para cuando no quieres trastear con la consola.

1. Abre el panel de tu proyecto de Supabase.
2. En el menú de la izquierda, **Edge Functions**.
3. **Create Function** (o *Deploy a new function*).
4. Nombre: el de la tabla de arriba, por ejemplo `verificar-cuenta`.
5. Borra el contenido que aparezca y pega el archivo completo:

   ```
   supabase/functions/verificar-cuenta/index.ts
   ```

6. **Deploy**.

Repite para las otras dos.

> Al pegar en el panel, el editor puede convertir los acentos o las
> comillas. Si algo se ve raro, conviene pegar con `Ctrl+Shift+V` (pegar
> sin formato) y revisar que las tildes de "más", "está" y "función"
> sigan en su sitio.

## La forma con línea de comandos

Solo si ya tienes la CLI instalada. Si PowerShell responde
`supabase : El término 'supabase' no se reconoce`, es que no la tienes:
usa el método de arriba, o instálala con
[npx supabase](https://supabase.com/docs/guides/cli).

```bash
supabase login
supabase functions deploy verificar-cuenta
supabase functions deploy invitar
supabase functions deploy recuperar
```

`supabase login` es obligatorio la primera vez. Si lo saltas, la CLI
responde:

```
No API key found in request
```

que es exactamente lo que dice la segunda captura de la pantalla: no es
un problema del código, es que la CLI no tiene con qué autenticarse.

## Comprobar que quedaron arriba

Vuelve a la app y recarga con **Ctrl+F5**. Si el aviso rojo de "las
funciones todavía no están desplegadas" desapareció, quedaron.

También puedes mirarlo en **Edge Functions** del panel: la lista debe
mostrar las tres.

## Si una función falla al desplegar

| Síntoma | Qué revisar |
|---|---|
| `No API key found in request` | Falta `supabase login`. |
| `401` al invocarla desde la app | La sesión caducó: reingresa en la app. |
| `Failed to send a request to the Edge Function` | No está desplegada, o el nombre no es exacto. |
| `Database error saving new user` | Ya existía el correo. Usa "Verificar cuenta". |
| "Ese correo no tiene cuenta" | No es un fallo: usa "Crear cuenta con clave". |
| "No tienes permiso para dar de alta usuarios" | Al que pulsó le falta `sistema.usuarios`. |

## Por qué están en el servidor y no en la app

Las tres escriben en la tabla de cuentas de Supabase (`auth.users`), que
no se puede tocar desde el navegador: hace falta la **service_role**.

Esa clave no puede estar en el código del navegador: quien la tuviera
podría leer y modificar toda la base de datos, con todos los registros de
asistencia y los datos personales de los trabajadores. En la función
queda en el servidor, que es donde corresponde.

Por eso no se puede resolver con JavaScript del lado del cliente, por
más que se nombre la función como se quiera.
