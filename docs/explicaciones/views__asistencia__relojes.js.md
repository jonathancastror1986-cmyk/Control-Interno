# views/asistencia/relojes.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ===================================================================
//
// QUÉ ES "UN RELOJ" ACÁ
//
// Es el dispositivo: el Android TV Box con HDMI, o el equipo al que se le
// enchufa un lector QR USB. De él cuelgan tres cosas que se configuran
// juntas, y por eso viven en la misma pantalla:
//
//   dónde está    -> centro de costo (y un texto de ubicación)
//   cómo lee      -> cámara, o lector que se comporta como teclado
//   qué marca      -> entrada, salida, o los dos semiciclos de colación
//
// EL LECTOR USB Y POR QUÉ ES "MODO TECLADO"
//
// Esos lectores no son cámaras. Se enumeran en el sistema como teclado y
// escriben el código, muy rápido, y mandan Enter al final. De ahí salen
// las dos cosas que hay que hacer y que no son detalles:
//
//   - autofocus permanente en un campo de texto, porque en un tótem nadie
//     va a tocar la pantalla;
//   - ignorarlo todo lo que se escriba mientras ya hay un código en el
//     campo, porque el lector a veces manda el código dos veces seguidas.
//
// LA VENTANA ANTIRREBOTE NO ESTÁ ACÁ
//
// La aplica la base (marcar_por_reloj), no esta pantalla. Si la aplicara
// el navegador, un tótem con la hora desfasada o alguien que recarga la
// página se saltaría el control. Ver la migración 030.
// ===================================================================
```


## undefined

```js
// ------------------------------------------------------------------
// EL CAMPO DE TOKEN DEL TÓTEM
// ------------------------------------------------------------------
// Aparece SOLO cuando hace falta, y se esconde después de guardar bien.
//
// Va en la pantalla del reloj y no en la de Relojes a propósito. El reloj
// está colgado en la portería y la pantalla de Relojes en el computador de
// la oficina: mandar a alguien a buscar el token, volver a la obra con un
// papel, y pegarlo es un viaje. El token se pega donde el reloj está.
//
// Y solo aparece cuando hace falta. Un campo de texto en una pantalla que
// la gente toca con cualquier dedo, en medio del marcaje, es un problema
// esperando: un dedo lo tapa y no se marca.
```


## undefined

```js
  // -------------------------------------------------------------------
  // Y POR QUÉ ESTA LÍNEA, Y POR QUÉ SE USÓ ANTES DE EXISTIR
  // -------------------------------------------------------------------
  // Porque "se preguntó y no hay nada" NO es lo mismo que "no se preguntó". Con la
  // lista cargada y vacía, la respuesta honesta es 0: no ha marcado nadie, y eso es
  // un hecho sobre la portería.
  //
  // Antes esta rama era un "return" que dejaba el "—" ahí, y ese "—" decía "no se
  // consultó" cuando sí se había consultado. Es el mismo error del que avisa el
  // comentario de más arriba, en otro sitio.
  //
  // Y sale un 0 DE VERDAD: sin la clase "sin-dato", que es la que pinta en el color
  // de los datos que no se saben. Un 0 que no se sabe y un 0 que es cero se ven
  // distintos a propósito: el que no se sabe es un dato que falta, no una cifra.
  //
  // -------------------------------------------------------------------
  // Y POR QUÉ SE USÓ ANTES DE EXISTIR
  // ---------------------------------
  // Porque en la primera pasada se escribió el "if(!lista.length){ ponerCero(cR);
  // ponerCero(cA); }" y se pasó a la otra cosa sin mirar de dónde salía el nombre.
  //
  // Y no lo detectó casi nada. Una función llamada y no definida es sintaxis
  // VÁLIDA, así que la comprobación de sintaxis del guion entero pasaba; y las
  // comprobaciones de contenido preguntan "¿existe la llamada?", que sí existía.
  //
  // En el navegador botaba en la primera línea de esa rama, y esa rama es
  // justamente la PRIMERA de la mañana: el reloj abre antes que la obra. O sea que
  // el arreglo, en el caso para el que se hizo, no arreglaba nada.
```


## undefined

```js
  // PENDIENTES: los que el reloj registró y la base todavía no tiene. Cuando
  // el reloj está sin conexión esto es justamente lo que se exporta después.
  //
  // -------------------------------------------------------------------
  // Y POR QUÉ ESTE SIGUE EN "—", Y POR QUÉ NO SE LE PONE UN CERO
  // -------------------------------------------------------------------
  // Porque es la COLA LOCAL DEL RELOJ: los marcajes que el aparato registró y la
  // base todavía no tiene. Esa cola todavía no existe, y el código lo reconoce con un
  // "typeof totemPendientesLocales !== 'undefined'", que SIEMPRE da falso.
  //
  // Poner 0 ahí sería MENTIR en la portería. El 0 significa "no hay nada pendiente",
  // que es un hecho sobre la obra; y en una pantalla donde se está viendo la
  // asistencia, un 0 falso se cree: alguien ve que no hay pendientes y cierra el
  // tema.
  //
  // Con "—" lo que dice es "esto no se sabe", que es lo cierto. Y el día que exista
  // la cola, este número aparece solo, sin tocar nada de acá: la lista ya se está
  // contando.
  //
  // Y aquí NO se pone 0 cuando no se sabe. Todavía no existe la cola local
  // del reloj (es lo que falta hacer), así que este número queda en "—" en
  // vez de mentir con un cero. Un cero en este campo significa "no hay nada
  // pendiente", y en una portería eso se cree.
```
