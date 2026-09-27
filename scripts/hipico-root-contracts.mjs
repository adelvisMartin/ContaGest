import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_FILE=fileURLToPath(import.meta.url);
export const REPO_ROOT=resolve(dirname(THIS_FILE),'..');

export function discoverHipicoRootContracts(root=REPO_ROOT){
  const testsDir=join(root,'tests');
  if(!existsSync(testsDir))return[];
  return readdirSync(testsDir,{withFileTypes:true})
    .filter((entry)=>entry.isFile()&&/^hipico.*\.test\.mjs$/i.test(entry.name))
    .map((entry)=>join('tests',entry.name))
    .sort();
}

function concurrency(){
  const raw=Number(process.env.HIPICO_ROOT_TEST_CONCURRENCY||4);
  if(!Number.isFinite(raw))return 4;
  return Math.max(1,Math.min(8,Math.trunc(raw)));
}

function vercelHeapLimitMb(){
  const raw=Number(process.env.HIPICO_ROOT_TEST_HEAP_MB||256);
  if(!Number.isFinite(raw))return 256;
  return Math.max(128,Math.min(1024,Math.trunc(raw)));
}

export function buildHipicoTestArgs(batch,{isolated=false,heapLimitMb=256,effectiveConcurrency=4}={}){
  if(isolated)return[
    `--max-old-space-size=${heapLimitMb}`,
    ...batch
  ];
  return[
    '--test',
    `--test-concurrency=${effectiveConcurrency}`,
    ...batch
  ];
}

export function runHipicoRootContracts(root=REPO_ROOT){
  const files=discoverHipicoRootContracts(root);
  if(!files.length){
    console.error('[hipico-root-contracts] FAIL: no root Hípico contract tests discovered.');
    return 2;
  }

  const isolated=process.env.VERCEL==='1'||process.env.VERCEL==='true';
  const heapLimitMb=vercelHeapLimitMb();
  const effectiveConcurrency=isolated?1:concurrency();
  const batches=isolated?files.map((file)=>[file]):[files];

  console.log(`[hipico-root-contracts] ${files.length} files · concurrency=${effectiveConcurrency} · isolated=${isolated}${isolated?` · heapMb=${heapLimitMb}`:''}`);
  for(const file of files)console.log(` - ${relative(root,resolve(root,file)).replaceAll('\\','/')}`);

  for(let index=0;index<batches.length;index+=1){
    const batch=batches[index];
    const result=spawnSync(process.execPath,buildHipicoTestArgs(batch,{
      isolated,
      heapLimitMb,
      effectiveConcurrency
    }),{
      cwd:root,
      env:process.env,
      stdio:'inherit',
      windowsHide:true,
      shell:false
    });
    if(result.error){
      console.error(`[hipico-root-contracts] FAIL: file=${batch[0]||'aggregate'} spawn=${result.error.message}`);
      return isolated?Math.min(250,130+index):2;
    }
    if(result.status!==0){
      console.error(`[hipico-root-contracts] FAIL: file=${batch[0]||'aggregate'} exit=${result.status ?? 'null'} signal=${result.signal||'none'}`);
      return isolated?Math.min(250,130+index):(Number.isInteger(result.status)?result.status:2);
    }
  }
  return 0;
}

const isMain=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isMain)process.exitCode=runHipicoRootContracts();
