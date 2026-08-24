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
  return { clientOnly:explicitClient || installedClient };
}

function applyPortalMode() {
  const form = document.getElementById('loginForm');
  if (!form || form.dataset.accessEnhanced === 'true') return;
  form.dataset.accessEnhanced = 'true';
  document.querySelector('.login-tech-note')?.remove();
  document.querySelectorAll('.login-access-switch,.login-access-help,.login-client-badge').forEach((node)=>node.remove());

  const { clientOnly } = portalContext();
  const licenseDetails = form.querySelector('.login-license-details');
  const licenseInput = form.querySelector('[name="licenseKey"]');
  if (!licenseDetails || !licenseInput) return;

  let accessInput=form.querySelector('input[name="accessMode"]');
  if(!accessInput){
    accessInput=document.createElement('input');
    accessInput.type='hidden';
    accessInput.name='accessMode';
    form.appendChild(accessInput);
  }
  accessInput.value=clientOnly?'client':'staff';
  form.dataset.accessMode=accessInput.value;

  if(clientOnly){
    licenseDetails.hidden=false;
    licenseDetails.open=true;
    licenseDetails.classList.add('login-client-active');
    licenseInput.required=true;
    licenseInput.dataset.wasRequired='true';
    const heading=document.querySelector('.login-copy h2');
    const description=document.querySelector('.login-copy p');
    const brandSub=document.querySelector('.login-brand p');
    if(heading)heading.textContent='Acceso de cliente';
    if(description)description.textContent='Ingresa con el RIF, tu usuario y la licencia asignada a tu empresa.';
    if(brandSub)brandSub.textContent='Portal de clientes';
    document.body.classList.add('cg-client-portal');
  }else{
    licenseDetails.hidden=false;
    licenseDetails.open=false;
    licenseDetails.classList.remove('login-client-active');
    licenseInput.required=false;
    licenseInput.dataset.wasRequired='false';
    document.body.classList.remove('cg-client-portal');
  }

  form.addEventListener('submit',(event)=>{
    if(!clientOnly||String(licenseInput.value||'').trim())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    licenseDetails.open=true;
    licenseInput.focus();
    const status=form.querySelector('[data-login-status]');
    if(status){status.textContent='Ingresa la licencia asignada antes de continuar.';status.dataset.tone='error';}
  },true);
}

export function installLoginEnhancer() {
  if (typeof document === 'undefined') return;
  const start = () => {
    applyPortalMode();
    if (!observer) {
      observer = new MutationObserver(applyPortalMode);
      observer.observe(document.body,{childList:true,subtree:true});
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
