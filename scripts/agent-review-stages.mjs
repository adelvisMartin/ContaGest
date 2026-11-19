/**
 * Review handoffs for ticket routing. These are not active workers or ACTIVE skills.
 * A capable execution harness must load each profile and record evidence.
 */
const TASK_TYPES = new Set(['feature', 'bugfix', 'refactor', 'migration', 'incident', 'audit', 'design']);
const RISKS = new Set(['P0', 'P1', 'P2', 'P3']);

export function planTicketReviewStages({ type = 'feature', risk = 'P2' } = {}) {
  if (!TASK_TYPES.has(type) || !RISKS.has(risk)) {
    throw new Error('AGENT_ROUTE_AMBIGUOUS invalid ticket review type or risk');
  }

  const stages = [];
  if (type !== 'audit') {
    stages.push({
      id: 'foda-senior',
      profile: '.agents/agents/foda-senior.md',
      phase: type === 'incident' ? 'after-stabilization' : 'after-first-implementation',
      role: 'advisory',
      required: false,
      canApproveMerge: false,
      output: 'evidence-grounded FODA with NOW / FOLLOW-UP / REJECT decisions',
    });
  }
  stages.push({
    id: 'auditoria-independiente',
    profile: '.agents/agents/auditoria-independiente.md',
    phase: 'pre-pr-and-pre-merge',
    role: 'independent-review',
    required: true,
    canApproveMerge: false,
    output: 'AC-to-diff-to-test evidence matrix and blocking findings for qa-release',
    independence: risk === 'P0' || risk === 'P1'
      ? 'separate-reviewer-required'
      : 'separate-reviewer-preferred',
  });
  return stages;
}
