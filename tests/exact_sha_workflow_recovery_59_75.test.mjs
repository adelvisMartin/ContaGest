import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('59/75 48/51 PostgreSQL workflow checks out the declared candidate SHA',()=>{
  const source=read('.github/workflows/erp-verticals-real-e2e-v4851.yml');
  assert.match(source,/uses: actions\/checkout@v7\n\s+with:\n\s+ref: \$\{\{ env\.CANDIDATE_SHA \}\}\n\s+fetch-depth: 0/);
  assert.match(source,/test "\$ACTUAL_SHA" = "\$CANDIDATE_SHA"/);
});

test('59/75 51/51 release jobs all checkout the exact candidate before verification',()=>{
  const source=read('.github/workflows/release-candidate-v5151.yml');
  const checkouts=(source.match(/uses: actions\/checkout@v7/g)||[]).length;
  const refs=(source.match(/ref: \$\{\{ env\.CANDIDATE_SHA \}\}/g)||[]).length;
  assert.equal(checkouts,5);
  assert.equal(refs,checkouts);
  assert.ok((source.match(/git rev-parse HEAD/g)||[]).length>=5);
});

test('59/75 cleanup remains fail-safe when 48/51 schema creation never started',()=>{
  const source=read('.github/workflows/erp-verticals-real-e2e-v4851.yml');
  assert.match(source,/to_regclass\('public\.\\"CarePatient\\"'\)/);
  assert.match(source,/to_regclass\('public\.\\"GymMember\\"'\)/);
  assert.match(source,/test "\$care_count" = "0"/);
  assert.match(source,/test "\$gym_count" = "0"/);
});


test('59/75 49/51 visual workflow checks out the declared candidate SHA',()=>{
  const source=read('.github/workflows/erp-verticals-visual-v4951.yml');
  assert.match(source,/uses: actions\/checkout@v7\n\s+with:\n\s+ref: \$\{\{ env\.CANDIDATE_SHA \}\}\n\s+fetch-depth: 0/);
  assert.match(source,/test "\$actual" = "\$CANDIDATE_SHA"/);
});

test('59/75 source Prisma validation uses isolated parse-only database URLs',()=>{
  const source=read('.github/workflows/release-candidate-v5151.yml');
  const prismaStep=source.match(/- name: Prisma validate[\s\S]*?npm --workspace backend run db:validate/);
  assert.ok(prismaStep, 'Prisma validate step missing');
  assert.match(prismaStep[0], /DATABASE_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/contagest_schema_validation_e2e\?schema=public/);
  assert.match(prismaStep[0], /DIRECT_DATABASE_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/contagest_schema_validation_e2e\?schema=public/);
  assert.doesNotMatch(prismaStep[0], /secrets\./);
});


test('59/75 Hípico outbox gate uses the canonical root workspace lock',()=>{
  const source=read('.github/workflows/hipico-outbox-v5.yml');
  assert.match(source,/cache-dependency-path: package-lock\.json/);
  assert.doesNotMatch(source,/cache-dependency-path: backend\/package-lock\.json/);
  assert.match(source,/npm ci --workspace backend --include-workspace-root --no-audit --no-fund/);
  assert.doesNotMatch(source,/working-directory: backend\n\s+run: npm ci/);
});
