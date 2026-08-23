import { PageHeader, Button, Badge, EmptyState } from '../components/ui/index.js';
import { AiAssistantService } from '../services/aiAssistantService.js';
import { AnalyticsService } from '../services/analyticsService.js';
import { escapeHtml } from '../utils/dom.js';

const DEFAULT_MESSAGE = {
  role:'assistant',
  content:'Hola. Puedo analizar indicadores de tu empresa y sugerir próximos pasos. Ninguna acción se ejecutará sin tu aprobación.'
};

const DEFAULT_SUGGESTIONS = [
  'Haz una auditoría rápida',
  '¿Qué productos tienen stock crítico?',
  '¿Cuántas ventas están pendientes?',
  '¿Qué debo revisar antes del cierre contable?'
];

function messageHtml(message) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const content = escapeHtml(String(message.content || '')).replace(/\n/g,'<br>');
  const sources = (message.sources || []).map((source)=>`<button type="button" class="cg-ai-source" ${source.route?`data-ai-source-route="${escapeHtml(source.route)}"`:''} title="${escapeHtml(source.detail||source.label)}"><i class="fa-solid fa-database"></i>${escapeHtml(source.label)}</button>`).join('');
  return `<article class="cg-ai-msg ${role}"><span class="cg-ai-avatar"><i class="fa-solid ${role==='assistant'?'fa-sparkles':'fa-user'}"></i></span><div><strong>${role==='assistant'?'ContaGest IA':'Tú'}</strong><p>${content}</p>${sources?`<div class="cg-ai-sources"><small>Fuentes utilizadas</small>${sources}</div>`:''}</div></article>`;
}

function actionCards(actions = []) {
  if (!actions.length) return '';
  return `<section class="cgx-section cg-ai-actions"><header class="cgx-section-head"><div><h2>Acciones sugeridas</h2><p>Revisa y aprueba individualmente. Las recomendaciones no modifican datos por sí solas.</p></div>${Badge(`${actions.length} pendientes`,'warning')}</header><div class="cgx-section-body grid gap-2">${actions.map((action)=>`<article class="panel-soft p-3 rounded-xl flex items-center justify-between gap-3"><div><strong>${escapeHtml(action.label)}</strong><p>${escapeHtml(action.description||'Abrir el módulo relacionado para revisión.')}</p></div><button type="button" class="btn btn-primary" data-ai-approve="${escapeHtml(action.id)}"><i class="fa-solid fa-check"></i> Aprobar</button></article>`).join('')}</div></section>`;
}

export const AiAssistantPage = {
  render(state) {
    const aiState = state.aiAssistant || {};
    const messages = aiState.messages?.length ? aiState.messages : [DEFAULT_MESSAGE];
    const status = aiState.status || {};
    const providerLabel = status.provider === 'openai'
      ? `OpenAI · ${status.model || 'modelo configurado'}`
      : status.provider === 'offline' ? 'Sin conexión' : 'Motor operativo ContaGest';
    const suggestions = aiState.suggestions?.length ? aiState.suggestions : DEFAULT_SUGGESTIONS;
    const pendingActions = aiState.pendingActions || [];

    return `<section class="cg-page-stack cg-ai-page">
      ${PageHeader({
        eyebrow:'Automatización supervisada', title:'Asistente operativo IA',
        description:'Consulta datos del tenant, revisa las fuentes y aprueba cada acción antes de ejecutarla.',
        actions:`${Button({id:'btnAiSuggestion',text:'Auditoría rápida',icon:'fa-wand-magic-sparkles',variant:'secondary'})}${Button({id:'btnAiClear',text:'Nueva conversación',icon:'fa-rotate-left',variant:'secondary'})}`
      })}
      <div class="cg-ai-workspace">
        <aside class="cg-ai-context surface">
          <div class="cg-ai-status-row"><span class="cg-ai-status-dot ${status.provider==='offline'?'is-offline':''}"></span><div><strong>${escapeHtml(providerLabel)}</strong><small>${status.snapshotAt?`Actualizado ${new Date(status.snapshotAt).toLocaleTimeString('es-VE')}`:'Comprobando servicio…'}</small></div></div>
          <div class="cg-ai-context-grid"><article><span>Stock crítico</span><strong>${Number(status.indicators?.lowStock||0)}</strong></article><article><span>Ventas abiertas</span><strong>${Number(status.indicators?.openSales||0)}</strong></article><article><span>Ventas vencidas</span><strong>${Number(status.indicators?.overdueSales||0)}</strong></article><article><span>Asientos pendientes</span><strong>${Number(status.indicators?.unpostedLedger||0)}</strong></article></div>
          <div class="cg-ai-privacy-note"><i class="fa-solid fa-shield-halved"></i><p><strong>Aislamiento empresarial</strong><span>Solo consulta el tenant firmado en tu sesión.</span></p></div>
          <div class="cg-ai-privacy-note"><i class="fa-solid fa-hand-pointer"></i><p><strong>Control humano</strong><span>Las acciones requieren aprobación explícita.</span></p></div>
        </aside>
        <div class="grid gap-4 min-w-0">
          <div class="cg-ai-shell surface">
            <div id="aiMessages" class="cg-ai-messages" aria-live="polite">${messages.map(messageHtml).join('')}</div>
            <div class="cg-ai-suggestions" aria-label="Consultas sugeridas">${suggestions.slice(0,6).map((suggestion)=>`<button type="button" data-ai-prompt="${escapeHtml(suggestion)}"><i class="fa-solid fa-arrow-trend-up"></i>${escapeHtml(suggestion)}</button>`).join('')}</div>
            <form id="aiForm" class="cg-ai-form"><label class="sr-only" for="aiInput">Consulta para el asistente</label><textarea id="aiInput" class="input cg-ai-input" rows="2" maxlength="4000" placeholder="Ejemplo: revisa ventas vencidas, stock crítico y asientos pendientes…"></textarea><button id="btnAiSend" class="btn btn-primary cg-ai-send" type="submit"><i class="fa-solid fa-paper-plane"></i><span>Enviar</span></button></form>
            <footer class="cg-ai-footer"><span><i class="fa-solid fa-circle-info"></i> Verifica decisiones fiscales, médicas y financieras.</span><span>Enter envía · Shift+Enter crea una línea</span></footer>
          </div>
          ${actionCards(pendingActions)}
        </div>
      </div>
    </section>`;
  },
  mount(_state,{Store,Toast,navigate,UrlStateService}) {
    const current = Store.get().aiAssistant || {};
    if (!current.statusLoading && !current.status?.snapshotAt) {
      Store.update((draft)=>{draft.aiAssistant=draft.aiAssistant||{messages:[]};draft.aiAssistant.statusLoading=true;});
      AiAssistantService.status()
        .then((status)=>Store.update((draft)=>{draft.aiAssistant=draft.aiAssistant||{messages:[]};draft.aiAssistant.status=status;draft.aiAssistant.statusLoading=false;}))
        .catch((error)=>Store.update((draft)=>{draft.aiAssistant=draft.aiAssistant||{messages:[]};draft.aiAssistant.status={provider:'offline',model:'sin conexión',indicators:{},snapshotAt:new Date().toISOString(),warning:error.message};draft.aiAssistant.statusLoading=false;}));
    }

    let sending = false;
    const send = async(rawMessage) => {
      const message=String(rawMessage||'').trim();
      if(!message||sending)return;
      sending=true;
      AnalyticsService.trackAction('ai_prompt',{length:message.length,route:Store.get().route});
      const before=Store.get();
      const previous=before.aiAssistant?.messages?.length?before.aiAssistant.messages:[DEFAULT_MESSAGE];
      const history=previous.slice(-12).map(({role,content})=>({role,content}));
      Store.update((draft)=>{draft.aiAssistant=draft.aiAssistant||{messages:[]};const base=draft.aiAssistant.messages?.length?draft.aiAssistant.messages:[DEFAULT_MESSAGE];draft.aiAssistant.messages=[...base,{role:'user',content:message}];draft.aiAssistant.sending=true;draft.aiAssistant.pendingActions=[];});
      try {
        const snapshot=Store.get();
        const result=await AiAssistantService.ask({message,history,conversationId:snapshot.aiAssistant?.conversationId||null,context:{route:snapshot.route,company:snapshot.settings?.companyName,businessMode:snapshot.settings?.businessMode}});
        Store.update((draft)=>{
          draft.aiAssistant=draft.aiAssistant||{messages:[]};
          draft.aiAssistant.messages=[...(draft.aiAssistant.messages||[]),{role:'assistant',content:result.answer||'No se recibió respuesta.',sources:result.sources||[]}];
          draft.aiAssistant.conversationId=result.conversationId||draft.aiAssistant.conversationId||null;
          draft.aiAssistant.suggestions=result.suggestions||DEFAULT_SUGGESTIONS;
          draft.aiAssistant.pendingActions=result.actions||[];
          draft.aiAssistant.status={...(draft.aiAssistant.status||{}),provider:result.provider,model:result.model,snapshotAt:result.snapshotAt||new Date().toISOString()};
          draft.aiAssistant.sending=false;
        });
        AnalyticsService.trackAction('ai_response',{provider:result.provider,sources:result.sources?.length||0,actions:result.actions?.length||0});
        if(result.providerWarning)Toast.show(`Proveedor generativo: ${result.providerWarning}. Se usó el motor operativo.`,'warning');
      } catch(error) {
        AnalyticsService.trackError(error,{module:'ai'});
        Store.update((draft)=>{draft.aiAssistant=draft.aiAssistant||{messages:[]};draft.aiAssistant.messages=[...(draft.aiAssistant.messages||[]),{role:'assistant',content:`No pude completar la consulta: ${error.message}`}];draft.aiAssistant.sending=false;});
        Toast.show(error.message||'No se pudo consultar el asistente.','error');
      } finally { sending=false; }
    };

    const form=document.getElementById('aiForm');
    const input=document.getElementById('aiInput');
    form?.addEventListener('submit',(event)=>{event.preventDefault();const value=input?.value||'';if(input)input.value='';send(value);});
    input?.addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();form?.requestSubmit();}});
    document.querySelectorAll('[data-ai-prompt]').forEach((button)=>button.addEventListener('click',()=>send(button.dataset.aiPrompt)));
    document.getElementById('btnAiSuggestion')?.addEventListener('click',()=>send('Haz una auditoría rápida de ventas vencidas, stock crítico, compras pendientes, caja y asientos sin publicar.'));
    document.getElementById('btnAiClear')?.addEventListener('click',()=>Store.update((draft)=>{draft.aiAssistant={...draft.aiAssistant,messages:[DEFAULT_MESSAGE],conversationId:null,suggestions:DEFAULT_SUGGESTIONS,pendingActions:[]};}));
    document.querySelectorAll('[data-ai-source-route]').forEach((button)=>button.addEventListener('click',()=>navigate(button.dataset.aiSourceRoute)));
    document.querySelectorAll('[data-ai-approve]').forEach((button)=>button.addEventListener('click',()=>{
      const action=(Store.get().aiAssistant?.pendingActions||[]).find((item)=>item.id===button.dataset.aiApprove);
      if(!action)return;
      AnalyticsService.trackAction('ai_action_approved',{actionId:action.id,type:action.type,route:action.route});
      if(action.type==='navigate'&&action.route){UrlStateService.navigate(action.route,action.params||{});Toast.show('Acción aprobada: se abrió el módulo para revisión.','success');}
      else Toast.show('La recomendación requiere revisión manual; no se modificaron datos.','info');
      Store.update((draft)=>{draft.aiAssistant.pendingActions=(draft.aiAssistant.pendingActions||[]).filter((item)=>item.id!==action.id);});
    }));
    requestAnimationFrame(()=>{const messages=document.getElementById('aiMessages');if(messages)messages.scrollTop=messages.scrollHeight;});
  }
};
