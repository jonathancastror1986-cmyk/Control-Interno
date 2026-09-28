// ============================================================
// Edge Function: marcar asistencia desde un tótem
// ============================================================
// POR QUÉ ESTO Y NO UN /api/v1/asistencia/marcar
//
// Este proyecto no tiene servidor. Lo que hay es Supabase, que da dos
// cosas donde se puede publicar una función: PostgREST (REST sobre las
// tablas) y las Edge Functions (Deno, en un subdirectorio). Un
// /api/v1/... con dominio propio sería una máquina y un despliegue más, y
// no aporta nada acá.
//
// Entonces la ruta es:
//
//   POST /functions/v1/marcar
//   { "token": "...", "codigo": "0001", "tipo": "entrada" }
//
// Y responde 200 con el resultado, o 4xx con el motivo. Un tótem no puede
// Distinguir 400 de 500, así que el cuerpo del error va en un código
// corto y estable que la pantalla traduce a un mensaje para la persona.
//
// QUÉ HACE ESTA FUNCIÓN Y QUÉ NO
//
// NO calcula asistencia, ni atrasos, ni horas extra. Todo eso es de una
// persona y de sus reglas, no de un aparato en la portería. Acá solo se
// registra el hecho: alguienpresented una credencial en un reloj, a tal
// hora, y este fue el reloj.
//
// Lo que SÍ hace, y no podría hacer la pantalla del tótem por su cuenta:
//
//   - manda el token del dispositivo. El token no viaja en el HTML: si
//     estuviera ahí, cualquiera que abriera las herramientas del navegador
//     en el tótem lo copiaría y podría marcar en nombre de otro.
//   - aplica la ventana antirrebote. Si la aplicara el navegador, un
//     tótem con la hora desfasada se saltaría el control.
//   - valida la credencial contra el servidor. Si la validara el cliente,
//     una pantalla con la versión vieja seguiría aceptando tarjetas
//     anuladas.
//
// CORS: va abierto a propósito. La petición viene de una pantalla en un
// aparato de la obra, que puede estar en una red de visitantes, y no
// lleva credenciales de usuario: lleva el token del reloj, que es lo que
// se valida. La función NO acepta peticiones con la service_role ni hace
// nada con cookies de sesión.
//
// Desplegar:
//   supabase functions deploy marcar
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

// El cliente de servicio es el único que puede llamar a marcar_por_reloj:
// la función es SECURITY DEFINER y valida el token del reloj por su cuenta.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } }
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// El tótem no es un navegador: es un aparato en la portería que manda una
// línea y no reintenta. La respuesta dice si reintentar.
const RESPUESTAS: Record<string, { http: number; reintentar: boolean }> = {
  CODIGO_VACIO:         { http: 400, reintentar: false },
  CODIGO_LARGO:         { http: 400, reintentar: false },
  CODIGO_DESCONOCIDO:   { http: 404, reintentar: false },
  TIPO_INVALIDO:        { http: 400, reintentar: false },
  TARJETA_BLOQUEADA:    { http: 403, reintentar: false },
  TARJETA_ANULADA:      { http: 403, reintentar: false },
  TRABAJADOR_NO_ACTIVO: { http: 403, reintentar: false },
  OTRA_EMPRESA:         { http: 403, reintentar: false },
  RELOJ_INACTIVO:       { http: 403, reintentar: false },
  TOKEN_INVALIDO:       { http: 401, reintentar: true },
}

const json = (cuerpo: unknown, http = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: http,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  // El preflight lo manda el navegador, no el tótem, pero la pantalla se
  // prueba en un navegador común y sin esto el fetch falla en CORS.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') {
    return json({ error: 'METODO_NO_PERMITIDO', detalle: 'Solo se acepta POST.' }, 405)
  }

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'JSON_INVALIDO', detalle: 'El cuerpo tiene que ser JSON.' }, 400)
  }

  const token = String(cuerpo.token ?? '').trim()
  const codigo = String(cuerpo.codigo ?? '').trim()
  const tipo = String(cuerpo.tipo ?? 'entrada').trim()
  const segundos = cuerpo.segundos_antirrebote === undefined || cuerpo.segundos_antirrebote === null
    ? null
    : Number(cuerpo.segundos_antirrebote)

  if (!token) return json({ error: 'FALTA_TOKEN' }, 400)
  if (!codigo) return json({ error: 'CODIGO_VACIO' }, 400)
  if (segundos !== null && (!Number.isFinite(segundos) || segundos < 5 || segundos > 600)) {
    return json({ error: 'ANTIRREBOTE_FUERA_DE_RANGO', detalle: 'Entre 5 y 600 segundos.' }, 400)
  }

  const { data, error } = await supabase.rpc('marcar_por_reloj', {
    p_token: token,
    p_codigo: codigo,
    p_tipo: tipo,
    p_segundos_antirrebote: segundos,
  })

  if (error) {
    // La función de la base levanta con un código corto como mensaje. Se
    // busca en el texto porque Postgres lo envuelve con el nombre de la
    // función y el contexto.
    const clave = Object.keys(RESPUESTAS).find((k) => error.message.includes(k))
    if (clave) {
      const r = RESPUESTAS[clave]
      return json({ error: clave, reintentar: r.reintentar }, r.http)
    }
    // Cualquier otra cosa es un fallo de la base, no del tótem. Se loguea
    // entero en el servidor y al tótem se le dice lo justo.
    console.error('marcar: error inesperado', error)
    return json(
      { error: 'ERROR_DEL_SERVIDOR', detalle: 'No se pudo registrar. Reintentá en un momento.', reintentar: true },
      500
    )
  }

  const fila = Array.isArray(data) ? data[0] : data
  if (!fila) return json({ error: 'SIN_RESPUESTA' }, 500)

  // 200 también para "duplicado" y "ya_marcado": no son fallos. La
  // diferencia está en el cuerpo, y un tótem que mostrara un cartel rojo
  // por una lectura repetida haría que la persona crean que su marca no
  // entró.
  return json({
    ok: fila.resultado === 'ok',
    resultado: fila.resultado,
    trabajador: { codigo: fila.trabajador_code, nombre: fila.trabajador_nombre },
    marca: { hora: fila.marca_hora, tipo: fila.marca_tipo, fecha: fila.marca_fecha },
    reloj: { codigo: fila.reloj_code, centro_costo: fila.centro_costo_nombre },
    detalle: fila.detalle,
  })
})
