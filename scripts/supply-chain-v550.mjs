import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha = String(process.env.CANDIDATE_SHA || process.argv.find((arg) => arg.startsWith('--sha='))?.split('=')[1] || '').trim();
if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const command = process.argv[2] || 'generate';
const artifactArgs = process.argv.filter((arg) => arg.startsWith('--artifact=')).map((arg) => arg.slice('--artifact='.length));
const root = path.resolve('artifacts/supply-chain/v550', sha);
const lockPath = path.resolve('package-lock.json');
if (!fs.existsSync(lockPath)) throw new Error('PACKAGE_LOCK_REQUIRED');

function hashFile(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}
function normalizePackageName(packagePath, metadata) {
  if (metadata?.name) return String(metadata.name);
  const marker = 'node_modules/';
  const index = packagePath.lastIndexOf(marker);
  return index >= 0 ? packagePath.slice(index + marker.length) : packagePath;
}
function npmVersionFromUserAgent() {
  const match = /npm\/([^\s]+)/.exec(String(process.env.npm_config_user_agent || ''));
  return match?.[1] || null;
}
function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}
function scanActions() {
  const workflowDir = path.resolve('.github/workflows');
  const findings = [];
  const uses = [];
  for (const file of collectFiles(workflowDir).filter((item) => /\.ya?ml$/i.test(item))) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = /\buses:\s*([^\s@]+)@([^\s#]+)/.exec(line);
      if (!match || match[1].startsWith('./')) return;
      const action = match[1];
      const ref = match[2];
      const pinnedToCommit = /^[a-f0-9]{40}$/i.test(ref);
      const record = { file: path.relative(process.cwd(), file).replaceAll('\\', '/'), line: index + 1, action, ref, pinnedToCommit };
      uses.push(record);
      if (!pinnedToCommit) findings.push({ severity: 'P1', code: 'ACTION_NOT_PINNED_TO_COMMIT', ...record });
    });
  }
  return { uses, findings };
}
function artifactRecords() {
  return artifactArgs.map((input) => {
    const file = path.resolve(input);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`ARTIFACT_NOT_FOUND:${input}`);
    return {
      path: path.relative(process.cwd(), file).replaceAll('\\', '/'),
      bytes: fs.statSync(file).size,
      sha256: hashFile(file)
    };
  });
}

const lockRaw = fs.readFileSync(lockPath, 'utf8');
const lock = JSON.parse(lockRaw);
if (lock.lockfileVersion !== 3 || typeof lock.packages !== 'object') throw new Error('PACKAGE_LOCK_V3_REQUIRED');
const components = Object.entries(lock.packages)
  .filter(([packagePath, metadata]) => packagePath.includes('node_modules/') && metadata && typeof metadata === 'object' && metadata.version)
  .map(([packagePath, metadata]) => {
    const name = normalizePackageName(packagePath, metadata);
    const version = String(metadata.version);
    return {
      type: 'library',
      name,
      version,
      purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
      hashes: metadata.integrity ? [{ alg: 'SRI', content: String(metadata.integrity) }] : [],
      externalReferences: metadata.resolved ? [{ type: 'distribution', url: String(metadata.resolved) }] : [],
      licenses: [{ license: { name: String(metadata.license || 'NOASSERTION') } }],
      properties: [
        { name: 'contagest:dev', value: String(Boolean(metadata.dev)) },
        { name: 'contagest:optional', value: String(Boolean(metadata.optional)) }
      ]
    };
  })
  .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

const prismaVersion = lock.packages['node_modules/prisma']?.version || lock.packages['backend/node_modules/prisma']?.version || null;
const actionAudit = scanActions();
const artifacts = artifactRecords();
const serial = crypto.randomUUID();
const generatedAt = new Date().toISOString();
const lockHash = crypto.createHash('sha256').update(lockRaw).digest('hex');
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${serial}`,
  version: 1,
  metadata: {
    timestamp: generatedAt,
    component: { type: 'application', name: String(lock.name || 'ContaGest'), version: String(lock.version || 'unknown') },
    properties: [
      { name: 'contagest:candidate-sha', value: sha },
      { name: 'contagest:lockfile-sha256', value: lockHash }
    ]
  },
  components
};
const provenance = {
  schemaVersion: 1,
  issue: 550,
  source: { candidateSha: sha, lockfile: 'package-lock.json', lockfileSha256: lockHash },
  toolchain: {
    node: process.version,
    npm: npmVersionFromUserAgent(),
    prisma: prismaVersion,
    platform: `${process.platform}-${process.arch}`
  },
  installPolicy: { command: 'npm ci', frozenLockfile: true, lockfileMutationAllowed: false },
  artifacts,
  sbom: { format: 'CycloneDX', specVersion: '1.5', componentCount: components.length },
  workflowActions: actionAudit,
  generatedAt
};

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'sbom.cdx.json'), JSON.stringify(sbom, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'artifact-checksums.sha256'), artifacts.map((item) => `${item.sha256}  ${item.path}`).join('\n') + (artifacts.length ? '\n' : ''));
fs.writeFileSync(path.join(root, 'action-audit.json'), JSON.stringify(actionAudit, null, 2) + '\n');

const verdict = actionAudit.findings.some((item) => item.severity === 'P0') ? 'FAIL'
  : actionAudit.findings.some((item) => item.severity === 'P1') ? 'FINDINGS'
    : 'PASS';
const summary = { issue: 550, candidateSha: sha, lockfileSha256: lockHash, components: components.length, artifacts: artifacts.length, actionFindings: actionAudit.findings.length, verdict, generatedAt };
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
if (command === 'check' && verdict === 'FAIL') process.exitCode = 2;
