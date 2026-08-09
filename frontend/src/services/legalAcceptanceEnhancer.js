import '../styles/legal-consent-v1115.css';
import { AuthSession } from './authSession.js';
import { LegalService } from './legalService.js';
import { BackendApi } from './backendApi.js';
import { AnalyticsService } from './analyticsService.js';
import { escapeHtml } from '../utils/dom.js';

let checking=false;
let mountedKey='';
let installed=false;

const paragraphHtml=(body='')=>String(body).split(/\n\s*\n/).map((paragraph)=>`<p>${escapeHtml(paragraph)}</p>`).join('');
const cacheKey=(session)=>`cg_legal_ok:${session?.tenantId||''}:${session?.user?.id||session?.user?.email||'client'}`;

function releaseModal(){
  document.getElementById('cgLegalAcceptanceLayer')?.remove();
  document.body.classList.remove('cg-legal-blocked');
  const app=document.getElementById('app');if(app)app.inert=false;
  mountedKey='';
}

function applyAnalyticsPreference(enabled){
  AnalyticsService.setBackendEnabled(Boolean(enabled));
}

async function declineAndExit(){
  try{await BackendApi.request('/auth/logout',{method:'POST',body:{},skipRefresh:true});}catch{/* best effort */}
  AuthSession.clear();releaseModal();
  location.assign('/?module=login');
}

function mount(status,session){
  const key=cacheKey(session);if(mountedKey===key&&document.getElementById('cgLegalAcceptanceLayer'))return;
  releaseModal();mountedKey=key;
  const documents=Array.isArray(status.documents)?status.documents.filter((doc)=>doc.required):[];
  if(!documents.length)return;
  const layer=document.createElement('div');layer.id='cgLegalAcceptanceLayer';layer.className='cg-legal-layer';
  layer.innerHTML=`<section class="cg-legal-dialog" role="dialog" aria-modal="true" aria-labelledby="cgLegalTitle" aria-describedby="cgLegalIntro">
    <header><div><p class="cg-legal-eyebrow">Primer acceso · consentimiento contractual</p><h1 id="cgLegalTitle">Antes de continuar en ContaGest</h1><p id="cgLegalIntro">Revisa y acepta las versiones vigentes. La aceptación queda registrada con usuario, empresa, versión, fecha y evidencia técnica.</p></div><span class="cg-legal-version">${escapeHtml(documents[0]?.version||'')}</span></header>
    ${status.productionReady===false?'<div class="cg-legal-dev-warning"><strong>Entorno de prueba:</strong> falta completar la identidad jurídica del proveedor. Esta versión no debe usarse para dar de alta clientes reales.</div>':''}
    <div class="cg-legal-docs">${documents.map((doc,index)=>`<details ${index===0?'open':''}><summary><span>${escapeHtml(doc.title)}</span><small>Vigente desde ${escapeHtml(doc.effectiveAt||'')}</small></summary><div class="cg-legal-doc-body">${paragraphHtml(doc.body)}</div><label class="cg-legal-check"><input type="checkbox" data-legal-document="${escapeHtml(doc.code)}"><span>He leído y acepto <strong>${escapeHtml(doc.title)}</strong>.</span></label></details>`).join('')}</div>
    <section class="cg-legal-cookie-box"><h2>Cookies y privacidad del dispositivo</h2><label class="cg-legal-check"><input id="cgNecessaryCookies" type="checkbox"><span>Entiendo y acepto el uso de cookies <strong>estrictamente necesarias</strong> de sesión, renovación, CSRF y credencial de dispositivo. Sin ellas el acceso seguro puede no funcionar.</span></label><label class="cg-legal-check cg-legal-optional"><input id="cgAnalyticsCookies" type="checkbox" ${status.cookiePreferences?.analyticsEnabled?'checked':''}><span><strong>Opcional:</strong> permito enviar analítica técnica de uso al backend para mejorar el producto. Puedo retirarla después. Está desactivada por defecto.</span></label><p>No se habilitan cookies de marketing en esta versión.</p></section>
    <div id="cgLegalError" class="cg-legal-error" role="alert" hidden></div>
    <footer><button id="cgLegalExit" type="button" class="btn btn-secondary">No aceptar y salir</button><button id="cgLegalAccept" type="button" class="btn btn-primary" disabled>Aceptar y continuar</button></footer>
  </section>`;
  document.body.appendChild(layer);document.body.classList.add('cg-legal-blocked');const app=document.getElementById('app');if(app)app.inert=true;
  const requiredChecks=[...layer.querySelectorAll('[data-legal-document]')];const necessary=layer.querySelector('#cgNecessaryCookies');const accept=layer.querySelector('#cgLegalAccept');
  const validate=()=>{accept.disabled=!(requiredChecks.every((node)=>node.checked)&&necessary.checked);};
  [...requiredChecks,necessary].forEach((node)=>node?.addEventListener('change',validate));
  layer.querySelector('#cgLegalExit')?.addEventListener('click',()=>declineAndExit());
  accept?.addEventListener('click',async()=>{
    validate();if(accept.disabled)return;accept.disabled=true;const error=layer.querySelector('#cgLegalError');if(error){error.hidden=true;error.textContent='';}
    try{
      const analytics=Boolean(layer.querySelector('#cgAnalyticsCookies')?.checked);
      await LegalService.accept({documents:documents.map(({code,version,hash})=>({code,version,hash})),necessaryCookiesAcknowledged:true,analyticsCookies:analytics,marketingCookies:false,locale:navigator.language||'es-VE'});
      applyAnalyticsPreference(analytics);sessionStorage.setItem(key,'1');releaseModal();
    }catch(cause){if(error){error.hidden=false;error.textContent=cause?.message||'No se pudo registrar la aceptación. Intenta nuevamente.';}accept.disabled=false;}
  });
  layer.addEventListener('keydown',(event)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();}},true);
  requiredChecks[0]?.focus();
}

async function check(){
  const session=AuthSession.get();
  if(!session||session.sessionMode==='demo'||session.audience!=='client'){releaseModal();return;}
  const key=cacheKey(session);if(sessionStorage.getItem(key)==='1')return;if(checking)return;checking=true;
  try{
    const status=await LegalService.status();
    if(!status||status.pending!==true){applyAnalyticsPreference(Boolean(status?.cookiePreferences?.analyticsEnabled));sessionStorage.setItem(key,'1');releaseModal();return;}
    mount(status,session);
  }catch(error){console.warn('[ContaGest Legal]',error?.message||error);}
  finally{checking=false;}
}

export function installLegalAcceptanceEnhancer(){
  if(installed||typeof window==='undefined')return;installed=true;
  const originalSet=AuthSession.set.bind(AuthSession);AuthSession.set=(session)=>{const result=originalSet(session);queueMicrotask(check);return result;};
  const originalClear=AuthSession.clear.bind(AuthSession);AuthSession.clear=()=>{originalClear();releaseModal();};
  window.addEventListener('focus',()=>check());
  window.addEventListener('pageshow',()=>check());
  queueMicrotask(check);
}
