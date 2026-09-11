import { createBlankWorkspace } from './seed.js';
import { flushWorkspaceWrites, loadLocalWorkspace } from './store.js';
import { normalizeWorkspaceShape } from './workspace.js';
import { activeGroupId, activeRace } from './operational-ledger.js';
import { parseWhatsAppChat } from './whatsapp.js';
import { compact } from './whatsapp/normalization.js';

const CARD_ATTR='data-race-opening-assistant';
let state={opening:null,status:'idle'};
let mountScheduled=false;

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function sameTrack(left,right){
  return Boolean(compact(left)&&compact(left)===compact(right));
}

function latestActionableOpening(analysis){
  const latest=(analysis?.raceOpenings||[]).at(-1)||null;
  return latest?.raceContext?.actionable===true?latest:null;
}

async function currentRace(){
  await flushWorkspaceWrites().catch(()=>{});
  const workspace=normalizeWorkspaceShape(await loadLocalWorkspace(createBlankWorkspace));
  const groupId=activeGroupId(workspace);
  return {workspace,groupId,race:activeRace(workspace,groupId)};
}

function openingModel(message){
  const context=message?.raceContext||{};
  const raceNumber=Number(context.raceNumber);
  if(!context.actionable||!String(context.track||'').trim()||!Number.isInteger(raceNumber)||raceNumber<=0)return null;
  return {messageId:String(message.id||''),track:String(context.track).trim(),raceNumber};
}

function cardMarkup(opening,race){
  const matches=Boolean(race&&sameTrack(opening.track,race.racetrack)&&Number(race.number)===opening.raceNumber);
  const activeLabel=race?`${race.racetrack} · ${race.number}ª`:'Sin carrera activa';
  return `<section class="card section-gap" ${CARD_ATTR} role="region" aria-labelledby="race-opening-assistant-title">
    <div class="card__head"><div><h3 id="race-opening-assistant-title">Apertura de carrera detectada</h3><small>Señal inequívoca del chat · requiere confirmación del operador</small></div><span class="badge ${matches?'badge--success':'badge--warning'}">${matches?'YA ACTIVA':'POR REVISAR'}</span></div>
    <div class="card__body">
      <div class="control-stack"><div><span>Detectada</span><strong>${escapeHtml(opening.track)} · ${opening.raceNumber}ª carrera</strong></div><div><span>Carrera actual</span><strong>${escapeHtml(activeLabel)}</strong></div></div>
      <p class="muted">El chat no cambia la carrera automáticamente ni modifica apuestas, pizarras o saldos. ${matches?'La señal coincide con la carrera activa.':'Pulsa Preparar carrera para revisar el formulario antes de crearla.'}</p>
      ${matches?'':`<div class="capture-actions"><button type="button" class="button button--primary" data-action="new-race" data-race-opening-prepare>Preparar carrera</button><button type="button" class="button" data-race-opening-dismiss>Ignorar sugerencia</button></div>`}
    </div>
  </section>`;
}

async function mount(){
  mountScheduled=false;
  const root=document.querySelector('#app');
  if(!root)return;
  root.querySelector(`[${CARD_ATTR}]`)?.remove();
  if(!state.opening)return;
  const parseForm=root.querySelector('#whatsapp-parse-form');
  if(!parseForm)return;
  let race=null;
  try{({race}=await currentRace());}catch{return;}
  if(!state.opening||!parseForm.isConnected)return;
  const host=document.createElement('div');
  host.innerHTML=cardMarkup(state.opening,race);
  const card=host.firstElementChild;
  const importCard=parseForm.closest('.chat-import-card');
  if(card&&importCard)importCard.insertAdjacentElement('afterend',card);
}

function scheduleMount(){
  if(mountScheduled)return;
  mountScheduled=true;
  queueMicrotask(()=>mount().catch(()=>{mountScheduled=false;}));
}

async function analyzeForm(form){
  const text=String(form?.elements?.namedItem('chat')?.value||'').trim();
  if(!text){state={opening:null,status:'idle'};scheduleMount();return;}
  const {workspace}=await currentRace();
  const analysis=parseWhatsAppChat(text,{racetrackCatalog:workspace?.config?.racetrackCatalog||[]});
  state={opening:openingModel(latestActionableOpening(analysis)),status:'parsed'};
  scheduleMount();
}

function prefillRaceForm(opening){
  queueMicrotask(()=>requestAnimationFrame(()=>{
    const form=document.querySelector('#race-form');
    if(!(form instanceof HTMLFormElement))return;
    const track=form.elements.namedItem('racetrack');
    const number=form.elements.namedItem('number');
    if(track instanceof HTMLSelectElement){
      const option=[...track.options].find((item)=>sameTrack(item.value,opening.track));
      if(option)track.value=option.value;
      else window.dispatchEvent(new CustomEvent('hipico:notice',{detail:{message:`El hipódromo ${opening.track} no está en el catálogo. Revísalo antes de crear la carrera.`}}));
    }
    if(number instanceof HTMLInputElement)number.value=String(opening.raceNumber);
    (track instanceof HTMLElement?track:number instanceof HTMLElement?number:form).focus({preventScroll:false});
    window.dispatchEvent(new CustomEvent('hipico:notice',{detail:{message:`Formulario preparado para ${opening.track} ${opening.raceNumber}ª. Confirma los datos antes de guardar.`}}));
  }));
}

if(typeof document!=='undefined'){
  document.addEventListener('submit',(event)=>{
    const form=event.target instanceof HTMLFormElement?event.target:null;
    if(form?.id!=='whatsapp-parse-form')return;
    queueMicrotask(()=>analyzeForm(form).catch(()=>{}));
  });

  document.addEventListener('click',(event)=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    if(target.closest('[data-race-opening-dismiss]')){
      state={opening:null,status:'dismissed'};
      target.closest(`[${CARD_ATTR}]`)?.remove();
      return;
    }
    if(target.closest('[data-race-opening-prepare]')&&state.opening)prefillRaceForm({...state.opening});
    if(target.closest('[data-action="clear-chat-analysis"]')){
      state={opening:null,status:'idle'};
      scheduleMount();
    }
  });

  const observer=new MutationObserver(()=>{
    if(state.opening&&!document.querySelector(`[${CARD_ATTR}]`))scheduleMount();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

export const __test__={sameTrack,latestActionableOpening,openingModel,cardMarkup};
