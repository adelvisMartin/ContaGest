import { BackendApi } from './backendApi.js';

const LOCAL_SUGGESTIONS = [
  'Auditar ventas vencidas',
  'Revisar stock crítico',
  'Validar asientos pendientes',
  'Examinar caja y bancos'
];

export const AiAssistantService = {
  async status() {
    return BackendApi.get('/ai/status');
  },

  async ask({ message, context = {}, history = [], conversationId = null }) {
    try {
      return await BackendApi.post('/api/v1/ai/chat', { message, context, history, conversationId });
    } catch (error) {
      if ([401, 403].includes(Number(error?.status))) throw error;
      return {
        answer: `No fue posible consultar el motor operativo en este momento. Revisa la conexión y vuelve a intentar. Ruta actual: ${context.route || 'módulo actual'}.`,
        provider: 'offline',
        model: 'sin conexión',
        providerWarning: error?.message || 'Backend no disponible',
        suggestions: LOCAL_SUGGESTIONS,
        conversationId
      };
    }
  }
};
