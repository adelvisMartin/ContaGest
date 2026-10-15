import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const auth=read('backend/src/modules/auth/auth.routes.ts');
const bootstrap=read('backend/src/database/auth-bootstrap.ts');
const licenses=read('backend/src/modules/licenses/licenses.routes.ts');
const membership=read('backend/src/shared/identity/accountMembership.ts');

test('55/75 registration is gated, create-only and rejects existing identities through canonical bootstrap',()=>{
  const register=auth.slice(auth.indexOf("router.post('/register'"),auth.indexOf("router.post('/login'"));
  assert.ok(register.length>300,'must characterize an existing registration route');
  assert.match(register,/if\(!publicAllowed&&!keyAllowed\)throw new HttpError\(403/);
  assert.match(register,/provisioned=await registerTenantBootstrap\(\{/);
  assert.match(register,/isBootstrapRegistrationConflict\(error\)/);
  assert.match(register,/HttpError\(409,/);
  assert.doesNotMatch(register,/\.tenant\.(?:upsert|update)\(/,'registration must not mutate pre-existing tenants');
  assert.match(bootstrap,/FROM private\.contagest_bootstrap_register_tenant\(/);
  assert.match(bootstrap,/CONTAGEST_BOOTSTRAP_REGISTRATION_EMPTY/);
});

test('55/75 registration delegates one atomic PostgreSQL bootstrap command, not a fragmented route transaction',()=>{
  const register=auth.slice(auth.indexOf("router.post('/register'"),auth.indexOf("router.post('/login'"));
  assert.match(register,/registerTenantBootstrap\(\{/);
  assert.doesNotMatch(register,/prisma\.\$transaction|prisma\.tenant\.(?:create|upsert)/,
    'router must not implement a competing provisioning authority');
  assert.match(bootstrap,/export async function registerTenantBootstrap\(/);
  assert.match(bootstrap,/const rows = await db\.\$queryRaw<IdentityBootstrapRow\[\]>/);
  assert.match(bootstrap,/SELECT "tenant_id", "user_profile_id"/);
  for(const field of ['tenantRif','tenantName','plan','email','fullName','passwordHash']){
    assert.ok(bootstrap.includes('${input.'+field+'}'),field+' must be bound as a SQL parameter');
  }
  assert.match(bootstrap,/CONTAGEST_BOOTSTRAP_REGISTRATION_EMPTY/);
});

test('55/75 account identity and membership support the caller transaction client',()=>{
  assert.match(membership,/type IdentityDb = typeof prisma \| Prisma\.TransactionClient/);
  assert.match(membership,/membershipForProfile\(userProfileId:string,db:IdentityDb=prisma\)/);
  assert.match(membership,/ensureAccountMembership\(input: MembershipIdentityInput,db:IdentityDb=prisma\)/);
  assert.match(membership,/const accountRows = await db\.\$queryRaw/);
  assert.match(membership,/const membershipRows = await db\.\$queryRaw/);
  assert.doesNotMatch(membership.slice(membership.indexOf('export async function ensureAccountMembership'),membership.indexOf('export async function linkMembershipToAccount')),/await prisma\.\$queryRaw/);
});

test('55/75 licensed-user provisioning commits user membership RBAC license metadata and audit together',()=>{
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
