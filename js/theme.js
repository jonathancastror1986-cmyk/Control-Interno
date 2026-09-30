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
    const siguiente = theme === 'dark' ? 'light' : 'dark';
    const nombre = siguiente === 'dark' ? 'oscuro' : 'claro';
    const aviso = 'Cambiar a modo ' + nombre;

    const etiqueta = boton.querySelector('[data-tema-palabra]');
    if (etiqueta) {
      // Lo que DICE el botón es a qué se cambia, no en qué se está. "Modo
      // oscuro" con el ícono de luna es un botón que lleva al tema claro, y ese
      // texto es el que tiene que decir, porque es lo que lee quien no ve el
      // ícono.
      etiqueta.textContent = 'Modo ' + nombre;
    } else {
      boton.textContent = (theme === 'dark' ? '☀ Modo claro' : '☾ Modo oscuro');
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