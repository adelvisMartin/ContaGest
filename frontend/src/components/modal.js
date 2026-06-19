export const Modal = {
  open({ title = '', body = '', actions = '' }) {
    const root = document.getElementById('modal-root');
    document.body.classList.add('modal-open');
    root.innerHTML = `
      <div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" data-modal-backdrop>
        <section class="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[1.5rem] bg-white p-5 shadow-2xl dark:bg-slate-900 sm:p-7">
          <div class="mb-4 flex items-start justify-between gap-3">
            <h3 class="text-2xl font-black text-[#1e3a8a] dark:text-white">${title}</h3>
            <button data-modal-close class="rounded-xl bg-slate-100 px-3 py-2 font-black text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-white">×</button>
          </div>
          <div>${body}</div>
          ${actions ? `<div class="mt-6 flex flex-wrap justify-end gap-2">${actions}</div>` : ''}
        </section>
      </div>`;
    root.querySelectorAll('[data-modal-close], [data-modal-backdrop]').forEach((element) => {
      element.addEventListener('click', (event) => { if (event.target === element) this.close(); });
    });
  },
  close() {
    document.getElementById('modal-root').innerHTML = '';
    document.body.classList.remove('modal-open');
  },
  confirm({ title, body, confirmText = 'Eliminar', cancelText = 'Cancelar', onConfirm }) {
    this.open({
      title,
      body: `<p class="text-base font-bold text-slate-700 dark:text-slate-200">${body}</p>`,
      actions: `<button data-modal-close class="btn btn-secondary">${cancelText}</button><button id="modalConfirmBtn" class="btn btn-danger">${confirmText}</button>`
    });
    document.getElementById('modalConfirmBtn').addEventListener('click', () => { onConfirm?.(); this.close(); });
  }
};
