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
    const body = await response.json();
    // A JSON-shaped body served as HTML or JSONP is not an authorized status response.
    // Ignore optional charset parameters, but reject ambiguous/mixed media types.
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    return contentType === 'application/json'
      && response.headers.get('cache-control')?.includes('no-store')
      && body?.ok === true
      && body?.service === 'hipico-control-operations'
      && MODES.has(body?.mode)
      && typeof body?.persistence?.ready === 'boolean'
      && typeof body?.linkedDeviceBridge?.ready === 'boolean'
      && body?.linkedDeviceBridge?.shadowOnly === true
      && body?.linkedDeviceBridge?.sourceSendPossible === false;
  });
  await check('pwa', '/hipico-control/', 'text/html', async (response) => {
    const html = await response.text();
    return /text\/html/i.test(response.headers.get('content-type') || '')
      && /Control Hípico/.test(html)
      && /assets\/js\/app\.js/.test(html);
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
