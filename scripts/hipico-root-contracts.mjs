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
    .sort((left,right)=>left.localeCompare(right));
}

function concurrency(){
  const raw=Number(process.env.HIPICO_ROOT_TEST_CONCURRENCY||4);
  if(!Number.isFinite(raw))return 4;
  return Math.max(1,Math.min(8,Math.trunc(raw)));
}

export function runHipicoRootContracts(root=REPO_ROOT){
  const files=discoverHipicoRootContracts(root);
  if(!files.length){
    console.error('[hipico-root-contracts] FAIL: no root Hípico contract tests discovered.');
    return 2;
  }
  console.log(`[hipico-root-contracts] ${files.length} files · concurrency=${concurrency()}`);
  for(const file of files)console.log(` - ${relative(root,resolve(root,file)).replaceAll('\\','/')}`);
  const result=spawnSync(process.execPath,[
    '--test',
    `--test-concurrency=${concurrency()}`,
    ...files
  ],{
    cwd:root,
    env:process.env,
    stdio:'inherit',
    windowsHide:true,
    shell:false
  });
  if(result.error){
    console.error(`[hipico-root-contracts] FAIL: ${result.error.message}`);
    return 2;
  }
  return Number.isInteger(result.status)?result.status:2;
}

const isMain=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isMain)process.exitCode=runHipicoRootContracts();
