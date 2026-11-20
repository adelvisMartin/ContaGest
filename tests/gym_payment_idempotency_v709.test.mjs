import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route=readFileSync(new URL('../backend/src/modules/verticals/gym-extended.routes.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('../frontend/src/services/verticalService.js',import.meta.url),'utf8');
const payments=route.split("router.post('/gym/payments'")[1]?.split("router.get('/gym/classes")[0]||'';

test('#709 Gym payments use tenant-scoped financial idempotency, not a second table',()=>{
 assert.match(payments,/runFinancialIdempotentMutation\(\{/);
 assert.match(payments,/scope: 'gym\.payment\.create'/);
 assert.match(payments,/key: req\.header\('Idempotency-Key'\)/);
 assert.match(payments,/request: body/);
 assert.match(payments,/resourceType: ?'GymPayment'/);
 assert.match(payments,/WHERE "tenantId"=\$1 AND "id"=\$2/);
 assert.match(payments,/Idempotency-Replayed/);
 assert.match(payments,/execution\.replayed \? 200 : execution\.responseCode/);
});

test('#709 membership debit and payment insert remain in one idempotent effect',()=>{
 const callback=payments.split('}, async tx => {')[1]||'';
 assert.match(callback,/INSERT INTO public\."GymPayment"/);
 assert.match(callback,/UPDATE public\."GymMembership"/);
 assert.match(callback,/AND "balance">=\$2/);
 assert.match(callback,/return \{data:created,resourceType:'GymPayment'/);
 assert.doesNotMatch(callback,/\$transaction\(/);
});

test('#709 client can reuse payment key on retry and generates one per fresh action',()=>{
 const create=service.split('createPayment(payload, { idempotencyKey } = {})')[1]?.split('\n  }')[0]||'';
 assert.match(create,/idempotencyKey \|\| globalThis\.crypto\?\.randomUUID\?\.\(\)/);
 assert.match(create,/headers: \{ 'Idempotency-Key': key \}/);
 assert.match(create,/body: payload/);
});

test('#709 required tenant permission and member isolation remain present',()=>{
 assert.match(payments,/requirePermission\('gym\.manage'\)/);
 assert.match(payments,/SELECT "id" FROM public\."GymMember" WHERE "tenantId"=\$1 AND "id"=\$2 FOR SHARE/);
 assert.match(payments,/WHERE "id"=\$1 AND "tenantId"=\$2 AND "memberId"=\$3 FOR UPDATE/);
});
