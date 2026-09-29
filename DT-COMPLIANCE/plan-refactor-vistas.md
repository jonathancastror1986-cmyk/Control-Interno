# Plan: separar vistas, funciones y estilos en clases

**Rama:** `test` (nunca `main`).
**Cuándo:** después de que `main` esté al día y published, no antes.
**Estado:** plan. No es trabajo empezado.

Este documento está escrito hoy y describes un trabajo pendiente.
Se implementa en la rama `test` y llega a `main` cuando esté probado,
no antes.

---

## Por qué ahora, y por qué no hoy

`pages/app.html` tiene hoy unas 17.000 líneas: HTML, CSS y JavaScript en el
mismo archivo. Funciona y está probado. El problema no es que esté feo: es que
cada cambio toca el mismo archivo gigante, y por eso cualquier edición es
arriesgada. Ya se rompió por eso varias veces durante el desarrollo (un
`replace` que borró `id="diariaLista"`, una tabla de iconos insertada como un
solo string que corrió 47 líneas de índices, un `while` hacia atrás que dejó
`styles.css` en 5 KB).

Ese es el argumento a favor. El argumento en contra: hoy **funciona**, y
cualquier refactor grande puede romper cosas que nadie va a notar hasta que
falla en la operación. Por eso esto va en `test`.

---

## Qué se propone

### 1. Las vistas salen del HTML

Hoy cada pantalla es un `<div id="v-...">` con su contenido escrito en el
archivo, y una función que la dibuja. Se propone que cada vista sea una clase,
con su propio archivo:

```
js/vistas/entrega-epp.js       class VistaEntregaEpp
js/vistas/marcajes.js          class VistaMarcajes
js/vistas/bienestar.js         class VistaBienestar
```

Todas con la misma forma:

```js
class Vista {
  mount(contenedor) {}     // se pinta
  update() {}              // se refresca con los datos nuevos
  unmount() {}             // se limpian los escuchas
}
```

Por qué una clase y no una función más:

- Una función no tiene memoria. Cada vista necesita guardar su fila seleccionada,
  su filtro y su pestaña activa; con funciones eso vive en variables sueltas
  sueltas en el archivo, y por eso hoy hay `supTabs`, `conTabla` y compañía
  declaradas fuera de cualquier parte.
- `unmount()` es lo que hoy no existe. Al cambiar de vista se quedan escuchas
  viejos apuntando a elementos que ya no están, y eso se come memoria sin
  avisar.

**Cómo se comprueba:** el número de escuchas en `document` no crece al cambiar
de vista veinte veces seguidas. Esa es la prueba, y hoy no se puede hacer.

### 2. Las funciones se agrupan por vista

Cada función pasa al archivo de la vista que la usa, y se le pone `privada` en
la práctica (convención: lo que empieza con `_` no se llama desde afuera).

Lo que **no** se mueve: `handleScannedCode`, `camScanArea`, `showGroup`,
`tituloDeLaSeccion` y todo lo que comparte el reloj, porque son de varias vistas
a la vez y sacarlos rompe el llamador.

### 3. El CSS se separa en clases por vista

Hoy el CSS tiene capas que se pisan: hay cuatro reglas de
`[data-group="bodega"]` y gana la última. Con clases, cada vista lleva sus
estilos y no toca los de las demás.

Cada bloque del CSS que hoy se aplica por `#id` pasa a `.v-entraga-epp .algo`.
Cambiar de `#id` a `.clase` es lo que hace falta para que dos vistas puedan
compartir estilo sin pisarse.

### 4. Temas: la parte que pediste specifically

Ahora hay dos temas, claro y oscuro, y el color de cada sección tiene DOS tonos,
uno por tema. Eso ya funciona.

Lo que se propone es que los tonos dejen de estar escritos a mano en el CSS y se
**calculen**, con una función que tome el color de la sección y devuelva el tono
de cada tema y cada escalón de la barra. Hoy eso ya está hecho en un script,
pero el resultado está pegado en el archivo. La idea es que se pueda elegir:

- el color de la sección,
- el tema (claro u oscuro),
- cuántos escalones quiere la barra,

y que el CSS se arme solo. Con eso, cambiar la paleta entera es cambiar una
tabla de siete colores, no editar cuarenta reglas.

**Lo que no se va a hacer:** un selector de tema por sección, con un color
distinto en cada barra del encabezado. Se vería mal y no aporta nada.

---

## Orden sugerido

1. **`Vista` base y `unmount()`.** Lo primero, porque es lo que más falla y lo
   que menos se nota. Sin esto, todo lo demás se hace sobre una base que
   acumula escuchas.
2. **Una sola vista** como prueba: Marcajes. Es la más simple y la que más se
   usa. Si sale bien, el patrón está probado con la de menor riesgo.
3. **Las demás, de una en una**, con un commit cada una.
4. **El CSS a clases**, en el mismo commit que cada vista, no todo junto.
5. **El cálculo de tonos**, al final, cuando las clases ya existan: es el paso
   que más borra código.

---

## Lo que no cambia

- **La base de datos.** Nada de esto toca migraciones ni el modelo.
- **La auditoría.** `security definer` y las funciones de la base se quedan.
  El navegador no es la puerta, y no va a empezar a serlo.
- **Sin build.** Sigue siendo HTML y JS que se abren en el servidor. Si este
  plan metiera un `npm run build`, se pierde la ventaja de poder abrir el
  archivo y ver qué hace.
- **Los permisos y los roles.** No se tocan.

---

## Cómo se sabe que salió bien

- `app.html` baja de 17.000 líneas a menos de 2.000 (solo el arranque y el
  esqueleto).
- Al cambiar de vista veinte veces, el número de escuchas en `document` es el
  mismo que al empezar.
- Todo lo que hoy está en las nueve suites sigue en verde en cada commit.
- La barra sigue teniendo los tres escalones medidos, y los contrastes de los
  siete, medidos y no supuestos.

---

## Advertencia honesta

Este es el refactor más grande que puede hacer este proyecto, y es el que
menos problema resuelve de los que están en la lista. El problema real que
queda abierto es de otro tipo:

- Los 30 minutos de tolerancia de la conciliación, contra qué se comparan.
- El formato de importación de Nubox, que todavía no se sabe.
- Las tarjetaswallet, que necesitan un certificado del servidor.

Este plan no toca ninguno de los tres. Es orden interno, no avance funcional.
Se hace porque a la larga es lo que hace que los demás cambios sean seguros, no
porque hoy el programa esté lento.
