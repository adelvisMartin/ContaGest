import { deploymentMetadata } from '../../shared/observability/logger.js';
import { runReadinessCheck, type ReadinessResult } from '../../shared/observability/health.js';
import { raceProviderStatus, type HorseRaceProviderStatus } from '../hipico-bot/hipico-race-provider.js';
import { documentExtractorCapability } from './document-extractor.js';
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

type Dependencies = {
  source?: RuntimeEnv;
  readinessCheck?: () => Promise<ReadinessResult>;
  providerStatus?: (source: RuntimeEnv) => HorseRaceProviderStatus;
  documentCapability?: (source: RuntimeEnv) => ReturnType<typeof documentExtractorCapability>;
  now?: () => Date;
};

function text(source: RuntimeEnv, name: string) {
  return String(source[name] || '').trim();
}

function strongSecret(value: string) {
  return Buffer.byteLength(String(value || '').trim(), 'utf8') >= 32;
}

function whatsappGroupId(value: string) {
  return /^\d{5,}(?:-\d+)?@g\.us$/i.test(String(value || '').trim());
}

export function buildHipicoVersion(source: RuntimeEnv = process.env): HipicoVersion {
  const configuredProtocol = text(source, 'HIPICO_BRIDGE_PROTOCOL_VERSION');
  return hipicoVersionSchema.parse({
    productVersion: deploymentMetadata.version || 'unknown',
    buildSha: deploymentMetadata.commitSha || 'unknown',
    apiVersion: HIPICO_API_VERSION,
    bridgeProtocolVersion: configuredProtocol || HIPICO_BRIDGE_PROTOCOL_VERSION
  });
}

export async function buildHipicoSystemStatus(options: Dependencies = {}): Promise<HipicoSystemStatus> {
  const source = options.source || process.env;
  const readiness = await (options.readinessCheck || runReadinessCheck)();
  const provider = (options.providerStatus || raceProviderStatus)(source);
  const documentCapability = (options.documentCapability || documentExtractorCapability)(source);
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
  const ocrRequested = text(source, 'HIPICO_DOCUMENT_OCR_ENABLED').toLowerCase() === 'true';
  const documentReady = documentCapability.configured && documentCapability.nativeText;
  const documentDegraded = documentReady && ocrRequested && !documentCapability.ocr;

  return hipicoSystemStatusSchema.parse({
    ok: coreReady,
    service: 'control-hipico',
    timestamp: (options.now || (() => new Date()))().toISOString(),
    version: buildHipicoVersion(source),
    components: {
      backend: componentState(backendReady ? 'ready' : 'degraded', backendReady ? null : 'CONFIGURATION_NOT_READY'),
      database: componentState(
        databaseReady ? 'ready' : readiness.database === 'not_checked' ? 'not_configured' : 'unavailable',
        databaseReady ? null : readiness.database === 'not_checked' ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_PROBE_FAILED'
      ),
      bridge: componentState(
        bridgeConfigured ? 'ready' : 'not_configured',
        bridgeConfigured ? null : !bridgeSecretReady ? 'BRIDGE_SECRET_NOT_READY' : 'BRIDGE_GROUPS_NOT_PINNED'
      ),
      channel: componentState(
        groupsPinned ? 'ready' : 'not_configured',
        groupsPinned ? null : 'SOURCE_LAB_GROUPS_NOT_PINNED'
      ),
      providers: {
        ...componentState(provider.configured ? 'ready' : 'not_configured', provider.reason),
        financialAuthority: false
      },
      documentEngine: componentState(
        documentDegraded ? 'degraded' : documentReady ? 'ready' : 'not_configured',
        documentDegraded ? (documentCapability.reason || 'DOCUMENT_OCR_NOT_READY') : documentReady ? null : (documentCapability.reason || 'DOCUMENT_ENGINE_NOT_INSTALLED')
      ),
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
