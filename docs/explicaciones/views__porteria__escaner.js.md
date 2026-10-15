# views/porteria/escaner.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// EL MISMO RESOLUTOR, PERO CON LA BASE
// -----------------------------------
// resolverCodigoTrabajador no puede preguntar en la base porque no es
// async, y un boton de escaneo en la porteria SI puede esperar: no hay nada
// que la persona tenga que hacer mientras se consulta.
//
// Primero la memoria, que es lo rapido. Si no esta, se pregunta a la base
// con tarjetaRegistrada, que ya hace exactamente eso. Y si tampoco, recien
// ahi se avisa, porque hasta ese momento el aviso seria mentira.
//
// OJO: los avisos de tarjeta anulada o bloqueada NO se callan. Esos no son
// un fallo de busqueda: son la respuesta, y son la unica parte del camino
// que de verdad protege la asistencia.
// POR QUE SALIA SIEMPRE LO MISMO
// ------------------------------
// El mensaje "no se encontro una tarjeta ni un trabajador" salia para
// cuatro cosas distintas:
//
//   - la lista de tarjetas de la pantalla esta vacia
//   - la tarjeta existe pero se emitio despues de abrir la pantalla
//   - la tarjeta existe pero su trabajador es de otra empresa
//   - el codigo esta mal escrito
//
// Decirle lo mismo a quien esta parado en la porteria es no decirle nada.
// Este mensaje dice cual de las cuatro es, y que hacer.
//
// Y hay una razon de fondo para distinguir la primera: si la lista esta
// vacia, el problema NO es la tarjeta que esta pasando la persona. Es que
// la pantalla no cargo nada, y recargar lo arregla. Decirle a alguien que
// su tarjeta no esta emitida, cuando lo que no esta emitido es la lista
// de la pantalla, manda a hacer una cola en Administracion que no iba a
// arreglar nada.
```


## undefined

```js
// ------------------------------------------------------------------
// LECTURA ESTABLE Y CONFIRMACIÓN
// ------------------------------------------------------------------
// Antes, el lector tomaba el PRIMER código que lograba decodificar en
// el fotograma y ya marcaba. Con dos tarjetas a la vista (una en la
// mano y otra en la mesa, o dos personas en la fila) podía registrar a
// la persona equivocada: eso es un problema de seguridad, no un
// problema de la pantalla.
//
// Estabilidad: el mismo código tiene que aparecer en varios fotogramas
// seguidos. Un destello, un reflejo o una decodificación suelta no se
// mantienen, así que no llegan a la acción.
```


## undefined

```js
// CÓDIGOS: SE MUESTRAN CON 4 DÍGITOS, PERO NO SE CAMBIAN
//
// "7" y "0021" ordenan distinto: como texto, 12 va antes que 7, y en una
// lista de 46 personas eso revuelve el orden entero. Con 4 dígitos, "0007"
// y "0021" quedan en su lugar y la columna se lee de un vistazo.
//
// OJO CON LO QUE NO SE HACE: no se cambia el código guardado en la base.
// El código es la llave de varias tablas (asistencia, marcajes, tarjetas,
// solicitudes) y de las tarjetas impresas: cambiarlo obligaría a migrar
// todo junto, y un error ahí deja la asistencia perdida. Solo se cambia
// cómo se muestra y cómo se ordena.
//
// Solo se completan con ceros los códigos QUE SON NUMÉRICOS. Un código
// como "TEMP-01" o "K12" se deja tal cual: inventarle ceros sería mentira.
//
// Un código de más de 4 dígitos no se corta: 12345 es más largo que el
// formato, y recortarlo haría que dos personas distintas mostraran el mismo.
```


## undefined

```js
// Buscar un trabajador por un código escrito con otro relleno.
//
// "1", "01", "001" y "0001" son el mismo número, y en un Excel cada
// persona los escribe como le sale. Comparar el texto tal cual ("1" contra
// "0001") no encuentra a nadie, y el síntoma es desconcertante: el archivo
// parece bien y la app dice que ningún código existe en la base.
//
// No se comparan los textos: se comparan como NÚMERO cuando los dos son
// numéricos, y tal cual cuando no lo son. Un código alfanumérico ("TEMP-01")
// nunca se relaja, porque ahí "TEMP-1" y "TEMP-01" podrían ser personas
// distintas y adivinar mal sería peor que no encontrar.
//
// Se devuelve la ficha, no el código, para poder usar el código GUARDADO.
// Es lo que evita escribir "1" contra un trabajador que en la base está
// como "0001", que la llave foránea rechaza.
```
