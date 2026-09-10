import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseWhatsAppChat } from '../frontend/public/hipico-control/assets/js/whatsapp.js';

const copiedMedia=`lunes
Canal Hípico
+00 000 000 0000
Sticker sin etiquetas
8:23 p.m.
Sticker sin etiquetas
8:24 p.m.
Canal Hípico
+00 000 000 0000
Sticker sin etiquetas
8:36 p.m.
Sticker sin etiquetas
8:36 p.m.
Canal Hípico
+00 000 000 0000
8:47 p.m.
8:47 p.m.
Canal Hípico
+00 000 000 0000
Sticker sin etiquetas
8:55 p.m.
Sticker sin etiquetas
8:55 p.m.
Canal Hípico
+00 000 000 0000
Sticker sin etiquetas
8:55 p.m.
Sticker sin etiquetas
8:55 p.m.
Canal Hípico
+00 000 000 0000
Sticker sin etiquetas
9:26 p.m.
9:26 p.m.
Hoy
Canal Hípico
+00 000 000 0000
Reenviado
TDN10092026.pdf
8 páginas•PDF•3 MB
8:59 p.m.
Canal Hípico
+00 000 000 0000
Reenviado
RP10092026.pdf
10 páginas•PDF•4 MB
8:59 p.m.
Canal Hípico
+00 000 000 0000
Reenviado
IND10092026.pdf
9 páginas•PDF•4 MB
8:59 p.m.
Canal Hípico
+00 000 000 0000
Reenviado
WOO10092026.pdf
8 páginas•PDF•3 MB
8:59 p.m.
Canal Hípico
+00 000 000 0000
Reenviado
CT10092026.pdf
8 páginas•PDF•3 MB
8:59 p.m.
Canal Hípico
+00 000 000 0000
Reenviado
BTP10092026.pdf
8 páginas•PDF•3 MB
8:59 p.m.
Canal Hípico
+00 000 000 0000
Reenviado
CBY10092026.pdf
7 páginas•PDF•2 MB`;

const copiedOffers=`Hoy
Jugador Uno
+58 400 000 0001
Juego 2n del 5 con 30k
8:01 p.m.
Recibe Dos
+58 400 000 0002
Consigo 2n del 5 con 30k
8:02 p.m.`;

test('copied WhatsApp UI corpus classifies media/noise without monetary false positives',()=>{
  const analysis=parseWhatsAppChat(copiedMedia);
  assert.equal(analysis.sourceFormat,'whatsapp-ui-copy');
  assert.equal(analysis.stats.messages,19);
  assert.equal(analysis.stats.documents,7);
  assert.equal(analysis.stats.stickers,9);
  assert.equal(analysis.stats.ignored,19);
  assert.equal(analysis.noise.length,3);
  assert.equal(analysis.offers.length,0);
  assert.equal(analysis.matches.length,0);
  assert.equal(analysis.closures.length,0);
  assert.equal(analysis.documents.at(-1).media.fileName,'CBY10092026.pdf');
  assert.equal(analysis.documents.at(-1).media.embeddedDate,'2026-09-10');
  assert.equal(analysis.documents.at(-1).time,'');
  assert.ok(analysis.documents.every((item)=>item.forwarded===true));
});

test('copied WhatsApp UI text still reaches the deterministic offer matcher',()=>{
  const analysis=parseWhatsAppChat(copiedOffers);
  assert.equal(analysis.sourceFormat,'whatsapp-ui-copy');
  assert.equal(analysis.offers.length,2);
  assert.equal(analysis.matches.length,1);
  assert.equal(analysis.matches[0].play,'2N');
  assert.equal(analysis.matches[0].horse,'5');
  assert.equal(analysis.matches[0].amount,30000);
  assert.equal(analysis.matches[0].player,'Jugador Uno');
  assert.equal(analysis.matches[0].receiver,'Recibe Dos');
});

test('classic WhatsApp export remains backward compatible',()=>{
  const analysis=parseWhatsAppChat('[8:01 p. m., 10/09/2026] Jugador Uno: Juego 2n del 5 con 30k');
  assert.equal(analysis.sourceFormat,'whatsapp-export');
  assert.equal(analysis.offers.length,1);
  assert.equal(analysis.offers[0].play,'2N');
  assert.equal(analysis.offers[0].amount,30000);
});

test('backend webhook delegates text to operational classifier and blocks media from auto-send',()=>{
  const service=fs.readFileSync(path.join(process.cwd(),'backend/src/modules/hipico-bot/hipico-bot.service.ts'),'utf8');
  assert.match(service,/classify as classifyOperational/);
  assert.match(service,/NON_TEXT_MEDIA/);
  assert.match(service,/document_reference/);
  assert.match(service,/NON_TEXT_MEDIA_REVIEW_GATE/);
  assert.match(service,/autoEligible:false/);
  assert.match(service,/SAFE_AUTOMATIC\.has\(result\.intent\)/);
  assert.match(service,/const result=classifyIncoming\(message\)/);
});
