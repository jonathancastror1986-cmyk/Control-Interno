-- ===================================================================
-- 066: CLAVE DE LETRAS DE LA AFP, Y CENTROS DE COSTO SIN EMPRESA (2026-10-02)
-- ===================================================================
--
-- -------------------------------------------------------------------
-- 1) LA CLAVE DE LETRAS
-- ---------------------
--
-- El catálogo "afp" (migración 065) tiene los códigos del PREVIRED, que son NUMÉRICOS:
-- 03, 05, 08. Y el formulario del trabajador usa "afp_codigo", que son LETRAS: AFPH, CUP,
-- HAB. Son dos cosas distintas y no hay forma de pasar de una a otra.
--
-- Y el documento del PREVIRED NO define las letras. No las inventa esta migración, y esa es
-- la razón de que la columna venga vacía: la define la empresa, una sola vez, y después el
-- desplegable la usa.
--
-- Por qué hacen falta las dos, otra vez y por escrito:
--
--   - las importaciones desde Excel emparejan contra "trabajadores.afp_codigo", que es de
--     letras, y emparejan carácter por carácter;
--   - la planilla necesita el código numérico del PREVIRED.
--
-- Si se usara el número en "afp_codigo", las importaciones que hoy funcionan dejarían de
-- emparejar, sin error: la columna de AFP sale vacía en la planilla y el error aparece a fin
-- de mes. Ver [afp-14].
--
-- Y la columna queda NULL a propósito, y NO se inventa un valor. Un catálogo oficial con una
-- columna de códigos de la propia empresa se puede auditar; uno con letras inventadas de
-- entrada parece oficial y no lo es.
--
alter table public.afp
  add column if not exists clave_letras text;

comment on column public.afp.clave_letras is
  'Codigo de LETRAS que usa esta empresa, el que empareja las importaciones desde Excel: "AFPH",
  "CUP". Es DISTINTO de "codigo", que es el numerico del PREVIRED. Viene NULL a proposito: el
  PREVIRED no define letras, y esta migracion no las inventa. La define la empresa una vez y
  el desplegable del formulario la usa. Ver [afp-14].';

-- Y el CHECK, para que nadie escriba un número donde va un código de letras: el error más
-- probable de todos es escribir "03" en vez de "AFPH", y sin esto no se avisa hasta que la
-- importación deja de emparejar.
--
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'afp_clave_letras_check'
  ) then
    alter table public.afp
      add constraint afp_clave_letras_check
      check (clave_letras is null or clave_letras ~ '^[A-Za-z]{3,6}$');
  end if;
end
$$;

-- Y un índice único, pero SOLO sobre las letras que existen. Un "unique" sobre una columna
-- con nulos no protege nada —en PostgreSQL los nulos se consideran distintos—, y además
-- dejaría pasar dos "AFPH" porque no la rellenó nadie.
--
create unique index if not exists afp_clave_letras_unica
  on public.afp (upper(clave_letras))
  where clave_letras is not null;

-- -------------------------------------------------------------------
-- 2) LOS CENTROS DE COSTO SIN EMPRESA
-- -----------------------------------
--
-- "centros_costo" tiene (migración 030):
--
--     constraint centros_costo_codigo_unico unique (empresa_id, code)
--
-- Y "guardarCentroCosto" guarda "empresaActual || null". Y "empresaActual" vale 0 cuando la
-- cabecera dice "Todas las empresas". O sea que el centro se guarda con empresa_id NULL.
--
-- Y en PostgreSQL, en una restricción de unicidad, LOS NULOS SE CONSIDERAN DISTINTOS. Dos
-- centros con empresa_id NULL y el mismo código se guardan los dos, sin error.
--
-- O sea que la restricción no protege en el caso más común, que es el de no tener una empresa
-- elegida en la cabecera.
--
-- Y no es un detalle: un centro de costo duplicado es el mismo dato dos veces, y la planilla
-- que sume "ambos" imputa el doble. Ver [centro-08].
--
-- EL ARREGLO NO ES PONER NOT NULL
-- -------------------------------
--
-- Porque hay centros que son de todas las empresas a propósito, y porque el guardado desde
-- el Excel y desde otros lugares no pasan por "guardarCentroCosto".
--
-- El arreglo es un índice único sobre "coalesce(empresa_id, 0)", que convierte el NULL en un
-- valor único y comparable. Es el mismo criterio que usa "expedientes" en la migración 049:
--
--     create index expedientes_trabajador on expedientes (code, coalesce(centro_costo_id, -1));
--
create unique index if not exists centros_costo_codigo_unico_real
  on public.centros_costo (coalesce(empresa_id, 0), code);

-- Y el aviso que hay que leer DESPUÉS de correrla, porque el índice puede fallar si ya hay
-- duplicados guardados. Y si falla, el error lo dice con el código repetido:
--
--     select coalesce(empresa_id,0) as empresa, code, count(*)
--       from public.centros_costo
--      group by 1,2
--     having count(*) > 1;
--
-- Si eso devuelve filas, hay que borrar o renombrar a mano antes de volver a correr esto.
-- Un índice único NO se puede crear con datos duplicados, y el error es críptico.
--
-- -------------------------------------------------------------------
-- 3) PARA CONFIRMAR
-- ---------------------
--
-- Tiene que dar 1.
--
select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'afp'
   and column_name  = 'clave_letras';

-- Y 2.
--
select count(*) as indices_nuevos
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('afp_clave_letras_unica','centros_costo_codigo_unico_real');

-- -------------------------------------------------------------------
-- Y LOS TRES QUE TIENEN QUE FALLAR
-- ------------------------------
--
-- Si alguno de estos NO falla, el CHECK o el índice no están puestos:
--
--     -- el número donde va la letra
--     update public.afp set clave_letras = '03' where codigo = '03';
--     -- dos letras iguales
--     update public.afp set clave_letras = 'AFPH' where codigo = '05';
--     -- y este, con la clave de letras ya puesta, tiene que PASAR:
--     update public.afp set clave_letras = 'HAB' where codigo = '05';
