import { createTelemetryContext, sanitizeTelemetryAttributes } from './context.js';
import { logger, sanitizeLogValue } from './logger.js';

type JobLog = Pick<typeof logger, 'debug' | 'info' | 'warn' | 'error'>;
type CompletionLevel = 'debug' | 'info';

type ObserveJobOptions<T> = {
  log?: JobLog;
  completionLevel?: CompletionLevel | ((result: T) => CompletionLevel);
  summarize?: (result: T) => Record<string, unknown>;
};

function elapsedMs(startedAt: bigint) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function completionLevel<T>(option: ObserveJobOptions<T>['completionLevel'], result: T): CompletionLevel {
  if (typeof option === 'function') return option(result);
  return option || 'debug';
}

export async function observeJob<T>(
  name: string,
  run: () => Promise<T> | T,
  options: ObserveJobOptions<T> = {}
): Promise<T> {
  const log = options.log || logger;
  const telemetry = createTelemetryContext();
  const startedAt = process.hrtime.bigint();
  const job = sanitizeLogValue(name, 120) || 'unnamed';
  const base = {
    job,
    correlationId: telemetry.correlationId,
    traceId: telemetry.traceId,
    spanId: telemetry.spanId
  };

  log.debug({ ...base, event: 'job.started' }, 'job started');

  try {
    const result = await run();
    const summary = options.summarize
      ? sanitizeTelemetryAttributes(options.summarize(result))
      : {};
    const fields = {
      ...base,
      ...summary,
      event: 'job.completed',
      durationMs: Number(elapsedMs(startedAt).toFixed(3))
    };

    if (completionLevel(options.completionLevel, result) === 'info') log.info(fields, 'job completed');
    else log.debug(fields, 'job completed');
    return result;
  } catch (error) {
    log.error({
      ...base,
      event: 'job.failed',
      durationMs: Number(elapsedMs(startedAt).toFixed(3)),
      errorType: sanitizeLogValue(error instanceof Error ? error.name : typeof error, 80) || 'Error'
    }, 'job failed');
    throw error;
  }
}
