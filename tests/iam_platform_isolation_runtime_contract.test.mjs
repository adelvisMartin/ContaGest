import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const auditScript = path.join(projectRoot, 'scripts/iam-platform-isolation-audit.mjs');
const fixtures = [
  'backend/src/modules/auth/auth.routes.ts',
  'backend/src/shared/middleware/context.ts',
  'backend/src/shared/commercial/subscriptionMiddleware.ts',
  'backend/src/shared/identity/accountMembership.ts',
  'backend/src/shared/legal/legalAcceptanceMiddleware.ts',
  'backend/src/shared/identity/platformAccess.ts',
  'backend/prisma/migrations/20260827043000_issue_27_platform_identity_normalization/migration.sql',
  'ops/database/runtime-rls-policy-v845.sql'
];

async function isolatedSources() {
  const root = await mkdtemp(path.join(tmpdir(), 'contagest-iam-'));
  try {
    for (const rel of fixtures) {
      const dest = path.join(root, rel);
      await mkdir(path.dirname(dest), {recursive:true});
      await copyFile(path.join(projectRoot, rel), dest);
    }
  } catch (error) {
    await rm(root, {recursive:true, force:true});
    throw error;
  }
  return root;
}

function runAudit(root) {
  const result = spawnSync(process.execPath, [auditScript], {
    cwd:root, encoding:'utf8', timeout:15000
  });
  assert.ifError(result.error);
  return {code:result.status, text:result.stdout + '\n' + result.stderr};
}

test('runtime membership audit accepts current guarded SQL and TS implementation', async () => {
  const root = await isolatedSources();
  try {
    const result = runAudit(root);
    assert.equal(result.code, 0, result.text);
    assert.match(result.text, /\[iam-platform-isolation\]\[PASS\]/);
  } finally {
    await rm(root, {recursive:true, force:true});
  }
});

const mutations = [
  {
    name:'rejects platform bypass in multi-company listing',
    file:'backend/src/shared/identity/accountMembership.ts',
    before:'if(await hasPlatformAccess({userId:row.userProfileId,tenantId:row.tenantId}))',
    after:'if(true)',
    error:'selector multiempresa debe verificar la autoridad plataforma explícita'
  },
  {
    name:'rejects missing source tenant binding in privileged runtime SQL',
    file:'ops/database/runtime-rls-policy-v845.sql',
    before:'up."tenantId" = private.contagest_runtime_tenant_id()',
    after:'TRUE',
    error:'debe vincular el perfil al tenant de sesión'
  },
  {
    name:'rejects cross-account membership enumeration',
    file:'ops/database/runtime-rls-policy-v845.sql',
    before:'tm."accountUserId" = source."accountUserId"',
    after:'TRUE',
    error:'debe limitar empresas a la misma cuenta explícitamente vinculada'
  },
  {
    name:'rejects switch without target tenant restriction',
    file:'ops/database/runtime-rls-policy-v845.sql',
    before:'tm."tenantId" = p_target_tenant_id',
    after:'TRUE',
    error:'tenant switch debe fijar el tenant destino solicitado'
  },
  {
    name:'rejects loss of platform role scope',
    file:'backend/src/shared/identity/platformAccess.ts',
    before:'r."scope" = ' + '$' + '{PLATFORM_ROLE_SCOPE}',
    after:'TRUE',
    error:'platformAccess debe exigir Role.scope=platform'
  }
];

for (const mutation of mutations) {
  test(mutation.name, async () => {
    const root = await isolatedSources();
    try {
      const target = path.join(root, mutation.file);
      const source = await readFile(target, 'utf8');
      assert.ok(source.includes(mutation.before), 'Mutation anchor disappeared: ' + mutation.name);
      await writeFile(target, source.replaceAll(mutation.before, mutation.after));
      const result = runAudit(root);
      assert.notEqual(result.code, 0, 'Audit allowed unsafe mutation: ' + mutation.name);
      assert.ok(result.text.includes(mutation.error), result.text);
    } finally {
      await rm(root, {recursive:true, force:true});
    }
  });
}
