#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const repoRoot=process.cwd();
const manifest=JSON.parse(await fs.readFile(path.join(repoRoot,'tools','archify','manifest.json'),'utf8'));
const target=path.resolve(repoRoot,manifest.installDir);
const repair=process.argv.includes('--repair');

function run(command,args,{cwd=repoRoot,capture=false}={}){
  const result=spawnSync(command,args,{cwd,encoding:capture?'utf8':undefined,stdio:capture?['ignore','pipe','pipe']:'inherit',shell:false,windowsHide:true,env:{...process.env,ARCHIFY_UPDATE_CHECK_DISABLED:'1'}});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`ARCHIFY_COMMAND_FAILED ${command} ${args.join(' ')} status=${result.status}`);
  return capture?String(result.stdout||'').trim():'';
}

async function exists(file){try{await fs.access(file);return true;}catch{return false;}}
if(await exists(target)){
  const gitDir=path.join(target,'.git');
  if(!(await exists(gitDir))){
    if(!repair)throw new Error(`ARCHIFY_INSTALL_DIR_NOT_GIT ${target}; rerun with --repair`);
    await fs.rm(target,{recursive:true,force:true});
  }
}
if(!(await exists(target))){
  await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
  run('git',['clone','--filter=blob:none','--no-checkout',manifest.repository,target]);
}
const origin=run('git',['remote','get-url','origin'],{cwd:target,capture:true});
if(origin!==manifest.repository)throw new Error(`ARCHIFY_ORIGIN_MISMATCH expected=${manifest.repository} actual=${origin}`);
run('git',['fetch','--depth','1','origin',manifest.commit],{cwd:target});
run('git',['checkout','--detach',manifest.commit],{cwd:target});
const head=run('git',['rev-parse','HEAD'],{cwd:target,capture:true});
if(head!==manifest.commit)throw new Error(`ARCHIFY_SHA_MISMATCH expected=${manifest.commit} actual=${head}`);
run(process.execPath,['bin/archify.mjs','doctor'],{cwd:target});
console.log(`[hipico-archify] READY tag=${manifest.tag} sha=${head} dir=${target}`);
