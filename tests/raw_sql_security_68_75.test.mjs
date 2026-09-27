import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { analyzeRawSqlSource } from '../scripts/raw-sql-security-audit-v6875.mjs';

const config = JSON.parse(fs.readFileSync('config/raw-sql-security-68-75.json', 'utf8'));

test('68/75 blocks interpolation in unsafe raw SQL', () => {
  const findings = analyzeRawSqlSource(
    "await prisma.$queryRawUnsafe(\`SELECT * FROM x WHERE id='\${req.params.id}'\`);",
    'backend/src/example.ts',
    config
  );
  assert.ok(findings.some((f) => f.code === 'RAW_SQL_INTERPOLATION'));
});

test('68/75 allows static SQL with bound parameters', () => {
  const findings = analyzeRawSqlSource(
    "await prisma.$queryRawUnsafe<any[]>(\`SELECT * FROM x WHERE id=$1\`, req.params.id);",
    'backend/src/example.ts',
    config
  );
  assert.equal(findings.length, 0);
});

test('68/75 requires explicit classification for dynamic SQL expressions', () => {
  const findings = analyzeRawSqlSource(
    "await prisma.$executeRawUnsafe(sql, tenantId);",
    'backend/src/example.ts',
    config
  );
  assert.ok(findings.some((f) => f.code === 'DYNAMIC_RAW_SQL_REVIEW'));
});

test('68/75 rejects dynamic Prisma.raw', () => {
  const findings = analyzeRawSqlSource(
    "const fragment = Prisma.raw(req.query.orderBy);",
    'backend/src/example.ts',
    config
  );
  assert.ok(findings.some((f) => f.code === 'DYNAMIC_PRISMA_RAW'));
});

test('68/75 forbids inline bypass directives', () => {
  const findings = analyzeRawSqlSource(
    "// raw-sql-security: ignore\nawait prisma.$queryRawUnsafe('SELECT 1');",
    'backend/src/example.ts',
    config
  );
  assert.ok(findings.some((f) => f.code === 'INLINE_IGNORE'));
});
