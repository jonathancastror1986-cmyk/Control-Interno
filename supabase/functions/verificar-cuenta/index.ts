// ============================================================
// Edge Function: verificar / crear cuentas sin mandar correo
// ============================================================
// POR QUE ESTO EXISTE
//
// Dar de alta a alguien mandándole un correo de invitación choca con el
// límite del proveedor de correo de Supabase: el plan gratuito permite
// unos pocos por hora y al siguiente responde "email rate limit
// exceeded". La cuenta queda CREADA pero sin verificar, así que esa
// persona no puede iniciar sesión ("Email not confirmed"). Con treinta
// personas en la obra eso no es un problema de velocidad, es un
// bloqueo: nadie más entra.
//
// La salida no es subir el límite, es dejar de depender del correo. Las
// tres acciones de acá escriben en la cuenta con la API de
// administración, que no manda nada:
//
//   verificada       -> la cuenta ya existe: se marca el correo como
//                       confirmado y puede entrar
//   creada           -> no existe: se crea YA verificada, con clave
//                       provisional
//   clave_reiniciada -> existe pero la persona no recuerda su clave: se
//                       le pone una nueva
//
// En los tres casos la clave se la entrega el supervisor en persona.
// Eso es lo que hay que decir sin adornarlo: verificando un correo sin
// que nadie lo compruebe, la app está afirmando que esa dirección es
// correcta. En una obra, donde el jefe de turno le entrega el usuario
// en mano a la persona, es lo que se hace. En un sistema abierto al
// mundo, no lo sería.
//
// La service_role NO puede estar en el navegador: quien la tuviera
// podría leer y modificar toda la base. Acá queda en el servidor, que es
// donde corresponde.
//
// Desplegar:
//   supabase functions deploy verificar-cuenta
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const responder = (cuerpo, codigo = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: codigo,
    headers: { 'Content-Type': 'application/json' }
  })

// Una clave provisional tiene que ser fácil de decir de oído y difícil
// de adivinar. Se exige un mínimo de 8 porque es lo que acepta Supabase
// igual, pero se rechazan las obvias: "12345678" no sirve de nada.
const claveDebil = (clave) => {
  const repetida = /^(.)\1+$/.test(clave)
  const seguida = /^(0123456789|123456789|abcdefgh|qwerty|password|clave1234)/i.test(clave)
  return repetida || seguida || clave.length < 8
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return responder({ error: 'Método no permitido. Usa POST.' }, 405)
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) {
    return responder(
      { error: 'La función no tiene configurado SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' },
      500
    )
  }

  const cuerpo = await req.json().catch(() => null)
  if (!cuerpo) return responder({ error: 'No se recibió nada.' }, 400)

  const correo = String(cuerpo.correo || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return responder({ error: 'Escribe un correo válido.' }, 400)
  }

  const accion = String(cuerpo.accion || 'verificar')
  if (!['verificar', 'crear', 'clave'].includes(accion)) {
    return responder({ error: 'Acción no reconocida: usar verificar, crear o clave.' }, 400)
  }

  // ------------------------------------------------------------
  // 1) PERMISO
  // ------------------------------------------------------------
  // Mismo criterio que la función "invitar": activo y con
  // "sistema.usuarios". Verificar un correo ajeno es, en la práctica,
  // dar de alta a alguien, así que el permiso es el mismo.
  const quienLlama = req.headers.get('Authorization') || ''
  if (!quienLlama.startsWith('Bearer ')) {
    return responder({ error: 'Falta la sesión. Vuelve a iniciar sesión.' }, 401)
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const comoQuienLlama = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: sesion, error: errorSesion } = await comoQuienLlama.auth.getUser(
    quienLlama.slice('Bearer '.length)
  )
  if (errorSesion || !sesion?.user) {
    return responder({ error: 'Sesión inválida. Vuelve a iniciar sesión.' }, 401)
  }

  const { data: autorizado, error: errorPermiso } = await admin.rpc('es_usuario_activo', {
    uid: sesion.user.id
  })
  if (errorPermiso) {
    return responder(
      { error: 'No se pudo verificar el permiso: ' + errorPermiso.message }, 500
    )
  }
  if (!autorizado) {
    return responder(
      { error: 'Tu cuenta está inactiva. Pídele a un administrador que la active.' }, 403
    )
  }
  const { data: puede, error: errorPermiso2 } = await admin.rpc('tiene_permiso', {
    clave: 'sistema.usuarios',
    uid: sesion.user.id
  })
  if (errorPermiso2) {
    return responder(
      { error: 'No se pudo verificar el permiso: ' + errorPermiso2.message }, 500
    )
  }
  if (!puede) {
    return responder({ error: 'No tienes permiso para dar de alta usuarios.' }, 403)
  }

  // ------------------------------------------------------------
  // 2) LA CUENTA
  // ------------------------------------------------------------
  const { data: lista, error: errorLista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (errorLista) {
    return responder({ error: 'No se pudieron leer las cuentas: ' + errorLista.message }, 500)
  }
  const usuario = (lista.users || []).find(
    (u) => String(u.email || '').toLowerCase() === correo
  ) || null

  // Si la migración 021 no está aplicada, el alta se hace igual pero queda
  // avisado. Preferible un alta sin registro a un alta que no ocurra: el
  // aviso va en la respuesta y la app lo muestra.
  let registroFallido = null
  const registrar = async (accionHecha, resultado, detalle, userId) => {
    const { error } = await admin.from('cuentas_altas').insert({
      correo,
      user_id: userId || null,
      accion: accionHecha,
      resultado,
      detalle: detalle || null,
      hecho_por: sesion.user.id,
      hecho_por_nombre: sesion.user.email || null
    })
    if (error) {
      registroFallido = error.message
      return
    }
    registroFallido = null
  }

  // ------------------------------------------------------------
  // 3) ACCIONES
  // ------------------------------------------------------------
  if (accion === 'crear') {
    if (usuario) {
      await registrar('creada', 'error', 'La cuenta ya existía: no se creó de nuevo.', usuario.id)
      return responder(
        {
          error:
            'Ese correo ya tiene una cuenta. Si lo que falta es verificarla, usa "Verificar cuenta".',
          ya_existe: true
        },
        409
      )
    }
    const clave = String(cuerpo.clave || '')
    if (!clave) return responder({ error: 'Escribe una clave provisional para la persona.' }, 400)
    if (claveDebil(clave)) {
      return responder(
        {
          error:
            'Esa clave es demasiado fácil de adivinar. Pon una de al menos 8 caracteres que no sea 12345678 ni una palabra conocida.'
        },
        400
      )
    }

    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email: correo,
      password: clave,
      email_confirm: true,          // <-- sin correo: verificado de una
      user_metadata: { nombre: String(cuerpo.nombre || '').trim() || null }
    })
    if (errorCrear) {
      await registrar('creada', 'error', errorCrear.message, null)
      return responder({ error: 'Supabase no pudo crear la cuenta: ' + errorCrear.message }, 502)
    }
    await registrar('creada', 'ok', 'Cuenta creada y verificada sin correo.', creado.user?.id)
    return responder({
      ok: true,
      accion: 'creada',
      user_id: creado.user?.id,
      correo,
      aviso: registroFallido
        ? 'La cuenta se creó, pero no se pudo guardar el registro de auditoría (falta la migración 021).'
        : null,
      mensaje:
        'Cuenta creada y verificada. Entrégale la clave ' +
        String(cuerpo.clave) +
        ' en persona y pídele que la cambie al entrar.'
    })
  }

  // "verificar" y "clave" necesitan que la cuenta exista.
  if (!usuario) {
    await registrar(
      accion === 'clave' ? 'clave_reiniciada' : 'verificada',
      'error',
      'La cuenta no existe.',
      null
    )
    return responder(
      {
        error:
          'Ese correo no tiene cuenta en el sistema. Créala con "Crear cuenta con clave".',
        no_existe: true
      },
      404
    )
  }

  if (accion === 'verificar') {
    if (usuario.email_confirmed_at) {
      await registrar('verificada', 'ok', 'Ya estaba verificada: no se cambió nada.', usuario.id)
      return responder({
        ok: true,
        ya_verificada: true,
        user_id: usuario.id,
        mensaje: 'Ese correo ya estaba verificado. No hubo que cambiar nada.'
      })
    }
    const { error } = await admin.auth.admin.updateUserById(usuario.id, { email_confirm: true })
    if (error) {
      await registrar('verificada', 'error', error.message, usuario.id)
      return responder({ error: 'Supabase no pudo verificarla: ' + error.message }, 502)
    }
    await registrar('verificada', 'ok', 'Correo marcado como confirmado, sin mandar correo.', usuario.id)
    return responder({
      ok: true,
      accion: 'verificada',
      user_id: usuario.id,
      correo,
      aviso: registroFallido
        ? 'Se verificó, pero no se pudo guardar el registro de auditoría (falta la migración 021).'
        : null,
      mensaje: 'Cuenta verificada. Ya puede iniciar sesión con su contraseña.'
    })
  }

  // accion === 'clave'
  const clave = String(cuerpo.clave || '')
  if (!clave) return responder({ error: 'Escribe la clave nueva.' }, 400)
  if (claveDebil(clave)) {
    return responder(
      {
        error:
          'Esa clave es demasiado fácil de adivinar. Pon una de al menos 8 caracteres que no sea 12345678 ni una palabra conocida.'
      },
      400
    )
  }
  const { error } = await admin.auth.admin.updateUserById(usuario.id, { password: clave })
  if (error) {
    await registrar('clave_reiniciada', 'error', error.message, usuario.id)
    return responder({ error: 'Supabase no pudo cambiar la clave: ' + error.message }, 502)
  }
  await registrar('clave_reiniciada', 'ok', 'Clave cambiada por un administrador.', usuario.id)
  return responder({
    ok: true,
    accion: 'clave_reiniciada',
    user_id: usuario.id,
    correo,
    aviso: registroFallido
      ? 'Se cambió la clave, pero no se pudo guardar el registro de auditoría (falta la migración 021).'
      : null,
    mensaje: 'Clave cambiada. Entrégasela a la persona y pídele que la cambie al entrar.'
  })
})
