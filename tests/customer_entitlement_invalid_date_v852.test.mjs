import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/entitlements/customer-entitlement.service.ts',import.meta.url),'utf8');
test('#852 grant rejects invalid/non-finite Date within domain service',()=>{
 const grant=source.split('export async function grantCustomerRight(')[1]?.split('export async function readCustomerRights(')[0];
 assert.ok(grant);
 assert.match(grant,/input\.validFrom instanceof Date/);
 assert.match(grant,/input\.validUntil instanceof Date/);
 assert.match(grant,/Number\.isFinite\(input\.validFrom\.getTime\(\)\)/);
 assert.match(grant,/Number\.isFinite\(input\.validUntil\.getTime\(\)\)/);
 const at=grant.indexOf('Number.isFinite');
 const transaction=grant.indexOf('return prisma.$transaction');
 assert.ok(at>0&&transaction>at,'domain rejects malformed dates before SQL or locks');
});
