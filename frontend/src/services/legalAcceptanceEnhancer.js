import '../styles/legal-consent-v1115.css';
import { AuthSession } from './authSession.js';
import { LegalService } from './legalService.js';
import { BackendApi } from './backendApi.js';
import { AnalyticsService } from './analyticsService.js';
import { escapeHtml } from '../utils/dom.js';

let checking=false;
let mountedKey='';
let installed=false;
const draftByKey=new Map();

const paragraphHtml=(body='')=>String(body).split(/\n\s*\n/).map((paragraph)=>`<p>${escapeHtml(paragraph)}</p>`).join('');
// Email is more stable than a profile id during initial /me hydration. The server remains
// authoritative: this key only avoids duplicate UI work inside the current tab.
const cacheKey=(session)=>`cg_legal_ok:${session?.tenantId||''}:${session?.user?.email||session?.user?.id||'client'}`;
const emptyDraft=()=>({documents:new Set(),necessary:false,analytics:false});

function activeLayer(){return document.getElementById('cgLegalAcceptanceLayer');}

function releaseModal({clearDraft=false}={}){
  const previousKey=mountedKey;
  activeLayer()?.remove();
  document.body.classList.remove('cg-legal-blocked');
  const app=document.getElementById('app');if(app)app.inert=false;
  mountedKey='';
  if(clearDraft&&previousKey)draftByKey.delete(previousKey);
}

function applyAnalyticsPreference(enabled){
  AnalyticsService.setBackendEnabled(Boolean(enabled));
}

async function declineAndExit(){
  const key=mountedKey;
  try{await BackendApi.request('/auth/logout',{method:'POST',body:{},skipRefresh:true});}catch{/* best effort */}
  AuthSession.clear();
  if(key)draftByKey.delete(key);
  releaseModal({clearDraft:true});
  location.assign('/?module=login');
}

function mount(status,session){
  // Never destroy a consent dialog that the user is actively reviewing merely because a
  // background session hydration produced a slightly different local session object.
  if(activeLayer())return;
  const key=cacheKey(session);
  mountedKey=key;
  const documents=Array.isArray(status.documents)?status.documents.filter((doc)=>doc.required):[];
  if(!documents.length){mountedKey='';return;}
  const draft=draftByKey.get(key)||emptyDraft();
  draft.analytics=Boolean(draft.analytics||status.cookiePreferences?.analyticsEnabled);
  draftByKey.set(key,draft);
  const layer=document.createElement('div');
  layer.id='cgLegalAcceptanceLayer';
  layer.className='cg-legal-layer';
  // The app's route guard intentionally searches the nearest [data-route]. BODY also carries
  // the active route for visual metadata. Shadow it with an empty route so checkbox/button
  // clicks inside this non-navigation dialog can never be cancelled as navigation attempts.
  layer.dataset.route='';
  layer.innerHTML=`<section class="cg-legal-dialog" role="dialog" aria-modal="true" aria-labelledby="cgLegalTitle" aria-describedby="cgLegalIntro">
    <header><div><p class="cg-legal-eyebrow">Primer acceso · consentimiento contractual</p><h1 id="cgLegalTitle">Antes de continuar en ContaGest</h1><p id="cgLegalIntro">Revisa y acepta las versiones vigentes. La aceptación queda registrada con usuario, empresa, versión, fecha y evidencia técnica.</p></div><span class="cg-legal-version">${escapeHtml(documents[0]?.version||'')}</span></header>
    ${status.productionReady===false?'<div class="cg-legal-dev-warning"><strong>Entorno de prueba:</strong> falta completar la identidad jurídica del proveedor. Esta versión no debe usarse para dar de alta clientes reales.</div>':''}
    <div class="cg-legal-docs">${documents.map((doc,index)=>`<details ${index===0?'open':''}><summary><span>${escapeHtml(doc.title)}</span><small>Vigente desde ${escapeHtml(doc.effectiveAt||'')}</small></summary><div class="cg-legal-doc-body">${paragraphHtml(doc.body)}</div><label class="cg-legal-check"><input type="checkbox" data-legal-document="${escapeHtml(doc.code)}" ${draft.documents.has(doc.code)?'checked':''}><span>He leído y acepto <strong>${escapeHtml(doc.title)}</strong>.</span></label></details>`).join('')}</div>
    <section class="cg-legal-cookie-box"><h2>Cookies y privacidad del dispositivo</h2><label class="cg-legal-check"><input id="cgNecessaryCookies" type="checkbox" ${draft.necessary?'checked':''}><span>Entiendo y acepto el uso de cookies <strong>estrictamente necesarias</strong> de sesión, renovación, CSRF y credencial de dispositivo. Sin ellas el acceso seguro puede no funcionar.</span></label><label class="cg-legal-check cg-legal-optional"><input id="cgAnalyticsCookies" type="checkbox" ${draft.analytics?'checked':''}><span><strong>Opcional:</strong> permito enviar analítica técnica de uso al backend para mejorar el producto. Puedo retirarla después. Está desactivada por defecto.</span></label><p>No se habilitan cookies de marketing en esta versión.</p></section>
    <div id="cgLegalError" class="cg-legal-error" role="alert" hidden></div>
    <footer><button id="cgLegalExit" type="button" class="btn btn-secondary">No aceptar y salir</button><button id="cgLegalAccept" type="button" class="btn btn-primary" disabled>Aceptar y continuar</button></footer>
  </section>`;
  document.body.appendChild(layer);document.body.classList.add('cg-legal-blocked');const app=document.getElementById('app');if(app)app.inert=true;
  const requiredChecks=[...layer.querySelectorAll('[data-legal-document]')];const necessary=layer.querySelector('#cgNecessaryCookies');const analytics=layer.querySelector('#cgAnalyticsCookies');const accept=layer.querySelector('#cgLegalAccept');
  const validate=()=>{accept.disabled=!(requiredChecks.every((node)=>node.checked)&&necessary.checked);};
  requiredChecks.forEach((node)=>node.addEventListener('change',()=>{if(node.checked)draft.documents.add(node.dataset.legalDocument);else draft.documents.delete(node.dataset.legalDocument);validate();}));
  necessary?.addEventListener('change',()=>{draft.necessary=Boolean(necessary.checked);validate();});
  analytics?.addEventListener('change',()=>{draft.analytics=Boolean(analytics.checked);});
  validate();
  layer.querySelector('#cgLegalExit')?.addEventListener('click',()=>declineAndExit());
  accept?.addEventListener('click',async()=>{
    validate();if(accept.disabled)return;accept.disabled=true;const error=layer.querySelector('#cgLegalError');if(error){error.hidden=true;error.textContent='';}
    try{
      const analyticsEnabled=Boolean(layer.querySelector('#cgAnalyticsCookies')?.checked);
      await LegalService.accept({documents:documents.map(({code,version,hash})=>({code,version,hash})),necessaryCookiesAcknowledged:true,analyticsCookies:analyticsEnabled,marketingCookies:false,locale:navigator.language||'es-VE'});
      applyAnalyticsPreference(analyticsEnabled);sessionStorage.setItem(key,'1');draftByKey.delete(key);releaseModal();
    }catch(cause){if(error){error.hidden=false;error.textContent=cause?.message||'No se pudo registrar la aceptación. Intenta nuevamente.';}accept.disabled=false;}
  });
  layer.addEventListener('keydown',(event)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();}},true);
  requiredChecks[0]?.focus();
}

async function check(){
  const session=AuthSession.get();
  if(!session||session.sessionMode==='demo'||session.audience!=='client'){releaseModal();return;}
  // If a client is already reading the current consent screen, no focus/pageshow/session
  // hydration event may replace it. Acceptance is still revalidated by the backend on submit.
  if(activeLayer())return;
  const key=cacheKey(session);
  if(sessionStorage.getItem(key)==='1')return;
  if(checking)return;checking=true;
  try{
    const status=await LegalService.status();
    if(!status||status.pending!==true){applyAnalyticsPreference(Boolean(status?.cookiePreferences?.analyticsEnabled));sessionStorage.setItem(key,'1');draftByKey.delete(key);releaseModal();return;}
    mount(status,session);
  }catch(error){console.warn('[ContaGest Legal]',error?.message||error);}
  finally{checking=false;}
}

export function installLegalAcceptanceEnhancer(){
  if(installed||typeof window==='undefined')return;installed=true;
  const originalSet=AuthSession.set.bind(AuthSession);AuthSession.set=(session)=>{const result=originalSet(session);queueMicrotask(check);return result;};
  const originalClear=AuthSession.clear.bind(AuthSession);AuthSession.clear=()=>{originalClear();releaseModal({clearDraft:true});};
  window.addEventListener('focus',()=>check());
  window.addEventListener('pageshow',()=>check());
  queueMicrotask(check);
}
