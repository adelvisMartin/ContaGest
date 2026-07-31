import '../styles/login-enhancer.css';

const ACCESS_MODE_KEY = 'contagest_login_access_mode';
let observer;

function updateMarketingCopy() {
  const heading = document.querySelector('.login-copy h2');
  const description = document.querySelector('.login-copy p');
  const panelHeading = document.querySelector('.login-panel h2');
  if (heading) heading.textContent = 'Iniciar sesión';
  if (description) description.textContent = 'Accede con tu empresa y usuario.';
  if (panelHeading) panelHeading.textContent = 'Gestión empresarial, clara y segura.';
  const items = document.querySelectorAll('.login-panel li');
  const concise = ['Acceso por empresa y rol.','Seguridad en cada sesión.','Verticales según tu actividad.','Diseño adaptable a cada dispositivo.'];
  items.forEach((item,index)=>{if(concise[index]) item.textContent=concise[index];});
}

function enhanceLogin() {
  const form = document.getElementById('loginForm');
  if (!form || form.dataset.accessEnhanced === 'true') return;
  form.dataset.accessEnhanced = 'true';
  document.querySelector('.login-tech-note')?.remove();
  updateMarketingCopy();

  const licenseDetails = form.querySelector('.login-license-details');
  const licenseInput = form.querySelector('[name="licenseKey"]');
  if (!licenseDetails || !licenseInput) return;

  const switcher = document.createElement('div');
  switcher.className = 'login-access-switch';
  switcher.setAttribute('role','tablist');
  switcher.setAttribute('aria-label','Tipo de acceso');
  switcher.innerHTML = '<button type="button" role="tab" data-login-access="staff"><i class="fa-solid fa-user-shield" aria-hidden="true"></i><span>Equipo interno</span></button><button type="button" role="tab" data-login-access="client"><i class="fa-solid fa-key" aria-hidden="true"></i><span>Cliente con licencia</span></button>';
  const help = document.createElement('p');
  help.className = 'login-access-help';
  licenseDetails.before(switcher);
  switcher.after(help);

  const setMode = (requested) => {
    const mode = requested === 'client' ? 'client' : 'staff';
    localStorage.setItem(ACCESS_MODE_KEY,mode);
    form.dataset.accessMode = mode;
    switcher.querySelectorAll('[data-login-access]').forEach((button)=>{
      const active = button.dataset.loginAccess === mode;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const client = mode === 'client';
    licenseDetails.hidden = !client;
    licenseDetails.open = client;
    licenseDetails.classList.toggle('login-client-active',client);
    licenseInput.required = client;
    licenseInput.dataset.wasRequired = String(client);
    if (!client) licenseInput.value = '';
    help.classList.remove('is-error');
    help.textContent = client
      ? 'Usa la licencia entregada por el administrador de la empresa.'
      : 'Administradores y personal registrado no requieren una licencia adicional.';
  };

  switcher.querySelectorAll('[data-login-access]').forEach((button)=>button.addEventListener('click',()=>setMode(button.dataset.loginAccess)));
  form.addEventListener('submit',(event)=>{
    if (form.dataset.accessMode !== 'client') return;
    if (String(licenseInput.value || '').trim()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    help.textContent = 'Ingresa la licencia asignada antes de continuar.';
    help.classList.add('is-error');
    licenseInput.focus();
  },true);
  setMode(localStorage.getItem(ACCESS_MODE_KEY));
}

export function installLoginEnhancer() {
  if (typeof document === 'undefined') return;
  const start = () => {
    enhanceLogin();
    if (!observer) {
      observer = new MutationObserver(enhanceLogin);
      observer.observe(document.body,{childList:true,subtree:true});
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
