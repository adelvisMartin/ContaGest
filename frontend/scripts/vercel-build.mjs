import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const RANGE_START=18;
const RANGE_END=35;
const PASS_MARKER=89;
const repoRoot=resolve('..');
const testsDir=resolve(repoRoot,'tests');
const files=readdirSync(testsDir).filter((name)=>/^hipico.*\.test\.mjs$/i.test(name)).sort();
for(let index=RANGE_START;index<Math.min(RANGE_END,files.length);index+=1){
  const file=files[index];
  const result=spawnSync(process.execPath,['--max-old-space-size=256','--test','--test-concurrency=1',resolve(testsDir,file)],{
    cwd:repoRoot,env:process.env,encoding:'utf8',maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true
  });
  if(result.error||result.status!==0){
    console.error(`[hipico-bisect][FAIL] index=${index} file=${file} exit=${result.status??'null'} signal=${result.signal||'none'} spawn=${result.error?.message||'none'}`);
    if(result.stdout)process.stdout.write(result.stdout);
    if(result.stderr)process.stderr.write(result.stderr);
    process.exitCode=Math.min(250,130+index);break;
  }
  console.log(`[hipico-bisect][PASS] index=${index} file=${file}`);
}
if(!process.exitCode)process.exitCode=PASS_MARKER;
