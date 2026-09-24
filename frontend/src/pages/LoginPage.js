import { AuthService } from '../services/authService.js';
import { BackendApi } from '../services/backendApi.js';
import { LegalService } from '../services/legalService.js';
import { Button } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const legalBody=(body)=>String(body||'').split(/\n{2,}/).filter(Boolean).map((paragraph)=>`<p>${safe(paragraph).replace(/\n/g,'<br>')}</p>`).join('');

function input({name,label,type='text',value='',autocomplete='',required=true,placeholder=''}){
  const id=`login-${name}`;
  return `<div class="cgx-field login-native-field" data-login-native-field="${safe(name)}"><label class="label cgx-label" for="${safe(id)}">${safe(label)}</label><input id="${safe(id)}" name="${safe(name)}" type="${safe(type)}" ${required?'required':''} value="${safe(value)}" ${placeholder?`placeholder="${safe(placeholder)}"`:''} ${autocomplete?`autocomplete="${safe(autocomplete)}"`:''} class="input cgx-field-normalized" /></div>`;
}

function captchaBlock(id){
  return `<section class="login-captcha" data-captcha-box="${id}" aria-labelledby="captchaTitle-${id}" aria-busy="true">
    <input type="hidden" name="captchaToken" data-captcha-token>
    <header class="login-captcha-head"><span class="login-captcha-icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span><div><strong id="captchaTitle-${id}">Verificación humana</strong><small>Reto temporal protegido</small></div><button type="button" class="login-captcha-refresh" data-captcha-refresh aria-label="Generar nuevo reto" title="Generar nuevo reto"><i class="fa-solid fa-rotate" aria-hidden="true"></i></button></header>
    <div class="login-captcha-body"><div class="login-captcha-question"><small>Resuelve</small><strong data-captcha-question aria-live="polite">cargando…</strong></div><label class="login-captcha-answer"><span>Resultado</span><input name="captchaAnswer" type="text" inputmode="numeric" autocomplete="off" pattern="-?[0-9]+" placeholder="Resultado" required disabled></label></div>
    <footer><span><i class="fa-solid fa-lock" aria-hidden="true"></i><span>Reto firmado</span></span><span data-captcha-expiry>Preparando verificación…</span></footer>
  </section>`;
}

function coordinateChallenge(challenge){
  if(!challenge?.mfaRequired)return'';
  return `<div class="coordinate-challenge-layer" role="dialog" aria-modal="true" aria-labelledby="coordinateChallengeTitle"><section class="coordinate-challenge-card"><header><span><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i></span><div><p class="cgx-eyebrow">Segundo factor</p><h2 id="coordinateChallengeTitle">Tarjeta de coordenadas</h2><p>Ingresa las tres casillas solicitadas de tu tarjeta versión ${Number(challenge.cardVersion||1)}.</p></div></header><form id="coordinateChallengeForm"><input type="hidden" name="challengeId" value="${safe(challenge.challengeId)}"><div class="coordinate-answer-grid">${(challenge.coordinates||[]).map((coordinate)=>`<label><span>${safe(coordinate)}</span><input name="coordinate_${safe(coordinate)}" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4}" maxlength="4" placeholder="0000" required></label>`).join('')}</div><p class="coordinate-expiry"><i class="fa-solid fa-clock" aria-hidden="true"></i><span>Expira a las ${new Date(challenge.expiresAt).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}. Máximo ${Number(challenge.maxAttempts||3)} intentos.</span></p><div class="coordinate-actions">${Button({id:'btnCancelCoordinates',label:'Cancelar',iconName:'fa-arrow-left',variant:'secondary',type:'button'})}${Button({label:'Verificar y entrar',iconName:'fa-shield-check',variant:'primary',type:'submit'})}</div></form></section></div>`;
}

function assurance(icon,title,copy){return `<article class="login-assurance"><span><i class="fa-solid ${safe(icon)}" aria-hidden="true"></i></span><div><strong>${safe(title)}</strong><p>${safe(copy)}</p></div></article>`;}

function publicLegalDialog(catalog){
  const documents=Array.isArray(catalog?.documents)?catalog.documents:[];
  return `<div class="coordinate-challenge-layer" role="dialog" aria-modal="true" aria-labelledby="publicLegalTitle" data-public-legal-dialog><section class="coordinate-challenge-card"><header><span><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i></span><div><p class="cgx-eyebrow">Información permanente</p><h2 id="publicLegalTitle">Legal y privacidad</h2><p>Consulta las políticas vigentes antes de iniciar sesión. Esta lectura no registra aceptación.</p></div></header><div class="cgx-module-standard">${documents.map((doc)=>`<details class="cgx-section"><summary><strong>${safe(doc.title)}</strong> · versión ${safe(doc.version)} · vigente desde ${safe(doc.effectiveAt)}</summary><div class="cgx-section-body">${legalBody(doc.body)}</div></details>`).join('')}<div class="coordinate-actions">${Button({id:'btnClosePublicLegal',label:'Cerrar',iconName:'fa-xmark',variant:'secondary',type:'button'})}</div></div></section></div>`;
}

function friendlyCaptchaError(error){
  const raw=String(error?.message||'').trim();
  if(/FUNCTION_INVOCATION_FAILED|BACKEND_NOT_STAGED|server error/i.test(raw))return'El servicio de verificación no está disponible en este despliegue. Actualiza el reto o intenta nuevamente en unos minutos.';
  return raw||'No se pudo cargar la verificación. Usa el botón de actualizar.';
}

export const LoginPage={
  standalone:true,
  render(state){
    return `<main class="login-shell login-shell-v162">
      <section class="login-card" aria-labelledby="loginTitle">
        <button type="button" class="login-brand" data-route="login" aria-label="Inicio de sesión de ContaGest"><div class="login-mark" aria-hidden="true">C</div><div><h1>ContaGest-VE</h1><p>ERP / CRM empresarial</p></div></button>
        <div class="login-copy"><span class="login-kicker"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>Acceso protegido</span></span><h2 id="loginTitle">Inicia sesión en tu empresa</h2><p>Usa el RIF y las credenciales asignadas a tu organización.</p></div>
        <form id="loginForm" class="login-form" data-no-mui="true" data-captcha-ready="false" novalidate>
          <div class="login-fields-grid">${input({name:'tenantRif',label:'RIF de la empresa',placeholder:'Ej: J-12345678-9',autocomplete:'organization'})}${input({name:'email',label:'Correo electrónico',type:'email',placeholder:'usuario@empresa.com',autocomplete:'email'})}${input({name:'password',label:'Contraseña',type:'password',placeholder:'••••••••',autocomplete:'current-password'})}</div>
          <details class="login-license-details"><summary><span><i class="fa-solid fa-key" aria-hidden="true"></i><span>Acceso con licencia comercial</span></span><small>Opcional</small></summary><div class="login-license-body">${input({name:'licenseKey',label:'Clave de licencia',type:'password',required:false,placeholder:'CGVE-…',autocomplete:'off'})}<p><i class="fa-solid fa-building-shield" aria-hidden="true"></i><span>La licencia se valida contra empresa, usuario y dispositivo.</span></p></div></details>
          ${captchaBlock('login')}
          <div class="login-form-status" aria-live="polite" data-login-status></div>
          ${Button({id:'btnLoginSubmit',label:'Entrar a ContaGest',iconName:'fa-arrow-right-to-bracket',variant:'primary',type:'submit',className:'w-full login-submit'})}
        </form>
        <div class="login-privacy"><i class="fa-solid fa-lock" aria-hidden="true"></i><span>Sesión cifrada, permisos por rol y aislamiento por empresa.</span>${Button({id:'btnOpenLegalPolicies',label:'Legal y privacidad',iconName:'fa-scale-balanced',variant:'secondary',type:'button'})}</div>
      </section>
      <section class="login-panel" aria-label="Seguridad y alcance de ContaGest"><div class="login-panel-inner"><span class="login-panel-badge"><i class="fa-solid fa-building" aria-hidden="true"></i><span>ContaGest Enterprise</span></span><h2>Un acceso claro para toda la operación.</h2><p class="login-panel-lead">Cada usuario entra únicamente a los módulos, empresas y funciones que le corresponden.</p><div class="login-assurance-grid">${assurance('fa-user-shield','Permisos por rol','La navegación refleja el alcance real del usuario.')}${assurance('fa-building-lock','Aislamiento por empresa','Cada RIF mantiene sus datos y contexto separados.')}${assurance('fa-layer-group','Verticales adaptables','Comercio, contabilidad, salud, veterinaria y más.')}${assurance('fa-display','Responsive real','La misma operación se adapta a escritorio, tablet y móvil.')}</div><div class="login-panel-foot"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Las cuentas de prueba y clientes se habilitan mediante invitación o licencia; no se publican credenciales administrativas.</span></div></div></section>
      ${coordinateChallenge(state.pendingMfa)}
    </main>`;
  },
  mount(state,{Store,Toast,navigate,SupabaseSyncService,AccessControlService}){
    const setStatus=(message='',tone='')=>{const node=document.querySelector('[data-login-status]');if(node){node.textContent=message;node.dataset.tone=tone;}};
    const setCaptchaReady=(form,ready)=>{
      if(!form)return;
      form.dataset.captchaReady=ready?'true':'false';
      const submit=form.querySelector('#btnLoginSubmit,[type="submit"]');
      const answer=form.querySelector('[name="captchaAnswer"]');
      if(ready){answer?.removeAttribute('disabled');submit?.removeAttribute('disabled');submit?.setAttribute('aria-disabled','false');}
      else{answer?.setAttribute('disabled','disabled');submit?.setAttribute('disabled','disabled');submit?.setAttribute('aria-disabled','true');}
    };
    const loadCaptcha=async(form)=>{
      if(!form)return false;
      const question=form.querySelector('[data-captcha-question]');
      const token=form.querySelector('[data-captcha-token]');
      const answer=form.querySelector('[name="captchaAnswer"]');
      const expiry=form.querySelector('[data-captcha-expiry]');
      const box=form.querySelector('[data-captcha-box]');
      const refresh=form.querySelector('[data-captcha-refresh]');
      setCaptchaReady(form,false);
      box?.classList.add('is-loading');box?.setAttribute('aria-busy','true');refresh?.setAttribute('disabled','disabled');
      if(question)question.textContent='cargando…';
      if(expiry)expiry.textContent='Preparando verificación…';
      try{
        const captcha=await AuthService.captcha();
        if(!captcha?.token||!captcha?.question||!captcha?.expiresAt)throw new Error('La verificación devolvió una respuesta incompleta.');
        if(question){question.textContent=`${captcha.question} = ?`;question.setAttribute('aria-label',captcha.prompt||captcha.question);}
        if(token)token.value=captcha.token;
        if(answer)answer.value='';
        if(expiry)expiry.textContent=`Válido hasta ${new Date(captcha.expiresAt).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}`;
        box?.classList.remove('is-error');
        setStatus('','');setCaptchaReady(form,true);return true;
      }catch(error){
        if(question)question.textContent='No se pudo cargar el reto';
        if(token)token.value='';
        if(answer)answer.value='';
        if(expiry)expiry.textContent='Servicio no disponible';
        box?.classList.add('is-error');
        setStatus(friendlyCaptchaError(error),'error');setCaptchaReady(form,false);return false;
      }finally{box?.classList.remove('is-loading');box?.setAttribute('aria-busy','false');refresh?.removeAttribute('disabled');}
    };
    const setSessionState=(session)=>{
      const experience=session.experienceProfile||null;
      const licenseMode=experience?.mode||session.license?.businessSector;
      const landing=experience?.landingRoute||'dashboard';
      Store.set({pendingMfa:null,route:landing,profile:{name:session.user?.fullName||session.user?.name||'Usuario',email:session.user?.email||'',role:session.user?.role||'client',permissions:Array.isArray(session.user?.permissions)?session.user.permissions:[],branch:session.tenant?.name||'Empresa',plan:session.license?.plan||session.tenant?.plan||'Enterprise',avatarDataUrl:Store.get().profile?.avatarDataUrl||''},activeLicense:session.license||null,experienceProfile:experience,settings:{...Store.get().settings,companyName:session.tenant?.name||Store.get().settings.companyName,companyRif:session.tenant?.rif||Store.get().settings.companyRif,...(licenseMode?{businessMode:licenseMode}:{})}});
    };
    const finish=async(session)=>{
      setSessionState(session);Toast.show(session.license?'Licencia y seguridad verificadas.':'Sesión segura iniciada.','success');
      await SupabaseSyncService?.syncCore?.({Store,Toast,force:true,silent:true});
      const requested=sessionStorage.getItem('cg_post_login_route');sessionStorage.removeItem('cg_post_login_route');
      const landing=session.experienceProfile?.landingRoute||'dashboard';
      const target=requested&&requested!=='login'&&AccessControlService.canAccessRoute(Store.get(),requested)?requested:landing;
      navigate(AccessControlService.canAccessRoute(Store.get(),target)?target:'dashboard');
    };
    const loginForm=document.getElementById('loginForm');setCaptchaReady(loginForm,false);loadCaptcha(loginForm);
    document.getElementById('btnOpenLegalPolicies')?.addEventListener('click',async()=>{const button=document.getElementById('btnOpenLegalPolicies');button?.setAttribute('disabled','disabled');try{const catalog=await LegalService.publicCatalog();document.querySelector('[data-public-legal-dialog]')?.remove();document.body.insertAdjacentHTML('beforeend',publicLegalDialog(catalog));const dialog=document.querySelector('[data-public-legal-dialog]');const close=()=>dialog?.remove();document.getElementById('btnClosePublicLegal')?.addEventListener('click',close);dialog?.addEventListener('click',(event)=>{if(event.target===dialog)close();});document.getElementById('btnClosePublicLegal')?.focus();}catch(error){Toast.show(error.message||'No se pudieron consultar las políticas vigentes.','error');}finally{button?.removeAttribute('disabled');}});
    document.querySelectorAll('[data-captcha-refresh]').forEach((button)=>button.addEventListener('click',()=>loadCaptcha(button.closest('form'))));
    loginForm?.addEventListener('submit',async(event)=>{
      event.preventDefault();const form=event.currentTarget;
      if(form.dataset.captchaReady!=='true'||!form.querySelector('[data-captcha-token]')?.value){setStatus('Completa una verificación humana válida antes de iniciar sesión.','error');setCaptchaReady(form,false);return;}
      if(!form.reportValidity())return;
      const data=Object.fromEntries(new FormData(form));const submit=form.querySelector('#btnLoginSubmit,[type="submit"]');submit?.setAttribute('disabled','disabled');setStatus('Verificando credenciales y empresa…','loading');
      try{const result=await AuthService.login({...data,mode:'api'});if(result.mfaRequired){Store.set({pendingMfa:result});Toast.show('Contraseña correcta. Completa la tarjeta de coordenadas.','info');return;}await finish(result);}catch(error){setStatus(error.message||'No se pudo iniciar sesión.','error');Toast.show(error.message||'No se pudo iniciar sesión.','error');if(Number(error?.status)!==423)await loadCaptcha(form);}finally{if(form.dataset.captchaReady==='true')submit?.removeAttribute('disabled');}
    });
    document.getElementById('coordinateChallengeForm')?.addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget;const answers=Object.fromEntries([...form.querySelectorAll('[name^="coordinate_"]')].map((input)=>[input.name.replace('coordinate_',''),input.value]));const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');try{await finish(await AuthService.completeCoordinateLogin(form.challengeId.value,answers));}catch(error){Toast.show(error.message,'error');submit?.removeAttribute('disabled');}});
    document.getElementById('btnCancelCoordinates')?.addEventListener('click',()=>Store.set({pendingMfa:null}));
    document.querySelector('[data-login-status]')?.setAttribute('data-backend',BackendApi.baseUrl);
  }
};
