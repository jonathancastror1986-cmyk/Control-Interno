# views/administracion/docx.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
  // -----------------------------------------------------------------
  // EL ARCHIVO ENTERO: ABRIR, RELLENAR, VOLVER A ARMAR
  // -----------------------------------------------------------------
  //
  // Y solo se toca "word/document.xml". Los otros XML —los estilos, la numeración, las
  // fuentes— se copian byte por byte. Y es por eso que el formato sobrevive.
  //
  // Y el nivel de compresión es 0, sin comprimir, a propósito. Un ".docx" es un ZIP, y el
  // ZIP sin comprimir es un ZIP válido: lo abre Word igual. Y comprimir más no vale nada
  // acá, porque un contrato pesa pocos kilobytes y comprimirlo cuesta tiempo de cada
  // generación.
  //
  // Y lo que NO hace: no sube nada a la base, no guarda nada, y no avisa si el archivo que
  // leLOBALS no era un ".docx". Eso lo tiene que mirar el que llama, y por eso hay
  // "esDocx" aparte.
```
