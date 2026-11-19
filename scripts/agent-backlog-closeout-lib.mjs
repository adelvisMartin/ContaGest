const SHA = /^[0-9a-f]{40}$/i;
const PASS_CONCLUSIONS = new Set(['success']);
const ISSUE_CLAIM = /(?:^|\n)\s*Agent-Claim-Issue:\s*#(\d+)\b/i;
const CLOSE_CLAIM = /\b(?:closes|fixes|resolves)\s+#(\d+)\b/i;
const CANDIDATE = /#(\d+)\b/;

function invariant(ok, code) {
  if (!ok) throw new Error(`CLOSEOUT_${code}`);
}
function uniqueNumbers(rows, kind) {
  invariant(Array.isArray(rows), `${kind}_ARRAY_REQUIRED`);
  const ids = new Set();
  for (const row of rows) {
    invariant(row && Number.isSafeInteger(row.number) && row.number > 0, `${kind}_NUMBER_INVALID`);
    invariant(!ids.has(row.number), `${kind}_DUPLICATE`);
    ids.add(row.number);
  }
  return ids;
}
function issueFromPr(pr, issueIds) {
  const body = typeof pr.body === 'string' ? pr.body : '';
  const claim = body.match(ISSUE_CLAIM) || body.match(CLOSE_CLAIM);
  const guessed = typeof pr.title === 'string' ? pr.title.match(CANDIDATE) : null;
  const number = Number((claim || guessed)?.[1]);
  return issueIds.has(number) ? { number, mode: claim ? 'DECLARED' : 'INFERRED_TITLE_ONLY' } : null;
}

/** This is a diagnostic gate; it never grants merge/issue-close authority. */
export function evaluateBacklogCloseout(input) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'INPUT_INVALID');
  invariant(SHA.test(input.mainSha || ''), 'MAIN_SHA_REQUIRED');
  const issueIds = uniqueNumbers(input.issues, 'ISSUE');
  uniqueNumbers(input.prs, 'PR');
  const policy = input.requiredCheckPolicy || { status: 'UNKNOWN', names: [] };
  invariant(['VERIFIED', 'UNKNOWN'].includes(policy.status) && Array.isArray(policy.names), 'CHECK_POLICY_INVALID');
  invariant(policy.names.every(name => typeof name === 'string' && name.length > 0), 'REQUIRED_CHECK_INVALID');
  invariant(new Set(policy.names).size === policy.names.length, 'REQUIRED_CHECK_DUPLICATE');

  const issues = input.issues.map(issue => {
    invariant(issue.state === 'open' && typeof issue.title === 'string' && issue.title.trim(), 'ISSUE_STATE_INVALID');
    return { number: issue.number, title: issue.title,
      priority: /\[P0\]/.test(issue.title) ? 'P0' : /\[P1\]/.test(issue.title) ? 'P1' : 'OTHER',
      status: 'OPEN_UNTIL_ACCEPTANCE_VERIFIED' };
  });
  const prs = input.prs.map(pr => {
    invariant(pr.state === 'open' && typeof pr.title === 'string', 'PR_STATE_INVALID');
    invariant(SHA.test(pr.headSha || '') && SHA.test(pr.baseSha || ''), 'PR_SHA_REQUIRED');
    invariant(Array.isArray(pr.checks), 'PR_CHECKS_ARRAY_REQUIRED');
    const reasons = [];
    if (pr.draft) reasons.push('DRAFT');
    if (pr.baseSha !== input.mainSha) reasons.push('BASE_SHA_DRIFT');
    if (pr.mergeableState === 'dirty' || pr.mergeable === false) reasons.push('MERGE_CONFLICT');
    else if (pr.mergeable !== true || pr.mergeableState !== 'clean') reasons.push('MERGEABILITY_NOT_CLEAN');
    const byName = new Map();
    for (const c of pr.checks) {
      invariant(c && typeof c.name === 'string' && c.name.trim(), 'CHECK_NAME_INVALID');
      if (c.headSha !== pr.headSha) { reasons.push('STALE_CHECK_SHA'); continue; }
      if (byName.has(c.name)) { reasons.push('CHECK_NAME_AMBIGUOUS'); continue; }
      byName.set(c.name, c);
    }
    if (!byName.size) reasons.push('NO_EXACT_SHA_CHECKS');
    for (const c of byName.values()) {
      if (c.status !== 'completed') reasons.push('CHECK_PENDING');
      else if (!PASS_CONCLUSIONS.has(c.conclusion)) reasons.push('CHECK_NOT_SUCCESS');
    }
    if (policy.status !== 'VERIFIED') reasons.push('REQUIRED_POLICY_UNKNOWN');
    else for (const name of policy.names) {
      if (byName.get(name)?.status !== 'completed' || byName.get(name)?.conclusion !== 'success')
        reasons.push(`REQUIRED_CHECK_UNSATISFIED:${name}`);
    }
    const blockers = [...new Set(reasons)].sort();
    return { number: pr.number, title: pr.title, headSha: pr.headSha, baseSha: pr.baseSha,
      mergeableState: pr.mergeableState || 'unknown', claim: issueFromPr(pr, issueIds),
      observedChecks: byName.size, blockers,
      decision: blockers.length ? 'BLOCKED' : 'HUMAN_REVIEW_REQUIRED' };
  });
  return {
    schemaVersion: 1, source: 'EVALUATED_SNAPSHOT_NOT_LIVE_PROOF', mainSha: input.mainSha,
    issueCount: issues.length, openPrCount: prs.length,
    targetBand: { min: 17, max: 20, inBand: issues.length >= 17 && issues.length <= 20,
      automaticIssueClosure: false },
    agentAuthority: 'AGENTS.md', execution: 'SEQUENTIAL_MERGES_ONLY',
    noAutoMerge: true, noAutoClose: true,
    requiredCheckPolicy: policy.status,
    unresolvedConflicts: prs.filter(pr => pr.blockers.includes('MERGE_CONFLICT')).map(pr => pr.number),
    mergeBlocked: prs.filter(pr => pr.decision === 'BLOCKED').map(pr => pr.number),
    issues, prs,
  };
}
