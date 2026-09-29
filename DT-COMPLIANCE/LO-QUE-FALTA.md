# Lo que falta, en orden

Las casillas son para marcar mientras se avanza. El orden no es por lo
importante que sea, es por lo que desbloquea lo siguiente: hay tres cosas que
son un botón sin nada detrás, y un botón sin nada detrás se ve terminado y no
funciona.

`[ ]` sin migración = solo pantalla
`[M]` = necesita migración nueva

---

## 1. Los tres números del tótem, completos

`[ ]` **"Total presentes en ubicación"** — la casilla dice "N° Ausencia
Justificado **y** total presentes en Ubicación", o sea dos números en una
celda, y ahora hay uno. Los justificados están; los presentes no.

> No se puede contar sin saber qué se cuenta. "Presentes" puede ser los que
> tienen alguna marca hoy, o los que no tienen ninguna justificación. Las dos
> dan números distintos en la misma obra el mismo día, y son decisiones de RRHH.

`[ ]` **Que los tres se actualicen al marcar** — ahora solo se pintan al abrir
la pantalla. Después de un marcaje los números quedan con el valor de antes,
que es peor que no tenerlos: el reloj acaba de decir "marcaje exitoso" y el 1 de
al lado no se movió.

## 2. La cola local del reloj  ← hace falta para lo demás

`[M]` **052: la cola local** — marcajes que el reloj registró y la base no
tiene.

> La migración 035 ya dejó la puerta hecha: `importar_marcajes_offline()`
> recibe el CSV y `importaciones_offline` deja registrado quién subió qué.
> **Falta la otra mitad, que es la que no existe: que el reloj guarde el
> marcaje cuando no hay red.** Hoy, sin conexión, el marcaje no se registra y
> no queda rastro.

`[ ]` **El botón de exportar, solo cuando el reloj está sin conexión**

> El punto de conexión ya está en la columna del medio. Exportar tiene que
> depender de él, y no al revés: el botón aparece cuando el reloj está
> offline, con la cantidad de marcajes que hay, porque ese es el momento en
> que alguien tiene que acordarse de hacerlo antes de que se apague el reloj.

`[ ]` **Subir ese CSV** — la pantalla que llama a `importar_marcajes_offline()`.

## 3. Los dos emergentes del marcaje

`[ ]` **El de éxito**, con los cuatro renglones del dibujo:
título, fecha y hora del marcaje, ubicación (obra o centro de costo), y
"Tienes avisos — leer, enviar por correo o whatsapp".

`[ ]` **El de error**, con: título, fecha y hora del **intento**, ubicación, y
el detalle de por qué no marcó.

> Hoy hay un mensaje de una línea que se va solo a los 2,2 segundos. Los dos
> dibujos piden cuatro renglones que se leen a un brazo de distancia, y el de
> error además tiene que decir la causa: "trabajador desvinculado" y "tarjeta
> bloqueada" son dos problemas distintos con dos soluciones distintas, y
> "no marcó" no dice cuál de los dos fue.

`[ ]` **Que el de error NO se borre a los 2,2 segundos**

> El de éxito sí, porque ya no hay nada que hacer. El de error no: si se va
> solo, la persona se queda sin saber por qué no le entró y tiene que volver
> a pasar la tarjeta para enterarse de lo mismo.

## 4. Ver avisos escaneando el QR

`[ ]` Que el botón de avisos abra la cámara y el QR de la tarjeta traiga los
avisos de esa persona, y que desde ahí se pueda marcar como leído.

> Ojo con lo que NO es: el QR es un token estático y un PIN, no identifica a
> nadie solo. Los avisos del reloj son los que ya se guardan en este
> aparato. Si los avisos vinieran del QR, la cámara del reloj tendría que
> guardar datos de una persona, y eso es otra cosa.

## 5. El selector de destino de charlas y documentos

`[ ]` En Administración, al crear una charla o un documento: elegir a quién
le toca — **a todos / a un grupo / a un cargo**.

> Las columnas ya están en la base (051) y el CHECK ya impide dejar las dos
> puestas. Falta la pantalla. Es el mismo par de desplegables anidados, más una
> primera opción "a todos".

## 6. La 046 y la 047 tienen la puerta abierta

`[M]` **051b o 052: corregir el permiso** — una línea en cada función.

> Hoy las dos usan:
>
> ```sql
> if not (es_usuario_activo() or es_admin() or tiene_permiso('...'))
> ```
>
> `es_usuario_activo()` pregunta *"¿la cuenta existe y no está dada de
> baja?"*, y eso es cierto para cualquiera que se haya registrado. Con `or` al
> lado, la puerta la pasa cualquiera. **Hoy, en la base, cualquier cuenta
> registrada puede aprobar ingresos de trabajadores y registrar
> amonestaciones.** La 050 lo hizo bien (`activo and (admin or permiso)`) y
> hay que llevar ese mismo orden a las otras dos.

## 7. Lo que ya estaba en la lista

`[ ]` Kit de contratación como submenú propio
`[ ]` La 044 sin aplicar (funciones de las guías)
`[ ]` Tablet: `setPointerCapture`, y que el `resize` no borre la firma
a medio firmar
`[ ]` Partir `migrations/` (hoy son 57 archivos en una carpeta)
`[ ]` **El refactor de clases en la rama `test`** — el último de todos
