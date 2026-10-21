#!/usr/bin/env node
/**
 * #624: read-only GitHub status census for the original architecture/DB META.
 * No close, merge, release GO or provider evidence is ever inferred from CLOSED.
 */
import { pathToFileURL } from 'node:url';

export const TRACKED_META_624_ISSUES = Object.freeze([
  97, 619, 620, 621, 622, 623, 625, 626, 627, 628, 629, 630, 631,
  632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 645,
  647, 649, 650, 661, 662, 668, 669, 673, 681, 683, 684, 685, 688,
  698, 720, 724, 725, 728
]);
const SHA40 = /^[0-9a-f]{40}$/i;
const EXPECTED = new Set(TRACKED_META_624_ISSUES);
const API = 'https://api.github.com/repos/adelvisMartin/ContaGest';

export function auditMeta624(snapshot) {
  const errors = [];
  const rows = snapshot?.issues;
  const mainSha = snapshot?.mainSha;
  if (!SHA40.test(String(mainSha || ''))) errors.push('META624_MAIN_SHA_INVALID');
  if (!Array.isArray(rows)) errors.push('META624_ISSUES_NOT_ARRAY');
  const seen = new Set();
  const opened = [];
  const closed = [];
  for (const item of Array.isArray(rows) ? rows : []) {
    if (!item || !Number.isSafeInteger(item.number) || !EXPECTED.has(item.number) ||
        !['open', 'closed'].includes(item.state)) {
      errors.push('META624_ISSUE_ROW_INVALID');
      continue;
    }
    if (seen.has(item.number)) {
      errors.push(`META624_DUPLICATE_ISSUE:${item.number}`);
      continue;
    }
    seen.add(item.number);
    if (item.state === 'open') opened.push(item.number);
    else closed.push(item.number);
  }
  const missing = TRACKED_META_624_ISSUES.filter(id => !seen.has(id));
  if (missing.length) errors.push('META624_ISSUE_CENSUS_INCOMPLETE');
  opened.sort((a,b) => a-b);
  closed.sort((a,b) => a-b);
  return {
    schemaVersion: 624,
    mainSha: SHA40.test(String(mainSha || '')) ? mainSha : null,
    observedAt: snapshot?.observedAt ?? null,
    source: snapshot?.source === 'github-live-readonly' ? 'github-live-readonly' : 'unverified-snapshot',
    status: errors.length ? 'INVALID_SNAPSHOT' : opened.length ? 'OPEN_CHILDREN' : 'REVIEW_REQUIRED',
    counts: { tracked: TRACKED_META_624_ISSUES.length, open: opened.length, closed: closed.length, missing: missing.length },
    openIssues: opened, closedIssues: closed, missingIssues: missing,
    errors,
    metaReadyForClosure: false,
    reason: 'GitHub CLOSED/OPEN state is not proportional exact-SHA QA, production readiness, or META DoD evidence.'
  };
}

async function readGithubJson(route, fetcher, token) {
  const url = `${API}${route}`;
  const response = await fetcher(url, {
    redirect: 'error',
    headers: {
      'accept': 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response?.ok) throw new Error(`META624_GITHUB_READ_FAILED:${response?.status ?? 'NO_RESPONSE'}`);
  return response.json();
}

export async function scanLiveMeta624({ fetcher = fetch, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '' } = {}) {
  const before = await readGithubJson('/git/ref/heads/main', fetcher, token);
  const mainSha = before?.object?.sha;
  if (!SHA40.test(String(mainSha || ''))) throw new Error('META624_MAIN_SHA_NOT_VERIFIED');
  const issues = [];
  // Keep API traffic bounded and deterministic (public GitHub has low anonymous limits).
  for (const number of TRACKED_META_624_ISSUES) {
    const issue = await readGithubJson(`/issues/${number}`, fetcher, token);
    if (issue?.number !== number || !['open','closed'].includes(issue?.state) || issue?.pull_request) {
      throw new Error(`META624_GITHUB_ISSUE_INVALID:${number}`);
    }
    issues.push({ number, state: issue.state });
  }
  const after = await readGithubJson('/git/ref/heads/main', fetcher, token);
  if (after?.object?.sha !== mainSha) throw new Error('META624_MAIN_MOVED_DURING_SCAN');
  return auditMeta624({ mainSha, observedAt: new Date().toISOString(), issues, source: 'github-live-readonly' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  scanLiveMeta624().then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'INVALID_SNAPSHOT') process.exitCode = 1;
  }).catch(error => {
    // Never expose a URL query, credentials, or the raw HTTP response.
    console.error('META624_LIVE_SCAN_BLOCKED:', String(error?.message || 'UNKNOWN').replace(/Bearer\s+\S+/gi, '[REDACTED]'));
    process.exitCode = 2;
  });
}
