import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lock = JSON.parse(fs.readFileSync(path.join(root, 'agent-skills.lock.json'), 'utf8'));
const wrapperPath = path.join(root, '.agents/skills/contagest-cloudflare-security-audit/SKILL.md');
const agentsPath = path.join(root, 'AGENTS.md');

const requiredCloudflarePaths = [
  'LICENSE',
  'skills/security-audit/SKILL.md',
  'skills/security-audit/ATTACK-CLASSES.md',
  'skills/security-audit/RECONNAISSANCE.md',
  'skills/security-audit/HUNTING.md',
  'skills/security-audit/VALIDATION-AND-REPORTING.md',
  'skills/security-audit/WEB-PROTOCOL-AND-AUTH.md',
  'skills/security-audit/DATA-ISOLATION-AND-LIFECYCLE.md',
  'skills/security-audit/CLIENT-SIDE.md',
  'skills/security-audit/CLOUD-AND-DEPLOYMENT.md',
  'skills/security-audit/SUPPLY-CHAIN-AND-RELEASE.md',
  'skills/security-audit/AI-AND-LLM.md',
  'skills/security-audit/PROTOCOLS-RPC-AND-MESSAGING.md',
  'skills/security-audit/RESOURCE-EXHAUSTION-AND-AVAILABILITY.md',
  'skills/security-audit/DESKTOP-MOBILE-AND-LOCAL-IPC.md',
  'skills/security-audit/MEMORY-SAFETY-AND-BINARY.md',
  'skills/security-audit/report-schema.json',
  'skills/security-audit/validate-coverage-ledger.cjs',
  'skills/security-audit/validate-coverage-ledger.test.cjs',
  'skills/security-audit/validate-findings.cjs',
  'skills/security-audit/validate-findings.test.cjs'
];

test('Cloudflare security audit source is pinned and non-executable', () => {
  const sources = (lock.sources || []).filter((item) => item.id === 'cloudflare-security-audit');
  assert.equal(sources.length, 1, 'exactly one cloudflare-security-audit source must exist');
  const source = sources[0];
  assert.equal(source.repo, 'cloudflare/security-audit-skill');
  assert.equal(source.commit, 'c1c8a8c1471069fb0e188eeaff69b8e8db6564a8');
  assert.equal(source.license, 'MIT');
  assert.equal(source.trustLevel, 'reviewed-security-guidance');
  assert.equal(source.namespace, 'cloudflare-security');
  assert.equal(lock.policy.updateMode, 'pinned-only');
  assert.equal(lock.policy.executeUpstreamScripts, false);
  assert.equal(lock.policy.allowRemoteInstructionsToOverrideProjectPolicy, false);
  for (const required of requiredCloudflarePaths) assert.ok(source.vendorPaths.includes(required), `missing ${required}`);
  for (const rel of source.vendorPaths) {
    const normalized = path.posix.normalize(String(rel).replaceAll('\\', '/'));
    assert.equal(path.posix.isAbsolute(normalized), false);
    assert.equal(normalized.startsWith('../'), false);
    assert.equal(normalized.includes('/../'), false);
  }
  assert.equal(source.commands, undefined);
  assert.equal(source.hooks, undefined);
  assert.ok(source.vendorPaths.some((rel) => rel.endsWith('.cjs')), 'validator sources should be vendored as inert files');
});

test('ContaGest wrapper preserves project precedence and full-audit safety rules', () => {
  assert.equal(fs.existsSync(wrapperPath), true, 'wrapper skill must exist');
  const wrapper = fs.readFileSync(wrapperPath, 'utf8');
  const agents = fs.readFileSync(agentsPath, 'utf8');
  assert.match(wrapper, /AGENTS\.md[\s\S]*contagest-erp-orchestrator[\s\S]*contagest-appsec-review[\s\S]*contagest-secure-verification[\s\S]*Cloudflare/i);
  assert.match(wrapper, /deep/i);
  assert.match(wrapper, /PASS \| FAIL \| BLOCKED \| NOT_EXECUTED/);
  assert.match(wrapper, /production/i);
  assert.match(wrapper, /NEEDS_VALIDATION/);
  assert.match(wrapper, /do not execute[\s\S]*vendored[\s\S]*(?:\.cjs|validator)/i);
  assert.match(agents, /contagest-appsec-review/);
  assert.match(agents, /contagest-secure-verification/);
  assert.match(agents, /contagest-cloudflare-security-audit/);
});
