import { hipicoPersistenceConfig, metaOutboundPolicy, strongSecretConfigured } from './_shared.js';
import { bridgeIdentityStatus } from './bridge-identity.js';
import { metaSenderConfig, metaWebhookConfig } from './meta-runtime.js';

function missing(keys) {
  return keys.filter((key) => !String(process.env[key] || '').trim());
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const persistenceRequired = ['HIPICO_SUPABASE_URL', 'HIPICO_SUPABASE_SERVICE_ROLE_KEY', 'HIPICO_OWNER_ID'];
  const linkedDeviceRequired = ['HIPICO_GROUP_BRIDGE_TOKEN', 'HIPICO_SOURCE_GROUP_ID', 'HIPICO_LAB_GROUP_ID'];
  const metaRequired = ['HIPICO_META_ACCESS_TOKEN', 'HIPICO_META_PHONE_NUMBER_ID', 'HIPICO_INTERNAL_API_TOKEN'];
  const webhookRequired = ['HIPICO_META_VERIFY_TOKEN', 'HIPICO_META_APP_SECRET', 'HIPICO_META_PHONE_NUMBER_ID'];

  const persistenceMissing = missing(persistenceRequired);
  const linkedDeviceMissing = missing(linkedDeviceRequired);
  const metaMissing = missing(metaRequired);
  const webhookMissing = missing(webhookRequired);
  const persistence = hipicoPersistenceConfig();
  const identity = bridgeIdentityStatus();
  const bridgeTokenStrong = strongSecretConfigured(process.env.HIPICO_GROUP_BRIDGE_TOKEN);
  const internalApiTokenStrong = strongSecretConfigured(process.env.HIPICO_INTERNAL_API_TOKEN);
  const persistenceReady = persistence.ready;
  const linkedDeviceReady = persistenceReady
    && linkedDeviceMissing.length === 0
    && bridgeTokenStrong
    && identity.ready;
  const outbound = metaOutboundPolicy();
  const sender = metaSenderConfig();
  const webhook = metaWebhookConfig();
  const metaDirectReady = persistenceReady && metaMissing.length === 0 && internalApiTokenStrong && sender.ready && outbound.enabled;
  const metaWebhookReady = persistenceReady && webhookMissing.length === 0 && webhook.ready;

  return res.status(200).json({
    ok: true,
    service: 'hipico-control-operations',
    mode: linkedDeviceReady ? 'linked_device_shadow_ready' : persistenceReady ? 'manual_and_persistence_ready' : 'offline_and_manual_ready',
    persistence: {
      ready: persistenceReady,
      urlValid: persistence.urlValid,
      serviceRoleStrong: persistence.serviceRoleStrong,
      ownerIdValid: persistence.ownerIdValid,
      missingConfigurationCount: persistenceMissing.length
    },
    linkedDeviceBridge: {
      ready: linkedDeviceReady,
      shadowOnly: true,
      sourceSendPossible: false,
      tokenConfigured: bridgeTokenStrong,
      pinnedGroupsConfigured: identity.pinnedGroupsConfigured,
      groupIdsValid: identity.groupIdsValid,
      groupsDistinct: identity.groupsDistinct,
      channelKeysValid: identity.channelKeysValid,
      channelKeysDistinct: identity.channelKeysDistinct,
      missingConfigurationCount: linkedDeviceMissing.length
    },
    metaCloud: {
      directIndividualSendReady: metaDirectReady,
      webhookReady: metaWebhookReady,
      internalApiTokenStrong,
      accessTokenStrong: sender.accessTokenStrong,
      phoneNumberIdValid: sender.phoneNumberIdValid && webhook.phoneNumberIdValid,
      webhookSecretsStrong: webhook.verifyTokenStrong && webhook.appSecretStrong,
      optionalForLinkedDeviceBridge: true,
      outboundPolicy: {
        enabled: outbound.enabled,
        reasons: outbound.reasons,
        allowedDestinationCount: outbound.allowedDestinationCount,
        runtimeShaBound: outbound.runtimeShaBound
      },
      missingConfigurationCount: new Set([...metaMissing, ...webhookMissing]).size
    }
  });
}

export const __test__ = { bridgeIdentityStatus, hipicoPersistenceConfig, metaSenderConfig, metaWebhookConfig };
