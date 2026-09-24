import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const auth=read('backend/src/modules/auth/auth.routes.ts');
const licenses=read('backend/src/modules/licenses/licenses.routes.ts');
const membership=read('backend/src/shared/identity/accountMembership.ts');

test('54/75 tenant registration is create-only and cannot mutate an existing RIF',()=>{
  assert.doesNotMatch(auth,/tenant\.upsert\(\{where:\{rif:body\.tenantRif\}/);
  assert.match(auth,/existingTenant=.*tenant\.findFirst/s);
  assert.match(auth,/Ya existe una empresa registrada con ese RIF/);
  assert.match(auth,/tenant\.create\(\{data:\{rif:tenantRif/);
  assert.match(auth,/error\?\.code==='P2002'/);
});

test('54/75 tenant admin provisioning is one Prisma transaction',()=>{
  assert.match(auth,/provisioned=await prisma\.\$transaction\(async\(tx\)=>/);
  assert.match(auth,/tx\.tenant\.create/);
  assert.match(auth,/tx\.userProfile\.create/);
  assert.match(auth,/ensureAdminRole\(tx,tenant\.id,user\.id\)/);
  assert.match(auth,/ensureAccountMembership\([^]*,tx\);/);
});

test('54/75 account identity and membership support the caller transaction client',()=>{
  assert.match(membership,/type IdentityDb = typeof prisma \| Prisma\.TransactionClient/);
  assert.match(membership,/membershipForProfile\(userProfileId:string,db:IdentityDb=prisma\)/);
  assert.match(membership,/ensureAccountMembership\(input: MembershipIdentityInput,db:IdentityDb=prisma\)/);
  assert.match(membership,/const accountRows = await db\.\$queryRaw/);
  assert.match(membership,/const membershipRows = await db\.\$queryRaw/);
  assert.doesNotMatch(membership.slice(membership.indexOf('export async function ensureAccountMembership'),membership.indexOf('export async function linkMembershipToAccount')),/await prisma\.\$queryRaw/);
});

test('54/75 licensed-user provisioning commits user membership RBAC license metadata and audit together',()=>{
  const post=licenses.slice(licenses.indexOf("router.post('/', requirePermission('admin.manage')"),licenses.indexOf("router.post('/validate'"));
  assert.match(post,/prisma\.\$transaction\(async\(tx\)=>/);
  for(const contract of [
    /tx\.userProfile\.(?:update|create)/,
    /ensureAccountMembership\([^]*,tx\);/,
    /assignTrialRole\(tx,ctx\.tenantId,user\.id,body\.modules\)/,
    /tx\.licenseKey\.updateMany/,
    /tx\.licenseKey\.create/,
    /UPDATE public\."LicenseKey"/,
    /extensionByLicenseId\(record\.id,tx\)/,
    /audit\(req,'license\.create',record\.id,publicData,tx\)/
  ])assert.match(post,contract);
});
