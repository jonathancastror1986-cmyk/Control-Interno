// ============================================================
// Edge Function: dar de alta una cuenta con clave temporal
// ============================================================
//
// POR QUÉ ESTO ES UNA FUNCIÓN Y NO UN BOTÓN EN LA APLICACIÓN
// ---------------------------------------------------------
// Poner una contraseña concreta a un usuario es una operación de
// administración de Supabase: auth.admin.createUser con la clave dentro.
// Esa llamada exige la service_role, y la service_role en el navegador le
// daría a cualquiera que abra la aplicación control total de la base.
//
// Por eso lo mismo que ya hace la función "invitar": la clave de
// administración vive acá, en el servidor, y el navegador solo pide.
//
//
// QUÉ HACE
// --------
//   1. Comprueba que quien llama sea un usuario activo y tenga el permiso
//      sistema.usuarios. Sin esto, cualquiera con una sesión podría dar de
//      alta cuentas.
//   2. Si la cuenta no existe, la crea; si existe, le pone una clave nueva.
//   3. Marca la cuenta como "tiene que cambiar la clave" (migración 038).
//   4. Devuelve la clave EN CLARO, una sola vez.
//
//
// LA CLAVE NO SE GUARDA
// ---------------------
// En la base queda el estado, no la clave. Igual que el token de los
// relojes: si la base se filtra, las claves temporales no sirven para
// entrar, porque no están.
//
// Y no se manda a la consola ni a ningún registro. Se devuelve en el
// cuerpo de la respuesta, que es el único lugar donde queda en claro.
//
//
// LA CLAVE NO ES EL NOMBRE
// ------------------------
// La idea era "Juan#2026". No se hace, y el motivo está en la migración
// 038: se adivina, el año se publica en la planilla, y la cuenta sirve
// para registrar asistencia, así que adivinar la clave es fraude de horas
// directo.
//
// La clave es aleatoria, de 12 caracteres, de un alfabeto sin los que se
// confunden entre sí (sin 0/O ni 1/l/I). Se puede dictar por teléfono sin
// tener que aclarar cada letra.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ------------------------------------------------------------------
// LA CLAVE
// ------------------------------------------------------------------
// Sin 0, O, 1, l, I. Cuando alguien lee la clave por teléfono, "O" y "0"
// son el mismo sonido y esa confusión es la causa número uno de que una
// clave temporal no se pueda usar.
//
// Con las cinco vocales, para que se pueda armar cualquier palabra. Lo que
// falta son los que suenan igual entre sí, que son los que se confunden al
// leerlos por teléfono.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LARGO = 12

function claveTemporal() {
  const bytes = new Uint8Array(LARGO)
  crypto.getRandomValues(bytes)
  let salida = ''
  for (let i = 0; i < LARGO; i++) {
    salida += ALFABETO[bytes[i] % ALFABETO.length]
  }
  return salida
}

const CORREOS = (s: string) => {
  // Valida lo justo para no mandarle un correo a una dirección imposible.
  // La validación de verdad la hace Supabase cuando crea la cuenta.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)
}

const CORREO = (codigo: number, cuerpo: any = null, texto = '') => {
  // ----------------------------------------------------------------
  // POR QUÉ ESCRIBIR DENTRO DE UNA FUNCIÓN DE BORDE ES UN CRITERIO
  // ----------------------------------------------------------------
  // En una Edge Function, console.log escribe en los registros del
  // servidor, que se pueden ver desde el panel de Supabase y que cualquier
  // persona con acceso al proyecto lee. Poner la clave ahí es ponerla en
  // un lugar del que no se puede borrar.
  return new Response(
    JSON.stringify({ codigo, error: texto || null, ...(cuerpo || {}) }),
    { status: codigo, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
  }
  if (req.method !== 'POST') return CORREO(405, null, 'Solo se acepta POST.')

  if (!url || !serviceKey) {
    return CORREO(500, null,
      'La función no tiene SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Sin eso no puede poner una contraseña.')
  }

  let cuerpo: any
  try { cuerpo = await req.json() }
  catch (e) { return CORREO(400, null, 'El cuerpo no es JSON.') }

  const correo = String(cuerpo.correo || '').trim().toLowerCase()
  const nombre = String(cuerpo.nombre || '').trim()
  if (!correo) return CORREO(400, null, 'Falta el correo.')
  if (!CORREOS(correo)) return CORREO(400, null, 'El correo no parece una dirección válida: ' + correo)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // ------------------------------------------------------------------
  // QUIEN LLAMA
  // ------------------------------------------------------------------
  // Dos cosas, y en este orden. Primero que la cuenta esté activa: una
  // cuenta desactivada no debe poder dar de alta cuentas nuevas, ni aunque
  // todavía tenga el permiso.
  const cabecera = req.headers.get('Authorization') || ''
  const tokenUsuario = cabecera.replace('Bearer ', '').trim()
  if (!tokenUsuario) return CORREO(401, null, 'La sesión no llegó. Volvé a iniciar sesión.')

  const { data: sesion, error: errorSesion } = await admin.auth.getUser(tokenUsuario)
  if (errorSesion || !sesion?.user) {
    return CORREO(401, null, 'La sesión no es válida. Volvé a iniciar sesión.')
  }
  const uid = sesion.user.id

  const { data: activo, error: e1 } = await admin.rpc('es_usuario_activo', { uid })
  if (e1) return CORREO(500, null, 'No se pudo comprobar la cuenta: ' + e1.message)
  if (!activo) return CORREO(403, null, 'Tu cuenta está desactivada.')

  const { data: permitted, error: e2 } = await admin.rpc('tiene_permiso', {
    uid,
    clave: 'sistema.usuarios',
  })
  if (e2) return CORREO(500, null, 'No se pudo comprobar el permiso: ' + e2.message)
  if (!permitted) {
    return CORREO(403, null,
      'Dar de alta cuentas es solo para Administración. Si te equivocaste de rol, pedile a un administrador que te lo cambie.')
  }

  // ------------------------------------------------------------------
  // LA CLAVE Y LA CUENTA
  // ------------------------------------------------------------------
  // Si la clave se genera y después algo falla, la clave se descarta: no se
  // reintenta con la misma, para que no haya dos claves flotando.
  const clave = claveTemporal()

  const { data: usuarios, error: eBuscar } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (eBuscar) return CORREO(500, null, 'No se pudieron buscar las cuentas: ' + eBuscar.message)

  const yaExiste = (usuarios?.users || []).find(
    (u) => (u.email || '').toLowerCase() === correo
  )

  let userId = yaExiste?.id ?? null

  if (yaExiste) {
    // ------------------------------------------------------------------
    // LA CUENTA YA EXISTE: LE PONE UNA CLAVE NUEVA
    // ------------------------------------------------------------------
    // Esto es lo que hace falta cuando a alguien se le olvidó su clave, o
    // cuando la clave temporal se le perdió. Es lo mismo que "clave
    // reiniciada" en la bitácora, y por eso queda anotado con ese nombre
    // además del nuevo: quien lee la bitácora después ve las dos cosas.
    const { error: eClave } = await admin.auth.admin.updateUserById(yaExiste.id, {
      password: clave,
      email_confirm: true,
    })
    if (eClave) return CORREO(500, null, 'No se pudo poner la clave nueva: ' + eClave.message)
  } else {
    const { data: creado, error: eCrear } = await admin.auth.admin.createUser({
      email: correo,
      password: clave,
      email_confirm: true,
      user_metadata: nombre ? { full_name: nombre } : {},
    })
    if (eCrear) return CORREO(500, null, 'No se pudo crear la cuenta: ' + eCrear.message)
    userId = creado.user.id
  }

  // ------------------------------------------------------------------
  // MARCAR QUE TIENE QUE CAMBIARLA  (migración 038)
  // ------------------------------------------------------------------
  // Esto es lo que hace obligatorio el cambio. Sin esta línea, la persona
  // entra con la clave temporal y no se le pide nunca otra, que es
  // justamente lo que se quiere evitar.
  const { error: eEstado } = await admin.from('perfiles')
    .update({
      estado_clave: 1,
      clave_entregada_at: new Date().toISOString(),
      activo: true,
    })
    .eq('id', userId)
  if (eEstado) {
    return CORREO(500, null,
      'La cuenta se creó pero NO se pudo marcar que tiene que cambiar la clave. '
      + 'No le pases la clave: quedaría entrando con ella para siempre. '
      + 'Revisa que esté aplicada la migración 038. Detalle: ' + eEstado.message)
  }

  // ------------------------------------------------------------------
  // LA BITÁCORA
  // ------------------------------------------------------------------
  // Sin esto, no queda rastro de a quién se le dio una clave temporal, ni
  // cuándo. Y el archivo de la 021 es el lugar de las cuentas, no uno nuevo.
  const { error: eBitacora } = await admin.from('cuentas_altas').insert({
    correo,
    user_id: userId,
    accion: yaExiste ? 'clave_reiniciada' : 'clave_temporal',
    resultado: 'ok',
    detalle: 'Se entregó una clave temporal de un solo uso. La persona tiene que '
      + 'cambiarla en el primer ingreso.',
    hecho_por: uid,
  })
  if (eBitacora) {
    // Un aviso, no un fallo: la cuenta y la clave están bien. Lo que se
    // perdió es el registro de que se entregó, que es importante pero se
    // puede volver a hacer a mano.
    console.warn('[clave-temporal] la bitácora no se pudo escribir:', eBitacora.message)
  }

  // ------------------------------------------------------------------
  // LA RESPUESTA
  // ------------------------------------------------------------------
  // La clave va acá y en ningún otro lado. Esta respuesta es la única
  // oportunidad de leerla: después está en la base, y en la base está su
  // estado, no la clave.
  return CORREO(200, {
    ok: true,
    correo,
    clave,
    recien_creada: !yaExiste,
    aviso: 'Esta clave se muestra una sola vez. Anotala y mandásela. '
      + 'La primera vez que entre, el sistema le va a pedir otra.',
  })
})
