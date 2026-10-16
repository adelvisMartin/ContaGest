import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source=fs.readFileSync('backend/src/modules/verticals/care-anamnesis-consistency.ts','utf8');
const code=stripTypeScriptTypes(source).replace('export function careAnamnesisConsistencyIssues','function careAnamnesisConsistencyIssues');
const validate=new Function(code+';return careAnamnesisConsistencyIssues;')();
const entry=(allergyReview='unreviewed',allergies=[],medications=[],conditions=[])=>({allergyReview,allergies,medications,conditions});

test('#800 unknown history with no data stays unknown',()=>{
 assert.deepEqual(validate(entry()),[]);
});
test('#800 reported allergy requires a reported substance',()=>{
 assert.deepEqual(validate(entry('reported')).map(i=>i.path),[['allergyReview']]);
});
test('#800 cannot claim no known allergies and report a substance simultaneously',()=>{
 assert.deepEqual(validate(entry('none_reported',[{substance:'Penicilina'}])).map(i=>i.path),[['allergyReview']]);
});
test('#800 allergy with explicit reported evidence accepted as data, not diagnosis',()=>{
 assert.deepEqual(validate(entry('reported',[{substance:'Penicilina'}])),[]);
});
test('#800 duplicate allergy entries detected regardless of case',()=>{
 const errors=validate(entry('reported',[{substance:'PENICILINA'},{substance:'penicilina'}]));
 assert.deepEqual(errors.map(x=>x.path),[['allergies',1,'substance']]);
});
test('#800 medication and self-reported condition duplicates rejected independently',()=>{
 const errors=validate(entry('unreviewed',[],[{name:'Aspirina'},{name:'ASPIRINA'}],[{name:'Asma'},{name:'asma'}]));
 assert.deepEqual(errors.map(x=>x.path),[['medications',1,'name'],['conditions',1,'name']]);
});
test('#800 strict schema reuses pure guard and version metadata',()=>{
 const schema=fs.readFileSync('backend/src/modules/verticals/care-anamnesis-schema.ts','utf8');
 assert.match(schema,/schemaVersion: z.literal\('care-anamnesis-v1'\)/);
 assert.match(schema,/careAnamnesisConsistencyIssues\(value\)/);
 assert.match(schema,/\}\.strict\(\)\.superRefine/);
});
test('#800 POST validates anamnesis and refuses direct signed clinical history',()=>{
 const routes=fs.readFileSync('backend/src/modules/verticals/health-encounters.routes.ts','utf8');
 const block=routes.slice(routes.indexOf("router.post('/health/encounters'"),routes.indexOf("router.post('/health/encounters/:id/amend'"));
 assert.match(block,/b.type==='anamnesis' && b.status!=='draft'/);
 assert.match(block,/careAnamnesisClinicalDataSchema.parse\(b.clinicalData\)/);
 assert.match(block,/"tenantId"=\$1/);
});
