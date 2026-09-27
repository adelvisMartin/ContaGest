import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const RANGE_START=31;
const RANGE_END=62;
const PASS_MARKER=81;
const repoRoot=resolve('..');
const testsDir=resolve(repoRoot,'tests');
const files=readdirSync(testsDir)
  .filter((name)=>/^hipico.*\.test\.mjs$/i.test(name))
  .sort();

console.log(`[hipico-oom-probe] range=${RANGE_START}:${RANGE_END} total=${files.length}`);
for(let index=RANGE_START;index<Math.min(RANGE_END,files.length);index+=1){
  const file=files[index];
  console.log(`[hipico-oom-probe][START] index=${index} file=${file}`);
  const result=spawnSync(process.execPath,['--max-old-space-size=256',resolve(testsDir,file)],{
    cwd:repoRoot,
    env:process.env,
    stdio:'inherit',
    shell:false,
    windowsHide:true
  });
  if(result.error||result.status!==0){
    console.error(`[hipico-oom-probe][FAIL] index=${index} file=${file} exit=${result.status??'null'} signal=${result.signal||'none'} spawn=${result.error?.message||'none'}`);
    process.exitCode=Math.min(250,130+index);
    break;
  }
}
if(!process.exitCode){
  console.log(`[hipico-oom-probe][PASS-PROBE-ONLY] range=${RANGE_START}:${RANGE_END}`);
  process.exitCode=PASS_MARKER;
}
