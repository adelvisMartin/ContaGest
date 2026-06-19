import { Router } from 'express';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const integrations = [
  { key: 'bcv', endpoint: '/api/v1/currency/bcv', status: 'ready', fallback: true },
  { key: 'whatsapp', endpoint: '/api/v1/notifications/whatsapp/order', status: process.env.WHATSAPP_CLOUD_TOKEN ? 'configured' : 'needs_env', fallback: true },
  { key: 'maps', endpoint: '/api/v1/maps/geocode', status: process.env.GOOGLE_MAPS_API_KEY || process.env.MAPBOX_TOKEN ? 'configured' : 'needs_env', fallback: true },
  { key: 'openai', endpoint: '/api/v1/ai/chat', status: process.env.OPENAI_API_KEY ? 'configured' : 'local_fallback', fallback: true },
  { key: 'supabase', endpoint: 'DATABASE_URL', status: process.env.DATABASE_URL ? 'configured' : 'needs_env', fallback: false }
];

router.get('/summary', requirePermission('admin.manage'), asyncHandler(async (_req, res) => {
  ok(res, {
    generatedAt: new Date().toISOString(),
    status: 'pretesting-ready',
    integrations,
    controls: [
      'RLS por tenant antes de producción',
      'JWT real en lugar de x-tenant-id',
      'AuditLog en mutaciones críticas',
      'Rate limit por auth/API',
      'Idempotencia en ventas, compras, pedidos y notificaciones',
      'Validación Zod antes de persistir'
    ]
  });
}));

export default router;
