const BUSINESS_MODE_LABELS = {
  contador: 'Contador',
  comercio: 'Comercio',
  restaurante: 'Restaurante',
  servicios: 'Servicios',
  salud: 'Salud / consultorio',
  veterinaria: 'Clínica veterinaria',
  gimnasio: 'Gimnasio / fitness',
  demo: 'Demo comercial',
  admin: 'Administrador'
};

const THEME_LABELS = {
  light: 'Claro empresarial',
  sky: 'Sky Blue',
  'soft-blue': 'Soft Blue',
  spectrum: 'Executive Spectrum',
  dark: 'Oscuro',
  enterprise: 'Enterprise Slate',
  executive: 'Executive Azul',
  finance: 'Finanzas Verde'
};

const ROUTE_ICONS = {
  salud: 'fa-stethoscope',
  veterinaria: 'fa-paw',
  gimnasio: 'fa-dumbbell',
  rutinas: 'fa-person-running',
  nutricion: 'fa-apple-whole',
  mensajes: 'fa-message',
  licencias: 'fa-key',
  'asistente-ia': 'fa-robot',
  profile: 'fa-user-shield'
};

function ensureOptions(select, options) {
  if (!select) return;
  const current = select.value;
  Object.entries(options).forEach(([value, label]) => {
    let option = [...select.options].find((item) => item.value === value);
    if (!option) {
      option = document.createElement('option');
      option.value = value;
      select.append(option);
    }
    option.textContent = label;
  });
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function patchMuiHost(host, options) {
  if (!host) return;
  const items = Object.entries(options).map(([value, label]) => ({ value, label }));
  host.dataset.muiOptions = JSON.stringify(items);
  const select = host.querySelector('select');
  ensureOptions(select, options);
}

function patchIcons() {
  Object.entries(ROUTE_ICONS).forEach(([route, icon]) => {
    document.querySelectorAll(`[data-route="${CSS.escape(route)}"]`).forEach((node) => {
      const current = node.querySelector('i.fa-solid');
      if (!current) return;
      [...current.classList].filter((name) => name.startsWith('fa-') && name !== 'fa-solid').forEach((name) => current.classList.remove(name));
      current.classList.add(icon);
    });
  });
}

function patchShell() {
  patchMuiHost(document.querySelector('[data-mui-name="businessMode"]'), BUSINESS_MODE_LABELS);
  ensureOptions(document.getElementById('businessModeSelector'), BUSINESS_MODE_LABELS);
  ensureOptions(document.getElementById('userMenuTheme'), THEME_LABELS);
  document.querySelectorAll('.hf-app-brand,.hf-topbar-left>div,.login-brand').forEach((brand) => {
    brand.classList.add('cg-brand-action');
    if (!brand.getAttribute('aria-label')) brand.setAttribute('aria-label', 'Ir al inicio');
  });
  patchIcons();
}

let scheduled = false;
function schedulePatch() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    patchShell();
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', schedulePatch, { once: true });
  const start = () => {
    const root = document.getElementById('app') || document.body;
    new MutationObserver(schedulePatch).observe(root, { childList: true, subtree: true });
    schedulePatch();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export const UiEnhancementService = { patch: patchShell };
