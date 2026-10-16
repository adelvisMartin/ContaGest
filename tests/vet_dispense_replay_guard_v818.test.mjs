import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/verticals/veterinary-inventory.routes.ts',import.meta.url),'utf8');
const route=source.split("router.post('/clinical-inventory/consume',")[1].split('export default router')[0];
test('#818 effect identity remains tenant + prescription + clinical act',()=>{
 assert.match(route,/const sourceId=\`\$\{body\.prescriptionId\}:\$\{body\.clinicalActId\}\`/);
 assert.match(route,/veterinary-prescription:\$\{sourceId\}/);
 assert.match(route,/where:\{tenantId,source:'veterinary-prescription',sourceId\}/);
});
test('#818 conflicting lot reuse cannot receive a fake success response',()=>{
 assert.match(route,/if\(existing\.lotId!==body\.lotId \|\| compare\(existing\.quantity,body\.quantity\)!==0\)/);
 assert.match(route,/VETERINARY_DISPENSE_IDEMPOTENCY_CONFLICT/);
 assert.match(route,/throw new HttpError\(409/);
});
test('#818 same lot+quantity replay remains no-write path',()=>{
 const position=route.indexOf('if(existing){'),replayed=route.indexOf('return {movement:existing,replayed:true}'),effect=route.indexOf('applyInventoryStandardEffect');
 assert.ok(position>=0&&replayed>position&&effect>replayed);
 assert.match(route,/if\(!result\.replayed\)\{/);
});
test('#818 stock and prescription safety guards remain after conflict check',()=>{
 assert.match(route,/prescription\.status!=='active'/);
 assert.match(route,/lockInventoryProduct\(tx,tenantId,prescription\.productId\)/);
 assert.match(route,/lockInventoryLot\(tx,tenantId,product\.id,body\.lotId\)/);
 assert.match(route,/INVENTORY_LOT_EXPIRED/);
 assert.match(route,/INVENTORY_LOT_INSUFFICIENT_STOCK/);
});
test('#818 exact-decimal compare and permission are not bypassed',()=>{
 assert.match(source,/import \{ compare, serializeDecimal, ZERO \}/);
 assert.match(route,/requirePermission\('inventory\.manage'\)/);
 assert.doesNotMatch(route,/Number\(existing\.quantity\)/);
});
