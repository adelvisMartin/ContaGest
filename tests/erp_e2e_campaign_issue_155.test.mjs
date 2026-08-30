import assert from 'node:assert/strict';
import test from 'node:test';
import { ERP_E2E_ROUTES_V155, ERP_E2E_STATES_V155, ERP_E2E_ROLES_V155, ERP_E2E_VIEWPORTS_V155, buildErpE2EMatrixV155 } from '../qa/support/erp-e2e-matrix-v155.mjs';

test('catalog has exactly 58 unique ERP routes',()=>{
  assert.equal(ERP_E2E_ROUTES_V155.length,58);
  assert.equal(new Set(ERP_E2E_ROUTES_V155.map((item)=>item.route)).size,58);
});

test('required viewports include 390 tablet and desktop',()=>{
  assert.deepEqual(ERP_E2E_VIEWPORTS_V155.map((v)=>[v.width,v.height]),[[390,844],[768,1024],[1440,900]]);
});

test('matrix covers every route state and role',()=>{
  const matrix=buildErpE2EMatrixV155();
  assert.equal(matrix.length,58*ERP_E2E_STATES_V155.length*ERP_E2E_ROLES_V155.length);
  for(const route of ERP_E2E_ROUTES_V155){
    for(const state of ERP_E2E_STATES_V155){
      for(const role of ERP_E2E_ROLES_V155){
        assert.equal(matrix.filter((item)=>item.route===route.route&&item.state===state&&item.role===role).length,1,`${route.route}/${state}/${role}`);
      }
    }
  }
});

test('critical financial routes are in matrix',()=>{
  const routes=new Set(ERP_E2E_ROUTES_V155.map((item)=>item.route));
  for(const route of ['ventas','compras','inventario','bancos','contabilidad','nomina','tributos','cierre-contable'])assert.equal(routes.has(route),true,route);
});
