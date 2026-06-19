import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3030),
  APP_URL: z.string().default('http://localhost:8080'),
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
  JWT_SECRET: z.string().min(16).default('dev_secret_change_me_please'),
  JSON_BODY_LIMIT: z.string().default('1mb'),
  DATABASE_URL: z.string().optional(),
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
  ADMIN_REGISTER_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
