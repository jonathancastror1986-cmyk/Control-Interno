# `/models` — vacío a propósito, y por qué
# =========================================

Esta carpeta está vacía, y es lo correcto en este punto.

No es que se haya olvidado: es que todavía **no se puede llenar**, y llenarla a medias sería
peor que dejarla vacía.

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

## Por qué no se puede llenar cortando

Porque las nueve entidades están **partidas en dos archivos**:

| Entidad    | `js/app.js` | `js/nucleo.js` |
|------------|-------------|----------------|
| empresa    | 107         | 18             |
| trabajador | 96          | 33             |
| supervisor | 111         | 28             |
| kit        | 185         | 23             |
| reloj      | 84          | 4              |
| permiso    | 71          | 8              |
| centro     | 63          | 19             |
| marcaje    | 52          | 3              |
| tarjeta    | 36          | 20             |

Ninguna está entera en un archivo. Todas están en los dos.

Así que no se puede "mover la empresa a `models/empresa.js`": primero hay que **juntar** las
107 y las 18 referencias, decidir cuál de las dos copias es la buena cuando no coinciden, y
después recién separar.

## Por qué juntar antes de separar

Porque juntar es donde se cuelan las funciones duplicadas. Si dos archivos tienen
`function cargarEmpresa()` y uno se copia al otro, quedan dos declaraciones con el mismo
nombre en el ámbito global.

Y eso **no da error**. El JavaScript compila, la aplicación carga, y la segunda declaración
pisa a la primera en silencio. La función que se ejecuta es la última, que puede no ser la que
se thinks.

Es exactamente lo que mide `tools/compila-juntos.js`, que hoy revisa 694 declaraciones de nivel
superior y dice que ninguna está repetida.

## El orden cuando se empiece

1. **Una entidad, un turno.** La primera tiene que ser la de menor superficie, no la más
   importante.
2. **Se junta** en un archivo temporal, sin tocar los originales.
3. **Se comprueba** que la cuenta de declaraciones no bajó: si bajó, se perdió código.
4. **Se mueve** y se actualiza el `<script src>` de `app.html`.
5. **Se abre en el navegador** y se mira que la pantalla sigue igual.
6. Recién ahí, la siguiente entidad.

Y en todo momento: `git checkout .` vuelve atrás, porque está todo commiteado.

Ver [arq-07].
