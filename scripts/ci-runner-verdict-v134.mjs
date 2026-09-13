export function classifyRunnerIncident(run, jobs = [], candidateSha) {
  const expectedSha = String(candidateSha || '').trim();
  if (run?.status !== 'completed') return 'NOT_EXECUTED';
  if (String(run?.head_sha || '') !== expectedSha) return 'SHA_MISMATCH';

  const rows = Array.isArray(jobs) ? jobs : [];
  if (rows.length === 0) return 'FAIL_CONFIG_OR_STARTUP';

  const executed = rows.some((job) => {
    const runnerId = Number(job?.runner_id || 0);
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    return runnerId > 0 || steps.length > 0;
  });

  if (run?.conclusion === 'success') return executed ? 'PASS' : 'FAIL_CONFIG_OR_STARTUP';

  const blockedBeforeRunner = run?.conclusion === 'failure' && rows.every((job) => {
    const runnerId = Number(job?.runner_id || 0);
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    return runnerId === 0 && steps.length === 0;
  });

  return blockedBeforeRunner ? 'BLOCKED_RUNNER' : 'FAIL_EXECUTED';
}
