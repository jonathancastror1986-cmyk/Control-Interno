# views/bodega/bodega.js

Explicaciones largas que estaban en el código, sacadas para que el código
se pueda leer de corrido.

Cada bloque dice sobre qué función es. Para volver al código, el nombre de la
función se busca en el archivo.

---


## undefined

```js
// ------------------------------------------------------------------
// EL PAPEL: EL DOCUMENTO COMO SE VA A IMPRIMIR
// ------------------------------------------------------------------
// Los {{campos}} se reemplazan con los datos de la persona. Se hace con
// reemplazo de texto y no con innerHTML sobre datos, para que un nombre con
// < no rompa el documento: el nombre viene de la ficha, y las fichas se
// importan de Excel.
// -------------------------------------------------------------------
// REEMPLAZAR LAS VARIABLES DEL PAPEL
// -------------------------------------------------------------------
// Y POR QUÉ HAY TRES FORMAS Y NO UNA
//
// Porque los papeles vienen de lados distintos: hay plantillas escritas en el
// editor de la aplicación, que usan "[NOMBRE]", y hay documentos que se pegaron
// desde Word o de un contrato que ya existía, que usan "{{nombre}}".
//
// Y EL DATO PUEDE VENIR POR VARIAS CLAVES
//
// "nombre_completo", "nombre", "nombres", "nombreCompleto" son el mismo dato
// escrito de cuatro maneras, según quién escribió la plantilla. Y lo mismo con
// "rut" y "rut_trabajador".
//
// Antes el regex era "/\{\{\s*([a-z_]+)\s*\}\}/": dos llaves, y letras y guion
// bajo, NADA MÁS. Con eso "{{nombre_completo}}" no entraba —el "1" no es una
// letra— y salía literal en el contrato. Un contrato firmado con
// "{{nombre_completo}}" adentro es un documento con un hueco, y el hueco se
// nota recién cuando alguien lo lee.
//
// El carácter del nombre ahora incluye números y guiones, y se aceptan las tres
// formas. Y si el nombre no está en "datos", se busca entre las alternativas; si
// tampoco está, se deja el marcador como estaba, que es mejor que inventar un
// valor vacío: un "[RUT]" vacío se ve como un error de la empresa.
// ---------------------------------------------------------------------
// LA FECHA EN LA FORMA EN QUE LA ESCRIBE UN CONTRATO
// ---------------------------------------------------------------------
// Y POR QUÉ HACE FALTA, Y POR QUÉ NO ES UN "toLocaleDateString"
//
// Porque un contrato chileno no escribe "09-09-1959". Escribe:
//
//     nacido(a) el 9 de Septiembre de 1959
//     hasta el 31 de diciembre de 2026
//
// Y en esa frase hay tres cosas que una fecha normal no da: el día SIN cero
// adelante, el mes ESCRITO y con mayúscula, y el "de" adelante del mes.
//
// Y el mes va con mayúscula porque así sale en los contratos. Un "septiembre" en
// minúscula en medio de un contrato se ve como un documento armado por una
// máquina.
//
// Y EL DÍA VA SIN CERO ADELANTE PORQUE UN CONTRATO ESCRIBE "9", NO "09"
```


## undefined

```js
// Y LA FECHA CORTA, QUE YA EXISTE Y NO SE REPITE
//
// "fechaCorta" ya está definida en "views/administracion/documentos.js" y hace
// exactamente esto: "2026-07-05" -> "05/07/2026". Los archivos comparten el
// ámbito, así que definarla otra vez acá no agrega nada: uno de los dos pisa al
// otro según cuál cargó último, y un día[start] de esos cambia por el otro. Ver
// [word-04].
//
// Se usa la de ahí. Una declaración de salud dice "a 3 de Julio de 2026"; un
// anexo dice "03/07/2026", y para eso están las dos formas.
// ---------------------------------------------------------------------
// EL PLAZO DEL CONTRATO, EN LA FRASE QUE SE ESCRIBE
// ---------------------------------------------------------------------
// Y POR QUÉ SE CALCULA ACÁ Y NO SE GUARDA LA FRASE ENTERA
//
// Porque la frase depende del dato, y el dato cambia: si el plazo pasa de
// "indefinido" a "hasta el 31 de diciembre", el contrato tiene que decir la frase
// nueva. Si se guardara la frase, habría que volver a escribirla cada vez que
// cambia un solo dato, y tarde o temprano se queda la vieja.
//
// Y LAS CUATRO FORMAS, Y CADA UNA DICE UNA COSA DISTINTA
//
//     indefinido   -> "indefinido"
//     partida      -> "por partida de contrato"
//     dias         -> "por 90 días"     (singular si es un día)
//     fecha        -> "hasta el 31 de diciembre de 2026"
//
// Y CUANDO EL PLAZO ESTÁ A MEDIAS, NO SE INVENTA NADA
//
// Si el tipo es "días" pero no hay cantidad de días, o el tipo es "fecha" pero no
// hay fecha, la frase queda vacía. Y una frase vacía hace que el marcador
// "[PLAZO]" quede en el papel, que es exactamente lo que tiene que pasar: se ve
// que falta. Poner "90 días" porque era lo de la otra persona, es peor.
```


## undefined

```js
// ------------------------------------------------------------------
// LA HUELLA DEL PAPEL
// ------------------------------------------------------------------
// Lo que hace que un papel firmado no se pueda cambiar despues NO es
// guardarlo: es guardar su SHA-256. Un "firmado el 2025-06-01 a las 10:00"
// es una palabra, cualquiera puede escribirla. Un hash del contenido es una
// prueba: si el texto cambio en un solo caracter, el hash cambia, y no hay
// forma de volver al hash viejo sin adivinar el documento entero.
//
// Y POR QUE SE CALCULA EN EL NAVEGADOR Y NO EN LA BASE
//
// Porque el papel entero vive en el navegador: la base guarda los datos ya
// puestos en "datos", no el texto del documento. La base no tiene con que
// calcularlo. Por eso el hash se calcula aca y se manda.
//
// Y POR QUE NO SOBRE LA PLANTILLA
//
// Se hashea el papel YA ARMADO, con los datos del trabajador dentro. Si se
// hasheara la plantilla, dos personas distintas firmando el mismo papel
// darian el mismo hash, y la huella no probaria nada sobre lo que se firmo.
```


## undefined

```js
  // Y LA EMPRESA DEL TRABAJADOR, NO LA DEL SELECTOR DE ARRIBA
  //
  // Antes se usaba "empresaDelPapel()", que devuelve null cuando se estan
  // viendo todas las empresas y no hay ninguna elegida. Con 47 empresas eso es
  // lo NORMAL, y "firmas_documento" tiene "empresa_id" NOT NULL: el insert
  // fallaba y la huella no se guardaba.
  //
  // O sea: se firmaba, salia "El papel quedó guardado con la firma", y la
  // huella no existed. Porque el error se guardaba en un "console.warn" que
  // nadie mira.
  //
  // La empresa del TRABAJADOR es una sola y siempre esta. Una persona
  // pertenece a una empresa, y el papel es para esa persona: no hay que
  // adivinar nada.
  //
  // Y EL TIMBRE SIGUE USANDO "empresaDelPapel()", QUE ES LO CORRECTO
  //
  // Porque el timbre pertenece a la empresa y el papel al trabajador. Son dos
  // cosas distintas, y cada una usa el dato que le corresponde.
```


## undefined

```js
// ------------------------------------------------------------------
// EL AVISO DE QUE NO SE GUARDÓ LA HUELLA
// ------------------------------------------------------------------
// Y POR QUÉ ESTÁ EN EL PAPEL Y NO EN UNA VENTANA
//
// Porque una ventana con un botón "OK" saca el papel de la vista, y el aviso va
// en el mismo lugar donde ya está el error del papel. La persona lee las dos
// cosas juntas.
//
// Y NO SE BORRA SOLO
//
// Porque es una advertencia que hay que ver. Los avisos que se van solos son los
// que nadie lee, y este es el aviso de que un documento firmado quedó sin prueba
// de que no se tocó.
```


## undefined

```js
// ------------------------------------------------------------------
// EL PDF
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// EL PDF
// ------------------------------------------------------------------
// Y POR QUÉ SE IMPRIME Y NO SE GENERA UN PDF
//
// Antes esto armaba un PDF con "html2canvas" y "jsPDF": tomaba una foto del
// papel con un canvas, la metía como imagen dentro del PDF, y la cortaba en
// franjas de 595 puntos para hacer varias páginas.
//
// Medido sobre un PDF real de esa versión:
//
//     páginas                12        (una "Declaración de Salud")
//     texto extraíble        12 caracteres
//     tamaño                 2,6 MB
//     imágenes               12 por página, todas de 1588×1191
//
// O sea: el papel entero era UNA FOTO, partida en doce franjas. El texto no
// existía: no se podía buscar, no se podía copiar, no lo leía un lector de
// pantalla, y un buscador de PDFs no encontraba el nombre de nadie.
//
// Y el corte era peor: la franja de 595 puntos cae donde cae. Si el texto
// estaba a mitad de una franja, se partía entre dos páginas. Con una
// declaración de salud de una carilla, eso son doce páginas con líneas cortadas
// por la mitad.
//
// LO QUE SE USA AHORA
//
// "window.print()". El motor de impresión del navegador arma el PDF desde el
// HTML, y lo arma como lo que es: texto. Sale con texto seleccionable, con las
// páginas donde caen y sin partir una línea de texto.
//
// El motivo es que el papel no se corta: eso lo hace el motor de impresión, que
// sabe dónde termina una página. Y por eso puede quedar en dos páginas si es
// largo, y en dos queda bien, no partido.
//
// Y NO ES "IMPRIMIR" EN EL SENTIDO DE SALIR EN PAPEL
//
// En el diálogo que abre, el destino puede ser "Guardar como PDF". Es el
// camino de siempre en Windows y en el celular, y es lo que se busca.
//
// El nombre del archivo lo pone el que guarda, no el código. No se puede: el
// nombre del destino lo elige el diálogo de impresión, y desde el javascript no
// se escribe ahí. Eso es lo que hace el sistema operativo, y está bien que sea
// así.
// ---------------------------------------------------------------------
// LOS MARCADORES QUE NO SE PUDIERON LLENAR
// ---------------------------------------------------------------------
// Y POR QUÉ HAY QUE BUSCARLOS
//
// Porque hay una regla que dice que si un marcador no tiene dato, se queda como
// estaba: un "[RUT]" vacío se ve como un error de la empresa, y un "{{no_existe}}"
// se ve como lo que es, un marcador que hay que arreglar.
//
// Y esa regla es correcta. El problema es que "quedarse como estaba" es
// INVISIBLE: un papel con "{{rut}}" adentro sale impreso, se firma, y nadie se
// entera hasta que alguien lo lee. Y en un contrato firmado ya no se puede
// arreglar: el hash ya está.
//
// Y PASÓ. En un PDF real se vio "RUT: {{rut}}," en medio de la cláusula de
// identificación, con el nombre bien puesto al lado. El nombre se reemplazó y el
// RUT no, porque esa ficha no tenía RUT cargado.
//
// Por eso se buscan los marcadores que quedaron y se AVISAN ANTES de imprimir.
// No se corrigen: corregir es inventar el dato de una persona.
//
// Y LA LISTA ES DE LAS MISMAS TRES FORMAS QUE ENTIENDE EL REEMPLAZO
//
// "[NOMBRE]", "{{nombre}}" y "{nombre}". Si se buscara otra forma, el marcador
// que no se busca es el que pasa.
// Y LA CLAVE SE NORMALIZA A MINUSCULA, Y POR QUÉ
//
// Porque "[RUT]", "{{Rut}}" y "{rut}" son el mismo dato escrito de tres formas, y
// en un contrato pueden aparecer las tres: una quedó con mayúsculas y se pegó,
// otra quedó con minúsculas. Si se contaran por como están escritos, el aviso
// diría "faltan 3 datos" cuando falta uno, y eso hace que el aviso se lea como
// ruido y se deje de mirar.
//
// El marcador SE MUESTRA como está escrito, porque es lo que hay que buscar en la
// plantilla para arreglarlo. La clave normalizada es solo para contar.
```
