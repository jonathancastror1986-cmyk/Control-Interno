/* ===================================================================
   EL RELOJ Y EL CLIMA DEL ENCABEZADO
   ===================================================================

   -------------------------------------------------------------------
   QUÉ HACE Y DÓNDE
   -------------------------------------------------------------------

   Muestra, en el encabezado, tres cosas juntas: el ícono del tema (sol o
   luna), la temperatura de Santiago y la hora. Y al pasar el puntero:

     - sobre el ícono del tema, al lado, aparece "Modo oscuro" o
       "Modo claro", chiquito
     - sobre la hora, en vez de la hora aparece la fecha y el lugar

   -------------------------------------------------------------------
   DE DÓNDE SALEN LOS DATOS
   -------------------------------------------------------------------

   LA HORA Y LA FECHA: del reloj del propio navegador. No hay nada de
   afuera. La zona horaria se pone explícita —America/Santiago— porque el
   sistema es chileno y una persona que entre desde otra parte tiene que ver
   la hora de Chile, no la del servidor donde esté.

   EL CLIMA: de Open-Meteo. Es un servicio público, sin cuenta y sin clave,
   y admite llamadas desde el navegador.

     https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...

   -------------------------------------------------------------------
   LO QUE SALE DEL NAVEGADOR, Y QUÉ NO
   -------------------------------------------------------------------

   La consulta se hace desde el navegador del usuario, así que lo único que
   sale es la petición: Open-Meteo ve la dirección IP desde la que se hizo.
   NO se manda la ubicación de nadie, porque NO se pide: la ciudad está fija
   en el archivo (Santiago) y no se usa geolocalización en ninguna parte.

   Y si el usuario no quiere que eso salga, basta con poner
   CLIMA_SIN_RED = true en la CONFIGURACIÓN de más abajo. El reloj sigue
   funcionando; lo único que desaparece son los grados y el ícono del clima.

   -------------------------------------------------------------------
   POR QUÉ NO SE INVENTA NINGÚN DATO CUANDO LA CONSULTA FALLA
   -------------------------------------------------------------------

   Un botón que promete el clima y no puede mostrarlo tiene que callar esa
   parte, no inventar un número. Si no hay red, si Open-Meteo se cae, o si
   alguien bloqueó la petición, el reloj sigue en su sitio y los grados y el
   ícono desaparecen. Un "--°" o un "0°" de relleno sería un dato falso
   en un sistema que después se usa para justificar la jornada de alguien.

   El error se guarda en "ClimaReloj.fallo" para que se pueda mirar, pero no
   se muestra en pantalla.
   =================================================================== */
(() => {
  'use strict';

  /* -------------------------------------------------------------------
     CONFIGURACIÓN. Todo lo que se pueda cambiar de una página a otra está
     aquí arriba, con nombre, y no escrito en el medio del código.
     ------------------------------------------------------------------- */
  const CONFIG = {
    // La ciudad. Es la que sale al lado de la fecha, así que se escribe una sola
    // vez y se usa para las dos cosas.
    LUGAR: 'Santiago',
    ZONA: 'America/Santiago',

    // Las coordenadas de Santiago. Van con la ciudad y no con el usuario: por eso
    // no hay geolocalización en ninguna parte de este archivo.
    LATITUD: -33.4489,
    LONGITUD: -70.6693,

    // El clima se vuelve a preguntar cada 15 minutos. La hora se actualiza sola.
    //
    // El 15 sale de que el pronóstico no cambia en minutos, y de que preguntar
    // cada minuto sería una petición por usuario por minuto contra un servicio
    // gratuito. Si el servicio se pone lento, es esta parte la que se resiente,
    // no el reloj.
    CADA_CUANTO_MS: 15 * 60 * 1000,

    // El reloj se refresca cada 15 segundos, no cada minuto. La idea es que el
    // segundo que se muestra no se vea "atrasado" cuando el minuto cambia: si
    // solo se actualizara al cambiar de minuto, el reloj se quedaría quieto
    // hasta que el segundo sea el correcto.
    RELOJ_CADA_MS: 15 * 1000,

    // Poner en true deja de preguntar el clima. El reloj no se toca.
    CLIMA_SIN_RED: false,
  };

  /* -------------------------------------------------------------------
     LOS CÓDIGOS DEL CLIMA
     -------------------------------------------------------------------

     Son los de la OMM (Organización Meteorológica Mundial), tabla 4677, que
     son los que usa Open-Meteo. No están inventados: cada número es un
     estado del tiempo con nombre oficial.

     Se agrupan en cinco íconos porque en 15 píxeles de alto no se distinguen
     seis estados. El agrupamiento está escrito abajo, código por código, para
     que se pueda cambiar sin adivinar:

       SOL       0 y 1     despejado, y casi despejado
       NUBE      2 y 3     parcialmente nublado y cielo cubierto
       NUBE      45 y 48   niebla
       LLUVIA    51 a 57   llovizna, y llovizna helada
       LLUVIA    61 a 67   lluvia, y lluvia helada
       LLUVIA    80 a 82   chubascos
       NIEVE     71 a 77   nieve, y granos de nieve
       NIEVE     85 y 86   chubascos de nieve
       TORMENTA  95 a 99   tormenta, y tormenta con granizo

     La diferencia entre "despejado" y "casi despejado" no se ve a este
     tamaño, así que los dos son sol. Lo que SÍ se ve es la diferencia entre
     sol, nublado y con agua, y esos tres quedan separados.
     ------------------------------------------------------------------- */
  const CODIGOS = {
    0: { icono: 'sol', nombre: 'Despejado' },
    1: { icono: 'sol', nombre: 'Mayormente despejado' },
    2: { icono: 'nube', nombre: 'Parcialmente nublado' },
    3: { icono: 'nube', nombre: 'Cielo cubierto' },
    45: { icono: 'nube', nombre: 'Niebla' },
    48: { icono: 'nube', nombre: 'Niebla con escarcha' },
    51: { icono: 'lluvia', nombre: 'Llovizna ligera' },
    53: { icono: 'lluvia', nombre: 'Llovizna moderada' },
    55: { icono: 'lluvia', nombre: 'Llovizna densa' },
    56: { icono: 'lluvia', nombre: 'Llovizna helada ligera' },
    57: { icono: 'lluvia', nombre: 'Llovizna helada densa' },
    61: { icono: 'lluvia', nombre: 'Lluvia ligera' },
    63: { icono: 'lluvia', nombre: 'Lluvia moderada' },
    65: { icono: 'lluvia', nombre: 'Lluvia fuerte' },
    66: { icono: 'lluvia', nombre: 'Lluvia helada ligera' },
    67: { icono: 'lluvia', nombre: 'Lluvia helada fuerte' },
    71: { icono: 'nieve', nombre: 'Nieve ligera' },
    73: { icono: 'nieve', nombre: 'Nieve moderada' },
    75: { icono: 'nieve', nombre: 'Nieve fuerte' },
    77: { icono: 'nieve', nombre: 'Granos de nieve' },
    80: { icono: 'lluvia', nombre: 'Chubascos ligeros' },
    81: { icono: 'lluvia', nombre: 'Chubascos moderados' },
    82: { icono: 'lluvia', nombre: 'Chubascos violentos' },
    85: { icono: 'nieve', nombre: 'Chubascos de nieve ligeros' },
    86: { icono: 'nieve', nombre: 'Chubascos de nieve fuertes' },
    95: { icono: 'tormenta', nombre: 'Tormenta' },
    96: { icono: 'tormenta', nombre: 'Tormenta con granizo ligero' },
    99: { icono: 'tormenta', nombre: 'Tormenta con granizo fuerte' },
  };

  /* -------------------------------------------------------------------
     LA URL DEL CLIMA
     -------------------------------------------------------------------

     Se arma con la configuración y no se escribe a mano, para que cambiar la
     ciudad sea cambiar un número y no buscar una cadena larga escondida en el
     archivo. El "&" va como "&amp;" solo si se pone en HTML; aquí va entero,
     porque esto es una cadena de JavaScript.
     ------------------------------------------------------------------- */
  const URL_CLIMA =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + CONFIG.LATITUD +
    '&longitude=' + CONFIG.LONGITUD +
    '&current=temperature_2m,weather_code' +
    '&temperature_unit=celsius' +
    '&timezone=' + encodeURIComponent(CONFIG.ZONA);

  /* -------------------------------------------------------------------
     EL ESTADO, A LA VISTA
     -------------------------------------------------------------------

     Vive acá y no dentro de una función, porque hay tres cosas que lo
     necesitan: la pantalla, el temporizador del reloj y el temporizador del
     clima. Si estuviera dentro de la función que pinta, el temporizador no
     tendría cómo leerlo.

     Y se expone en "window.ClimaReloj" para que se pueda mirar desde la
     consola y, sobre todo, para que los guiones de prueba puedan comprobar
     que el clima se guardó y no se están inventando los grados.
     ------------------------------------------------------------------- */
  const estado = {
    clima: null,   // lo último que respondió el servicio, o null
    fallo: null,   // el último error, o null. No se muestra en pantalla.
    reloj: null,   // la última hora pintada, para no repintarla
  };

  /* -------------------------------------------------------------------
     LAS FUNCIONES PURAS
     -------------------------------------------------------------------

     "Pura" quiere decir que no tocan la pantalla ni la red: reciben algo y
     devuelven algo. Se pueden probar sin navegador y sin internet, que es la
     única forma de comprobar que un código de clima está en el ícono que le
     corresponde.
     ------------------------------------------------------------------- */

  /**
   * El ícono y el nombre de un código de clima.
   *
   * Y si el código no está en la tabla, NO inventa: devuelve "nube", que es
   * el ícono menos comprometido. Un código desconocido no es "sol despejado".
   * Un código desconocido no se sabe qué tiempo es.
   *
   * @param {number} codigo
   * @returns {{icono: string, nombre: string}}
   */
  function climaDe(codigo) {
    const encontrado = CODIGOS[codigo];
    if (encontrado) return { icono: encontrado.icono, nombre: encontrado.nombre };
    return { icono: 'nube', nombre: 'Sin dato' };
  }

  /**
   * La hora y la fecha, en el formato que se muestra.
   *
   * @param {Date} fecha
   * @returns {{hora: string, dia: string}}
   */
  function formatear(fecha) {
    const hora = new Intl.DateTimeFormat('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: CONFIG.ZONA,
    }).format(fecha);

    const dia = new Intl.DateTimeFormat('es-CL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: CONFIG.ZONA,
    }).format(fecha);

    return {
      // El "24:" en vez de "00:". Con "hour12:false" hay navegadores que devuelven
      // "24:05" para la medianoche, y eso no es una hora que exista.
      hora: hora.replace(/^24:/, '00:'),

      // "mié, 30 sept" sale así del formato de Chile. La coma es el separador de
      // una lista, y entre el día y el mes sobra, así que se quita. Y lo demás se
      // deja como lo dice el locale —"sept" y no "sep"— porque el nombre corto
      // del mes no es algo que se pueda inventar: sale de la configuración
      // regional del sistema, que es la misma que usa el resto del sistema
      // operativo del usuario.
      dia: dia.replace(/,/g, '').replace(/\s+/g, ' ').trim() + ' · ' + CONFIG.LUGAR,
    };
  }

  /* -------------------------------------------------------------------
     PINTAR
     -------------------------------------------------------------------

     Cada función recibe los elementos YA BUSCADOS y comprueba uno por uno que
     estén. Un guion y una función que dibujan tienen que tolerar que falte la
     mitad de la página: si el reloj se usa en una pantalla que no tiene ese
     trozo, no puede reventar con un error de JavaScript.
     ------------------------------------------------------------------- */

  function pintarReloj(els) {
    const ahora = formatear(new Date());
    if (els.hora) els.hora.textContent = ahora.hora;
    if (els.detalle) els.detalle.textContent = ahora.dia;
    estado.reloj = ahora;
    return ahora;
  }

  function pintarClima(els, clima) {
    estado.clima = clima;
    if (els.grados) els.grados.textContent = Math.round(clima.temperatura) + '°';
    if (els.punto) els.punto.hidden = false;
    if (els.ico) {
      els.ico.className = 'clima-ico es-' + clima.icono;
      els.ico.setAttribute('aria-hidden', 'true');
    }
    // El nombre largo del tiempo va en el "title" y en el "aria-label", que es
    // donde se lee cuando no se ve. "12°" solo no dice si está lloviendo, y
    // quien usa un lector de pantalla necesita saberlo.
    if (els.grupo) {
      const texto = Math.round(clima.temperatura) + ' grados, ' + clima.nombre + ' en ' + CONFIG.LUGAR;
      els.grupo.setAttribute('title', texto);
      els.grupo.setAttribute('aria-label', texto);
    }
  }

  /**
   * Silencia el clima. Se usa cuando la consulta falla, y cuando
   * CONFIG.CLIMA_SIN_RED está puesto.
   *
   * Los elementos se esconden con "hidden", no con un texto de relleno. Es la
   * diferencia entre "no sé" y "0 grados", y en una pantalla de asistencia esa
   * diferencia se nota.
   */
  function callarClima(els, motivo) {
    estado.clima = null;
    estado.fallo = motivo || null;
    if (els.grados) { els.grados.textContent = ''; els.grados.hidden = true; }
    if (els.ico) { els.ico.hidden = true; els.ico.className = 'clima-ico'; }

    // El puntito de en medio va con el clima. Separa los grados de la hora, y
    // si los grados no estan no hay nada que separar: se queda como una coma
    // suelta pegada a la hora. Medido:
    //
    //     sin clima     luna      ·  10:35
    //
    // Y se esconde desde aca y no con una regla de ":has()", porque si el
    // navegador no entiende ":has()" la regla no se aplica y nadie se
    // entera de que faltaba.
    if (els.punto) els.punto.hidden = true;
    if (els.grupo) {
      els.grupo.removeAttribute('title');
      els.grupo.removeAttribute('aria-label');
    }
  }

  /* -------------------------------------------------------------------
     PREGUNTAR EL CLIMA
     ------------------------------------------------------------------- */
  async function preguntarClima(els) {
    if (CONFIG.CLIMA_SIN_RED) { callarClima(els, 'clima desactivado en la configuración'); return null; }

    try {
      const r = await fetch(URL_CLIMA, { cache: 'no-store' });
      if (!r.ok) throw new Error('respuesta ' + r.status);

      const datos = await r.json();
      const actual = datos && datos.current;
      if (!actual || typeof actual.temperature_2m !== 'number') {
        throw new Error('la respuesta no trae temperatura');
      }

      const codigo = actual.weather_code;
      const delCodigo = climaDe(codigo);
      const clima = {
        temperatura: actual.temperature_2m,
        codigo: codigo,
        icono: delCodigo.icono,
        nombre: delCodigo.nombre,
        lugar: CONFIG.LUGAR,
        leido: new Date().toISOString(),
      };

      if (els.grados) els.grados.hidden = false;
      if (els.ico) els.ico.hidden = false;
      if (els.punto) els.punto.hidden = false;
      pintarClima(els, clima);
      estado.fallo = null;
      return clima;
    } catch (e) {
      callarClima(els, e && e.message ? e.message : String(e));
      return null;
    }
  }

  /* -------------------------------------------------------------------
     ARRANCAR
     ------------------------------------------------------------------- */

  function buscar() {
    const d = document;
    return {
      hora: d.querySelector('[data-reloj-hora]'),
      detalle: d.querySelector('[data-reloj-detalle]'),
      grados: d.querySelector('[data-clima-grados]'),
      ico: d.querySelector('[data-clima-ico]'),
      punto: d.querySelector('[data-reloj-punto]'),
      grupo: d.querySelector('[data-clima]'),
    };
  }

  function hayAlgo(els) {
    return !!(els.hora || els.detalle || els.grados || els.ico || els.punto);
  }

  function arrancar() {
    const els = buscar();
    // Si la pantalla no tiene el reloj, no hay nada que hacer. Y no es un error:
    // el login no lo tiene, y está bien que no lo tenga.
    if (!hayAlgo(els)) return;

    pintarReloj(els);
    window.setInterval(function () { pintarReloj(els); }, CONFIG.RELOJ_CADA_MS);

    preguntarClima(els);
    window.setInterval(function () { preguntarClima(els); }, CONFIG.CADA_CUANTO_MS);
  }

  /* -------------------------------------------------------------------
     LO QUE SE ABRE PARA PODER PROBARLO
     -------------------------------------------------------------------

     Las tres funciones puras, la configuración y el estado. Todo lo que se
     expone se puede comprobar sin red y sin pantalla; lo que queda adentro no
     se abre, porque abrirlo para probarlo no deja de estar atado a la
     pantalla.
     ------------------------------------------------------------------- */
  window.ClimaReloj = {
    CONFIG: CONFIG,
    CODIGOS: CODIGOS,
    URL_CLIMA: URL_CLIMA,
    estado: estado,
    climaDe: climaDe,
    formatear: formatear,
    pintarReloj: pintarReloj,
    pintarClima: pintarClima,
    callarClima: callarClima,
    preguntarClima: preguntarClima,
    arrancar: arrancar,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();