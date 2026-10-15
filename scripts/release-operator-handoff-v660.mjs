#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const EVIDENCE_DIMENSIONS = Object.freeze([
  'SOURCE_REVIEW', 'LOCAL_STATIC', 'LOCAL_UNIT', 'LOCAL_INTEGRATION',
  'LOCAL_POSTGRES', 'LOCAL_BUILD', 'LOCAL_BROWSER_E2E',
  'REMOTE_CI', 'REMOTE_DEPLOY', 'PHYSICAL_EXTERNAL',
]);
const STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);
const PROFILES = Object.freeze(['backend', 'frontend', 'database', 'financial', 'ui', 'ui-routes', 'security', 'infra', 'agent', 'docs', 'changed', 'full']);

export function validSha(value) { return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value); }

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'manifestSha256')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stable(child)]));
  }
  return value;
}
export function manifestDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function relativeArtifact(profile, sha) {
  return `artifacts/local-verification/${sha}/${profile}/manifest.json`;
}
function isSafeSourcePath(candidate) {
  return typeof candidate === 'string' && !candidate.startsWith('/') &&
    !candidate.includes('\\') && !candidate.split('/').includes('..') &&
    /^[A-Za-z0-9_./-]+$/.test(candidate);
}
function verifiedRunnerManifest(value, candidateSha, profile, root) {
  if (!value || typeof value !== 'object') return 'INVALID_MANIFEST';
  if (value.candidateSha !== candidateSha) return 'SHA_MISMATCH';
  if (value.profile !== profile || value.status !== 'PASS') return 'NOT_PASS';
  if (value.manifestSha256 !== manifestDigest(value)) return 'DIGEST_MISMATCH';
  if (!Array.isArray(value.gates) || !value.gates.some(g => g.required)) return 'GATES_MISSING';
  const logsRoot = path.join(root, 'artifacts', 'local-verification', candidateSha, profile, 'logs');
  if (!value.gates.every(g => {
    if (!g.required) return true;
    if (g.status !== 'PASS' || typeof g.command !== 'string' || !/^(?:npm|node|npx) [A-Za-z0-9_./ :\-=]+$/.test(g.command) || typeof g.logPath !== 'string') return false;
    const log = path.resolve(root, g.logPath);
    return log.startsWith(logsRoot + path.sep) && fs.existsSync(log);
  })) return 'GATE_EVIDENCE_INCOMPLETE';
  return null;
}

/** Reads only known, SHA-scoped #630 manifests. Never opens logs or exposes provider secrets. */
export function collectLocalEvidence({ root, candidateSha, readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8')) }) {
  if (!validSha(candidateSha)) throw new Error('HANDOFF_SHA_INVALID');
  const entries = [];
  for (const profile of PROFILES) {
    const rel = relativeArtifact(profile, candidateSha);
    const filename = path.join(root, rel);
    if (!fs.existsSync(filename)) continue;
    let value;
    try { value = readJson(filename); }
    catch { entries.push({ profile, status: 'FAIL', reason: 'MANIFEST_UNREADABLE', artifact: rel }); continue; }
    const failure = verifiedRunnerManifest(value, candidateSha, profile, root);
    if (failure) {
      entries.push({ profile, status: 'FAIL', reason: failure, artifact: rel });
      continue;
    }
    const passed = value.gates.filter(g => g.required && g.status === 'PASS');
    const gateKinds = new Set();
    for (const gate of passed) {
      const c = gate.command.toLowerCase();
      const id = String(gate.id || '').toLowerCase();
      if (/typecheck|lint|audit|contract/.test(c + ' ' + id)) gateKinds.add('LOCAL_STATIC');
      if (/test/.test(c + ' ' + id)) gateKinds.add('LOCAL_UNIT');
      if (/integration|backend-tests|security-tenant/.test(id)) gateKinds.add('LOCAL_INTEGRATION');
      if (/build/.test(c + ' ' + id)) gateKinds.add('LOCAL_BUILD');
      if (/browser|playwright|chromium|webkit|firefox/.test(c + ' ' + id)) gateKinds.add('LOCAL_BROWSER_E2E');
    }
    if (['database', 'financial', 'full', 'changed'].includes(profile) &&
      typeof value.postgres?.databaseName === 'string' && /^contagest_verify_[a-z0-9_]+_e2e$/.test(value.postgres.databaseName)) {
      gateKinds.add('LOCAL_POSTGRES');
    }
    entries.push({
      profile, status: 'PASS', sourceVerified: true, artifact: rel,
      environment: {
        node: typeof value.platform?.node === 'string' ? value.platform.node.slice(0, 24) : 'UNRECORDED',
        os: typeof value.platform?.os === 'string' ? value.platform.os.slice(0, 48) : 'UNRECORDED',
      },
      gates: passed.map(g => ({ id: String(g.id || '').slice(0, 80), command: g.command, status: 'PASS' })),
      dimensions: [...gateKinds].sort(),
    });
  }
  return entries;
}

export function validateOperatorPlan(plan, exists = () => true) {
  if (plan?.schemaVersion !== 660 || !Array.isArray(plan.steps) || plan.steps.length < 5) throw new Error('HANDOFF_PLAN_SCHEMA_INVALID');
  const ids = new Set();
  for (const step of plan.steps) {
    if (!step || !/^[a-z][a-z0-9-]+$/.test(step.id) || ids.has(step.id)) throw new Error('HANDOFF_STEP_ID_INVALID');
    ids.add(step.id);
    if (!['READ_ONLY', 'QA_ISOLATED', 'OPERATOR_APPROVAL'].includes(step.mode)) throw new Error('HANDOFF_STEP_MODE_INVALID:' + step.id);
    if (!Array.isArray(step.commands) || !step.commands.length || step.commands.some(c => typeof c !== 'string' || !/^(?:npm |node |git |curl |docker )/.test(c))) throw new Error('HANDOFF_STEP_COMMAND_INVALID:' + step.id);
    if (!isSafeSourcePath(step.runbook) || !exists(step.runbook)) throw new Error('HANDOFF_RUNBOOK_MISSING:' + step.id);
    if (!/^[a-z][a-z0-9-]+$/.test(step.context)) throw new Error('HANDOFF_CONTEXT_INVALID:' + step.id);
  }
  if (!Array.isArray(plan.contexts) || plan.contexts.length < 3 || plan.contexts.some(c => !c || !/^[a-z][a-z0-9-]+$/.test(c.id) || !isSafeSourcePath(c.authority) || !exists(c.authority))) throw new Error('HANDOFF_CONTEXT_OWNER_MISSING');
  return plan;
}

function decisionStatus(evidence) {
  if (evidence.some(e => e.status === 'FAIL')) return 'FAIL';
  return 'NOT_EXECUTED'; // #647 production decision cannot be inferred from test artifacts.
}

export function makeHandoff({ candidateSha, plan, localEvidence = [], exists = () => true }) {
  if (!validSha(candidateSha)) throw new Error('HANDOFF_SHA_INVALID');
  validateOperatorPlan(plan, exists);
  const evidence = [...localEvidence].sort((a,b) => a.profile.localeCompare(b.profile));
  for (const entry of evidence) {
    if (!PROFILES.includes(entry.profile) || !STATUSES.has(entry.status)) throw new Error('HANDOFF_EVIDENCE_INVALID');
    if (entry.artifact !== relativeArtifact(entry.profile, candidateSha)) throw new Error('HANDOFF_EVIDENCE_PATH_INVALID');
    if (entry.status === 'PASS' && entry.sourceVerified !== true) throw new Error('HANDOFF_PASS_UNVERIFIED');
  }
  const dimensions = Object.fromEntries(EVIDENCE_DIMENSIONS.map(dim => {
    const matches = evidence.filter(e => e.status === 'PASS' && e.dimensions?.includes(dim));
    return [dim, {
      status: matches.length ? 'PASS' : 'NOT_EXECUTED',
      sources: matches.map(e => e.artifact),
    }];
  }));
  // Remote, physical and human source review are never promoted by local gates.
  for (const name of ['SOURCE_REVIEW', 'REMOTE_CI', 'REMOTE_DEPLOY', 'PHYSICAL_EXTERNAL']) {
    dimensions[name] = { status: 'NOT_EXECUTED', sources: [] };
  }
  return {
    schemaVersion: 660,
    candidateSha,
    releaseDecision: 'NOT_READY',
    reviewStatus: decisionStatus(evidence),
    evidence,
    dimensions,
    contexts: plan.contexts,
    steps: plan.steps,
    dependencies: [
      { issue: 647, status: 'NOT_VERIFIED', purpose: 'Final exact-SHA release decision' },
      { issue: 662, status: 'NOT_VERIFIED', purpose: 'Evidence index and issue mapping' },
      { issue: 840, status: 'NOT_VERIFIED', purpose: 'Provider deployment and rollback evidence' },
    ],
    limitations: [
      'Handoff only: not an approval to deploy or modify production data.',
      'Missing gates remain NOT_EXECUTED; no evidence transfers to another SHA.',
      'Migrations, restore and production rollback require operator approval and specific runbooks.',
    ],
  };
}

function markdownCell(value) { return String(value).replaceAll('|', '\\|').replaceAll('`', "'").replace(/\r?\n/g, ' '); }
export function renderHandoff(report) {
  const lines = [
    '# ContaGest — operator handoff #660', '',
    `**Exact SHA:** \`${report.candidateSha}\``,
    `**Release decision:** ${report.releaseDecision} · **Review evidence:** ${report.reviewStatus}`, '',
    '## Boundaries and source of truth', '',
    '| Context | Authority | Issues |', '| --- | --- | --- |',
    ...report.contexts.map(c => `| ${markdownCell(c.id)} | \`${markdownCell(c.authority)}\` | ${c.issues.map(n => `#${n}`).join(', ')} |`),
    '', '## Operating sequence (instructions only; not executed)', '',
  ];
  for (const step of report.steps) {
    lines.push(`### ${step.id}`, '', `${step.context} · ${step.mode} · [Runbook](../../../../${step.runbook})`, '');
    for (const command of step.commands) lines.push(`- \`${command.replaceAll('<SHA>', report.candidateSha)}\``);
    lines.push('');
  }
  lines.push('## Exact-SHA evidence', '', '| Dimension | State | Evidence artifacts |', '| --- | --- | --- |');
  for (const [dimension, evidence] of Object.entries(report.dimensions)) {
    lines.push(`| ${dimension} | ${evidence.status} | ${evidence.sources.map(p => `\`${p}\``).join(', ') || 'none'} |`);
  }
  lines.push('', '## RC and provider dependencies', '');
  for (const dependency of report.dependencies) lines.push(`- #${dependency.issue} — ${dependency.purpose}: ${dependency.status}`);
  lines.push('', '## Known limitations / operator warnings', '');
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push('', '## Rollback / forward fix', '',
    'Application rollback: use only a previously hashed and schema-compatible artifact, after the checks in [#566](../../../../docs/RUNBOOK_PRODUCTION_V566.md).',
    'Database migration: **forward-only**. An incompatible schema blocks app rollback; use a reviewed forward-fix. Recovery requires an isolated restore drill.',
    'Provider outage: remain fail-closed for financial effects and authorized messaging; track provider status separately from local code quality.', '');
  return lines.join('\n');
}

function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim(); }
export function assertCleanHead(root, expectedSha) {
  if (!validSha(expectedSha)) throw new Error('HANDOFF_SHA_INVALID');
  const head = git(root, ['rev-parse', 'HEAD']);
  if (head !== expectedSha) throw new Error('HANDOFF_SHA_MISMATCH');
  if (git(root, ['status', '--porcelain'])) throw new Error('HANDOFF_WORKTREE_DIRTY');
  return head;
}

function parseArgs(args) {
  if (args.length !== 2 || args[0] !== '--sha' || !validSha(args[1])) throw new Error('HANDOFF_USAGE:--sha FULL_HEAD_SHA');
  return { sha: args[1] };
}
export function writeHandoff(root, report) {
  const outDir = path.join(root, 'artifacts', 'release', 'handoff-v660', report.candidateSha);
  fs.mkdirSync(outDir, { recursive: true });
  const json = path.join(outDir, 'operator-handoff.json');
  const md = path.join(outDir, 'operator-handoff.md');
  fs.writeFileSync(json, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(md, renderHandoff(report));
  return { json: path.relative(root, json), markdown: path.relative(root, md) };
}

export function runCli({ root = process.cwd(), argv = process.argv.slice(2) } = {}) {
  const { sha } = parseArgs(argv);
  assertCleanHead(root, sha);
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'config/release-operator-handoff-v660.json'), 'utf8'));
  const report = makeHandoff({
    candidateSha: sha,
    plan,
    localEvidence: collectLocalEvidence({ root, candidateSha: sha }),
    exists: relative => fs.existsSync(path.join(root, relative)),
  });
  return { report, files: writeHandoff(root, report) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(runCli(), null, 2) + '\n'); }
  catch (error) { console.error('[operator-handoff-v660]', error.message); process.exitCode = 1; }
}