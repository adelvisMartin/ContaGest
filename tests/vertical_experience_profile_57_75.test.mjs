import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACCESS_MANIFEST, experienceProfileForMode } from '../backend/src/shared/contracts/accessManifestRuntime.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('57/75 every business mode derives a valid landing and quick navigation from the canonical manifest',()=>{
  const byRoute=new Map(ACCESS_MANIFEST.modules.map((item)=>[item.route,item]));
  for(const mode of Object.keys(ACCESS_MANIFEST.businessModes)){
    const profile=experienceProfileForMode(mode);
    assert.equal(profile.schemaVersion,1);
    assert.equal(profile.mode,mode);
    assert.equal(profile.landingRoute,ACCESS_MANIFEST.landingByMode[mode]);
    assert.ok(profile.label);
    assert.ok(profile.description);
    assert.equal(profile.quickRoutes[0],profile.landingRoute);
    assert.ok(profile.quickRoutes.length>=1&&profile.quickRoutes.length<=6);
    for(const route of profile.quickRoutes){
      const module=byRoute.get(route);
      assert.ok(module,`${mode}: unknown quick route ${route}`);
      assert.ok(mode==='admin'||module.modes.includes(mode),`${mode}: quick route outside mode ${route}`);
      assert.ok(route===profile.landingRoute||module.tier==='core',`${mode}: non-core quick route ${route}`);
    }
  }
});

test('57/75 clinical and fitness profiles land in their own vertical instead of the generic dashboard',()=>{
  const expected={
    salud:'salud',
    veterinaria:'veterinaria',
    psicologia:'psicologia',
    odontologia:'odontologia',
    gimnasio:'gimnasio',
    nutricion:'nutricion'
  };
  for(const [mode,route] of Object.entries(expected)){
    const profile=experienceProfileForMode(mode);
    assert.equal(profile.landingRoute,route);
    assert.equal(profile.quickRoutes[0],route);
  }
});

test('57/75 unknown modes fail to the administrative experience without widening authorization',()=>{
  const profile=experienceProfileForMode('unknown-sector');
  assert.equal(profile.mode,'admin');
  assert.equal(profile.landingRoute,'dashboard');
});

test('57/75 auth sessions expose the canonical experience profile and frontend persists it',()=>{
  const auth=read('backend/src/modules/auth/auth.routes.ts');
  const service=read('frontend/src/services/authService.js');
  assert.match(auth,/experienceProfileForMode/);
  assert.match(auth,/experienceProfile,/);
  assert.match(auth,/experienceProfile:experienceProfileForMode\(license\?\.businessSector\|\|role\)/);
  assert.match(service,/experienceProfile:payload\.experienceProfile\|\|null/);
});

test('57/75 post-login home brand denied-route fallback and shell use the experience profile',()=>{
  const login=read('frontend/src/pages/LoginPage.js');
  const app=read('frontend/src/app.js');
  const layout=read('frontend/src/components/layout.js');
  assert.match(login,/session\.experienceProfile\?\.landingRoute\|\|'dashboard'/);
  assert.match(login,/experienceProfile:experience/);
  assert.match(app,/const experienceHome=/);
  assert.match(app,/AuthService\.isAuthenticated\(\)\?experienceHome\(Store\.get\(\)\):'login'/);
  assert.match(app,/UrlStateService\.navigate\(experienceHome\(state\)/);
  assert.match(layout,/state\.experienceProfile\?\.quickRoutes/);
  assert.match(layout,/data-experience-action="true"/);
  assert.doesNotMatch(layout,/data-route="cotizacion" type="button"><i class="fa-solid fa-plus"><\/i><span>Nueva operación/);
});
