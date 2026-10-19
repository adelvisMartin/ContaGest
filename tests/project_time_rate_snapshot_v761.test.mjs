import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareProjectTimeRateSnapshotIntent as prepare, PROJECT_TIME_RATE_SNAPSHOT_INTENT_VERSION } from '../backend/src/modules/projects/time-entry-rate-snapshot-intent.ts';

const fixture=()=>({
  period:{tenantId:'tenant-a',clientId:'client-a',memberId:'member-a',
    project:{id:'project-a',tenantId:'tenant-a',clientId:'client-a'},
    task:{id:'task-a',tenantId:'tenant-a',projectId:'project-a'},
    source:'manual',startedAt:'2026-10-15T09:00:00-04:00',
    endedAt:'2026-10-15T09:45:00-04:00',recordedMinutes:45},
  review:{tenantId:'tenant-a',action:'approve',expectedRevision:7,
    entry:{id:'entry-a',tenantId:'tenant-a',projectId:'project-a',memberId:'member-a',
      state:'submitted',revision:7,linkedInvoiceId:null},
    actor:{id:'reviewer-a',tenantId:'tenant-a',canReviewTime:true}},
  quote:{tenantId:'tenant-a',clientId:'client-a',projectId:'project-a',
    rateCardId:'rate-card-a',rateCardRevision:2,currency:'USD',
    hourlyRateExact:'100.00',effectiveFromUtc:'2026-10-01T00:00:00.000Z'},
  capturedAtUtc:'2026-10-15T13:45:00.000Z'
});
const vary=(field,patch)=>{const x=fixture();x[field]={...x[field],...patch};return x;};
const error=(x,code)=>assert.throws(()=>prepare(x),new RegExp(code));

test('approval rate intent is immutable and non-financial, with 45 minutes exact',()=>{
  const x=prepare(fixture());
  assert.equal(x.version,PROJECT_TIME_RATE_SNAPSHOT_INTENT_VERSION);
  assert.equal(x.hourlyRateExact,'100.00');
  assert.equal(x.currency,'USD');
  assert.equal(x.proratedMinorUnitNumerator,'450000');
  assert.equal(x.proratedMinorUnitDenominator,'60');
  assert.equal(x.exactMinorUnits,'7500');
  assert.equal(x.requiresExplicitRoundingPolicy,false);
  assert.equal(x.persisted,false);
  assert.equal(x.approvedInDatabase,false);
  assert.equal(x.billableAuthorized,false);
  assert.equal(x.invoiceAuthorized,false);
  assert.equal(Object.isFrozen(x),true);
});

test('fractional cent is carried as exact rational and never silently rounded',()=>{
  const x=fixture();x.period.endedAt='2026-10-15T09:01:00-04:00';x.period.recordedMinutes=1;
  x.quote.hourlyRateExact='10.00';
  const intent=prepare(x);
  assert.equal(intent.proratedMinorUnitNumerator,'1000');
  assert.equal(intent.proratedMinorUnitDenominator,'60');
  assert.equal(intent.exactMinorUnits,null);
  assert.equal(intent.requiresExplicitRoundingPolicy,true);
});

test('very large decimal input remains exact without Number money conversion',()=>{
  const x=vary('quote',{hourlyRateExact:'999999999999.20'});
  const rate=prepare(x);
  assert.equal(rate.hourlyRateExact,'999999999999.20');
  assert.equal(rate.proratedMinorUnitNumerator,(99999999999920n*45n).toString());
  assert.equal(rate.exactMinorUnits,(99999999999920n*45n/60n).toString());
});

test('noncanonical decimal amounts fail rather than being coerced or rounded',()=>{
  for(const value of ['1','1.1','1.999','1e3',' 1.00','+1.00','-1.00','3,000.00','NaN',
    'Infinity','0000000000000.01','0.00',0,null]){
    error(vary('quote',{hourlyRateExact:value}),'DECIMAL_INVALID');
  }
});

test('currency syntax fails closed, not silently guessed',()=>{
  for(const currency of ['', 'usd','US','USDX','U$D','USD\n',' USD',null,22]){
    error(vary('quote',{currency}),'CURRENCY_INVALID');
  }
});

test('reject tenant mismatch between rate card, time and review',()=>{
  error(vary('quote',{tenantId:'tenant-b'}),'SCOPE_MISMATCH');
  const x=vary('review',{tenantId:'tenant-b'});
  error(x,'SCOPE_MISMATCH');
});

test('reject client or project mismatch instead of quoting another customer',()=>{
  for(const quote of [{clientId:'client-b'},{projectId:'project-b'}]){
    error(vary('quote',quote),'SCOPE_MISMATCH');
  }
});

test('reject a review entry attributed to a different member',()=>{
  const x=fixture();x.review.entry.memberId='member-b';
  error(x,'SCOPE_MISMATCH');
});

test('only a legitimate independent reviewer can trigger a quote proposal',()=>{
  const x=fixture();x.review.actor.id='member-a';
  error(x,'FORBIDDEN');
  const y=fixture();y.review.actor.canReviewTime=false;
  error(y,'FORBIDDEN');
});

test('submit/reject/withdraw review intents cannot create proposed rate snapshot',()=>{
  for(const action of ['submit','withdraw','reject']){
    const x=fixture();x.review.action=action;
    if(action==='submit')x.review.entry.state='draft';
    error(x,'APPROVAL_REQUIRED');
  }
});

test('linked invoice locks the rate review before any arithmetic',()=>{
  const x=fixture();x.review.entry.linkedInvoiceId='invoice-a';
  error(x,'FINANCIALLY_LOCKED');
});

test('stale review revision is not valid rate authority',()=>{
  const x=fixture();x.review.expectedRevision=6;
  error(x,'STALE_REVISION');
});

test('invalid rate card id and version fail closed',()=>{
  for(const value of ['', '../rate',null,22])error(vary('quote',{rateCardId:value}),'QUOTE_INVALID');
  for(const value of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'2']){
    error(vary('quote',{rateCardRevision:value}),'REVISION_INVALID');
  }
});

test('rate must be effective at captured server time; strict canonical UTC',()=>{
  error(vary('quote',{effectiveFromUtc:'2026-10-16T00:00:00.000Z'}),'NOT_YET_EFFECTIVE');
  for(const effectiveFromUtc of ['2026-02-31T00:00:00.000Z',
    '2026-10-15T00:00:00Z','2026-10-01T00:00:00-04:00','bad']){
    error(vary('quote',{effectiveFromUtc}),'TIMESTAMP_INVALID');
  }
  error({...fixture(),capturedAtUtc:'2026-10-15T13:45:00-04:00'},'TIMESTAMP_INVALID');
});

test('time duration tampering fails through canonical period normalization',()=>{
  const x=fixture();x.period.recordedMinutes=46;
  error(x,'DURATION_MISMATCH');
});

test('no invoice line, tax, ledger, payment, or billing authorizations in output',()=>{
  const x=fixture(),before=JSON.stringify(x),r=prepare(x);
  assert.equal(JSON.stringify(x),before);
  assert.equal(Object.keys(r).some(k=>/invoiceId|tax|ledger|payment|posted/i.test(k)),false);
  assert.deepEqual([r.billableAuthorized,r.invoiceAuthorized,r.persisted,r.approvedInDatabase],[false,false,false,false]);
});


test('rejects retroactive rate effective inside already-worked minutes',()=>{
  const x=fixture();
  x.quote.effectiveFromUtc='2026-10-15T13:15:00.000Z';
  // The new tariff was active by capture (13:45), but not at shift start (13:00).
  error(x,'EFFECTIVE_AFTER_START');
});

test('accepts tariff effective at shift start and capture exactly at shift end',()=>{
  const x=fixture();
  x.quote.effectiveFromUtc='2026-10-15T13:00:00.000Z';
  const result=prepare(x);
  assert.equal(result.rateEffectiveFromUtc,'2026-10-15T13:00:00.000Z');
  assert.equal(result.capturedAtUtc,'2026-10-15T13:45:00.000Z');
  assert.equal(result.billableAuthorized,false);
});

test('rejects capture before the actual end of submitted time',()=>{
  const x=fixture();
  x.capturedAtUtc='2026-10-15T13:44:59.999Z';
  error(x,'CAPTURE_BEFORE_END');
});

test('UTC rate boundary is enforced across DST fall-back offsets',()=>{
  const x=fixture();
  x.period.startedAt='2026-11-01T01:30:00-04:00';
  x.period.endedAt='2026-11-01T01:30:00-05:00';
  x.period.recordedMinutes=60;
  x.capturedAtUtc='2026-11-01T06:30:00.000Z';
  x.quote.effectiveFromUtc='2026-11-01T05:45:00.000Z';
  error(x,'EFFECTIVE_AFTER_START');
  x.quote.effectiveFromUtc='2026-11-01T05:30:00.000Z';
  const allowed=prepare(x);
  assert.equal(allowed.durationMinutes,60);
  assert.equal(allowed.billableAuthorized,false);
});
