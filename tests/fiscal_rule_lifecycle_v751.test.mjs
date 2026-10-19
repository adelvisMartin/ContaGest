import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertApprovedFiscalDefinition,
  assertFiscalRuleTransition,
  assertNoSupersessionCycle,
  assertFiscalRuleWindow,
} from '../backend/src/modules/fiscal/fiscal-rule-lifecycle-policy.ts';

const at = (date) => new Date(date);
const rule = {
  id: 'rule-v1', tenantId: 'tenant-A', ruleKey: 'IVA.synthetic',
  status: 'DRAFT', createdBy: 'author-A', reviewedBy: null,
  effectiveFrom: at('2026-01-01T00:00:00.000Z'),
  effectiveTo: at('2027-01-01T00:00:00.000Z'),
  legalSourceId: 'source-A', supersedesId: null,
};
const approvedSource = { id: 'source-A', tenantId: 'tenant-A', createdBy: 'author-S', reviewedBy: 'reviewer-S', contentSha256: 'a'.repeat(64) };
const rejected = (fn, code = 'FISCAL_RULE_LIFECYCLE_INVALID') => assert.throws(fn, { message: code });

test('#751 only a fixed, bounded, data-only arithmetic DSL is accepted', () => {
  const valid = { formula: 'RATIONAL_RATE', base: 'TAXABLE_AMOUNT', numerator: 0, denominator: 100 };
  assert.deepEqual(assertApprovedFiscalDefinition(valid), valid);
  for (const bad of [
    { ...valid, numerator: -1 }, { ...valid, denominator: 0 },
    { ...valid, numerator: 101 }, { ...valid, numerator: 1.2 },
    { ...valid, formula: 'eval' }, { ...valid, code: 'process.exit()' },
    { ...valid, base: '__proto__' }, {}, null, [],
  ]) rejected(() => assertApprovedFiscalDefinition(bad), 'FISCAL_RULE_DEFINITION_UNSAFE');
});

test('#751 dates are UTC instants with half-open bounds', () => {
  assertFiscalRuleWindow(rule.effectiveFrom, rule.effectiveTo);
  assertFiscalRuleWindow(rule.effectiveFrom, null);
  rejected(() => assertFiscalRuleWindow(rule.effectiveFrom, rule.effectiveFrom));
  rejected(() => assertFiscalRuleWindow(rule.effectiveTo, rule.effectiveFrom));
  rejected(() => assertFiscalRuleWindow(new Date('invalid'), null));
});

test('#751 review requires authenticated, distinct reviewer and a reviewed tenant-owned legal source', () => {
  assert.equal(assertFiscalRuleTransition(rule, 'REVIEWED', { tenantId: 'tenant-A', userId: 'reviewer-R' }, approvedSource).status, 'REVIEWED');
  rejected(() => assertFiscalRuleTransition(rule, 'REVIEWED', { tenantId: 'tenant-B', userId: 'reviewer-R' }, approvedSource));
  rejected(() => assertFiscalRuleTransition(rule, 'REVIEWED', { tenantId: 'tenant-A', userId: 'author-A' }, approvedSource));
  rejected(() => assertFiscalRuleTransition(rule, 'REVIEWED', { tenantId: 'tenant-A', userId: 'reviewer-R' }, { ...approvedSource, tenantId: 'tenant-B' }));
  rejected(() => assertFiscalRuleTransition(rule, 'REVIEWED', { tenantId: 'tenant-A', userId: 'reviewer-R' }, { ...approvedSource, reviewedBy: null }));
  rejected(() => assertFiscalRuleTransition(rule, 'ACTIVE', { tenantId: 'tenant-A', userId: 'reviewer-R' }, approvedSource));
});

test('#751 activation and supersession are explicit, one-way and separately authorized', () => {
  const reviewed = { ...rule, status: 'REVIEWED', reviewedBy: 'reviewer-R' };
  assert.equal(assertFiscalRuleTransition(reviewed, 'ACTIVE', { tenantId: 'tenant-A', userId: 'publisher-A' }, approvedSource).status, 'ACTIVE');
  rejected(() => assertFiscalRuleTransition(reviewed, 'ACTIVE', { tenantId: 'tenant-A', userId: 'reviewer-R' }, approvedSource));
  rejected(() => assertFiscalRuleTransition(reviewed, 'DRAFT', { tenantId: 'tenant-A', userId: 'publisher-A' }, approvedSource));
  const active = { ...reviewed, status: 'ACTIVE' };
  assert.equal(assertFiscalRuleTransition(active, 'SUPERSEDED', { tenantId: 'tenant-A', userId: 'publisher-A' }, approvedSource).status, 'SUPERSEDED');
  rejected(() => assertFiscalRuleTransition(active, 'REVIEWED', { tenantId: 'tenant-A', userId: 'publisher-A' }, approvedSource));
  rejected(() => assertFiscalRuleTransition(active, 'ACTIVE', { tenantId: 'tenant-A', userId: 'publisher-A' }, approvedSource));
});

test('#751 supersession chain is same-tenant, same-key and acyclic', () => {
  const chain = [{ id: 'v3', tenantId: 'tenant-A', ruleKey: 'IVA.synthetic', supersedesId: 'v2' }, { id: 'v2', tenantId: 'tenant-A', ruleKey: 'IVA.synthetic', supersedesId: 'v1' }, { id: 'v1', tenantId: 'tenant-A', ruleKey: 'IVA.synthetic', supersedesId: null }];
  assertNoSupersessionCycle(chain, 'v4', 'v3', 'tenant-A', 'IVA.synthetic');
  rejected(() => assertNoSupersessionCycle(chain, 'v1', 'v3', 'tenant-A', 'IVA.synthetic'));
  rejected(() => assertNoSupersessionCycle(chain, 'v4', 'v4', 'tenant-A', 'IVA.synthetic'));
  rejected(() => assertNoSupersessionCycle([{ ...chain[0], tenantId: 'tenant-B' }], 'v4', 'v3', 'tenant-A', 'IVA.synthetic'));
});
