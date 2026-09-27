import fs from 'node:fs';
import path from 'node:path';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const CLOSURE_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;
const SUPERSESSION_PATTERN = /^Agent-Claim-Supersedes:\s*#?(\d+)\s*$/gim;

export function assertFullSha(value) {
  if (!FULL_SHA.test(String(value ?? ''))) throw new Error('expected a 40-character git SHA');
  return String(value).toLowerCase();
}

export function graphifyFreshness({ headSha, metadataPath }) {
  const normalizedHead = assertFullSha(headSha);
  if (!metadataPath || !fs.existsSync(metadataPath)) {
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

export function writeGraphifyBinding({ headSha, metadataPath, generatedAt = new Date().toISOString() }) {
  const sourceSha = assertFullSha(headSha);
  if (!metadataPath) throw new Error('metadataPath is required');
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

  const explicitlySuperseded = new Map();
  for (const pullRequest of openPullRequests) {
    for (const superseded of pullRequest.supersedes) {
      if (openPullRequests.some((candidate) => candidate.number === superseded)) {
        explicitlySuperseded.set(superseded, pullRequest.number);
      }
    }
  }

  const claimsByIssue = new Map();
  for (const pullRequest of openPullRequests) {
    if (explicitlySuperseded.has(pullRequest.number)) continue;
    for (const issue of pullRequest.claims) {
      const owners = claimsByIssue.get(issue) ?? [];
      owners.push(pullRequest.number);
      claimsByIssue.set(issue, owners);
    }
  }

  const duplicates = [...claimsByIssue.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([issue, owners]) => ({ issue, pullRequests: [...owners].sort((a, b) => a - b) }))
    .sort((a, b) => a.issue - b.issue);

  const superseded = [...explicitlySuperseded.entries()]
    .map(([pullRequest, by]) => ({ pullRequest, by }))
    .sort((a, b) => a.pullRequest - b.pullRequest);

  return {
    ok: duplicates.length === 0,
    code: duplicates.length ? 'DUPLICATE_WORK_CLAIM' : 'OK',
    duplicates,
    superseded,
  };
}

export function unique(values) {
  return [...new Set(values)].sort();
}
