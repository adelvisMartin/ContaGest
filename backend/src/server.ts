import { createApp } from './app.js';
import { env } from './config/env.js';
import { warnIfRuntimeDatabaseUrlLooksWrong } from './config/dbRuntimeGuard.js';
import { startCanonicalOutboundRunner } from './modules/hipico-bot/hipico-outbound-runner.js';
import { logger } from './shared/observability/logger.js';

warnIfRuntimeDatabaseUrlLooksWrong();
const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({
    event: 'service.started',
    port: env.PORT
  }, 'ContaGest API listening');
});

// Disabled by default. Even when enabled, the runner refuses to claim a row
// unless the exact-SHA outbound policy, Meta transport and canonical outbox are ready.
const stopHipicoOutboxRunner = startCanonicalOutboundRunner();

function shutdown(signal: NodeJS.Signals) {
  stopHipicoOutboxRunner();
  logger.info({ event: 'service.shutdown', signal }, 'ContaGest API shutting down');
  server.close((error) => {
    if (error) {
      logger.error({ event: 'service.shutdown_failed', signal, error }, 'ContaGest API shutdown failed');
      process.exitCode = 1;
    }
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
