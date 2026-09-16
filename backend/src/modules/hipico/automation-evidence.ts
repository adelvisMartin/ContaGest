import crypto from 'node:crypto';
import type { AutomationState } from './agent-contracts.js';

const FORBIDDEN_EVIDENCE_KEY = /(?:token|secret|password|credential|authorization|cookie|api[_-]?key|prototype|constructor|__proto__)/i;
const MAX_EVIDENCE_BYTES = 16 * 1024;
const MAX_EVIDENCE_DEPTH = 16;

function assertEvidenceSafe(value: unknown, depth = 0): void {
  if (depth > MAX_EVIDENCE_DEPTH) throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  if (Array.isArray(value)) {
    for (const item of value) assertEvidenceSafe(item, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_EVIDENCE_KEY.test(key)) throw new Error('HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY');
    assertEvidenceSafe(item, depth + 1);
  }
}

export function sanitizeAgentEvidence(value: unknown) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  assertEvidenceSafe(value);

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EVIDENCE_BYTES) throw new Error('HIPICO_AGENT_EVIDENCE_TOO_LARGE');
  return JSON.parse(serialized) as Record<string, unknown>;
}

export function automationTransitionSignature(input: {
  target: AutomationState;
  ownerApproved: boolean;
  actorRef: string;
}) {
  return crypto.createHash('sha256').update(JSON.stringify({
    target: input.target,
    ownerApproved: Boolean(input.ownerApproved),
    actorRef: input.actorRef
  })).digest('hex');
}

export const __test__ = {
  FORBIDDEN_EVIDENCE_KEY,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_DEPTH,
  assertEvidenceSafe
};
