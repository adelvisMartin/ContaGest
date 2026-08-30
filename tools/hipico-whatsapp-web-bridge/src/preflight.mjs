import { assertRuntimeConfig, loadRuntimeConfig, RUNTIME_MODES, VERSION } from './runtime-config.mjs';
import { assertLocalPromotionSafe } from './promotion-guard.mjs';

const config = assertRuntimeConfig(loadRuntimeConfig());
const promotion = assertLocalPromotionSafe(process.env, process.cwd());

if (config.runtimeMode !== RUNTIME_MODES.PRODUCTION) {
  console.log(`PREFLIGHT_OK version=${VERSION} mode=${config.runtimeMode} backend=not-required killSwitch=${promotion.active?'active':'inactive'}`);
  process.exit(0);
}

const response = await fetch(config.healthUrl, {
  method: 'GET',
  headers: {
    'x-hipico-bridge-token': config.token,
    'x-request-id': `hipico-preflight-${Date.now()}`
  },
  signal: AbortSignal.timeout(config.backendTimeoutMs)
});
const raw = await response.text();
let body = {};
try { body = raw ? JSON.parse(raw) : {}; } catch {}

if (response.status === 401) throw new Error('PREFLIGHT_TOKEN_REJECTED');
if (!response.ok) throw new Error(`PREFLIGHT_HEALTH_HTTP_${response.status}`);
if (body?.ready !== true) throw new Error(`PREFLIGHT_PERSISTENCE_NOT_READY:${(body?.reasons || []).join(',') || 'unknown'}`);
if (body?.mode !== 'shadow') throw new Error('PREFLIGHT_BACKEND_MODE_NOT_SHADOW');
if (body?.sourceSendPossible !== false) throw new Error('PREFLIGHT_SOURCE_SEND_GUARD_MISSING');

console.log(`PREFLIGHT_OK version=${VERSION} mode=production backend=online persistence=ready sourceSendPossible=false killSwitch=inactive build=${body.buildCommit || 'unknown'}`);
