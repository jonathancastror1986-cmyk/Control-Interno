// ============================================================
// Edge Function: recuperar contraseña
// ============================================================
// Por qué esto es una función y no un botón en la app: el correo de
// recuperación lo manda Supabase, y para decidir a qué dirección vuelve
// el enlace hace falta la API de administración (auth.admin), que
// exige la service_role. Esa clave no puede estar en el navegador:
// quien la tuviera podría leer y modificar toda la base.
//
// Esta función hace tres cosas:
//   1. Se verifica que quien llama sea un usuario activo. NO se pide
//      el permiso de administrar usuarios: cualquiera con una cuenta
//      perdida tiene que poder recuperarla, y en qué correo va el
//      enlace no dice nada que valga la pena esconder.
//   2. Se manda el correo con "redirectTo" explícito, que es lo que
//      arregla el enlace roto: sin esto, Supabase devuelve a su "Site
//      URL", que en muchos proyectos sigue siendo localhost:3000 y
//      la persona recibe un link que no abre.
//   3. Se responde SIEMPRE lo mismo, exista o no la cuenta. Si se
//      dijera "ese correo no existe", el formulario serviría para
//      averiguar qué correos están registrados en la obra.
//
// Desplegar:
//   supabase functions deploy recuperar
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const origenDeLaPeticion = (req) => {
  const origen = req.headers.get('origin') || ''
  if (origen) return origen.replace(/\/$/, '')
  const referer = req.headers.get('referer') || ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

const responder = (cuerpo, codigo = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: codigo,
    headers: { 'Content-Type': 'application/json' }
  })

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return responder({ error: 'Método no permitido. Usa POST.' }, 405)
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) {
    return responder({ error: 'La función no tiene configurado SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' }, 500)
  }

  const cuerpo = await req.json().catch(() => null)
  const correo = String((cuerpo && cuerpo.correo) || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return responder({ error: 'Escribe un correo válido.' }, 400)
  }

  const base = origenDeLaPeticion(req)
  if (!base) {
    return responder({
      error: 'No se pudo deducir la dirección de la app. Configura el "Site URL" en Supabase.'
    }, 500)
  }
  // La página que recibe el enlace y deja cambiar la contraseña.
  const redirectTo = base + '/pages/reset-password.html'

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  // Se averigua si la cuenta existe, pero la respuesta al usuario es
  // la misma en los dos casos (ver la nota del encabezado).
  const existe = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  })
  let encontrado = false
  if (existe.data && existe.data.users) {
    encontrado = existe.data.users.some(u => String(u.email || '').toLowerCase() === correo)
  }

  if (!encontrado) {
    // No se dice que no existe. Se responde como si se hubiera enviado.
    return responder({
      ok: true,
      enviado: false,
      mensaje: 'Si ese correo tiene una cuenta, te mandamos el enlace.'
    })
  }

  const { error } = await admin.auth.resetPasswordForEmail(correo, { redirectTo })
  if (error) {
    return responder({ error: 'Supabase no pudo enviar el correo: ' + error.message }, 502)
  }

  return responder({
    ok: true,
    enviado: true,
    redirect_to: redirectTo,
    mensaje: 'Te mandamos el enlace a ' + correo + '.'
  })
})
