import test from 'node:test';
import assert from 'node:assert/strict';
import { createSportradarRacingProvider, normalizeSportradarStage } from './sportradar-provider.adapter.js';
import { EVIDENCE_FALLBACK_ORDER, ProviderCapabilityUnsupportedError, RacingDataConflictError, evidenceRank, freshnessFrom, resolveResultEvidence } from './racing-provider.js';

const xml=`<?xml version="1.0"?>
<stage_summary generated_at="2026-09-11T19:00:00.000Z">
  <sport_event id="sr:stage:123" scheduled="2026-09-11T19:05:00.000Z" name="Race 3">
    <competitors>
      <competitor id="sr:competitor:10" name="UNO" number="1"/>
      <competitor id="sr:competitor:20" name="DOS" number="2"/>
    </competitors>
  </sport_event>
  <sport_event_status status="closed"/>
  <competitor_result competitor_id="sr:competitor:20" position="1"/>
  <competitor_result competitor_id="sr:competitor:10" position="2"/>
</stage_summary>`;

const upstream={
  status:()=>({provider:'sportradar-uof' as const,configured:true,enrichmentOnly:true as const,financialAuthority:false as const,reason:null,timeoutMs:5000,cacheTtlMs:30000}),
  async getStageSummary(stageId:string){return{provider:'sportradar-uof' as const,stageId,fetchedAt:'2026-09-11T19:00:01.000Z',contentType:'application/xml',xml,cached:false};}
};

void test('Sportradar stage is normalized and never becomes financial authority',async()=>{
  const normalized=normalizeSportradarStage(await upstream.getStageSummary('123'));
  assert.equal(normalized.data.id,'sr:stage:123');
  assert.equal(normalized.data.runners.length,2);
  assert.deepEqual(normalized.data.result?.positions.map((row)=>row.runnerId),['sr:competitor:20','sr:competitor:10']);
  assert.equal(normalized.provenance.provider,'sportradar-uof');
  assert.equal(normalized.provenance.financialAuthority,false);
});

void test('provider capabilities are explicit and unsupported operations fail explicitly',async()=>{
  const provider=createSportradarRacingProvider(upstream);
  assert.deepEqual(provider.capabilities(),['getRace','getResult']);
  await assert.rejects(provider.listMeetings(),(error:any)=>error instanceof ProviderCapabilityUnsupportedError&&error.code==='PROVIDER_CAPABILITY_UNSUPPORTED');
  const health=await provider.health();
  assert.equal(health.state,'ready');assert.equal(health.financialAuthority,false);
});

void test('freshness transitions are deterministic',()=>{
  const now=Date.parse('2026-09-11T20:00:00.000Z');
  assert.equal(freshnessFrom('2026-09-11T19:59:45.000Z','2026-09-11T20:00:00.000Z',now),'LIVE');
  assert.equal(freshnessFrom('2026-09-11T19:58:00.000Z','2026-09-11T20:00:00.000Z',now),'FRESH');
  assert.equal(freshnessFrom('2026-09-11T19:30:00.000Z','2026-09-11T20:00:00.000Z',now),'STALE');
  assert.equal(freshnessFrom('2026-09-11T18:00:00.000Z','2026-09-11T20:00:00.000Z',now),'OFFLINE');
});

void test('conflicting results fail closed as DATA_CONFLICT',()=>{
  const base={provenance:{provider:'p',source:'provider',sourceTimestamp:null,fetchedAt:'2026-09-11T20:00:00.000Z',freshness:'LIVE' as const,officiality:'verified' as const,financialAuthority:false as const}};
  const left={...base,data:{raceId:'r',status:'closed',positions:[{position:1,runnerId:'a',runnerName:null}]}};
  const right={...base,provenance:{...base.provenance,source:'document'},data:{raceId:'r',status:'closed',positions:[{position:1,runnerId:'b',runnerName:null}]}};
  assert.throws(()=>resolveResultEvidence([left,right]),(error:any)=>error instanceof RacingDataConflictError&&error.code==='DATA_CONFLICT');
});

void test('fallback order is explicit and contains no AI guess source',()=>{
  assert.deepEqual(EVIDENCE_FALLBACK_ORDER,['official_api','authorized_provider','official_feed_document','uploaded_official_pdf','operator','group_evidence']);
  assert.ok(evidenceRank('official_api')<evidenceRank('group_evidence'));
  assert.equal((EVIDENCE_FALLBACK_ORDER as readonly string[]).includes('ai_guess'),false);
});
