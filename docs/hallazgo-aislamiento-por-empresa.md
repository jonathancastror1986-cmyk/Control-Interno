# HALLAZGO: el aislamiento por empresa está en el navegador, no en la base
# =========================================================================

**Fecha:** 2026-10-02
**Estado:** SOLO LECTURA. No se cambió ninguna política.
**Para:** Jonathan Castro
**Urgencia:** alta, y hay una parte que no depende de cuando se arregle.

---

## 1. Qué se comprobó

Se leyeron todas las migraciones del proyecto y se buscó cada `create policy` y cada `drop
policy`, en orden, para saber **qué política está vigente hoy** y no la que se escribió
primero. Después se leyeron las columnas de las tablas mencionadas, porque una cosa es que la
tabla se pueda leer y otra es qué se lee.

---

## 2. Lo que está bien

`trabajadores` **sí está correctamente protegido**. La migración 014 reemplazó las políticas
originales:

```
migrations/014_multi_empresa.sql:288
  create policy "trabajadores por empresa read" on trabajadores for select
    using ( public.es_admin()
      or exists (select 1 from perfil_empresas pe
                  where pe.user_id = auth.uid() and pe.empresa_id = trabajadores.empresa_id) );

migrations/014_multi_empresa.sql:299
  create policy "trabajadores por empresa write" on trabajadores for all
    using ( ... ) with check ( ... )
```

Eso está bien hecho: filtra por empresa, tiene `with check` en la escritura —o sea, no se puede
escribir en una fila que después no se pueda ver— y deja pasar al administrador. La 014 también
creó `perfil_empresas` y le puso su propia política.

**Quien lo escribió sabía lo que hacía.** El comentario de la propia migración lo dice:

```
migrations/014_multi_empresa.sql:9
  No se agrega empresa_id a asistencia, tarjetas, EPP ni herramientas:
  todo eso cuelga de trabajadores (por code), así que basta con filtrar
  la lista de trabajadores para que el resto quede acotado.
```

---

## 3. El problema: "basta con filtrar" era cierto solo en un caso

La premisa de la 014 es que, si la lista de trabajadores viene acotada, todo lo demás queda
acotado. Eso es cierto **siempre que la única forma de leer esas tablas sea el propio código de
la aplicación**.

Y no es el caso. El RLS se evalúa **por tabla**, y cada tabla tiene su propia política:

| Tabla | Política vigente | ¿Filtra por empresa? |
|---|---|---|
| `trabajadores` | `014_multi_empresa.sql:288` | **sí** |
| `asistencia` | `001_schema.sql:119` — `for all using (activo)` | **no** |
| `tarjetas` | `007_tarjetas.sql:22` — `for all using (activo)` | **no** |
| `marcajes` | `017_marcajes_diarios.sql:83` — `for all using (activo)` | **no** |
| `epp_entregas` | `001_schema.sql:121` | **no** |
| `herramientas_catalogo` | `001_schema.sql:123` | **no** |
| `herramientas_asignaciones` | `001_schema.sql:125` | **no** |
| `feriados_adicionales` | `001_schema.sql:127` | **no** |
| `dia_overrides` | `001_schema.sql:129` | **no** |
| `empresa` | `001_schema.sql:131` | **no** |
| `perfiles` | `002_usuarios.sql:11` — `for all` | **no** |
| `epp_catalogo`, `epp_entrega_items` | `008_epp_firma.sql:108,112` | **no** |
| `storage.objects` (bucket `epp-respaldos`) | `008_epp_firma.sql:98` | **no** |
| `inventario_qr` | `009_qr_inventario.sql:190` | **no** |
| `epp_kits_cargo`, `epp_tallas` | `009_qr_inventario.sql:194,198` | **no** |
| `epp_especialidades` | `011_especialidades.sql:80` | **no** |
| `epp_kits` | `012_kits_multiples.sql:113` | **no** |

Todas las que dicen "no" tienen la misma forma: `for all using (existe un perfil activo)`. O
sea, **cualquier usuario activo del sistema**.

### Lo que eso permite, en concreto

Un usuario de la empresa 1 **no puede leer** a los trabajadores de la empresa 2. Pero **sí
puede leer todas las filas** de `asistencia`, `marcajes` y `tarjetas`, incluidas las de la
empresa 2, y todos los archivos del bucket `epp-respaldos`.

Y la llave anónima está a la vista. Está en `config/supabase.config.js`, que se carga en todas
las páginas, y es pública por diseño: es lo que permite que el navegador hable con la base sin
un servidor. Cualquiera la copia desde las herramientas del navegador y escribe:

```js
supabaseClient.from('marcajes').select()
```

y le devuelve todo.

---

## 4. Las dos que más pesan

### 4.1 `tarjetas.id` es el código de barras

```
migrations/007_tarjetas.sql:9
  create table if not exists tarjetas (
    id text primary key,   -- valor codificado en el QR/código de barras
    code text not null,
    tipo text not null,
    estado text not null default 'activa',   -- 'activa' | 'anulada'
```

La columna `id` **es el valor del QR**. Y `estado` dice si la credencial está activa.

Un usuario de la empresa 1 puede pedir todas las tarjetas, ver cuáles están **activas** en las
demás empresas, y tener en la mano el valor con el que se pasan. No hace falta que sea una
tarjeta física: el valor está en la respuesta de la consulta.

### 4.2 El bucket `epp-respaldos` tiene las firmas

```
migrations/008_epp_firma.sql:98
  create policy "epp respaldos rw" on storage.objects for all
    using (bucket_id = 'epp-respaldos'
       and exists (select 1 from perfiles p where p.id = auth.uid() and p.activo));
```

Ese bucket lo creó la migración **`008_epp_firma`**. Guarda las imágenes de firma y los
respaldo de EPP. Con esa política, **cualquier usuario activo puede leer las firmas de todas
las empresas**.

Una firma es el dato más personal que tiene el sistema: es la imagen de la letra de una persona,
firmada con su mano, y en un producto que se vende por cumplimiento normativo es exactamente el
tipo de dato que no debería salir de la empresa que lo generó.

---

## 5. Por qué esto no es lo mismo que el resto de los pendientes

Las otras tareas de esta lista son trabajo y se pueden hacer. Esta es distinta por dos cosas:

- **Lo que ya está adentro.** Con la llave pública, esta consulta se puede hacer **hoy**. No hace
  falta un error, ni un cambio, ni que nadie lo toque: alcanza con abrir las herramientas del
  navegador.
- **Lo que depende de que haya más de un cliente.** Y ese momento **ya llegó** en cuanto existe
  un segundo sistema leyendo la base —una API de nómina, una app móvil, un reporte— porque
  cualquier cliente nuevo escribe con la misma llave y con las mismas políticas.

Y el punto que hay que decir claro: **esto no lo introdujo ningún cambio de esta semana**. Las
políticas son de las migraciones 001, 002, 007, 008, 009, 011, 012 y 017. Lo que hizo la 014 fue
acotar `trabajadores` y dejar el resto como estaba, con un comentario que explicaba por qué
creía que era suficiente. La premisa era razonable en 2024 y hoy no lo es.

---

## 6. La recomendación, y por qué no la apliqué

**El arreglo barato existe y no requiere cambiar el esquema.**

La 014 no agregó `empresa_id` a esas tablas a propósito, y está bien: son quince tablas y una
columna cada una. Pero PostgreSQL permite que la política pregunte por otra tabla:

```sql
drop policy if exists "asistencia rw" on asistencia;
create policy "asistencia por empresa" on asistencia for all
  using (
    public.es_admin()
    or exists (
      select 1
      from public.perfil_empresas pe
      join public.trabajadores t on t.empresa_id = pe.empresa_id
      where pe.user_id = auth.uid() and t.code = asistencia.code
    )
  )
  with check (
    public.es_admin()
    or exists (
      select 1
      from public.perfil_empresas pe
      join public.trabajadores t on t.empresa_id = pe.empresa_id
      where pe.user_id = auth.uid() and t.code = asistencia.code
    )
  );
```

Lo mismo para `marcajes` y `tarjetas`. Y para `storage.objects`, con el nombre del archivo:

```sql
create policy "epp respaldos por empresa" on storage.objects for all
  using (
    bucket_id = 'epp-respaldos'
    and (
      public.es_admin()
      or exists (
        select 1
        from public.perfil_empresas pe
        join public.trabajadores t on t.empresa_id = pe.empresa_id
        where pe.user_id = auth.uid()
          and storage.objects.name like t.code || '/%'
      )
    )
  );
```

Esa última **requiere que el nombre del archivo empiece con el código del trabajador**. Hoy no se
sabe si es así, y hay que mirarlo antes de escribir la política: si el nombre es un UUID, hay
que agregar una columna o cambiar la convención de nombres.

**Por qué no lo apliqué:**

1. **Es un cambio de seguridad en producción.** Si la política queda mal, lo que se rompe es el
   acceso de gente que trabaja, en la obra, sin nadie mirando.
2. **Hay que probarlo con datos reales** —con las dos empresas que ya existen— y eso necesita la
   base, que no toco.
3. **`es_admin()` y la lista de permisos tienen que estar bien.** Un `es_admin()` mal escrito
   deja entrar a todo el mundo, y ese error no se ve hasta que alguien mira.

Y una advertencia que es de este mismo archivo: **esta migración no la aplico yo ni la aplicás
a ciegas**. Se lee, se prueba con las dos empresas, y se aplica.

---

## 7. Lo que hay que decidir

1. ¿Se arregla ahora, antes que lo otro?
2. ¿Se arreglan las quince tablas de una, o primero las tres críticas —`asistencia`, `marcajes`,
   `tarjetas`— y el bucket?
3. ¿Se avisa a alguien? Si hay datos de más de una empresa en manos de usuarios de otra, eso
   ya pasó y no se deshace solo.
4. ¿Quién lo prueba? Hace falta alguien con la base y con las dos empresas.

---

## 8. Cómo se comprueba que quedó arreglado

La consulta de auditoría, que se puede correr en el editor de Supabase sin tocar nada:

```sql
select
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and qual is not null
  and qual not like '%empresa%'
  and qual not like '%perfil_empresas%'
order by tablename;
```

Esa lista es **el backlog**. Hoy tiene quince filas. La meta es que tenga cero, o que cada fila
tenga una razón escrita al lado.

Y la prueba que de verdad importa, que es la que hay que hacer **con la sesión de un usuario de
la empresa 1**:

```js
await supabaseClient.from('marcajes').select()
// tiene que devolver SOLO los códigos de la empresa 1
```

Si devuelve códigos que no están en la lista de trabajadores que la propia aplicación le
mostró a ese usuario, el arreglo no funcionó.


================================================================================
APLICADO Y VERIFICADO (3 de octubre de 2026)
================================================================================

Lo de arriba sigue siendo cierto: el hallazgo es real y el aislamiento estaba ausente. Lo que
cambió es que ya no está.

QUÉ SE APLICÓ
----------------

  · Las 3 tablas: "asistencia", "marcajes" y "tarjetas". Políticas "por empresa", con
    "with check" en escritura y salida por "es_admin()". Migración 067.

  · Las 2 funciones de apoyo: "puede_ver_trabajador(text, uuid)" y
    "puede_ver_archivo(text, uuid)".

  · El bucket "epp-respaldos". Eso se hizo A MANO, desde el panel de Storage, porque la tabla
    "storage.objects" no es del proyecto y su dueño no es el rol del editor SQL. Migración
    068, que es el procedimiento paso a paso.

CÓMO SE VERIFICÓ
----------------

Con una consulta que devuelve UN veredicto en una fila, y no tres pantallas. La consulta
entera está en "migrations/diagnostico-aislamiento.sql", y no se copia acá porque una
consulta escrita dos veces termina siendo distinta en una de las dos. Salió:

    LISTO. La 067 está completa.

Y para el bucket, una comprobación aparte que se corrió después del paso manual:

    SELECT   USING      ((bucket_id = 'epp-respaldos') AND puede_ver_archivo(name))
    INSERT   WITH CHECK ((bucket_id = 'epp-respaldos') AND puede_ver_archivo(name))
    UPDATE   USING      ((bucket_id = 'epp-respaldos') AND puede_ver_archivo(name))

y la vieja "epp respaldos rw" NO aparece. Que es lo que cierra el agujero: mientras las dos
estuvieran, se sumaban con "o" y la vieja ganaba. Ver [rls-04].

LO QUE NO SE HIZO, Y POR QUÉ
--------------------------

No se creó la política de DELETE. Porque el código no borra de ese almacén, y se midió en vez
de suponerse:

    soporte.js:1470   .upload(path, blob, ...)   -> necesita INSERT
    soporte.js:1475   .download(path)            -> necesita SELECT

Y no hay ningún ".remove(", ".update(" ni ".move(" sobre EPP_BUCKET. Darle un permiso que la
aplicación no usa es una deuda: el día que alguien escriba la línea que borra, nadie se
acuerda de abrirla.

Y el UPDATE quedó sin "WITH CHECK", que el panel no permite porque ofrece una sola caja de
definición. Con eso, un UPDATE sobre una fila visible podría dejarla en una carpeta invisible.
No se alcanza: haría falta un UPDATE de SQL sobre "storage.objects", y la API de Storage no
tiene ninguna operación que lo produzca. Es un agujero del modelo, no de la aplicación. Ver
[sql-02].

LO QUE SIGUE ABIERTO
--------------------

  · Las 11 tablas que la 067 no tocó, por decisión escrita: una migración de seguridad sobre
    quince tablas sin datos reales es un riesgo grande. Cada una necesita su propia
    migración y su propia prueba. Ver [rls-05].

  · La prueba con la sesión de un usuario de UNA empresa, comparando lo que la aplicación le
    muestra contra lo que la base le devuelve si pregunta directo. Esa es la que falta, y es
    la que de verdad importa: hasta que corra, se sabe que las políticas están puestas, no que
    se comporten bien. Ver [rls-01].

LO QUE FALLÓ EN EL CAMINO, Y QUEDÓ ESCRITO
--------------------------------------------

Porque las tres cosas que se aprendieron hoy no sirven si después no queda escrito el porqué:

  · La 067 decía "public.storage.objects". "storage" es un ESQUEMA, no una tabla del esquema
    "public". El error que sale —"cross-database references are not implemented"— no habla de
    permisos ni de conexión: dice que no encontró el primer nombre y lo tomó por una base de
    datos. Ver [sql-01].

  · El guardián de nombres de SQL aprobó el archivo roto. Dos errores que se tapaban entre
    sí: leía un identificador después de "public." y "storage" estaba en su lista de tablas,
    así que leía un esquema, lo encontraba, y decía que todo estaba bien. Ahora tiene 7 casos
    de prueba en "tools/prueba-revisa-nombres-sql.js".

  · La migración no se puede partir a medias. Corrió dos veces con fallo y las dos veces
    revirtió todo, porque el editor SQL la ejecuta como una transacción. Quedó separado lo del
    bucket en su propio archivo, que además tiene CERO renglones de código para que no se
    pueda correr por accidente. Ver [sql-02].
