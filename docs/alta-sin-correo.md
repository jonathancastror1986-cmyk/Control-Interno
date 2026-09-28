# Dar de alta cuentas sin correo

## El problema

La invitación por correo choca con el límite del proveedor de correos de
Supabase. El plan gratuito permite unos pocos por hora; al siguiente
responde:

```
email rate limit exceeded
```

La cuenta **queda creada pero sin verificar**. Quien la tiene no puede
entrar: Supabase responde *Email not confirmed*. Para una obra con
treinta personas eso no es un problema de velocidad, es un bloqueo: nadie
más entra, y el mensaje no dice por qué.

La clave provisional tampoco ayuda si se manda por correo: si el
proveedor no manda, no hay clave.

## La solución: no depender del correo

La tarjeta **Soporte → Invitar usuario → Dar de alta sin correo** escribe
directo en la cuenta de Supabase y no manda nada:

| Botón | Qué hace |
|---|---|
| **✓ Verificar cuenta existente** | La cuenta ya está en Supabase pero quedó sin verificar. La marca como confirmada. |
| **🔑 Crear cuenta con clave** | No existe. La crea **ya verificada**, con una clave provisional. |
| **♻ Cambiar clave** | Existe pero la persona no la recuerda. Le pones una nueva. |
| **✉ Corregir correo** | El correo está mal escrito. Lo cambia y deja la cuenta verificada. |

Los tres están también en la lista de invitaciones, en cada invitación
pendiente, para no tener que escribir el correo otra vez.

## Qué hay que hacer

Desplegar la función `verificar-cuenta`. **Se puede hacer desde el panel
de Supabase, sin instalar nada** (Edge Functions → Create Function → pegar
`supabase/functions/verificar-cuenta/index.ts`). Los pasos están en
[desplegar-funciones.md](desplegar-funciones.md).

Sin esto, la app lo avisa **al abrir la tarjeta**, antes de que pulses
nada, con el comando copiable. Y si lo pulsas igual, el error dice lo
mismo en vez del `Failed to send a request to the Edge Function` que
devuelve Supabase y que no explica nada.

La migración 021 es **opcional pero recomendada**: sin ella el alta
funciona igual, lo que no se guarda es el registro de quién la hizo. La
app avisa en pantalla cuando falta.

```bash
# migrations/021_altas_cuentas.sql, en el SQL Editor de Supabase
```

## El costo, dicho sin adornos

Verificar un correo sin que nadie lo compruebe significa que **la app
está afirmando que esa dirección es correcta**. Eso solo es aceptable
porque la clave se la entregas tú, en persona, al jefe de turno o a la
persona misma.

En una obra, con el usuario entregado en mano, es lo que corresponde. En
un sistema abierto al mundo, no lo sería. La tarjeta en la app lo dice
antes de que pulses nada.

Por eso los botones piden confirmación y por eso la clave se borra de la
pantalla apenas se usó: si dejaste la pestaña abierta, no queda escrita a
la vista de cualquiera que pase por detrás.

## Cómo se usa en la práctica

1. Escribes el correo, el nombre y generas una clave.
2. La anotas.
3. Se la entregas a la persona.
4. Le pides que la cambie al entrar.

Un jefe de turno puede dar de alta a treinta personas en una mañana, sin
que el límite de correos aparezca ni una vez.

## Cuando el correo está mal escrito

Si la dirección tiene un error —`gmial.com`, un punto de más, el nombre
mal escrito— el correo de confirmación **nunca va a llegar**, porque esa
dirección no existe. Reenviar el enlace tampoco ayuda.

**✉ Corregir correo** cambia la dirección y deja la cuenta verificada en
la misma pasada. La clave no cambia. La invitación pendiente también se
corrige, que es lo importante: el trigger lee la invitación por el
correo, y si quedara con el viejo, al registrarse la persona entraría sin
rol, sin empresa y sin ficha.

**Lo que la app no puede hacer:** comprobar que el dominio exista. Un
`gmial.com` tiene forma de correo y se acepta. Por eso el diálogo de
confirmación muestra la dirección nueva completa: ese es el momento en
que una persona puede ver el error. Léelo antes de pulsar.

Al cambiar un correo a mano no se manda ningún aviso. Avisa por otro
medio.

## Y si prefieres SQL

Para una reparación puntual, o si el panel no te deja, hay
[sql/reparar-cuenta.sql](../sql/reparar-cuenta.sql): una función que
activa la cuenta y corrige el correo, actualizando los dos lugares donde
Supabase guarda la dirección. Está documentada y probada; los pasos están
al final de ese archivo.

## El registro de quién lo hizo

La tabla `cuentas_altas` guarda, por cada intento:

- el correo,
- qué se hizo (`verificada`, `creada`, `clave_reiniciada`),
- el resultado, **incluidos los fallidos y su motivo**,
- quién lo hizo y cuándo.

No se borra ni se edita, **ni siquiera por un administrador**: es un
registro de lo que pasó, no un borrador. Es lo que permite responder
"¿quién dio de alta a esta persona?".

## Permisos

Verificar el correo de otra persona es, en la práctica, dar de alta a
alguien, así que la función pide lo mismo que invitar: cuenta activa y
permiso `sistema.usuarios`. Se comprueba con las mismas funciones de la
base que usa el resto de la app (`es_usuario_activo`, `tiene_permiso`),
para que la pantalla y la base no puedan discrepar.

## Por qué una Edge Function

Escriben en `auth.users`, que no se puede tocar desde el navegador: hace
falta la **service_role**. Esa clave no puede estar en el cliente: quien
la tuviera podría leer y modificar toda la base de datos. Acá queda en el
servidor, que es donde corresponde. Es la misma razón por la que existe
la función `invitar`.

## Si algo falla

| Síntoma | Qué revisar |
|---|---|
| Aviso de funciones no desplegadas | `supabase functions deploy verificar-cuenta` |
| "Tu sesión caducó" | No es un problema de despliegue. Vuelve a iniciar sesión. |
| "Ese correo no tiene cuenta" | No es un fallo: usa **Crear cuenta con clave**. |
| "Ese correo ya tiene una cuenta" | No es un fallo: usa **Verificar cuenta**. |
| "Ya existe otra cuenta con el correo…" | El correo nuevo está tomado. No se puede usar. |
| "No tienes permiso" | Te falta `sistema.usuarios`. Pídeselo a un administrador. |
| Aviso de la migración 021 | El alta se hizo igual; solo no quedó registrada. |
