import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync('frontend/src/pages/GymManagementPage.jsx','utf8');
const component=readFileSync('frontend/src/components/fitness/GymEquipmentPanel.jsx','utf8');
const client=readFileSync('frontend/src/services/verticalService.js','utf8');
const router=readFileSync('backend/src/modules/verticals/gym.routes.ts','utf8');
const api=readFileSync('backend/src/modules/verticals/gym-equipment.routes.ts','utf8');
const sql=readFileSync('backend/prisma/migrations/20261117050500_gym_equipment_work_orders_v799/migration.sql','utf8');

test('#799 Gym equipment tab has routed backend and real CRUD client',()=>{
  assert.match(page,/equipment:panelEquipment/);
  assert.match(page,/\['equipment','Equipos'\]/);
  assert.match(router,/router\.use\(equipmentRoutes\)/);
  for(const method of ['equipment(filters={})','createEquipment(payload)','equipmentWorkOrders(id)',
    'createEquipmentWorkOrder(id,payload)','transitionEquipmentWorkOrder(id,payload)'])
    assert.ok(client.includes(method),method);
});
test('#799 UI has actual submission/transition, useful states and session isolation',()=>{
  for(const token of ['addEquipment(event)','addOrder(event)','transition(order,toStatus)',
    'Consultando equipos','No se pudo completar','Operación guardada',
    'disabled={busy','cg:pwa-session-changed','requestVersion','sessionScope()'])
    assert.ok(component.includes(token),token);
  assert.doesNotMatch(component,/innerHTML|querySelector|<style|waitForTimeout/);
});
test('#799 equipment uses canonical tenant FK, RLS and durable event log',()=>{
  for(const key of ['FOREIGN KEY ("tenantId","locationId")',
    'FOREIGN KEY ("tenantId","equipmentId")',
    'FOREIGN KEY ("tenantId","workOrderId")',
    'GymEquipmentWorkOrderEvent_tenant_key_unique',
    'private.current_tenant_id()'])
    assert.ok(sql.includes(key),key);
  assert.match(api,/pg_advisory_xact_lock/);
  assert.match(api,/FOR UPDATE/);
  assert.match(api,/requirePermission\('gym.manage'\)/);
  assert.doesNotMatch(api,/INSERT INTO public\."GymPayment"|UPDATE public\."Product"/);
});
