(() => {
  const storageKey = 'control-asistencia-theme';
  const root = document.documentElement;
  let savedTheme = null;

  try {
    savedTheme = localStorage.getItem(storageKey);
  } catch {}

  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : systemTheme;

  /* -------------------------------------------------------------------
     EL TEXTO DEL BOTÓN, Y SOLO EL TEXTO
     -------------------------------------------------------------------

     Antes se hacía "button.textContent = ...". Eso borra TODO lo que hay
     adentro del botón: los dos íconos de sol y de luna, y cualquier otra
     cosa que se le hubiera puesto.

     Y se notaba. El botón se quedaba con un solo ícono —el que estaba en el
     archivo, siempre el mismo— y el otro nunca aparecía, porque al cambiar de
     tema la primera cosa que hacía esta función era borrar el ícono bueno.

     Ahora se cambia el texto de la ETIQUETA, que es un <span> con nombre, y
     los íconos se quedan donde están. Si no hay etiqueta —el botón del login
     es solo texto— se sigue escribiendo el texto completo, como antes.
     ------------------------------------------------------------------- */
  function etiquetar(boton, theme) {
    // Lo que DICE el botón, y lo que HACE, son dos cosas distintas y a propósito.
    //
    //   lo que se ve         el modo en que se está
    //   lo que se anuncia     lo que el botón hace
    //
    // Lo que se ve tiene que ser el modo en que se está, porque es lo que uno
    // mira para saber en qué está la pantalla, y porque tiene que coincidir con
    // el ícono: la luna ES lo oscuro y el sol ES lo claro. Con la palabra diciendo
    // el destino, la luna quedaba al lado de "Modo claro" y los dos se contradecían.
    //
    // Lo que se anuncia tiene que ser lo que el botón hace, porque un lector de
    // pantalla necesita saber qué pasa al apretarlo. Un botón que se anuncia como
    // "Modo oscuro" y al apretarlo aclara la pantalla es un botón que miente.
    const actual = theme === 'dark' ? 'oscuro' : 'claro';
    const siguiente = theme === 'dark' ? 'claro' : 'oscuro';
    const aviso = 'Cambiar a modo ' + siguiente;

    const etiqueta = boton.querySelector('[data-tema-palabra]');
    if (etiqueta) {
      etiqueta.textContent = 'Modo ' + actual;
    } else {
      boton.textContent = (theme === 'dark' ? '☾ Modo oscuro' : '☀ Modo claro');
    }

    boton.setAttribute('aria-label', aviso);
    boton.title = aviso;
  }

  function updateTheme(theme, persist = true) {
    root.dataset.theme = theme;
    if (persist) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch {}
    }

    document.querySelectorAll('[data-theme-toggle]').forEach(button => etiquetar(button, theme));
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateTheme(root.dataset.theme, false);
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        updateTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
      });
    });
  });
})();