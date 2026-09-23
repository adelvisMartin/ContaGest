import express, { type Request } from 'express';
import helmet from 'helmet';
import { env, isProd } from './config/env.js';
import apiRoutes from './modules/index.js';
import authRoutes from './modules/auth/auth.routes.js';
import hipicoSystemRoutes from './modules/hipico/hipico-system.routes.js';
import hipicoDocumentRoutes from './modules/hipico/document.routes.js';
import hipicoProviderRoutes from './modules/hipico/provider.routes.js';
import hipicoRaceRoutes from './modules/hipico/race.routes.js';
import hipicoAgentRoutes from './modules/hipico/agent.routes.js';
import hipicoCommandCenterRoutes from './modules/hipico/command-center.routes.js';
import hipicoOperatorReadRoutes from './modules/hipico/operator-read.routes.js';
import veterinaryGuardianPortalPublicRoutes from './modules/verticals/veterinary-guardian-portal.public.routes.js';
import hipicoWebhookRoutes from './modules/hipico-bot/hipico-webhook.routes.js';
import hipicoBridgeRoutes from './modules/hipico-bot/hipico-bridge.routes.js';
import hipicoOperatorRoutes from './modules/hipico-bot/hipico-operator.routes.js';
import hipicoCanonicalRoutes from './modules/hipico-bot/hipico-canonical.routes.js';
import hipicoLegacyProviderRoutes from './modules/hipico-bot/hipico-provider.routes.js';
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

  // Platform probes remain independent from business authentication and mutation
  // gates. Canonical Control Hipico system probes expose bounded state only.
  registerHealthRoutes(app, { readinessCheck: options.readinessCheck });
  app.use(globalRateLimit);

  app.post(
    '/api/v1/security/csp-report',
    cspReportRateLimit,
    express.json({ limit: '32kb', type: ['application/csp-report', 'application/reports+json', 'application/json'] }),
    collectCspReport
  );

  // Fail closed before spending CPU/memory parsing business payloads when a
  // commercial production deployment lacks its explicit signing/license keys.
  // Health and bounded CSP telemetry above remain available for diagnosis.
  app.use(enforceProductionSecrets);

  app.use(express.json({
    limit: env.JSON_BODY_LIMIT,
    verify: (req, _res, buffer) => {
      if (String((req as Request).originalUrl || req.url || '').startsWith('/api/v1/hipico-bot/webhook')) {
        (req as any).rawBody = Buffer.from(buffer);
      }
    }
  }));

  app.use('/api/v1/hipico/system', authRateLimit, hipicoSystemRoutes);

  // hipico-bot is the compatibility/integration boundary. The legacy provider
  // registry stays reachable here rather than competing with the canonical #286
  // provider API for /api/v1/hipico/providers.
  app.use('/api/v1/hipico-bot', hipicoWebhookRoutes);
  app.use(
    '/api/v1/hipico-bot',
    authRateLimit,
    hipicoBridgeRoutes,
    hipicoOperatorRoutes,
    hipicoLegacyProviderRoutes
  );

  // Raw PDF upload/list/reprocess has its own explicit boundary and shares the
  // same token/scope policy as the remaining canonical Hípico APIs.
  app.use('/api/v1/hipico/documents', authRateLimit, mutationRateLimit, hipicoDocumentRoutes);

  // One canonical limiter chain avoids counting a request repeatedly while it
  // traverses sibling routers. mutationRateLimit skips GET/HEAD/OPTIONS.
  // Individual routers still enforce their own operator/group authorization.
  app.use(
    '/api/v1/hipico',
    authRateLimit,
    mutationRateLimit,
    hipicoProviderRoutes,
    hipicoRaceRoutes,
    hipicoAgentRoutes,
    hipicoCommandCenterRoutes,
    hipicoOperatorReadRoutes,
    hipicoCanonicalRoutes
  );

  app.use('/api/v1/public/veterinary-portal', authRateLimit, veterinaryGuardianPortalPublicRoutes);

  app.use(csrfProtection);
  app.use('/api/v1/auth', authRateLimit, authRoutes);

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
