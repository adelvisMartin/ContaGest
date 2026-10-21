import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditErpParityMatrix as audit} from '../scripts/audit-erp-parity-gap-v708.mjs';
const baseline=JSON.parse(readFileSync(new URL('../config/erp-parity-gap-ownership-v708.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(baseline);
test('#708 ten canonical ERP gaps have real source-path or missing evidence',()=>{
 assert.deepEqual(audit(baseline),[]);assert.equal(baseline.rows.length,10);
});
test('#708 cannot claim production E2E PASS from file paths',()=>{
 const c=clone();c.releaseEvidence='PASS';assert.match(audit(c).join(';'),/PARITY_FALSE_AUTHORITY/);
 c.releaseEvidence='NOT_EXECUTED';c.assessment='PRODUCTION_DONE';assert.match(audit(c).join(';'),/PARITY_FALSE_AUTHORITY/);
});
test('#708 known source must actually exist, arbitrary paths cannot be invented',()=>{
 const c=clone();c.rows[0].evidencePath='backend/src/modules/nonexistent/quote.routes.ts';
 assert.match(audit(c).join(';'),/PARITY_SOURCE_EVIDENCE_MISSING/);
 c.rows[0].evidencePath='../../etc/passwd';
 assert.match(audit(c).join(';'),/PARITY_SOURCE_EVIDENCE_MISSING/);
});
test('#708 a missing verification cannot be upgraded without real evidence',()=>{
 const c=clone();c.rows.at(-1).classification='PARTIAL';
 assert.match(audit(c).join(';'),/PARITY_SOURCE_EVIDENCE_MISSING/);
});
test('#708 duplicate feature names and invented issue owners are rejected',()=>{
 const c=clone();c.rows[1].key=c.rows[0].key;
 assert.match(audit(c).join(';'),/PARITY_KEY_INVALID/);
 const d=clone();d.rows[1].issue=9999;
 assert.match(audit(d).join(';'),/PARITY_UNVERIFIED_GAP/);
});
test('#708 third-party source copy is never an acceptable shortcut',()=>{
 const c=clone();c.sourceReuse='COPY';
 assert.match(audit(c).join(';'),/PARITY_FALSE_AUTHORITY/);
});
