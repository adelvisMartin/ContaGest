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
