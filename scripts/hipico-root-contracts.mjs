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

function diagnosticExit(index){
  return Math.min(229,130+index);
}

export function runHipicoRootContracts(root=REPO_ROOT){
  const files=discoverHipicoRootContracts(root);
  if(!files.length){
    console.error('[hipico-root-contracts] FAIL: no root Hípico contract tests discovered.');
    return 2;
  }
  const isolated=process.env.VERCEL==='1'||process.env.VERCEL==='true';
  console.log(`[hipico-root-contracts] ${files.length} files · concurrency=${concurrency()} · isolated=${isolated}`);
  for(const file of files)console.log(` - ${relative(root,resolve(root,file)).replaceAll('\\','/')}`);

  const batches=isolated?files.map((file)=>[file]):[files];
  for(let index=0;index<batches.length;index+=1){
    const batch=batches[index];
    if(isolated)console.log(`[hipico-root-contracts] batch=${index+1}/${batches.length} file=${batch[0]}`);
    const result=spawnSync(process.execPath,[
      '--test',
      `--test-concurrency=${concurrency()}`,
      ...batch
    ],{
      cwd:root,
      env:process.env,
      stdio:'inherit',
      windowsHide:true,
      shell:false
    });
    if(result.error){
      console.error(`[hipico-root-contracts] FAIL: file=${batch[0]} spawn=${result.error.message}`);
      return isolated?diagnosticExit(index):2;
    }
    if(result.status!==0){
      console.error(`[hipico-root-contracts] FAIL: file=${batch[0]} exit=${result.status ?? 'null'} signal=${result.signal || 'none'}`);
      return isolated?diagnosticExit(index):(Number.isInteger(result.status)?result.status:2);
    }
  }
  return 0;
}

const isMain=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isMain)process.exitCode=runHipicoRootContracts();
