const CLOUD_ROLES = new Set(['admin', 'operator', 'viewer', 'auditor']);

export function canUseOperationalCenter({ mode, hasShell, cloudRole = '', blocked = false } = {}) {
  if (!hasShell || blocked) return false;
  if (mode === 'local') return true;
  if (mode !== 'cloud') return false;
  return CLOUD_ROLES.has(String(cloudRole || '').trim().toLowerCase());
}

export const __test__ = Object.freeze({ CLOUD_ROLES });
