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

test('#637 high-risk QA validates exact ephemeral database before creating sessions',()=>{
  const harnessEntry=harness.indexOf('export async function createRealBackendHarness(');
  const connectedDatabaseCheck=harness.indexOf('SELECT current_database() AS name',harnessEntry);
  const tenantLookup=harness.indexOf('await prisma.tenant.findUnique(',harnessEntry);
  const sessionInsert=harness.indexOf('INSERT INTO public."UserSession"',harnessEntry);
  assert.ok(harnessEntry>=0&&connectedDatabaseCheck>harnessEntry &&
    tenantLookup>connectedDatabaseCheck&&sessionInsert>connectedDatabaseCheck,
    'The database preflight must precede all test tenant/session mutations');
  assert.match(harness,/approvedDatabaseNames\.includes\(db\[0\]\?\.name\)/);
  assert.match(harness,/process\.env\.NODE_ENV,'test'/);
  const suites=[
    ['financial-decimal-real-v90.test.ts',["'contagest_financial_v90_e2e'","'contagest_ledger_v91'"]],
    ['ledger-posting-real-v91.test.ts',["'contagest_ledger_v91'"]],
    ['fiscal-governance-v96.test.ts',["'contagest_fiscal_v96_e2e'"]]
  ];
  for(const [file,approved] of suites){
    const source=readFileSync(new URL('../qa/'+file,import.meta.url),'utf8');
    assert.match(source,/approvedDatabaseNames:\[/,'Missing opt-in for '+file);
    for(const name of approved)assert.ok(source.includes(name),
      'Expected disposable database not allowlisted for '+file+': '+name);
  }
});

test('#90/#96 QA preserve immutable fiscal and posted financial evidence',()=>{
  const financial=readFileSync(new URL('../qa/financial-decimal-real-v90.test.ts',import.meta.url),'utf8');
  const fiscal=readFileSync(new URL('../qa/fiscal-governance-v96.test.ts',import.meta.url),'utf8');
  assert.doesNotMatch(financial,/\.ledgerEntry\.deleteMany\(/);
  assert.doesNotMatch(financial,/\.bankMovement\.deleteMany\(/);
  assert.doesNotMatch(financial,/\.salesInvoice\.deleteMany\(/);
  assert.doesNotMatch(financial,/\.purchaseInvoice\.deleteMany\(/);
  assert.doesNotMatch(fiscal,/\.fiscalDocument\.deleteMany\(/);
  assert.doesNotMatch(fiscal,/\.auditLog\.deleteMany\(/);
  assert.match(financial,/t\.after\(async \(\) => h\.close\(\)\)/);
});
