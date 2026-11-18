import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const routes=readFileSync(new URL('../backend/src/modules/verticals/veterinary-treatment-sheet.routes.ts',import.meta.url),'utf8');
const schema=readFileSync(new URL('../backend/src/modules/verticals/veterinary.schemas.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../frontend/src/components/veterinary/VeterinaryTreatmentSheet.jsx',import.meta.url),'utf8');
const post=routes.split("router.post('/hospitalizations/:id/treatment-sheet'")[1]
  .split('export default router;')[0];

test('#816 repeat medication/vitals POST checks fingerprint after row lock and before admission status',()=>{
  assert.match(schema,/export const treatmentSheetEntrySchema = z\.object\(\{\s+requestKey: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  const locked=post.indexOf('FOR UPDATE OF h');
  const replay=post.indexOf('if(body.requestKey){');
  const active=post.indexOf("if(!['admitted','observed'].includes");
  const insert=post.indexOf('INSERT INTO public."CareHospitalObservation"');
  const measurement=post.indexOf('INSERT INTO public."CareMeasurement"');
  assert.ok(locked>0&&replay>locked&&active>replay&&insert>active&&measurement>insert);
  assert.match(post,/\$transaction\(async \(tx\)=>\{/);
  assert.match(post,/const requestFingerprint=body\.requestKey/);
  assert.match(post,/treatmentRequestKey'\=\$3/);
  assert.match(post,/prior\.values\?\.treatmentRequestFingerprint!==requestFingerprint/);
  assert.match(post,/new HttpError\(409,'La clave de reintento corresponde a otro tratamiento\.'/);
  assert.match(post,/\.\.\.\(body\.requestKey\?\{treatmentRequestKey:body\.requestKey,/);
  assert.match(post,/return \{entry:\{/);
  assert.match(post,/replayed:true/);
  assert.match(post,/replayed:false/);
  assert.match(post,/Idempotency-Replayed/);
  assert.match(post,/result\.replayed\?200:201/);
});

test('#816 UI retains treatment key on network failure but rotates for a changed care operation',()=>{
  assert.match(ui,/useRef\(null\)/);
  assert.match(ui,/JSON\.stringify\(\{hospitalizationId,payload\}\)/);
  assert.match(ui,/pendingRequest\.current\?\.signature!==signature/);
  assert.match(ui,/pendingRequest\.current=\{signature,key:crypto\.randomUUID\(\)\}/);
  assert.match(ui,/\.\.\.payload,requestKey:pendingRequest\.current\.key/);
  assert.match(ui,/pendingRequest\.current=null;/);
  const send=ui.indexOf('await VeterinaryService.createTreatmentSheetEntry');
  const clear=ui.indexOf('pendingRequest.current=null;',send);
  const error=ui.indexOf('}catch(cause){',send);
  assert.ok(send>0&&clear>send&&error>clear);
});
