const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

export const RuntimePolicy = {
  isProduction: Boolean(import.meta.env.PROD),
  isDevelopment: Boolean(import.meta.env.DEV),
  allowOfflineFallback() {
    return Boolean(import.meta.env.DEV) || truthy(import.meta.env.VITE_ALLOW_OFFLINE_FALLBACK);
  },
  allowDemoCredentials() {
    return Boolean(import.meta.env.DEV) && truthy(import.meta.env.VITE_ENABLE_DEMO_MODE);
  },
  requireBackend(operation = 'esta operación') {
    if (this.allowOfflineFallback()) return;
    throw new Error(`No se pudo completar ${operation}. El sistema no guardará una copia local en producción para evitar datos divergentes.`);
  },
  handlePersistenceFailure(error, operation = 'la operación') {
    if (this.allowOfflineFallback()) return { allowFallback: true, message: error?.message || 'Backend no disponible.' };
    return {
      allowFallback: false,
      message: `No se completó ${operation}: ${error?.message || 'backend no disponible'}. No se modificaron los datos locales.`
    };
  }
};
