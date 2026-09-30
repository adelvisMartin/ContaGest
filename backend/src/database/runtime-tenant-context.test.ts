import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentRuntimeTenantId,
  normalizeRuntimeTenantId,
  runWithRuntimeTenant,
} from './runtime-tenant-context.js';
import { createTenantScopedPrismaProxy } from './tenant-prisma-proxy.js';

const TENANT_A='11111111-1111-4111-8111-111111111111';
const TENANT_B='22222222-2222-4222-8222-222222222222';
const LEGACY_TENANT='tenant-main_1';

function delay(ms:number){return new Promise((resolve)=>setTimeout(resolve,ms));}

test('runtime tenant id accepts canonical UUIDs and bounded legacy ids while rejecting unsafe identifiers',()=>{
  assert.equal(normalizeRuntimeTenantId(`  ${TENANT_A.toUpperCase()}  `),TENANT_A);
  assert.equal(normalizeRuntimeTenantId(`  ${LEGACY_TENANT}  `),LEGACY_TENANT);
  for(const invalid of [
    '',
    '../tenant',
    'tenant main',
    'tenant/main',
    `tenant-${'a'.repeat(64)}`,
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-4111-7111-111111111111',
  ]){
    assert.throws(()=>normalizeRuntimeTenantId(invalid),/RUNTIME_TENANT_ID_INVALID/);
  }
});

test('AsyncLocalStorage isolates concurrent tenant contexts',async()=>{
  const seen:string[]=[];
  await Promise.all([
    runWithRuntimeTenant(TENANT_A,async()=>{
      seen.push(`a1:${currentRuntimeTenantId()}`);
      await delay(15);
      seen.push(`a2:${currentRuntimeTenantId()}`);
    }),
    runWithRuntimeTenant(TENANT_B,async()=>{
      await delay(5);
      seen.push(`b1:${currentRuntimeTenantId()}`);
      await delay(20);
      seen.push(`b2:${currentRuntimeTenantId()}`);
    }),
  ]);
  assert.deepEqual(seen.sort(),[
    `a1:${TENANT_A}`,
    `a2:${TENANT_A}`,
    `b1:${TENANT_B}`,
    `b2:${TENANT_B}`,
  ].sort());
  assert.equal(currentRuntimeTenantId(),null);
});

test('legacy tenant ids preserve exact case because Tenant.id is a text key',async()=>{
  const legacy='LegacyTenant_1';
  await runWithRuntimeTenant(legacy,async()=>{
    assert.equal(currentRuntimeTenantId(),legacy);
  });
  assert.equal(currentRuntimeTenantId(),null);
});

test('tenant-scoped model query binds set_config inside the same transaction',async()=>{
  const events:string[]=[];
  const base:any={
    client:{
      async findMany(args:any){events.push(`direct:${JSON.stringify(args)}`);return ['direct'];},
    },
    async $transaction(callback:any){
      events.push('begin');
      const tx:any={
        client:{async findMany(args:any){events.push(`tx-query:${JSON.stringify(args)}`);return ['tenant'];}},
      };
      try{const result=await callback(tx);events.push('commit');return result;}
      catch(error){events.push('rollback');throw error;}
    },
  };
  const scoped=createTenantScopedPrismaProxy(base,async(_tx,tenantId)=>{events.push(`bind:${tenantId}`);});

  const noContext=await scoped.client.findMany({where:{id:'x'}});
  assert.deepEqual(noContext,['direct']);

  const tenantResult=await runWithRuntimeTenant(TENANT_A,()=>scoped.client.findMany({where:{id:'x'}}));
  assert.deepEqual(tenantResult,['tenant']);
  assert.deepEqual(events,[
    'direct:{"where":{"id":"x"}}',
    'begin',
    `bind:${TENANT_A}`,
    'tx-query:{"where":{"id":"x"}}',
    'commit',
  ]);
});

test('tenant-scoped raw query uses the same bound transaction',async()=>{
  const events:string[]=[];
  const base:any={
    async $queryRaw(...args:any[]){events.push(`direct-raw:${args.join('|')}`);return ['direct'];},
    async $transaction(callback:any){
      events.push('begin');
      const tx:any={async $queryRaw(...args:any[]){events.push(`tx-raw:${args.join('|')}`);return ['tenant'];}};
      try{const result=await callback(tx);events.push('commit');return result;}
      catch(error){events.push('rollback');throw error;}
    },
  };
  const scoped=createTenantScopedPrismaProxy(base,async(_tx,tenantId)=>{events.push(`bind:${tenantId}`);});
  assert.deepEqual(await scoped.$queryRaw('SELECT direct'),['direct']);
  assert.deepEqual(await runWithRuntimeTenant(TENANT_A,()=>scoped.$queryRaw('SELECT tenant')),['tenant']);
  assert.deepEqual(events,[
    'direct-raw:SELECT direct',
    'begin',
    `bind:${TENANT_A}`,
    'tx-raw:SELECT tenant',
    'commit',
  ]);
});

test('interactive transaction binds tenant once and preserves one transaction client',async()=>{
  const events:string[]=[];
  const base:any={
    async $transaction(callback:any){
      events.push('begin');
      const tx={client:{async count(){events.push('count');return 1;}}};
      try{const value=await callback(tx);events.push('commit');return value;}
      catch(error){events.push('rollback');throw error;}
    },
  };
  const scoped=createTenantScopedPrismaProxy(base,async(_tx,tenantId)=>{events.push(`bind:${tenantId}`);});
  const result=await runWithRuntimeTenant(TENANT_B,()=>scoped.$transaction(async(tx:any)=>{
    assert.equal(await tx.client.count(),1);
    return 'ok';
  }));
  assert.equal(result,'ok');
  assert.deepEqual(events,['begin',`bind:${TENANT_B}`,'count','commit']);
});

test('tenant-scoped sequential transaction arrays fail closed instead of losing context',async()=>{
  const base:any={$transaction:async()=>[]};
  const scoped=createTenantScopedPrismaProxy(base,async()=>{});
  await runWithRuntimeTenant(TENANT_A,async()=>{
    await assert.rejects(()=>scoped.$transaction([Promise.resolve(1)]),/TENANT_TRANSACTION_CALLBACK_REQUIRED/);
  });
});

test('transaction error rolls back and AsyncLocalStorage does not leak outside request scope',async()=>{
  const events:string[]=[];
  const base:any={
    client:{async count(){return 0;}},
    async $transaction(callback:any){
      events.push('begin');
      try{return await callback({client:{async count(){throw new Error('boom');}}});}
      catch(error){events.push('rollback');throw error;}
    },
  };
  const scoped=createTenantScopedPrismaProxy(base,async(_tx,tenantId)=>{events.push(`bind:${tenantId}`);});
  await assert.rejects(
    ()=>runWithRuntimeTenant(TENANT_A,()=>scoped.client.count()),
    /boom/,
  );
  assert.equal(currentRuntimeTenantId(),null);
  assert.deepEqual(events,['begin',`bind:${TENANT_A}`,'rollback']);
});
