import test from 'node:test';
import assert from 'node:assert/strict';
import {camtDateField} from '../backend/src/modules/bank-reconciliation/camt-date-fields.mjs';
const entry='<Ntry><BookgDt><Dt>2026-11-10</Dt></BookgDt><ValDt><Dt>2026-11-12</Dt></ValDt></Ntry>';
test('#743 CAMT booking and value dates retain independent provenance',()=>{
 assert.equal(camtDateField(entry,'BookgDt'),'2026-11-10');
 assert.equal(camtDateField(entry,'ValDt'),'2026-11-12');
});
test('#743 CAMT qualified namespace and datetime are supported',()=>{
 const input='<c:Ntry><c:BookgDt><c:DtTm>2026-11-10T10:30:00Z</c:DtTm></c:BookgDt></c:Ntry>';
 assert.equal(camtDateField(input,'BookgDt'),'2026-11-10T10:30:00Z');
 assert.equal(camtDateField(input,'ValDt'),'');
});
test('#743 reject malformed or ambiguous nested dates rather than guessing',()=>{
 assert.throws(()=>camtDateField('<BookgDt><Dt>2026-11-11</Dt>', 'BookgDt'), /MALFORMED/);
 assert.throws(()=>camtDateField('<ValDt><Bad>wrong</Bad></ValDt>', 'ValDt'), /MALFORMED/);
 assert.throws(()=>camtDateField(entry,'Amt'),/FIELD_INVALID/);
});
