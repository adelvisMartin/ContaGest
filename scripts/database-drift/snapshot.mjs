import crypto from 'node:crypto';
import { assertReadOnlyCatalog, INTROSPECTION_QUERIES } from './introspection.mjs';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function boolFromPolicy(value) {
  if (typeof value === 'boolean') return value;
  return String(value).toUpperCase() === 'PERMISSIVE';
}

export function snapshotFromQueryResults(results) {
  const byName = new Map(results.map((entry) => [entry.name, entry.rows ?? []]));
  const objects = [];
  const metadataRow = byName.get('metadata')?.[0] ?? {};

  for (const row of byName.get('schemas') ?? []) {
    objects.push({ kind: 'schema', schema: row.schema_name, name: row.schema_name, signature: { owner: row.owner } });
  }
  for (const row of byName.get('tables') ?? []) {
    objects.push({
      kind: 'table', schema: row.schema_name, name: row.object_name,
      extensionName: row.extension_name ?? null,
      signature: {
        relkind: row.relkind,
        rlsEnabled: Boolean(row.rls_enabled),
        rlsForced: Boolean(row.rls_forced),
        owner: row.owner,
        extensionName: row.extension_name ?? null,
      },
    });
  }
  for (const row of byName.get('columns') ?? []) {
    objects.push({
      kind: 'column', schema: row.schema_name, table: row.table_name, name: row.column_name,
      signature: {
        type: row.data_type,
        nullable: Boolean(row.nullable),
        default: row.default_expr ?? null,
        identity: row.identity_kind || null,
        generated: row.generated_kind || null,
      },
    });
  }
  for (const row of byName.get('constraints') ?? []) {
    objects.push({
      kind: 'constraint', schema: row.schema_name, table: row.table_name, name: row.constraint_name,
      signature: {
        type: row.constraint_type,
        definition: row.definition,
        deferrable: Boolean(row.deferrable),
        initiallyDeferred: Boolean(row.initially_deferred),
        validated: Boolean(row.validated),
      },
    });
  }
  for (const row of byName.get('indexes') ?? []) {
    objects.push({
      kind: 'index', schema: row.schema_name, table: row.table_name, name: row.index_name,
      extensionName: row.extension_name ?? null,
      signature: {
        unique: Boolean(row.is_unique),
        method: row.method,
        keys: row.keys ?? [],
        predicate: row.predicate ?? null,
        extensionName: row.extension_name ?? null,
      },
    });
  }
  for (const row of byName.get('types') ?? []) {
    objects.push({
      kind: 'type', schema: row.schema_name, name: row.type_name,
      extensionName: row.extension_name ?? null,
      signature: {
        typeKind: row.type_kind,
        values: row.enum_values ?? [],
        extensionName: row.extension_name ?? null,
      },
    });
  }
  for (const row of byName.get('triggers') ?? []) {
    objects.push({
      kind: 'trigger', schema: row.schema_name, table: row.table_name, name: row.trigger_name,
      signature: {
        definition: row.definition,
        functionSchema: row.function_schema,
        functionName: row.function_name,
      },
    });
  }
  for (const row of byName.get('routines') ?? []) {
    const kind = row.routine_kind === 'p' ? 'procedure' : 'function';
    objects.push({
      kind, schema: row.schema_name, name: row.routine_name,
      identityArguments: row.identity_arguments ?? '',
      extensionName: row.extension_name ?? null,
      signature: {
        routineKind: row.routine_kind,
        resultType: row.result_type,
        language: row.language,
        securityDefiner: Boolean(row.security_definer),
        owner: row.owner ?? null,
        bodySha256: sha256(row.definition),
        extensionName: row.extension_name ?? null,
      },
    });
  }
  for (const row of byName.get('policies') ?? []) {
    objects.push({
      kind: 'policy', schema: row.schema_name, table: row.table_name, name: row.policy_name,
      signature: {
        permissive: boolFromPolicy(row.permissive),
        roles: row.roles ?? [],
        command: row.command,
        using: row.using_expression ?? null,
        withCheck: row.check_expression ?? null,
      },
    });
  }
  for (const [queryName, objectKind] of [['table_grants', 'table'], ['routine_grants', 'routine']]) {
    for (const row of byName.get(queryName) ?? []) {
      objects.push({
        kind: 'grant', schema: row.schema_name, name: row.object_name, objectKind,
        grantee: row.grantee, privilege: row.privilege_type,
        signature: { grantable: String(row.is_grantable).toUpperCase() === 'YES' },
      });
    }
  }
  for (const row of byName.get('extensions') ?? []) {
    objects.push({
      kind: 'extension', schema: row.schema_name, name: row.extension_name,
      extensionName: row.extension_name,
      signature: { version: row.extension_version, extensionName: row.extension_name },
    });
  }
  for (const row of byName.get('sequences') ?? []) {
    objects.push({
      kind: 'sequence', schema: row.schema_name, name: row.sequence_name,
      signature: {
        type: row.data_type,
        start: String(row.start_value),
        min: String(row.min_value),
        max: String(row.max_value),
        increment: String(row.increment_by),
        cycle: Boolean(row.cycle),
        owner: row.owner ?? null,
      },
    });
  }

  return {
    metadata: {
      postgresVersion: metadataRow.server_version ?? null,
      postgresVersionNum: metadataRow.server_version_num ?? null,
    },
    objects,
  };
}

export async function introspectDatabase(connectionString, { applicationName = 'contagest-drift-audit-625' } = {}) {
  assertReadOnlyCatalog();
  const { Client } = await import('pg');
  const client = new Client({ connectionString, application_name: applicationName });
  const results = [];
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    for (const query of INTROSPECTION_QUERIES) {
      const result = await client.query(query.sql);
      results.push({ name: query.name, rows: result.rows });
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    await client.end();
  }
  return snapshotFromQueryResults(results);
}
