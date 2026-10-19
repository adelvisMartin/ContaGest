import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('backend/src/modules/verticals/allowed-vet-appointment-transition.ts','utf8');
const route=fs.readFileSync('backend/src/modules/verticals/veterinary-appointments.routes.ts','utf8');
const offset=source.indexOf('const PREVIOUS:');
const begin=source.indexOf('= {',offset)+2, end=source.indexOf('\n};',begin)+2;
assert.ok(offset>=0&&begin>offset&&end>begin);
const previous=new Function('return '+source.slice(begin,end)+';')();
const allows=(from,to)=>Object.prototype.hasOwnProperty.call(previous,to)&&previous[to].includes(from);

test('#812 active appointment lifecycle admits scheduled to checkin, in-progress to completed',()=>{
 for(const [from,to] of [
  ['scheduled','confirmed'],['scheduled','checked_in'],['checked_in','in_progress'],
  ['in_progress','completed'],['scheduled','cancelled'],['confirmed','no_show']])
  assert.equal(allows(from,to),true,from+'->'+to);
});
test('#812 terminal appointments cannot be reopened, including retry to same terminal state',()=>{
 for(const from of ['completed','cancelled','no_show'])
  for(const to of Object.keys(previous))assert.equal(allows(from,to),false,from+'->'+to);
});
test('#812 backwards transitions and skipped steps denied',()=>{
 for(const [from,to] of [
  ['in_progress','scheduled'],['confirmed','scheduled'],
  ['in_progress','checked_in'],['scheduled','completed'],['checked_in','no_show']])
  assert.equal(allows(from,to),false,from+'->'+to);
});
test('#812 only known next statuses are acknowledged',()=>{
 assert.deepEqual(Object.keys(previous).sort(),
   ['scheduled','confirmed','checked_in','in_progress','completed','cancelled','no_show'].sort());
 assert.equal(Object.prototype.hasOwnProperty.call(previous,'toString'),false);
});
test('#812 atomic predicate prevents TOCTOU reopening of completed records',()=>{
 assert.match(route,/allowedVetAppointmentPreviousStatuses\(b\.status\)/);
 assert.match(route,/a\."status"=ANY\(\$6::text\[\]\)/);
 assert.match(route,/p\."tenantId"=a\."tenantId"/);
 assert.match(route,/a\."tenantId"=\$2/);
});
test('#812 conflict is distinct from tenant-scoped 404',()=>{
 assert.match(route,/if\(existing\.length\)throw new HttpError\(409/);
 assert.match(route,/throw new HttpError\(404/);
 assert.doesNotMatch(route,/req\.body\.tenantId|req\.query\.tenantId/);
});
