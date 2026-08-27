import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = String(process.env.DATABASE_MONITOR_URL || '').trim();
const expectedRole = String(process.env.DATABASE_MONITOR_EXPECTED_ROLE || 'contagest_monitor').trim();
const rowThreshold = Math.max(1, Number(process.env.DB_MASS_CHANGE_ROW_THRESHOLD || 500));
const windowMinutes = Math.min(1440, Math.max(1, Number(process.env.DB_SECURITY_AUDIT_WINDOW_MINUTES || 70)));
const webhookUrl = String(process.env.SECURITY_ALERT_WEBHOOK_URL || '').trim();

if (!databaseUrl) throw new Error('DATABASE_MONITOR_URL es obligatorio para el monitor de seguridad DB.');

async function sendAlert(payload) {
  if (!webhookUrl) return false;
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`SECURITY_ALERT_WEBHOOK_URL respondió ${response.status}.`);
  return true;
}

const client = new Client({
  connectionString: databaseUrl,
  application_name: 'contagest-security-monitor',
  statement_timeout: 15_000,
  query_timeout: 20_000
});

const findings = [];

try {
  await client.connect();
  const identity = await client.query('select current_user as role, current_database() as database');
  const currentRole = identity.rows[0]?.role;
  if (currentRole !== expectedRole) {
    findings.push({ kind: 'database-role-mismatch', severity: 'critical', expectedRole, currentRole });
  }

  const protectedRoles = ['contagest_runtime', 'contagest_backup', 'contagest_monitor'];
  const roles = await client.query(`
    select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    from pg_roles where rolname = any($1::text[]) order by rolname
  `, [protectedRoles]);
  const byName = new Map(roles.rows.map((role) => [role.rolname, role]));
  for (const roleName of protectedRoles) {
    const role = byName.get(roleName);
    if (!role) {
      findings.push({ kind: 'database-role-missing', severity: 'critical', role: roleName });
      continue;
    }
    if (!role.rolcanlogin || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls) {
      findings.push({
        kind: 'database-role-privilege-drift',
        severity: 'critical',
        role: roleName,
        state: {
          canLogin: role.rolcanlogin,
          superuser: role.rolsuper,
          createDb: role.rolcreatedb,
          createRole: role.rolcreaterole,
          replication: role.rolreplication,
          bypassRls: role.rolbypassrls
        }
      });
    }
  }

  const serviceMembership = await client.query(`
    select member_role.rolname as member
    from pg_auth_members m
    join pg_roles granted_role on granted_role.oid=m.roleid
    join pg_roles member_role on member_role.oid=m.member
    where granted_role.rolname='service_role' and member_role.rolname = any($1::text[])
  `, [protectedRoles]);
  for (const row of serviceMembership.rows) {
    findings.push({ kind: 'service-role-membership', severity: 'critical', role: row.member });
  }

  const stats = await client.query(`
    select relname as "tableName", n_tup_upd::bigint as "updatedRows", n_tup_del::bigint as "deletedRows"
    from pg_stat_user_tables
    where schemaname='public' and relname ~ '^[A-Z]'
    order by relname
  `);
  const snapshots = await client.query(`
    select table_name as "tableName", updated_rows as "updatedRows", deleted_rows as "deletedRows"
    from private.contagest_security_metric_snapshot
  `);
  const previous = new Map(snapshots.rows.map((row) => [row.tableName, row]));

  for (const row of stats.rows) {
    const before = previous.get(row.tableName);
    if (!before) continue;
    const updatedDelta = Math.max(0, Number(row.updatedRows) - Number(before.updatedRows));
    const deletedDelta = Math.max(0, Number(row.deletedRows) - Number(before.deletedRows));
    if (updatedDelta >= rowThreshold || deletedDelta >= rowThreshold) {
      findings.push({
        kind: 'mass-table-change',
        severity: 'high',
        table: row.tableName,
        updatedRows: updatedDelta,
        deletedRows: deletedDelta,
        threshold: rowThreshold
      });
    }
  }

  // Persist baseline only in the dedicated private snapshot table. A stats reset produces
  // lower counters; Math.max above treats it as a new baseline rather than a false alert.
  const snapshotPayload = stats.rows.map((row) => ({
    table_name: row.tableName,
    updated_rows: Number(row.updatedRows),
    deleted_rows: Number(row.deletedRows)
  }));
  await client.query('begin');
  await client.query(`
    insert into private.contagest_security_metric_snapshot(table_name, updated_rows, deleted_rows, captured_at)
    select x.table_name, x.updated_rows, x.deleted_rows, now()
    from jsonb_to_recordset($1::jsonb) as x(table_name text, updated_rows bigint, deleted_rows bigint)
    on conflict (table_name) do update
      set updated_rows=excluded.updated_rows, deleted_rows=excluded.deleted_rows, captured_at=excluded.captured_at
  `, [JSON.stringify(snapshotPayload)]);
  await client.query('commit');

  const auditChanges = await client.query(`
    select "id", "createdAt", "tenantId", "userId", "action", "entity", "entityId"
    from public."AuditLog"
    where "createdAt" >= now() - ($1::int * interval '1 minute')
      and (
        "entity" ~* '^(LicenseKey|LicenseActivation|Role|RolePermission|Permission|UserRole)$'
        or "action" ~* '(license|role|permission)'
      )
    order by "createdAt" desc limit 100
  `, [windowMinutes]);
  if (auditChanges.rows.length) {
    findings.push({
      kind: 'sensitive-role-or-license-change',
      severity: 'medium',
      windowMinutes,
      count: auditChanges.rows.length,
      events: auditChanges.rows
    });
  }

  const payload = {
    source: 'contagest-db-security-monitor',
    generatedAt: new Date().toISOString(),
    database: identity.rows[0]?.database,
    threshold: { changedRowsPerTable: rowThreshold, auditWindowMinutes: windowMinutes },
    findings
  };

  if (!findings.length) {
    console.log('ContaGest DB security monitor: PASS');
    console.log(`Baseline actualizado para ${stats.rows.length} tablas Prisma.`);
  } else {
    console.error(`ContaGest DB security monitor: ${findings.length} finding(s)`);
    console.error(JSON.stringify(payload, null, 2));
    const delivered = await sendAlert(payload);
    console.error(delivered ? 'Alerta enviada al webhook de seguridad.' : 'Sin webhook: el job falla para activar la alerta de CI.');
    process.exitCode = 2;
  }
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}
