import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../qa/commercial-backend-real-v23.test.ts',import.meta.url),'utf8');
const harness=readFileSync(new URL('../qa/support/real-backend-harness.ts',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/e2e-commercial-v23.yml',import.meta.url),'utf8');

test('#720 real commercial integration reuses session-bound authenticated QA, never ad-hoc JWT',()=>{
  assert.match(source,/const h=await createRealBackendHarness\(\)/);
  assert.match(source,/const \{tenant, token, base, prisma\}=h/);
  assert.match(source,/const restrictedToken=await h\.issueSessionTokenFor\(restricted\)/);
  assert.doesNotMatch(source,/signAccessToken\(/);
  assert.match(source,/await h\.close\(\)/);
  assert.doesNotMatch(source,/prisma\.auditLog\.deleteMany\(/);
  assert.match(harness,/assertQaDisposableDatabaseConfig\(process\.env\)/);
  assert.match(harness,/INSERT INTO public\."UserSession"/);
  assert.match(harness,/signAccessToken\(\{id:user\.id,email:user\.email\},tenant\.id,id\)/);
});

test('#720 commercial PG17 CI keeps real auth and exact-SHA gate',()=>{
  assert.match(workflow,/postgres:17-alpine/);
  assert.match(workflow,/github\.event\.pull_request\.head\.sha \|\| github\.sha/);
  assert.match(workflow,/test "\$\(git rev-parse HEAD\)" = "\$CANDIDATE_SHA"/);
  assert.match(workflow,/tests\/commercial_real_session_contract_v720\.test\.mjs/);
  assert.match(workflow,/npm run test:backend:commercial:real/);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true|\.skip\(|waitForTimeout/);
});
