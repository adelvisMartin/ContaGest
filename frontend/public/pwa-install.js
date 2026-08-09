(() => {
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  let deferredPrompt = null;

  function mountInstallBanner() {
    if (!isMobile() || isStandalone() || document.getElementById('cg-install-app')) return;
    const dismissedAt = Number(localStorage.getItem('cg_install_dismissed_at') || 0);
    if (dismissedAt && Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) return;

    const host = document.createElement('aside');
    host.id = 'cg-install-app';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'Instalar ContaGest');
    host.innerHTML = `
      <style>
        #cg-install-app{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;background:#0f172a;color:#fff;border:1px solid rgba(148,163,184,.3);border-radius:20px;padding:14px;box-shadow:0 22px 55px rgba(2,6,23,.42);font-family:Inter,system-ui,sans-serif}
        #cg-install-app .cg-pwa-row{display:flex;gap:12px;align-items:center}.cg-pwa-icon{width:48px;height:48px;border-radius:13px;object-fit:cover;background:#fff}.cg-pwa-copy{min-width:0;flex:1}.cg-pwa-title{font-size:15px;font-weight:900;margin:0 0 4px}.cg-pwa-text{font-size:12px;line-height:1.4;color:#cbd5e1;margin:0}.cg-pwa-actions{display:flex;gap:8px;margin-top:12px}.cg-pwa-btn{flex:1;border:0;border-radius:12px;padding:11px 12px;font-weight:900;font-size:13px}.cg-pwa-primary{background:#2563eb;color:#fff}.cg-pwa-secondary{background:#1e293b;color:#e2e8f0;border:1px solid #334155}
      </style>
      <div class="cg-pwa-row"><img class="cg-pwa-icon" src="/assets/img/logo.png" alt=""><div class="cg-pwa-copy"><p class="cg-pwa-title">Instalar ContaGest</p><p class="cg-pwa-text">Úsala como una app del teléfono, en pantalla completa y con acceso desde el inicio.</p></div></div>
      <div class="cg-pwa-actions"><button type="button" class="cg-pwa-btn cg-pwa-secondary" data-cg-dismiss>Ahora no</button><button type="button" class="cg-pwa-btn cg-pwa-primary" data-cg-install>${isIos ? 'Cómo instalar' : 'Instalar'}</button></div>`;
    document.body.appendChild(host);

    host.querySelector('[data-cg-dismiss]')?.addEventListener('click', () => {
      localStorage.setItem('cg_install_dismissed_at', String(Date.now()));
      host.remove();
    });
    host.querySelector('[data-cg-install]')?.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(() => null);
        deferredPrompt = null;
        host.remove();
        return;
      }
      if (isIos) {
        const message = document.createElement('div');
        message.style.cssText = 'margin-top:10px;padding:10px;border-radius:12px;background:#172033;color:#e2e8f0;font-size:12px;line-height:1.45';
        message.textContent = 'En Safari toca Compartir y luego “Añadir a pantalla de inicio”.';
        host.appendChild(message);
      }
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    mountInstallBanner();
  });
  window.addEventListener('appinstalled', () => document.getElementById('cg-install-app')?.remove());
  window.addEventListener('load', () => setTimeout(mountInstallBanner, 900));
})();
