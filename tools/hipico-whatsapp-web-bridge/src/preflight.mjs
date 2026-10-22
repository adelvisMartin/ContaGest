import './source-read-startup-denial.mjs';
import { assertRuntimeConfig, loadRuntimeConfig, RUNTIME_MODES, VERSION } from './runtime-config.mjs';
import { assertLocalPromotionSafe } from './promotion-guard.mjs';
import { policyDiagnostic } from './source-policy-gate.mjs';
import { assertSourceAutoReadDenied } from './source-read-policy-gate.mjs';

// Preflight must NOT say READY for a runtime that is forbidden to read SOURCE.
assertSourceAutoReadDenied();

const config = assertRuntimeConfig(loadRuntimeConfig());
const promotion = assertLocalPromotionSafe(process.env, process.cwd());
const diagnostic = policyDiagnostic(config);

if (promotion.active && config.sourceAutoReplyEnabled) throw new Error('PREFLIGHT_KILL_SWITCH_BLOCKS_SOURCE_REPLY');

if (config.runtimeMode !== RUNTIME_MODES.PRODUCTION) {
  console.log(`PREFLIGHT_OK version=${VERSION} mode=${config.runtimeMode} backend=not-required transport=${diagnostic.transport.id} sourcePolicy=${diagnostic.sourcePolicy.status} labSendPossible=${Boolean(config.labSendEnabled && diagnostic.transport.labSend)} killSwitch=${promotion.active?'active':'inactive'}`);
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
const expectedMode=diagnostic.sourcePolicy.eligible?'safe-auto':'shadow';
if (body?.mode !== expectedMode) throw new Error(`PREFLIGHT_BACKEND_MODE_MISMATCH:${body?.mode||'unknown'}!=${expectedMode}`);
// Never turn a provider policy NO_GO into source-send authorization just
// because both backend and client happen to have the same opt-in flag.
if (!diagnostic.sourcePolicy.eligible && body?.sourceSendPossible !== false) throw new Error('PREFLIGHT_SOURCE_SEND_POLICY_NO_GO');
if (diagnostic.sourcePolicy.eligible && body?.sourceSendPossible !== true) throw new Error('PREFLIGHT_SOURCE_SEND_CONFIG_MISMATCH');

console.log(`PREFLIGHT_OK version=${VERSION} mode=production backend=online persistence=ready transport=${diagnostic.transport.id} sourcePolicy=${diagnostic.sourcePolicy.status} sourceSendPossible=${Boolean(body.sourceSendPossible)} labSendPossible=${Boolean(config.labSendEnabled && diagnostic.transport.labSend)} killSwitch=inactive build=${body.buildCommit || 'unknown'}`);