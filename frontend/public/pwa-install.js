(() => {
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const appIcon = '/icons/contagest-app.svg';
  let deferredPrompt = null;

  function hasAuthenticatedSession() {
    try {
      const raw = localStorage.getItem('contagest_auth_session');
      if (!raw) return false;
      const session = JSON.parse(raw);
      // This metadata is only used to decide whether to show the install CTA.
      // Authentication itself is enforced by HttpOnly cookies on the backend.
      return Boolean(session?.tenantId) && Number(session?.expiresAt || 0) > Date.now();
    } catch {
      return false;
    }
  }

  function helpText() {
    if (isIos()) return 'En Safari toca Compartir y luego “Añadir a pantalla de inicio”.';
    if (isAndroid()) return 'En Chrome toca el menú ⋮ y elige “Instalar aplicación” o “Añadir a pantalla principal”.';
    return 'Abre el menú del navegador y elige “Instalar aplicación” o “Añadir a pantalla principal”.';
  }

  function showManualHelp(host) {
    host.dataset.installState = 'manual-help';
    let message = host.querySelector('[data-cg-install-help]');
    if (!message) {
      message = document.createElement('div');
      message.dataset.cgInstallHelp = 'true';
      message.className = 'cg-pwa-help';
      message.setAttribute('role', 'status');
      host.appendChild(message);
    }
    message.textContent = helpText();
  }

  function mountInstallBanner() {
    if (!isMobile() || isStandalone() || hasAuthenticatedSession() || document.getElementById('cg-install-app')) return;
    const dismissedAt = Number(localStorage.getItem('cg_install_dismissed_at') || 0);
    if (dismissedAt && Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) return;

    const host = document.createElement('aside');
    host.id = 'cg-install-app';
    host.dataset.installState = deferredPrompt ? 'native-ready' : 'manual-ready';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'Instalar ContaGest');
    host.innerHTML = `
      <style>
        #cg-install-app{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;max-width:520px;margin-inline:auto;background:linear-gradient(145deg,#071a38,#123f8c);color:#fff!important;border:1px solid rgba(147,197,253,.30);border-radius:20px;padding:14px;box-shadow:0 24px 70px rgba(2,6,23,.46);font-family:Inter,system-ui,sans-serif;pointer-events:auto}
        #cg-install-app .cg-pwa-row{display:flex;gap:12px;align-items:center}#cg-install-app .cg-pwa-icon{width:50px;height:50px;border-radius:14px;object-fit:cover;background:#071a38;box-shadow:0 8px 24px rgba(0,0,0,.2)}#cg-install-app .cg-pwa-copy{min-width:0;flex:1}#cg-install-app .cg-pwa-title{font-size:15px;font-weight:900;margin:0 0 4px;color:#fff!important}#cg-install-app .cg-pwa-text{font-size:12px;line-height:1.45;color:#dbeafe!important;margin:0}#cg-install-app .cg-pwa-actions{display:flex;gap:8px;margin-top:12px}#cg-install-app .cg-pwa-btn{flex:1;min-height:46px;border:0;border-radius:13px;padding:11px 12px;font-weight:900;font-size:13px;cursor:pointer;touch-action:manipulation;pointer-events:auto}#cg-install-app .cg-pwa-btn:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}#cg-install-app .cg-pwa-primary{background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff!important;box-shadow:0 10px 24px rgba(37,99,235,.28)}#cg-install-app .cg-pwa-secondary{background:rgba(6,16,30,.72);color:#e2e8f0!important;border:1px solid #3b5574}#cg-install-app .cg-pwa-help{margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(6,16,30,.78);border:1px solid rgba(148,163,184,.28);color:#dbeafe!important;font-size:12px;line-height:1.5}
      </style>
      <div class="cg-pwa-row"><img class="cg-pwa-icon" src="${appIcon}" alt=""><div class="cg-pwa-copy"><p class="cg-pwa-title">Instalar ContaGest</p><p class="cg-pwa-text">Añádela al inicio del teléfono y úsala en modo aplicación.</p></div></div>
      <div class="cg-pwa-actions"><button type="button" class="cg-pwa-btn cg-pwa-secondary" data-cg-dismiss>Ahora no</button><button type="button" class="cg-pwa-btn cg-pwa-primary" data-cg-install>${deferredPrompt ? 'Instalar' : 'Añadir al inicio'}</button></div>`;
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
})();
