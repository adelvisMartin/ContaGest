import { hipicoPersistenceConfig, metaOutboundPolicy, safeEqual, strongSecretConfigured } from './_shared.js';
import { bridgeIdentityStatus } from './bridge-identity.js';
import { isMetaPhoneNumberId, metaSenderConfig } from './meta-runtime.js';

function missing(keys, source = process.env) {
  return keys.filter((key) => !String(source[key] || '').trim());
}

function secretReadiness(source = process.env) {
  return {
    bridgeTokenStrong: strongSecretConfigured(source.HIPICO_GROUP_BRIDGE_TOKEN),
    internalApiTokenStrong: strongSecretConfigured(source.HIPICO_INTERNAL_API_TOKEN),
    persistenceServiceKeyStrong: strongSecretConfigured(source.HIPICO_SUPABASE_SERVICE_ROLE_KEY),
    webhookVerifyTokenStrong: strongSecretConfigured(source.WHATSAPP_VERIFY_TOKEN),
    webhookAppSecretStrong: strongSecretConfigured(source.WHATSAPP_APP_SECRET),
    webhookPhoneNumberIdValid: isMetaPhoneNumberId(source.WHATSAPP_PHONE_NUMBER_ID)
  };
}

function internalDiagnosticsAuthorized(req, source = process.env) {
  const expected = String(source.HIPICO_INTERNAL_API_TOKEN || '').trim();
  const header = req?.headers?.['x-hipico-internal-token'];
  const provided = Array.isArray(header) ? header[0] : header;
  return strongSecretConfigured(expected) && safeEqual(provided, expected);
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const persistenceRequired = ['HIPICO_SUPABASE_URL', 'HIPICO_SUPABASE_SERVICE_ROLE_KEY', 'HIPICO_OWNER_ID'];
  const linkedDeviceRequired = ['HIPICO_GROUP_BRIDGE_TOKEN', 'HIPICO_SOURCE_GROUP_ID', 'HIPICO_LAB_GROUP_ID'];
  const metaDirectRequired = ['HIPICO_META_ACCESS_TOKEN', 'HIPICO_META_PHONE_NUMBER_ID', 'HIPICO_INTERNAL_API_TOKEN'];
  const canonicalWebhookRequired = ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_PHONE_NUMBER_ID'];

  const persistenceMissing = missing(persistenceRequired);
  const linkedDeviceMissing = missing(linkedDeviceRequired);
  const metaDirectMissing = missing(metaDirectRequired);
  const webhookMissing = missing(canonicalWebhookRequired);
  const persistence = hipicoPersistenceConfig();
  const identity = bridgeIdentityStatus();
  const secrets = secretReadiness();
  const persistenceReady = persistence.ready;
  const linkedDeviceReady = persistenceReady
    && linkedDeviceMissing.length === 0
    && secrets.bridgeTokenStrong
    && identity.ready;
  const outbound = metaOutboundPolicy();
  const sender = metaSenderConfig();
  const metaDirectReady = persistenceReady
    && metaDirectMissing.length === 0
    && secrets.internalApiTokenStrong
    && sender.ready
    && outbound.enabled;
  const metaWebhookReady = webhookMissing.length === 0
    && secrets.webhookVerifyTokenStrong
    && secrets.webhookAppSecretStrong
    && secrets.webhookPhoneNumberIdValid;
  const diagnostics = internalDiagnosticsAuthorized(req);

  return res.status(200).json({
    ok: true,
    service: 'hipico-control-operations',
    mode: linkedDeviceReady ? 'linked_device_shadow_ready' : persistenceReady ? 'manual_and_persistence_ready' : 'offline_and_manual_ready',
    persistence: {
      ready: persistenceReady,
      ...(diagnostics ? {
        urlValid: persistence.urlValid,
        serviceRoleStrong: persistence.serviceRoleStrong,
        ownerIdValid: persistence.ownerIdValid,
        missingConfigurationCount: persistenceMissing.length
      } : {})
    },
    linkedDeviceBridge: {
      ready: linkedDeviceReady,
      shadowOnly: true,
      sourceSendPossible: false,
      ...(diagnostics ? {
        tokenConfigured: secrets.bridgeTokenStrong,
        pinnedGroupsConfigured: identity.pinnedGroupsConfigured,
        groupIdsValid: identity.groupIdsValid,
        groupsDistinct: identity.groupsDistinct,
        channelKeysValid: identity.channelKeysValid,
        channelKeysDistinct: identity.channelKeysDistinct,
        missingConfigurationCount: linkedDeviceMissing.length
      } : {})
    },
    metaCloud: {
      directIndividualSendReady: metaDirectReady,
      webhookReady: metaWebhookReady,
      webhookAuthority: 'canonical_backend',
      optionalForLinkedDeviceBridge: true,
      outboundPolicy: {
        enabled: outbound.enabled,
        ...(diagnostics ? {
          reasons: outbound.reasons,
          allowedDestinationCount: outbound.allowedDestinationCount,
          runtimeShaBound: outbound.runtimeShaBound
        } : {})
      },
      ...(diagnostics ? {
        internalApiTokenStrong: secrets.internalApiTokenStrong,
        accessTokenStrong: sender.accessTokenStrong,
        phoneNumberIdValid: sender.phoneNumberIdValid,
        webhookSecretsStrong: secrets.webhookVerifyTokenStrong && secrets.webhookAppSecretStrong,
        webhookPhoneNumberIdValid: secrets.webhookPhoneNumberIdValid,
        missingConfigurationCount: new Set([...metaDirectMissing, ...webhookMissing]).size
      } : {})
    }
  });
}

export const __test__ = {
  bridgeIdentityStatus,
  hipicoPersistenceConfig,
  metaSenderConfig,
  internalDiagnosticsAuthorized,
  secretReadiness,
  missing
};
