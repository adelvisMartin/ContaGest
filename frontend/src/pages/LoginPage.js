import { AuthService } from '../services/authService.js';
import { BackendApi } from '../services/backendApi.js';
import { Button } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

const safe = (value) => escapeHtml(String(value ?? ''));

function input({name,label,type='text',value='',autocomplete='',required=true,placeholder=''}) {
  const id = `login-${name}`;
  return `<div class="cgx-field login-native-field" data-login-native-field="${safe(name)}"><label class="label cgx-label" for="${safe(id)}">${safe(label)}</label><input id="${safe(id)}" name="${safe(name)}" type="${safe(type)}" ${required ? 'required' : ''} value="${safe(value)}" ${placeholder ? `placeholder="${safe(placeholder)}"` : ''} ${autocomplete ? `autocomplete="${safe(autocomplete)}"` : ''} class="input cgx-field-normalized" /></div>`;
}

function captchaBlock(id) {
  return `<section class="login-captcha" data-captcha-box="${id}" aria-labelledby="captchaTitle-${id}">
    <input type="hidden" name="captchaToken" data-captcha-token>
    <header class="login-captcha-head"><span class="login-captcha-icon"><i class="fa-solid fa-shield-halved"></i></span><div><strong id="captchaTitle-${id}">Verificación humana</strong><small>Reto temporal protegido</small></div><button type="button" class="login-captcha-refresh" data-captcha-refresh aria-label="Generar nuevo reto"><i class="fa-solid fa-rotate"></i></button></header>
    <div class="login-captcha-body"><div class="login-captcha-question"><small>Resuelve</small><strong data-captcha-question aria-live="polite">cargando…</strong></div><label class="login-captcha-answer"><span>Resultado</span><input name="captchaAnswer" type="text" inputmode="numeric" autocomplete="off" pattern="-?[0-9]+" placeholder="Resultado" required></label></div>
    <footer><span><i class="fa-solid fa-lock"></i> Reto firmado</span><span data-captcha-expiry>Válido por 5 minutos</span></footer>
  </section>`;
}

function coordinateChallenge(challenge) {
  if (!challenge?.mfaRequired) return '';
  return `<div class="coordinate-challenge-layer" role="dialog" aria-modal="true" aria-labelledby="coordinateChallengeTitle"><section class="coordinate-challenge-card"><header><span><i class="fa-solid fa-table-cells-large"></i></span><div><p class="cgx-eyebrow">Segundo factor</p><h2 id="coordinateChallengeTitle">Tarjeta de coordenadas</h2><p>Ingresa las tres casillas solicitadas de tu tarjeta versión ${Number(challenge.cardVersion||1)}.</p></div></header><form id="coordinateChallengeForm"><input type="hidden" name="challengeId" value="${challenge.challengeId}"><div class="coordinate-answer-grid">${(challenge.coordinates||[]).map((coordinate)=>`<label><span>${coordinate}</span><input name="coordinate_${coordinate}" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4}" maxlength="4" placeholder="0000" required></label>`).join('')}</div><p class="coordinate-expiry"><i class="fa-solid fa-clock"></i> Expira a las ${new Date(challenge.expiresAt).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}. Máximo ${Number(challenge.maxAttempts||3)} intentos.</p><div class="coordinate-actions">${Button({id:'btnCancelCoordinates',label:'Cancelar',iconName:'fa-arrow-left',variant:'secondary',type:'button'})}${Button({label:'Verificar y entrar',iconName:'fa-shield-check',variant:'primary',type:'submit'})}</div></form></section></div>`;
}

export const LoginPage = {
  standalone:true,
  render(state) {
    return `<main class="login-shell login-shell-v111">
      <section class="login-card">
        <button type="button" class="login-brand" data-route="login" aria-label="Inicio de sesión de ContaGest"><div class="login-mark">C</div><div><h1>ContaGest-VE</h1><p>ERP / CRM empresarial</p></div></button>
        <div class="login-copy"><h2>Iniciar sesión</h2><p>Accede con tu empresa y usuario autorizado.</p></div>
        <form id="loginForm" class="login-form" data-no-mui="true" novalidate>
          <div class="login-fields-grid">${input({name:'tenantRif',label:'RIF empresa',placeholder:'Ej: 00000000',autocomplete:'organization'})}${input({name:'email',label:'Correo electrónico',type:'email',placeholder:'usuario@empresa.com',autocomplete:'email'})}${input({name:'password',label:'Contraseña',type:'password',placeholder:'••••••••',autocomplete:'current-password'})}</div>
          <details class="login-license-details"><summary><span><i class="fa-solid fa-key"></i> Acceso de cliente con licencia</span><small>Solo para cuentas comerciales</small></summary><div class="login-license-body">${input({name:'licenseKey',label:'Clave de licencia',type:'password',required:false,placeholder:'CGVE-…',autocomplete:'off'})}<p><i class="fa-solid fa-building-shield"></i> La licencia se valida contra empresa, correo y dispositivo.</p></div></details>
          ${captchaBlock('login')}
          <div class="login-form-status" aria-live="polite" data-login-status></div>
          ${Button({label:'Entrar',iconName:'fa-arrow-right-to-bracket',variant:'primary',type:'submit',className:'w-full login-submit'})}
        </form>
        <p class="login-privacy"><i class="fa-solid fa-lock"></i> Sesión cifrada, permisos por rol y aislamiento por empresa.</p>
      </section>
      <section class="login-panel"><div><p class="pl-eyebrow">ContaGest Enterprise</p><h2>Gestión empresarial clara y segura.</h2><ul><li>Acceso por empresa y rol.</li><li>Segundo factor opcional.</li><li>Verticales por actividad.</li><li>Experiencia adaptable.</li></ul><small>El acceso de prueba se entrega mediante una licencia o invitación temporal; no se publican contraseñas administrativas.</small></div></section>
      ${coordinateChallenge(state.pendingMfa)}
    </main>`;
  },
  mount(state,{Store,Toast,navigate,SupabaseSyncService}) {
    const setStatus=(message='',tone='')=>{const node=document.querySelector('[data-login-status]');if(node){node.textContent=message;node.dataset.tone=tone;}};
    const loadCaptcha=async(form)=>{
      if(!form)return;
      const question=form.querySelector('[data-captcha-question]');
      const token=form.querySelector('[data-captcha-token]');
      const answer=form.querySelector('[name="captchaAnswer"]');
      const expiry=form.querySelector('[data-captcha-expiry]');
      const box=form.querySelector('[data-captcha-box]');
      box?.classList.add('is-loading');
      try{
        const captcha=await AuthService.captcha();
        if(question){question.textContent=`${captcha.question} = ?`;question.setAttribute('aria-label',captcha.prompt||captcha.question);}
        if(token)token.value=captcha.token;
        if(answer){answer.value='';answer.removeAttribute('disabled');}
        if(expiry)expiry.textContent=`Válido hasta ${new Date(captcha.expiresAt).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}`;
        box?.classList.remove('is-error');
        setStatus('','');
      }catch(error){
        if(question)question.textContent='No se pudo cargar el reto';
        if(token)token.value='';
        answer?.setAttribute('disabled','disabled');
        box?.classList.add('is-error');
        setStatus(`Verificación no disponible: ${error.message || 'usa el botón de actualizar'}`,'error');
      }finally{box?.classList.remove('is-loading');}
    };
    const setSessionState=(session)=>{
      const licenseMode=session.license?.businessSector;
      Store.set({pendingMfa:null,route:'dashboard',profile:{name:session.user?.fullName||session.user?.name||'Usuario',email:session.user?.email||'',role:session.user?.role||'client',permissions:Array.isArray(session.user?.permissions)?session.user.permissions:[],branch:session.tenant?.name||'Empresa',plan:session.license?.plan||session.tenant?.plan||'Enterprise',avatarDataUrl:Store.get().profile?.avatarDataUrl||''},activeLicense:session.license||null,settings:{...Store.get().settings,companyName:session.tenant?.name||Store.get().settings.companyName,companyRif:session.tenant?.rif||Store.get().settings.companyRif,...(licenseMode?{businessMode:licenseMode}:{})}});
    };
    const finish=async(session)=>{setSessionState(session);Toast.show(session.license?'Licencia y seguridad verificadas.':'Sesión segura iniciada.','success');await SupabaseSyncService?.syncCore?.({Store,Toast,force:true,silent:true});navigate('dashboard');};
    const loginForm=document.getElementById('loginForm');
    loadCaptcha(loginForm);
    document.querySelectorAll('[data-captcha-refresh]').forEach((button)=>button.addEventListener('click',()=>loadCaptcha(button.closest('form'))));
    loginForm?.addEventListener('submit',async(event)=>{
      event.preventDefault();
      if(!event.currentTarget.reportValidity())return;
      const data=Object.fromEntries(new FormData(event.currentTarget));
      const submit=event.currentTarget.querySelector('[type="submit"]');
      submit?.setAttribute('disabled','disabled');
      setStatus('Verificando credenciales…','loading');
      try{
        const result=await AuthService.login({...data,mode:'api'});
        if(result.mfaRequired){Store.set({pendingMfa:result});Toast.show('Contraseña correcta. Completa la tarjeta de coordenadas.','info');return;}
        await finish(result);
      }catch(error){
        setStatus(error.message||'No se pudo iniciar sesión.','error');
        Toast.show(error.message||'No se pudo iniciar sesión.','error');
        if(Number(error?.status)!==423)await loadCaptcha(event.currentTarget);
      }finally{submit?.removeAttribute('disabled');}
    });
    document.getElementById('coordinateChallengeForm')?.addEventListener('submit',async(event)=>{
      event.preventDefault();
      const form=event.currentTarget;
      const answers=Object.fromEntries([...form.querySelectorAll('[name^="coordinate_"]')].map((input)=>[input.name.replace('coordinate_',''),input.value]));
      const submit=form.querySelector('[type="submit"]');
      submit?.setAttribute('disabled','disabled');
      try{await finish(await AuthService.completeCoordinateLogin(form.challengeId.value,answers));}catch(error){Toast.show(error.message,'error');submit?.removeAttribute('disabled');}
    });
    document.getElementById('btnCancelCoordinates')?.addEventListener('click',()=>Store.set({pendingMfa:null}));
    document.querySelector('[data-login-status]')?.setAttribute('data-backend',BackendApi.baseUrl);
  }
};
