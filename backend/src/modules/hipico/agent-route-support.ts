import type { AgentRiskContext } from './agent-policy.js';

export function automaticOwnerApprovalConfigured() {
  return String(process.env.HIPICO_AUTOMATIC_OWNER_APPROVED || '').trim().toLowerCase() === 'true';
}

export function sourceReadOnly(groupId: string) {
  const configured = String(process.env.HIPICO_SOURCE_GROUP_ID || '').trim().toLowerCase();
  return Boolean(configured) && configured === String(groupId || '').trim().toLowerCase();
}

export function serverRiskContext(groupId: string): AgentRiskContext {
  return {
    sourceReadOnly: sourceReadOnly(groupId),
    evidenceState: 'MISSING',
    sourceAuthorized: false,
    systemHealthy: true,
    humanOwned: false,
    ambiguous: false
  };
}

export function automationHttpStatus(code: string) {
  if (code.includes('NOT_FOUND')) return 404;
  if (code === 'HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED' || code === 'HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH') return 409;
  if (code.includes('METRICS_INSUFFICIENT') || code === 'OWNER_APPROVAL_REQUIRED' || code === 'INVALID_PROMOTION_PATH') return 409;
  if (code === 'HIPICO_OWNER_NOT_CONFIGURED' || code === 'HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED') return 503;
  return 400;
}
