import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const backend=()=>fs.readFileSync('backend/src/modules/verticals/veterinary.routes.ts','utf8');
const workspace=()=>fs.readFileSync('frontend/src/components/veterinary/VeterinaryWorkspace.jsx','utf8');

test('26/51 laboratory order and placeholders are persisted atomically',()=>{
  const source=backend();
  const start=source.indexOf("router.post('/lab-orders'");
  const end=source.indexOf("router.get('/lab-results'",start);
  const block=source.slice(start,end);
  assert.match(block,/const order = await prisma\.\$transaction/);
  assert.match(block,/INSERT INTO public\."CareLabOrder"/);
  assert.match(block,/INSERT INTO public\."CareLabResult"/);
  assert.match(block,/createdOrder\.id/);
});

test('26/51 ordered result capture targets a pending placeholder without rewriting ordered metadata',()=>{
  const source=backend();
  const start=source.indexOf("if(body.resultId){");
  const end=source.indexOf("}else{",start);
  const block=source.slice(start,end);
  assert.match(block,/SELECT "id","testCode","testName","category","unit","referenceMin","referenceMax","referenceText"/);
  assert.match(block,/FOR UPDATE/);
  assert.match(block,/valueNumeric" IS NULL/);
  assert.match(block,/COALESCE\("valueText",'\'\)='\'/);
  assert.match(block,/UPDATE public\."CareLabResult"/);
  assert.match(block,/SET "valueText"=\$4/);
  assert.doesNotMatch(block,/"testCode"=|"testName"=|"category"=|"unit"=|"referenceMin"=|"referenceMax"=|"referenceText"=/);
});

test('26/51 laboratory result lifecycle rejects terminal orders and concurrent overwrite',()=>{
  const source=backend();
  assert.match(source,/order\.status==='cancelled'/);
  assert.match(source,/order\.status==='completed'/);
  assert.match(source,/Prueba ordenada no encontrada o ya fue informada/);
  assert.match(source,/La prueba ya fue informada por otra operación/);
  assert.match(source,/WHERE "tenantId"=\$1 AND "id"=\$2 AND "labOrderId"=\$3[\s\S]*"valueNumeric" IS NULL[\s\S]*COALESCE\("valueText",'\'\)='\'/);
});

test('26/51 result schema validates values while server derives verifier and numeric reference flags',()=>{
  const source=backend();
  assert.match(source,/valueText.*valueNumeric|valueNumeric.*valueText/s);
  assert.match(source,/referenceMin.*referenceMax/s);
  assert.match(source,/inferFlag/);
  assert.match(source,/valueNumeric < body\.referenceMin/);
  assert.match(source,/valueNumeric > body\.referenceMax/);
  assert.match(source,/Text alone does not prove an abnormal result/);
  assert.match(source,/const verifier=ctx\(req\)\.email\|\|ctx\(req\)\.userId\|\|null/);
  assert.doesNotMatch(source,/verifiedBy:\s*optionalText/);
  assert.doesNotMatch(source,/flag:\s*z\.enum/);
});

test('26/51 order remains processing until every ordered placeholder has a value',()=>{
  const source=backend();
  assert.match(source,/pendingCount/);
  assert.match(source,/pendingCount===0\?'completed':'processing'/);
  assert.match(source,/valueNumeric" IS NULL/);
  assert.match(source,/COALESCE\("valueText",'\'\)='\'/);
});

test('26/51 lab order references and reads remain tenant-scoped',()=>{
  const source=backend();
  assert.match(source,/CareProfessional" WHERE "tenantId"=\$1 AND "id"=\$2/);
  assert.match(source,/CareEncounter" WHERE "tenantId"=\$1 AND "id"=\$2 AND "patientId"=\$3/);
  assert.match(source,/p\."tenantId"=o\."tenantId"/);
  assert.match(source,/pr\."tenantId"=o\."tenantId"/);
  assert.match(source,/r\."tenantId"=o\."tenantId"/);
  assert.match(source,/o\."tenantId"=r\."tenantId"/);
});

test('26/51 result UI selects only pending ordered tests and preserves ordered metadata',()=>{
  const source=workspace();
  for(const token of ['Prueba ordenada','resultId','availableLabTests','isLabResultPending','referenceMin','referenceMax','referenceText','unit']) assert.ok(source.includes(token),token);
  assert.match(source,/VeterinaryService\.createLabResult\(/);
  assert.match(source,/Chip label="Pendiente" variant="outlined"/);
});

test('26/51 client cannot override server laboratory verifier or flag',()=>{
  const source=workspace();
  assert.doesNotMatch(source,/label="Bandera"|name="flag"/);
  assert.doesNotMatch(source,/verifiedBy:field/);
});
