import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  UI_MIGRATION_MANIFEST,
  UI_MIGRATION_STATUS
} from '../qa/support/ui-migration-manifest.mjs';
import { auditUiMigration } from '../qa/support/ui-migration-audit.mjs';

const root=process.cwd();

test('2/51: veterinary is governed as MUI and gym/dentistry legacy exceptions are explicit',()=>{
  assert.equal(UI_MIGRATION_MANIFEST.veterinaria.status,UI_MIGRATION_STATUS.MIGRATED_MUI);
  for(const route of ['odontologia','gimnasio','rutinas','nutricion']){
    const entry=UI_MIGRATION_MANIFEST[route];
    assert.equal(entry.status,UI_MIGRATION_STATUS.LEGACY_EXCEPTION_APPROVED,route);
    assert.ok(entry.owner,route);
    assert.match(entry.approvedAt,/^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.followUp,route);
    assert.ok(entry.responsiveMarkers.length>0,route);
  }
});

test('2/51: current repository satisfies UI migration governance',()=>{
  const result=auditUiMigration(root);
  assert.equal(result.ok,true,JSON.stringify(result,null,2));
  assert.deepEqual(result.errors,[]);
});

test('2/51: veterinary composition contains no legacy compatibility kit',()=>{
  const wrapper=fs.readFileSync(path.join(root,'frontend/src/pages/VeterinaryClinicPageV1123.jsx'),'utf8');
  const workspace=fs.readFileSync(path.join(root,'frontend/src/pages/VeterinaryClinicPage.jsx'),'utf8');
  assert.doesNotMatch(wrapper,/VeterinaryClinicLegacy/);
  for(const source of [wrapper,workspace]){
    assert.match(source,/@mui\/material/);
    assert.match(source,/createContaGestMuiTheme/);
    assert.doesNotMatch(source,/components\/ui\/index\.js/);
    assert.doesNotMatch(source,/components\/designSystem\.js/);
  }
});

test('2/51: registry drift to another page fails closed',()=>{
  const registryPath='frontend/src/data/pageRegistry.js';
  const registry=fs.readFileSync(path.join(root,registryPath),'utf8');
  const drift=registry.replace(
    "veterinaria: ['./pages/VeterinaryClinicPageV1123.jsx', 'VeterinaryClinicPage']",
    "veterinaria: ['./pages/DentistryPracticePage.js', 'DentistryPracticePage']"
  );
  const result=auditUiMigration(root,{overrides:{[registryPath]:drift}});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((error)=>error.includes('veterinaria')&&error.includes('registry')));
});

test('2/51: silent legacy reintroduction into veterinary fails closed',()=>{
  const file='frontend/src/pages/VeterinaryClinicPageV1123.jsx';
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const drift=source.replace(
    "import { createContaGestMuiTheme } from '../components/muiRuntime.js';",
    "import { createContaGestMuiTheme } from '../components/muiRuntime.js';\nimport { Button as LegacyButton } from '../components/ui/index.js';"
  );
  const result=auditUiMigration(root,{overrides:{[file]:drift}});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((error)=>error.includes('veterinaria')&&error.includes('legacy-kit')));
});

test('2/51: approved legacy exception without governance metadata fails closed',()=>{
  const manifest={...UI_MIGRATION_MANIFEST,odontologia:{...UI_MIGRATION_MANIFEST.odontologia,followUp:''}};
  const result=auditUiMigration(root,{manifest});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((error)=>error.includes('odontologia')&&error.includes('followUp')));
});
