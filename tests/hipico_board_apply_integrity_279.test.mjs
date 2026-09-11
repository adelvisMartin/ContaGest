import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../frontend/public/hipico-control/assets/js/app.js',import.meta.url),'utf8');

function functionSlice(name,nextName){
  const start=app.indexOf(`function ${name}`);
  const end=app.indexOf(`function ${nextName}`,start+1);
  assert.ok(start>=0&&end>start,`No se pudo aislar ${name}`);
  return app.slice(start,end);
}

test('applying a WhatsApp board only records board evidence and audit',()=>{
  const apply=functionSlice('applyLatestChatBoard','parseAdvancedLines');
  assert.match(apply,/mutate\("board_from_whatsapp"/);
  assert.match(apply,/race\.board\s*=\s*Array\.from/);
  assert.match(apply,/race\.boardPositions\s*=\s*\[1, 2, 3, 4, 5, 6\]/);
  assert.doesNotMatch(apply,/settleBet\s*\(/);
  assert.doesNotMatch(apply,/settleRace\s*\(/);
  assert.doesNotMatch(apply,/\.settlement\s*=/);
  assert.doesNotMatch(apply,/status\s*=\s*"settled"/);
});

test('financial settlement remains a separate explicit operator action',()=>{
  const settle=functionSlice('settleRace','parseAdvancedLines');
  assert.match(settle,/settleBet\(/);
  assert.match(settle,/mutate\("race_settled"/);
  assert.match(app,/action === "settle-race"/);
  assert.match(app,/action === "apply-chat-board"/);
});
