const text = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
}[char]));

export const Modal = {
  open({ title = '', body = '', actions = '', ariaLabel = '' }) {
    const root = document.getElementById('modal-root');
    if (!root) return null;
    document.body.classList.add('modal-open');
    root.innerHTML = `
      <div class="cg-modal-backdrop" data-modal-backdrop>
        <section class="cg-modal" role="dialog" aria-modal="true" aria-label="${text(ariaLabel || title || 'Diálogo')}">
          <header class="cg-modal-header">
            <h2 class="cg-modal-title">${text(title)}</h2>
            <button type="button" data-modal-close class="cg-modal-close" aria-label="Cerrar diálogo"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </header>
          <div class="cg-modal-body">${body}</div>
          ${actions ? `<footer class="cg-modal-actions">${actions}</footer>` : ''}
        </section>
      </div>`;
    const dialog = root.querySelector('.cg-modal');
    const closeButton = root.querySelector('[data-modal-close]');
    const close = () => this.close();
    closeButton?.addEventListener('click', close);
    root.querySelector('[data-modal-backdrop]')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) close();
    });
    requestAnimationFrame(() => closeButton?.focus());
    return dialog;
  },

  close() {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
    document.body.classList.remove('modal-open');
  },

  confirm({ title, body, message, confirmText = 'Confirmar', cancelText = 'Cancelar', tone = 'danger', onConfirm }) {
    return new Promise((resolve) => {
      const root = document.getElementById('modal-root');
      const finish = (value) => { this.close(); resolve(value); };
      const variant = tone === 'danger' ? 'danger' : 'primary';
      this.open({
        title,
        body:`<p class="cg-modal-message">${text(body ?? message ?? '')}</p>`,
        actions:`<button type="button" id="modalCancelBtn" class="cg-ui-button cg-ui-button-secondary">${text(cancelText)}</button><button type="button" id="modalConfirmBtn" class="cg-ui-button cg-ui-button-${variant}">${text(confirmText)}</button>`
      });
      const backdrop = root?.querySelector('[data-modal-backdrop]');
      root?.querySelector('#modalCancelBtn')?.addEventListener('click', () => finish(false), { once:true });
      root?.querySelector('#modalConfirmBtn')?.addEventListener('click', async () => {
        try { await onConfirm?.(); finish(true); }
        catch (error) { finish(false); throw error; }
      }, { once:true });
      root?.querySelector('[data-modal-close]')?.addEventListener('click', () => resolve(false), { once:true });
      backdrop?.addEventListener('click', (event) => { if (event.target === backdrop) resolve(false); }, { once:true });
    });
  }
};
