-- ===================================================================
-- 093: PLANTILLAS DE SOLICITUD DE DOCUMENTOS INICIALES
-- ===================================================================
--
-- QUÉ ES
-- ------
-- Plantillas de documentos que la empresa solicita al trabajador al
-- ingresar (o cuando se da de baja / se traslada): solicitud inicial de
-- documentos, declaraciones, constancias.
--
-- Se reutiliza la tabla "plantillas" creada en la 058: un documento se
-- arma una vez y se vuelve a llenar para cada trabajador. Aquí se cargan las
-- plantillas base para la solicitud de documentos iniciales, de la empresa
-- (empresa_id NULL = de todas las empresas).
--
-- Y NO se borra nada: solo se insertan. La baja de una plantilla se hace con
-- "baja_plantilla" (activa=false), porque una plantilla con la que se emitió
-- un documento es el respaldo de ese documento.
--
-- ES RE-EJECUTABLE EN LO DE FONDO: el insert es para una plantilla nueva con
-- nombre propio; si ya existe, se puede ignorar o repetir con el mismo nombre.

insert into public.plantillas (nombre, tipo, descripcion, html, css, empresa_id)
values
  ('Solicitud de documentos iniciales', 'doc',
   'Solicitud inicial de documentos para trabajadores', 
   '<p>Solicitud de documentos iniciales para el trabajador {{nombre_completo}}.</p>', 
   '', null);

-- -------------------------------------------------------------------
-- CIERRE EN DDL (el panel corre la migracion en una sola transaccion y si la
-- consulta de control falla revierte todo)
-- -------------------------------------------------------------------
comment on table public.plantillas is
  'Plantillas de documentos que se arman una vez y se llenan para cada trabajador: hoja de life, contrato, carta, anexo, encuesta, declaracion de salud, y solicitudes iniciales de documentos. El "html" lleva los campos como {{nombre}; el "css" es el aspecto. "empresa_id" NULL es una plantilla que sirve para todas las empresas.';
