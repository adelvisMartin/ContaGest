import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=process.cwd();
const manifestPath=path.join(root,'docs','baselines','contagest-technical-baseline-v1.json');
const EXPECTED_BASELINE='9566d77ad51e6eccc51d95fa76c65487a1b08821';
const EXPECTED_REQUESTED='ab02c550f24c3347121d8c74c636b450245036ac';

const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>{console.error(`[baseline:v1][FAIL] ${message}`);process.exitCode=1;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

if(!fs.existsSync(manifestPath)){
  fail('missing technical baseline manifest');
} else {
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(manifest.baselineSourceSha!==EXPECTED_BASELINE) fail(`baselineSourceSha drift: ${manifest.baselineSourceSha}`);
  if(manifest.requestedAuditSha!==EXPECTED_REQUESTED) fail(`requestedAuditSha drift: ${manifest.requestedAuditSha}`);
  if(manifest.routeCatalog?.expectedCount!==58) fail('route count contract must remain 58 until baseline is explicitly superseded');

  const registryPath=path.join(root,'frontend','src','data','pageRegistry.js');
  const {PAGE_ROUTES}=await import(`${pathToFileURL(registryPath).href}?baseline=${Date.now()}`);
  if(PAGE_ROUTES.length!==manifest.routeCatalog.expectedCount) fail(`pageRegistry count drift: ${PAGE_ROUTES.length}`);
  if(!same([...PAGE_ROUTES],[...manifest.routeCatalog.routes])) fail('pageRegistry route/order drift from frozen manifest');

  const routesOf=(relative)=>[...read(relative).matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)]
    .map((match)=>`${match[1].toUpperCase()} ${match[2]}`);

  for(const [relative,expected] of Object.entries(manifest.endpoints.bySource||{})){
    if(!fs.existsSync(path.join(root,relative))){fail(`missing endpoint owner: ${relative}`);continue;}
    const actual=routesOf(relative);
    if(!same(actual,expected)) fail(`endpoint drift in ${relative}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  const evidenceArg=process.argv.findIndex((value)=>value==='--evidence');
  if(evidenceArg>=0){
    const relative=process.argv[evidenceArg+1];
    if(!relative) fail('--evidence requires a JSON path');
    else {
      const evidence=JSON.parse(read(relative));
      if(evidence.baselineSha!==EXPECTED_BASELINE) fail(`evidence baselineSha must be ${EXPECTED_BASELINE}`);
      if(!/^[0-9a-f]{40}$/i.test(String(evidence.candidateSha||''))) fail('evidence candidateSha must be a full 40-char SHA');
      if(evidence.candidateSha!==evidence.testedSha) fail('candidateSha and testedSha must match exactly');
    }
  }

  if(!process.exitCode) console.log(`[baseline:v1][PASS] ${EXPECTED_BASELINE} · ${PAGE_ROUTES.length} routes · endpoint authorities frozen`);
}
