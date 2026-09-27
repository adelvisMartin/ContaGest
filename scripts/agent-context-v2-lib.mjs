import fs from 'node:fs';
import path from 'node:path';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const CLOSURE_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;
const SUPERSESSION_PATTERN = /^Agent-Claim-Supersedes:\s*#?(\d+)\s*$/gim;

export function assertFullSha(value) {
  if (!FULL_SHA.test(String(value ?? ''))) throw new Error('expected a 40-character git SHA');
  return String(value).toLowerCase();
}

function resolveGraphPath(metadataPath, graphPath) {
  if (graphPath) return graphPath;
  return metadataPath ? path.join(path.dirname(metadataPath), 'graph.json') : '';
}

function hasUsableGraphArtifact(graphPath) {
  if (!graphPath || !fs.existsSync(graphPath)) return false;
  try {
    const stat = fs.statSync(graphPath);
    if (!stat.isFile() || stat.size === 0) return false;
    JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

export function graphifyFreshness({ headSha, metadataPath, graphPath }) {
  const normalizedHead = assertFullSha(headSha);
  const resolvedGraphPath = resolveGraphPath(metadataPath, graphPath);
  if (!metadataPath || !fs.existsSync(metadataPath) || !hasUsableGraphArtifact(resolvedGraphPath)) {
    return { status: 'UNAVAILABLE', sourceSha: null, headSha: normalizedHead };
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const sourceSha = assertFullSha(metadata.sourceSha);
    return {
      status: sourceSha === normalizedHead ? 'CURRENT' : 'STALE',
      sourceSha,
      headSha: normalizedHead,
    };
  } catch {
    return { status: 'UNAVAILABLE', sourceSha: null, headSha: normalizedHead };
  }
}

export function writeGraphifyBinding({ headSha, metadataPath, graphPath, generatedAt = new Date().toISOString() }) {
  const sourceSha = assertFullSha(headSha);
  if (!metadataPath) throw new Error('metadataPath is required');
  const resolvedGraphPath = resolveGraphPath(metadataPath, graphPath);
  if (!hasUsableGraphArtifact(resolvedGraphPath)) {
    throw new Error('Graphify graph artifact is required before binding source SHA');
  }
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  const payload = { schemaVersion: 1, sourceSha, generatedAt };
  fs.writeFileSync(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function extractExclusiveIssueClaims(body = '') {
  const issues = new Set();
  for (const match of String(body).matchAll(CLOSURE_PATTERN)) issues.add(Number(match[1]));
  return [...issues].sort((a, b) => a - b);
}

function extractSupersededPullRequests(body = '') {
  const pullRequests = new Set();
  for (const match of String(body).matchAll(SUPERSESSION_PATTERN)) pullRequests.add(Number(match[1]));
  return [...pullRequests].filter(Number.isInteger).sort((a, b) => a - b);
}

export function detectDuplicateExclusiveClaims(pullRequests = []) {
  const openPullRequests = pullRequests
    .filter((pullRequest) => pullRequest?.state !== 'closed')
    .map((pullRequest) => ({
      number: Number(pullRequest.number),
      body: String(pullRequest.body ?? ''),
      claims: extractExclusiveIssueClaims(pullRequest.body ?? ''),
      supersedes: extractSupersededPullRequests(pullRequest.body ?? ''),
    }))
    .filter((pullRequest) => Number.isInteger(pullRequest.number));

  const byNumber = new Map(openPullRequests.map((pullRequest) => [pullRequest.number, pullRequest]));
  const supersededClaims = new Map();
  const superseded = [];

  for (const pullRequest of openPullRequests) {
    for (const targetNumber of pullRequest.supersedes) {
      const target = byNumber.get(targetNumber);
      if (!target) continue;
      const sharedIssues = target.claims.filter((issue) => pullRequest.claims.includes(issue));
      if (!sharedIssues.length) continue;
      const current = supersededClaims.get(targetNumber) ?? new Set();
      for (const issue of sharedIssues) current.add(issue);
      supersededClaims.set(targetNumber, current);
      superseded.push({ pullRequest: targetNumber, by: pullRequest.number });
    }
  }

  const claimsByIssue = new Map();
  for (const pullRequest of openPullRequests) {
    for (const issue of pullRequest.claims) {
      if (supersededClaims.get(pullRequest.number)?.has(issue)) continue;
      const owners = claimsByIssue.get(issue) ?? [];
      owners.push(pullRequest.number);
      claimsByIssue.set(issue, owners);
    }
  }

  const duplicates = [...claimsByIssue.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([issue, owners]) => ({ issue, pullRequests: [...owners].sort((a, b) => a - b) }))
    .sort((a, b) => a.issue - b.issue);

  const normalizedSuperseded = [...new Map(
    superseded.map((entry) => [`${entry.pullRequest}:${entry.by}`, entry]),
  ).values()].sort((a, b) => a.pullRequest - b.pullRequest || a.by - b.by);

  return {
    ok: duplicates.length === 0,
    code: duplicates.length ? 'DUPLICATE_WORK_CLAIM' : 'OK',
    duplicates,
    superseded: normalizedSuperseded,
  };
}

export function unique(values) {
  return [...new Set(values)].sort();
}
