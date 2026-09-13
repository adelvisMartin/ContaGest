const PWA_AUDIENCE_KEY = 'contagest_pwa_audience';
let observer;
let captchaExpiryTimer=0;

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

function clearCaptchaExpiryTimer(){
  if(captchaExpiryTimer){window.clearTimeout(captchaExpiryTimer);captchaExpiryTimer=0;}
}

function setCaptchaReady(form,ready){
  if(!form)return;
  form.dataset.captchaReady=ready?'true':'false';
  const submit=form.querySelector('#btnLoginSubmit,[type="submit"]');
  const answer=form.querySelector('[name="captchaAnswer"]');
  if(ready){answer?.removeAttribute('disabled');submit?.removeAttribute('disabled');submit?.setAttribute('aria-disabled','false');}
  else{answer?.setAttribute('disabled','disabled');submit?.setAttribute('disabled','disabled');submit?.setAttribute('aria-disabled','true');}
}

function invalidateCaptcha(form,message='La verificación expiró. Genera un nuevo reto.'){
  if(!form)return;
  clearCaptchaExpiryTimer();
  const token=form.querySelector('[data-captcha-token]');
  const answer=form.querySelector('[name="captchaAnswer"]');
  const expiry=form.querySelector('[data-captcha-expiry]');
  const box=form.querySelector('[data-captcha-box]');
  const status=form.querySelector('[data-login-status]');
  if(token)token.value='';
  if(answer)answer.value='';
  delete form.dataset.captchaExpiresAt;
  if(expiry)expiry.textContent='Reto expirado';
  box?.classList.add('is-error');
  setCaptchaReady(form,false);
  if(status){status.textContent=message;status.dataset.tone='error';}
}

function captchaUsable(form){
  if(!form||form.dataset.captchaReady!=='true')return false;
  const token=String(form.querySelector('[data-captcha-token]')?.value||'');
  const expiresAt=Number(form.dataset.captchaExpiresAt||0);
  return Boolean(token)&&Number.isFinite(expiresAt)&&expiresAt>Date.now();
}

function applyCaptchaChallenge(event){
  const form=document.getElementById('loginForm');
  const token=String(event?.detail?.token||'');
  const expiresAt=Number(event?.detail?.expiresAt||0);
  if(!form||!token||!Number.isFinite(expiresAt)||expiresAt<=Date.now()){
    if(form)invalidateCaptcha(form);
    return;
  }
  form.dataset.captchaExpiresAt=String(expiresAt);
  clearCaptchaExpiryTimer();
  captchaExpiryTimer=window.setTimeout(()=>{
    if(!form.isConnected)return;
    if(String(form.querySelector('[data-captcha-token]')?.value||'')!==token)return;
    invalidateCaptcha(form);
  },Math.min(Math.max(expiresAt-Date.now(),0),2_147_483_647));
}

function applyPortalMode() {
  const form = document.getElementById('loginForm');
  if (!form || form.dataset.accessEnhanced === 'true') return;
  form.dataset.accessEnhanced = 'true';
  document.querySelector('.login-tech-note')?.remove();
  document.querySelectorAll('.login-access-switch,.login-access-help,.login-client-badge').forEach((node)=>node.remove());

  // Login is fail-closed before any asynchronous CAPTCHA request can complete.
  if(!captchaUsable(form))setCaptchaReady(form,false);
  form.addEventListener('submit',(event)=>{
    if(captchaUsable(form))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const expiresAt=Number(form.dataset.captchaExpiresAt||0);
    invalidateCaptcha(form,expiresAt>0&&expiresAt<=Date.now()
      ?'La verificación expiró. Genera un nuevo reto.'
      :'Completa una verificación humana válida antes de iniciar sesión.');
  },true);

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
    window.addEventListener('cg:captcha-challenge',applyCaptchaChallenge);
    if (!observer) {
      observer = new MutationObserver(applyPortalMode);
      observer.observe(document.body,{childList:true,subtree:true});
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
