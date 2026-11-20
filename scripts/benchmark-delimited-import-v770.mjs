import { performance } from 'node:perf_hooks';
import { parseDelimitedImport } from '../frontend/src/services/delimitedImportParser.mjs';

// Reproducible local benchmark only. Not a CI latency threshold or browser claim.
// node scripts/benchmark-delimited-import-v770.mjs
const header='sku,name,category,min,costUsd,priceUsd,barcode,description';
const records=Array.from({length:5000},(_,i)=>
  [i,'Product'+i,'test',10,25.44,29.45,i,'Repeated description '+('x'.repeat(450))].join(',')
);
const input=header+'\n'+records.join('\n');
const times=[];
for(let i=0;i<30;i++){
  const start=performance.now();
  const parsed=parseDelimitedImport(input);
  if(parsed.length!==5000)throw new Error('BENCH_ROWS_MISMATCH');
  times.push(performance.now()-start);
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({
  node:process.version,utf8Bytes:Buffer.byteLength(input),rows:5000,columns:8,
  iterations:times.length,p50_ms:Number(times[14].toFixed(2)),
  p95_ms:Number(times[28].toFixed(2)),max_ms:Number(times[29].toFixed(2))
},null,2));
