import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const MODES = new Set(['linked_device_shadow_ready', 'manual_and_persistence_ready', 'offline_and_manual_ready']);

export function checkedBaseUrl(value) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { throw new Error('SMOKE_URL_INVALID'); }
  const localhost = LOOPBACK.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost)) throw new Error('SMOKE_URL_INSECURE');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('SMOKE_URL_NOT_ROOT');
  return url;
}

// Bounded diagnostics: never allocate untrusted remote JSON/HTML bodies without a cap.
// Native fetch responses are streamed; tiny streamless QA doubles stay supported.
const MAX_STATUS_BYTES = 16_384;
const MAX_PWA_BYTES = 65_536;
async function boundedSmokeText(response, maxBytes, allowJsonDouble = false) {
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined) {
    const value = declared.trim();
    if (!/^[0-9]+$/.test(value) || Number(value) > maxBytes) return null;
  }
  if (typeof response.body?.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0, text = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return text + decoder.decode();
        if (!(value instanceof Uint8Array)) return null;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          return null;
        }
        text += decoder.decode(value, { stream: true });
      }
    } finally { reader.releaseLock(); }
  }
  // In-memory test adapters do not expose the native streaming body.
  const text = typeof response.text === 'function'
    ? await response.text()
    : allowJsonDouble && typeof response.json === 'function'
      ? JSON.stringify(await response.json()) : null;
  return typeof text === 'string' && new TextEncoder().encode(text).byteLength <= maxBytes
    ? text : null;
}

export async function runHipicoSmoke(baseUrl, request = fetch) {
  const root = checkedBaseUrl(baseUrl);
  const checks = [];
  const check = async (name, pathname, accept, validate) => {
    try {
      const response = await request(new URL(pathname, root), {
        method: 'GET',
        headers: { Accept: accept, 'Cache-Control': 'no-store' },
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) {
        checks.push({ name, status: 'FAIL', code: 'HTTP_NOT_SUCCESS', httpStatus: response.status });
        return;
      }
      const valid = await validate(response);
      checks.push({ name, status: valid ? 'PASS' : 'FAIL', code: valid ? 'OK' : 'CONTRACT_MISMATCH' });
    } catch (error) {
      const network = ['TypeError', 'TimeoutError', 'AbortError'].includes(error?.name);
      checks.push({ name, status: network ? 'BLOCKED' : 'FAIL', code: network ? 'REQUEST_UNAVAILABLE' : 'CONTRACT_ERROR' });
    }
  };
  await check('status', '/api/hipico/status', 'application/json', async (response) => {
    // Validate the declared media type *before* parsing untrusted bytes.
    // Neither HTML/JSONP nor mixed Content-Type headers may be interpreted as JSON.
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') return false;
    // Cache-Control consists of comma-delimited directives. A substring
    // such as "no-store=false" or "x-no-store" is NOT the no-store directive.
    const directives = response.headers.get('cache-control')?.split(',').map(value => value.trim().toLowerCase());
    if (!directives?.includes('no-store')) return false;
    const raw = await boundedSmokeText(response, MAX_STATUS_BYTES, true);
    if (!raw) return false;
    let body;
    try { body = JSON.parse(raw); }
    catch { return false; }
    return body?.ok === true
      && body?.service === 'hipico-control-operations'
      && MODES.has(body?.mode)
      && typeof body?.persistence?.ready === 'boolean'
      && typeof body?.linkedDeviceBridge?.ready === 'boolean'
      && body?.linkedDeviceBridge?.shadowOnly === true
      && body?.linkedDeviceBridge?.sourceSendPossible === false;
  });
  await check('pwa', '/hipico-control/', 'text/html', async (response) => {
    const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'text/html') return false;
    const html = await boundedSmokeText(response, MAX_PWA_BYTES);
    if (!html) return false;
    // A splash/error document can mention the expected strings in comments or
    // prose without loading the application. Require the real HTML entrypoint.
    const markup = html.replace(/<!--[\s\S]*?-->/g, '');
    const hasTitle = /<title(?:\s[^>]*)?>\s*Control Hípico\s*<\/title\s*>/i.test(markup);
    const hasModule = [...markup.matchAll(/<script\b[^>]*>/gi)].some(([tag]) =>
      /\stype\s*=\s*(["'])module\1/i.test(tag) &&
      /\ssrc\s*=\s*(["'])\.\/assets\/js\/app\.js\1/i.test(tag)
    );
    return hasTitle && hasModule;
  });
  const status = checks.some(x => x.status === 'FAIL') ? 'FAIL' : checks.some(x => x.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
  return { schema: 'hipico-operational-smoke-v1', status, checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find(x => x.startsWith('--base-url='));
  const baseUrl = arg ? arg.slice('--base-url='.length) : 'http://127.0.0.1:8080/';
  try {
    const result = await runHipicoSmoke(baseUrl);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ schema: 'hipico-operational-smoke-v1', status: 'FAIL', code: error.message }));
    process.exitCode = 1;
  }
}
