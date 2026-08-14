const ACCESS_MODE_KEY = 'contagest_login_access_mode';
const PWA_AUDIENCE_KEY = 'contagest_pwa_audience';
let observer;

function portalContext() {
  const path = String(window.location.pathname || '/').replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const explicitClient = path === '/cliente' || params.get('access') === 'client';
  const launchedFromPwa = params.get('source') === 'pwa';
  if (explicitClient) localStorage.setItem(PWA_AUDIENCE_KEY, 'client');
  else if (!launchedFromPwa && path === '/') localStorage.setItem(PWA_AUDIENCE_KEY, 'staff');
  const installedClient = launchedFromPwa && localStorage.getItem(PWA_AUDIENCE_KEY) === 'client';
  return { clientOnly:explicitClient || installedClient, launchedFromPwa };
}

function updateMarketingCopy(clientOnly = false) {
  const heading = document.querySelector('.login-copy h2');
  const description = document.querySelector('.login-copy p');
  const panelHeading = document.querySelector('.login-panel h2');
  const brandSub = document.querySelector('.login-brand p');
  if (heading) heading.textContent = clientOnly ? 'Acceso de cliente' : 'Iniciar sesión';
  if (description) description.textContent = clientOnly
    ? 'Ingresa con tu empresa, usuario y licencia autorizada.'
    : 'Accede con tu empresa y usuario.';
  if (brandSub) brandSub.textContent = clientOnly ? 'Portal de clientes' : 'ERP / CRM empresarial';
  if (panelHeading) panelHeading.textContent = clientOnly
    ? 'Tu operación, disponible de forma segura.'
    : 'Gestión empresarial, clara y segura.';
  const items = document.querySelectorAll('.login-panel li');
  const concise = clientOnly
    ? ['Licencia vinculada a tu empresa.','Acceso restringido por rol.','Dispositivo autorizado.','Experiencia adaptable a cada pantalla.']
    : ['Acceso por empresa y rol.','Seguridad en cada sesión.','Verticales según tu actividad.','Diseño adaptable a cada dispositivo.'];
  items.forEach((item,index)=>{if(concise[index]) item.textContent=concise[index];});
  document.body.classList.toggle('cg-client-portal', clientOnly);
}

function enhanceLogin() {
  const form = document.getElementById('loginForm');
  if (!form || form.dataset.accessEnhanced === 'true') return;
  form.dataset.accessEnhanced = 'true';
  document.querySelector('.login-tech-note')?.remove();

  const { clientOnly } = portalContext();
  updateMarketingCopy(clientOnly);

  const licenseDetails = form.querySelector('.login-license-details');
  const licenseInput = form.querySelector('[name="licenseKey"]');
  if (!licenseDetails || !licenseInput) return;

  const accessInput = document.createElement('input');
  accessInput.type = 'hidden';
  accessInput.name = 'accessMode';
  form.appendChild(accessInput);

  const help = document.createElement('p');
  help.className = 'login-access-help';

  let switcher = null;
  if (clientOnly) {
    switcher = document.createElement('div');
    switcher.className = 'login-access-switch login-access-client-only';
    switcher.setAttribute('aria-label','Portal exclusivo para clientes con licencia');
    switcher.innerHTML = '<div class="login-client-badge"><i class="fa-solid fa-key" aria-hidden="true"></i><span><strong>Cliente con licencia</strong><small>Acceso comercial protegido</small></span><i class="fa-solid fa-shield-check" aria-hidden="true"></i></div>';
  } else {
    switcher = document.createElement('div');
    switcher.className = 'login-access-switch';
    switcher.setAttribute('role','tablist');
    switcher.setAttribute('aria-label','Tipo de acceso');
    switcher.innerHTML = '<button type="button" role="tab" data-login-access="staff"><i class="fa-solid fa-user-shield" aria-hidden="true"></i><span>Equipo interno</span></button><button type="button" role="tab" data-login-access="client"><i class="fa-solid fa-key" aria-hidden="true"></i><span>Cliente con licencia</span></button>';
  }

  licenseDetails.before(switcher);
  switcher.after(help);

  const setMode = (requested) => {
    const mode = clientOnly ? 'client' : requested === 'client' ? 'client' : 'staff';
    if (!clientOnly) {
      localStorage.setItem(ACCESS_MODE_KEY,mode);
      localStorage.setItem(PWA_AUDIENCE_KEY,mode);
    }
    form.dataset.accessMode = mode;
    accessInput.value = mode;
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
      ? 'Usa la licencia entregada por el administrador. Se valida con empresa, usuario y dispositivo.'
      : 'Administradores y personal registrado acceden con los permisos asignados a su rol.';
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
  setMode(clientOnly ? 'client' : localStorage.getItem(ACCESS_MODE_KEY));
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
