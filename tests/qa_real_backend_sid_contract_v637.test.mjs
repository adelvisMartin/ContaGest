import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const qa=readFileSync(new URL('../qa/postmerge-backend-persistence-v17.test.ts',import.meta.url),'utf8');
const harness=readFileSync(new URL('../qa/support/real-backend-harness.ts',import.meta.url),'utf8');
const auth=readFileSync(new URL('../backend/src/shared/middleware/context.ts',import.meta.url),'utf8');

test('#637 QA uses real server-bound session, never sid-less bearer or bypass',()=>{
  assert.match(auth,/if \(!decoded\.sid\) throw new HttpError\(401,/);
  assert.match(qa,/createRealBackendHarness\(\)/);
  assert.match(qa,/harness\.issueSessionTokenFor\(qaUser\)/);
  assert.doesNotMatch(qa,/signAccessToken\(/);
  assert.match(harness,/INSERT INTO public\."UserSession"/);
  assert.match(harness,/return signAccessToken\(\{id:user\.id,email:user\.email\},tenant\.id,id\)/);
  assert.match(harness,/cleanupFixtureSessions\(/);
});
test('#637 protected CRUD contract stays fail closed during QA',()=>{
  assert.match(qa,/tenantId:'demo-tenant'/);
  assert.match(qa,/expectStatus\(base,token,path,422/);
  assert.match(qa,/nonDeletable:true/);
  assert.match(qa,/immutable:true/);
  assert.doesNotMatch(qa,/update:\{status:'review',ivaDebit/);
  const matches=harness.match(/import \{ randomBytes, randomUUID \} from 'node:crypto';/g)||[];
  assert.equal(matches.length,1,'fixture runtime must not redeclare crypto imports');
});
