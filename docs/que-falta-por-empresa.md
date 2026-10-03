Las once tablas que la 067 no tocó, y por qué
================================================================================

Medido el 3 de octubre de 2026, con `tools/mira-las-tablas.js` y
`tools/mira-los-catalogos.js`. Los dos leen los `create table` de las migraciones y no
suponen nada.

El hallazgo original decía quince tablas sin filtro de empresa. Sigue siendo cierto que su
política es "cualquier usuario activo". Lo que cambia es cuántas de esas quince necesitan
algo, y por qué.

Las tres listas
--------------------------------------------------------------------------------
Con `empresa_id`, el filtro sería directo:

    (ninguna)

Ninguna de las quince tiene `empresa_id`. Todas cuelgan por `code`, y el filtro es un JOIN, que
es exactamente lo que hace la 067 con `trabajadores`. Agregar la columna sería cambiar quince
esquemas para resolver lo que un JOIN resuelve, y una columna que hay que mantener
sincronizada es una que algún día no lo está.

CUELGAN DE OTRA, y el filtro es un JOIN:

    trabajadores        asistencia           marcajes
    epp_entregas        herramientas_asignaciones
    perfiles            epp_entrega_items     inventario_qr
    epp_kits_cargo      epp_kits

NO CUELGAN DE NINGUNA, y aquí está el trabajo de verdad:

    tarjetas            herramientas_catalogo
    feriados_adicionales    dia_overrides
    empresa             epp_catalogo          epp_tallas
    epp_especialidades

Por qué la última lista no es un agujero de seguridad
--------------------------------------------------------------------------------
Y esto es lo que faltaba medir en el hallazgo original, y es lo que hace que la lista no sea
de quince problemas sino de cuatro.

Una tabla cuyo contenido es el mismo para la empresa A y para la B no tiene nada que filtrar.
Agregarle una condición de empresa sería inventar un dato que la tabla no tiene.

Mirando las columnas, una por una:

    herramientas_catalogo   id, nombre, precio
    feriados_adicionales    fecha, descripcion
    dia_overrides           fecha, tipo
    empresa                 id, nombre, logo_url
    epp_catalogo            codigo, nombre, detalle, requiere_talla, activo
    epp_tallas              talla, tipo, orden
    epp_especialidades      id, clave, nombre, descripcion

Siete catálogos. El mismo grupo de herramientas cuesta lo mismo en todas las obras. Un feriado
es un feriado. La lista de tallas es la lista de tallas. **Ninguna tiene un solo dato de una
empresa en particular**, así que filtrarlas no protegería nada: una empresa no puede leer el
catálogo de otra porque no hay un catálogo de otra.

`empresa` es el caso raro: es la tabla de las empresas, y sin filtro cualquiera ve la lista de
todas. Eso sí es un dato que puede ser sensible —razones sociales, rut— y es la única de esta
lista que de verdad hay que mirar.

Las cuatro que sí quedan, y qué hay que hacer con cada una
--------------------------------------------------------------------------------
UNA: `tarjetas`.

Ya está resuelta. La 067 le puso `puede_ver_trabajador(tarjetas.code)`, y `tarjetas.code` no
tiene clave foránea a `trabajadores` —a propósito, para poder dejar la tarjeta aunque el
trabajador se borre—, así que las tarjetas huérfanas quedan solo para el administrador. Esa es
la dirección segura: una credencial que nadie puede leer, nadie la puede usar. Ver [rls-03].

DOS: `perfiles`.

Cuelga de `auth.users`, no de una empresa, así que el filtro por empresa no aplica. Pero es
donde vive la información de las personas y es la tabla con más permisos metidos a mano por la
002. Lo que hay que revisar es si `perfil_roles` —los roles de cada usuario— está acotado por
empresa, porque un usuario con rol de otra empresa es un problema de alcance de rol, no de
filas.

TRES: `inventario_qr`, `epp_kits_cargo`, `epp_kits`.

Cuelgan de `epp_entrega_items` y de `herramientas`, que a su vez cuelgan de `trabajadores`. El
camino del JOIN tiene dos saltos, y ese es el caso donde conviene medir en vez de suponer: si
un kit se puede leer, se puede saber qué lleva puesto cada trabajador, que es información de
personas aunque el kit en sí sea un catálogo.

CUATRO: `epp_entregas`.

Cuelga de `trabajadores` por `code`, y es la que registra qué se le entregó a quién y cuándo.
Tiene el mismo patrón que `asistencia`, que la 067 ya resolvió con `puede_ver_trabajador`. El
cambio sería una línea más.

El orden que propongo
--------------------------------------------------------------------------------
1. `epp_entregas` — una línea, con la función que ya existe y ya está probada.

2. `inventario_qr`, `epp_kits_cargo` y `epp_kits` — los tres con el JOIN de dos saltos. Primero
   midiendo qué se ve hoy con la llave anónima, porque la pregunta es si hay algo que
   proteger.

3. `perfiles` y `perfil_roles` — el alcance de los roles, que es un problema distinto y puede
   ser más grave que cualquier filtro de filas.

4. `empresa` — ver quién tiene que ver la lista de empresas y decidir.

Y los siete catálogos quedan documentados como lo que son, que es lo que evita que alguien los
agregue a una lista de "tablas sin filtrar" dentro de un año.
