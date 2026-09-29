import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=(file)=>fs.readFileSync(file,'utf8');

test('#619 canonical component library exports the required foundation API',()=>{
  const source=read('frontend/src/components/vnext/index.js');
  for(const name of ['CgButton','CgIconButton','CgTextField','CgTextarea','CgPageHeader','CgSection','CgStatusChip','CgBadge','CgMoney','CgLoadingState','CgEmptyState','CgErrorState','CgPermissionState']){
    assert.match(source,new RegExp(`export (?:function|const) ${name}\\b`),name);
  }
  assert.match(source,/aria-busy/);
  assert.match(source,/accessible label/);
  assert.doesNotMatch(source,/dangerouslySetInnerHTML/);
});

test('#619 legacy bridge is explicitly transitional and mapped to canonical owners',()=>{
  const ledger=JSON.parse(read('docs/architecture/component-library-vnext-v1.json'));
  assert.equal(ledger.canonicalOwner,'frontend/src/components/vnext/index.js');
  assert.equal(ledger.themeOwner,'frontend/src/design-system/semanticTokens.v1.js');
  assert.equal(ledger.rules.noLocalCloneWhenCanonicalExists,true);
  const legacy=ledger.deprecatedOwners.find((row)=>row.owner==='frontend/src/components/ui/kit.js');
  assert.equal(legacy?.status,'deprecated-transition');
  assert.ok(legacy?.removalCriteria?.includes('zero'));
  const bridge=read('frontend/src/components/vnext/legacyBridge.js');
  assert.match(bridge,/LEGACY_BRIDGE_STATUS='DEPRECATED'/);
  assert.match(bridge,/legacyOwnerFor/);
});

test('#619 authority audit fails closed on competing theme/component ownership',()=>{
  const result=spawnSync(process.execPath,['scripts/component-library-authority-audit-v619.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const report=JSON.parse(result.stdout.trim());
  assert.equal(report.ok,true);
  assert.equal(report.required,13);
});

test('#619 documentation defines migration and accessibility rules',()=>{
  const doc=read('docs/architecture/component-library-vnext-v1.md');
  for(const phrase of ['semantic tokens (#631)','legacy bridge','CgIconButton','loading','reduced-motion','consumers reach zero']) assert.ok(doc.includes(phrase),phrase);
});
