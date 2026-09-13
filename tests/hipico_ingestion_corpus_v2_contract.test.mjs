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

  const phoneLines=corpus.cases.flatMap((item)=>String(item.input||'').split('\n').filter((line)=>/^\+\d/.test(line)));
  assert.ok(phoneLines.length>0,'El corpus debe conservar estructura de teléfono con valores sintéticos.');
  for(const phone of phoneLines){
    assert.match(phone,/^\+00(?:[\s()\-]*\d){6,}$/,'Los teléfonos del corpus deben usar el prefijo sintético +00.');
    const digits=phone.replace(/\D/g,'');
    assert.equal(/^[1-9]\d{6,14}$/.test(digits),false,'Un teléfono sintético del fixture no debe ser un E.164 enrutable.');
  }

  const pair=corpus.cases.find((item)=>item.id==='ui-player-receiver-pair');
  assert.ok(pair);
  assert.match(pair.input,/\nJuega\b/i);
  assert.match(pair.input,/\nConsigue\b/i);

  const truncated=corpus.cases.find((item)=>item.id==='ui-truncated-final-document');
  assert.ok(truncated);
  assert.equal(truncated.expected.sourceFormat,'whatsapp-ui-copy');
  assert.equal(truncated.expected.documentTimeMayBeEmpty,true);
});
