(() => {
  const isStandalone = () => [
    '(display-mode: standalone)',
    '(display-mode: fullscreen)',
    '(display-mode: minimal-ui)'
  ].some((query) => window.matchMedia(query).matches) || window.navigator.standalone === true;

  const isMobile = () => window.matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const appIcon = '/icons/contagest-app.svg';
  let deferredPrompt = null;

  function hasAuthenticatedSession() {
    try {
      const raw = localStorage.getItem('contagest_auth_session');
      if (!raw) return false;
      const session = JSON.parse(raw);
      // UI metadata only. Authentication remains enforced by HttpOnly cookies on the backend.
      return Boolean(session?.tenantId) && Number(session?.expiresAt || 0) > Date.now();
    } catch {
      return false;
    }
  }

  function helpText() {
    if (isIos()) return 'En iPhone o iPad toca Compartir y luego “Añadir a pantalla de inicio”. Si no aparece, abre ContaGest en Safari.';
    if (isAndroid()) return 'En Chrome toca el menú ⋮ y elige “Instalar aplicación” o “Añadir a pantalla principal”.';
    return 'Abre el menú del navegador y elige “Instalar aplicación” o “Añadir a pantalla principal”.';
  }

  function el(tag, { className = '', text = '', attrs = {} } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    Object.entries(attrs).forEach(([name, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(name, String(value));
    });
    return node;
  }

  function showManualHelp(host) {
    host.dataset.installState = 'manual-help';
    let message = host.querySelector('[data-cg-install-help]');
    if (!message) {
      message = el('div', {
        className: 'cg-pwa-help',
        attrs: { 'data-cg-install-help': 'true', role: 'status', 'aria-live': 'polite' }
      });
      host.appendChild(message);
    }
    message.textContent = helpText();
  }

  function buildInstallBanner() {
    const host = el('aside', {
      className: 'cg-pwa-install',
      attrs: {
        id: 'cg-install-app',
        role: 'dialog',
        'aria-label': 'Instalar ContaGest',
        'aria-modal': 'false'
      }
    });
    host.dataset.installState = deferredPrompt ? 'native-ready' : 'manual-ready';

    const row = el('div', { className: 'cg-pwa-row' });
    const icon = el('img', {
      className: 'cg-pwa-icon',
      attrs: { src: appIcon, alt: '', width: '50', height: '50', decoding: 'async' }
    });
    const copy = el('div', { className: 'cg-pwa-copy' });
    copy.append(
      el('p', { className: 'cg-pwa-title', text: 'Instalar ContaGest' }),
      el('p', { className: 'cg-pwa-text', text: 'Añádela al inicio del teléfono y úsala en modo aplicación.' })
    );
    row.append(icon, copy);

    const actions = el('div', { className: 'cg-pwa-actions' });
    const dismiss = el('button', {
      className: 'cg-pwa-btn cg-pwa-secondary',
      text: 'Ahora no',
      attrs: { type: 'button', 'data-cg-dismiss': 'true' }
    });
    const install = el('button', {
      className: 'cg-pwa-btn cg-pwa-primary',
      text: deferredPrompt ? 'Instalar' : 'Añadir al inicio',
      attrs: { type: 'button', 'data-cg-install': 'true' }
    });
    actions.append(dismiss, install);
    host.append(row, actions);
    return host;
  }

  function mountInstallBanner() {
    if (!isMobile() || isStandalone() || hasAuthenticatedSession() || document.getElementById('cg-install-app')) return;
    const dismissedAt = Number(localStorage.getItem('cg_install_dismissed_at') || 0);
    if (dismissedAt && Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) return;

    const host = buildInstallBanner();
    document.body.appendChild(host);

    host.querySelector('[data-cg-dismiss]')?.addEventListener('click', () => {
      localStorage.setItem('cg_install_dismissed_at', String(Date.now()));
      host.remove();
    });

    host.querySelector('[data-cg-install]')?.addEventListener('click', async () => {
      const button = host.querySelector('[data-cg-install]');
      if (deferredPrompt) {
        host.dataset.installState = 'prompting';
        button?.setAttribute('disabled', 'disabled');
        try {
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          host.dataset.installState = choice?.outcome || 'dismissed';
          if (choice?.outcome === 'accepted') host.remove();
          else showManualHelp(host);
        } catch {
          showManualHelp(host);
        } finally {
          deferredPrompt = null;
          button?.removeAttribute('disabled');
          if (button) button.textContent = 'Añadir al inicio';
        }
        return;
      }

      host.dataset.installState = 'manual-requested';
      showManualHelp(host);
      try { await navigator.serviceWorker?.ready; } catch { /* guidance already visible */ }
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    const host = document.getElementById('cg-install-app');
    if (host) host.dataset.installState = 'native-ready';
    const button = document.querySelector('#cg-install-app [data-cg-install]');
    if (button) button.textContent = 'Instalar';
    mountInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    localStorage.removeItem('cg_install_dismissed_at');
    document.getElementById('cg-install-app')?.remove();
  });

  window.addEventListener('load', () => setTimeout(mountInstallBanner, 700));
  window.addEventListener('pageshow', () => setTimeout(mountInstallBanner, 250));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') mountInstallBanner();
  });
})();
