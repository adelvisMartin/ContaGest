import { PageHeader, Button } from '../components/ui/index.js';
import { AiAssistantService } from '../services/aiAssistantService.js';

export const AiAssistantPage = {
  render(state) {
    const messages = state.aiAssistant?.messages || [
      { role:'assistant', content:'Hola. Soy el asistente operativo de ContaGest-VE. Puedo ayudarte con ventas, pedidos, contabilidad, inventario, nómina y soporte.' }
    ];
    return `
      <section class="cg-page-stack">
        ${PageHeader({
          eyebrowKey:'aiEyebrow',
          titleKey:'aiTitle',
          descKey:'aiDesc',
          actions: Button({ id:'btnAiSuggestion', text:'Sugerir auditoría rápida', icon:'fa-wand-magic-sparkles', variant:'secondary' })
        })}
        <div class="cg-ai-shell surface">
          <div id="aiMessages" class="cg-ai-messages">
            ${messages.map((m) => `<article class="cg-ai-msg ${m.role}"><strong>${m.role === 'assistant' ? 'IA' : 'Tú'}</strong><p>${m.content}</p></article>`).join('')}
          </div>
          <form id="aiForm" class="cg-ai-form">
            <input id="aiInput" class="input" placeholder="Pregunta algo: ¿qué pedidos están atrasados?, ¿qué módulo debo revisar?" />
            <button class="btn btn-primary"><i class="fa-solid fa-paper-plane"></i> Enviar</button>
          </form>
        </div>
      </section>`;
  },
  mount(state, { Store, Toast }) {
    const send = async (message) => {
      if (!message.trim()) return;
      Store.update((draft) => {
        draft.aiAssistant = draft.aiAssistant || { messages: [] };
        draft.aiAssistant.messages = [...(draft.aiAssistant.messages || []), { role:'user', content: message }];
      });
      window.dispatchEvent(new CustomEvent('cg:loading', { detail: { active: true, message: 'Consultando asistente IA...' } }));
      try {
        const res = await AiAssistantService.ask({ message, context: { route: Store.get().route, kpis: Store.get().calculation } });
        const answer = res?.data?.answer || 'Respuesta no disponible.';
        Store.update((draft) => {
          draft.aiAssistant = draft.aiAssistant || { messages: [] };
          draft.aiAssistant.messages = [...(draft.aiAssistant.messages || []), { role:'assistant', content: answer }];
        });
      } catch (error) {
        Toast.show(error.message, 'error');
      } finally {
        window.dispatchEvent(new CustomEvent('cg:loading', { detail: { active: false } }));
      }
    };
    document.getElementById('aiForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = document.getElementById('aiInput');
      send(input.value || '');
      input.value = '';
    });
    document.getElementById('btnAiSuggestion')?.addEventListener('click', () => send('Hazme una auditoría rápida de riesgos operativos en pedidos, inventario y caja.'));
  }
};
