import { BackendApi } from './backendApi.js';

export const DemoAccessService = {
  modules: [
    'dashboard','ventas','pedidos','pos-sede','tracking-pedidos','delivery-mapa','cotizacion','clientes','inventario','inventario-scan','contabilidad','plan-cuentas','rrhh','analytics','qr','asistente-ia','soporte','vistas'
  ],
  defaultDemo() {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10);
    return {
      id: `demo_${Date.now().toString(36)}`,
      prospect: 'Cliente potencial',
      email: 'demo@empresa.com',
      phone: '+584120000000',
      enabledModules: ['dashboard','ventas','pedidos','pos-sede','tracking-pedidos','analytics'],
      expiresAt,
      maxUsers: 3,
      status: 'active',
      notes: 'Demo comercial controlado'
    };
  },
  async list() {
    return BackendApi.get('/demos/access');
  },
  async saveDemo(demo) {
    // BackendApi already owns /api/v1, cookies, CSRF and tenant identity.
    // Never prepend /api/v1 again and never convert a persistence failure into
    // a fake local success.
    return BackendApi.post('/demos/access', demo);
  }
};
