export const HIPICO_CHANNEL_KEY_PATTERN = /^[A-Za-z0-9_-]{3,120}$/;
export const HIPICO_GROUP_ID_PATTERN = /^(?:\d{5,}-\d+|\d{10,})@g\.us$/i;
export const DEFAULT_SOURCE_CHANNEL_KEY = 'club-hipico-triple-crown-official';
export const DEFAULT_LAB_CHANNEL_KEY = 'control-hipico-lab';

export function isWhatsAppGroupId(value) {
  return HIPICO_GROUP_ID_PATTERN.test(String(value || '').trim());
}

export function bridgeIdentityStatus(source = process.env) {
  const sourceGroupId = String(source.HIPICO_SOURCE_GROUP_ID || '').trim();
  const labGroupId = String(source.HIPICO_LAB_GROUP_ID || '').trim();
  const sourceChannelKey = String(source.HIPICO_SOURCE_CHANNEL_KEY || DEFAULT_SOURCE_CHANNEL_KEY).trim();
  const labChannelKey = String(source.HIPICO_LAB_CHANNEL_KEY || DEFAULT_LAB_CHANNEL_KEY).trim();
  const pinnedGroupsConfigured = Boolean(sourceGroupId && labGroupId);
  const sourceGroupIdValid = isWhatsAppGroupId(sourceGroupId);
  const labGroupIdValid = isWhatsAppGroupId(labGroupId);
  const groupIdsValid = Boolean(sourceGroupIdValid && labGroupIdValid);
  const groupsDistinct = Boolean(groupIdsValid && sourceGroupId !== labGroupId);
  const sourceChannelKeyValid = HIPICO_CHANNEL_KEY_PATTERN.test(sourceChannelKey);
  const labChannelKeyValid = HIPICO_CHANNEL_KEY_PATTERN.test(labChannelKey);
  const channelKeysValid = Boolean(sourceChannelKeyValid && labChannelKeyValid);
  const channelKeysDistinct = Boolean(channelKeysValid && sourceChannelKey !== labChannelKey);
  return {
    sourceGroupId,
    labGroupId,
    sourceChannelKey,
    labChannelKey,
    pinnedGroupsConfigured,
    sourceGroupIdValid,
    labGroupIdValid,
    groupIdsValid,
    groupsDistinct,
    sourceChannelKeyValid,
    labChannelKeyValid,
    channelKeysValid,
    channelKeysDistinct,
    ready: Boolean(pinnedGroupsConfigured && groupIdsValid && groupsDistinct && channelKeysValid && channelKeysDistinct)
  };
}

export function configuredChannelIdentity(role, source = process.env) {
  const normalizedRole = role === 'lab' ? 'lab' : 'source';
  const identity = bridgeIdentityStatus(source);
  return normalizedRole === 'source'
    ? { role: 'source', groupId: identity.sourceGroupId, channelKey: identity.sourceChannelKey }
    : { role: 'lab', groupId: identity.labGroupId, channelKey: identity.labChannelKey };
}

export function validateBridgeRoleIdentity(role, groupId, channelKey, source = process.env) {
  const normalizedRole = role === 'lab' ? 'lab' : 'source';
  const identity = bridgeIdentityStatus(source);
  if (!identity.pinnedGroupsConfigured) {
    return normalizedRole === 'source' && !identity.sourceGroupId ? 'source_group_not_configured'
      : normalizedRole === 'lab' && !identity.labGroupId ? 'lab_group_not_configured'
        : 'bridge_group_configuration_incomplete';
  }
  if (!identity.sourceGroupIdValid) return 'source_group_invalid';
  if (!identity.labGroupIdValid) return 'lab_group_invalid';
  if (!identity.groupsDistinct) return 'bridge_groups_not_distinct';
  if (!identity.sourceChannelKeyValid) return 'source_channel_not_configured';
  if (!identity.labChannelKeyValid) return 'lab_channel_not_configured';
  if (!identity.channelKeysDistinct) return 'bridge_channels_not_distinct';

  const expected = configuredChannelIdentity(normalizedRole, source);
  const actualGroupId = String(groupId || '').trim();
  if (!isWhatsAppGroupId(actualGroupId)) return 'invalid_group_id';
  if (actualGroupId !== expected.groupId) return normalizedRole === 'source' ? 'source_group_not_authorized' : 'lab_group_not_authorized';
  if (channelKey !== undefined && String(channelKey).trim() !== expected.channelKey) {
    return normalizedRole === 'source' ? 'source_channel_not_authorized' : 'lab_channel_not_authorized';
  }
  return null;
}
