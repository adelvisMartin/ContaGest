import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createSportradarRacingProvider } from '../src/modules/hipico/sportradar-provider.adapter.js';
import type { RacingDataProvider } from '../src/modules/hipico/racing-provider.js';

function codedError(code: string, retryable = false) {
  return Object.assign(new Error(code), { code, retryable });
}

export function parseLiveProbeStageId(value: unknown) {
  const stageId = String(value || '').trim();
  if (!/^\d{1,18}$/.test(stageId)) {
    throw codedError('HIPICO_LIVE_PROBE_STAGE_ID_INVALID');
  }
  return stageId;
}

export async function probeRacingProvider(provider: RacingDataProvider, rawStageId: unknown) {
  const stageId = parseLiveProbeStageId(rawStageId);
  const health = await provider.health();
  if (!health.configured || health.state !== 'ready') {
    throw codedError('HIPICO_PROVIDER_LIVE_PROBE_NOT_CONFIGURED', false);
  }
  if (!health.capabilities.includes('getRace')) {
    throw codedError('HIPICO_PROVIDER_LIVE_PROBE_CAPABILITY_UNAVAILABLE', false);
  }

  const record = await provider.getRace(stageId);
  if (record.provenance.financialAuthority !== false) {
    throw codedError('HIPICO_PROVIDER_FINANCIAL_AUTHORITY_FORBIDDEN');
  }

  return {
    ok: true as const,
    provider: record.provenance.provider,
    raceId: String(record.data.id || '').slice(0, 220),
    status: String(record.data.status || 'unknown').slice(0, 120),
    runnerCount: Array.isArray(record.data.runners) ? record.data.runners.length : 0,
    hasResult: Boolean(record.data.result),
    sourceTimestamp: record.provenance.sourceTimestamp,
    fetchedAt: record.provenance.fetchedAt,
    freshness: record.provenance.freshness,
    officiality: record.provenance.officiality,
    financialAuthority: false as const
  };
}

export function sanitizeLiveProbeFailure(error: unknown) {
  const candidate = String((error as { code?: unknown } | null)?.code || '').trim();
  const code = /^[A-Z0-9_:-]{3,120}$/.test(candidate)
    ? candidate
    : 'HIPICO_PROVIDER_LIVE_PROBE_FAILED';
  return {
    ok: false as const,
    code,
    retryable: Boolean((error as { retryable?: unknown } | null)?.retryable)
  };
}

export async function runProviderLiveProbe(env: NodeJS.ProcessEnv = process.env) {
  const provider = createSportradarRacingProvider();
  return probeRacingProvider(provider, env.HIPICO_LIVE_PROBE_STAGE_ID);
}

const isMain = Boolean(
  process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  try {
    const result = await runProviderLiveProbe();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(sanitizeLiveProbeFailure(error))}\n`);
    process.exitCode = 1;
  }
}
