import { Router } from 'express';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
const router = Router(); router.use(requireTenant);
const sources = [
  { key: 'ifrs-taxonomy-2025', name: 'IFRS Accounting Taxonomy 2025', kind: 'NIIF/XBRL', status: 'reference', url: 'https://www.ifrs.org/issued-standards/ifrs-taxonomy/ifrs-accounting-taxonomy-2025/' },
  { key: 'ifrs-digital-reporting', name: 'IFRS Digital Financial Reporting', kind: 'NIIF digital', status: 'reference', url: 'https://www.ifrs.org/digital-financial-reporting/' },
  { key: 'fccpv-biblioteca', name: 'Biblioteca FCCPV', kind: 'Venezuela', status: 'watch', url: 'https://biblioteca.fccpv.org/' },
  { key: 'fccpvirtual', name: 'Federación Virtual FCCPV', kind: 'Validaciones', status: 'watch', url: 'https://fccpvirtual.org/' }
];
router.get('/feeds', requirePermission('reports.view'), asyncHandler(async (_req, res) => ok(res, sources.map((s) => ({ ...s, checkedAt: new Date().toISOString() })))));
router.post('/ifrs-taxonomy/import', requirePermission('admin.manage'), asyncHandler(async (_req, res) => ok(res, { queued: true, message: 'Importación NIIF/XBRL preparada. Requiere parser XBRL en worker backend para producción.' })));
export default router;
