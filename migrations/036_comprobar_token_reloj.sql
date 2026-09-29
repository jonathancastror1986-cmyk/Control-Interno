-- ===================================================================
-- 036 - COMPROBAR EL TOKEN DE UN RELOJ, SIN MARCAR
-- ===================================================================
--
-- Qué resuelve
-- ------------
-- La pantalla de Relojes tenía una pantalla para instalar el token en un
-- equipo, y esa pantalla guardaba lo que se pegaba SIN COMPROBAR NADA.
-- El reloj, en cambio, sí lo comprobaba: al marcar, contra la base.
--
-- La consecuencia era que los dos caminos no daban el mismo resultado. Se
-- podía instalar un token del reloj equivocado, o cortado al pegar, y la
-- pantalla decía "guardado". El error aparecía recién en el primer
-- marcaje, en la portería, con la gente esperando y sin forma de saber que
-- el problema era de un token pegado a medias.
--
-- El token no se puede comprobar en el navegador: en la base solo está su
-- hash, que es justamente lo que impide que se pueda recuperar. Por eso
-- esto tiene que ser una función de la base, y no un/javascript.
--
--
-- POR QUÉ NO SE REUTILIZA marcar_por_reloj
-- -----------------------------------------
-- Registrar un marcaje es otra cosa, y usar esa función para probar un
-- token dejaría un marcaje falso cada vez que alguien prueba si pegó bien.
-- La respuesta a "ese token sirve" no puede ser "sí, y además te marqué
-- la entrada".
--
--
-- POR QUÉ ES UNA FUNCIÓN Y NO UNA TABLA QUE SE PUEDA LEER
-- --------------------------------------------------------
-- El token es un secreto. Si la tabla de relojes se pudiera leer sin
-- filtro, cualquiera que tenga una sesión leería el hash de todos los
-- relojes y podría probarlos uno por uno hasta dar con el bueno. Por eso
-- esto NO ES "select * from relojes where token_hash = hash_token(...)".
--
-- Es una función "security definer" —se ejecuta con los permisos del
-- dueño, no con los de quien llama— y por eso mismo lleva el permiso
-- ADENTRO, con la misma función que usa el resto del sistema. Ese detalle
-- es el que impide que un reloj, que tiene sesión iniciada en el aparato
-- de la puerta, pueda usar esta puerta de atrás.
--
--
-- QUÉ DEVUELVE
-- ------------
-- No un sí o un no: un motivo. Un token puede estar malo por cinco
-- razones distintas, y cada una se arregla con una acción distinta:
--
--   RELOJ_INEXISTENTE  el código no está en esta empresa
--   RELOJ_INACTIVO     el reloj está desactivado
--   TOKEN_VACIO        no se pegó nada
--   TOKEN_MAL_CORRIDO  el texto pegado no tiene forma de token
--   TOKEN_INVALIDO     es un token, pero no es el de este reloj
--   OK                 el token es el de este reloj
--
-- Un "no" solo no sirve: la persona no sabe si tiene que volver a copiar,
-- si tiene que activar el reloj, o si tiene que rotar el token. Que la
-- base decida el motivo y la pantalla lo traduzca es lo que hace que esto
-- sirva para algo.
--
--
-- ESTADO PARA LA MATRIZ DE CUMPLIMIENTO
-- ---------------------------------------
-- Es una apoyo de la operación, no un requisito legal. El art. 20 de la
-- Resolución Exenta 38/2024 pide que el reloj valide, y el reloj lo hace
-- con marcar_por_reloj: esta función no cambia ese cumplimiento, lo
-- hace más difícil de romper por el lado de la instalación.

-- ------------------------------------------------------------------
-- EL PERMISO
-- ------------------------------------------------------------------
-- No es uno nuevo. Alcanza con el mismo que hace falta para VER los
-- relojes: quien puede verlos es quien los está configurando. Se agrega
-- al rol de soporte técnico, que es el que instala relojes en obra, y al
-- de administración, que es el que los crea.
--
-- El rol reloj NO lo lleva, a propósito: el aparato de la puerta no
-- tiene que poder comprobar tokens, solo usarlos.

-- ------------------------------------------------------------------
-- LA COMPROBACIÓN DE FORMA
-- ------------------------------------------------------------------
-- El token es un UUID: 36 caracteres, con guiones, en hexadecimal. Eso lo
-- decide rotar_token_reloj(), que genera gen_random_uuid()::text. Se
-- comprueba ANTES de comparar contra el hash, porque comparar un texto
-- vacío o una frase contra un hash no da información: siempre falla, y
-- siempre con el mismo mensaje.
--
-- Con esto, pegar "asdfasdf" responde TOKEN_MAL_CORRIDO, que dice qué
-- hacer, en vez de TOKEN_INVALIDO, que hace pensar que el token existe y
-- que el reloj está mal.

create or replace function public.comprobar_token_reloj(
  p_code  text,
  p_token text
)
returns table (
  ok     boolean,
  motivo text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text := upper(btrim(coalesce(p_code,'')));
  v_token text := btrim(coalesce(p_token,''));
  v_reloj public.relojes%rowtype;
  v_esperado text;
begin
  ------------------------------------------------------------------
  -- LA PRIMERA GUARDA: QUIÉN ESTÁ LLAMANDO
  ------------------------------------------------------------------
  -- Misma razón que en importar_marcajes_offline: al ser "security
  -- definer", las políticas de la tabla relojes NO se aplican adentro.
  -- Sin esta comprobación, cualquiera con una sesión iniciada podría
  -- probar tokens.
  if not public.tiene_permiso('relojes.ver') then
    raise exception 'SIN_PERMISO_RELOJES'
      using errcode = '42501',
            hint = 'Comprobar el token de un reloj es para quien puede ver los relojes. Pídele a un administrador que te habilite.';
  end if;

  ------------------------------------------------------------------
  -- LOS DATOS
  ------------------------------------------------------------------
  if v_code = '' then
    return query select false, 'RELOJ_INEXISTENTE'::text;
    return;
  end if;

  select * into v_reloj
    from public.relojes
   where upper(btrim(coalesce(code,''))) = v_code
   limit 1;

  -- No se dice "no existe" cuando lo que pasa es que es de otra empresa:
  -- el RLS ya lo filtra, y confirmar que el reloj existe en otra empresa
  -- es filtrar información que no corresponde.
  if not found then
    return query select false, 'RELOJ_INEXISTENTE'::text;
    return;
  end if;

  if not v_reloj.activo then
    return query select false, 'RELOJ_INACTIVO'::text;
    return;
  end if;

  if v_token = '' then
    return query select false, 'TOKEN_VACIO'::text;
    return;
  end if;

  ------------------------------------------------------------------
  -- LA FORMA DEL TOKEN
  ------------------------------------------------------------------
  -- Un UUID: 8-4-4-4-12 en hexadecimal, 36 caracteres con los guiones.
  v_esperado := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_token !~ v_esperado then
    return query select false, 'TOKEN_MAL_CORRIDO'::text;
    return;
  end if;

  ------------------------------------------------------------------
  -- LA COMPARACIÓN
  ------------------------------------------------------------------
  -- El hash, nunca el token. Acá es donde se decide, y es la misma
  -- comparación que hace marcar_por_reloj: no hay dos criterios distintos
  -- para marcar y para instalar, que es justamente lo que pasó antes.
  if v_reloj.token_hash is null then
    return query select false, 'TOKEN_INVALIDO'::text;
    return;
  end if;

  if v_reloj.token_hash = public.hash_token(v_token) then
    return query select true, 'OK'::text;
    return;
  end if;

  return query select false, 'TOKEN_INVALIDO'::text;
end;
$$;

comment on function public.comprobar_token_reloj(text, text) is
  'Dice si un token corresponde a un reloj, SIN registrar marcaje. Devuelve ok y un motivo (RELOJ_INEXISTENTE, RELOJ_INACTIVO, TOKEN_VACIO, TOKEN_MAL_CORRIDO, TOKEN_INVALIDO, OK). Es security definer y comprueba el permiso adentro: sin eso, cualquiera con sesion podria probar tokens.';

-- ------------------------------------------------------------------
-- QUIÉN PUEDE LLAMARLA
-- ------------------------------------------------------------------
-- Solo con sesión iniciada, y solo con el permiso de arriba, que se
-- comprueba dentro. A propósito NO se le da a anon: esta función no
-- debería poder llamarse sin haber iniciado sesión, ni siquiera para
-- probar un token inventado.
revoke all on function public.comprobar_token_reloj(text, text) from public, anon;
grant execute on function public.comprobar_token_reloj(text, text) to authenticated;

-- ------------------------------------------------------------------
-- LO QUE ESTABA EN PIE ANTES
-- ------------------------------------------------------------------
-- Antes de aplicar esto, la pantalla de Relojes guardaba el token sin
-- comprobar. Para volver atrás:
--
--   drop function if exists public.comprobar_token_reloj(text, text);
--
-- Y la pantalla vuelve a guardar lo que se le pegue, sin mirar.
