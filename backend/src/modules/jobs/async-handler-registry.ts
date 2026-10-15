// #853 — only application-owned, reviewed handler schemas may enqueue async work.
// This registry intentionally has no execution/dispatch API or dynamic loading.
const HANDLER_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+\.v[1-9][0-9]*$/;
const EFFECT_GUARDS = new Set(['provider-idempotency', 'effect-ledger', 'compare-and-set']);

export type AsyncJobEffectGuard = 'provider-idempotency' | 'effect-ledger' | 'compare-and-set';
export type AsyncJobHandlerPolicy = Readonly<{
  handlerKey: string;
  effectGuard: AsyncJobEffectGuard;
  validatePayload: (payload: unknown) => boolean;
}>;

export type AsyncJobHandlerRegistry = Readonly<{
  keys: readonly string[];
  assertAllowed: (handlerKey: string, payload: unknown) => void;
}>;

// A structural lookalike cannot authorize an enqueue.
const issuedRegistries = new WeakSet<AsyncJobHandlerRegistry>();

export function createAsyncJobHandlerRegistry(entries: readonly AsyncJobHandlerPolicy[]): AsyncJobHandlerRegistry {
  if (!Array.isArray(entries) || entries.length > 32) throw new Error('ASYNC_HANDLER_REGISTRY_INVALID');
  const validators = new Map<string, (payload: unknown) => boolean>();
  for (const entry of entries) {
    if (!entry || typeof entry.handlerKey !== 'string' || entry.handlerKey.length > 100 ||
      !HANDLER_KEY.test(entry.handlerKey) || !EFFECT_GUARDS.has(entry.effectGuard) ||
      typeof entry.validatePayload !== 'function') {
      throw new Error('ASYNC_HANDLER_REGISTRATION_INVALID');
    }
    if (validators.has(entry.handlerKey)) throw new Error('ASYNC_HANDLER_DUPLICATE');
    validators.set(entry.handlerKey, entry.validatePayload);
  }
  const registry = Object.freeze({
    keys: Object.freeze([...validators.keys()].sort()),
    assertAllowed(handlerKey: string, payload: unknown): void {
      const validate = validators.get(handlerKey);
      if (!validate) throw new Error('ASYNC_HANDLER_NOT_REGISTERED');
      try {
        // The validator must be a pure check, never a normalization step.
        // A mutated value could approve a different payload than was hashed.
        const snapshot = JSON.stringify(payload);
        if (validate(payload) !== true || JSON.stringify(payload) !== snapshot) {
          throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
        }
      } catch {
        // Never propagate messages from a schema checker that may include raw PII.
        throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
      }
    },
  });
  issuedRegistries.add(registry);
  return registry;
}

export function assertApprovedAsyncJobHandler(registry: AsyncJobHandlerRegistry, handlerKey: string, payload: unknown): void {
  if (!registry || !issuedRegistries.has(registry)) throw new Error('ASYNC_HANDLER_REGISTRY_UNTRUSTED');
  registry.assertAllowed(handlerKey, payload);
}
