import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');

test('#639 Help route is migrated through the React/Cg strangler boundary',()=>{
  const registry=read('frontend/src/data/pageRegistry.js');
  const page=read('frontend/src/pages/HelpPage.jsx');
  assert.match(registry,/ayuda:\s*\['\.\/pages\/HelpPage\.jsx',\s*'HelpPage'\]/);
  assert.match(page,/createRoot/);
  assert.match(page,/CgProvider/);
  assert.match(page,/CgPageHeader/);
  assert.match(page,/CgDataTable/);
  assert.doesNotMatch(page,/innerHTML|ErpDataTable|mountCgFoundationPilot/);
});

test('#639 Help search remains keyboard-operable and announces result changes',()=>{
  const page=read('frontend/src/pages/HelpPage.jsx');
  assert.match(page,/component="form"/);
  assert.match(page,/role="search"/);
  assert.match(page,/onSubmit=\{submitSearch\}/);
  assert.match(page,/type="submit"/);
  assert.match(page,/type="button"/);
  assert.match(page,/aria-live="polite"/);
});

test('#639 migration ledger keeps legacy removal fail-closed',()=>{
  const ledger=JSON.parse(read('docs/architecture/react-strangler-migration-v1.json'));
  const help=ledger.routes.find((item)=>item.route==='ayuda');
  assert.equal(help.status,'MIGRATED_REACT');
  assert.equal(help.legacyConsumers,0);
  assert.equal(ledger.rules.removeLegacyOnlyWhenConsumersZero,true);
  assert.equal(ledger.rules.preserveDeepLinks,true);
  assert.equal(ledger.rules.preserveAuthRbac,true);
  assert.equal(ledger.rules.preserveApiContracts,true);
  assert.equal(fs.existsSync('frontend/src/pages/HelpPage.js'),false);
});

test('#639 migrated slice owns and cleans its React root without changing shell authority',()=>{
  const page=read('frontend/src/pages/HelpPage.jsx');
  assert.match(page,/let activeRoot=null/);
  assert.match(page,/activeRoot\?\.unmount\(\)/);
  assert.match(page,/data-react-strangler-route="ayuda"/);
  assert.doesNotMatch(page,/AccessControlService|AuthService|BackendApi|fetch\(/);
});
