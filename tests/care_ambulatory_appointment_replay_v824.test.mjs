import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const core=readFileSync(new URL('../backend/src/modules/verticals/health-core.routes.ts',import.meta.url),'utf8');
const schema=readFileSync(new URL('../backend/src/modules/verticals/health.schemas.ts',import.meta.url),'utf8');
const create=core.split("router.post('/health/appointments'")[1]
  .split("router.patch('/health/appointments/:id'")[0];

test('#824 all appointment kinds honor caller-provided retry keys in the same locked transaction',()=>{
  assert.match(schema,/requestKey: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  const transaction=create.indexOf('prisma.$transaction(async (tx)=>');
  const lock=create.indexOf('await lockAppointmentSchedule(tx,tenantId)');
  const lookup=create.indexOf('SELECT * FROM public."CareAppointment"');
  const slot=create.indexOf('await assertAppointmentSlotAvailable');
  const insert=create.indexOf('INSERT INTO public."CareAppointment"');
  assert.ok(transaction>=0&&lock>transaction&&lookup>lock&&slot>lookup&&insert>slot);
  assert.match(create,/const requestFingerprint=requestKey/);
  assert.match(create,/if\(requestKey\)\{/);
  assert.match(create,/WHERE "tenantId"=\$1\s+AND "schedulingMeta"->>'requestKey'=\$2 LIMIT 1/);
  assert.doesNotMatch(create,/if\(b\.type==='dentistry'&&requestKey\)/);
  assert.match(create,/previous\[0\]\.schedulingMeta\?\.requestFingerprint!==requestFingerprint/);
  assert.match(create,/\.\.\.\(requestKey\s*\?\{requestKey,requestFingerprint\}:\{\}\)/);
  assert.match(create,/created\.replayed\?200:201/);
});

test('#824 reusing the same key for a different booking is rejected before persistence',()=>{
  assert.match(create,/throw new HttpError\(409,'La clave de reserva corresponde a una solicitud diferente\.'/);
  const check=create.indexOf('schedulingMeta?.requestFingerprint!==requestFingerprint');
  const insert=create.indexOf('INSERT INTO public."CareAppointment"');
  assert.ok(check>0&&check<insert);
  // The opt-in mechanism must not force a new key on legacy unkeyed clients.
  assert.match(create,/const \{requestKey,\.\.\.appointmentData\}=b/);
  assert.match(create,/const requestFingerprint=requestKey/);
  assert.doesNotMatch(create,/requestKey:randomUUID\(\)/);
});
