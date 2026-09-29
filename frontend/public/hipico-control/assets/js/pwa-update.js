// Coordinates service-worker handoff without touching local Hípico data.
// app.js remains the canonical registration owner; this module only promotes
// an existing waiting worker, requests a fresh update check, and reloads once
// when a new worker takes control of an already-controlled page.
if ('serviceWorker' in navigator) {
  const hadServiceWorkerController = Boolean(navigator.serviceWorker.controller);
  let reloadingForServiceWorkerUpdate = false;

  function reloadForServiceWorkerUpdate() {
    if (!hadServiceWorkerController || reloadingForServiceWorkerUpdate) return;
    reloadingForServiceWorkerUpdate = true;
    window.location.reload();
  }

  function promoteWaitingWorker(registration) {
    if (!registration?.waiting || !navigator.serviceWorker.controller) return;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  async function checkForServiceWorkerUpdate() {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;

    promoteWaitingWorker(registration);
    try {
      await registration.update();
    } catch (error) {
      if (navigator.onLine) console.warn('No se pudo comprobar la actualización de Control Hípico.', error);
    }
  }

  navigator.serviceWorker.addEventListener('controllerchange', reloadForServiceWorkerUpdate);
  window.addEventListener('load', () => { void checkForServiceWorkerUpdate(); }, { once: true });
}
