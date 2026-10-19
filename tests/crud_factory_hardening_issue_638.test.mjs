import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const read = (pathInRepo) => fs.readFileSync(path.join(ROOT, pathInRepo), 'utf8');
const policyUrl = pathToFileURL(path.join(ROOT, 'backend/src/modules/crud-policy.ts')).href;

// Execute the actual dependency-free TypeScript policy, not a JS reimplementation.
// Node 22's strip-types flag is intentional: the repository engine is Node 22.
function executePolicy(cases) {
  const source = `
    import * as policy from ${JSON.stringify(policyUrl)};
    const cases = ${JSON.stringify(cases)};
    const results = cases.map(({ fn, args }) => {
      try {
        const value = policy[fn](...args);
        return { ok: true, value: value ?? null };
      } catch (error) {
        return { ok: false, name: error.name, status: error.status, message: error.message };
      }
    });
    process.stdout.write(JSON.stringify(results));
  `;
  const result = spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', '--input-type=module', '-e', source], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000
  });
  assert.equal(result.status, 0, `Policy module failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

test('#638: create/update field allowlists reject tenant, system and mass-assignment attributes', () => {
  const cases = [
    { fn: 'assertCrudMutationFields', args: ['client', 'create', { rif: 'J12345678', name: 'Cliente' }] },
    { fn: 'assertCrudMutationFields', args: ['supplier', 'update', { retentionProfile: 'ordinary' }] },
    { fn: 'assertCrudMutationFields', args: ['product', 'update', { price: '10.00' }] },
    { fn: 'assertCrudMutationFields', args: ['bankAccount', 'create', { bankName: 'Banco', accountNo: '1234' }] },
    { fn: 'assertCrudMutationFields', args: ['taxPeriod', 'create', { period: '2026-10' }] },
    { fn: 'assertCrudMutationFields', args: ['client', 'create', { name: 'Cliente', tenantId: 'OTHER' }] },
    { fn: 'assertCrudMutationFields', args: ['supplier', 'update', { id: 'other-uuid' }] },
    { fn: 'assertCrudMutationFields', args: ['product', 'update', { stock: 999, reserved: -2 }] },
    { fn: 'assertCrudMutationFields', args: ['bankAccount', 'update', { balance: 1000000 }] },
    { fn: 'assertCrudMutationFields', args: ['taxPeriod', 'create', { period: '2026-10', status: 'closed' }] },
    { fn: 'assertCrudMutationFields', args: ['client', 'create', { name: 'Cliente', createdAt: 'yesterday' }] },
    { fn: 'assertCrudMutationFields', args: ['client', 'update', { userId: 'superuser' }] },
    { fn: 'assertCrudMutationFields', args: ['supplier', 'update', { role: 'admin' }] },
    { fn: 'assertCrudMutationFields', args: ['client', 'update', { rif: 'J9999999' }] },
    { fn: 'assertCrudMutationFields', args: ['supplier', 'update', { rif: 'J8888888' }] },
    { fn: 'assertCrudMutationFields', args: ['bankAccount', 'update', { currency: 'USD' }] },
    { fn: 'assertCrudMutationFields', args: ['client', 'update', {}] },
    { fn: 'assertCrudMutationFields', args: ['client', 'create', []] },
    { fn: 'assertCrudMutationFields', args: ['client', 'create', null] }
  ];
  const results = executePolicy(cases);
  results.slice(0, 5).forEach((value) => assert.equal(value.ok, true, JSON.stringify(value)));
  results.slice(5).forEach((value) => {
    assert.equal(value.ok, false);
    assert.equal(value.status, 422);
    assert.doesNotMatch(value.message, /OTHER|superuser|yesterday/);
  });
});

test('#638: financial lifecycle cannot be mutated through the generic router', () => {
  const cases = [
    { fn: 'assertCrudOperation', args: ['taxPeriod', 'update'] },
    { fn: 'assertCrudOperation', args: ['taxPeriod', 'delete'] },
    { fn: 'assertCrudOperation', args: ['bankAccount', 'delete'] },
    { fn: 'assertCrudOperation', args: ['product', 'delete'] }
  ];
  const results = executePolicy(cases);
  assert.deepEqual(results.slice(0, 3).map(({ status }) => status), [405, 405, 405]);
  assert.equal(results[3].ok, true);
});

test('#638: list pagination remains bounded and unknown sort/filter is refused', () => {
  const cases = [
    { fn: 'parseCrudListWindow', args: [{}] },
    { fn: 'parseCrudListWindow', args: [{ take: '900000', skip: '-5', q: 'Cliente' }] },
    { fn: 'parseCrudListWindow', args: [{ take: 'invalid', skip: 'invalid' }] },
    { fn: 'parseCrudListWindow', args: [{ sort: 'tenantId' }] },
    { fn: 'parseCrudListWindow', args: [{ filter: { OR: [{ tenantId: 'OTHER' }] } }] },
    { fn: 'parseCrudListWindow', args: [{ tenantId: 'OTHER' }] },
    { fn: 'parseCrudListWindow', args: [{ take: ['500'] }] },
    { fn: 'parseCrudSearchText', args: [{ q: '   Ana  ' }] },
    { fn: 'parseCrudSearchText', args: [{ q: ['Ana'] }] },
    { fn: 'parseCrudSearchText', args: [{ q: 'a'.repeat(161) }] }
  ];
  const results = executePolicy(cases);
  assert.deepEqual(results[0].value, { take: 100, skip: 0 });
  assert.deepEqual(results[1].value, { take: 500, skip: 0 });
  assert.deepEqual(results[2].value, { take: 100, skip: 0 });
  results.slice(3, 7).forEach((value) => assert.equal(value.status, 422));
  assert.equal(results[7].value, 'Ana');
  results.slice(8).forEach((value) => assert.equal(value.status, 422));
});

test('#638: route identifiers are scalar and fail closed on Express array params', () => {
  const results = executePolicy([
    { fn: 'parseCrudRouteId', args: ['tenant-owned-id'] },
    { fn: 'parseCrudRouteId', args: [['tenant-owned-id', 'other-id']] },
    { fn: 'parseCrudRouteId', args: [''] },
    { fn: 'parseCrudRouteId', args: [null] }
  ]);
  assert.deepEqual(results[0], { ok: true, value: 'tenant-owned-id' });
  results.slice(1).forEach(({ ok, status }) => {
    assert.equal(ok, false);
    assert.equal(status, 422);
  });
});

test('#638: router has one bounded delegate authority, strict Zod and tenant scoped writes', () => {
  const factory = read('backend/src/modules/crud.factory.ts');
  const manifest = read('backend/src/modules/route-manifest.ts');
  const policy = read('backend/src/modules/crud-policy.ts');
  assert.doesNotMatch(factory, /as any|tenantScoped\s*\?/);
  assert.doesNotMatch(manifest, /model:'(?:client|supplier|product|bankAccount|taxPeriod)' as any/);
  const crudModels=[...manifest.matchAll(/createCrudRouter\(\{\s*model:'(client|supplier|product|bankAccount|taxPeriod)'/g)].map(match=>match[1]);
  assert.deepEqual([...new Set(crudModels)].sort(), ['bankAccount','client','product','supplier','taxPeriod']);
  assert.equal(crudModels.length, 5);
  assert.match(factory, /schema\.strict\(\)/);
  assert.match(factory, /schema\.partial\(\)\.strict\(\)/);
  assert.match(factory, /data: \{ \.\.\.req\.body, tenantId: ctx\.tenantId \}/);
  assert.match(factory, /const where = \{ id: parseCrudRouteId\(req\.params\.id\), tenantId: ctx\.tenantId \};/);
  assert.match(factory, /delegate\.update\(\{ where, data: req\.body \}\)/);
  assert.match(factory, /delegate\.delete\(\{ where \}\)/);
  assert.match(factory, /requireTenant, requirePermission\(options\.permission\)/);
  assert.match(policy, /NON_DELETABLE_MODELS/);
  assert.match(policy, /CRUD_SEARCH_FIELDS/);
});

test('#638: runtime caller cannot bypass typed model or operation allowlists', () => {
  const cases = [
    { fn: 'assertCrudOperation', args: ['unknown', 'create'] },
    { fn: 'assertCrudOperation', args: ['__proto__', 'update'] },
    { fn: 'assertCrudOperation', args: ['constructor', 'delete'] },
    { fn: 'assertCrudOperation', args: ['client', 'bulkDelete'] },
    { fn: 'assertCrudMutationFields', args: ['unknown', 'create', { name:'fake' }] },
    { fn: 'assertCrudMutationFields', args: ['client', 'patch', { name:'fake' }] },
    { fn: 'parseCrudListWindow', args: [null] },
    { fn: 'parseCrudListWindow', args: [[]] },
    { fn: 'parseCrudListWindow', args: ['take=25'] },
    { fn: 'assertCrudOperation', args: ['client', 'create'] }
  ];
  const results=executePolicy(cases);
  for (const row of results.slice(0, 9)) {
    assert.equal(row.ok, false);
    assert.equal(row.name, 'CrudPolicyError');
    assert.equal(row.status, 422);
    assert.doesNotMatch(row.message, /unknown|bulkDelete|constructor/);
  }
  assert.equal(results[9].ok,true);
});
