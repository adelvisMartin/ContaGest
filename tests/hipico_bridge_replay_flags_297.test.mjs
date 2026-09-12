import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test__ } from '../frontend/api/hipico/group-bridge-ingest.js';

const bridgeSource=await readFile(new URL('../frontend/api/hipico/group-bridge-ingest.js',import.meta.url),'utf8');

const base={
  senderId:'584121234567',
  timestamp:'2026-09-11T06:00:00.000Z',
  type:'chat',
  text:'Juego 1N del 5 con 100k',
  quotedExternalMessageId:'origin-1',
  fromMe:false,
  hasMedia:false,
  historySync:false
};

test('serverless bridge replay signature binds sender instant body quote and behavior-changing transport flags',()=>{
  const sameInstant={...base,timestamp:'2026-09-11T01:00:00-05:00'};
  assert.equal(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature(sameInstant));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,fromMe:true}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,hasMedia:true}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,historySync:true}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,text:'Juego 1N del 5 con 300k'}));
  assert.notEqual(__test__.sourceReplaySignature(base),__test__.sourceReplaySignature({...base,quotedExternalMessageId:'origin-2'}));
});

test('bridge adapter forwards normalized replay evidence to canonical backend and owns no persisted replay authority',()=>{
  assert.match(bridgeSource,/proxyCanonicalRequest/);
  assert.match(bridgeSource,/\/api\/v1\/hipico-bot\/bridge\/events/);
  assert.match(bridgeSource,/historySync:\s*Boolean\(body\.historySync\)/);
  assert.match(bridgeSource,/fromMe:\s*Boolean\(body\.fromMe\)/);
  assert.match(bridgeSource,/hasMedia:\s*Boolean\(body\.hasMedia\)/);
  assert.match(bridgeSource,/rawMeta:\s*`serverless-compat:\$\{sourceReplaySignature\(body\)\.slice\(0, 24\)\}`/);
  assert.doesNotMatch(bridgeSource,/persistedReplaySignature/);
  assert.doesNotMatch(bridgeSource,/hipico_messages|hipico_ledger_entries|storedClassification|adapterCaptureDecision/);
});