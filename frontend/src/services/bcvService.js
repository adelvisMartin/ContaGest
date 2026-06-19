import { BackendApi } from './backendApi.js';

const CACHE_KEY = 'contagest_bcv_rate_cache_v2';
const MANUAL_KEY = 'contagest_bcv_manual_rate_v2';
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 6500;

function safeJsonParse(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function nowIso() { return new Date().toISOString(); }

function normalizeRate(value) {
  const num = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function assertRate(result, source) {
  const rate = normalizeRate(result?.rate ?? result?.promedio ?? result?.venta ?? result?.usd ?? result?.value ?? result?.price);
  if (!rate) throw new Error(`Respuesta inválida: ${source}`);
  return {
    rate,
    source: result?.source || result?.fuente || source,
    updatedAt: result?.updatedAt || result?.fechaActualizacion || nowIso(),
    provider: source,
    stale: false
  };
}

async function withTimeout(fetcher, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetcher(controller.signal); }
  finally { clearTimeout(timer); }
}

async function fetchJson(url, source, parser = (data) => data) {
  return withTimeout(async (signal) => {
    const response = await fetch(url, { signal, cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${source} HTTP ${response.status}`);
    const data = await response.json();
    return assertRate(parser(data), source);
  });
}

function getCachedRate(maxAgeMs = DEFAULT_TTL_MS) {
  const cached = safeJsonParse(localStorage.getItem(CACHE_KEY));
  if (!cached?.rate || !cached?.updatedAt) return null;
  const age = Date.now() - new Date(cached.updatedAt).getTime();
  if (Number.isFinite(age) && age <= maxAgeMs) return { ...cached, stale: false, source: `${cached.source || 'Cache'} · cache local` };
  return { ...cached, stale: true, source: `${cached.source || 'Cache'} · cache vencido` };
}

function setCachedRate(rate) {
  const payload = { ...rate, updatedAt: rate.updatedAt || nowIso(), savedAt: nowIso() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  return payload;
}

function getManualRate() {
  const manual = safeJsonParse(localStorage.getItem(MANUAL_KEY));
  const rate = normalizeRate(manual?.rate);
  if (!rate) return null;
  return { rate, source: manual.source || 'Tasa manual de contingencia', updatedAt: manual.updatedAt || nowIso(), provider: 'manual', stale: true };
}

export const BcvService = {
  providers: [
    {
      id: 'backend-proxy',
      label: 'Backend proxy · BCV',
      run: async () => assertRate(await BackendApi.request('/currency/bcv'), 'Backend proxy · BCV')
    },
    {
      id: 'dolarapi-oficial',
      label: 'DolarAPI · Dólar Oficial',
      run: async () => fetchJson('https://ve.dolarapi.com/v1/dolares/oficial', 'DolarAPI · Oficial', (data) => ({
        rate: data?.promedio ?? data?.venta ?? data?.compra,
        source: data?.fuente ? `DolarAPI · ${data.fuente}` : 'DolarAPI · Oficial',
        updatedAt: data?.fechaActualizacion
      }))
    },
    {
      id: 'rafnixg-bcv',
      label: 'Rafnixg BCV API',
      run: async () => fetchJson('https://bcv-api.rafnixg.dev/rates/', 'Rafnixg BCV API', (data) => ({
        rate: data?.usd ?? data?.rate ?? data?.value ?? data?.rates?.USD ?? data?.rates?.usd,
        source: 'Rafnixg BCV API',
        updatedAt: data?.date || data?.updated_at || data?.updatedAt
      }))
    },
    {
      id: 'pydolarve',
      label: 'PyDolarVE · BCV',
      run: async () => fetchJson('https://pydolarve.org/api/v1/dollar?page=bcv', 'PyDolarVE · BCV', (data) => ({
        rate: data?.monitors?.usd?.price ?? data?.monitors?.bcv?.price ?? data?.usd?.price ?? data?.price,
        source: 'PyDolarVE · BCV',
        updatedAt: data?.datetime?.date || data?.updated_at || data?.last_update
      }))
    }
  ],

  getCachedRate,
  setManualRate(rate, note = 'Tasa manual de contingencia') {
    const value = normalizeRate(rate);
    if (!value) throw new Error('La tasa manual no es válida.');
    const payload = { rate: value, source: note, updatedAt: nowIso(), provider: 'manual' };
    localStorage.setItem(MANUAL_KEY, JSON.stringify(payload));
    setCachedRate(payload);
    return payload;
  },

  async fetchRate({ preferCache = false, allowStale = true } = {}) {
    const freshCache = getCachedRate(DEFAULT_TTL_MS);
    if (preferCache && freshCache && !freshCache.stale) return freshCache;

    const errors = [];
    for (const provider of this.providers) {
      try {
        const result = await provider.run();
        const normalized = assertRate(result, provider.label);
        return setCachedRate({ ...normalized, source: normalized.source || provider.label, updatedAt: normalized.updatedAt || nowIso() });
      } catch (error) {
        errors.push(`${provider.label}: ${error.message}`);
      }
    }

    const cached = getCachedRate(Number.POSITIVE_INFINITY);
    if (allowStale && cached) return { ...cached, stale: true, errors };
    const manual = getManualRate();
    if (allowStale && manual) return { ...manual, errors };
    throw new Error(`No se pudo consultar tasa BCV. Plan de contingencia: configura tasa manual. Detalle: ${errors.slice(0, 2).join(' | ')}`);
  },

  async refreshStore(Store, Toast = null) {
    const result = await this.fetchRate({ allowStale: true });
    Store.set({ bcv: result });
    if (Toast) Toast.show(result.stale ? `Tasa BCV cargada desde contingencia: ${result.source}` : `Tasa BCV actualizada: ${result.source}`, result.stale ? 'warning' : 'success');
    return result;
  },

  shouldRefresh(bcv = {}) {
    if (!bcv?.rate || !bcv?.updatedAt) return true;
    const age = Date.now() - new Date(bcv.updatedAt).getTime();
    return !Number.isFinite(age) || age > DEFAULT_TTL_MS;
  }
};
