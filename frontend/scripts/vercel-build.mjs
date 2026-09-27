import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot=resolve('..');
const file=resolve(repoRoot,'tests/hipico_epic_102_implementation_handoff.test.mjs');
const patterns=[
  'EPIC #102 implementation inventory is materially present',
  'implementation handoff never masquerades as release verification',
  'production boundaries remain fail-closed after implementation phase',
  'QA execution gates have concrete harnesses before handoff'
];

for(let index=0;index<patterns.length;index+=1){
  const pattern=patterns[index];
  const result=spawnSync(process.execPath,[
    '--max-old-space-size=256',
    '--test',
    '--test-concurrency=1',
    `--test-name-pattern=${pattern}`,
    file
  ],{
    cwd:repoRoot,
    env:process.env,
    encoding:'utf8',
    maxBuffer:2*1024*1024,
    stdio:['ignore','pipe','pipe'],
    shell:false,
    windowsHide:true
  });
  if(result.error||result.status!==0){
    console.error(`[hipico-subtest-probe][FAIL] subtest=${index+1} exit=${result.status??'null'} signal=${result.signal||'none'} spawn=${result.error?.message||'none'}`);
    if(result.stdout)process.stdout.write(result.stdout);
    if(result.stderr)process.stderr.write(result.stderr);
    process.exitCode=171+index;
    break;
  }
  console.log(`[hipico-subtest-probe][PASS] subtest=${index+1}`);
}
if(!process.exitCode){
  console.log('[hipico-subtest-probe][PASS-PROBE-ONLY] index=35');
  process.exitCode=87;
}
