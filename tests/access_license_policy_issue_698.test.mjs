import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FUTURE='2099-01-01T00:00:00.000Z';
const PAST='2000-01-01T00:00:00.000Z';
const NOW=new Date('2026-09-29T19:10:00.000Z');

const policy=await import('../frontend/src/services/routeAccessPolicy.js');

const decide=(overrides={})=>policy.canAccessRouteWithLicensePolicy({
  state:overrides.state??{},
  route:overrides.route??'ventas',
  session:overrides.session??{audience:'client'},
  canAccessByRole:overrides.canAccessByRole??(()=>true),
  now:overrides.now??NOW,
});

test('#698 core routes remain accessible for client sessions even with an expired license after RBAC allows',()=>{
  assert.equal(decide({route:'dashboard',state:{activeLicense:{status:'expired',expiresAt:PAST,modules:[]}}}),true);
});

test('#698 RBAC denial remains final for normal client sessions',()=>{
  assert.equal(decide({state:{activeLicense:{status:'active',expiresAt:FUTURE,modules:['ventas']}},canAccessByRole:()=>false}),false);
});

test('#698 active normal client license requires route membership outside core',()=>{
  const license={status:'active',expiresAt:FUTURE,modules:['ventas']};
  assert.equal(decide({route:'ventas',state:{activeLicense:license}}),true);
  assert.equal(decide({route:'compras',state:{activeLicense:license}}),false);
});

test('#698 expired client license denies non-core routes',()=>{
  assert.equal(decide({route:'ventas',state:{activeLicense:{status:'active',expiresAt:PAST,modules:['ventas']}}}),false);
});

test('#698 QA client keeps historical license-module bypass semantics while requiring active valid license',()=>{
  const qa={status:'active',expiresAt:FUTURE,qaMode:true,modules:['ventas']};
  assert.equal(decide({route:'ventas',state:{activeLicense:qa},canAccessByRole:()=>false}),true);
  assert.equal(decide({route:'compras',state:{activeLicense:qa},canAccessByRole:()=>true}),false);
  assert.equal(decide({route:'dashboard',state:{activeLicense:qa},canAccessByRole:()=>false}),true);
  assert.equal(decide({route:'ventas',state:{activeLicense:{...qa,expiresAt:PAST}},canAccessByRole:()=>true}),false);
});

test('#698 staff/non-client sessions preserve RBAC and ignore client license restrictions',()=>{
  const state={activeLicense:{status:'expired',expiresAt:PAST,modules:[]}};
  assert.equal(decide({route:'ventas',state,session:{audience:'staff'},canAccessByRole:()=>true}),true);
  assert.equal(decide({route:'ventas',state,session:{audience:'staff'},canAccessByRole:()=>false}),false);
});

test('#698 composition root no longer monkey-patches AccessControlService',()=>{
  const app=fs.readFileSync('frontend/src/app.js','utf8');
  assert.doesNotMatch(app,/AccessControlService\.canAccessRoute\s*=/);
  assert.match(app,/canAccessRouteWithLicensePolicy/);
  assert.match(app,/const canAccessRoute=/);
});

test('#698 policy boundary remains presentation/client-side only and does not become server authorization',()=>{
  const source=fs.readFileSync('frontend/src/services/routeAccessPolicy.js','utf8');
  assert.doesNotMatch(source,/BackendApi|fetch\(|Prisma|tenantId\s*=|permission\s*=/);
  assert.match(source,/canAccessByRole/);
});

test('#1362: reissuing a license cannot silently overwrite an existing account password or status',()=>{
  const routes=fs.readFileSync('backend/src/modules/licenses/licenses.routes.ts','utf8');
  assert.match(routes,/const user = existingUser \|\| await tx\.userProfile\.create/);
  assert.doesNotMatch(routes,/tx\.userProfile\.update\(\{[\s\S]*?passwordHash/);
  assert.match(routes,/temporaryPassword: issuedPassword/);
  assert.match(routes,/const issuedPassword=createdUser\?temporaryPassword:null/);
});

test('#1362: reused account receives a clear license-only UX, never a fake temporary password',()=>{
  const page=fs.readFileSync('frontend/src/pages/LicensesPage.js','utf8');
  assert.match(page,/hasTemporaryPassword/);
  assert.match(page,/Cuenta existente: conserva su contraseña actual/);
  assert.match(page,/Contraseña sin cambios/);
  assert.match(page,/La cuenta existente conserva su contraseña/);
});

test('#1362 one-time licence secrets never enter scoped browser persistence or exported state',async()=>{
  const {stripSensitivePersistedState}=await import('../frontend/src/state/persistedStatePolicy.js');
  const snapshot={
    profile:{id:'staff-test'},
    healthVertical:{secretClinicalData:'must-not-persist'},
    licenseCredentials:{licenseKey:'CG-RAW-SECRET',temporaryPassword:'TEMP-SECRET'},
    licenses:[
      {id:'new-license',licenseKey:'CG-RAW-SECRET',temporaryPassword:'TEMP-SECRET',
       credentials:{licenseKey:'CG-RAW-SECRET'},keyPreview:'CG-••••'},
      {id:'previous',keyPreview:'PREVIEW'}
    ]
  };
  const durable=stripSensitivePersistedState(snapshot);
  assert.equal('healthVertical' in durable,false);
  assert.equal('licenseCredentials' in durable,false);
  assert.deepEqual(durable.licenses,[
    {id:'new-license',keyPreview:'CG-••••'},
    {id:'previous',keyPreview:'PREVIEW'}
  ]);
  assert.equal(snapshot.licenses[0].licenseKey,'CG-RAW-SECRET',
    'Sanitizing persistence cannot destroy the one-time in-memory UI state');
  const stored=JSON.stringify(durable);
  assert.doesNotMatch(stored,/CG-RAW-SECRET|TEMP-SECRET|secretClinicalData/);
});

test('#1362 every Store persistence/export boundary uses the secret-free projection',()=>{
  const store=fs.readFileSync('frontend/src/state/store.js','utf8');
  const page=fs.readFileSync('frontend/src/pages/LicensesPage.js','utf8');
  assert.match(store,/import \{ stripSensitivePersistedState \} from '\.\/persistedStatePolicy\.js'/);
  assert.match(store,/return stripSensitivePersistedState\(snapshot\)/);
  assert.match(store,/JSON\.stringify\(withoutClinicalCache\(state\)\)/);
  assert.match(store,/JSON\.stringify\(withoutClinicalCache\(state\), null, 2\)/);
  assert.match(page,/credentials:_oneTime, \.\.\.licenseSummary/);
  assert.match(page,/draft\.licenses=\[licenseSummary,/);
});
