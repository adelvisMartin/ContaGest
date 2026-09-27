import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot=resolve('..');
const file=resolve(repoRoot,'tests/hipico_backend_env_contract_305.test.mjs');
const result=spawnSync(process.execPath,['--max-old-space-size=256','--test','--test-concurrency=1',file],{
  cwd:repoRoot,env:process.env,encoding:'utf8',maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true
});
if(result.error||result.status!==0){
  console.error(`[hipico-single-probe][FAIL] index=7 exit=${result.status??'null'} signal=${result.signal||'none'} spawn=${result.error?.message||'none'}`);
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  process.exitCode=137;
}else{
  console.log('[hipico-single-probe][PASS-PROBE-ONLY] index=7');
  process.exitCode=96;
}
