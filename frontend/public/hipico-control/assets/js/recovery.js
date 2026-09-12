(function () {
  const status = document.getElementById('status');
  const reset = document.getElementById('reset');
  const openApp = () => location.replace('./index.html?recovered=' + Date.now());
  const confirmReset = () => window.confirm(
    'Esta acción eliminará los datos locales de Control Hípico en este dispositivo, incluidos workspace, respaldos internos/snapshots, outbox pendiente y acceso offline. Los datos ya sincronizados en la nube no se eliminan.\n\n¿Deseas continuar?'
  );
  const clearLocalKeys = () => {
    try {
      for (const key of ['hipico-control-workspace-v1', 'hipico-control-cloud-session', 'hipico-control-mode']) {
        localStorage.removeItem(key);
      }
      return true;
    } catch (_) {
      return false;
    }
  };

  if (!status || !reset) return;
  reset.addEventListener('click', () => {
    if (!confirmReset()) {
      status.textContent = 'Recuperación cancelada. No se eliminó ningún dato local.';
      reset.disabled = false;
      return;
    }

    reset.disabled = true;
    status.textContent = 'Preparando recuperación…';
    try {
      const request = indexedDB.deleteDatabase('hipico-control');
      let settled = false;
      const failClosed = (message) => {
        if (settled) return;
        settled = true;
        reset.disabled = false;
        status.textContent = message;
      };
      request.onsuccess = () => {
        if (settled) return;
        settled = true;
        if (!clearLocalKeys()) {
          reset.disabled = false;
          status.textContent = 'La base local se eliminó, pero no se pudo limpiar todo el acceso local. Reintenta la recuperación antes de abrir la aplicación.';
          return;
        }
        status.textContent = 'Almacenamiento restablecido. Abriendo…';
        setTimeout(openApp, 350);
      };
      request.onerror = () => failClosed('No se pudo restablecer el almacenamiento local. Reintenta la recuperación.');
      request.onblocked = () => failClosed('La eliminación está bloqueada porque otra pestaña o ventana mantiene Control Hípico abierto. Ciérrala y reintenta.');
    } catch (_) {
      reset.disabled = false;
      status.textContent = 'No se pudo iniciar el restablecimiento local. Reintenta la recuperación.';
    }
  });
})();