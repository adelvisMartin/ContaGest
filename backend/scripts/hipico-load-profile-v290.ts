import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
const OWNER_ID = process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111';
const SHA = process.env.GITHUB_SHA || process.env.HIPICO_QA_SHA || 'local';
const artifact = path.resolve(process.env.HIPICO_PERF_ARTIFACT || '../artifacts/qa/hipico-v290/postgres-performance.json');
const volumes = [100, 500, 2000];

function requireIsolatedDatabase() {
  assert.ok(databaseUrl, 'HIPICO_E2E_DATABASE_URL is required');
  const url = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()), 'performance profile refuses non-local DB');
  assert.match(url.pathname.replace(/^\//, ''), /^hipico_e2e_[a-z0-9_]{8,63}$/, 'performance profile requires run-isolated database');
}

requireIsolatedDatabase();
const client = new Client({ connectionString: databaseUrl });
await client.connect();
const evidence: any[] = [];
try {
  for (const volume of volumes) {
    const groupKey = `perf-${volume}`;
    const channelRows = await client.query(
      `INSERT INTO public.hipico_bot_channels(owner_id,group_key,label,channel_type,status,config)
       VALUES($1::uuid,$2,$3,'web_bridge','active','{"mode":"shadow_only"}'::jsonb)
       ON CONFLICT(owner_id,group_key) DO UPDATE SET status='active'
       RETURNING id`,
      [OWNER_ID, groupKey, `Performance ${volume}`]
    );
    const channelId = channelRows.rows[0].id;
    const insertStart = performance.now();
    await client.query(
      `INSERT INTO public.hipico_messages(
         owner_id,channel_id,channel_key,external_message_id,fingerprint,sender_id,sender_label,sender_role,
         sent_at,message_type,raw_text,classification,confidence,processing_status,normalized,metadata)
       SELECT $1::uuid,$2::uuid,$3,'perf-'||$3||'-'||n,md5($3||':'||n::text),'584121234567','E2E','participant',
              now() - (n || ' milliseconds')::interval,'text','estatus carrera '||n,'status_non_monetary',0.99,'processed',
              jsonb_build_object('sequence',n),jsonb_build_object('source','v290-load-profile')
       FROM generate_series(1,$4::int) AS n`,
      [OWNER_ID, channelId, groupKey, volume]
    );
    const insertMs = performance.now() - insertStart;
    const countStart = performance.now();
    const countRows = await client.query(`SELECT count(*)::int AS count FROM public.hipico_messages WHERE owner_id=$1::uuid AND channel_key=$2`, [OWNER_ID, groupKey]);
    const countMs = performance.now() - countStart;
    assert.equal(countRows.rows[0].count, volume);
    const recentStart = performance.now();
    const recentRows = await client.query(`SELECT external_message_id,received_at FROM public.hipico_messages WHERE owner_id=$1::uuid AND channel_key=$2 ORDER BY received_at DESC LIMIT 50`, [OWNER_ID, groupKey]);
    const recentMs = performance.now() - recentStart;
    assert.equal(recentRows.rows.length, Math.min(50, volume));
    const planRows = await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT external_message_id,received_at FROM public.hipico_messages WHERE owner_id=$1::uuid AND channel_key=$2 ORDER BY received_at DESC LIMIT 50`, [OWNER_ID, groupKey]);
    const plan = planRows.rows[0]['QUERY PLAN']?.[0];
    evidence.push({ volume, insertMs: Number(insertMs.toFixed(3)), countMs: Number(countMs.toFixed(3)), recent50Ms: Number(recentMs.toFixed(3)), plannerExecutionMs: plan?.['Execution Time'] ?? null, plannerPlanningMs: plan?.['Planning Time'] ?? null, plan: plan?.Plan ?? null });
  }
  await fs.mkdir(path.dirname(artifact), { recursive: true });
  await fs.writeFile(artifact, `${JSON.stringify({ schema: 'hipico-performance.v290', sha: SHA, database: 'isolated-ephemeral', measuredAt: new Date().toISOString(), profiles: evidence }, null, 2)}\n`, 'utf8');
  console.log(`[hipico-v290] PostgreSQL load profiles measured: ${volumes.join('/')}`);
} finally { await client.end(); }
