-- 060_PLANTILLAS_TRES_SINTAXIS.sql
-- =========================
--
-- EL AGUERO
-- ---------
--
-- "campos_de_plantilla" despeja los campos con la forma "{{nombre}}". Y "completarPlantilla", en
-- el navegador, reemplaza la forma "[NOMBRE]".
--
-- Son dos idiomas y el documento tiene que estar en los dos para funcionar: uno lo revisa y el
-- otro lo llena. Una plantilla escrita con "{{nombre}}" —que es lo que el comentario de la
-- tabla, el texto de ayuda de la pantalla y el ejemplo de la 058 le dicen que escriba— pasa la
-- revisión y nunca se completa. El documento sale con las llaves adentro y sin ningún error.
--
-- Y ESO SE VIO: una plantilla con "{{nombre_completo}}" en el encabezado, en el cuerpo y en la
-- firma, que el editor decía reconocer y que nunca iba a llenar nadie.
--
--
-- POR QUÉ UNA MIGRACIÓN Y NO ARREGLAR LA 058
-- ------------------------------------------
--
-- Porque las migraciones ya corrieron. Editar el archivo 058 cambia lo que se lee al crear de
-- cero, y no cambia nada en la base de quien ya la corrió, que es justamente donde está el
-- problema.
--
--
-- LAS CUATRO FORMAS
-- -----------------
--
--   [CAMPO:7-licencia]    un campo propio de la empresa
--   [NOMBRE]              la forma que se escribe de nuevo
--   {{nombre}}            la que usaban los documentos armados antes
--   {nombre}              la que se escribe por error queriendo una de las otras
--
-- Se aceptan las cuatro en los dos lados. La que se escribe es la segunda; las otras se siguen
-- reemplazando para lo que ya está armado, porque un documento que deja de llenarse a mitad es
-- peor que un documento con una sintaxis de más.
--
-- Y "{nombre}" sin llaves dobles se acepta porque se escribe mucho por error: se parece a las
-- otras y a una llave de estilos. Si alguien lo escribió queriendo un campo, hoy tiene un texto
-- suelto en el documento sin que nadie lo advierta.
--
--
-- Y LO QUE NO SE ACEPTA
-- ----------------------
--
-- "{ }" con espacios adentro y "{}" vacío. Ahí ya no se sabe qué se quiso escribir, y adivinar
-- es peor que dejar el texto.
--
--
-- EL ORDEN, Y POR QUÉ AQUÍ NO IMPORTA
-- ------------------------------------
--
-- Las cuatro alternativas se prueban sobre el MISMO texto, cada una por separado, y se unen.
-- No se encadenan.
--
-- Y por eso "[CAMPO:7-licencia]" NO se cuenta dos veces: el patrón de los corchetes solos pide
-- "[", luego letras, números o guion bajo, y "]". Adentro hay una ":" que no está en esa clase,
-- así que después de "CAMPO" no viene "]", y no hay coincidencia.
--
-- El orden SÍ importa para REEMPLAZAR, que es lo que hace el navegador: ahí "[CAMPO:7-licencia]"
-- se partiría en "[7-licencia]" si se buscara "[" primero. Son dos cosas distintas. Ver
-- [forma-02].
--

create or replace function public.campos_de_plantilla(p_html text)
returns text[]
language sql
immutable
as $$
  -- Y "distinct" porque el mismo campo puede aparecer varias veces en un documento: el nombre
  -- va en el encabezado y en el pie, y eso son dos apariciones de un solo campo.
  --
  -- Y las cuatro alternativas en un solo SELECT con "union all", no cuatro SELECT unidos: con
  -- cuatro, un documento que usa las cuatro formas devuelve la lista cuatro veces, y el que lo
  -- lee cuenta variables que no existen.
  select coalesce(array_agg(distinct m.clave order by m.clave), '{}')
    from (
      select (regexp_matches(coalesce(p_html, ''), '\[CAMPO:\s*([a-z0-9_-]+)\s*\]', 'gi'))[1] as clave
      union all
      select (regexp_matches(coalesce(p_html, ''), '\[\s*([A-Z0-9_]+)\s*\]', 'g'))[1]
      union all
      select (regexp_matches(coalesce(p_html, ''), '\{\{\s*([a-z0-9_]+)\s*\}\}', 'gi'))[1]
      union all
      select (regexp_matches(coalesce(p_html, ''), '\{([a-z][a-z0-9_]*)\}', 'g'))[1]
    ) as m
    where m.clave is not null;
$$;

comment on function public.campos_de_plantilla(text) is
  'Devuelve la lista de campos que aparecen en el html, sin repetir, en cualquiera de las cuatro
  formas: "[CAMPO:7-licencia]", "[NOMBRE]", "{{nombre}}" o "{nombre}". La que se escribe de nuevo
  es "[NOMBRE]". Es lo que revisa el editor para saber qué datos necesita el documento.';

--
-- Y LOS COMENTARIOS DE LA TABLA, QUE DIGAN LA VERDAD
-- --------------------------------------------------
--
-- Y esto es lo más importante de la migración. El comentario de la columna decía "{{nombre}}",
-- que es la forma que el navegador NO reemplaza.
--
-- Un comentario de tabla es lo que alguien lee cuando está frente al error. Si miente, lo manda
-- a buscar por el lado equivocado, y el error cuesta un día entero.
--
comment on table public.plantillas is
  'Documentos que se arman una vez y se llenan para cada trabajador: hoja de life, contrato,
  carta, anexo, encuesta, declaracion de salud. Los campos se escriben entre corchetes en
  mayusculas: [NOMBRE], [RUT], [FECHA_INGRESO]. El "css" es el aspecto. "empresa_id" NULL es una
  plantilla que sirve para todas las empresas.';

comment on column public.plantillas.html is
  'Estructura del documento. Los campos van entre corchetes en mayusculas: [NOMBRE],
  [APELLIDO_PATERNO], [EMPRESA], etc. La lista exacta la da la funcion campos_de_plantilla. Se
  aceptan tambien {{nombre}} y {nombre} para los documentos armados antes de esta migracion, pero
  no se usan para escribir de nuevo.';

comment on function public.campos_de_trabajador() is
  'Los campos que se pueden poner en una plantilla, con su etiqueta y su tipo. Se escriben entre
  corchetes en mayusculas: [CODIGO], [NOMBRES], [NOMBRE_COMPLETO]. "nombre_completo" se arma con
  los tres nombres. "especialidad" es el cargo del kit.';

--
-- -------------------------------------------------------------------
-- POR QUÉ ESTE ARCHIVO NO SE GENERA CON UN GUION
-- -------------------------------------------------------------------
--
-- Se escribió primero con un guion de JavaScript, con la migración adentro de una cadena. Y la
-- cadena se COMIÓ las barras invertidas: "'\[\s*'" llegó al archivo como "'[s*'", y en
-- PostgreSQL eso no es un corchete ni un espacio: es un rango de caracteres. La función que
-- quedó instalada no encontraba campos, y no daba ningún error: devolvía la lista vacía, que es
-- lo que pasa igual cuando no hay nada que llenar.
--
-- La barra invertida se escapa en JavaScript antes de llegar al archivo, y entre la capa que
-- la escribe y la que la transmite se pierde. Por eso este archivo se escribe directo, y por eso
-- "tools/comprueba-060.js" revisa que las cuatro alternativas sigan con su barra.
--
-- Ver [forma-03].
