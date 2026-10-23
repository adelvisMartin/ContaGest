#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const WORKSPACE_PATHS = Object.freeze(['', 'backend', 'frontend']);
const CATEGORIES = Object.freeze(['dependencies', 'devDependencies', 'optionalDependencies']);
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const RESTRICTED_LICENSE = /(?:^|[\s(])(?:AGPL|GPL|LGPL|SSPL|BUSL|BSL|EUPL)(?:-[\d.]+|-only|-or-later|\b)/i;
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const toKey = (scope, name) => `${scope || 'root'}:${name}`;
const sortBy = (a, b) => a.localeCompare(b, 'en');

function findResolution(lock, scope, name, spec, workspacePackages) {
  if (spec.startsWith('file:')) {
    const target = path.posix.normalize(path.posix.join(scope || '.', spec.slice(5)));
    const workspace = workspacePackages[target];
    if (!workspace || workspace.name !== name) return null;
    const link = lock.packages?.[`${scope ? `${scope}/` : ''}node_modules/${name}`] || lock.packages?.[`node_modules/${name}`];
    return link?.link && typeof workspace.version === 'string' ? { path: target, metadata: { version: workspace.version, license: 'WORKSPACE_LOCAL' }, workspace: true } : null;
  }
  for (const prefix of scope ? [`${scope}/node_modules/`, 'node_modules/'] : ['node_modules/']) {
    const location = `${prefix}${name}`;
    const found = lock.packages?.[location];
    if (found && typeof found.version === 'string' && !found.link) return { path: location, metadata: found, workspace: false };
  }
  return null;
}

export function auditDependencyGovernance({ rootPackage, workspacePackages, lock, catalog }) {
  const findings = [];
  const add = (severity, code, subject, detail) => findings.push({ severity, code, subject, detail });
  if (!lock || lock.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== 'object') {
    throw new Error('GOVERNANCE_LOCKFILE_V3_REQUIRED');
  }
  if (!catalog || catalog.schemaVersion !== 656 || !catalog.dependencies || typeof catalog.dependencies !== 'object') {
    throw new Error('GOVERNANCE_OWNER_CATALOG_REQUIRED');
  }
  const manifests = { '': rootPackage, ...workspacePackages };
  const expectedWorkspaces = [...(rootPackage.workspaces || [])].sort(sortBy);
  if (JSON.stringify(expectedWorkspaces) !== JSON.stringify(['backend', 'frontend'])) {
    add('P1', 'WORKSPACE_SCOPE_DRIFT', 'root', 'Expected backend and frontend workspaces');
  }
  const direct = [];
  const seen = new Set();
  for (const scope of WORKSPACE_PATHS) {
    const manifest = manifests[scope];
    if (!manifest || !manifest.name || !manifest.version) {
      add('P1', 'WORKSPACE_MANIFEST_MISSING', scope || 'root', 'Missing package manifest identity');
      continue;
    }
    const lockManifest = lock.packages[scope];
    if (!lockManifest || lockManifest.name !== manifest.name || lockManifest.version !== manifest.version) {
      add('P1', 'WORKSPACE_LOCK_IDENTITY_MISMATCH', scope || 'root', 'Package identity differs from lockfile');
    }
    for (const type of CATEGORIES) {
      for (const [name, spec] of Object.entries(manifest[type] || {}).sort(([a], [b]) => sortBy(a, b))) {
        const key = toKey(scope, name);
        seen.add(key);
        const policy = catalog.dependencies[key];
        if (!policy || !clean(policy.owner) || !clean(policy.purpose)) {
          add('P1', 'DEPENDENCY_OWNER_MISSING', key, 'Each direct dependency requires owner and purpose');
        }
        const lockSpec = lockManifest?.[type]?.[name];
        if (lockSpec === undefined) add('P1', 'LOCK_DIRECT_DEPENDENCY_MISSING', key, 'Missing direct dependency declaration in lockfile');
        else if (lockSpec !== spec) add('P2', 'LOCK_DECLARATION_DRIFT', key, 'Manifest and lockfile declaration differ; review frozen install');
        const resolution = findResolution(lock, scope, name, String(spec), workspacePackages);
        if (!resolution) {
          add('P1', 'LOCK_RESOLUTION_MISSING', key, 'No valid dependency resolution in lockfile');
          direct.push({ workspace: scope || 'root', name, requested: spec, classification: type, owner: policy?.owner || null, purpose: policy?.purpose || null, resolvedVersion: null, license: 'NOASSERTION' });
          continue;
        }
        const version = resolution.metadata.version;
        if (EXACT_VERSION.test(String(spec)) && version !== spec) {
          add('P1', 'EXACT_PIN_MISMATCH', key, `Requested ${spec}, resolved ${version}`);
        }
        const license = clean(resolution.metadata.license) || 'NOASSERTION';
        if (license === 'NOASSERTION') add('P2', 'LICENSE_NOT_IN_LOCK', key, 'License requires an independent package/source review');
        if (!resolution.workspace && RESTRICTED_LICENSE.test(license)) {
          add('P1', 'LICENSE_REVIEW_REQUIRED', key, `Potential restrictive license ${license}; no compatibility determination is implied`);
        }
        direct.push({ workspace: scope || 'root', name, requested: spec, classification: type, owner: policy?.owner || null, purpose: policy?.purpose || null, resolvedVersion: version, license, resolutionPath: resolution.path });
      }
    }
  }
  for (const key of Object.keys(catalog.dependencies)) {
    if (!seen.has(key)) add('P2', 'STALE_OWNER_RECORD', key, 'Catalog references no current direct dependency');
  }
  const overlapReviews = (catalog.overlapReviews || []).map(({ packages, rationale }) => ({ packages: [...packages].sort(sortBy), rationale }));
  for (const review of overlapReviews) {
    if (!review.packages.every((name) => direct.some((item) => item.name === name)) || !clean(review.rationale)) {
      add('P2', 'OVERLAP_REVIEW_STALE', review.packages.join(','), 'Overlap review is stale or has no justification');
    }
  }
  // Lock v3 includes all resolved packages, including transitive and nested installs.
  // Exclude direct resolutions (whose ownership is audited above) to avoid double-counting.
  const directPaths = new Set(direct.map((item) => item.resolutionPath).filter(Boolean));
  const transitive = [];
  for (const [location, metadata] of Object.entries(lock.packages).sort(([a], [b]) => sortBy(a, b))) {
    if (!location.includes('node_modules/') || directPaths.has(location) || !metadata || metadata.link || typeof metadata.version !== 'string') continue;
    const license = clean(metadata.license) || 'NOASSERTION';
    const devOnly = metadata.dev === true;
    if (license === 'NOASSERTION') {
      add('P2', 'TRANSITIVE_LICENSE_NOT_IN_LOCK', location, 'Review package/source license; lock metadata is not legal evidence');
    } else if (RESTRICTED_LICENSE.test(license)) {
      add(devOnly ? 'P2' : 'P1', 'TRANSITIVE_LICENSE_REVIEW_REQUIRED', location, `Potential restrictive license ${license}; legal applicability and production reachability are not established`);
    }
    transitive.push({
      resolutionPath: location,
      resolvedVersion: metadata.version,
      license,
      classification: devOnly ? 'dev-only-lock-entry' : 'runtime-or-mixed-lock-entry',
      optional: metadata.optional === true,
    });
  }
  const high = findings.filter((item) => item.severity === 'P1').length;
  findings.sort((a, b) => sortBy(`${a.code}|${a.subject}`, `${b.code}|${b.subject}`));
  direct.sort((a, b) => sortBy(`${a.workspace}|${a.name}|${a.classification}`, `${b.workspace}|${b.name}|${b.classification}`));
  return {
    schemaVersion: 656, issue: 656,
    status: high ? 'FAIL' : findings.length ? 'REVIEW_REQUIRED' : 'PASS',
    directCount: direct.length,
    direct,
    transitiveCount: transitive.length,
    transitive,
    overlapReviews,
    findings,
    externalEvidence: { advisoryAudit: 'NOT_EXECUTED', cleanInstall: 'NOT_EXECUTED', build: 'NOT_EXECUTED', runtime: 'NOT_EXECUTED', legalCompliance: 'NOT_VERIFIED' },
    sbomAuthority: 'scripts/supply-chain-v550.mjs',
  };
}

function loadJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function cli() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !arg.startsWith('--sha=') && arg !== '--check')) throw new Error('GOVERNANCE_ARGUMENT_UNKNOWN');
  const sha = clean(args.find((arg) => arg.startsWith('--sha='))?.slice(6));
  if (!/^[a-f\d]{40}$/i.test(sha)) throw new Error('GOVERNANCE_EXACT_SHA_REQUIRED');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== sha) throw new Error('GOVERNANCE_SHA_MISMATCH');
  const base = process.cwd();
  const result = auditDependencyGovernance({
    rootPackage: loadJson(path.join(base, 'package.json')),
    workspacePackages: { backend: loadJson(path.join(base, 'backend/package.json')), frontend: loadJson(path.join(base, 'frontend/package.json')) },
    lock: loadJson(path.join(base, 'package-lock.json')),
    catalog: loadJson(path.join(base, 'config/dependency-governance-v656.json')),
  });
  const report = { ...result, candidateSha: sha };
  const dir = path.join(base, 'artifacts/dependency-governance-v656', sha);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ candidateSha: sha, status: result.status, directCount: result.directCount, transitiveCount: result.transitiveCount, findings: result.findings.length, artifact: path.relative(base, path.join(dir, 'manifest.json')) })}\n`);
  if (args.includes('--check') && result.status === 'FAIL') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { cli(); } catch (error) { process.stderr.write(`DEPENDENCY_GOVERNANCE_BLOCKED: ${error.message}\n`); process.exitCode = 2; }
}
