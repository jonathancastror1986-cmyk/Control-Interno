-- 063_autorizacion_firma.sql
-- ==========================
--
-- EL POR QUÉ
-- ------------
--
-- La Dirección del Trabajo, en el ORD. N°1318 de 2023, dice:
--
--     la normativa vigente requiere que la autorización del trabajador incluya EL TIPO DE FIRMA
--     (electrónica o manuscrita)
--
-- Y en el mismo dictamen:
--
--     si el trabajador no aceptara la utilización de medios electrónicos para los fines
--     señalados, respecto de él se deberá operar siempre en soporte de papel y, cuando un
--     documento requiera firma, ella deberá ser HOLOGRÁFICA
--
-- Traducción: hay que poder mostrar que el trabajador autorizó, Y que el sistema tiene que
-- poder mostrar cuál fue el tipo de firma que autorizó. Un checkbox que alguien tilda en una
-- pantalla, sin fecha y sin saber quién lo preguntó, no es una autorización: es un dato sin
-- respaldo.
--
-- Ver [firma-05].
--
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA EN "trabajadores"
-- -------------------------------------------------------
--
-- Porque es un SUCESO, no un atributo. El trabajador puede cambiar de opinión: hoy acepta la
-- firma electrónica y mañana la rechaza. Si fuera una columna, se perdería lo anterior, y lo
-- que hay que poder mostrar es "qué aceptó, cuándo y quién se lo preguntó".
--
-- Y eso es lo que va a preguntar un fiscalizador: no "¿qué dice ahora?", sino "¿qué aceptó
-- usted, y cuándo?".
--
--
-- Y POR QUÉ SE GUARDA EL HISTORIAL COMPLETO Y NO SOLO EL ÚLTIMO
-- -----------------------------------------------------------------
--
-- Por lo mismo. Si el trabajador acepta hoy y rechaza mañana, el papel que se le entregó
-- cuando aceptaba sigue valiendo porque seguía firmado cuando él sabía lo que
-- firmaba. Con una sola fila, esa línea desaparece.
--
-- Ver [firma-06].
--
--
-- EL "explicado": LA PARTE QUE SUELE OLVIDARSE
-- -----------------------------------------------
--
-- Un registro que dice "aceptó firma electrónica" no dice que se le explicó qué estaba
-- aceptando. El ORD. N°0789/015 exige que el sistema se le muestre al trabajador, y sin eso el
-- registro es una afirmación sin respaldo.
--
-- El texto de la explicación se guarda tal como se mostró, no un código. Así, si algún día la
-- explicación cambia, los registros viejos siguen diciendo lo que el trabajador vio ese día.
-- Ver [firma-07].
--

create table if not exists public.firma_autorizaciones (
  id                  uuid primary key default gen_random_uuid(),

  -- A quién se le preguntó. El código, y no el id, porque es el que usan todos lados y porque
  -- la ficha se puede desvincular sin borrar esto.
  trabajador_code     text not null references public.trabajadores(code) on delete cascade,
  empresa_id          integer references public.empresa(id) on delete cascade,

  -- Si acepta el papel por medios electrónicos.
  acepta_electronica  boolean not null,

  -- Y DE QUÉ TIPO acepta. O sea, qué firma autoriza para esos papeles.
  --
  -- Y el CHECK ata las dos cosas: si no acepta el electrónico, no hay tipo de firma, porque no
  -- hay nada que autorizó. Y si acepta, tiene que decir de qué tipo.
  tipo_firma          text,
  constraint firma_autorizaciones_tipo_check
    check (tipo_firma in ('electronica','manuscrita')),
  constraint firma_autorizaciones_coherencia_check
    check (
      (acepta_electronica and tipo_firma is not null) or
      (not acepta_electronica and tipo_firma is null)
    ),

  -- Lo que se le explicó, tal como se le mostró. Ver el comentario de arriba.
  explicado           text,

  -- Por qué no aceptó, cuando no aceptó. Que es lo primero que va a preguntar un fiscalizador
  -- si después aparece un papel sin firma electrónica.
  motivo_rechazo      text,

  -- Y QUIÉN SE LO PREGUNTÓ, Y CUÁNDO. Sin esto el registro no dice nada de quién lo shoveó a
  -- firmar.
  --
  -- Y el nombre, y no solo el id del usuario, porque el usuario se puede eliminar y el registro
  -- tiene que seguir diciendo quién fue. Es el mismo criterio que usa "plantillas_contratacion"
  -- con el nombre de la plantilla. Ver [firma-08].
  consultado_por      text,
  registrado_at       timestamptz not null default now()
);

-- -------------------------------------------------------------------
-- LA ÚLTIMA AUTORIZACIÓN, QUE ES LA QUE RIGE
-- ---------------------------------------------------------
--
-- Y es un índice con orden inverso, porque la consulta siempre es la misma: "dime lo último que
-- dijo este trabajador". Un índice por defecto no la ayuda.
--
create index if not exists firma_autorizaciones_ultima_idx
  on public.firma_autorizaciones (trabajador_code, empresa_id, registrado_at desc);

-- Y uno por empresa sola, para la pantalla donde uno ve quién signed con qué.
create index if not exists firma_autorizaciones_empresa_idx
  on public.firma_autorizaciones (empresa_id, registrado_at desc);

comment on table public.firma_autorizaciones is
  'Registro de lo que cada trabajador autoriza sobre la firma de sus documentos. Es un HISTORIAL,
  no un atributo: el trabajador puede cambiar de opinión y los papeles ya firmados siguen
  valiendo porque estaban firmados cuando él sabía lo que firmaba. Ver el ORD. N°1318 de 2023 de
  la Direccion del Trabajo, que exige que la autorizacion incluya el TIPO de firma.';

comment on column public.firma_autorizaciones.tipo_firma is
  'Que tipo de firma autoriza para los documentos electronicos: "electronica" o "manuscrita".
  Es NULL cuando no acepta el medio electronico, y en ese caso el papel va en papel con firma
  holografica, segun el mismo dictamen.';

comment on column public.firma_autorizaciones.explicado is
  'El texto de lo que se le explico, tal como se le mostro. Se guarda el texto y no un codigo, para
  que si un dia la explicacion cambia, los registros viejos sigan diciendo lo que el trabajador
  vio ese dia.';

-- -------------------------------------------------------------------
-- QUIÉN PUEDE VER Y QUIÉN PUEDE ESCRIBIR
-- ------------------------------------------------
--
-- Y se separan las dos cosas. Ver es para cualquiera que abra la ficha. Escribir es para quien
-- tiene el permiso: el registro tiene que firmarse por alguien con autorización, y "escribir"
-- es escribir en nombre del trabajador.
--
-- Y "actualizar" y "borrar" están cerrados con "false". Un registro de autorización que se puede
-- modificar no es un registro: es una anotación. Ver [firma-09].
--
alter table public.firma_autorizaciones enable row level security;

-- Nadie edita ni borra. Nunca. Ver [firma-09].
drop policy if exists "firma autorizaciones no update" on public.firma_autorizaciones;
create policy "firma autorizaciones no update" on public.firma_autorizaciones
  for update using (false);

drop policy if exists "firma autorizaciones no delete" on public.firma_autorizaciones;
create policy "firma autorizaciones no delete" on public.firma_autorizaciones
  for delete using (false);

-- Leer: el que está en la empresa, o el que tiene el permiso.
drop policy if exists "firma autorizaciones read" on public.firma_autorizaciones;
create policy "firma autorizaciones read" on public.firma_autorizaciones
  for select using (
    public.es_admin()
    or public.tiene_permiso('documentos.ver')
    or exists (
      select 1 from public.perfil_empresas pe
       where pe.user_id = auth.uid()
         and (pe.empresa_id = firma_autorizaciones.empresa_id or firma_autorizaciones.empresa_id is null)
    )
  );

-- Escribir: solo con permiso explícito. Y la fila nueva no se puede editar después.
drop policy if exists "firma autorizaciones write" on public.firma_autorizaciones;
create policy "firma autorizaciones write" on public.firma_autorizaciones
  for insert with check (
    public.es_admin()
    or public.tiene_permiso('documentos.autorizar_firma')
  );

grant select, insert on public.firma_autorizaciones to authenticated;

-- -------------------------------------------------------------------
-- LOS PERMISOS, QUE SI NO NO HAY NADIE QUE PUEDA ESCRIBIR
-- -------------------------------------------------------------
--
-- Las políticas de arriba usan "documentos.ver" y "documentos.autorizar_firma". Si esos
-- permisos no están en el catálogo, "tiene_permiso" devuelve falso siempre, y la tabla queda
-- con permiso de leer para el que está en la empresa pero SIN permiso de escribir para nadie.
--
-- Y eso no da ningún error. La tabla se crea, las políticas se crean, y el primer ingreso de
-- una autorización falla con un "no se pudo insertar la fila" que no dice nada de un permiso que
-- falta.
-- Ver [firma-10].
--
-- Y "documentos.autorizar_firma" es un permiso APARTE del de "plantillas.gestionar", a
-- propósito: crear un papel es una cosa, y registrar que el trabajador autorizó a firmarlo es
-- otra, y la segunda es la que queda registrada a nombre de la empresa. Quien puede armar el
-- contrato no tiene por qué poder firmar en nombre del trabajador.
--
insert into public.permisos (clave, descripcion, categoria, orden)
values ('documentos.ver',              'Ver los documentos y las autorizaciones de firma', 'contratacion', 170),
       ('documentos.autorizar_firma',  'Registrar que un trabajador autoriza la firma de sus documentos', 'contratacion', 171)
on conflict (clave) do nothing;

-- Y que el administrador tenga los dos, porque si no la tabla nace sin quien escriba y el
-- primer ingreso de una autorización hay que hacerlo a mano en la base.
--
-- Y ACÁ ESTÁ EL ERROR QUE ME COMÍ
-- ---------------------------------
--
-- La primera versión de esta migración decía "from public.roles", "r.clave" y "r.sistema".
--
-- No existe una tabla "roles". La que hay es "roles_sistema", con la clave en la columna
-- "rol", y no tiene columna "sistema": el rol con acceso total es el que se llama 'admin', y es
-- un valor de "rol", no una bandera.
--
-- Con "public.roles" el "insert" tiraba "42P01: relation public.roles does not exist", y como
-- va después de crear la tabla y las políticas, la migración se caía en el último paso: la
-- tabla quedaba creada, las políticas hechas, y los permisos sin dárselos a nadie. Un estado a
-- medio hacer que no dice que está a medio hacer. Ver [firma-12].
--
insert into public.roles_permisos (rol, permiso)
select r.rol, p.clave
  from public.roles_sistema r, public.permisos p
 where r.rol = 'admin'
   and p.clave in ('documentos.ver','documentos.autorizar_firma')
on conflict do nothing;

-- Y el aviso que hay que leer después de correrla, porque los permisos de arriba no se les
-- dan solos a los demás roles. Un permiso que existe y que ningún rol tiene es un permiso que
-- nadie tiene.
--
-- select r.rol, p.clave
--   from public.roles_sistema r, public.permisos p
--  where p.clave like 'documentos.%'
--  order by r.rol, p.clave;
--
-- Lo que salga ahí es lo que hay que decidir a mano: qué roles, de los que manejan obras,
-- pueden registrar la autorización de un trabajador. Ver [firma-11].

-- -------------------------------------------------------------------
-- PARA CONFIRMAR
-- ---------------------
--
-- Tiene que dar 1 en la primera, y 0 filas en la segunda.
--
select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'firma_autorizaciones'
   and column_name  = 'explicado';

-- Y que la coherencia funcione: esto tiene que FALLAR, porque no acepta el electrónico y
-- además dice de qué tipo firma. Si no falla, el CHECK no está puesto.
--
-- select * from public.firma_autorizaciones(trabajador_code, acepta_electronica, tipo_firma)
--  values ('PRUEBA', false, 'electronica');