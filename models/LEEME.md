# `/models` — vacía a propósito, y por qué
# =========================================

Esta carpeta está vacía, y es lo correcto en este punto.

No es que se haya olvidado: es que todavía **no se puede llenar**, y llenarla a medias sería
peor que dejarla vacía.

---

## Lo que debería vivir acá

Un archivo por entidad, con los datos y las reglas de esa entidad y nada más:

```
models/empresa.js      Empresa
models/trabajador.js   Trabajador
models/nomina.js       (cuando haga falta)
models/index.js        el barril, que reexporta
```

Cada modelo habla con la base SOLO a través de su repositorio. Y un repositorio es lo único
en todo el proyecto que puede tocar `window.supabaseClient`.

---

## Por qué no se puede llenar cortando

**Este archivo estaba mal y se corrigió.** Decía:

> *Hay que juntar las 107 y las 18 referencias de la empresa y decidir cuál de las dos copias
> es la buena.*

Es falso, y por una razón que cambia el plan entero: **no hay 107 lugares de la empresa.**
Hay 107 **menciones de la palabra** "empresa". Y una mención puede ser:

- el nombre de una columna,
- el de una variable local dentro de una función,
- el de una opción de un menú,
- el identificador de una pantalla.

De 107 menciones, unas cuántas son lógica de la entidad.

Y el caso de "marcaje" es el que lo deja claro: sus 81 apariciones son una tabla, una columna,
tres variables locales y un identificador de pantalla. **Cero declaraciones de nivel superior
se llaman `marcaje*`.** Filtrar por nombre no encuentra la entidad: encuentra palabras.

El dato del que había que partir —"nueve entidades repartidas en dos archivos"— salió de
contar menciones, no de encontrar declaraciones. El número era real y la conclusión que se
sacaba de él, no. Ver [arq-07].

---

## El camino que sí funciona

**Partir de la consulta, no del nombre.**

Cada vez que el código dice `.from('empresa')` está tocando la tabla `empresa`, y esa línea es
un ancla que no depende de cómo se llamen las funciones de arriba. Y después hay que subir: ¿en
qué **función** está esa línea? Porque la función es la unidad que se mueve, no la línea.

Lo medido hasta ahora:

| Tabla      | Archivos que la tocan | Funciones distintas |
|------------|----------------------|---------------------|
| `marcajes` | 4                    | varias              |

Y `marcajes` está repartida en `js/app.js`, `views/administracion/administracion.js`,
`views/administracion/documentos.js` y `views/asistencia/relojes.js` — **cuatro archivos, no
dos**. Es decir que la tabla no está en "funciones de marcajes": está en "la función que pinta
la vista de marcajes", "la que importa el CSV" y "la que lee el historial para el reloj".

Que es exactamente por qué no se puede "mover la entidad": hay que decidir primero qué de eso
es del modelo y qué de la vista, y esa decisión no se toma cortando.

---

## El orden cuando se empiece

1. **Una entidad, un turno.** La primera tiene que ser la de menor superficie, no la más
   importante.
2. **Se traza** con `.from(...)`, no por nombre, y se escribe la lista de funciones que tocan
   la tabla.
3. **Se decide** qué de eso es el modelo y qué es la vista. Esa decisión queda escrita.
4. **Se mueve** a `/models`, y se actualiza el `<script src>` de `app.html`.
5. **Se comprueba** que la cuenta de declaraciones de nivel superior no bajó. Si bajó, se
   perdió código. Lo mide `tools/compila-juntos.js`.
6. **Se abre en el navegador** y se mira que la pantalla sigue igual.
7. Recién ahí, la siguiente entidad.

Y en todo momento: `git checkout .` vuelve atrás, porque está todo commiteado.

---

## Lo que NO se hace

- **No se agrega `empresa_id` a las tablas que cuelgan del trabajador por `code`.** No hace
  falta: el RLS puede preguntar por otra tabla, y hay funciones para eso desde la 067. Ver
  [rls-01].
- **No se mueven `trabajadores` y `empresa` primero.** Son las dos entidades más grandes y las
  dos están repartidas en muchos lugares. Empezar por ahí es la forma más común de no terminar
  nunca: si el primer ejemplo es el difícil, no hay segundo ejemplo y el patrón queda sin
  probar.
- **No se toca `js/app.js` ni `js/nucleo.js`.** Son el núcleo, no un módulo. Se quedan.
