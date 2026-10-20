import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ALLOWED=new Set(['PARTIAL','NOT_VERIFIED','NOT_APPLICABLE']);
const ISSUE_IDS=new Set([753,757,755,743,744,759,770,771,765,745]);
const PATH=/^backend\/src\/modules\/[a-z0-9_-]+(?:\/[a-z0-9._-]+)+$/;
export function auditErpParityMatrix(input,opts={}){
 const errors=[];
 if(!input||typeof input!=='object'||Array.isArray(input))
   return ['PARITY_INPUT_INVALID'];
 if(input.schemaVersion!==1||input.ownerIssue!==708||
    input.assessment!=='SOURCE_SNAPSHOT_NOT_E2E'||
    input.sourceReuse!=='NONE'||input.releaseEvidence!=='NOT_EXECUTED')
   errors.push('PARITY_FALSE_AUTHORITY');
 if(typeof input.baselineSha!=='string'||!/^[a-f0-9]{40}$/.test(input.baselineSha))
   errors.push('PARITY_BASELINE_INVALID');
 if(input.benchmarkSource!=='config/competitive-benchmark-v764.json')
   errors.push('PARITY_BENCHMARK_AUTHORITY_INVALID');
 if(!Array.isArray(input.rows)||input.rows.length!==10)errors.push('PARITY_GAP_COVERAGE_INVALID');
 const seen=new Set();
 for(const row of input.rows||[]){
   if(!row||typeof row!=='object'||Array.isArray(row)){errors.push('PARITY_ROW_INVALID');continue;}
   if(typeof row.key!=='string'||!(/^[a-z][a-z0-9_]{2,40}$/.test(row.key))||seen.has(row.key))
     errors.push('PARITY_KEY_INVALID');
   seen.add(row.key);
   if(!ISSUE_IDS.has(row.issue)||!ALLOWED.has(row.classification)||typeof row.name!=='string'||!row.name||
      typeof row.gap!=='string'||row.gap.length<12)
     errors.push('PARITY_UNVERIFIED_GAP');
   if(row.classification==='PARTIAL'){
     if(typeof row.evidencePath!=='string'||!PATH.test(row.evidencePath)||
       !existsSync(resolve(ROOT,row.evidencePath)))
       errors.push('PARITY_SOURCE_EVIDENCE_MISSING');
   }else if(row.evidencePath!==null){
     errors.push('PARITY_UNVERIFIED_SOURCE_CLAIM');
   }
 }
 return errors;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=JSON.parse(readFileSync(resolve(ROOT,'config/erp-parity-gap-ownership-v708.json'),'utf8'));
 const errors=auditErpParityMatrix(input);
 if(errors.length){for(const e of errors)console.error(e);process.exitCode=1;}
 else console.log('PARITY_SOURCE_CATALOG_VALID: code presence, NOT functional E2E certification');
}
