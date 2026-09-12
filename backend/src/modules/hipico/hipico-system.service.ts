import { runReadinessCheck, type ReadinessResult } from '../../shared/observability/health.js';
import { deploymentMetadata } from '../../shared/observability/logger.js';
import { raceProviderStatus, type HorseRaceProviderStatus } from '../hipico-bot/hipico-race-provider.js';
import {
  HIPICO_API_VERSION,
  HIPICO_BRIDGE_PROTOCOL_VERSION,
  componentState,
  hipicoSystemStatusSchema,
  hipicoVersionSchema,
  type HipicoSystemStatus,
  type HipicoVersion
} from './hipico-domain.js';

type RuntimeEnv = Record<string, string | undefined>;

export type HipicoSystemDependencies = {
  source?: RuntimeEnv;
  readinessCheck?: () => Promise<ReadinessResult>;
  providerStatus?: (source: RuntimeEnv) => HorseRaceProviderStatus;
  now?: () => Date;
};

function text(source: RuntimeEnv, name: string) {
  return String(source[name] || '').trim();
}

function boundedReleaseValue(value: unknown, fallback: string, max = 64) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._+-]/g, '')
    .slice(0, max);
  return normalized || fallback;
}

function candidateSha(source: RuntimeEnv) {
  const explicit = text(source, 'GIT_COMMIT_SHA')
    || text(source, 'VERCEL_GIT_COMMIT_SHA')
    || text(source, 'GITHUB_SHA')
    || text(source, 'COMMIT_SHA');
  return boundedReleaseValue(explicit, deploymentMetadata.commitSha || 'unknown');
}

function strongSecret(value: string) {
  const secret = String(value || '').trim();
  return Buffer.byteLength(secret, 'utf8') >= 32
    && !/(?:CHANGE[_-]?ME|CHANGEME|PLACEHOLDER|YOUR[_-]?(?:SECRET|TOKEN|KEY)|REEMPLAZA|REPLACE)/i.test(secret);
}

function whatsappGroupId(value: string) {
  return /^\d{5,}(?:-\d+)?@g\.us$/i.test(String(value || '').trim());
}

export function buildHipicoVersion(source: RuntimeEnv = process.env): HipicoVersion {
  const configuredProtocol = text(source, 'HIPICO_BRIDGE_PROTOCOL_VERSION');
  const configuredProductVersion = text(source, 'HIPICO_PRODUCT_VERSION');
  return hipicoVersionSchema.parse({
    // HIPICO_PRODUCT_VERSION is the product identity. The deployment package
    // version remains a compatibility fallback until all environments publish
    // the explicit Hípico release version.
    productVersion: boundedReleaseValue(configuredProductVersion, deploymentMetadata.version || 'unknown'),
    buildSha: candidateSha(source),
    apiVersion: HIPICO_API_VERSION,
    bridgeProtocolVersion: boundedReleaseValue(configuredProtocol, HIPICO_BRIDGE_PROTOCOL_VERSION, 32)
  });
}

export async function buildHipicoSystemStatus(options: HipicoSystemDependencies = {}): Promise<HipicoSystemStatus> {
  const source = options.source || process.env;
  const readiness = await (options.readinessCheck || runReadinessCheck)();
  const provider = (options.providerStatus || raceProviderStatus)(source);
  const sourceGroupId = text(source, 'HIPICO_SOURCE_GROUP_ID');
  const labGroupId = text(source, 'HIPICO_LAB_GROUP_ID');
  const groupsPinned = whatsappGroupId(sourceGroupId)
    && whatsappGroupId(labGroupId)
    && sourceGroupId.toLowerCase() !== labGroupId.toLowerCase();
  const bridgeSecretReady = strongSecret(text(source, 'HIPICO_GROUP_BRIDGE_TOKEN'));
  const bridgeConfigured = groupsPinned && bridgeSecretReady;
  const backendReady = readiness.configuration === 'ok';
  const databaseReady = readiness.database === 'ok';
  const coreReady = backendReady && databaseReady;

  return hipicoSystemStatusSchema.parse({
    ok: coreReady,
    service: 'control-hipico',
    timestamp: (options.now || (() => new Date()))().toISOString(),
    version: buildHipicoVersion(source),
    components: {
      backend: componentState(
        backendReady ? 'ready' : 'degraded',
        backendReady ? null : 'CONFIGURATION_NOT_READY'
      ),
      database: componentState(
        databaseReady ? 'ready' : readiness.database === 'not_checked' ? 'not_configured' : 'unavailable',
        databaseReady ? null : readiness.database === 'not_checked' ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_PROBE_FAILED'
      ),
      bridge: componentState(
        bridgeConfigured ? 'degraded' : 'not_configured',
        bridgeConfigured
          ? 'BRIDGE_CONFIGURED_NOT_PROBED'
          : !bridgeSecretReady ? 'BRIDGE_SECRET_NOT_READY' : 'BRIDGE_GROUPS_NOT_PINNED'
      ),
      channel: componentState(
        groupsPinned ? 'degraded' : 'not_configured',
        groupsPinned ? 'CHANNEL_PINNED_NOT_PROBED' : 'SOURCE_LAB_GROUPS_NOT_PINNED'
      ),
      providers: {
        ...componentState(
          provider.configured ? 'degraded' : 'not_configured',
          provider.configured ? 'PROVIDER_CONFIGURED_NOT_PROBED' : provider.reason
        ),
        financialAuthority: false
      },
      documentEngine: componentState('not_configured', 'DOCUMENT_ENGINE_NOT_INSTALLED'),
      agent: componentState('not_configured', 'AGENT_ENGINE_NOT_INSTALLED')
    }
  });
}

export function hipicoReadinessFromStatus(status: HipicoSystemStatus) {
  return {
    ready: status.components.backend.state === 'ready' && status.components.database.state === 'ready',
    checks: {
      backend: status.components.backend.state,
      database: status.components.database.state
    },
    version: status.version
  };
}
