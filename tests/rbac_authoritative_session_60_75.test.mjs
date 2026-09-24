import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { canSessionAccessRoute } from '../frontend/src/services/sessionAccessGuard.js';

const source=fs.readFileSync('frontend/src/services/sessionAccessGuard.js','utf8');

const staff=(permissions=[])=>({
  source:'session',
  sessionMode:'cookie',
  role:'staff',
  permissions,
  audience:'staff',
  license:null,
  isClient:false,
  isAdmin:permissions.includes('*')||permissions.includes('admin.manage')
});

const client=(overrides={})=>({
  source:'session',
  sessionMode:'cookie',
  role:'client',
  permissions:['dashboard.view','sales.manage'],
  audience:'client',
  license:{status:'active',modules:['dashboard','ventas'],expiresAt:new Date(Date.now()+60_000).toISOString()},
  isClient:true,
  isAdmin:false,
  ...overrides
});

test('60/75 authenticated UI access is decided from backend session permissions, not local RBAC state',()=>{
  assert.equal(canSessionAccessRoute(staff(['dashboard.view']),'dashboard'),true);
  assert.equal(canSessionAccessRoute(staff(['dashboard.view']),'ventas'),false);
  assert.equal(canSessionAccessRoute(staff(['sales.manage']),'ventas'),true);
  assert.equal(canSessionAccessRoute(staff([]),'dashboard'),false);
  assert.match(source,/if \(identity\) \{[\s\S]*return canSessionAccessRoute\(identity, route\);[\s\S]*\}/);
  assert.doesNotMatch(source,/session\+profile-fallback/);
});

test('60/75 backend admin permission remains authoritative without demo user promotion',()=>{
  assert.equal(canSessionAccessRoute(staff(['admin.manage']),'ventas'),true);
  assert.equal(canSessionAccessRoute(staff(['admin.manage']),'admin'),true);
});

test('60/75 client session requires both backend permission and active session license',()=>{
  assert.equal(canSessionAccessRoute(client(),'ventas'),true);
  assert.equal(canSessionAccessRoute(client(),'inventario'),false);
  assert.equal(canSessionAccessRoute(client({permissions:['dashboard.view']}),'ventas'),false);
  assert.equal(canSessionAccessRoute(client({license:{status:'expired',modules:['dashboard','ventas']}}),'ventas'),false);
  assert.equal(canSessionAccessRoute(client({license:null}),'dashboard'),false);
});

test('60/75 unknown routes fail closed for authenticated sessions',()=>{
  assert.equal(canSessionAccessRoute(staff(['*']),'not-a-real-route'),false);
});
