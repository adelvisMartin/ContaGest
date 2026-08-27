import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd().endsWith(`${path.sep}frontend`)?path.resolve(process.cwd(),'..'):process.cwd();
const lockPath=path.join(root,'package-lock.json');
const raw=fs.readFileSync(lockPath);
const parsed=JSON.parse(raw.toString('utf8'));
const spec=parsed?.packages?.backend?.dependencies?.exceljs;
if(spec!=='npm:@excel.js/exceljs@0.15.0'){
  throw new Error(`lock probe esperaba alias mantenido y obtuvo ${String(spec)}`);
}
const sha256=crypto.createHash('sha256').update(raw).digest('hex');
const base64=raw.toString('base64');
const chunkSize=24000;
const chunks=[];
for(let offset=0,index=0;offset<base64.length;offset+=chunkSize,index+=1){
  const value=base64.slice(offset,offset+chunkSize);
  chunks.push(value);
  console.log(`CG_LOCK_V26_CHUNK_${String(index).padStart(3,'0')}=${value}`);
}
console.log(`CG_LOCK_V26_MANIFEST=${JSON.stringify({sha256,bytes:raw.length,base64Bytes:base64.length,chunks:chunks.length,exceljs:spec})}`);
