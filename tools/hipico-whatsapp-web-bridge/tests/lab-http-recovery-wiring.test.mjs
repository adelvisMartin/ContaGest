import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bridge=readFileSync(path.join(root,'src','index.mjs'),'utf8');
const journal=readFileSync(path.join(root,'src','lab-test-reply-journal.mjs'),'utf8');

test('LAB cycles are serialized in-process even when first HTTP query is delayed',()=>{
  const start=bridge.indexOf('async function processLabTestInput()');
  const end=bridge.indexOf('async function visibleLabHasTag',start);
  assert.ok(start>0&&end>start);
  const block=bridge.slice(start,end);
  assert.match(block,/if\(labTestProcessing\)return/);
  assert.match(block,/labTestProcessing=true/);
  assert.match(block,/finally \{labTestProcessing=false;\}/);
  assert.match(block,/labTestReplyJournal\.prepare\(row\.id\)/);
  assert.match(block,/labTestReplyJournal\.begin\(row\.id\)/);
  assert.match(block,/labTestReplyJournal\.confirm\(row\.id,\{visibleTag:true\}\)/);
});

test('uncertain Enter and restart do not replay HTTP-recovered candidate automatically',()=>{
  const start=bridge.indexOf('async function processLabTestInput()');
  const end=bridge.indexOf('async function visibleLabHasTag',start);
  const block=bridge.slice(start,end);
  const uncertain=block.indexOf("journalRecord?.state === 'ambiguous'");
  const query=block.indexOf('await queryCanonicalLab(');
  assert.ok(uncertain>=0&&query>uncertain);
  assert.match(block,/await visibleLabHasTag\(tag\)/);
  assert.match(block,/labSeenOutcome\(\{error\}\)/);
  assert.match(journal,/PROCESS_RESTART_DURING_SEND/);
  assert.match(journal,/LAB_TEST_VISIBLE_TAG_REQUIRED/);
});

test('SOURCE transport remains blocked independently from duplicate LAB receipt recovery',()=>{
  const sourcePolicy=readFileSync(path.join(root,'src','source-policy-gate.mjs'),'utf8');
  assert.match(sourcePolicy,/source/i);
  const block=bridge.slice(bridge.indexOf('async function processLabTestInput()'),bridge.indexOf('async function visibleLabHasTag'));
  assert.match(block,/assertCurrentLabIdentity/);
  assert.doesNotMatch(block,/sendTextInCurrentSource|sourceReplyCommand\.action='SEND'/);
});
