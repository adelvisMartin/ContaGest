import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fail = (message) => { console.error(`AGENT_SYSTEM_V2_FAIL ${message}`); process.exitCode = 1; };
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const requiredProfiles = ['orchestrator','accounting','backend-api','dbre','appsec-iam','frontend-pwa-ux','hipico-reliability','qa-release'];
const profileSections = ['## Purpose','## Triggers','## Reads','## Owns','## Does not own','## Required invariants','## Expected outputs','## Escalation / stop conditions'];
const skillSections = ['## Trigger','## Non-trigger','## Authority','## Source of truth','## Graphify probes','## Inputs','## Invariants','## Workflow','## Negative tests','## Stop conditions','## Verification','## Output schema','## References'];

for (const id of requiredProfiles) {
  const relative = `.agents/agents/${id}.md`;
  if (!fs.existsSync(path.join(root, relative))) { fail(`missing profile ${relative}`); continue; }
  const body = read(relative);
  if (!new RegExp(`^id:\\s*${id}\\s*$`, 'm').test(body)) fail(`profile id mismatch ${relative}`);
  for (const section of profileSections) if (!body.includes(section)) fail(`${relative} missing ${section}`);
  if (body.length >= 6500) fail(`${relative} exceeds cold-start size budget`);
}

const skillsRoot = path.join(root, '.agents/skills');
const owned = fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('contagest-')).map((e) => e.name).sort();
if (owned.length < 10) fail('project-owned skill catalog unexpectedly small');
for (const id of owned) {
  const relative = `.agents/skills/${id}/SKILL.md`;
  const body = read(relative);
  if (!/^---[\s\S]*?^name:\s*[^\n]+[\s\S]*?^description:\s*[^\n]+[\s\S]*?^contractVersion:\s*2\s*$[\s\S]*?^---$/m.test(body)) fail(`${id} missing Skill Contract v2 frontmatter`);
  for (const section of skillSections) if (!body.includes(section)) fail(`${id} missing ${section}`);
}
for (const external of ['graphify','react-doctor']) {
  const body = read(`.agents/skills/${external}/SKILL.md`);
  if (/^contractVersion:\s*2\s*$/m.test(body)) fail(`${external} must remain external/pinned, not project-owned v2`);
}

if (!process.exitCode) console.log(`AGENT_SYSTEM_V2_PASS profiles=${requiredProfiles.length} ownedSkills=${owned.length}`);
