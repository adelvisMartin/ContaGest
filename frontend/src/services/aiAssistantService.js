import { BackendApi } from './backendApi.js';

export const AiAssistantService = {
  async ask({ message, context = {}, history = [] }) {
    try {
      return await BackendApi.post('/api/v1/ai/chat', { message, context, history });
    } catch (error) {
      return {
        ok: true,
        offline: true,
        data: {
          answer: `Modo local: no pude conectar con el backend IA. Recomendación rápida: revisa el módulo "${context.route || 'actual'}", valida datos obligatorios y confirma conexión en Backend & Supabase.`,
          suggestions: ['Validar backend', 'Revisar permisos', 'Consultar documentación']
        }
      };
    }
  }
};
