import 'dotenv/config';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const DEFAULT_APP_URL = 'http://localhost:8080';
const DEVELOPMENT_JWT_SECRET = 'dev_secret_change_me_please_32_chars';
const DEVELOPMENT_LICENSE_SECRET = 'dev_license_secret_change_me_32_chars';
const SECRET_PLACEHOLDER_PATTERN = /^(?:replace|change|your-|dev-|test-|example|sample|secret|demo|placeholder)/i;

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3030),
  APP_URL: z.string().default(DEFAULT_APP_URL),
  CORS_ORIGIN: z.string().default(DEFAULT_APP_URL),
  JWT_SECRET: z.string().optional(),
  LICENSE_HASH_SECRET: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  VERCEL_AUTOMATION_BYPASS_SECRET: z.string().optional(),
  JSON_BODY_LIMIT: z.string().default('1mb'),
  DATABASE_RUNTIME_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  POSTGRES_PRISMA_URL: z.string().optional(),
  POSTGRES_URL: z.string().optional(),
  POSTGRES_URL_NON_POOLING: z.string().optional(),
  POSTGRES_PASSWORD: z.string().optional(),
  SUPABASE_DB_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  DIRECT_DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_AUTH_FALLBACK: z.string().default('false'),
  API_MODE: z.enum(['prisma','mock']).default('prisma'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5.1-mini'),
  WHATSAPP_CLOUD_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_GRAPH_VERSION: z.string().default('v23.0'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  MAPBOX_TOKEN: z.string().optional(),
  ALLOW_PUBLIC_REGISTER: z.string().default('false'),
  ALLOW_DEV_TENANT_HEADER: z.string().default('false'),
  ADMIN_REGISTER_KEY: z.string().optional()
});

function normalizeOrigin(value?: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return '';
  }
}

export function isSecureSecret(value?: string | null) {
  const secret = String(value || '').trim();
  if (secret.length < 32 || SECRET_PLACEHOLDER_PATTERN.test(secret)) return false;
  if (secret === DEVELOPMENT_JWT_SECRET || secret === DEVELOPMENT_LICENSE_SECRET) return false;
  return !/(?:dev[_-](?:secret|license)|change[_-]?me)/i.test(secret);
}

function deriveSecret(seed: string, purpose: string) {
  return createHash('sha256').update(`contagest-ve:${purpose}:v11.15:${seed}`).digest('base64url');
}

const parsedEnv = envSchema.parse(process.env);
export const deploymentEnvironment = process.env.VERCEL_ENV || parsedEnv.NODE_ENV;
export const isVercelPreview = process.env.VERCEL_ENV === 'preview';
export const isProductionDeployment = process.env.VERCEL_ENV === 'production'
  || (!process.env.VERCEL_ENV && parsedEnv.NODE_ENV === 'production');
export const isProd = parsedEnv.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);

const vercelOrigins = [
  normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  normalizeOrigin(process.env.VERCEL_URL)
].filter(Boolean);

const explicitCorsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const configuredCorsOrigins = isProd
  ? explicitCorsOrigins.filter((origin) => !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/i.test(origin))
  : [normalizeOrigin(parsedEnv.CORS_ORIGIN)].filter(Boolean);

const corsOrigins = [...new Set([...configuredCorsOrigins, ...vercelOrigins])];
const detectedAppUrl = vercelOrigins[0] || vercelOrigins[1] || '';
const appUrl = isProd && (!process.env.APP_URL || parsedEnv.APP_URL === DEFAULT_APP_URL)
  ? detectedAppUrl || parsedEnv.APP_URL
  : parsedEnv.APP_URL;

const explicitJwtSecret = String(parsedEnv.JWT_SECRET || '').trim();
const explicitLicenseSecret = String(parsedEnv.LICENSE_HASH_SECRET || '').trim();
// Preview deployments may derive stable secrets only from credentials that are themselves private.
// Public deployment metadata (project/repo/SHA/URL) is deliberately excluded: anyone who can learn
// that metadata must not be able to reconstruct JWT or license HMAC keys.
const privateSeed = parsedEnv.SUPABASE_SERVICE_ROLE_KEY
  || parsedEnv.SUPABASE_JWT_SECRET
  || parsedEnv.DATABASE_RUNTIME_URL
  || parsedEnv.DATABASE_URL
  || parsedEnv.POSTGRES_PRISMA_URL
  || parsedEnv.POSTGRES_URL
  || parsedEnv.SUPABASE_DB_URL
  || parsedEnv.DIRECT_DATABASE_URL
  || parsedEnv.DIRECT_URL
  || parsedEnv.POSTGRES_URL_NON_POOLING
  || parsedEnv.POSTGRES_PASSWORD
  || parsedEnv.ADMIN_REGISTER_KEY
  || parsedEnv.VERCEL_AUTOMATION_BYPASS_SECRET
  || '';

const derivedPrivateJwtSecret = !isSecureSecret(explicitJwtSecret) && privateSeed
  ? deriveSecret(privateSeed, 'jwt')
  : '';
const derivedLicenseSecret = !isSecureSecret(explicitLicenseSecret) && privateSeed
  ? deriveSecret(privateSeed, 'license')
  : '';

export const jwtSecretSource = isSecureSecret(explicitJwtSecret)
  ? 'explicit'
  : derivedPrivateJwtSecret
    ? 'private-derived'
    : 'development-default';
export const licenseSecretSource = isSecureSecret(explicitLicenseSecret)
  ? 'explicit'
  : derivedLicenseSecret
    ? 'private-derived'
    : 'development-default';

export const jwtSecretReady = jwtSecretSource !== 'development-default' || !isProd;
export const licenseSecretReady = licenseSecretSource !== 'development-default' || !isProd;

export const env = {
  ...parsedEnv,
  NODE_ENV: isProd ? 'production' : parsedEnv.NODE_ENV,
  APP_URL: appUrl,
  CORS_ORIGIN: corsOrigins.join(',') || parsedEnv.CORS_ORIGIN,
  JWT_SECRET: isSecureSecret(explicitJwtSecret)
    ? explicitJwtSecret
    : derivedPrivateJwtSecret || DEVELOPMENT_JWT_SECRET,
  LICENSE_HASH_SECRET: isSecureSecret(explicitLicenseSecret)
    ? explicitLicenseSecret
    : derivedLicenseSecret || DEVELOPMENT_LICENSE_SECRET
};
