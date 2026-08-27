import { Router } from 'express';
import { asyncHandler, ok, HttpError } from '../../shared/http.js';
import { exchangeRate, serializeDecimal, serializeLegacyNumber, type DecimalValue } from '../../shared/financial/decimal.js';

const router = Router();
const TTL_MS = Number(process.env.BCV_CACHE_TTL_MS || 60 * 60 * 1000);
type CachedRate = { rate: DecimalValue; source: string; updatedAt: string; provider: string; stale: boolean; errors?: string[]; cache?: boolean };
let cache: CachedRate | null = null;

function normalizeRate(value: unknown): DecimalValue | null {
  try {
    const raw = String(value ?? '').trim().replace(',', '.');
    const rate = exchangeRate(raw);
    return rate.isPositive() ? rate : null;
  } catch {
    return null;
  }
}

function serializeRate(result: CachedRate) {
  return {
    ...result,
    rate: serializeLegacyNumber(result.rate),
    rateExact: serializeDecimal(result.rate, 4)
  };
}

async function fetchWithTimeout(url: string, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const providers = [
  {
    source: 'DolarAPI · Oficial',
    url: 'https://ve.dolarapi.com/v1/dolares/oficial',
    parse: (data: any) => ({ rate: normalizeRate(data?.promedio ?? data?.venta ?? data?.compra), updatedAt: data?.fechaActualizacion })
  },
  {
    source: 'Rafnixg BCV API',
    url: 'https://bcv-api.rafnixg.dev/rates/',
    parse: (data: any) => ({ rate: normalizeRate(data?.usd ?? data?.rate ?? data?.value ?? data?.rates?.USD ?? data?.rates?.usd), updatedAt: data?.date || data?.updated_at || data?.updatedAt })
  },
  {
    source: 'PyDolarVE · BCV',
    url: 'https://pydolarve.org/api/v1/dollar?page=bcv',
    parse: (data: any) => ({ rate: normalizeRate(data?.monitors?.usd?.price ?? data?.monitors?.bcv?.price ?? data?.usd?.price ?? data?.price), updatedAt: data?.datetime?.date || data?.updated_at || data?.last_update })
  }
];

async function getBcvRate(): Promise<CachedRate> {
  if (cache?.rate && Date.now() - new Date(cache.updatedAt).getTime() < TTL_MS) return { ...cache, cache: true };
  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const data = await fetchWithTimeout(provider.url);
      const parsed = provider.parse(data);
      if (!parsed.rate) throw new Error('rate inválida o fuera de escala Decimal(18,4)');
      cache = { rate: parsed.rate, source: provider.source, updatedAt: parsed.updatedAt || new Date().toISOString(), provider: provider.source, stale: false };
      return cache;
    } catch (error: any) {
      errors.push(`${provider.source}: ${error.message}`);
    }
  }
  if (cache?.rate) return { ...cache, stale: true, errors };
  throw new HttpError(503, 'No hay proveedor BCV disponible', errors);
}

router.get('/bcv', asyncHandler(async (_req, res) => ok(res, serializeRate(await getBcvRate()))));
router.get('/bcv/providers', (_req, res) => ok(res, providers.map(({ source, url }) => ({ source, url }))));

export default router;
