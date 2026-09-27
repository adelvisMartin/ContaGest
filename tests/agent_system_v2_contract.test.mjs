import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const AGENT_IDS = [
  'orchestrator',
  'accounting',
  'backend-api',
  'dbre',
  'appsec-iam',
  'frontend-pwa-ux',
  'hipico-reliability',
  'qa-release',
];

const PROFILE_SECTIONS = [
  '## Purpose',
  '## Triggers',
  '## Reads',
  '## Owns',
  '## Does not own',
  '## Required invariants',
  '## Expected outputs',
  '## Escalation / stop conditions',
];

const SKILL_SECTIONS = [
  '## Trigger',
  '## Non-trigger',
  '## Authority',
  '## Source of truth',
  '## Graphify probes',
  '## Inputs',
  '## Invariants',
  '## Workflow',
  '## Negative tests',
  '## Stop conditions',
  '## Verification',
  '## Output schema',
  '## References',
];

test('all routed senior agents have compact persistent profiles', () => {
  for (const id of AGENT_IDS) {
    const file = `.agents/agents/${id}.md`;
    assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
    const body = read(file);
    assert.match(body, new RegExp(`^---[\\s\\S]*\\nid: ${id}\\n[\\s\\S]*---`, 'm'), `${id} must declare its stable id`);
    for (const section of PROFILE_SECTIONS) assert.ok(body.includes(section), `${id} missing ${section}`);
    assert.ok(body.length < 6500, `${id} profile is too large for cold-start progressive disclosure`);
  }
});

test('agent profile ids are unique and equal their filenames', () => {
  const ids = AGENT_IDS.map((id) => {
    const body = read(`.agents/agents/${id}.md`);
    return body.match(/^id:\s*([^\n]+)$/m)?.[1]?.trim();
  });
  assert.deepEqual(ids, AGENT_IDS);
  assert.equal(new Set(ids).size, ids.length);
});

test('every project-owned contagest skill implements Skill Contract v2', () => {
  const skillsRoot = path.join(root, '.agents/skills');
  const owned = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('contagest-'))
    .map((entry) => entry.name)
    .sort();
  assert.ok(owned.length >= 10, 'expected the project-owned ContaGest skill catalog');

  for (const id of owned) {
    const body = read(`.agents/skills/${id}/SKILL.md`);
    assert.match(body, /^---[\s\S]*?^name:\s*[^\n]+[\s\S]*?^description:\s*[^\n]+[\s\S]*?^contractVersion:\s*2\s*$[\s\S]*?^---$/m, `${id} missing v2 frontmatter`);
    for (const section of SKILL_SECTIONS) assert.ok(body.includes(section), `${id} missing ${section}`);
  }
});

test('external adapters are not silently reclassified as project-owned v2 skills', () => {
  for (const id of ['graphify', 'react-doctor']) {
    const body = read(`.agents/skills/${id}/SKILL.md`);
    assert.doesNotMatch(body, /^contractVersion:\s*2\s*$/m, `${id} must remain an external/pinned adapter`);
  }
});

test('agent-system validator exists as the canonical structural gate', () => {
  const file = path.join(root, 'scripts/verify-agent-system-v2.mjs');
  assert.equal(fs.existsSync(file), true, 'missing scripts/verify-agent-system-v2.mjs');
});
