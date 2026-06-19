import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const licenseSchema = z.object({ userEmail: z.string().email(), plan: z.string().default('trial'), days: z.coerce.number().min(1).max(3650).default(15), modules: z.array(z.string()).default([]), key: z.string().optional(), fingerprint: z.string().optional(), expiresAt: z.string().optional(), status: z.string().default('active') });
function buildLicense(body: z.infer<typeof licenseSchema>) { const expiresAt = body.expiresAt || new Date(Date.now() + body.days * 86400000).toISOString(); const seed = `${body.userEmail}|${body.plan}|${body.modules.join(',')}|${expiresAt}|${crypto.randomUUID()}`; const hash = crypto.createHash('sha256').update(seed).digest('hex'); return { ...body, expiresAt, fingerprint: body.fingerprint || hash, key: body.key || `CGVE-${hash.slice(0,8).toUpperCase()}-${hash.slice(8,16).toUpperCase()}-${hash.slice(16,24).toUpperCase()}` }; }
router.get('/', requirePermission('admin.manage'), asyncHandler(async (req, res) => { const ctx = (req as any).context; const records = await prisma.moduleRecord.findMany({ where: { tenantId: ctx.tenantId, moduleSlug: 'licenses' }, orderBy: { createdAt: 'desc' }, take: 500 }); ok(res, records.map((r) => r.payload)); }));
router.post('/', requirePermission('admin.manage'), asyncHandler(async (req, res) => { const ctx = (req as any).context; const license = buildLicense(licenseSchema.parse(req.body || {})); const saved = await prisma.moduleRecord.create({ data: { tenantId: ctx.tenantId, moduleSlug: 'licenses', title: license.userEmail, status: license.status, payload: license } }); ok(res, saved.payload, 201); }));
router.post('/heartbeat', asyncHandler(async (req, res) => { const body = z.object({ licenseKey: z.string().min(8), route: z.string().optional(), at: z.string().optional() }).parse(req.body || {}); ok(res, { accepted: true, fingerprint: crypto.createHash('sha256').update(body.licenseKey).digest('hex'), route: body.route, at: body.at || new Date().toISOString() }); }));
export default router;
