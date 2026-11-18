import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const core=readFileSync('backend/src/modules/verticals/gym-core.routes.ts','utf8');
const extended=readFileSync('backend/src/modules/verticals/gym-extended.routes.ts','utf8');

test('Gym nested membership + plan joins must be tenant-compound (#746/#651)',()=>{
  const block=core.slice(core.indexOf("router.get('/gym/members'"),core.indexOf("router.post('/gym/members'"));
  assert.match(block,/x\."tenantId"=m\."tenantId" AND x\."memberId"=m\."id"/);
  assert.match(block,/p\."tenantId"=ms\."tenantId" AND p\."id"=ms\."planId"/);
  assert.match(block,/WHERE m\."tenantId"=\$1/);
});

test('Gym payment + booking projected member names require tenant match (#787/#651)',()=>{
  const payments=extended.slice(extended.indexOf("router.get('/gym/payments'"),extended.indexOf("router.post('/gym/payments'"));
  const bookings=extended.slice(extended.indexOf("router.get('/gym/classes/:classId/bookings'"),extended.indexOf("router.post('/gym/classes/bookings'"));
  assert.match(payments,/m\."tenantId" = p\."tenantId" AND m\."id" = p\."memberId"/);
  assert.match(bookings,/m\."tenantId" = b\."tenantId" AND m\."id" = b\."memberId"/);
});
