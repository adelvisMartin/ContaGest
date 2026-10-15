import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  createReportToken, createShareSchema, dateWindowCaracas, expiryDate,
  hashReportToken, reportDate, shareAllowed, validateReportToken
} from './report-share-policy.js';
import { createHipicoReportShareRouter, readableMinor } from './report-share.routes.js';

const owner = 'bcd37f4a-4a85-4014-b6f3-0d390471eae1';
const token = createReportToken();
const groupToken = createReportToken();
const now = new Date('2026-10-15T02:00:00.000Z');
const state = { revoked: false };
const sample = {
  scope: 'participant', groupKey: 'triple-c', participantCode: 'PERSONA-1',
  date: '2026-10-14', source: 'canonical-postgresql-ledger',
  expiresAt: '2026-10-17T00:00:00.000Z', balancesTruncated: false, entriesTruncated: false, racesAvailable: false,
  balances: [{ participantCode: '<img src=x onerror=alert(1)>', currency: 'USD', amountMinor: '1750000' }],
  entries: [{ participantCode: 'PERSONA-1',currency: 'USD',entryType: 'settlement',
    amountMinor: '-10000',raceKey: null,createdAt: new Date('2026-10-14T23:00:00.000Z') }]
};
const fakeStore = {
  issue: async (v: any) => ({ id: owner, token, expiresAt: expiryDate(v.hours, now) }),
  read: async (_owner: string, candidate: string, date: string) =>
    candidate === token && !state.revoked ? { ...sample, date } : null,
  revoke: async (_owner: string, id: string) => id === owner ? (state.revoked = true) : false,
  list: async (_owner: string, group: string) => [{ id:owner, groupKey:group,
    audience:'participant',participantCode:'PERSONA-1',expiresAt:expiryDate(24,now),revokedAt:state.revoked ? now : null }],
  consolidated: async (_owner: string, candidate: string, date: string, page: number, search: string) =>
    candidate === groupToken && !state.revoked
      ? {
          scope:'group',source:'canonical-postgresql-ledger',groupKey:'triple-c',date,
          timezone:'America/Caracas',page,pageSize:21,totalParticipants:42,
          matchedParticipants:search?1:42,pages:search?1:2,search,
          expiresAt:'2026-10-17T00:00:00.000Z',amountUnit:'minor',balancesAsOf:'2026-10-15T04:00:00.000Z',
          rows:[{participantCode:'<script>alert(1)</script>',currency:'USD',
            balanceMinor:'100500',daySettlementMinor:'2500',weekSettlementMinor:'2600'}],
          groupTotals:[{currency:'USD',balanceMinor:'995000'}],
          filteredTotals:[{currency:'USD',balanceMinor:search?'100500':'995000'}],
          unavailableColumns:['available','refund','deposit','withdrawal','transfer','aval']
        } : null
};
async function api(t: any) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/hipico/report-shares', createHipicoReportShareRouter({
    ownerId: () => owner, validateOperator: (v) => v === 'approved-operator', store: fakeStore as any, now: () => now
  }));
  const server = app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return 'http://127.0.0.1:'+ (server.address() as AddressInfo).port +'/api/v1/hipico/report-shares';
}

test('report capabilities are random, exactly 256-bit and hashed with domain separation',()=>{
  const a=createReportToken(),b=createReportToken();
  assert.notEqual(a,b);
  assert.equal(a.length,43);
  assert.equal(validateReportToken(a),a);
  assert.equal(validateReportToken(a+'extra'),null);
  assert.equal(validateReportToken('short'),null);
  assert.match(hashReportToken(a),/^[a-f0-9]{64}$/);
  assert.notEqual(hashReportToken(a),hashReportToken(b));
  assert.notEqual(hashReportToken(a),a);
});

test('scope forbids all-group token with a participant and validates TTL and dates',()=>{
  assert.equal(createShareSchema.safeParse({ groupKey:'triple-c',audience:'group',hours:12 }).success,true);
  assert.equal(createShareSchema.safeParse({ groupKey:'triple-c',audience:'participant',hours:12 }).success,false);
  assert.equal(createShareSchema.safeParse({ groupKey:'triple-c',audience:'group',participantCode:'X',hours:12 }).success,false);
  assert.equal(createShareSchema.safeParse({ groupKey:'triple-c',audience:'participant',participantCode:'X',hours:169 }).success,false);
  assert.equal(reportDate.safeParse('2026-02-30').success,false);
  assert.equal(shareAllowed({ expiresAt:new Date('2026-10-15T02:00:01Z'),revokedAt:null },now),true);
  assert.equal(shareAllowed({ expiresAt:now,revokedAt:null },now),false);
  assert.equal(shareAllowed({ expiresAt:new Date('2026-10-17'),revokedAt:now },now),false);
});

test('Venezuela operational day crosses UTC midnight without losing evening transactions',()=>{
  assert.deepEqual(Object.values(dateWindowCaracas('2026-10-14')).map(v=>v.toISOString()),
    ['2026-10-14T04:00:00.000Z','2026-10-15T04:00:00.000Z']);
});

test('financial formatting stays exact for large integer minor units and handles negative values',()=>{
  assert.equal(readableMinor('1750000'),'17.500,00');
  assert.equal(readableMinor('-3000000'),'-30.000,00');
  assert.equal(readableMinor('1'),'0,01');
  assert.equal(readableMinor('999999999999999999999'),'9.999.999.999.999.999.999,99');
  assert.throws(()=>readableMinor('1e6'),/INVALID/);
});

test('public HTML escapes hostile labels, is no-store, no-referrer and cannot load external assets',async(t)=>{
  state.revoked=false;
  const base=await api(t);
  const r=await fetch(base+'/public?t='+token+'&date=2026-10-14',{headers:{accept:'text/html'}});
  const html=await r.text();
  assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control')||'',/no-store/);
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.match(r.headers.get('content-security-policy')||'',/default-src 'none'/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html,/<input id="day" type="date"/);
  assert.match(html,/17\.500,00/);
  assert.ok(!html.includes('operator-token'));
});

test('only operator can create/list/revoke; public token never grants mutation',async(t)=>{
  state.revoked=false;
  const base=await api(t);
  assert.equal((await fetch(base,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({groupKey:'triple-c',audience:'group',hours:24})})).status,401);
  assert.equal((await fetch(base+'?groupKey=triple-c')).status,401);
  const headers={'x-hipico-operator-token':'approved-operator','content-type':'application/json'};
  const created=await fetch(base,{method:'POST',headers,
    body:JSON.stringify({groupKey:'triple-c',audience:'participant',participantCode:'PERSONA-1',hours:24})});
  assert.equal(created.status,201);
  const body=await created.json() as any;
  assert.equal(body.ok,true);
  assert.ok(body.data.relativeUrl.includes('?t='));
  assert.equal(body.data.consolidatedRelativeUrl,undefined,'personal token must not have group view URL');
  assert.ok(!JSON.stringify(body).includes('ownerId'));
  const groupCreated=await fetch(base,{method:'POST',headers,
    body:JSON.stringify({groupKey:'triple-c',audience:'group',hours:4})});
  assert.equal(groupCreated.status,201);
  const groupBody=await groupCreated.json() as any;
  assert.match(groupBody.data.consolidatedRelativeUrl,/&view=consolidated$/);
  assert.ok(!JSON.stringify(groupBody).includes('ownerId'));
  const listed=await fetch(base+'?groupKey=triple-c',{headers});
  assert.equal(listed.status,200);
  assert.ok(!JSON.stringify(await listed.json()).includes(token));
  const publicResponse=await fetch(base+'/public?t='+token+'&date=2026-10-14',{headers:{accept:'application/json'}});
  assert.equal(publicResponse.status,200);
  assert.equal((await publicResponse.json() as any).data.groupKey,'triple-c');
  assert.equal((await fetch(base+'/'+owner,{method:'DELETE'})).status,401);
  assert.equal((await fetch(base+'/'+owner,{method:'DELETE',headers})).status,204);
  assert.equal((await fetch(base+'/public?t='+token+'&date=2026-10-14')).status,404);
});

test('reject invalid token and date uniformly without hitting ledger or disclosing scope',async(t)=>{
  state.revoked=false;
  const base=await api(t);
  for(const q of ['t=bad','t='+token+'&date=2026-02-30','t='+token+'&date=2026-10-14%26debug%3D1']){
    const response=await fetch(base+'/public?'+q);
    assert.equal(response.status,404);
    const body=await response.json() as any;
    assert.equal(body.code,'REPORT_NOT_FOUND');
  }
});


test('shared group capability reads only the authorized consolidated view with correct pagination metadata',async(t)=>{
  state.revoked=false;
  const base=await api(t);
  const r=await fetch(base+'/public?t='+groupToken+'&view=consolidated&date=2026-10-14&page=2&search=TEST',{headers:{accept:'application/json'}});
  assert.equal(r.status,200);
  const payload=await r.json() as any;
  assert.equal(payload.data.page,2);
  assert.equal(payload.data.pageSize,21);
  assert.equal(payload.data.matchedParticipants,1);
  assert.equal(payload.data.groupKey,'triple-c');
  assert.equal(payload.data.rows[0].balanceMinor,'100500');
  assert.deepEqual(payload.data.unavailableColumns,['available','refund','deposit','withdrawal','transfer','aval']);
  assert.ok(!JSON.stringify(payload).includes(groupToken));
});

test('personal report token cannot view group consolidation, including HTML and negative cases',async(t)=>{
  state.revoked=false;
  const base=await api(t);
  const denied=await fetch(base+'/public?t='+token+'&view=consolidated&date=2026-10-14');
  assert.equal(denied.status,404);
  for(const suffix of [
    '&view=consolidated&date=2026-10-14&page=0',
    '&view=consolidated&date=2026-10-14&page=501',
    '&view=consolidated&date=2026-02-30',
    '&view=unknown'
  ]){
    assert.equal((await fetch(base+'/public?t='+groupToken+suffix)).status,404);
  }
});

test('group consolidation HTML escapes hostile ledger references, redacts unsupported columns and preserves no-cache CSP',async(t)=>{
  state.revoked=false;
  const base=await api(t);
  const r=await fetch(base+'/public?t='+groupToken+'&view=consolidated&date=2026-10-14',{headers:{accept:'text/html'}});
  const html=await r.text();
  assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control')||'',/no-store/);
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.match(r.headers.get('content-security-policy')||'',/style-src 'nonce-/);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html,/Grupo completo/);
  assert.match(html,/1.005,00/);
  assert.match(html,/no disponibles en este ledger/);
  assert.match(html,/Siguiente/);
  assert.ok(!html.includes('x-hipico-operator-token'));
});

test('revoked group capability never grants consolidated access',async(t)=>{
  state.revoked=true;
  const base=await api(t);
  assert.equal((await fetch(base+'/public?t='+groupToken+'&view=consolidated')).status,404);
});
