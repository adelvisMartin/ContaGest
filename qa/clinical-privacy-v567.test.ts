import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '../backend/src/database/prisma.js';
import { buildClinicalExport, assertClinicalStorageAccess } from '../backend/src/modules/clinical-privacy/clinical-privacy.service.js';
import { registerStorageObject } from '../backend/src/modules/data-lifecycle/data-lifecycle.service.js';

const tenantA = randomUUID();
const tenantB = randomUUID();
const patientA = randomUUID();
const patientB = randomUUID();
const bucket = 'contagest-clinical-media';
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'contagest-v567-'));

async function insertPatient(tenantId: string, patientId: string, name: string) {
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."CarePatient" ("id","tenantId","kind","displayName","idNumber","active") VALUES ($1,$2,\'human\',$3,$4,true)',
    patientId, tenantId, name, `SYN-${patientId.slice(0, 8)}`,
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."CareEncounter" ("id","tenantId","patientId","specialty","type","assessment","clinicalData","status") VALUES ($1,$2,$3,\'general\',\'consultation\',\'SYNTHETIC ASSESSMENT\',$4::jsonb,\'signed\')',
    randomUUID(), tenantId, patientId, JSON.stringify({ fixture: 'synthetic-only' }),
  );
}

test.before(async () => {
  await prisma.tenant.createMany({ data: [
    { id: tenantA, rif: `J-V567-A-${Date.now()}`, name: 'Synthetic Clinic A' },
    { id: tenantB, rif: `J-V567-B-${Date.now()}`, name: 'Synthetic Clinic B' },
  ] });
  await insertPatient(tenantA, patientA, 'SYNTHETIC PATIENT A');
  await insertPatient(tenantB, patientB, 'SYNTHETIC PATIENT B');
  for (const [tenantId, patientId] of [[tenantA, patientA], [tenantB, patientB]]) {
    const objectKey = `${tenantId}/dental-attachments/${patientId}/fixture.pdf`;
    await registerStorageObject({ tenantId, bucket, objectKey, lifecycleEntityType: 'ClinicalMediaObject', subjectType: 'care-patient', subjectId: patientId, checksum: '0'.repeat(64) });
    const local = path.join(sandbox, objectKey);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, 'SYNTHETIC STORAGE FIXTURE');
  }
});

test.after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }).catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  fs.rmSync(sandbox, { recursive: true, force: true });
});

test('clinical export cannot cross tenant boundary', async () => {
  const own = await buildClinicalExport(tenantA, patientA);
  assert.equal(own.patient.id, patientA);
  assert.equal(own.encounters.length, 1);
  await assert.rejects(() => buildClinicalExport(tenantA, patientB), /no encontrado/i);
  await assert.rejects(() => buildClinicalExport(tenantB, patientA), /no encontrado/i);
});

test('clinical storage authority blocks A→B and B→A before sandbox access', async () => {
  const ownA = `${tenantA}/dental-attachments/${patientA}/fixture.pdf`;
  const ownB = `${tenantB}/dental-attachments/${patientB}/fixture.pdf`;
  await assertClinicalStorageAccess({ tenantId: tenantA, bucket, objectKey: ownA, patientId: patientA });
  assert.equal(fs.readFileSync(path.join(sandbox, ownA), 'utf8'), 'SYNTHETIC STORAGE FIXTURE');
  await assert.rejects(() => assertClinicalStorageAccess({ tenantId: tenantA, bucket, objectKey: ownB, patientId: patientB }), /no pertenece|no disponible/i);
  await assert.rejects(() => assertClinicalStorageAccess({ tenantId: tenantB, bucket, objectKey: ownA, patientId: patientA }), /no pertenece|no disponible/i);
});
