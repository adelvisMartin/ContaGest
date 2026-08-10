import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('equal email alone is not proof of cross-tenant identity',()=>{
  const migration=read('backend/prisma/migrations/20260809201500_v11_15_explicit_account_linking/migration.sql');
  assert.match(migration,/DROP CONSTRAINT IF EXISTS "AccountUser_email_key"/);
  assert.match(migration,/migration-split/);
  assert.match(migration,/Future links.*explicitly/s);
});

test('ordinary membership creation is per-profile while platform provisioning performs explicit linking',()=>{
  const identity=read('backend/src/shared/identity/accountMembership.ts');
  const provisioner=read('backend/src/shared/commercial/subscriptionProvisioner.ts');
  assert.match(identity,/membershipForProfile\(input\.userProfileId\)/);
  assert.match(identity,/INSERT INTO public\."AccountUser"/);
  assert.doesNotMatch(identity,/ON CONFLICT \("email"\)/);
  assert.match(identity,/linkMembershipToAccount/);
  assert.match(provisioner,/linkMembershipToAccount/);
  assert.match(provisioner,/platform-subscription/);
});

test('accessible tenant list filters commercial subscription state as well as license state',()=>{
  const identity=read('backend/src/shared/identity/accountMembership.ts');
  assert.match(identity,/assertSubscriptionAccess\(row\.subscriptionId\|\|null,row\.tenantId\)/);
  assert.match(identity,/activeLicenseForProfile/);
});
