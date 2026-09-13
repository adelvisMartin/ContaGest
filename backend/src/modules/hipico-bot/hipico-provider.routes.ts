import { Router } from 'express';
import { operatorTokenConfigured, operatorTokenValid } from './hipico-operator-security.js';
import { hipicoProviderHttpStatus, hipicoProviderPublicError, hipicoProviderRegistry } from './hipico-provider-registry.js';

const router = Router();
const providerRegistry = hipicoProviderRegistry();

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!operatorTokenConfigured()) {
    return res.status(503).json({ ok: false, error: 'HIPICO_OPERATOR_TOKEN_NOT_CONFIGURED' });
  }
  if (!operatorTokenValid(req.header('x-hipico-operator-token') || undefined)) {
    return res.status(401).json({ ok: false, error: 'HIPICO_OPERATOR_UNAUTHORIZED' });
  }
  return next();
});

function providerStatusPayload() {
  return {
    ...providerRegistry.status(),
    sourceWrite: false as const,
    monetaryWrite: false as const,
    effectsAllowed: false as const,
    manualReviewRequired: true as const
  };
}

router.get('/providers', (_req, res) => {
  return res.json({ ok: true, data: providerStatusPayload() });
});

router.get('/providers/status', (_req, res) => {
  return res.json({ ok: true, data: providerStatusPayload() });
});

router.get('/live/stages/:stageId', async (req, res) => {
  try {
    const data = await providerRegistry.getLiveStage(String(req.params.stageId || ''));
    return res.json({
      ok: true,
      data,
      sourceWrite: false,
      monetaryWrite: false,
      effectsAllowed: false,
      manualReviewRequired: true
    });
  } catch (error: any) {
    return res.status(hipicoProviderHttpStatus(error)).json({
      ok: false,
      ...hipicoProviderPublicError(error),
      sourceWrite: false,
      monetaryWrite: false
    });
  }
});

export default router;
