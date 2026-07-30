import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL
  || process.env.POSTGRES_PRISMA_URL
  || process.env.POSTGRES_URL
  || process.env.SUPABASE_DB_URL
  || process.env.DIRECT_DATABASE_URL
  || process.env.DIRECT_URL
  || process.env.POSTGRES_URL_NON_POOLING;

// Prisma reads DATABASE_URL from schema.prisma during client initialization.
// Normalize common Vercel/Supabase integration variable names without logging the secret.
if (!process.env.DATABASE_URL && databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['warn', 'error']
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
