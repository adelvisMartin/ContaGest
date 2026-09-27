import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot=resolve('..');
const file=resolve(repoRoot,'tests/hipico_pr268_integrated_contract.test.mjs');
const result=spawnSync(process.execPath,['--max-old-space-size=256','--test','--test-concurrency=1',file],{
  cwd:repoRoot,
  env:process.env,
  stdio:'inherit',
  shell:false,
  windowsHide:true
});
if(result.error||result.status!==0){
  console.error(`[hipico-runner-probe][FAIL] index=69 exit=${result.status??'null'} signal=${result.signal||'none'} spawn=${result.error?.message||'none'}`);
  process.exitCode=199;
}else{
  console.log('[hipico-runner-probe][PASS-PROBE-ONLY] index=69');
  process.exitCode=85;
}
