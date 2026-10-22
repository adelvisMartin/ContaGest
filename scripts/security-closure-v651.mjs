#!/usr/bin/env node
/**
 * #651: read-only security evidence index; never an auth, tenant, DB, or release authority.
 * Every positive claim must be backed by a distinct on-disk SHA-256 proof on exact HEAD.
 */
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSecurityClosureCheckout } from './security-closure-checkout-v651.mjs';

const EXPECTED = Object.freeze([
  'media-bola', 'health-disclosure', 'runtime-tenant-rls', 'auth-sessions',
  'tenant-api', 'infra-secrets', 'telemetry-redaction', 'async-tenant',
  'integration-replay', 'security-backlog'
]);
const ISSUE_BY_ID = Object.freeze({
  'media-bola':569, 'health-disclosure':570, 'runtime-tenant-rls':739,
  'auth-sessions':851, 'tenant-api':641, 'infra-secrets':648,
  'telemetry-redaction':650, 'async-tenant':853, 'integration-replay':772,
  'security-backlog':651
});
const SHA = /^[a-f0-9]{40}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const ID = /^[a-z][a-z0-9-]{2,79}$/;
const VALID_STATUS = new Set(['PASS','FAIL','BLOCKED','NOT_EXECUTED','NOT_APPLICABLE']);
const err = code => { throw new Error(`SEC651_${code}`); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateSecurityCatalog(catalog) {
  if (!object(catalog) || catalog.schemaVersion !== 651 || !Array.isArray(catalog.controls)) err('CATALOG_INVALID');
  const seen = new Set();
  for (const control of catalog.controls) {
    if (!object(control) || !EXPECTED.includes(control.id) || seen.has(control.id)
        || !Number.isInteger(control.issue) || control.issue !== ISSUE_BY_ID[control.id]
        || typeof control.owner !== 'string' || control.owner.trim().length < 3
        || !Array.isArray(control.checks) || control.checks.length < 2
        || control.checks.some(check => typeof check !== 'string' || !ID.test(check))
        || new Set(control.checks).size !== control.checks.length) err('CONTROL_INVALID');
    seen.add(control.id);
  }
  if (seen.size !== EXPECTED.length) err('REQUIRED_CONTROL_MISSING');
  return catalog.controls;
}

export function validateArtifactPath(value) {
  if (typeof value !== 'string' || !/^artifacts\/[a-zA-Z0-9._/-]+$/.test(value)
      || value.split('/').some(part => !part || part === '.' || part === '..')) err('UNSAFE_ARTIFACT_PATH');
  return value;
}

function checkProof(proof, {candidateSha, gateId, loadArtifact, seenPaths}) {
  if (!object(proof) || proof.candidateSha !== candidateSha || proof.gateId !== gateId
      || typeof proof.sha256 !== 'string' || !DIGEST.test(proof.sha256)) err('PROOF_METADATA_INVALID');
  const location = validateArtifactPath(proof.path);
  if (seenPaths.has(location)) err('DUPLICATE_PROOF');
  seenPaths.add(location);
  const bytes = loadArtifact(location);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 16 * 1024 * 1024) err('PROOF_UNAVAILABLE');
  if (sha256(bytes) !== proof.sha256.toLowerCase()) err('PROOF_DIGEST_MISMATCH');
  return {gateId, path: location, sha256: proof.sha256.toLowerCase()};
}

/** The input is operator evidence, not GitHub issue state inference. */
export function buildSecurityClosure(catalog, input, {candidateSha, loadArtifact} = {}) {
  const controls = validateSecurityCatalog(catalog);
  if (!SHA.test(candidateSha || '') || !object(input) || input.schemaVersion !== 651
      || input.candidateSha !== candidateSha || typeof loadArtifact !== 'function'
      || !object(input.controls)) err('EVIDENCE_HEADER_INVALID');
  const ids = new Set(EXPECTED);
  for (const key of Object.keys(input.controls)) if (!ids.has(key)) err('UNOWNED_CONTROL');
  const used = new Set();
  const findings = [];
  const results = [];
  for (const control of controls) {
    const value = input.controls[control.id] ?? {status:'NOT_EXECUTED'};
    if (!object(value) || !VALID_STATUS.has(value.status)) err('STATUS_INVALID');
    if (value.status === 'PASS') {
      if (!object(value.proofs)) err('PASS_WITHOUT_PROOFS');
      if (Object.keys(value.proofs).length !== control.checks.length
          || Object.keys(value.proofs).some(key => !control.checks.includes(key))) err('CHECK_COVERAGE_INCOMPLETE');
      for (const check of control.checks) {
        checkProof(value.proofs[check], {candidateSha, gateId:`${control.id}:${check}`, loadArtifact, seenPaths:used});
      }
    } else {
      if (value.proofs !== undefined) err('UNVERIFIED_PROOFS');
      if (value.status === 'NOT_APPLICABLE' &&
        (typeof value.reason !== 'string' || value.reason.trim().length < 30
         || typeof value.approvedBy !== 'string' || value.approvedBy.trim().length < 3)) err('UNAPPROVED_EXCLUSION');
      findings.push({control:control.id, issue:control.issue, status:value.status});
    }
    results.push({id:control.id, issue:control.issue, owner:control.owner,
      status:value.status, checks:control.checks.length});
  }

  let blockersVerified = false;
  let blockingCount = null;
  if (input.backlog !== undefined) {
    if (!object(input.backlog) || !Array.isArray(input.backlog.openBlockers)
        || new Set(input.backlog.openBlockers).size !== input.backlog.openBlockers.length
        || input.backlog.openBlockers.some(n => !Number.isInteger(n) || n < 1)) err('BACKLOG_INVALID');
    checkProof(input.backlog.proof, {candidateSha, gateId:'security-backlog:current-issues', loadArtifact, seenPaths:used});
    blockersVerified = true;
    blockingCount = input.backlog.openBlockers.length;
  }
  const ready = findings.length === 0 && blockersVerified && blockingCount === 0;
  const report = {schemaVersion:651, candidateSha, ready,
    decision:ready?'SECURITY_EVIDENCE_COMPLETE':'SECURITY_EVIDENCE_INCOMPLETE',
    controls:results, findings, backlog:{verified:blockersVerified, openBlockerCount:blockingCount}};
  return Object.freeze({...report, reportSha256:sha256(Buffer.from(JSON.stringify(report)))});
}

function artifactLoader(root) {
  const realRoot = realpathSync(root);
  return location => {
    validateArtifactPath(location);
    const target = realpathSync(resolve(realRoot, location));
    if (!target.startsWith(realRoot + sep)) err('ARTIFACT_ESCAPED_ROOT');
    return readFileSync(target);
  };
}

async function main(args) {
  const option = flag => { const index=args.indexOf(flag); return index < 0 ? null : args[index+1]; };
  const sha=option('--sha');
  const inputPath=option('--input');
  if (!SHA.test(sha || '') || (inputPath && !/^artifacts\/[a-zA-Z0-9._/-]+$/.test(inputPath))) err('CLI_ARGUMENT_INVALID');
  const root=resolve(fileURLToPath(new URL('..', import.meta.url)));
  assertSecurityClosureCheckout(sha, root);
  const catalog=JSON.parse(readFileSync(resolve(root, 'config/security-closure-v651.json'), 'utf8'));
  let input={schemaVersion:651,candidateSha:sha,controls:{}};
  if (inputPath) input=JSON.parse(artifactLoader(root)(inputPath).toString('utf8'));
  const report=buildSecurityClosure(catalog,input,{candidateSha:sha,loadArtifact:artifactLoader(root)});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if (!report.ready) process.exitCode=2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e=>{process.stderr.write(String(e.message).slice(0,128)+'\n');process.exitCode=1;});
}
