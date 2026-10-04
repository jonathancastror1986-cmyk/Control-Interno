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

TRES: las que de verdad seguían abiertas — y no eran las que estaban anotadas
--------------------------------------------------------------------------------

Acá el documento tenía un error, y está corregido porque es el que hace que alguien escriba un
JOIN que no existe.

Las tres que estaban anotadas —`inventario_qr`, `epp_kits_cargo` y `epp_kits`— NO colgaban de
`epp_entrega_items` ni de `herramientas`. Sus columnas:

    inventario_qr    id, tipo, herramienta_id, epp_codigo, nombre, precio, estado,
                     motivo_anulacion, created_at
    epp_kits_cargo    cargo, epp_codigo, cantidad, orden, especialidad_id, talla_sugerida
    epp_kits          id, especialidad_id, nombre, descripcion, orden, activo, created_at

Ninguna tiene una columna que apunte a un trabajador, y ninguna cuelga de `epp_entrega_items`. La
ruta que se describía no existe. Son catálogos: una herramienta o un EPP con código QR, qué EPP
necesita cada cargo, y los kits de una especialidad. No hay por dónde filtrarlas, y no hace
falta: su contenido es el mismo para todas las empresas.

Las dos que SÍ seguían con "cualquier usuario activo", y que no estaban en la lista, son las de
la cadena de datos de personas:

    herramientas_asignaciones   qué herramienta tiene CADA trabajador
      001_schema.sql L125
      code text not null references trabajadores(code)
      usando: exists (select 1 from perfiles p where p.id = auth.uid() and p.activo)

    epp_entrega_items            QUÉ EPP se le entregó a cada uno: el detalle
      008_epp_firma.sql L112
      entrega_id uuid not null references epp_entregas(id) on delete cascade
      usando: la misma condición

Esa condición no menciona ninguna empresa: la cumple cualquier usuario activo, de cualquier
empresa. No es una inferencia: es el texto de la política.

Y el caso de `herramientas_asignaciones` es el más raro de todos: tiene `code` contra
`trabajadores`, o sea **exactamente** la forma de un salto que la 067 ya resolvió en
`asistencia`, `marcajes` y `tarjetas`. La 067 la pasó por alto. No es un JOIN difícil: es la misma
línea, escrita y probada cuatro veces.

CUATRO: `epp_entregas` y su detalle.
--------------------------------------------------------------------------------

`epp_entregas` la cerró la 071. Pero su detalle, `epp_entrega_items`, NO tiene `code`: hay que
sacarlo de `epp_entregas`. Dos saltos.

O sea que con la 071 sola las cabeceras estaban cerradas y los renglones abiertos: se veía a
QUIÉN se le entregó EPP y no QUÉ. Y al revés también, porque la condición del detalle no miraba
la entrega. Un paso, no el final — y la 071 lo dejó escrito al final para que no se leyera como
"el EPP quedó cerrado".

Las dos las cierra la 072, que además agrega `puede_ver_entrega()`: la función del segundo salto.

El orden que propongo
--------------------------------------------------------------------------------
1. `epp_entregas` — una línea, con la función que ya existe y ya está probada.

2. `herramientas_asignaciones` y `epp_entrega_items` — las dos que seguían con "cualquier
   usuario activo". La 072 las cierra: la primera con la misma línea de un salto que la 067 ya
   escribió cuatro veces, y la segunda con `puede_ver_entrega()`, que es la función del segundo
   salto. Antes hay que correr el diagnóstico de la cadena, para saber en cuál de los cuatro
   estados está cada una.

3. `perfiles` y `perfil_roles` — el alcance de los roles, que es un problema distinto y puede
   ser más grave que cualquier filtro de filas.

4. `empresa` — ver quién tiene que ver la lista de empresas y decidir.

Y los siete catálogos quedan documentados como lo que son, que es lo que evita que alguien los
agregue a una lista de "tablas sin filtrar" dentro de un año.
