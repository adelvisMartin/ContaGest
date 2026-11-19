import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeTask, getActiveSkillContracts } from '../scripts/agent-system-v3-lib.mjs';
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));

test('Hallmark and Emil Motion sources are immutable, reviewed documentation', () => {
 const l=json('agent-skills.lock.json');
 assert.equal(l.policy.updateMode,'pinned-only');assert.equal(l.policy.executeUpstreamScripts,false);
 assert.equal(l.policy.allowRemoteInstructionsToOverrideProjectPolicy,false);
 const h=l.sources.find(x=>x.id==='hallmark');assert.equal(h.repo,'Nutlope/hallmark');
 assert.equal(h.commit,'04977e15f3dfd6ee4b74c887dac3eb52665d6c92');assert.equal(h.license,'MIT');
 for(const p of ['LICENSE','skills/hallmark/SKILL.md','skills/hallmark/references/patterns.md'])assert.ok(h.vendorPaths.includes(p),p);
 assert.ok(h.vendorPaths.every(p=>p==='LICENSE'||p.endsWith('.md')));
 const m=l.sources.find(x=>x.id==='emil-motion');assert.equal(m.repo,'emilkowalski/skills');
 for(const p of ['skills/animation-vocabulary/SKILL.md','skills/animate/SKILL.md','skills/review-animations/SKILL.md','skills/find-animation-opportunities/SKILL.md'])assert.ok(m.vendorPaths.includes(p));
});

test('Hallmark and Motion only enter P2 advisory slots; P1 required skills stay intact', () => {
 const active=new Map(getActiveSkillContracts().map(x=>[x.id,x]));
 for(const id of ['contagest-hallmark','contagest-motion']){assert.ok(active.has(id));assert.match(read('.agents/skills/'+id+'/SKILL.md'),/## Verification/);}
 assert.equal(active.get('contagest-hallmark').provenance.sourceLock,'hallmark');
 for(const [intent,id] of [['hallmark-audit','contagest-hallmark'],['motion-review','contagest-motion']]){
  const args={type:'audit',domains:['frontend-ui'],boundaries:['ui','browser'],intents:[intent]};
  const p2=routeTask({...args,risk:'P2'});assert.ok(p2.skills.includes(id));assert.ok(p2.skills.includes('contagest-ui-audit'));assert.ok(p2.skills.includes('contagest-functional-module-audit'));assert.ok(p2.skills.length<=4);
  const p1=routeTask({...args,risk:'P1'});assert.ok(!p1.skills.includes(id));
  for(const required of ['contagest-erp-orchestrator','contagest-release-evidence','contagest-ui-audit','contagest-functional-module-audit'])assert.ok(p1.skills.includes(required),required);
 }
});

test('both-product QA wires PostgreSQL, PR Chromium and Hípico cross-browser exact SHA', () => {
 const pr=read('.github/workflows/pr-quality-gate-v1.yml');
 const erp=read('.github/workflows/qa-browser.yml');
 const hipico=read('.github/workflows/hipico-browser-matrix.yml');
 const foundation=read('.github/workflows/hipico-qa-foundation-v103.yml');
 for(const r of [/postgres:16-alpine/,/prisma:deploy/,/test:backend:persistence:real/,/test:browser:a11y/,/Upload Playwright evidence by SHA/])assert.match(pr,r);
 assert.match(erp,/pull_request:/);assert.match(erp,/test:browser/);
 for(const r of [/pull_request:/,/schedule:/,/project: chromium/,/project: firefox/,/project: webkit/,/HIPICO_CANDIDATE_SHA/,/git rev-parse HEAD/])assert.match(hipico,r);
 assert.match(foundation,/pull_request:/);assert.match(foundation,/npm run qa:hipico/);
});
