#!/usr/bin/env node
// #659: Evidence index, not a replacement for #155 / #630 execution or business-flow QA.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';
import { MODULE_VERIFICATION_CATALOG } from '../qa/support/module-verification-catalog.mjs';

export const FUNCTIONAL_STAGES = Object.freeze([
  'uiEvent', 'clientState', 'api', 'domainService', 'persistence', 'response', 'uiFeedback'
]);
const GATES = Object.freeze(['visual', 'interaction', 'frontendE2E', 'backendPersistence', 'domain']);
const STATUS = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED', 'NOT_APPLICABLE']);
const SHA = /^[a-f0-9]{40}$/i;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function verifyArtifact(proof, candidateSha, root) {
  if (!proof || proof.status !== 'PASS') return false;
  if (proof.candidateSha !== candidateSha || typeof proof.command !== 'string' || proof.command.trim().length < 5 ||
      typeof proof.environment !== 'string' || !proof.environment.trim() ||
      !/^[a-f0-9]{64}$/i.test(String(proof.artifactSha256 || ''))) {
    throw new Error('COVERAGE_PASS_PROVENANCE_MISSING');
  }
  const input = String(proof.artifact || '').replaceAll('\\', '/');
  if (!/^artifacts\/[a-zA-Z0-9_./-]+$/.test(input) || input.split('/').includes('..')) {
    throw new Error('COVERAGE_ARTIFACT_PATH_INVALID');
  }
  const resolvedRoot = fs.realpathSync(root);
  const fullPath = path.resolve(resolvedRoot, input);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error('COVERAGE_ARTIFACT_NOT_FOUND:' + input);
  }
  // realpath prevents symlink escapes; every accepted PASS has an on-disk digest.
  const realFile = fs.realpathSync(fullPath);
  if (!realFile.startsWith(resolvedRoot + path.sep)) throw new Error('COVERAGE_ARTIFACT_ESCAPE');
  if (sha256(fs.readFileSync(realFile)) !== proof.artifactSha256) throw new Error('COVERAGE_ARTIFACT_HASH_MISMATCH:' + input);
  return true;
}

function assertCatalogs(registry, visualCatalog, verificationCatalog) {
  const runtime = Object.keys(registry).sort();
  if (!runtime.length) throw new Error('COVERAGE_EMPTY_CATALOG');
  const visual = visualCatalog.map((row) => row.route).sort();
  const verified = verificationCatalog.map((row) => row.route).sort();
  for (const [name, keys] of [['visual', visual], ['verification', verified]]) {
    if (new Set(keys).size !== keys.length || keys.join('|') !== runtime.join('|')) {
      throw new Error('COVERAGE_ROUTE_DRIFT:' + name);
    }
  }
  for (const row of verificationCatalog) {
    if (!Array.isArray(registry[row.route]) || registry[row.route].length !== 2 ||
        !Array.isArray(row.gates) || GATES.some((gate) => !row.gates.includes(gate))) {
      throw new Error('COVERAGE_CONTRACT_INVALID:' + row.route);
    }
  }
}

export function buildCoverageManifest({
  candidateSha, registry = PAGE_REGISTRY, visualCatalog = MODULE_VISUAL_CATALOG,
  verificationCatalog = MODULE_VERIFICATION_CATALOG, evidence = null,
  root = process.cwd()
} = {}) {
  if (!SHA.test(String(candidateSha || ''))) throw new Error('COVERAGE_CANDIDATE_SHA_INVALID');
  assertCatalogs(registry, visualCatalog, verificationCatalog);
  if (evidence && (evidence.schemaVersion !== 1 || evidence.candidateSha !== candidateSha || typeof evidence.routes !== 'object' || !evidence.routes)) {
    throw new Error('COVERAGE_EVIDENCE_SCHEMA_OR_SHA_MISMATCH');
  }
  const routeNames = new Set(Object.keys(registry));
  for (const name of Object.keys(evidence?.routes || {})) {
    if (!routeNames.has(name)) throw new Error('COVERAGE_UNKNOWN_ROUTE:' + name);
  }

  const rows = verificationCatalog.map((row) => {
    const [modulePath, exportName] = registry[row.route];
    const pagePath = 'frontend/src/' + modulePath.replace(/^\.\//, '');
    const pageExists = fs.existsSync(path.resolve(root, pagePath));
    const received = evidence?.routes?.[row.route]?.gates || {};
    for (const gate of Object.keys(received)) if (!GATES.includes(gate)) throw new Error('COVERAGE_UNKNOWN_GATE:' + gate);
    const gateStates = {};
    let validPasses = 0;
    let invalidated = 0;
    for (const gate of GATES) {
      const proof = received[gate];
      const status = proof?.status || 'NOT_EXECUTED';
      if (!STATUS.has(status)) throw new Error('COVERAGE_STATUS_INVALID:' + row.route + ':' + gate);
      if (status === 'PASS') {
        verifyArtifact(proof, candidateSha, root);
        validPasses++;
      } else if (status === 'NOT_APPLICABLE') {
        if (!['backendPersistence', 'domain'].includes(gate) || row.persistence !== 'none' ||
            typeof proof.reason !== 'string' || proof.reason.trim().length < 16) {
          throw new Error('COVERAGE_NA_UNJUSTIFIED:' + row.route + ':' + gate);
        }
      } else if (status !== 'NOT_EXECUTED') {
        invalidated++;
      }
      gateStates[gate] = status;
    }
    const sufficient = GATES.every((gate) => gateStates[gate] === 'PASS' || gateStates[gate] === 'NOT_APPLICABLE');
    const state = pageExists && sufficient && validPasses >= 3 ? 'VERIFIED'
      : validPasses > 0 || invalidated > 0 ? 'PARTIAL' : 'NOT_VERIFIED';
    return {
      route: row.route, label: row.label, family: row.family, priority: row.priority,
      domain: row.domain, persistence: row.persistence, state,
      flow: FUNCTIONAL_STAGES,
      source: { pagePath, exportName, exists: pageExists, apiOwner: null, serviceOwner: null, databaseOwner: null },
      gates: gateStates,
      missing: GATES.filter((gate) => gateStates[gate] === 'NOT_EXECUTED'),
      // Source existence is navigation evidence, never proof of a working handler/API/DB.
      evidenceStatus: pageExists ? 'SOURCE_ONLY' : 'MISSING_SOURCE'
    };
  });
  const counts = Object.fromEntries(['VERIFIED', 'PARTIAL', 'NOT_VERIFIED'].map((state) =>
    [state, rows.filter((row) => row.state === state).length]));
  return {
    schemaVersion: 1, issue: 659, candidateSha,
    authority: { routes: 'frontend/src/data/pageRegistry.js', catalog: 'qa/support/module-verification-catalog.mjs',
      execution: ['#155', '#630'], evidenceIsNotSelfAttesting: true },
    summary: { routes: rows.length, counts, readiness: counts.VERIFIED === rows.length ? 'REVIEW_REQUIRED' : 'NO_GO',
      unverifiedCriticalHigh: rows.filter((row) => row.state !== 'VERIFIED' && ['critical', 'high'].includes(row.priority)).map((row) => row.route) },
    routes: rows
  };
}

function parseArgs(argv) {
  const args = { expectedSha: '', evidencePath: '', strict: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--expected-sha') args.expectedSha = argv[++i] || '';
    else if (arg === '--evidence') args.evidencePath = argv[++i] || '';
    else if (arg === '--strict') args.strict = true;
    else throw new Error('COVERAGE_UNKNOWN_ARGUMENT:' + arg);
  }
  return args;
}

async function cli() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (args.expectedSha && args.expectedSha !== candidateSha) throw new Error('COVERAGE_CANDIDATE_SHA_MISMATCH');
  const evidence = args.evidencePath ? JSON.parse(fs.readFileSync(path.resolve(root, args.evidencePath), 'utf8')) : null;
  const report = buildCoverageManifest({ candidateSha, evidence, root });
  const output = path.join(root, 'artifacts', 'qa', 'functional-coverage-v659', candidateSha, 'manifest.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ candidateSha, output: path.relative(root, output), summary: report.summary }));
  if (args.strict && report.summary.readiness !== 'REVIEW_REQUIRED') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli().catch((error) => { console.error(error.message); process.exitCode = 2; });
}
