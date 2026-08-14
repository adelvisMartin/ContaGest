import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isProd } from './config/env.js';
import apiRoutes from './modules/index.js';
import authRoutes from './modules/auth/auth.routes.js';
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

const healthPayload = () => ({
  ok: true,
  status: 'healthy',
  service: 'ContaGest-VE API',
  version: '11.14.0',
  timestamp: new Date().toISOString()
});

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
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

  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(csrfProtection);
  app.use(morgan(isProd ? 'combined' : 'dev'));

  app.get('/health', (_req, res) => res.json(healthPayload()));
  app.get('/api/health', (_req, res) => res.json(healthPayload()));
  app.get('/api/v1/health', (_req, res) => res.json(healthPayload()));

  app.use(enforceProductionSecrets);
  app.use('/api/v1/auth', authRateLimit, authRoutes);

  // High-cost routes receive an additional resource-consumption ceiling. The
  // general mutation limiter remains active below for state-changing requests.
  app.use(
    ['/api/v1/ai', '/api/v1/exports', '/api/v1/imports', '/api/v1/reports'],
    expensiveOperationRateLimit
  );
  app.use('/api/v1', mutationRateLimit, requestContext, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();
