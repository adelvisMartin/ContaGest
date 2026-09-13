import {
  createHorseRaceProvider,
  HorseRaceProviderError,
  type HorseRaceProviderRuntimeStatus,
  type HorseRaceStageSummary
} from './hipico-race-provider.js';

type RuntimeEnv = Record<string, string | undefined>;
type RaceTransport = {
  status(): HorseRaceProviderRuntimeStatus;
  getStageSummary(stageId: string): Promise<HorseRaceStageSummary>;
};

const DEFAULT_STALE_TTL_MS = 120_000;
const MAX_STALE_TTL_MS = 300_000;
const MAX_LAST_GOOD_ENTRIES = 128;

export type HipicoLiveStageSnapshot = {
  provider: string;
  stageId: string;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  providerStatus: string | null;
  enrichmentOnly: true;
  financialAuthority: false;
  effectsAllowed: false;
  manualReviewRequired: true;
  fallback: 'stale-cache' | null;
};

export type HipicoRaceDataAdapterStatus = {
  provider: string;
  configured: boolean;
  reason: string | null;
  enrichmentOnly: true;
  financialAuthority: false;
  effectsAllowed: false;
  circuitState?: 'closed' | 'open' | 'half_open';
  retryAfterMs?: number;
  consecutiveFailures?: number;
  timeoutMs?: number;
  cacheTtlMs?: number;
};

export type HipicoRaceDataAdapter = {
  name: string;
  status(): HipicoRaceDataAdapterStatus;
  getLiveStage(stageId: string): Promise<HipicoLiveStageSnapshot>;
};

type RegistryOptions = {
  env?: RuntimeEnv;
  adapters?: HipicoRaceDataAdapter[];
  createDefaultTransport?: (options: { env: RuntimeEnv; now: () => number }) => RaceTransport;
  now?: () => number;
};

type LastGoodEntry = { expiresAt: number; value: HipicoLiveStageSnapshot };

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function configuredProviderName(env: RuntimeEnv) {
  return String(env.HIPICO_RACE_PROVIDER || 'disabled').trim().toLowerCase() || 'disabled';
}

function normalizedStageId(value: string) {
  const stageId = String(value || '').trim();
  if (!/^[A-Za-z0-9:_-]{1,120}$/.test(stageId)) {
    throw new HorseRaceProviderError('El identificador de etapa hípica no es válido.', 'INVALID_STAGE_ID', false);
  }
  return stageId;
}

function normalizedFetchedAt(value: string) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) {
    throw new HorseRaceProviderError('El proveedor hípico devolvió una marca temporal inválida.', 'UPSTREAM_INVALID_CONTENT', false);
  }
  return new Date(timestamp).toISOString();
}

function normalizedProviderStatus(value: unknown) {
  const status = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9._:-]{1,80}$/.test(status) ? status : null;
}

export function sportradarProviderStatusFromXml(xml: string) {
  const match = String(xml || '').match(/<sport_event_status\b[^>]*\bstatus\s*=\s*["']([A-Za-z0-9._:-]{1,80})["']/i);
  return normalizedProviderStatus(match?.[1] || null);
}

function canonicalSnapshot(input: Partial<HipicoLiveStageSnapshot> & Pick<HipicoLiveStageSnapshot, 'provider' | 'stageId' | 'fetchedAt'>): HipicoLiveStageSnapshot {
  return {
    provider: String(input.provider || '').trim().slice(0, 80) || 'unknown',
    stageId: normalizedStageId(input.stageId),
    fetchedAt: normalizedFetchedAt(input.fetchedAt),
    cached: Boolean(input.cached),
    stale: Boolean(input.stale),
    providerStatus: normalizedProviderStatus(input.providerStatus),
    enrichmentOnly: true,
    financialAuthority: false,
    effectsAllowed: false,
    manualReviewRequired: true,
    fallback: input.fallback === 'stale-cache' ? 'stale-cache' : null
  };
}

export function createSportradarRaceDataAdapter(transport: RaceTransport): HipicoRaceDataAdapter {
  return {
    name: 'sportradar-uof',
    status() {
      const status = transport.status();
      return {
        provider: 'sportradar-uof',
        configured: status.configured,
        reason: status.reason,
        enrichmentOnly: true,
        financialAuthority: false,
        effectsAllowed: false,
        circuitState: status.circuitState,
        retryAfterMs: status.retryAfterMs,
        consecutiveFailures: status.consecutiveFailures,
        timeoutMs: status.timeoutMs,
        cacheTtlMs: status.cacheTtlMs
      };
    },
    async getLiveStage(stageIdValue: string) {
      const transportSummary = await transport.getStageSummary(normalizedStageId(stageIdValue));
      return canonicalSnapshot({
        provider: 'sportradar-uof',
        stageId: transportSummary.stageId,
        fetchedAt: transportSummary.fetchedAt,
        cached: transportSummary.cached,
        stale: false,
        providerStatus: sportradarProviderStatusFromXml(transportSummary.xml),
        fallback: null
      });
    }
  };
}

export function createHipicoProviderRegistry(options: RegistryOptions = {}) {
  const env = options.env || process.env;
  const now = options.now || Date.now;
  const selectedProvider = configuredProviderName(env);
  const staleTtlMs = boundedInteger(
    env.HIPICO_RACE_PROVIDER_STALE_TTL_MS,
    DEFAULT_STALE_TTL_MS,
    1_000,
    MAX_STALE_TTL_MS
  );
  const adapters = new Map<string, HipicoRaceDataAdapter>();
  for (const adapter of options.adapters || []) {
    const name = String(adapter?.name || '').trim().toLowerCase();
    if (name) adapters.set(name, adapter);
  }
  if (!adapters.has('sportradar-uof')) {
    const createTransport = options.createDefaultTransport || ((factoryOptions: { env: RuntimeEnv; now: () => number }) => (
      createHorseRaceProvider({ env: factoryOptions.env, now: factoryOptions.now })
    ));
    adapters.set('sportradar-uof', createSportradarRaceDataAdapter(createTransport({ env, now })));
  }
  const lastGood = new Map<string, LastGoodEntry>();

  function selectedAdapter() {
    return selectedProvider === 'disabled' ? null : adapters.get(selectedProvider) || null;
  }

  function pruneLastGood(at: number) {
    for (const [key, entry] of lastGood) if (entry.expiresAt <= at) lastGood.delete(key);
    while (lastGood.size > MAX_LAST_GOOD_ENTRIES) {
      const oldest = lastGood.keys().next().value as string | undefined;
      if (!oldest) break;
      lastGood.delete(oldest);
    }
  }

  function status(): HipicoRaceDataAdapterStatus {
    if (selectedProvider === 'disabled') {
      return {
        provider: 'disabled', configured: false, reason: 'RACE_PROVIDER_DISABLED',
        enrichmentOnly: true, financialAuthority: false, effectsAllowed: false
      };
    }
    const adapter = selectedAdapter();
    if (!adapter) {
      return {
        provider: selectedProvider, configured: false, reason: 'RACE_PROVIDER_ADAPTER_NOT_REGISTERED',
        enrichmentOnly: true, financialAuthority: false, effectsAllowed: false
      };
    }
    const adapterStatus = adapter.status();
    return {
      provider: selectedProvider,
      configured: Boolean(adapterStatus.configured),
      reason: adapterStatus.reason ? String(adapterStatus.reason).slice(0, 120) : null,
      enrichmentOnly: true,
      financialAuthority: false,
      effectsAllowed: false,
      ...(adapterStatus.circuitState ? { circuitState: adapterStatus.circuitState } : {}),
      ...(Number.isFinite(adapterStatus.retryAfterMs) ? { retryAfterMs: Math.max(0, Number(adapterStatus.retryAfterMs)) } : {}),
      ...(Number.isFinite(adapterStatus.consecutiveFailures) ? { consecutiveFailures: Math.max(0, Number(adapterStatus.consecutiveFailures)) } : {}),
      ...(Number.isFinite(adapterStatus.timeoutMs) ? { timeoutMs: Math.max(0, Number(adapterStatus.timeoutMs)) } : {}),
      ...(Number.isFinite(adapterStatus.cacheTtlMs) ? { cacheTtlMs: Math.max(0, Number(adapterStatus.cacheTtlMs)) } : {})
    };
  }

  async function getLiveStage(stageIdValue: string) {
    const stageId = normalizedStageId(stageIdValue);
    const adapter = selectedAdapter();
    if (!adapter || !adapter.status().configured) {
      throw new HorseRaceProviderError('El proveedor hípico externo no está configurado.', 'NOT_CONFIGURED', false);
    }
    const key = `${selectedProvider}:${stageId}`;
    const startedAt = now();
    pruneLastGood(startedAt);
    try {
      const adapterValue = await adapter.getLiveStage(stageId);
      const value = canonicalSnapshot({ ...adapterValue, provider: selectedProvider, stageId });
      const completedAt = now();
      lastGood.delete(key);
      lastGood.set(key, { expiresAt: completedAt + staleTtlMs, value });
      pruneLastGood(completedAt);
      return value;
    } catch (error: any) {
      const failedAt = now();
      pruneLastGood(failedAt);
      const cached = lastGood.get(key);
      if (cached && cached.expiresAt > failedAt && (error?.retryable === true || error?.code === 'CIRCUIT_OPEN')) {
        return canonicalSnapshot({ ...cached.value, cached: true, stale: true, fallback: 'stale-cache' });
      }
      throw error;
    }
  }

  return { status, getLiveStage };
}

let singleton: ReturnType<typeof createHipicoProviderRegistry> | null = null;

export function hipicoProviderRegistry() {
  if (!singleton) singleton = createHipicoProviderRegistry();
  return singleton;
}

export function hipicoProviderHttpStatus(error: unknown) {
  if (!(error instanceof HorseRaceProviderError)) return 502;
  if (error.code === 'INVALID_STAGE_ID') return 400;
  if (error.code === 'NOT_CONFIGURED' || error.code === 'CIRCUIT_OPEN') return 503;
  if (error.code === 'UPSTREAM_TIMEOUT') return 504;
  return 502;
}

export function hipicoProviderPublicError(error: unknown) {
  if (error instanceof HorseRaceProviderError) {
    return {
      retryable: error.retryable,
      error: error.message,
      code: error.code,
      enrichmentOnly: true as const,
      financialAuthority: false as const,
      effectsAllowed: false as const,
      manualReviewRequired: true as const
    };
  }
  return {
    retryable: true,
    error: 'No se pudo consultar el proveedor hípico externo.',
    code: 'UPSTREAM_ERROR',
    enrichmentOnly: true as const,
    financialAuthority: false as const,
    effectsAllowed: false as const,
    manualReviewRequired: true as const
  };
}
