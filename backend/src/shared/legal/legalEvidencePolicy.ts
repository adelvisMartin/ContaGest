export const LEGAL_EVIDENCE_PRIVACY_POLICY = 'authenticated-context-no-network-identifiers.v1';

/**
 * Legal acceptance is already attributable to an authenticated user, tenant,
 * document version/hash and server timestamp. Until Venezuelan counsel approves
 * a different retention rule, do not add raw IP addresses or user-agent strings
 * to contractual acceptance/cookie evidence. Those identifiers are not required
 * for the application to prove which authenticated account accepted which exact
 * document version.
 *
 * This policy is intentionally fail-private and only covers the legal evidence
 * records written by the legal module. General HTTP/security log retention is a
 * separate operational policy and must be reviewed independently.
 */
export function legalEvidencePrivacyContext() {
  return {
    ipAddress: null,
    userAgent: null,
    metadata: {
      evidencePrivacyPolicy: LEGAL_EVIDENCE_PRIVACY_POLICY,
      networkIdentifierRetained: false,
      userAgentRetained: false
    }
  } as const;
}
