const colors = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  error: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
  warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  info: 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100'
};

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

export const Toast = {
  show(message, type = 'info', timeout = 3600) {
    if (hotToast(message, type, timeout)) return;
    const root = document.getElementById('toast-root');
    if (!root) return;
    const node = document.createElement('div');
    node.className = `toast rounded-2xl border px-4 py-3 shadow-2xl ${colors[type] || colors.info}`;
    node.innerHTML = `<div class="flex items-start gap-3"><i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info'} mt-0.5"></i><p class="text-sm font-black leading-snug">${message}</p><button class="ml-auto rounded-lg px-2 font-black opacity-70 hover:opacity-100" aria-label="Cerrar">×</button></div>`;
    node.querySelector('button').addEventListener('click', () => node.remove());
    root.appendChild(node);
    setTimeout(() => node.remove(), timeout);
  }
};
