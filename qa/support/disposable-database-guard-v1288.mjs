/**
 * Offline, dependency-free preflight for *test fixtures only*.
 *
 * Runtime Prisma can prefer DATABASE_RUNTIME_URL to DATABASE_URL and migration
 * tooling reads DIRECT_DATABASE_URL. Require all configured aliases to point
 * at exactly one loopback PostgreSQL instance and named disposable database.
 * This guard does not mutate process.env or connect to PostgreSQL.
 */
export function assertQaDisposableDatabaseConfig(env) {
  const blocked = () => { throw new Error('QA_EPHEMERAL_DATABASE_REQUIRED'); };
  if (!env || env.NODE_ENV !== 'test' || env.VERCEL || env.VERCEL_ENV ||
      typeof env.DATABASE_URL !== 'string' || !env.DATABASE_URL.trim()) blocked();

  const aliases = ['DATABASE_URL', 'DATABASE_RUNTIME_URL', 'DIRECT_DATABASE_URL'];
  const targets = new Set();
  let databaseName = '';
  for (const key of aliases) {
    const rawUrl = String(env[key] || '').trim();
    if (!rawUrl) continue;
    let url;
    try { url = new URL(rawUrl); } catch { blocked(); }
    if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) blocked();
    let name;
    try { name = decodeURIComponent(url.pathname.slice(1)); } catch { blocked(); }
    // Database identifiers are not URL paths or arbitrary decoded strings.
    // This prevents encoded separators/control characters and ambiguous names
    // from being accepted merely because the last segment ends in _e2e.
    if (!/^[A-Za-z0-9_]+(?:_e2e|_drill|_restore)$/.test(name)) blocked();
    targets.add(url.hostname.toLowerCase() + ':' + (url.port || '5432') + '/' + name);
    databaseName = name;
  }
  if (targets.size !== 1) blocked();
  return databaseName;
}
