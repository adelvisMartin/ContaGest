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

// Validators run on a detached, frozen JSON snapshot. Running a validator on the
// caller object first and comparing JSON afterwards would still allow side effects
// (including mutations on a rejected request and getter invocation).
function immutableJsonSnapshot(value: unknown, depth = 0, active = new Set<object>()): unknown {
  if (depth > 12) throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
  if (active.has(value)) throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) {
    throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
  }
  active.add(value);
  const snapshot: Record<string, unknown> | unknown[] = array ? [] : {};
  try {
    const keys = Reflect.ownKeys(value);
    if (array && keys.length !== value.length + 1) throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || (array && !/^(0|[1-9][0-9]*)$/.test(key))) {
        throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
      }
      Object.defineProperty(snapshot, key, {
        value: immutableJsonSnapshot(descriptor.value, depth + 1, active),
        enumerable: true, configurable: false, writable: false,
      });
    }
    return Object.freeze(snapshot);
  } finally {
    active.delete(value);
  }
}

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
        if (!payload || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
          throw new Error('ASYNC_HANDLER_PAYLOAD_INVALID');
        }
        const snapshot = immutableJsonSnapshot(payload);
        const serialized = JSON.stringify(snapshot);
        if (new TextEncoder().encode(serialized).byteLength > 16 * 1024 || validate(snapshot) !== true) {
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
