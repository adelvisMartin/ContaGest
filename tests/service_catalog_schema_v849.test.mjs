import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../backend/prisma/schema.prisma',import.meta.url),'utf8');
const sql=readFileSync(new URL('../backend/prisma/migrations/20261022171000_issue_849_service_catalog_foundation/migration.sql',import.meta.url),'utf8');
test('#849 one cross-tenant-proof relational Service definition bridges the existing Product authority',()=>{
  for(const n of ['ServiceCatalogCategory','ServiceDefinition','ServiceStep',
    'ServiceDefinitionRevision','ServiceStaffCapability','ServiceLocationEligibility']){
    assert.match(schema,new RegExp('model '+n+' \\{'));
    assert.match(sql,new RegExp('CREATE TABLE public\\."'+n+'"'));
  }
  assert.match(schema,/product\s+Product\? @relation\(fields: \[tenantId, productId\], references: \[tenantId, id\]/);
  assert.match(schema,/employee\s+Employee @relation\(fields: \[tenantId, employeeId\], references: \[tenantId, id\]/);
  assert.match(schema,/location\s+BusinessLocation @relation\(fields: \[tenantId, locationId\], references: \[tenantId, id\]/);
});
test('#849 database blocks foreign tenant refs and duplicate staff/location/steps',()=>{
  for(const fields of ['tenantId","productId','tenantId","employeeId','tenantId","locationId','tenantId","serviceId']){
    assert.ok(sql.includes(fields),'composite tenant reference missing: '+fields);
  }
  assert.match(sql,/"ServiceStep_tenantId_serviceId_position_key" UNIQUE/);
  assert.match(sql,/"ServiceStaffCapability_tenantId_serviceId_employeeId_key" UNIQUE/);
  assert.match(sql,/"ServiceLocationEligibility_tenantId_serviceId_locationId_key" UNIQUE/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql,/CREATE POLICY.*USING \(true\)/);
});
test('#849 revisions preserve immutable historical plan versions as independent rows',()=>{
  assert.match(sql,/CONSTRAINT "ServiceDefinitionRevision_tenantId_serviceId_version_key" UNIQUE/);
  assert.match(schema,/snapshot\s+Json/);
  assert.match(schema,/version\s+Int/);
});

test('#849 revision storage is append-only even against accidental ORM writes',()=>{
  assert.match(sql,/CREATE TRIGGER service_definition_revision_no_mutation/);
  assert.match(sql,/BEFORE UPDATE OR DELETE ON public\."ServiceDefinitionRevision"/);
  assert.match(sql,/RAISE EXCEPTION 'SERVICE_CATALOG_REVISION_IMMUTABLE'/);
  assert.match(sql,/IF t = 'ServiceDefinitionRevision' THEN/);
  assert.match(sql,/GRANT SELECT, INSERT ON TABLE/);
});

test('#849 revision trigger uses valid balanced PostgreSQL dollar quotes on fresh installs', () => {
  assert.match(sql, /LANGUAGE plpgsql AS \$\$\s*BEGIN/);
  assert.match(sql, /RAISE EXCEPTION 'SERVICE_CATALOG_REVISION_IMMUTABLE'[\s\S]*?END;\s*\$\$;/);
  assert.doesNotMatch(sql, /LANGUAGE plpgsql AS \$(?!\$)/);
});

test('#849 does not recreate preexisting tenant + identity unique indexes', () => {
  for (const table of ['Product', 'Employee']) {
    assert.match(sql, new RegExp('CREATE UNIQUE INDEX IF NOT EXISTS "' +
      table + '_tenantId_id_key" ON public\\."' + table + '"\\("tenantId","id"\\);'));
  }
});

test('#849/#751 applied migration checksum drift blocks deploy before running Prisma', () => {
  const deploy=readFileSync(new URL('../backend/scripts/prisma-deploy-safe.mjs',import.meta.url),'utf8');
  for(const name of [
    '20261022171000_issue_849_service_catalog_foundation',
    '20261022173000_issue_751_reviewed_fiscal_rule_governance'
  ]) assert.ok(deploy.includes(name),'Preflight must review applied historical SQL: '+name);
  assert.match(deploy,/SELECT migration_name, checksum/);
  assert.match(deploy,/finished_at IS NOT NULL AND rolled_back_at IS NULL/);
  assert.match(deploy,/createHash\('sha256'\)/);
  assert.match(deploy,/HISTORICAL_MIGRATION_CHECKSUM_DRIFT/);
  const preflight=deploy.indexOf('await assertReviewedMigrationChecksums({ databaseUrl, migrationsRoot });');
  const apply=deploy.indexOf("runPrisma(['migrate', 'deploy', '--schema', schemaPath]);");
  assert.ok(preflight>0&&apply>preflight,'Migrations must never deploy before checksum preflight');
});
