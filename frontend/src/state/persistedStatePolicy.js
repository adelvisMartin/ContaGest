// Browser persistence must never retain one-time licence secrets or clinical
// records. The returned state is a shallow sanitised projection, not a
// mutation of the live in-memory state used to show credentials once.
export function stripSensitivePersistedState(snapshot) {
  const {
    healthVertical: _clinical,
    licenseCredentials: _oneTimeCredentials,
    licenseKey: _rawTopLevelLicense,
    temporaryPassword: _rawTopLevelPassword,
    ...durable
  } = snapshot || {};
  if (Array.isArray(durable.licenses)) {
    durable.licenses = durable.licenses.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const {
        licenseKey: _rawLicense,
        temporaryPassword: _temporaryPassword,
        credentials: _oneTimeBundle,
        ...publicSummary
      } = entry;
      return publicSummary;
    });
  }
  return durable;
}
