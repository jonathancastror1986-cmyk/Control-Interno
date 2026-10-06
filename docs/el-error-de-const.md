# El error de reasignar un `const`

**Fecha:** 2026-10-06
**Dónde:** `views/administracion/documentos.js`, función `cargarFirmas()`

---

## Qué pasó

La lista de "Papeles firmados" no cargaba. En pantalla:

```
No se pudieron cargar los papeles firmados.
Assignment to constant variable.
```

Y el código era:

```js
const q=window.supabaseClient.from('firmas_documento').select('*');
if(filtroFirmas.code)q=q.eq('code',filtroFirmas.code);   // ← reasigna un const
```

En JavaScript, `const` no se reasigna. Con un filtro puesto, la función tiraba
y la lista quedaba vacía.

**El arreglo:** `let` en vez de `const`.

---

## Por qué ningún guardián lo agarró

Porque **ninguno de los 27 guardianes ejecuta el código**. Comprueban que el
archivo exista, que las variables estén declaradas una vez, que los ids del
HTML estén en el JS, que los paréntesis y las comillas cierren. Este error
**solo aparece al correr**.

Es la misma clase que:

| error | síntoma |
|---|---|
| dos firmas comparadas con `!==` | el botón nunca se habilita |
| `position: fixed` que nadie miró | la hoja sale en blanco |
| `empresaDelPapel()` que devuelve `null` | la huella no se guarda |

**La regla que sale de esto:** cuando un camino nunca se ejecuta, el síntoma
es "no pasa nada", no un error. Y ningún análisis de texto lo detecta.

---

## Lo que SÍ alcanzó a detectarlo

**El mensaje de error en la pantalla.** Ese es el punto entero.

La función tenía un `catch` que ponía el error crudo en la caja, y por eso se
vio `Assignment to constant variable` en vez de una lista vacía sin explicación.

Si en algún momento ese `catch` se hubiera escrito como:

```js
catch(e){ console.warn('fallo', e); lista.innerHTML=''; }
```

el error habría sido invisible, y la pantalla habría dicho "todavía no hay
papeles firmados" — que era exactamente lo que decía, mintiendo.

---

## Por qué no hay un guardián para esto

Se intentó escribir uno (`comprueba-const.js`) y **se borró**, porque en verde
no veía el error que iba a cazar.

El problema: para leer "declaraciones" hay que sacar comentarios y cadenas del
código, y el saneado se descuadraba. Medido: veía **504 funciones de 757** —
menos de dos tercios — y aun así el contador daba verde.

La causa son las plantillas de varias líneas:

```js
box.innerHTML='<div style="background:var(--warn)">'
   +'padding:10px;...">';
```

La comilla abre en un renglón y cierra en otro. Un saneado línea-por-línea no
las empareja, y a partir de ahí **el archivo entero se vuelve "cadena"**.

### Lo que habría que hacer

1. **Una sola pasada** que saltee comentarios y cadenas, en ese orden, sin
   partir por líneas. Esa parte se resolvió y funciona.
2. **Contar llaves** para hallar el cuerpo de cada función, en vez de buscarla
   por el nombre. Esa parte también se resolvió.
3. **Un control que avise cuando no ve todo.** Es lo más importante:

   ```js
   if (cuerposHallados < funcionesEnElArchivo * 0.9) {
     console.log('*** ESTE GUARDIÁN NO ES FIABLE');
     process.exit(1);
   }
   ```

   Comparar contra el número de funciones del **archivo original**, que se cuenta
   sin sanear. Si el saneado se come algo, el número baja y el guardián lo dice
   en vez de callarse.

**El punto 3 es el que no habría que saltarse nunca.** Un guardián que no ve lo
que dice ver entrena a que ignores la lista entera, y ese costo lo paga el
próximo error real.

### El límite declarado

Una expresión regular con llaves, como `/[{}]/`, cuenta sus llaves y puede
descuadrar el conteo. En este proyecto hay unas pocas.

---

## Lo que hay que hacer cuando un fallo es invisible

Esto ya estaba decidido, y este caso lo confirma:

> Si hace falta autorización, avanzar lo máximo sin preguntar. Pero verificar en
> navegador real, y probar que las comprobaciones pueden fallar inyectando el
> bug.

Un fallo invisible no se encuentra leyendo. Se encuentra con un botón en una
página, y con un `catch` que **muestra** el error en vez de tragárselo.