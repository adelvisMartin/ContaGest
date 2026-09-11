const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_MS = 30_000;
export const MAX_RACE_PROVIDER_RESPONSE_BYTES = 1_000_000;
export const MAX_RACE_PROVIDER_CACHE_ENTRIES = 128;
const RACE_PROVIDER_VENDOR_DOMAINS = ['sportradar.com', 'betradar.com'] as const;

export type HorseRaceProviderName = 'disabled' | 'sportradar-uof';

export type HorseRaceProviderStatus = {
  provider: HorseRaceProviderName;
  configured: boolean;
  enrichmentOnly: true;
  financialAuthority: false;
  reason: string | null;
  timeoutMs: number;
  cacheTtlMs: number;
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
type CacheEntry = { expiresAt: number; value: HorseRaceStageSummary };

export class HorseRaceProviderError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_CONFIGURED' | 'INVALID_STAGE_ID' | 'UPSTREAM_TIMEOUT' | 'UPSTREAM_ERROR' | 'UPSTREAM_RESPONSE_TOO_LARGE' | 'UPSTREAM_INVALID_CONTENT',
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

function responseTooLarge() {
  return new HorseRaceProviderError('La respuesta del proveedor hípico excede el tamaño permitido.', 'UPSTREAM_RESPONSE_TOO_LARGE', false);
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
    return {
      provider,
      configured: false,
      enrichmentOnly: true,
      financialAuthority: false,
      reason: 'RACE_PROVIDER_DISABLED',
      timeoutMs,
      cacheTtlMs
    };
  }
  const baseUrl = normalizeBaseUrl(env.HIPICO_RACE_PROVIDER_BASE_URL);
  const token = String(env.HIPICO_SPORTRADAR_UOF_TOKEN || '').trim();
  const configured = Boolean(baseUrl && token);
  return {
    provider,
    configured,
    enrichmentOnly: true,
    financialAuthority: false,
    reason: configured ? null : 'RACE_PROVIDER_CONFIG_INCOMPLETE',
    timeoutMs,
    cacheTtlMs
  };
}

export function createHorseRaceProvider(options: { env?: RuntimeEnv; fetchImpl?: FetchLike; now?: () => number } = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const cache = new Map<string, CacheEntry>();

  function status() {
    return raceProviderStatus(env);
  }

  function pruneCache(at: number) {
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= at) cache.delete(key);
    }
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

  async function getStageSummary(stageIdValue: string): Promise<HorseRaceStageSummary> {
    const currentStatus = status();
    if (!currentStatus.configured || currentStatus.provider !== 'sportradar-uof') {
      throw new HorseRaceProviderError('El proveedor hípico externo no está configurado.', 'NOT_CONFIGURED', false);
    }

    const stageId = normalizeStageId(stageIdValue);
    const cached = readCached(stageId, now());
    if (cached) return cached;

    const baseUrl = normalizeBaseUrl(env.HIPICO_RACE_PROVIDER_BASE_URL);
    const token = String(env.HIPICO_SPORTRADAR_UOF_TOKEN || '').trim();
    const language = String(env.HIPICO_RACE_PROVIDER_LANGUAGE || 'en').trim().toLowerCase();
    const safeLanguage = /^[a-z]{2}$/.test(language) ? language : 'en';
    const url = `${baseUrl}/v1/sports/${safeLanguage}/sport_events/sr:stage:${stageId}/summary.xml`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), currentStatus.timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          accept: 'application/xml,text/xml;q=0.9',
          'x-access-token': token
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new HorseRaceProviderError(`El proveedor hípico respondió HTTP ${response.status}.`, 'UPSTREAM_ERROR', response.status >= 500 || response.status === 429);
      }
      const xml = await readBoundedText(response);
      const contentType = assertXmlResponse(response, xml);
      const fetchedAt = now();
      const value: HorseRaceStageSummary = {
        provider: 'sportradar-uof',
        stageId,
        fetchedAt: new Date(fetchedAt).toISOString(),
        contentType,
        xml,
        cached: false
      };
      remember(stageId, value, fetchedAt + currentStatus.cacheTtlMs);
      return value;
    } catch (error: any) {
      if (error instanceof HorseRaceProviderError) throw error;
      if (error?.name === 'AbortError') {
        throw new HorseRaceProviderError('El proveedor hípico excedió el tiempo máximo de respuesta.', 'UPSTREAM_TIMEOUT', true);
      }
      throw new HorseRaceProviderError('No se pudo consultar el proveedor hípico externo.', 'UPSTREAM_ERROR', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  return { status, getStageSummary };
}