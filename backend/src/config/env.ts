import 'dotenv/config';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const DEFAULT_APP_URL = 'http://localhost:8080';
const DEFAULT_JWT_SECRET = 'dev_secret_change_me_please_32_chars';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3030),
  APP_URL: z.string().default(DEFAULT_APP_URL),
  CORS_ORIGIN: z.string().default(DEFAULT_APP_URL),
  JWT_SECRET: z.string().optional(),
  JSON_BODY_LIMIT: z.string().default('1mb'),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  DIRECT_DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
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

function isSecureJwtSecret(value?: string) {
  const secret = String(value || '').trim();
  return secret.length >= 32 && !secret.includes('dev_secret');
}

const parsedEnv = envSchema.parse(process.env);
const isVercelProduction = process.env.VERCEL_ENV === 'production';
export const isProd = parsedEnv.NODE_ENV === 'production' || isVercelProduction;

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
const privateSeed = parsedEnv.SUPABASE_SERVICE_ROLE_KEY
  || parsedEnv.DATABASE_URL
  || parsedEnv.DIRECT_DATABASE_URL
  || parsedEnv.DIRECT_URL
  || '';
const derivedJwtSecret = isProd && !isSecureJwtSecret(explicitJwtSecret) && privateSeed
  ? createHash('sha256').update(`contagest-ve:jwt:v11:${privateSeed}`).digest('base64url')
  : '';

export const env = {
  ...parsedEnv,
  NODE_ENV: isProd ? 'production' : parsedEnv.NODE_ENV,
  APP_URL: appUrl,
  CORS_ORIGIN: corsOrigins.join(',') || parsedEnv.CORS_ORIGIN,
  JWT_SECRET: isSecureJwtSecret(explicitJwtSecret)
    ? explicitJwtSecret
    : derivedJwtSecret || DEFAULT_JWT_SECRET
};
