(() => {
  const storageKey = 'control-asistencia-theme';
  const root = document.documentElement;
  let savedTheme = null;

  try {
    savedTheme = localStorage.getItem(storageKey);
  } catch {}

  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : systemTheme;

  function updateTheme(theme, persist = true) {
    root.dataset.theme = theme;
    if (persist) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch {}
    }

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      button.textContent = theme === 'dark' ? '☀ Modo claro' : '☾ Modo oscuro';
      button.setAttribute('aria-label', `Cambiar a modo ${nextTheme === 'dark' ? 'oscuro' : 'claro'}`);
      button.title = `Cambiar a modo ${nextTheme === 'dark' ? 'oscuro' : 'claro'}`;
    });
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