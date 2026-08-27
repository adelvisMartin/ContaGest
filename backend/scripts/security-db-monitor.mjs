import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = String(process.env.DATABASE_MONITOR_URL || '').trim();
const expectedRole = String(process.env.DATABASE_MONITOR_EXPECTED_ROLE || 'contagest_monitor').trim();
const rowThreshold = Math.max(1, Number(process.env.DB_MASS_CHANGE_ROW_THRESHOLD || 500));
const windowMinutes = Math.min(1440, Math.max(1, Number(process.env.DB_SECURITY_AUDIT_WINDOW_MINUTES || 20)));
const webhookUrl = String(process.env.SECURITY_ALERT_WEBHOOK_URL || '').trim();

if (!databaseUrl) throw new Error('DATABASE_MONITOR_URL es obligatorio para el monitor de seguridad DB.');

function safeQueryText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

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
  query_timeout: 20_000,
  ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false }
});

const findings = [];

try {
  await client.connect();

  const identity = await client.query('select current_user as role, current_database() as database');
  const currentRole = identity.rows[0]?.role;
  if (currentRole !== expectedRole) {
    findings.push({
      kind: 'database-role-mismatch',
      severity: 'critical',
      expectedRole,
      currentRole
    });
  }

  const roles = await client.query(`
    select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    from pg_roles
    where rolname = any($1::text[])
    order by rolname
  `, [['contagest_runtime', 'contagest_backup', 'contagest_monitor']]);

  const byName = new Map(roles.rows.map((role) => [role.rolname, role]));
  for (const roleName of ['contagest_runtime', 'contagest_backup', 'contagest_monitor']) {
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
    where granted_role.rolname='service_role'
      and member_role.rolname = any($1::text[])
  `, [['contagest_runtime', 'contagest_backup', 'contagest_monitor']]);
  for (const row of serviceMembership.rows) {
    findings.push({ kind: 'service-role-membership', severity: 'critical', role: row.member });
  }

  const extension = await client.query("select exists(select 1 from pg_extension where extname='pg_stat_statements') as enabled");
  if (!extension.rows[0]?.enabled) {
    findings.push({ kind: 'pg-stat-statements-disabled', severity: 'warning' });
  } else {
    const massChanges = await client.query(`
      select queryid::text as "queryId", calls::bigint, rows::bigint,
             round((rows::numeric / greatest(calls, 1)), 2) as "avgRows",
             query
      from pg_stat_statements
      where dbid=(select oid from pg_database where datname=current_database())
        and query ~* '^\\s*(update|delete|truncate)\\s+'
        and (rows::numeric / greatest(calls, 1)) >= $1
      order by (rows::numeric / greatest(calls, 1)) desc
      limit 25
    `, [rowThreshold]);

    for (const row of massChanges.rows) {
      findings.push({
        kind: 'mass-dml-signature',
        severity: 'high',
        queryId: row.queryId,
        calls: Number(row.calls),
        rows: Number(row.rows),
        avgRows: Number(row.avgRows),
        query: safeQueryText(row.query)
      });
    }
  }

  const auditChanges = await client.query(`
    select "id", "createdAt", "tenantId", "userId", "action", "entity", "entityId"
    from public."AuditLog"
    where "createdAt" >= now() - ($1::int * interval '1 minute')
      and (
        "entity" ~* '(License|Role|Permission|UserRole|Subscription)'
        or "action" ~* '(license|role|permission|subscription|commercial\\.subscription\\.status)'
      )
    order by "createdAt" desc
    limit 100
  `, [windowMinutes]);

  if (auditChanges.rows.length) {
    findings.push({
      kind: 'sensitive-application-changes',
      severity: 'medium',
      windowMinutes,
      count: auditChanges.rows.length,
      events: auditChanges.rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        tenantId: row.tenantId,
        userId: row.userId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId
      }))
    });
  }

  const payload = {
    source: 'contagest-db-security-monitor',
    generatedAt: new Date().toISOString(),
    database: identity.rows[0]?.database,
    threshold: { avgRowsPerStatement: rowThreshold, auditWindowMinutes: windowMinutes },
    findings
  };

  if (!findings.length) {
    console.log('ContaGest DB security monitor: PASS');
    process.exitCode = 0;
  } else {
    console.error(`ContaGest DB security monitor: ${findings.length} finding(s)`);
    console.error(JSON.stringify(payload, null, 2));
    const delivered = await sendAlert(payload);
    console.error(delivered ? 'Alerta enviada al webhook de seguridad.' : 'Sin webhook: el job falla para activar la alerta de CI.');
    process.exitCode = 2;
  }
} finally {
  await client.end().catch(() => undefined);
}
