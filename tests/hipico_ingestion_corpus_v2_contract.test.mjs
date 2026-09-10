import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const corpus=JSON.parse(fs.readFileSync(path.join(root,'backend/src/modules/hipico-bot/corpus/hipico-ingestion-corpus.v2.json'),'utf8'));

test('WhatsApp ingestion corpus v2 is sanitized, versioned and fail-closed',()=>{
  assert.equal(corpus.schemaVersion,2);
  assert.equal(corpus.parserVersion,'whatsapp-ingestion-v2');
  assert.equal(corpus.sanitized,true);
  assert.equal(corpus.safety.sourceReadOnly,true);
  assert.equal(corpus.safety.mediaNeverCreatesBets,true);
  assert.equal(corpus.safety.monetaryTextRequiresOperationalClassifier,true);
  assert.ok(corpus.cases.length>=5);
  assert.equal(new Set(corpus.cases.map((item)=>item.id)).size,corpus.cases.length);
  const serialized=JSON.stringify(corpus);
  assert.doesNotMatch(serialized,/\+56\s*9\s*7588\s*7453/);
  assert.ok(corpus.cases.some((item)=>item.id==='ui-player-receiver-pair'));
  assert.ok(corpus.cases.some((item)=>item.id==='ui-truncated-final-document'));
});
