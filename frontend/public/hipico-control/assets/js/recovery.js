(function () {
  const status = document.getElementById('status');
  const reset = document.getElementById('reset');
  const openApp = () => location.replace('./index.html?recovered=' + Date.now());
  if (!status || !reset) return;
  reset.addEventListener('click', () => {
    reset.disabled = true;
    status.textContent = 'Preparando recuperación…';
    try {
      for (const key of ['hipico-control-workspace-v1', 'hipico-control-cloud-session', 'hipico-control-mode']) {
        localStorage.removeItem(key);
      }
    } catch (_) {}
    try {
      const request = indexedDB.deleteDatabase('hipico-control');
      let done = false;
      const finish = (message) => {
        if (done) return;
        done = true;
        status.textContent = message;
        setTimeout(openApp, 350);
      };
      request.onsuccess = () => finish('Almacenamiento restablecido. Abriendo…');
      request.onerror = () => finish('No se pudo restablecer por completo. Reintentando…');
      request.onblocked = () => finish('El almacenamiento está ocupado. Reintentando…');
      setTimeout(() => finish('Abriendo Control Hípico…'), 1800);
    } catch (_) { openApp(); }
  });
})();
