import { spawnSync } from 'node:child_process';
import { discoverHipicoRootContracts, REPO_ROOT } from './hipico-root-contracts.mjs';

const from=Number(process.argv[2]||0);
const to=Number(process.argv[3]||Number.MAX_SAFE_INTEGER);
const all=discoverHipicoRootContracts(REPO_ROOT);
const files=all.slice(from,to);
console.log(JSON.stringify({from,to,total:all.length,count:files.length,first:files[0]||null,last:files.at(-1)||null},null,2));
if(!files.length)process.exit(2);
const result=spawnSync(process.execPath,['--test','--test-concurrency=4',...files],{
  cwd:REPO_ROOT,env:process.env,stdio:'inherit',shell:false,windowsHide:true
});
if(result.error){console.error(result.error);process.exit(2);}
process.exit(Number.isInteger(result.status)?result.status:2);
