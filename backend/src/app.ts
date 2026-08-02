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
  corsPolicy,
  enforceProductionSecrets,
  globalRateLimit,
  requestId,
  suspiciousRequestGuard,
  securityResponseHeaders
} from './shared/middleware/security.js';

const healthPayload = () => ({
  ok: true,
  status: 'healthy',
  service: 'ContaGest-VE API',
  version: '11.12.0',
  timestamp: new Date().toISOString()
});

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(securityResponseHeaders);
  app.use(suspiciousRequestGuard);
  app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: isProd ? undefined : false,
    hsts: isProd ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false
  }));
  app.use(corsPolicy);
  app.use(globalRateLimit);
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(morgan(isProd ? 'combined' : 'dev'));

  app.get('/health', (_req, res) => res.json(healthPayload()));
  app.get('/api/health', (_req, res) => res.json(healthPayload()));
  app.get('/api/v1/health', (_req, res) => res.json(healthPayload()));

  app.use(enforceProductionSecrets);
  app.use('/api/v1/auth', authRateLimit, authRoutes);
  app.use('/api/v1', requestContext, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();

