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

test('#639 migration ledger keeps legacy removal fail-closed',()=>{
  const ledger=JSON.parse(read('docs/architecture/react-strangler-migration-v1.json'));
  const help=ledger.routes.find((item)=>item.route==='ayuda');
  assert.equal(help.status,'MIGRATED_REACT');
  assert.equal(help.legacyConsumers,0);
  assert.equal(ledger.rules.removeLegacyOnlyWhenConsumersZero,true);
  assert.equal(ledger.rules.preserveDeepLinks,true);
  assert.equal(ledger.rules.preserveAuthRbac,true);
});

test('#639 composition root explicitly preserves migrated React slice lifecycle',()=>{
  const app=read('frontend/src/app.js');
  assert.match(app,/REACT_MANAGED_ROUTES=new Set\(\['veterinaria','ayuda'\]\)/);
  assert.match(app,/REACT_MANAGED_ROUTES\.has\(route\)/);
});