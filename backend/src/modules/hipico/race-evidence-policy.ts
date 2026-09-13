export const OPERATOR_EVIDENCE_AUTHORITIES = ['operator', 'group_evidence', 'unknown'] as const;
export type OperatorEvidenceAuthority = typeof OPERATOR_EVIDENCE_AUTHORITIES[number];

const OPERATOR_EVIDENCE_AUTHORITY_SET = new Set<string>(OPERATOR_EVIDENCE_AUTHORITIES);

export function operatorEvidenceAuthorityAllowed(value: unknown): value is OperatorEvidenceAuthority {
  return OPERATOR_EVIDENCE_AUTHORITY_SET.has(String(value || '').trim());
}
