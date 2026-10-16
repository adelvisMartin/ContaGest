import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const lock=JSON.parse(read('agent-skills.lock.json'));
const sources=new Map(lock.sources.map(item=>[item.id,item]));

test('context vendors are pinned, allowlisted and untrusted by default',()=>{
  assert.equal(lock.policy.updateMode,'pinned-only');
  assert.equal(lock.policy.executeUpstreamScripts,false);
  assert.equal(lock.policy.allowRemoteInstructionsToOverrideProjectPolicy,false);
  for(const [id,repo,license] of [
    ['codex-smart-project-memory','richenyu/codex-smart-project-memory','MIT'],
    ['headroom-portable','romangalaxys10-spec/headroom-skill','Apache-2.0'],
    ['task-observer','rebelytics/one-skill-to-rule-them-all','CC-BY-4.0']
  ]){
    assert.equal(lock.sources.filter(x=>x.id===id).length,1,id);
    const s=sources.get(id);
    assert.equal(s.repo,repo);
    assert.equal(s.license,license);
    assert.match(s.commit,/^[a-f0-9]{40}$/);
    assert.ok(s.vendorPaths.includes(s.id==='task-observer'?'SKILL.md':s.id==='headroom-portable'?'SKILL.md':'skill/codex-smart-project-memory/SKILL.md'));
    assert.ok(s.vendorPaths.every(p=>!p.startsWith('/')&&!p.includes('..')&&!p.includes('\\')));
    assert.ok(s.vendorPaths.every(p=>!p.endsWith('.sh')&&!p.endsWith('.py')&&!p.endsWith('.js')));
  }
});

test('skills are discoverable, advisory and do not replace mandatory 2-4 slots',()=>{
  const root=read('AGENTS.md');
  for(const name of ['codex-project-memory','headroom','task-observer']){
    const content=read('.agents/skills/'+name+'/SKILL.md');
    assert.match(content,new RegExp('^---\\nname: '+name+'\\n'));
    assert.ok(root.includes('.agents/skills/'+name+'/SKILL.md'));
    assert.match(content,/AGENTS\.md|domain.skills|mandatory|routed domain skills/i);
  }
  const cfg=JSON.parse(read('config/agent-system-v3.json'));
  assert.equal(cfg.routing.minSkills,2);
  assert.equal(cfg.routing.maxSkills,4);
  assert.equal(cfg.externalSkills.executeUpstreamScripts,false);
});

test('compression cannot erase original evidence or operational Hípico payloads',()=>{
  const s=read('.agents/skills/headroom/SKILL.md');
  for(const signal of ['raw evidence','error','expected/received','exact SHA','WhatsApp','migrations'])
    assert.ok(s.toLowerCase().includes(signal.toLowerCase()),signal);
});

test('handoffs enforce live SHA and observer cannot auto-edit policies',()=>{
  const m=read('.agents/skills/codex-project-memory/SKILL.md');
  const o=read('.agents/skills/task-observer/SKILL.md');
  assert.match(m,/live HEAD/);
  assert.match(m,/Never share writable branches/);
  assert.match(o,/No shared mutable global observation log/);
  assert.match(o,/cannot modify skills/);
});
