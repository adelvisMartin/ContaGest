import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('backend/src/modules/user-security/user-security.routes.ts');
const begin = source.indexOf("router.patch('/users/:userId'");
const end = source.indexOf('\nexport default router;', begin);
assert.ok(begin >= 0 && end > begin, '#1312 user security route owner');
const patch = source.slice(begin, end);
const transaction = patch.slice(patch.indexOf('await prisma.$transaction('));
const access = read('backend/src/shared/middleware/context.ts');

test('#1312 backend JWT revocation is checked against UserSession on each authorized request', () => {
  assert.match(access, /SELECT "status", "expiresAt"/);
  assert.match(access, /"id"=\$\{decoded\.sid\}/);
  assert.match(access, /"userId"=\$\{decoded\.sub\}/);
  assert.match(access, /"tenantId"=\$\{decoded\.tenantId\}/);
  assert.match(access, /session\.status !== 'active'/);
});

test('#1312 admin privilege and password mutations revoke all active sessions in the same transaction', () => {
  assert.match(patch, /requirePermission\('admin\.manage'\)/, 'guard must apply to route router');
  assert.match(transaction, /const revokeSessions = Boolean\(body\.newPassword \|\| body\.status \|\| selectedRole\)/);
  assert.match(transaction, /await tx\.\$executeRaw`\s*UPDATE public\."UserSession"/);
  assert.match(transaction, /SET "status"='revoked', "revokedAt"=COALESCE\("revokedAt",now\(\)\)/);
  assert.match(transaction, /WHERE "tenantId"=\$\{id\} AND "userId"=\$\{user\.id\} AND "status"='active'/);
  assert.ok(transaction.indexOf('await tx.$executeRaw') > transaction.indexOf('await tx.userProfile.update'));
});

test('#1312 auditing contains only safe event flags and commits atomically with role, credential, session', () => {
  assert.match(transaction, /await tx\.auditLog\.create/);
  assert.match(transaction, /action:'security\.user\.updated'/);
  assert.match(transaction, /credentialRotated:Boolean\(body\.newPassword\)/);
  assert.match(transaction, /sessionsRevoked:revokeSessions/);
  assert.doesNotMatch(transaction, /after:\s*\{[^}]*passwordHash/s);
  assert.doesNotMatch(transaction, /after:\s*\{[^}]*newPassword\s*:/s);
  assert.match(transaction, /tx\.authLoginAttempt\.deleteMany/);
  assert.doesNotMatch(patch, /await clearUserFailures\(/, 'no unaudited after-commit failure reset');
});

test('#1312 does not authorize changing another tenant or self disabling', () => {
  assert.match(patch, /where:\{ id:req\.params\.userId, tenantId:id \}/);
  assert.match(patch, /if \(self && body\.status === 'disabled'\)/);
  assert.match(patch, /where:\{ id:body\.roleId, tenantId:id \}/);
});
