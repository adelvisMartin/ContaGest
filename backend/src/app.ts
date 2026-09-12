import express, { type Request } from 'express';
import helmet from 'helmet';
import { env, isProd } from './config/env.js';
import apiRoutes from './modules/index.js';
import authRoutes from './modules/auth/auth.routes.js';
import hipicoWebhookRoutes from './modules/hipico-bot/hipico-webhook.routes.js';
import hipicoBridgeRoutes from './modules/hipico-bot/hipico-bridge.routes.js';
import hipicoOperatorRoutes from './modules/hipico-bot/hipico-operator.routes.js';
import hipicoCanonicalRoutes from './modules/hipico-bot/hipico-canonical.routes.js';
import hipicoProviderRoutes from './modules/hipico-bot/hipico-provider.routes.js';
import { requestContext } from './shared/middleware/context.js';
import { errorHandler, notFound } from './shared/middleware/error.js';
import {
  authRateLimit,
  collectCspReport,
  corsPolicy,
  cspReportRateLimit,
  csrfProtection,
  enforceProductionSecrets,
  expensiveOperationRateLimit,
  globalRateLimit,
  mutationRateLimit,
  requestId,
  suspiciousRequestGuard,
  securityResponseHeaders
} from './shared/middleware/security.js';
import { registerHealthRoutes, type ReadinessCheck } from './shared/observability/health.js';
import { requestObservability } from './shared/observability/http.js';

export function createApp(options: { readinessCheck?: ReadinessCheck } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(requestObservability);
  app.use(suspiciousRequestGuard);
  app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: isProd ? undefined : false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
  app.use(securityResponseHeaders);
  app.use(corsPolicy);

  // Platform probes must remain independent from business authentication and
  // mutation gates. Readiness performs its own bounded/cached DB check.
  registerHealthRoutes(app, { readinessCheck: options.readinessCheck });

  app.use(globalRateLimit);

  // CSP telemetry has no mutation side effect and therefore intentionally sits before
  // the cookie-session CSRF middleware. It accepts only the reporting content types
  // and has its own small body/traffic limits.
  app.post(
    '/api/v1/security/csp-report',
    cspReportRateLimit,
    express.json({ limit: '32kb', type: ['application/csp-report', 'application/reports+json', 'application/json'] }),
    collectCspReport
  );

  app.use(express.json({
    limit: env.JSON_BODY_LIMIT,
    verify: (req, _res, buffer) => {
      if (String((req as Request).originalUrl || req.url || '').startsWith('/api/v1/hipico-bot/webhook')) {
        (req as any).rawBody = Buffer.from(buffer);
      }
    }
  }));

  // Control Hípico is an independent product that temporarily shares this API
  // process. /api/v1/hipico is the canonical domain facade; /hipico-bot remains
  // the compatibility/integration surface for Meta, WhatsApp Web Bridge and
  // operator adapters. None of these token-authenticated routes uses browser
  // cookies, so they live before browser-session CSRF. Read-only provider routes
  // share canonical auth/rate limits; state-changing canonical calls additionally
  // receive the mutation limiter.
  app.use('/api/v1/hipico-bot', hipicoWebhookRoutes);
  app.use('/api/v1/hipico-bot', authRateLimit, hipicoBridgeRoutes);
  app.use('/api/v1/hipico-bot', authRateLimit, hipicoOperatorRoutes);
  app.use('/api/v1/hipico', authRateLimit, hipicoProviderRoutes);
  app.use('/api/v1/hipico', authRateLimit, mutationRateLimit, hipicoCanonicalRoutes);

  app.use(csrfProtection);

  app.use(enforceProductionSecrets);
  app.use('/api/v1/auth', authRateLimit, authRoutes);

  // High-cost routes receive an additional resource-consumption ceiling. The
  // general mutation limiter remains active below for state-changing requests.
  app.use(
    ['/api/v1/ai', '/api/v1/exports', '/api/v1/imports', '/api/v1/reports', '/api/v1/payables'],
    expensiveOperationRateLimit
  );
  app.use('/api/v1', mutationRateLimit, requestContext, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();
