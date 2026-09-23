import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const candidateSha=String(process.env.CANDIDATE_SHA||'').trim();
if(!/^[a-f0-9]{40}$/i.test(candidateSha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');

function runCapture(command,args,{cwd=root,env={}}={}){
  const started=Date.now();
  const result=spawnSync(command,args,{cwd,env:{...process.env,...env},encoding:'utf8',shell:false});
  const stdout=String(result.stdout||'');
  const stderr=String(result.stderr||'');
  if(stdout)process.stdout.write(stdout);
  if(stderr)process.stderr.write(stderr);
  return {
    exitCode:result.status,
    error:result.error?.message||null,
    stdout,
    stderr,
    durationMs:Date.now()-started
  };
}

const gitHead=runCapture('git',['rev-parse','HEAD']);
if(gitHead.error||gitHead.exitCode!==0)throw new Error('GIT_HEAD_UNAVAILABLE');
const actualSha=gitHead.stdout.trim();
if(actualSha!==candidateSha)throw new Error(`CANDIDATE_SHA_MISMATCH expected=${candidateSha} actual=${actualSha}`);

const statusBefore=runCapture('git',['status','--porcelain']);
if(statusBefore.error||statusBefore.exitCode!==0)throw new Error('GIT_STATUS_UNAVAILABLE');
if(statusBefore.stdout.trim())throw new Error('RELEASE_WORKTREE_MUST_START_CLEAN');

const outDir=path.join(root,'artifacts','release','erp-v5151',candidateSha);
fs.mkdirSync(outDir,{recursive:true});

const npm=process.platform==='win32'?'npm.cmd':'npm';
const gates=[
  {id:'repo.diff-check',command:'git',args:['diff','--check']},
  {id:'repo.skills',command:npm,args:['run','skills:check']},
  {id:'repo.typecheck',command:npm,args:['run','typecheck']},
  {id:'repo.tests',command:npm,args:['test']},
  {id:'repo.build',command:npm,args:['run','build']},
  {id:'repo.bundle-budget',command:npm,args:['run','check:bundle']},
  {id:'repo.dependency-audit',command:npm,args:['run','audit:prod']},
  {id:'postgres.prerequisites',command:'psql',args:['-h','127.0.0.1','-U','postgres','-d','contagest_release_5151','-v','ON_ERROR_STOP=1','-f','ops/database/prepare-supabase-ephemeral.sql'],env:{PGPASSWORD:'postgres'}},
  {id:'postgres.migrations',command:npm,args:['--workspace','backend','run','prisma:deploy']},
  {id:'postgres.seed',command:npm,args:['run','seed']},
  {id:'postgres.persistence',command:npm,args:['run','test:backend:persistence:real']},
  {id:'postgres.financial',command:npm,args:['run','test:backend:financial:real']},
  {id:'postgres.verticals',command:npm,args:['run','test:backend:verticals:real']},
  {id:'browser.core-58x5',command:npm,args:['run','test:browser:58:core']},
  {id:'browser.accessibility',command:npm,args:['run','qa:a11y']}
];

const results=[];
for(const gate of gates){
  process.stdout.write(`\n=== ${gate.id} ===\n`);
  const result=runCapture(gate.command,gate.args,{env:gate.env||{}});
  let status='PASS';
  if(result.error)status='BLOCKED';
  else if(result.exitCode!==0)status='FAIL';
  const logFile=path.join(outDir,`${gate.id.replace(/[^a-z0-9._-]/gi,'_')}.log`);
  fs.writeFileSync(logFile,`$ ${gate.command} ${gate.args.join(' ')}\n\n${result.stdout}\n${result.stderr}\n`);
  results.push({
    id:gate.id,
    status,
    exitCode:result.exitCode,
    durationMs:result.durationMs,
    error:result.error,
    log:path.relative(root,logFile)
  });
}

const failed=results.filter((item)=>item.status==='FAIL');
const blocked=results.filter((item)=>item.status==='BLOCKED');
const verdict=failed.length?'FAIL':blocked.length?'BLOCKED':'READY_FOR_RELEASE_REVIEW';
const report={
  schema:'contagest-erp-release-candidate.v5151',
  candidateSha,
  actualSha,
  generatedAt:new Date().toISOString(),
  verdict,
  gates:results,
  counts:{
    PASS:results.filter((item)=>item.status==='PASS').length,
    FAIL:failed.length,
    BLOCKED:blocked.length
  },
  invariants:{
    exactSha:true,
    cleanWorktreeAtStart:true,
    allRequiredGatesExecuted:results.length===gates.length,
    evidenceBoundToCandidate:true
  }
};
fs.writeFileSync(path.join(outDir,'release-candidate.json'),JSON.stringify(report,null,2)+'\n');

const markdown=[
  '# ERP release candidate 51/51',
  '',
  `Candidate SHA: \`${candidateSha}\``,
  '',
  `Verdict: **${verdict}**`,
  '',
  '| Gate | Estado | Exit |',
  '| --- | --- | ---: |',
  ...results.map((item)=>`| ${item.id} | ${item.status} | ${item.exitCode??'-'} |`),
  '',
  'READY_FOR_RELEASE_REVIEW no equivale a producción desplegada. Requiere revisar gobernanza remota, artifacts y cualquier evidencia externa aplicable.'
].join('\n');
fs.writeFileSync(path.join(outDir,'release-candidate.md'),markdown+'\n');

process.stdout.write(`\nERP 51/51 verdict: ${verdict}\nEvidence: ${outDir}\n`);
if(verdict!=='READY_FOR_RELEASE_REVIEW')process.exitCode=1;
