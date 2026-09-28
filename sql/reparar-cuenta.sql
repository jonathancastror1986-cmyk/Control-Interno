-- ============================================================
-- Reparar una cuenta: activar el usuario y corregir el correo
-- ============================================================
-- PARA QUÉ ES
--
-- Dos cosas que se hacen seguido y que el panel de Supabase no deja
-- hacer cómodamente:
--
--   1. Una cuenta quedó creada pero SIN VERIFICAR, y la persona no
--      puede entrar ("Email not confirmed"). Típico cuando se pasó el
--      límite de correos de Supabase.
--
--   2. El correo está mal escrito — "jonathancastro@gamil.com" — y el
--      correo de confirmación nunca llega, porque esa dirección no
--      existe. Ningún correo corrige eso: hay que cambiar el correo en
--      la cuenta.
--
-- CÓMO USARLO (en el SQL Editor de Supabase)
--
--   1. Copia TODO este archivo y pégalo una sola vez. Crea una función;
--      no cambia ninguna cuenta.
--   2. Después ejecuta SOLO la consulta de "MIRAR" (está al final), con
--      el correo viejo. Verás en qué estado está cada cosa.
--   3. Cuando sepas qué hay, ejecuta la llamada a reparar_cuenta(...) con
--      el correo viejo y el correcto.
--
-- La separación es a propósito: ejecutar un UPDATE contra auth.users sin
-- saber qué hay es la forma rápida de dejar a alguien sin acceso sin
-- saber por qué.
--
-- POR QUÉ ES UNA FUNCIÓN Y NO UN SCRIPT SENCILLO
--
-- Porque hace falta transaction y validaciones. Todo pasa dentro de una
-- función, que en Postgres corre en una transacción propia: o sale bien
-- o no cambia nada. Un script con varios UPDATE sueltos puede quedar a
-- medias —la invitación corregida y la cuenta no— y ese estado híbrido
-- es peor que el de partida.
--
-- Además se puede volver a correr sin miedo: no tiene efectos
-- acumulativos.
--
-- POR QUÉ TOCAR auth.users ES DELICADO
--
-- Supabase administra esa tabla con su propio servicio (GoTrue) y suele
-- recomendar la API de administración en vez de un UPDATE. Dos motivos
-- concretos, y los dos están resueltos acá:
--
--   1. El correo vive en DOS lugares: auth.users.email y el jsonb
--      identity_data de auth.identities. Un UPDATE que cambia solo el
--      primero deja los dos distintos, y hay flujos que leen el segundo.
--      Esta función actualiza los dos.
--
--   2. Cambiar un correo a mano no manda ningún aviso. Quien use la
--      cuenta después no se entera. Conviene avisarle por otro medio.
--
-- Si el cambio de correo va a ser frecuente, conviene la tarjeta "Dar de
-- alta sin correo" de la app: la función Edge lo hace con la API de
-- administración y deja los dos lugares coherentes sola.
-- ============================================================


-- ###################################################################
-- LA FUNCIÓN
-- ###################################################################

create or replace function public.reparar_cuenta(
  correo_viejo text,
  correo_nuevo  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viejo   text := lower(btrim(coalesce(correo_viejo, '')));
  v_nuevo   text := lower(btrim(coalesce(correo_nuevo,  '')));
  v_cambiar boolean := (v_nuevo <> '' and v_nuevo is distinct from v_viejo);
  v_user    uuid;
  v_invit   integer;
  v_act     integer;
  v_ident   integer;
  v_msg     text := '';
begin
  -- ------------------------------------------------------------
  -- 1) CHEQUEOS, ANTES DE TOCAR NADA
  -- ------------------------------------------------------------
  if v_viejo = '' then
    raise exception 'Falta el correo que está mal escrito.';
  end if;

  -- Un argumento presente pero vacío ("   ") NO es lo mismo que no
  -- pasarlo. Null significa "solo verificar"; una cadena vacía
  -- significa que se escribió algo y no era nada, que casi siempre es un
  -- error de tipeo. Sin esta distinción, un espacio en blanco te
  -- cambiaba a un correo vacío.
  if correo_nuevo is not null and v_nuevo = '' then
    raise exception 'El correo nuevo viene vacío. Para solo verificar la cuenta, llámala con un solo argumento: reparar_cuenta(''correo'').';
  end if;

  if v_cambiar and v_nuevo !~ '^[^[:space:]@]+@[^[:space:]]+\.[^[:space:]]+$' then
    raise exception 'El correo nuevo no parece un correo: "%"', v_nuevo;
  end if;

  -- Pasar el mismo dos veces no es un error, pero callarse sería
  -- engañoso: la persona cree que se cambió el correo y no se cambió.
  if correo_nuevo is not null and v_nuevo = v_viejo then
    raise warning 'El correo nuevo es igual al viejo: NO se va a cambiar nada, solo se verifica. Para cambiarlo, pasa un correo distinto.';
  end if;

  -- Un cambio de correo es justo la clase de cosa que uno tipea mal. Si
  -- los dos tienen la misma longitud, casi con seguridad se equivocó en
  -- un carácter, y conviene que lo vea antes de que quede guardado.
  if v_cambiar and length(v_viejo) = length(v_nuevo) then
    raise warning 'Los dos correos tienen la misma longitud (%). Si se equivocó en un carácter, cancele con rollback.', length(v_nuevo);
  end if;

  -- Chocar con otra cuenta dejaría a dos personas con el mismo correo, y
  -- la que ya existía no podría volver a entrar nunca más.
  if v_cambiar and exists (select 1 from auth.users u where lower(u.email) = v_nuevo) then
    raise exception 'Ya existe otra cuenta con el correo "%." Cambiar a ese correo dejaría dos cuentas con la misma dirección.', v_nuevo;
  end if;

  -- ------------------------------------------------------------
  -- 2) ¿QUÉ HAY?
  -- ------------------------------------------------------------
  select u.id into v_user from auth.users u where lower(u.email) = v_viejo;

  if v_user is null and not exists (select 1 from public.invitaciones i where lower(i.correo) = v_viejo) then
    raise exception 'No se encontró nada con el correo "%. No hay cuenta ni invitación con esa dirección. Revisa que esté bien escrito.', v_viejo;
  end if;

  -- ------------------------------------------------------------
  -- 3) LA CUENTA
  -- ------------------------------------------------------------
  -- El cambio de correo y la verificación van juntos a propósito. Si el
  -- problema es que el correo está mal escrito, cambiarlo sin verificar
  -- deja a la persona esperando un correo que no va a llegar nunca, y el
  -- síntoma se repite tal cual.
  if v_user is not null then
    if v_cambiar then
      update auth.users
         set email             = v_nuevo,
             email_confirmed_at = coalesce(email_confirmed_at, now())
       where id = v_user;
      v_msg := v_msg || format('Cuenta: correo cambiado a %s y verificada. ', v_nuevo);
    else
      update auth.users
         set email_confirmed_at = now()
       where id = v_user
         and email_confirmed_at is null;
      if found then
        v_msg := v_msg || 'Cuenta: correo verificado (no se cambió la dirección). ';
      else
        v_msg := v_msg || 'Cuenta: el correo ya estaba verificado. ';
      end if;
    end if;

    -- La identidad, que es el segundo lugar donde vive el correo. Sin
    -- esto, auth.users y auth.identities quedan con direcciones
    -- distintas y hay flujos que siguen leyendo la vieja. Es la parte
    -- que casi nadie recuerda.
    if v_cambiar then
      update auth.identities i
         set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(v_nuevo))
       where i.user_id = v_user
         and lower(coalesce(i.identity_data->>'email', '')) <> v_nuevo;
      -- "found" es BOOLEANO y las variables de conteo son enteras: hay que
      -- convertirlo. Sin el "case", Postgres responde "invalid input
      -- syntax for type integer: t", que no dice nada del problema real.
      v_ident := case when found then 1 else 0 end;
      v_msg := v_msg || format('Identidad: %s correo actualizado. ',
                               case when v_ident > 0 then v_ident::text || ' fila(s)'
                                    else 'sin cambios' end);
    end if;
  end if;

  -- ------------------------------------------------------------
  -- 4) LAS INVITACIONES
  -- ------------------------------------------------------------
  -- Antes que nada, porque si la invitación quedó pendiente es DE AHÍ de
  -- donde el trigger handle_new_user lee el correo cuando la persona se
  -- registre. Corregir solo la cuenta no alcanzaría: al registrarse se
  -- buscaría la invitación por el correo viejo, no se la encontraría, y
  -- la persona entraría sin rol, sin empresa y sin ficha.
  if v_cambiar then
    update public.invitaciones
       set correo = v_nuevo
     where lower(correo) = v_viejo;
    v_invit := case when found then 1 else 0 end;
    v_msg := v_msg || format('Invitaciones: %s con el correo corregido (pendientes y aceptadas). ',
                             case when v_invit > 0 then v_invit::text || ' fila(s)'
                                  else 'ninguna' end);
  end if;

  -- ------------------------------------------------------------
  -- 5) ACTIVAR EN LA APP
  -- ------------------------------------------------------------
  -- Esto es DISTINTO de verificar el correo, y es el paso que más se
  -- olvida:
  --
  --   · email_confirmed_at → Supabase: la dirección es válida y la
  --                           persona puede iniciar sesión.
  --   · perfiles.activo    → la app: la persona tiene permiso de ver y
  --                           hacer cosas.
  --
  -- Verificar sin activar deja a la persona en la puerta: entra al login
  -- y rebota, porque la app le dice que su cuenta está inactiva. Por eso
  -- van las dos cosas.
  if v_user is not null then
    update public.perfiles
       set activo = true,
           perfil_completo = true
     where id = v_user
       and (activo is not true or perfil_completo is not true);
    if found then
      v_act := 1;
      v_msg := v_msg || 'Perfil: activada en la app. ';
    else
      v_act := 0;
      v_msg := v_msg || 'Perfil: ya estaba activa. ';
    end if;
  else
    v_msg := v_msg || 'Perfil: todavía no existe (se crea cuando la persona se registre). ';
  end if;

  -- Si solo se verificaba y el nombre quedó como el correo viejo, queda
  -- feo en la lista de usuarios. Se arregla solo cuando el nombre es
  -- exactamente el correo: si alguien puso su nombre a mano, no se toca.
  if v_cambiar and v_user is not null then
    update public.perfiles
       set nombre = v_nuevo
     where id = v_user
       and nombre = v_viejo;
    v_msg := v_msg || 'Perfil: nombre corregido (estaba puesto el correo).';
  end if;

  return v_msg;
end $$;

-- ------------------------------------------------------------
-- QUIÉN PUEDE LLAMARLA
-- ------------------------------------------------------------
-- Revocada para todos y dada solo a service_role. Quien la ejecuta desde
-- el SQL Editor es el dueño de la base (postgres), y los propietarios
-- siempre pueden, así que sigue siendo operable a mano sin abrirla a
-- cualquier usuario con sesión.
--
-- Sin esto, cualquiera que entrara a la app podría cambiar el correo de
-- otro usuario y quedarse con su cuenta.
revoke all on function public.reparar_cuenta(text, text) from public;
revoke all on function public.reparar_cuenta(text, text) from anon;
revoke all on function public.reparar_cuenta(text, text) from authenticated;
grant execute on function public.reparar_cuenta(text, text) to service_role;


-- ###################################################################
-- CÓMO USARLA
-- ###################################################################

-- ---- 1) MIRAR, sin cambiar nada -------------------------------
-- Pega esto primero. Solo lee.
--
--   select
--     (select count(*) from auth.users u where lower(u.email) = 'el.correo@viejo.cl') as cuentas,
--     (select count(*) from public.invitaciones i where lower(i.correo) = 'el.correo@viejo.cl') as invitaciones,
--     (select email_confirmed_at from auth.users u where lower(u.email) = 'el.correo@viejo.cl') as verificada,
--     (select i.identity_data->>'email' from auth.identities i
--        where i.user_id = (select id from auth.users u where lower(u.email) = 'el.correo@viejo.cl')
--        limit 1) as correo_en_identidad;

-- ---- 2) SOLO ACTIVAR, sin cambiar el correo -------------------
-- Es la operación de MENOR RIESGO: no se toca a quién le pertenece la
-- dirección, y no puede chocar con otra cuenta. Si el correo está bien
-- escrito, usa esta.
--
--   select public.reparar_cuenta('el.correo@de.la.persona');

-- ---- 3) CORREGIR EL CORREO ------------------------------------
-- El segundo argumento es el correo bueno. Entre comillas simples.
--
--   select public.reparar_cuenta('jonathan.castro.r198@gmail.com',
--                                 'jonathan.castro.r198@gmail.com');

-- ---- 4) COMPROBAR ---------------------------------------------
--
--   select
--     u.email                                  as correo,
--     u.email_confirmed_at is not null         as verificada,
--     coalesce(p.activo, false)               as activa_en_la_app,
--     (select i.identity_data->>'email' from auth.identities i
--       where i.user_id = u.id limit 1)        as correo_en_identidad
--   from auth.users u
--   left join public.perfiles p on p.id = u.id
--   where lower(u.email) = 'el.correo.nuevo@de.la.persona';

-- Lo que tiene que salir: correo = el nuevo, verificada = sí,
-- activa_en_la_app = sí, correo_en_identidad = el mismo nuevo. Si
-- correo_en_identidad quedara con el viejo, es que la identidad no se
-- actualizó: vuelve a correr el paso 3.


-- ###################################################################
-- DESPUÉS: QUE LA API LO VEA
-- ###################################################################
-- Justo después de tocar auth.users, la API puede seguir con los datos
-- viejos en memoria. Si la app todavía no refleja el cambio, ejecuta en
-- el SQL Editor:
--
--   NOTIFY pgrst, 'reload schema';
--
-- Eso es de la plataforma, no de este archivo.
