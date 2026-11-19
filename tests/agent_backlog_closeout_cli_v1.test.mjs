import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../scripts/agent-backlog-closeout.mjs', import.meta.url));
const mock = String.raw`
const main = 'a'.repeat(40);
const head = 'b'.repeat(40);
let calls = 0;
globalThis.fetch = async (rawUrl, options) => {
  const path = new URL(rawUrl).pathname.replace('/repos/adelvisMartin/ContaGest', '');
  const headers = { 'content-type': 'application/json' };
  const ok = body => new Response(JSON.stringify(body), { status: 200, headers });
  if (options?.headers?.Authorization !== 'Bearer synthetic-qa-only')
    throw new Error('AUTHORIZATION_HEADER_MISSING_IN_MOCK');
  if (path === '') return ok({ default_branch: 'main' });
  if (path === '/branches/main') return ok({ commit: { sha: main } });
  if (path === '/branches/main/protection/required_status_checks')
    return new Response(JSON.stringify({message:'not accessible'}), {status:403,headers});
  if (path === '/issues') return ok(Array.from({ length: 19 }, (_, i) =>
    ({ number: 637+i, title: '[EPIC] [P1] fixture '+i, state: 'open' })));
  if (path === '/pulls') return ok([{ number: 1341 }]);
  if (path === '/pulls/1341') return ok({ number: 1341, title: 'fix #637', body: '', state: 'open',
    head: { sha: head }, base: { sha: main }, draft: false,
    mergeable: true, mergeable_state: 'unstable' });
  if (path === '/commits/'+head+'/check-runs') return ok({ total_count: 1,
    check_runs: [{ name: 'test', status: 'completed', conclusion: 'failure', head_sha: head }] });
  if (path === '/commits/'+head+'/status') return ok({ statuses: [] });
  throw new Error('UNEXPECTED_MOCK_GITHUB_PATH:'+path);
};
`;
function run(args = []) {
  const result = spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(mock)}`, cli,
    '--repo', 'adelvisMartin/ContaGest', ...args,
  ], { encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: 'synthetic-qa-only' } });
  return result;
}

test('#841 closeout CLI gathers live-style data but never presents failed check as merge permission', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.source, 'LIVE_GITHUB_READ_ONLY');
  assert.equal(report.issueCount, 19);
  assert.equal(report.openPrCount, 1);
  assert.deepEqual(report.mergeBlocked, [1341]);
  assert.ok(report.prs[0].blockers.includes('CHECK_NOT_SUCCESS'));
  assert.ok(report.prs[0].blockers.includes('REQUIRED_POLICY_UNKNOWN'));
  assert.equal(report.noAutoMerge, true);
});

test('#841 strict closeout returns failure while issues and CI blockers remain', () => {
  const result = run(['--strict']);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.targetBand.inBand, true);
  assert.equal(report.noAutoClose, true);
});

test('#841 GitHub hostname cannot be changed by malformed repository selector', () => {
  const result = run(['--repo', '../..']);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /"noAutoMerge"/);
});
