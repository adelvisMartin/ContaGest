import { BackendApi } from './backendApi.js';

const LOCAL_SUGGESTIONS = ['Auditar ventas vencidas','Revisar stock crítico','Validar asientos pendientes','Examinar caja y bancos'];
const SAFE_ROUTES = new Set(['dashboard','ventas','inventario','compras','contabilidad','bancos','reportes','analytics','auditoria','tasks','veterinaria','salud','gimnasio']);

function normalizeSources(sources = []) {
  return (Array.isArray(sources) ? sources : []).slice(0,8).map((source,index)=>({
    id:String(source.id || `source-${index+1}`),
    label:String(source.label || source.title || source.module || `Fuente ${index+1}`),
    route:SAFE_ROUTES.has(source.route) ? source.route : null,
    recordId:source.recordId ? String(source.recordId) : null,
    detail:String(source.detail || source.description || '')
  }));
}

function normalizeActions(actions = []) {
  return (Array.isArray(actions) ? actions : []).slice(0,6).map((action,index)=>({
    id:String(action.id || `action-${index+1}`),
    type:action.type === 'navigate' && SAFE_ROUTES.has(action.route) ? 'navigate' : 'review',
    label:String(action.label || action.title || 'Revisar recomendación'),
    description:String(action.description || ''),
    route:SAFE_ROUTES.has(action.route) ? action.route : null,
    params:action.params && typeof action.params === 'object' ? action.params : {}
  }));
}

function normalizeResult(result = {}, conversationId = null) {
  return {
    ...result,
    answer:String(result.answer || 'No se recibió respuesta.'),
    suggestions:Array.isArray(result.suggestions) && result.suggestions.length ? result.suggestions.slice(0,6) : LOCAL_SUGGESTIONS,
    sources:normalizeSources(result.sources),
    actions:normalizeActions(result.actions),
    conversationId:result.conversationId || conversationId || null
  };
}

export const AiAssistantService = {
  async status() { return BackendApi.get('/ai/status'); },
  async ask({ message, context = {}, history = [], conversationId = null }) {
    try {
      return normalizeResult(await BackendApi.post('/api/v1/ai/chat', { message, context, history, conversationId }), conversationId);
    } catch (error) {
      if ([401,403].includes(Number(error?.status))) throw error;
      return normalizeResult({
        answer:`No fue posible consultar el motor operativo. Revisa la conexión y vuelve a intentar. Ruta actual: ${context.route || 'módulo actual'}.`,
        provider:'offline', model:'sin conexión', providerWarning:error?.message || 'Backend no disponible',
        suggestions:LOCAL_SUGGESTIONS,
        sources:[{label:'Estado local de ContaGest',route:context.route || 'dashboard',detail:'La respuesta no contiene datos del backend.'}],
        actions:[]
      }, conversationId);
    }
  }
};
