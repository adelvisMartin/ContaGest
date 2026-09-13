export function classifyWorkflowOutcome(completed, jobs = [], candidateSha) {
  if (completed?.status !== 'completed') return 'NOT_EXECUTED';
  if (String(completed?.head_sha || '') !== String(candidateSha || '')) return 'FAIL';
  if (completed?.conclusion === 'success') return 'PASS';

  const rows = Array.isArray(jobs) ? jobs : [];
  const failedBeforeRunner = completed?.conclusion === 'failure'
    && rows.length > 0
    && rows.every((job) => {
      const runnerId = Number(job?.runner_id || 0);
      const steps = Array.isArray(job?.steps) ? job.steps : [];
      return runnerId === 0 && steps.length === 0;
    });

  return failedBeforeRunner ? 'BLOCKED' : 'FAIL';
}
