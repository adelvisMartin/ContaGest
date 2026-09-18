import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const manifestPath=path.join(root,'docs','baselines','contagest-technical-baseline-v1.json');
const EXPECTED_BASELINE='9566d77ad51e6eccc51d95fa76c65487a1b08821';
const EXPECTED_REQUESTED='ab02c550f24c3347121d8c74c636b450245036ac';
const EXPECTED_MANIFEST_BLOB='4930d62497f30d350adbd2dc5312ee882189b007';

const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>{console.error(`[baseline:v1][FAIL] ${message}`);process.exitCode=1;};
const gitBlobSha=(content)=>{
  const body=Buffer.from(content,'utf8');
  return crypto.createHash('sha1').update(Buffer.from(`blob ${body.length}\0`,'utf8')).update(body).digest('hex');
};
const fullSha=(value)=>/^[0-9a-f]{40}$/i.test(String(value||''));

if(!fs.existsSync(manifestPath)){
  fail('missing technical baseline manifest');
} else {
  const raw=fs.readFileSync(manifestPath,'utf8');
  const manifest=JSON.parse(raw);

  if(gitBlobSha(raw)!==EXPECTED_MANIFEST_BLOB) fail('frozen manifest bytes changed; create an explicit baseline v2 instead of mutating v1');
  if(manifest.baselineSourceSha!==EXPECTED_BASELINE) fail(`baselineSourceSha drift: ${manifest.baselineSourceSha}`);
  if(manifest.requestedAuditSha!==EXPECTED_REQUESTED) fail(`requestedAuditSha drift: ${manifest.requestedAuditSha}`);
  if(manifest.roadmapItem!=='1/51') fail(`roadmap item drift: ${manifest.roadmapItem}`);
  if(manifest.routeCatalog?.expectedCount!==58||manifest.routeCatalog?.routes?.length!==58) fail('frozen route catalog must contain exactly 58 routes');

  const endpointCount=Object.values(manifest.endpoints?.bySource||{}).reduce((sum,routes)=>sum+(Array.isArray(routes)?routes.length:0),0);
  if(endpointCount!==61) fail(`frozen endpoint inventory must contain 61 endpoints, got ${endpointCount}`);

  const blobRefs=[];
  const collectBlob=(value)=>{
    if(Array.isArray(value)){for(const item of value)collectBlob(item);return;}
    if(!value||typeof value!=='object')return;
    if(Object.hasOwn(value,'blobSha'))blobRefs.push(value.blobSha);
    for(const child of Object.values(value))collectBlob(child);
  };
  collectBlob(manifest);
  if(blobRefs.length===0||blobRefs.some((value)=>!fullSha(value))) fail('frozen source references must use full Git blob SHAs');

  const evidenceArg=process.argv.findIndex((value)=>value==='--evidence');
  if(evidenceArg>=0){
    const relative=process.argv[evidenceArg+1];
    if(!relative) fail('--evidence requires a JSON path');
    else {
      const evidence=JSON.parse(read(relative));
      if(evidence.baselineSha!==EXPECTED_BASELINE) fail(`evidence baselineSha must be ${EXPECTED_BASELINE}`);
      if(!fullSha(evidence.candidateSha)) fail('evidence candidateSha must be a full 40-char SHA');
      if(evidence.candidateSha!==evidence.testedSha) fail('candidateSha and testedSha must match exactly');
    }
  }

  if(!process.exitCode) console.log(`[baseline:v1][PASS] immutable manifest ${EXPECTED_MANIFEST_BLOB} · baseline ${EXPECTED_BASELINE} · 58 routes · 61 endpoints`);
}
