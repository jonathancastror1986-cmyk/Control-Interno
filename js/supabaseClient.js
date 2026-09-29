// ============================================================
// EL CLIENTE DE SUPABASE
// ============================================================
//
// Qué es esto: una conexión a la base, que el resto de la aplicación usa
// para leer y escribir. La crea la librería de @supabase/supabase-js, que se
// carga antes, desde una CDN.
//
// ------------------------------------------------------------------
// POR QUÉ ESTE ARCHIVO TIENE MÁS DE TRES LÍNEAS
// ------------------------------------------------------------------
// La versión anterior era:
//
//     window.supabaseClient = window.supabase.createClient(...)
//
// Sin ninguna comprobación. Si la librería de la CDN no cargó —sin
// internet en la obra, un filtro corporativo, un corte de la señal—
// window.supabase no existe, la línea lanza un TypeError y este archivo
// MUERE.
//
// Y como el resto de la aplicación usa window.supabaseClient sin
// comprobar, el primer uso revienta también. Peor: el arranque se corta en
// la primera línea que toca la base, que es ANTES de armar el menú. La
// pantalla queda mostrando el encabezado, con la barra de secciones vacía
// y ningún decir por qué.
//
// Ese síntoma se reporta como "no se ven los submenús", que no dice nada
// de la causa. Y la causa no es el menú: es que no se pudo hablar con la
// base.
//
// ------------------------------------------------------------------
// QUÉ SE HACE ACA
// ------------------------------------------------------------------
// Tres cosas, en orden:
//
//   1. Se mira si la librería llegó. Si no, se dice POR QUÉ en la pantalla,
//      con un texto que la persona pueda actuar, y no un error de código.
//
//   2. Se avisa una sola vez. La librería se carga una vez por página, y
//      avisar en cada intento llena la consola de lo mismo y no agrega
//      nada.
//
//   3. Si llegó pero el cliente no se pudo crear, se dice también: pasa
//      cuando la URL o la llave de la configuración están vacías, que es un
//      error de instalación y no de conexión.

(function(){
  'use strict';

  // ----------------------------------------------------------------
  // 1) ¿LLEGÓ LA LIBRERÍA?
  // ----------------------------------------------------------------
  if(typeof window.supabase==='undefined'||!window.supabase.createClient){
    window.supabaseFallo=window.supabaseFallo||{
      motivo:'no-se-cargo-la-libreria',
      mensaje:'No se pudo cargar la librería de conexión con la base.\n\n'
        +'Casi siempre es que este equipo no tiene internet, o que hay un '
        +'filtro que bloquea la librería.\n\n'
        +'Probá:\n'
        +'1. Abrí otra página de esta misma aplicación. Si tampoco funciona, '
        +'es la conexión de este equipo.\n'
        +'2. Si funciona en otro equipo, este tiene un filtro o falta DNS.\n'
        +'3. Recargá con Ctrl+Shift+R: a veces el navegador guardó una '
        +'versión rota de la librería.'
    };
    console.error('[supabaseClient] la librería de Supabase no se cargó. '
      +'Faltan las librerías de la CDN, o no hay conexión.');
    return;
  }

  // ----------------------------------------------------------------
  // 2) ¿ESTÁ LA CONFIGURACIÓN?
  // ----------------------------------------------------------------
  if(!window.SUPABASE_URL||!window.SUPABASE_ANON_KEY){
    window.supabaseFallo=window.supabaseFallo||{
      motivo:'falta-la-configuracion',
      mensaje:'La aplicación no tiene la dirección de la base.\n\n'
        +'Falta el archivo js/supabaseConfig.js con la URL y la llave. '
        +'Es un error de instalación: lo tiene que poner alguien con acceso '
        +'al proyecto, y no se arregla recargando la página.'
    };
    console.error('[supabaseClient] falta js/supabaseConfig.js: sin SUPABASE_URL '
      +'ni SUPABASE_ANON_KEY no se puede crear el cliente.');
    return;
  }

  // ----------------------------------------------------------------
  // 3) CREAR EL CLIENTE
  // ----------------------------------------------------------------
  try{
    window.supabaseClient=window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_ANON_KEY
    );
    // Que quede constancia, sin ruido: una línea por carga, no más.
    console.log('[supabaseClient] listo, base ' + window.SUPABASE_URL);
  }catch(error){
    window.supabaseFallo=window.supabaseFallo||{
      motivo:'no-se-pudo-crear',
      mensaje:'La librería de conexión se cargó pero no se pudo crear el cliente.\n\n'
        +'Detalle: '+(error&&error.message?error.message:'sin detalle')
    };
    console.error('[supabaseClient] no se pudo crear el cliente:',error);
  }
})();
