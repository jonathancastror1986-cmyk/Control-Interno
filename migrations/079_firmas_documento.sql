-- ===================================================================
-- 079  LA FIRMA DEL DOCUMENTO
-- ===================================================================

-- Corre esto ENTERO en el editor SQL de Supabase. La migracion termina en DDL, y las
-- consultas de comprobacion van aparte, en el archivo "-diagnostico".

-- ---------------------------------------------------------------------
-- QUE RESUELVE ESTO
-- ---------------------------------------------------------------------

-- Que un documento firmado no se pueda cambiar despues, sin pagar un proveedor de firma
-- electronica.

-- El contrato que se esta usando hoy lo firma FirmaSimple, de Acepta, con sello de tiempo de
-- un tercero. Eso vale, y para un contrato entre empleador y trabajador no hace falta: la Ley
-- 19.845 solo exige firma CALIFICADA cuando la ley dice que hace falta, y un contrato laboral
-- es un acuerdo privado.

-- Lo que hace que un documento no se pueda modificar despues no es el proveedor. Es un HASH.

-- ---------------------------------------------------------------------
-- Y POR QUE EL HASH Y NO SOLO UN SELLO DE TIEMPO
-- ---------------------------------------------------------------------

-- Un "firmado el 2025-06-01 a las 10:00" es una palabra. Alguien puede escribirla cuando quiera.

-- Un SHA-256 del contenido es una prueba: si el documento cambio en un solo caracter, el hash
-- cambia, y no hay forma de volver al hash viejo sin adivinar el documento entero. Es lo que hace
-- imposible que un contrato firmado se edite despues.

-- Lo que el proveedor de firma aporta por encima es el SELLO DE TIEMPO DE UN TERCERO: que no
-- puedas decir "esa hora la puse yo". Eso es mas fuerte, y se paga.

-- Lo que queda es que el hash es una afirmacion del sistema. Con las credenciales del
-- trabajador y una IP, el argumento es flojo para un contrato laboral, pero NO es nulo. Si esto
-- llega a reclamarse en serio, hay que contratar el sello de tercero.

-- ---------------------------------------------------------------------
-- Y POR QUE SE GUARDA LA HUELLA Y NO SOLO EL PDF
-- ---------------------------------------------------------------------

-- Porque un PDF guardado en un servidor se puede cambiar sin que nadie lo note. Un PDF con hash
-- guardado al momento de firmar, se nota.

-- Y por eso se guardan LAS DOS COSAS: el hash y el PDF. El PDF es lo que se lee; el hash es lo
-- que demuestra que el PDF es el que se firmo.

-- ===================================================================
-- 1) LA TABLA
-- ===================================================================

-- Y UNA FIRMA POR PERSONA, DOCUMENTO Y OCASION, NO UNA POR PERSONA

-- Porque la misma persona firma varias veces: el contrato, una charla, una declaracion de salud.
-- Y firmarlos todos con el mismo registro significaria que cambiar el contrato de junio no
-- afecta al de julio, cuando si tiene que afectarlo.

-- Y LA UNIQUE LLEVA LAS CINCO COLUMNAS, POR ESO SON CINCO Y NO UNA

-- Si la clave fuera solo (trabajador, documento), volver a firmar el mismo documento no crearia
-- una fila nueva: pisaria la anterior y el hash viejo desapareceria. Y con el hash viejo
-- desaparecido no hay forma de saber si el documento cambio. Eso seria peor que no guardar.

create table if not exists public.firmas_documento (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    integer not null references public.empresa(id) on delete cascade,
  code          text    not null references public.trabajadores(code) on delete cascade,

--   ---- QUE DOCUMENTO ES ----

--   Y "tipo" ES UN TEXTO Y NO UNA CLAVE A OTRA TABLA, A PROPOSITO

-- porque el documento firmado no es SIEMPRE una plantilla del sistema: puede ser un contrato
-- subido por la oficina, o uno armado acá. Si fuera una clave forzada, la mitad de los
-- documentos no se podrían firmar.
  tipo          text    not null
                check (tipo in ('contrato','anexo','charla','induction','prevencion','formulario','otro')),
  documento_id  uuid,
  periodo       date,

--   ---- LA HUELLA ----

--   Y EL HUELLA ES NOT NULL Y NO SE CALCULA ACA

-- porque el documento vive en el navegador, en el HTML que se baja como .doc. La base no lo
-- tiene. Lo calcula el navegador con "crypto.subtle.digest" y lo manda. Si fuera opcional,
-- habría firmas sin huella, que es exactamente lo que se vino a evitar.

--   Y EL ALGORITMO SE ESCRIBE, PARA que dentro de tres años se sepa con qué se calculó.
  hash_algoritmo text   not null default 'sha-256' check (hash_algoritmo = 'sha-256'),
  contenido_hash text   not null check (contenido_hash ~ '^[0-9a-f]{64}$'),

--   ---- LA FIRMA ----

--   Y LA IMAGEN ES UN DATA URL ENTERA, Y ESO ES A PROPOSITO

-- porque es chica: una firma dibujada son unos 3 KB. Si se guardara en un bucket aparte,
-- habría dos cosas que se pueden borrar por separado: el documento queda y la firma no. Uno
-- guardando la firma adentro de la fila, o estan las dos o no esta ninguna.

--   Y "firmante_nombre" Y "firmante_rut" ESTAN COPIADOS, NO SE LEEN DE LA FICHA

-- porque en tres años el nombre del trabajador puede haber cambiado, o el RUT puede venir mal
-- cargado. Lo que se firmó es lo que dice ahí, y por eso se copia. La ficha puede tener lo que
-- tenga; el contrato firmado no cambia.
  firma_imagen    text   not null,
  firmante_nombre text   not null,
  firmante_rut    text,

--   ---- CUANDO Y DESDE DONDE ----
  firmado_en      timestamptz not null default now(),
  firmado_por     uuid references public.perfiles(id),
  ip              text,
  user_agent      text,

--   Y "verificaciones" CUENTA LAS VECES QUE SE COMPROBO, PORQUE ALGO SE COMPRUEBA

-- Un documento que nunca se ha verificado no está bien: o nadie lo miró nunca, o se verificó y
-- no se anotó. Con el contador se ve la diferencia.
  verificaciones  int     not null default 0,
  ultima_verificacion timestamptz,
  created_at      timestamptz not null default now(),

  constraint firmas_documento_unica
    unique (empresa_id, code, tipo, documento_id, periodo)
);

-- ===================================================================
-- 2) VERIFICAR
-- ===================================================================

-- Y RECALCULA EL HASH DEL CONTENIDO Y LO COMPARA

-- Y por eso recibe el contenido y no lo busca: el documento lo tiene el navegador, no la base.
-- Si esta función buscara el documento, noaria "la fila no tiene documento, no puedo verificar".

-- Y "sha256" DE POSTGRESQL ESTA EN EL NUCLEO DESDE LA 11, NO HAY QUE INSTALAR NADA

-- Se convierte el texto a bytes con "convert_to", porque sha256 toma bytes y no texto. Un texto
-- con acentos, pasado como texto y no como bytes, da un hash distinto en cada motor.

create or replace function public.verificar_firma(
  p_hash text,
  p_contenido text
)
returns boolean
language sql
immutable
as $fn$
  select encode(sha256(convert_to(coalesce(p_contenido, ''), 'UTF8')), 'hex') = lower(p_hash);
$fn$;

comment on function public.verificar_firma(text,text) is 'Compara el hash guardado con el del contenido que se le pasa. true significa que el documento NO cambio desde que se firmo. El contenido se lo pasa el navegador porque el documento vive ahi, no en la base.';

-- ===================================================================
-- 3) EL RLS
-- ===================================================================

-- Y LA LECTURA USA "puede_ver_trabajador", LA MISMA QUE LA 077

-- Porque es la misma pregunta: "puedo ver a esta persona?". Si se escribiera una regla nueva,
-- habria dos reglas de empresa que se pueden desincronizar.

-- Y LA ESCRITURA ES MAS DUDA QUE EN LA 077, Y A PROPOSITO

-- Una firma es la FECHA DE FIRMA de un documento. Si se pudiera escribir una firma sin permiso,
-- alguien podria firmar por un trabajador. Por eso la escritura exige permiso explicito, y el
-- que existe es el mismo que para cargar remuneraciones.

do $$
begin
  if to_regprocedure('public.puede_ver_trabajador(text,uuid)') is null then
    raise exception 'Falta public.puede_ver_trabajador(), que crea la 067_aislar_por_empresa.sql';
  end if;
  if to_regprocedure('public.tiene_permiso(text,uuid)') is null then
    raise exception 'Falta public.tiene_permiso(), que crea la 014_multi_empresa.sql';
  end if;
end $$;

alter table public.firmas_documento enable row level security;

drop policy if exists "firmas leen" on public.firmas_documento;
create policy "firmas leen" on public.firmas_documento for select
  using (public.puede_ver_trabajador(code));

drop policy if exists "firmas escriben" on public.firmas_documento;
create policy "firmas escriben" on public.firmas_documento for all
  using (tiene_permiso('rem.editar'))
  with check (tiene_permiso('rem.editar'));
