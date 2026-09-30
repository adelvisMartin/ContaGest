import test from 'node:test';
import assert from 'node:assert/strict';
import { assertIanaTimezone, normalizeBusinessLocationCode, normalizeOptionalContact } from '../backend/src/modules/business-locations/business-location.policy.js';
test('normalizes stable location code and accepts IANA timezone',()=>{assert.equal(normalizeBusinessLocationCode(' ccs-01 '),'CCS-01');assert.equal(assertIanaTimezone('America/Caracas'),'America/Caracas');});
test('rejects invalid timezone and invalid code',()=>{assert.throws(()=>assertIanaTimezone('UTC-04:00'));assert.throws(()=>normalizeBusinessLocationCode('sede con espacios'));});
test('normalizes optional public contact',()=>{assert.equal(normalizeOptionalContact('  +58 212 555 0101  ',80),'+58 212 555 0101');assert.equal(normalizeOptionalContact('',80),null);});
