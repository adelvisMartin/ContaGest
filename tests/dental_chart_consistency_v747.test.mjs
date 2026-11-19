import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {stripTypeScriptTypes} from 'node:module';

const src=fs.readFileSync('backend/src/modules/verticals/dental-chart-consistency.ts','utf8');
const js=stripTypeScriptTypes(src).replace('export function dentalChartConsistencyIssues','function dentalChartConsistencyIssues');
const validate=new Function(js+'; return dentalChartConsistencyIssues;')();
const chart=(tooth,surfaces,heading)=>({tooth:heading,odontogram:{tooth,surfaces}});

test('#747 periodontal inputs keep a persistent per-site label required by CgTextField and WCAG',()=>{
  const panel=fs.readFileSync('frontend/src/components/dentistry/PeriodontalChartPanel.jsx','utf8');
  assert.match(panel,/label=\{\x60Sondaje \$\{row\.site\} \(mm\)\x60\}/);
  assert.match(panel,/label=\{\x60Margen gingival \$\{row\.site\} \(mm\)\x60\}/);
  assert.doesNotMatch(panel,/<CgTextField[^>]*value=\{row\.(?:probingDepthMm|gingivalMarginMm)\}[^>]*inputProps=\{\{[^}]*aria-label/);
});

test('#747 accepts one dental surface',()=>assert.deepEqual(validate(chart('11',['mesial'],'11')),[]));
test('#747 accepts distinct surfaces',()=>assert.deepEqual(validate(chart('11',['mesial','distal'],null)),[]));
test('#747 rejects repeated surface at original index',()=>assert.deepEqual(validate(chart('11',['mesial','distal','mesial'])).map(x=>x.path),[['odontogram','surfaces',2]]));
test('#747 rejects conflicting root tooth',()=>assert.deepEqual(validate(chart('11',['mesial'],'12')).map(x=>x.path),[['tooth']]));
test('#747 reports multiple violations independently',()=>assert.equal(validate(chart('11',['mesial','mesial'],'12')).length,2));
test('#747 trims harmless root whitespace',()=>assert.deepEqual(validate(chart('11',['mesial'],' 11 ')),[]));
test('#747 dental create AND amendment reuse schema guard',()=>{
  const schema=fs.readFileSync('backend/src/modules/verticals/health.schemas.ts','utf8');
  assert.match(schema,/dentalChartConsistencyIssues\(value\)/);
  assert.match(schema,/clinicalData: dentalClinicalDataSchema/);
  assert.match(schema,/dentalClinicalDataSchema\.safeParse\(value\.clinicalData\)/);
});

const periodontalSource=fs.readFileSync('backend/src/modules/verticals/dental-periodontal-value.ts','utf8');
const periodontalJs=stripTypeScriptTypes(periodontalSource)
  .replace('export function normalizePeriodontalInteger','function normalizePeriodontalInteger');
const normalizePeriodontal=new Function(periodontalJs+'; return normalizePeriodontalInteger;')();

test('#710 periodontal blank, null, Boolean and nondecimal values never become clinical zero',()=>{
  for(const invalid of ['', '  ', null, undefined, false, true, [], {}, 'Infinity','NaN','0xA','1e3','1.5']){
    assert.ok(Number.isNaN(normalizePeriodontal(invalid)),String(invalid));
  }
});

test('#710 valid numeric periodontal values keep sign and explicit zero',()=>{
  for(const [value,expected] of [[0,0],['0',0],[' 0 ',0],['2.0',2],['-1',-1],[3,3]]){
    assert.equal(normalizePeriodontal(value),expected,String(value));
  }
});

test('#710 four periodontal fields reuse the same bounded non-coercing policy',()=>{
  const schema=fs.readFileSync('backend/src/modules/verticals/health.schemas.ts','utf8');
  assert.match(schema,/z\.preprocess\(normalizePeriodontalInteger,z\.number\(\)\.int\(\)\.min\(min\)\.max\(max\)\)/);
  for(const [field,bounds] of [
    ['probingDepthMm','0,15'],['gingivalMarginMm','-10,20'],
    ['mobilityGrade','0,3'],['furcationGrade','0,3']
  ])assert.ok(schema.includes(`${field}: periodontalInteger(${bounds})`),field);
});
