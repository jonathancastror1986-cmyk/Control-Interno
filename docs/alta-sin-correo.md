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

Los tres están también en la lista de invitaciones, en cada invitación
pendiente, para no tener que escribir el correo otra vez.

## Qué hay que hacer

```bash
supabase functions deploy verificar-cuenta
```

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
| "La función no está desplegada" | `supabase functions deploy verificar-cuenta` |
| "Ese correo no tiene cuenta" | No es un fallo: usa **Crear cuenta con clave**. |
| "Ese correo ya tiene una cuenta" | No es un fallo: usa **Verificar cuenta**. |
| "No tienes permiso" | Te falta `sistema.usuarios`. Pídeselo a un administrador. |
| Aviso de la migración 021 | El alta se hizo igual; solo no quedó registrada. |
