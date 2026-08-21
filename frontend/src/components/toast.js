function hotToast(message, type = 'info', timeout = 3600) {
  const toast = window.CG_HOT_TOAST;
  if (!toast) return false;
  const options = { duration: timeout };
  if (type === 'success') toast.success(message, options);
  else if (type === 'error') toast.error(message, options);
  else if (type === 'warning') toast(message, { ...options, icon: '⚠️' });
  else toast(message, { ...options, icon: 'ℹ️' });
  return true;
}

const iconFor = (type) => type === 'success'
  ? 'fa-circle-check'
  : type === 'error'
    ? 'fa-circle-xmark'
    : type === 'warning'
      ? 'fa-triangle-exclamation'
      : 'fa-circle-info';

export const Toast = {
  show(message, type = 'info', timeout = 3600) {
    if (hotToast(message, type, timeout)) return;
    const root = document.getElementById('toast-root');
    if (!root) return;
    const node = document.createElement('div');
    const normalized = ['success','error','warning','info'].includes(type) ? type : 'info';
    node.className = `cg-toast cg-toast-${normalized}`;
    node.setAttribute('role', normalized === 'error' ? 'alert' : 'status');
    node.innerHTML = `<i class="fa-solid ${iconFor(normalized)}" aria-hidden="true"></i><p></p><button type="button" aria-label="Cerrar notificación">×</button>`;
    node.querySelector('p').textContent = String(message ?? '');
    const remove = () => node.remove();
    node.querySelector('button')?.addEventListener('click', remove);
    root.appendChild(node);
    setTimeout(remove, timeout);
  }
};
