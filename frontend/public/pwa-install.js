(() => {
  const SW_URL = '/sw.js?v=563-1';
  const isStandalone = () => [
    '(display-mode: standalone)', '(display-mode: fullscreen)', '(display-mode: minimal-ui)'
  ].some((query) => window.matchMedia(query).matches) || window.navigator.standalone === true;
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const appIcon = '/icons/contagest-app.svg';
  let deferredPrompt = null;
  let registration = null;

  function hashScopePart(value) {
    const input = String(value || 'anonymous');
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }

  function sessionMetadata() {
    try { return JSON.parse(localStorage.getItem('contagest_auth_session') || 'null'); } catch { return null; }
  }

  function sendSessionScope(worker = navigator.serviceWorker?.controller) {
    const session = sessionMetadata();
    const tenantId = session?.tenantId || session?.tenant?.id;
    const userId = session?.user?.id || session?.userId;
    if (!worker || !tenantId) return;
    worker.postMessage({
      type: 'SET_SESSION_SCOPE',
      scopeToken: `${hashScopePart(tenantId)}-${hashScopePart(userId)}`,
      tenantIdHash: hashScopePart(tenantId),
      userIdHash: hashScopePart(userId)
    });
  }

  function connectivityHost() {
    let host = document.querySelector('[data-cg-connectivity]');
    if (host) return host;
    host = document.createElement('div');
    host.dataset.cgConnectivity = 'online';
    host.setAttribute('data-cg-connectivity', 'online');
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    Object.assign(host.style, {
      position: 'fixed', left: '50%', bottom: 'max(16px, env(safe-area-inset-bottom))', transform: 'translateX(-50%)',
      zIndex: '2147483000', padding: '9px 14px', borderRadius: '999px', font: '600 13px/1.2 system-ui,sans-serif',
      background: 'Canvas', color: 'CanvasText', border: '1px solid color-mix(in srgb, CanvasText 22%, transparent)',
      boxShadow: '0 8px 30px rgb(0 0 0 / .16)', display: 'none'
    });
    document.body.appendChild(host);
    return host;
  }

  function renderConnectivity(state) {
    const host = connectivityHost();
    host.dataset.cgConnectivity = state;
    host.setAttribute('data-cg-connectivity', state);
    if (state === 'offline') {
      host.textContent = 'Sin conexión · los datos visibles pueden estar desactualizados';
      host.style.display = 'block';
      document.documentElement.dataset.networkState = 'offline-stale';
      return;
    }
    if (state === 'reconnected') {
      host.textContent = 'Reconectado · confirmando datos con el servidor';
      host.style.display = 'block';
      document.documentElement.dataset.networkState = 'revalidating';
      setTimeout(() => renderConnectivity('online'), 1800);
      return;
    }
    host.textContent = '';
    host.style.display = 'none';
    document.documentElement.dataset.networkState = 'online';
  }

  async function recoverWorkerCache() {
    const worker = registration?.active || navigator.serviceWorker?.controller;
    if (!worker) return;
    const channel = new MessageChannel();
    const completion = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      channel.port1.onmessage = () => { clearTimeout(timer); resolve(true); };
    });
    worker.postMessage({ type: 'RECOVER_CACHE' }, [channel.port2]);
    await completion;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      registration = await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' });
      sendSessionScope(registration.active || navigator.serviceWorker.controller);
      if (registration.waiting) registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) installing.postMessage({ type: 'ACTIVATE_UPDATE' });
        });
      });
      registration.update().catch(() => undefined);
    } catch {
      await recoverWorkerCache().catch(() => undefined);
    }
  }

  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem('cg_sw_controller_reloaded') === '1') return;
    sessionStorage.setItem('cg_sw_controller_reloaded', '1');
    location.reload();
  });
  window.addEventListener('pageshow', () => sessionStorage.removeItem('cg_sw_controller_reloaded'));
  window.addEventListener('offline', () => renderConnectivity('offline'));
  window.addEventListener('online', () => renderConnectivity('reconnected'));
  window.addEventListener('cg:pwa-session-changed', () => sendSessionScope());
  window.addEventListener('cg:pwa-recover', () => recoverWorkerCache().catch(() => undefined));

  function hasAuthenticatedSession() {
    const session = sessionMetadata();
    return Boolean(session?.tenantId) && (!session?.expiresAt || Number(session.expiresAt) > Date.now());
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
    Object.entries(attrs).forEach(([name, value]) => { if (value !== undefined && value !== null) node.setAttribute(name, String(value)); });
    return node;
  }
  function showManualHelp(host) {
    host.dataset.installState = 'manual-help';
    let message = host.querySelector('[data-cg-install-help]');
    if (!message) {
      message = el('div', { className: 'cg-pwa-help', attrs: { 'data-cg-install-help': 'true', role: 'status', 'aria-live': 'polite' } });
      host.appendChild(message);
    }
    message.textContent = helpText();
  }
  function buildInstallBanner() {
    const host = el('aside', { className: 'cg-pwa-install', attrs: { id: 'cg-install-app', role: 'dialog', 'aria-label': 'Instalar ContaGest', 'aria-modal': 'false' } });
    host.dataset.installState = deferredPrompt ? 'native-ready' : 'manual-ready';
    const row = el('div', { className: 'cg-pwa-row' });
    const icon = el('img', { className: 'cg-pwa-icon', attrs: { src: appIcon, alt: '', width: '50', height: '50', decoding: 'async' } });
    const copy = el('div', { className: 'cg-pwa-copy' });
    copy.append(el('p', { className: 'cg-pwa-title', text: 'Instalar ContaGest' }), el('p', { className: 'cg-pwa-text', text: 'Añádela al inicio del teléfono y úsala en modo aplicación.' }));
    row.append(icon, copy);
    const actions = el('div', { className: 'cg-pwa-actions' });
    const dismiss = el('button', { className: 'cg-pwa-btn cg-pwa-secondary', text: 'Ahora no', attrs: { type: 'button', 'data-cg-dismiss': 'true' } });
    const install = el('button', { className: 'cg-pwa-btn cg-pwa-primary', text: deferredPrompt ? 'Instalar' : 'Añadir al inicio', attrs: { type: 'button', 'data-cg-install': 'true' } });
    actions.append(dismiss, install); host.append(row, actions); return host;
  }
  function mountInstallBanner() {
    if (!isMobile() || isStandalone() || hasAuthenticatedSession() || document.getElementById('cg-install-app')) return;
    const dismissedAt = Number(localStorage.getItem('cg_install_dismissed_at') || 0);
    if (dismissedAt && Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) return;
    const host = buildInstallBanner(); document.body.appendChild(host);
    host.querySelector('[data-cg-dismiss]')?.addEventListener('click', () => { localStorage.setItem('cg_install_dismissed_at', String(Date.now())); host.remove(); });
    host.querySelector('[data-cg-install]')?.addEventListener('click', async () => {
      const button = host.querySelector('[data-cg-install]');
      if (deferredPrompt) {
        host.dataset.installState = 'prompting'; button?.setAttribute('disabled', 'disabled');
        try { deferredPrompt.prompt(); const choice = await deferredPrompt.userChoice; host.dataset.installState = choice?.outcome || 'dismissed'; if (choice?.outcome === 'accepted') host.remove(); else showManualHelp(host); }
        catch { showManualHelp(host); }
        finally { deferredPrompt = null; button?.removeAttribute('disabled'); if (button) button.textContent = 'Añadir al inicio'; }
        return;
      }
      host.dataset.installState = 'manual-requested'; showManualHelp(host);
      try { await navigator.serviceWorker?.ready; } catch { /* help remains visible */ }
    });
  }
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredPrompt = event; const host = document.getElementById('cg-install-app'); if (host) host.dataset.installState = 'native-ready'; const button = document.querySelector('#cg-install-app [data-cg-install]'); if (button) button.textContent = 'Instalar'; mountInstallBanner(); });
  window.addEventListener('appinstalled', () => { localStorage.removeItem('cg_install_dismissed_at'); document.getElementById('cg-install-app')?.remove(); });
  window.addEventListener('load', () => { registerServiceWorker(); renderConnectivity(navigator.onLine ? 'online' : 'offline'); setTimeout(mountInstallBanner, 700); });
  window.addEventListener('pageshow', () => setTimeout(mountInstallBanner, 250));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { mountInstallBanner(); registration?.update().catch(() => undefined); } });
})();
