import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { assertFiscalRatioDefinition, assertRuleReview, assertRuleActivation, assertSupersession } from '../backend/src/modules/fiscal/fiscal-rule-governance-policy.ts';
const source={id:'s',tenantId:'tenantA',status:'REVIEWED',reference:'synthetic',contentSha256:'a'.repeat(64),reviewedBy:'sourceReviewer',reviewedAt:new Date('2026-01-01T00:00:00Z')};
const draft={id:'r1',tenantId:'tenantA',ruleKey:'iva.synthetic',version:1,status:'DRAFT',createdBy:'creator',reviewedBy:null,activatedBy:null,legalSourceId:'s',legalSourceSha256:'a'.repeat(64),definition:{formula:'RATIO_MINOR_UNITS',numerator:1,denominator:10,basis:'taxable_minor'}};
const reviewed={...draft,status:'REVIEWED',reviewedBy:'ruleReviewer'};
const deny=f=>assert.throws(f,/FISCAL_RULE_GOVERNANCE_DENIED/);
test('review and activation require source provenance plus three distinct actors',()=>{ assert.doesNotThrow(()=>assertRuleReview(draft,'ruleReviewer',source));assert.doesNotThrow(()=>assertRuleActivation(reviewed,'activator',source));deny(()=>assertRuleReview(draft,'creator',source));deny(()=>assertRuleActivation(reviewed,'ruleReviewer',source));deny(()=>assertRuleActivation(reviewed,'creator',source)); });
test('tenant crossover, nonreviewed source and source hash mismatch rejected',()=>{for(const change of [{tenantId:'tenantB'},{status:'DRAFT'},{contentSha256:'b'.repeat(64)},{reviewedAt:null}]) deny(()=>assertRuleReview(draft,'ruleReviewer',{...source,...change}));deny(()=>assertRuleReview({...draft,legalSourceId:'another'},'ruleReviewer',source));});
test('only typed formula DSL supported (not JS, eval or untrusted object keys)',()=>{ assert.doesNotThrow(()=>assertFiscalRatioDefinition(draft.definition));for(const value of [{formula:'eval',numerator:1,denominator:10,basis:'taxable_minor'},{...draft.definition, code:'a+b'},{...draft.definition,denominator:0},{...draft.definition,numerator:11},{...draft.definition,numerator:'1'},{...draft.definition,basis:'arbitrary'},{...draft.definition,numerator:1.5},null, { ...draft.definition, basis: { toString() { throw new Error('untrusted coercion'); } } }]) deny(()=>assertFiscalRatioDefinition(value));});
test('supersession must move forward in same tenant/rule family, no self or cycles',()=>{ const old={...reviewed,status:'ACTIVE',activatedBy:'activator'};const next={...draft,id:'r2',version:2};assert.doesNotThrow(()=>assertSupersession(next,old));deny(()=>assertSupersession(old,old));deny(()=>assertSupersession({...next,tenantId:'tenantB'},old));deny(()=>assertSupersession({...next,version:1},old));deny(()=>assertSupersession(next,{...old,status:'SUPERSEDED'}));});

test('#751 guard migrations use paired PostgreSQL dollar quotes for provenance authority', () => {
  const sql=readFileSync(new URL('../backend/prisma/migrations/20261022173000_issue_751_reviewed_fiscal_rule_governance/migration.sql', import.meta.url),'utf8');
  assert.match(sql,/CREATE FUNCTION public\.contagest_751_guard_legal_source\(\)[\s\S]*?AS \$\$\s*BEGIN/);
  assert.match(sql,/RAISE EXCEPTION 'FISCAL_LEGAL_SOURCE_IMMUTABLE'[\s\S]*?END;\s*\$\$;/);
  assert.doesNotMatch(sql,/LANGUAGE plpgsql[\s\S]{0,50}AS \$(?!\$)/);
});
