/**
 * #761: optimistic-concurrency review *intent* for tenant-owned time entries.
 * Call only with a server-authenticated principal and a row fetched inside a
 * tenant-scoped DB transaction. This function does not authenticate, persist,
 * approve financial billing, or create/update invoices.
 */
export const PROJECT_TIME_REVIEW_INTENT_VERSION = 'project-time-review-intent-v1';

export const PROJECT_TIME_REVIEW_STATES = Object.freeze([
  'draft', 'submitted', 'rejected', 'approved'
] as const);
export type ProjectTimeReviewState = typeof PROJECT_TIME_REVIEW_STATES[number];
export type ProjectTimeReviewAction = 'submit' | 'withdraw' | 'reject' | 'approve' | 'revise';

type TimeEntry = {
  id: string;
  tenantId: string;
  projectId: string;
  memberId: string;
  state: ProjectTimeReviewState;
  revision: number;
  linkedInvoiceId: string | null;
};
type ServerPrincipal = {
  id: string;
  tenantId: string;
  /** Derived from backend RBAC, never passed through from client JSON. */
  canReviewTime: boolean;
};
export type ProjectTimeReviewInput = {
  entry: TimeEntry;
  actor: ServerPrincipal;
  tenantId: string;
  action: ProjectTimeReviewAction;
  expectedRevision: number;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function checkId(value: unknown): void {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new TypeError('PROJECT_TIME_REVIEW_REFERENCE_INVALID');
  }
}
const TRANSITIONS: Readonly<Record<ProjectTimeReviewAction, {
  from: ProjectTimeReviewState;
  to: ProjectTimeReviewState;
  principal: 'owner' | 'reviewer';
}>> = Object.freeze({
  submit: { from: 'draft', to: 'submitted', principal: 'owner' },
  withdraw: { from: 'submitted', to: 'draft', principal: 'owner' },
  reject: { from: 'submitted', to: 'rejected', principal: 'reviewer' },
  approve: { from: 'submitted', to: 'approved', principal: 'reviewer' },
  revise: { from: 'rejected', to: 'draft', principal: 'owner' }
});

export function prepareProjectTimeReviewIntent(input: ProjectTimeReviewInput) {
  if (!input || typeof input !== 'object' || !input.entry || !input.actor) {
    throw new TypeError('PROJECT_TIME_REVIEW_REFERENCE_INVALID');
  }
  const { entry, actor, tenantId, action, expectedRevision } = input;
  for (const id of [tenantId, entry.id, entry.tenantId, entry.projectId,
    entry.memberId, actor.id, actor.tenantId]) checkId(id);
  if (entry.tenantId !== tenantId || actor.tenantId !== tenantId) {
    throw new TypeError('PROJECT_TIME_REVIEW_SCOPE_MISMATCH');
  }
  if (entry.linkedInvoiceId !== null) {
    // Even an invalid linked invoice reference is a hard stop, not a bypass.
    throw new TypeError('PROJECT_TIME_REVIEW_FINANCIALLY_LOCKED');
  }
  if (typeof actor.canReviewTime !== 'boolean') {
    throw new TypeError('PROJECT_TIME_REVIEW_PRINCIPAL_INVALID');
  }
  if (!Number.isSafeInteger(entry.revision) || entry.revision < 1 ||
      entry.revision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new TypeError('PROJECT_TIME_REVIEW_REVISION_INVALID');
  }
  if (entry.revision !== expectedRevision) {
    throw new TypeError('PROJECT_TIME_REVIEW_STALE_REVISION');
  }
  if (!PROJECT_TIME_REVIEW_STATES.includes(entry.state)) {
    throw new TypeError('PROJECT_TIME_REVIEW_STATE_INVALID');
  }
  if (!Object.hasOwn(TRANSITIONS, action)) {
    throw new TypeError('PROJECT_TIME_REVIEW_ACTION_INVALID');
  }
  const transition = TRANSITIONS[action];
  if (entry.state !== transition.from) {
    // Approved is terminal; after invoicing only financial reversals may apply.
    throw new TypeError('PROJECT_TIME_REVIEW_TRANSITION_INVALID');
  }
  if (transition.principal === 'owner') {
    if (actor.id !== entry.memberId) {
      throw new TypeError('PROJECT_TIME_REVIEW_FORBIDDEN');
    }
  } else if (actor.canReviewTime !== true || actor.id === entry.memberId) {
    // Reviewer grant comes from server-side RBAC; reject self approval/rejection.
    throw new TypeError('PROJECT_TIME_REVIEW_FORBIDDEN');
  }
  return Object.freeze({
    version: PROJECT_TIME_REVIEW_INTENT_VERSION,
    tenantId,
    entryId: entry.id,
    projectId: entry.projectId,
    actorId: actor.id,
    action,
    expectedRevision,
    proposedRevision: expectedRevision + 1,
    previousState: entry.state,
    proposedState: transition.to,
    requiresAtomicTenantScopedCompareAndSwap: true as const,
    persisted: false as const,
    billableAuthorized: false as const,
    invoiceAuthorized: false as const
  });
}
