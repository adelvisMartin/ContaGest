import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const backend=()=>fs.readFileSync('backend/src/modules/verticals/veterinary.routes.ts','utf8');
const workspace=()=>fs.readFileSync('frontend/src/components/veterinary/VeterinaryWorkspace.jsx','utf8');

test('26/51 laboratory results target ordered placeholder rows instead of duplicating tests',()=>{
  const source=backend();
  assert.match(source,/resultId:/);
  assert.match(source,/FOR UPDATE/);
  assert.match(source,/UPDATE public\."CareLabResult"/);
  assert.match(source,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "labOrderId"=\$3/);
  assert.match(source,/INSERT INTO public\."CareLabResult"/);
});

test('26/51 server validates result payload and infers reference flags',()=>{
  const source=backend();
  assert.match(source,/valueText.*valueNumeric|valueNumeric.*valueText/s);
  assert.match(source,/referenceMin.*referenceMax/s);
  assert.match(source,/inferFlag/);
  assert.match(source,/valueNumeric < body\.referenceMin/);
  assert.match(source,/valueNumeric > body\.referenceMax/);
});

test('26/51 order stays processing until all ordered tests have a value',()=>{
  const source=backend();
  assert.match(source,/pendingCount/);
  assert.match(source,/processing/);
  assert.match(source,/completed/);
  assert.match(source,/valueNumeric" IS NULL/);
  assert.match(source,/COALESCE\("valueText",'\'\)='\'/);
});

test('26/51 lab order references and verifier are server authoritative',()=>{
  const source=backend();
  assert.match(source,/CareProfessional" WHERE "tenantId"=\$1 AND "id"=\$2/);
  assert.match(source,/CareEncounter" WHERE "tenantId"=\$1 AND "id"=\$2 AND "patientId"=\$3/);
  assert.match(source,/const verifier=ctx\(req\)\.email\|\|ctx\(req\)\.userId\|\|null/);
  assert.doesNotMatch(source,/body\.verifiedBy\|\|null/);
  assert.doesNotMatch(source,/verifiedBy:\s*optionalText/);
  assert.doesNotMatch(source,/flag:\s*z\.enum/);
  assert.match(source,/const order = await prisma\.\$transaction/);
});

test('26/51 result UI selects an ordered test and preserves unit/reference metadata',()=>{
  const source=workspace();
  for(const token of ['Prueba ordenada','resultId','availableLabTests','referenceMin','referenceMax','referenceText','unit']) assert.ok(source.includes(token),token);
  assert.match(source,/VeterinaryService\.createLabResult\(/);
});

test('26/51 lab result entry does not expose client-normal flag override',()=>{
  const source=workspace();
  assert.doesNotMatch(source,/label="Bandera"|name="flag"/);
});
