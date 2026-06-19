import { env } from './env.js';

export function warnIfRuntimeDatabaseUrlLooksWrong() {
  const url = env.DATABASE_URL || '';
  const warnings: string[] = [];
  if (!url) warnings.push('DATABASE_URL está vacío.');
  if (url.includes(':5432/')) warnings.push('DATABASE_URL usa 5432. Para runtime usa transaction pooler 6543.');
  if (url.includes('connection_limit=1')) warnings.push('DATABASE_URL tiene connection_limit=1. Usa 5 o más para pruebas.');
  if (url.includes('pooler.supabase.com') && !url.includes(':6543/')) warnings.push('Pooler runtime debe usar puerto 6543.');
  if (url.includes('pooler.supabase.com') && !url.includes('pgbouncer=true')) warnings.push('Agrega pgbouncer=true al DATABASE_URL runtime.');

  if (warnings.length) {
    console.warn('\n[ContaGest-VE DB CONFIG WARNING]');
    warnings.forEach((item) => console.warn(`- ${item}`));
    console.warn('Comando recomendado: node scripts/write-supabase-env.mjs TU_PASSWORD');
    console.warn('');
  }
}
