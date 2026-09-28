// ============================================================
// Edge Function: enviar la invitación por correo
// ============================================================
// Por qué esto es una función y no un botón en la app: para que
// Supabase envíe el correo de invitación hay que llamar a la API de
// administración (auth.admin.inviteUserByEmail), y esa llamada exige la
// service_role. Poner esa clave en el navegador le daría a cualquiera
// que abra la app control total de la base de datos. Acá la clave se
// queda en el servidor y el navegador solo llama a esta función.
//
// Qué hace, en orden:
//   1. Verifica que quien llama sea un usuario activo con el permiso
//      "sistema.usuarios" (mismo control que el botón de la app).
//   2. Toma la invitación pendiente de ese correo en la tabla
//      "invitaciones".
//   3. Pide a Supabase el correo de invitación, con la dirección de la
//      app como destino. Esto es lo que arregla el enlace roto que
//      llegaba como "localhost/#access_token=...": la URL de redirección
//      se pasa explícitamente, así que no depende del "Site URL" que
//      esté configurado en el panel.
//   4. Devuelve qué se envió, sin datos sensibles.
//
// Configurar (una sola vez, en el panel de Supabase):
//   · Authentication → URL Configuration → Site URL = la dirección real
//     de la app (por ejemplo https://app.miempresa.cl)
//   · Authentication → URL Configuration → Redirect URLs: agregar la
//     misma dirección + "/pages/registro.html"
//   · Authentication → Email: se puede usar el SMTP que trae Supabase
//     para pruebas, o configurar uno propio para producción.
//
// Desplegar:
//   supabase functions deploy invitar
//
// ES RE-EJECUTABLE / NO HACE FALTA TOCAR NADA: si la función no está
// desplegada, el botón de la app lo dice y cae al enlace para copiar.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// El origen de la app, para armar el enlace de registro. Se toma del
// propio origen de la petición: así el enlace siempre apunta al sitio
// desde el que se Municipalidad envió, y no a un localhost hardcodeado.
const origenDeLaPeticion = (req) => {
  const origen = req.headers.get('origin') || ''
  if (origen) return origen.replace(/\/$/, '')
  // Plan B: si no hay Origin (llamada desde curl o similar), se usa el
  // referer, que trae la URL de la app.
  const referer = req.headers.get('referer') || ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

Deno.serve(async (req) => {
  // ------------------------------------------------------------
  // 1) Solo POST. Cualquier otro método se rechaza sin preguntar nada.
  // ------------------------------------------------------------
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método no permitido. Usa POST.' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ------------------------------------------------------------
  // 2) Autenticación con la MISMA sesión que usa la app.
  // ------------------------------------------------------------
  // El cliente anónimo es el de la app (la anon key no da permiso para
  // invitar a nadie), y con el JWT de la persona se comprueba que sea
  // un usuario activo con permiso de administrar usuarios.
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'La función no tiene configurado SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const cuerpo = await req.json().catch(() => null)
  if (!cuerpo || !cuerpo.correo) {
    return new Response(
      JSON.stringify({ error: 'Falta el correo.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const correo = String(cuerpo.correo).trim().toLowerCase()

  const tokenDeQuienLlama = req.headers.get('Authorization') || ''
  if (!tokenDeQuienLlama) {
    return new Response(
      JSON.stringify({ error: 'Necesitas iniciar sesión para invitar.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const comoQuienLlama = createClient(url, anonKey, {
    global: { headers: { Authorization: tokenDeQuienLlama } },
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data: quien, error: errorSesion } = await comoQuienLlama.auth.getUser()
  if (errorSesion || !quien?.user) {
    return new Response(
      JSON.stringify({ error: 'Sesión inválida. Vuelve a iniciar sesión.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Mismo criterio de permiso que usa la base: activo y con
  // "sistema.usuarios". Se pregunta a las funciones de la migración 016
  // para que el botón y la base no puedan discrepar.
  const { data: autorizado, error: errorPermiso } = await admin.rpc('es_usuario_activo', {
    uid: quien.user.id
  })
  if (errorPermiso) {
    return new Response(
      JSON.stringify({ error: 'No se pudo verificar el permiso: ' + errorPermiso.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!autorizado) {
    return new Response(
      JSON.stringify({ error: 'Tu cuenta está inactiva. Pídele a un administrador que la active.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const { data: tienePermiso, error: errorPermiso2 } = await admin.rpc('tiene_permiso', {
    clave: 'sistema.usuarios',
    uid: quien.user.id
  })
  if (errorPermiso2) {
    return new Response(
      JSON.stringify({ error: 'No se pudo verificar el permiso: ' + errorPermiso2.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!tienePermiso) {
    return new Response(
      JSON.stringify({ error: 'No tienes permiso para invitar usuarios.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ------------------------------------------------------------
  // 3) La invitación tiene que existir y estar vigente.
  // ------------------------------------------------------------
  const { data: invitacion, error: errorInv } = await admin
    .from('invitaciones')
    .select('*')
    .eq('correo', correo)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (errorInv) {
    return new Response(
      JSON.stringify({ error: 'No se pudo leer la invitación: ' + errorInv.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!invitacion) {
    return new Response(
      JSON.stringify({ error: 'No hay ninguna invitación pendiente para ' + correo + '.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (invitacion.expira_at && new Date(invitacion.expira_at) < new Date()) {
    return new Response(
      JSON.stringify({ error: 'Esa invitación ya venció. Vuelve a generarla desde Soporte → Invitar usuario.' }),
      { status: 410, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ------------------------------------------------------------
  // 4) El envío. Acá se arregla el enlace roto.
  // ------------------------------------------------------------
  // Se pasa "redirectTo" explícitamente. Sin esto, Supabase manda a la
  // persona a su "Site URL", que en muchos proyectos sigue siendo
  // localhost: el enlace muere con "ERR_CONNECTION_REFUSED", que es
  // justo lo que pasaba antes de esta función.
  const base = origenDeLaPeticion(req)
  if (!base) {
    return new Response(
      JSON.stringify({
        error: 'No se pudo deducir la dirección de la app. Configura el "Site URL" en Supabase.'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const redirectTo = base + '/pages/registro.html'

  const { error: errorEnvio } = await admin.auth.admin.inviteUserByEmail(correo, {
    redirectTo
  })
  if (errorEnvio) {
    // Si ya existe la cuenta, el enlace de invitación no sirve: esa
    // persona tiene que entrar con la contraseña que ya puso.
    if (/already|registered|exists/i.test(errorEnvio.message)) {
      return new Response(
        JSON.stringify({
          error: 'Ese correo ya tiene una cuenta. No se puede volver a invitar: cámbale los permisos en Soporte → Usuarios.'
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({ error: 'Supabase no pudo enviar el correo: ' + errorEnvio.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      ok: true,
      correo,
      redirect_to: redirectTo,
      mensaje: 'Invitación enviada a ' + correo + '.'
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
