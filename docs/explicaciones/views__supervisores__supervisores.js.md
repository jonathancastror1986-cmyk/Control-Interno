# views/supervisores/supervisores.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ============================================================
// Son dos registros distintos de lo mismo, y por eso se contradicen:
//   · "asistencia" es la PLANILLA: quién está presente, y a qué hora
//     quedó. La edita una persona.
//   · "marcajes"  es lo que registró el reloj de la obra.
//
// El caso que importa es uno: el reloj tiene la marcación y la planilla
// no. Ese trabajador fichó, y en el sistema nadie lo marcó. O al revés:
// quedó presente en la planilla sin que el reloj registre nada, que es
// justo lo que hay que poder detectar.
//
// Se agrupan en cuatro, y son excluyentes: cada trabajador cae en una
// sola categoría para una fecha dada.
```


## undefined

```js
  // Y LA DECISIÓN NO SE TOMA AQUÍ
  //
  // Se toma en "js/conciliacion.js", que es donde vive "situacionDe()". Aquí sólo
  // se junta lo que hay de cada persona y se le pregunta.
  //
  // Antes se decidía en estas líneas, y se decidía MAL, y se puede ver por qué
  // mirando lo que se comparaba: "presenteEnPlanilla" era "el estado es X". Con
  // sólo mirar X:
  //
  //   - la planilla decía "F" y el reloj tenía marcaje -> salía "falta marcar en la
  //     planilla", con el botón de MARCAR ENTRADA. O sea,.invoke a pisar una falta
  //     que alguien había puesto, cuando lo que había era una contradicción entre
  //     dos fuentes que no se resuelve con un clic.
  //
  //   - la planilla decía "L", "P", "V", "A", "PP" o "LL" y no había marcaje ->
  //     salía "sin registro en ninguno de los dos". Seis de los ocho estados que
  //     acepta la base, y ninguno es una discrepancia: es lo que tiene que pasar.
  //
  // Y ahora la tolerancia sale de la lista compartida en vez de estar escrita acá,
  // para que las dos pantallas usen la misma. Diez minutos.
```


## undefined

```js
  // LA LISTA, EN TABLA
  //
  // Una celda por dato: quien, que dijo el reloj, que dijo la planilla, en
  // que se contradicen, y que se puede hacer.
  //
  // El cálculo viene de conciliarDia() y no se toca. Cambiar el cálculo y el
  // formato en el mismo paso esconde un error de cálculo detrás de un cambio
  // de estilo, que es la peor forma de que pase.
  //
  // EL BORDE DE COLOR
  // -----------------
  // Antes era un borde en el recuadro entero, a la izquierda. Una fila de
  // tabla no lleva borde, así que va en la primera celda. Se ve igual: el
  // color sigue a la izquierda de cada persona.
```
