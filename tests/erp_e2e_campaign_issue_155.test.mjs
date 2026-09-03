import assert from 'node:assert/strict';
import test from 'node:test';
import { ERP_E2E_ROUTES_V155, ERP_E2E_STATES_V155, ERP_E2E_ROLES_V155, ERP_E2E_VIEWPORTS_V155, buildErpE2EMatrixV155, caseIdentityV155 } from '../qa/support/erp-e2e-matrix-v155.mjs';

test('catalog has exactly 58 unique ERP routes',()=>{
  assert.equal(ERP_E2E_ROUTES_V155.length,58);
  assert.equal(new Set(ERP_E2E_ROUTES_V155.map((item)=>item.route)).size,58);
});

test('required viewports cover 360 390 430 768 1366 1920 and phone landscape',()=>{
  assert.deepEqual(ERP_E2E_VIEWPORTS_V155.map((v)=>[v.width,v.height]),[[360,800],[390,844],[430,932],[768,1024],[1366,768],[1920,1080],[800,360],[844,390],[932,430]]);
});

test('matrix covers every route critical-flow state role and viewport exactly once',()=>{
  const matrix=buildErpE2EMatrixV155();
  const expected=ERP_E2E_ROUTES_V155.reduce((sum,route)=>sum+route.criticalFlows.length*ERP_E2E_STATES_V155.length*ERP_E2E_ROLES_V155.length*ERP_E2E_VIEWPORTS_V155.length,0);
  assert.equal(matrix.length,expected);
  for(const route of ERP_E2E_ROUTES_V155){
    for(const criticalFlow of route.criticalFlows){
      for(const state of ERP_E2E_STATES_V155){
        for(const role of ERP_E2E_ROLES_V155){
          for(const viewport of ERP_E2E_VIEWPORTS_V155){
            const matches=matrix.filter((item)=>item.route===route.route&&item.criticalFlow===criticalFlow&&item.state===state&&item.role===role&&item.viewport===viewport.name);
            assert.equal(matches.length,1,`${route.route}/${criticalFlow}/${state}/${role}/${viewport.name}`);
            assert.equal(matches[0].width,viewport.width);assert.equal(matches[0].height,viewport.height);assert.equal(matches[0].orientation,viewport.orientation);
          }
        }
      }
    }
  }
});

test('critical flow and viewport are both part of evidence identity',()=>{
  const matrix=buildErpE2EMatrixV155();
  const identities=new Set(matrix.map(caseIdentityV155));
  assert.equal(identities.size,matrix.length);
  assert.equal(matrix.some((item)=>!item.viewport||!item.criticalFlow),false);
});

test('critical financial routes are in matrix',()=>{
  const routes=new Set(ERP_E2E_ROUTES_V155.map((item)=>item.route));
  for(const route of ['ventas','compras','inventario','bancos','contabilidad','nomina','tributos','cierre-contable'])assert.equal(routes.has(route),true,route);
});
