import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {stripTypeScriptTypes} from 'node:module';
const src=fs.readFileSync('backend/src/modules/verticals/care-appointment-range.ts','utf8');
const runnable=stripTypeScriptTypes(src).replace('export function parseCareAppointmentReadWindow','function parseCareAppointmentReadWindow');
const parse=new Function(runnable+';return parseCareAppointmentReadWindow;')();
const clock=Date.parse('2026-10-16T12:00:00.000Z');
test('#801 defaults use bounded canonical UTC window',()=>{
 const result=parse({},clock);
 assert.equal(result.from,'2026-10-15T12:00:00.000Z');
 assert.equal(result.to,'2027-01-14T12:00:00.000Z');
});
test('#801 accepts valid date-only and full UTC instant',()=>{
 const result=parse({from:'2026-02-28',to:'2026-03-01T16:00:00Z',type:' dental '},clock);
 assert.equal(result.from,'2026-02-28T00:00:00.000Z');
 assert.equal(result.to,'2026-03-01T16:00:00.000Z');
 assert.equal(result.type,'dental');
});
test('#801 rejects rolled-over or impossible Gregorian date',()=>{
 for(const from of ['2026-02-30','2026-04-31','2026-13-01','2026-10-16T25:00:00Z'])
  assert.throws(()=>parse({from},clock),/CARE_APPOINTMENT_RANGE_INVALID/);
});
test('#801 rejects reversed or unbounded windows',()=>{
 assert.throws(()=>parse({from:'2026-10-17',to:'2026-10-16'},clock));
 assert.throws(()=>parse({from:'2026-01-01',to:'2027-01-05'},clock));
});
test('#801 rejects ambiguity, nested filters and spoofed tenantId',()=>{
 for(const query of [
  {from:['2026-10-16']},{from:'2026-10-16T10:00:00'},
  {to:'2026-10-16T09:00:00-03:00'},
  {type:['dental']},{type:'x'.repeat(121)},{tenantId:'different'},[]
 ])assert.throws(()=>parse(query,clock),/CARE_APPOINTMENT_RANGE_INVALID/);
});
test('#801 accepts exactly 366 days without changing appointments',()=>{
 assert.equal(parse({from:'2024-01-01',to:'2025-01-01'},clock).type,'');
});
test('#801 route validates before DB cast, keeps server tenant and auth',()=>{
 const file=fs.readFileSync('backend/src/modules/verticals/health-core.routes.ts','utf8');
 const section=file.slice(file.indexOf("router.get('/health/appointments'"),file.indexOf("router.post('/health/appointments'"));
 assert.match(section,/parseCareAppointmentReadWindow\(req\.query\)/);
 assert.match(section,/HttpError\(422/);
 assert.match(section,/requirePermission\('health\.manage'\)/);
 assert.match(section,/a\."tenantId"=\$1/);
 assert.doesNotMatch(section,/req\.query\.tenantId/);
});
