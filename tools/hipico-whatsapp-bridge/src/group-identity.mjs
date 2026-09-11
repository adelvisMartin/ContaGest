export const GROUP_ID_RE = /^(?:\d{5,}-\d+|\d{10,})@g\.us$/i;

export function isGroupId(value) {
  return GROUP_ID_RE.test(String(value || '').trim());
}
