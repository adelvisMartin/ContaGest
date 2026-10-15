import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLeadIdentity, findClientDuplicateCandidates, assessClientConversion,
  transitionOpportunity, amountToMinorUnits, minorUnitsToAmount, forecastByCurrency
} from '../backend/src/modules/crm/crm-domain.mjs';

const lead = {rif:'J-12345678-9', email:' CLIENT@EXAMPLE.COM '};
const clients = [
  {id:'b',tenantId:'A',rif:'J123456789',email:'other@example.com'},
  {id:'a',tenantId:'A',rif:'V123456789',email:'client@example.com'},
  {id:'outside',tenantId:'B',rif:'J123456789',email:'client@example.com'},
  {id:'retired',tenantId:'A',rif:'J123456789',active:false}
];

test('normalizes RIF/email conservatively and does not infer identity from phone',()=>{
  assert.deepEqual(normalizeLeadIdentity(lead), {rif:'J123456789', email:'client@example.com'});
  assert.deepEqual(normalizeLeadIdentity({rif:'invalid',email:'none',phone:'04121234567'}),{rif:null,email:null});
});
test('finds only same-tenant active candidates with stable IDs',()=>{
  assert.deepEqual(findClientDuplicateCandidates({tenantId:'A',lead,clients}),['a','b']);
  assert.deepEqual(findClientDuplicateCandidates({tenantId:'B',lead,clients}),['outside']);
});
test('ambiguous candidates block auto-conversion, without leaking PII',()=>{
  const result=assessClientConversion({tenantId:'A',lead,clients});
  assert.deepEqual(result,{status:'BLOCKED',reason:'AMBIGUOUS_CLIENT_MATCH',candidates:['a','b']});
  assert.doesNotMatch(JSON.stringify(result),/example\.com|J123456789/);
});
test('one client leads to human reconciliation rather than second customer master',()=>{
  assert.equal(assessClientConversion({tenantId:'A',lead,clients:[clients[0]]}).status,'REVIEW_EXISTING');
});
test('no exact match allows review only when a valid required RIF exists',()=>{
  assert.equal(assessClientConversion({tenantId:'A',lead,clients:[]}).status,'REVIEW_NEW');
  assert.equal(assessClientConversion({tenantId:'A',lead:{email:'new@example.com'},clients:[]}).reason,'CLIENT_RIF_REQUIRED');
});
test('no tenant or invalid lists ever authorize conversion',()=>{
  assert.throws(()=>assessClientConversion({tenantId:'',lead,clients:[]}),/Tenant/);
  assert.throws(()=>findClientDuplicateCandidates({tenantId:'A',lead,clients:null}),/list/);
});
test('opportunity stage machine only allows enumerated forward edges',()=>{
  assert.equal(transitionOpportunity('new','qualified'),'qualified');
  assert.equal(transitionOpportunity('qualified','proposal'),'proposal');
  assert.equal(transitionOpportunity('proposal','won'),'won');
  assert.throws(()=>transitionOpportunity('new','won'),/INVALID/);
  assert.throws(()=>transitionOpportunity('won','qualified'),/INVALID/);
  assert.throws(()=>transitionOpportunity('lost','new'),/INVALID/);
});
test('money accepts decimal strings only, not JS floating point or exponent',()=>{
  assert.equal(amountToMinorUnits('100.05'),10005n);
  assert.equal(minorUnitsToAmount(10005n),'100.05');
  for(const value of [0.1,'1.000','1e8','-1','+1','01.2','99999999999999999.00'])assert.throws(()=>amountToMinorUnits(value));
});
test('forecast groups by exact currency with deterministic half-up rounding',()=>{
  const result=forecastByCurrency({tenantId:'A',opportunities:[
    {tenantId:'A',stage:'qualified',expectedValue:'0.01',probability:50,currency:'VES'},
    {tenantId:'A',stage:'proposal',expectedValue:'120.09',probability:25,currency:'VES'},
    {tenantId:'A',stage:'lost',expectedValue:'100.00',probability:100,currency:'VES'},
    {tenantId:'A',stage:'won',expectedValue:'10.00',probability:100,currency:'USD'},
  ]});
  assert.deepEqual(result,[{currency:'USD',count:1,gross:'10.00',weighted:'10.00'},
    {currency:'VES',count:2,gross:'120.10',weighted:'30.03'}]);
});
test('cross-tenant records are rejected before aggregation',()=>{
  assert.throws(()=>forecastByCurrency({tenantId:'A',opportunities:[{tenantId:'B',stage:'won',expectedValue:'10.00',probability:100,currency:'VES'}]}),/CROSS_TENANT/);
});
test('invalid probability, currency and stage fail closed',()=>{
  const row={tenantId:'A',stage:'new',expectedValue:'10.00',probability:20,currency:'VES'};
  for(const change of [{probability:20.1},{probability:101},{currency:'ves'},{stage:'hidden'},{expectedValue:'NaN'}]){
    assert.throws(()=>forecastByCurrency({tenantId:'A',opportunities:[{...row,...change}]}));
  }
});
test('very large monetary values use BigInt without float drift',()=>{
  assert.equal(minorUnitsToAmount(amountToMinorUnits('9999999999999999.99')),'9999999999999999.99');
});


test('weighted pipeline rounds once per currency, not once per row',()=>{
  const tiny=Array.from({length:100},()=>({tenantId:'A',stage:'qualified',expectedValue:'0.01',probability:50,currency:'VES'}));
  assert.deepEqual(forecastByCurrency({tenantId:'A',opportunities:tiny}),[
    {currency:'VES',count:100,gross:'1.00',weighted:'0.50'}
  ]);
});
test('weighted result cannot depend on opportunity insertion order',()=>{
  const rows=[
    {tenantId:'A',stage:'new',expectedValue:'0.01',probability:33,currency:'VES'},
    {tenantId:'A',stage:'qualified',expectedValue:'0.01',probability:33,currency:'VES'},
    {tenantId:'A',stage:'proposal',expectedValue:'0.01',probability:33,currency:'VES'}
  ];
  const original=forecastByCurrency({tenantId:'A',opportunities:rows});
  const reverse=forecastByCurrency({tenantId:'A',opportunities:[...rows].reverse()});
  assert.deepEqual(original,reverse);
  assert.equal(original[0].weighted,'0.01');
});
test('won pipeline contributes full amount regardless of stale estimated probability',()=>{
  const rows=[{tenantId:'A',stage:'won',expectedValue:'88.19',probability:0,currency:'USD'}];
  assert.deepEqual(forecastByCurrency({tenantId:'A',opportunities:rows}),[
    {currency:'USD',count:1,gross:'88.19',weighted:'88.19'}
  ]);
});
test('probabilities and money remain validated even for closed opportunities',()=>{
  assert.throws(()=>forecastByCurrency({tenantId:'A',opportunities:[
    {tenantId:'A',stage:'lost',expectedValue:'1.00',probability:NaN,currency:'USD'}
  ]}),/Probability/);
  assert.throws(()=>forecastByCurrency({tenantId:'A',opportunities:[
    {tenantId:'A',stage:'won',expectedValue:'0.001',probability:10,currency:'USD'}
  ]}),/fixed-scale/);
});
