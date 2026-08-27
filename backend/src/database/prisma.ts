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
    if (!role) throw new Error('[database-security] DATABASE_RUNTIME_URL no contiene un usuario PostgreSQL válido.');
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
      throw new Error('[database-security] En serverless producción DATABASE_RUNTIME_URL debe usar Supavisor/PgBouncer, no conexión PostgreSQL directa.');
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

const explicitRuntimeUrl = String(process.env.DATABASE_RUNTIME_URL || '').trim();
const legacyDatabaseUrl = process.env.DATABASE_URL
  || process.env.POSTGRES_PRISMA_URL
  || process.env.POSTGRES_URL
  || process.env.SUPABASE_DB_URL
  || process.env.DIRECT_DATABASE_URL
  || process.env.DIRECT_URL
  || process.env.POSTGRES_URL_NON_POOLING;

if (isProduction && !explicitRuntimeUrl) {
  throw new Error('[database-security] DATABASE_RUNTIME_URL es obligatorio en producción. No se permite fallback automático a credenciales owner/migración.');
}

const databaseUrl = explicitRuntimeUrl
  ? hardenRuntimeUrl(explicitRuntimeUrl)
  : legacyDatabaseUrl;

if (!databaseUrl) throw new Error('[database] No hay una URL PostgreSQL configurada.');

// Prisma reads DATABASE_URL from schema.prisma during client initialization.
// In production this value is always rewritten from the dedicated runtime URL.
if (process.env.DATABASE_URL !== databaseUrl) process.env.DATABASE_URL = databaseUrl;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['warn', 'error']
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
