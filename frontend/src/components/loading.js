export const Loading = {
  overlay(message = 'Procesando solicitud...') {
    return `<div class="cg-loading-overlay" role="status" aria-live="polite"><div class="cg-spinner"></div><p>${message}</p></div>`;
  },
  skeleton(lines = 4) {
    return `<div class="cg-skeleton-wrap">${Array.from({ length: lines }, (_, i) => `<span class="cg-skeleton" style="width:${90 - (i % 3) * 14}%"></span>`).join('')}</div>`;
  },
  mount(message) {
    let root = document.getElementById('loading-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'loading-root';
      document.body.appendChild(root);
    }
    root.innerHTML = this.overlay(message);
  },
  unmount() {
    const root = document.getElementById('loading-root');
    if (root) root.innerHTML = '';
  }
};
