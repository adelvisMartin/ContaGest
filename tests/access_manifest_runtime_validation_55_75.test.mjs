import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAccessManifest } from '../backend/src/shared/contracts/accessManifestRuntime.js';

const manifest=JSON.parse(fs.readFileSync('backend/src/shared/contracts/access-manifest.json','utf8'));
const clone=()=>structuredClone(manifest);

test('55/75 canonical manifest passes runtime validation with 57 unique routes and eligible landings',()=>{
  const result=validateAccessManifest(clone());
  assert.equal(result.modules.length,57);
  assert.equal(new Set(result.modules.map((item)=>item.route)).size,57);
  for(const [mode,route] of Object.entries(result.landingByMode)){
    const item=result.modules.find((module)=>module.route===route);
    assert.ok(item,`${mode}: landing route missing`);
    assert.ok(item.modes.includes(mode),`${mode}: landing route not enabled for mode`);
  }
});

test('55/75 rejects duplicate routes',()=>{
  const value=clone();
  value.modules.push({...value.modules[0]});
  assert.throws(()=>validateAccessManifest(value),/duplicate route/i);
});

test('55/75 rejects unknown areas modes and invalid tier',()=>{
  const badArea=clone(); badArea.modules[0].area='Unknown';
  assert.throws(()=>validateAccessManifest(badArea),/unknown area/i);
  const badMode=clone(); badMode.modules[0].modes=['ghost'];
  assert.throws(()=>validateAccessManifest(badMode),/unknown mode/i);
  const badTier=clone(); badTier.modules[0].tier='premium';
  assert.throws(()=>validateAccessManifest(badTier),/invalid tier/i);
});

test('55/75 rejects missing permission/license metadata and inaccessible landing',()=>{
  const missing=clone(); missing.modules[0].permission='';
  assert.throws(()=>validateAccessManifest(missing),/permission/i);
  const badLanding=clone();
  badLanding.landingByMode.odontologia='dashboard';
  badLanding.modules.find((item)=>item.route==='dashboard').modes=badLanding.modules.find((item)=>item.route==='dashboard').modes.filter((mode)=>mode!=='odontologia');
  assert.throws(()=>validateAccessManifest(badLanding),/landing.*odontologia/i);
});

test('55/75 frontend consumers import validated manifest package surface',()=>{
  const catalog=fs.readFileSync('frontend/src/data/moduleCatalog.js','utf8');
  const access=fs.readFileSync('frontend/src/services/accessControlService.js','utf8');
  for(const source of [catalog,access]){
    assert.match(source,/contagest-ve-backend\/access-manifest/);
    assert.doesNotMatch(source,/access-manifest\.json/);
  }
});
