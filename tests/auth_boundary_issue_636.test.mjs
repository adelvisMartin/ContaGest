import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');

test('bearer authority is selected once and ContaGest-looking tokens never verifier-hop',()=>{
  const boundary=read('backend/src/shared/auth/authBoundary.ts');
  const context=read('backend/src/shared/middleware/context.ts');
  assert.match(boundary,/claimsBackendAuthority/);
  assert.match(boundary,/return 'backend-jwt'/);
  assert.match(boundary,/supabaseBridgeEnabled \? 'supabase' : 'backend-jwt'/);
  assert.match(context,/classifyPresentedTokenAuthority/);
  assert.match(context,/if\(authority==='backend-jwt'\)/);
  assert.doesNotMatch(context,/catch \(backendError\)[\s\S]{0,400}resolveSupabaseContext/);
});

test('backend JWT verifier pins algorithm issuer audience expiry and authority claims',()=>{
  const source=read('backend/src/shared/auth/jwt.ts');
  assert.match(source,/algorithms: \['HS256'\]/);
  assert.match(source,/issuer: JWT_ISSUER/);
  assert.match(source,/audience: JWT_AUDIENCE/);
  assert.match(source,/!decoded\?\.exp/);
  assert.match(source,/decoded\.authMode !== 'backend-jwt'/);
  assert.match(source,/decoded\.tokenType !== 'access'/);
  assert.match(source,/expiresIn: ACCESS_TOKEN_TTL_SECONDS/);
});

test('Supabase bridge is explicit and misconfiguration fails closed',()=>{
  const env=read('backend/src/config/env.ts');
  const boundary=read('backend/src/shared/auth/authBoundary.ts');
  const context=read('backend/src/shared/middleware/context.ts');
  assert.match(env,/SUPABASE_AUTH_FALLBACK: z\.string\(\)\.default\('false'\)/);
  assert.match(boundary,/SUPABASE_AUTH_BRIDGE_MISCONFIGURED/);
  assert.match(context,/assertSupabaseBridgeConfiguration/);
  assert.match(context,/503,'El proveedor de identidad configurado no está disponible\.'/);
});

test('cookie session remains server-revocable with rotation replay and CSRF protection',()=>{
  const source=read('backend/src/shared/auth/sessionCookies.ts');
  assert.match(source,/"status" = 'active'|"status"='active'/);
  assert.match(source,/"rotationCounter"="rotationCounter"\+1/);
  assert.match(source,/WHERE "id"=\$\{session\.id\} AND "refreshHash"=\$\{refreshHash\} AND "csrfHash"=\$\{csrfHash\} AND "status"='active'/);
  assert.match(source,/Se detectó una renovación reutilizada o concurrente/);
  assert.match(source,/validateCsrfAgainstSession/);
  assert.match(source,/"status"='revoked'/);
});

test('tenant, membership and permission authority remain server-side',()=>{
  const context=read('backend/src/shared/middleware/context.ts');
  const auth=read('backend/src/modules/auth/auth.routes.ts');
  assert.match(context,/where: \{ id: decoded\.sub, tenantId: decoded\.tenantId, status: 'active' \}/);
  assert.match(context,/role:\{ tenantId:ctx\.tenantId, permissions:/);
  assert.match(auth,/ensureAccountMembership/);
  assert.match(auth,/status:'active'/);
  assert.doesNotMatch(context,/tenantId\s*=\s*req\.body/);
});
