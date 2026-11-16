import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { syncStarterChartAccounts } from '../backend/src/modules/chart-accounts/chart-template-sync.ts';

const template = [
  { code:'1', name:'Starter account', type:'asset', nature:'debit',
    level:1, parentCode:null, allowPosting:true, description:null },
  { code:'2', name:'Another starter', type:'liability', nature:'credit',
    level:1, parentCode:null, allowPosting:true, description:null },
];
function fixture() {
  const rows = new Map([
    ['A:1', { ...template[0], tenantId:'A', name:'Personalizada',
      nature:'credit', allowPosting:false }],
    ['B:2', { ...template[1], tenantId:'B', name:'Empresa B' }],
  ]);
  const audit = [];
  const db = {
    chartAccount: {
      async createMany(input) {
        assert.equal(input.skipDuplicates, true);
        let count=0;
        for (const record of input.data) {
          const key=record.tenantId+':'+record.code;
          if (!rows.has(key)) { rows.set(key,structuredClone(record));count++; }
        }
        return { count };
      },
    },
    auditLog: { async create(value) { audit.push(value.data); } },
  };
  return { rows, audit, db };
}

test('#785 existing tenant customized account is never overwritten by template', async () => {
  const f=fixture();
  const actor={tenantId:'A',userId:'accountant-A'};
  assert.deepEqual(await syncStarterChartAccounts(f.db,template,actor),
    {ok:true,synced:2,created:1,unchanged:1});
  assert.equal(f.rows.get('A:1').name,'Personalizada');
  assert.equal(f.rows.get('A:1').nature,'credit');
  assert.equal(f.rows.get('A:1').allowPosting,false);
  assert.equal(f.rows.get('B:2').name,'Empresa B');
  assert.equal(f.rows.get('A:2').name,'Another starter');
  assert.deepEqual(await syncStarterChartAccounts(f.db,template,actor),
    {ok:true,synced:2,created:0,unchanged:2});
  assert.equal(f.rows.size,3);
  assert.equal(f.audit.length,2);
  assert.equal(f.audit[0].tenantId,'A');
  assert.equal(f.audit[0].userId,'accountant-A');
  assert.deepEqual(f.audit[0].after,{templateCount:2,created:1,unchanged:1});
});

test('#785 requires an authenticated tenant/actor before any database writes', async () => {
  const f=fixture();
  for (const actor of [{tenantId:'A',userId:''},{tenantId:'',userId:'u'},null]) {
    await assert.rejects(syncStarterChartAccounts(f.db,template,actor),
      /CHART_TEMPLATE_ACTOR_REQUIRED/);
  }
  assert.equal(f.rows.size,2);
  assert.equal(f.audit.length,0);
});

test('#785 denies out-of-bounds insertion counts and failed audit', async () => {
  const f=fixture();
  f.db.chartAccount.createMany=async()=>({count:template.length+1});
  await assert.rejects(syncStarterChartAccounts(f.db,template,{tenantId:'A',userId:'u'}),
    /CHART_TEMPLATE_INSERT_COUNT_INVALID/);
  assert.equal(f.audit.length,0);
  f.db.chartAccount.createMany=async()=>({count:1});
  f.db.auditLog.create=async()=>{throw new Error('AUDIT_WRITE_FAILED');};
  await assert.rejects(syncStarterChartAccounts(f.db,template,{tenantId:'A',userId:'u'}),
    /AUDIT_WRITE_FAILED/);
});

test('#785 the live endpoint keeps permission and database/audit in one transaction', () => {
  const routes=readFileSync(new URL('../backend/src/modules/chart-accounts/chart-accounts.routes.ts',import.meta.url),'utf8');
  assert.match(routes,/router\.post\('\/sync-template', requirePermission\('accounting\.post'\)/);
  assert.match(routes,/prisma\.\$transaction\(tx => syncStarterChartAccounts\(tx, chartAccounts/);
  assert.doesNotMatch(routes,/prisma\.chartAccount\.upsert\(/);
});
