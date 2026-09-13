#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root=process.cwd();
const manifest=JSON.parse(await fs.readFile(path.join(root,'tools','archify','manifest.json'),'utf8'));
const archifyDir=path.resolve(root,manifest.installDir);
const cli=path.join(archifyDir,'bin','archify.mjs');
const diagrams=[
  ['architecture','docs/hipico/architecture/control-hipico-runtime.architecture.json','docs/hipico/architecture/generated/control-hipico-runtime.html'],
  ['dataflow','docs/hipico/architecture/control-hipico-document-ingestion.dataflow.json','docs/hipico/architecture/generated/control-hipico-document-ingestion.html'],
  ['workflow','docs/hipico/architecture/control-hipico-release-gates.workflow.json','docs/hipico/architecture/generated/control-hipico-release-gates.html']
];

function run(command,args,{cwd=root,capture=false}={}){
  const result=spawnSync(command,args,{cwd,encoding:capture?'utf8':undefined,stdio:capture?['ignore','pipe','pipe']:'inherit',shell:false,windowsHide:true,env:{...process.env,ARCHIFY_UPDATE_CHECK_DISABLED:'1'}});
  if(result.error)throw result.error;
  if(result.status!==0){const detail=capture?String(result.stderr||result.stdout||'').slice(0,2000):'';throw new Error(`ARCHIFY_DOCTOR_COMMAND_FAILED status=${result.status} ${detail}`);}
  return capture?String(result.stdout||'').trim():'';
}

const head=run('git',['rev-parse','HEAD'],{cwd:archifyDir,capture:true});
if(head!==manifest.commit)throw new Error(`ARCHIFY_SHA_MISMATCH expected=${manifest.commit} actual=${head}`);
run(process.execPath,[cli,'doctor']);
await fs.mkdir(path.join(root,'docs','hipico','architecture','generated'),{recursive:true});
for(const[type,source,output]of diagrams){
  const sourcePath=path.resolve(root,source),outputPath=path.resolve(root,output);
  await fs.access(sourcePath);
  run(process.execPath,[cli,'validate',type,sourcePath,'--quality','standard','--json']);
  run(process.execPath,[cli,'deliver',type,sourcePath,outputPath,'--quality','standard','--json']);
  const stat=await fs.stat(outputPath);if(stat.size<1000)throw new Error(`ARCHIFY_OUTPUT_TOO_SMALL ${output}`);
  console.log(`[hipico-archify] PASS type=${type} output=${output} bytes=${stat.size}`);
}
