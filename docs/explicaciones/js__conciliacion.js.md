# js/conciliacion.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ===================================================================
// LA CONCILIACIÓN: EL RELOJ CONTRA LA PLANILLA
// ===================================================================
// UNA SOLA LISTA DE SITUACIONES, PARA LAS DOS PANTALLAS QUE LA USAN
//
// ---------------------------------------------------------------------
// POR QUÉ ESTE ARCHIVO EXISTE
// ---------------------------------------------------------------------
//
// Porque la conciliación se dibujaba en dos lugares, cada uno con su propio
// vocabulario:
//
//     Supervisores → Conciliar el reloj con la planilla   "conciliarDia()"
//     Administración → Justificación diaria                "app.js"
//
// Y con dos vocabularios para la misma pregunta, hay dos respuestas a "¿esto qué
// es?", y sólo una puede estar bien.
//
// Y NO ES HIPOTÉTICO: SE MEDIÓ, Y DABA MAL EN DOS CASOS
//
// 1. EL GRAVE. La planilla decía "F" —ausente— y el reloj tenía marcaje de
//    entrada. "conciliarDia" no conocía más estado que "X", así que decía
//    "falta marcar en la planilla" y ofrecía el botón MARCAR ENTRADA. O sea,
//    invitaba a pisar la falta que alguien había puesto, cuando lo que había era
//    una contradicción entre dos fuentes. La Justificación Diaria, en cambio, sí
//    lo separaba: "falta_con_marca", con el texto "Los dos datos no pueden ser
//    ciertos a la vez".
//
// 2. EL RUIDOSO. Un trabajador con "L", "P", "V", "A" o "PP" —licencia, permiso,
//    vacaciones, accidente mutual, permiso pagado— y sin marcaje, que es lo
//    NORMAL, salía como "sin registro en ninguno de los dos". Cinco de los ocho
//    estados que acepta la base.
//
// Los dos bugs venían de la misma línea: sólo se miraba el estado "X".
//
// ---------------------------------------------------------------------
// Y LO QUE ESTE ARCHIVO NO HACE
// ---------------------------------------------------------------------
//
// No fusiona las dos pantallas, porque no son la misma pregunta:
//
//     la Conciliación pregunta  "¿el reloj coincide con lo que alguien escribió?"
//     la Justificación pregunta "¿qué hay que explicar de esta persona?"
//
// La Justificación además tiene horarios, tolerancias por equipo yEntradas
// esperadas —"tarde", "sin salida"—, que la Conciliación no puede saber. Eso se
// queda donde está.
//
// Lo que se comparte es lo que SÍ es la misma pregunta: qué significa que el reloj
// y la planilla no digan lo mismo. Y eso ahora tiene un solo nombre, un solo
// texto y un solo color, en las dos pantallas.
// ---------------------------------------------------------------------
// LOS ESTADOS QUE SON UNA JUSTIFICACIÓN, Y POR QUÉ NO SON UNA ALERTA
// ---------------------------------------------------------------------
// Y LA MISMA LISTA QUE USA LA JUSTIFICACIÓN DIARIA
//
// Se repite aquí a propósito. "esJustificado()" está en "app.js" y no se puede
// llamar desde acá sin depender del orden de carga de los archivos, y una función
// que devuelve una lista la puede leer cualquiera sin que se note de dónde salió.
//
// Y ESTOS SEIS NO SON UNA DISCREPANCIA
//
// Que falte el marcaje de alguien con licencia no es una contradicción: es lo
// esperado. Que la planilla diga "L" y el reloj no registre nada es la única
// combinación coherente. Antes salía como alerta, y una alerta que no es una
// alerta hace que se dejen de mirar las que sí lo son.
//
// Y "LL", DÍA LLUVIA, FALTABA, Y FUE UN BUG QUE SE MEDIÓ AL ESCRIBIR ESTA LISTA
//
// "LL" es un estado que la base acepta —la lista es 'X','F','P','L','A','PP','V','LL'—
// y que la Justificación Diaria ya nombraba con su texto, "Día lluvia". Pero no
// estaba en ninguna de las dos listas de justificados.
//
// O sea: un trabajador con día de lluvia y sin marcaje salía como "sin marcar", que
// es una falta inexistente. Con lluvia no se marca, porque no se trabaja; el día
// tiene su propio estado justamente para eso.
//
// Y NO SE METE "F" AQUÍ, POR MÁS PARECIDO QUE SEA
//
// "F" es ausencia. Que no haya marcaje de alguien que está ausente es lo esperado,
// pero lo esperado de otra manera: no es una justificación que alguien entregó, es
// que la persona faltó. Por eso tiene su propia situación, "ausente_coherente", y
// no comparte grupo con las licencias.
```


## undefined

```js
// ---------------------------------------------------------------------
// EL CLASIFICADOR
// ---------------------------------------------------------------------
// Y ES UNA FUNCIÓN PURA: NO DIBUJA, NO ESCRIBE, NO LEE LA BASE
//
// Recibe lo que se sabe de una persona en un día y devuelve UN nombre de esta
// lista. Nada más. Con eso se puede probar sin pantalla y sin base, que es como se
// probó: los once casos de la tabla de abajo.
//
// Y POR QUÉ "X" ESTÁ SEPARADO DEL RESTO EN LA PRIMERA COMPROBACIÓN
//
// Porque "X" es el único estado que dice "estuvo". Con "F" la planilla dice que no
// estuvo, y con los cinco justificados no dice nada sobre la asistencia: dice por
// qué no. Y un "F" con marcaje es una contradicción entre dos fuentes, no una
// planilla incompleta.
```


## undefined

```js
// ---------------------------------------------------------------------
// LA HORA EN MINUTOS DESDE LA MEDIANOCHE
// ---------------------------------------------------------------------
// Y "minutosDe" YA EXISTE, Y NO SE REPITE
//
// Está en "views/administracion/administracion.js" y hace lo mismo: parte el texto
// por los dos puntos y devuelve los minutos. Los archivos comparten el ámbito, así
// que definirla otra vez acá no agrega nada: una de las dos pisa a la otra según
// cuál cargó último. Ver [word-04].
//
// Y LA RAZÓN DE QUE EXISTA "minutosDe", Y NO SE USE "new Date"
//
// "new Date('08:30')" en JavaScript es una fecha, no una hora: la interpreta como
// 30 de agosto de 2001, en la zona horaria de la máquina. La diferencia entre dos
// horas no puede depender de dónde se miró. Por eso la cuenta es de minutos.
// ---------------------------------------------------------------------
// LAS DOS FUNCIONES QUE USA EL RESTO DEL CÓDIGO
// ---------------------------------------------------------------------
// Y ESTÁ ANTES DE LA TABLA, Y POR QUÉ
//
// Porque no necesita la tabla: sólo junta los dos pasos. Y por eso queda en el
// bloque de arriba, que es el que la prueba se lleva para correr sin pantalla y sin
// base. Si estuviera después, la prueba tendría que llevarse la tabla también, y
// entonces probaría el dibujo y no el cálculo.
```


## undefined

```js
// ---------------------------------------------------------------------
// LA LISTA ÚNICA, CON SU TEXTO, SU COLOR Y QUÉ SE PUEDE HACER
// ---------------------------------------------------------------------
// Y "queSePuedeHacer" ES LO QUE DICE EL BOTÓN, Y ES LA PARTE IMPORTANTE
//
// Porque "Falta marcar en la planilla" y "F con marcaje" se parecían en la tabla
// y son opuestas: la primera se resuelve marcando, la segunda NO. Un marcaje
//Automatico no puede resolver una contradicción: las dos fuentes pueden estar
//bien —el reloj marca de más— y hay que preguntarle a la persona.
//
// Y POR QUÉ NO HAY UNA "FALTA_MARCAR" EN ESTA LISTA
//
// Porque con "F" ya no es una planilla incompleta: es una contradicción. La
// planilla incompleta es cuando NO hay fila, y eso es "falta_en_planilla".
```
