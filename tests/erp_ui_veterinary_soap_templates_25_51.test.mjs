import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workspace=()=>fs.readFileSync('frontend/src/components/veterinary/VeterinaryWorkspace.jsx','utf8');
const catalog=()=>fs.readFileSync('frontend/src/components/veterinary/veterinarySoapTemplates.js','utf8');

test('25/51 provides versioned SOAP templates by species and consultation type',()=>{
  const source=catalog();
  for(const token of ['SOAP_TEMPLATE_VERSION','canine','feline','general','wellness','problem','follow_up','emergency','subjective','objective','assessment','plan']) assert.ok(source.includes(token),token);
  assert.match(source,/resolveVeterinarySoapTemplate/);
  assert.match(source,/speciesKey/);
});

test('25/51 template application stays editable and never auto-signs or auto-diagnoses',()=>{
  const source=workspace();
  for(const token of ['Plantilla SOAP','Tipo de consulta','Aplicar plantilla','soapTemplateId','soapTemplateVersion']) assert.ok(source.includes(token),token);
  assert.match(source,/setForm\(\(current\)=>\(\{\.\.\.current/);
  assert.doesNotMatch(source,/assessment:\s*template\.assessment[^\n]*status:'signed'/);
  assert.doesNotMatch(source,/autoDiagnosis|diagnoseAutomatically/);
});

test('25/51 encounter persistence records template provenance through canonical CareEncounter',()=>{
  const source=workspace();
  assert.match(source,/HealthVerticalService\.createEncounter\(/);
  assert.match(source,/clinicalData:\{soapTemplate:/);
  assert.match(source,/templateId:field\('soapTemplateId'/);
  assert.match(source,/version:field\('soapTemplateVersion'/);
});

test('25/51 SOAP form keeps S O A P as normal controlled editable fields',()=>{
  const source=workspace();
  for(const label of ['Motivo / subjetivo','Hallazgos / objetivo','Evaluación / diagnóstico','Plan / seguimiento']) assert.ok(source.includes(label),label);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML/);
});
