export const OPERATOR_DOCUMENT_AUTHORITIES = ['operator', 'group_evidence', 'unknown'] as const;
export type OperatorDocumentAuthority = typeof OPERATOR_DOCUMENT_AUTHORITIES[number];

const OPERATOR_DOCUMENT_AUTHORITY_SET = new Set<string>(OPERATOR_DOCUMENT_AUTHORITIES);
const APPROVABLE_DOCUMENT_STATUSES = new Set(['extracted', 'review']);

export function operatorDocumentAuthorityAllowed(value: unknown): value is OperatorDocumentAuthority {
  return OPERATOR_DOCUMENT_AUTHORITY_SET.has(String(value || '').trim());
}

export function documentStatusApprovable(value: unknown) {
  return APPROVABLE_DOCUMENT_STATUSES.has(String(value || '').trim());
}
