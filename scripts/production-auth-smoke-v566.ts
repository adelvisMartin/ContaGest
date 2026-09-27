import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../backend/src/database/prisma.js';
import { signAccessToken } from '../backend/src/shared/auth/jwt.js';

const baseUrl = String(process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
const candidateSha = String(process.env.CANDIDATE_SHA || process.env.GIT_COMMIT_SHA || '').trim();
if (!baseUrl) throw new Error('SMOKE_BASE_URL is required.');
if (!/^[a-f0-9]{40}$/i.test(candidateSha)) throw new Error('Exact CANDIDATE_SHA/GIT_COMMIT_SHA is required.');

const tenantId = randomUUID();
const userId = randomUUID();
const email = `v566-${userId}@smoke.invalid`;
let result: Record<string, unknown> = { ok: false };
try {
  await prisma.tenant.create({ data: { id: tenantId, rif: `J-V566-${Date.now()}`, name: 'Authenticated smoke v566' } });
  await prisma.userProfile.create({ data: { id: userId, tenantId, email, fullName: 'V566 Smoke', status: 'active' } });
  const token = signAccessToken({ id: userId, email }, tenantId);
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/v1/health/db`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
  });
  const body = await response.json() as any;
  result = {
    ok: response.status === 200 && body?.ok === true && body?.data?.database?.ready === true,
    status: response.status,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    route: '/api/v1/health/db',
    syntheticTenant: true,
    tokenPersisted: false,
  };
  if (!result.ok) throw new Error(`Authenticated smoke failed with status ${response.status}`);
} finally {
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  fs.mkdirSync('artifacts/release', { recursive: true });
  fs.writeFileSync('artifacts/release/authenticated-smoke-v566.json', `${JSON.stringify({ schemaVersion: 1, candidateSha, capturedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
}
