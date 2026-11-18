/**
 * #842 / #839: fail-closed connection target policy for a destructive restore.
 * A URI hostname alone is insufficient: libpq accepts host/hostaddr/service
 * overrides in URI query parameters and inherited PG* environment variables.
 * No credentials or connection string are included in errors or output.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const TARGET_DATABASE = /^[a-zA-Z_][a-zA-Z0-9_]*(?:_drill|_restore)$/;
const TARGET_OVERRIDE_ENV = [
  'PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPORT', 'PGDATABASE'
];

export function inspectHipicoRestoreTarget(raw, env = {}) {
  const rejected = () => { throw new Error('HIPICO_RESTORE_TARGET_UNSAFE'); };
  if (typeof raw !== 'string' || !raw.trim() || typeof env !== 'object' ||
      env === null || Array.isArray(env)) rejected();
  if (TARGET_OVERRIDE_ENV.some(key => String(env[key] ?? '').trim())) rejected();

  let url;
  try { url = new URL(raw); } catch { rejected(); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
      !LOCAL_HOSTS.has(url.hostname.toLowerCase()) ||
      !url.username || url.search || url.hash) rejected();

  // Decode nothing: libpq may reinterpret encoded path delimiters/parameters.
  // A single literal, unescaped database name is the only accepted target.
  const database = url.pathname.slice(1);
  if (!TARGET_DATABASE.test(database)) rejected();
  return Object.freeze({host: url.hostname.toLowerCase(), database});
}

// CLI emits only two safe fields. Never put the full DSN on a process argv,
// print it to a log, or echo secret-bearing environment variables.
if (process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const target = inspectHipicoRestoreTarget(process.env.HIPICO_RESTORE_DATABASE_URL, process.env);
    process.stdout.write(target.host + '\n' + target.database + '\n');
  } catch {
    process.stderr.write('HIPICO_RESTORE_TARGET_UNSAFE\n');
    process.exitCode = 5;
  }
}
