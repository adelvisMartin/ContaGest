import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);
const isServerless = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
const expectedRuntimeRole = String(process.env.DATABASE_RUNTIME_EXPECTED_ROLE || 'contagest_runtime').trim();
const forbiddenRuntimeRoles = new Set([
  'postgres',
  'service_role',
  'supabase_admin',
  'supabase_auth_admin',
  'supabase_storage_admin',
  'supabase_replication_admin'
]);

function baseRoleName(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const username = decodeURIComponent(parsed.username || '').trim();
    return username.split('.')[0] || '';
  } catch {
    return '';
  }
}

function hardenRuntimeUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const role = baseRoleName(rawUrl);

  if (isProduction) {
    if (!role) throw new Error('[database-security] La URL runtime no contiene un usuario PostgreSQL válido.');
    if (forbiddenRuntimeRoles.has(role)) {
      throw new Error(`[database-security] El backend no puede ejecutarse en producción con el rol privilegiado "${role}". Usa ${expectedRuntimeRole}.`);
    }
    if (role !== expectedRuntimeRole) {
      throw new Error(`[database-security] Rol runtime inesperado "${role}". Se esperaba "${expectedRuntimeRole}".`);
    }
  }

  if (isServerless && isProduction) {
    const isSupavisor = parsed.hostname.endsWith('.pooler.supabase.com');
    const isDedicatedPooler = parsed.hostname.startsWith('db.') && parsed.hostname.endsWith('.supabase.co') && parsed.port === '6543';
    if (!isSupavisor && !isDedicatedPooler) {
      throw new Error('[database-security] En serverless producción la URL runtime debe usar Supavisor/PgBouncer, no conexión PostgreSQL directa.');
    }
    if (isSupavisor && parsed.port !== '6543') {
      throw new Error('[database-security] En Vercel usa Supavisor transaction mode por el puerto 6543.');
    }
    parsed.searchParams.set('pgbouncer', 'true');
    if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '1');
    if (!parsed.searchParams.has('pool_timeout')) parsed.searchParams.set('pool_timeout', '10');
    if (!parsed.searchParams.has('sslmode')) parsed.searchParams.set('sslmode', 'require');
    if (!parsed.searchParams.has('application_name')) parsed.searchParams.set('application_name', 'contagest-runtime');
  }

  return parsed.toString();
}

function resolveRuntimeDatabaseUrl() {
  const explicitRuntimeUrl = String(process.env.DATABASE_RUNTIME_URL || '').trim();
  const legacyDatabaseUrl = process.env.DATABASE_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.POSTGRES_URL
    || process.env.SUPABASE_DB_URL
    || process.env.DIRECT_DATABASE_URL
    || process.env.DIRECT_URL
    || process.env.POSTGRES_URL_NON_POOLING;

  // DATABASE_RUNTIME_URL remains the canonical production variable. Existing
  // deployments may use a legacy DB variable only when it passes the exact same
  // fail-closed role and pooler validation. Privileged/migration credentials are
  // never accepted as a runtime fallback.
  const runtimeCandidate = explicitRuntimeUrl || String(legacyDatabaseUrl || '').trim();
  if (isProduction && !runtimeCandidate) {
    throw new Error('[database-security] Falta una URL PostgreSQL runtime. Configure DATABASE_RUNTIME_URL con el rol dedicado de ejecución.');
  }

  const databaseUrl = runtimeCandidate
    ? hardenRuntimeUrl(runtimeCandidate)
    : undefined;

  if (!databaseUrl) throw new Error('[database] No hay una URL PostgreSQL configurada.');
  return databaseUrl;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const queryTelemetryEnabled = !isProduction && String(process.env.PRISMA_QUERY_TELEMETRY || '').toLowerCase() === 'true';

type PrismaQueryTelemetrySample = {
  query: string;
  durationMs: number;
  target: string | null;
};
const queryTelemetry: PrismaQueryTelemetrySample[] = [];
const MAX_QUERY_TELEMETRY_SAMPLES = 20_000;

const prismaLog = queryTelemetryEnabled
  ? [{ emit:'event' as const, level:'query' as const }, { emit:'stdout' as const, level:'warn' as const }, { emit:'stdout' as const, level:'error' as const }]
  : ['warn' as const, 'error' as const];

function createPrismaClient() {
  // Important for serverless boot: validating/constructing Prisma is deferred until
  // a DB-backed route actually touches the client. Public stateless routes such as
  // /api/v1/auth/captcha and liveness can therefore start even if the DB runtime
  // configuration is temporarily unavailable. DB-backed routes remain fail-closed.
  const databaseUrl = resolveRuntimeDatabaseUrl();

  // Prisma reads DATABASE_URL from schema.prisma during client initialization.
  // This value is written only after the runtime role + pooler guard succeeds.
  if (process.env.DATABASE_URL !== databaseUrl) process.env.DATABASE_URL = databaseUrl;

  const client = new PrismaClient({ log: prismaLog as any });
  if (queryTelemetryEnabled) {
    (client as any).$on('query', (event: { query?: string; duration?: number; target?: string }) => {
      queryTelemetry.push({
        query: String(event?.query || '').replace(/\s+/g, ' ').trim().slice(0, 4000),
        durationMs: Number(event?.duration || 0),
        target: event?.target ? String(event.target).slice(0, 160) : null
      });
      if (queryTelemetry.length > MAX_QUERY_TELEMETRY_SAMPLES) {
        queryTelemetry.splice(0, queryTelemetry.length - MAX_QUERY_TELEMETRY_SAMPLES);
      }
    });
  }
  return client;
}

function getPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client;
  return client;
}

// Keep the existing `prisma.model...` API across the codebase while making client
// construction lazy. Function members are bound to the concrete Prisma instance so
// `$transaction`, `$queryRaw`, `$connect`, etc. keep their required `this` context.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

export function resetPrismaQueryTelemetry() {
  queryTelemetry.splice(0);
}

export function prismaQueryTelemetrySnapshot() {
  return queryTelemetry.map((sample) => ({ ...sample }));
}

export function prismaQueryTelemetryEnabled() {
  return queryTelemetryEnabled;
}
