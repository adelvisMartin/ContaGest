import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_BACKOFF_MS = 15_000;
export const MAX_RACE_PROVIDER_RESPONSE_BYTES = 1_000_000;
export const MAX_RACE_PROVIDER_CACHE_ENTRIES = 128;
export const MAX_RACE_PROVIDER_BACKOFF_MS = 300_000;
const RACE_PROVIDER_VENDOR_DOMAINS = ['sportradar.com', 'betradar.com'] as const;

export type HorseRaceProviderName = 'disabled' | 'sportradar-uof';
export type HorseRaceProviderCircuitState = 'closed' | 'open' | 'half_open';

export type HorseRaceProviderStatus = {
  provider: HorseRaceProviderName;
  configured: boolean;
  enrichmentOnly: true;
  financialAuthority: false;
  reason: string | null;
  timeoutMs: number;
  cacheTtlMs: number;
};

export type HorseRaceProviderRuntimeStatus = HorseRaceProviderStatus & {
  circuitState: HorseRaceProviderCircuitState;
  retryAfterMs: number;
  consecutiveFailures: number;
};

export type HorseRaceStageSummary = {
  provider: 'sportradar-uof';
  stageId: string;
  fetchedAt: string;
  contentType: string;
  xml: string;
  cached: boolean;
};

type RuntimeEnv = Record<string, string | undefined>;
type FetchLike = typeof fetch;
type ResolveLike = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
type CacheEntry = { expiresAt: number; value: HorseRaceStageSummary };

type HorseRaceProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_STAGE_ID'
  | 'CIRCUIT_OPEN'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_DNS_ERROR'
  | 'UPSTREAM_ADDRESS_FORBIDDEN'
  | 'UPSTREAM_RESPONSE_TOO_LARGE'
  | 'UPSTREAM_INVALID_CONTENT';

export class HorseRaceProviderError extends Error {
  constructor(
    message: string,
    public readonly code: HorseRaceProviderErrorCode,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'HorseRaceProviderError';
  }
}

function integerEnv(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function normalizeProvider(value: string | undefined): HorseRaceProviderName {
  return String(value || 'disabled').trim().toLowerCase() === 'sportradar-uof' ? 'sportradar-uof' : 'disabled';
}

function allowedVendorHostname(hostname: string) {
  const value = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  return RACE_PROVIDER_VENDOR_DOMAINS.some((domain) => value === domain || value.endsWith(`.${domain}`));
}

function normalizeBaseUrl(value: string | undefined) {
  const text = String(value || '').trim().replace(/\/$/, '');
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || (url.port && url.port !== '443')) return '';
    if (url.username || url.password || url.search || url.hash) return '';
    if (!allowedVendorHostname(url.hostname)) return '';
    if (url.pathname && url.pathname !== '/') return '';
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function normalizeStageId(value: string) {
  const id = String(value || '').trim();
  if (!/^\d{1,18}$/.test(id)) {
    throw new HorseRaceProviderError('El identificador de etapa hípica no es válido.', 'INVALID_STAGE_ID', false);
  }
  return id;
}

function parseIpv4(value: string) {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet, index) => !/^\d{1,3}$/.test(parts[index]) || !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets;
}

function forbiddenIpv4(value: string) {
  const octets = parseIpv4(value);
  if (!octets) return true;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function expandIpv6(value: string) {
  let text = value.toLowerCase().split('%', 1)[0];
  const dotted = text.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1] || null;
  if (dotted) {
    const octets = parseIpv4(dotted);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, text.length - dotted.length)}${high}:${low}`;
  }
  if ((text.match(/::/g) || []).length > 1) return null;
  const [leftText, rightText = ''] = text.split('::');
  const left = leftText ? leftText.split(':') : [];
  const right = rightText ? rightText.split(':') : [];
  const fill = text.includes('::') ? 8 - left.length - right.length : 0;
  if (fill < 0 || (!text.includes('::') && left.length !== 8)) return null;
  const parts = [...left, ...Array(fill).fill('0'), ...right];
  if (parts.length !== 8) return null;
  const numbers = parts.map((part) => Number.parseInt(part || '0', 16));
  if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part || '0')) || numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return null;
  return numbers;
}

function forbiddenIpv6(value: string) {
  const parts = expandIpv6(value);
  if (!parts) return true;
  if (parts.every((part) => part === 0)) return true;
  if (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1) return true;
  if ((parts[0] & 0xfe00) === 0xfc00) return true;
  if ((parts[0] & 0xffc0) === 0xfe80) return true;
  if ((parts[0] & 0xff00) === 0xff00) return true;
  if (parts[0] === 0x2001 && parts[1] === 0x0db8) return true;
  if (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff) {
    const mapped = `${parts[6] >> 8}.${parts[6] & 0xff}.${parts[7] >> 8}.${parts[7] & 0xff}`;
    return forbiddenIpv4(mapped);
  }
  return false;
}

export function providerAddressForbidden(address: string) {
  const normalized = String(address || '').split('%', 1)[0];
  const family = isIP(normalized);
  if (family === 4) return forbiddenIpv4(normalized);
  if (family === 6) return forbiddenIpv6(normalized);
  return true;
}

async function resolvePublicProviderDestination(hostname: string, resolveImpl: ResolveLike, timeoutMs: number) {
  let timer: NodeJS.Timeout | null = null;
  try {
    const addresses = await Promise.race([
      resolveImpl(hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HorseRaceProviderError('La resolución DNS del proveedor excedió el tiempo máximo.', 'UPSTREAM_TIMEOUT', true)), timeoutMs);
      })
    ]);
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new HorseRaceProviderError('El proveedor hípico no resolvió a una dirección utilizable.', 'UPSTREAM_DNS_ERROR', true);
    }
    for (const entry of addresses) {
      if (!entry || !isIP(entry.address) || providerAddressForbidden(entry.address)) {
        throw new HorseRaceProviderError('El proveedor hípico resolvió a una dirección de red no permitida.', 'UPSTREAM_ADDRESS_FORBIDDEN', false);
      }
    }
  } catch (error: any) {
    if (error instanceof HorseRaceProviderError) throw error;
    throw new HorseRaceProviderError('No se pudo resolver de forma segura el proveedor hípico.', 'UPSTREAM_DNS_ERROR', true);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function responseTooLarge() {
  return new HorseRaceProviderError('La respuesta del proveedor hípico excede el tamaño permitido.', 'UPSTREAM_RESPONSE_TOO_LARGE', false);
}

function circuitOpen(retryAfterMs: number) {
  const error = new HorseRaceProviderError('El proveedor hípico está temporalmente aislado por fallos consecutivos.', 'CIRCUIT_OPEN', true);
  Object.defineProperty(error, 'retryAfterMs', { value: Math.max(0, Math.ceil(retryAfterMs)), enumerable: true });
  return error;
}

function assertXmlResponse(response: Response, text: string) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase().split(';', 1)[0].trim();
  const xmlType = contentType === 'application/xml' || contentType === 'text/xml' || contentType.endsWith('+xml');
  const trimmed = String(text || '').trim();
  if (!xmlType || !trimmed.startsWith('<') || /<!DOCTYPE\b/i.test(trimmed)) {
    throw new HorseRaceProviderError('El proveedor hípico devolvió contenido no válido para enrichment XML.', 'UPSTREAM_INVALID_CONTENT', false);
  }
  return contentType;
}

async function readBoundedText(response: Response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RACE_PROVIDER_RESPONSE_BYTES) throw responseTooLarge();
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RACE_PROVIDER_RESPONSE_BYTES) throw responseTooLarge();
    return text;
  }
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_RACE_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel('response-too-large').catch(() => {});
        throw responseTooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

export function raceProviderStatus(env: RuntimeEnv = process.env): HorseRaceProviderStatus {
  const provider = normalizeProvider(env.HIPICO_RACE_PROVIDER);
  const timeoutMs = integerEnv(env.HIPICO_RACE_PROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 500, 15_000);
  const cacheTtlMs = integerEnv(env.HIPICO_RACE_PROVIDER_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, 1_000, 300_000);
  if (provider === 'disabled') {
    return { provider, configured: false, enrichmentOnly: true, financialAuthority: false, reason: 'RACE_PROVIDER_DISABLED', timeoutMs, cacheTtlMs };
  }
  const baseUrl = normalizeBaseUrl(env.HIPICO_RACE_PROVIDER_BASE_URL);
  const token = String(env.HIPICO_SPORTRADAR_UOF_TOKEN || '').trim();
  const configured = Boolean(baseUrl && token);
  return { provider, configured, enrichmentOnly: true, financialAuthority: false, reason: configured ? null : 'RACE_PROVIDER_CONFIG_INCOMPLETE', timeoutMs, cacheTtlMs };
}

export function createHorseRaceProvider(options: { env?: RuntimeEnv; fetchImpl?: FetchLike; resolveImpl?: ResolveLike; now?: () => number } = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const resolveImpl: ResolveLike = options.resolveImpl || (async (hostname) => lookup(hostname, { all: true, verbatim: true }));
  const now = options.now || Date.now;
  const cache = new Map<string, CacheEntry>();
  const failureThreshold = integerEnv(env.HIPICO_RACE_PROVIDER_FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD, 1, 10);
  const baseBackoffMs = integerEnv(env.HIPICO_RACE_PROVIDER_BACKOFF_MS, DEFAULT_BACKOFF_MS, 1_000, MAX_RACE_PROVIDER_BACKOFF_MS);
  let consecutiveRetryableFailures = 0;
  let openUntil = 0;
  let backoffLevel = 0;
  let halfOpenProbeInFlight = false;

  function circuitState(at: number): HorseRaceProviderCircuitState {
    if (!openUntil) return 'closed';
    return openUntil > at ? 'open' : 'half_open';
  }

  function status(): HorseRaceProviderRuntimeStatus {
    const base = raceProviderStatus(env);
    const at = now();
    const state = circuitState(at);
    return { ...base, circuitState: state, retryAfterMs: state === 'open' ? Math.max(0, openUntil - at) : 0, consecutiveFailures: consecutiveRetryableFailures };
  }

  function pruneCache(at: number) {
    for (const [key, entry] of cache) if (entry.expiresAt <= at) cache.delete(key);
    while (cache.size > MAX_RACE_PROVIDER_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value as string | undefined;
      if (!oldest) break;
      cache.delete(oldest);
    }
  }

  function readCached(stageId: string, at: number) {
    const entry = cache.get(stageId);
    if (!entry) return null;
    if (entry.expiresAt <= at) {
      cache.delete(stageId);
      return null;
    }
    cache.delete(stageId);
    cache.set(stageId, entry);
    return { ...entry.value, cached: true } satisfies HorseRaceStageSummary;
  }

  function remember(stageId: string, value: HorseRaceStageSummary, expiresAt: number) {
    cache.delete(stageId);
    cache.set(stageId, { expiresAt, value });
    pruneCache(now());
  }

  function nextBackoffMs() {
    const exponent = Math.min(backoffLevel, 8);
    return Math.min(baseBackoffMs * (2 ** exponent), MAX_RACE_PROVIDER_BACKOFF_MS);
  }

  function openCircuit(at: number) {
    openUntil = at + nextBackoffMs();
    backoffLevel = Math.min(backoffLevel + 1, 16);
    consecutiveRetryableFailures = 0;
  }

  function recordFailure(at: number, halfOpenProbe: boolean) {
    if (halfOpenProbe) {
      openCircuit(at);
      return;
    }
    consecutiveRetryableFailures += 1;
    if (consecutiveRetryableFailures >= failureThreshold) openCircuit(at);
  }

  function recordSuccess() {
    consecutiveRetryableFailures = 0;
    openUntil = 0;
    backoffLevel = 0;
  }

  async function getStageSummary(stageIdValue: string): Promise<HorseRaceStageSummary> {
    const currentStatus = status();
    if (!currentStatus.configured || currentStatus.provider !== 'sportradar-uof') {
      throw new HorseRaceProviderError('El proveedor hípico externo no está configurado.', 'NOT_CONFIGURED', false);
    }
    const stageId = normalizeStageId(stageIdValue);
    const at = now();
    const cached = readCached(stageId, at);
    if (cached) return cached;
    if (openUntil > at) throw circuitOpen(openUntil - at);
    const halfOpenProbe = Boolean(openUntil && openUntil <= at);
    if (halfOpenProbe && halfOpenProbeInFlight) throw circuitOpen(0);
    if (halfOpenProbe) halfOpenProbeInFlight = true;

    let timeout: NodeJS.Timeout | null = null;
    try {
      const baseUrl = normalizeBaseUrl(env.HIPICO_RACE_PROVIDER_BASE_URL);
      const token = String(env.HIPICO_SPORTRADAR_UOF_TOKEN || '').trim();
      const language = String(env.HIPICO_RACE_PROVIDER_LANGUAGE || 'en').trim().toLowerCase();
      const safeLanguage = /^[a-z]{2}$/.test(language) ? language : 'en';
      const base = new URL(baseUrl);
      await resolvePublicProviderDestination(base.hostname, resolveImpl, currentStatus.timeoutMs);
      const url = `${baseUrl}/v1/sports/${safeLanguage}/sport_events/sr:stage:${stageId}/summary.xml`;
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), currentStatus.timeoutMs);
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/xml,text/xml;q=0.9', 'x-access-token': token },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new HorseRaceProviderError(`El proveedor hípico respondió HTTP ${response.status}.`, 'UPSTREAM_ERROR', response.status >= 500 || response.status === 429);
      }
      const xml = await readBoundedText(response);
      const contentType = assertXmlResponse(response, xml);
      const fetchedAt = now();
      const value: HorseRaceStageSummary = { provider: 'sportradar-uof', stageId, fetchedAt: new Date(fetchedAt).toISOString(), contentType, xml, cached: false };
      remember(stageId, value, fetchedAt + currentStatus.cacheTtlMs);
      recordSuccess();
      return value;
    } catch (error: any) {
      let normalizedError: HorseRaceProviderError;
      if (error instanceof HorseRaceProviderError) normalizedError = error;
      else if (error?.name === 'AbortError') normalizedError = new HorseRaceProviderError('El proveedor hípico excedió el tiempo máximo de respuesta.', 'UPSTREAM_TIMEOUT', true);
      else normalizedError = new HorseRaceProviderError('No se pudo consultar el proveedor hípico externo.', 'UPSTREAM_ERROR', true);
      if (halfOpenProbe || normalizedError.retryable) recordFailure(now(), halfOpenProbe);
      throw normalizedError;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (halfOpenProbe) halfOpenProbeInFlight = false;
    }
  }

  return { status, getStageSummary };
}
