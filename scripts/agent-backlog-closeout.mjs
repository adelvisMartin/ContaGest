#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { evaluateBacklogCloseout } from './agent-backlog-closeout-lib.mjs';

const args = process.argv.slice(2);
const allowed = new Set(['--repo', '--strict']);
for (let i = 0; i < args.length; i += 1) {
  if (!allowed.has(args[i])) throw new Error('CLOSEOUT_UNSUPPORTED_CLI_ARGUMENT');
  if (args[i] === '--repo') i += 1;
}
const explicit = args.indexOf('--repo');
const fromRemote = () => {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return remote.match(/github\.com[/:]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/)?.[1] || '';
  } catch { return ''; }
};
const repo = explicit >= 0 ? args[explicit + 1] : process.env.GITHUB_REPOSITORY || fromRemote();
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') ||
    (repo || '').split('/').some(part => part === '.' || part === '..'))
  throw new Error('CLOSEOUT_REPOSITORY_REQUIRED');
const token = String(process.env.GITHUB_TOKEN || '').trim();
const base = `https://api.github.com/repos/${repo}`;
const headers = { Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'contagest-closeout-v1' };
if (token) headers.Authorization = `Bearer ${token}`;
async function read(endpoint, allowedStatuses = []) {
  const res = await fetch(`${base}${endpoint}`, { headers, signal: AbortSignal.timeout(15000) });
  if (allowedStatuses.includes(res.status)) return null;
  if (!res.ok) throw new Error(`CLOSEOUT_GITHUB_HTTP_${res.status}:${endpoint.split('?')[0]}`);
  return res.json();
}
async function pages(endpoint, property = null) {
  const output = [];
  const join = endpoint.includes('?') ? '&' : '?';
  for (let page = 1; page <= 10; page += 1) {
    const body = await read(`${endpoint}${join}per_page=100&page=${page}`);
    const part = property ? body?.[property] : body;
    if (!Array.isArray(part)) throw new Error('CLOSEOUT_GITHUB_PAGINATION_INVALID');
    output.push(...part);
    if (part.length < 100) {
      if (property && Number.isInteger(body.total_count) && output.length < body.total_count)
        throw new Error('CLOSEOUT_GITHUB_PAGINATION_INCOMPLETE');
      return output;
    }
  }
  throw new Error('CLOSEOUT_GITHUB_PAGINATION_LIMIT');
}
async function collect() {
  const meta = await read('');
  const defaultBranch = meta.default_branch;
  if (!defaultBranch || !/^[A-Za-z0-9_.-]+$/.test(defaultBranch))
    throw new Error('CLOSEOUT_DEFAULT_BRANCH_INVALID');
  const mainBefore = (await read(`/branches/${encodeURIComponent(defaultBranch)}`)).commit.sha;
  const [issuesRaw, prsRaw, protectedChecks] = await Promise.all([
    pages('/issues?state=open'), pages('/pulls?state=open'),
    read(`/branches/${encodeURIComponent(defaultBranch)}/protection/required_status_checks`, [403, 404]),
  ]);
  const requiredNames = [ ...(protectedChecks?.contexts || []),
    ...((protectedChecks?.checks || []).map(x => x.context).filter(Boolean)) ];
  const requiredCheckPolicy = { status: protectedChecks && requiredNames.length ? 'VERIFIED' : 'UNKNOWN',
    names: [...new Set(requiredNames)] };
  const prs = [];
  for (const summary of prsRaw) {
    const pr = await read(`/pulls/${summary.number}`);
    const sha = pr.head?.sha;
    if (!/^[a-f0-9]{40}$/i.test(sha || '')) throw new Error('CLOSEOUT_PR_SHA_INVALID');
    const [runs, legacy] = await Promise.all([
      pages(`/commits/${sha}/check-runs`, 'check_runs'),
      read(`/commits/${sha}/status`),
    ]);
    const checks = [
      ...runs.map(x => ({ name: x.name, status: x.status, conclusion: x.conclusion,
        headSha: x.head_sha })),
      ...(legacy.statuses || []).map(x => ({ name: x.context,
        status: x.state === 'pending' ? 'in_progress' : 'completed',
        conclusion: x.state === 'success' ? 'success' : x.state,
        headSha: sha })),
    ];
    const now = await read(`/pulls/${summary.number}`);
    if (now.head?.sha !== sha) throw new Error('CLOSEOUT_PR_HEAD_MOVED');
    prs.push({ number: pr.number, title: pr.title, body: pr.body || '', state: pr.state,
      headSha: sha, baseSha: pr.base.sha, draft: pr.draft,
      mergeable: pr.mergeable, mergeableState: pr.mergeable_state, checks });
  }
  const mainAfter = (await read(`/branches/${encodeURIComponent(defaultBranch)}`)).commit.sha;
  if (mainAfter !== mainBefore) throw new Error('CLOSEOUT_MAIN_MOVED_DURING_SCAN');
  return { mainSha: mainBefore, requiredCheckPolicy,
    issues: issuesRaw.filter(x => !x.pull_request).map(x => ({ number: x.number,
      title: x.title, state: x.state })), prs };
}

try {
  const state = { ...evaluateBacklogCloseout(await collect()), source: 'LIVE_GITHUB_READ_ONLY' };
  console.log(JSON.stringify(state, null, 2));
  if (args.includes('--strict') && (state.issueCount || state.mergeBlocked.length))
    process.exitCode = 1;
} catch (error) {
  // Never print GITHUB_TOKEN, authorization headers, or arbitrary response payloads.
  console.error(error instanceof Error ? error.message : 'CLOSEOUT_UNKNOWN_FAILURE');
  process.exitCode = 2;
}
