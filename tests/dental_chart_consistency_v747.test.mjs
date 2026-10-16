import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {stripTypeScriptTypes} from 'node:module';

const src=fs.readFileSync('backend/src/modules/verticals/dental-chart-consistency.ts','utf8');
const js=stripTypeScriptTypes(src).replace('export function dentalChartConsistencyIssues','function dentalChartConsistencyIssues');
const validate=new Function(js+'; return dentalChartConsistencyIssues;')();
const chart=(tooth,surfaces,heading)=>({tooth:heading,odontogram:{tooth,surfaces}});

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
