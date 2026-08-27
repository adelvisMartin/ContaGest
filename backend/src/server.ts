import { createApp } from './app.js';
import { env } from './config/env.js';
import { warnIfRuntimeDatabaseUrlLooksWrong } from './config/dbRuntimeGuard.js';
import { logger } from './shared/observability/logger.js';

warnIfRuntimeDatabaseUrlLooksWrong();
const app = createApp();
app.listen(env.PORT, () => {
  logger.info({
    event: 'service.started',
    port: env.PORT
  }, 'ContaGest API listening');
});
