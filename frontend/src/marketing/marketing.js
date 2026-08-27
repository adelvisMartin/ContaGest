const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

function safeHttpUrl(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function configureCtas() {
  const demoFallback = `${window.location.origin}/?module=login`;
  const demoUrl = safeHttpUrl(import.meta.env.VITE_MARKETING_DEMO_URL, demoFallback);
  document.querySelectorAll('[data-demo-cta]').forEach((node) => {
    node.setAttribute('href', demoUrl);
  });

  const phone = digitsOnly(import.meta.env.VITE_MARKETING_WHATSAPP_NUMBER);
  const message = String(import.meta.env.VITE_MARKETING_WHATSAPP_MESSAGE || 'Hola, quiero conocer ContaGest y solicitar una demo.').trim();
  const hasValidPhone = /^\d{8,15}$/.test(phone);

  document.querySelectorAll('[data-whatsapp-cta]').forEach((node) => {
    if (!hasValidPhone) {
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
      return;
    }
    const url = new URL(`https://wa.me/${phone}`);
    if (message) url.searchParams.set('text', message);
    node.hidden = false;
    node.removeAttribute('aria-hidden');
    node.setAttribute('href', url.href);
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  });
}

function configureNavigation() {
  const toggle = document.querySelector('[data-marketing-menu-toggle]');
  const menu = document.querySelector('[data-marketing-menu]');
  if (!toggle || !menu) return;

  const close = () => {
    menu.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const open = menu.dataset.open !== 'true';
    menu.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 860px)').matches) close();
  });
}

function configurePage() {
  document.querySelectorAll('[data-current-year]').forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
  configureCtas();
  configureNavigation();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', configurePage, { once:true });
else configurePage();
