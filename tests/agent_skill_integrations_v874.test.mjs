import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const v3=await import('../scripts/agent-system-v3-lib.mjs');

const WRAPPERS=[
  'contagest-ui-ux-pro-max',
  'contagest-impeccable',
  'contagest-archify',
  'contagest-copywriting',
  'contagest-apple-design'
];

const EXPECTED_SOURCES={
  'ui-ux-pro-max':{
    repo:'nextlevelbuilder/ui-ux-pro-max-skill',
    commit:'09170eec67eefd46a7ae85de61b40c194020f997',
    license:'MIT',
    requiredPaths:['LICENSE','.claude/skills/ui-ux-pro-max/SKILL.md']
  },
  archify:{
    repo:'tt-a1i/archify',
    commit:'d5a1333d7447c866a765adac7d4d062f2f02e4d2',
    license:'MIT',
    requiredPaths:['LICENSE','archify/SKILL.md']
  },
  'marketing-copywriting':{
    repo:'coreyhaines31/marketingskills',
    commit:'5b2c0007766c6a1cf1d53fd8fc73e979e0821022',
    license:'MIT',
    requiredPaths:['LICENSE','skills/copywriting/SKILL.md']
  },
  'apple-design-skills':{
    repo:'s1gmamale1/apple-design-skills',
    commit:'8a3fbea8b561405e5719d682ebd1d14c952aecd7',
    license:'MIT',
    requiredPaths:[
      'LICENSE',
      'skills/apple-design/SKILL.md',
      'skills/apple-design-foundations/SKILL.md',
      'skills/apple-design-interaction/SKILL.md',
      'skills/apple-design-motion/SKILL.md',
      'skills/apple-design-tactics/SKILL.md'
    ]
  }
};

test('#874 pins only reviewed external sources and preserves unique Cloudflare/Impeccable authorities',()=>{
  const lock=readJson('agent-skills.lock.json');
  assert.equal(lock.policy.updateMode,'pinned-only');
  assert.equal(lock.policy.executeUpstreamScripts,false);
  assert.equal(lock.sources.filter((source)=>source.id==='cloudflare-security-audit').length,1);
  assert.equal(lock.sources.filter((source)=>source.id==='impeccable').length,1);
  const impeccable=lock.sources.find((source)=>source.id==='impeccable');
  assert.equal(impeccable.repo,'pbakaus/impeccable');
  assert.equal(impeccable.commit,'ddd23b1807c05f921c1f72780ef0e475f0d5d2bd');

  for(const [id,expected] of Object.entries(EXPECTED_SOURCES)){
    const matches=lock.sources.filter((source)=>source.id===id);
    assert.equal(matches.length,1,`${id} must have one source lock`);
    const source=matches[0];
    assert.equal(source.repo,expected.repo);
    assert.equal(source.commit,expected.commit);
    assert.equal(source.license,expected.license);
    for(const requiredPath of expected.requiredPaths) assert.ok(source.vendorPaths.includes(requiredPath),`${id} missing ${requiredPath}`);
  }
});

test('#874 exposes ACTIVE project-owned wrappers and still rejects an external ACTIVE contract',()=>{
  const registry=readJson('config/agent-skill-contracts-v3.json');
  const byId=new Map(registry.skills.map((skill)=>[skill.id,skill]));
  for(const id of WRAPPERS){
    const skill=byId.get(id);
    assert.ok(skill,`missing ${id}`);
    assert.equal(skill.status,'ACTIVE');
    assert.match(skill.provenance.kind,/^project-owned/);
    assert.doesNotThrow(()=>v3.validateSkillContract(skill));
    assert.ok(fs.existsSync(`.agents/skills/${id}/SKILL.md`),`missing wrapper file ${id}`);
  }
  assert.throws(()=>v3.validateSkillContract({
    id:'external-direct',status:'ACTIVE',purpose:'x',triggers:['x'],requiredInputs:['x'],authoritativeSources:['x'],prohibitedActions:['x'],expectedEvidence:['x'],minimumValidation:['SOURCE_REVIEW'],riskEscalation:'x',dependencies:[],provenance:{kind:'external-direct'}
  }),/UNSAFE_EXTERNAL_SKILL/);
});

test('#874 UI design uses UI/UX Pro Max only when a spare advisory slot exists',()=>{
  const p2=v3.routeTask({risk:'P2',type:'design',domains:['frontend-ui'],boundaries:['ui','browser']});
  assert.ok(p2.skills.includes('contagest-ui-audit'));
  assert.ok(p2.skills.includes('contagest-functional-module-audit'));
  assert.ok(p2.skills.includes('contagest-ui-ux-pro-max'));
  assert.ok(p2.skills.length<=4);

  const p1=v3.routeTask({risk:'P1',type:'design',domains:['frontend-ui'],boundaries:['ui','browser'],intents:['ui-polish']});
  for(const required of ['contagest-erp-orchestrator','contagest-release-evidence','contagest-ui-audit','contagest-functional-module-audit']) assert.ok(p1.skills.includes(required),`P1 displaced ${required}`);
  assert.equal(p1.skills.length,4);
  assert.equal(p1.skills.includes('contagest-impeccable'),false);
});

test('#874 explicit advisory intents are deterministic and do not crowd out core skills',()=>{
  const polish=v3.routeTask({risk:'P2',type:'feature',domains:['frontend-ui'],boundaries:['ui'],intents:['ui-polish']});
  assert.ok(polish.skills.includes('contagest-impeccable'));
  assert.ok(polish.skills.includes('contagest-ui-audit'));
  assert.ok(polish.skills.includes('contagest-functional-module-audit'));
  assert.equal(polish.skills.includes('contagest-ui-ux-pro-max'),false,'explicit polish wins the one advisory slot');

  const apple=v3.routeTask({risk:'P2',type:'audit',domains:['frontend-ui'],boundaries:['ui','browser'],intents:['apple-design-review']});
  assert.ok(apple.skills.includes('contagest-apple-design'));
  assert.ok(apple.skills.includes('contagest-ui-audit'));
  assert.ok(apple.skills.includes('contagest-functional-module-audit'));
  assert.equal(apple.skills.includes('contagest-ui-ux-pro-max'),false,'explicit Apple review wins the advisory slot');
  assert.ok(apple.skills.length<=4);

  const p1Apple=v3.routeTask({risk:'P1',type:'audit',domains:['frontend-ui'],boundaries:['ui','browser'],intents:['apple-design-review']});
  for(const required of ['contagest-erp-orchestrator','contagest-release-evidence','contagest-ui-audit','contagest-functional-module-audit']) assert.ok(p1Apple.skills.includes(required),`P1 Apple review displaced ${required}`);
  assert.equal(p1Apple.skills.includes('contagest-apple-design'),false,'advisory Apple review must not displace P1 core skills');

  const arch=v3.routeTask({risk:'P2',type:'design',domains:['architecture'],boundaries:['api'],intents:['architecture-diagram']});
  assert.ok(arch.skills.includes('contagest-archify'));
  assert.ok(arch.skills.includes('contagest-erp-orchestrator'));

  const copy=v3.routeTask({risk:'P2',type:'feature',domains:['frontend-ui'],boundaries:['ui'],intents:['copywriting']});
  assert.ok(copy.skills.includes('contagest-copywriting'));
  assert.ok(copy.skills.includes('contagest-ui-audit'));
  assert.ok(copy.skills.length<=4);

  assert.throws(()=>v3.routeTask({risk:'P2',type:'feature',domains:['frontend-ui'],boundaries:['ui'],intents:['typo-intent']}),/AGENT_ROUTE_AMBIGUOUS unsupported intent typo-intent/);
});

test('#874 CLI forwards explicit intents and existing provider semantics stay unchanged',()=>{
  const gates=fs.readFileSync('scripts/agent-gate-router.mjs','utf8');
  assert.match(gates,/--intent/);
  assert.match(gates,/intents/);
  const policy=readJson('config/agent-system-v3.json');
  assert.equal(policy.providerPolicy.REMOTE_CI_BLOCKED_PLAN,'BLOCKED');
  assert.equal(policy.providerPolicy.REMOTE_DEPLOY_BLOCKED_PLAN,'BLOCKED');
});

await import('./agent_ticket_automation_skills_v1.test.mjs');
