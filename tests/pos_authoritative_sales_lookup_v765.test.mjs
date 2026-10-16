import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acceptServerPosProduct, normalizePosLookupCode } from '../frontend/src/services/posProductLookup.mjs';

const uuid='a5b468dc-347d-416a-80a7-8184e657db61';
test('allows valid exact barcode or SKU input and preserves zero prefixes',()=>{assert.equal(normalizePosLookupCode(' 000123 '),'000123');});
test('rejects invalid scanner input locally',()=>{for(const x of [null,{},'A B','<script>','A'.repeat(65)])assert.equal(normalizePosLookupCode(x),null);});
test('accepts server-owned identity, including alias lookup not in sku/barcode',()=>{
 const result=acceptServerPosProduct({id:uuid.toUpperCase(),sku:'SKU-001',barcode:'',name:'Producto',unit:'UND',stock:25,price:'5'});
 assert.equal(result.kind,'found');assert.deepEqual(result.product,{id:uuid,sku:'SKU-001',barcode:'',name:'Producto'});
});
test('returns immutable, stripped product identity',()=>{const result=acceptServerPosProduct({id:uuid,sku:'A',name:'A'});assert.equal(Object.isFrozen(result.product),true);});
test('rejects malformed server identities fail-closed',()=>{for(const value of [null,[],{}, {id:'x',sku:'A',name:'A'},{id:uuid,sku:'',name:'A'},{id:uuid,sku:'A',name:''},{id:uuid,sku:'A',name:'A',barcode:32}])assert.equal(acceptServerPosProduct(value).kind,'invalid_catalog');});
const source=readFileSync(new URL('../frontend/src/pages/SalesPage.jsx',import.meta.url),'utf8');
test('Sales uses the authenticated exact backend lookup, not client list',()=>{assert.match(source,/BackendApi\.get\(\x60\/sales\/pos\/product-lookup\?code=/);assert.doesNotMatch(source,/BackendApi\.list\('products'\)/);});
test('Sales encodes code and validates exact result before adding',()=>{assert.match(source,/encodeURIComponent\(code\)/);assert.match(source,/acceptServerPosProduct\(resolved\)/);assert.match(source,/if\(decision\.kind!=='found'\)/);assert.match(source,/addPosCartItem\(posCartRef\.current,decision\.product\.id\)/);});
test('Sales distinguishes 404 409 400 with safe errors',()=>{assert.match(source,/status===404/);assert.match(source,/status===409/);assert.match(source,/status===400/);});
test('Sales refuses to commit an in-flight result from another tenant',()=>{assert.match(source,/tenantAtStart!==BackendApi\.tenantId \|\| posTenantRef\.current!==tenantAtStart/);});
test('no direct sale, stock, tax, ledger or money mutation from lookup',()=>{const part=source.slice(source.indexOf('async function addPosDraftProduct'),source.indexOf('function commitPosDraftCart'));assert.doesNotMatch(part,/createSale\(|createMovement\(|postPosPayment\(|calculateInvoiceTotals\(/);});
