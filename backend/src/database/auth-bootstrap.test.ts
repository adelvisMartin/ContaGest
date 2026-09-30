import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBootstrapRegistrationConflict,
  registerTenantBootstrap,
  resolveLoginBootstrapIdentity,
  resolveSupabaseBootstrapIdentity
} from './auth-bootstrap.js';

function fakeDb(rows: unknown[]) {
  const calls: unknown[][] = [];
  return {
    calls,
    db: {
      async $queryRaw(_strings: TemplateStringsArray, ...values: unknown[]) {
        calls.push(values);
        return rows;
      }
    } as any
  };
}

test('login bootstrap adapter exposes only the minimal identity row and preserves server parameters', async () => {
  const { db, calls } = fakeDb([{
    tenant_id: '11111111-1111-4111-8111-111111111111',
    user_profile_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    password_hash: 'hash-a'
  }]);

  const result = await resolveLoginBootstrapIdentity(' J-10000000-1 ', ' OWNER@EXAMPLE.TEST ', db);

  assert.deepEqual(result, {
    tenantId: '11111111-1111-4111-8111-111111111111',
    userProfileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    passwordHash: 'hash-a'
  });
  assert.deepEqual(calls, [[' J-10000000-1 ', ' OWNER@EXAMPLE.TEST ']]);
  assert.deepEqual(Object.keys(result!).sort(), ['passwordHash','tenantId','userProfileId']);
});

test('bootstrap identity adapters return null when the private authority resolves no row', async () => {
  const login = fakeDb([]);
  const supabase = fakeDb([]);
  assert.equal(await resolveLoginBootstrapIdentity('J-404', 'nobody@example.test', login.db), null);
  assert.equal(await resolveSupabaseBootstrapIdentity('auth-missing', supabase.db), null);
});

test('supabase bootstrap accepts only provider user id and returns tenant/profile identity', async () => {
  const { db, calls } = fakeDb([{
    tenant_id: '11111111-1111-4111-8111-111111111111',
    user_profile_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  }]);

  const result = await resolveSupabaseBootstrapIdentity('supabase-a', db);
  assert.deepEqual(result, {
    tenantId: '11111111-1111-4111-8111-111111111111',
    userProfileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  });
  assert.deepEqual(calls, [['supabase-a']]);
});

test('registration bootstrap maps only newly-created ids and forwards application inputs', async () => {
  const { db, calls } = fakeDb([{
    tenant_id: '33333333-3333-4333-8333-333333333333',
    user_profile_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  }]);

  const result = await registerTenantBootstrap({
    tenantRif: 'J-30000000-3',
    tenantName: 'Tenant C',
    legalName: 'Tenant C Legal',
    plan: 'enterprise',
    email: 'admin@tenant-c.test',
    fullName: 'Admin C',
    passwordHash: 'bcrypt-hash-c'
  }, db);

  assert.deepEqual(result, {
    tenantId: '33333333-3333-4333-8333-333333333333',
    userProfileId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  });
  assert.deepEqual(calls, [[
    'J-30000000-3',
    'Tenant C',
    'Tenant C Legal',
    'enterprise',
    'admin@tenant-c.test',
    'Admin C',
    'bcrypt-hash-c'
  ]]);
});

test('registration conflict classifier recognizes only the narrow database conflict contract', () => {
  assert.equal(isBootstrapRegistrationConflict(new Error('CONTAGEST_BOOTSTRAP_REGISTRATION_CONFLICT')), true);
  assert.equal(isBootstrapRegistrationConflict({ code:'P2010', meta:{ code:'23505', message:'CONTAGEST_BOOTSTRAP_REGISTRATION_CONFLICT' } }), true);
  assert.equal(isBootstrapRegistrationConflict({ code:'23505', message:'other unique violation' }), false);
  assert.equal(isBootstrapRegistrationConflict(new Error('connection reset')), false);
});
