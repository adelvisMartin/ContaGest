import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const sources = {
  ponytail: ['DietrichGebert/ponytail', '84740e3d344b69b4a133201fa519eb37a62a2b2a', 'skills/ponytail/SKILL.md'],
  omniroute: ['diegosouzapw/OmniRoute', 'fc5e2bccd4f70fecf5aab94dfb8136c74ab5a21b', 'skills/omni-resilience/SKILL.md'],
  'addy-osmani-engineering': ['addyosmani/agent-skills', 'aeac41d4d005999432bb7312f7ff06383a91d59d', 'skills/code-review-and-quality/SKILL.md']
};
const wrappers = {
  ponytail: 'contagest-ponytail',
  omniroute: 'contagest-omniroute',
  'addy-osmani-engineering': 'contagest-addy-engineering'
};

test('#974 sources are pinned, inert, MIT and allowlisted to documentation', () => {
  const lock = readJson('agent-skills.lock.json');
  assert.equal(lock.policy.updateMode, 'pinned-only');
  assert.equal(lock.policy.executeUpstreamScripts, false);
  assert.equal(lock.policy.allowRemoteInstructionsToOverrideProjectPolicy, false);
  for (const [id, [repo, sha, path]] of Object.entries(sources)) {
    const matches = lock.sources.filter((source) => source.id === id);
    assert.equal(matches.length, 1, id);
    const source = matches[0];
    assert.equal(source.repo, repo);
    assert.equal(source.commit, sha);
    assert.equal(source.license, 'MIT');
    assert.ok(source.vendorPaths.includes('LICENSE'));
    assert.ok(source.vendorPaths.includes(path));
    assert.ok(source.vendorPaths.every((item) => item === 'LICENSE' || item.endsWith('.md')));
  }
});

test('#974 wrappers are registered as subordinated project-owned skills', () => {
  const registry = readJson('config/agent-skill-contracts-v3.json');
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  for (const [source, id] of Object.entries(wrappers)) {
    const match = registry.skills.filter((skill) => skill.id === id);
    assert.equal(match.length, 1, id);
    assert.equal(match[0].status, 'ACTIVE');
    assert.equal(match[0].provenance.kind, 'project-owned-wrapper');
    assert.equal(match[0].provenance.sourceLock, source);
    const path = '.agents/skills/' + id + '/SKILL.md';
    assert.equal(match[0].provenance.path, path);
    const content = fs.readFileSync(path, 'utf8');
    assert.match(content, /^---\nname:/);
    assert.match(content, /AGENTS\.md/);
    assert.ok(agents.includes(id));
  }
});

test('#974 4-window protocol is fail-closed with serial merges and no phantom evidence', () => {
  const protocol = fs.readFileSync('docs/FOUR_WINDOW_TICKET_PROTOCOL_2026-10-14.md', 'utf8');
  assert.match(protocol, /coordinator/i);
  assert.match(protocol, /serial/i);
  assert.match(protocol, /expected head SHA/i);
  assert.match(protocol, /BLOCKED/);
  assert.match(protocol, /npm ci/);
  const omni = fs.readFileSync('.agents/skills/contagest-omniroute/SKILL.md', 'utf8');
  assert.match(omni, /read-only/i);
  assert.match(omni, /No startup\/installer\/hooks/);
});
