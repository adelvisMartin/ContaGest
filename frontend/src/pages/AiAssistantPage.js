import { PageHeader, Button } from '../components/ui/index.js';
import { AiAssistantService } from '../services/aiAssistantService.js';
import { escapeHtml } from '../utils/dom.js';

const DEFAULT_MESSAGE = {
  role: 'assistant',
  content: 'Hola. Soy el asistente operativo de ContaGest-VE. Puedo analizar ventas, inventario, compras, contabilidad, caja y riesgos usando únicamente los datos de tu empresa.'
};

const DEFAULT_SUGGESTIONS = [
  'Haz una auditoría rápida',
  '¿Qué productos tienen stock crítico?',
  '¿Cuántas ventas están pendientes?',
  '¿Qué debo revisar antes del cierre contable?'
];

function messageHtml(message) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const content = escapeHtml(String(message.content || '')).replace(/\n/g, '<br>');
  return `<article class="cg-ai-msg ${role}">
    <span class="cg-ai-avatar"><i class="fa-solid ${role === 'assistant' ? 'fa-sparkles' : 'fa-user'}"></i></span>
    <div><strong>${role === 'assistant' ? 'ContaGest IA' : 'Tú'}</strong><p>${content}</p></div>
  </article>`;
}

export const AiAssistantPage = {
  render(state) {
    const aiState = state.aiAssistant || {};
    const messages = aiState.messages?.length ? aiState.messages : [DEFAULT_MESSAGE];
    const status = aiState.status || {};
    const providerLabel = status.provider === 'openai'
      ? `OpenAI · ${status.model || 'modelo configurado'}`
      : status.provider === 'offline'
        ? 'Sin conexión'
        : 'Motor operativo ContaGest';
    const suggestions = aiState.suggestions?.length ? aiState.suggestions : DEFAULT_SUGGESTIONS;

    return `<section class="cg-page-stack cg-ai-page">
      ${PageHeader({
        eyebrowKey:'aiEyebrow',
        titleKey:'Asistente operativo IA',
        descKey:'Consulta indicadores reales de tu empresa y recibe recomendaciones accionables sin mezclar información de otros tenants.',
        actions: `${Button({ id:'btnAiSuggestion', text:'Auditoría rápida', icon:'fa-wand-magic-sparkles', variant:'secondary' })}${Button({ id:'btnAiClear', text:'Nueva conversación', icon:'fa-rotate-left', variant:'secondary' })}`
      })}

      <div class="cg-ai-workspace">
        <aside class="cg-ai-context surface">
          <div class="cg-ai-status-row">
            <span class="cg-ai-status-dot ${status.provider === 'offline' ? 'is-offline' : ''}"></span>
            <div><strong>${escapeHtml(providerLabel)}</strong><small>${status.snapshotAt ? `Actualizado ${new Date(status.snapshotAt).toLocaleTimeString('es-VE')}` : 'Comprobando servicio…'}</small></div>
          </div>
          <div class="cg-ai-context-grid">
            <article><span>Stock crítico</span><strong>${Number(status.indicators?.lowStock || 0)}</strong></article>
            <article><span>Ventas abiertas</span><strong>${Number(status.indicators?.openSales || 0)}</strong></article>
            <article><span>Ventas vencidas</span><strong>${Number(status.indicators?.overdueSales || 0)}</strong></article>
            <article><span>Asientos pendientes</span><strong>${Number(status.indicators?.unpostedLedger || 0)}</strong></article>
          </div>
          <div class="cg-ai-privacy-note"><i class="fa-solid fa-shield-halved"></i><p><strong>Aislamiento empresarial</strong><span>El asistente consulta únicamente el tenant firmado en tu sesión.</span></p></div>
        </aside>

        <div class="cg-ai-shell surface">
          <div id="aiMessages" class="cg-ai-messages" aria-live="polite">
            ${messages.map(messageHtml).join('')}
          </div>
          <div class="cg-ai-suggestions" aria-label="Consultas sugeridas">
            ${suggestions.slice(0, 6).map((suggestion) => `<button type="button" data-ai-prompt="${escapeHtml(suggestion)}"><i class="fa-solid fa-arrow-trend-up"></i>${escapeHtml(suggestion)}</button>`).join('')}
          </div>
          <form id="aiForm" class="cg-ai-form">
            <label class="sr-only" for="aiInput">Consulta para el asistente</label>
            <textarea id="aiInput" class="input cg-ai-input" rows="2" maxlength="4000" placeholder="Ejemplo: revisa ventas vencidas, stock crítico y asientos pendientes…"></textarea>
            <button id="btnAiSend" class="btn btn-primary cg-ai-send" type="submit"><i class="fa-solid fa-paper-plane"></i><span>Enviar</span></button>
          </form>
          <footer class="cg-ai-footer"><span><i class="fa-solid fa-circle-info"></i> Verifica decisiones fiscales y contables antes de publicarlas.</span><span>Enter envía · Shift+Enter crea una línea</span></footer>
        </div>
      </div>
    </section>`;
  },

  mount(_state, { Store, Toast }) {
    const current = Store.get().aiAssistant || {};
    if (!current.statusLoading && !current.status?.snapshotAt) {
      Store.update((draft) => {
        draft.aiAssistant = draft.aiAssistant || { messages: [] };
        draft.aiAssistant.statusLoading = true;
      });
      AiAssistantService.status()
        .then((status) => Store.update((draft) => {
          draft.aiAssistant = draft.aiAssistant || { messages: [] };
          draft.aiAssistant.status = status;
          draft.aiAssistant.statusLoading = false;
        }))
        .catch((error) => Store.update((draft) => {
          draft.aiAssistant = draft.aiAssistant || { messages: [] };
          draft.aiAssistant.status = { provider:'offline', model:'sin conexión', indicators:{}, snapshotAt:new Date().toISOString(), warning:error.message };
          draft.aiAssistant.statusLoading = false;
        }));
    }

    let sending = false;
    const send = async (rawMessage) => {
      const message = String(rawMessage || '').trim();
      if (!message || sending) return;
      sending = true;
      const before = Store.get();
      const previousMessages = before.aiAssistant?.messages?.length ? before.aiAssistant.messages : [DEFAULT_MESSAGE];
      const history = previousMessages.slice(-12).map(({ role, content }) => ({ role, content }));
      Store.update((draft) => {
        draft.aiAssistant = draft.aiAssistant || { messages: [] };
        const base = draft.aiAssistant.messages?.length ? draft.aiAssistant.messages : [DEFAULT_MESSAGE];
        draft.aiAssistant.messages = [...base, { role:'user', content:message }];
        draft.aiAssistant.sending = true;
      });
      try {
        const snapshot = Store.get();
        const result = await AiAssistantService.ask({
          message,
          history,
          conversationId: snapshot.aiAssistant?.conversationId || null,
          context: {
            route: snapshot.route,
            company: snapshot.settings?.companyName,
            businessMode: snapshot.settings?.businessMode
          }
        });
        Store.update((draft) => {
          draft.aiAssistant = draft.aiAssistant || { messages: [] };
          draft.aiAssistant.messages = [...(draft.aiAssistant.messages || []), { role:'assistant', content:result.answer || 'No se recibió respuesta.' }];
          draft.aiAssistant.conversationId = result.conversationId || draft.aiAssistant.conversationId || null;
          draft.aiAssistant.suggestions = result.suggestions || DEFAULT_SUGGESTIONS;
          draft.aiAssistant.status = {
            ...(draft.aiAssistant.status || {}),
            provider:result.provider,
            model:result.model,
            snapshotAt:result.snapshotAt || new Date().toISOString()
          };
          draft.aiAssistant.sending = false;
        });
        if (result.providerWarning) Toast.show(`Proveedor generativo: ${result.providerWarning}. Se usó el motor operativo.`, 'warning');
      } catch (error) {
        Store.update((draft) => {
          draft.aiAssistant = draft.aiAssistant || { messages: [] };
          draft.aiAssistant.messages = [...(draft.aiAssistant.messages || []), { role:'assistant', content:`No pude completar la consulta: ${error.message}` }];
          draft.aiAssistant.sending = false;
        });
        Toast.show(error.message || 'No se pudo consultar el asistente.', 'error');
      } finally {
        sending = false;
      }
    };

    const form = document.getElementById('aiForm');
    const input = document.getElementById('aiInput');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input?.value || '';
      if (input) input.value = '';
      send(value);
    });
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form?.requestSubmit();
      }
    });
    document.querySelectorAll('[data-ai-prompt]').forEach((button) => button.addEventListener('click', () => send(button.dataset.aiPrompt)));
    document.getElementById('btnAiSuggestion')?.addEventListener('click', () => send('Haz una auditoría rápida de ventas vencidas, stock crítico, compras pendientes, caja y asientos sin publicar.'));
    document.getElementById('btnAiClear')?.addEventListener('click', () => Store.update((draft) => {
      draft.aiAssistant = { ...draft.aiAssistant, messages:[DEFAULT_MESSAGE], conversationId:null, suggestions:DEFAULT_SUGGESTIONS };
    }));

    requestAnimationFrame(() => {
      const messages = document.getElementById('aiMessages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    });
  }
};
