import { AsyncLocalStorage } from 'node:async_hooks';

export type StoredTelemetryContext = {
  correlationId: string;
  traceId: string;
  spanId: string;
};

const storage = new AsyncLocalStorage<StoredTelemetryContext>();

export function runWithTelemetryContext<T>(context: StoredTelemetryContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function currentTelemetryContext() {
  return storage.getStore();
}
