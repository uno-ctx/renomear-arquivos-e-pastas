(() => {
  let theme = document.documentElement.dataset.savedTheme || 'light';
  if (!document.documentElement.dataset.savedTheme) { try { theme = localStorage.getItem('renomear-theme') === 'dark' ? 'dark' : 'light'; } catch {} }
  document.documentElement.dataset.theme = theme;
  function update(next, save = false) {
    theme = next;
    if (save) {
      const token = sessionStorage.getItem('renomear-token') || location.hash.slice(1);
      fetch('/api/theme', {method:'POST', headers:{'Content-Type':'application/json','X-Session-Token':token}, body:JSON.stringify({theme:next})}).catch(() => {});
    }
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('renomear-theme', next); } catch {}
    document.querySelectorAll('[data-set-theme]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.setTheme === next));
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-set-theme]').forEach(button => {
      button.addEventListener('click', () => update(button.dataset.setTheme, true));
    });
    update(theme);
  });
})();
