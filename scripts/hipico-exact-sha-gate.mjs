import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const SHA40=/^[0-9a-f]{40}$/i;

function git(args,cwd=process.cwd()){
  try{return execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true}).trim();}
  catch{return'';}
}

export function evaluateExactCandidate({sha,dirty=false,expectedSha=''}){
  const candidate=String(sha||'').trim().toLowerCase();
  const expected=String(expectedSha||'').trim().toLowerCase();
  if(!SHA40.test(candidate))return{ok:false,reason:'HIPICO_CANDIDATE_SHA_UNAVAILABLE',candidate,expected};
  if(dirty)return{ok:false,reason:'HIPICO_CANDIDATE_WORKTREE_DIRTY',candidate,expected};
  if(expected&&!SHA40.test(expected))return{ok:false,reason:'HIPICO_EXPECTED_SHA_INVALID',candidate,expected};
  if(expected&&candidate!==expected)return{ok:false,reason:'HIPICO_CANDIDATE_SHA_MISMATCH',candidate,expected};
  return{ok:true,reason:null,candidate,expected:expected||null};
}

export function inspectExactCandidate(cwd=process.cwd(),env=process.env){
  const sha=git(['rev-parse','HEAD'],cwd);
  const status=git(['status','--porcelain=v1'],cwd);
  const branch=git(['branch','--show-current'],cwd)||'DETACHED';
  const expectedSha=String(env.HIPICO_CANDIDATE_SHA||'').trim();
  return{
    ...evaluateExactCandidate({sha,dirty:Boolean(status),expectedSha}),
    branch,
    dirty:Boolean(status),
    dirtyEntryCount:status?status.split(/\r?\n/).filter(Boolean).length:0
  };
}

const isMain=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isMain){
  const result=inspectExactCandidate();
  if(!result.ok){
    console.error(`[hipico-exact-sha] FAIL ${result.reason} candidate=${result.candidate||'UNKNOWN'} expected=${result.expected||'NONE'} dirty=${result.dirtyEntryCount}`);
    process.exitCode=1;
  }else{
    console.log(`[hipico-exact-sha] PASS ${result.candidate} branch=${result.branch}`);
  }
}
