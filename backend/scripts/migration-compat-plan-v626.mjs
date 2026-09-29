export function planHistoricalProjection(entries, migrationName) {
  if (!Array.isArray(entries)) throw new TypeError('entries must be an array');
  if (!migrationName) throw new TypeError('migrationName is required');

  const ordered = [...entries];
  const index = ordered.indexOf(migrationName);
  if (index < 0) {
    return {
      available: false,
      migration: migrationName,
      before: ordered,
      after: [],
    };
  }

  return {
    available: true,
    migration: migrationName,
    before: ordered.slice(0, index),
    after: ordered.slice(index + 1),
  };
}
