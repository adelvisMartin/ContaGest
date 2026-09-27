import { Router } from 'express';
import { fail } from '../../shared/http.js';
import { setLegacyApiDeprecationHeaders } from '../../shared/contracts/apiGovernance.js';
import { operatorTokenConfigured, operatorTokenValid } from './hipico-operator-security.js';
import { hipicoProviderHttpStatus, hipicoProviderPublicError, hipicoProviderRegistry } from './hipico-provider-registry.js';

const router = Router();
const providerRegistry = hipicoProviderRegistry();

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  setLegacyApiDeprecationHeaders(res, {
    successorPath: '/api/v1/hipico/providers',
    sunset: process.env.HIPICO_LEGACY_PROVIDER_SUNSET || null,
  });
  if (!operatorTokenConfigured()) {
    return fail(req, res, 503, 'El token de operador Hípico no está configurado.', { code: 'HIPICO_OPERATOR_TOKEN_NOT_CONFIGURED' });
  }
  if (!operatorTokenValid(req.header('x-hipico-operator-token') || undefined)) {
    return fail(req, res, 401, 'Credencial de operador Hípico inválida.', { code: 'HIPICO_OPERATOR_UNAUTHORIZED' });
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
    const safe = hipicoProviderPublicError(error) as Record<string, unknown>;
    const code = String(safe.error || safe.code || 'HIPICO_PROVIDER_ERROR');
    const message = String(safe.message || 'El proveedor Hípico no pudo completar la solicitud.');
    return fail(req, res, hipicoProviderHttpStatus(error), message, { code, details: safe });
  }
});

export default router;
