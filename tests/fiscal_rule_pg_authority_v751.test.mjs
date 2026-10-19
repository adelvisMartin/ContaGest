import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../backend/prisma/migrations/20261019103000_issue_751_reviewed_rule_authority/migration.sql', import.meta.url), 'utf8');
const repo = readFileSync(new URL('../backend/src/modules/fiscal/fiscal.repository.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../backend/src/modules/fiscal/fiscal.routes.ts', import.meta.url), 'utf8');

test('#751 SQL never backfills legacy rules as active or invents statutory rates', () => {
  assert.match(sql, /ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT'/);
  assert.doesNotMatch(sql, /UPDATE public\."FiscalRuleVersion" SET "status"='ACTIVE'/);
  assert.match(sql, /FOREIGN KEY \("tenantId", "legalSourceId"\)/);
  assert.match(sql, /FOREIGN KEY \("tenantId", "supersedesId"\)/);
});

test('#751 database prevents bypass of reviews, activation, and immutable snapshots', () => {
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON public\."FiscalRuleVersion"/);
  assert.match(sql, /"status" = 'DRAFT' AND NEW\."status" = 'REVIEWED'/);
  assert.match(sql, /"status" = 'REVIEWED' AND NEW\."status" = 'ACTIVE'/);
  assert.match(sql, /"status" = 'ACTIVE' AND NEW\."status" = 'SUPERSEDED'/);
  assert.match(sql, /NEW\."reviewedBy" = NEW\."createdBy"/);
  assert.match(sql, /NEW\."activatedBy" = OLD\."reviewedBy"/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /FISCAL_RULE_ACTIVE_OVERLAP/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\."FiscalDocumentRuleSnapshot"/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\."FiscalLegalSourceReview"/);
});

test('#751 API only resolves approved rules and audits explicit tenant-scoped transitions', () => {
  assert.match(repo, /fv\."status" IN \('ACTIVE','SUPERSEDED'\)/);
  assert.match(repo, /JOIN public\."FiscalLegalSourceReview" review/);
  assert.match(repo, /WHERE fv\."tenantId" = \$\{input\.tenantId\}/);
  assert.match(routes, /router\.post\('\/legal-sources\/:id\/review', requirePermission\('fiscal\.close'\)/);
  assert.match(routes, /router\.post\('\/rules\/:id\/review', requirePermission\('fiscal\.close'\)/);
  assert.match(routes, /router\.post\('\/rules\/:id\/activate', requirePermission\('fiscal\.close'\)/);
  assert.match(routes, /'fiscal\.rule\.activated'/);
});
