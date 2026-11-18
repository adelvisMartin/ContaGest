import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const routes=readFileSync(new URL('../backend/src/modules/verticals/veterinary-communications.routes.ts',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../frontend/src/components/veterinary/VeterinaryWorkspace.jsx',import.meta.url),'utf8');
const master=readFileSync(new URL('../backend/src/modules/verticals/veterinary.routes.ts',import.meta.url),'utf8');

test('#820 veterinary communication writes stay under the authenticated pack boundary',()=>{
  assert.match(master,/router\.use\(requireTenant, requirePermission\('health\.manage'\)\)/);
  assert.match(master,/router\.use\(communicationRoutes\)/);
  assert.match(routes,/prisma\.\$transaction\(async tx =>/);
  const animal=routes.indexOf('SELECT "id" FROM public."CarePatient"');
  const appointment=routes.indexOf('SELECT a."id",a."patientId"');
  const insert=routes.indexOf('INSERT INTO public."CareCommunicationLog"');
  assert.ok(animal>=0&&appointment>animal&&insert>appointment,
    'validate both relationships before appending communication evidence');
  assert.match(routes,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "kind"='animal'/);
  assert.match(routes,/WHERE a\."tenantId"=\$1 AND a\."id"=\$2/);
  assert.match(routes,/p\."tenantId"=a\."tenantId" AND p\."kind"='animal'/);
  assert.match(routes,/appointments\[0\]\.patientId !== patientId/);
  assert.match(routes,/patientId = appointments\[0\]\.patientId/);
  assert.match(routes,/FOR SHARE OF a,p/);
  assert.match(routes,/LEFT JOIN public\."CarePatient" p[\s\S]*?p\."tenantId"=l\."tenantId"/);
});

test('#820 opening a WhatsApp deep link is never delivery acknowledgement',()=>{
  const fn=workspace.slice(workspace.indexOf('const notifyAppointment='),workspace.indexOf('const updateAppointment='));
  assert.match(fn,/VeterinaryService\.createCommunication/);
  assert.match(fn,/status:'queued',sentAt:null/);
  assert.match(fn,/deliveryMode:'manual_launch',deliveryConfirmed:false/);
  assert.match(fn,/window\.open\(/);
  assert.doesNotMatch(fn,/status:channel==='whatsapp'\?'sent'/);
  assert.doesNotMatch(fn,/sentAt:channel==='whatsapp'/);
});
