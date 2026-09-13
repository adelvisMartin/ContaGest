import { env, fetchWithTimeout, safeEqual, safeTimeoutMs, serverSecret } from './_shared.js';
import { proxyCanonicalRequest, relayCanonicalResponse } from './canonical-backend.js';

const GROUP_KEY = /^[A-Za-z0-9._:-]{3,120}$/;

function bearer(req) {
  const value = String(req.headers.authorization || '').trim();
  return /^Bearer\s+\S{16,}$/i.test(value) ? value : '';
}

async function authenticatedOwner(req) {
  const authorization = bearer(req);
  if (!authorization) return { ok: false, status: 401, code: 'HIPICO_SESSION_REQUIRED' };
  const base = env('HIPICO_SUPABASE_URL').replace(/\/$/, '');
  const apiKey = env('HIPICO_SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetchWithTimeout(`${base}/auth/v1/user`, {
    method: 'GET',
    redirect: 'error',
    headers: { apikey: apiKey, Authorization: authorization, Accept: 'application/json' }
  }, safeTimeoutMs(process.env.HIPICO_SUPABASE_TIMEOUT_MS, 10000));
  if (!response.ok) return { ok: false, status: 401, code: 'HIPICO_SESSION_INVALID' };
  const user = await response.json().catch(() => null);
  const expectedOwner = String(env('HIPICO_OWNER_ID') || '').trim();
  const actualOwner = String(user?.id || '').trim();
  if (!actualOwner || !safeEqual(actualOwner, expectedOwner)) {
    return { ok: false, status: 403, code: 'HIPICO_OWNER_FORBIDDEN' };
  }
  return { ok: true, ownerId: actualOwner };
}

function operatorToken() {
  const preferred = String(process.env.HIPICO_OPERATOR_CONTROL_TOKEN || '').trim();
  if (preferred) return serverSecret('HIPICO_OPERATOR_CONTROL_TOKEN');
  return serverSecret('HIPICO_BOT_OPERATOR_TOKEN');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });

  try {
    const identity = await authenticatedOwner(req);
    if (!identity.ok) return res.status(identity.status).json({ ok: false, code: identity.code });

    const groupKey = String(req.query?.groupKey || '').trim();
    if (!GROUP_KEY.test(groupKey)) return res.status(400).json({ ok: false, code: 'HIPICO_GROUP_INVALID' });

    const upstream = await proxyCanonicalRequest({
      path: '/api/v1/hipico/command-center',
      headers: {
        'x-hipico-operator-token': operatorToken(),
        'x-hipico-group-key': groupKey,
        accept: 'application/json'
      }
    });
    return relayCanonicalResponse(res, upstream);
  } catch (error) {
    const code = String(error?.code || error?.message || 'HIPICO_COMMAND_CENTER_PROXY_FAILED').slice(0, 120);
    const unavailable = code.includes('NOT_CONFIGURED') || code.includes('Missing server configuration');
    return res.status(unavailable ? 503 : 502).json({
      ok: false,
      code: code.startsWith('HIPICO_') ? code : 'HIPICO_COMMAND_CENTER_PROXY_FAILED',
      retryable: true
    });
  }
}

export const __test__ = { bearer, authenticatedOwner, operatorToken };