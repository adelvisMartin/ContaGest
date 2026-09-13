#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const VERSION='0.2.4';
const PACKAGE=`@firecrawl/anydoc@${VERSION}`;
const ROOT=path.resolve(process.cwd(),'.tools','hipico-anydoc');
const BIN=path.join(ROOT,'node_modules','.bin',process.platform==='win32'?'anydoc.cmd':'anydoc');

function run(command,args,options={}){
  const result=spawnSync(command,args,{stdio:'inherit',shell:false,windowsHide:true,...options});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`HIPICO_ANYDOC_INSTALL_COMMAND_FAILED:${command}:${result.status}`);
}
function capture(command,args){
  const result=spawnSync(command,args,{encoding:'utf8',shell:false,windowsHide:true,timeout:5000});
  if(result.error||result.status!==0)return'';
  return String(result.stdout||'').trim();
}

if(Number(process.versions.node.split('.')[0])<20)throw new Error('HIPICO_ANYDOC_NODE_VERSION_UNSUPPORTED');
await fs.mkdir(ROOT,{recursive:true,mode:0o700});
const packageJson={private:true,name:'contagest-hipico-anydoc-toolchain',version:'0.0.0',description:'Pinned local toolchain for Control Hipico document extraction'};
await fs.writeFile(path.join(ROOT,'package.json'),`${JSON.stringify(packageJson,null,2)}\n`,{encoding:'utf8',mode:0o600});
const npm=process.platform==='win32'?'npm.cmd':'npm';
run(npm,['install','--no-audit','--no-fund','--ignore-scripts=false','--save-exact',PACKAGE],{cwd:ROOT});
const detected=capture(BIN,['--version']);
if(detected!==VERSION)throw new Error(`HIPICO_ANYDOC_VERSION_MISMATCH expected=${VERSION} actual=${detected||'unavailable'}`);
console.log(`[hipico-anydoc] READY version=${detected} bin=${BIN}`);
