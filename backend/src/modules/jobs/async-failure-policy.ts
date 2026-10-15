// #853 — a bounded policy, not a worker or a provider adapter.
// A provider Error, status code or message is never trusted as retry authority.
const categories = Object.freeze({
  TEMPORARY_PROVIDER_OUTAGE: { code: 'JOB_PROVIDER_UNAVAILABLE', retryable: true },
  PROVIDER_RATE_LIMIT: { code: 'JOB_PROVIDER_RATE_LIMIT', retryable: true },
  TEMPORARY_TRANSPORT: { code: 'JOB_TRANSPORT_UNAVAILABLE', retryable: true },
  PERMANENT_PROVIDER_REJECTION: { code: 'JOB_PROVIDER_REJECTED', retryable: false },
  HANDLER_VERSION_UNAVAILABLE: { code: 'JOB_HANDLER_UNAVAILABLE', retryable: false },
  INVALID_HANDLER_PAYLOAD: { code: 'JOB_HANDLER_PAYLOAD_INVALID', retryable: false },
  SIDE_EFFECT_OUTCOME_UNKNOWN: { code: 'JOB_EFFECT_OUTCOME_UNKNOWN', retryable: false },
} as const);

type Category = keyof typeof categories;
export type AsyncJobFailureDecision = Readonly<{ safeErrorCode: string; retryable: boolean }>;
const issued = new WeakMap<object, Category>();
const unknown = Object.freeze({safeErrorCode: 'JOB_UNCLASSIFIED_FAILURE', retryable: false});
const unsafeRetry = Object.freeze({safeErrorCode: 'JOB_RETRY_UNSAFE_EFFECT', retryable: false});

// May be called only at a reviewed adapter boundary after classifying a failure.
// Arbitrary provider errors never carry this private, object-identity-based authority.
export function makeClassifiedAsyncJobFailure(category: Category): Error {
  if (typeof category !== 'string' || !Object.hasOwn(categories, category)) throw new Error('JOB_FAILURE_CATEGORY_INVALID');
  const failure = new Error('ASYNC_JOB_FAILURE');
  issued.set(failure, category);
  return failure;
}

// Idempotency safety must be established by the calling handler's effect ledger,
// provider idempotency key or CAS contract; this flag does NOT prove it by itself.
export function classifyAsyncJobFailure(
  error: unknown,
  input: Readonly<{ idempotentRetryVerified: boolean }>,
): AsyncJobFailureDecision {
  if (!input || typeof input.idempotentRetryVerified !== 'boolean') {
    throw new Error('JOB_RETRY_SAFETY_REQUIRED');
  }
  // Do not read `error.code`, `.message`, `.stack` or `error.toString()`:
  // provider errors are potentially hostile and often contain credentials/PII.
  const category = error !== null && typeof error === 'object' ? issued.get(error) : undefined;
  if (!category) return unknown;
  const decision = categories[category];
  if (decision.retryable && !input.idempotentRetryVerified) return unsafeRetry;
  return Object.freeze({safeErrorCode: decision.code, retryable: decision.retryable});
}
