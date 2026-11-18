import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const publicRoute=readFileSync(new URL('../backend/src/modules/verticals/veterinary-guardian-portal.public.routes.ts',import.meta.url),'utf8');

test('#820 revocable guardian grant stays locked through all 5 patient projections',()=>{
  const lock=publicRoute.indexOf('FOR UPDATE OF g');
  const tx=publicRoute.indexOf('const payload=await prisma.$transaction(async(tx)=>');
  const update=publicRoute.indexOf('UPDATE public."VeterinaryGuardianPortalGrant"');
  const query=publicRoute.indexOf('const [appointmentRows, dischargeRows, documentRows, billingRows, communicationRows]');
  const end=publicRoute.indexOf('ok(res,payload)');
  assert.ok(tx>=0&&lock>tx&&update>lock&&query>update&&end>query);
  assert.match(publicRoute,/WHERE g\."tokenSha256"=\$1/);
  assert.match(publicRoute,/g\."revokedAt" IS NULL/);
  assert.match(publicRoute,/g\."expiresAt">now\(\)/);
  assert.match(publicRoute,/if\(marked!==1\)throw new HttpError\(404/);
  assert.match(publicRoute,/WHERE "id"=\$1 AND "revokedAt" IS NULL AND "expiresAt">now\(\)/);
  const secured=publicRoute.slice(tx,end);
  assert.equal((secured.match(/\? tx\.\$queryRawUnsafe/g)||[]).length,5,
    'all five optional reads must remain in the same transaction');
  assert.doesNotMatch(secured,/\? prisma\.\$queryRawUnsafe/);
  assert.match(secured,/return \{\s*clinic:/);
  assert.match(publicRoute,/Cache-Control', 'no-store/);
  assert.match(publicRoute,/Referrer-Policy', 'no-referrer/);
});

test('#820 public portal does not add raw diagnostic payloads or token exposure',()=>{
  const forbidden=['attachmentPath','clinicalData','"diagnosis"','"findings"','"impression"',
    '"payload"','providerMessageId'];
  for(const field of forbidden)assert.ok(!publicRoute.includes(field),field);
  assert.doesNotMatch(publicRoute,/res\.json\(\{[^}]*accessToken/s);
  assert.doesNotMatch(publicRoute,/SELECT .*"tokenSha256".*RETURNING/s);
});


test('#820 two concurrent grants for one tenant/patient use the same DB transaction lock',()=>{
  const source=readFileSync(new URL('../backend/src/modules/verticals/veterinary-guardian.routes.ts',import.meta.url),'utf8');
  const create=source.split("router.post('/guardian-portal/grants'")[1]
    .split("router.post('/guardian-portal/grants/:id/revoke'")[0];
  const tx=create.indexOf('prisma.$transaction(async (tx)=>');
  const lock=create.indexOf('veterinary:guardian-grant:');
  const revoke=create.indexOf('UPDATE public."VeterinaryGuardianPortalGrant"');
  const insert=create.indexOf('INSERT INTO public."VeterinaryGuardianPortalGrant"');
  assert.ok(tx>=0&&lock>tx&&revoke>lock&&insert>revoke);
  assert.match(create,/pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)::text AS locked/);
  assert.match(create,/veterinary:guardian-grant:\$\{tenantId\}:\$\{body\.patientId\}/);
  assert.match(create,/WHERE "tenantId"=\$1 AND "patientId"=\$2 AND "revokedAt" IS NULL/);
  assert.match(create,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "kind"='animal' AND "active"=true/);
});
