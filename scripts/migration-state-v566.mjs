import fs from 'node:fs';
import { Client } from 'pg';

const url = String(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (!url) throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required.');
const client = new Client({ connectionString: url });
await client.connect();
try {
  const failed = await client.query(`SELECT migration_name, started_at, finished_at, rolled_back_at, logs FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at`);
  const applied = await client.query(`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at, migration_name`);
  const duplicate = await client.query(`SELECT migration_name, count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL GROUP BY migration_name HAVING count(*) > 1`);
  const report = { schemaVersion: 1, capturedAt: new Date().toISOString(), appliedCount: applied.rowCount, failed: failed.rows.map((row) => ({ migrationName: row.migration_name, startedAt: row.started_at })), duplicates: duplicate.rows };
  fs.mkdirSync('artifacts/release', { recursive: true });
  fs.writeFileSync('artifacts/release/migration-state-v566.json', `${JSON.stringify(report, null, 2)}\n`);
  if (report.failed.length || report.duplicates.length) throw new Error(`Migration promotion blocked: failed=${report.failed.length} duplicates=${report.duplicates.length}`);
  console.log(`migration state: applied=${report.appliedCount} failed=0 duplicates=0`);
} finally {
  await client.end();
}
