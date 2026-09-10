const params = new URLSearchParams(location.search);
const presentationMode = params.get('demo') === '1';

if (presentationMode) {
  const installButton = () => {
    const form = document.querySelector('#auth-form');
    if (!form || form.querySelector('[data-presentation-access]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--xl';
    button.dataset.presentationAccess = 'true';
    button.textContent = 'Entrar en modo presentación';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Abriendo presentación…';
      try {
        const [{ initializeStorage, setAppMode }, { createBlankWorkspace }] = await Promise.all([
          import('./store.js'),
          import('./seed.js')
        ]);
        await initializeStorage(createBlankWorkspace);
        await setAppMode('local');
        const next = new URL('./', location.href);
        next.searchParams.set('view', 'dashboard');
        next.searchParams.set('presentation', '1');
        location.replace(next.toString());
      } catch (error) {
        console.error('No se pudo abrir el modo presentación:', error);
        button.disabled = false;
        button.textContent = 'Entrar en modo presentación';
      }
    });

    const note = document.createElement('div');
    note.className = 'auth-offline-note';
    note.dataset.presentationAccess = 'true';
    note.innerHTML = '<strong>Presentación local aislada</strong><span>Abre la interfaz completa sin modificar la cuenta, Supabase ni los datos de producción.</span>';

    form.append(button, note);
  };

  const root = document.querySelector('#app');
  if (root) new MutationObserver(installButton).observe(root, { childList: true, subtree: true });
  installButton();
}
