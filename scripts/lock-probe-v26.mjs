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
const chunkSize=30000;
const chunks=[];
for(let offset=0,index=0;offset<base64.length;offset+=chunkSize,index+=1){
  const name=`chunk-${String(index).padStart(3,'0')}.txt`;
  const value=base64.slice(offset,offset+chunkSize);
  chunks.push({name,length:value.length});
  const dir=path.join(root,'frontend','public','__lock_probe');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,name),value,'utf8');
}
const manifest={sha256,bytes:raw.length,base64Bytes:base64.length,chunks,exceljs:spec};
fs.writeFileSync(path.join(root,'frontend','public','__lock_probe','manifest.json'),JSON.stringify(manifest,null,2),'utf8');
console.log(`[lock-probe] sha256=${sha256} bytes=${raw.length} chunks=${chunks.length} exceljs=${spec}`);
